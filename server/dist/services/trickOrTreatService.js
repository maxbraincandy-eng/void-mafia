/**
 * ტკბილეული თუ ხრიკი — walks, the day's allowance, and the season board.
 *
 * ONE PLAYER, ONE THING AT A TIME
 * ───────────────────────────────
 * Every action takes a transaction-scoped advisory lock on the player. A
 * double tap on "knock" is two requests that would otherwise both read the
 * same walk and both write a door; a double tap on "home" would bank the bag
 * twice; two "start"s at the daily limit would both see four walks used.
 * Under the lock they simply take turns, and the second sees what the first
 * did.
 *
 * The walk is stored whole, as JSON, after every door — so a reconnect or a
 * restart in the middle of a street picks up exactly where it was.
 */
import { randomUUID } from 'crypto';
import { sql } from '../db.js';
import { RUNS_PER_DAY, ghostChance, knock, goHome, newWalk, isSeason, seasonOf, tbilisiDate, nextMidnight, } from './trickOrTreatRules.js';
class TotError extends Error {
}
export { TotError };
const lock = (tx, userId) => tx `SELECT pg_advisory_xact_lock(hashtext(${'tot:' + userId}))`;
async function activeRow(tx, userId) {
    const [r] = await tx `
    SELECT id, state FROM tot_runs WHERE user_id = ${userId} AND status = 'walking'
    ORDER BY started_at DESC LIMIT 1
  `;
    return r ? { id: r.id, walk: JSON.parse(r.state) } : null;
}
async function save(tx, id, walk, now) {
    const done = walk.status !== 'walking';
    await tx `
    UPDATE tot_runs
       SET state = ${JSON.stringify(walk)}, status = ${walk.status}, banked = ${walk.banked},
           finished_at = ${done ? now : null}
     WHERE id = ${id}
  `;
}
export async function getState(userId, now = Date.now()) {
    const year = seasonOf(now);
    const today = tbilisiDate(now).key;
    const [[counts], active, [last]] = await Promise.all([
        sql `
      SELECT COUNT(*) FILTER (WHERE date_key = ${today}) AS today,
             COALESCE(SUM(banked), 0) AS total, COALESCE(MAX(banked), 0) AS best,
             COUNT(*) FILTER (WHERE status <> 'walking') AS walks
        FROM tot_runs WHERE user_id = ${userId} AND season = ${year}
    `,
        sql `SELECT state FROM tot_runs WHERE user_id = ${userId} AND status = 'walking' ORDER BY started_at DESC LIMIT 1`,
        sql `
      SELECT state FROM tot_runs
       WHERE user_id = ${userId} AND date_key = ${today} AND status <> 'walking'
       ORDER BY finished_at DESC LIMIT 1
    `,
    ]);
    const walk = active[0] ? JSON.parse(active[0].state) : null;
    return {
        season: { active: isSeason(now), year },
        runsPerDay: RUNS_PER_DAY,
        runsLeft: Math.max(0, RUNS_PER_DAY - Number(counts?.today ?? 0)),
        resetAt: nextMidnight(now),
        walk,
        nextGhost: walk ? (walk.peek ? (walk.peek.kind === 'ghost' ? 1 : 0) : ghostChance(walk.doors.length + 1)) : null,
        last: last ? JSON.parse(last.state) : null,
        total: Number(counts?.total ?? 0),
        best: Number(counts?.best ?? 0),
        walks: Number(counts?.walks ?? 0),
    };
}
/** Start a walk. Refused outside the season, at the daily limit, or mid-walk. */
export async function startWalk(userId, now = Date.now()) {
    if (!isSeason(now))
        throw new TotError('ჰელოუინი ახლა არ არის — შემდეგ ოქტომბერს!');
    await sql.begin(async (tx) => {
        await lock(tx, userId);
        if (await activeRow(tx, userId))
            throw new TotError('ჯერ ეს გასეირნება დაასრულე.');
        const today = tbilisiDate(now).key;
        const [{ n }] = await tx `SELECT COUNT(*) AS n FROM tot_runs WHERE user_id = ${userId} AND date_key = ${today}`;
        if (Number(n) >= RUNS_PER_DAY)
            throw new TotError('დღეისთვის ქუჩა დაიკეტა — ხვალ ისევ!');
        await tx `
      INSERT INTO tot_runs (id, user_id, season, date_key, state, status, banked, started_at)
      VALUES (${randomUUID()}, ${userId}, ${seasonOf(now)}, ${today}, ${JSON.stringify(newWalk())}, 'walking', 0, ${now})
    `;
    });
}
/** Open the next door of the walk in progress. */
export async function knockDoor(userId, now = Date.now(), rng = Math.random) {
    return sql.begin(async (tx) => {
        await lock(tx, userId);
        const row = await activeRow(tx, userId);
        if (!row)
            throw new TotError('ჯერ გასეირნება დაიწყე.');
        const { walk, door } = knock(row.walk, rng);
        await save(tx, row.id, walk, now);
        return door;
    });
}
/** Go home and bank the bag. */
export async function walkHome(userId, now = Date.now()) {
    return sql.begin(async (tx) => {
        await lock(tx, userId);
        const row = await activeRow(tx, userId);
        if (!row)
            throw new TotError('ჯერ გასეირნება დაიწყე.');
        const walk = goHome(row.walk);
        await save(tx, row.id, walk, now);
        return walk.banked;
    });
}
/**
 * The season's board: candy carried home, summed over every walk.
 *
 * Only players with an account are on it. A guest plays on a socket id that
 * is new every visit, so a guest row is a stranger nobody can find again —
 * and a fresh id per visit would also be a fresh daily allowance per visit.
 */
export async function getBoard(userId, now = Date.now(), limit = 50) {
    const year = seasonOf(now);
    const rows = await sql `
    SELECT r.user_id, p.username, p.avatar_url, SUM(r.banked) AS total, MAX(r.banked) AS best,
           MIN(r.finished_at) FILTER (WHERE r.banked > 0) AS first_at
      FROM tot_runs r JOIN players p ON p.id = r.user_id
     WHERE r.season = ${year} AND r.status = 'home'
     GROUP BY r.user_id, p.username, p.avatar_url
    HAVING SUM(r.banked) > 0
     ORDER BY total DESC, first_at ASC
  `;
    const all = rows.map((r, i) => ({
        rank: i + 1, userId: r.user_id, username: r.username ?? 'ანონიმი', avatarUrl: r.avatar_url,
        total: Number(r.total), best: Number(r.best),
    }));
    return { top: all.slice(0, limit), me: userId ? all.find(r => r.userId === userId) ?? null : null };
}
//# sourceMappingURL=trickOrTreatService.js.map