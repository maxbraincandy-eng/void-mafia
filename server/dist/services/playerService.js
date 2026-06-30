import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { nameToAvatar } from '../utils/helpers.js';
import { sql } from '../db.js';
import { isOnline, getPlayerStatus, getActiveStatusMap, isOnlineRaw, getActiveStatusMapRaw } from './friendService.js';
// ── Moderator config from env ─────────────────────────────────────────
const parseIds = (s) => s.split(',').map(n => n.trim()).filter(Boolean);
const parseName = (s) => s.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
const parsePublicIds = (s) => s.split(',').map(n => Number(n.trim())).filter(n => !isNaN(n) && n > 0);
const PERM_MAP = {
    moderator: ['VIEW_REPORTS', 'KICK_ANY_PLAYER', 'MUTE_ANY_PLAYER', 'WARN_ANY_PLAYER'],
    senior_moderator: ['VIEW_REPORTS', 'KICK_ANY_PLAYER', 'MUTE_ANY_PLAYER', 'WARN_ANY_PLAYER', 'BAN_ANY_PLAYER', 'RESOLVE_REPORTS'],
    admin: ['VIEW_REPORTS', 'KICK_ANY_PLAYER', 'MUTE_ANY_PLAYER', 'WARN_ANY_PLAYER', 'BAN_ANY_PLAYER', 'RESOLVE_REPORTS', 'VIEW_MODERATION_LOGS'],
    owner: ['VIEW_REPORTS', 'KICK_ANY_PLAYER', 'MUTE_ANY_PLAYER', 'WARN_ANY_PLAYER', 'BAN_ANY_PLAYER', 'RESOLVE_REPORTS', 'VIEW_MODERATION_LOGS', 'ALL'],
};
const MOD_RANK = {
    moderator: 1, senior_moderator: 2, admin: 3, owner: 4,
};
export function getModPermissions(level) {
    return level ? PERM_MAP[level] : [];
}
function resolveModLevelFromEnv(uid, username) {
    const ownerIds = new Set(parseIds(process.env.OWNER_IDS ?? ''));
    const adminIds = new Set(parseIds(process.env.ADMIN_IDS ?? ''));
    const seniorModIds = new Set(parseIds(process.env.SENIOR_MOD_IDS ?? ''));
    const modIds = new Set(parseIds(process.env.MODERATOR_IDS ?? ''));
    const ownerNames = new Set(parseName(process.env.OWNER_NAMES ?? ''));
    const adminNames = new Set(parseName(process.env.ADMIN_NAMES ?? ''));
    const modNames = new Set(parseName(process.env.MODERATOR_NAMES ?? ''));
    if (ownerIds.has(uid))
        return 'owner';
    if (adminIds.has(uid))
        return 'admin';
    if (seniorModIds.has(uid))
        return 'senior_moderator';
    if (modIds.has(uid))
        return 'moderator';
    const lower = username.toLowerCase();
    if (ownerNames.has(lower))
        return 'owner';
    if (adminNames.has(lower))
        return 'admin';
    if (modNames.has(lower))
        return 'moderator';
    return null;
}
function resolveModLevelFromPublicId(publicId) {
    const ownerPids = new Set(parsePublicIds(process.env.OWNER_PUBLIC_IDS ?? ''));
    const adminPids = new Set(parsePublicIds(process.env.ADMIN_PUBLIC_IDS ?? ''));
    const seniorModPids = new Set(parsePublicIds(process.env.SENIOR_MOD_PUBLIC_IDS ?? ''));
    const modPids = new Set(parsePublicIds(process.env.MODERATOR_PUBLIC_IDS ?? ''));
    if (ownerPids.has(publicId))
        return 'owner';
    if (adminPids.has(publicId))
        return 'admin';
    if (seniorModPids.has(publicId))
        return 'senior_moderator';
    if (modPids.has(publicId))
        return 'moderator';
    return null;
}
async function resolveModLevel(uid, username) {
    const envLevel = resolveModLevelFromEnv(uid, username);
    try {
        const [row] = await sql `SELECT granted_mod_level, public_id FROM players WHERE id = ${uid}`;
        const granted = row?.granted_mod_level;
        const publicId = row?.public_id != null ? Number(row.public_id) : null;
        const publicIdLevel = publicId != null ? resolveModLevelFromPublicId(publicId) : null;
        const candidates = [envLevel, publicIdLevel, granted];
        const best = candidates
            .filter((l) => l != null)
            .sort((a, b) => MOD_RANK[b] - MOD_RANK[a])[0] ?? null;
        return best;
    }
    catch { /* ignore */ }
    return envLevel;
}
// ── Public ID helpers ─────────────────────────────────────────────────
async function assignNextPublicId(uid) {
    // Use MAX+1 inside an UPDATE so we never leave the row without a publicId.
    // A unique index on public_id catches any rare race condition at the DB level.
    try {
        await sql `
      UPDATE players
      SET public_id = (SELECT COALESCE(MAX(public_id), 0) + 1 FROM players WHERE id != ${uid})
      WHERE id = ${uid} AND public_id IS NULL
    `;
    }
    catch { /* unique violation — another process beat us; retry or ignore */ }
}
// ── Friend code helpers ──────────────────────────────────────────────
async function generateUniqueFriendCode() {
    let code;
    do {
        code = String(1000 + Math.floor(Math.random() * 9000));
        const [row] = await sql `SELECT id FROM players WHERE friend_code = ${code}`;
        if (!row)
            break;
    } while (true);
    return code;
}
export async function getPlayerByFriendCode(code) {
    const [row] = await sql `SELECT * FROM players WHERE friend_code = ${code.trim()}`;
    return row ? rowToProfile(row) : null;
}
export async function setGrantedModLevel(uid, level) {
    await sql `UPDATE players SET granted_mod_level = ${level} WHERE id = ${uid}`;
    const player = await getPlayer(uid);
    if (!player)
        return;
    const newLevel = await resolveModLevel(uid, player.username);
    await sql `
    UPDATE players SET
      is_moderator = ${newLevel ? 1 : 0},
      moderator_level = ${newLevel},
      moderator_badge_visible = ${newLevel ? 1 : 0},
      moderator_permissions = ${JSON.stringify(getModPermissions(newLevel))}
    WHERE id = ${uid}
  `;
}
// ── DB row → PlayerProfile ───────────────────────────────────────────
async function rowToProfile(row) {
    const modLevel = row.moderator_level ?? null;
    const [activeBan, activeMute, warnings] = await Promise.all([
        getActiveBan(row.id),
        getActiveMute(row.id),
        getWarnings(row.id),
    ]);
    let cosmetics;
    try {
        const parsed = JSON.parse(row.cosmetics ?? '{}');
        cosmetics = {
            equippedNameColor: parsed.equippedNameColor ?? null,
            equippedFrame: parsed.equippedFrame ?? null,
            equippedTitle: parsed.equippedTitle ?? null,
            equippedRoleSkin: parsed.equippedRoleSkin ?? null,
            equippedWallpaper: parsed.equippedWallpaper ?? null,
            equippedBorder: parsed.equippedBorder ?? null,
            unlockedItems: parsed.unlockedItems ?? [],
        };
    }
    catch {
        cosmetics = { equippedNameColor: null, equippedFrame: null, equippedTitle: null, equippedRoleSkin: null, equippedWallpaper: null, equippedBorder: null, unlockedItems: [] };
    }
    return {
        id: row.id,
        username: row.username,
        avatar: row.avatar,
        avatarUrl: row.avatar_url ?? null,
        avatarUpdatedAt: row.avatar_updated_at ? Number(row.avatar_updated_at) : null,
        publicId: row.public_id != null ? Number(row.public_id) : null,
        email: row.email ?? undefined,
        passwordHash: row.password_hash ?? undefined,
        stats: {
            gamesPlayed: Number(row.games_played ?? 0),
            wins: Number(row.wins ?? 0),
            losses: Number(row.losses ?? 0),
            winRate: Number(row.games_played ?? 0) > 0
                ? Math.round((Number(row.wins ?? 0) / Number(row.games_played ?? 0)) * 100) : 0,
        },
        isModerator: row.is_moderator === 1 || row.is_moderator === true,
        moderatorLevel: modLevel,
        moderatorBadgeVisible: row.moderator_badge_visible === 1 || row.moderator_badge_visible === true,
        moderatorPermissions: JSON.parse(row.moderator_permissions ?? '[]'),
        ban: activeBan,
        mute: activeMute,
        warnings,
        joinedAt: Number(row.joined_at),
        lastSeenAt: Number(row.last_seen_at),
        xp: Number(row.xp ?? 0),
        level: Number(row.level ?? 1),
        cosmetics,
        friendCode: row.friend_code ?? '',
    };
}
// ── Auth ──────────────────────────────────────────────────────────────
export async function registerWithEmail(email, password, username) {
    const normalised = email.trim().toLowerCase();
    const [existing] = await sql `SELECT id FROM players WHERE email = ${normalised}`;
    if (existing)
        throw new Error('This email is already registered.');
    const name = username.trim().slice(0, 24) || 'Player';
    const uid = 'e_' + createHash('sha256').update(normalised).digest('hex').slice(0, 24);
    const passwordHash = await bcrypt.hash(password, 10);
    const modLevel = resolveModLevelFromEnv(uid, name);
    const now = Date.now();
    const friendCode = await generateUniqueFriendCode();
    await sql `
    INSERT INTO players (id, username, avatar, email, password_hash, games_played, wins, losses,
      is_moderator, moderator_level, moderator_badge_visible, moderator_permissions,
      joined_at, last_seen_at, friend_code)
    VALUES (
      ${uid}, ${name}, ${nameToAvatar(name)}, ${normalised}, ${passwordHash},
      0, 0, 0,
      ${modLevel ? 1 : 0}, ${modLevel}, ${modLevel ? 1 : 0},
      ${JSON.stringify(getModPermissions(modLevel))},
      ${now}, ${now}, ${friendCode}
    )
  `;
    await assignNextPublicId(uid);
    return (await getPlayer(uid));
}
export async function authenticateWithEmail(email, password) {
    const normalised = email.trim().toLowerCase();
    const [row] = await sql `SELECT * FROM players WHERE email = ${normalised}`;
    if (!row || !row.password_hash)
        throw new Error('Email not found. Please register first.');
    const match = await bcrypt.compare(password, row.password_hash);
    if (!match)
        throw new Error('Incorrect password.');
    await sql `UPDATE players SET last_seen_at = ${Date.now()} WHERE id = ${row.id}`;
    return rowToProfile({ ...row, last_seen_at: Date.now() });
}
export async function getOrCreatePlayer(uid, username) {
    const name = username.trim().slice(0, 24) || 'Player';
    const now = Date.now();
    const [row] = await sql `SELECT * FROM players WHERE id = ${uid}`;
    if (!row) {
        const modLevel = resolveModLevelFromEnv(uid, name);
        const friendCode = await generateUniqueFriendCode();
        await sql `
      INSERT INTO players (id, username, avatar, games_played, wins, losses,
        is_moderator, moderator_level, moderator_badge_visible, moderator_permissions,
        joined_at, last_seen_at, friend_code)
      VALUES (
        ${uid}, ${name}, ${nameToAvatar(name)}, 0, 0, 0,
        ${modLevel ? 1 : 0}, ${modLevel}, ${modLevel ? 1 : 0},
        ${JSON.stringify(getModPermissions(modLevel))},
        ${now}, ${now}, ${friendCode}
      )
    `;
        await assignNextPublicId(uid);
        // Re-check after publicId assigned in case ADMIN_PUBLIC_IDS matches
        const finalLevel = await resolveModLevel(uid, name);
        if (finalLevel !== modLevel) {
            await sql `
        UPDATE players SET
          is_moderator = ${finalLevel ? 1 : 0}, moderator_level = ${finalLevel},
          moderator_badge_visible = ${finalLevel ? 1 : 0},
          moderator_permissions = ${JSON.stringify(getModPermissions(finalLevel))}
        WHERE id = ${uid}
      `;
        }
    }
    else {
        const modLevel = await resolveModLevel(uid, name);
        await sql `
      UPDATE players SET
        username = ${name}, last_seen_at = ${now},
        is_moderator = ${modLevel ? 1 : 0}, moderator_level = ${modLevel},
        moderator_badge_visible = ${modLevel ? 1 : 0},
        moderator_permissions = ${JSON.stringify(getModPermissions(modLevel))}
      WHERE id = ${uid}
    `;
    }
    return (await getPlayer(uid));
}
export async function getPlayer(uid) {
    const [row] = await sql `SELECT * FROM players WHERE id = ${uid}`;
    return row ? rowToProfile(row) : null;
}
export async function getPlayerByPublicId(publicId) {
    const [row] = await sql `SELECT * FROM players WHERE public_id = ${publicId} LIMIT 1`;
    return row ? rowToProfile(row) : null;
}
export async function getAllPlayers() {
    const rows = await sql `SELECT * FROM players ORDER BY last_seen_at DESC`;
    return Promise.all(rows.map(rowToProfile));
}
// ── Fast leaderboard — single query, no per-player sub-queries ────────
let _leaderboardCache = null;
let _leaderboardCachedAt = 0;
const LEADERBOARD_TTL = 60000;
// ── Virtual Space knockout leaderboard ────────────────────────────────
export async function incrementSpaceKnockouts(profileId) {
    await sql `UPDATE players SET space_knockouts = space_knockouts + 1 WHERE id = ${profileId}`;
}
export async function getKnockoutLeaderboard() {
    const rows = await sql `
    SELECT id, username, avatar, avatar_url, public_id, space_knockouts
    FROM players
    WHERE space_knockouts > 0
    ORDER BY space_knockouts DESC, last_seen_at DESC
    LIMIT 20
  `;
    return rows.map((r) => ({
        id: r.id, username: r.username, avatar: r.avatar, avatarUrl: r.avatar_url ?? null,
        publicId: r.public_id != null ? Number(r.public_id) : null,
        knockouts: Number(r.space_knockouts ?? 0),
    }));
}
export async function getLeaderboard() {
    if (_leaderboardCache && Date.now() - _leaderboardCachedAt < LEADERBOARD_TTL) {
        return _leaderboardCache;
    }
    const rows = await sql `
    SELECT id, username, avatar, avatar_url, public_id,
           games_played, wins, losses, xp, level, cosmetics,
           friend_code, is_moderator, moderator_level, moderator_badge_visible,
           moderator_permissions, joined_at, last_seen_at
    FROM players
    WHERE games_played >= 1
    ORDER BY level DESC, xp DESC, games_played DESC
    LIMIT 20
  `;
    const statusMap = getActiveStatusMap();
    const result = rows.map((r) => ({
        id: r.id,
        username: r.username,
        avatar: r.avatar,
        avatarUrl: r.avatar_url ?? null,
        publicId: r.public_id != null ? Number(r.public_id) : null,
        stats: {
            gamesPlayed: Number(r.games_played ?? 0),
            wins: Number(r.wins ?? 0),
            losses: Number(r.losses ?? 0),
            winRate: Number(r.games_played ?? 0) > 0
                ? Math.round((Number(r.wins ?? 0) / Number(r.games_played ?? 0)) * 100) : 0,
        },
        isModerator: r.is_moderator === 1 || r.is_moderator === true,
        moderatorLevel: r.moderator_level ?? null,
        moderatorBadgeVisible: r.moderator_badge_visible === 1 || r.moderator_badge_visible === true,
        moderatorPermissions: JSON.parse(r.moderator_permissions ?? '[]'),
        joinedAt: Number(r.joined_at),
        lastSeenAt: Number(r.last_seen_at ?? r.joined_at ?? 0),
        xp: Number(r.xp ?? 0),
        level: Number(r.level ?? 1),
        cosmetics: (() => { try {
            return JSON.parse(r.cosmetics ?? '{}');
        }
        catch {
            return { equippedNameColor: null, equippedFrame: null, unlockedItems: [] };
        } })(),
        friendCode: r.friend_code ?? '',
        isOnline: isOnline(r.id),
        playerStatus: isOnline(r.id) ? (statusMap.get(r.id) ?? 'online') : 'offline',
    }));
    _leaderboardCache = result;
    _leaderboardCachedAt = Date.now();
    return result;
}
// ── Fast mod player list — no per-player sub-queries ─────────────────
export async function getPlayersFast() {
    const rows = await sql `
    SELECT id, username, avatar, avatar_url, public_id,
           games_played, wins, losses, xp, level, cosmetics,
           friend_code, is_moderator, moderator_level, moderator_badge_visible,
           moderator_permissions, joined_at
    FROM players
    ORDER BY last_seen_at DESC
    LIMIT 1000
  `;
    // Owner/mod tool: use RAW (unmasked) online state so invisible owners are
    // still visible to staff. (Invisible Mode only hides from regular users.)
    const statusMap = getActiveStatusMapRaw();
    return rows.map((r) => ({
        id: r.id,
        username: r.username,
        avatar: r.avatar,
        avatarUrl: r.avatar_url ?? null,
        publicId: r.public_id != null ? Number(r.public_id) : null,
        stats: {
            gamesPlayed: Number(r.games_played ?? 0),
            wins: Number(r.wins ?? 0),
            losses: Number(r.losses ?? 0),
            winRate: Number(r.games_played ?? 0) > 0
                ? Math.round((Number(r.wins ?? 0) / Number(r.games_played ?? 0)) * 100) : 0,
        },
        isModerator: r.is_moderator === 1 || r.is_moderator === true,
        moderatorLevel: r.moderator_level ?? null,
        moderatorBadgeVisible: r.moderator_badge_visible === 1 || r.moderator_badge_visible === true,
        moderatorPermissions: JSON.parse(r.moderator_permissions ?? '[]'),
        joinedAt: Number(r.joined_at),
        lastSeenAt: Number(r.last_seen_at ?? r.joined_at ?? 0),
        xp: Number(r.xp ?? 0),
        level: Number(r.level ?? 1),
        cosmetics: (() => { try {
            return JSON.parse(r.cosmetics ?? '{}');
        }
        catch {
            return { equippedNameColor: null, equippedFrame: null, unlockedItems: [] };
        } })(),
        friendCode: r.friend_code ?? '',
        isOnline: isOnlineRaw(r.id),
        playerStatus: isOnlineRaw(r.id) ? (statusMap.get(r.id) ?? 'online') : 'offline',
    }));
}
export function toPublicProfile(p) {
    return {
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        avatarUrl: p.avatarUrl ?? null,
        publicId: p.publicId ?? null,
        stats: { ...p.stats },
        isModerator: p.isModerator,
        moderatorLevel: p.moderatorLevel,
        moderatorBadgeVisible: p.moderatorBadgeVisible,
        moderatorPermissions: p.moderatorPermissions ?? [],
        joinedAt: p.joinedAt,
        lastSeenAt: p.lastSeenAt,
        xp: p.xp,
        level: p.level,
        cosmetics: p.cosmetics,
        friendCode: p.friendCode,
        isOnline: isOnline(p.id),
        playerStatus: getPlayerStatus(p.id),
    };
}
export async function addGameResult(uid, won) {
    await sql `
    UPDATE players SET
      games_played = games_played + 1,
      wins   = wins   + ${won ? 1 : 0},
      losses = losses + ${won ? 0 : 1}
    WHERE id = ${uid}
  `;
}
// ── Bans ──────────────────────────────────────────────────────────────
export async function getActiveBan(uid) {
    const now = Date.now();
    const [row] = await sql `
    SELECT * FROM bans
    WHERE player_id = ${uid} AND active = 1 AND expires_at > ${now}
    ORDER BY expires_at DESC LIMIT 1
  `;
    if (!row)
        return null;
    return {
        id: row.id, reason: row.reason,
        issuedBy: row.banned_by, issuedByName: row.banned_by_name,
        issuedAt: Number(row.issued_at), expiresAt: Number(row.expires_at),
    };
}
export async function setBan(uid, record) {
    await sql `UPDATE bans SET active = 0 WHERE player_id = ${uid}`;
    await sql `
    INSERT INTO bans (id, player_id, banned_by, banned_by_name, reason, issued_at, expires_at, active)
    VALUES (${record.id}, ${uid}, ${record.issuedBy}, ${record.issuedByName},
            ${record.reason}, ${record.issuedAt}, ${record.expiresAt}, 1)
  `;
}
export async function clearBan(uid) {
    await sql `UPDATE bans SET active = 0 WHERE player_id = ${uid}`;
}
// ── Mutes ─────────────────────────────────────────────────────────────
export async function getActiveMute(uid) {
    const now = Date.now();
    const [row] = await sql `
    SELECT * FROM mutes
    WHERE player_id = ${uid} AND active = 1 AND expires_at > ${now}
    ORDER BY expires_at DESC LIMIT 1
  `;
    if (!row)
        return null;
    return {
        id: row.id, reason: row.reason,
        issuedBy: row.muted_by, issuedByName: row.muted_by_name,
        issuedAt: Number(row.issued_at), expiresAt: Number(row.expires_at),
    };
}
export async function setMute(uid, record) {
    await sql `UPDATE mutes SET active = 0 WHERE player_id = ${uid}`;
    await sql `
    INSERT INTO mutes (id, player_id, muted_by, muted_by_name, reason, issued_at, expires_at, active)
    VALUES (${record.id}, ${uid}, ${record.issuedBy}, ${record.issuedByName},
            ${record.reason}, ${record.issuedAt}, ${record.expiresAt}, 1)
  `;
}
export async function clearMute(uid) {
    await sql `UPDATE mutes SET active = 0 WHERE player_id = ${uid}`;
}
// ── Warnings ──────────────────────────────────────────────────────────
export async function getWarnings(uid) {
    const rows = await sql `
    SELECT * FROM warnings WHERE player_id = ${uid} ORDER BY issued_at DESC
  `;
    return rows.map((r) => ({
        id: r.id, playerId: r.player_id,
        reason: r.reason, category: (r.category ?? 'other'),
        issuedBy: r.warned_by, issuedByName: r.warned_by_name,
        issuedAt: Number(r.issued_at),
    }));
}
export async function addWarning(uid, warning) {
    await sql `
    INSERT INTO warnings (id, player_id, warned_by, warned_by_name, reason, category, issued_at)
    VALUES (${warning.id}, ${uid}, ${warning.issuedBy}, ${warning.issuedByName},
            ${warning.reason}, ${warning.category ?? 'other'}, ${warning.issuedAt})
  `;
}
export function findSocketByProfile(io, profileId) {
    for (const [, socket] of io.sockets.sockets) {
        if (socket.data.profileId === profileId)
            return socket;
    }
    return null;
}
// ── XP & Level System ─────────────────────────────────────────────────
export const MAX_LEVEL = 100;
// Levels 1–10: original (preserved — no XP reset for existing users)
// Levels 11–100: formula threshold(n) = 5400 + 1200k + 45k² where k = n - 10
export const LEVEL_THRESHOLDS = [
    // 1–10
    0, 100, 250, 500, 900, 1400, 2100, 3000, 4100, 5400,
    // 11–20
    6645, 7980, 9405, 10920, 12525, 14220, 16005, 17880, 19845, 21900,
    // 21–30
    24045, 26280, 28605, 31020, 33525, 36120, 38805, 41580, 44445, 47400,
    // 31–40
    50445, 53580, 56805, 60120, 63525, 67020, 70605, 74280, 78045, 81900,
    // 41–50
    85845, 89880, 94005, 98220, 102525, 106920, 111405, 115980, 120645, 125400,
    // 51–60
    130245, 135180, 140205, 145320, 150525, 155820, 161205, 166680, 172245, 177900,
    // 61–70
    183645, 189480, 195405, 201420, 207525, 213720, 220005, 226380, 232845, 239400,
    // 71–80
    246045, 252780, 259605, 266520, 273525, 280620, 287805, 295080, 302445, 309900,
    // 81–90
    317445, 325080, 332805, 340620, 348525, 356520, 364605, 372780, 381045, 389400,
    // 91–100
    397845, 406380, 415005, 423720, 432525, 441420, 450405, 459480, 468645, 477900,
];
export function getLevel(xp) {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
        if (xp >= LEVEL_THRESHOLDS[i])
            return Math.min(i + 1, MAX_LEVEL);
    }
    return 1;
}
export async function addXP(profileId, amount) {
    const [row] = await sql `SELECT xp, level FROM players WHERE id = ${profileId}`;
    if (!row)
        return { newXP: 0, newLevel: 1, leveledUp: false };
    const newXP = Number(row.xp ?? 0) + amount;
    const newLevel = getLevel(newXP);
    await sql `UPDATE players SET xp = ${newXP}, level = ${newLevel} WHERE id = ${profileId}`;
    await checkLevelCosmetics(profileId, newLevel);
    return { newXP, newLevel, leveledUp: newLevel > Number(row.level ?? 1) };
}
export async function getCosmetics(profileId) {
    const [row] = await sql `SELECT cosmetics FROM players WHERE id = ${profileId}`;
    try {
        const parsed = JSON.parse(row?.cosmetics ?? '{}');
        return {
            equippedNameColor: parsed.equippedNameColor ?? null,
            equippedFrame: parsed.equippedFrame ?? null,
            equippedTitle: parsed.equippedTitle ?? null,
            equippedRoleSkin: parsed.equippedRoleSkin ?? null,
            equippedWallpaper: parsed.equippedWallpaper ?? null,
            equippedBorder: parsed.equippedBorder ?? null,
            unlockedItems: parsed.unlockedItems ?? [],
        };
    }
    catch {
        return { equippedNameColor: null, equippedFrame: null, equippedTitle: null, equippedRoleSkin: null, equippedWallpaper: null, equippedBorder: null, unlockedItems: [] };
    }
}
// Batch-resolve equipped name-color ids for many players in one query.
// Returns only entries that have a non-null equippedNameColor.
export async function getNameColors(profileIds) {
    const ids = Array.from(new Set(profileIds.filter(Boolean))).slice(0, 200);
    if (ids.length === 0)
        return {};
    const rows = await sql `SELECT id, cosmetics FROM players WHERE id = ANY(${ids})`;
    const out = {};
    for (const row of rows) {
        try {
            const c = JSON.parse(row?.cosmetics ?? '{}');
            if (c?.equippedNameColor)
                out[row.id] = c.equippedNameColor;
        }
        catch { /* ignore malformed cosmetics */ }
    }
    return out;
}
export async function equipCosmetic(profileId, type, itemId) {
    const cosmetics = await getCosmetics(profileId);
    if (itemId && !cosmetics.unlockedItems.includes(itemId))
        throw new Error('Item not unlocked.');
    if (type === 'name_color')
        cosmetics.equippedNameColor = itemId;
    else if (type === 'frame')
        cosmetics.equippedFrame = itemId;
    else if (type === 'title')
        cosmetics.equippedTitle = itemId;
    else if (type === 'role_skin')
        cosmetics.equippedRoleSkin = itemId;
    else if (type === 'wallpaper')
        cosmetics.equippedWallpaper = itemId;
    else if (type === 'border')
        cosmetics.equippedBorder = itemId;
    await sql `UPDATE players SET cosmetics = ${JSON.stringify(cosmetics)} WHERE id = ${profileId}`;
    return cosmetics;
}
// Grant starter items to a new player (call after first login)
export async function grantStarterCosmetics(profileId) {
    const STARTER = ['title_void_citizen', 'skin_classic', 'frame_bronze', 'bg_void'];
    const cosmetics = await getCosmetics(profileId);
    let changed = false;
    for (const item of STARTER) {
        if (!cosmetics.unlockedItems.includes(item)) {
            cosmetics.unlockedItems.push(item);
            changed = true;
        }
    }
    if (changed) {
        if (!cosmetics.equippedTitle)
            cosmetics.equippedTitle = 'title_void_citizen';
        if (!cosmetics.equippedRoleSkin)
            cosmetics.equippedRoleSkin = 'skin_classic';
        if (!cosmetics.equippedFrame)
            cosmetics.equippedFrame = 'frame_bronze';
        await sql `UPDATE players SET cosmetics = ${JSON.stringify(cosmetics)} WHERE id = ${profileId}`;
    }
}
async function checkLevelCosmetics(profileId, level) {
    const unlocks = {
        2: ['name_cyan', 'title_night_owl'],
        3: ['name_pink', 'frame_bronze', 'skin_neon', 'title_city_sheriff'],
        5: ['name_gold', 'frame_silver', 'skin_golden_don', 'title_silent_killer', 'frame_cyber_don'],
        7: ['name_rainbow', 'title_the_betrayer', 'skin_cyber_sheriff'],
        8: ['frame_gold', 'title_clan_boss', 'skin_cult', 'frame_blood_moon'],
        10: ['frame_legendary', 'title_godfather', 'skin_shogun'],
        15: ['title_night_walker'],
        20: ['title_mask_bearer'],
        25: ['title_signal_hunter'],
        30: ['title_shadow_player'],
        40: ['title_tribunal_voice'],
        50: ['title_void_veteran'],
        60: ['title_black_box_analyst'],
        70: ['title_blood_moon_survivor'],
        80: ['title_master_of_lies'],
        90: ['title_silent_judge'],
        100: ['title_void_master'],
    };
    const items = unlocks[level];
    if (!items)
        return;
    const cosmetics = await getCosmetics(profileId);
    for (const item of items) {
        if (!cosmetics.unlockedItems.includes(item))
            cosmetics.unlockedItems.push(item);
    }
    await sql `UPDATE players SET cosmetics = ${JSON.stringify(cosmetics)} WHERE id = ${profileId}`;
}
export async function updateAvatarUrl(uid, url) {
    await sql `
    UPDATE players
    SET avatar_url = ${url}, avatar_updated_at = ${Date.now()}
    WHERE id = ${uid}
  `;
}
export async function updateUsername(uid, newName) {
    await sql `
    UPDATE players
    SET username = ${newName}
    WHERE id = ${uid}
  `;
}
//# sourceMappingURL=playerService.js.map