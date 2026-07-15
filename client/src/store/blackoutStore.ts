import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import type { BlackoutPublicState, BlackoutListItem, BlackoutChatMsg } from '@/types/blackout';

function unwrap<T>(res: any): T {
  if (!res.ok) throw new Error(res.error ?? 'Unknown error');
  return res.data as T;
}

/**
 * Live remote positions, kept OUTSIDE Zustand on purpose: position packets
 * arrive ~12Hz per player and would cause a re-render storm. The canvas game
 * loop reads this map every frame and lerps x/y toward tx/ty.
 */
export const blackoutRemotePos = new Map<string, { x: number; y: number; tx: number; ty: number }>();

interface BlackoutStore {
  match: BlackoutPublicState | null;
  matchList: BlackoutListItem[];
  isLoading: boolean;
  error: string | null;

  fetchList: () => Promise<void>;
  createMatch: (nickname: string, maxPlayers?: number) => Promise<void>;
  joinMatch: (code: string, nickname: string) => Promise<void>;
  leaveMatch: () => Promise<void>;
  startMatch: () => Promise<void>;
  kill: (targetId: string) => Promise<void>;
  report: () => Promise<void>;
  vote: (targetId: string) => Promise<void>;
  rematch: () => Promise<void>;
  sendChat: (text: string, nickname: string) => void;
  clearError: () => void;
}

export const useBlackoutStore = create<BlackoutStore>((set, get) => ({
  match: null,
  matchList: [],
  isLoading: false,
  error: null,

  fetchList: async () => {
    try {
      const res = await emitWithAck<void, any>('blackout:list');
      set({ matchList: unwrap(res) });
    } catch (e: any) { set({ error: e.message }); }
  },

  createMatch: async (nickname, maxPlayers = 8) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('blackout:create', { nickname, maxPlayers });
      set({ match: unwrap(res), isLoading: false });
    } catch (e: any) { set({ isLoading: false, error: e.message }); }
  },

  joinMatch: async (code, nickname) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('blackout:join', { code, nickname });
      set({ match: unwrap(res), isLoading: false });
    } catch (e: any) { set({ isLoading: false, error: e.message }); }
  },

  leaveMatch: async () => {
    const { match } = get();
    if (!match) return;
    try { await emitWithAck<any, any>('blackout:leave', { matchId: match.id }); } catch { /* ignore */ }
    blackoutRemotePos.clear();
    set({ match: null });
  },

  startMatch: async () => {
    const { match } = get();
    if (!match) return;
    try {
      const res = await emitWithAck<any, any>('blackout:start', { matchId: match.id });
      if (!res.ok) set({ error: res.error });
    } catch (e: any) { set({ error: e.message }); }
  },

  kill: async (targetId) => {
    const { match } = get();
    if (!match) return;
    try { await emitWithAck<any, any>('blackout:kill', { matchId: match.id, targetId }); } catch { /* ignore */ }
  },

  report: async () => {
    const { match } = get();
    if (!match) return;
    try { await emitWithAck<any, any>('blackout:report', { matchId: match.id }); } catch { /* ignore */ }
  },

  vote: async (targetId) => {
    const { match } = get();
    if (!match) return;
    try {
      const res = await emitWithAck<any, any>('blackout:vote', { matchId: match.id, targetId });
      if (!res.ok) set({ error: res.error });
    } catch (e: any) { set({ error: e.message }); }
  },

  rematch: async () => {
    const { match } = get();
    if (!match) return;
    try {
      const res = await emitWithAck<any, any>('blackout:rematch', { matchId: match.id });
      if (!res.ok) set({ error: res.error });
    } catch (e: any) { set({ error: e.message }); }
  },

  sendChat: (text, nickname) => {
    const { match } = get();
    if (!match) return;
    try { (socket as any).emit('blackout:chat', { matchId: match.id, text, nickname }); } catch { /* ignore */ }
  },

  clearError: () => set({ error: null }),
}));

// ── Socket listeners ────────────────────────────────────────────────────────
(socket as any).on('blackout:state', (data: BlackoutPublicState) => {
  // Seed/refresh remote position targets from authoritative state (teleports
  // on round reset land instantly instead of lerping across the map).
  const isReset = useBlackoutStore.getState().match?.round !== data.round;
  for (const p of data.players) {
    const rp = blackoutRemotePos.get(p.userId);
    if (!rp || isReset) blackoutRemotePos.set(p.userId, { x: p.x, y: p.y, tx: p.x, ty: p.y });
  }
  useBlackoutStore.setState({ match: data });
});

(socket as any).on('blackout:pos', (d: { u: string; x: number; y: number }) => {
  const rp = blackoutRemotePos.get(d.u);
  if (rp) { rp.tx = d.x; rp.ty = d.y; }
  else blackoutRemotePos.set(d.u, { x: d.x, y: d.y, tx: d.x, ty: d.y });
});

(socket as any).on('blackout:chat', (msg: BlackoutChatMsg) => {
  const { match } = useBlackoutStore.getState();
  if (!match) return;
  useBlackoutStore.setState({ match: { ...match, chat: [...match.chat, msg].slice(-80) } });
});

(socket as any).on('blackout:list_update', (list: BlackoutListItem[]) => {
  useBlackoutStore.setState({ matchList: list });
});
