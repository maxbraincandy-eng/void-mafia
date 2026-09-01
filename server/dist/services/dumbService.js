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
 */
import { sql } from '../db.js';
import { randomBytes } from 'crypto';
import { BANK, byId, QUESTIONS_PER_TEST, band } from './dumbBank.js';
/**
 * Score a submission and record it.
 *
 * The answers are matched back to the bank by id, so a client that invents a
 * question id, sends the same one twice, or omits half the test scores exactly
 * what it deserves: only real, distinct, correctly-answered questions count.
 */
export async function submitAttempt(userId, answers, durationMs) {
    const seen = new Set();
    const breakdown = [];
    let correct = 0;
    for (const a of answers.slice(0, QUESTIONS_PER_TEST * 2)) {
        const q = byId(String(a?.questionId ?? ''));
        if (!q || seen.has(q.id))
            continue;
        seen.add(q.id);
        const chosen = q.options.find(o => o.id === a.optionId) ?? null;
        const right = !!chosen && q.options.indexOf(chosen) === q.correct;
        if (right)
            correct++;
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
    await sql `
    INSERT INTO dumb_attempts (id, user_id, correct, total, duration_ms, question_ids, created_at)
    VALUES (${id}, ${userId}, ${correct}, ${total}, ${duration},
            ${JSON.stringify(breakdown.map(x => x.questionId))}, ${now})
  `;
    /*
     * "Best" is recomputed rather than compared against a stored flag.
     *
     * Two attempts finishing at once would both read the old best and both claim
     * it. Asking the table which row is actually the best cannot race with
     * itself.
     */
    const [top] = await sql `
    SELECT id FROM dumb_attempts
    WHERE user_id = ${userId}
    ORDER BY correct DESC, duration_ms ASC, created_at ASC
    LIMIT 1
  `;
    const isBest = String(top?.id ?? '') === id;
    const rank = isBest ? await rankOf(correct, duration) : null;
    return { id, correct, total, durationMs: duration, title: b.title, note: b.note, isBest, rank, breakdown };
}
/** Where a score would sit on the board, counting each player once. */
async function rankOf(correct, durationMs) {
    const [row] = await sql `
    WITH best AS (
      SELECT DISTINCT ON (user_id) user_id, correct, duration_ms
      FROM dumb_attempts
      ORDER BY user_id, correct DESC, duration_ms ASC, created_at ASC
    )
    SELECT COUNT(*)::int AS ahead FROM best
    WHERE correct > ${correct} OR (correct = ${correct} AND duration_ms < ${durationMs})
  `;
    return Number(row?.ahead ?? 0) + 1;
}
export async function getLeaderboard(viewerId, limit = 50) {
    const rows = await sql `
    WITH best AS (
      SELECT DISTINCT ON (a.user_id)
        a.user_id, a.correct, a.total, a.duration_ms, a.created_at
      FROM dumb_attempts a
      ORDER BY a.user_id, a.correct DESC, a.duration_ms ASC, a.created_at ASC
    )
    SELECT b.*, p.username, p.avatar, p.avatar_url
    FROM best b LEFT JOIN players p ON p.id = b.user_id
    ORDER BY b.correct DESC, b.duration_ms ASC, b.created_at ASC
    LIMIT ${Math.min(200, Math.max(1, limit))}
  `;
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
export async function getStatus(userId) {
    const [agg] = await sql `
    SELECT COUNT(*)::int AS plays, MAX(correct)::int AS best FROM dumb_attempts WHERE user_id = ${userId}
  `;
    const [last] = await sql `
    SELECT question_ids, correct, total, duration_ms FROM dumb_attempts
    WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 1
  `;
    const [bestRow] = await sql `
    SELECT correct, duration_ms FROM dumb_attempts
    WHERE user_id = ${userId} ORDER BY correct DESC, duration_ms ASC, created_at ASC LIMIT 1
  `;
    let ids = [];
    try {
        ids = last?.question_ids ? JSON.parse(last.question_ids) : [];
    }
    catch {
        ids = [];
    }
    return {
        plays: Number(agg?.plays ?? 0),
        best: agg?.best == null ? null : Number(agg.best),
        total: Number(last?.total ?? QUESTIONS_PER_TEST),
        rank: bestRow ? await rankOf(Number(bestRow.correct), Number(bestRow.duration_ms)) : null,
        lastQuestionIds: Array.isArray(ids) ? ids.map(String) : [],
        bankSize: BANK.length,
    };
}
//# sourceMappingURL=dumbService.js.map