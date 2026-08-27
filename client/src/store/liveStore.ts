/**
 * Who is broadcasting, for whoever is currently on screen.
 *
 * WHY A STORE AND NOT A FETCH PER AVATAR
 * ──────────────────────────────────────
 * The LIVE ring renders on every avatar in the feed, the friend list, a lobby
 * and a search result. An avatar that asked for its own status would be twenty
 * round trips to draw one screen, and twenty more on the way back.
 *
 * So avatars ask this store, requests inside the same tick are collected and
 * sent as one, and a name already seen renders from memory. The same shape
 * `legacyStore` uses, for the same reason.
 *
 * WHY THIS ONE DOES EXPIRE
 * ────────────────────────
 * A level is stale for a few minutes and nobody is hurt. A LIVE ring is a
 * promise that tapping it opens a stream, and a stale one is the app lying.
 * Sockets carry the changes — `live:started` and `live:stopped` land within a
 * second — and the short expiry is the floor under that, for a client that was
 * backgrounded through the event.
 */

import { create } from 'zustand';
import { socket } from '@/lib/socket';

export interface LiveInfo {
  sessionId: string;
  title: string;
  viewers: number;
}

/** Long enough to be a cache, short enough that a dead ring clears itself. */
const TTL_MS = 30_000;

interface LiveState {
  /** Absent means unknown; null means known-not-live. */
  live: Record<string, LiveInfo | null>;
  fetchedAt: Record<string, number>;
  ensure: (userIds: string[]) => void;
  liveFor: (userId: string) => LiveInfo | null;
  /** Socket events push straight in, so a ring appears without a round trip. */
  setLive: (userId: string, info: LiveInfo | null) => void;

  /**
   * "Open this broadcast."
   *
   * The spec asks that tapping a live avatar go to the stream rather than the
   * profile, and avatars are twenty-one screens deep. Threading a callback down
   * all of them would be worse than the badge it is for — so the avatar asks
   * here, and whichever screen hosts the viewer answers. The same shape
   * `socialStore` already uses for opening the virtual space.
   */
  watchRequest: string | null;
  requestWatch: (sessionId: string) => void;
  clearWatchRequest: () => void;
}

let pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const inFlight = new Set<string>();

export const useLiveStore = create<LiveState>((set, get) => ({
  live: {},
  fetchedAt: {},

  ensure(userIds) {
    const { live, fetchedAt } = get();
    const now = Date.now();
    for (const id of userIds) {
      if (!id || inFlight.has(id)) continue;
      const known = id in live && now - (fetchedAt[id] ?? 0) < TTL_MS;
      if (known) continue;
      pending.add(id);
    }
    if (pending.size === 0 || flushTimer) return;

    // One frame's worth of collection: a list mounts its rows in the same tick,
    // so a screenful of avatars becomes one request with no visible delay.
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const ids = [...pending];
      pending = new Set();
      if (ids.length === 0) return;
      ids.forEach(id => inFlight.add(id));

      socket.emit('live:who' as any, { userIds: ids }, (res: any) => {
        ids.forEach(id => inFlight.delete(id));
        if (!res?.ok) return;
        const at = Date.now();
        set(s => {
          const live = { ...s.live };
          const fetchedAt = { ...s.fetchedAt };
          // Everything asked for is answered — an id missing from the reply is
          // known-not-live, which is different from never having asked.
          for (const id of ids) { live[id] = res.data?.[id] ?? null; fetchedAt[id] = at; }
          return { live, fetchedAt };
        });
      });
    }, 16);
  },

  liveFor(userId) {
    return get().live[userId] ?? null;
  },

  setLive(userId, info) {
    set(s => ({
      live: { ...s.live, [userId]: info },
      fetchedAt: { ...s.fetchedAt, [userId]: Date.now() },
    }));
  },

  watchRequest: null,
  requestWatch: sessionId => set({ watchRequest: sessionId }),
  clearWatchRequest: () => set({ watchRequest: null }),
}));

/**
 * Keep the store honest as broadcasts start and stop.
 *
 * Registered once, at module load, rather than from a component: the rings are
 * everywhere, and tying the subscription to one screen means they stop updating
 * the moment that screen unmounts.
 */
socket.on('live:started' as any, (d: any) => {
  if (d?.hostId) useLiveStore.getState().setLive(d.hostId, { sessionId: d.sessionId, title: d.title ?? '', viewers: 0 });
});
socket.on('live:stopped' as any, (d: any) => {
  if (d?.hostId) useLiveStore.getState().setLive(d.hostId, null);
});
