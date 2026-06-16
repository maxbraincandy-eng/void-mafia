import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';
import { getAllRooms } from './roomService.js';
// ── Online status tracking (in-memory, ephemeral) ─────────────────────
const onlineProfiles = new Set();
export function markOnline(profileId) { onlineProfiles.add(profileId); }
export function markOffline(profileId) { onlineProfiles.delete(profileId); }
export function isOnline(profileId) { return onlineProfiles.has(profileId); }
export function getOnlineCount() { return onlineProfiles.size; }
export function getPlayerStatus(profileId) {
    if (!onlineProfiles.has(profileId))
        return 'offline';
    const rooms = getAllRooms();
    for (const room of rooms) {
        for (const [, player] of room.players) {
            if (player.profileId === profileId && player.isConnected) {
                return player.isSpectator ? 'spectating' : 'in_game';
            }
        }
    }
    return 'online';
}
// Single pass over all rooms — avoids O(profiles × rooms × players) when
// resolving status for a large player list (e.g. the mod dashboard).
export function getActiveStatusMap() {
    const map = new Map();
    for (const room of getAllRooms()) {
        for (const [, player] of room.players) {
            if (!player.isConnected || !player.profileId)
                continue;
            if (player.isSpectator) {
                if (!map.has(player.profileId))
                    map.set(player.profileId, 'spectating');
            }
            else {
                map.set(player.profileId, 'in_game');
            }
        }
    }
    return map;
}
export function getSpectatingCount() {
    let count = 0;
    for (const room of getAllRooms()) {
        for (const [, player] of room.players) {
            if (player.isSpectator && player.isConnected)
                count++;
        }
    }
    return count;
}
// ── Friend requests ───────────────────────────────────────────────────
export async function sendFriendRequest(fromId, toId) {
    if (fromId === toId)
        throw new Error('Cannot friend yourself.');
    const [existing] = await sql `
    SELECT status FROM friendships
    WHERE (from_id = ${fromId} AND to_id = ${toId}) OR (from_id = ${toId} AND to_id = ${fromId})
  `;
    if (existing?.status === 'accepted')
        throw new Error('Already friends.');
    if (existing?.status === 'pending')
        throw new Error('Request already pending.');
    await sql `
    INSERT INTO friendships (id, from_id, to_id, status, created_at)
    VALUES (${generateId()}, ${fromId}, ${toId}, 'pending', ${Date.now()})
    ON CONFLICT DO NOTHING
  `;
}
export async function acceptFriend(requestFrom, accepterId) {
    const result = await sql `
    UPDATE friendships SET status = 'accepted'
    WHERE from_id = ${requestFrom} AND to_id = ${accepterId} AND status = 'pending'
  `;
    if (result.count === 0)
        throw new Error('No pending request found.');
}
export async function declineFriend(requestFrom, declinerId) {
    await sql `
    DELETE FROM friendships
    WHERE from_id = ${requestFrom} AND to_id = ${declinerId} AND status = 'pending'
  `;
}
export async function removeFriend(playerId, friendId) {
    await sql `
    DELETE FROM friendships
    WHERE (from_id = ${playerId} AND to_id = ${friendId})
       OR (from_id = ${friendId} AND to_id = ${playerId})
  `;
}
export async function getFriends(playerId) {
    const rows = await sql `
    SELECT p.id, p.username, p.avatar, p.avatar_url, p.public_id, p.level
    FROM friendships f
    JOIN players p ON (
      CASE WHEN f.from_id = ${playerId} THEN f.to_id ELSE f.from_id END = p.id
    )
    WHERE (f.from_id = ${playerId} OR f.to_id = ${playerId}) AND f.status = 'accepted'
  `;
    return rows.map((r) => ({
        profileId: r.id, username: r.username, avatar: r.avatar,
        avatarUrl: r.avatar_url ?? null,
        publicId: r.public_id != null ? Number(r.public_id) : null,
        level: Number(r.level ?? 1), isOnline: onlineProfiles.has(r.id), status: 'accepted',
        playerStatus: getPlayerStatus(r.id),
    }));
}
export async function getPendingRequests(playerId) {
    const rows = await sql `
    SELECT f.id, f.from_id, p.username, p.avatar, p.avatar_url, f.created_at
    FROM friendships f
    JOIN players p ON f.from_id = p.id
    WHERE f.to_id = ${playerId} AND f.status = 'pending'
  `;
    return rows.map((r) => ({
        id: r.id, fromId: r.from_id, fromUsername: r.username,
        fromAvatar: r.avatar, fromAvatarUrl: r.avatar_url ?? null,
        createdAt: Number(r.created_at),
    }));
}
export async function getFriendshipStatus(userId, otherId) {
    const [row] = await sql `
    SELECT status, from_id FROM friendships
    WHERE (from_id = ${userId} AND to_id = ${otherId})
       OR (from_id = ${otherId} AND to_id = ${userId})
  `;
    if (!row)
        return 'none';
    if (row.status === 'accepted')
        return 'friends';
    if (row.status === 'pending')
        return row.from_id === userId ? 'request_sent' : 'request_received';
    return 'none';
}
//# sourceMappingURL=friendService.js.map