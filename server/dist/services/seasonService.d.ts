export interface Season {
    id: string;
    number: number;
    name: string;
    startAt: number;
    endAt: number;
    status: 'active' | 'completed';
}
export interface SeasonLeaderboardEntry {
    rank: number;
    playerId: string;
    username: string;
    avatarUrl: string | null;
    elo: number;
    tier: string;
}
export interface SeasonResult {
    seasonId: string;
    seasonName: string;
    seasonNumber: number;
    finalRank: number;
    finalElo: number;
    finalTier: string;
    rewardTitle: string | null;
    rewardCoins: number;
}
export declare function getActiveSeason(): Promise<Season | null>;
export declare function getSeasonLeaderboard(seasonId: string, limit?: number): Promise<SeasonLeaderboardEntry[]>;
export declare function getMySeasonHistory(profileId: string): Promise<SeasonResult[]>;
export declare function processSeasonEnd(seasonId: string): Promise<void>;
//# sourceMappingURL=seasonService.d.ts.map