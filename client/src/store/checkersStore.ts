import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import type { CheckersMatchPublic, CheckersMatchListItem, CheckersChatMsg } from '@/types/checkers';


function unwrap<T>(res: { ok: boolean; data?: T; error?: string }): T {
  if (!res.ok) throw new Error((res as any).error ?? 'Unknown error');
  return (res as any).data as T;
}

interface CheckersStore {
  match: CheckersMatchPublic | null;
  matchList: CheckersMatchListItem[];
  isLoading: boolean;
  error: string | null;
  selectedCell: { row: number; col: number } | null;

  fetchList: () => Promise<void>;
  createMatch: (name: string) => Promise<void>;
  joinMatch: (code: string, name: string) => Promise<void>;
  leaveMatch: () => Promise<void>;
  makeMove: (from: { row: number; col: number }, to: { row: number; col: number }) => Promise<void>;
  resign: () => Promise<void>;
  rematch: () => Promise<void>;
  sendChat: (text: string) => Promise<void>;
  selectCell: (cell: { row: number; col: number } | null) => void;
  clearError: () => void;
}

export const useCheckersStore = create<CheckersStore>((set, get) => {

  // ── Socket listeners ───────────────────────────────────────────────
  (socket as any).on('checkers:state', (data: CheckersMatchPublic) => {
    set({ match: data, selectedCell: null });
  });

  (socket as any).on('checkers:chat', (msg: CheckersChatMsg) => {
    const { match } = get();
    if (!match) return;
    set({ match: { ...match, chat: [...match.chat, msg].slice(-80) } });
  });

  (socket as any).on('checkers:list_update', (list: CheckersMatchListItem[]) => {
    set({ matchList: list });
  });

  return {
    match: null,
    matchList: [],
    isLoading: false,
    error: null,
    selectedCell: null,

    fetchList: async () => {
      try {
        const res = await emitWithAck<void, any>('checkers:list');
        set({ matchList: unwrap(res) });
      } catch (e: any) {
        set({ error: e.message });
      }
    },

    createMatch: async (name: string) => {
      set({ isLoading: true, error: null });
      try {
        const res = await emitWithAck<any, any>('checkers:create', { name });
        const match = unwrap<CheckersMatchPublic>(res);
        set({ match, isLoading: false });
      } catch (e: any) {
        set({ isLoading: false, error: e.message });
      }
    },

    joinMatch: async (code: string, name: string) => {
      set({ isLoading: true, error: null });
      try {
        const res = await emitWithAck<any, any>('checkers:join', { code, name });
        const match = unwrap<CheckersMatchPublic>(res);
        set({ match, isLoading: false });
      } catch (e: any) {
        set({ isLoading: false, error: e.message });
      }
    },

    leaveMatch: async () => {
      const { match } = get();
      if (!match) return;
      try {
        await emitWithAck<any, any>('checkers:leave', { matchId: match.id });
      } catch { /* ignore */ }
      set({ match: null, selectedCell: null });
    },

    makeMove: async (from, to) => {
      const { match } = get();
      if (!match) return;
      set({ selectedCell: null, error: null });
      try {
        const res = await emitWithAck<any, any>('checkers:move', { matchId: match.id, from, to });
        if (!res.ok) set({ error: res.error });
      } catch (e: any) {
        set({ error: e.message });
      }
    },

    resign: async () => {
      const { match } = get();
      if (!match) return;
      try {
        await emitWithAck<any, any>('checkers:resign', { matchId: match.id });
      } catch (e: any) {
        set({ error: e.message });
      }
    },

    rematch: async () => {
      const { match } = get();
      if (!match) return;
      set({ isLoading: true, error: null });
      try {
        const res = await emitWithAck<any, any>('checkers:rematch', { matchId: match.id });
        if (!res.ok) set({ isLoading: false, error: res.error });
        else set({ isLoading: false });
        // New state arrives via checkers:state socket event
      } catch (e: any) {
        set({ isLoading: false, error: e.message });
      }
    },

    sendChat: async (text: string) => {
      const { match } = get();
      if (!match) return;
      try {
        await emitWithAck<any, any>('checkers:chat', { matchId: match.id, text });
      } catch { /* ignore */ }
    },

    selectCell: (cell) => set({ selectedCell: cell }),
    clearError: () => set({ error: null }),
  };
});
