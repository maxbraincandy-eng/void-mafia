import { create } from 'zustand';
import {
  RoomPublic, PlayerPublic, PlayerProfilePublic, Role, ChatMessage, Phase,
  NightResult, InvestigationResult, GameOverResult, ChatChannel, GameSettings,
  VoteEliminationResult, NightSummary, AchievementEarned, VoteBreakdownEntry,
  XPGain, FriendRequest,
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
  voteEliminationResult: VoteEliminationResult | null;
  cultConversionNotice: boolean;
  nightSummary: NightSummary | null;
  newAchievements: AchievementEarned[];
  voteBreakdown: VoteBreakdownEntry[] | null;
  autoStartCountdown: number | null;
  xpGain: XPGain | null;
  queuePosition: number | null;
  pendingFriendRequests: FriendRequest[];
  modNotice: { type: 'ban' | 'mute' | 'warn'; reason: string; category?: string; expiresAt?: number; moderatorName?: string } | null;
  toasts: Toast[];

  // UI
  isLoading: boolean;
  isReconnecting: boolean;
  connectionFailed: boolean;
  error: string | null;

  // Computed helpers
  myPlayer: () => PlayerPublic | null;
  amHost: () => boolean;
  amAlive: () => boolean;

  // Actions
  connect: () => void;
  disconnect: () => void;
  createRoom: (name: string, settings?: Partial<GameSettings>, clanRoom?: boolean) => Promise<void>;
  joinRoom: (code: string, name: string, isSpectator?: boolean, password?: string, joinMode?: 'player' | 'spectator' | 'next_round') => Promise<void>;
  leaveRoom: () => Promise<void>;
  terminateGame: () => Promise<void>;
  toggleReady: () => Promise<void>;
  kickPlayer: (playerId: string) => Promise<void>;
  transferHost: (playerId: string) => Promise<void>;
  updateSettings: (settings: Partial<GameSettings>) => Promise<void>;
  startGame: () => Promise<void>;
  submitNightAction: (targetId: string) => Promise<void>;
  submitVote: (targetId: string | null) => Promise<void>;
  nominate: (nomineeId: string | null) => Promise<void>;
  sendChat: (text: string, channel: ChatChannel) => Promise<void>;
  skipPhase: () => Promise<void>;
  speechPass: () => Promise<void>;
  daySkipVote: () => Promise<void>;
  issueFoul: () => Promise<void>;
  skipDefense: () => Promise<void>;
  restartGame: () => Promise<void>;
  dismissNightResult: () => void;
  dismissInvestigation: () => void;
  dismissSpyReport: () => void;
  dismissGameOver: () => void;
  dismissVoteElimination: () => void;
  dismissCultConversion: () => void;
  dismissNightSummary: () => void;
  dismissNewAchievements: () => void;
  dismissVoteBreakdown: () => void;
  dismissXPGain: () => void;
  dismissModNotice: () => void;
  rematch: () => Promise<void>;
  addToast: (text: string, type?: Toast['type']) => void;
  clearError: () => void;
  setWill: (text: string) => Promise<void>;
  pauseTimer: () => Promise<void>;
  getLeaderboard: () => Promise<PlayerProfilePublic[]>;
  joinQueue: () => Promise<void>;
  leaveQueue: () => Promise<void>;
}

let toastCounter = 0;

const SESSION_KEY = 'void-mafia-room-session';
// Session expires after 4 hours so stale lobby sessions don't auto-rejoin
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

function saveSession(room: RoomPublic, playerId: string): void {
  try {
    const player = room.players.find(p => p.id === playerId)
      ?? room.nextRoundQueue?.find(p => p.id === playerId);
    if (!player) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      code: room.code,
      playerId,
      playerName: player.name,
      isSpectator: player.isSpectator ?? false,
      savedAt: Date.now(),
    }));
  } catch { /* ignore */ }
}

function clearSession(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

/** Exported so App.tsx can detect a pending session on initial paint */
export function hasPendingSession(): boolean {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw) as { savedAt?: number };
    if (s.savedAt && Date.now() - s.savedAt > SESSION_TTL_MS) {
      localStorage.removeItem(SESSION_KEY);
      return false;
    }
    return true;
  } catch { return false; }
}

export const useGameStore = create<GameStore>((set, get) => {
  // ── Session restore after browser refresh ─────────────────────
  // Transport reconnects are handled by the socket 'connect' event below.
  // Full page refreshes lose in-memory state; we wait for auth to complete
  // (vm:auth-ready fires from authStore after player:auth succeeds) then
  // restore from localStorage.
  window.addEventListener('vm:auth-ready', () => {
    if (get().room) return; // already in room (transport reconnect already handled)
    let saved: { code: string; playerId: string; playerName: string; isSpectator: boolean; savedAt?: number } | null = null;
    try { saved = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); } catch { /* ignore */ }
    if (!saved) return;
    // Discard expired sessions
    if (saved.savedAt && Date.now() - saved.savedAt > SESSION_TTL_MS) {
      clearSession();
      return;
    }
    set({ isReconnecting: true });
    emitWithAck<unknown, Res<RoomPublic>>('room:join', {
      code: saved.code,
      name: saved.playerName,
      isSpectator: saved.isSpectator,
    }).then(res => {
      if (res.ok) {
        const room = res.data;
        const myPlayer = room.players.find(p => p.id === saved!.playerId)
          ?? room.players.find(p => p.name === saved!.playerName)
          ?? room.nextRoundQueue?.find(p => p.id === saved!.playerId);
        set({ room, myPlayerId: myPlayer?.id ?? saved!.playerId, isReconnecting: false });
        get().addToast('დაბრუნდი ✓', 'success');
      } else {
        clearSession();
        set({ isReconnecting: false });
        // Silent — no toast for expired room; just land on rooms page
      }
    }).catch(() => { set({ isReconnecting: false }); });
  });

  // ── Socket event bindings ────────────────────────────────────────
  socket.on('connect', () => {
    const { room, myPlayerId } = get();
    set({ isConnected: true, isLoading: false, error: null, connectionFailed: false });
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    // Auto-rejoin room after transport reconnect
    if (room && myPlayerId) {
      const player = room.players.find(p => p.id === myPlayerId)
        ?? room.nextRoundQueue?.find(p => p.id === myPlayerId);
      if (player) {
        emitWithAck<unknown, Res<RoomPublic>>('room:join', {
          code: room.code,
          name: player.name,
          isSpectator: player.isSpectator,
          joinMode: player.isQueuedNextRound ? 'next_round' : (player.isSpectator ? 'spectator' : undefined),
        }).then(res => {
          if (res.ok) {
            set({ room: res.data, isReconnecting: false });
            get().addToast('Reconnected ✓', 'success');
          } else {
            set({ room: null, myPlayerId: null, myRole: null, nightResult: null, investigationResult: null, gameOverResult: null, isReconnecting: false });
            get().addToast('Room closed while disconnected', 'error');
          }
        }).catch(() => { set({ isReconnecting: false }); });
      } else {
        set({ isReconnecting: false });
      }
    } else {
      set({ isReconnecting: false });
    }
  });

  socket.on('disconnect', () => {
    const { room } = get();
    set({ isConnected: false, isLoading: false });
    if (room) {
      set({ isReconnecting: true });
      get().addToast('Reconnecting…', 'info');
    }
  });

  socket.on('connect_error', () => {
    set({ isConnected: false });
  });

  // 5. Session replaced — another device logged into this account
  (socket as any).on('session:replaced', ({ reason }: { reason: string }) => {
    clearSession();
    set({
      room: null, myPlayerId: null, myRole: null,
      nightResult: null, investigationResult: null, gameOverResult: null,
      isConnected: false,
    });
    get().addToast(reason, 'error');
  });

  // Lightweight timer tick — avoids broadcasting full room state every second
  socket.on('room:timer', (remaining: number) => {
    set(s => s.room ? { room: { ...s.room, timer: remaining } } : {});
  });

  socket.on('room:update', (room: RoomPublic) => {
    const prev = get();
    const prevPhase = prev.room?.phase;

    // room:update confirms the server processed our action — always clear loading.
    // This is a safety net for cases where the ack callback arrives late or not at all.
    const extra: Partial<GameStore> = { isLoading: false };

    // When any client sees the phase leave game_over (host restarted),
    // clear all stale per-game state so old overlays don't bleed into the new game.
    if (prevPhase === 'game_over' && room.phase !== 'game_over') {
      set({ room, gameOverResult: null, myRole: null, nightResult: null, investigationResult: null, spyReport: null, ...extra });
    } else if (room.phase === 'role_reveal' && prevPhase === 'lobby') {
      // New game just started — ensure game-over overlay is gone
      set({ room, gameOverResult: null, nightResult: null, investigationResult: null, spyReport: null, ...extra });
    } else {
      set({ room, ...extra });
    }
  });

  socket.on('chat:new', (msg: ChatMessage) => {
    set(state => {
      if (!state.room) return state;
      if (msg.channel === 'mafia') {
        return { room: { ...state.room, mafiaChat: [...state.room.mafiaChat, msg].slice(-200) } };
      } else if (msg.channel === 'dead') {
        return { room: { ...state.room, deadChat: [...state.room.deadChat, msg].slice(-200) } };
      } else if (msg.channel === 'spectator') {
        return { room: { ...state.room, spectatorChat: [...(state.room.spectatorChat ?? []), msg].slice(-200) } };
      } else {
        return { room: { ...state.room, chat: [...state.room.chat, msg].slice(-200) } };
      }
    });
  });

  socket.on('game:role', ({ role }: { role: Role }) => {
    const prev = get().myRole;
    set({ myRole: role });
    // Cult conversion: show overlay when role changes to cultist
    if (role.key === 'cultist' && prev?.key !== 'cultist') {
      set({ cultConversionNotice: true });
    }
  });

  (socket as any).on('game:vote_result', (data: VoteEliminationResult) => {
    set({ voteEliminationResult: data });
  });

  (socket as any).on('game:roleblocked', () => {
    get().addToast('🚫 Your action was blocked tonight!', 'info');
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

  (socket as any).on('game:yakuza_ally', ({ allyRole, allyName }: { allyRole: string; allyId: string | null; allyName: string | null }) => {
    if (allyName) {
      const roleLabel = allyRole === 'shogun' ? 'Shogun' : 'Yakuza';
      get().addToast(`🐉 Your ${roleLabel}: ${allyName}`, 'info');
    }
  });

  socket.on('game:over', (result: GameOverResult) => {
    set({ gameOverResult: result });
  });

  (socket as any).on('game:night_summary', (summary: NightSummary) => {
    set({ nightSummary: summary });
  });

  (socket as any).on('game:nomination', (data: { nominatorId: string; nominatorName: string; nomineeId: string | null; nomineeName: string | null }) => {
    if (data.nomineeId) {
      get().addToast(`⚖️ ${data.nominatorName} nominated ${data.nomineeName}`, 'info');
    }
  });

  (socket as any).on('achievement:earned', ({ achievements }: { achievements: AchievementEarned[] }) => {
    set({ newAchievements: achievements });
  });

  (socket as any).on('game:vote_breakdown', (entries: VoteBreakdownEntry[]) => {
    set({ voteBreakdown: Array.isArray(entries) ? entries : null });
  });

  (socket as any).on('lobby:autostart', ({ secondsLeft }: { secondsLeft: number }) => {
    set({ autoStartCountdown: secondsLeft < 0 ? null : secondsLeft });
  });

  (socket as any).on('xp:gained', (data: XPGain) => {
    set({ xpGain: data });
  });

  (socket as any).on('prediction:result', ({ correct, xpGained, winningTeam }: { correct: boolean; xpGained: number; winningTeam: string }) => {
    if (correct) {
      get().addToast(`🎯 პროგნოზი სწორი! +${xpGained} XP`, 'success');
    } else {
      get().addToast(`❌ პროგნოზი არ გამართლდა (${winningTeam} won)`, 'info');
    }
  });

  (socket as any).on('queue:position', ({ position }: { position: number }) => {
    set({ queuePosition: position });
    get().addToast(`You're #${position} in the spectate queue`, 'info');
  });

  (socket as any).on('queue:promoted', () => {
    set({ queuePosition: null });
    get().addToast('Spot opened — joining room!', 'success');
  });

  (socket as any).on('queue:updated', ({ nextRoundQueue }: { nextRoundQueue: import('@/types/index').PlayerPublic[] }) => {
    const { myPlayerId } = get();
    set(s => {
      if (!s.room) return s;
      // Update the queue in room state
      const updatedRoom = { ...s.room, nextRoundQueue };
      return { room: updatedRoom };
    });
    // Update local queuePosition from queue data
    if (myPlayerId) {
      const myEntry = nextRoundQueue.find(p => p.id === myPlayerId);
      set({ queuePosition: myEntry?.queuePosition ?? null });
    }
  });

  (socket as any).on('friend:request_received', (req: FriendRequest) => {
    set(s => ({ pendingFriendRequests: [...s.pendingFriendRequests, req] }));
    get().addToast(`Friend request from ${req.fromUsername}`, 'info');
  });

  (socket as any).on('game:notification', ({ title, body }: { title: string; body: string }) => {
    if (document.visibilityState === 'hidden' && Notification.permission === 'granted') {
      try { new Notification(title, { body, icon: '/icon-192.png' }); } catch {}
    }
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

  socket.on('warning:received', ({ reason, category, moderatorName }: { reason: string; category?: string; moderatorName?: string }) => {
    set({ modNotice: { type: 'warn', reason, category, moderatorName } });
    const who = moderatorName ? ` by ${moderatorName}` : '';
    get().addToast(`⚠️ Warning received${who}`, 'error');
  });

  socket.on('error', ({ message }: { message: string }) => {
    get().addToast(message, 'error');
  });

  (socket as any).on('clanRoom:warningReceived', ({ clanName, moderatorName, moderatorRole, reason }: any) => {
    const from = moderatorName ? ` from ${moderatorName}` : '';
    set({ modNotice: { type: 'warn', reason: `[Clan Warning${from}] ${reason}`, category: 'other', moderatorName: `${clanName} ${moderatorRole}` } });
    get().addToast(`⚠️ Clan warning received`, 'error');
  });

  (socket as any).on('clanRoom:kicked', ({ clanName, reason }: any) => {
    clearSession();
    set({ room: null, myPlayerId: null, myRole: null, nightResult: null, investigationResult: null, gameOverResult: null });
    get().addToast(`You were removed from the ${clanName} room. ${reason ? `Reason: ${reason}` : ''}`, 'error');
  });

  (socket as any).on('room:closed', ({ reason }: { reason: string }) => {
    clearSession();
    set({
      room: null,
      myPlayerId: null,
      myRole: null,
      nightResult: null,
      investigationResult: null,
      gameOverResult: null,
    });
    get().addToast(reason, 'error');
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
    voteEliminationResult: null,
    cultConversionNotice: false,
    nightSummary: null,
    newAchievements: [],
    voteBreakdown: null,
    autoStartCountdown: null,
    xpGain: null,
    queuePosition: null,
    pendingFriendRequests: [],
    modNotice: null,
    toasts: [],
    isLoading: false,
    isReconnecting: false,
    connectionFailed: false,
    error: null,

    myPlayer: () => {
      const { room, myPlayerId } = get();
      if (!room || !myPlayerId) return null;
      return room.players.find(p => p.id === myPlayerId)
        ?? room.nextRoundQueue?.find(p => p.id === myPlayerId)
        ?? null;
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

    createRoom: withLoading(async (name: string, settings?: Partial<GameSettings>, clanRoom = false) => {
      const room = await emit<RoomPublic>('room:create', { name, settings, clanRoom });
      const playerId = room.players.find(p => p.isHost)?.id ?? null;
      set({ room, myPlayerId: playerId });
      if (playerId) saveSession(room, playerId);
    }),

    joinRoom: async (code: string, name: string, isSpectator = false, password = '', joinMode?: 'player' | 'spectator' | 'next_round') => {
      set({ isLoading: true, error: null });
      try {
        // When joining as spectator without an explicit joinMode, tell the server
        // "spectator" so it doesn't reject in-progress games with GAME_ALREADY_STARTED_CHOOSE_MODE
        const effectiveJoinMode = joinMode ?? (isSpectator ? 'spectator' : undefined);
        const room = await emit<RoomPublic>('room:join', { code, name, isSpectator, password, ...(effectiveJoinMode ? { joinMode: effectiveJoinMode } : {}) });
        const myPlayer = room.players.find(p => p.socketId === socket.id)
          ?? room.nextRoundQueue?.find(p => p.socketId === socket.id)
          ?? room.players.find(p => p.name === name)
          ?? room.nextRoundQueue?.find(p => p.name === name);
        const playerId = myPlayer?.id ?? null;
        set({ room, myPlayerId: playerId, isLoading: false, error: null });
        if (playerId) saveSession(room, playerId);
      } catch (e: any) {
        const msg = e?.message ?? 'An error occurred.';
        set({ error: msg, isLoading: false });
        if (msg !== 'GAME_ALREADY_STARTED_CHOOSE_MODE') {
          get().addToast(msg, 'error');
        }
      }
    },

    leaveRoom: withLoading(async () => {
      clearSession();
      await emit('room:leave');
      set({
        room: null,
        myPlayerId: null,
        myRole: null,
        nightResult: null,
        investigationResult: null,
        gameOverResult: null,
        voteEliminationResult: null,
        cultConversionNotice: false,
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

    startGame: async () => {
      set({ isLoading: true, error: null });
      try {
        await emit('game:start');
      } catch (e: any) {
        const msg = e?.message ?? 'An error occurred.';
        // Suppress slow-connection errors — game start success is visible from room:update
        if (!msg.includes('Connection slow') && !msg.includes('timed out')) {
          set({ error: msg });
          get().addToast(msg, 'error');
        }
      } finally {
        set({ isLoading: false });
      }
    },

    submitNightAction: withLoading(async (targetId: string) => {
      await emit('game:action', { targetId });
    }),

    submitVote: withLoading(async (targetId: string | null) => {
      await emit('game:vote', { targetId });
    }),

    nominate: withLoading(async (nomineeId: string | null) => {
      await emit('game:nominate', { nomineeId });
    }),

    sendChat: withLoading(async (text: string, channel: ChatChannel) => {
      await emit('chat:send', { text, channel });
    }),

    skipPhase: withLoading(async () => {
      await emit('game:skip');
    }),

    speechPass: withLoading(async () => {
      await emit('game:speech_pass');
    }),

    daySkipVote: withLoading(async () => {
      await emit('game:day_skip_vote');
    }),

    issueFoul: withLoading(async () => {
      await emit('game:foul');
    }),

    skipDefense: withLoading(async () => {
      await emit('game:skip-defense');
    }),

    restartGame: withLoading(async () => {
      await emit('game:restart');
      set({ myRole: null, nightResult: null, investigationResult: null, spyReport: null, gameOverResult: null });
    }),

    terminateGame: withLoading(async () => {
      await emit('game:terminate');
      set({ myRole: null, nightResult: null, investigationResult: null, spyReport: null, gameOverResult: null });
    }),

    dismissNightResult: () => set({ nightResult: null }),
    dismissInvestigation: () => set({ investigationResult: null }),
    dismissSpyReport: () => set({ spyReport: null }),
    dismissGameOver: () => set({ gameOverResult: null }),
    dismissVoteElimination: () => set({ voteEliminationResult: null }),
    dismissCultConversion: () => set({ cultConversionNotice: false }),
    dismissNightSummary: () => set({ nightSummary: null }),
    dismissNewAchievements: () => set({ newAchievements: [] }),
    dismissVoteBreakdown: () => set({ voteBreakdown: null }),
    dismissXPGain: () => set({ xpGain: null }),
    dismissModNotice: () => set({ modNotice: null }),

    rematch: withLoading(async () => {
      await emit('game:rematch');
    }),

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

    joinQueue: withLoading(async () => {
      const res = await emitWithAck<unknown, Res<{ position: number }>>('queue:join', undefined);
      if (!res.ok) throw new Error(res.error);
      set({ queuePosition: res.data.position });
      get().addToast(`Joined queue — position #${res.data.position}`, 'success');
    }),

    leaveQueue: withLoading(async () => {
      const res = await emitWithAck<unknown, Res<null>>('queue:leave', undefined);
      if (!res.ok) throw new Error(res.error);
      set({ queuePosition: null });
      get().addToast('Left the next-round queue', 'info');
    }),
  };
});
