import { nameToAvatar } from '../utils/helpers.js';
const players = new Map();
// Moderator config from environment variables
// MODERATOR_NAMES=Max,Admin  OWNER_NAMES=ბატონი_მაქსი
const parseName = (s) => s.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
const MOD_NAMES = new Set(parseName(process.env.MODERATOR_NAMES ?? ''));
const ADMIN_NAMES = new Set(parseName(process.env.ADMIN_NAMES ?? ''));
const OWNER_NAMES = new Set(parseName(process.env.OWNER_NAMES ?? ''));
function resolveModLevel(username) {
    const lower = username.toLowerCase();
    if (OWNER_NAMES.has(lower))
        return 'owner';
    if (ADMIN_NAMES.has(lower))
        return 'admin';
    if (MOD_NAMES.has(lower))
        return 'moderator';
    return null;
}
export function getOrCreatePlayer(uid, username) {
    const name = username.trim().slice(0, 24) || 'Player';
    let player = players.get(uid);
    if (!player) {
        const modLevel = resolveModLevel(name);
        player = {
            id: uid,
            username: name,
            avatar: nameToAvatar(name),
            stats: { gamesPlayed: 0, wins: 0, losses: 0, winRate: 0 },
            isModerator: modLevel !== null,
            moderatorLevel: modLevel,
            moderatorBadgeVisible: modLevel !== null,
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
        const modLevel = resolveModLevel(name);
        player.isModerator = modLevel !== null;
        player.moderatorLevel = modLevel;
        player.moderatorBadgeVisible = modLevel !== null;
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