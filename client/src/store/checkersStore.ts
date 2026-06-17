import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import type { CheckersMatchPublic, CheckersMatchListItem, CheckersChatMsg, PieceColor } from '@/types/checkers';

function unwrap<T>(res: { ok: boolean; data?: T; error?: string }): T {
  if (!res.ok) throw new Error((res as any).error ?? 'Unknown error');
  return (res as any).data as T;
}

// Determine our own color by comparing our live socket.id with the IDs stored in the match.
// This runs on the client and is always authoritative — it can never be confused by
// server-side ID mapping or timing races between broadcast and ack.
function resolveMyColor(data: Omit<CheckersMatchPublic, 'myColor'>): PieceColor | 'spectator' | null {
  const sid = socket.id;
  if (!sid) return null;
  if (data.red?.socketId === sid) return 'red';
  if (data.black?.socketId === sid) return 'black';
  // In a match with both players and we're not one of them — we're a spectator.
  if (data.red && data.black) return 'spectator';
  // Waiting match where we're not the creator — spectator.
  if (data.status !== 'waiting') return 'spectator';
  return null;
}

function injectColor(data: any): CheckersMatchPublic {
  return { ...data, myColor: resolveMyColor(data) };
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

export const useCheckersStore = create<CheckersStore>((set, get) => ({
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
      const raw = unwrap<any>(res);
      set({ match: injectColor(raw), isLoading: false });
    } catch (e: any) {
      set({ isLoading: false, error: e.message });
    }
  },

  joinMatch: async (code: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('checkers:join', { code, name });
      const raw = unwrap<any>(res);
      set({ match: injectColor(raw), isLoading: false });
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
      // New state arrives via checkers:state socket event.
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
}));

// ── Socket listeners registered once at module level ──────────────────

(socket as any).on('checkers:state', (data: any) => {
  // Inject myColor by comparing socket.id against the player socket IDs in the state.
  useCheckersStore.setState({ match: injectColor(data), selectedCell: null });
});

(socket as any).on('checkers:chat', (msg: CheckersChatMsg) => {
  const { match } = useCheckersStore.getState();
  if (!match) return;
  useCheckersStore.setState({ match: { ...match, chat: [...match.chat, msg].slice(-80) } });
});

(socket as any).on('checkers:list_update', (list: CheckersMatchListItem[]) => {
  useCheckersStore.setState({ matchList: list });
});
