import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import {
  PlayerProfile, PlayerProfilePublic, ModeratorLevel, BanRecord, MuteRecord, Warning, PlayerCosmetics,
} from '../types/index.js';
import { nameToAvatar } from '../utils/helpers.js';
import { db } from '../db.js';

// ── Moderator config from env ─────────────────────────────────────────
const parseIds  = (s: string) => s.split(',').map(n => n.trim()).filter(Boolean);
const parseName = (s: string) => s.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);

const PERM_MAP: Record<ModeratorLevel, string[]> = {
  moderator:        ['VIEW_REPORTS', 'KICK_ANY_PLAYER', 'MUTE_ANY_PLAYER', 'WARN_ANY_PLAYER'],
  senior_moderator: ['VIEW_REPORTS', 'KICK_ANY_PLAYER', 'MUTE_ANY_PLAYER', 'WARN_ANY_PLAYER', 'BAN_ANY_PLAYER', 'RESOLVE_REPORTS'],
  admin:            ['VIEW_REPORTS', 'KICK_ANY_PLAYER', 'MUTE_ANY_PLAYER', 'WARN_ANY_PLAYER', 'BAN_ANY_PLAYER', 'RESOLVE_REPORTS', 'VIEW_MODERATION_LOGS'],
  owner:            ['VIEW_REPORTS', 'KICK_ANY_PLAYER', 'MUTE_ANY_PLAYER', 'WARN_ANY_PLAYER', 'BAN_ANY_PLAYER', 'RESOLVE_REPORTS', 'VIEW_MODERATION_LOGS', 'ALL'],
};

export function getModPermissions(level: ModeratorLevel | null): string[] {
  return level ? PERM_MAP[level] : [];
}

// Read env vars at call time so Railway variable changes take effect on next login without redeploy
function resolveModLevel(uid: string, username: string): ModeratorLevel | null {
  const ownerIds      = new Set(parseIds(process.env.OWNER_IDS         ?? ''));
  const adminIds      = new Set(parseIds(process.env.ADMIN_IDS          ?? ''));
  const seniorModIds  = new Set(parseIds(process.env.SENIOR_MOD_IDS     ?? ''));
  const modIds        = new Set(parseIds(process.env.MODERATOR_IDS       ?? ''));
  const ownerNames    = new Set(parseName(process.env.OWNER_NAMES        ?? ''));
  const adminNames    = new Set(parseName(process.env.ADMIN_NAMES        ?? ''));
  const modNames      = new Set(parseName(process.env.MODERATOR_NAMES    ?? ''));

  if (ownerIds.has(uid))     return 'owner';
  if (adminIds.has(uid))     return 'admin';
  if (seniorModIds.has(uid)) return 'senior_moderator';
  if (modIds.has(uid))       return 'moderator';
  const lower = username.toLowerCase();
  if (ownerNames.has(lower)) return 'owner';
  if (adminNames.has(lower)) return 'admin';
  if (modNames.has(lower))   return 'moderator';
  return null;
}

// ── DB → PlayerProfile ───────────────────────────────────────────────
function rowToProfile(row: any): PlayerProfile {
  const modLevel = (row.moderator_level as ModeratorLevel | null) ?? null;
  const activeBan  = getActiveBan(row.id);
  const activeMute = getActiveMute(row.id);
  const warnings   = getWarnings(row.id);

  let cosmetics: PlayerCosmetics;
  try {
    const parsed = JSON.parse(row.cosmetics ?? '{}') as Partial<PlayerCosmetics>;
    cosmetics = {
      equippedNameColor: parsed.equippedNameColor ?? null,
      equippedFrame: parsed.equippedFrame ?? null,
      unlockedItems: parsed.unlockedItems ?? [],
    };
  } catch {
    cosmetics = { equippedNameColor: null, equippedFrame: null, unlockedItems: [] };
  }

  return {
    id:                     row.id,
    username:               row.username,
    avatar:                 row.avatar,
    email:                  row.email ?? undefined,
    passwordHash:           row.password_hash ?? undefined,
    stats: {
      gamesPlayed: row.games_played,
      wins:        row.wins,
      losses:      row.losses,
      winRate:     row.games_played > 0 ? Math.round((row.wins / row.games_played) * 100) : 0,
    },
    isModerator:            row.is_moderator === 1,
    moderatorLevel:         modLevel,
    moderatorBadgeVisible:  row.moderator_badge_visible === 1,
    moderatorPermissions:   JSON.parse(row.moderator_permissions ?? '[]'),
    ban:                    activeBan,
    mute:                   activeMute,
    warnings,
    joinedAt:               row.joined_at,
    lastSeenAt:             row.last_seen_at,
    xp:                     row.xp ?? 0,
    level:                  row.level ?? 1,
    cosmetics,
  };
}

// ── Auth ──────────────────────────────────────────────────────────────
export async function registerWithEmail(
  email: string,
  password: string,
  username: string,
): Promise<PlayerProfile> {
  const normalised = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM players WHERE email = ?').get(normalised);
  if (existing) throw new Error('This email is already registered.');

  const name = username.trim().slice(0, 24) || 'Player';
  const uid  = 'e_' + createHash('sha256').update(normalised).digest('hex').slice(0, 24);
  const passwordHash = await bcrypt.hash(password, 10);
  const modLevel     = resolveModLevel(uid, name);
  const now          = Date.now();

  db.prepare(`
    INSERT INTO players (id, username, avatar, email, password_hash, games_played, wins, losses,
      is_moderator, moderator_level, moderator_badge_visible, moderator_permissions, joined_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?)
  `).run(
    uid, name, nameToAvatar(name), normalised, passwordHash,
    modLevel ? 1 : 0, modLevel, modLevel ? 1 : 0,
    JSON.stringify(getModPermissions(modLevel)),
    now, now,
  );

  return getPlayer(uid)!;
}

export async function authenticateWithEmail(email: string, password: string): Promise<PlayerProfile> {
  const normalised = email.trim().toLowerCase();
  const row = db.prepare('SELECT * FROM players WHERE email = ?').get(normalised) as any;
  if (!row || !row.password_hash) throw new Error('Email not found. Please register first.');

  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) throw new Error('Incorrect password.');

  db.prepare('UPDATE players SET last_seen_at = ? WHERE id = ?').run(Date.now(), row.id);
  return rowToProfile({ ...row, last_seen_at: Date.now() });
}

export function getOrCreatePlayer(uid: string, username: string): PlayerProfile {
  const name = username.trim().slice(0, 24) || 'Player';
  const now  = Date.now();
  const row  = db.prepare('SELECT * FROM players WHERE id = ?').get(uid) as any;

  if (!row) {
    const modLevel = resolveModLevel(uid, name);
    db.prepare(`
      INSERT INTO players (id, username, avatar, games_played, wins, losses,
        is_moderator, moderator_level, moderator_badge_visible, moderator_permissions, joined_at, last_seen_at)
      VALUES (?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?)
    `).run(
      uid, name, nameToAvatar(name),
      modLevel ? 1 : 0, modLevel, modLevel ? 1 : 0,
      JSON.stringify(getModPermissions(modLevel)),
      now, now,
    );
  } else {
    const modLevel = resolveModLevel(uid, name);
    db.prepare(`
      UPDATE players SET username = ?, last_seen_at = ?,
        is_moderator = ?, moderator_level = ?, moderator_badge_visible = ?, moderator_permissions = ?
      WHERE id = ?
    `).run(
      name, now,
      modLevel ? 1 : 0, modLevel, modLevel ? 1 : 0,
      JSON.stringify(getModPermissions(modLevel)),
      uid,
    );
  }

  return getPlayer(uid)!;
}

export function getPlayer(uid: string): PlayerProfile | null {
  const row = db.prepare('SELECT * FROM players WHERE id = ?').get(uid) as any;
  return row ? rowToProfile(row) : null;
}

export function getAllPlayers(): PlayerProfile[] {
  const rows = db.prepare('SELECT * FROM players ORDER BY last_seen_at DESC').all() as any[];
  return rows.map(rowToProfile);
}

export function toPublicProfile(p: PlayerProfile): PlayerProfilePublic {
  return {
    id:                    p.id,
    username:              p.username,
    avatar:                p.avatar,
    stats:                 { ...p.stats },
    isModerator:           p.isModerator,
    moderatorLevel:        p.moderatorLevel,
    moderatorBadgeVisible: p.moderatorBadgeVisible,
    moderatorPermissions:  p.moderatorPermissions ?? [],
    joinedAt:              p.joinedAt,
    xp:                    p.xp,
    level:                 p.level,
    cosmetics:             p.cosmetics,
  };
}

export function addGameResult(uid: string, won: boolean): void {
  db.prepare(`
    UPDATE players SET
      games_played = games_played + 1,
      wins   = wins   + ?,
      losses = losses + ?
    WHERE id = ?
  `).run(won ? 1 : 0, won ? 0 : 1, uid);
}

// ── Bans ──────────────────────────────────────────────────────────────
export function getActiveBan(uid: string): BanRecord | null {
  const now = Date.now();
  const row = db.prepare(`
    SELECT * FROM bans WHERE player_id = ? AND active = 1 AND expires_at > ? ORDER BY expires_at DESC LIMIT 1
  `).get(uid, now) as any;
  if (!row) return null;
  return {
    id: row.id, reason: row.reason,
    issuedBy: row.banned_by, issuedByName: row.banned_by_name,
    issuedAt: row.issued_at, expiresAt: row.expires_at,
  };
}

export function setBan(uid: string, record: BanRecord): void {
  db.prepare('UPDATE bans SET active = 0 WHERE player_id = ?').run(uid);
  db.prepare(`
    INSERT INTO bans (id, player_id, banned_by, banned_by_name, reason, issued_at, expires_at, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(record.id, uid, record.issuedBy, record.issuedByName, record.reason, record.issuedAt, record.expiresAt);
}

export function clearBan(uid: string): void {
  db.prepare('UPDATE bans SET active = 0 WHERE player_id = ?').run(uid);
}

// ── Mutes ─────────────────────────────────────────────────────────────
export function getActiveMute(uid: string): MuteRecord | null {
  const now = Date.now();
  const row = db.prepare(`
    SELECT * FROM mutes WHERE player_id = ? AND active = 1 AND expires_at > ? ORDER BY expires_at DESC LIMIT 1
  `).get(uid, now) as any;
  if (!row) return null;
  return {
    id: row.id, reason: row.reason,
    issuedBy: row.muted_by, issuedByName: row.muted_by_name,
    issuedAt: row.issued_at, expiresAt: row.expires_at,
  };
}

export function setMute(uid: string, record: MuteRecord): void {
  db.prepare('UPDATE mutes SET active = 0 WHERE player_id = ?').run(uid);
  db.prepare(`
    INSERT INTO mutes (id, player_id, muted_by, muted_by_name, reason, issued_at, expires_at, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(record.id, uid, record.issuedBy, record.issuedByName, record.reason, record.issuedAt, record.expiresAt);
}

export function clearMute(uid: string): void {
  db.prepare('UPDATE mutes SET active = 0 WHERE player_id = ?').run(uid);
}

// ── Warnings ──────────────────────────────────────────────────────────
export function getWarnings(uid: string): Warning[] {
  const rows = db.prepare('SELECT * FROM warnings WHERE player_id = ? ORDER BY issued_at DESC').all(uid) as any[];
  return rows.map(r => ({
    id: r.id, playerId: r.player_id,
    reason: r.reason, issuedBy: r.warned_by, issuedByName: r.warned_by_name,
    issuedAt: r.issued_at,
  }));
}

export function addWarning(uid: string, warning: Warning): void {
  db.prepare(`
    INSERT INTO warnings (id, player_id, warned_by, warned_by_name, reason, issued_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(warning.id, uid, warning.issuedBy, warning.issuedByName, warning.reason, warning.issuedAt);
}

export function findSocketByProfile(
  io: import('socket.io').Server,
  profileId: string,
): import('socket.io').Socket | null {
  for (const [, socket] of io.sockets.sockets) {
    if ((socket.data as any).profileId === profileId) return socket as any;
  }
  return null;
}

// ── XP & Level System ─────────────────────────────────────────────────
export const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2100, 3000, 4100, 5400];

export function getLevel(xp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

export function addXP(profileId: string, amount: number): { newXP: number; newLevel: number; leveledUp: boolean } {
  const row = db.prepare('SELECT xp, level FROM players WHERE id = ?').get(profileId) as { xp: number; level: number } | undefined;
  if (!row) return { newXP: 0, newLevel: 1, leveledUp: false };
  const newXP = (row.xp ?? 0) + amount;
  const newLevel = getLevel(newXP);
  db.prepare('UPDATE players SET xp = ?, level = ? WHERE id = ?').run(newXP, newLevel, profileId);
  checkLevelCosmetics(profileId, newLevel);
  return { newXP, newLevel, leveledUp: newLevel > (row.level ?? 1) };
}

export function getCosmetics(profileId: string): PlayerCosmetics {
  const row = db.prepare('SELECT cosmetics FROM players WHERE id = ?').get(profileId) as { cosmetics: string } | undefined;
  try {
    const parsed = JSON.parse(row?.cosmetics ?? '{}') as Partial<PlayerCosmetics>;
    return {
      equippedNameColor: parsed.equippedNameColor ?? null,
      equippedFrame: parsed.equippedFrame ?? null,
      unlockedItems: parsed.unlockedItems ?? [],
    };
  } catch {
    return { equippedNameColor: null, equippedFrame: null, unlockedItems: [] };
  }
}

export function equipCosmetic(profileId: string, type: 'name_color' | 'frame', itemId: string | null): PlayerCosmetics {
  const cosmetics = getCosmetics(profileId);
  if (itemId && !cosmetics.unlockedItems.includes(itemId)) throw new Error('Item not unlocked.');
  if (type === 'name_color') cosmetics.equippedNameColor = itemId;
  else cosmetics.equippedFrame = itemId;
  db.prepare('UPDATE players SET cosmetics = ? WHERE id = ?').run(JSON.stringify(cosmetics), profileId);
  return cosmetics;
}

function checkLevelCosmetics(profileId: string, level: number): void {
  const unlocks: Record<number, string[]> = {
    2: ['name_cyan'],
    3: ['name_pink', 'frame_bronze'],
    5: ['name_gold', 'frame_silver'],
    7: ['name_rainbow'],
    8: ['frame_gold'],
    10: ['frame_legendary'],
  };
  const items = unlocks[level];
  if (!items) return;
  const cosmetics = getCosmetics(profileId);
  for (const item of items) {
    if (!cosmetics.unlockedItems.includes(item)) cosmetics.unlockedItems.push(item);
  }
  db.prepare('UPDATE players SET cosmetics = ? WHERE id = ?').run(JSON.stringify(cosmetics), profileId);
}
