import { sql } from '../db.js';
const buffers = new Map();
export function startReplay(gameId, roomName, startedAt) {
    buffers.set(gameId, { roomName, startedAt, events: [] });
}
export function recordEvent(gameId, event) {
    const buf = buffers.get(gameId);
    if (!buf)
        return;
    buf.events.push(event);
}
export async function finishReplay(gameId, opts) {
    const buf = buffers.get(gameId);
    if (!buf)
        return;
    buffers.delete(gameId);
    const { winner, endedAt, playerRoles } = opts;
    const playerCount = Object.keys(playerRoles).length;
    const durationMs = endedAt - buf.startedAt;
    const now = Date.now();
    try {
        await sql `
      INSERT INTO game_replays (id, room_name, player_count, duration_ms, started_at, ended_at, winner, events, player_roles, created_at)
      VALUES (
        ${gameId},
        ${buf.roomName},
        ${playerCount},
        ${durationMs},
        ${buf.startedAt},
        ${endedAt},
        ${winner},
        ${JSON.stringify(buf.events)},
        ${JSON.stringify(playerRoles)},
        ${now}
      )
      ON CONFLICT (id) DO NOTHING
    `;
    }
    catch (e) {
        console.error('[ReplayService] failed to save replay:', e);
    }
}
export async function listReplays(limit, offset) {
    const rows = await sql `
    SELECT id, room_name, player_count, duration_ms, started_at, ended_at, winner, created_at
    FROM game_replays
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
    return rows.map(r => ({
        id: r.id,
        roomName: r.room_name,
        playerCount: r.player_count,
        durationMs: r.duration_ms,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        winner: r.winner,
        createdAt: r.created_at,
    }));
}
export async function getReplay(replayId) {
    const rows = await sql `
    SELECT id, room_name, player_count, duration_ms, started_at, ended_at, winner, events, player_roles, created_at
    FROM game_replays
    WHERE id = ${replayId}
  `;
    if (rows.length === 0)
        return null;
    const r = rows[0];
    return {
        id: r.id,
        roomName: r.room_name,
        playerCount: r.player_count,
        durationMs: r.duration_ms,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        winner: r.winner,
        createdAt: r.created_at,
        events: typeof r.events === 'string' ? JSON.parse(r.events) : r.events,
        playerRoles: typeof r.player_roles === 'string' ? JSON.parse(r.player_roles) : r.player_roles,
    };
}
export async function getMyReplays(profileId) {
    // PostgreSQL JSONB key existence check: player_roles ? profileId
    const rows = await sql `
    SELECT id, room_name, player_count, duration_ms, started_at, ended_at, winner, created_at
    FROM game_replays
    WHERE player_roles ? ${profileId}
    ORDER BY created_at DESC
    LIMIT 50
  `;
    return rows.map(r => ({
        id: r.id,
        roomName: r.room_name,
        playerCount: r.player_count,
        durationMs: r.duration_ms,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        winner: r.winner,
        createdAt: r.created_at,
    }));
}
//# sourceMappingURL=replayService.js.map