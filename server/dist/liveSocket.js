/**
 * Going live, over sockets.
 *
 * WHY THIS IS A FILE AND NOT A BLOCK IN socket.ts
 * ───────────────────────────────────────────────
 * It used to be a block in socket.ts, and the socket tests re-implemented these
 * handlers standalone because importing socket.ts drags in every game in the
 * app. Which meant the tests exercised a hand-written copy of the code, agreed
 * with it, and passed — while the real handler was missing the one line that
 * put the host into their own broadcast room. The host saw `👁 0` and an empty
 * chat through a full green suite.
 *
 * So the handlers live here, socket.ts calls `registerLiveHandlers`, and the
 * tests call the same function. A test can now fail for the reason a user is
 * complaining about.
 *
 * WHAT THIS OWNS
 * ──────────────
 * Not the media — LiveKit has that, and a broadcast is a LiveKit room with one
 * publisher. This owns the room membership, the counts, the chat relay and the
 * announcements: everything LiveKit does not know about.
 */
import { startLive, endLive, beat as liveBeat, joinLive, leaveLive, addHearts, getSession, listLive, liveMap, myLive, roomFor, viewersOf, } from './services/liveService.js';
import { getPlayer, findSocketByProfile } from './services/playerService.js';
import { createNotification, getFollowerIds } from './services/communityService.js';
import { isInvisible } from './services/friendService.js';
import { sendPushToUser } from './pushService.js';
import { award } from './services/legacyService.js';
export function registerLiveHandlers(io, socket, deps) {
    const { rateOk, ok, err } = deps;
    const me = () => String(socket.data?.profileId ?? '');
    socket.on('live:start', async (data, cb) => {
        if (typeof cb !== 'function')
            return;
        try {
            const host = me();
            if (!host) {
                cb(err('Not authenticated.'));
                return;
            }
            const session = await startLive(host, {
                title: data?.title,
                visibility: data?.visibility === 'friends' ? 'friends' : 'public',
                gameContext: data?.gameContext ?? null,
            });
            /*
             * The host has to be IN their own broadcast room.
             *
             * This one line was missing, and it is the whole of the reported bug.
             * Every count, comment and heart is addressed to `roomFor(id)` — a room
             * only the viewers were ever joined to — so the host sat watching `👁 0`
             * with an empty comment overlay while a roomful of people talked to them.
             * Nothing errored: the messages went to a room they were not in.
             */
            socket.join(roomFor(session.id));
            // Everybody's avatars need to learn about this, so it goes out wide
            // rather than to a room nobody has joined yet.
            io.emit('live:started', { hostId: host, sessionId: session.id, title: session.title });
            cb(ok(session));
            notifyFollowersOfLive(io, host, session.id, session.title).catch(() => { });
        }
        catch (e) {
            cb(err(e?.message ?? 'ვერ დაიწყო'));
        }
    });
    socket.on('live:end', async (payload, cb) => {
        const ack = typeof payload === 'function' ? payload : cb;
        if (typeof ack !== 'function')
            return;
        try {
            const host = me();
            if (!host) {
                ack(err('Not authenticated.'));
                return;
            }
            const summary = await endLive(host);
            if (summary) {
                io.to(roomFor(summary.id)).emit('live:ended', { sessionId: summary.id, summary });
                io.emit('live:stopped', { hostId: host, sessionId: summary.id });
                // Nobody should still be in the room of a stream that is over — a
                // leftover membership is a heart or a comment delivered into the dark.
                io.socketsLeave(roomFor(summary.id));
                awardLiveXP(io, summary).catch(() => { });
            }
            ack(ok(summary));
        }
        catch (e) {
            ack(err(e?.message ?? 'ვერ დასრულდა'));
        }
    });
    /*
     * "Still here."
     *
     * A host whose phone dies never sends an end, and without this their avatar
     * would wear a LIVE ring until somebody noticed. `false` back means the
     * session is gone and the client should stop showing a broadcast screen for a
     * stream that no longer exists.
     */
    socket.on('live:beat', async (payload, cb) => {
        const ack = typeof payload === 'function' ? payload : cb;
        if (typeof ack !== 'function')
            return;
        try {
            const host = me();
            const sessionId = host ? await liveBeat(host) : null;
            /*
             * The beat doubles as the host's re-join.
             *
             * A phone that switches from wifi to mobile data reconnects with a brand
             * new socket, and a new socket is in no rooms — so a host who moved
             * networks mid-broadcast would go permanently deaf to their own chat with
             * nothing on screen to suggest why. Joining a room you are already in is a
             * no-op, so this costs nothing every fifteen seconds and repairs the one
             * case that matters.
             */
            if (sessionId)
                socket.join(roomFor(sessionId));
            ack(ok(sessionId != null));
        }
        catch {
            ack(ok(false));
        }
    });
    socket.on('live:join', async (data, cb) => {
        if (typeof cb !== 'function')
            return;
        try {
            const viewer = me();
            if (!viewer) {
                cb(err('Not authenticated.'));
                return;
            }
            const sessionId = String(data?.sessionId ?? '');
            const session = await joinLive(sessionId, viewer);
            if (!session) {
                cb(err('ეთერი დასრულებულია'));
                return;
            }
            socket.join(roomFor(sessionId));
            const who = await getPlayer(viewer);
            // Everyone in the room, the host included, sees the count move and the
            // "somebody joined" toast.
            io.to(roomFor(sessionId)).emit('live:viewers', {
                sessionId, viewers: session.viewers,
                joined: {
                    userId: viewer, name: who?.username ?? '',
                    avatar: who?.avatar ?? '', avatarUrl: who?.avatarUrl ?? null,
                },
            });
            cb(ok(session));
        }
        catch (e) {
            cb(err(e?.message ?? 'ვერ შეუერთდა'));
        }
    });
    socket.on('live:leave', async (data, cb) => {
        try {
            const viewer = me();
            const sessionId = String(data?.sessionId ?? '');
            if (!viewer || !sessionId) {
                if (typeof cb === 'function')
                    cb(ok(null));
                return;
            }
            const viewers = await leaveLive(sessionId, viewer);
            socket.leave(roomFor(sessionId));
            io.to(roomFor(sessionId)).emit('live:viewers', { sessionId, viewers, left: { userId: viewer } });
            if (typeof cb === 'function')
                cb(ok(null));
        }
        catch {
            if (typeof cb === 'function')
                cb(ok(null));
        }
    });
    /** Who is in the room — the list behind the count the host is watching. */
    socket.on('live:viewer_list', async (data, cb) => {
        if (typeof cb !== 'function')
            return;
        try {
            cb(ok(await viewersOf(String(data?.sessionId ?? ''))));
        }
        catch (e) {
            cb(err(e?.message ?? 'Failed.'));
        }
    });
    /*
     * Hearts.
     *
     * Broadcast, and counted in aggregate — never stored one by one. At a few taps
     * a second per viewer the individual reactions are worth nothing an hour later
     * and a great deal of write traffic now.
     */
    socket.on('live:heart', async (data) => {
        try {
            const from = me();
            const sessionId = String(data?.sessionId ?? '');
            if (!from || !sessionId)
                return;
            if (!rateOk(`heart_${socket.id}`, 12))
                return;
            const hearts = await addHearts(sessionId, 1);
            /*
             * To the whole room, sender included, carrying the running total.
             *
             * `socket.to()` excludes the sender, which was right when the payload was
             * only "somebody tapped" — the tapper draws their own heart instantly and
             * does not want it twice. But the total has to reach them too, so this
             * goes to everyone and each client skips the burst for its own id. The
             * count is worth having: flying hearts are unreadable as a quantity, and
             * twenty of them look like two hundred.
             */
            io.to(roomFor(sessionId)).emit('live:hearted', { sessionId, userId: from, hearts });
        }
        catch { /* a dropped heart is not worth an error */ }
    });
    /*
     * A comment during a broadcast.
     *
     * Relayed and never stored. A live chat is the moment it happens in — a
     * transcript nobody can scroll back through is not worth the writes, and the
     * overlay only ever shows the last handful anyway.
     */
    socket.on('live:comment', async (data) => {
        try {
            const from = me();
            const sessionId = String(data?.sessionId ?? '');
            const text = String(data?.text ?? '').trim().slice(0, 200);
            if (!from || !sessionId || !text)
                return;
            if (!rateOk(`livechat_${socket.id}`, 10))
                return;
            const who = await getPlayer(from);
            io.to(roomFor(sessionId)).emit('live:comment', {
                sessionId, userId: from, name: who?.username ?? '',
                avatar: who?.avatar ?? '', avatarUrl: who?.avatarUrl ?? null,
                text, at: Date.now(),
            });
        }
        catch { /* a dropped comment is not worth an error */ }
    });
    socket.on('live:list', async (payload, cb) => {
        const ack = typeof payload === 'function' ? payload : cb;
        if (typeof ack !== 'function')
            return;
        try {
            ack(ok(await listLive(50)));
        }
        catch (e) {
            ack(err(e?.message ?? 'Failed.'));
        }
    });
    socket.on('live:session', async (data, cb) => {
        if (typeof cb !== 'function')
            return;
        try {
            cb(ok(await getSession(String(data?.sessionId ?? ''))));
        }
        catch (e) {
            cb(err(e?.message ?? 'Failed.'));
        }
    });
    socket.on('live:mine', async (payload, cb) => {
        const ack = typeof payload === 'function' ? payload : cb;
        if (typeof ack !== 'function')
            return;
        try {
            const host = me();
            const mine = host ? await myLive(host) : null;
            // Resuming a broadcast from another device asks this first, and the answer
            // is useless without the room that carries the chat.
            if (mine)
                socket.join(roomFor(mine.id));
            ack(ok(mine));
        }
        catch (e) {
            ack(err(e?.message ?? 'Failed.'));
        }
    });
    /** Which of these people are live — one question for a screenful of avatars. */
    socket.on('live:who', async (data, cb) => {
        if (typeof cb !== 'function')
            return;
        try {
            const ids = Array.isArray(data?.userIds) ? data.userIds.map(String) : [];
            cb(ok(await liveMap(ids)));
        }
        catch (e) {
            cb(err(e?.message ?? 'Failed.'));
        }
    });
}
/*
 * ── Going live, told to the people who asked to hear it ──────────────────────
 *
 * A broadcast nobody is watching is the failure mode of every live feature, and
 * the only thing that fixes it is telling people while it is still on. The strip
 * in the feed catches whoever happens to open the app; this reaches the
 * followers who are not looking.
 *
 * Followers, not friends, and only the ones who chose to follow: they asked for
 * exactly this. A cap, because a host with ten thousand followers must not turn
 * one tap into ten thousand pushes. And a per-host cooldown, because the usual
 * way to start twice inside a minute is an app that was killed and reopened —
 * nobody should be told about that twice.
 */
const LIVE_NOTIFY_CAP = 400;
const LIVE_NOTIFY_COOLDOWN = 10 * 60000;
const _liveNotifiedAt = new Map();
/** Tests only: the cooldown is module state and a second test is not a repeat. */
export function _resetLiveNotifyCooldown() { _liveNotifiedAt.clear(); }
async function notifyFollowersOfLive(io, hostId, sessionId, title) {
    try {
        if (isInvisible(hostId))
            return;
        const now = Date.now();
        if (now - (_liveNotifiedAt.get(hostId) ?? 0) < LIVE_NOTIFY_COOLDOWN)
            return;
        _liveNotifiedAt.set(hostId, now);
        const host = await getPlayer(hostId);
        const name = host?.username ?? '';
        const headline = '🔴 პირდაპირი ეთერი';
        const body = title ? `${name}: ${title}` : `${name} ახლა ეთერშია`;
        for (const fid of (await getFollowerIds(hostId)).slice(0, LIVE_NOTIFY_CAP)) {
            const notif = await createNotification(fid, 'live', headline, body, null, {
                actorId: hostId, actorAvatarUrl: host?.avatarUrl ?? null,
            }).catch(() => null);
            const sock = findSocketByProfile(io, fid);
            if (sock) {
                if (notif)
                    sock.emit('community:notification', notif);
                // The strip is already showing them by the time this lands; the toast is
                // what makes it worth tapping.
                sock.emit('live:invite', { hostId, sessionId, title, hostName: name });
            }
            else {
                sendPushToUser(fid, { title: headline, body }).catch(() => { });
            }
        }
    }
    catch { /* best-effort — a missed announcement is not a failed broadcast */ }
}
/*
 * XP for the broadcast that just ended.
 *
 * `live` has sat in the Legacy `SOURCES` registry since it was written with no
 * caller, which is the same as not being there at all.
 *
 * Paid on the summary rather than on "start", for the obvious reason: otherwise
 * the way to farm it is to start and stop a stream in a loop. Minutes on air,
 * capped, plus a little for people actually turning up — so a camera pointed at
 * a ceiling all afternoon earns roughly what a real half hour with an audience
 * does, and no more. `ref` is the session id, so however many ways an end
 * arrives — the button, the socket closing, the reaper — it is paid once.
 */
export async function awardLiveXP(io, summary) {
    const minutes = Math.floor(((summary.endedAt ?? Date.now()) - summary.startedAt) / 60000);
    if (minutes < 1)
        return; // a stream nobody could have watched
    const forTime = Math.min(minutes, 60) * 2;
    const forAudience = Math.min(summary.totalViewers, 50) * 3;
    const res = await award({
        userId: summary.hostId,
        source: 'live',
        amount: forTime + forAudience,
        reason: `${minutes}წთ · ${summary.totalViewers} მაყურებელი`,
        ref: summary.id,
    });
    if (res.awarded && res.leveledUp) {
        findSocketByProfile(io, summary.hostId)?.emit('legacy:level_up', { level: res.newLevel });
    }
}
//# sourceMappingURL=liveSocket.js.map