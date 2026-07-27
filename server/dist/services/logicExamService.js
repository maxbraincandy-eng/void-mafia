/**
 * ლოგიკის გამოცდა — the gated, graded sitting.
 *
 * Deliberately unlike the practice modes:
 *  • ONE pooled clock for the whole paper, not a timer per question. When it
 *    runs out the paper is submitted as it stands, and anything unanswered is
 *    simply wrong — which is how a real exam behaves.
 *  • Scored out of 100, weighted by difficulty, so 25 correct beginner answers
 *    is not the same paper as 25 correct expert ones.
 *  • One sitting per week. The cooldown is measured from the last attempt, and
 *    the server is the only clock that matters.
 *  • No explanations until the paper is handed in.
 */
import { randomBytes } from 'crypto';
import { sql } from '../db.js';
import { grantCoins } from './coinService.js';
import { BY_LEVEL, getQuestion, LEVEL_WEIGHT, } from '../data/logic/index.js';
/** Paper composition: 25 questions, weighted toward the middle. */
export const EXAM_PLAN = [
    ['beginner', 6], ['medium', 7], ['hard', 7], ['expert', 5],
];
export const EXAM_TOTAL = EXAM_PLAN.reduce((a, [, n]) => a + n, 0); // 25
/** One pooled clock for the whole paper. */
export const EXAM_MS = 30 * 60 * 1000; // 30 minutes
export const RETAKE_MS = 7 * 24 * 60 * 60 * 1000; // one week
/** Grace on top of the clock before the server refuses a late submission. */
const LATE_GRACE_MS = 20 * 1000;
const MAX_POINTS = EXAM_PLAN.reduce((a, [lv, n]) => a + LEVEL_WEIGHT[lv] * n, 0);
const sessions = new Map();
setInterval(() => {
    const cutoff = Date.now() - (EXAM_MS + 30 * 60 * 1000);
    for (const [id, s] of sessions)
        if (s.startedAt < cutoff)
            sessions.delete(id);
}, 10 * 60 * 1000).unref?.();
function shuffle(a) {
    const r = [...a];
    for (let i = r.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
}
export async function examStatus(userId) {
    const rows = await sql `
    SELECT score, correct, total, created_at, is_best
    FROM logic_exam_attempts WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
    const last = rows[0] ?? null;
    const bestRow = rows.find(r => r.is_best) ?? null;
    const lastAt = last ? Number(last.created_at) : null;
    const waitMs = lastAt ? Math.max(0, RETAKE_MS - (Date.now() - lastAt)) : 0;
    return {
        canSit: waitMs === 0,
        waitMs,
        lastAt,
        lastScore: last ? Number(last.score) : null,
        best: bestRow ? { score: Number(bestRow.score), correct: Number(bestRow.correct), total: Number(bestRow.total), at: Number(bestRow.created_at) } : null,
        attempts: rows.length,
        totalQuestions: EXAM_TOTAL,
        examMs: EXAM_MS,
    };
}
// ── sitting the paper ─────────────────────────────────────────────────
export async function startExam(userId) {
    const st = await examStatus(userId);
    if (!st.canSit) {
        const days = Math.ceil(st.waitMs / 86400000);
        return { error: `გამოცდის გადაბარება შესაძლებელია ${days} დღეში` };
    }
    // An unfinished paper is still that week's paper — resume it rather than
    // letting a refresh hand out a fresh set of questions.
    for (const s of sessions.values()) {
        if (s.userId === userId && !s.finished && Date.now() < s.endsAt)
            return { view: viewOf(s) };
    }
    const picks = [];
    for (const [lv, n] of EXAM_PLAN)
        picks.push(...shuffle(BY_LEVEL[lv]).slice(0, n));
    const now = Date.now();
    const s = {
        id: randomBytes(12).toString('hex'),
        userId,
        questions: shuffle(picks).map(q => {
            const order = shuffle([0, 1, 2, 3]);
            return { qid: q.id, order, correctPos: order.indexOf(q.answer) };
        }),
        idx: 0,
        startedAt: now,
        endsAt: now + EXAM_MS,
        finished: false,
    };
    sessions.set(s.id, s);
    return { view: viewOf(s) };
}
function viewOf(s) {
    const cur = s.questions[s.idx];
    const q = cur ? getQuestion(cur.qid) : undefined;
    return {
        examId: s.id,
        index: s.idx,
        total: s.questions.length,
        /** the ONLY clock: milliseconds left for the whole paper */
        endsAt: s.endsAt,
        answered: s.questions.filter(x => x.chosen !== undefined).length,
        question: q && cur ? {
            title: q.title, body: q.body, q: q.q,
            options: cur.order.map(i => q.options[i]),
            level: q.level, cat: q.cat,
        } : null,
    };
}
export function getExam(id) { return sessions.get(id) ?? null; }
export function examView(s) { return viewOf(s); }
/** Record an answer. No feedback comes back — this is an exam. */
export function answerExam(examId, userId, chosen) {
    const s = sessions.get(examId);
    if (!s || s.userId !== userId || s.finished)
        return null;
    if (Date.now() > s.endsAt + LATE_GRACE_MS)
        return null; // clock ran out
    const cur = s.questions[s.idx];
    if (!cur)
        return null;
    const pos = Number.isFinite(chosen) ? Math.max(-1, Math.min(3, Math.trunc(chosen))) : -1;
    cur.chosen = pos;
    cur.correct = pos === cur.correctPos;
    s.idx++;
    const done = s.idx >= s.questions.length;
    return { done, next: done ? null : viewOf(s) };
}
/** A 100-point band, named. */
function gradeOf(score) {
    if (score >= 90)
        return 'უმაღლესი — ლოგიკის ოსტატი';
    if (score >= 80)
        return 'ძალიან კარგი';
    if (score >= 70)
        return 'კარგი';
    if (score >= 60)
        return 'დამაკმაყოფილებელი';
    if (score >= 50)
        return 'საზღვარზე';
    return 'გასამეორებელია';
}
export async function finishExam(examId, userId) {
    var _a;
    const s = sessions.get(examId);
    if (!s || s.userId !== userId || s.finished)
        return null;
    s.finished = true;
    const now = Date.now();
    const timedOut = now > s.endsAt;
    // Weighted marking: an unanswered question simply scores nothing.
    let earned = 0, correct = 0, answered = 0;
    const byLevel = {};
    for (const a of s.questions) {
        const q = getQuestion(a.qid);
        const b = (byLevel[_a = q.level] ?? (byLevel[_a] = { correct: 0, total: 0 }));
        b.total++;
        if (a.chosen !== undefined)
            answered++;
        if (a.correct) {
            earned += LEVEL_WEIGHT[q.level];
            correct++;
            b.correct++;
        }
    }
    const score = Math.round((earned / MAX_POINTS) * 100);
    const durationMs = Math.min(EXAM_MS, now - s.startedAt);
    // is this their best sitting? one flagged row per player drives the board
    const [prevBest] = await sql `
    SELECT id, score FROM logic_exam_attempts WHERE user_id = ${userId} AND is_best = true
  `;
    const isBest = !prevBest || score > Number(prevBest.score);
    if (isBest && prevBest) {
        await sql `UPDATE logic_exam_attempts SET is_best = false WHERE id = ${prevBest.id}`;
    }
    await sql `
    INSERT INTO logic_exam_attempts (id, user_id, score, correct, total, by_level, duration_ms, timed_out, is_best, created_at)
    VALUES (${randomBytes(8).toString('hex')}, ${userId}, ${score}, ${correct}, ${s.questions.length},
            ${JSON.stringify(byLevel)}, ${durationMs}, ${timedOut}, ${isBest}, ${now})
  `;
    // passing pays; a strong pass pays more
    const coins = score >= 90 ? 300 : score >= 80 ? 200 : score >= 60 ? 100 : 40;
    try {
        await grantCoins(userId, userId, coins, 'ლოგიკის გამოცდა');
    }
    catch { /* wallet is best-effort */ }
    const review = s.questions.map(a => {
        const q = getQuestion(a.qid);
        return {
            title: q.title, body: q.body, q: q.q,
            options: a.order.map(i => q.options[i]),
            correctPos: a.correctPos, chosen: a.chosen ?? -1,
            rule: q.rule, why: q.why,
            trap: q.trap?.[(a.chosen ?? -1)] ?? null,
            level: q.level, cat: q.cat,
        };
    });
    sessions.delete(examId);
    return {
        score, correct, total: s.questions.length, answered, timedOut, durationMs,
        grade: gradeOf(score), byLevel, best: isBest, coins,
        nextSittingAt: now + RETAKE_MS,
        review,
    };
}
export async function examLeaderboard(scope, userId, limit = 50) {
    const lim = Math.max(1, Math.min(100, limit));
    let rows;
    if (scope === 'week') {
        const since = Date.now() - 7 * 86400000;
        rows = await sql `
      SELECT DISTINCT ON (e.user_id) e.user_id, e.score, e.correct, e.total, e.duration_ms, e.created_at,
             p.username, p.avatar, p.avatar_url, p.country
      FROM logic_exam_attempts e JOIN players p ON p.id = e.user_id
      WHERE e.created_at >= ${since}
      ORDER BY e.user_id, e.score DESC, e.duration_ms ASC
    `;
        rows.sort((a, b) => Number(b.score) - Number(a.score) || Number(a.duration_ms) - Number(b.duration_ms));
        rows = rows.slice(0, lim);
    }
    else if (scope === 'country') {
        const [me] = await sql `SELECT country FROM players WHERE id = ${userId}`;
        const country = me?.country ?? 'GE';
        rows = await sql `
      SELECT e.user_id, e.score, e.correct, e.total, e.duration_ms, e.created_at,
             p.username, p.avatar, p.avatar_url, p.country
      FROM logic_exam_attempts e JOIN players p ON p.id = e.user_id
      WHERE e.is_best = true AND p.country = ${country}
      ORDER BY e.score DESC, e.duration_ms ASC
      LIMIT ${lim}
    `;
    }
    else {
        rows = await sql `
      SELECT e.user_id, e.score, e.correct, e.total, e.duration_ms, e.created_at,
             p.username, p.avatar, p.avatar_url, p.country
      FROM logic_exam_attempts e JOIN players p ON p.id = e.user_id
      WHERE e.is_best = true
      ORDER BY e.score DESC, e.duration_ms ASC
      LIMIT ${lim}
    `;
    }
    return rows.map((r, i) => ({
        rank: i + 1,
        userId: r.user_id,
        username: r.username ?? '—',
        avatar: r.avatar ?? '',
        avatarUrl: r.avatar_url ?? null,
        country: r.country ?? null,
        score: Number(r.score),
        correct: Number(r.correct),
        total: Number(r.total),
        durationMs: Number(r.duration_ms),
        at: Number(r.created_at),
    }));
}
//# sourceMappingURL=logicExamService.js.map