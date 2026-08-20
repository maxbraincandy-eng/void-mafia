import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import { registerMatchResume } from '@/lib/matchResume';
import { useAuthStore } from '@/store/authStore';
import type { CnPublicState, CnListItem } from '@/types/codenames';

function unwrap<T>(res: any): T { if (!res.ok) throw new Error(res.error ?? 'Unknown error'); return res.data as T; }

interface CnStore {
  match: CnPublicState | null;
  matchList: CnListItem[];
  isLoading: boolean;
  error: string | null;

  fetchList: () => Promise<void>;
  createMatch: (nickname: string) => Promise<void>;
  joinMatch: (code: string, nickname: string) => Promise<void>;
  switchTeam: () => Promise<void>;
  toggleSpymaster: () => Promise<void>;
  leaveMatch: () => Promise<void>;
  startMatch: () => Promise<void>;
  giveClue: (word: string, number: number) => Promise<void>;
  guess: (index: number) => Promise<void>;
  pass: () => Promise<void>;
  rematch: () => Promise<void>;
  clearError: () => void;
}

export const useCodenamesStore = create<CnStore>((set, get) => ({
  match: null, matchList: [], isLoading: false, error: null,

  fetchList: async () => { try { const r = await emitWithAck<void, any>('cn:list'); set({ matchList: unwrap(r) }); } catch (e: any) { set({ error: e.message }); } },
  createMatch: async (nickname) => { set({ isLoading: true, error: null }); try { const r = await emitWithAck<any, any>('cn:create', { nickname }); set({ match: unwrap(r), isLoading: false }); } catch (e: any) { set({ isLoading: false, error: e.message }); } },
  joinMatch: async (code, nickname) => { set({ isLoading: true, error: null }); try { const r = await emitWithAck<any, any>('cn:join', { code, nickname }); set({ match: unwrap(r), isLoading: false }); } catch (e: any) { set({ isLoading: false, error: e.message }); } },
  switchTeam: async () => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('cn:switch_team', { matchId: match.id }); } catch { /* ignore */ } },
  toggleSpymaster: async () => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('cn:spymaster', { matchId: match.id }); } catch { /* ignore */ } },
  leaveMatch: async () => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('cn:leave', { matchId: match.id }); } catch { /* ignore */ } set({ match: null }); },
  startMatch: async () => { const { match } = get(); if (!match) return; try { const r = await emitWithAck<any, any>('cn:start', { matchId: match.id }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } },
  giveClue: async (word, number) => { const { match } = get(); if (!match) return; try { const r = await emitWithAck<any, any>('cn:clue', { matchId: match.id, word, number }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } },
  guess: async (index) => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('cn:guess', { matchId: match.id, index }); } catch { /* ignore */ } },
  pass: async () => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('cn:pass', { matchId: match.id }); } catch { /* ignore */ } },
  rematch: async () => { const { match } = get(); if (!match) return; try { const r = await emitWithAck<any, any>('cn:rematch', { matchId: match.id }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } },
  clearError: () => set({ error: null }),
}));

(socket as any).on('cn:state', (d: CnPublicState) => useCodenamesStore.setState({ match: d }));
(socket as any).on('cn:list_update', (l: CnListItem[]) => useCodenamesStore.setState({ matchList: l }));

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
registerMatchResume<CnPublicState>('cn:resume', d => {
  if (d) { useCodenamesStore.setState({ match: d }); return; }
  const stale = useCodenamesStore.getState().match;
  if (!stale) return;
  if (stale.status === 'waiting') void useCodenamesStore.getState().joinMatch(stale.code, myNickname());
  else useCodenamesStore.setState({ match: null });
});
