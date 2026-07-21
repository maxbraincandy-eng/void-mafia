import { create } from 'zustand';
import { emitWithAck } from '@/lib/socket';
import type { MPBoardRow, MPBoardScope, MPResult, MPTrait } from '@/components/maxpuzzle/types';

function unwrap<T>(res: any): T { if (!res?.ok) throw new Error(res?.error ?? 'Unknown error'); return res.data as T; }

interface MaxPuzzleStore {
  board: MPBoardRow[];
  myRow: MPBoardRow | null;
  scope: MPBoardScope;
  loadingBoard: boolean;
  error: string | null;

  submitResult: (r: MPResult) => Promise<void>;
  fetchBoard: (scope: MPBoardScope) => Promise<void>;
  modRemove: (userId: string) => Promise<void>;
  clearError: () => void;
}

export const useMaxPuzzleStore = create<MaxPuzzleStore>((set, get) => ({
  board: [], myRow: null, scope: 'independence', loadingBoard: false, error: null,

  submitResult: async (r) => {
    // Fire-and-forget persistence; the local result screen never depends on it.
    try {
      await emitWithAck<any, any>('maxpuzzle:submit', {
        archetype: r.primary.id,
        archetypeKa: r.primary.ka,
        traits: r.traits as Record<MPTrait, number>,
      });
    } catch { /* offline / guest — result still shown locally */ }
  },

  fetchBoard: async (scope) => {
    set({ loadingBoard: true, scope });
    try {
      const r = await emitWithAck<{ scope: MPBoardScope }, any>('maxpuzzle:leaderboard', { scope });
      const data = unwrap<{ scope: MPBoardScope; rows: MPBoardRow[]; myRow: MPBoardRow | null }>(r);
      set({ board: data.rows, myRow: data.myRow, loadingBoard: false });
    } catch (e: any) { set({ error: e.message, loadingBoard: false }); }
  },

  modRemove: async (userId) => {
    try {
      const r = await emitWithAck<{ userId: string }, any>('maxpuzzle:mod_remove', { userId });
      if (!r?.ok) { set({ error: r?.error ?? 'ვერ წაიშალა' }); return; }
      await get().fetchBoard(get().scope);
    } catch (e: any) { set({ error: e.message }); }
  },

  clearError: () => set({ error: null }),
}));
