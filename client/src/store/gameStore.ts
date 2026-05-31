import { create } from 'zustand';
import {
  RoomPublic, PlayerPublic, PlayerProfilePublic, Role, ChatMessage, Phase,
  NightResult, InvestigationResult, GameOverResult, ChatChannel, GameSettings,
} from '@/types/index';
import { socket, connectSocket, disconnectSocket, emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';

interface Toast {
  id: string;
  text: string;
  type: 'info' | 'success' | 'error';
}

interface GameStore {
  // Connection
  isConnected: boolean;

  // Room & player
  room: RoomPublic | null;
  myPlayerId: string | null;
  myRole: Role | null;

  // Notifications
  nightResult: NightResult | null;
  investigationResult: InvestigationResult | null;
  spyReport: { mafiaTarget: string | null; mafiaTargetName: string | null } | null;
  gameOverResult: GameOverResult | null;
  modNotice: { type: 'ban' | 'mute' | 'warn'; reason: string; expiresAt?: number; moderatorName?: string } | null;
  toasts: Toast[];

  // UI
  isLoading: boolean;
  error: string | null;

  // Computed helpers
  myPlayer: () => PlayerPublic | null;
  amHost: () => boolean;
  amAlive: () => boolean;

  // Actions
  connect: () => void;
  disconnect: () => void;
  createRoom: (name: string, settings?: Partial<GameSettings>) => Promise<void>;
  joinRoom: (code: string, name: string, isSpectator?: boolean) => Promise<void>;
  leaveRoom: () => Promise<void>;
  toggleReady: () => Promise<void>;
  kickPlayer: (playerId: string) => Promise<void>;
  transferHost: (playerId: string) => Promise<void>;
  updateSettings: (settings: Partial<GameSettings>) => Promise<void>;
  startGame: () => Promise<void>;
  submitNightAction: (targetId: string) => Promise<void>;
  submitVote: (targetId: string | null) => Promise<void>;
  sendChat: (text: string, channel: ChatChannel) => Promise<void>;
  skipPhase: () => Promise<void>;
  daySkipVote: () => Promise<void>;
  restartGame: () => Promise<void>;
  dismissNightResult: () => void;
  dismissInvestigation: () => void;
  dismissSpyReport: () => void;
  dismissGameOver: () => void;
  dismissModNotice: () => void;
  addToast: (text: string, type?: Toast['type']) => void;
  clearError: () => void;
  setWill: (text: string) => Promise<void>;
  pauseTimer: () => Promise<void>;
  getLeaderboard: () => Promise<PlayerProfilePublic[]>;
}

let toastCounter = 0;

export const useGameStore = create<GameStore>((set, get) => {
  // ── Socket event bindings ────────────────────────────────────────
  socket.on('connect', () => {
    const { room, myPlayerId } = get();
    set({ isConnected: true });
    // Auto-rejoin room after transport reconnect
    if (room && myPlayerId) {
      const player = room.players.find(p => p.id === myPlayerId);
      if (player) {
        emitWithAck<unknown, Res<RoomPublic>>('room:join', {
          code: room.code,
          name: player.name,
          isSpectator: player.isSpectator,
        }).then(res => {
          if (res.ok) {
            set({ room: res.data });
            get().addToast('Reconnected ✓', 'success');
          } else {
            set({ room: null, myPlayerId: null, myRole: null, nightResult: null, investigationResult: null, gameOverResult: null });
            get().addToast('Room closed while disconnected', 'error');
          }
        }).catch(() => {});
      }
    }
  });
  socket.on('disconnect', () => set({ isConnected: false }));

  socket.on('room:update', (room: RoomPublic) => {
    const prev = get();
    const prevPhase = prev.room?.phase;

    // When any client sees the phase leave game_over (host restarted),
    // clear all stale per-game state so old overlays don't bleed into the new game.
    if (prevPhase === 'game_over' && room.phase !== 'game_over') {
      set({ room, gameOverResult: null, myRole: null, nightResult: null, investigationResult: null, spyReport: null });
    } else if (room.phase === 'role_reveal' && prevPhase === 'lobby') {
      // New game just started — ensure game-over overlay is gone
      set({ room, gameOverResult: null, nightResult: null, investigationResult: null, spyReport: null });
    } else {
      set({ room });
    }
  });

  socket.on('chat:new', (msg: ChatMessage) => {
    set(state => {
      if (!state.room) return state;
      const field = msg.channel === 'mafia' ? 'mafiaChat' : 'chat';
      return {
        room: {
          ...state.room,
          [field]: [...(state.room[field] ?? []), msg].slice(-200),
        },
      };
    });
  });

  socket.on('game:role', ({ role }: { role: Role }) => {
    set({ myRole: role });
  });

  socket.on('game:night_result', (result: NightResult) => {
    set({ nightResult: result });
  });

  socket.on('game:investigation', (result: InvestigationResult) => {
    set({ investigationResult: result });
  });

  (socket as any).on('game:track_result', ({ trackedName, visitedName }: { trackedName: string; visitedName: string | null }) => {
    const msg = visitedName
      ? `🔎 You tracked ${trackedName}: they visited ${visitedName}.`
      : `🔎 You tracked ${trackedName}: they did not leave the house.`;
    get().addToast(msg, 'info');
  });

  (socket as any).on('spy:night_report', (data: { mafiaTarget: string | null; mafiaTargetName: string | null }) => {
    set({ spyReport: data });
  });

  socket.on('game:over', (result: GameOverResult) => {
    set({ gameOverResult: result });
  });

  socket.on('kicked', ({ reason }: { reason: string }) => {
    set({
      room: null,
      myPlayerId: null,
      myRole: null,
      nightResult: null,
      investigationResult: null,
      gameOverResult: null,
      modNotice: { type: 'warn', reason },
    });
    get().addToast(reason, 'error');
  });

  socket.on('ban:received', ({ reason, expiresAt }: { reason: string; expiresAt?: number }) => {
    set({
      modNotice: { type: 'ban', reason, expiresAt },
      room: null,
    });
  });

  socket.on('mute:received', ({ reason, expiresAt }: { reason: string; expiresAt?: number }) => {
    set({ modNotice: { type: 'mute', reason, expiresAt } });
  });

  socket.on('warning:received', ({ reason, moderatorName }: { reason: string; moderatorName?: string }) => {
    set({ modNotice: { type: 'warn', reason, moderatorName } });
  });

  socket.on('error', ({ message }: { message: string }) => {
    get().addToast(message, 'error');
  });

  // ── Helper ───────────────────────────────────────────────────────
  async function emit<T>(event: string, data?: unknown): Promise<T> {
    const res = await emitWithAck<unknown, Res<T>>(event, data);
    if (!res.ok) throw new Error(res.error);
    return res.data;
  }

  function withLoading<TArgs extends unknown[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn>
  ): (...args: TArgs) => Promise<void> {
    return async (...args: TArgs) => {
      set({ isLoading: true, error: null });
      try {
        await fn(...args);
      } catch (e: any) {
        const msg = e?.message ?? 'An error occurred.';
        set({ error: msg });
        get().addToast(msg, 'error');
      } finally {
        set({ isLoading: false });
      }
    };
  }

  return {
    isConnected: false,
    room: null,
    myPlayerId: null,
    myRole: null,
    nightResult: null,
    investigationResult: null,
    spyReport: null,
    gameOverResult: null,
    modNotice: null,
    toasts: [],
    isLoading: false,
    error: null,

    myPlayer: () => {
      const { room, myPlayerId } = get();
      return room?.players.find(p => p.id === myPlayerId) ?? null;
    },
    amHost: () => get().myPlayer()?.isHost ?? false,
    amAlive: () => get().myPlayer()?.isAlive ?? false,

    connect: () => {
      connectSocket();
    },

    disconnect: () => {
      disconnectSocket();
      set({ room: null, myPlayerId: null, myRole: null });
    },

    createRoom: withLoading(async (name: string, settings?: Partial<GameSettings>) => {
      const room = await emit<RoomPublic>('room:create', { name, settings });
      set({ room, myPlayerId: room.players.find(p => p.isHost)?.id ?? null });
    }),

    joinRoom: withLoading(async (code: string, name: string, isSpectator = false) => {
      const room = await emit<RoomPublic>('room:join', { code, name, isSpectator });
      // My player is the one who isn't already in our store
      const myPlayer = room.players.find(p => p.name === name);
      set({ room, myPlayerId: myPlayer?.id ?? null });
    }),

    leaveRoom: withLoading(async () => {
      await emit('room:leave');
      set({
        room: null,
        myPlayerId: null,
        myRole: null,
        nightResult: null,
        investigationResult: null,
        gameOverResult: null,
      });
    }),

    toggleReady: withLoading(async () => {
      await emit('room:ready');
    }),

    kickPlayer: withLoading(async (playerId: string) => {
      await emit('room:kick', { playerId });
    }),

    transferHost: withLoading(async (playerId: string) => {
      await emit('room:transfer_host', { playerId });
    }),

    updateSettings: withLoading(async (settings: Partial<GameSettings>) => {
      await emit('room:settings', { settings });
    }),

    startGame: withLoading(async () => {
      await emit('game:start');
    }),

    submitNightAction: withLoading(async (targetId: string) => {
      await emit('game:action', { targetId });
    }),

    submitVote: withLoading(async (targetId: string | null) => {
      await emit('game:vote', { targetId });
    }),

    sendChat: withLoading(async (text: string, channel: ChatChannel) => {
      await emit('chat:send', { text, channel });
    }),

    skipPhase: withLoading(async () => {
      await emit('game:skip');
    }),

    daySkipVote: withLoading(async () => {
      await emit('game:day_skip_vote');
    }),

    restartGame: withLoading(async () => {
      await emit('game:restart');
      set({ myRole: null, nightResult: null, investigationResult: null, spyReport: null, gameOverResult: null });
    }),

    dismissNightResult: () => set({ nightResult: null }),
    dismissInvestigation: () => set({ investigationResult: null }),
    dismissSpyReport: () => set({ spyReport: null }),
    dismissGameOver: () => set({ gameOverResult: null }),
    dismissModNotice: () => set({ modNotice: null }),

    addToast: (text: string, type: Toast['type'] = 'info') => {
      const id = `t_${++toastCounter}`;
      set(s => ({ toasts: [...s.toasts, { id, text, type }] }));
      setTimeout(() => {
        set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
      }, 4000);
    },

    clearError: () => set({ error: null }),

    setWill: withLoading(async (text: string) => {
      await emit('game:set_will', { text });
    }),

    pauseTimer: withLoading(async () => {
      await emit('game:pause');
    }),

    getLeaderboard: async () => {
      const res = await emitWithAck<unknown, any>('leaderboard:get', undefined);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  };
});
