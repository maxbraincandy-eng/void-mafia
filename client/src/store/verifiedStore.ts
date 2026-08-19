import { create } from 'zustand';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';

/**
 * App-wide "is this player verified, and at which tier" lookup.
 *
 * Two tiers, because they mean different things and must not be one flag:
 *   owner — derived from the account's role. Gold. Not grantable.
 *   vip   — granted by an owner (and later, purchasable). Blue.
 *
 * The whole map is fetched ONCE per session and every question after that is
 * answered from memory. A per-name batch lookup would run a query each time a
 * feed page renders, to answer something that changes a handful of times a year.
 */
export type VerifiedTier = 'owner' | 'vip';

interface VerifiedState {
  tiers: Record<string, VerifiedTier>;
  loaded: boolean;
  ensure: () => void;
  /** Apply a change locally so an owner sees their grant immediately. */
  setLocal: (profileId: string, tier: VerifiedTier | null) => void;
  /** Force a refetch — used after granting, so other tabs converge. */
  refresh: () => void;
}

let inFlight = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;

/**
 * A failure is not an answer.
 *
 * This used to set `loaded: true` on failure, reasoning that a missing badge
 * beats retrying forever behind every name on screen. But the request that
 * fails is almost always the FIRST one — fired while the socket is still
 * connecting — and marking it loaded meant every badge in the app stayed
 * missing for the rest of the session, with nothing to trigger another try.
 * Backing off is the middle ground the original was reaching for: bounded
 * attempts, never a request per render.
 */
function scheduleRetry(set: (p: Partial<VerifiedState>) => void) {
  if (attempt >= 6) { set({ loaded: true }); return; }   // truly give up, eventually
  const delay = Math.min(30_000, 1000 * 2 ** attempt);
  attempt++;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => { retryTimer = null; fetchMap(set); }, delay);
}

function fetchMap(set: (p: Partial<VerifiedState>) => void) {
  if (inFlight || retryTimer) return;
  inFlight = true;
  emitWithAck<undefined, Res<Record<string, VerifiedTier>>>('players:verified_list')
    .then(res => {
      if (res.ok) { attempt = 0; set({ tiers: res.data, loaded: true }); }
      else scheduleRetry(set);
    })
    .catch(() => scheduleRetry(set))
    .finally(() => { inFlight = false; });
}

export const useVerifiedStore = create<VerifiedState>((set, get) => ({
  tiers: {},
  loaded: false,
  ensure: () => { if (!get().loaded) fetchMap(set); },
  setLocal: (profileId, tier) => set(s => {
    const next = { ...s.tiers };
    if (tier) next[profileId] = tier; else delete next[profileId];
    return { tiers: next };
  }),
  refresh: () => { inFlight = false; attempt = 0; if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; } fetchMap(set); },
}));

/** The tier this profile carries, or null. */
export function useVerifiedTier(profileId?: string | null): VerifiedTier | null {
  const tiers = useVerifiedStore(s => s.tiers);
  const loaded = useVerifiedStore(s => s.loaded);
  const ensure = useVerifiedStore(s => s.ensure);
  // Kicked off during render on purpose: the store guards duplicate requests,
  // and an effect would delay every badge by a frame on a freshly loaded feed.
  if (!loaded) ensure();
  return profileId ? (tiers[profileId] ?? null) : null;
}

/** Convenience for the many places that only care whether a badge shows. */
export function useIsVerified(profileId?: string | null): boolean {
  return useVerifiedTier(profileId) !== null;
}
