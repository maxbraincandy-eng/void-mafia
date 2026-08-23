import type { HandValue } from './evaluator.js';
/**
 * Pots: how much is in the middle, who can win it, and who gets it.
 *
 * THE PROBLEM SIDE POTS SOLVE
 * ───────────────────────────
 * A player can only win what they matched. If a short stack is all-in for 100
 * and two others keep betting to 500, the short stack can win 300 (their 100
 * from each of three players) and not a chip more — the remaining 800 belongs
 * to a pot they are not in. Getting this wrong is the single most damaging bug
 * a poker engine can have, because it silently pays the wrong player and every
 * total still adds up.
 *
 * HOW IT IS BUILT
 * ───────────────
 * By layers. Sort the distinct amounts players put in; each layer is "everyone
 * who put in at least this much, times the height of the layer". Anyone who
 * folded still CONTRIBUTES to every layer their chips reached — their money
 * stays in the pot — but they are never eligible to win one.
 *
 * ODD CHIPS
 * ─────────
 * A split that does not divide evenly leaves one or two chips over. They go to
 * the eligible winner nearest the dealer's left, which is the standard rule and
 * — more importantly — a rule, so the outcome is not a coin flip that differs
 * between two runs of the same hand.
 */
export interface Contribution {
    playerId: string;
    /** Everything this player has put into the pot this hand. */
    committed: number;
    /** Folded players' chips stay in the pot; they can never win one. */
    folded: boolean;
}
export interface Pot {
    /** Chips in this pot. */
    amount: number;
    /** Players who may win it — never includes anyone who folded. */
    eligible: string[];
    /** 0 is the main pot; 1 and up are side pots, in the order they formed. */
    index: number;
}
export interface Payout {
    playerId: string;
    amount: number;
    potIndex: number;
    /** True when the pot was won without a showdown (everyone else folded). */
    uncontested: boolean;
}
/**
 * Split the money into a main pot and however many side pots the all-ins
 * created. The sum of the pots always equals the sum of the contributions —
 * that invariant is worth more than any comment, and the tests assert it.
 */
export declare function buildPots(contributions: Contribution[]): Pot[];
/**
 * Award every pot.
 *
 * `showdown` holds the evaluated hand of each player still in at the end. A
 * player who is not in the map (because they folded) can win nothing, even if
 * some pot lists them as eligible — which cannot happen, but the check costs
 * nothing and the failure mode it prevents is paying a folded player.
 *
 * `seatOrder` is the seats starting to the dealer's left; it decides odd chips.
 */
export declare function distribute(pots: Pot[], showdown: Map<string, HandValue>, seatOrder: string[]): Payout[];
/** Convenience: what each player ends up receiving, summed over all pots. */
export declare function totalsByPlayer(payouts: Payout[]): Map<string, number>;
//# sourceMappingURL=pots.d.ts.map