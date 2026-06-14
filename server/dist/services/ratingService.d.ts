export interface PlayerRating {
    playerId: string;
    elo: number;
    peakElo: number;
    rankedWins: number;
    rankedLosses: number;
    placementGames: number;
    isPlaced: boolean;
    season: number;
}
export type RankTier = 'unranked' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master';
export declare function getRankTier(elo: number, isPlaced: boolean): RankTier;
export declare const RANK_COLORS: Record<RankTier, string>;
export declare const RANK_ICONS: Record<RankTier, string>;
export declare function getOrCreateRating(playerId: string): Promise<PlayerRating>;
export declare function updateRatingsAfterGame(winners: string[], losers: string[], roomId: string, winnerTeam: string, roleMap: Record<string, string>): Promise<Map<string, {
    before: number;
    after: number;
    change: number;
}>>;
export declare function getRankedLeaderboard(limit?: number): Promise<Array<{
    playerId: string;
    username: string;
    avatar: string;
    avatarUrl: string | null;
    publicId: number | null;
    elo: number;
    peakElo: number;
    rankedWins: number;
    rankedLosses: number;
    isPlaced: boolean;
    tier: RankTier;
}>>;
export declare function getPlayerRating(playerId: string): Promise<(PlayerRating & {
    tier: RankTier;
}) | null>;
//# sourceMappingURL=ratingService.d.ts.map