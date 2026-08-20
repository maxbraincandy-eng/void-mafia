import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import { registerMatchResume } from '@/lib/matchResume';
import { useAuthStore } from '@/store/authStore';
import type { AliasPublicState, AliasListItem, AliasGuess } from '@/types/alias';

function unwrap<T>(res: any): T { if (!res.ok) throw new Error(res.error ?? 'Unknown error'); return res.data as T; }

interface AliasStore {
  match: AliasPublicState | null;
  matchList: AliasListItem[];
  guesses: AliasGuess[];
  isLoading: boolean;
  error: string | null;

  fetchList: () => Promise<void>;
  createMatch: (nickname: string, opts?: { maxPlayers?: number; targetScore?: number; roundSeconds?: number }) => Promise<void>;
  joinMatch: (code: string, nickname: string) => Promise<void>;
  switchTeam: () => Promise<void>;
  leaveMatch: () => Promise<void>;
  startMatch: () => Promise<void>;
  startTurn: () => Promise<void>;
  mark: (got: boolean) => Promise<void>;
  rematch: () => Promise<void>;
  sendGuess: (text: string, nickname: string) => void;
  clearError: () => void;
}

export const useAliasStore = create<AliasStore>((set, get) => ({
  match: null, matchList: [], guesses: [], isLoading: false, error: null,

  fetchList: async () => { try { const r = await emitWithAck<void, any>('alias:list'); set({ matchList: unwrap(r) }); } catch (e: any) { set({ error: e.message }); } },
  createMatch: async (nickname, opts) => { set({ isLoading: true, error: null }); try { const r = await emitWithAck<any, any>('alias:create', { nickname, ...opts }); set({ match: unwrap(r), isLoading: false, guesses: [] }); } catch (e: any) { set({ isLoading: false, error: e.message }); } },
  joinMatch: async (code, nickname) => { set({ isLoading: true, error: null }); try { const r = await emitWithAck<any, any>('alias:join', { code, nickname }); set({ match: unwrap(r), isLoading: false, guesses: [] }); } catch (e: any) { set({ isLoading: false, error: e.message }); } },
  switchTeam: async () => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('alias:switch_team', { matchId: match.id }); } catch { /* ignore */ } },
  leaveMatch: async () => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('alias:leave', { matchId: match.id }); } catch { /* ignore */ } set({ match: null, guesses: [] }); },
  startMatch: async () => { const { match } = get(); if (!match) return; try { const r = await emitWithAck<any, any>('alias:start', { matchId: match.id }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } },
  startTurn: async () => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('alias:start_turn', { matchId: match.id }); } catch { /* ignore */ } },
  mark: async (got) => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('alias:mark', { matchId: match.id, got }); } catch { /* ignore */ } },
  rematch: async () => { const { match } = get(); if (!match) return; try { const r = await emitWithAck<any, any>('alias:rematch', { matchId: match.id }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } },
  sendGuess: (text, nickname) => { const { match } = get(); if (!match) return; try { (socket as any).emit('alias:guess', { matchId: match.id, text, nickname }); } catch { /* ignore */ } },
  clearError: () => set({ error: null }),
}));

(socket as any).on('alias:state', (d: AliasPublicState) => useAliasStore.setState({ match: d }));
(socket as any).on('alias:list_update', (l: AliasListItem[]) => useAliasStore.setState({ matchList: l }));
(socket as any).on('alias:guess', (g: AliasGuess) => useAliasStore.setState(s => ({ guesses: [...s.guesses, g].slice(-40) })));

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
registerMatchResume<AliasPublicState>('alias:resume', d => {
  if (d) { useAliasStore.setState({ match: d }); return; }
  const stale = useAliasStore.getState().match;
  if (!stale) return;
  if (stale.status === 'waiting') void useAliasStore.getState().joinMatch(stale.code, myNickname());
  else useAliasStore.setState({ match: null, guesses: [] });
});
