import type { Card, Rank } from './cards.js';
/**
 * Texas Hold'em hand evaluation.
 *
 * WHAT IT HAS TO GET RIGHT
 * ────────────────────────
 * Ranking five cards is the easy half. The half that decides real money — or
 * here, real arguments — is everything around it: kickers, ties, split pots,
 * and the fact that a player's hand is the best five of seven, which is not
 * always the five they think it is.
 *
 * HOW
 * ───
 * Every five-card subset of the seven (there are 21) is scored, and the best
 * one wins. Twenty-one evaluations per player per showdown is nothing — a
 * nine-handed showdown is under 200 — and it is impossible to get wrong in the
 * way a clever bitmask can be. Correctness first; there is no performance
 * problem here to trade it against.
 *
 * THE SCORE
 * ─────────
 * A hand becomes a category plus up to five ordered tiebreak ranks, packed into
 * a single number in base 15. Comparing two hands is then comparing two
 * numbers, and equal numbers mean a genuine tie — which is exactly what a split
 * pot needs, and why the tiebreakers must be complete rather than "close
 * enough".
 */
export declare enum HandCategory {
    HighCard = 1,
    OnePair = 2,
    TwoPair = 3,
    ThreeOfAKind = 4,
    Straight = 5,
    Flush = 6,
    FullHouse = 7,
    FourOfAKind = 8,
    StraightFlush = 9,
    /**
     * Not a separate rank in the rules — it is the top straight flush — but the
     * table wants to be told, so it is a label the evaluator can hand back.
     */
    RoyalFlush = 10
}
export declare const CATEGORY_NAME: Record<HandCategory, string>;
export interface HandValue {
    /** What to call it. RoyalFlush is reported, but scores as a straight flush. */
    category: HandCategory;
    /** Ordered tiebreakers, most significant first. */
    ranks: number[];
    /** Total order over all hands: bigger wins, equal is a genuine tie. */
    score: number;
    /** The five cards that actually make the hand, for the showdown display. */
    cards: Card[];
}
/** Score exactly five cards. */
export declare function evaluate5(cards: Card[]): HandValue;
/**
 * The best five of seven — two hole cards and five community cards.
 *
 * Works for five or six cards too, so an all-in shown before the river can be
 * scored against the board as it stands.
 */
export declare function evaluateBest(cards: Card[]): HandValue;
/** Negative when a is worse, 0 on a genuine tie, positive when a wins. */
export declare function compareHands(a: HandValue, b: HandValue): number;
/** A short, human line for the showdown: "Full House, kings full of nines". */
export declare function describeHand(value: HandValue): string;
export type { Rank };
//# sourceMappingURL=evaluator.d.ts.map