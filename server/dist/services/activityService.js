import { randomUUID } from 'crypto';
import { sql } from '../db.js';
export async function recordActivity(actorId, eventType, targetId, payload = {}) {
    const id = randomUUID();
    const now = Date.now();
    await sql `
    INSERT INTO activity_events (id, actor_id, event_type, target_id, payload, created_at)
    VALUES (${id}, ${actorId}, ${eventType}, ${targetId ?? null}, ${JSON.stringify(payload)}, ${now})
  `;
}
export async function getFriendActivityFeed(viewerId, limit = 40) {
    // Get friend IDs
    const friendRows = await sql `
    SELECT CASE WHEN from_id = ${viewerId} THEN to_id ELSE from_id END AS friend_id
    FROM friendships
    WHERE (from_id = ${viewerId} OR to_id = ${viewerId}) AND status = 'accepted'
  `;
    const friendIds = friendRows.map((r) => r.friend_id);
    if (friendIds.length === 0) {
        return [];
    }
    const rows = await sql `
    SELECT ae.*, p.username AS actor_username, p.avatar_url AS actor_avatar_url
    FROM activity_events ae
    JOIN players p ON p.id = ae.actor_id
    WHERE ae.actor_id = ANY(${friendIds})
    ORDER BY ae.created_at DESC
    LIMIT ${limit}
  `;
    return rows.map((r) => ({
        id: r.id,
        actorId: r.actor_id,
        eventType: r.event_type,
        targetId: r.target_id ?? null,
        payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload ?? {}),
        createdAt: Number(r.created_at),
        actorUsername: r.actor_username,
        actorAvatarUrl: r.actor_avatar_url ?? null,
    }));
}
export async function getPlayerActivity(playerId, limit = 20) {
    const rows = await sql `
    SELECT ae.*, p.username AS actor_username, p.avatar_url AS actor_avatar_url
    FROM activity_events ae
    JOIN players p ON p.id = ae.actor_id
    WHERE ae.actor_id = ${playerId}
    ORDER BY ae.created_at DESC
    LIMIT ${limit}
  `;
    return rows.map((r) => ({
        id: r.id,
        actorId: r.actor_id,
        eventType: r.event_type,
        targetId: r.target_id ?? null,
        payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload ?? {}),
        createdAt: Number(r.created_at),
        actorUsername: r.actor_username,
        actorAvatarUrl: r.actor_avatar_url ?? null,
    }));
}
//# sourceMappingURL=activityService.js.map