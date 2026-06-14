import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';
const WIN_THRESHOLD = 10;
const WAR_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
async function rowToWar(r) {
    return {
        id: r.id,
        challengerClanId: r.challenger_clan_id,
        challengerClanName: r.challenger_clan_name ?? '',
        defenderClanId: r.defender_clan_id,
        defenderClanName: r.defender_clan_name ?? '',
        status: r.status,
        challengerWins: Number(r.challenger_wins),
        defenderWins: Number(r.defender_wins),
        startedAt: r.started_at != null ? Number(r.started_at) : null,
        endsAt: r.ends_at != null ? Number(r.ends_at) : null,
        createdAt: Number(r.created_at),
        winnerClanId: r.winner_clan_id ?? null,
    };
}
async function getWarWithNames(warId) {
    const rows = await sql `
    SELECT w.*,
           c1.name AS challenger_clan_name,
           c2.name AS defender_clan_name
    FROM clan_wars w
    JOIN clans c1 ON c1.id = w.challenger_clan_id
    JOIN clans c2 ON c2.id = w.defender_clan_id
    WHERE w.id = ${warId}
    LIMIT 1
  `;
    if (!rows.length)
        return null;
    return rowToWar(rows[0]);
}
/** Create a pending war between two clans (challenger issues the challenge). */
export async function challengeClan(challengerClanId, defenderClanId) {
    if (challengerClanId === defenderClanId) {
        throw new Error('A clan cannot challenge itself.');
    }
    // Validate both clans exist
    const [challenger] = await sql `SELECT id FROM clans WHERE id = ${challengerClanId}`;
    if (!challenger)
        throw new Error('Your clan no longer exists.');
    const [defender] = await sql `SELECT id FROM clans WHERE id = ${defenderClanId}`;
    if (!defender)
        throw new Error('Defender clan not found.');
    // Check no active/pending war already exists between these clans
    const existing = await sql `
    SELECT id FROM clan_wars
    WHERE status IN ('pending', 'active')
      AND (
        (challenger_clan_id = ${challengerClanId} AND defender_clan_id = ${defenderClanId})
        OR
        (challenger_clan_id = ${defenderClanId} AND defender_clan_id = ${challengerClanId})
      )
    LIMIT 1
  `;
    if (existing.length)
        throw new Error('There is already an active or pending war between these clans.');
    const id = generateId();
    const now = Date.now();
    await sql `
    INSERT INTO clan_wars (id, challenger_clan_id, defender_clan_id, status, challenger_wins, defender_wins, created_at)
    VALUES (${id}, ${challengerClanId}, ${defenderClanId}, 'pending', 0, 0, ${now})
  `;
    return (await getWarWithNames(id));
}
/** Defender accepts the war → sets status to active and starts the timer. */
export async function acceptWar(warId, defenderClanId) {
    const [row] = await sql `SELECT * FROM clan_wars WHERE id = ${warId}`;
    if (!row)
        throw new Error('War not found.');
    if (row.defender_clan_id !== defenderClanId)
        throw new Error('Not authorised to accept this war.');
    if (row.status !== 'pending')
        throw new Error('War is no longer pending.');
    const now = Date.now();
    const endsAt = now + WAR_DURATION_MS;
    await sql `
    UPDATE clan_wars
    SET status = 'active', started_at = ${now}, ends_at = ${endsAt}
    WHERE id = ${warId}
  `;
    return (await getWarWithNames(warId));
}
/** Defender declines the war → sets status to cancelled. */
export async function declineWar(warId, defenderClanId) {
    const [row] = await sql `SELECT * FROM clan_wars WHERE id = ${warId}`;
    if (!row)
        throw new Error('War not found.');
    if (row.defender_clan_id !== defenderClanId)
        throw new Error('Not authorised to decline this war.');
    if (row.status !== 'pending')
        throw new Error('War is no longer pending.');
    await sql `UPDATE clan_wars SET status = 'cancelled' WHERE id = ${warId}`;
    return (await getWarWithNames(warId));
}
/**
 * Called after a game ends. If the winning clan is involved in an active war, record the win.
 * Returns the updated war (or null if not applicable).
 */
export async function recordWarGame(gameId, winnerClanId, loserClanId) {
    // Find active war between these two specific clans
    const rows = await sql `
    SELECT * FROM clan_wars
    WHERE status = 'active'
      AND (
        (challenger_clan_id = ${winnerClanId} AND defender_clan_id = ${loserClanId})
        OR
        (challenger_clan_id = ${loserClanId} AND defender_clan_id = ${winnerClanId})
      )
    LIMIT 1
  `;
    if (!rows.length)
        return null;
    const war = rows[0];
    const now = Date.now();
    // Check if war has expired
    if (war.ends_at && Number(war.ends_at) < now) {
        // Determine winner by scores
        const cWins = Number(war.challenger_wins);
        const dWins = Number(war.defender_wins);
        const winnerClan = cWins >= dWins ? war.challenger_clan_id : war.defender_clan_id;
        await sql `
      UPDATE clan_wars
      SET status = 'completed', winner_clan_id = ${winnerClan}
      WHERE id = ${war.id}
    `;
        return getWarWithNames(war.id);
    }
    // Record the game
    await sql `
    INSERT INTO clan_war_games (id, war_id, game_id, winning_clan_id, played_at)
    VALUES (${generateId()}, ${war.id}, ${gameId}, ${winnerClanId}, ${now})
  `;
    // Increment winner's count
    const isChallenger = war.challenger_clan_id === winnerClanId;
    if (isChallenger) {
        await sql `UPDATE clan_wars SET challenger_wins = challenger_wins + 1 WHERE id = ${war.id}`;
    }
    else {
        await sql `UPDATE clan_wars SET defender_wins = defender_wins + 1 WHERE id = ${war.id}`;
    }
    // Re-fetch to get updated counts
    const [updated] = await sql `SELECT * FROM clan_wars WHERE id = ${war.id}`;
    const newChallengerWins = Number(updated.challenger_wins);
    const newDefenderWins = Number(updated.defender_wins);
    // Check win threshold
    if (newChallengerWins >= WIN_THRESHOLD || newDefenderWins >= WIN_THRESHOLD) {
        const warWinner = newChallengerWins >= WIN_THRESHOLD ? updated.challenger_clan_id : updated.defender_clan_id;
        await sql `
      UPDATE clan_wars
      SET status = 'completed', winner_clan_id = ${warWinner}
      WHERE id = ${war.id}
    `;
    }
    return getWarWithNames(war.id);
}
/** Returns the current active or pending war for a clan (or null). */
export async function getActiveWar(clanId) {
    const rows = await sql `
    SELECT w.*,
           c1.name AS challenger_clan_name,
           c2.name AS defender_clan_name
    FROM clan_wars w
    JOIN clans c1 ON c1.id = w.challenger_clan_id
    JOIN clans c2 ON c2.id = w.defender_clan_id
    WHERE w.status IN ('pending', 'active')
      AND (w.challenger_clan_id = ${clanId} OR w.defender_clan_id = ${clanId})
    ORDER BY w.created_at DESC
    LIMIT 1
  `;
    if (!rows.length)
        return null;
    return rowToWar(rows[0]);
}
/** Returns last N completed wars for a clan. */
export async function getWarHistory(clanId, limit = 10) {
    const rows = await sql `
    SELECT w.*,
           c1.name AS challenger_clan_name,
           c2.name AS defender_clan_name
    FROM clan_wars w
    JOIN clans c1 ON c1.id = w.challenger_clan_id
    JOIN clans c2 ON c2.id = w.defender_clan_id
    WHERE w.status IN ('completed', 'cancelled')
      AND (w.challenger_clan_id = ${clanId} OR w.defender_clan_id = ${clanId})
    ORDER BY w.created_at DESC
    LIMIT ${limit}
  `;
    return Promise.all(rows.map(rowToWar));
}
//# sourceMappingURL=clanWarService.js.map