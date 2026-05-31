import { nameToAvatar } from '../utils/helpers.js';
import { createHash, randomBytes } from 'crypto';
const players = new Map();
// email (lowercase) → profile id
const emailIndex = new Map();
function hashPassword(password, salt) {
    return createHash('sha256').update(salt + password + salt).digest('hex');
}
export function registerWithEmail(email, password, username) {
    const normalised = email.trim().toLowerCase();
    if (emailIndex.has(normalised))
        throw new Error('This email is already registered.');
    if (password.length < 6)
        throw new Error('Password must be at least 6 characters.');
    const name = username.trim().slice(0, 24) || 'Player';
    const uid = 'e_' + createHash('sha256').update(normalised).digest('hex').slice(0, 24);
    const salt = randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const modLevel = resolveModLevel(uid, name);
    const player = {
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
export function authenticateWithEmail(email, password) {
    const normalised = email.trim().toLowerCase();
    const uid = emailIndex.get(normalised);
    if (!uid)
        throw new Error('Email not found. Please register first.');
    const player = players.get(uid);
    if (!player || !player.passwordHash || !player.passwordSalt)
        throw new Error('Account error.');
    const hash = hashPassword(password, player.passwordSalt);
    if (hash !== player.passwordHash)
        throw new Error('Incorrect password.');
    player.lastSeenAt = Date.now();
    return player;
}
// Moderator config from environment variables
// ID-based (primary, secure)
const parseIds = (s) => s.split(',').map(n => n.trim()).filter(Boolean);
const MOD_IDS = new Set(parseIds(process.env.MODERATOR_IDS ?? ''));
const SENIOR_MOD_IDS = new Set(parseIds(process.env.SENIOR_MOD_IDS ?? ''));
const ADMIN_IDS = new Set(parseIds(process.env.ADMIN_IDS ?? ''));
const OWNER_IDS = new Set(parseIds(process.env.OWNER_IDS ?? ''));
// Name-based fallback (legacy, less secure)
const parseName = (s) => s.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
const MOD_NAMES = new Set(parseName(process.env.MODERATOR_NAMES ?? ''));
const ADMIN_NAMES = new Set(parseName(process.env.ADMIN_NAMES ?? ''));
const OWNER_NAMES = new Set(parseName(process.env.OWNER_NAMES ?? ''));
const PERM_MAP = {
    moderator: ['VIEW_REPORTS', 'KICK_ANY_PLAYER', 'MUTE_ANY_PLAYER', 'WARN_ANY_PLAYER'],
    senior_moderator: ['VIEW_REPORTS', 'KICK_ANY_PLAYER', 'MUTE_ANY_PLAYER', 'WARN_ANY_PLAYER', 'BAN_ANY_PLAYER', 'RESOLVE_REPORTS'],
    admin: ['VIEW_REPORTS', 'KICK_ANY_PLAYER', 'MUTE_ANY_PLAYER', 'WARN_ANY_PLAYER', 'BAN_ANY_PLAYER', 'RESOLVE_REPORTS', 'VIEW_MODERATION_LOGS'],
    owner: ['VIEW_REPORTS', 'KICK_ANY_PLAYER', 'MUTE_ANY_PLAYER', 'WARN_ANY_PLAYER', 'BAN_ANY_PLAYER', 'RESOLVE_REPORTS', 'VIEW_MODERATION_LOGS', 'ALL'],
};
export function getModPermissions(level) {
    if (!level)
        return [];
    return PERM_MAP[level];
}
function resolveModLevelById(uid) {
    if (OWNER_IDS.has(uid))
        return 'owner';
    if (ADMIN_IDS.has(uid))
        return 'admin';
    if (SENIOR_MOD_IDS.has(uid))
        return 'senior_moderator';
    if (MOD_IDS.has(uid))
        return 'moderator';
    return null;
}
function resolveModLevelByName(username) {
    const lower = username.toLowerCase();
    if (OWNER_NAMES.has(lower))
        return 'owner';
    if (ADMIN_NAMES.has(lower))
        return 'admin';
    if (MOD_NAMES.has(lower))
        return 'moderator';
    return null;
}
function resolveModLevel(uid, username) {
    return resolveModLevelById(uid) ?? resolveModLevelByName(username);
}
export function getOrCreatePlayer(uid, username) {
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
    }
    else {
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
export function getPlayer(uid) {
    return players.get(uid) ?? null;
}
export function getAllPlayers() {
    return [...players.values()];
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
    };
}
export function addGameResult(uid, won) {
    const player = players.get(uid);
    if (!player)
        return;
    player.stats.gamesPlayed++;
    if (won)
        player.stats.wins++;
    else
        player.stats.losses++;
    player.stats.winRate = player.stats.gamesPlayed > 0
        ? Math.round((player.stats.wins / player.stats.gamesPlayed) * 100)
        : 0;
}
export function getActiveBan(uid) {
    const player = players.get(uid);
    if (!player || !player.ban)
        return null;
    if (player.ban.expiresAt < Date.now()) {
        player.ban = null;
        return null;
    }
    return player.ban;
}
export function getActiveMute(uid) {
    const player = players.get(uid);
    if (!player || !player.mute)
        return null;
    if (player.mute.expiresAt < Date.now()) {
        player.mute = null;
        return null;
    }
    return player.mute;
}
export function setBan(uid, record) {
    const player = players.get(uid);
    if (player)
        player.ban = record;
}
export function clearBan(uid) {
    const player = players.get(uid);
    if (player)
        player.ban = null;
}
export function setMute(uid, record) {
    const player = players.get(uid);
    if (player)
        player.mute = record;
}
export function clearMute(uid) {
    const player = players.get(uid);
    if (player)
        player.mute = null;
}
export function addWarning(uid, warning) {
    const player = players.get(uid);
    if (player)
        player.warnings.push(warning);
}
// Find which socket corresponds to a profileId (for sending direct messages)
// The socket-to-profile mapping is maintained in the socket layer via socket.data.profileId
export function findSocketByProfile(io, profileId) {
    for (const [, socket] of io.sockets.sockets) {
        if (socket.data.profileId === profileId)
            return socket;
    }
    return null;
}
//# sourceMappingURL=playerService.js.map