/**
 * ფორმალური ლოგიკის აკადემია — რეიტინგი, სესიები, სტატისტიკა.
 *
 * The questions never leave the server with their keys attached. A session is
 * created in memory holding, per question, the shuffled option order and the
 * index the correct answer landed on; the client only ever sees the shuffled
 * text and submits an index. That is what makes the answer un-inspectable, and
 * it is also why the option order genuinely differs every single time.
 */
import { randomBytes } from 'crypto';
import { sql } from '../db.js';
import { grantCoins } from './coinService.js';
import {
  ALL_QUESTIONS, BY_LEVEL, getQuestion,
  LEVEL_RATING, LEVEL_WEIGHT, timeFor,
  type LogicLevel, type LogicQuestion, type LogicCategory,
} from '../data/logic/index.js';

export type LogicMode = 'practice' | 'ranked' | 'daily' | 'test';

const SESSION_TTL_MS = 45 * 60 * 1000;
const START_RATING = 1200;
const K_FACTOR = 26;                 // ranked rating swing per question
const BASE_POINTS = 10;
const SPEED_BONUS = 2;
const COMBO_STEP = 2;
const COMBO_CAP = 10;

export interface SessionQuestion {
  qid: string;
  /** options[i] is the ORIGINAL option index now shown at position i */
  order: number[];
  /** position in `order` that holds the correct answer */
  correctPos: number;
  answeredAt?: number;
  chosen?: number;
  correct?: boolean;
  ms?: number;
}
export interface LogicSession {
  id: string;
  userId: string;
  mode: LogicMode;
  level: LogicLevel | 'mixed';
  questions: SessionQuestion[];
  idx: number;
  startedAt: number;
  questionShownAt: number;
  score: number;
  combo: number;
  bestCombo: number;
  ratingDelta: number;
  finished: boolean;
}

const sessions = new Map<string, LogicSession>();
setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of sessions) if (s.startedAt < cutoff) sessions.delete(id);
}, 5 * 60 * 1000).unref?.();

// ── profile ───────────────────────────────────────────────────────────
export interface LogicProfile {
  userId: string; rating: number; peakRating: number;
  answered: number; correct: number; totalMs: number; tests: number;
  streak: number; bestStreak: number;
  dailyStreak: number; bestDailyStreak: number; lastDaily: string | null;
  hardest: string; xp: number;
}

function rowToProfile(r: any): LogicProfile {
  return {
    userId: r.user_id, rating: Number(r.rating), peakRating: Number(r.peak_rating),
    answered: Number(r.answered), correct: Number(r.correct), totalMs: Number(r.total_ms),
    tests: Number(r.tests), streak: Number(r.streak), bestStreak: Number(r.best_streak),
    dailyStreak: Number(r.daily_streak), bestDailyStreak: Number(r.best_daily_streak),
    lastDaily: r.last_daily ?? null, hardest: r.hardest ?? '', xp: Number(r.xp),
  };
}

export async function getProfile(userId: string): Promise<LogicProfile> {
  const [row] = await sql`SELECT * FROM logic_profiles WHERE user_id = ${userId}` as any[];
  if (row) return rowToProfile(row);
  const now = Date.now();
  await sql`
    INSERT INTO logic_profiles (user_id, rating, peak_rating, created_at, updated_at)
    VALUES (${userId}, ${START_RATING}, ${START_RATING}, ${now}, ${now})
    ON CONFLICT (user_id) DO NOTHING
  `;
  const [fresh] = await sql`SELECT * FROM logic_profiles WHERE user_id = ${userId}` as any[];
  return rowToProfile(fresh);
}

// ── question selection ────────────────────────────────────────────────
function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

/** Deterministic shuffle for the daily challenge — everyone gets the same set. */
function seededShuffle<T>(a: T[], seed: number): T[] {
  const r = [...a];
  let s = seed >>> 0;
  const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

function prepare(q: LogicQuestion, seed?: number): SessionQuestion {
  const idx = [0, 1, 2, 3];
  const order = seed === undefined ? shuffle(idx) : seededShuffle(idx, seed + q.id.length);
  return { qid: q.id, order, correctPos: order.indexOf(q.answer) };
}

/**
 * Pick `count` questions, preferring ones the player has not seen. Only when
 * the unseen pool runs dry do we fall back to the oldest-seen ones, so a
 * dedicated player keeps getting fresh material for as long as possible.
 */
async function pickQuestions(userId: string, count: number, level: LogicLevel | 'mixed'): Promise<LogicQuestion[]> {
  const pool = level === 'mixed' ? ALL_QUESTIONS : BY_LEVEL[level];
  const seenRows = await sql`SELECT question_id FROM logic_seen WHERE user_id = ${userId}` as any[];
  const seen = new Set(seenRows.map(r => r.question_id));
  const fresh = pool.filter(q => !seen.has(q.id));
  const chosen = shuffle(fresh).slice(0, count);
  if (chosen.length < count) {
    const rest = shuffle(pool.filter(q => !chosen.includes(q))).slice(0, count - chosen.length);
    chosen.push(...rest);
  }
  return chosen;
}

/** A mixed "test" ramps up: a few beginner, then medium, hard, expert. */
function testPlan(count: number): LogicLevel[] {
  const plan: LogicLevel[] = [];
  const order: LogicLevel[] = ['beginner', 'medium', 'hard', 'expert'];
  const share = [0.3, 0.3, 0.25, 0.15];
  order.forEach((lv, i) => { for (let k = 0; k < Math.round(count * share[i]); k++) plan.push(lv); });
  while (plan.length < count) plan.push('medium');
  return plan.slice(0, count);
}

export async function startSession(userId: string, mode: LogicMode, level: LogicLevel | 'mixed', count = 10): Promise<{ session: LogicSession; view: any }> {
  const n = Math.max(3, Math.min(25, count));
  let picks: LogicQuestion[];
  let seed: number | undefined;

  if (mode === 'daily') {
    // same questions for everyone, every day
    seed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
    picks = seededShuffle(ALL_QUESTIONS, seed).slice(0, n);
  } else if (mode === 'test' || level === 'mixed') {
    const plan = testPlan(n);
    const used = new Set<string>();
    picks = [];
    for (const lv of plan) {
      const cands = await pickQuestions(userId, 6, lv);
      const pick = cands.find(q => !used.has(q.id)) ?? cands[0];
      if (pick) { used.add(pick.id); picks.push(pick); }
    }
  } else {
    picks = await pickQuestions(userId, n, level);
  }

  const s: LogicSession = {
    id: randomBytes(10).toString('hex'),
    userId, mode, level,
    questions: picks.map(q => prepare(q, seed)),
    idx: 0,
    startedAt: Date.now(),
    questionShownAt: Date.now(),
    score: 0, combo: 0, bestCombo: 0, ratingDelta: 0, finished: false,
  };
  sessions.set(s.id, s);
  return { session: s, view: viewOf(s) };
}

/** What the client is allowed to see: text + shuffled options, never the key. */
function viewOf(s: LogicSession) {
  const cur = s.questions[s.idx];
  const q = cur ? getQuestion(cur.qid) : undefined;
  return {
    sessionId: s.id,
    mode: s.mode,
    index: s.idx,
    total: s.questions.length,
    score: s.score,
    combo: s.combo,
    question: q && cur ? {
      title: q.title, body: q.body, q: q.q,
      options: cur.order.map(i => q.options[i]),
      level: q.level, cat: q.cat, seconds: timeFor(q),
    } : null,
  };
}

export function getSession(id: string): LogicSession | null { return sessions.get(id) ?? null; }
export function sessionView(s: LogicSession) { return viewOf(s); }

// ── answering ─────────────────────────────────────────────────────────
export interface AnswerResult {
  correct: boolean;
  correctPos: number;
  chosen: number;
  gained: number;
  combo: number;
  ratingDelta: number;
  rule: string;
  why: string;
  trap: string | null;
  /** withheld in ranked until the session ends */
  explain: boolean;
  done: boolean;
  next: any;
}

export async function answer(sessionId: string, userId: string, chosen: number, ms: number): Promise<AnswerResult | null> {
  const s = sessions.get(sessionId);
  if (!s || s.userId !== userId || s.finished) return null;
  const cur = s.questions[s.idx];
  if (!cur || cur.answeredAt) return null;
  const q = getQuestion(cur.qid);
  if (!q) return null;

  const pos = Number.isFinite(chosen) ? Math.max(-1, Math.min(3, Math.trunc(chosen))) : -1;
  const correct = pos === cur.correctPos;
  const allowed = timeFor(q);
  const elapsed = Math.max(0, Math.min(allowed * 1000 * 3, Number(ms) || 0));
  cur.answeredAt = Date.now(); cur.chosen = pos; cur.correct = correct; cur.ms = elapsed;

  let gained = 0;
  if (correct) {
    gained = BASE_POINTS;
    if (elapsed <= allowed * 500) gained += SPEED_BONUS;                // under half the clock the player saw
    gained += Math.round((LEVEL_WEIGHT[q.level] - 1) * 10);             // difficulty bonus
    s.combo++;
    gained += Math.min(COMBO_CAP, (s.combo - 1) * COMBO_STEP);          // combo bonus
    s.bestCombo = Math.max(s.bestCombo, s.combo);
  } else {
    s.combo = 0;
  }
  s.score += gained;

  // Elo against the question's nominal difficulty. Practice never moves it.
  let delta = 0;
  if (s.mode !== 'practice') {
    const prof = await getProfile(userId);
    const expected = 1 / (1 + Math.pow(10, (LEVEL_RATING[q.level] - prof.rating) / 400));
    delta = Math.round(K_FACTOR * LEVEL_WEIGHT[q.level] * ((correct ? 1 : 0) - expected));
    s.ratingDelta += delta;
  }

  s.idx++;
  const done = s.idx >= s.questions.length;
  const showNow = s.mode !== 'ranked';                                   // ranked explains at the end
  return {
    correct, correctPos: cur.correctPos, chosen: pos,
    gained, combo: s.combo, ratingDelta: delta,
    rule: showNow ? q.rule : '',
    why: showNow ? q.why : '',
    trap: showNow ? (q.trap?.[pos as 0 | 1 | 2 | 3] ?? null) : null,
    explain: showNow,
    done,
    next: done ? null : viewOf(s),
  };
}

// ── finishing ─────────────────────────────────────────────────────────
export interface FinishResult {
  score: number; correct: number; total: number;
  ratingBefore: number; ratingAfter: number; ratingDelta: number;
  accuracy: number; avgMs: number; bestCombo: number;
  xp: number; coins: number;
  achievements: string[];
  review: Array<{ title: string; body: string; q: string; options: string[]; correctPos: number; chosen: number; rule: string; why: string; trap: string | null; level: string; cat: string }>;
}

export async function finish(sessionId: string, userId: string): Promise<FinishResult | null> {
  const s = sessions.get(sessionId);
  if (!s || s.userId !== userId || s.finished) return null;
  s.finished = true;

  const answered = s.questions.filter(q => q.answeredAt);
  const correct = answered.filter(q => q.correct).length;
  const total = s.questions.length;
  const durationMs = Date.now() - s.startedAt;
  const avgMs = answered.length ? Math.round(answered.reduce((a, q) => a + (q.ms ?? 0), 0) / answered.length) : 0;

  const before = await getProfile(userId);
  const ratingAfter = Math.max(600, before.rating + s.ratingDelta);
  const now = Date.now();

  // hardest level fully seen in this session, for the profile line
  const levels = answered.map(a => getQuestion(a.qid)!.level);
  const rank: LogicLevel[] = ['beginner', 'medium', 'hard', 'expert'];
  const hardestHere = levels.reduce((best, l) => (rank.indexOf(l) > rank.indexOf(best as LogicLevel) ? l : best), (before.hardest || 'beginner') as LogicLevel);

  // daily streak: only the daily challenge extends it, and only once a day
  const today = new Date().toISOString().slice(0, 10);
  let dailyStreak = before.dailyStreak, bestDaily = before.bestDailyStreak, lastDaily = before.lastDaily;
  if (s.mode === 'daily' && before.lastDaily !== today) {
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    dailyStreak = before.lastDaily === y ? before.dailyStreak + 1 : 1;
    bestDaily = Math.max(bestDaily, dailyStreak);
    lastDaily = today;
  }

  // running correct-answer streak carries across sessions
  let streak = before.streak;
  for (const a of answered) streak = a.correct ? streak + 1 : 0;
  const bestStreak = Math.max(before.bestStreak, streak, s.bestCombo);

  const xpGain = Math.round(s.score * (s.mode === 'practice' ? 0.4 : 1));
  await sql`
    UPDATE logic_profiles SET
      rating = ${ratingAfter},
      peak_rating = ${Math.max(before.peakRating, ratingAfter)},
      answered = ${before.answered + answered.length},
      correct = ${before.correct + correct},
      total_ms = ${before.totalMs + answered.reduce((a, q) => a + (q.ms ?? 0), 0)},
      tests = ${before.tests + 1},
      streak = ${streak},
      best_streak = ${bestStreak},
      daily_streak = ${dailyStreak},
      best_daily_streak = ${bestDaily},
      last_daily = ${lastDaily},
      hardest = ${hardestHere},
      xp = ${before.xp + xpGain},
      updated_at = ${now}
    WHERE user_id = ${userId}
  `;

  // record the questions as seen (anti-repeat) and log the result
  for (const a of answered) {
    await sql`
      INSERT INTO logic_seen (user_id, question_id, seen_at) VALUES (${userId}, ${a.qid}, ${now})
      ON CONFLICT (user_id, question_id) DO UPDATE SET seen_at = ${now}
    `;
  }
  await sql`
    INSERT INTO logic_results (id, user_id, mode, level, score, correct, total, rating_delta, duration_ms, created_at)
    VALUES (${randomBytes(8).toString('hex')}, ${userId}, ${s.mode}, ${String(s.level)}, ${s.score}, ${correct}, ${total}, ${s.ratingDelta}, ${durationMs}, ${now})
  `;

  // rewards: practice teaches, ranked and the daily pay
  let coins = 0;
  if (s.mode === 'daily') coins = 25 + correct * 2;
  else if (s.mode !== 'practice') coins = Math.round(correct * 1.5);
  // system grant: the academy itself is the payer, so owner and target match
  if (coins > 0) { try { await grantCoins(userId, userId, coins, 'ლოგიკის აკადემია'); } catch { /* wallet is best-effort */ } }

  const after = await getProfile(userId);
  const achievements = await checkAchievements(userId, after);

  const review = answered.map(a => {
    const q = getQuestion(a.qid)!;
    return {
      title: q.title, body: q.body, q: q.q,
      options: a.order.map(i => q.options[i]),
      correctPos: a.correctPos, chosen: a.chosen ?? -1,
      rule: q.rule, why: q.why,
      trap: q.trap?.[(a.chosen ?? -1) as 0 | 1 | 2 | 3] ?? null,
      level: q.level, cat: q.cat,
    };
  });

  sessions.delete(sessionId);
  return {
    score: s.score, correct, total,
    ratingBefore: before.rating, ratingAfter, ratingDelta: ratingAfter - before.rating,
    accuracy: answered.length ? Math.round((correct / answered.length) * 100) : 0,
    avgMs, bestCombo: s.bestCombo,
    xp: xpGain, coins, achievements, review,
  };
}

// ── achievements ──────────────────────────────────────────────────────
export interface AchievementDef { code: string; name: string; desc: string; icon: string; test: (p: LogicProfile) => boolean }
export const ACHIEVEMENTS: AchievementDef[] = [
  { code: 'first', name: 'პირველი ნაბიჯი', desc: 'დაასრულე პირველი ტესტი', icon: '🎓', test: p => p.tests >= 1 },
  { code: 'c100', name: 'ასი სწორი', desc: '100 სწორი პასუხი', icon: '💯', test: p => p.correct >= 100 },
  { code: 'c1000', name: 'ათასი სწორი', desc: '1000 სწორი პასუხი', icon: '🏅', test: p => p.correct >= 1000 },
  { code: 'streak10', name: 'ათდღიანი სერია', desc: '10 დღე ზედიზედ ყოველდღიური გამოწვევა', icon: '🔥', test: p => p.dailyStreak >= 10 },
  { code: 'streak30', name: 'ოცდაათდღიანი სერია', desc: '30 დღე ზედიზედ', icon: '☄️', test: p => p.dailyStreak >= 30 },
  { code: 'combo15', name: 'უწყვეტი აზრი', desc: '15 სწორი პასუხი ზედიზედ', icon: '⛓️', test: p => p.bestStreak >= 15 },
  { code: 'formal', name: 'ფორმალური მოაზროვნე', desc: 'რეიტინგი 1400+', icon: '🧩', test: p => p.peakRating >= 1400 },
  { code: 'strategist', name: 'სტრატეგი', desc: 'რეიტინგი 1600+', icon: '♟️', test: p => p.peakRating >= 1600 },
  { code: 'analyst', name: 'დიდი ანალიტიკოსი', desc: 'რეიტინგი 1800+', icon: '🔬', test: p => p.peakRating >= 1800 },
  { code: 'expert', name: 'ლოგიკის ექსპერტი', desc: 'რეიტინგი 2000+', icon: '🧠', test: p => p.peakRating >= 2000 },
  { code: 'legend', name: 'ლოგიკის ლეგენდა', desc: 'რეიტინგი 2200+', icon: '👑', test: p => p.peakRating >= 2200 },
  { code: 'expertlvl', name: 'ექსპერტის დონე', desc: 'გაიარე ექსპერტის დონის კითხვა', icon: '🎯', test: p => p.hardest === 'expert' },
  { code: 'sharp', name: 'მკვეთრი გონება', desc: '90%+ სიზუსტე 200+ პასუხზე', icon: '⚡', test: p => p.answered >= 200 && p.correct / Math.max(1, p.answered) >= 0.9 },
  { code: 'devoted', name: 'ერთგული', desc: '50 დასრულებული ტესტი', icon: '📚', test: p => p.tests >= 50 },
];

async function checkAchievements(userId: string, p: LogicProfile): Promise<string[]> {
  const had = new Set((await sql`SELECT code FROM logic_achievements WHERE user_id = ${userId}` as any[]).map(r => r.code));
  const now = Date.now();
  const earned: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (had.has(a.code) || !a.test(p)) continue;
    await sql`INSERT INTO logic_achievements (user_id, code, earned_at) VALUES (${userId}, ${a.code}, ${now}) ON CONFLICT DO NOTHING`;
    earned.push(a.code);
  }
  return earned;
}

export async function getAchievements(userId: string): Promise<Array<AchievementDef & { earned: boolean; at: number | null }>> {
  const rows = await sql`SELECT code, earned_at FROM logic_achievements WHERE user_id = ${userId}` as any[];
  const map = new Map(rows.map(r => [r.code, Number(r.earned_at)]));
  return ACHIEVEMENTS.map(a => ({ ...a, earned: map.has(a.code), at: map.get(a.code) ?? null }));
}

// ── leaderboards ──────────────────────────────────────────────────────
export type BoardScope = 'world' | 'country' | 'friends' | 'week' | 'month' | 'all';
export interface BoardRow {
  rank: number; userId: string; username: string; avatar: string; country: string | null;
  rating: number; accuracy: number; tests: number; score?: number;
}

export async function leaderboard(scope: BoardScope, userId: string, limit = 50): Promise<BoardRow[]> {
  const lim = Math.max(1, Math.min(100, limit));
  let rows: any[];

  if (scope === 'week' || scope === 'month') {
    // period boards rank by points EARNED in the window, not lifetime rating
    const since = Date.now() - (scope === 'week' ? 7 : 30) * 86400000;
    rows = await sql`
      SELECT p.id AS user_id, p.username, p.avatar, p.country,
             COALESCE(lp.rating, 1200) AS rating,
             COALESCE(lp.answered, 0) AS answered, COALESCE(lp.correct, 0) AS correct,
             COALESCE(lp.tests, 0) AS tests,
             SUM(r.score)::int AS score
      FROM logic_results r
      JOIN players p ON p.id = r.user_id
      LEFT JOIN logic_profiles lp ON lp.user_id = r.user_id
      WHERE r.created_at >= ${since} AND r.mode <> 'practice'
      GROUP BY p.id, p.username, p.avatar, p.country, lp.rating, lp.answered, lp.correct, lp.tests
      ORDER BY score DESC
      LIMIT ${lim}
    ` as any[];
  } else if (scope === 'friends') {
    rows = await sql`
      SELECT p.id AS user_id, p.username, p.avatar, p.country,
             lp.rating, lp.answered, lp.correct, lp.tests
      FROM logic_profiles lp
      JOIN players p ON p.id = lp.user_id
      WHERE lp.answered > 0 AND (
        p.id = ${userId} OR p.id IN (
          SELECT CASE WHEN from_id = ${userId} THEN to_id ELSE from_id END
          FROM friendships
          WHERE status = 'accepted' AND (from_id = ${userId} OR to_id = ${userId})
        )
      )
      ORDER BY lp.rating DESC
      LIMIT ${lim}
    ` as any[];
  } else if (scope === 'country') {
    const [me] = await sql`SELECT country FROM players WHERE id = ${userId}` as any[];
    const country = me?.country ?? 'GE';
    rows = await sql`
      SELECT p.id AS user_id, p.username, p.avatar, p.country,
             lp.rating, lp.answered, lp.correct, lp.tests
      FROM logic_profiles lp
      JOIN players p ON p.id = lp.user_id
      WHERE lp.answered > 0 AND p.country = ${country}
      ORDER BY lp.rating DESC
      LIMIT ${lim}
    ` as any[];
  } else {
    rows = await sql`
      SELECT p.id AS user_id, p.username, p.avatar, p.country,
             lp.rating, lp.answered, lp.correct, lp.tests
      FROM logic_profiles lp
      JOIN players p ON p.id = lp.user_id
      WHERE lp.answered > 0
      ORDER BY lp.rating DESC
      LIMIT ${lim}
    ` as any[];
  }

  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    username: r.username ?? '—',
    avatar: r.avatar ?? '',
    country: r.country ?? null,
    rating: Number(r.rating ?? 1200),
    accuracy: Number(r.answered) > 0 ? Math.round((Number(r.correct) / Number(r.answered)) * 100) : 0,
    tests: Number(r.tests ?? 0),
    score: r.score !== undefined ? Number(r.score) : undefined,
  }));
}

/** World and national placing for the profile screen. */
export async function myRanks(userId: string): Promise<{ world: number | null; country: number | null; countryCode: string | null; totalPlayers: number }> {
  const [me] = await sql`SELECT country FROM players WHERE id = ${userId}` as any[];
  const [prof] = await sql`SELECT rating, answered FROM logic_profiles WHERE user_id = ${userId}` as any[];
  const [{ total }] = await sql`SELECT COUNT(*)::int AS total FROM logic_profiles WHERE answered > 0` as any[];
  if (!prof || Number(prof.answered) === 0) return { world: null, country: null, countryCode: me?.country ?? null, totalPlayers: Number(total) };
  const [{ ahead }] = await sql`
    SELECT COUNT(*)::int AS ahead FROM logic_profiles WHERE answered > 0 AND rating > ${Number(prof.rating)}
  ` as any[];
  let country: number | null = null;
  if (me?.country) {
    const [{ aheadC }] = await sql`
      SELECT COUNT(*)::int AS "aheadC" FROM logic_profiles lp JOIN players p ON p.id = lp.user_id
      WHERE lp.answered > 0 AND p.country = ${me.country} AND lp.rating > ${Number(prof.rating)}
    ` as any[];
    country = Number(aheadC) + 1;
  }
  return { world: Number(ahead) + 1, country, countryCode: me?.country ?? null, totalPlayers: Number(total) };
}

export async function setCountry(userId: string, code: string): Promise<void> {
  const c = String(code ?? '').trim().toUpperCase().slice(0, 2);
  if (!/^[A-Z]{2}$/.test(c)) throw new Error('არასწორი ქვეყნის კოდი');
  await sql`UPDATE players SET country = ${c} WHERE id = ${userId}`;
}

/** Has today's challenge already been completed? */
export async function dailyStatus(userId: string): Promise<{ done: boolean; date: string; streak: number }> {
  const p = await getProfile(userId);
  const today = new Date().toISOString().slice(0, 10);
  return { done: p.lastDaily === today, date: today, streak: p.dailyStreak };
}

/** Per-category accuracy for the stats screen. */
export async function categoryBreakdown(userId: string): Promise<Array<{ cat: LogicCategory; seen: number }>> {
  const rows = await sql`SELECT question_id FROM logic_seen WHERE user_id = ${userId}` as any[];
  const counts = new Map<LogicCategory, number>();
  for (const r of rows) {
    const q = getQuestion(r.question_id);
    if (q) counts.set(q.cat, (counts.get(q.cat) ?? 0) + 1);
  }
  return [...counts.entries()].map(([cat, seen]) => ({ cat, seen })).sort((a, b) => b.seen - a.seen);
}

export const BANK_SIZE = ALL_QUESTIONS.length;
