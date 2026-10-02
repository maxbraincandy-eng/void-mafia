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
import { type Walk, type Door, GEAR, COSMETICS, SEASON_PRIZES } from './trickOrTreatRules.js';
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
    /** Candy in the wallet: carried home this season, minus what was spent. */
    candy: number;
    extraWalksToday: number;
    coinsExchangedToday: number;
    /** Shop cosmetics already bought. */
    owned: string[];
    shop: {
        gear: typeof GEAR;
        extraWalk: {
            price: number;
            perDay: number;
        };
        exchange: {
            step: number;
            coinsPerDay: number;
        };
        cosmetics: typeof COSMETICS;
        prizes: typeof SEASON_PRIZES;
    };
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
/**
 * Start a walk, optionally with gear bought from the wallet.
 * Refused outside the season, at the day's allowance, mid-walk, or short of candy.
 */
export declare function startWalk(userId: string, now?: number, gear?: string[], rng?: () => number): Promise<void>;
/** One more walk today, for candy — at most EXTRA_WALKS_PER_DAY. */
export declare function buyExtraWalk(userId: string, now?: number): Promise<void>;
/**
 * Candy into coins: in steps of EXCHANGE_STEP, at most EXCHANGE_COINS_PER_DAY
 * coins a day, and only for a player with an account — a guest has nowhere to
 * keep coins. The candy is claimed under the lock; the coins are paid after,
 * and if paying fails the claim is taken back, so candy is never lost.
 */
export declare function exchangeCandy(userId: string, candy: number, now?: number): Promise<number>;
/** A cosmetic from the shop: bought once, kept on the profile. */
export declare function buyCosmetic(userId: string, item: string, now?: number): Promise<void>;
/**
 * Pay the season's prizes, once, after it has closed. Safe to call at any time
 * and as often as liked: before the season ends it does nothing, and a prize
 * already paid is refused by tot_prizes' key.
 */
export declare function awardSeasonPrizes(year: number, now?: number): Promise<{
    rank: number;
    userId: string;
}[]>;
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
export declare function getBoard(userId: string | null, now?: number, limit?: number, season?: number): Promise<{
    top: TotBoardRow[];
    me: TotBoardRow | null;
}>;
//# sourceMappingURL=trickOrTreatService.d.ts.map