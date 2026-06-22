import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';
export async function getPlayerRoleStats(playerId) {
    const [totals] = await sql `
    SELECT COUNT(*) as total_games,
           COALESCE(SUM(gp.survived), 0) as total_survived,
           MIN(gh.ended_at) as first_game,
           MAX(gh.ended_at) as last_game
    FROM game_players gp
    JOIN game_history gh ON gh.id = gp.game_id
    WHERE gp.player_id = ${playerId}
  `;
    const teamRows = await sql `
    SELECT team, COUNT(*) as games,
           COALESCE(SUM(won), 0) as wins,
           COALESCE(SUM(survived), 0) as survived
    FROM game_players
    WHERE player_id = ${playerId} AND team IS NOT NULL
    GROUP BY team
    ORDER BY COUNT(*) DESC
  `;
    const roleRows = await sql `
    SELECT role, COUNT(*) as games,
           COALESCE(SUM(won), 0) as wins,
           COALESCE(SUM(survived), 0) as survived
    FROM game_players
    WHERE player_id = ${playerId} AND role IS NOT NULL
    GROUP BY role
    ORDER BY COUNT(*) DESC
  `;
    return {
        byTeam: teamRows.map((r) => ({
            team: r.team,
            games: Number(r.games),
            wins: Number(r.wins),
            survived: Number(r.survived),
        })),
        byRole: roleRows.map((r) => ({
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
export async function recordGame(room) {
    const id = generateId();
    const now = Date.now();
    const players = [...room.players.values()].filter(p => !p.isSpectator);
    await sql `
    INSERT INTO game_history (id, room_code, started_at, ended_at, winner, day_reached, player_count)
    VALUES (${id}, ${room.code}, ${room.createdAt}, ${now}, ${room.winner ?? null}, ${room.day}, ${players.length})
  `;
    for (const p of players) {
        if (!p.profileId)
            continue;
        await sql `
      INSERT INTO game_players (game_id, player_id, role, team, survived, won)
      VALUES (${id}, ${p.profileId}, ${p.role ?? null}, ${p.team ?? null},
              ${p.isAlive ? 1 : 0}, ${p.team === room.winner ? 1 : 0})
      ON CONFLICT DO NOTHING
    `;
    }
    return id;
}
export async function getPlayersLastRolesInRoom(profileIds, roomCode) {
    if (!profileIds.length || !roomCode)
        return {};
    const rows = await sql `
    SELECT DISTINCT ON (gp.player_id)
      gp.player_id, gp.role, gp.team, gp.won
    FROM game_players gp
    JOIN game_history gh ON gh.id = gp.game_id
    WHERE gp.player_id = ANY(${profileIds})
      AND gh.room_code = ${roomCode}
    ORDER BY gp.player_id, gh.ended_at DESC
  `;
    const result = {};
    for (const r of rows) {
        result[r.player_id] = { role: r.role ?? '', team: r.team ?? '', won: r.won === 1 };
    }
    return result;
}
export async function getPlayerHistory(playerId, limit = 20) {
    const rows = await sql `
    SELECT gh.*, gp.role as my_role, gp.team as my_team, gp.won as i_won
    FROM game_history gh
    JOIN game_players gp ON gp.game_id = gh.id
    WHERE gp.player_id = ${playerId}
    ORDER BY gh.ended_at DESC
    LIMIT ${limit}
  `;
    return rows.map((r) => ({
        id: r.id, roomCode: r.room_code,
        startedAt: Number(r.started_at), endedAt: Number(r.ended_at),
        winner: r.winner ?? null, dayReached: Number(r.day_reached), playerCount: Number(r.player_count),
        myRole: r.my_role ?? null, myTeam: r.my_team ?? null, won: r.i_won === 1,
    }));
}
//# sourceMappingURL=gameHistoryService.js.map