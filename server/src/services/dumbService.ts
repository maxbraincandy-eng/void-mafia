/**
 * დებილების ტესტი — attempts and the leaderboard.
 *
 * SCORING IS SERVER-SIDE, AND THAT IS THE WHOLE POINT
 * ──────────────────────────────────────────────────
 * The client is sent questions without their answers and submits the option ids
 * it chose. It never says how many it got right, and if it did, it would be
 * ignored. A leaderboard that trusts a self-reported score is a leaderboard of
 * who read the source first.
 *
 * The same reasoning covers the category: it is derived from the questions that
 * were actually answered, not from what the submission claims. See
 * `categoryOf`.
 *
 * WHAT THE BOARD RANKS
 * ────────────────────
 * Each player's BEST attempt, not their latest and not all of them. Ranking
 * every attempt would fill the board with one person who kept trying; ranking
 * the latest would punish somebody for playing again after a good run, which is
 * exactly the wrong incentive for a game meant to be replayed.
 *
 * Ties break on how long the run took — a tie on a twelve-question quiz is
 * common, and leaving them in arrival order means the board reshuffles for no
 * reason every time somebody else ties.
 *
 * ONE BOARD PER CATEGORY
 * ──────────────────────
 * Categories are not equally hard, so a single board would rank the person who
 * picked the easiest one. Each category keeps its own, and `mixed` is a real
 * category here rather than a union of the others — a mixed run is its own kind
 * of run and belongs with other mixed runs.
 */

import { sql } from '../db.js';
import { randomBytes } from 'crypto';
import { BANK, byId, QUESTIONS_PER_TEST, band, categoryOf, type TestCategory } from './dumbBank.js';

export interface DumbAnswer {
  questionId: string;
  /** The option the player chose, or null when they skipped. */
  optionId: string | null;
}

export interface DumbResult {
  id: string;
  correct: number;
  total: number;
  durationMs: number;
  title: string;
  note: string;
  isBest: boolean;
  rank: number | null;
  category: TestCategory;
  /** Per question, so the result screen can show the punchlines. */
  breakdown: {
    questionId: string;
    text: string;
    chosen: string | null;
    correctText: string;
    right: boolean;
    reveal: string;
  }[];
}

export interface DumbLeaderRow {
  rank: number;
  userId: string;
  username: string;
  avatar: string;
  avatarUrl: string | null;
  correct: number;
  total: number;
  durationMs: number;
  createdAt: number;
  isMe: boolean;
}

/**
 * Score a submission and record it.
 *
 * The answers are matched back to the bank by id, so a client that invents a
 * question id, sends the same one twice, or omits half the test scores exactly
 * what it deserves: only real, distinct, correctly-answered questions count.
 */
export async function submitAttempt(
  userId: string,
  answers: DumbAnswer[],
  durationMs: number,
): Promise<DumbResult> {
  const seen = new Set<string>();
  const breakdown: DumbResult['breakdown'] = [];
  let correct = 0;

  for (const a of answers.slice(0, QUESTIONS_PER_TEST * 2)) {
    const q = byId(String(a?.questionId ?? ''));
    if (!q || seen.has(q.id)) continue;
    seen.add(q.id);

    const chosen = q.options.find(o => o.id === a.optionId) ?? null;
    const right = !!chosen && q.options.indexOf(chosen) === q.correct;
    if (right) correct++;

    breakdown.push({
      questionId: q.id,
      text: q.text,
      chosen: chosen?.text ?? null,
      correctText: q.options[q.correct].text,
      right,
      reveal: q.reveal,
    });
  }

  const total = breakdown.length;
  const b = band(correct, total);
  const id = `dt_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
  const now = Date.now();
  const duration = Math.max(0, Math.min(6 * 60 * 60 * 1000, Math.round(durationMs)));
  const questionIds = breakdown.map(x => x.questionId);
  const category = categoryOf(questionIds);

  await sql`
    INSERT INTO dumb_attempts (id, user_id, correct, total, duration_ms, question_ids, category, created_at)
    VALUES (${id}, ${userId}, ${correct}, ${total}, ${duration},
            ${JSON.stringify(questionIds)}, ${category}, ${now})
  `;

  /*
   * "Best" is recomputed rather than compared against a stored flag.
   *
   * Two attempts finishing at once would both read the old best and both claim
   * it. Asking the table which row is actually the best cannot race with
   * itself.
   */
  const [top] = await sql`
    SELECT id FROM dumb_attempts
    WHERE user_id = ${userId} AND category = ${category}
    ORDER BY correct DESC, duration_ms ASC, created_at ASC
    LIMIT 1
  ` as any[];
  const isBest = String(top?.id ?? '') === id;

  const rank = isBest ? await rankOf(category, correct, duration) : null;
  return {
    id, correct, total, durationMs: duration,
    title: b.title, note: b.note, isBest, rank, category, breakdown,
  };
}

/** Where a score would sit on that category's board, counting each player once. */
async function rankOf(category: TestCategory, correct: number, durationMs: number): Promise<number> {
  const [row] = await sql`
    WITH best AS (
      SELECT DISTINCT ON (user_id) user_id, correct, duration_ms
      FROM dumb_attempts
      WHERE category = ${category}
      ORDER BY user_id, correct DESC, duration_ms ASC, created_at ASC
    )
    SELECT COUNT(*)::int AS ahead FROM best
    WHERE correct > ${correct} OR (correct = ${correct} AND duration_ms < ${durationMs})
  ` as any[];
  return Number(row?.ahead ?? 0) + 1;
}

export async function getLeaderboard(
  viewerId: string | null,
  category: TestCategory = 'mixed',
  limit = 50,
): Promise<DumbLeaderRow[]> {
  const rows = await sql`
    WITH best AS (
      SELECT DISTINCT ON (a.user_id)
        a.user_id, a.correct, a.total, a.duration_ms, a.created_at
      FROM dumb_attempts a
      WHERE a.category = ${category}
      ORDER BY a.user_id, a.correct DESC, a.duration_ms ASC, a.created_at ASC
    )
    SELECT b.*, p.username, p.avatar, p.avatar_url
    FROM best b LEFT JOIN players p ON p.id = b.user_id
    ORDER BY b.correct DESC, b.duration_ms ASC, b.created_at ASC
    LIMIT ${Math.min(200, Math.max(1, limit))}
  ` as any[];

  return rows.map((r, i) => ({
    rank: i + 1,
    userId: String(r.user_id),
    username: r.username ?? 'უცნობი',
    avatar: r.avatar ?? '🙂',
    avatarUrl: r.avatar_url ?? null,
    correct: Number(r.correct),
    total: Number(r.total),
    durationMs: Number(r.duration_ms),
    createdAt: Number(r.created_at),
    isMe: !!viewerId && String(r.user_id) === viewerId,
  }));
}

/**
 * Plays and best score per category, for the picker's tiles.
 *
 * One grouped query rather than a `getStatus` per category: the picker opens
 * every time the game does, and five categories through `getStatus` would be
 * fifteen round trips to render five subtitles.
 */
export async function getCategoryBests(
  userId: string,
): Promise<Record<string, { plays: number; best: number }>> {
  const rows = await sql`
    SELECT category, COUNT(*)::int AS plays, MAX(correct)::int AS best
    FROM dumb_attempts WHERE user_id = ${userId}
    GROUP BY category
  ` as any[];

  const out: Record<string, { plays: number; best: number }> = {};
  for (const r of rows) out[String(r.category)] = { plays: Number(r.plays), best: Number(r.best) };
  return out;
}

export interface DumbStatus {
  category: TestCategory;
  plays: number;
  best: number | null;
  total: number;
  rank: number | null;
  /** Questions from the last run in this category, so the next draw can avoid them. */
  lastQuestionIds: string[];
  bankSize: number;
}

/**
 * One player's standing in one category.
 *
 * Scoped rather than global because `lastQuestionIds` feeds the next draw: if it
 * returned the last run whatever category that was, picking სხვა განზომილება
 * after a Georgian run would exclude twelve questions that were never in the
 * pool, and exclude nothing that was.
 */
export async function getStatus(userId: string, category: TestCategory = 'mixed'): Promise<DumbStatus> {
  const [agg] = await sql`
    SELECT COUNT(*)::int AS plays, MAX(correct)::int AS best
    FROM dumb_attempts WHERE user_id = ${userId} AND category = ${category}
  ` as any[];
  const [last] = await sql`
    SELECT question_ids, correct, total, duration_ms FROM dumb_attempts
    WHERE user_id = ${userId} AND category = ${category}
    ORDER BY created_at DESC LIMIT 1
  ` as any[];
  const [bestRow] = await sql`
    SELECT correct, duration_ms FROM dumb_attempts
    WHERE user_id = ${userId} AND category = ${category}
    ORDER BY correct DESC, duration_ms ASC, created_at ASC LIMIT 1
  ` as any[];

  let ids: string[] = [];
  try { ids = last?.question_ids ? JSON.parse(last.question_ids) : []; } catch { ids = []; }

  return {
    category,
    plays: Number(agg?.plays ?? 0),
    best: agg?.best == null ? null : Number(agg.best),
    total: Number(last?.total ?? QUESTIONS_PER_TEST),
    rank: bestRow ? await rankOf(category, Number(bestRow.correct), Number(bestRow.duration_ms)) : null,
    lastQuestionIds: Array.isArray(ids) ? ids.map(String) : [],
    bankSize: category === 'mixed' ? BANK.length : BANK.filter(q => q.category === category).length,
  };
}
