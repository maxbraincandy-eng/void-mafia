import { randomUUID } from 'crypto';
import { sql } from '../db.js';

export type ActivityEventType = 'posted' | 'followed' | 'became_friends' | 'joined_debate' | 'debate_argument';

export interface ActivityEvent {
  id: string;
  actorId: string;
  eventType: ActivityEventType;
  targetId: string | null;
  payload: Record<string, any>;
  createdAt: number;
  actorUsername?: string;
  actorAvatarUrl?: string | null;
}

export async function recordActivity(
  actorId: string,
  eventType: ActivityEventType,
  targetId: string | null,
  payload: Record<string, any> = {},
): Promise<void> {
  const id = randomUUID();
  const now = Date.now();
  await sql`
    INSERT INTO activity_events (id, actor_id, event_type, target_id, payload, created_at)
    VALUES (${id}, ${actorId}, ${eventType}, ${targetId ?? null}, ${JSON.stringify(payload)}, ${now})
  `;
}

export async function getFriendActivityFeed(viewerId: string, limit = 40): Promise<ActivityEvent[]> {
  // Get friend IDs
  const friendRows = await sql`
    SELECT CASE WHEN from_id = ${viewerId} THEN to_id ELSE from_id END AS friend_id
    FROM friendships
    WHERE (from_id = ${viewerId} OR to_id = ${viewerId}) AND status = 'accepted'
  `;
  const friendIds = friendRows.map((r: any) => r.friend_id as string);

  if (friendIds.length === 0) {
    return [];
  }

  const rows = await sql`
    SELECT ae.*, p.username AS actor_username, p.avatar_url AS actor_avatar_url
    FROM activity_events ae
    JOIN players p ON p.id = ae.actor_id
    WHERE ae.actor_id = ANY(${friendIds})
    ORDER BY ae.created_at DESC
    LIMIT ${limit}
  `;

  return rows.map((r: any) => ({
    id: r.id,
    actorId: r.actor_id,
    eventType: r.event_type as ActivityEventType,
    targetId: r.target_id ?? null,
    payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload ?? {}),
    createdAt: Number(r.created_at),
    actorUsername: r.actor_username,
    actorAvatarUrl: r.actor_avatar_url ?? null,
  }));
}

export async function getPlayerActivity(playerId: string, limit = 20): Promise<ActivityEvent[]> {
  const rows = await sql`
    SELECT ae.*, p.username AS actor_username, p.avatar_url AS actor_avatar_url
    FROM activity_events ae
    JOIN players p ON p.id = ae.actor_id
    WHERE ae.actor_id = ${playerId}
    ORDER BY ae.created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r: any) => ({
    id: r.id,
    actorId: r.actor_id,
    eventType: r.event_type as ActivityEventType,
    targetId: r.target_id ?? null,
    payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload ?? {}),
    createdAt: Number(r.created_at),
    actorUsername: r.actor_username,
    actorAvatarUrl: r.actor_avatar_url ?? null,
  }));
}
