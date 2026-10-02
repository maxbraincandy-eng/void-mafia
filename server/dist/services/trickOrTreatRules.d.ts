/**
 * ტკბილეული თუ ხრიკი — the rules, with no I/O.
 *
 * A walk down a haunted street. Each knock opens one door; most give candy,
 * some give something useful, and a ghost takes the whole bag unless an amulet
 * stops it. Going home banks the bag. The ghost gets likelier with every door,
 * and the odds for the next one are on the screen — so the only question is
 * the one that makes it a game: one more door, or home?
 *
 * Every roll happens on the server. The client is told what a door held after
 * it is opened, and is told the next door early only by a lantern, which it
 * found by knocking. Nothing about an unopened door is in any payload.
 */
export declare const RUNS_PER_DAY = 5;
/** A walk ends by itself here; nobody should be able to knock for ever. */
export declare const MAX_DOORS = 30;
export type DoorKind = 'candy' | 'treat' | 'amulet' | 'lantern' | 'cat' | 'ghost';
export interface Door {
    kind: DoorKind;
    /** Candy in it; only candy and treats have any. */
    amount: number;
    /** A ghost that an amulet stopped. The bag is safe and the walk goes on. */
    saved?: boolean;
}
export interface Walk {
    doors: Door[];
    bag: number;
    amulet: boolean;
    /** The next door, rolled early because a lantern showed it. */
    peek: Door | null;
    status: 'walking' | 'home' | 'scared';
    banked: number;
    /** Bought for this walk: every candy and treat door gives one more. */
    sweet?: boolean;
}
export type GearId = 'amulet' | 'lantern' | 'sweet';
export declare const GEAR: Record<GearId, {
    price: number;
    label: string;
    emoji: string;
    desc: string;
}>;
/** A walk bought more than this many times a day stops being a daily game. */
export declare const EXTRA_WALKS_PER_DAY = 2;
export declare const EXTRA_WALK_PRICE = 25;
/** 10 candy for 10 coins, in tens, at most 100 coins a day. */
export declare const EXCHANGE_STEP = 10;
export declare const EXCHANGE_COINS_PER_DAY = 100;
export declare const coinsFor: (candy: number) => number;
export type CosmeticId = 'title_candy_king' | 'frame_jack_o_lantern';
export declare const COSMETICS: Record<CosmeticId, {
    price: number;
    label: string;
    emoji: string;
}>;
/** What the top three of the season are given when it closes. */
export declare const SEASON_PRIZES: {
    rank: number;
    coins: number;
    items: string[];
}[];
export declare function newWalk(gear?: GearId[], rng?: () => number): Walk;
/** The chance that door number `n` (1-based) is a ghost. */
export declare function ghostChance(n: number): number;
/**
 * What is behind door `n`.
 *
 * Candy grows with depth, so walking further is worth something besides the
 * risk; without that the right play would be to bank after every door.
 */
export declare function rollDoor(n: number, rng?: () => number): Door;
export declare class WalkError extends Error {
}
/** Open the next door. Returns the new walk and the door as it played out. */
export declare function knock(w: Walk, rng?: () => number): {
    walk: Walk;
    door: Door;
};
/** Bank the bag. */
export declare function goHome(w: Walk): Walk;
export declare function tbilisiDate(now: number): {
    year: number;
    month: number;
    day: number;
    key: string;
};
export declare function isSeason(now?: number): boolean;
/** The season a moment belongs to: its Tbilisi year. */
export declare const seasonOf: (now?: number) => number;
/** The next Tbilisi midnight, when the walks come back. */
export declare function nextMidnight(now?: number): number;
/** What a finished walk looks like as text, for sharing. Never an unopened door. */
export declare function shareLine(w: Walk): string;
//# sourceMappingURL=trickOrTreatRules.d.ts.map