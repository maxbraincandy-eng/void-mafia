import { sql } from '../db.js';
export async function getPlayerAchievements(playerId) {
    const rows = await sql `
    SELECT a.key, a.name, a.description, a.icon, a.rarity, pa.earned_at
    FROM player_achievements pa
    JOIN achievements a ON a.key = pa.achievement_key
    WHERE pa.player_id = ${playerId}
    ORDER BY pa.earned_at DESC
  `;
    return rows.map((r) => ({
        key: r.key, name: r.name, description: r.description,
        icon: r.icon, rarity: r.rarity, earnedAt: Number(r.earned_at),
    }));
}
async function award(playerId, key) {
    const [existing] = await sql `
    SELECT 1 FROM player_achievements WHERE player_id = ${playerId} AND achievement_key = ${key}
  `;
    if (existing)
        return false;
    await sql `
    INSERT INTO player_achievements (player_id, achievement_key, earned_at)
    VALUES (${playerId}, ${key}, ${Date.now()})
    ON CONFLICT DO NOTHING
  `;
    return true;
}
export async function checkAchievements(room, playerId) {
    const player = room.players.get(playerId);
    if (!player || !player.profileId)
        return [];
    const profileId = player.profileId;
    const newAchievements = [];
    const win = player.team === room.winner;
    const role = player.role;
    if (win && await award(profileId, 'first_blood'))
        newAchievements.push('first_blood');
    if (win && role === 'don' && await award(profileId, 'godfather'))
        newAchievements.push('godfather');
    if (win && role === 'jester' && await award(profileId, 'ghost'))
        newAchievements.push('ghost');
    if (win && role === 'maniac' && await award(profileId, 'serial_killer'))
        newAchievements.push('serial_killer');
    if (win && role === 'arsonist' && await award(profileId, 'arsonist_win'))
        newAchievements.push('arsonist_win');
    if (role === 'bodyguard' && !player.isAlive && await award(profileId, 'loyal_guard'))
        newAchievements.push('loyal_guard');
    if (player.isAlive && win && await award(profileId, 'survivor'))
        newAchievements.push('survivor');
    const [row] = await sql `SELECT games_played FROM players WHERE id = ${profileId}`;
    const gamesPlayed = Number(row?.games_played ?? 0) + 1;
    if (gamesPlayed >= 10 && await award(profileId, 'night_owl'))
        newAchievements.push('night_owl');
    if (gamesPlayed >= 50) {
        const [winsRow] = await sql `SELECT wins FROM players WHERE id = ${profileId}`;
        const totalWins = Number(winsRow?.wins ?? 0) + (win ? 1 : 0);
        if (totalWins >= 50 && await award(profileId, 'legend'))
            newAchievements.push('legend');
    }
    return newAchievements;
}
//# sourceMappingURL=achievementService.js.map