import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import type { WWWMatchPublic, WWWListItem, WWWChatMsg } from '@/types/www';

function unwrap<T>(res: { ok: boolean; data?: T; error?: string }): T {
  if (!res.ok) throw new Error((res as any).error ?? 'Unknown error');
  return (res as any).data as T;
}

interface WWWStore {
  match: WWWMatchPublic | null;
  matchList: WWWListItem[];
  isLoading: boolean;
  error: string | null;

  fetchList: () => Promise<void>;
  createMatch: (nickname: string) => Promise<void>;
  joinMatch: (code: string, nickname: string) => Promise<void>;
  leaveMatch: () => Promise<void>;
  startMatch: () => Promise<void>;
  advanceDiscussion: () => Promise<void>;
  submitAnswer: (answerText: string) => Promise<void>;
  judgeAnswer: (teamId: string, isCorrect: boolean) => Promise<void>;
  nextQuestion: () => Promise<void>;
  sendChat: (text: string, nickname: string) => Promise<void>;
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
    } catch (e: any) { set({ error: e.message }); }
  },

  createMatch: async (nickname) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('www:create', { nickname });
      set({ match: unwrap(res), isLoading: false });
    } catch (e: any) { set({ isLoading: false, error: e.message }); }
  },

  joinMatch: async (code, nickname) => {
    set({ isLoading: true, error: null });
    try {
      const res = await emitWithAck<any, any>('www:join', { code, nickname });
      set({ match: unwrap(res), isLoading: false });
    } catch (e: any) { set({ isLoading: false, error: e.message }); }
  },

  leaveMatch: async () => {
    const { match } = get();
    if (!match) return;
    try { await emitWithAck<any, any>('www:leave', { matchId: match.id }); } catch { /* ignore */ }
    set({ match: null });
  },

  startMatch: async () => {
    const { match } = get();
    if (!match) return;
    try {
      const res = await emitWithAck<any, any>('www:start', { matchId: match.id });
      if (!(res as any).ok) set({ error: (res as any).error });
    } catch (e: any) { set({ error: e.message }); }
  },

  advanceDiscussion: async () => {
    const { match } = get();
    if (!match) return;
    try {
      const res = await emitWithAck<any, any>('www:advance_discussion', { matchId: match.id });
      if (!(res as any).ok) set({ error: (res as any).error });
    } catch (e: any) { set({ error: e.message }); }
  },

  submitAnswer: async (answerText) => {
    const { match } = get();
    if (!match) return;
    try {
      const res = await emitWithAck<any, any>('www:submit_answer', { matchId: match.id, answerText });
      if (!(res as any).ok) set({ error: (res as any).error });
    } catch (e: any) { set({ error: e.message }); }
  },

  judgeAnswer: async (teamId, isCorrect) => {
    const { match } = get();
    if (!match) return;
    try {
      const res = await emitWithAck<any, any>('www:judge', { matchId: match.id, teamId, isCorrect });
      if (!(res as any).ok) set({ error: (res as any).error });
    } catch (e: any) { set({ error: e.message }); }
  },

  nextQuestion: async () => {
    const { match } = get();
    if (!match) return;
    try {
      const res = await emitWithAck<any, any>('www:next_question', { matchId: match.id });
      if (!(res as any).ok) set({ error: (res as any).error });
    } catch (e: any) { set({ error: e.message }); }
  },

  sendChat: async (text, nickname) => {
    const { match } = get();
    if (!match) return;
    try { await emitWithAck<any, any>('www:chat', { matchId: match.id, text, nickname }); } catch { /* ignore */ }
  },

  clearError: () => set({ error: null }),
}));

// ── Socket listeners ───────────────────────────────────────────────────────
(socket as any).on('www:state', (data: WWWMatchPublic) => {
  useWWWStore.setState({ match: data });
});

(socket as any).on('www:chat', (msg: WWWChatMsg) => {
  const { match } = useWWWStore.getState();
  if (!match) return;
  useWWWStore.setState({ match: { ...match, chat: [...match.chat, msg].slice(-60) } });
});

(socket as any).on('www:list_update', (list: WWWListItem[]) => {
  useWWWStore.setState({ matchList: list });
});
