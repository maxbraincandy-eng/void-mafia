import { create } from 'zustand';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';

export type DebateSide = 'pro' | 'con' | 'spectator';
export type DebateStatus = 'open' | 'finished';

export type DebatePhase =
  | 'waiting' | 'opening_pro' | 'opening_con'
  | 'argument_pro' | 'argument_con'
  | 'rebuttal_con' | 'rebuttal_pro'
  | 'closing_pro' | 'closing_con'
  | 'voting' | 'finished';

export const PHASE_DURATION_SECONDS: Partial<Record<DebatePhase, number>> = {
  opening_pro: 120, opening_con: 120,
  argument_pro: 180, argument_con: 180,
  rebuttal_con: 120, rebuttal_pro: 120,
  closing_pro: 60, closing_con: 60,
  voting: 90,
};

export function getActiveSide(phase: DebatePhase): 'pro' | 'con' | null {
  if (phase.endsWith('_pro')) return 'pro';
  if (phase.endsWith('_con')) return 'con';
  return null;
}

export interface Debate {
  id: string;
  topic: string;
  description: string;
  createdBy: string;
  status: DebateStatus;
  phase: DebatePhase;
  phaseStartedAt: number | null;
  phaseDuration: number;
  winnerSide: DebateSide | null;
  createdAt: number;
  endsAt: number | null;
}

export interface DebateParticipant {
  id: string;
  debateId: string;
  playerId: string;
  side: DebateSide;
  joinedAt: number;
  username?: string;
  avatarUrl?: string | null;
}

export interface DebateArgument {
  id: string;
  debateId: string;
  playerId: string;
  side: DebateSide;
  content: string;
  createdAt: number;
  username?: string;
  avatarUrl?: string | null;
}

export interface DebateVote {
  id: string;
  debateId: string;
  playerId: string;
  side: DebateSide;
  createdAt: number;
}

export interface DebateFull extends Debate {
  participants: DebateParticipant[];
  arguments: DebateArgument[];
  votesCounts: { pro: number; con: number };
  myParticipation: DebateParticipant | null;
  myVote: DebateVote | null;
  raisedHands: Array<{ playerId: string; side: 'pro' | 'con'; raisedAt: number; username?: string }>;
}

function unwrap<T>(res: Res<T>): T {
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

interface DebateStore {
  debates: Debate[];
  activeDebate: DebateFull | null;
  loading: boolean;
  error: string | null;

  fetchDebates: (status?: 'open' | 'all') => Promise<void>;
  openDebate: (debateId: string) => Promise<void>;
  closeActiveDebate: () => void;
  createDebate: (topic: string, description: string) => Promise<Debate>;
  joinDebate: (debateId: string, side: DebateSide) => Promise<void>;
  postArgument: (debateId: string, content: string) => Promise<void>;
  vote: (debateId: string, side: 'pro' | 'con') => Promise<void>;
  closeDebate: (debateId: string) => Promise<void>;
  startDebate: (debateId: string) => Promise<void>;
  skipPhase: (debateId: string) => Promise<void>;
  raiseHand: (debateId: string, side: 'pro' | 'con') => Promise<void>;
  lowerHand: (debateId: string) => Promise<void>;
  promote: (debateId: string, targetPlayerId: string) => Promise<void>;

  onNewDebate: (debate: Debate) => void;
  onParticipantUpdate: (participant: DebateParticipant) => void;
  onNewArgument: (arg: DebateArgument) => void;
  onVoteUpdate: (data: { debateId: string; counts: { pro: number; con: number } }) => void;
  onDebateClosed: (debate: Debate) => void;
  onPhaseUpdate: (debate: Debate) => void;
  onHandsUpdate: (data: { debateId: string; hands: Array<{ playerId: string; side: 'pro' | 'con'; raisedAt: number; username?: string }> }) => void;
}

export const useDebateStore = create<DebateStore>((set, get) => ({
  debates: [],
  activeDebate: null,
  loading: false,
  error: null,

  fetchDebates: async (status = 'open') => {
    set({ loading: true, error: null });
    try {
      const res = await emitWithAck<{ status: string }, Res<Debate[]>>('debate:list', { status });
      const debates = unwrap(res);
      set({ debates, loading: false });
    } catch (e: unknown) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  openDebate: async (debateId: string) => {
    set({ loading: true, error: null });
    try {
      await emitWithAck<{ debateId: string }, Res<null>>('debate:subscribe', { debateId });
      const res = await emitWithAck<{ debateId: string }, Res<DebateFull>>('debate:get', { debateId });
      const debate = unwrap(res);
      set({ activeDebate: debate, loading: false });
    } catch (e: unknown) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  closeActiveDebate: () => {
    const { activeDebate } = get();
    if (activeDebate) {
      emitWithAck<{ debateId: string }, Res<null>>('debate:unsubscribe', { debateId: activeDebate.id }).catch(() => {});
    }
    set({ activeDebate: null });
  },

  createDebate: async (topic: string, description: string) => {
    const res = await emitWithAck<{ topic: string; description: string }, Res<Debate>>('debate:create', { topic, description });
    const debate = unwrap(res);
    set(s => ({ debates: [debate, ...s.debates] }));
    return debate;
  },

  joinDebate: async (debateId: string, side: DebateSide) => {
    const res = await emitWithAck<{ debateId: string; side: string }, Res<DebateParticipant>>('debate:join', { debateId, side });
    const participant = unwrap(res);
    set(s => {
      if (!s.activeDebate || s.activeDebate.id !== debateId) return s;
      const existingIdx = s.activeDebate.participants.findIndex(p => p.playerId === participant.playerId);
      const participants = existingIdx >= 0
        ? s.activeDebate.participants.map((p, i) => i === existingIdx ? participant : p)
        : [...s.activeDebate.participants, participant];
      return { activeDebate: { ...s.activeDebate, participants, myParticipation: participant } };
    });
  },

  postArgument: async (debateId: string, content: string) => {
    const res = await emitWithAck<{ debateId: string; content: string }, Res<DebateArgument>>('debate:argument', { debateId, content });
    unwrap(res);
  },

  vote: async (debateId: string, side: 'pro' | 'con') => {
    const res = await emitWithAck<{ debateId: string; side: string }, Res<{ pro: number; con: number }>>('debate:vote', { debateId, side });
    const counts = unwrap(res);
    set(s => {
      if (!s.activeDebate || s.activeDebate.id !== debateId) return s;
      return {
        activeDebate: {
          ...s.activeDebate,
          votesCounts: counts,
          myVote: { id: '', debateId, playerId: '', side, createdAt: Date.now() },
        },
      };
    });
  },

  closeDebate: async (debateId: string) => {
    const res = await emitWithAck<{ debateId: string }, Res<Debate>>('debate:close', { debateId });
    const updated = unwrap(res);
    set(s => ({
      debates: s.debates.map(d => d.id === debateId ? updated : d),
      activeDebate: s.activeDebate?.id === debateId ? { ...s.activeDebate, ...updated } : s.activeDebate,
    }));
  },

  startDebate: async (debateId: string) => {
    const res = await emitWithAck<{ debateId: string }, Res<Debate>>('debate:start' as any, { debateId });
    const updated = unwrap(res);
    set(s => ({
      activeDebate: s.activeDebate?.id === debateId ? { ...s.activeDebate, ...updated } : s.activeDebate,
    }));
  },

  skipPhase: async (debateId: string) => {
    const res = await emitWithAck<{ debateId: string }, Res<Debate>>('debate:skip_phase' as any, { debateId });
    const updated = unwrap(res);
    set(s => ({
      activeDebate: s.activeDebate?.id === debateId ? { ...s.activeDebate, ...updated } : s.activeDebate,
    }));
  },

  raiseHand: async (debateId: string, side: 'pro' | 'con') => {
    await emitWithAck<{ debateId: string; side: string }, Res<null>>('debate:raise_hand' as any, { debateId, side });
  },

  lowerHand: async (debateId: string) => {
    await emitWithAck<{ debateId: string }, Res<null>>('debate:lower_hand' as any, { debateId });
  },

  promote: async (debateId: string, targetPlayerId: string) => {
    await emitWithAck<{ debateId: string; targetPlayerId: string }, Res<DebateParticipant>>('debate:promote' as any, { debateId, targetPlayerId });
  },

  onNewDebate: (debate: Debate) => {
    set(s => ({ debates: [debate, ...s.debates.filter(d => d.id !== debate.id)] }));
  },

  onParticipantUpdate: (participant: DebateParticipant) => {
    set(s => {
      if (!s.activeDebate || s.activeDebate.id !== participant.debateId) return s;
      const existingIdx = s.activeDebate.participants.findIndex(p => p.playerId === participant.playerId);
      const participants = existingIdx >= 0
        ? s.activeDebate.participants.map((p, i) => i === existingIdx ? participant : p)
        : [...s.activeDebate.participants, participant];
      return { activeDebate: { ...s.activeDebate, participants } };
    });
  },

  onNewArgument: (arg: DebateArgument) => {
    set(s => {
      if (!s.activeDebate || s.activeDebate.id !== arg.debateId) return s;
      return { activeDebate: { ...s.activeDebate, arguments: [...s.activeDebate.arguments, arg] } };
    });
  },

  onVoteUpdate: (data) => {
    set(s => {
      if (!s.activeDebate || s.activeDebate.id !== data.debateId) return s;
      return { activeDebate: { ...s.activeDebate, votesCounts: data.counts } };
    });
  },

  onDebateClosed: (debate: Debate) => {
    set(s => ({
      debates: s.debates.map(d => d.id === debate.id ? debate : d),
      activeDebate: s.activeDebate?.id === debate.id ? { ...s.activeDebate, ...debate } : s.activeDebate,
    }));
  },

  onPhaseUpdate: (debate: Debate) => {
    set(s => ({
      debates: s.debates.map(d => d.id === debate.id ? { ...d, ...debate } : d),
      activeDebate: s.activeDebate?.id === debate.id ? { ...s.activeDebate, ...debate } : s.activeDebate,
    }));
  },

  onHandsUpdate: (data) => {
    set(s => {
      if (!s.activeDebate || s.activeDebate.id !== data.debateId) return s;
      return { activeDebate: { ...s.activeDebate, raisedHands: data.hands } };
    });
  },
}));
