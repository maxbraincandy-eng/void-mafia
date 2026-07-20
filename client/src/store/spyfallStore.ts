import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import type { SpyfallPublicState, SpyfallListItem } from '@/types/spyfall';

function unwrap<T>(res: any): T { if (!res.ok) throw new Error(res.error ?? 'Unknown error'); return res.data as T; }

interface SpyfallStore {
  match: SpyfallPublicState | null;
  matchList: SpyfallListItem[];
  isLoading: boolean;
  error: string | null;

  fetchList: () => Promise<void>;
  createMatch: (nickname: string, opts?: { maxPlayers?: number; rounds?: number; discussSeconds?: number }) => Promise<void>;
  joinMatch: (code: string, nickname: string) => Promise<void>;
  leaveMatch: () => Promise<void>;
  startMatch: () => Promise<void>;
  beginVote: () => Promise<void>;
  vote: (targetId: string) => Promise<void>;
  guessLocation: (location: string) => Promise<void>;
  nextRound: () => Promise<void>;
  rematch: () => Promise<void>;
  clearError: () => void;
}

export const useSpyfallStore = create<SpyfallStore>((set, get) => ({
  match: null, matchList: [], isLoading: false, error: null,

  fetchList: async () => { try { const r = await emitWithAck<void, any>('spy:list'); set({ matchList: unwrap(r) }); } catch (e: any) { set({ error: e.message }); } },
  createMatch: async (nickname, opts) => { set({ isLoading: true, error: null }); try { const r = await emitWithAck<any, any>('spy:create', { nickname, ...opts }); set({ match: unwrap(r), isLoading: false }); } catch (e: any) { set({ isLoading: false, error: e.message }); } },
  joinMatch: async (code, nickname) => { set({ isLoading: true, error: null }); try { const r = await emitWithAck<any, any>('spy:join', { code, nickname }); set({ match: unwrap(r), isLoading: false }); } catch (e: any) { set({ isLoading: false, error: e.message }); } },
  leaveMatch: async () => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('spy:leave', { matchId: match.id }); } catch { /* ignore */ } set({ match: null }); },
  startMatch: async () => { const { match } = get(); if (!match) return; try { const r = await emitWithAck<any, any>('spy:start', { matchId: match.id }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } },
  beginVote: async () => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('spy:begin_vote', { matchId: match.id }); } catch { /* ignore */ } },
  vote: async (targetId) => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('spy:vote', { matchId: match.id, targetId }); } catch { /* ignore */ } },
  guessLocation: async (location) => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('spy:guess', { matchId: match.id, location }); } catch { /* ignore */ } },
  nextRound: async () => { const { match } = get(); if (!match) return; try { await emitWithAck<any, any>('spy:next', { matchId: match.id }); } catch { /* ignore */ } },
  rematch: async () => { const { match } = get(); if (!match) return; try { const r = await emitWithAck<any, any>('spy:rematch', { matchId: match.id }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } },
  clearError: () => set({ error: null }),
}));

(socket as any).on('spy:state', (d: SpyfallPublicState) => useSpyfallStore.setState({ match: d }));
(socket as any).on('spy:list_update', (l: SpyfallListItem[]) => useSpyfallStore.setState({ matchList: l }));
