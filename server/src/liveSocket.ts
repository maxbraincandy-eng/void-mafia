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

import type { Server, Socket } from 'socket.io';
import {
  startLive, endLive, beat as liveBeat, joinLive, leaveLive,
  addHearts, getSession, listLive, liveMap, myLive, roomFor, viewersOf,
  sendLiveGift, topGifters,
  type LiveSession,
} from './services/liveService.js';
import { getPlayer, findSocketByProfile } from './services/playerService.js';
import { createNotification, getFollowerIds } from './services/communityService.js';
import { isInvisible } from './services/friendService.js';
import { sendPushToUser } from './pushService.js';
import { award } from './services/legacyService.js';

/** Anything with `.emit`, `.to` and `.socketsLeave` — the real io, or a test's. */
type AnyServer = Pick<Server, 'emit' | 'to' | 'socketsLeave'>;
type AnySocket = Pick<Socket, 'join' | 'leave' | 'on' | 'emit' | 'id'> & { data: any };

export interface LiveHandlerDeps {
  /** socket.ts's per-socket-per-second counter. Tests pass one that always allows. */
  rateOk: (key: string, limit?: number) => boolean;
  ok: (data: unknown) => unknown;
  err: (message: string) => unknown;
}

export function registerLiveHandlers(io: AnyServer, socket: AnySocket, deps: LiveHandlerDeps): void {
  const { rateOk, ok, err } = deps;
  const me = () => String(socket.data?.profileId ?? '');

  socket.on('live:start' as any, async (data: any, cb: any) => {
    if (typeof cb !== 'function') return;
    try {
      const host = me();
      if (!host) { cb(err('Not authenticated.')); return; }
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
      io.emit('live:started' as any, { hostId: host, sessionId: session.id, title: session.title });
      cb(ok(session));
      notifyFollowersOfLive(io, host, session.id, session.title).catch(() => {});
    } catch (e: any) { cb(err(e?.message ?? 'ვერ დაიწყო')); }
  });

  socket.on('live:end' as any, async (payload: any, cb: any) => {
    const ack = typeof payload === 'function' ? payload : cb;
    if (typeof ack !== 'function') return;
    try {
      const host = me();
      if (!host) { ack(err('Not authenticated.')); return; }
      const summary = await endLive(host);
      if (summary) {
        io.to(roomFor(summary.id)).emit('live:ended' as any, { sessionId: summary.id, summary });
        io.emit('live:stopped' as any, { hostId: host, sessionId: summary.id });
        // Nobody should still be in the room of a stream that is over — a
        // leftover membership is a heart or a comment delivered into the dark.
        io.socketsLeave(roomFor(summary.id));
        awardLiveXP(io, summary).catch(() => {});
        /*
         * `endLive` already paid the gifts out — it happens inside `endSession`
         * so that the reaper pays a host whose battery died too. What is left
         * is telling this socket its balance changed, because a coin counter
         * that is stale about money is worse than one that is missing.
         */
        notifyGiftPayout(socket, host, summary).catch(() => {});
      }
      ack(ok(summary));
    } catch (e: any) { ack(err(e?.message ?? 'ვერ დასრულდა')); }
  });

  /*
   * "Still here."
   *
   * A host whose phone dies never sends an end, and without this their avatar
   * would wear a LIVE ring until somebody noticed. `false` back means the
   * session is gone and the client should stop showing a broadcast screen for a
   * stream that no longer exists.
   */
  socket.on('live:beat' as any, async (payload: any, cb: any) => {
    const ack = typeof payload === 'function' ? payload : cb;
    if (typeof ack !== 'function') return;
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
      if (sessionId) socket.join(roomFor(sessionId));
      ack(ok(sessionId != null));
    } catch { ack(ok(false)); }
  });

  socket.on('live:join' as any, async (data: any, cb: any) => {
    if (typeof cb !== 'function') return;
    try {
      const viewer = me();
      if (!viewer) { cb(err('Not authenticated.')); return; }
      const sessionId = String(data?.sessionId ?? '');
      const session = await joinLive(sessionId, viewer);
      if (!session) { cb(err('ეთერი დასრულებულია')); return; }
      socket.join(roomFor(sessionId));
      const who = await getPlayer(viewer);
      // Everyone in the room, the host included, sees the count move and the
      // "somebody joined" toast.
      io.to(roomFor(sessionId)).emit('live:viewers' as any, {
        sessionId, viewers: session.viewers,
        joined: {
          userId: viewer, name: who?.username ?? '',
          avatar: who?.avatar ?? '', avatarUrl: who?.avatarUrl ?? null,
        },
      });
      cb(ok(session));
    } catch (e: any) { cb(err(e?.message ?? 'ვერ შეუერთდა')); }
  });

  socket.on('live:leave' as any, async (data: any, cb: any) => {
    try {
      const viewer = me();
      const sessionId = String(data?.sessionId ?? '');
      if (!viewer || !sessionId) { if (typeof cb === 'function') cb(ok(null)); return; }
      const viewers = await leaveLive(sessionId, viewer);
      socket.leave(roomFor(sessionId));
      io.to(roomFor(sessionId)).emit('live:viewers' as any, { sessionId, viewers, left: { userId: viewer } });
      if (typeof cb === 'function') cb(ok(null));
    } catch { if (typeof cb === 'function') cb(ok(null)); }
  });

  /** Who is in the room — the list behind the count the host is watching. */
  socket.on('live:viewer_list' as any, async (data: any, cb: any) => {
    if (typeof cb !== 'function') return;
    try { cb(ok(await viewersOf(String(data?.sessionId ?? '')))); }
    catch (e: any) { cb(err(e?.message ?? 'Failed.')); }
  });

  /*
   * ── Gifts ─────────────────────────────────────────────────────────────
   *
   * The one thing on this screen that moves real money, so it is the one thing
   * that is not fire-and-forget. Hearts and comments are dropped silently when
   * they fail, because a lost heart costs nobody anything. A gift that failed
   * has to say why: the two things that will actually go wrong are a stream
   * that just ended and a balance that just ran out, and both are answerable.
   */
  socket.on('live:gift' as any, async (data: any, cb: any) => {
    const ack = typeof cb === 'function' ? cb : null;
    try {
      const from = me();
      const sessionId = String(data?.sessionId ?? '');
      if (!from) { ack?.(err('Not authenticated.')); return; }
      /*
       * Two a second. Generous for a thumb, and the real throttle is the price
       * — you cannot spam what you have to pay for. This is here for the
       * modified client that would otherwise drain its own balance in a loop
       * and take the database with it.
       */
      if (!rateOk(`livegift_${socket.id}`, 2)) { ack?.(err('ცოტა მოითმინე')); return; }

      // The price is NOT read from `data`. It comes from the catalog, keyed on
      // the id — there is no wire format in which a client states a cost.
      const sent = await sendLiveGift(sessionId, from, String(data?.giftId ?? ''));

      io.to(roomFor(sessionId)).emit('live:gifted' as any, {
        sessionId, giftId: sent.giftId, coins: sent.coins,
        senderId: sent.senderId, senderName: sent.senderName,
        senderAvatar: sent.senderAvatar, senderAvatarUrl: sent.senderAvatarUrl,
        giftCoins: sent.giftCoins, giftCount: sent.giftCount,
      });
      // Their own balance moved, and a number on screen that is wrong about
      // money is worse than one that is missing.
      socket.emit('coins:updated' as any, { coins: sent.senderBalance });
      ack?.(ok({ balance: sent.senderBalance }));
    } catch (e: any) { ack?.(err(e?.message ?? 'ვერ გაიგზავნა')); }
  });

  /** Who sent the most this broadcast — for the host, and for the summary. */
  socket.on('live:gifters' as any, async (data: any, cb: any) => {
    if (typeof cb !== 'function') return;
    try { cb(ok(await topGifters(String(data?.sessionId ?? '')))); }
    catch (e: any) { cb(err(e?.message ?? 'Failed.')); }
  });

  /*
   * Hearts.
   *
   * Broadcast, and counted in aggregate — never stored one by one. At a few taps
   * a second per viewer the individual reactions are worth nothing an hour later
   * and a great deal of write traffic now.
   */
  socket.on('live:heart' as any, async (data: any) => {
    try {
      const from = me();
      const sessionId = String(data?.sessionId ?? '');
      if (!from || !sessionId) return;
      if (!rateOk(`heart_${socket.id}`, 12)) return;
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
      io.to(roomFor(sessionId)).emit('live:hearted' as any, { sessionId, userId: from, hearts });
    } catch { /* a dropped heart is not worth an error */ }
  });

  /*
   * A comment during a broadcast.
   *
   * Relayed and never stored. A live chat is the moment it happens in — a
   * transcript nobody can scroll back through is not worth the writes, and the
   * overlay only ever shows the last handful anyway.
   */
  socket.on('live:comment' as any, async (data: any) => {
    try {
      const from = me();
      const sessionId = String(data?.sessionId ?? '');
      const text = String(data?.text ?? '').trim().slice(0, 200);
      if (!from || !sessionId || !text) return;
      if (!rateOk(`livechat_${socket.id}`, 10)) return;
      const who = await getPlayer(from);
      io.to(roomFor(sessionId)).emit('live:comment' as any, {
        sessionId, userId: from, name: who?.username ?? '',
        avatar: who?.avatar ?? '', avatarUrl: who?.avatarUrl ?? null,
        text, at: Date.now(),
      });
    } catch { /* a dropped comment is not worth an error */ }
  });

  socket.on('live:list' as any, async (payload: any, cb: any) => {
    const ack = typeof payload === 'function' ? payload : cb;
    if (typeof ack !== 'function') return;
    try { ack(ok(await listLive(50))); } catch (e: any) { ack(err(e?.message ?? 'Failed.')); }
  });

  socket.on('live:session' as any, async (data: any, cb: any) => {
    if (typeof cb !== 'function') return;
    try { cb(ok(await getSession(String(data?.sessionId ?? '')))); }
    catch (e: any) { cb(err(e?.message ?? 'Failed.')); }
  });

  socket.on('live:mine' as any, async (payload: any, cb: any) => {
    const ack = typeof payload === 'function' ? payload : cb;
    if (typeof ack !== 'function') return;
    try {
      const host = me();
      const mine = host ? await myLive(host) : null;
      // Resuming a broadcast from another device asks this first, and the answer
      // is useless without the room that carries the chat.
      if (mine) socket.join(roomFor(mine.id));
      ack(ok(mine));
    } catch (e: any) { ack(err(e?.message ?? 'Failed.')); }
  });

  /** Which of these people are live — one question for a screenful of avatars. */
  socket.on('live:who' as any, async (data: any, cb: any) => {
    if (typeof cb !== 'function') return;
    try {
      const ids = Array.isArray(data?.userIds) ? data.userIds.map(String) : [];
      cb(ok(await liveMap(ids)));
    } catch (e: any) { cb(err(e?.message ?? 'Failed.')); }
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
const LIVE_NOTIFY_COOLDOWN = 10 * 60_000;
const _liveNotifiedAt = new Map<string, number>();

/** Tests only: the cooldown is module state and a second test is not a repeat. */
export function _resetLiveNotifyCooldown(): void { _liveNotifiedAt.clear(); }

async function notifyFollowersOfLive(
  io: AnyServer, hostId: string, sessionId: string, title: string,
): Promise<void> {
  try {
    if (isInvisible(hostId)) return;
    const now = Date.now();
    if (now - (_liveNotifiedAt.get(hostId) ?? 0) < LIVE_NOTIFY_COOLDOWN) return;
    _liveNotifiedAt.set(hostId, now);

    const host = await getPlayer(hostId);
    const name = host?.username ?? '';
    const headline = '🔴 პირდაპირი ეთერი';
    const body = title ? `${name}: ${title}` : `${name} ახლა ეთერშია`;

    for (const fid of (await getFollowerIds(hostId)).slice(0, LIVE_NOTIFY_CAP)) {
      const notif = await createNotification(fid, 'live', headline, body, null, {
        actorId: hostId, actorAvatarUrl: host?.avatarUrl ?? null,
      }).catch(() => null);
      const sock = findSocketByProfile(io as any, fid);
      if (sock) {
        if (notif) sock.emit('community:notification', notif);
        // The strip is already showing them by the time this lands; the toast is
        // what makes it worth tapping.
        sock.emit('live:invite' as any, { hostId, sessionId, title, hostName: name });
      } else {
        sendPushToUser(fid, { title: headline, body }).catch(() => {});
      }
    }
  } catch { /* best-effort — a missed announcement is not a failed broadcast */ }
}

/**
 * The host's balance, after the gifts landed.
 *
 * The payout itself is in `endSession`, where every ending path goes through
 * it. This is only the telling — and it reads the balance rather than adding
 * the payout to a cached one, because between the two the host may have spent
 * something, and arithmetic on a stale number is how a balance drifts.
 */
async function notifyGiftPayout(socket: AnySocket, hostId: string, summary: LiveSession): Promise<void> {
  if (summary.giftCoins <= 0) return;
  const { getCoins } = await import('./services/coinService.js');
  socket.emit('coins:updated' as any, { coins: await getCoins(hostId) });
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
export async function awardLiveXP(io: AnyServer, summary: LiveSession): Promise<void> {
  const minutes = Math.floor(((summary.endedAt ?? Date.now()) - summary.startedAt) / 60_000);
  if (minutes < 1) return;                        // a stream nobody could have watched
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
    findSocketByProfile(io as any, summary.hostId)?.emit('legacy:level_up' as any, { level: res.newLevel });
  }
}
