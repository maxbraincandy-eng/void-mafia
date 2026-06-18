import { create } from 'zustand';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';

export type DebateSide = 'pro' | 'con' | 'spectator';
export type DebateStatus = 'open' | 'finished';

export interface Debate {
  id: string;
  topic: string;
  description: string;
  createdBy: string;
  status: DebateStatus;
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

export interface DebateFull extends Debate {
  participants: DebateParticipant[];
  arguments: DebateArgument[];
  votesCounts: { pro: number; con: number };
  myParticipation: DebateParticipant | null;
  myVote: { side: DebateSide } | null;
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

  onNewDebate: (debate: Debate) => void;
  onParticipantUpdate: (participant: DebateParticipant) => void;
  onNewArgument: (arg: DebateArgument) => void;
  onVoteUpdate: (data: { debateId: string; counts: { pro: number; con: number } }) => void;
  onDebateClosed: (debate: Debate) => void;
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
      return { activeDebate: { ...s.activeDebate, votesCounts: counts, myVote: { side } } };
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
}));
