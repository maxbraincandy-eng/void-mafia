export declare const WEEK_MS: number;
/** Points awarded per game. Participation is deliberately non-zero: a clan
 *  should gain from showing up, not only from winning. */
export declare const POINTS_PLAY = 2;
export declare const POINTS_WIN = 5;
/** Ranked games are worth 50% more — they are the harder, more committed game. */
export declare const RANKED_MULTIPLIER = 1.5;
/** Max points one player can contribute to their clan in a single week. */
export declare const PLAYER_WEEKLY_CAP = 120;
/** Distinct contributors a clan needs before it can be paid. */
export declare const MIN_CONTRIBUTORS = 3;
/** Coins paid to EVERY contributing member of the top clans. */
export declare const LEAGUE_PRIZES: number[];
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
export declare function weekStartMs(t: number): number;
/**
 * Record one finished game for one player.
 *
 * Called once per clan member per game. The per-player cap is enforced here, in
 * the same statement that stores the contribution, so the clan total and the
 * sum of its members' contributions can never disagree.
 */
export declare function recordLeagueGame(args: {
    playerId: string;
    clanId: string;
    won: boolean;
    ranked: boolean;
    at?: number;
}): Promise<void>;
/** The league table for a week (defaults to the current one). */
export declare function getLeague(weekStart?: number, limit?: number): Promise<LeagueRow[]>;
/** One clan's own standing plus its members' contributions this week. */
export declare function getClanLeagueDetail(clanId: string, weekStart?: number): Promise<{
    row: LeagueRow | null;
    members: Array<{
        playerId: string;
        username: string;
        avatarUrl: string | null;
        points: number;
        games: number;
        wins: number;
        capped: boolean;
    }>;
}>;
/** Past winners, most recent first. */
export declare function getLeagueHistory(limit?: number): Promise<LeagueAward[]>;
/** How many league titles (any podium place) a clan holds. */
export declare function getClanTrophies(clanId: string): Promise<{
    first: number;
    podium: number;
}>;
/**
 * Settle every finished-but-unsettled week.
 *
 * Walks back up to `maxWeeks` so a server that was down for a fortnight still
 * pays what it owes instead of silently skipping. Each week is claimed by its
 * marker row before any coins move: if the claim loses the race, that week is
 * already someone else's job and we move on.
 */
export declare function settleLeague(grant: (playerId: string, amount: number, description: string) => Promise<void>, notify?: (playerId: string, title: string, body: string) => Promise<void>, maxWeeks?: number): Promise<Array<{
    weekStart: number;
    paidClans: number;
    paidPlayers: number;
}>>;
//# sourceMappingURL=clanLeagueService.d.ts.map