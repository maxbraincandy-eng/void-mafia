import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import { registerMatchResume } from '@/lib/matchResume';
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
  setRoles: (config: { don: number; mafia: number; sheriff: number; doctor: number; maniac: number; cult: number } | null) => Promise<void>;
  setSettings: (patch: Partial<{ speechSeconds: number; voteSeconds: number; lastWordsSeconds: number; nightSeconds: number; floorControl: boolean }>) => Promise<void>;
  beginMeet: () => Promise<void>;
  endMeet: () => Promise<void>;
  beginNight: () => Promise<void>;
  endNight: () => Promise<void>;
  beginDay: () => Promise<void>;
  nextSpeaker: () => Promise<void>;
  extendSpeech: (seconds?: number) => Promise<void>;
  endVote: () => Promise<void>;
  nextCandidate: () => Promise<void>;
  endLastWords: () => Promise<void>;
  giveFoul: (targetId: string, delta?: number) => Promise<void>;
  kick: (targetId: string) => Promise<void>;
  /** Owner-only testing aids. The server checks the permission, not this. */
  addBot: () => Promise<void>;
  clearBots: () => Promise<void>;
  grabFloor: () => Promise<void>;
  rematch: () => Promise<void>;
  endGame: () => Promise<void>;
  // ── სპორტული მაფია ──────────────────────────────────────────────────────
  setSport: (on: boolean) => Promise<void>;
  endPlanNight: () => Promise<void>;
  nextDefense: () => Promise<void>;
  endTribunal: () => Promise<void>;
  tribunalVote: (verdict: 'punish' | 'free') => Promise<void>;
  dissolve: () => Promise<void>;

  // player
  mafiaVote: (targetId: string) => Promise<void>;
  donCheck: (targetId: string) => Promise<void>;
  sheriffCheck: (targetId: string) => Promise<void>;
  doctorHeal: (targetId: string) => Promise<void>;
  maniacKill: (targetId: string) => Promise<void>;
  cultConvert: (targetId: string) => Promise<void>;
  nominate: (targetId: string) => Promise<void>;
  castVote: (targetId: string) => Promise<void>;

  clearError: () => void;
  /** Set when the host removed you, so the game can say why it closed. */
  kicked: boolean;
  clearKicked: () => void;
}

/**
 * Matches this client has walked out of.
 *
 * A late `xm:state` for a room you have left must not reopen it. The server no
 * longer sends one, but the guard stays: a broadcast already in flight when you
 * pressed leave would otherwise put the room back on your screen, and pressing
 * leave again would close it again — a loop with no exit.
 */
const departed = new Set<string>();

const emit = (ev: string, data?: any) => emitWithAck<any, any>(ev, data);

export const useSxvaMafiaStore = create<XmStore>((set, get) => {
  const mid = () => get().match?.id;
  const hostEv = (ev: string) => async () => { const id = mid(); if (!id) return; try { const r = await emit(ev, { matchId: id }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } };
  const targetEv = (ev: string) => async (targetId: string) => { const id = mid(); if (!id) return; try { const r = await emit(ev, { matchId: id, targetId }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } };

  return {
    match: null, matchList: [], isLoading: false, error: null, kicked: false,

    fetchList: async () => { try { const r = await emit('xm:list'); set({ matchList: unwrap(r) }); } catch (e: any) { set({ error: e.message }); } },
    createMatch: async (nickname, opts) => {
      set({ isLoading: true, error: null, kicked: false });
      try {
        const r = await emit('xm:create', { nickname, ...opts });
        const m = unwrap<XmSafeState>(r);
        departed.delete(m.id);
        set({ match: m, isLoading: false });
      } catch (e: any) { set({ isLoading: false, error: e.message }); }
    },
    joinMatch: async (code, nickname) => {
      set({ isLoading: true, error: null, kicked: false });
      try {
        const r = await emit('xm:join', { code, nickname });
        const m = unwrap<XmSafeState>(r);
        departed.delete(m.id);
        set({ match: m, isLoading: false });
      } catch (e: any) { set({ isLoading: false, error: e.message }); }
    },
    leaveMatch: async () => {
      const id = mid();
      if (!id) return;
      // Close locally first and remember we are out, so nothing in flight can
      // pull us back while the acknowledgement is still on the wire.
      departed.add(id);
      set({ match: null, error: null, kicked: false });
      try { await emit('xm:leave', { matchId: id }); } catch { /* we are leaving regardless */ }
    },

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
    nextCandidate: hostEv('xm:next_candidate'),
    endLastWords: hostEv('xm:end_last_words'),
    giveFoul: async (targetId, delta = 1) => { const id = mid(); if (!id) return; try { const r = await emit('xm:give_foul', { matchId: id, targetId, delta }); if (!r.ok) set({ error: r.error }); } catch (e: any) { set({ error: e.message }); } },
    kick: targetEv('xm:kick'),
    addBot: hostEv('xm:add_bot'),
    clearBots: hostEv('xm:clear_bots'),
    grabFloor: hostEv('xm:grab_floor'),
    rematch: hostEv('xm:rematch'),
    endGame: hostEv('xm:end_game'),
    setSport: async on => {
      const id = mid(); if (!id) return;
      try { const r = await emit('xm:set_settings', { matchId: id, patch: { sport: on } }); if (!r.ok) set({ error: r.error }); }
      catch (e: any) { set({ error: e.message }); }
    },
    endPlanNight: hostEv('xm:end_plan_night'),
    nextDefense: hostEv('xm:next_defense'),
    endTribunal: hostEv('xm:end_tribunal'),
    tribunalVote: async verdict => {
      const id = mid(); if (!id) return;
      try { const r = await emit('xm:tribunal_vote', { matchId: id, verdict }); if (!r.ok) set({ error: r.error }); }
      catch (e: any) { set({ error: e.message }); }
    },
    /*
     * Close the table for everybody. Distinct from endGame, which keeps the
     * room and sends everyone back to the lobby.
     *
     * The host has to close their OWN screen locally, exactly the way leaving
     * does — and for the same reason. Dissolving sets `hostLeft`, and
     * `recipients` deliberately excludes a host who has left, so the one person
     * who pressed the button is the one person the server will never tell. Left
     * to `hostEv`, which only reports failures, the host's screen simply kept
     * the last state it had and froze there while everybody else was let out.
     */
    dissolve: async () => {
      const id = mid();
      if (!id) return;
      departed.add(id);
      set({ match: null, error: null, kicked: false });
      try { await emit('xm:dissolve', { matchId: id }); } catch { /* the room is closing regardless */ }
    },

    mafiaVote: targetEv('xm:mafia_vote'),
    donCheck: targetEv('xm:don_check'),
    sheriffCheck: targetEv('xm:sheriff_check'),
    doctorHeal: targetEv('xm:doctor_heal'),
    maniacKill: targetEv('xm:maniac_kill'),
    cultConvert: targetEv('xm:cult_convert'),
    nominate: targetEv('xm:nominate'),
    castVote: targetEv('xm:cast_vote'),

    clearError: () => set({ error: null }),
    clearKicked: () => set({ kicked: false }),
  };
});

(socket as any).on('xm:state', (d: XmSafeState) => {
  if (departed.has(d.id)) return;
  useSxvaMafiaStore.setState({ match: d });
});

/**
 * Reconnect recovery.
 *
 * A new socket means the server was holding a dead handle for us: state is
 * broadcast to stored socket ids, so the table would sit frozen on whatever it
 * last received while everyone else played on. Asking puts us back.
 */
registerMatchResume<XmSafeState>('xm:resume', d => {
  if (d && !departed.has(d.id)) { useSxvaMafiaStore.setState({ match: d }); return; }
  // Nothing to come back to: the room closed, or we were removed from it.
  if (useSxvaMafiaStore.getState().match) useSxvaMafiaStore.setState({ match: null });
});

/** The host removed us: close the table and say so, rather than freezing on it. */
(socket as any).on('xm:kicked', ({ matchId }: { matchId: string }) => {
  departed.add(matchId);
  useSxvaMafiaStore.setState({ match: null, kicked: true });
});
(socket as any).on('xm:list_update', (l: XmListItem[]) => useSxvaMafiaStore.setState({ matchList: l }));
