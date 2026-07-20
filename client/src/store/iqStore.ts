import { create } from 'zustand';
import { emitWithAck } from '@/lib/socket';
import type {
  IQStartResponse, IQScoreResult, IQLeaderRow, IQMyStatus, IQScope,
} from '@/types/iq';

function unwrap<T>(res: any): T { if (!res?.ok) throw new Error(res?.error ?? 'Unknown error'); return res.data as T; }

interface IQStore {
  status: IQMyStatus | null;
  loadingStatus: boolean;
  board: IQLeaderRow[];
  myRow: IQLeaderRow | null;
  scope: IQScope;
  loadingBoard: boolean;
  error: string | null;

  fetchStatus: () => Promise<void>;
  startTest: () => Promise<IQStartResponse>;
  submitTest: (answers: { questionId: string; optionId: string | null; timeMs: number }[], meta: { totalMs: number; tabBlurs: number; startedAt: number }) => Promise<IQScoreResult>;
  fetchBoard: (scope: IQScope) => Promise<void>;
  modRemove: (userId: string) => Promise<void>;
  clearError: () => void;
}

export const useIQStore = create<IQStore>((set, get) => ({
  status: null, loadingStatus: false, board: [], myRow: null, scope: 'all', loadingBoard: false, error: null,

  fetchStatus: async () => {
    set({ loadingStatus: true });
    try { const r = await emitWithAck<void, any>('iq:me'); set({ status: unwrap<IQMyStatus>(r), loadingStatus: false }); }
    catch (e: any) { set({ error: e.message, loadingStatus: false }); }
  },

  startTest: async () => {
    const r = await emitWithAck<void, any>('iq:start');
    return unwrap<IQStartResponse>(r);
  },

  submitTest: async (answers, meta) => {
    const r = await emitWithAck<any, any>('iq:submit', { answers, meta });
    const result = unwrap<IQScoreResult>(r);
    // Refresh personal status after a completed attempt.
    get().fetchStatus().catch(() => {});
    return result;
  },

  fetchBoard: async (scope) => {
    set({ loadingBoard: true, scope });
    try {
      const r = await emitWithAck<{ scope: IQScope }, any>('iq:leaderboard', { scope });
      const data = unwrap<{ scope: IQScope; rows: IQLeaderRow[]; myRow: IQLeaderRow | null }>(r);
      set({ board: data.rows, myRow: data.myRow, loadingBoard: false });
    } catch (e: any) { set({ error: e.message, loadingBoard: false }); }
  },

  modRemove: async (userId) => {
    try {
      const r = await emitWithAck<{ userId: string }, any>('iq:mod_remove', { userId });
      if (!r?.ok) { set({ error: r?.error ?? 'ვერ წაიშალა' }); return; }
      await get().fetchBoard(get().scope);
    } catch (e: any) { set({ error: e.message }); }
  },

  clearError: () => set({ error: null }),
}));

export async function fetchIQProfile(userId: string) {
  const r = await emitWithAck<{ userId: string }, any>('iq:profile', { userId });
  if (!r?.ok) return null;
  return r.data as import('@/types/iq').IQPublicProfile;
}
