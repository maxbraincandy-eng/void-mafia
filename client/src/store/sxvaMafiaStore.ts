import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import type { XmSafeState, XmListItem } from '@/types/sxvaMafia';

function unwrap<T>(res: any): T { if (!res.ok) throw new Error(res.error ?? 'Unknown error'); return res.data as T; }

interface XmStore {
  match: XmSafeState | null;
  matchList: XmListItem[];
  isLoading: boolean;
  error: string | null;

  fetchList: () => Promise<void>;
  createMatch: (nickname: string, opts?: { maxSeats?: number }) => Promise<void>;
  joinMatch: (code: string, nickname: string) => Promise<void>;
  leaveMatch: () => Promise<void>;

  // host
  start: () => Promise<void>;
  reshuffle: () => Promise<void>;
  transferHost: (targetId: string) => Promise<void>;
  pickCard: (cardIndex: number) => Promise<void>;
  setRoles: (config: { don: number; mafia: number; sheriff: number } | null) => Promise<void>;
  setSettings: (patch: Partial<{ speechSeconds: number; voteSeconds: number; lastWordsSeconds: number; nightSeconds: number; floorControl: boolean }>) => Promise<void>;
  beginMeet: () => Promise<void>;
  endMeet: () => Promise<void>;
  beginNight: () => Promise<void>;
  endNight: () => Promise<void>;
  beginDay: () => Promise<void>;
  nextSpeaker: () => Promise<void>;
  extendSpeech: (seconds?: number) => Promise<void>;
  endVote: () => Promise<void>;
  endLastWords: () => Promise<void>;
  giveFoul: (targetId: string, delta?: number) => Promise<void>;
  rematch: () => Promise<void>;

  // player
  mafiaVote: (targetId: string) => Promise<void>;
  donCheck: (targetId: string) => Promise<void>;
  sheriffCheck: (targetId: string) => Promise<void>;
  nominate: (targetId: string) => Promise<void>;
  castVote: (targetId: string) => Promise<void>;

  clearError: () => void;
}

const emit = (ev: string, data?: any) => emitWithAck<any, any>(ev, data);

export const useSxvaMafiaStore = create<XmStore>((set, get) => {
  const mid = () => get().match?.id;
  const hostEv = (ev: string) => async () => { const id = mid(); if (!id) return; try { const r = await emit(ev, { matchId: id }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } };
  const targetEv = (ev: string) => async (targetId: string) => { const id = mid(); if (!id) return; try { const r = await emit(ev, { matchId: id, targetId }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } };

  return {
    match: null, matchList: [], isLoading: false, error: null,

    fetchList: async () => { try { const r = await emit('xm:list'); set({ matchList: unwrap(r) }); } catch (e: any) { set({ error: e.message }); } },
    createMatch: async (nickname, opts) => { set({ isLoading: true, error: null }); try { const r = await emit('xm:create', { nickname, ...opts }); set({ match: unwrap(r), isLoading: false }); } catch (e: any) { set({ isLoading: false, error: e.message }); } },
    joinMatch: async (code, nickname) => { set({ isLoading: true, error: null }); try { const r = await emit('xm:join', { code, nickname }); set({ match: unwrap(r), isLoading: false }); } catch (e: any) { set({ isLoading: false, error: e.message }); } },
    leaveMatch: async () => { const id = mid(); if (!id) return; try { await emit('xm:leave', { matchId: id }); } catch { /* ignore */ } set({ match: null }); },

    start: hostEv('xm:start'),
    reshuffle: hostEv('xm:reshuffle'),
    transferHost: targetEv('xm:transfer_host'),
    pickCard: async (cardIndex) => { const id = mid(); if (!id) return; try { const r = await emit('xm:pick_card', { matchId: id, cardIndex }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } },
    setRoles: async (config) => { const id = mid(); if (!id) return; try { const r = await emit('xm:set_roles', { matchId: id, config }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } },
    setSettings: async (patch) => { const id = mid(); if (!id) return; try { const r = await emit('xm:set_settings', { matchId: id, patch }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } },
    beginMeet: hostEv('xm:begin_meet'),
    endMeet: hostEv('xm:end_meet'),
    beginNight: hostEv('xm:begin_night'),
    endNight: hostEv('xm:end_night'),
    beginDay: hostEv('xm:begin_day'),
    nextSpeaker: hostEv('xm:next_speaker'),
    extendSpeech: async (seconds = 30) => { const id = mid(); if (!id) return; try { await emit('xm:extend_speech', { matchId: id, seconds }); } catch { /* ignore */ } },
    endVote: hostEv('xm:end_vote'),
    endLastWords: hostEv('xm:end_last_words'),
    giveFoul: async (targetId, delta = 1) => { const id = mid(); if (!id) return; try { const r = await emit('xm:give_foul', { matchId: id, targetId, delta }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } },
    rematch: hostEv('xm:rematch'),

    mafiaVote: targetEv('xm:mafia_vote'),
    donCheck: targetEv('xm:don_check'),
    sheriffCheck: targetEv('xm:sheriff_check'),
    nominate: targetEv('xm:nominate'),
    castVote: targetEv('xm:cast_vote'),

    clearError: () => set({ error: null }),
  };
});

(socket as any).on('xm:state', (d: XmSafeState) => useSxvaMafiaStore.setState({ match: d }));
(socket as any).on('xm:list_update', (l: XmListItem[]) => useSxvaMafiaStore.setState({ matchList: l }));
