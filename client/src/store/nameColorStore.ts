import { create } from 'zustand';
import { useEffect } from 'react';
import { emitWithAck } from '@/lib/socket';
import { getNameColorById } from '@/constants/cosmetics';
import type { Res } from '@/types/index';

// App-wide resolver for players' equipped name-color ids.
// Names are rendered in many places carrying only a profileId; this store
// batches lookups via `cosmetics:name_colors` and caches the result so a
// player's chosen color shows everywhere (feed, chat, lounge, game, profile).

interface NameColorState {
  // profileId -> equipped color id (e.g. 'nc_gold'), or null once resolved with none
  colors: Record<string, string | null>;
  request: (profileId: string) => void;
  // Set immediately (e.g. when the current user equips a color)
  setLocal: (profileId: string, colorId: string | null) => void;
}

const pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export const useNameColorStore = create<NameColorState>((set, get) => ({
  colors: {},

  request: (profileId: string) => {
    if (!profileId) return;
    const { colors } = get();
    // Already resolved (color id or explicit null) or already queued → skip
    if (profileId in colors || pending.has(profileId)) return;
    pending.add(profileId);
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const ids = Array.from(pending);
      pending.clear();
      if (ids.length === 0) return;
      emitWithAck<{ profileIds: string[] }, Res<Record<string, string>>>('cosmetics:name_colors', { profileIds: ids })
        .then(res => {
          const map = res.ok ? res.data : {};
          set(s => {
            const next = { ...s.colors };
            for (const id of ids) next[id] = map[id] ?? null; // cache misses as null
            return { colors: next };
          });
        })
        .catch(() => {
          // On failure, mark as resolved-null so we don't hammer the server
          set(s => {
            const next = { ...s.colors };
            for (const id of ids) if (!(id in next)) next[id] = null;
            return { colors: next };
          });
        });
    }, 60);
  },

  setLocal: (profileId: string, colorId: string | null) => {
    if (!profileId) return;
    set(s => ({ colors: { ...s.colors, [profileId]: colorId } }));
  },
}));

/**
 * Resolve a player's equipped name color to a hex string (or null).
 * Triggers a batched fetch on first use for an unknown profile.
 */
export function useNameColor(profileId?: string | null): string | null {
  const colorId = useNameColorStore(s => (profileId ? s.colors[profileId] : undefined));
  useEffect(() => {
    if (profileId) useNameColorStore.getState().request(profileId);
  }, [profileId]);
  return colorId ? getNameColorById(colorId) : null;
}
