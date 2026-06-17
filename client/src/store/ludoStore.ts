import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import type { LudoMatchPublic, LudoMatchListItem, LudoChatMsg, LudoColor } from '@/types/ludo';

function unwrap<T>(res: { ok: boolean; data?: T; error?: string }): T {
  if (!res.ok) throw new Error((res as any).error ?? 'Unknown error');
  return (res as any).data as T;
}

function resolveMyColor(data: Omit<LudoMatchPublic, 'myColor'>): LudoColor | 'spectator' | null {
  const sid = socket.id;
  if (!sid) return null;
  if (data.red?.socketId === sid) return 'red';
  if (data.blue?.socketId === sid) return 'blue';
  if (data.red && data.blue) return 'spectator';
  if (data.status !== 'waiting') return 'spectator';
  return null;
}

function injectColor(data: any): LudoMatchPublic {
  return { ...data, myColor: resolveMyColor(data) };
}

interface LudoStore {
  match: LudoMatchPublic | null;
  matchList: LudoMatchListItem[];
  isLoading: boolean;
  error: string | null;

  fetchList: () => Promise<void>;
  createMatch: (name: string) => Promise<void>;
  joinMatch: (code: string, name: string) => Promise<void>;
  leaveMatch: () => Promise<void>;
  rollDice: () => Promise<void>;
  movePiece: (pieceId: number) => Promise<void>;
  resign: () => Promise<void>;
  rematch: () => Promise<void>;
  sendChat: (text: string) => Promise<void>;
  clearError: () => void;
}

export const useLudoStore = create<LudoStore>((set, get) => ({
  match: null,
  matchList: [],
  isLoading: false,
  error: null,

  fetchList: async () => {
    try {
      const res = await emitWithAck<void, any>('ludo:list');
      set({ matchList: unwrap(res) });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  createMatch: async (name: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('ludo:create', { name });
      set({ match: injectColor(unwrap(res)), isLoading: false });
    } catch (e: any) {
      set({ isLoading: false, error: e.message });
    }
  },

  joinMatch: async (code: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('ludo:join', { code, name });
      set({ match: injectColor(unwrap(res)), isLoading: false });
    } catch (e: any) {
      set({ isLoading: false, error: e.message });
    }
  },

  leaveMatch: async () => {
    const { match } = get();
    if (!match) return;
    try { await emitWithAck<any, any>('ludo:leave', { matchId: match.id }); } catch { /* ignore */ }
    set({ match: null });
  },

  rollDice: async () => {
    const { match } = get();
    if (!match) return;
    set({ error: null });
    try {
      const res = await emitWithAck<any, any>('ludo:roll', { matchId: match.id });
      if (!res.ok) set({ error: res.error });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  movePiece: async (pieceId: number) => {
    const { match } = get();
    if (!match) return;
    set({ error: null });
    try {
      const res = await emitWithAck<any, any>('ludo:move', { matchId: match.id, pieceId });
      if (!res.ok) set({ error: res.error });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  resign: async () => {
    const { match } = get();
    if (!match) return;
    try {
      const res = await emitWithAck<any, any>('ludo:resign', { matchId: match.id });
      if (!res.ok) set({ error: res.error });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  rematch: async () => {
    const { match } = get();
    if (!match) return;
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('ludo:rematch', { matchId: match.id });
      if (!res.ok) set({ isLoading: false, error: res.error });
      else set({ isLoading: false });
    } catch (e: any) {
      set({ isLoading: false, error: e.message });
    }
  },

  sendChat: async (text: string) => {
    const { match } = get();
    if (!match) return;
    try { await emitWithAck<any, any>('ludo:chat', { matchId: match.id, text }); } catch { /* ignore */ }
  },

  clearError: () => set({ error: null }),
}));

// ── Socket listeners ───────────────────────────────────────────────────
(socket as any).on('ludo:state', (data: any) => {
  useLudoStore.setState({ match: injectColor(data) });
});

(socket as any).on('ludo:chat', (msg: LudoChatMsg) => {
  const { match } = useLudoStore.getState();
  if (!match) return;
  useLudoStore.setState({ match: { ...match, chat: [...match.chat, msg].slice(-80) } });
});

(socket as any).on('ludo:list_update', (list: LudoMatchListItem[]) => {
  useLudoStore.setState({ matchList: list });
});
