import { create } from 'zustand';
import { emitWithAck } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import type { Res } from '@/types/index';

/**
 * What MY badge buys me.
 *
 * The numbers are not written here. They are fetched from the server, which
 * generates both the enforcement and the pitch from one table (server
 * vipService.ts). A copy in the client would be a second source of truth that
 * drifts the first time a limit is tuned, and the way it would show up is the
 * worst kind: a composer that lets you type 6000 characters and a server that
 * silently keeps 2000.
 *
 * The fallback below is deliberately the FREE tier. If the fetch fails the app
 * offers less rather than promising more, so nothing is ever typed and lost.
 */

export interface VipLimits {
  postChars: number;
  commentChars: number;
  bioChars: number;
  voiceSeconds: number;
  voiceBytes: number;
  speechBonusSeconds: number;
  queuePriority: boolean;
  profileVisitors: boolean;
  vipVoices: boolean;
  animatedName: boolean;
  incognito: boolean;
  liveDisguise: boolean;
}

export interface Perk { icon: string; title: string; free: string; vip: string }

export const FREE_LIMITS: VipLimits = {
  postChars: 2000,
  commentChars: 500,
  bioChars: 500,
  voiceSeconds: 60,
  voiceBytes: 7_000_000,
  speechBonusSeconds: 0,
  queuePriority: false,
  profileVisitors: false,
  vipVoices: false,
  animatedName: false,
  incognito: false,
  liveDisguise: false,
};

interface VipState {
  tier: 'free' | 'vip' | 'owner';
  limits: VipLimits;
  perks: Perk[];
  /**
   * WHICH profile the answer above belongs to.
   *
   * A plain `loaded: boolean` was wrong, and wrongly in the worst way. Two
   * things happen before you are logged in: components render (and ask for
   * their limits) while the socket is still connecting, and they render again
   * while it is connected but not yet authenticated. The first got a rejected
   * promise, the second got a perfectly correct answer for "nobody" — and both
   * were cached as final. A verified user then opened the sheet and was shown
   * an empty table and the free tier, permanently, because nothing ever asked
   * again. Keyed to the profile, logging in is a key change and refetches.
   *
   * `undefined` = never answered. `null` = answered for a logged-out visitor.
   */
  loadedFor: string | null | undefined;
  ensure: (profileId: string | null) => void;
  refresh: () => void;
}

let inFlight = false;
/** Which profile the in-flight or scheduled request is for. */
let pendingFor: string | null | undefined = undefined;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;

const MAX_ATTEMPTS = 6;

function cancelRetry() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
}

/**
 * Try again later, backing off, instead of giving up.
 *
 * The usual reason this fails is that the socket has not finished connecting,
 * which fixes itself in a second or two. Waiting for "some future render" to
 * notice is not a recovery plan — it is luck, and on a quiet screen it never
 * comes. The retry drives itself.
 */
function scheduleRetry(set: (p: Partial<VipState>) => void, profileId: string | null) {
  if (attempt >= MAX_ATTEMPTS) return;
  const delay = Math.min(30_000, 1000 * 2 ** attempt);
  attempt++;
  cancelRetry();
  retryTimer = setTimeout(() => { retryTimer = null; fetchPerks(set, profileId); }, delay);
}

function fetchPerks(set: (p: Partial<VipState>) => void, profileId: string | null) {
  if (inFlight) return;
  inFlight = true;
  cancelRetry();
  emitWithAck<undefined, Res<{ perks: Perk[]; tier: VipState['tier']; limits: VipLimits }>>('vip:perks')
    .then(res => {
      // A failed answer is NOT an answer: leaving loadedFor alone is what keeps
      // the free tier on offer instead of a wrong one.
      if (res.ok) {
        attempt = 0;
        set({ tier: res.data.tier, limits: res.data.limits, perks: res.data.perks, loadedFor: profileId });
      } else {
        scheduleRetry(set, profileId);
      }
    })
    .catch(() => scheduleRetry(set, profileId))
    .finally(() => { inFlight = false; });
}

export const useVipStore = create<VipState>((set, get) => ({
  tier: 'free',
  limits: FREE_LIMITS,
  perks: [],
  loadedFor: undefined,
  ensure: profileId => {
    if (get().loadedFor === profileId) return;
    if (pendingFor !== profileId) {
      // Who we are changed — abandon whatever was queued for the old identity.
      pendingFor = profileId;
      attempt = 0;
      cancelRetry();
    } else if (retryTimer) {
      return;                       // already coming back on its own
    }
    fetchPerks(set, profileId);
  },
  refresh: () => {
    const id = useAuthStore.getState().profile?.id ?? null;
    inFlight = false; attempt = 0; pendingFor = id; cancelRetry();
    fetchPerks(set, id);
  },
}));

/** Everything about my tier, refetched whenever who I am changes. */
function useVipAnswer() {
  const myId = useAuthStore(s => s.profile?.id ?? null);
  const state = useVipStore();
  // Kicked off during render on purpose: the store guards duplicate requests,
  // and an effect would leave a composer showing the free cap for a frame.
  if (state.loadedFor !== myId) state.ensure(myId);
  // Until the answer is about ME, offer the FREE tier rather than a stale one.
  // Understating a limit costs a longer wait; overstating it loses what was
  // typed past a cap the server will not accept.
  return state.loadedFor === myId ? state : null;
}

/** My limits. Free until the answer arrives — never optimistic. */
export function useMyLimits(): VipLimits {
  return useVipAnswer()?.limits ?? FREE_LIMITS;
}

export function useMyTier(): VipState['tier'] {
  return useVipAnswer()?.tier ?? 'free';
}

/** The pitch rows. Empty only while the first answer is still in flight. */
export function useVipPerks(): Perk[] {
  return useVipAnswer()?.perks ?? [];
}

export function useIamVip(): boolean {
  return useMyTier() !== 'free';
}
