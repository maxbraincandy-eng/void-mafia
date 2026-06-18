import { create } from 'zustand';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';

export type ActivityEventType = 'posted' | 'followed' | 'became_friends' | 'joined_debate' | 'debate_argument';

export interface ActivityEvent {
  id: string;
  actorId: string;
  eventType: ActivityEventType;
  targetId: string | null;
  payload: Record<string, unknown>;
  createdAt: number;
  actorUsername?: string;
  actorAvatarUrl?: string | null;
}

function unwrap<T>(res: Res<T>): T {
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

interface ActivityStore {
  events: ActivityEvent[];
  loading: boolean;
  error: string | null;
  fetchFeed: () => Promise<void>;
}

export const useActivityStore = create<ActivityStore>((set) => ({
  events: [],
  loading: false,
  error: null,

  fetchFeed: async () => {
    set({ loading: true, error: null });
    try {
      const res = await emitWithAck<Record<string, never>, Res<ActivityEvent[]>>('activity:feed', {});
      const events = unwrap(res);
      set({ events, loading: false });
    } catch (e: unknown) {
      set({ loading: false, error: (e as Error).message });
    }
  },
}));
