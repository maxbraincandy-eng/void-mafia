import { sql } from '../db.js';
import { Room } from '../types/index.js';
import { generateId } from '../utils/helpers.js';

export interface PlayerRoleStats {
  byTeam: { team: string; games: number; wins: number; survived: number }[];
  byRole: { role: string; games: number; wins: number; survived: number }[];
  totalGames: number;
  totalSurvived: number;
  firstGameAt: number | null;
  lastGameAt: number | null;
}

export async function getPlayerRoleStats(playerId: string): Promise<PlayerRoleStats> {
  const [totals] = await sql`
    SELECT COUNT(*) as total_games,
           COALESCE(SUM(gp.survived), 0) as total_survived,
           MIN(gh.ended_at) as first_game,
           MAX(gh.ended_at) as last_game
    FROM game_players gp
    JOIN game_history gh ON gh.id = gp.game_id
    WHERE gp.player_id = ${playerId}
  ` as any[];

  const teamRows = await sql`
    SELECT team, COUNT(*) as games,
           COALESCE(SUM(won), 0) as wins,
           COALESCE(SUM(survived), 0) as survived
    FROM game_players
    WHERE player_id = ${playerId} AND team IS NOT NULL
    GROUP BY team
    ORDER BY COUNT(*) DESC
  ` as any[];

  const roleRows = await sql`
    SELECT role, COUNT(*) as games,
           COALESCE(SUM(won), 0) as wins,
           COALESCE(SUM(survived), 0) as survived
    FROM game_players
    WHERE player_id = ${playerId} AND role IS NOT NULL
    GROUP BY role
    ORDER BY COUNT(*) DESC
  ` as any[];

  return {
    byTeam: teamRows.map((r: any) => ({
      team: r.team,
      games: Number(r.games),
      wins: Number(r.wins),
      survived: Number(r.survived),
    })),
    byRole: roleRows.map((r: any) => ({
      role: r.role,
      games: Number(r.games),
      wins: Number(r.wins),
      survived: Number(r.survived),
    })),
    totalGames: Number(totals?.total_games ?? 0),
    totalSurvived: Number(totals?.total_survived ?? 0),
    firstGameAt: totals?.first_game ? Number(totals.first_game) : null,
    lastGameAt: totals?.last_game ? Number(totals.last_game) : null,
  };
}

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

export async function getPlayersLastRoles(
  profileIds: string[],
  limit = 3,
): Promise<Record<string, Array<{ role: string; team: string; won: boolean }>>> {
  if (!profileIds.length) return {};
  const rows = await sql`
    SELECT player_id, role, team, won FROM (
      SELECT gp.player_id, gp.role, gp.team, gp.won,
             ROW_NUMBER() OVER (PARTITION BY gp.player_id ORDER BY gh.ended_at DESC) as rn
      FROM game_players gp
      JOIN game_history gh ON gh.id = gp.game_id
      WHERE gp.player_id = ANY(${profileIds})
    ) ranked
    WHERE rn <= ${limit}
    ORDER BY player_id, rn
  ` as any[];
  const result: Record<string, Array<{ role: string; team: string; won: boolean }>> = {};
  for (const r of rows) {
    if (!result[r.player_id]) result[r.player_id] = [];
    result[r.player_id]!.push({ role: r.role ?? '', team: r.team ?? '', won: r.won === 1 });
  }
  return result;
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
