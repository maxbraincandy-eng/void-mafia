/**
 * დებილების ტესტი — attempts and the leaderboard.
 *
 * SCORING IS SERVER-SIDE, AND THAT IS THE WHOLE POINT
 * ──────────────────────────────────────────────────
 * The client is sent questions without their answers and submits the option ids
 * it chose. It never says how many it got right, and if it did, it would be
 * ignored. A leaderboard that trusts a self-reported score is a leaderboard of
 * who read the source first.
 *
 * The same reasoning covers the category: it is derived from the questions that
 * were actually answered, not from what the submission claims. See
 * `categoryOf`.
 *
 * WHAT THE BOARD RANKS
 * ────────────────────
 * Each player's BEST attempt, not their latest and not all of them. Ranking
 * every attempt would fill the board with one person who kept trying; ranking
 * the latest would punish somebody for playing again after a good run, which is
 * exactly the wrong incentive for a game meant to be replayed.
 *
 * Ties break on how long the run took — a tie on a twelve-question quiz is
 * common, and leaving them in arrival order means the board reshuffles for no
 * reason every time somebody else ties.
 *
 * ONE BOARD PER CATEGORY
 * ──────────────────────
 * Categories are not equally hard, so a single board would rank the person who
 * picked the easiest one. Each category keeps its own, and `mixed` is a real
 * category here rather than a union of the others — a mixed run is its own kind
 * of run and belongs with other mixed runs.
 */
import { type TestCategory } from './dumbBank.js';
export interface DumbAnswer {
    questionId: string;
    /** The option the player chose, or null when they skipped. */
    optionId: string | null;
}
export interface DumbResult {
    id: string;
    correct: number;
    total: number;
    durationMs: number;
    title: string;
    note: string;
    isBest: boolean;
    rank: number | null;
    category: TestCategory;
    /** Per question, so the result screen can show the punchlines. */
    breakdown: {
        questionId: string;
        text: string;
        chosen: string | null;
        correctText: string;
        right: boolean;
        reveal: string;
    }[];
}
export interface DumbLeaderRow {
    rank: number;
    userId: string;
    username: string;
    avatar: string;
    avatarUrl: string | null;
    correct: number;
    total: number;
    durationMs: number;
    createdAt: number;
    isMe: boolean;
}
/**
 * Score a submission and record it.
 *
 * The answers are matched back to the bank by id, so a client that invents a
 * question id, sends the same one twice, or omits half the test scores exactly
 * what it deserves: only real, distinct, correctly-answered questions count.
 */
export declare function submitAttempt(userId: string, answers: DumbAnswer[], durationMs: number): Promise<DumbResult>;
export declare function getLeaderboard(viewerId: string | null, category?: TestCategory, limit?: number): Promise<DumbLeaderRow[]>;
/**
 * Plays and best score per category, for the picker's tiles.
 *
 * One grouped query rather than a `getStatus` per category: the picker opens
 * every time the game does, and five categories through `getStatus` would be
 * fifteen round trips to render five subtitles.
 */
export declare function getCategoryBests(userId: string): Promise<Record<string, {
    plays: number;
    best: number;
}>>;
export interface DumbStatus {
    category: TestCategory;
    plays: number;
    best: number | null;
    total: number;
    rank: number | null;
    /** Questions from the last run in this category, so the next draw can avoid them. */
    lastQuestionIds: string[];
    bankSize: number;
}
/**
 * One player's standing in one category.
 *
 * Scoped rather than global because `lastQuestionIds` feeds the next draw: if it
 * returned the last run whatever category that was, picking სხვა განზომილება
 * after a Georgian run would exclude twelve questions that were never in the
 * pool, and exclude nothing that was.
 */
export declare function getStatus(userId: string, category?: TestCategory): Promise<DumbStatus>;
//# sourceMappingURL=dumbService.d.ts.map