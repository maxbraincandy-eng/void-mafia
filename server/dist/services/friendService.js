import { db } from '../db.js';
import { generateId } from '../utils/helpers.js';
// ── Online status tracking ────────────────────────────────────────────
const onlineProfiles = new Set();
export function markOnline(profileId) {
    onlineProfiles.add(profileId);
}
export function markOffline(profileId) {
    onlineProfiles.delete(profileId);
}
export function isOnline(profileId) {
    return onlineProfiles.has(profileId);
}
// ── Friend requests ───────────────────────────────────────────────────
export function sendFriendRequest(fromId, toId) {
    if (fromId === toId)
        throw new Error('Cannot friend yourself.');
    const existing = db.prepare('SELECT status FROM friendships WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)').get(fromId, toId, toId, fromId);
    if (existing?.status === 'accepted')
        throw new Error('Already friends.');
    if (existing?.status === 'pending')
        throw new Error('Request already pending.');
    db.prepare('INSERT OR IGNORE INTO friendships (id, from_id, to_id, status, created_at) VALUES (?,?,?,?,?)').run(generateId(), fromId, toId, 'pending', Date.now());
}
export function acceptFriend(requestFrom, accepterId) {
    const changes = db.prepare('UPDATE friendships SET status=? WHERE from_id=? AND to_id=? AND status=?').run('accepted', requestFrom, accepterId, 'pending').changes;
    if (changes === 0)
        throw new Error('No pending request found.');
}
export function declineFriend(requestFrom, declinerId) {
    db.prepare('DELETE FROM friendships WHERE from_id=? AND to_id=? AND status=?').run(requestFrom, declinerId, 'pending');
}
export function removeFriend(playerId, friendId) {
    db.prepare('DELETE FROM friendships WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)').run(playerId, friendId, friendId, playerId);
}
export function getFriends(playerId) {
    const rows = db.prepare(`
    SELECT p.id, p.username, p.avatar, p.level
    FROM friendships f
    JOIN players p ON (
      CASE WHEN f.from_id = ? THEN f.to_id ELSE f.from_id END = p.id
    )
    WHERE (f.from_id = ? OR f.to_id = ?) AND f.status = 'accepted'
  `).all(playerId, playerId, playerId);
    return rows.map(r => ({
        profileId: r.id,
        username: r.username,
        avatar: r.avatar,
        level: r.level ?? 1,
        isOnline: onlineProfiles.has(r.id),
        status: 'accepted',
    }));
}
export function getPendingRequests(playerId) {
    const rows = db.prepare(`
    SELECT f.id, f.from_id, p.username, p.avatar, f.created_at
    FROM friendships f
    JOIN players p ON f.from_id = p.id
    WHERE f.to_id = ? AND f.status = 'pending'
  `).all(playerId);
    return rows.map(r => ({
        id: r.id,
        fromId: r.from_id,
        fromUsername: r.username,
        fromAvatar: r.avatar,
        createdAt: r.created_at,
    }));
}
//# sourceMappingURL=friendService.js.map