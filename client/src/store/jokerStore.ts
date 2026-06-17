import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import type {
  JokerMatchPublic, JokerMatchListItem, JokerChatMsg, JokerSettings, Card,
} from '@/types/joker';

function unwrap<T>(res: { ok: boolean; data?: T; error?: string }): T {
  if (!res.ok) throw new Error((res as any).error ?? 'Unknown error');
  return (res as any).data as T;
}

function injectIdentity(data: any): JokerMatchPublic {
  const sid = socket.id ?? '';
  const me = (data.players ?? []).find((p: any) => p.socketId === sid);
  return {
    ...data,
    myPlayerId:  me?.id       ?? null,
    mySeatIndex: me?.seatIndex ?? null,
  };
}

interface JokerStore {
  match: JokerMatchPublic | null;
  myHand: Card[];
  matchList: JokerMatchListItem[];
  isLoading: boolean;
  error: string | null;
  selectedCard: Card | null;

  fetchList: () => Promise<void>;
  createMatch: (name: string, settings?: Partial<JokerSettings>) => Promise<void>;
  joinMatch: (code: string, name: string) => Promise<void>;
  startMatch: () => Promise<void>;
  declare: (tricks: number) => Promise<void>;
  playCard: (card: Card) => Promise<void>;
  resign: () => Promise<void>;
  rematch: () => Promise<void>;
  leaveMatch: () => Promise<void>;
  sendChat: (text: string) => Promise<void>;
  selectCard: (card: Card | null) => void;
  clearError: () => void;
}

export const useJokerStore = create<JokerStore>((set, get) => ({
  match: null,
  myHand: [],
  matchList: [],
  isLoading: false,
  error: null,
  selectedCard: null,

  fetchList: async () => {
    try {
      const res = await emitWithAck<void, any>('joker:list');
      set({ matchList: unwrap(res) });
    } catch (e: any) { set({ error: e.message }); }
  },

  createMatch: async (name, settings) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('joker:create', { name, settings });
      set({ match: injectIdentity(unwrap(res)), myHand: [], isLoading: false });
    } catch (e: any) { set({ isLoading: false, error: e.message }); }
  },

  joinMatch: async (code, name) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('joker:join', { code, name });
      set({ match: injectIdentity(unwrap(res)), myHand: [], isLoading: false });
    } catch (e: any) { set({ isLoading: false, error: e.message }); }
  },

  startMatch: async () => {
    const { match } = get();
    if (!match) return;
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('joker:start', { matchId: match.id });
      if (!res.ok) set({ error: res.error });
      set({ isLoading: false });
    } catch (e: any) { set({ isLoading: false, error: e.message }); }
  },

  declare: async (tricks) => {
    const { match } = get();
    if (!match) return;
    set({ error: null });
    try {
      const res = await emitWithAck<any, any>('joker:declare', { matchId: match.id, tricks });
      if (!res.ok) set({ error: res.error });
    } catch (e: any) { set({ error: e.message }); }
  },

  playCard: async (card) => {
    const { match } = get();
    if (!match) return;
    set({ selectedCard: null, error: null });
    try {
      const res = await emitWithAck<any, any>('joker:play-card', { matchId: match.id, card });
      if (!res.ok) set({ error: res.error });
    } catch (e: any) { set({ error: e.message }); }
  },

  resign: async () => {
    const { match } = get();
    if (!match) return;
    try {
      await emitWithAck<any, any>('joker:resign', { matchId: match.id });
    } catch (e: any) { set({ error: e.message }); }
  },

  rematch: async () => {
    const { match } = get();
    if (!match) return;
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('joker:rematch', { matchId: match.id });
      if (!res.ok) set({ isLoading: false, error: res.error });
      else set({ isLoading: false, myHand: [] });
    } catch (e: any) { set({ isLoading: false, error: e.message }); }
  },

  leaveMatch: async () => {
    const { match } = get();
    if (!match) return;
    try {
      await emitWithAck<any, any>('joker:leave', { matchId: match.id });
    } catch { /* ignore */ }
    set({ match: null, myHand: [], selectedCard: null });
  },

  sendChat: async (text) => {
    const { match } = get();
    if (!match) return;
    try {
      await emitWithAck<any, any>('joker:chat', { matchId: match.id, text });
    } catch { /* ignore */ }
  },

  selectCard: (card) => set({ selectedCard: card }),
  clearError: () => set({ error: null }),
}));

// ── Socket listeners ───────────────────────────────────────────────────

(socket as any).on('joker:state', (data: any) => {
  useJokerStore.setState({ match: injectIdentity(data) });
});

(socket as any).on('joker:hand', (hand: Card[]) => {
  useJokerStore.setState({ myHand: hand });
});

(socket as any).on('joker:chat', (msg: JokerChatMsg) => {
  const { match } = useJokerStore.getState();
  if (!match) return;
  useJokerStore.setState({
    match: { ...match, chat: [...match.chat, msg].slice(-80) },
  });
});

(socket as any).on('joker:list_update', (list: JokerMatchListItem[]) => {
  useJokerStore.setState({ matchList: list });
});
