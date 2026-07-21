export declare const MP_TRAIT_COLUMNS: readonly ["independence", "rationality", "conformity", "ambition", "risk", "status_desire", "skepticism", "moral_flex"];
export type MPBoardScope = 'independence' | 'rationality' | 'ambition' | 'skepticism' | 'risk' | 'conformity';
export declare const MP_BOARD_SCOPES: MPBoardScope[];
export interface MPSubmitPayload {
    archetype: string;
    archetypeKa: string;
    traits: Record<string, number>;
}
export declare function saveResult(userId: string, p: MPSubmitPayload): Promise<void>;
export interface MPBoardRow {
    rank: number;
    userId: string;
    username: string;
    avatar: string;
    avatarUrl: string | null;
    archetype: string;
    archetypeKa: string;
    score: number;
    traits: Record<string, number>;
    updatedAt: number;
}
/**
 * Trait-scoped leaderboard. The table holds one row per user, so the whole set
 * is small — fetch + JS-sort keeps the trait column dynamic without unsafe SQL.
 */
export declare function getBoard(scope: MPBoardScope, viewerId: string | null, limit?: number): Promise<{
    rows: MPBoardRow[];
    myRow: MPBoardRow | null;
}>;
export declare function getMine(userId: string): Promise<MPBoardRow | null>;
/** Moderator action: remove a user's result from the leaderboard. */
export declare function modRemove(modId: string, targetUserId: string): Promise<{
    removed: number;
}>;
//# sourceMappingURL=maxPuzzleService.d.ts.map