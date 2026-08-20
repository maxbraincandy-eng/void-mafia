import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import { registerMatchResume } from '@/lib/matchResume';
import { useAuthStore } from '@/store/authStore';
import type { DrawPublicState, DrawListItem, DrawChat, DrawSeg } from '@/types/draw';

function unwrap<T>(res: any): T { if (!res.ok) throw new Error(res.error ?? 'Unknown error'); return res.data as T; }

/**
 * Incoming remote strokes are kept OUTSIDE Zustand (they arrive at high rate)
 * and drained by the canvas each frame. `bump` forces a redraw signal.
 */
export const drawIncoming: { segs: DrawSeg[]; clear: boolean } = { segs: [], clear: false };

interface DrawStore {
  match: DrawPublicState | null;
  matchList: DrawListItem[];
  chat: DrawChat[];
  isLoading: boolean;
  error: string | null;

  fetchList: () => Promise<void>;
  createMatch: (nickname: string, opts?: { rounds?: number; drawSeconds?: number }) => Promise<void>;
  joinMatch: (code: string, nickname: string) => Promise<void>;
  leaveMatch: () => Promise<void>;
  startMatch: () => Promise<void>;
  chooseWord: (word: string) => Promise<void>;
  sendGuess: (text: string) => void;
  sendSeg: (seg: DrawSeg) => void;
  clearCanvas: () => void;
  rematch: () => Promise<void>;
  clearError: () => void;
}

export const useDrawStore = create<DrawStore>((set, get) => ({
  match: null, matchList: [], chat: [], isLoading: false, error: null,

  fetchList: async () => { try { const r = await emitWithAck<void, any>('draw:list'); set({ matchList: unwrap(r) }); } catch (e: any) { set({ error: e.message }); } },
  createMatch: async (nickname, opts) => { set({ isLoading: true, error: null }); try { const r = await emitWithAck<any, any>('draw:create', { nickname, ...opts }); set({ match: unwrap(r), isLoading: false, chat: [] }); } catch (e: any) { set({ isLoading: false, error: e.message }); } },
  joinMatch: async (code, nickname) => { set({ isLoading: true, error: null }); try { const r = await emitWithAck<any, any>('draw:join', { code, nickname }); set({ match: unwrap(r), isLoading: false, chat: [] }); } catch (e: any) { set({ isLoading: false, error: e.message }); } },
  leaveMatch: async () => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('draw:leave', { matchId: match.id }); } catch { /* ignore */ } set({ match: null, chat: [] }); },
  startMatch: async () => { const { match } = get(); if (!match) return; try { const r = await emitWithAck<any, any>('draw:start', { matchId: match.id }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } },
  chooseWord: async (word) => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('draw:choose', { matchId: match.id, word }); } catch { /* ignore */ } },
  sendGuess: (text) => { const { match } = get(); if (!match) return; try { (socket as any).emit('draw:guess', { matchId: match.id, text }); } catch { /* ignore */ } },
  sendSeg: (seg) => { const { match } = get(); if (!match) return; try { (socket as any).emit('draw:seg', { matchId: match.id, seg }); } catch { /* ignore */ } },
  clearCanvas: () => { const { match } = get(); if (!match) return; try { (socket as any).emit('draw:clear', { matchId: match.id }); } catch { /* ignore */ } },
  rematch: async () => { const { match } = get(); if (!match) return; try { const r = await emitWithAck<any, any>('draw:rematch', { matchId: match.id }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } },
  clearError: () => set({ error: null }),
}));

(socket as any).on('draw:state', (d: DrawPublicState) => useDrawStore.setState({ match: d }));
(socket as any).on('draw:list_update', (l: DrawListItem[]) => useDrawStore.setState({ matchList: l }));
(socket as any).on('draw:chat', (c: DrawChat) => useDrawStore.setState(s => ({ chat: [...s.chat, c].slice(-60) })));
(socket as any).on('draw:seg', (seg: DrawSeg) => { drawIncoming.segs.push(seg); });
(socket as any).on('draw:canvas', (segs: DrawSeg[]) => { drawIncoming.segs.push(...segs); });
(socket as any).on('draw:clear', () => { drawIncoming.clear = true; });

/** Whatever the lobby knows us as — needed to walk back into a match. */
function myNickname(): string { return useAuthStore.getState().profile?.username ?? 'Player'; }

/**
 * Reconnect / reload recovery.
 *
 * A new socket means the server was holding a dead handle for us and this
 * screen would sit frozen until we asked. Nothing to come back to means the
 * match is over — unless we were dropped from a LOBBY, where the server removes
 * disconnected players outright and the way back is simply to walk in again.
 */
registerMatchResume<DrawPublicState>('draw:resume', d => {
  if (d) { useDrawStore.setState({ match: d }); return; }
  const stale = useDrawStore.getState().match;
  if (!stale) return;
  if (stale.status === 'waiting') void useDrawStore.getState().joinMatch(stale.code, myNickname());
  else useDrawStore.setState({ match: null, chat: [] });
});
