import { create } from 'zustand';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';

/**
 * App-wide "is this player verified" lookup.
 *
 * Verification belongs to the game's owners — a tiny, near-static set — so the
 * whole list is fetched ONCE per session and every question after that is
 * answered from a Set in memory. A per-name batch lookup (the pattern
 * nameColorStore uses, because colours really are per-player) would run a query
 * every time a feed page renders to answer something that changes about once a
 * year.
 */
interface VerifiedState {
  ids: Set<string>;
  loaded: boolean;
  ensure: () => void;
}

let inFlight = false;

export const useVerifiedStore = create<VerifiedState>((set, get) => ({
  ids: new Set(),
  loaded: false,

  ensure: () => {
    if (get().loaded || inFlight) return;
    inFlight = true;
    emitWithAck<undefined, Res<string[]>>('players:verified_list')
      .then(res => {
        set({ ids: new Set(res.ok ? res.data : []), loaded: true });
      })
      .catch(() => {
        // Mark loaded on failure too: a missing badge is a far smaller problem
        // than retrying forever behind every name on the screen.
        set({ loaded: true });
      })
      .finally(() => { inFlight = false; });
  },
}));

/** True when this profile carries the verification badge. */
export function useIsVerified(profileId?: string | null): boolean {
  const ids = useVerifiedStore(s => s.ids);
  const loaded = useVerifiedStore(s => s.loaded);
  const ensure = useVerifiedStore(s => s.ensure);
  // Kicked off during render on purpose: the store guards against duplicate
  // requests, and an effect here would delay the badge by a frame on every
  // name in a freshly-loaded feed.
  if (!loaded) ensure();
  return !!profileId && ids.has(profileId);
}
