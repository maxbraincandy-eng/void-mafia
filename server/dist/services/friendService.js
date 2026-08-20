import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';
import { getAllRooms } from './roomService.js';
// ── Online status tracking (in-memory, ephemeral) ─────────────────────
const onlineProfiles = new Set();
// ── Invisible Mode (owner stealth) ────────────────────────────────────
// Owners in this set are still internally online (onlineProfiles), but are
// masked from every presence-display surface: online count, friend presence,
// status, currently-playing. Toggled only by the owner-only mod handler.
const invisibleProfiles = new Set();
export function setInvisible(profileId, on) {
    if (on)
        invisibleProfiles.add(profileId);
    else
        invisibleProfiles.delete(profileId);
}
export function isInvisible(profileId) { return invisibleProfiles.has(profileId); }
// Ghost Mode extends Invisible: owner observes rooms/spaces without spawning a
// participant. Enabling ghost forces invisible on.
const ghostProfiles = new Set();
export function setGhost(profileId, on) {
    if (on) {
        ghostProfiles.add(profileId);
        invisibleProfiles.add(profileId);
    }
    else
        ghostProfiles.delete(profileId);
}
export function isGhost(profileId) { return ghostProfiles.has(profileId); }
// Lounge presence — set by the socket layer when a player joins/leaves a space.
const loungePresence = new Map();
export function setLoungePresence(profileId, info) { loungePresence.set(profileId, info); }
export function clearLoungePresence(profileId) { loungePresence.delete(profileId); }
let _peakOnline = 0;
export function getPeakOnline() { return _peakOnline; }
export function markOnline(profileId) {
    onlineProfiles.add(profileId);
    const c = getOnlineCount();
    if (c > _peakOnline)
        _peakOnline = c;
}
export function markOffline(profileId) { onlineProfiles.delete(profileId); loungePresence.delete(profileId); }
// Invisible owners read as offline to everyone (internally still online).
export function isOnline(profileId) { return onlineProfiles.has(profileId) && !invisibleProfiles.has(profileId); }
export function getOnlineCount() {
    let n = 0;
    for (const p of onlineProfiles)
        if (!invisibleProfiles.has(p))
            n++;
    return n;
}
// RAW (unmasked) — for owner/mod tools only, which must see the true online
// state including invisible owners. Never used for user-facing surfaces.
export function isOnlineRaw(profileId) { return onlineProfiles.has(profileId); }
export function getOnlineCountRaw() { return onlineProfiles.size; }
export function getPlayerStatus(profileId) {
    if (!onlineProfiles.has(profileId) || invisibleProfiles.has(profileId))
        return 'offline';
    const rooms = getAllRooms();
    for (const room of rooms) {
        for (const [, player] of room.players) {
            if (player.profileId === profileId && player.isConnected) {
                return player.isSpectator ? 'spectating' : 'in_game';
            }
        }
    }
    if (loungePresence.has(profileId))
        return 'in_lounge';
    return 'online';
}
// Full presence (with a join target) for showing "in Mafia / in Lounge X" + Join.
export function getPlayerPresence(profileId) {
    if (!onlineProfiles.has(profileId) || invisibleProfiles.has(profileId))
        return null;
    for (const room of getAllRooms()) {
        // Private rooms must never be exposed to friends — no visibility, no join.
        if (room.settings.isPrivate)
            continue;
        for (const [, player] of room.players) {
            if (player.profileId === profileId && player.isConnected && !player.isSpectator) {
                return { kind: 'game', label: 'Mafia', code: room.code };
            }
        }
    }
    const lounge = loungePresence.get(profileId);
    if (lounge)
        return { kind: 'lounge', label: lounge.name, code: lounge.code };
    return null;
}
// Single pass over all rooms — avoids O(profiles × rooms × players) when
// resolving status for a large player list (e.g. the mod dashboard).
// RAW status map (includes invisible owners) — for owner/mod tools.
export function getActiveStatusMapRaw() {
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
// Masked version (hides invisible owners) — for user-facing surfaces.
export function getActiveStatusMap() {
    const map = getActiveStatusMapRaw();
    for (const id of [...map.keys()])
        if (invisibleProfiles.has(id))
            map.delete(id);
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
        level: Number(r.level ?? 1), isOnline: isOnline(r.id), status: 'accepted',
        playerStatus: getPlayerStatus(r.id), presence: getPlayerPresence(r.id),
    }));
}
/**
 * People this player can invite: accepted friends PLUS everyone they follow
 * or who follows them in the community. Deduplicated, with online status.
 */
export async function getInvitablePeople(playerId) {
    const rows = await sql `
    SELECT DISTINCT p.id, p.username, p.avatar, p.avatar_url, p.public_id, p.level
    FROM players p
    WHERE p.id <> ${playerId} AND p.id IN (
      SELECT CASE WHEN from_id = ${playerId} THEN to_id ELSE from_id END
        FROM friendships
        WHERE (from_id = ${playerId} OR to_id = ${playerId}) AND status = 'accepted'
      UNION
      SELECT following_id FROM follows WHERE follower_id = ${playerId}
      UNION
      SELECT follower_id  FROM follows WHERE following_id = ${playerId}
    )
  `;
    return rows.map((r) => ({
        profileId: r.id, username: r.username, avatar: r.avatar,
        avatarUrl: r.avatar_url ?? null,
        publicId: r.public_id != null ? Number(r.public_id) : null,
        level: Number(r.level ?? 1), isOnline: isOnline(r.id), status: 'accepted',
        playerStatus: getPlayerStatus(r.id), presence: getPlayerPresence(r.id),
    }));
}
/** Everyone online right now, invisible owners excluded. */
export function getOnlineProfileIds() {
    return [...onlineProfiles].filter(id => !invisibleProfiles.has(id));
}
/**
 * Who this player can invite to a match: ANYONE, not just their friends.
 *
 * A table needs three more people and the friends list is empty at that
 * moment — so a picker that only shows friends is a picker that usually shows
 * nobody. With no query it opens on the people you know plus everyone who is
 * online right now (the only ones who can be pulled in immediately); typing a
 * name searches every account, so someone met once in a room can be found by
 * name without a friend request first.
 *
 * Sorted online-first because an invite to an online player is a game starting
 * in ten seconds, while an invite to an offline one is a notification they may
 * read tomorrow.
 */
export async function getPeopleToInvite(playerId, q = '', limit = 40) {
    const query = String(q ?? '').trim().slice(0, 24);
    const knownRows = await sql `
    SELECT CASE WHEN from_id = ${playerId} THEN to_id ELSE from_id END AS pid
      FROM friendships WHERE (from_id = ${playerId} OR to_id = ${playerId}) AND status = 'accepted'
    UNION SELECT following_id FROM follows WHERE follower_id = ${playerId}
    UNION SELECT follower_id  FROM follows WHERE following_id = ${playerId}
  `;
    const known = new Set(knownRows.map((r) => r.pid));
    let rows;
    if (query) {
        // Search everyone. The numeric id is matched exactly so "#412" finds one
        // person rather than every name containing 412.
        rows = await sql `
      SELECT id, username, avatar, avatar_url, public_id, level
        FROM players
       WHERE id <> ${playerId}
         AND (username ILIKE ${'%' + query + '%'} OR CAST(public_id AS TEXT) = ${query.replace(/^#/, '')})
       ORDER BY LENGTH(username) ASC
       LIMIT 80
    `;
    }
    else {
        const ids = [...new Set([...known, ...getOnlineProfileIds()])].filter(id => id !== playerId);
        if (ids.length === 0)
            return [];
        rows = await sql `
      SELECT id, username, avatar, avatar_url, public_id, level
        FROM players WHERE id = ANY(${ids}) LIMIT 300
    `;
    }
    const people = rows.map((r) => ({
        profileId: r.id,
        username: r.username,
        avatar: r.avatar,
        avatarUrl: r.avatar_url ?? null,
        publicId: r.public_id != null ? Number(r.public_id) : null,
        level: Number(r.level ?? 1),
        isOnline: isOnline(r.id),
        status: 'accepted',
        playerStatus: getPlayerStatus(r.id),
        presence: getPlayerPresence(r.id),
        isKnown: known.has(r.id),
    }));
    people.sort((a, b) => Number(b.isOnline) - Number(a.isOnline) ||
        Number(b.isKnown) - Number(a.isKnown) ||
        a.username.localeCompare(b.username));
    return people.slice(0, limit);
}
// Just the accepted-friend profile ids (lightweight — for notifications).
export async function getFriendIds(playerId) {
    const rows = await sql `
    SELECT CASE WHEN from_id = ${playerId} THEN to_id ELSE from_id END AS fid
    FROM friendships
    WHERE (from_id = ${playerId} OR to_id = ${playerId}) AND status = 'accepted'
  `;
    return rows.map((r) => r.fid);
}
export async function getFriendSuggestions(playerId, limit = 10) {
    const rows = await sql `
    WITH my_friends AS (
      SELECT CASE WHEN from_id = ${playerId} THEN to_id ELSE from_id END AS fid
      FROM friendships
      WHERE (from_id = ${playerId} OR to_id = ${playerId}) AND status = 'accepted'
    ),
    foaf AS (
      SELECT CASE WHEN f.from_id = mf.fid THEN f.to_id ELSE f.from_id END AS suggested_id,
             COUNT(*) as mutual
      FROM friendships f
      JOIN my_friends mf ON (f.from_id = mf.fid OR f.to_id = mf.fid)
      WHERE f.status = 'accepted'
        AND CASE WHEN f.from_id = mf.fid THEN f.to_id ELSE f.from_id END <> ${playerId}
        AND CASE WHEN f.from_id = mf.fid THEN f.to_id ELSE f.from_id END NOT IN (SELECT fid FROM my_friends)
      GROUP BY suggested_id
      ORDER BY mutual DESC
      LIMIT ${limit}
    )
    SELECT p.id, p.username, p.avatar, p.avatar_url, foaf.mutual
    FROM foaf
    JOIN players p ON p.id = foaf.suggested_id
    ORDER BY foaf.mutual DESC
  `;
    return rows.map((r) => ({
        profileId: r.id, username: r.username, avatar: r.avatar,
        avatarUrl: r.avatar_url ?? null, mutualCount: Number(r.mutual),
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