/**
 * Going live.
 *
 * THE INFRASTRUCTURE QUESTION IS ALREADY ANSWERED
 * ───────────────────────────────────────────────
 * The spec flags "WebRTC for the MVP, or a managed provider" as a decision
 * needing a cost discussion. It is not open: LiveKit is already integrated,
 * already carries every voice room in the app, and `/livekit/status` answers
 * `enabled: true` in production. Building a second WebRTC path beside it would
 * mean two signalling systems, two sets of TURN problems and two things to fix
 * when a phone drops off wifi — for a feature the existing one already serves.
 *
 * So a broadcast is a LiveKit room like every other, named `live_<sessionId>`,
 * with one publisher. The rooms need no new server, no new key and no new bill.
 *
 * WHAT THIS SERVICE OWNS
 * ──────────────────────
 * Not the media — LiveKit has that. This owns the part LiveKit does not: who is
 * live, what they called it, who may watch, how many are watching, what the
 * peak was, and the summary at the end.
 *
 * LIVE IS A HEARTBEAT, NOT A FLAG
 * ───────────────────────────────
 * A host whose phone dies never sends "I stopped". If live meant `ended_at IS
 * NULL` their avatar would wear a LIVE ring until somebody noticed, and tapping
 * it would open an empty room. So a session is live only while it is still
 * beating, and one that stops is reaped.
 */
import { randomBytes } from 'crypto';
import { sql } from '../db.js';
import { liveGift } from './liveGifts.js';
/** Longer than the client's beat, short enough that a dead stream clears fast. */
export const BEAT_TIMEOUT_MS = 45000;
/** What the client should aim for. Three misses inside the timeout. */
export const BEAT_INTERVAL_MS = 15000;
/** The LiveKit room a session broadcasts in. */
export function roomFor(sessionId) {
    return `live_${sessionId}`;
}
/*
 * Who is watching what, right now.
 *
 * In memory rather than in the table, because it changes on every tab close and
 * every lift dropping out of signal, and none of that is worth a write. The
 * table records that somebody watched; this counts who is watching.
 *
 * Lost on restart, which is correct: after a restart nobody is connected to
 * anything anyway, and the reaper clears the sessions behind them.
 */
const watching = new Map();
function viewerCount(sessionId) {
    return watching.get(sessionId)?.size ?? 0;
}
const clean = (s, max) => String(s ?? '').trim().slice(0, max);
function rowToSession(r) {
    return {
        id: r.id,
        hostId: r.host_id,
        hostName: r.username ?? '',
        hostAvatar: r.avatar ?? '',
        hostAvatarUrl: r.avatar_url ?? null,
        title: r.title ?? '',
        visibility: (r.visibility ?? 'public'),
        gameContext: r.game_context ?? null,
        status: (r.status ?? 'live'),
        startedAt: Number(r.started_at),
        endedAt: r.ended_at != null ? Number(r.ended_at) : null,
        viewers: viewerCount(r.id),
        peakViewers: Number(r.peak_viewers ?? 0),
        totalViewers: Number(r.total_viewers ?? 0),
        totalHearts: Number(r.total_hearts ?? 0),
        giftCoins: Number(r.gift_coins ?? 0),
        giftCount: Number(r.gift_count ?? 0),
        room: roomFor(r.id),
    };
}
const SELECT_SESSION = sql `
  SELECT s.*, p.username, p.avatar, p.avatar_url
  FROM live_sessions s LEFT JOIN players p ON p.id = s.host_id
`;
// ── Starting and stopping ─────────────────────────────────────────────────────
/**
 * Go live.
 *
 * One broadcast per person. Starting a second ends the first rather than
 * refusing: the usual way to get here twice is a host whose app was killed and
 * reopened, and telling them "you are already live" when they can see they are
 * not is worse than quietly replacing a session nobody is watching.
 */
export async function startLive(hostId, opts) {
    await endLive(hostId, { reason: 'replaced' });
    const id = `live_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
    const now = Date.now();
    await sql `
    INSERT INTO live_sessions (id, host_id, title, visibility, game_context, status, started_at, last_beat_at)
    VALUES (
      ${id}, ${hostId}, ${clean(opts.title, 120)},
      ${opts.visibility === 'friends' ? 'friends' : 'public'},
      ${opts.gameContext ? clean(opts.gameContext, 40) : null},
      'live', ${now}, ${now}
    )
  `;
    watching.set(id, new Set());
    const [row] = await sql `${SELECT_SESSION} WHERE s.id = ${id}`;
    return rowToSession(row);
}
/**
 * Stop broadcasting, and return the summary.
 *
 * Idempotent: ending an already-ended session returns what it was rather than
 * failing, because "end" arrives from the button, from the socket closing and
 * from the reaper, and any two of them can race.
 */
export async function endLive(hostId, opts = {}) {
    const [row] = await sql `
    SELECT id FROM live_sessions WHERE host_id = ${hostId} AND status = 'live' LIMIT 1
  `;
    if (!row)
        return null;
    return endSession(String(row.id), opts.reason);
}
async function endSession(sessionId, _reason) {
    const now = Date.now();
    await sql `
    UPDATE live_sessions SET status = 'ended', ended_at = ${now}
    WHERE id = ${sessionId} AND status = 'live'
  `;
    await sql `UPDATE live_viewers SET left_at = ${now} WHERE session_id = ${sessionId} AND left_at IS NULL`;
    watching.delete(sessionId);
    /*
     * The gifts become coins here, and only here.
     *
     * Every way a broadcast can end goes through this function — the button, the
     * reaper coming for a host whose battery died, starting a second stream. Put
     * the payout in the button's handler and a host who loses signal loses the
     * evening's earnings, which is the worst possible bug to have in this
     * feature and the one nobody would ever report as a bug.
     */
    await payoutGifts(sessionId);
    const [row] = await sql `${SELECT_SESSION} WHERE s.id = ${sessionId}`;
    return row ? rowToSession(row) : null;
}
/**
 * Pay the host what their viewers sent, once.
 *
 * The claim is the `gifts_paid_at IS NULL` in the WHERE clause: two ends racing
 * both run this, and exactly one of them updates a row. The other gets nothing
 * back and pays nothing out. Reading first and then writing would let both
 * through — this is the same shape as the rest of the ending logic for the same
 * reason.
 *
 * Returns what was paid, so a caller can tell the host about it.
 */
export async function payoutGifts(sessionId) {
    const rows = await sql `
    UPDATE live_sessions SET gifts_paid_at = ${Date.now()}
    WHERE id = ${sessionId} AND gifts_paid_at IS NULL AND gift_coins > 0
    RETURNING host_id, gift_coins
  `;
    if (rows.length === 0)
        return null;
    const hostId = String(rows[0].host_id);
    const coins = Number(rows[0].gift_coins);
    // Imported here rather than at the top: coinService is a heavy module and
    // this is the one path in the live service that needs it.
    const { creditLiveGifts } = await import('./coinService.js');
    await creditLiveGifts(hostId, coins, sessionId);
    return { hostId, coins };
}
/**
 * "Still here."
 *
 * Returns the session id, or null when the session is gone — which is the
 * client's signal to stop showing a broadcast screen for a stream that no
 * longer exists.
 *
 * The id is returned rather than a bare `true` because the socket layer uses
 * the beat to re-join the host to their own broadcast room. A host whose phone
 * changed networks gets a new socket, and a new socket is in no rooms — without
 * something that re-joins on a schedule, they carry on broadcasting to a room
 * they are no longer listening to, and their viewer count freezes.
 */
export async function beat(hostId) {
    const rows = await sql `
    UPDATE live_sessions SET last_beat_at = ${Date.now()}
    WHERE host_id = ${hostId} AND status = 'live'
    RETURNING id
  `;
    return rows.length > 0 ? String(rows[0].id) : null;
}
/**
 * End every session that has stopped beating.
 *
 * The one thing standing between a host whose battery died and an avatar that
 * wears a LIVE ring until somebody files a bug.
 */
export async function reapStale() {
    const cutoff = Date.now() - BEAT_TIMEOUT_MS;
    const rows = await sql `
    SELECT id FROM live_sessions WHERE status = 'live' AND last_beat_at < ${cutoff}
  `;
    for (const r of rows)
        await endSession(String(r.id), 'timeout');
    return rows.length;
}
// ── Watching ──────────────────────────────────────────────────────────────────
/**
 * Join as a viewer.
 *
 * Peak concurrency is recorded here because it can only be observed while it is
 * happening — no counter recovers it afterwards. `total_viewers` counts people,
 * not joins, so somebody whose train goes into a tunnel does not inflate it.
 */
export async function joinLive(sessionId, userId) {
    const [row] = await sql `${SELECT_SESSION} WHERE s.id = ${sessionId} AND s.status = 'live'`;
    if (!row)
        return null;
    let set = watching.get(sessionId);
    if (!set) {
        set = new Set();
        watching.set(sessionId, set);
    }
    const isNewToTheRoom = !set.has(userId);
    set.add(userId);
    if (isNewToTheRoom) {
        const seen = await sql `
      SELECT 1 FROM live_viewers WHERE session_id = ${sessionId} AND user_id = ${userId} LIMIT 1
    `;
        await sql `
      INSERT INTO live_viewers (session_id, user_id, joined_at) VALUES (${sessionId}, ${userId}, ${Date.now()})
      ON CONFLICT DO NOTHING
    `;
        if (seen.length === 0) {
            await sql `UPDATE live_sessions SET total_viewers = total_viewers + 1 WHERE id = ${sessionId}`;
        }
    }
    await sql `
    UPDATE live_sessions SET peak_viewers = GREATEST(peak_viewers, ${set.size}) WHERE id = ${sessionId}
  `;
    const [fresh] = await sql `${SELECT_SESSION} WHERE s.id = ${sessionId}`;
    return rowToSession(fresh);
}
export async function leaveLive(sessionId, userId) {
    watching.get(sessionId)?.delete(userId);
    await sql `
    UPDATE live_viewers SET left_at = ${Date.now()}
    WHERE session_id = ${sessionId} AND user_id = ${userId} AND left_at IS NULL
  `;
    return viewerCount(sessionId);
}
/**
 * Somebody left the app entirely — drop them from whatever they were watching.
 *
 * The remaining count comes back with each session because the caller has to
 * broadcast it, and it has no other way to know. The first version returned
 * only the ids and the socket layer then announced `viewers: 0` for each — so
 * one person of thirty closing a tab emptied the room on everybody's screen.
 */
export function forgetViewer(userId) {
    const touched = [];
    for (const [sessionId, set] of watching) {
        if (set.delete(userId))
            touched.push({ sessionId, viewers: set.size });
    }
    return touched;
}
/**
 * Who is in the room right now, with enough to draw them.
 *
 * The count alone answers "is anyone there"; a host talking to a camera wants
 * the other half of that — which is why every product that ships a count also
 * ships the list behind it.
 */
export async function viewersOf(sessionId) {
    const ids = [...(watching.get(sessionId) ?? [])];
    if (ids.length === 0)
        return [];
    const rows = await sql `
    SELECT id, username, avatar, avatar_url FROM players WHERE id = ANY(${ids})
  `;
    return rows.map(r => ({
        userId: String(r.id),
        name: r.username ?? '',
        avatar: r.avatar ?? '',
        avatarUrl: r.avatar_url ?? null,
    }));
}
/**
 * A heart.
 *
 * Counted, not stored. At a few taps a second per viewer the individual
 * reactions are worth nothing an hour later and a great deal of write traffic
 * now — the burst is the point, and the burst is broadcast, not persisted.
 *
 * The running total comes back so it can ride along on the broadcast. A host
 * only ever saw hearts as animations flying past, which is unreadable as a
 * quantity: two hundred hearts and twenty look the same at a glance.
 */
export async function addHearts(sessionId, n = 1) {
    const count = Math.max(1, Math.min(20, Math.floor(n)));
    const rows = await sql `
    UPDATE live_sessions SET total_hearts = total_hearts + ${count}
    WHERE id = ${sessionId} AND status = 'live'
    RETURNING total_hearts
  `;
    return rows.length > 0 ? Number(rows[0].total_hearts) : 0;
}
/**
 * Send a gift to whoever is broadcasting.
 *
 * THE SENDER PAYS NOW
 * ───────────────────
 * Not at the end, not on a tab. Deferring the charge means somebody can send
 * two hundred coins of gifts with a balance of three, and the only place to
 * discover that is a reconciliation nobody wrote.
 *
 * THE PRICE IS NOT AN ARGUMENT
 * ────────────────────────────
 * It comes from the catalog, keyed on the id the client sent. There is no
 * signature to forge because there is nothing to forge: a modified client can
 * ask for a crown, and asking for a crown costs what a crown costs.
 *
 * Everything that can go wrong throws with something a person can read, because
 * every one of these is a thing a real viewer will hit: a stream that just
 * ended, and a balance that just ran out.
 */
export async function sendLiveGift(sessionId, senderId, giftId) {
    const gift = liveGift(giftId);
    if (!gift)
        throw new Error('ასეთი საჩუქარი არ არსებობს');
    const [session] = await sql `
    SELECT id, host_id FROM live_sessions WHERE id = ${sessionId} AND status = 'live'
  `;
    if (!session)
        throw new Error('ეთერი დასრულებულია');
    const hostId = String(session.host_id);
    /*
     * You cannot gift your own stream.
     *
     * It nets to zero coins, so it is not an exploit in the money — but it is a
     * free way to sit at the top of your own gift list, and a leaderboard anyone
     * can climb by paying themselves is not a leaderboard.
     */
    if (hostId === senderId)
        throw new Error('საკუთარ ეთერს ვერ გაუგზავნი');
    const { spendOnLiveGift } = await import('./coinService.js');
    const { balance, sender } = await spendOnLiveGift(senderId, hostId, gift, sessionId);
    const id = `lg_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
    await sql `
    INSERT INTO live_gifts (id, session_id, host_id, sender_id, gift_id, coins, created_at)
    VALUES (${id}, ${sessionId}, ${hostId}, ${senderId}, ${gift.id}, ${gift.price}, ${Date.now()})
  `;
    const [totals] = await sql `
    UPDATE live_sessions
    SET gift_coins = gift_coins + ${gift.price}, gift_count = gift_count + 1
    WHERE id = ${sessionId}
    RETURNING gift_coins, gift_count
  `;
    return {
        id, sessionId, giftId: gift.id, coins: gift.price,
        senderId, senderName: sender.name, senderAvatar: sender.avatar, senderAvatarUrl: sender.avatarUrl,
        giftCoins: Number(totals?.gift_coins ?? gift.price),
        giftCount: Number(totals?.gift_count ?? 1),
        senderBalance: balance,
    };
}
/**
 * Who sent the most, this broadcast.
 *
 * By coins rather than by count, because that is what the host is actually
 * being asked to notice — ten white roses and one crown are the same number of
 * taps and not the same gesture.
 */
export async function topGifters(sessionId, limit = 20) {
    const rows = await sql `
    SELECT g.sender_id, SUM(g.coins)::int AS coins, COUNT(*)::int AS gifts,
           p.username, p.avatar, p.avatar_url
    FROM live_gifts g LEFT JOIN players p ON p.id = g.sender_id
    WHERE g.session_id = ${sessionId}
    GROUP BY g.sender_id, p.username, p.avatar, p.avatar_url
    ORDER BY coins DESC, gifts DESC
    LIMIT ${Math.min(50, limit)}
  `;
    return rows.map(r => ({
        userId: String(r.sender_id),
        name: r.username ?? '',
        avatar: r.avatar ?? '',
        avatarUrl: r.avatar_url ?? null,
        coins: Number(r.coins),
        gifts: Number(r.gifts),
    }));
}
// ── Reading ───────────────────────────────────────────────────────────────────
export async function getSession(sessionId) {
    const [row] = await sql `${SELECT_SESSION} WHERE s.id = ${sessionId}`;
    return row ? rowToSession(row) : null;
}
/** Everybody broadcasting right now, newest first. */
export async function listLive(limit = 50) {
    const rows = await sql `
    ${SELECT_SESSION} WHERE s.status = 'live' ORDER BY s.started_at DESC LIMIT ${Math.min(100, limit)}
  `;
    return rows.map(rowToSession);
}
/**
 * Which of these people are live, in one question.
 *
 * The badge renders beside every name in the feed, the friend list and every
 * lobby. Asking per avatar is how a list becomes slow, so the client batches
 * and this answers the batch.
 */
export async function liveMap(userIds) {
    const ids = [...new Set(userIds.filter(Boolean))].slice(0, 200);
    if (ids.length === 0)
        return {};
    const rows = await sql `
    SELECT id, host_id, title FROM live_sessions
    WHERE status = 'live' AND host_id = ANY(${ids})
  `;
    const out = {};
    for (const r of rows) {
        out[String(r.host_id)] = { sessionId: r.id, title: r.title ?? '', viewers: viewerCount(String(r.id)) };
    }
    return out;
}
/** The host's own live session, if they have one. */
export async function myLive(hostId) {
    const [row] = await sql `${SELECT_SESSION} WHERE s.host_id = ${hostId} AND s.status = 'live'`;
    return row ? rowToSession(row) : null;
}
//# sourceMappingURL=liveService.js.map