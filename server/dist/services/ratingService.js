import { sql } from '../db.js';
import { randomUUID } from 'crypto';
export function getRankTier(elo, isPlaced) {
    if (!isPlaced)
        return 'unranked';
    if (elo < 1000)
        return 'bronze';
    if (elo < 1200)
        return 'silver';
    if (elo < 1400)
        return 'gold';
    if (elo < 1600)
        return 'platinum';
    if (elo < 1800)
        return 'diamond';
    return 'master';
}
export const RANK_COLORS = {
    unranked: '#6b7280',
    bronze: '#cd7f32',
    silver: '#c0c0c0',
    gold: '#ffd700',
    platinum: '#e5e4e2',
    diamond: '#00f5ff',
    master: '#9b00ff',
};
export const RANK_ICONS = {
    unranked: '◇',
    bronze: '🥉',
    silver: '🥈',
    gold: '🥇',
    platinum: '💿',
    diamond: '💎',
    master: '👑',
};
export async function getOrCreateRating(playerId) {
    const [row] = await sql `
    INSERT INTO player_ratings (player_id, elo, peak_elo, ranked_wins, ranked_losses, placement_games, is_placed, season, updated_at)
    VALUES (${playerId}, 1000, 1000, 0, 0, 0, false, 1, ${Date.now()})
    ON CONFLICT (player_id) DO UPDATE SET player_id = EXCLUDED.player_id
    RETURNING *
  `;
    return rowToRating(row);
}
function rowToRating(row) {
    return {
        playerId: row.player_id,
        elo: row.elo,
        peakElo: row.peak_elo,
        rankedWins: row.ranked_wins,
        rankedLosses: row.ranked_losses,
        placementGames: row.placement_games,
        isPlaced: row.is_placed,
        season: row.season,
    };
}
function expectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}
export async function updateRatingsAfterGame(winners, losers, roomId, winnerTeam, roleMap) {
    const allPlayerIds = [...winners, ...losers];
    const ratings = new Map();
    await Promise.all(allPlayerIds.map(async (id) => {
        ratings.set(id, await getOrCreateRating(id));
    }));
    const PLACEMENT_GAMES = 5;
    const K_PLACEMENT = 64;
    const K_NORMAL = 32;
    const K_HIGH_ELO = 20; // for elo >= 1800
    const results = new Map();
    // Calculate average ELO of each side
    const avgWinnerElo = winners.length > 0
        ? winners.reduce((s, id) => s + (ratings.get(id)?.elo ?? 1000), 0) / winners.length
        : 1000;
    const avgLoserElo = losers.length > 0
        ? losers.reduce((s, id) => s + (ratings.get(id)?.elo ?? 1000), 0) / losers.length
        : 1000;
    const processPlayer = async (playerId, won) => {
        const rating = ratings.get(playerId);
        const before = rating.elo;
        const opponentAvgElo = won ? avgLoserElo : avgWinnerElo;
        const expected = expectedScore(before, opponentAvgElo);
        const actual = won ? 1 : 0;
        let K = K_NORMAL;
        if (!rating.isPlaced)
            K = K_PLACEMENT;
        else if (before >= 1800)
            K = K_HIGH_ELO;
        const change = Math.round(K * (actual - expected));
        const after = Math.max(100, before + change);
        const newPeakElo = Math.max(rating.peakElo, after);
        const newPlacementGames = rating.isPlaced ? rating.placementGames : rating.placementGames + 1;
        const nowPlaced = rating.isPlaced || newPlacementGames >= PLACEMENT_GAMES;
        await sql `
      UPDATE player_ratings SET
        elo = ${after},
        peak_elo = ${newPeakElo},
        ranked_wins = ranked_wins + ${won ? 1 : 0},
        ranked_losses = ranked_losses + ${won ? 0 : 1},
        placement_games = ${newPlacementGames},
        is_placed = ${nowPlaced},
        updated_at = ${Date.now()}
      WHERE player_id = ${playerId}
    `;
        const role = roleMap[playerId] ?? 'unknown';
        await sql `
      INSERT INTO ranked_game_results (id, player_id, room_id, elo_before, elo_after, elo_change, won, team, role, season, created_at)
      VALUES (${randomUUID()}, ${playerId}, ${roomId}, ${before}, ${after}, ${change}, ${won}, ${winnerTeam}, ${role}, 1, ${Date.now()})
    `;
        results.set(playerId, { before, after, change });
    };
    await Promise.all([
        ...winners.map(id => processPlayer(id, true)),
        ...losers.map(id => processPlayer(id, false)),
    ]);
    return results;
}
export async function getRankedLeaderboard(limit = 50) {
    const rows = await sql `
    SELECT pr.player_id, pr.elo, pr.peak_elo, pr.ranked_wins, pr.ranked_losses, pr.is_placed,
           p.username, p.avatar, p.avatar_url, p.public_id
    FROM player_ratings pr
    JOIN players p ON p.id = pr.player_id
    WHERE pr.is_placed = true
    ORDER BY pr.elo DESC
    LIMIT ${limit}
  `;
    return rows.map(r => ({
        playerId: r.player_id,
        username: r.username,
        avatar: r.avatar,
        avatarUrl: r.avatar_url,
        publicId: r.public_id,
        elo: r.elo,
        peakElo: r.peak_elo,
        rankedWins: r.ranked_wins,
        rankedLosses: r.ranked_losses,
        isPlaced: r.is_placed,
        tier: getRankTier(r.elo, r.is_placed),
    }));
}
export async function getPlayerRating(playerId) {
    const [row] = await sql `SELECT * FROM player_ratings WHERE player_id = ${playerId}`;
    if (!row)
        return null;
    const r = rowToRating(row);
    return { ...r, tier: getRankTier(r.elo, r.isPlaced) };
}
//# sourceMappingURL=ratingService.js.map