import { sql } from '../db.js';
import { randomUUID } from 'crypto';
import { getRankTier } from './ratingService.js';
function rowToSeason(row) {
    return {
        id: row.id,
        number: row.number,
        name: row.name,
        startAt: row.start_at,
        endAt: row.end_at,
        status: row.status,
    };
}
export async function getActiveSeason() {
    const rows = await sql `
    SELECT * FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1
  `;
    if (!rows.length)
        return null;
    return rowToSeason(rows[0]);
}
export async function getSeasonLeaderboard(seasonId, limit = 50) {
    const rows = await sql `
    SELECT pr.player_id, pr.elo, pr.is_placed,
           p.username, p.avatar_url
    FROM player_ratings pr
    JOIN players p ON p.id = pr.player_id
    WHERE pr.is_placed = true
    ORDER BY pr.elo DESC
    LIMIT ${limit}
  `;
    return rows.map((r, i) => ({
        rank: i + 1,
        playerId: r.player_id,
        username: r.username,
        avatarUrl: r.avatar_url,
        elo: r.elo,
        tier: getRankTier(r.elo, r.is_placed),
    }));
}
export async function getMySeasonHistory(profileId) {
    const rows = await sql `
    SELECT sr.season_id, sr.final_rank, sr.final_elo, sr.final_tier,
           sr.reward_title, sr.reward_coins,
           s.name AS season_name, s.number AS season_number
    FROM season_results sr
    JOIN seasons s ON s.id = sr.season_id
    WHERE sr.player_id = ${profileId}
    ORDER BY s.number DESC
  `;
    return rows.map(r => ({
        seasonId: r.season_id,
        seasonName: r.season_name,
        seasonNumber: r.season_number,
        finalRank: r.final_rank,
        finalElo: r.final_elo,
        finalTier: r.final_tier,
        rewardTitle: r.reward_title,
        rewardCoins: r.reward_coins,
    }));
}
const SEASON_THEMES = [
    'Void Rising',
    'Dark Protocols',
    'Neon Shadows',
    'Crimson Pact',
    'Silent Storm',
    'Eclipse Order',
    'Phantom Code',
    'Iron Veil',
];
export async function processSeasonEnd(seasonId) {
    // 1. Get top players ordered by elo desc
    const players = await sql `
    SELECT pr.player_id, pr.elo, pr.is_placed
    FROM player_ratings pr
    WHERE pr.is_placed = true
    ORDER BY pr.elo DESC
    LIMIT 50
  `;
    const now = Date.now();
    // 2. Determine reward tiers and insert season_results
    for (let i = 0; i < players.length; i++) {
        const p = players[i];
        const rank = i + 1;
        const elo = p.elo;
        const tier = getRankTier(elo, true);
        let rewardTitle = null;
        let rewardCoins = 0;
        if (rank === 1) {
            rewardTitle = 'Void Champion';
            rewardCoins = 5000;
        }
        else if (rank <= 3) {
            rewardTitle = 'Shadow Elite';
            rewardCoins = 2000;
        }
        else if (rank <= 10) {
            rewardTitle = 'Ranked Veteran';
            rewardCoins = 1000;
        }
        else {
            rewardCoins = 500;
        }
        await sql `
      INSERT INTO season_results (id, season_id, player_id, final_rank, final_elo, final_tier, reward_title, reward_coins, created_at)
      VALUES (
        ${randomUUID()},
        ${seasonId},
        ${p.player_id},
        ${rank},
        ${elo},
        ${tier},
        ${rewardTitle},
        ${rewardCoins},
        ${now}
      )
      ON CONFLICT (season_id, player_id) DO NOTHING
    `;
    }
    // 4. Soft-reset ELOs: move 25% closer to 1000
    await sql `
    UPDATE player_ratings
    SET elo = elo - FLOOR((elo - 1000) * 0.25)
  `;
    // 5. Mark season as completed
    await sql `
    UPDATE seasons SET status = 'completed' WHERE id = ${seasonId}
  `;
    // 6. Create next season
    const [currentSeason] = await sql `SELECT number FROM seasons WHERE id = ${seasonId}`;
    const nextNumber = (currentSeason?.number ?? 1) + 1;
    const themeIdx = (nextNumber - 1) % SEASON_THEMES.length;
    const nextName = `Season ${nextNumber}: ${SEASON_THEMES[themeIdx]}`;
    await sql `
    INSERT INTO seasons (id, number, name, start_at, end_at, status, created_at)
    VALUES (
      ${`season_${nextNumber}`},
      ${nextNumber},
      ${nextName},
      ${now},
      ${now + 90 * 24 * 60 * 60 * 1000},
      'active',
      ${now}
    )
    ON CONFLICT (number) DO NOTHING
  `;
}
//# sourceMappingURL=seasonService.js.map