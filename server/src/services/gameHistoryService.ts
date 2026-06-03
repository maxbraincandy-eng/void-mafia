import { sql } from '../db.js';
import { Room } from '../types/index.js';
import { generateId } from '../utils/helpers.js';

export async function recordGame(room: Room): Promise<string> {
  const id = generateId();
  const now = Date.now();
  const players = [...room.players.values()].filter(p => !p.isSpectator);

  await sql`
    INSERT INTO game_history (id, room_code, started_at, ended_at, winner, day_reached, player_count)
    VALUES (${id}, ${room.code}, ${room.createdAt}, ${now}, ${room.winner ?? null}, ${room.day}, ${players.length})
  `;

  for (const p of players) {
    if (!p.profileId) continue;
    await sql`
      INSERT INTO game_players (game_id, player_id, role, team, survived, won)
      VALUES (${id}, ${p.profileId}, ${p.role ?? null}, ${p.team ?? null},
              ${p.isAlive ? 1 : 0}, ${p.team === room.winner ? 1 : 0})
      ON CONFLICT DO NOTHING
    `;
  }

  return id;
}

export interface GameHistoryEntry {
  id: string; roomCode: string; startedAt: number; endedAt: number;
  winner: string | null; dayReached: number; playerCount: number;
  myRole: string | null; myTeam: string | null; won: boolean;
}

export async function getPlayerHistory(playerId: string, limit = 20): Promise<GameHistoryEntry[]> {
  const rows = await sql`
    SELECT gh.*, gp.role as my_role, gp.team as my_team, gp.won as i_won
    FROM game_history gh
    JOIN game_players gp ON gp.game_id = gh.id
    WHERE gp.player_id = ${playerId}
    ORDER BY gh.ended_at DESC
    LIMIT ${limit}
  ` as any[];

  return rows.map((r: any) => ({
    id: r.id, roomCode: r.room_code,
    startedAt: Number(r.started_at), endedAt: Number(r.ended_at),
    winner: r.winner ?? null, dayReached: Number(r.day_reached), playerCount: Number(r.player_count),
    myRole: r.my_role ?? null, myTeam: r.my_team ?? null, won: r.i_won === 1,
  }));
}
