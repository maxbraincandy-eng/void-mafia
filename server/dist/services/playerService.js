import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { nameToAvatar } from '../utils/helpers.js';
import { sql } from '../db.js';
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
            unlockedItems: parsed.unlockedItems ?? [],
        };
    }
    catch {
        cosmetics = { equippedNameColor: null, equippedFrame: null, unlockedItems: [] };
    }
    return {
        id: row.id,
        username: row.username,
        avatar: row.avatar,
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
    }
    else {
        const modLevel = resolveModLevelFromEnv(uid, name);
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
export async function getAllPlayers() {
    const rows = await sql `SELECT * FROM players ORDER BY last_seen_at DESC`;
    return Promise.all(rows.map(rowToProfile));
}
export function toPublicProfile(p) {
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
        xp: p.xp,
        level: p.level,
        cosmetics: p.cosmetics,
        friendCode: p.friendCode,
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
        reason: r.reason, issuedBy: r.warned_by, issuedByName: r.warned_by_name,
        issuedAt: Number(r.issued_at),
    }));
}
export async function addWarning(uid, warning) {
    await sql `
    INSERT INTO warnings (id, player_id, warned_by, warned_by_name, reason, issued_at)
    VALUES (${warning.id}, ${uid}, ${warning.issuedBy}, ${warning.issuedByName},
            ${warning.reason}, ${warning.issuedAt})
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
export const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2100, 3000, 4100, 5400];
export function getLevel(xp) {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
        if (xp >= LEVEL_THRESHOLDS[i])
            return i + 1;
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
            unlockedItems: parsed.unlockedItems ?? [],
        };
    }
    catch {
        return { equippedNameColor: null, equippedFrame: null, unlockedItems: [] };
    }
}
export async function equipCosmetic(profileId, type, itemId) {
    const cosmetics = await getCosmetics(profileId);
    if (itemId && !cosmetics.unlockedItems.includes(itemId))
        throw new Error('Item not unlocked.');
    if (type === 'name_color')
        cosmetics.equippedNameColor = itemId;
    else
        cosmetics.equippedFrame = itemId;
    await sql `UPDATE players SET cosmetics = ${JSON.stringify(cosmetics)} WHERE id = ${profileId}`;
    return cosmetics;
}
async function checkLevelCosmetics(profileId, level) {
    const unlocks = {
        2: ['name_cyan'],
        3: ['name_pink', 'frame_bronze'],
        5: ['name_gold', 'frame_silver'],
        7: ['name_rainbow'],
        8: ['frame_gold'],
        10: ['frame_legendary'],
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
//# sourceMappingURL=playerService.js.map