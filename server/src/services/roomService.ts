import {
  Room, Player, GameSettings, RoomPublic, PlayerPublic, Phase, RoomListItem,
} from '../types/index.js';
import { generateId, generateRoomCode, nameToAvatar } from '../utils/helpers.js';
import { getPlayer } from './playerService.js';

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
  startWithNight: false,
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
  },
};

// ── CRUD ──────────────────────────────────────────────────────────────
export function createRoom(
  hostSocketId: string,
  hostName: string,
  profileId: string | null,
  settings?: Partial<GameSettings>,
): Room {
  const id = generateId();
  const code = generateRoomCode();

  const profile = profileId ? getPlayer(profileId) : null;

  const hostPlayer: Player = {
    id: generateId(),
    name: hostName.trim().slice(0, 24) || 'Player',
    avatar: nameToAvatar(hostName),
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
    lastWill: null,
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
    day: 0,
    timer: 0,
    maxTimer: 0,
    chat: [],
    mafiaChat: [],
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
  // Re-join: find existing player by profileId or name
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

  if (room.phase !== 'lobby') throw new Error('Game already started — cannot join.');
  if (room.players.size >= 16) throw new Error('Room is full (max 16 players).');

  const seat = getNextSeat(room);
  const player: Player = {
    id: generateId(),
    name: name.trim().slice(0, 24) || 'Player',
    avatar: nameToAvatar(name),
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
    lastWill: null,
  };

  room.players.set(player.id, player);
  return player;
}

export function removePlayer(room: Room, playerId: string): void {
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
  return undefined;
}

export function getPlayerByProfile(room: Room, profileId: string): Player | undefined {
  for (const p of room.players.values()) {
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

  const players: PlayerPublic[] = [...room.players.values()]
    .sort((a, b) => a.seat - b.seat)
    .map(p => {
      const profile = p.profileId ? getPlayer(p.profileId) : null;
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isHost: p.isHost,
        isAlive: p.isAlive,
        isConnected: p.isConnected,
        isReady: p.isReady,
        role: (p.id === viewerPlayerId || isGameOver || !viewer?.isAlive || viewer?.isSpectator) ? p.role : null,
        team: (p.id === viewerPlayerId || isGameOver || !viewer?.isAlive || viewer?.isSpectator) ? p.team : null,
        // Mafia sees fellow mafia roles
        ...(isMafia && p.team === 'mafia' ? { role: p.role, team: p.team } : {}),
        // Cult leader sees all cult members
        ...(isCultLeader && p.team === 'cult' ? { role: p.role, team: p.team } : {}),
        voteTarget: room.phase === 'voting' ? p.voteTarget : null,
        hasActed: p.hasActedThisPhase,
        seat: p.seat,
        profileId: p.profileId,
        isModerator: profile?.isModerator ?? false,
        moderatorLevel: profile?.moderatorLevel ?? null,
        isSpectator: p.isSpectator,
      };
    });

  return {
    id: room.id,
    code: room.code,
    phase: room.phase,
    day: room.day,
    timer: room.timer,
    maxTimer: room.maxTimer,
    players,
    chat: room.chat.slice(-100),
    mafiaChat: isMafia ? room.mafiaChat.slice(-100) : [],
    killedLastNight: room.killedLastNight,
    savedLastNight: room.savedLastNight,
    winner: room.winner,
    settings: room.settings,
    currentSpeakerId: room.speechOrder[room.currentSpeakerIdx] ?? null,
    daySkipVoteCount: room.daySkipVotes.length,
    spectatorCount: [...room.players.values()].filter(p => p.isSpectator).length,
    isPaused: room.isPaused,
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
