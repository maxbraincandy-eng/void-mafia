import { db } from '../db.js';
import { generateId } from '../utils/helpers.js';
export function recordGame(room) {
    const id = generateId();
    const now = Date.now();
    const players = [...room.players.values()].filter(p => !p.isSpectator);
    db.prepare(`
    INSERT INTO game_history (id, room_code, started_at, ended_at, winner, day_reached, player_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, room.code, room.createdAt, now, room.winner ?? null, room.day, players.length);
    const insertPlayer = db.prepare(`
    INSERT OR IGNORE INTO game_players (game_id, player_id, role, team, survived, won)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
    for (const p of players) {
        if (!p.profileId)
            continue;
        insertPlayer.run(id, p.profileId, p.role ?? null, p.team ?? null, p.isAlive ? 1 : 0, (p.team === room.winner ? 1 : 0));
    }
    return id;
}
export function getPlayerHistory(playerId, limit = 20) {
    const rows = db.prepare(`
    SELECT gh.*, gp.role as my_role, gp.team as my_team, gp.won as i_won
    FROM game_history gh
    JOIN game_players gp ON gp.game_id = gh.id
    WHERE gp.player_id = ?
    ORDER BY gh.ended_at DESC
    LIMIT ?
  `).all(playerId, limit);
    return rows.map(r => ({
        id: r.id, roomCode: r.room_code,
        startedAt: r.started_at, endedAt: r.ended_at,
        winner: r.winner ?? null, dayReached: r.day_reached, playerCount: r.player_count,
        myRole: r.my_role ?? null, myTeam: r.my_team ?? null, won: r.i_won === 1,
    }));
}
//# sourceMappingURL=gameHistoryService.js.map