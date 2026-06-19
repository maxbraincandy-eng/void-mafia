import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';

export interface WWWQuestion {
  id: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionText: string;
  correctAnswer: string;
  explanation: string;
}

export interface WWWSettings {
  mode: string;
  maxTeams: number;
  maxPlayersPerTeam: number;
  questionsCount: number;
  discussionSeconds: number;
  answerSeconds: number;
  spectatorsAllowed: boolean;
  spectatorVoiceAllowed: boolean;
  hostIsJudge: boolean;
  autoRevealAnswer: boolean;
  questionCategory: string;
  difficulty: string;
}

export interface WWWPlayer {
  userId: string;
  nickname: string;
  teamId: string | null;
  role: 'player' | 'captain' | 'judge' | 'spectator';
  connected: boolean;
}

export interface WWWTeam {
  id: string;
  name: string;
  color: string;
  captainId: string | null;
  playerIds: string[];
}

export interface WWWSubmittedAnswer {
  teamId: string;
  captainId: string;
  answerText: string;
  submittedAt: number;
  isCorrect?: boolean;
  judgeNote?: string;
}

export interface WWWMatchPublic {
  id: string;
  code: string;
  status: string;
  hostId: string;
  players: Record<string, WWWPlayer>;
  spectators: string[];
  settings: WWWSettings;
  teams: WWWTeam[];
  currentQuestion: WWWQuestion | null;
  currentQuestionIndex: number;
  totalQuestions: number;
  submittedAnswers: Record<string, WWWSubmittedAnswer>;
  scores: Record<string, number>;
  timerEndsAt: number | null;
  voiceSessionId: string;
  chat: { userId: string; nickname: string; text: string; ts: number }[];
}

export interface WWWMatchListItem {
  id: string;
  code: string;
  status: string;
  playerCount: number;
  maxPlayers: number;
  mode: string;
  category: string;
}

function unwrap<T>(res: { ok: boolean; data?: T; error?: string }): T {
  if (!res.ok) throw new Error((res as any).error ?? 'Unknown error');
  return (res as any).data as T;
}

interface WWWStore {
  match: WWWMatchPublic | null;
  matchList: WWWMatchListItem[];
  isLoading: boolean;
  error: string | null;

  fetchList: () => Promise<void>;
  createMatch: (settings?: Partial<WWWSettings>) => Promise<void>;
  joinMatch: (code: string, nickname: string) => Promise<void>;
  spectateMatch: (code: string, nickname: string) => Promise<void>;
  leaveMatch: () => Promise<void>;
  joinTeam: (teamId: string) => Promise<void>;
  assignCaptain: (targetUserId: string, teamId: string) => Promise<void>;
  startMatch: () => Promise<void>;
  advanceDiscussion: () => Promise<void>;
  submitAnswer: (text: string) => Promise<void>;
  judgeAnswer: (teamId: string, isCorrect: boolean, judgeNote?: string) => Promise<void>;
  nextQuestion: () => Promise<void>;
  sendChat: (text: string) => Promise<void>;
  clearError: () => void;
}

export const useWWWStore = create<WWWStore>((set, get) => ({
  match: null,
  matchList: [],
  isLoading: false,
  error: null,

  fetchList: async () => {
    try {
      const res = await emitWithAck<void, any>('www:list');
      set({ matchList: unwrap(res) });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  createMatch: async (settings?: Partial<WWWSettings>) => {
    set({ isLoading: true, error: null });
    try {
      // Get nickname from socket or use default
      const nickname = 'Player';
      const res = await emitWithAck<any, any>('www:create', { nickname, settings });
      const match = unwrap<WWWMatchPublic>(res);
      set({ match, isLoading: false });
    } catch (e: any) {
      set({ isLoading: false, error: e.message });
    }
  },

  joinMatch: async (code: string, nickname: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('www:join', { code, nickname });
      const match = unwrap<WWWMatchPublic>(res);
      set({ match, isLoading: false });
    } catch (e: any) {
      set({ isLoading: false, error: e.message });
    }
  },

  spectateMatch: async (code: string, nickname: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('www:spectate', { code, nickname });
      const match = unwrap<WWWMatchPublic>(res);
      set({ match, isLoading: false });
    } catch (e: any) {
      set({ isLoading: false, error: e.message });
    }
  },

  leaveMatch: async () => {
    const { match } = get();
    if (!match) return;
    try {
      await emitWithAck<any, any>('www:leave');
    } catch { /* ignore */ }
    set({ match: null });
  },

  joinTeam: async (teamId: string) => {
    set({ error: null });
    try {
      const res = await emitWithAck<any, any>('www:join-team', { teamId });
      if (!res.ok) set({ error: res.error });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  assignCaptain: async (targetUserId: string, teamId: string) => {
    set({ error: null });
    try {
      const res = await emitWithAck<any, any>('www:assign-captain', { targetUserId, teamId });
      if (!res.ok) set({ error: res.error });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  startMatch: async () => {
    set({ error: null });
    try {
      const res = await emitWithAck<any, any>('www:start');
      if (!res.ok) set({ error: res.error });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  advanceDiscussion: async () => {
    set({ error: null });
    try {
      const res = await emitWithAck<any, any>('www:advance-discussion');
      if (!res.ok) set({ error: res.error });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  submitAnswer: async (text: string) => {
    set({ error: null });
    try {
      const res = await emitWithAck<any, any>('www:submit-answer', { answerText: text });
      if (!res.ok) set({ error: res.error });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  judgeAnswer: async (teamId: string, isCorrect: boolean, judgeNote?: string) => {
    set({ error: null });
    try {
      const res = await emitWithAck<any, any>('www:judge-answer', { teamId, isCorrect, judgeNote });
      if (!res.ok) set({ error: res.error });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  nextQuestion: async () => {
    set({ error: null });
    try {
      const res = await emitWithAck<any, any>('www:next-question');
      if (!res.ok) set({ error: res.error });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  sendChat: async (text: string) => {
    const { match } = get();
    if (!match) return;
    try {
      await emitWithAck<any, any>('www:chat', { text });
    } catch { /* ignore */ }
  },

  clearError: () => set({ error: null }),
}));

// ── Socket listeners registered once at module level ──────────────────

(socket as any).on('www:state', (data: WWWMatchPublic) => {
  useWWWStore.setState({ match: data });
});
