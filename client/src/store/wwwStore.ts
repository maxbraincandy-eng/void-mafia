import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';

// ── Types ──────────────────────────────────────────────────────────────────
export type WWWDifficulty = 'easy' | 'medium' | 'hard' | 'mixed';
export type WWWCategory = 'philosophy' | 'history' | 'science' | 'movies' | 'literature' | 'geography' | 'psychology' | 'logic' | 'general' | 'mixed';
export type WWWMode = 'team' | 'single_team';
export type WWWStatus = 'waiting' | 'question' | 'discussion' | 'judging' | 'round_result' | 'finished';
export type WWWRole = 'player' | 'captain' | 'spectator';

export interface WWWQuestion {
  id: string;
  category: WWWCategory;
  difficulty: 'easy' | 'medium' | 'hard';
  questionText: string;
  correctAnswer: string;
  explanation: string;
}

export interface WWWSettings {
  mode: WWWMode;
  maxTeams: number;
  maxPlayersPerTeam: number;
  questionsCount: number;
  discussionSeconds: number;
  spectatorsAllowed: boolean;
  hostIsJudge: boolean;
  autoRevealAnswer: boolean;
  questionCategory: WWWCategory;
  difficulty: WWWDifficulty;
}

export interface WWWPlayer {
  userId: string;
  nickname: string;
  teamId: string | null;
  role: WWWRole;
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

export interface WWWChat {
  userId: string;
  nickname: string;
  text: string;
  ts: number;
}

export interface WWWMatchPublic {
  id: string;
  code: string;
  status: WWWStatus;
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
  chat: WWWChat[];
}

export interface WWWMatchListItem {
  id: string;
  code: string;
  status: WWWStatus;
  playerCount: number;
  mode: WWWMode;
  category: WWWCategory;
  hostNickname: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function unwrap<T>(res: { ok: boolean; data?: T; error?: string }): T {
  if (!res.ok) throw new Error((res as any).error ?? 'Unknown error');
  return (res as any).data as T;
}

// ── Store ──────────────────────────────────────────────────────────────────
interface WWWStore {
  match: WWWMatchPublic | null;
  matchList: WWWMatchListItem[];
  isLoading: boolean;
  error: string | null;

  fetchList: () => Promise<void>;
  createMatch: (settings?: Partial<WWWSettings>, nickname?: string) => Promise<void>;
  joinMatch: (code: string, nickname: string) => Promise<void>;
  spectateMatch: (matchId: string) => Promise<void>;
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

  createMatch: async (settings?: Partial<WWWSettings>, nickname?: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('www:create', { settings, nickname });
      const raw = unwrap<any>(res);
      set({ match: raw.match, isLoading: false });
    } catch (e: any) {
      set({ isLoading: false, error: e.message });
    }
  },

  joinMatch: async (code: string, nickname: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('www:join', { code, nickname });
      const raw = unwrap<any>(res);
      set({ match: raw.match, isLoading: false });
    } catch (e: any) {
      set({ isLoading: false, error: e.message });
    }
  },

  spectateMatch: async (matchId: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('www:spectate', { matchId });
      const raw = unwrap<any>(res);
      set({ match: raw.match, isLoading: false });
    } catch (e: any) {
      set({ isLoading: false, error: e.message });
    }
  },

  leaveMatch: async () => {
    try {
      await emitWithAck<any, any>('www:leave');
    } catch { /* ignore */ }
    set({ match: null });
  },

  joinTeam: async (teamId: string) => {
    const { match } = get();
    if (!match) return;
    try {
      await emitWithAck<any, any>('www:join-team', { matchId: match.id, teamId });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  assignCaptain: async (targetUserId: string, teamId: string) => {
    const { match } = get();
    if (!match) return;
    try {
      await emitWithAck<any, any>('www:assign-captain', { matchId: match.id, targetUserId, teamId });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  startMatch: async () => {
    const { match } = get();
    if (!match) return;
    try {
      await emitWithAck<any, any>('www:start', { matchId: match.id });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  advanceDiscussion: async () => {
    const { match } = get();
    if (!match) return;
    try {
      await emitWithAck<any, any>('www:advance-discussion', { matchId: match.id });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  submitAnswer: async (text: string) => {
    const { match } = get();
    if (!match) return;
    try {
      await emitWithAck<any, any>('www:submit-answer', { matchId: match.id, answerText: text });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  judgeAnswer: async (teamId: string, isCorrect: boolean, judgeNote?: string) => {
    const { match } = get();
    if (!match) return;
    try {
      await emitWithAck<any, any>('www:judge-answer', { matchId: match.id, teamId, isCorrect, judgeNote });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  nextQuestion: async () => {
    const { match } = get();
    if (!match) return;
    try {
      await emitWithAck<any, any>('www:next-question', { matchId: match.id });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  sendChat: async (text: string) => {
    const { match } = get();
    if (!match) return;
    try {
      await emitWithAck<any, any>('www:chat', { matchId: match.id, text });
    } catch { /* ignore */ }
  },

  clearError: () => set({ error: null }),
}));

// ── Socket listeners registered once at module level ──────────────────────
(socket as any).on('www:state', (data: WWWMatchPublic) => {
  useWWWStore.setState({ match: data });
});
