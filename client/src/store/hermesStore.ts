import { create } from 'zustand';

export type HermesMode =
  | 'philosopher'
  | 'mafia_coach'
  | 'debate_helper'
  | 'recommendations'
  | 'void_oracle'
  | 'general';

export interface HermesMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

export interface HermesContext {
  source?: 'feed' | 'debate' | 'game' | 'profile' | 'voice' | 'community';
  debateId?: string;
  debateTitle?: string;
  debateDescription?: string;
  userSide?: string;
  gameType?: string;
  roomId?: string;
  postId?: string;
  postContent?: string;
  phase?: string;
}

interface HermesStore {
  isOpen: boolean;
  mode: HermesMode;
  messages: HermesMessage[];
  isThinking: boolean;
  error: string | null;
  isEnabled: boolean;
  context: HermesContext | null;
  dailyRemaining: number | null;

  open: (context?: HermesContext) => void;
  close: () => void;
  setMode: (mode: HermesMode) => void;
  sendMessage: (text: string, uid: string) => Promise<void>;
  clearMessages: () => void;
  clearError: () => void;
  checkStatus: () => Promise<void>;
}

export const useHermesStore = create<HermesStore>((set, get) => ({
  isOpen: false,
  mode: 'general',
  messages: [],
  isThinking: false,
  error: null,
  isEnabled: true,
  context: null,
  dailyRemaining: null,

  open: (context) => set({ isOpen: true, context: context ?? null }),
  close: () => set({ isOpen: false }),
  // Switching category starts a fresh view so that mode's quick prompts show
  // (no need to clear history manually). The server keeps per-mode history.
  setMode: (mode) => set(s => (s.mode === mode ? {} : { mode, messages: [], error: null })),
  clearMessages: () => set({ messages: [], error: null }),
  clearError: () => set({ error: null }),

  checkStatus: async () => {
    try {
      const res = await fetch('/api/hermes/status');
      const data = await res.json();
      set({ isEnabled: data.enabled ?? false });
    } catch {
      set({ isEnabled: false });
    }
  },

  sendMessage: async (text, uid) => {
    const { mode, context } = get();
    if (!text.trim() || !uid) return;

    const userMsg: HermesMessage = {
      id: `${Date.now()}-u`,
      role: 'user',
      content: text.trim(),
      ts: Date.now(),
    };

    set(s => ({ messages: [...s.messages, userMsg], isThinking: true, error: null }));

    try {
      const res = await fetch('/api/hermes/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, message: text.trim(), mode, context }),
      });
      const data = await res.json();

      if (!data.ok) {
        set({ isThinking: false, error: data.error ?? 'Something went wrong.' });
        return;
      }

      const assistantMsg: HermesMessage = {
        id: `${Date.now()}-a`,
        role: 'assistant',
        content: data.answer,
        ts: Date.now(),
      };

      set(s => ({
        messages: [...s.messages, assistantMsg],
        isThinking: false,
        dailyRemaining: data.remaining ?? s.dailyRemaining,
      }));
    } catch (e: any) {
      set({ isThinking: false, error: e.message ?? 'Network error.' });
    }
  },
}));
