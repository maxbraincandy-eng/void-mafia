import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import type { WpSafeState, WpListItem, WpChatMsg } from '@/types/watchParty';

function unwrap<T>(res: any): T { if (!res.ok) throw new Error(res.error ?? 'Unknown error'); return res.data as T; }
const emit = (ev: string, data?: any) => emitWithAck<any, any>(ev, data);

interface WpStore {
  match: WpSafeState | null;
  matchList: WpListItem[];
  isLoading: boolean;
  error: string | null;
  // Local timestamp (performance.now) when the current `match` snapshot arrived,
  // used to extrapolate the playhead between server updates.
  receivedAt: number;

  fetchList: () => Promise<void>;
  createMatch: (nickname: string, title: string, avatar?: string) => Promise<void>;
  joinMatch: (code: string, nickname: string, avatar?: string) => Promise<void>;
  leaveMatch: () => Promise<void>;
  transferHost: (targetUserId: string) => Promise<void>;

  setSource: (url: string) => Promise<void>;
  clearSource: () => Promise<void>;
  play: (positionSec?: number) => Promise<void>;
  pause: (positionSec?: number) => Promise<void>;
  seek: (positionSec: number) => Promise<void>;
  setRate: (rate: number) => Promise<void>;

  queueAdd: (url: string) => Promise<void>;
  queueRemove: (index: number) => Promise<void>;
  queueNext: () => Promise<void>;

  sendChat: (text: string) => Promise<void>;
  requestSync: () => Promise<void>;

  clearError: () => void;
  reset: () => void;
}

export const useWatchPartyStore = create<WpStore>((set, get) => {
  const mid = () => get().match?.id;
  const hostEmit = async (ev: string, extra?: any) => {
    const id = mid(); if (!id) return;
    try { const r = await emit(ev, { matchId: id, ...extra }); if (!r.ok) set({ error: r.error }); }
    catch (e: any) { set({ error: e.message }); }
  };

  return {
    match: null, matchList: [], isLoading: false, error: null, receivedAt: 0,

    fetchList: async () => { try { const r = await emit('wp:list'); set({ matchList: unwrap(r) }); } catch (e: any) { set({ error: e.message }); } },

    createMatch: async (nickname, title, avatar) => {
      set({ isLoading: true, error: null });
      try {
        const r = await emit('wp:create', { nickname, title, avatar });
        unwrap(r); // { matchId, code } — the authoritative state arrives via wp:state
        set({ isLoading: false });
      } catch (e: any) { set({ isLoading: false, error: e.message }); }
    },
    joinMatch: async (code, nickname, avatar) => {
      set({ isLoading: true, error: null });
      try {
        const r = await emit('wp:join', { code, nickname, avatar });
        unwrap(r);
        set({ isLoading: false });
      } catch (e: any) { set({ isLoading: false, error: e.message }); }
    },
    leaveMatch: async () => { const id = mid(); if (!id) return; try { await emit('wp:leave', { matchId: id }); } catch { /* ignore */ } set({ match: null }); },
    transferHost: async (targetUserId) => hostEmit('wp:transfer_host', { targetUserId }),

    setSource: async (url) => hostEmit('wp:set_source', { url }),
    clearSource: async () => hostEmit('wp:clear_source'),
    play: async (positionSec) => hostEmit('wp:play', positionSec != null ? { positionSec } : undefined),
    pause: async (positionSec) => hostEmit('wp:pause', positionSec != null ? { positionSec } : undefined),
    seek: async (positionSec) => hostEmit('wp:seek', { positionSec }),
    setRate: async (rate) => hostEmit('wp:rate', { rate }),

    queueAdd: async (url) => hostEmit('wp:queue_add', { url }),
    queueRemove: async (index) => hostEmit('wp:queue_remove', { index }),
    queueNext: async () => hostEmit('wp:queue_next'),

    sendChat: async (text) => { const id = mid(); if (!id) return; try { await emit('wp:chat', { matchId: id, text }); } catch { /* ignore */ } },
    requestSync: async () => {
      const id = mid(); if (!id) return;
      try { const r = await emit('wp:sync', { matchId: id }); if (r.ok) set({ match: r.data, receivedAt: performance.now() }); } catch { /* ignore */ }
    },

    clearError: () => set({ error: null }),
    reset: () => set({ match: null, receivedAt: 0, error: null }),
  };
});

(socket as any).on('wp:state', (d: WpSafeState) => useWatchPartyStore.setState({ match: d, receivedAt: performance.now() }));
(socket as any).on('wp:list_update', (l: WpListItem[]) => useWatchPartyStore.setState({ matchList: l }));
(socket as any).on('wp:chat_new', (msg: WpChatMsg) => {
  const m = useWatchPartyStore.getState().match;
  if (!m) return;
  useWatchPartyStore.setState({ match: { ...m, chat: [...m.chat.slice(-119), msg] } });
});
