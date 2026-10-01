/**
 * ტკბილეული თუ ხრიკი — walks, the day's allowance, and the season board.
 *
 * ONE PLAYER, ONE THING AT A TIME
 * ───────────────────────────────
 * Every action takes a transaction-scoped advisory lock on the player. A
 * double tap on "knock" is two requests that would otherwise both read the
 * same walk and both write a door; a double tap on "home" would bank the bag
 * twice; two "start"s at the daily limit would both see four walks used.
 * Under the lock they simply take turns, and the second sees what the first
 * did.
 *
 * The walk is stored whole, as JSON, after every door — so a reconnect or a
 * restart in the middle of a street picks up exactly where it was.
 */
import { type Walk, type Door } from './trickOrTreatRules.js';
export interface TotState {
    season: {
        active: boolean;
        year: number;
    };
    runsPerDay: number;
    runsLeft: number;
    /** When the day's walks come back. */
    resetAt: number;
    /** The walk in progress, if any. */
    walk: Walk | null;
    /** The chance the next door is a ghost; null when no walk is going. */
    nextGhost: number | null;
    /** Today's last finished walk, for the result screen. */
    last: Walk | null;
    total: number;
    best: number;
    walks: number;
}
export interface TotBoardRow {
    rank: number;
    userId: string;
    username: string;
    avatarUrl: string | null;
    total: number;
    best: number;
}
declare class TotError extends Error {
}
export { TotError };
export declare function getState(userId: string, now?: number): Promise<TotState>;
/** Start a walk. Refused outside the season, at the daily limit, or mid-walk. */
export declare function startWalk(userId: string, now?: number): Promise<void>;
/** Open the next door of the walk in progress. */
export declare function knockDoor(userId: string, now?: number, rng?: () => number): Promise<Door>;
/** Go home and bank the bag. */
export declare function walkHome(userId: string, now?: number): Promise<number>;
/**
 * The season's board: candy carried home, summed over every walk.
 *
 * Only players with an account are on it. A guest plays on a socket id that
 * is new every visit, so a guest row is a stranger nobody can find again —
 * and a fresh id per visit would also be a fresh daily allowance per visit.
 */
export declare function getBoard(userId: string | null, now?: number, limit?: number): Promise<{
    top: TotBoardRow[];
    me: TotBoardRow | null;
}>;
//# sourceMappingURL=trickOrTreatService.d.ts.map