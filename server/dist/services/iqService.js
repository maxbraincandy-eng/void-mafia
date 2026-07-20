/**
 * VOID IQ — persistence + leaderboard + profile queries.
 *
 * Rules:
 *  - 7-day cooldown between attempts (moderators exempt for testing/ops).
 *  - Every attempt is stored (full private history).
 *  - Only VERIFIED attempts are leaderboard-eligible.
 *  - `is_highest` marks each user's best verified attempt; the All-Time /
 *    Global board reads those. Weekly/Monthly read the best verified attempt
 *    inside the time window. A suspicious result never overwrites a verified one.
 */
import { randomBytes } from 'crypto';
import { sql } from '../db.js';
import { getFriendIds } from './friendService.js';
import { getClanMembers, getClanMembershipByPlayer } from './clanService.js';
export const IQ_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * One-time reconciliation: earlier builds over-flagged legitimate attempts as
 * unverified (too-strict anti-cheat). Re-evaluate stored unverified attempts
 * against the current lenient time-based rules and rescue the genuine ones so
 * they appear on the leaderboard without a retake. Idempotent — safe every boot.
 * Tab-switch flags can't be recomputed (count isn't stored), so those stay.
 */
export async function reconcileVerification() {
    const rows = await sql `SELECT id, user_id, iq, total, duration_ms, flags FROM iq_attempts WHERE verified = false`;
    let rescued = 0;
    const affected = new Set();
    for (const r of rows) {
        const iq = Number(r.iq), total = Number(r.total), dur = Number(r.duration_ms);
        let old = [];
        try {
            old = JSON.parse(r.flags ?? '[]');
        }
        catch { /* ignore */ }
        const newFlags = [];
        if (dur < 60000)
            newFlags.push('too_fast_total');
        if (total > 0 && dur / total < 1200)
            newFlags.push('too_fast_per_question');
        if (iq >= 140 && dur < 90000)
            newFlags.push('high_score_low_time');
        if (old.includes('excessive_tab_switching'))
            newFlags.push('excessive_tab_switching');
        if (newFlags.length === 0) {
            await sql `UPDATE iq_attempts SET verified = true, flags = '[]' WHERE id = ${r.id}`;
            rescued++;
            affected.add(r.user_id);
        }
    }
    // Recompute is_highest for every user whose verification changed.
    for (const uid of affected) {
        const vr = await sql `SELECT id FROM iq_attempts WHERE user_id = ${uid} AND verified = true ORDER BY iq DESC, created_at ASC LIMIT 1`;
        if (!vr.length)
            continue;
        await sql `UPDATE iq_attempts SET is_highest = false WHERE user_id = ${uid}`;
        await sql `UPDATE iq_attempts SET is_highest = true WHERE id = ${vr[0].id}`;
    }
    return rescued;
}
export async function isModerator(userId) {
    const [r] = await sql `SELECT is_moderator, moderator_level FROM players WHERE id = ${userId}`;
    if (!r)
        return false;
    const lvl = r.moderator_level;
    return Number(r.is_moderator) === 1 || (lvl != null && String(lvl).trim() !== '');
}
/** How long until this user may retake (0 = available now). Moderators bypass. */
export async function cooldownRemaining(userId, isModerator) {
    if (isModerator)
        return 0;
    const [row] = await sql `
    SELECT created_at FROM iq_attempts WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 1
  `;
    if (!row)
        return 0;
    const elapsed = Date.now() - Number(row.created_at);
    return Math.max(0, IQ_COOLDOWN_MS - elapsed);
}
/** Persist a scored attempt and maintain the per-user `is_highest` flag. */
export async function recordAttempt(userId, r) {
    const id = 'iq_' + randomBytes(9).toString('hex');
    const now = Date.now();
    // Current best verified IQ for this user (pre-insert).
    const [best] = await sql `
    SELECT iq FROM iq_attempts WHERE user_id = ${userId} AND verified = true ORDER BY iq DESC LIMIT 1
  `;
    const prevBest = best ? Number(best.iq) : -1;
    const isHighest = r.verified && r.iq > prevBest;
    if (isHighest) {
        // Demote any previous highest — only one row per user carries the flag.
        await sql `UPDATE iq_attempts SET is_highest = false WHERE user_id = ${userId} AND is_highest = true`;
    }
    await sql `
    INSERT INTO iq_attempts (
      id, user_id, iq, percentile, band, raw_score, max_score, correct, total,
      domain_scores, duration_ms, verified, flags, is_highest, created_at
    ) VALUES (
      ${id}, ${userId}, ${r.iq}, ${r.percentile}, ${r.band}, ${r.rawScore}, ${r.maxScore},
      ${r.correct}, ${r.total}, ${JSON.stringify(r.domainScores)}, ${r.durationMs},
      ${r.verified}, ${JSON.stringify(r.flags)}, ${isHighest}, ${now}
    )
  `;
    const rank = r.verified ? await rankForIq(r.iq) : null;
    return { id, isHighest, rank };
}
/** 1-based rank on the All-Time board for a given IQ (ties broken by "at least as good"). */
async function rankForIq(iq) {
    const [row] = await sql `
    SELECT COUNT(*) AS c FROM iq_attempts WHERE verified = true AND is_highest = true AND iq > ${iq}
  `;
    return Number(row?.c ?? 0) + 1;
}
async function userRank(userId) {
    const [me] = await sql `
    SELECT iq FROM iq_attempts WHERE user_id = ${userId} AND verified = true AND is_highest = true LIMIT 1
  `;
    if (!me)
        return null;
    return rankForIq(Number(me.iq));
}
function mapRows(rows) {
    return rows.map((r, i) => ({
        rank: i + 1,
        userId: r.user_id,
        username: r.username ?? '?',
        avatar: r.avatar ?? '',
        avatarUrl: r.avatar_url ?? null,
        iq: Number(r.iq),
        percentile: Number(r.percentile),
        createdAt: Number(r.created_at),
        verified: !!r.verified,
    }));
}
/** Leaderboard for a scope. `viewerId` is required for friends/clan filters. */
export async function getLeaderboard(scope, viewerId, limit = 100) {
    const now = Date.now();
    if (scope === 'weekly' || scope === 'monthly') {
        const since = now - (scope === 'weekly' ? 7 : 30) * 24 * 60 * 60 * 1000;
        const rows = await sql `
      SELECT DISTINCT ON (a.user_id) a.user_id, a.iq, a.percentile, a.created_at, a.verified,
             p.username, p.avatar, p.avatar_url
      FROM iq_attempts a JOIN players p ON p.id = a.user_id
      WHERE a.verified = true AND a.created_at >= ${since}
      ORDER BY a.user_id, a.iq DESC
    `;
        rows.sort((x, y) => Number(y.iq) - Number(x.iq) || Number(y.created_at) - Number(x.created_at));
        return mapRows(rows.slice(0, limit));
    }
    // all / global / friends / clan → highest verified per user
    let idFilter = null;
    if (scope === 'friends') {
        if (!viewerId)
            return [];
        const friends = await getFriendIds(viewerId);
        idFilter = [...friends, viewerId];
    }
    else if (scope === 'clan') {
        if (!viewerId)
            return [];
        const membership = await getClanMembershipByPlayer(viewerId);
        if (!membership)
            return [];
        const members = await getClanMembers(membership.id);
        idFilter = members.map(m => m.playerId);
    }
    const rows = idFilter
        ? await sql `
        SELECT a.user_id, a.iq, a.percentile, a.created_at, a.verified, p.username, p.avatar, p.avatar_url
        FROM iq_attempts a JOIN players p ON p.id = a.user_id
        WHERE a.verified = true AND a.is_highest = true AND a.user_id = ANY(${idFilter})
        ORDER BY a.iq DESC, a.created_at ASC
        LIMIT ${limit}
      `
        : await sql `
        SELECT a.user_id, a.iq, a.percentile, a.created_at, a.verified, p.username, p.avatar, p.avatar_url
        FROM iq_attempts a JOIN players p ON p.id = a.user_id
        WHERE a.verified = true AND a.is_highest = true
        ORDER BY a.iq DESC, a.created_at ASC
        LIMIT ${limit}
      `;
    return mapRows(rows);
}
function mapHistory(rows) {
    return rows.map(r => ({
        id: r.id,
        iq: Number(r.iq),
        percentile: Number(r.percentile),
        band: r.band ?? '',
        correct: Number(r.correct),
        total: Number(r.total),
        durationMs: Number(r.duration_ms),
        verified: !!r.verified,
        isHighest: !!r.is_highest,
        createdAt: Number(r.created_at),
        domainScores: safeJson(r.domain_scores),
    }));
}
function safeJson(s) { try {
    return JSON.parse(s ?? '{}');
}
catch {
    return {};
} }
/** The caller's own full status + private history. */
export async function getMyStatus(userId, isModerator) {
    const rows = await sql `
    SELECT * FROM iq_attempts WHERE user_id = ${userId} ORDER BY created_at DESC
  `;
    const history = mapHistory(rows);
    if (history.length === 0) {
        return { hasResult: false, bestIq: null, bestPercentile: null, latestIq: null, latestVerified: false, latestDate: null, rank: null, attempts: 0, cooldownUntil: null, history: [] };
    }
    const verified = history.filter(h => h.verified);
    const best = verified.slice().sort((a, b) => b.iq - a.iq)[0] ?? null;
    const latest = history[0];
    const remaining = await cooldownRemaining(userId, isModerator);
    return {
        hasResult: verified.length > 0,
        bestIq: best?.iq ?? null,
        bestPercentile: best?.percentile ?? null,
        latestIq: latest.iq,
        latestVerified: latest.verified,
        latestDate: latest.createdAt,
        rank: best ? await userRank(userId) : null,
        attempts: history.length,
        cooldownUntil: remaining > 0 ? Date.now() + remaining : null,
        history,
    };
}
/** Public IQ snapshot for another user's profile — no answers exposed. */
export async function getPublicProfile(userId) {
    const rows = await sql `
    SELECT iq, percentile, band, verified, is_highest, created_at
    FROM iq_attempts WHERE user_id = ${userId} ORDER BY created_at DESC
  `;
    if (rows.length === 0) {
        return { hasResult: false, bestIq: null, bestPercentile: null, band: null, latestDate: null, rank: null, attempts: 0, history: [] };
    }
    const best = rows.filter(r => r.verified).sort((a, b) => Number(b.iq) - Number(a.iq))[0] ?? null;
    return {
        hasResult: !!best,
        bestIq: best ? Number(best.iq) : null,
        bestPercentile: best ? Number(best.percentile) : null,
        band: best ? best.band : null,
        latestDate: Number(rows[0].created_at),
        rank: best ? await rankForIq(Number(best.iq)) : null,
        attempts: rows.length,
        history: rows.slice(0, 10).map(r => ({ iq: Number(r.iq), verified: !!r.verified, createdAt: Number(r.created_at) })),
    };
}
//# sourceMappingURL=iqService.js.map