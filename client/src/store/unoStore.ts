import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import type { UnoPublicState, UnoListItem, UnoChatMsg, GameColor } from '@/types/uno';

function unwrap<T>(res: any): T {
  if (!res.ok) throw new Error(res.error ?? 'Unknown error');
  return res.data as T;
}

interface UnoStore {
  match: UnoPublicState | null;
  matchList: UnoListItem[];
  isLoading: boolean;
  error: string | null;

  fetchList: () => Promise<void>;
  createMatch: (nickname: string, maxPlayers?: number) => Promise<void>;
  joinMatch: (code: string, nickname: string) => Promise<void>;
  spectateMatch: (code: string) => Promise<void>;
  leaveMatch: () => Promise<void>;
  startMatch: () => Promise<void>;
  playCard: (cardId: string, chosenColor?: GameColor) => Promise<void>;
  drawCard: () => Promise<void>;
  callUno: () => Promise<void>;
  rematch: () => Promise<void>;
  sendChat: (text: string, nickname: string) => Promise<void>;
  clearError: () => void;
}

export const useUnoStore = create<UnoStore>((set, get) => ({
  match: null,
  matchList: [],
  isLoading: false,
  error: null,

  fetchList: async () => {
    try {
      const res = await emitWithAck<void, any>('uno:list');
      set({ matchList: unwrap(res) });
    } catch (e: any) { set({ error: e.message }); }
  },

  createMatch: async (nickname, maxPlayers = 4) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('uno:create', { nickname, maxPlayers });
      set({ match: unwrap(res), isLoading: false });
    } catch (e: any) { set({ isLoading: false, error: e.message }); }
  },

  joinMatch: async (code, nickname) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('uno:join', { code, nickname });
      set({ match: unwrap(res), isLoading: false });
    } catch (e: any) { set({ isLoading: false, error: e.message }); }
  },

  spectateMatch: async (code) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('uno:spectate', { code });
      set({ match: unwrap(res), isLoading: false });
    } catch (e: any) { set({ isLoading: false, error: e.message }); }
  },

  leaveMatch: async () => {
    const { match } = get();
    if (!match) return;
    try { await emitWithAck<any, any>('uno:leave', { matchId: match.id }); } catch { /* ignore */ }
    set({ match: null });
  },

  startMatch: async () => {
    const { match } = get();
    if (!match) return;
    try {
      const res = await emitWithAck<any, any>('uno:start', { matchId: match.id });
      if (!res.ok) set({ error: res.error });
    } catch (e: any) { set({ error: e.message }); }
  },

  playCard: async (cardId, chosenColor) => {
    const { match } = get();
    if (!match) return;
    set({ error: null });
    try {
      const res = await emitWithAck<any, any>('uno:play-card', { matchId: match.id, cardId, chosenColor });
      if (!res.ok) set({ error: res.error });
    } catch (e: any) { set({ error: e.message }); }
  },

  drawCard: async () => {
    const { match } = get();
    if (!match) return;
    try {
      const res = await emitWithAck<any, any>('uno:draw-card', { matchId: match.id });
      if (!res.ok) set({ error: res.error });
    } catch (e: any) { set({ error: e.message }); }
  },

  callUno: async () => {
    const { match } = get();
    if (!match) return;
    try {
      await emitWithAck<any, any>('uno:call-uno', { matchId: match.id });
    } catch { /* ignore */ }
  },

  rematch: async () => {
    const { match } = get();
    if (!match) return;
    try {
      const res = await emitWithAck<any, any>('uno:rematch', { matchId: match.id });
      if (!res.ok) set({ error: res.error });
    } catch (e: any) { set({ error: e.message }); }
  },

  sendChat: async (text, nickname) => {
    const { match } = get();
    if (!match) return;
    try { (socket as any).emit('uno:chat', { matchId: match.id, text, nickname }); } catch { /* ignore */ }
  },

  clearError: () => set({ error: null }),
}));

// ── Socket listeners ────────────────────────────────────────────────────────
(socket as any).on('uno:state', (data: UnoPublicState) => {
  useUnoStore.setState({ match: data });
});

(socket as any).on('uno:chat', (msg: UnoChatMsg) => {
  const { match } = useUnoStore.getState();
  if (!match) return;
  useUnoStore.setState({ match: { ...match, chat: [...match.chat, msg].slice(-60) } });
});

(socket as any).on('uno:list_update', (list: UnoListItem[]) => {
  useUnoStore.setState({ matchList: list });
});
