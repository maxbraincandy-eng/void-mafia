import {
  PlayerProfile, PlayerProfilePublic, ModeratorLevel, PlayerStats,
  BanRecord, MuteRecord, Warning,
} from '../types/index.js';
import { generateId, nameToAvatar } from '../utils/helpers.js';
import { createHash, randomBytes } from 'crypto';

const players = new Map<string, PlayerProfile>();
// email (lowercase) → profile id
const emailIndex = new Map<string, string>();

function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(salt + password + salt).digest('hex');
}

export function registerWithEmail(
  email: string,
  password: string,
  username: string,
): PlayerProfile {
  const normalised = email.trim().toLowerCase();
  if (emailIndex.has(normalised)) throw new Error('This email is already registered.');
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');

  const name = username.trim().slice(0, 24) || 'Player';
  const uid  = 'e_' + createHash('sha256').update(normalised).digest('hex').slice(0, 24);
  const salt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);

  const modLevel = resolveModLevel(uid, name);
  const player: PlayerProfile = {
    id: uid,
    username: name,
    avatar: nameToAvatar(name),
    stats: { gamesPlayed: 0, wins: 0, losses: 0, winRate: 0 },
    isModerator: modLevel !== null,
    moderatorLevel: modLevel,
    moderatorBadgeVisible: modLevel !== null,
    moderatorPermissions: getModPermissions(modLevel),
    ban: null,
    mute: null,
    warnings: [],
    joinedAt: Date.now(),
    lastSeenAt: Date.now(),
    email: normalised,
    passwordHash,
    passwordSalt: salt,
  };

  players.set(uid, player);
  emailIndex.set(normalised, uid);
  return player;
}

export function authenticateWithEmail(email: string, password: string): PlayerProfile {
  const normalised = email.trim().toLowerCase();
  const uid = emailIndex.get(normalised);
  if (!uid) throw new Error('Email not found. Please register first.');
  const player = players.get(uid);
  if (!player || !player.passwordHash || !player.passwordSalt) throw new Error('Account error.');
  const hash = hashPassword(password, player.passwordSalt);
  if (hash !== player.passwordHash) throw new Error('Incorrect password.');
  player.lastSeenAt = Date.now();
  return player;
}

// Moderator config from environment variables
// ID-based (primary, secure)
const parseIds = (s: string) => s.split(',').map(n => n.trim()).filter(Boolean);
const MOD_IDS        = new Set(parseIds(process.env.MODERATOR_IDS    ?? ''));
const SENIOR_MOD_IDS = new Set(parseIds(process.env.SENIOR_MOD_IDS   ?? ''));
const ADMIN_IDS      = new Set(parseIds(process.env.ADMIN_IDS         ?? ''));
const OWNER_IDS      = new Set(parseIds(process.env.OWNER_IDS         ?? ''));

// Name-based fallback (legacy, less secure)
const parseName = (s: string) => s.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
const MOD_NAMES   = new Set(parseName(process.env.MODERATOR_NAMES ?? ''));
const ADMIN_NAMES = new Set(parseName(process.env.ADMIN_NAMES     ?? ''));
const OWNER_NAMES = new Set(parseName(process.env.OWNER_NAMES     ?? ''));

const PERM_MAP: Record<ModeratorLevel, string[]> = {
  moderator:        ['VIEW_REPORTS', 'KICK_ANY_PLAYER', 'MUTE_ANY_PLAYER', 'WARN_ANY_PLAYER'],
  senior_moderator: ['VIEW_REPORTS', 'KICK_ANY_PLAYER', 'MUTE_ANY_PLAYER', 'WARN_ANY_PLAYER', 'BAN_ANY_PLAYER', 'RESOLVE_REPORTS'],
  admin:            ['VIEW_REPORTS', 'KICK_ANY_PLAYER', 'MUTE_ANY_PLAYER', 'WARN_ANY_PLAYER', 'BAN_ANY_PLAYER', 'RESOLVE_REPORTS', 'VIEW_MODERATION_LOGS'],
  owner:            ['VIEW_REPORTS', 'KICK_ANY_PLAYER', 'MUTE_ANY_PLAYER', 'WARN_ANY_PLAYER', 'BAN_ANY_PLAYER', 'RESOLVE_REPORTS', 'VIEW_MODERATION_LOGS', 'ALL'],
};

export function getModPermissions(level: ModeratorLevel | null): string[] {
  if (!level) return [];
  return PERM_MAP[level];
}

function resolveModLevelById(uid: string): ModeratorLevel | null {
  if (OWNER_IDS.has(uid))      return 'owner';
  if (ADMIN_IDS.has(uid))      return 'admin';
  if (SENIOR_MOD_IDS.has(uid)) return 'senior_moderator';
  if (MOD_IDS.has(uid))        return 'moderator';
  return null;
}

function resolveModLevelByName(username: string): ModeratorLevel | null {
  const lower = username.toLowerCase();
  if (OWNER_NAMES.has(lower)) return 'owner';
  if (ADMIN_NAMES.has(lower)) return 'admin';
  if (MOD_NAMES.has(lower))   return 'moderator';
  return null;
}

function resolveModLevel(uid: string, username: string): ModeratorLevel | null {
  return resolveModLevelById(uid) ?? resolveModLevelByName(username);
}

export function getOrCreatePlayer(uid: string, username: string): PlayerProfile {
  const name = username.trim().slice(0, 24) || 'Player';
  let player = players.get(uid);

  if (!player) {
    const modLevel = resolveModLevel(uid, name);
    player = {
      id: uid,
      username: name,
      avatar: nameToAvatar(name),
      stats: { gamesPlayed: 0, wins: 0, losses: 0, winRate: 0 },
      isModerator: modLevel !== null,
      moderatorLevel: modLevel,
      moderatorBadgeVisible: modLevel !== null,
      moderatorPermissions: getModPermissions(modLevel),
      ban: null,
      mute: null,
      warnings: [],
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    players.set(uid, player);
  } else {
    // Update fields on reconnect
    player.username = name;
    player.lastSeenAt = Date.now();
    // Re-evaluate mod status in case env vars changed
    const modLevel = resolveModLevel(uid, player.username);
    player.isModerator = modLevel !== null;
    player.moderatorLevel = modLevel;
    player.moderatorBadgeVisible = modLevel !== null;
    player.moderatorPermissions = getModPermissions(modLevel);
  }

  return player;
}

export function getPlayer(uid: string): PlayerProfile | null {
  return players.get(uid) ?? null;
}

export function getAllPlayers(): PlayerProfile[] {
  return [...players.values()];
}

export function toPublicProfile(p: PlayerProfile): PlayerProfilePublic {
  return {
    id: p.id,
    username: p.username,
    avatar: p.avatar,
    stats: { ...p.stats },
    isModerator: p.isModerator,
    moderatorLevel: p.moderatorLevel,
    moderatorBadgeVisible: p.moderatorBadgeVisible,
    moderatorPermissions: p.moderatorPermissions ?? [],
    joinedAt: p.joinedAt,
  };
}

export function addGameResult(uid: string, won: boolean): void {
  const player = players.get(uid);
  if (!player) return;
  player.stats.gamesPlayed++;
  if (won) player.stats.wins++;
  else player.stats.losses++;
  player.stats.winRate = player.stats.gamesPlayed > 0
    ? Math.round((player.stats.wins / player.stats.gamesPlayed) * 100)
    : 0;
}

export function getActiveBan(uid: string): BanRecord | null {
  const player = players.get(uid);
  if (!player || !player.ban) return null;
  if (player.ban.expiresAt < Date.now()) { player.ban = null; return null; }
  return player.ban;
}

export function getActiveMute(uid: string): MuteRecord | null {
  const player = players.get(uid);
  if (!player || !player.mute) return null;
  if (player.mute.expiresAt < Date.now()) { player.mute = null; return null; }
  return player.mute;
}

export function setBan(uid: string, record: BanRecord): void {
  const player = players.get(uid);
  if (player) player.ban = record;
}

export function clearBan(uid: string): void {
  const player = players.get(uid);
  if (player) player.ban = null;
}

export function setMute(uid: string, record: MuteRecord): void {
  const player = players.get(uid);
  if (player) player.mute = record;
}

export function clearMute(uid: string): void {
  const player = players.get(uid);
  if (player) player.mute = null;
}

export function addWarning(uid: string, warning: Warning): void {
  const player = players.get(uid);
  if (player) player.warnings.push(warning);
}

// Find which socket corresponds to a profileId (for sending direct messages)
// The socket-to-profile mapping is maintained in the socket layer via socket.data.profileId
export function findSocketByProfile(
  io: import('socket.io').Server,
  profileId: string,
): import('socket.io').Socket | null {
  for (const [, socket] of io.sockets.sockets) {
    if ((socket.data as any).profileId === profileId) return socket as any;
  }
  return null;
}
