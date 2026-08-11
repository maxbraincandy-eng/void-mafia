export type EndingTone = 'triumph' | 'survival' | 'ruin' | 'death';
/** The subset of a run the server needs to trust nothing else. */
export interface RunSubmission {
    endingId: string;
    tone: EndingTone;
    chapter: number;
    scenesSeen: number;
    stats: {
        nerve: number;
        cunning: number;
        trust: number;
        heat: number;
        money: number;
    };
}
/**
 * Score a run. Mirrors the client's scoreRun, but every input is clamped to the
 * range the engine can actually produce first — stats cap at 10, the story has
 * 6 chapters and 60 scenes — so an inflated payload scores as a normal one.
 * These bounds must be raised whenever the story grows, or a legitimate long
 * run silently scores low.
 */
export declare function scoreSubmission(sub: RunSubmission): number;
export interface SubmitResult {
    score: number;
    best: number;
    isBest: boolean;
    rank: number | null;
}
/**
 * Record a finished run. Every run is kept (the profile shows a history), but
 * the leaderboard reads only each player's best, so grinding weak runs cannot
 * crowd the board.
 */
export declare function submitRun(userId: string, name: string, sub: RunSubmission): Promise<SubmitResult>;
export interface BoardRow {
    rank: number;
    userId: string;
    username: string;
    avatar: string;
    avatarUrl: string | null;
    country: string | null;
    score: number;
    endingId: string;
    tone: EndingTone;
    chapter: number;
}
export declare function leaderboard(limit?: number): Promise<BoardRow[]>;
/** This player's own best and how many runs they've finished. */
export declare function myStats(userId: string): Promise<{
    best: number;
    runs: number;
    endings: string[];
}>;
//# sourceMappingURL=noirService.d.ts.map