import { create } from 'zustand';
import { emitWithAck } from '@/lib/socket';
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
};

interface VipState {
  tier: 'free' | 'vip' | 'owner';
  limits: VipLimits;
  perks: Perk[];
  loaded: boolean;
  ensure: () => void;
  refresh: () => void;
}

let inFlight = false;

function fetchPerks(set: (p: Partial<VipState>) => void) {
  if (inFlight) return;
  inFlight = true;
  emitWithAck<undefined, Res<{ perks: Perk[]; tier: VipState['tier']; limits: VipLimits }>>('vip:perks')
    .then(res => set(res.ok
      ? { tier: res.data.tier, limits: res.data.limits, perks: res.data.perks, loaded: true }
      : { loaded: true }))
    .catch(() => set({ loaded: true }))
    .finally(() => { inFlight = false; });
}

export const useVipStore = create<VipState>((set, get) => ({
  tier: 'free',
  limits: FREE_LIMITS,
  perks: [],
  loaded: false,
  ensure: () => { if (!get().loaded) fetchPerks(set); },
  refresh: () => { inFlight = false; fetchPerks(set); },
}));

/** My limits. Free until the answer arrives — never optimistic. */
export function useMyLimits(): VipLimits {
  const limits = useVipStore(s => s.limits);
  const loaded = useVipStore(s => s.loaded);
  const ensure = useVipStore(s => s.ensure);
  if (!loaded) ensure();
  return limits;
}

export function useMyTier(): VipState['tier'] {
  const tier = useVipStore(s => s.tier);
  const loaded = useVipStore(s => s.loaded);
  const ensure = useVipStore(s => s.ensure);
  if (!loaded) ensure();
  return tier;
}

export function useIamVip(): boolean {
  return useMyTier() !== 'free';
}
