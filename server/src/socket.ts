import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData,
  RoomPublic, ChatMessage, ok, err, Room, Player, Phase, GameSettings,
  ReportReason, NightSummary, LiveRoomInfo, LiveRoomPlayer,
  LobbyMessage,
} from './types/index.js';
import {
  createRoom, getRoom, getRoomByCode, deleteRoom, addPlayer, removePlayer,
  getPlayerBySocket, toPublicRoom, getAlivePlayers, getHostPlayer,
  toRoomListItem, getAllRooms, getPlayerByProfile, transferHost, rematchRoom,
  setPlayerAvatarUrl,
} from './services/roomService.js';
import {
  startGame, setPhase, advancePhase, submitNightAction, submitVote, submitNomination,
  checkWin, buildGameOverResult, allNightActionsSubmitted, getInvestigationResult,
  getTrackResult, resolveVotes,
} from './services/gameService.js';
import {
  createPlayerMessage, createSystemMessage, addMessage, validateChat,
} from './services/chatService.js';
import { timerService } from './services/timerService.js';
import { getRole } from './services/roleService.js';
import {
  getOrCreatePlayer, getPlayer, getAllPlayers, toPublicProfile, addGameResult,
  getActiveBan, getActiveMute, findSocketByProfile,
  registerWithEmail, authenticateWithEmail,
  addXP, getCosmetics, equipCosmetic,
  getLeaderboard, getPlayersFast,
  getPlayerByFriendCode, setGrantedModLevel,
  updateAvatarUrl, updateUsername,
} from './services/playerService.js';
import {
  markOnline, markOffline, sendFriendRequest, acceptFriend, declineFriend,
  removeFriend, getFriends, getPendingRequests, getOnlineCount, getFriendshipStatus, isOnline,
} from './services/friendService.js';
import {
  checkAndAwardChallenge, getTodayChallenge, getDailyChallengeForPlayer,
} from './services/challengeService.js';
import { checkAchievements, getPlayerAchievements } from './services/achievementService.js';
import { recordGame, getPlayerHistory, getPlayerRoleStats } from './services/gameHistoryService.js';
import {
  createClan, getClan, getClanByPlayer, getClanMembershipByPlayer, getAllClans, getClanMembers,
  joinClan, leaveClan, setClanImage,
} from './services/clanService.js';
import {
  canDo, banPlayer, unbanPlayer, mutePlayer, unmutePlayer,
  warnPlayer, createReport, getReports, resolveReport, getLogs, getModPlayers, logKick,
  addModNote, freezeAccount, unfreezeAccount, renamePlayer,
  getPlayerDetail, assignReport, getDashboardDbStats, addModLog,
} from './services/moderationService.js';
import {
  canJoin as voiceCanJoin,
  canTransmitVoice,
  join as voiceJoin,
  leave as voiceLeave,
  getMembers as voiceGetMembers,
  getSharedChannel as voiceGetSharedChannel,
  removeFromChannel as voiceRemoveFromChannel,
  VoiceChannel,
} from './services/voiceService.js';
import { sql } from './db.js';
import bcrypt from 'bcryptjs';
import {
  getOrCreateConversation, listConversations, sendMessage, getMessages, markRead, getTotalUnread, deleteConversationForUser,
} from './services/dmService.js';
import {
  getCoins, claimDailyReward, grantCoins, deductCoins, refundGift,
  getTransactions, getAllTransactions,
  getGiftCatalog, createGift, updateGift,
  sendGift, getPlayerGifts, getGiftDetail,
  getGiftsSent, getGiftTimeline, getGiftStats,
  getPinnedGifts, pinGift, unpinGift,
  getGiftLeaderboard,
} from './services/coinService.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// ── TURN / ICE server config ──────────────────────────────────────────
// Centralised in server/src/lib/iceConfig.ts.  Reads Railway env vars:
// TURN_URL, TURN_USERNAME, TURN_CREDENTIAL, FORCE_TURN_RELAY, STUN_URL.
import { buildIceConfig } from './lib/iceConfig.js';

// ── Rate limiting ─────────────────────────────────────────────────────
const rateLimits = new Map<string, { count: number; resetAt: number }>();
function rateOk(socketId: string, limit = 15): boolean {
  const now = Date.now();
  const r = rateLimits.get(socketId);
  if (!r || now > r.resetAt) { rateLimits.set(socketId, { count: 1, resetAt: now + 1000 }); return true; }
  if (r.count >= limit) return false;
  r.count++; return true;
}

// ── Report rate limiting ──────────────────────────────────────────────
// key: reporterId+targetId+reason → lastReportAt (ms)
const reportCooldowns = new Map<string, number>();
// key: reporterId → timestamps of last 10min reports
const reportWindows = new Map<string, number[]>();

function reportRateOk(reporterId: string, targetId: string, reason: string): { ok: boolean; error?: string } {
  const now = Date.now();
  const cooldownKey = `${reporterId}:${targetId}:${reason}`;
  const lastReport = reportCooldowns.get(cooldownKey);
  if (lastReport && now - lastReport < 60_000) {
    return { ok: false, error: 'Please wait before reporting the same player for the same reason.' };
  }
  const windowKey = reporterId;
  const window = (reportWindows.get(windowKey) ?? []).filter(t => now - t < 600_000);
  if (window.length >= 5) {
    return { ok: false, error: 'You are reporting too frequently. Please wait a few minutes.' };
  }
  reportCooldowns.set(cooldownKey, now);
  window.push(now);
  reportWindows.set(windowKey, window);
  return { ok: true };
}

// ── Maintenance mode ─────────────────────────────────────────────────
let maintenanceMode = false;

// ── Lobby auto-start timers ───────────────────────────────────────────
const autoStartTimers = new Map<string, NodeJS.Timeout>();

function cancelAutoStart(roomId: string): void {
  const t = autoStartTimers.get(roomId);
  if (t) { clearTimeout(t); autoStartTimers.delete(roomId); }
}

// ── Spectate queues (roomId → socketIds waiting) ──────────────────────
const spectateQueues = new Map<string, string[]>();

// ── Lobby chat (in-memory, last 80 messages) ─────────────────────────
const LOBBY_CHAT_MAX = 80;
const lobbyChatHistory: LobbyMessage[] = [];

// ── Role-specific death messages ──────────────────────────────────────
const NIGHT_DEATH: Partial<Record<string, string>> = {
  sheriff:    'The badge falls silent. The town lost its protector.',
  doctor:     'The healer is gone. No one is safe tonight.',
  bodyguard:  'The guardian fell in the line of duty.',
  don:        'The Don has fallen — but who will take the throne?',
  cult_leader:'The Cult Leader is dead. The cult crumbles.',
  veteran:    'The Veteran fought to the last.',
  mayor:      'The Mayor is gone. The town is leaderless.',
  vigilante:  'The Vigilante fires no more.',
  spy:        "The Spy's final report goes unread.",
  escort:     'The Escort danced her last.',
  tracker:    "The Tracker's trail goes cold.",
  arsonist:   'The Arsonist burns out.',
  yakuza:     'The Yakuza enforcer falls. The clan is weakened.',
  shogun:     'A hidden blade is revealed too late.',
};
const VOTE_DEATH: Partial<Record<string, string>> = {
  jester:     '🃏 The Jester laughs from beyond the grave.',
  sheriff:    '⚖️ The town voted out one of their own. The badge was real.',
  doctor:     '⚖️ The healer is exiled. The town will regret this.',
  mafia:      '⚖️ Justice is served. A killer leaves the shadows.',
  don:        '⚖️ The Godfather is dethroned by his own people.',
  cult_leader:'⚖️ The Cult Leader is exposed and cast out.',
  maniac:     '⚖️ The Maniac smiles. You voted out a madman.',
  arsonist:   '⚖️ The Arsonist is extinguished.',
  yakuza:     '⚖️ The Yakuza enforcer is unmasked and cast out.',
  shogun:     '⚖️ A hidden ally is exposed. The Yakuza loses its shadow.',
};

function nightDeathMsg(name: string, role: string | null, lastWill: string | null | undefined): string {
  const flavour = role ? NIGHT_DEATH[role] : null;
  let msg = flavour
    ? `Dawn breaks. ${name} was found dead.\n${flavour}`
    : `Dawn breaks. ${name} was found dead.`;
  if (lastWill) msg += `\n📜 Last Will: "${lastWill}"`;
  return msg;
}

function voteDeathMsg(name: string, role: string | null, lastWill: string | null | undefined): string {
  const flavour = role ? VOTE_DEATH[role] : null;
  let msg = flavour
    ? `${name} was eliminated by vote.\n${flavour}`
    : `${name} was eliminated by vote.`;
  if (lastWill) msg += `\n📜 Last Will: "${lastWill}"`;
  return msg;
}

// ── Validation Schemas ────────────────────────────────────────────────
const CreateRoomSchema = z.object({
  name: z.string().min(1).max(24),
  settings: z.record(z.unknown()).optional(),
});

const JoinRoomSchema = z.object({
  code: z.string().length(6),
  name: z.string().min(1).max(24),
  isSpectator: z.boolean().optional().default(false),
  password: z.string().max(64).optional().default(''),
});

const ChatSchema = z.object({
  text: z.string().min(1).max(400),
  channel: z.enum(['room', 'mafia', 'dead', 'spectator']),
});

const AuthSchema = z.object({
  uid: z.string().min(1).max(64),
  username: z.string().min(1).max(24),
});

const ReportSchema = z.object({
  targetProfileId: z.string().min(1),
  roomId: z.string().nullable(),
  reason: z.enum([
    'cheating','offensive_language','voice_abuse','spamming',
    'inappropriate_nickname','harassment','game_sabotage','bug_abuse','other',
    'hate_speech','inappropriate_chat','toxic_behavior',
  ]),
  details: z.string().max(500).default(''),
});

// ── Helpers ───────────────────────────────────────────────────────────
function broadcastRoom(io: AppServer, room: Room): void {
  for (const player of room.players.values()) {
    if (player.socketId) {
      io.to(player.socketId).emit('room:update', toPublicRoom(room, player.id));
    }
  }
}

function broadcastOnlineCount(io: AppServer): void {
  io.emit('online:count', { count: getOnlineCount() });
}

function startPhaseTimer(io: AppServer, room: Room): void {
  timerService.stop(room.id);
  if (!room.timer || room.timer <= 0) return;

  timerService.start(
    room.id, room.timer,
    (remaining) => {
      room.timer = remaining;
      io.to(room.id).emit('room:timer', remaining);
    },
    async () => {
      room.timer = 0;
      const prevPhase = room.phase;
      const wasNight = room.phase === 'night';
      const wasSpeech = room.phase === 'speech';
      const wasFinalWords = room.phase === 'final_words';
      console.log('[GameEngine] timer expired, prev phase:', prevPhase, 'room day:', room.day);
      if (room.phase === 'voting') announceVoteResult(io, room);
      advancePhase(room); const nextPhase = room.phase as Phase;
      console.log('[GameEngine] phase transition (timer):', prevPhase, '->', nextPhase);
      if (wasNight) {
        console.log('[GameEngine] night resolved, announcing night result');
        announceNightResult(io, room); notifySpies(io, room); notifyTrackers(io, room); notifyCultConversions(io, room); notifyRoleblocked(io, room);
      }
      if (wasFinalWords) console.log('[GameEngine] final words finished, death finalized, next phase:', nextPhase);
      if (wasSpeech && nextPhase !== 'speech') announceSpeechEnd(io, room, nextPhase);
      if (nextPhase === 'night') {
        console.log('[GameEngine] night started');
        io.to(room.id).emit('game:notification', { title: 'Night Falls', body: 'Perform your night action.' });
      }
      if (nextPhase === 'day') console.log('[GameEngine] day discussion started, day:', room.day);
      if (nextPhase === 'game_over') await emitGameOver(io, room);
      broadcastRoom(io, room);
      enforceVoicePhaseRules(io, room);
      if (room.phase !== 'game_over') startPhaseTimer(io, room);
    },
  );
}

function broadcastSystemMsg(io: AppServer, room: Room, text: string): void {
  const msg = createSystemMessage(text);
  addMessage(room, msg);
  io.to(room.id).emit('chat:new', msg);
}

function getPlayerOrError(socket: AppSocket, room: Room): Player {
  const player = getPlayerBySocket(room, socket.id);
  if (!player) throw new Error('Player not found in room.');
  return player;
}

function getRoomFromSocket(socket: AppSocket): Room {
  const roomId = socket.data.roomId;
  if (!roomId) throw new Error('You are not in a room.');
  const room = getRoom(roomId);
  if (!room) throw new Error('Room not found.');
  return room;
}

async function emitGameOver(io: AppServer, room: Room): Promise<void> {
  const result = buildGameOverResult(room);

  // Record persistent game history
  try { await recordGame(room); } catch { /* non-fatal */ }

  // Send game:notification push event
  io.to(room.id).emit('game:notification', {
    title: 'Game Over',
    body: room.winner ? `${room.winner.charAt(0).toUpperCase() + room.winner.slice(1)} wins!` : 'Game ended.',
  });

  for (const p of room.players.values()) {
    if (p.socketId) io.to(p.socketId).emit('game:over', result);
    if (p.profileId && room.winner) {
      const won = p.team === room.winner;
      await addGameResult(p.profileId, won);

      // Award XP
      try {
        const roundsAlive = Math.min(room.day, 10);
        let xpAmount = won ? 150 : 50;
        xpAmount += Math.min(roundsAlive * 5, 50);

        // Check daily challenge
        const challengeCompleted = await checkAndAwardChallenge(p.profileId, won, p.role, room.day, p.team);
        const todayChallenge = getTodayChallenge();
        const challengeBonus = challengeCompleted ? todayChallenge.xpReward : 0;
        xpAmount += challengeBonus;

        const xpResult = await addXP(p.profileId, xpAmount);

        if (p.socketId) {
          io.to(p.socketId).emit('xp:gained', {
            amount: xpAmount,
            newXP: xpResult.newXP,
            newLevel: xpResult.newLevel,
            leveledUp: xpResult.leveledUp,
            challengeCompleted,
            challengeBonus,
          });
        }
      } catch { /* non-fatal */ }

      // Check and award achievements
      try {
        const newKeys = await checkAchievements(room, p.id);
        if (newKeys.length > 0 && p.socketId) {
          const allAchs = await getPlayerAchievements(p.profileId);
          const earned = allAchs.filter(a => newKeys.includes(a.key));
          io.to(p.socketId).emit('achievement:earned', { achievements: earned });
        }
      } catch { /* non-fatal */ }
    }
  }
}

async function notifyMods(io: AppServer, type: string, message: string, targetName?: string): Promise<void> {
  const socketsWithProfile: Array<{ sock: import('socket.io').Socket; profileId: string }> = [];
  for (const [, sock] of io.sockets.sockets) {
    const profileId = (sock.data as SocketData).profileId;
    if (profileId) socketsWithProfile.push({ sock, profileId });
  }
  await Promise.all(socketsWithProfile.map(async ({ sock, profileId }) => {
    try {
      const profile = await getPlayer(profileId);
      if (profile?.isModerator) sock.emit('mod:notification', { type, message, targetName });
    } catch { /* ignore per-socket errors */ }
  }));
}

function announceSpeechEnd(io: AppServer, room: Room, nextPhase: Phase): void {
  if (nextPhase === 'voting') {
    const names = room.tribunalCandidates
      .map(id => room.players.get(id)?.name ?? '?')
      .join(', ');
    broadcastSystemMsg(io, room, `⚖️ Tribunal begins — nominated: ${names}.`);
  } else if (nextPhase === 'night') {
    broadcastSystemMsg(io, room, 'No one was nominated. Night begins.');
  }
}

function announceNightResult(io: AppServer, room: Room): void {
  const result = { killed: room.killedLastNight, saved: room.savedLastNight };
  io.to(room.id).emit('game:night_result', result);

  // Notify Mafia privately if they had votes but couldn't reach consensus
  const mafiaVoteCount = [...room.nightActions.values()]
    .filter(a => a.role === 'mafia' || a.role === 'don').length;
  if (mafiaVoteCount > 0 && room.mafiaKillTarget === null) {
    const msg = createSystemMessage("Your team couldn't agree on a target. No kill happened.", 'mafia');
    addMessage(room, msg);
  }

  // Night summary card (aggregate stats for all players)
  const summary: NightSummary = {
    day: room.day,
    totalTargeted: room.nightActions.size,
    saved: room.savedLastNight,
    eliminated: room.killedLastNight.map(k => {
      const p = room.players.get(k.id);
      return { name: k.name, role: p?.role ?? null };
    }),
  };
  io.to(room.id).emit('game:night_summary', summary);

  if (room.killedLastNight.length > 0) {
    for (const killed of room.killedLastNight) {
      const p = room.players.get(killed.id);
      broadcastSystemMsg(io, room, nightDeathMsg(killed.name, p?.role ?? null, killed.lastWill));
      // Force-mute the eliminated player in any voice channel they're in
      if (p?.socketId) {
        io.to(p.socketId).emit('voice:force-mute', { reason: 'You were eliminated.' });
      }
    }
    // Record kills in timeline
    for (const killed of room.killedLastNight) {
      const victim = room.players.get(killed.id);
      const killerAction = [...room.nightActions.values()].find(a =>
        a.targetId === killed.id && (
          a.role === 'mafia' || a.role === 'don' || a.role === 'arsonist' ||
          a.role === 'maniac' || a.role === 'vigilante' || a.role === 'yakuza' || a.role === 'shogun'
        )
      );
      room.gameTimeline.push({
        type: 'night_kill',
        day: room.day,
        victimName: killed.name,
        victimRole: victim?.role ?? undefined,
        victimTeam: victim?.team ?? undefined,
        killerRole: killerAction?.role ?? undefined,
      });
    }
  } else {
    // Record peaceful night / save in timeline
    room.gameTimeline.push({
      type: 'night_survived',
      day: room.day,
      doctorSaved: room.savedLastNight,
    });
    if (room.savedLastNight) {
      broadcastSystemMsg(io, room, 'Dawn breaks. Everyone survived the night.');
    } else {
      broadcastSystemMsg(io, room, 'Dawn breaks. The night passed quietly.');
    }
  }
}

function notifyTrackers(io: AppServer, room: Room): void {
  for (const p of room.players.values()) {
    if (p.role === 'tracker' && p.isAlive && p.socketId) {
      const result = getTrackResult(room, p);
      if (result) io.to(p.socketId).emit('game:track_result', result);
    }
  }
}

function notifyCultConversions(io: AppServer, room: Room): void {
  for (const cultistId of room.newlyConvertedCultists) {
    const cultist = room.players.get(cultistId);
    if (cultist && cultist.socketId) {
      io.to(cultist.socketId).emit('game:role', { role: getRole('cultist') });
    }
  }
}

function notifyYakuzaAllies(io: AppServer, room: Room): void {
  const yakuzaPlayer = [...room.players.values()].find(p => p.role === 'yakuza');
  const shogunPlayer = [...room.players.values()].find(p => p.role === 'shogun');

  if (yakuzaPlayer?.socketId) {
    io.to(yakuzaPlayer.socketId).emit('game:yakuza_ally', {
      allyRole: 'shogun',
      allyId: shogunPlayer?.id ?? null,
      allyName: shogunPlayer?.name ?? null,
    });
  }
  if (shogunPlayer?.socketId) {
    io.to(shogunPlayer.socketId).emit('game:yakuza_ally', {
      allyRole: 'yakuza',
      allyId: yakuzaPlayer?.id ?? null,
      allyName: yakuzaPlayer?.name ?? null,
    });
  }
}

function notifySpies(io: AppServer, room: Room): void {
  // Use the resolved consensus kill target (even if Doctor saved the victim)
  const targetId = room.mafiaKillTarget;
  const targetName = targetId ? (room.players.get(targetId)?.name ?? null) : null;

  for (const p of room.players.values()) {
    if (p.role === 'spy' && p.isAlive && p.socketId) {
      io.to(p.socketId).emit('spy:night_report', {
        mafiaTarget: targetId,
        mafiaTargetName: targetName,
      });
    }
  }
}

function announceVoteResult(io: AppServer, room: Room): void {
  // Emit vote breakdown before resolving
  const breakdown = [...room.votes.entries()]
    .filter(([, tid]) => tid !== null)
    .map(([vid, tid]) => {
      const voter  = room.players.get(vid);
      const target = room.players.get(tid!);
      return {
        voterId: vid, voterName: voter?.name ?? '?',
        targetId: tid!, targetName: target?.name ?? '?',
        weight: voter?.role === 'mayor' ? 2 : 1,
      };
    });
  io.to(room.id).emit('game:vote_breakdown', breakdown);

  const eliminated = resolveVotes(room);
  if (eliminated) {
    const target = room.players.get(eliminated);
    if (target) {
      io.to(room.id).emit('game:vote_result', {
        name: target.name,
        role: target.role ?? null,
        lastWill: target.lastWill ?? null,
        seat: target.seat,
      });
      broadcastSystemMsg(io, room, voteDeathMsg(target.name, target.role ?? null, target.lastWill));
      // Force-mute the eliminated player
      if (target.socketId) {
        io.to(target.socketId).emit('voice:force-mute', { reason: 'You were eliminated.' });
      }
      // Record vote elimination in timeline
      const voteBreakdown = [...room.votes.entries()]
        .filter(([, tid]) => tid === eliminated)
        .map(([vid]) => {
          const voter = room.players.get(vid);
          return { voterName: voter?.name ?? '?', targetName: target.name };
        });
      room.gameTimeline.push({
        type: 'vote_eliminate',
        day: room.day,
        victimName: target.name,
        victimRole: target.role ?? undefined,
        victimTeam: target.team ?? undefined,
        voteBreakdown,
      });
    }
  } else {
    broadcastSystemMsg(io, room, 'The vote ended in a tie. No one was eliminated.');
    // Record tie vote in timeline
    room.gameTimeline.push({ type: 'vote_no_elim', day: room.day });
  }
}

function notifyRoleblocked(io: AppServer, room: Room): void {
  const escortActions = [...room.nightActions.values()].filter(a => a.role === 'escort');
  for (const action of escortActions) {
    const blocked = room.players.get(action.targetId);
    if (blocked?.isAlive && blocked.socketId) {
      io.to(blocked.socketId).emit('game:roleblocked');
    }
  }
}

// ── DB-ready gate ─────────────────────────────────────────────────────
let _dbReady = false;
export function setDbReady(v: boolean) { _dbReady = v; }

// ── Main ──────────────────────────────────────────────────────────────
export function attachSocketHandlers(io: AppServer): void {

  io.on('connection', (socket: AppSocket) => {
    socket.data.playerId = null;
    socket.data.roomId = null;
    socket.data.profileId = null;

    // Rate-limit every incoming event
    socket.use(([event, ...args], next) => {
      const authEvents = new Set(['player:auth', 'player:register', 'player:login_email']);
      const limit = authEvents.has(event) ? 3 : 20;
      if (!rateOk(socket.id, limit)) {
        socket.emit('error', { message: 'Too many requests. Slow down.' });
        // Call ack callback if present so client doesn't hang waiting for a response
        const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] as Function : null;
        if (ack) ack(err('Too many requests. Slow down.'));
        return;
      }
      next();
    });

    // ── Auth ─────────────────────────────────────────────────────────
    socket.on('player:auth', async (data, cb) => {
      if (!_dbReady) { cb(err('Server is starting up — please wait a few seconds and try again.')); return; }
      try {
        const parsed = AuthSchema.parse(data);
        const profile = await getOrCreatePlayer(parsed.uid, parsed.username);

        // Check ban
        const ban = await getActiveBan(parsed.uid);
        if (ban) {
          cb(err(`You are banned until ${new Date(ban.expiresAt).toLocaleString()}. Reason: ${ban.reason}`));
          return;
        }

        socket.data.profileId = parsed.uid;
        markOnline(parsed.uid);
        broadcastOnlineCount(io);
        socket.emit('player:profile', toPublicProfile(profile));
        cb(ok(toPublicProfile(profile)));
      } catch (e: any) {
        cb(err(e.message ?? 'Auth failed.'));
      }
    });

    // ── Email Register ───────────────────────────────────────────────
    socket.on('player:register', async (data, cb) => {
      try {
        const { email, password, username } = z.object({
          email:    z.string().email().max(200),
          password: z.string().min(6).max(128),
          username: z.string().min(2).max(24),
        }).parse(data);

        const profile = await registerWithEmail(email, password, username);
        socket.data.profileId = profile.id;
        markOnline(profile.id);
        broadcastOnlineCount(io);
        socket.emit('player:profile', toPublicProfile(profile));
        cb(ok({ uid: profile.id, profile: toPublicProfile(profile) }));
      } catch (e: any) {
        cb(err(e.message ?? 'Registration failed.'));
      }
    });

    // ── Email Login ──────────────────────────────────────────────────
    socket.on('player:login_email', async (data, cb) => {
      try {
        const { email, password } = z.object({
          email:    z.string().email(),
          password: z.string().min(1),
        }).parse(data);

        const profile = await authenticateWithEmail(email, password);
        const ban = await getActiveBan(profile.id);
        if (ban) {
          cb(err(`You are banned until ${new Date(ban.expiresAt).toLocaleString()}. Reason: ${ban.reason}`));
          return;
        }
        socket.data.profileId = profile.id;
        markOnline(profile.id);
        broadcastOnlineCount(io);
        socket.emit('player:profile', toPublicProfile(profile));
        cb(ok({ uid: profile.id, profile: toPublicProfile(profile) }));
      } catch (e: any) {
        cb(err(e.message ?? 'Login failed.'));
      }
    });

    // ── Change Password ──────────────────────────────────────────────
    socket.on('player:change_password' as any, async (data: any, cb: any) => {
      try {
        const { uid, currentPassword, newPassword } = z.object({
          uid:             z.string().min(1),
          currentPassword: z.string().min(1),
          newPassword:     z.string().min(6),
        }).parse(data);

        const rows = await sql`SELECT password_hash, email FROM players WHERE id = ${uid} LIMIT 1` as any[];
        if (!rows[0]) { cb({ ok: false, error: 'Player not found.' }); return; }
        if (!rows[0].password_hash) { cb({ ok: false, error: 'No password set on this account.' }); return; }

        const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
        if (!match) { cb({ ok: false, error: 'Current password is incorrect.' }); return; }

        const newHash = await bcrypt.hash(newPassword, 10);
        await sql`UPDATE players SET password_hash = ${newHash} WHERE id = ${uid}`;
        cb({ ok: true });
      } catch (e: any) {
        cb({ ok: false, error: e.message ?? 'Failed to change password.' });
      }
    });

    // ── Player Stats ─────────────────────────────────────────────────
    socket.on('player:stats', async ({ profileId }, cb) => {
      try {
        const profile = await getPlayer(profileId);
        if (!profile) throw new Error('Player not found.');
        cb(ok(toPublicProfile(profile)));
      } catch (e: any) {
        cb(err(e.message));
      }
    });

    // ── Avatar Upload ────────────────────────────────────────────────
    socket.on('player:update_avatar', async (data: { imageData: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb({ ok: false, error: 'Not authenticated.' }); return; }

        const { imageData } = data;
        if (!imageData || typeof imageData !== 'string') { cb({ ok: false, error: 'Invalid image data.' }); return; }
        if (!imageData.startsWith('data:image/')) { cb({ ok: false, error: 'Unsupported image type.' }); return; }

        // ~200KB base64 limit (150KB raw image)
        if (imageData.length > 270_000) { cb({ ok: false, error: 'Image is too large (max 200KB).' }); return; }

        await updateAvatarUrl(profileId, imageData);

        // Update all rooms this player is in
        const profile = await getPlayer(profileId);
        for (const room of getAllRooms()) {
          setPlayerAvatarUrl(room, profileId, imageData);
          broadcastRoom(io, room);
        }

        cb({ ok: true, data: toPublicProfile(profile!) });
      } catch (e: any) {
        cb({ ok: false, error: e.message ?? 'Upload failed.' });
      }
    });

    socket.on('player:remove_avatar', async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb({ ok: false, error: 'Not authenticated.' }); return; }

        await updateAvatarUrl(profileId, null);

        const profile = await getPlayer(profileId);
        for (const room of getAllRooms()) {
          setPlayerAvatarUrl(room, profileId, null);
          broadcastRoom(io, room);
        }

        cb({ ok: true, data: toPublicProfile(profile!) });
      } catch (e: any) {
        cb({ ok: false, error: e.message ?? 'Remove failed.' });
      }
    });

    socket.on('player:update_name', async (data: { newName: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb({ ok: false, error: 'Not authenticated.' }); return; }
        const { newName } = data;
        if (!newName || typeof newName !== 'string') { cb({ ok: false, error: 'Invalid name.' }); return; }
        const trimmed = newName.trim();
        if (trimmed.length < 2 || trimmed.length > 20) { cb({ ok: false, error: 'Name must be 2–20 characters.' }); return; }
        if (!/^[a-zA-Z0-9ა-ჿ _-]+$/.test(trimmed)) { cb({ ok: false, error: 'Name contains invalid characters.' }); return; }

        await updateUsername(profileId, trimmed);
        const profile = await getPlayer(profileId);
        if (!profile) { cb({ ok: false, error: 'Profile not found.' }); return; }

        // Update in-room player names
        for (const room of getAllRooms()) {
          const player = getPlayerByProfile(room, profileId);
          if (player) {
            player.name = trimmed;
            broadcastRoom(io, room);
          }
        }

        socket.emit('player:profile', toPublicProfile(profile));
        cb({ ok: true, data: toPublicProfile(profile) });
      } catch (e: any) {
        cb({ ok: false, error: e.message ?? 'Name change failed.' });
      }
    });

    // ── Report ───────────────────────────────────────────────────────
    socket.on('player:report', async (data, cb) => {
      try {
        const parsed = ReportSchema.parse(data);
        const reporterProfileId = socket.data.profileId;
        if (!reporterProfileId) throw new Error('Not authenticated.');
        if (parsed.targetProfileId === reporterProfileId) throw new Error('You cannot report yourself.');

        const rateCheck = reportRateOk(reporterProfileId, parsed.targetProfileId, parsed.reason);
        if (!rateCheck.ok) throw new Error(rateCheck.error);

        const reporter = await getPlayer(reporterProfileId);
        const reported = await getPlayer(parsed.targetProfileId);
        if (!reporter || !reported) throw new Error('Player not found.');

        const report = await createReport(
          reporterProfileId, reporter.username,
          parsed.targetProfileId, reported.username,
          parsed.roomId, parsed.reason as ReportReason, parsed.details,
        );

        await notifyMods(io, 'new_report', `New report: ${reported.username} — ${parsed.reason}`, reported.username);

        // Auto-flag: if reported player has 3+ open reports in last 24h, alert mods
        const since24h = Date.now() - 86_400_000;
        const [countRow] = await sql`
          SELECT COUNT(*) as cnt FROM reports
          WHERE reported_id = ${parsed.targetProfileId} AND status = 'open' AND created_at > ${since24h}
        ` as any[];
        const recentCount = Number(countRow?.cnt ?? 0);
        if (recentCount >= 3) {
          await notifyMods(io, 'auto_flag', `⚠️ AUTO-FLAG: ${reported.username} has ${recentCount} open reports in 24h`, reported.username);
        }

        cb(ok(null));
      } catch (e: any) {
        cb(err(e.message));
      }
    });

    // ── Create Room ─────────────────────────────────────────────────
    socket.on('room:create', async (data, cb) => {
      try {
        const parsed = CreateRoomSchema.parse(data);
        const profileId = socket.data.profileId;

        const ban = profileId ? await getActiveBan(profileId) : null;
        if (ban) throw new Error(`You are banned. Reason: ${ban.reason}`);

        const playerProfile = profileId ? await getPlayer(profileId) : null;
        if (maintenanceMode && !playerProfile?.isModerator) throw new Error('Server is under maintenance. Please try again later.');

        const username = playerProfile?.username ?? parsed.name;
        const room = createRoom(socket.id, username, profileId, parsed.settings as Partial<GameSettings>);

        const hostInRoom = [...room.players.values()][0];
        if (hostInRoom && playerProfile?.avatarUrl) hostInRoom.avatarUrl = playerProfile.avatarUrl;

        socket.join(room.id);
        socket.data.playerId = room.hostId;
        socket.data.roomId = room.id;

        const hostPlayer = room.players.get(room.hostId)!;
        broadcastSystemMsg(io, room, `${hostPlayer.name} created the room.`);
        cb(ok(toPublicRoom(room, room.hostId)));
      } catch (e: any) {
        cb(err(e.message ?? 'Failed to create room.'));
      }
    });

    // ── Join Room ───────────────────────────────────────────────────
    socket.on('room:join', async (data, cb) => {
      try {
        const parsed = JoinRoomSchema.parse(data);
        const profileId = socket.data.profileId;

        const ban = profileId ? await getActiveBan(profileId) : null;
        if (ban) throw new Error(`You are banned until ${new Date(ban.expiresAt).toLocaleString()}. Reason: ${ban.reason}`);

        if (maintenanceMode) {
          const joiner = profileId ? await getPlayer(profileId) : null;
          if (!joiner?.isModerator) throw new Error('Server is under maintenance. Please try again later.');
        }

        const room = getRoomByCode(parsed.code);
        if (!room) throw new Error('Room not found. Check the code and try again.');

        // Password check
        if (room.settings.password) {
          const existing = room.players ? [...room.players.values()].find(p => p.profileId === profileId && p.isConnected) : null;
          if (!existing && parsed.password !== room.settings.password) {
            throw new Error('Wrong room password.');
          }
        }

        // Check if this is a re-join attempt (existing player reconnecting)
        const isRejoin = profileId
          ? [...room.players.values()].some(p => p.profileId === profileId)
          : [...room.players.values()].some(p => p.name === parsed.name.trim());

        // Spectate queue: if room is full during active game and not a re-join
        const activePlayers = [...room.players.values()].filter(p => !p.isSpectator);
        if (!isRejoin && room.phase !== 'lobby' && activePlayers.length >= 16) {
          const queue = spectateQueues.get(room.id) ?? [];
          if (!queue.includes(socket.id)) {
            queue.push(socket.id);
            spectateQueues.set(room.id, queue);
          }
          const position = queue.indexOf(socket.id) + 1;
          socket.emit('queue:position', { position, roomCode: room.code });
          cb(err(`Room is full. You are #${position} in queue.`));
          return;
        }

        const playerProfile = profileId ? await getPlayer(profileId) : null;
        const username = playerProfile?.username ?? parsed.name;
        const player = addPlayer(room, socket.id, username, profileId);
        if (playerProfile?.avatarUrl) player.avatarUrl = playerProfile.avatarUrl;
        if (parsed.isSpectator) player.isSpectator = true;
        if (playerProfile?.isModerator) {
          player.isModerator = playerProfile.isModerator;
          player.moderatorLevel = playerProfile.moderatorLevel;
        }

        socket.join(room.id);
        socket.data.playerId = player.id;
        socket.data.roomId = room.id;

        broadcastSystemMsg(io, room, `${player.name} joined the room.`);
        broadcastRoom(io, room);
        cb(ok(toPublicRoom(room, player.id)));
      } catch (e: any) {
        cb(err(e.message ?? 'Failed to join room.'));
      }
    });

    // ── Leave Room ──────────────────────────────────────────────────
    socket.on('room:leave', (cb) => {
      const { roomId, playerId } = socket.data;
      if (roomId && playerId) handlePlayerLeave(io, socket, roomId, playerId);
      cb(ok(null));
    });

    // ── Ready ───────────────────────────────────────────────────────
    socket.on('room:ready', (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const player = getPlayerOrError(socket, room);
        player.isReady = !player.isReady;
        broadcastRoom(io, room);

        // Auto-start: if all non-spectator players are ready and >= minPlayers
        const activePlayers = [...room.players.values()].filter(p => !p.isSpectator);
        const allReady = activePlayers.length >= room.settings.minPlayers
          && activePlayers.every(p => p.isReady);

        if (allReady) {
          let countdown = 10;
          io.to(room.id).emit('lobby:autostart', { secondsLeft: countdown });
          const tick = setInterval(() => {
            countdown--;
            if (countdown <= 0) {
              clearInterval(tick);
              autoStartTimers.delete(room.id);
              // Only auto-start if still in lobby and all still ready
              const still = [...room.players.values()].filter(p => !p.isSpectator);
              if (room.phase === 'lobby' && still.length >= room.settings.minPlayers && still.every(p => p.isReady)) {
                startGame(room);
                room.startedAt = Date.now();
                setPhase(room, 'role_reveal');
                for (const p of room.players.values()) {
                  if (p.socketId && p.role) {
                    io.to(p.socketId).emit('game:role', { role: getRole(p.role) });
                    io.to(p.socketId).emit('game:notification', { title: 'Game Started!', body: `Your role: ${p.role}` });
                  }
                }
                broadcastSystemMsg(io, room, 'The game has begun. Roles are being revealed…');
                notifyYakuzaAllies(io, room);
                broadcastRoom(io, room);
                startPhaseTimer(io, room);
              }
            } else {
              io.to(room.id).emit('lobby:autostart', { secondsLeft: countdown });
            }
          }, 1000);
          cancelAutoStart(room.id);
          autoStartTimers.set(room.id, tick as unknown as NodeJS.Timeout);
        } else {
          // Cancel auto-start if someone unreadied
          if (autoStartTimers.has(room.id)) {
            cancelAutoStart(room.id);
            io.to(room.id).emit('lobby:autostart', { secondsLeft: -1 }); // cancel signal
          }
        }

        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Kick Player ─────────────────────────────────────────────────
    socket.on('room:kick', ({ playerId }, cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const host = getPlayerOrError(socket, room);
        if (!host.isHost) throw new Error('Only the host can kick players.');
        if (room.phase !== 'lobby') throw new Error('Cannot kick during an active game.');

        const target = room.players.get(playerId);
        if (!target) throw new Error('Player not found.');
        if (target.id === host.id) throw new Error('Cannot kick yourself.');

        if (target.socketId) io.to(target.socketId).emit('kicked', { reason: 'You were removed by the host.' });
        removePlayer(room, playerId);
        broadcastSystemMsg(io, room, `${target.name} was removed from the room.`);
        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Transfer Host ───────────────────────────────────────────────
    socket.on('room:transfer_host', ({ playerId }, cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const host = getPlayerOrError(socket, room);
        if (!host.isHost) throw new Error('Only the host can transfer host status.');
        if (playerId === host.id) throw new Error('You are already the host.');

        const newHost = room.players.get(playerId);
        if (!newHost) throw new Error('Player not found.');

        transferHost(room, playerId);
        broadcastSystemMsg(io, room, `👑 ${host.name} transferred host to ${newHost.name}.`);
        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Update Settings ─────────────────────────────────────────────
    socket.on('room:settings', ({ settings }, cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const host = getPlayerOrError(socket, room);
        if (!host.isHost) throw new Error('Only the host can change settings.');
        if (room.phase !== 'lobby') throw new Error('Settings cannot be changed after game starts.');

        room.settings = {
          ...room.settings,
          ...settings,
          roles: { ...room.settings.roles, ...(settings.roles ?? {}) },
        };
        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Start Game ──────────────────────────────────────────────────
    socket.on('game:start', (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const host = getPlayerOrError(socket, room);
        if (!host.isHost) throw new Error('Only the host can start the game.');
        if (room.phase !== 'lobby') throw new Error('Game is already in progress.');

        startGame(room);
        room.startedAt = Date.now();
        setPhase(room, 'role_reveal');

        for (const player of room.players.values()) {
          if (player.socketId && player.role) {
            io.to(player.socketId).emit('game:role', { role: getRole(player.role) });
            io.to(player.socketId).emit('game:notification', {
              title: 'Game Started!',
              body: `Your role: ${player.role}`,
            });
          }
        }

        broadcastSystemMsg(io, room, 'The game has begun. Roles are being revealed…');
        notifyYakuzaAllies(io, room);
        broadcastRoom(io, room);
        enforceVoicePhaseRules(io, room);
        startPhaseTimer(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Night Action ────────────────────────────────────────────────
    socket.on('game:action', async ({ targetId }, cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const actor = getPlayerOrError(socket, room);
        if (actor.isSpectator) throw new Error('Spectators cannot perform night actions.');
        submitNightAction(room, actor, targetId);

        if (actor.role === 'sheriff') {
          const result = getInvestigationResult(room, actor);
          if (result && actor.socketId) {
            io.to(actor.socketId).emit('game:investigation', result);
          }
        }

        // Broadcast Mafia/Don kill choice to private Mafia chat so teammates see it
        if ((actor.role === 'mafia' || actor.role === 'don') && room.phase === 'night') {
          const targetName = room.players.get(targetId)?.name ?? '?';
          const label = actor.role === 'don' ? 'Don' : 'Mafia';
          const choiceMsg = createSystemMessage(
            `[${label}] ${actor.name} → ${targetName}`, 'mafia',
          );
          addMessage(room, choiceMsg);
        }

        broadcastRoom(io, room);

        if (allNightActionsSubmitted(room)) {
          timerService.stop(room.id);
          room.timer = 0;
          advancePhase(room); const nextPhase = room.phase as Phase;
          announceNightResult(io, room);
          notifySpies(io, room);
          notifyTrackers(io, room);
          notifyCultConversions(io, room);
          notifyRoleblocked(io, room);
          if (nextPhase === 'game_over') await emitGameOver(io, room);
          broadcastRoom(io, room);
          enforceVoicePhaseRules(io, room);
          if (room.phase !== 'game_over') startPhaseTimer(io, room);
        }

        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Vote ────────────────────────────────────────────────────────
    socket.on('game:vote', ({ targetId }, cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const voter = getPlayerOrError(socket, room);
        if (voter.isSpectator) throw new Error('Spectators cannot vote.');
        submitVote(room, voter, targetId);

        const target = targetId ? room.players.get(targetId) : null;
        if (target) {
          broadcastSystemMsg(io, room, `🗳 ${voter.name} → ${target.name}`);
        }

        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Nominate ────────────────────────────────────────────────────
    socket.on('game:nominate', ({ nomineeId }, cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const actor = getPlayerOrError(socket, room);
        submitNomination(room, actor, nomineeId);

        const nominee = nomineeId ? room.players.get(nomineeId) : null;
        io.to(room.id).emit('game:nomination', {
          nominatorId: actor.id,
          nominatorName: actor.name,
          nomineeId: nomineeId ?? null,
          nomineeName: nominee?.name ?? null,
        });

        if (nomineeId) {
          broadcastSystemMsg(io, room, `⚖️ ${actor.name} nominated ${nominee?.name ?? '?'}`);
        } else {
          broadcastSystemMsg(io, room, `${actor.name} withdrew their nomination.`);
        }

        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Skip Phase ──────────────────────────────────────────────────
    socket.on('game:skip', async (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const host = getPlayerOrError(socket, room);
        if (!host.isHost) throw new Error('Only the host can skip phases.');
        if (room.phase === 'lobby' || room.phase === 'game_over') throw new Error('Cannot skip this phase.');

        timerService.stop(room.id);
        room.timer = 0;

        const prevPhaseSkip = room.phase;
        const wasNightSkip = room.phase === 'night';
        const wasSpeechSkip = room.phase === 'speech';
        if (room.phase === 'voting') announceVoteResult(io, room);

        advancePhase(room); const nextPhase = room.phase as Phase;
        console.log('[GameEngine] phase transition (host skip):', prevPhaseSkip, '->', nextPhase);
        if (wasNightSkip) { announceNightResult(io, room); notifySpies(io, room); notifyTrackers(io, room); notifyCultConversions(io, room); notifyRoleblocked(io, room); }
        if (wasSpeechSkip && nextPhase !== 'speech') announceSpeechEnd(io, room, nextPhase);
        if (nextPhase === 'game_over') await emitGameOver(io, room);
        broadcastRoom(io, room);
        enforceVoicePhaseRules(io, room);
        if (nextPhase !== 'game_over') startPhaseTimer(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Day Skip Vote ───────────────────────────────────────────────
    socket.on('game:day_skip_vote', (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const player = getPlayerOrError(socket, room);
        if (room.phase !== 'day') throw new Error('Can only skip during day phase.');
        if (!player.isAlive || player.isSpectator) throw new Error('Cannot vote to skip.');
        if (room.daySkipVotes.includes(player.id)) throw new Error('Already voted to skip.');

        room.daySkipVotes.push(player.id);
        const alivePlayers = [...room.players.values()].filter(p => p.isAlive && !p.isSpectator);
        const skipNeeded = Math.min(3, alivePlayers.length);

        if (room.daySkipVotes.length >= skipNeeded) {
          timerService.stop(room.id);
          room.timer = 0;
          const nextPhase = advancePhase(room);
          broadcastRoom(io, room);
          enforceVoicePhaseRules(io, room);
          if (nextPhase !== 'game_over') startPhaseTimer(io, room);
        } else {
          broadcastRoom(io, room);
        }
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Speech Pass (current speaker skips own time) ────────────────────
    socket.on('game:speech_pass', async (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const player = getPlayerOrError(socket, room);
        if (room.phase !== 'speech') throw new Error('Not in speech phase.');
        const currentSpeakerId = room.speechOrder[room.currentSpeakerIdx];
        if (player.id !== currentSpeakerId) throw new Error('Only the current speaker can skip their own turn.');

        timerService.stop(room.id);
        room.timer = 0;
        const nextPhase = advancePhase(room) as Phase;
        if (nextPhase !== 'speech') announceSpeechEnd(io, room, nextPhase);
        if (nextPhase === 'game_over') await emitGameOver(io, room);
        broadcastRoom(io, room);
        enforceVoicePhaseRules(io, room);
        if (nextPhase !== 'game_over') startPhaseTimer(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Foul (alive non-speaker presses foul during speech) ─────────────
    socket.on('game:foul', async (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const player = getPlayerOrError(socket, room);
        if (room.phase !== 'speech') throw new Error('Fouls can only be issued during speech phase.');
        if (!player.isAlive || player.isSpectator) throw new Error('Only alive players can issue fouls.');
        const currentSpeakerId = room.speechOrder[room.currentSpeakerIdx];
        if (player.id === currentSpeakerId) throw new Error('The current speaker cannot foul themselves.');

        // Rate-limit: only one active foul at a time, 6-second cooldown
        if (room.activeFoul && Date.now() < room.activeFoul.endsAt) {
          throw new Error('A foul is already active. Wait for it to expire.');
        }

        const speaker = room.players.get(currentSpeakerId ?? '');
        if (!speaker) throw new Error('No active speaker found.');

        speaker.foulCount = (speaker.foulCount ?? 0) + 1;
        room.activeFoul = { playerId: speaker.id, endsAt: Date.now() + 6000 };

        broadcastSystemMsg(io, room, `⚠️ Foul! ${speaker.name} has received foul ${speaker.foulCount}/3.`);

        // 4th foul (count >= 4) triggers foul_death
        if (speaker.foulCount >= 4) {
          // Temporarily keep alive for final_words
          room.deathSpeakerId  = speaker.id;
          room.finalWordsReason = 'foul_death';
          room.activeFoul = null;

          // Check win as if the death happened now
          speaker.isAlive = false;
          const gameEnds = checkWin(room);
          speaker.isAlive = true;

          timerService.stop(room.id);
          room.timer = 0;

          if (gameEnds) {
            speaker.isAlive = false;
            speaker.deathType = 'foul';
            room.deathSpeakerId  = null;
            room.finalWordsReason = null;
            setPhase(room, 'game_over');
            await emitGameOver(io, room);
          } else {
            setPhase(room, 'final_words');
            startPhaseTimer(io, room);
          }
          broadcastRoom(io, room);
          enforceVoicePhaseRules(io, room);
          cb(ok(null));
          return;
        }

        // Expire the foul after 6 seconds
        setTimeout(() => {
          if (room.activeFoul?.playerId === speaker.id) room.activeFoul = null;
        }, 6000);

        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Set Last Will ────────────────────────────────────────────────────
    socket.on('game:set_will', ({ text }, cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const player = getPlayerOrError(socket, room);
        if (!player.isAlive) throw new Error('Eliminated players cannot change their last will.');
        player.lastWill = text.slice(0, 200);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Pause / Resume Timer ─────────────────────────────────────────────
    socket.on('game:pause', (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const host = getPlayerOrError(socket, room);
        if (!host.isHost) throw new Error('Only the host can pause.');
        if (room.phase === 'lobby' || room.phase === 'game_over') throw new Error('Cannot pause now.');

        if (room.isPaused) {
          room.isPaused = false;
          timerService.resume(room.id);
          broadcastSystemMsg(io, room, '▶ Game resumed.');
        } else {
          room.isPaused = true;
          timerService.pause(room.id);
          broadcastSystemMsg(io, room, '⏸ Game paused by host.');
        }
        broadcastRoom(io, room);
        cb(ok({ isPaused: room.isPaused }));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Leaderboard ──────────────────────────────────────────────────────
    socket.on('leaderboard:get', async (cb) => {
      try { cb(ok(await getLeaderboard())); }
      catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:leaderboard', async (cb: any) => {
      try {
        const data = await getGiftLeaderboard();
        cb(ok(data));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Terminate Game (host-only, resets to lobby) ─────────────────
    socket.on('game:terminate', (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const host = getPlayerOrError(socket, room);
        if (!host.isHost) throw new Error('Only the host can terminate the game.');
        if (room.phase === 'lobby') throw new Error('No active game to terminate.');

        timerService.stop(room.id);
        room.phase = 'lobby';
        room.winner = null;
        room.day = 0;
        room.timer = 0;
        room.maxTimer = 0;
        room.nightActions = new Map();
        room.votes = new Map();
        room.killedLastNight = [];
        room.savedLastNight = false;
        room.daySkipVotes = [];
        room.speechOrder = [];
        room.currentSpeakerIdx = 0;
        room.isPaused = false;
        room.nominations = new Map();
        room.tribunalCandidates = [];
        room.gameTimeline = [];

        for (const p of room.players.values()) {
          p.role = null;
          p.team = null;
          p.isAlive = true;
          p.isReady = false;
          p.voteTarget = null;
          p.hasActedThisPhase = false;
          p.deathType = null;
        }

        broadcastSystemMsg(io, room, 'The host terminated the game. Returning to lobby.');
        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Restart ─────────────────────────────────────────────────────
    socket.on('game:restart', (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const host = getPlayerOrError(socket, room);
        if (!host.isHost) throw new Error('Only the host can restart.');

        // Stop any running timers immediately so stale onComplete callbacks cannot fire
        timerService.stop(room.id);

        // Full game-state wipe — only room-level fields persist (id, code, players, settings)
        room.phase = 'lobby';
        room.winner = null;
        room.day = 0;
        room.timer = 0;
        room.maxTimer = 0;
        room.isPaused = false;
        room.nightActions = new Map();
        room.votes = new Map();
        room.killedLastNight = [];
        room.savedLastNight = false;
        room.daySkipVotes = [];
        room.speechOrder = [];
        room.currentSpeakerIdx = 0;
        room.gameTimeline = [];

        for (const p of room.players.values()) {
          p.role = null;
          p.team = null;
          p.isAlive = true;
          p.isReady = false;
          p.voteTarget = null;
          p.hasActedThisPhase = false;
          p.deathType = null;
          p.lastWill = null;
        }

        broadcastSystemMsg(io, room, 'The host has restarted the room. Prepare for a new game.');
        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Chat ────────────────────────────────────────────────────────
    socket.on('chat:send', async (data, cb) => {
      try {
        const parsed = ChatSchema.parse(data);
        const room = getRoomFromSocket(socket);
        const player = getPlayerOrError(socket, room);

        // Check mute
        const profileId = socket.data.profileId;
        if (profileId) {
          const mute = await getActiveMute(profileId);
          if (mute) throw new Error(`You are muted until ${new Date(mute.expiresAt).toLocaleString()}. Reason: ${mute.reason}`);
        }

        const validationError = validateChat(room, player, parsed.channel);
        if (validationError) throw new Error(validationError);

        const profile = profileId ? await getPlayer(profileId) : null;
        const msg = createPlayerMessage(player, parsed.text, parsed.channel, profile?.isModerator ?? false);
        addMessage(room, msg);

        if (parsed.channel === 'mafia') {
          for (const p of room.players.values()) {
            if (p.team === 'mafia' && p.socketId) io.to(p.socketId).emit('chat:new', msg);
          }
        } else if (parsed.channel === 'dead') {
          for (const p of room.players.values()) {
            if ((!p.isAlive || p.isSpectator) && p.socketId) {
              io.to(p.socketId).emit('chat:new', msg);
            }
          }
        } else if (parsed.channel === 'spectator') {
          for (const p of room.players.values()) {
            if (p.isSpectator && p.socketId) io.to(p.socketId).emit('chat:new', msg);
          }
        } else {
          io.to(room.id).emit('chat:new', msg);
        }

        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Kick from room ──────────────────────────────────────────
    socket.on('mod:kick_from_room', async ({ targetProfileId, roomId, reason }, cb) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'kick')) throw new Error('Insufficient permissions.');

        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');

        const target = getPlayerByProfile(room, targetProfileId);
        if (!target) throw new Error('Player not found in room.');

        if (target.socketId) {
          const targetSock = io.sockets.sockets.get(target.socketId);
          if (targetSock) {
            targetSock.emit('kicked', { reason: `Removed by moderator. Reason: ${reason}` });
            handleVoiceLeave(io, target.socketId);
            handlePlayerLeave(io, targetSock as any, roomId, target.id);
          } else {
            removePlayer(room, target.id);
            if (room.players.size > 0) {
              broadcastSystemMsg(io, room, `${target.name} was removed by a moderator.`);
              broadcastRoom(io, room);
            }
          }
        } else {
          removePlayer(room, target.id);
          if (room.players.size > 0) {
            broadcastSystemMsg(io, room, `${target.name} was removed by a moderator.`);
            broadcastRoom(io, room);
          }
        }

        await logKick(modProfileId, mod.username, target.profileId ?? targetProfileId, target.name, roomId, reason);
        cb(ok(null));
        notifyMods(io, 'mod_kick', `${mod.username} kicked ${target.name} from room`, target.name).catch(() => {});
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Kick player (any room) ──────────────────────────────────
    socket.on('mod:kick_player', async ({ targetProfileId, reason }, cb) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'kick')) throw new Error('Insufficient permissions.');

        const targetProfile = await getPlayer(targetProfileId);
        if (targetProfile && targetProfile.moderatorLevel) {
          const targetRank = ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(targetProfile.moderatorLevel);
          const modRank = mod.moderatorLevel ? ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(mod.moderatorLevel) : -1;
          if (targetRank >= modRank) throw new Error('Cannot kick a moderator of equal or higher rank.');
        }

        // Scan all rooms to find the target
        let foundRoom: import('./types/index.js').Room | null = null;
        let foundTarget: import('./types/index.js').Player | null = null;
        for (const room of getAllRooms()) {
          const player = getPlayerByProfile(room, targetProfileId);
          if (player) {
            foundRoom = room;
            foundTarget = player;
            break;
          }
        }

        if (!foundRoom || !foundTarget) throw new Error('Player is not currently in any room.');

        if (foundTarget.socketId) {
          const targetSock = io.sockets.sockets.get(foundTarget.socketId);
          if (targetSock) {
            targetSock.emit('kicked', { reason: `Removed by moderator. Reason: ${reason}` });
            handleVoiceLeave(io, foundTarget.socketId);
            handlePlayerLeave(io, targetSock as any, foundRoom.id, foundTarget.id);
          } else {
            removePlayer(foundRoom, foundTarget.id);
            if (foundRoom.players.size > 0) {
              broadcastSystemMsg(io, foundRoom, `${foundTarget.name} was removed by a moderator.`);
              broadcastRoom(io, foundRoom);
            }
          }
        } else {
          removePlayer(foundRoom, foundTarget.id);
          if (foundRoom.players.size > 0) {
            broadcastSystemMsg(io, foundRoom, `${foundTarget.name} was removed by a moderator.`);
            broadcastRoom(io, foundRoom);
          }
        }

        await logKick(modProfileId, mod.username, foundTarget.profileId ?? targetProfileId, foundTarget.name, foundRoom.id, reason);
        cb(ok(null));
        notifyMods(io, 'mod_kick', `${mod.username} kicked ${foundTarget.name} from room`, foundTarget.name).catch(() => {});
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Get active rooms ────────────────────────────────────────
    socket.on('mod:get_active_rooms', async (cb) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        cb(ok(getAllRooms().map(toRoomListItem)));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Ban ─────────────────────────────────────────────────────
    socket.on('mod:ban', async ({ targetProfileId, reason, duration }, cb) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'ban_short')) throw new Error('Insufficient permissions.');

        const targetForRankCheck = await getPlayer(targetProfileId);
        if (targetForRankCheck && targetForRankCheck.moderatorLevel) {
          const targetRank = ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(targetForRankCheck.moderatorLevel);
          const modRank = mod.moderatorLevel ? ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(mod.moderatorLevel) : -1;
          if (targetRank >= modRank) throw new Error('Cannot ban a moderator of equal or higher rank.');
        }

        const ban = await banPlayer(modProfileId, mod.username, targetProfileId, reason, duration);

        // Disconnect target from all rooms
        const targetSock = findSocketByProfile(io as any, targetProfileId);
        if (targetSock) {
          targetSock.emit('ban:received', { reason, expiresAt: ban.expiresAt });
          const { roomId: targetRoomId, playerId: targetPlayerId } = targetSock.data as SocketData;
          if (targetRoomId && targetPlayerId) {
            handlePlayerLeave(io, targetSock as any, targetRoomId, targetPlayerId);
          }
          targetSock.disconnect(true);
        }

        cb(ok(null));
        // Notify mods in background — don't block the ack
        getPlayer(targetProfileId).then(target => {
          notifyMods(io, 'mod_ban', `${mod.username} banned ${target?.username ?? '?'}`, target?.username).catch(() => {});
        }).catch(() => {});
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Unban ───────────────────────────────────────────────────
    socket.on('mod:unban', async ({ targetProfileId }, cb) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'ban_short')) throw new Error('Insufficient permissions.');
        await unbanPlayer(modProfileId, mod.username, targetProfileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Mute ────────────────────────────────────────────────────
    socket.on('mod:mute', async ({ targetProfileId, reason, duration }, cb) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'mute')) throw new Error('Insufficient permissions.');

        const mute = await mutePlayer(modProfileId, mod.username, targetProfileId, reason, duration);

        const targetSock = findSocketByProfile(io as any, targetProfileId);
        if (targetSock) {
          targetSock.emit('mute:received', { reason, expiresAt: mute.expiresAt });
        }

        cb(ok(null));
        getPlayer(targetProfileId).then(target => {
          notifyMods(io, 'mod_mute', `${mod.username} muted ${target?.username ?? '?'}`, target?.username).catch(() => {});
        }).catch(() => {});
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Unmute ──────────────────────────────────────────────────
    socket.on('mod:unmute', async ({ targetProfileId }, cb) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'mute')) throw new Error('Insufficient permissions.');
        await unmutePlayer(modProfileId, mod.username, targetProfileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Warn ────────────────────────────────────────────────────
    socket.on('mod:warn', async ({ targetProfileId, reason, category }: { targetProfileId: string; reason: string; category?: string }, cb) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'warn')) throw new Error('Insufficient permissions.');

        const target = await getPlayer(targetProfileId);
        if (target && target.moderatorLevel) {
          const targetRank = ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(target.moderatorLevel);
          const modRank = mod.moderatorLevel ? ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(mod.moderatorLevel) : -1;
          if (targetRank >= modRank) throw new Error('Cannot warn a moderator of equal or higher rank.');
        }

        const warnCat = (category ?? 'other') as import('./types/index.js').WarnCategory;
        const warning = await warnPlayer(modProfileId, mod.username, targetProfileId, reason, warnCat);

        const targetSock = findSocketByProfile(io as any, targetProfileId);
        if (targetSock) {
          targetSock.emit('warning:received', { reason, category: warnCat, moderatorName: mod.username });
        }

        cb(ok(null));
        notifyMods(io, 'mod_warn', `${mod.username} warned ${target?.username ?? '?'}`, target?.username).catch(() => {});
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Get data ────────────────────────────────────────────────
    socket.on('mod:get_reports', async (cb) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        cb(ok(await getReports()));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:get_rooms', async (cb) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        cb(ok(getAllRooms().map(toRoomListItem)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:get_players', async (cb) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        cb(ok(await getModPlayers()));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:get_logs', async (cb) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_logs')) throw new Error('Insufficient permissions.');
        cb(ok(await getLogs()));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:resolve_report', async ({ reportId, status, notes }, cb) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'resolve_reports')) throw new Error('Insufficient permissions.');
        await resolveReport(modProfileId, reportId, status, notes);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Terminate any room's game ───────────────────────────────
    socket.on('mod:terminate_game', async ({ roomId, reason }: { roomId: string; reason: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'ban_long')) throw new Error('Insufficient permissions.');

        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');
        if (room.phase === 'lobby') throw new Error('No active game to terminate.');

        timerService.stop(room.id);
        room.phase = 'lobby';
        room.winner = null;
        room.day = 0;
        room.timer = 0;
        room.maxTimer = 0;
        room.nightActions = new Map();
        room.votes = new Map();
        room.killedLastNight = [];
        room.savedLastNight = false;
        room.daySkipVotes = [];
        room.speechOrder = [];
        room.currentSpeakerIdx = 0;
        room.isPaused = false;
        room.gameTimeline = [];

        for (const p of room.players.values()) {
          p.role = null;
          p.team = null;
          p.isAlive = true;
          p.isReady = false;
          p.voteTarget = null;
          p.hasActedThisPhase = false;
          p.deathType = null;
        }

        broadcastSystemMsg(io, room, `A moderator terminated the game. Reason: ${reason || 'Rule violation'}`);
        broadcastRoom(io, room);
        await logKick(modProfileId, mod.username, roomId, room.code, roomId, `Terminated game: ${reason || 'Rule violation'}`);
        await notifyMods(io, 'mod_kick', `${mod.username} terminated game in room ${room.code}`, room.code);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Dashboard Stats ──────────────────────────────────────────
    socket.on('mod:get_dashboard', async (cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        const { openReports, recentBans } = await getDashboardDbStats();
        const rooms = getAllRooms();
        cb(ok({
          onlinePlayers: getOnlineCount(),
          activeRooms: rooms.length,
          openReports,
          recentBans,
        }));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Live Rooms (NO roles/teams) ─────────────────────────────
    socket.on('mod:get_rooms_live', async (cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        const rooms = getAllRooms();
        const result: LiveRoomInfo[] = rooms.map(room => {
          const hostPlayer = getHostPlayer(room);
          const players: LiveRoomPlayer[] = Array.from(room.players.values())
            .filter(p => !p.isSpectator)
            .map(p => ({
              id: p.id,
              name: p.name,
              seat: p.seat,
              isAlive: p.isAlive,
              isConnected: p.isConnected,
              profileId: p.profileId ?? null,
              // role and team intentionally omitted — never expose before game_over
            }));
          return {
            id: room.id,
            code: room.code,
            phase: room.phase,
            day: room.day,
            timer: room.timer,
            maxTimer: room.maxTimer,
            playerCount: players.length,
            hostName: hostPlayer?.name ?? '?',
            isPrivate: room.settings.isPrivate,
            isPaused: room.isPaused,
            players,
          };
        });
        cb(ok(result));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Pause Timer ──────────────────────────────────────────────
    socket.on('mod:pause_timer', async ({ roomId }: { roomId: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'kick')) throw new Error('Insufficient permissions.');
        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');
        if (room.phase === 'lobby' || room.phase === 'game_over') throw new Error('No active game timer.');
        timerService.pause(room.id);
        room.isPaused = true;
        broadcastSystemMsg(io, room, `⏸ A moderator paused the timer.`);
        broadcastRoom(io, room);
        await addModLog('pause_timer', modProfileId!, mod.username, roomId, room.code, roomId, 'Mod pause');
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Resume Timer ─────────────────────────────────────────────
    socket.on('mod:resume_timer', async ({ roomId }: { roomId: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'kick')) throw new Error('Insufficient permissions.');
        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');
        timerService.resume(room.id);
        room.isPaused = false;
        broadcastSystemMsg(io, room, `▶ A moderator resumed the timer.`);
        broadcastRoom(io, room);
        await addModLog('resume_timer', modProfileId!, mod.username, roomId, room.code, roomId, 'Mod resume');
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Force Phase ──────────────────────────────────────────────
    socket.on('mod:force_phase', async ({ roomId, phase }: { roomId: string; phase: Phase }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'ban_long')) throw new Error('Insufficient permissions.');
        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');
        if (phase === 'game_over') throw new Error('Use terminate to end a game.');
        const allowed: Phase[] = ['night', 'morning', 'day', 'speech', 'voting'];
        if (!allowed.includes(phase)) throw new Error('Invalid phase.');
        timerService.stop(room.id);
        setPhase(room, phase);
        broadcastSystemMsg(io, room, `⚡ A moderator forced phase: ${phase}.`);
        broadcastRoom(io, room);
        await addModLog('force_phase', modProfileId!, mod.username, roomId, room.code, roomId, `Force phase: ${phase}`);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: System Message to Room ───────────────────────────────────
    socket.on('mod:system_message', async ({ roomId, message }: { roomId: string; message: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'kick')) throw new Error('Insufficient permissions.');
        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');
        const text = message.trim().slice(0, 300);
        if (!text) throw new Error('Message cannot be empty.');
        broadcastSystemMsg(io, room, `[MOD] ${text}`);
        await addModLog('system_message', modProfileId!, mod.username, roomId, room.code, roomId, text);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Broadcast to All Rooms ───────────────────────────────────
    socket.on('mod:broadcast', async ({ message }: { message: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'ban_short')) throw new Error('Insufficient permissions.');
        const text = message.trim().slice(0, 300);
        if (!text) throw new Error('Message cannot be empty.');
        for (const room of getAllRooms()) {
          broadcastSystemMsg(io, room, `[BROADCAST] ${text}`);
        }
        io.emit('mod:notification' as any, { type: 'broadcast', message: `[BROADCAST] ${text}` });
        await addModLog('broadcast', modProfileId!, mod.username, 'all', 'all', null, text);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Toggle Maintenance Mode ──────────────────────────────────
    socket.on('mod:toggle_maintenance', async ({ enabled }: { enabled: boolean }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'ban_long')) throw new Error('Insufficient permissions.');
        maintenanceMode = enabled;
        io.emit('maintenance:status', { enabled });
        await addModLog('broadcast', modProfileId!, mod.username, 'system', 'system', null, `Maintenance mode: ${enabled}`);
        cb(ok({ enabled }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:get_maintenance', async (cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        cb(ok({ enabled: maintenanceMode }));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Player Detail ────────────────────────────────────────────
    socket.on('mod:get_player_detail', async ({ targetProfileId }: { targetProfileId: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        const detail = await getPlayerDetail(targetProfileId);
        cb(ok(detail));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Add Note ─────────────────────────────────────────────────
    socket.on('mod:add_note', async ({ targetProfileId, note }: { targetProfileId: string; note: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        await addModNote(modProfileId!, mod.username, targetProfileId, note);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Freeze / Unfreeze Account ────────────────────────────────
    socket.on('mod:freeze_account', async ({ targetProfileId, reason }: { targetProfileId: string; reason: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'ban_short')) throw new Error('Insufficient permissions.');
        await freezeAccount(modProfileId!, mod.username, targetProfileId, reason);
        await notifyMods(io, 'mod_freeze', `${mod.username} froze account of ${targetProfileId}`, targetProfileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:unfreeze_account', async ({ targetProfileId }: { targetProfileId: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'ban_short')) throw new Error('Insufficient permissions.');
        await unfreezeAccount(modProfileId!, mod.username, targetProfileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Rename Player ────────────────────────────────────────────
    socket.on('mod:rename_player', async ({ targetProfileId, newName, reason }: { targetProfileId: string; newName: string; reason: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'ban_short')) throw new Error('Insufficient permissions.');
        await renamePlayer(modProfileId!, mod.username, targetProfileId, newName, reason);
        await notifyMods(io, 'mod_rename', `${mod.username} renamed player`, targetProfileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Voice Mute Room ──────────────────────────────────────────
    socket.on('mod:voice_mute_room', async ({ roomId, reason }: { roomId: string; reason: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'kick')) throw new Error('Insufficient permissions.');
        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');
        io.to(room.id).emit('voice:force-mute', { reason: reason || 'Muted by moderator' });
        broadcastSystemMsg(io, room, `🔇 A moderator muted all voice in this room.`);
        await addModLog('kick', modProfileId!, mod.username, roomId, room.code, roomId, `Voice mute: ${reason}`);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Assign Report ────────────────────────────────────────────
    socket.on('mod:assign_report', async ({ reportId, modId }: { reportId: string; modId: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        await assignReport(reportId, modId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Player Profile (by profileId) ─────────────────────────────────
    socket.on('player:profile', async ({ profileId }, cb) => {
      try {
        const profile = await getPlayer(profileId);
        if (!profile) throw new Error('Profile not found.');
        cb(ok(toPublicProfile(profile)));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Achievements ─────────────────────────────────────────────────
    socket.on('player:achievements', async ({ profileId }, cb) => {
      try {
        const achs = await getPlayerAchievements(profileId);
        cb(ok(achs));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Game History ──────────────────────────────────────────────────
    socket.on('player:history', async ({ profileId }, cb) => {
      try {
        const history = await getPlayerHistory(profileId, 20);
        cb(ok(history));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Public Profile (for profile popups) ──────────────────────────
    socket.on('player:public_profile', async ({ profileId }: { profileId: string }, cb: any) => {
      try {
        const profile = await getPlayer(profileId);
        if (!profile) throw new Error('Player not found.');

        const [achievements, history, clanMembership, roleStats] = await Promise.all([
          getPlayerAchievements(profileId),
          getPlayerHistory(profileId, 10),
          getClanMembershipByPlayer(profileId),
          getPlayerRoleStats(profileId),
        ]);

        let friendshipStatus: string = 'none';
        const myProfileId = socket.data.profileId;
        if (myProfileId && myProfileId !== profileId) {
          friendshipStatus = await getFriendshipStatus(myProfileId, profileId);
        }

        cb(ok({
          profile: toPublicProfile(profile),
          achievements,
          recentGames: history,
          clan: clanMembership,
          friendshipStatus,
          isOnline: isOnline(profileId),
          roleStats,
        }));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Role Stats (role/team breakdown for any player) ───────────────
    socket.on('player:role_stats', async ({ profileId }: { profileId: string }, cb: any) => {
      try {
        const stats = await getPlayerRoleStats(profileId);
        cb(ok(stats));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Clans ─────────────────────────────────────────────────────────
    socket.on('clan:list', async (cb) => {
      try { cb(ok(await getAllClans())); } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:get', async ({ clanId }, cb) => {
      try {
        const clan = await getClan(clanId);
        if (!clan) throw new Error('Clan not found.');
        const members = await getClanMembers(clanId);
        cb(ok({ clan, members }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:mine', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) return cb(ok(null));
        cb(ok(await getClanByPlayer(profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:my_membership', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) return cb(ok(null));
        cb(ok(await getClanMembershipByPlayer(profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:create', async ({ name, tag, description }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const clan = await createClan(profileId, name, tag, description);
        cb(ok(clan));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:join', async ({ clanId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await joinClan(profileId, clanId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:leave', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await leaveClan(profileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:update_image', async ({ clanId, imageData }: { clanId: string; imageData: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await setClanImage(clanId, profileId, imageData);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Voice: Join Channel ─────────────────────────────────────────
    socket.on('voice:join', ({ channel }, cb) => {
      try {
        const { roomId, playerId } = socket.data;
        if (!roomId || !playerId) return cb(err('Not in a room.'));
        const room = getRoom(roomId);
        if (!room) return cb(err('Room not found.'));

        const validChannel: VoiceChannel = (channel === 'room' || channel === 'mafia') ? channel : 'room';
        const authError = voiceCanJoin(room, playerId, validChannel);
        if (authError) return cb(err(authError));

        const player = room.players.get(playerId)!;
        const existing = voiceJoin(roomId, validChannel, {
          socketId: socket.id,
          playerId,
          name: player.name,
        });

        // Notify existing peers a new participant joined
        for (const peer of existing) {
          io.to(peer.socketId).emit('voice:peer-joined', {
            socketId: socket.id,
            name: player.name,
            channel: validChannel,
          });
        }

        const transmitAllowed = !canTransmitVoice(room, playerId, validChannel);
        const iceConfig = buildIceConfig();
        cb(ok({
          peers: existing.map(p => ({ socketId: p.socketId, name: p.name })),
          transmitAllowed,
          iceServers: iceConfig.iceServers,
          iceTransportPolicy: iceConfig.iceTransportPolicy,
        }));
      } catch (e: any) {
        cb(err(e.message ?? 'Failed to join voice.'));
      }
    });

    // ── Voice: Leave Channel ────────────────────────────────────────
    socket.on('voice:leave', () => {
      handleVoiceLeave(io, socket.id);
    });

    // ── Voice: Relay Offer ──────────────────────────────────────────
    socket.on('voice:offer', ({ to, sdp }, cb) => {
      const channel = voiceGetSharedChannel(socket.id, to);
      if (!channel) return cb(err('Not in the same voice channel.'));
      io.to(to).emit('voice:offer', { from: socket.id, sdp });
      cb(ok(null));
    });

    // ── Voice: Relay Answer ─────────────────────────────────────────
    socket.on('voice:answer', ({ to, sdp }, cb) => {
      io.to(to).emit('voice:answer', { from: socket.id, sdp });
      cb(ok(null));
    });

    // ── Voice: Relay ICE Candidate ──────────────────────────────────
    socket.on('voice:ice-candidate', ({ to, candidate }) => {
      io.to(to).emit('voice:ice-candidate', { from: socket.id, candidate });
    });

    // ── Rematch ─────────────────────────────────────────────────────
    socket.on('game:rematch', (cb) => {
      try {
        const { roomId } = socket.data;
        if (!roomId) throw new Error('Not in a room.');
        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');
        if (room.phase !== 'game_over') throw new Error('Game is not over yet.');
        const player = getPlayerBySocket(room, socket.id);
        if (!player?.isHost) throw new Error('Only the host can start a rematch.');
        cancelAutoStart(roomId);
        timerService.stop(roomId);
        rematchRoom(room);
        broadcastSystemMsg(io, room, 'The host started a rematch. Prepare for a new game!');
        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Friends ──────────────────────────────────────────────────────
    socket.on('friend:request', async ({ toProfileId, friendCode }: { toProfileId?: string; friendCode?: string }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');

        let targetId = toProfileId;
        if (!targetId && friendCode) {
          const target = await getPlayerByFriendCode(friendCode);
          if (!target) throw new Error('No player found with that code.');
          targetId = target.id;
        }
        if (!targetId) throw new Error('Provide a friend code.');
        if (targetId === profileId) throw new Error('Cannot add yourself.');

        await sendFriendRequest(profileId, targetId);
        const targetSock = findSocketByProfile(io as any, targetId);
        if (targetSock) {
          const reqs = await getPendingRequests(targetId);
          const thisReq = reqs.find(r => r.fromId === profileId);
          if (thisReq) targetSock.emit('friend:request_received', thisReq);
        }
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('player:find_by_code', async ({ friendCode }: { friendCode: string }, cb) => {
      try {
        const player = await getPlayerByFriendCode(friendCode);
        if (!player) return cb(err('No player found with that code.'));
        cb(ok(toPublicProfile(player)));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Set mod level by profile ID (owner only) ───────────────
    socket.on('mod:set_mod_level', async ({ targetProfileId, level }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(profileId);
        if (!mod || mod.moderatorLevel !== 'owner') throw new Error('Owner only.');
        const target = await getPlayer(targetProfileId);
        if (!target) throw new Error('Player not found.');
        const validLevels = ['moderator', 'senior_moderator', 'admin', 'owner', null];
        if (!validLevels.includes(level as any)) throw new Error('Invalid level.');
        await setGrantedModLevel(target.id, level as any);
        const updated = await getPlayer(target.id);
        if (!updated) throw new Error('Player not found after update.');
        const targetSock = findSocketByProfile(io as any, target.id);
        if (targetSock) targetSock.emit('player:profile', toPublicProfile(updated));
        cb(ok({ username: target.username, newLevel: level }));
        notifyMods(io, 'mod_grant', `${mod.username} set ${target.username} → ${level ?? 'none'}`, target.username).catch(() => {});
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:set_level_by_code', async ({ friendCode, level }: { friendCode: string; level: string | null }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(profileId);
        if (!mod || mod.moderatorLevel !== 'owner') throw new Error('Owner only.');
        const target = await getPlayerByFriendCode(friendCode);
        if (!target) throw new Error('No player found with that code.');
        const validLevels = ['moderator', 'senior_moderator', 'admin', 'owner', null];
        if (!validLevels.includes(level as any)) throw new Error('Invalid level.');
        await setGrantedModLevel(target.id, level as any);
        const updated = await getPlayer(target.id);
        if (!updated) throw new Error('Player not found after update.');
        const targetSock = findSocketByProfile(io as any, target.id);
        if (targetSock) targetSock.emit('player:profile', toPublicProfile(updated));
        cb(ok({ username: target.username, newLevel: level }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('friend:accept', async ({ fromProfileId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await acceptFriend(fromProfileId, profileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('friend:decline', async ({ fromProfileId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await declineFriend(fromProfileId, profileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('friend:remove', async ({ profileId: friendId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await removeFriend(profileId, friendId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('friend:list', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        cb(ok(await getFriends(profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('friend:requests', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        cb(ok(await getPendingRequests(profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Daily Challenge ──────────────────────────────────────────────
    socket.on('challenge:today', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        cb(ok(await getDailyChallengeForPlayer(profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Cosmetics ────────────────────────────────────────────────────
    socket.on('cosmetics:equip', async ({ type, itemId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const cosmetics = await equipCosmetic(profileId, type, itemId);
        cb(ok(cosmetics));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('cosmetics:get', async ({ profileId }, cb) => {
      try {
        cb(ok(await getCosmetics(profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Direct Messages ────────────────────────────────────────────────
    socket.on('dm:start', async ({ profileId: targetProfileId }: { profileId: string }, cb: any) => {
      try {
        const myProfileId = socket.data.profileId;
        if (!myProfileId) throw new Error('Not authenticated.');
        if (myProfileId === targetProfileId) throw new Error('Cannot message yourself.');
        const conv = await getOrCreateConversation(myProfileId, targetProfileId);
        const messages = await getMessages(conv.id);
        await markRead(conv.id, myProfileId);
        const otherProfile = await getPlayer(targetProfileId);
        cb(ok({
          id: conv.id,
          conversation: conv,
          messages,
          otherUsername: otherProfile?.username ?? 'Unknown',
          otherAvatar: otherProfile?.avatar ?? '?',
          otherAvatarUrl: otherProfile?.avatarUrl ?? null,
        }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('dm:send', async ({ conversationId, text }: { conversationId: string; text: string }, cb: any) => {
      try {
        const senderId = socket.data.profileId;
        if (!senderId) throw new Error('Not authenticated.');
        if (!text?.trim()) throw new Error('Message cannot be empty.');
        const [conv] = await sql`SELECT * FROM conversations WHERE id = ${conversationId}` as any[];
        if (!conv) throw new Error('Conversation not found.');
        const receiverId = conv.participant1 === senderId ? conv.participant2 : conv.participant1;
        if (conv.participant1 !== senderId && conv.participant2 !== senderId) throw new Error('Not a participant.');
        const msg = await sendMessage(conversationId, senderId, text.trim(), receiverId);
        // Notify recipient in real time with sender info for toast
        const recipientSocket = findSocketByProfile(io, receiverId);
        if (recipientSocket) {
          const senderProfile = await getPlayer(senderId);
          recipientSocket.emit('dm:new_message', {
            conversationId,
            message: msg,
            senderUsername: senderProfile?.username ?? 'Unknown',
            senderAvatar: senderProfile?.avatar ?? '?',
          });
        }
        cb(ok(msg));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('dm:list', async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const conversations = await listConversations(profileId);
        cb(ok(conversations));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('dm:messages', async ({ conversationId }: { conversationId: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const [conv] = await sql`SELECT * FROM conversations WHERE id = ${conversationId}` as any[];
        if (!conv || (conv.participant1 !== profileId && conv.participant2 !== profileId)) {
          throw new Error('Not a participant.');
        }
        const messages = await getMessages(conversationId);
        await markRead(conversationId, profileId);
        cb(ok(messages));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('dm:mark_read', async ({ conversationId }: { conversationId: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await markRead(conversationId, profileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('dm:unread_count', async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(ok(0)); return; }
        const count = await getTotalUnread(profileId);
        cb(ok(count));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('dm:delete', async ({ conversationId }: { conversationId: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await deleteConversationForUser(conversationId, profileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Economy — Coins & Gifts ─────────────────────────────────────

    // ── Lobby Chat ───────────────────────────────────────────────────

    socket.on('lobby:history', async (data: any, cb: any) => {
      const fn = typeof cb === 'function' ? cb : data;
      fn(ok([...lobbyChatHistory]));
    });

    socket.on('lobby:send', async ({ text }: { text: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const trimmed = text?.trim();
        if (!trimmed || trimmed.length > 200) { cb(err('Invalid message.')); return; }
        if (!rateOk(socket.id, 3)) { cb(err('Slow down.')); return; }
        const profile = await getPlayer(profileId);
        if (!profile) { cb(err('Profile not found.')); return; }
        const msg: LobbyMessage = {
          id: `lm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          profileId,
          username: profile.username,
          avatar: profile.avatar,
          avatarUrl: profile.avatarUrl ?? null,
          level: profile.level ?? 1,
          text: trimmed,
          createdAt: Date.now(),
          nameColor: profile.cosmetics?.equippedNameColor ?? null,
        };
        lobbyChatHistory.push(msg);
        if (lobbyChatHistory.length > LOBBY_CHAT_MAX) lobbyChatHistory.shift();
        io.emit('lobby:message', msg);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('lobby:delete_msg', async ({ msgId }: { msgId: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const profile = await getPlayer(profileId);
        if (!profile?.isModerator) { cb(err('Not authorized.')); return; }
        const idx = lobbyChatHistory.findIndex(m => m.id === msgId);
        if (idx !== -1) lobbyChatHistory.splice(idx, 1);
        io.emit('lobby:msg_deleted', { msgId });
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Economy — Coins & Gifts ─────────────────────────────────────

    socket.on('coins:balance', async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(ok({ coins: 0 })); return; }
        const coins = await getCoins(profileId);
        cb(ok({ coins }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('coins:daily_reward', async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const result = await claimDailyReward(profileId);
        if (!result.alreadyClaimed) {
          socket.emit('coins:updated', { coins: result.balance });
        }
        cb(ok(result));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('coins:send_gift', async ({ recipientId, giftId, message }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const { newSenderBalance, giftEntry } = await sendGift(profileId, recipientId, giftId, message ?? '');
        socket.emit('coins:updated', { coins: newSenderBalance });
        // Notify recipient in real-time if connected
        const recipientSock = findSocketByProfile(io as any, recipientId);
        if (recipientSock) {
          recipientSock.emit('gifts:received' as any, {
            giftId: giftEntry.giftId,
            giftName: giftEntry.giftName,
            giftIcon: giftEntry.giftIcon,
            giftImageUrl: giftEntry.giftImageUrl,
            giftRarity: giftEntry.giftRarity,
            senderName: giftEntry.senderUsername,
            senderAvatar: giftEntry.senderAvatar,
            senderAvatarUrl: giftEntry.senderAvatarUrl,
            message: giftEntry.message,
          });
        }
        socket.emit('gifts:sent' as any, { giftId: giftEntry.giftId });
        cb(ok({ newBalance: newSenderBalance }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('coins:transactions', async ({ profileId: targetId }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        // A player can view their own transactions; owner can view anyone's
        const requester = await getPlayer(profileId);
        const resolvedId = targetId && requester?.moderatorLevel === 'owner' ? targetId : profileId;
        const txs = await getTransactions(resolvedId);
        cb(ok(txs));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:catalog', async (cb: any) => {
      try {
        const catalog = await getGiftCatalog(false);
        cb(ok(catalog));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:player_gifts', async ({ profileId: targetId }: any, cb: any) => {
      try {
        if (!targetId) throw new Error('profileId required.');
        const gifts = await getPlayerGifts(targetId);
        cb(ok(gifts));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:getSent', async ({ profileId: targetId }: any, cb: any) => {
      try {
        if (!targetId) throw new Error('profileId required.');
        const gifts = await getGiftsSent(targetId);
        cb(ok(gifts));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:getTimeline', async ({ profileId: targetId }: any, cb: any) => {
      try {
        if (!targetId) throw new Error('profileId required.');
        const entries = await getGiftTimeline(targetId);
        cb(ok(entries));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:getStats', async ({ profileId: targetId }: any, cb: any) => {
      try {
        if (!targetId) throw new Error('profileId required.');
        const stats = await getGiftStats(targetId);
        cb(ok(stats));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:getPinned', async ({ profileId: targetId }: any, cb: any) => {
      try {
        if (!targetId) throw new Error('profileId required.');
        const pinned = await getPinnedGifts(targetId);
        cb(ok(pinned));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:pin', async ({ giftId }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        if (!giftId) throw new Error('giftId required.');
        await pinGift(profileId, giftId);
        cb(ok({}));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:unpin', async ({ giftId }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        if (!giftId) throw new Error('giftId required.');
        await unpinGift(profileId, giftId);
        cb(ok({}));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:detail', async ({ giftId, recipientId }: any, cb: any) => {
      try {
        if (!giftId || !recipientId) throw new Error('giftId and recipientId required.');
        const detail = await getGiftDetail(giftId, recipientId);
        if (!detail) throw new Error('Gift not found.');
        cb(ok(detail));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Economy — Owner only ────────────────────────────────────────

    socket.on('owner:coins_grant', async ({ targetProfileId, amount, description }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (requester?.moderatorLevel !== 'owner') throw new Error('Owner only.');
        const target = await getPlayer(targetProfileId);
        if (!target) throw new Error('Player not found.');
        const result = await grantCoins(profileId, targetProfileId, Number(amount), description ?? '');
        // Notify target if online
        const targetSock = findSocketByProfile(io as any, targetProfileId);
        if (targetSock) targetSock.emit('coins:updated', { coins: result.newBalance });
        cb(ok(result));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('owner:coins_deduct', async ({ targetProfileId, amount, description }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (requester?.moderatorLevel !== 'owner') throw new Error('Owner only.');
        const target = await getPlayer(targetProfileId);
        if (!target) throw new Error('Player not found.');
        const result = await deductCoins(profileId, targetProfileId, Number(amount), description ?? '');
        const targetSock = findSocketByProfile(io as any, targetProfileId);
        if (targetSock) targetSock.emit('coins:updated', { coins: result.newBalance });
        cb(ok(result));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('owner:coins_refund', async ({ transactionId }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (requester?.moderatorLevel !== 'owner') throw new Error('Owner only.');
        await refundGift(transactionId, profileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('owner:gift_create', async (data: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (requester?.moderatorLevel !== 'owner') throw new Error('Owner only.');
        const gift = await createGift(profileId, data);
        cb(ok(gift));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('owner:gift_update', async ({ giftId, ...data }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (requester?.moderatorLevel !== 'owner') throw new Error('Owner only.');
        if (!giftId) throw new Error('giftId required.');
        const gift = await updateGift(giftId, data);
        cb(ok(gift));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('owner:gift_catalog_all', async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (requester?.moderatorLevel !== 'owner') throw new Error('Owner only.');
        const catalog = await getGiftCatalog(true);
        cb(ok(catalog));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('owner:all_transactions', async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (requester?.moderatorLevel !== 'owner') throw new Error('Owner only.');
        const txs = await getAllTransactions(500);
        cb(ok(txs));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Disconnect ──────────────────────────────────────────────────
    socket.on('disconnect', () => {
      rateLimits.delete(socket.id);
      const { roomId, playerId, profileId } = socket.data;
      if (profileId) {
        markOffline(profileId);
        broadcastOnlineCount(io);
      }
      if (roomId && playerId) handlePlayerLeave(io, socket, roomId, playerId);
      handleVoiceLeave(io, socket.id);
      // Remove from any spectate queues
      for (const [qRoomId, queue] of spectateQueues) {
        const idx = queue.indexOf(socket.id);
        if (idx !== -1) {
          queue.splice(idx, 1);
          if (queue.length === 0) spectateQueues.delete(qRoomId);
        }
      }
    });
  });
}

// ── Leave / Disconnect Logic ──────────────────────────────────────────
function closeRoom(io: AppServer, room: Room, reason: string): void {
  timerService.stop(room.id);
  for (const p of room.players.values()) {
    if (p.socketId) {
      io.to(p.socketId).emit('room:closed', { reason });
    }
  }
  io.socketsLeave(room.id);
  deleteRoom(room.id);
}

function promoteFromQueue(io: AppServer, room: Room): void {
  const queue = spectateQueues.get(room.id);
  if (!queue || queue.length === 0) return;
  const nextSocketId = queue.shift()!;
  if (queue.length === 0) spectateQueues.delete(room.id);
  else spectateQueues.set(room.id, queue);
  io.to(nextSocketId).emit('queue:promoted', { roomCode: room.code });
}

function handlePlayerLeave(io: AppServer, socket: AppSocket, roomId: string, playerId: string): void {
  const room = getRoom(roomId);
  if (!room) return;

  const player = room.players.get(playerId);
  if (!player) return;

  const wasHost = player.isHost;

  socket.leave(roomId);
  socket.data.playerId = null;
  socket.data.roomId = null;

  if (room.phase === 'lobby') {
    removePlayer(room, playerId);

    if (room.players.size === 0) {
      timerService.stop(roomId);
      deleteRoom(roomId);
      spectateQueues.delete(roomId);
      return;
    }

    // Host left lobby — close the room for everyone
    if (wasHost) {
      closeRoom(io, room, `${player.name} (host) left. The room has been closed.`);
      spectateQueues.delete(roomId);
      return;
    }

    broadcastSystemMsg(io, room, `${player.name} left the room.`);
    broadcastRoom(io, room);
    promoteFromQueue(io, room);
  } else {
    // Host left during active game — close the entire room
    if (wasHost) {
      closeRoom(io, room, `${player.name} (host) left. The room has been closed.`);
      spectateQueues.delete(roomId);
      return;
    }

    player.isConnected = false;
    player.socketId = '';
    broadcastSystemMsg(io, room, `${player.name} disconnected.`);
    broadcastRoom(io, room);
    promoteFromQueue(io, room);
  }
}

function handleVoiceLeave(io: AppServer, socketId: string): void {
  const removed = voiceLeave(socketId);
  for (const { channel, remaining } of removed) {
    for (const peer of remaining) {
      io.to(peer.socketId).emit('voice:peer-left', { socketId, channel });
    }
  }
}

function forceLeaveVoiceChannel(io: AppServer, roomId: string, channel: VoiceChannel, reason: string): void {
  const members = [...voiceGetMembers(roomId, channel)];
  for (const member of members) {
    io.to(member.socketId).emit('voice:force-leave', { channel, reason });
    const removed = voiceRemoveFromChannel(member.socketId, channel);
    if (removed) {
      for (const peer of removed.remaining) {
        io.to(peer.socketId).emit('voice:peer-left', { socketId: member.socketId, channel });
      }
    }
  }
}

function enforceVoicePhaseRules(io: AppServer, room: Room): void {
  const { id: roomId, phase } = room;

  if (phase === 'night') {
    // Faction players leave the room channel to join their private faction channel.
    // All other players stay in room channel but are muted until day resumes.
    const roomMembers = [...voiceGetMembers(roomId, 'room')];
    for (const member of roomMembers) {
      const player = room.players.get(member.playerId);
      if (player?.team === 'mafia') {
        io.to(member.socketId).emit('voice:force-leave', { channel: 'room', reason: 'Use the Mafia channel during night.' });
        const removed = voiceRemoveFromChannel(member.socketId, 'room');
        if (removed) {
          for (const peer of removed.remaining) {
            io.to(peer.socketId).emit('voice:peer-left', { socketId: member.socketId, channel: 'room' });
          }
        }
      } else if (player?.team === 'yakuza') {
        io.to(member.socketId).emit('voice:force-leave', { channel: 'room', reason: 'Use the Yakuza channel during night.' });
        const removed = voiceRemoveFromChannel(member.socketId, 'room');
        if (removed) {
          for (const peer of removed.remaining) {
            io.to(peer.socketId).emit('voice:peer-left', { socketId: member.socketId, channel: 'room' });
          }
        }
      } else {
        io.to(member.socketId).emit('voice:force-mute', { reason: 'Voice muted during night phase.' });
      }
    }
    return;
  }

  // Leaving night — clean up any stale private faction channel connections
  forceLeaveVoiceChannel(io, roomId, 'mafia',  'Mafia voice is only available during night.');
  forceLeaveVoiceChannel(io, roomId, 'yakuza', 'Yakuza voice is only available during night.');

  if (phase === 'speech') {
    const speakerId = room.speechOrder[room.currentSpeakerIdx] ?? null;
    for (const member of voiceGetMembers(roomId, 'room')) {
      const player = room.players.get(member.playerId);
      if (!player?.isAlive || player?.isSpectator) {
        io.to(member.socketId).emit('voice:force-mute', { reason: 'Listen only.' });
      } else if (member.playerId === speakerId) {
        io.to(member.socketId).emit('voice:force-unmute');
      } else {
        io.to(member.socketId).emit('voice:force-mute', { reason: 'Only the current speaker may transmit.' });
      }
    }
    return;
  }

  if (phase === 'voting') {
    // All players silent during voting
    for (const member of voiceGetMembers(roomId, 'room')) {
      io.to(member.socketId).emit('voice:force-mute', { reason: 'Silent during voting.' });
    }
    return;
  }

  if (phase === 'role_reveal') {
    // All players silent during role reveal
    for (const member of voiceGetMembers(roomId, 'room')) {
      io.to(member.socketId).emit('voice:force-mute', { reason: 'Silent during role reveal.' });
    }
    return;
  }

  if (phase === 'final_words') {
    // Only the dying player may speak
    for (const member of voiceGetMembers(roomId, 'room')) {
      if (member.playerId === room.deathSpeakerId) {
        io.to(member.socketId).emit('voice:force-unmute');
      } else {
        io.to(member.socketId).emit('voice:force-mute', { reason: 'Listen to final words.' });
      }
    }
    return;
  }

  // day, morning, lobby, game_over — lift force mutes for alive players only
  for (const member of voiceGetMembers(roomId, 'room')) {
    const player = room.players.get(member.playerId);
    if (player?.isAlive && !player?.isSpectator) {
      io.to(member.socketId).emit('voice:force-unmute');
    } else {
      io.to(member.socketId).emit('voice:force-mute', { reason: 'Listen only.' });
    }
  }
}
