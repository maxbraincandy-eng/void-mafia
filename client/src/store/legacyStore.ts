/**
 * Legacy levels for whoever is currently on screen.
 *
 * WHY A STORE AND NOT A FETCH PER BADGE
 * ─────────────────────────────────────
 * The badge renders beside every name in a lobby, every poster in the feed and
 * every line in a chat. A component that fetched its own level would be twenty
 * round trips to draw one screen, and twenty more when you scrolled back.
 *
 * So badges ask this store instead. Requests inside the same tick are collected
 * and sent as one, answers are kept for the session, and a name that has
 * already been seen renders from memory with no request at all.
 *
 * WHY THE CACHE DOES NOT EXPIRE
 * ─────────────────────────────
 * A level changes when somebody finishes a game, and the screen showing their
 * old level is a lobby they are not in. Being one level stale for a few minutes
 * costs nothing; re-fetching every badge on a timer to fix it costs a request
 * per name per interval, forever. It is refreshed on the surfaces that matter —
 * a profile always fetches its own character fresh.
 */

import { create } from 'zustand';
import { socket } from '@/lib/socket';
import type { AuraTier, LegacyBadgeMap } from '@/types/legacy';

interface LegacyState {
  badges: LegacyBadgeMap;
  /** Ask for these ids; already-known ones cost nothing. */
  ensure: (userIds: string[]) => void;
  badgeFor: (userId: string) => { level: number; aura: AuraTier | null } | null;
}

/**
 * Ids waiting to go out, and the timer that will send them.
 *
 * Module-level rather than in the store because they are plumbing, not state:
 * nothing renders from them, and putting them in the store would make every
 * component re-render each time a request is queued.
 */
let pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Asked for and not yet answered — so a slow reply is not asked for twice. */
const inFlight = new Set<string>();

export const useLegacyStore = create<LegacyState>((set, get) => ({
  badges: {},

  ensure(userIds) {
    const known = get().badges;
    for (const id of userIds) {
      if (!id || known[id] || inFlight.has(id)) continue;
      pending.add(id);
    }
    if (pending.size === 0 || flushTimer) return;

    // One frame's worth of collection. A list mounts its rows in the same tick,
    // so this turns a screenful of badges into a single request without adding
    // a delay anybody can see.
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const ids = [...pending];
      pending = new Set();
      if (ids.length === 0) return;
      ids.forEach(id => inFlight.add(id));

      socket.emit('legacy:badges' as any, { userIds: ids }, (res: any) => {
        ids.forEach(id => inFlight.delete(id));
        if (!res?.ok || !res.data) return;
        set(s => ({ badges: { ...s.badges, ...res.data } }));
      });
    }, 16);
  },

  badgeFor(userId) {
    return get().badges[userId] ?? null;
  },
}));
