import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';
import type { Friend, FriendRequest, PlayerStatus, PlayerPresence } from '../types/index.js';
import { getAllRooms } from './roomService.js';

// ── Online status tracking (in-memory, ephemeral) ─────────────────────
const onlineProfiles = new Set<string>();

// ── Invisible Mode (owner stealth) ────────────────────────────────────
// Owners in this set are still internally online (onlineProfiles), but are
// masked from every presence-display surface: online count, friend presence,
// status, currently-playing. Toggled only by the owner-only mod handler.
const invisibleProfiles = new Set<string>();
export function setInvisible(profileId: string, on: boolean): void {
  if (on) invisibleProfiles.add(profileId); else invisibleProfiles.delete(profileId);
}
export function isInvisible(profileId: string): boolean { return invisibleProfiles.has(profileId); }

// Ghost Mode extends Invisible: owner observes rooms/spaces without spawning a
// participant. Enabling ghost forces invisible on.
const ghostProfiles = new Set<string>();
export function setGhost(profileId: string, on: boolean): void {
  if (on) { ghostProfiles.add(profileId); invisibleProfiles.add(profileId); }
  else ghostProfiles.delete(profileId);
}
export function isGhost(profileId: string): boolean { return ghostProfiles.has(profileId); }

// Lounge presence — set by the socket layer when a player joins/leaves a space.
const loungePresence = new Map<string, { spaceId: string; name: string; code: string }>();
export function setLoungePresence(profileId: string, info: { spaceId: string; name: string; code: string }): void { loungePresence.set(profileId, info); }
export function clearLoungePresence(profileId: string): void { loungePresence.delete(profileId); }

let _peakOnline = 0;
export function getPeakOnline(): number { return _peakOnline; }
export function markOnline(profileId: string): void {
  onlineProfiles.add(profileId);
  const c = getOnlineCount();
  if (c > _peakOnline) _peakOnline = c;
}
export function markOffline(profileId: string): void { onlineProfiles.delete(profileId); loungePresence.delete(profileId); }
// Invisible owners read as offline to everyone (internally still online).
export function isOnline(profileId: string): boolean { return onlineProfiles.has(profileId) && !invisibleProfiles.has(profileId); }
export function getOnlineCount(): number {
  let n = 0;
  for (const p of onlineProfiles) if (!invisibleProfiles.has(p)) n++;
  return n;
}
// RAW (unmasked) — for owner/mod tools only, which must see the true online
// state including invisible owners. Never used for user-facing surfaces.
export function isOnlineRaw(profileId: string): boolean { return onlineProfiles.has(profileId); }
export function getOnlineCountRaw(): number { return onlineProfiles.size; }

export function getPlayerStatus(profileId: string): PlayerStatus {
  if (!onlineProfiles.has(profileId) || invisibleProfiles.has(profileId)) return 'offline';
  const rooms = getAllRooms();
  for (const room of rooms) {
    for (const [, player] of room.players) {
      if (player.profileId === profileId && player.isConnected) {
        return player.isSpectator ? 'spectating' : 'in_game';
      }
    }
  }
  if (loungePresence.has(profileId)) return 'in_lounge';
  return 'online';
}

// Full presence (with a join target) for showing "in Mafia / in Lounge X" + Join.
export function getPlayerPresence(profileId: string): PlayerPresence | null {
  if (!onlineProfiles.has(profileId) || invisibleProfiles.has(profileId)) return null;
  for (const room of getAllRooms()) {
    // Private rooms must never be exposed to friends — no visibility, no join.
    if (room.settings.isPrivate) continue;
    for (const [, player] of room.players) {
      if (player.profileId === profileId && player.isConnected && !player.isSpectator) {
        return { kind: 'game', label: 'Mafia', code: room.code };
      }
    }
  }
  const lounge = loungePresence.get(profileId);
  if (lounge) return { kind: 'lounge', label: lounge.name, code: lounge.code };
  return null;
}

// Single pass over all rooms — avoids O(profiles × rooms × players) when
// resolving status for a large player list (e.g. the mod dashboard).
// RAW status map (includes invisible owners) — for owner/mod tools.
export function getActiveStatusMapRaw(): Map<string, 'in_game' | 'spectating'> {
  const map = new Map<string, 'in_game' | 'spectating'>();
  for (const room of getAllRooms()) {
    for (const [, player] of room.players) {
      if (!player.isConnected || !player.profileId) continue;
      if (player.isSpectator) {
        if (!map.has(player.profileId)) map.set(player.profileId, 'spectating');
      } else {
        map.set(player.profileId, 'in_game');
      }
    }
  }
  return map;
}
// Masked version (hides invisible owners) — for user-facing surfaces.
export function getActiveStatusMap(): Map<string, 'in_game' | 'spectating'> {
  const map = getActiveStatusMapRaw();
  for (const id of [...map.keys()]) if (invisibleProfiles.has(id)) map.delete(id);
  return map;
}

export function getSpectatingCount(): number {
  let count = 0;
  for (const room of getAllRooms()) {
    for (const [, player] of room.players) {
      if (player.isSpectator && player.isConnected) count++;
    }
  }
  return count;
}

// ── Friend requests ───────────────────────────────────────────────────
export async function sendFriendRequest(fromId: string, toId: string): Promise<void> {
  if (fromId === toId) throw new Error('Cannot friend yourself.');
  const [existing] = await sql`
    SELECT status FROM friendships
    WHERE (from_id = ${fromId} AND to_id = ${toId}) OR (from_id = ${toId} AND to_id = ${fromId})
  ` as any[];
  if (existing?.status === 'accepted') throw new Error('Already friends.');
  if (existing?.status === 'pending') throw new Error('Request already pending.');
  await sql`
    INSERT INTO friendships (id, from_id, to_id, status, created_at)
    VALUES (${generateId()}, ${fromId}, ${toId}, 'pending', ${Date.now()})
    ON CONFLICT DO NOTHING
  `;
}

export async function acceptFriend(requestFrom: string, accepterId: string): Promise<void> {
  const result = await sql`
    UPDATE friendships SET status = 'accepted'
    WHERE from_id = ${requestFrom} AND to_id = ${accepterId} AND status = 'pending'
  `;
  if ((result as any).count === 0) throw new Error('No pending request found.');
}

export async function declineFriend(requestFrom: string, declinerId: string): Promise<void> {
  await sql`
    DELETE FROM friendships
    WHERE from_id = ${requestFrom} AND to_id = ${declinerId} AND status = 'pending'
  `;
}

export async function removeFriend(playerId: string, friendId: string): Promise<void> {
  await sql`
    DELETE FROM friendships
    WHERE (from_id = ${playerId} AND to_id = ${friendId})
       OR (from_id = ${friendId} AND to_id = ${playerId})
  `;
}

export async function getFriends(playerId: string): Promise<Friend[]> {
  const rows = await sql`
    SELECT p.id, p.username, p.avatar, p.avatar_url, p.public_id, p.level
    FROM friendships f
    JOIN players p ON (
      CASE WHEN f.from_id = ${playerId} THEN f.to_id ELSE f.from_id END = p.id
    )
    WHERE (f.from_id = ${playerId} OR f.to_id = ${playerId}) AND f.status = 'accepted'
  ` as any[];
  return rows.map((r: any) => ({
    profileId: r.id, username: r.username, avatar: r.avatar,
    avatarUrl: r.avatar_url ?? null,
    publicId: r.public_id != null ? Number(r.public_id) : null,
    level: Number(r.level ?? 1), isOnline: isOnline(r.id), status: 'accepted' as const,
    playerStatus: getPlayerStatus(r.id), presence: getPlayerPresence(r.id),
  }));
}

/**
 * People this player can invite: accepted friends PLUS everyone they follow
 * or who follows them in the community. Deduplicated, with online status.
 */
export async function getInvitablePeople(playerId: string): Promise<Friend[]> {
  const rows = await sql`
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
  ` as any[];
  return rows.map((r: any) => ({
    profileId: r.id, username: r.username, avatar: r.avatar,
    avatarUrl: r.avatar_url ?? null,
    publicId: r.public_id != null ? Number(r.public_id) : null,
    level: Number(r.level ?? 1), isOnline: isOnline(r.id), status: 'accepted' as const,
    playerStatus: getPlayerStatus(r.id), presence: getPlayerPresence(r.id),
  }));
}

// Just the accepted-friend profile ids (lightweight — for notifications).
export async function getFriendIds(playerId: string): Promise<string[]> {
  const rows = await sql`
    SELECT CASE WHEN from_id = ${playerId} THEN to_id ELSE from_id END AS fid
    FROM friendships
    WHERE (from_id = ${playerId} OR to_id = ${playerId}) AND status = 'accepted'
  ` as any[];
  return rows.map((r: any) => r.fid as string);
}

export async function getPendingRequests(playerId: string): Promise<FriendRequest[]> {
  const rows = await sql`
    SELECT f.id, f.from_id, p.username, p.avatar, p.avatar_url, f.created_at
    FROM friendships f
    JOIN players p ON f.from_id = p.id
    WHERE f.to_id = ${playerId} AND f.status = 'pending'
  ` as any[];
  return rows.map((r: any) => ({
    id: r.id, fromId: r.from_id, fromUsername: r.username,
    fromAvatar: r.avatar, fromAvatarUrl: r.avatar_url ?? null,
    createdAt: Number(r.created_at),
  }));
}

export async function getFriendshipStatus(userId: string, otherId: string): Promise<string> {
  const [row] = await sql`
    SELECT status, from_id FROM friendships
    WHERE (from_id = ${userId} AND to_id = ${otherId})
       OR (from_id = ${otherId} AND to_id = ${userId})
  ` as any[];
  if (!row) return 'none';
  if (row.status === 'accepted') return 'friends';
  if (row.status === 'pending') return row.from_id === userId ? 'request_sent' : 'request_received';
  return 'none';
}
