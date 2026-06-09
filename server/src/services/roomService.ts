import {
  Room, Player, GameSettings, RoomPublic, PlayerPublic, Phase, RoomListItem,
} from '../types/index.js';
import { generateId, generateRoomCode, nameToAvatar } from '../utils/helpers.js';

// ── In-Memory Store ───────────────────────────────────────────────────
const rooms = new Map<string, Room>();

// ── Default Settings ──────────────────────────────────────────────────
export const DEFAULT_SETTINGS: GameSettings = {
  nightDuration: 60,
  dayDuration: 120,
  voteDuration: 60,
  roleRevealDuration: 8,
  speechDuration: 45,
  allowDoctorSelfHeal: true,
  tieVoteRule: 'no_elimination',
  minPlayers: 4,
  isPrivate: false,
  password: '',
  startWithNight: false,
  rotatingSpeech: false,
  roles: {
    mafia: 0,
    don: 0,
    sheriff: 0,
    doctor: 0,
    bodyguard: 0,
    spy: 0,
    vigilante: 0,
    escort: 0,
    maniac: 0,
    jester: 0,
    cult_leader: 0,
    veteran: 0,
    tracker: 0,
    arsonist: 0,
    mayor: 0,
    yakuza: 0,
    shogun: 0,
  },
};

// ── CRUD ──────────────────────────────────────────────────────────────
export function createRoom(
  hostSocketId: string,
  hostName: string,
  profileId: string | null,
  settings?: Partial<GameSettings>,
  clanId?: string | null,
): Room {
  const id = generateId();
  const code = generateRoomCode();

  const hostPlayer: Player = {
    id: generateId(),
    name: hostName.trim().slice(0, 24) || 'Player',
    avatar: nameToAvatar(hostName),
    avatarUrl: null,
    socketId: hostSocketId,
    isHost: true,
    isAlive: true,
    isConnected: true,
    isReady: false,
    role: null,
    team: null,
    voteTarget: null,
    hasActedThisPhase: false,
    seat: 1,
    joinedAt: Date.now(),
    profileId,
    isSpectator: false,
    isWaitingNextRound: false,
    lastWill: null,
    isModerator: false,
    moderatorLevel: null,
    deathType: null,
  };

  const mergedSettings: GameSettings = {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    roles: { ...DEFAULT_SETTINGS.roles, ...(settings?.roles || {}) },
  };

  const room: Room = {
    id,
    code,
    hostId: hostPlayer.id,
    phase: 'lobby',
    players: new Map([[hostPlayer.id, hostPlayer]]),
    waitingNextRound: new Map(),
    day: 0,
    timer: 0,
    maxTimer: 0,
    chat: [],
    mafiaChat: [],
    deadChat: [],
    nightActions: new Map(),
    votes: new Map(),
    killedLastNight: [],
    savedLastNight: false,
    winner: null,
    settings: mergedSettings,
    speechOrder: [],
    currentSpeakerIdx: 0,
    daySkipVotes: [],
    createdAt: Date.now(),
    isPaused: false,
    dousedPlayers: new Set(),
    newlyConvertedCultists: [],
    spectateQueue: [],
    spectatorChat: [],
    startedAt: 0,
    mafiaKillTarget: null,
    nominations: new Map(),
    tribunalCandidates: [],
    deathSpeakerId: null,
    finalWordsReason: null,
    pendingWinner: null,
    speechStartSeat: 0,
    clanId: clanId ?? null,
    clanRoom: !!clanId,
  };

  rooms.set(id, room);
  return room;
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

export function getRoomByCode(code: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.code === code.toUpperCase().trim()) return room;
  }
  return undefined;
}

export function deleteRoom(id: string): void {
  rooms.delete(id);
}

export function addPlayer(room: Room, socketId: string, name: string, profileId: string | null): Player {
  // Re-join: find existing player by profileId or name (active players)
  for (const player of room.players.values()) {
    if (profileId && player.profileId === profileId) {
      player.socketId = socketId;
      player.isConnected = true;
      return player;
    }
    if (!profileId && player.name === name.trim()) {
      player.socketId = socketId;
      player.isConnected = true;
      return player;
    }
  }

  // Re-join: check waiting-next-round map
  for (const player of room.waitingNextRound.values()) {
    if (profileId && player.profileId === profileId) {
      player.socketId = socketId;
      player.isConnected = true;
      return player;
    }
    if (!profileId && player.name === name.trim()) {
      player.socketId = socketId;
      player.isConnected = true;
      return player;
    }
  }

  if (room.phase !== 'lobby') throw new Error('Game already started — cannot join.');
  if (room.players.size >= 16) throw new Error('Room is full (max 16 players).');

  const seat = getNextSeat(room);
  const player: Player = {
    id: generateId(),
    name: name.trim().slice(0, 24) || 'Player',
    avatar: nameToAvatar(name),
    avatarUrl: null,
    socketId,
    isHost: false,
    isAlive: true,
    isConnected: true,
    isReady: false,
    role: null,
    team: null,
    voteTarget: null,
    hasActedThisPhase: false,
    seat,
    joinedAt: Date.now(),
    profileId,
    isSpectator: false,
    isWaitingNextRound: false,
    lastWill: null,
    isModerator: false,
    moderatorLevel: null,
    deathType: null,
  };

  room.players.set(player.id, player);
  return player;
}

export function addWaitingPlayer(room: Room, socketId: string, name: string, profileId: string | null): Player {
  // Check if already in waiting list
  for (const p of room.waitingNextRound.values()) {
    if (profileId && p.profileId === profileId) {
      p.socketId = socketId;
      p.isConnected = true;
      return p;
    }
    if (!profileId && p.name === name.trim()) {
      p.socketId = socketId;
      p.isConnected = true;
      return p;
    }
  }

  const player: Player = {
    id: generateId(),
    name: name.trim().slice(0, 24) || 'Player',
    avatar: nameToAvatar(name),
    avatarUrl: null,
    socketId,
    isHost: false,
    isAlive: false,
    isConnected: true,
    isReady: false,
    role: null,
    team: null,
    voteTarget: null,
    hasActedThisPhase: false,
    seat: 0,
    joinedAt: Date.now(),
    profileId,
    isSpectator: false,
    isWaitingNextRound: true,
    lastWill: null,
    isModerator: false,
    moderatorLevel: null,
    deathType: null,
  };

  room.waitingNextRound.set(player.id, player);
  return player;
}

export function removePlayer(room: Room, playerId: string): void {
  // Check waitingNextRound first
  const waiting = room.waitingNextRound.get(playerId);
  if (waiting) {
    room.waitingNextRound.delete(playerId);
    return;
  }

  const player = room.players.get(playerId);
  if (!player) return;

  if (room.phase === 'lobby') {
    room.players.delete(playerId);
    reassignSeats(room);
    if (player.isHost && room.players.size > 0) {
      const next = [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0]!;
      next.isHost = true;
      room.hostId = next.id;
    }
  } else {
    player.isConnected = false;
    player.socketId = '';
  }
}

export function transferHost(room: Room, newHostId: string): void {
  const newHost = room.players.get(newHostId);
  if (!newHost) throw new Error('Player not found.');
  if (newHost.isSpectator) throw new Error('Cannot make a spectator the host.');

  const current = room.players.get(room.hostId);
  if (current) current.isHost = false;

  newHost.isHost = true;
  room.hostId = newHostId;
}

export function getPlayerBySocket(room: Room, socketId: string): Player | undefined {
  for (const p of room.players.values()) {
    if (p.socketId === socketId) return p;
  }
  for (const p of room.waitingNextRound.values()) {
    if (p.socketId === socketId) return p;
  }
  return undefined;
}

export function getPlayerByProfile(room: Room, profileId: string): Player | undefined {
  for (const p of room.players.values()) {
    if (p.profileId === profileId) return p;
  }
  for (const p of room.waitingNextRound.values()) {
    if (p.profileId === profileId) return p;
  }
  return undefined;
}

export function getHostPlayer(room: Room): Player | undefined {
  return room.players.get(room.hostId);
}

export function getAlivePlayers(room: Room): Player[] {
  return [...room.players.values()].filter(p => p.isAlive && !p.isSpectator);
}

// ── Public View Builder ───────────────────────────────────────────────
export function toPublicRoom(room: Room, viewerPlayerId: string): RoomPublic {
  const isGameOver = room.phase === 'game_over';
  const viewer = room.players.get(viewerPlayerId);
  const isMafia = viewer?.team === 'mafia';
  const isCultLeader = viewer?.role === 'cult_leader';
  const isYakuza = viewer?.team === 'yakuza';

  const mapToPublic = (p: Player): PlayerPublic => ({
    id: p.id,
    socketId: p.socketId,
    name: p.name,
    avatar: p.avatar,
    avatarUrl: p.avatarUrl,
    isHost: p.isHost,
    isAlive: p.isAlive,
    isConnected: p.isConnected,
    isReady: p.isReady,
    role: (p.id === viewerPlayerId || isGameOver || viewer?.isSpectator) ? p.role : null,
    team: (p.id === viewerPlayerId || isGameOver || viewer?.isSpectator) ? p.team : null,
    // Mafia sees fellow mafia roles
    ...(isMafia && p.team === 'mafia' ? { role: p.role, team: p.team } : {}),
    // Cult leader sees all cult members
    ...(isCultLeader && p.team === 'cult' ? { role: p.role, team: p.team } : {}),
    // Yakuza team members see each other
    ...(isYakuza && p.team === 'yakuza' ? { role: p.role, team: p.team } : {}),
    voteTarget: room.phase === 'voting' ? p.voteTarget : null,
    hasActed: p.id === viewerPlayerId ? p.hasActedThisPhase : false,
    seat: p.seat,
    profileId: p.profileId,
    isModerator: p.isModerator,
    moderatorLevel: p.moderatorLevel,
    isSpectator: p.isSpectator,
    isWaitingNextRound: p.isWaitingNextRound,
    deathType: p.deathType,
  });

  const players: PlayerPublic[] = [...room.players.values()]
    .sort((a, b) => a.seat - b.seat)
    .map(mapToPublic);

  const waitingNextRound: PlayerPublic[] = [...room.waitingNextRound.values()]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map(mapToPublic);

  const isDeadViewer = viewer ? (!viewer.isAlive || viewer.isSpectator) : false;

  return {
    id: room.id,
    code: room.code,
    phase: room.phase,
    day: room.day,
    timer: room.timer,
    maxTimer: room.maxTimer,
    players,
    waitingNextRound,
    chat: room.chat.slice(-100),
    mafiaChat: isMafia ? room.mafiaChat.slice(-100) : [],
    deadChat: isDeadViewer && !viewer?.isSpectator ? room.deadChat.slice(-100) : [],
    spectatorChat: viewer?.isSpectator ? room.spectatorChat.slice(-100) : [],
    killedLastNight: room.killedLastNight,
    savedLastNight: room.savedLastNight,
    winner: room.winner,
    settings: room.settings,
    activeRoleCounts: computeActiveRoleCounts(room),
    currentSpeakerId: room.speechOrder[room.currentSpeakerIdx] ?? null,
    daySkipVoteCount: room.daySkipVotes.length,
    spectatorCount: [...room.players.values()].filter(p => p.isSpectator).length,
    isPaused: room.isPaused,
    nominations: Object.fromEntries(room.nominations),
    tribunalCandidates: room.tribunalCandidates,
    deathSpeakerId: room.deathSpeakerId ?? null,
    finalWordsReason: room.finalWordsReason ?? null,
    clanId: room.clanId,
    clanRoom: room.clanRoom,
    mafiaVotes: isMafia && room.phase === 'night'
      ? (() => {
          const votes: Record<string, { voterName: string; targetName: string }> = {};
          for (const action of room.nightActions.values()) {
            if (action.role !== 'mafia' && action.role !== 'don') continue;
            const voter = room.players.get(action.actorId);
            const target = room.players.get(action.targetId);
            if (voter && target) {
              votes[action.actorId] = { voterName: voter.name, targetName: target.name };
            }
          }
          return votes;
        })()
      : null,
  };
}

export function toRoomListItem(room: Room): RoomListItem {
  const host = room.players.get(room.hostId);
  return {
    id: room.id,
    code: room.code,
    playerCount: room.players.size,
    phase: room.phase,
    createdAt: room.createdAt,
    hostName: host?.name ?? 'Unknown',
    isPrivate: room.settings.isPrivate ?? false,
  };
}

function computeActiveRoleCounts(room: Room): Record<string, number> {
  const counts: Record<string, number> = {};
  if (room.phase === 'lobby') {
    // Show configured role distribution before game starts
    for (const [role, count] of Object.entries(room.settings.roles)) {
      if (count > 0) counts[role] = count;
    }
  } else {
    // Show actual role counts once roles have been assigned
    for (const p of room.players.values()) {
      if (!p.isSpectator && p.role) {
        counts[p.role] = (counts[p.role] ?? 0) + 1;
      }
    }
  }
  return counts;
}

// ── Helpers ───────────────────────────────────────────────────────────
function getNextSeat(room: Room): number {
  const used = new Set([...room.players.values()].map(p => p.seat));
  let seat = 1;
  while (used.has(seat)) seat++;
  return seat;
}

function reassignSeats(room: Room): void {
  const sorted = [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  sorted.forEach((p, i) => { p.seat = i + 1; });
}

export function getAllRooms(): Room[] {
  return [...rooms.values()];
}

export function setPlayerAvatarUrl(room: Room, profileId: string, avatarUrl: string | null): void {
  for (const p of room.players.values()) {
    if (p.profileId === profileId) p.avatarUrl = avatarUrl;
  }
  for (const p of room.waitingNextRound.values()) {
    if (p.profileId === profileId) p.avatarUrl = avatarUrl;
  }
}

// ── Rematch: reset room to lobby keeping players ───────────────────────
export function rematchRoom(room: Room): void {
  room.phase = 'lobby';
  room.day = 0;
  room.timer = 0;
  room.maxTimer = 0;
  room.nightActions = new Map();
  room.votes = new Map();
  room.chat = [];
  room.mafiaChat = [];
  room.deadChat = [];
  room.killedLastNight = [];
  room.savedLastNight = false;
  room.winner = null;
  room.speechOrder = [];
  room.currentSpeakerIdx = 0;
  room.daySkipVotes = [];
  room.isPaused = false;
  room.dousedPlayers = new Set();
  room.newlyConvertedCultists = [];
  room.startedAt = 0;
  room.nominations = new Map();
  room.tribunalCandidates = [];
  room.deathSpeakerId   = null;
  room.finalWordsReason = null;
  room.pendingWinner    = null;
  // Move waiting players into active lobby
  for (const p of room.waitingNextRound.values()) {
    p.isWaitingNextRound = false;
    p.isAlive = true;
    p.seat = getNextSeat(room);
    room.players.set(p.id, p);
  }
  room.waitingNextRound = new Map();
  for (const p of room.players.values()) {
    p.role = null;
    p.team = null;
    p.voteTarget = null;
    p.hasActedThisPhase = false;
    p.isAlive = true;
    p.isReady = false;
    p.lastWill = null;
  }
}
