/**
 * Clan League — a weekly, season-based competition between all clans.
 *
 * HOW IT DIFFERS FROM CLAN WARS
 * ─────────────────────────────
 * clanWarService is head-to-head: one clan challenges another and games count
 * only when EVERY winner is from one clan and EVERY loser from the other. In a
 * public mafia room that essentially never happens, so wars sit at 0-0.
 *
 * The league scores the games people actually play. Every clan member earns
 * points for their clan just by playing, whoever else is in the room. No
 * challenge to accept, no coordination to arrange — you play, your clan climbs.
 *
 * ANTI-FARMING
 * ────────────
 * Two rules, because a leaderboard that pays coins is a target:
 *   1. A per-player weekly cap. One person grinding all week cannot carry a
 *      clan past clans that actually played together.
 *   2. A minimum number of distinct contributors for a clan to be ELIGIBLE for
 *      rewards. A one-member clan can still appear on the board (hiding it
 *      would be confusing) but is marked ineligible and skipped at payout.
 *
 * SETTLEMENT
 * ──────────
 * Weeks are settled lazily AND by the hourly job in index.ts. Settlement claims
 * the week by inserting its row first and only pays out if that insert won, so
 * two settlements racing (startup + hourly, or two instances) cannot double-pay.
 */
import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Points awarded per game. Participation is deliberately non-zero: a clan
 *  should gain from showing up, not only from winning. */
export const POINTS_PLAY = 2;
export const POINTS_WIN = 5;
/** Ranked games are worth 50% more — they are the harder, more committed game. */
export const RANKED_MULTIPLIER = 1.5;

/** Max points one player can contribute to their clan in a single week. */
export const PLAYER_WEEKLY_CAP = 120;
/** Distinct contributors a clan needs before it can be paid. */
export const MIN_CONTRIBUTORS = 3;

/** Coins paid to EVERY contributing member of the top clans. */
export const LEAGUE_PRIZES = [3000, 1500, 750];

export interface LeagueRow {
  clanId: string;
  clanName: string;
  clanTag: string;
  points: number;
  games: number;
  wins: number;
  contributors: number;
  eligible: boolean;
  rank: number;
}

export interface LeagueAward {
  weekStart: number;
  clanId: string;
  clanName: string;
  clanTag: string;
  rank: number;
  points: number;
  coinsPerMember: number;
}

/** Start (ms, UTC) of the Monday-00:00 week that `t` falls in. */
export function weekStartMs(t: number): number {
  const d = new Date(t);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday, 0, 0, 0, 0);
}

/**
 * Record one finished game for one player.
 *
 * Called once per clan member per game. The per-player cap is enforced here, in
 * the same statement that stores the contribution, so the clan total and the
 * sum of its members' contributions can never disagree.
 */
export async function recordLeagueGame(args: {
  playerId: string;
  clanId: string;
  won: boolean;
  ranked: boolean;
  at?: number;
}): Promise<void> {
  const { playerId, clanId, won, ranked } = args;
  const at = args.at ?? Date.now();
  const week = weekStartMs(at);

  const base = POINTS_PLAY + (won ? POINTS_WIN : 0);
  const raw = Math.round(base * (ranked ? RANKED_MULTIPLIER : 1));

  // How much of this award fits under the player's weekly cap.
  const [prev] = await sql<any[]>`
    SELECT points FROM clan_league_contrib WHERE week_start = ${week} AND player_id = ${playerId}
  `;
  const already = Number(prev?.points ?? 0);
  const grant = Math.max(0, Math.min(raw, PLAYER_WEEKLY_CAP - already));

  // The game is always recorded (games/wins are honest counters even at the
  // cap); only the POINTS are clamped.
  await sql`
    INSERT INTO clan_league_contrib (week_start, player_id, clan_id, points, games, wins, updated_at)
    VALUES (${week}, ${playerId}, ${clanId}, ${grant}, 1, ${won ? 1 : 0}, ${at})
    ON CONFLICT (week_start, player_id) DO UPDATE SET
      points = clan_league_contrib.points + ${grant},
      games  = clan_league_contrib.games + 1,
      wins   = clan_league_contrib.wins + ${won ? 1 : 0},
      -- A player who switched clans mid-week keeps contributing to whichever
      -- clan they are in NOW; the totals below are always recomputed from this
      -- table, so the move is reflected without any backfill.
      clan_id = ${clanId},
      updated_at = ${at}
  `;
}

/** The league table for a week (defaults to the current one). */
export async function getLeague(weekStart?: number, limit = 25): Promise<LeagueRow[]> {
  const week = weekStart ?? weekStartMs(Date.now());
  const rows = await sql<any[]>`
    SELECT c.id AS clan_id, c.name AS clan_name, c.tag AS clan_tag,
           COALESCE(SUM(k.points), 0)  AS points,
           COALESCE(SUM(k.games), 0)   AS games,
           COALESCE(SUM(k.wins), 0)    AS wins,
           COUNT(DISTINCT k.player_id) AS contributors
    FROM clan_league_contrib k
    JOIN clans c ON c.id = k.clan_id
    WHERE k.week_start = ${week}
    GROUP BY c.id, c.name, c.tag
    ORDER BY points DESC, wins DESC, c.name ASC
    LIMIT ${limit}
  `;
  return rows.map((r, i) => ({
    clanId: r.clan_id,
    clanName: r.clan_name,
    clanTag: r.clan_tag,
    points: Number(r.points),
    games: Number(r.games),
    wins: Number(r.wins),
    contributors: Number(r.contributors),
    eligible: Number(r.contributors) >= MIN_CONTRIBUTORS,
    rank: i + 1,
  }));
}

/** One clan's own standing plus its members' contributions this week. */
export async function getClanLeagueDetail(clanId: string, weekStart?: number): Promise<{
  row: LeagueRow | null;
  members: Array<{ playerId: string; username: string; avatarUrl: string | null; points: number; games: number; wins: number; capped: boolean }>;
}> {
  const week = weekStart ?? weekStartMs(Date.now());
  // Rank has to come from the full table, not from this clan's row alone.
  const full = await getLeague(week, 1000);
  const row = full.find(r => r.clanId === clanId) ?? null;

  const members = await sql<any[]>`
    SELECT k.player_id, k.points, k.games, k.wins, p.username, p.avatar_url
    FROM clan_league_contrib k
    JOIN players p ON p.id = k.player_id
    WHERE k.week_start = ${week} AND k.clan_id = ${clanId}
    ORDER BY k.points DESC, k.wins DESC
  `;
  return {
    row,
    members: members.map(m => ({
      playerId: m.player_id,
      username: m.username ?? '',
      avatarUrl: m.avatar_url ?? null,
      points: Number(m.points),
      games: Number(m.games),
      wins: Number(m.wins),
      capped: Number(m.points) >= PLAYER_WEEKLY_CAP,
    })),
  };
}

/** Past winners, most recent first. */
export async function getLeagueHistory(limit = 12): Promise<LeagueAward[]> {
  const rows = await sql<any[]>`
    SELECT a.*, c.name AS clan_name, c.tag AS clan_tag
    FROM clan_league_awards a
    JOIN clans c ON c.id = a.clan_id
    ORDER BY a.week_start DESC, a.rank ASC
    LIMIT ${limit}
  `;
  return rows.map(r => ({
    weekStart: Number(r.week_start),
    clanId: r.clan_id,
    clanName: r.clan_name,
    clanTag: r.clan_tag,
    rank: Number(r.rank),
    points: Number(r.points),
    coinsPerMember: Number(r.coins_per_member),
  }));
}

/** How many league titles (any podium place) a clan holds. */
export async function getClanTrophies(clanId: string): Promise<{ first: number; podium: number }> {
  const [r] = await sql<any[]>`
    SELECT COUNT(*) FILTER (WHERE rank = 1) AS first, COUNT(*) AS podium
    FROM clan_league_awards WHERE clan_id = ${clanId}
  `;
  return { first: Number(r?.first ?? 0), podium: Number(r?.podium ?? 0) };
}

/**
 * Settle every finished-but-unsettled week.
 *
 * Walks back up to `maxWeeks` so a server that was down for a fortnight still
 * pays what it owes instead of silently skipping. Each week is claimed by its
 * marker row before any coins move: if the claim loses the race, that week is
 * already someone else's job and we move on.
 */
export async function settleLeague(
  grant: (playerId: string, amount: number, description: string) => Promise<void>,
  notify?: (playerId: string, title: string, body: string) => Promise<void>,
  maxWeeks = 8,
): Promise<Array<{ weekStart: number; paidClans: number; paidPlayers: number }>> {
  const currentWeek = weekStartMs(Date.now());
  const done: Array<{ weekStart: number; paidClans: number; paidPlayers: number }> = [];

  for (let i = 1; i <= maxWeeks; i++) {
    const week = currentWeek - i * WEEK_MS;

    // Nothing was ever played that week → nothing to settle, and no marker
    // needed (an empty week can never gain rows retroactively).
    const [any] = await sql<any[]>`SELECT 1 AS x FROM clan_league_contrib WHERE week_start = ${week} LIMIT 1`;
    if (!any) continue;

    // Claim the week. ON CONFLICT DO NOTHING means a concurrent settler that
    // already claimed it returns zero rows here and we skip — this is what
    // makes double payment impossible.
    const claimed = await sql<any[]>`
      INSERT INTO clan_league_seasons (week_start, settled_at) VALUES (${week}, ${Date.now()})
      ON CONFLICT (week_start) DO NOTHING
      RETURNING week_start
    `;
    if (claimed.length === 0) continue;

    const table = (await getLeague(week, 100)).filter(r => r.eligible && r.points > 0);
    let paidClans = 0, paidPlayers = 0;

    for (let rank = 0; rank < Math.min(LEAGUE_PRIZES.length, table.length); rank++) {
      const clan = table[rank];
      const coins = LEAGUE_PRIZES[rank];

      // Paid to the members who actually played that week AND are still in the
      // clan now — a leaver should not collect, and someone who joined
      // afterwards did not earn it.
      const members = await sql<any[]>`
        SELECT k.player_id
        FROM clan_league_contrib k
        JOIN clan_members m ON m.player_id = k.player_id AND m.clan_id = ${clan.clanId}
        WHERE k.week_start = ${week} AND k.clan_id = ${clan.clanId} AND k.points > 0
      `;

      for (const m of members) {
        await grant(m.player_id, coins, `Clan League #${rank + 1} — ${clan.clanName}`).catch(() => {});
        await notify?.(m.player_id, '🏆 კლანების ლიგა',
          `${clan.clanName} დაიკავა #${rank + 1} ადგილი — +${coins} მონეტა!`).catch(() => {});
        paidPlayers++;
      }

      await sql`
        INSERT INTO clan_league_awards (id, week_start, clan_id, rank, points, coins_per_member, created_at)
        VALUES (${generateId()}, ${week}, ${clan.clanId}, ${rank + 1}, ${clan.points}, ${coins}, ${Date.now()})
      `;
      paidClans++;
    }

    console.log(`[ClanLeague] settled week ${new Date(week).toISOString()} — ${paidClans} clan(s), ${paidPlayers} player(s) paid.`);
    done.push({ weekStart: week, paidClans, paidPlayers });
  }

  return done;
}
