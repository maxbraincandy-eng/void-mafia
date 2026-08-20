import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import { registerMatchResume } from '@/lib/matchResume';
import { useAuthStore } from '@/store/authStore';
import type { LiesPublicState, LiesListItem, LiesBluffResult } from '@/types/lies';

function unwrap<T>(res: any): T { if (!res.ok) throw new Error(res.error ?? 'Unknown error'); return res.data as T; }

interface LiesStore {
  match: LiesPublicState | null;
  matchList: LiesListItem[];
  isLoading: boolean;
  error: string | null;

  fetchList: () => Promise<void>;
  createMatch: (nickname: string, opts?: { maxPlayers?: number; rounds?: number }) => Promise<void>;
  joinMatch: (code: string, nickname: string) => Promise<void>;
  leaveMatch: () => Promise<void>;
  startMatch: () => Promise<void>;
  submitBluff: (text: string) => Promise<LiesBluffResult>;
  clearRejected: () => Promise<void>;
  guess: (optionId: string) => Promise<void>;
  nextRound: () => Promise<void>;
  rematch: () => Promise<void>;
  clearError: () => void;
}

export const useLiesStore = create<LiesStore>((set, get) => ({
  match: null, matchList: [], isLoading: false, error: null,

  fetchList: async () => { try { const r = await emitWithAck<void, any>('lies:list'); set({ matchList: unwrap(r) }); } catch (e: any) { set({ error: e.message }); } },
  createMatch: async (nickname, opts) => { set({ isLoading: true, error: null }); try { const r = await emitWithAck<any, any>('lies:create', { nickname, ...opts }); set({ match: unwrap(r), isLoading: false }); } catch (e: any) { set({ isLoading: false, error: e.message }); } },
  joinMatch: async (code, nickname) => { set({ isLoading: true, error: null }); try { const r = await emitWithAck<any, any>('lies:join', { code, nickname }); set({ match: unwrap(r), isLoading: false }); } catch (e: any) { set({ isLoading: false, error: e.message }); } },
  leaveMatch: async () => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('lies:leave', { matchId: match.id }); } catch { /* ignore */ } set({ match: null }); },
  startMatch: async () => { const { match } = get(); if (!match) return; try { const r = await emitWithAck<any, any>('lies:start', { matchId: match.id }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } },
  submitBluff: async (text) => {
    const { match } = get(); if (!match) return 'invalid';
    try { const r = await emitWithAck<any, any>('lies:bluff', { matchId: match.id, text }); if (!r.ok) { set({ error: r.error }); return 'invalid'; } return (r.data?.result ?? 'ok') as LiesBluffResult; }
    catch (e: any) { set({ error: e.message }); return 'invalid'; }
  },
  clearRejected: async () => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('lies:clear_rejected', { matchId: match.id }); } catch { /* ignore */ } },
  guess: async (optionId) => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('lies:guess', { matchId: match.id, optionId }); } catch { /* ignore */ } },
  nextRound: async () => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('lies:next', { matchId: match.id }); } catch { /* ignore */ } },
  rematch: async () => { const { match } = get(); if (!match) return; try { const r = await emitWithAck<any, any>('lies:rematch', { matchId: match.id }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } },
  clearError: () => set({ error: null }),
}));

(socket as any).on('lies:state', (d: LiesPublicState) => useLiesStore.setState({ match: d }));
(socket as any).on('lies:list_update', (l: LiesListItem[]) => useLiesStore.setState({ matchList: l }));

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
registerMatchResume<LiesPublicState>('lies:resume', d => {
  if (d) { useLiesStore.setState({ match: d }); return; }
  const stale = useLiesStore.getState().match;
  if (!stale) return;
  if (stale.status === 'waiting') void useLiesStore.getState().joinMatch(stale.code, myNickname());
  else useLiesStore.setState({ match: null });
});
