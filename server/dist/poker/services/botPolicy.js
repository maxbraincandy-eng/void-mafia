/**
 * What a test bot does with a hand.
 *
 * WHY THIS IS A SEPARATE, PURE FILE
 * ─────────────────────────────────
 * A bot that plays badly is fine — it exists so an owner with no other players
 * can watch the table work. A bot that plays *illegally* is not fine: it would
 * throw a `RuleError` inside the hand loop and stall the table for the human
 * sitting there. So the decision is a pure function of the legal actions the
 * engine has already published, it is unit-tested against a thousand random
 * spots, and it can never invent an action that was not offered.
 *
 * These are not opponents to learn from. They call too much, they bluff never,
 * and they are labelled as test bots everywhere they appear.
 */
import { evaluateBest, HandCategory } from '../engine/evaluator.js';
import { parseCards } from '../engine/cards.js';
/**
 * A rough 0..1 read of how good the hand is right now.
 *
 * Pre-flop it looks at the two cards; afterwards it evaluates what it actually
 * has. Crude on purpose: the point is that the bot folds rubbish, calls with
 * something, and occasionally raises with a real hand, so a human watching the
 * table sees all four actions happen.
 */
export function handStrength(hole, board) {
    let cards;
    try {
        cards = parseCards([...hole, ...board].join(' '));
    }
    catch {
        return 0.3;
    }
    const own = cards.slice(0, hole.length);
    if (board.length === 0) {
        if (own.length < 2)
            return 0.3;
        const [a, b] = own;
        const high = Math.max(a.rank, b.rank);
        const low = Math.min(a.rank, b.rank);
        if (a.rank === b.rank)
            return Math.min(1, 0.55 + (a.rank - 2) / 24); // a pair
        const suited = a.suit === b.suit ? 0.06 : 0;
        const connected = Math.abs(a.rank - b.rank) <= 2 ? 0.05 : 0;
        return Math.min(0.85, (high - 2) / 24 + (low - 2) / 40 + suited + connected);
    }
    if (cards.length < 5)
        return 0.35;
    const value = evaluateBest(cards);
    switch (value.category) {
        case HandCategory.HighCard: return 0.18;
        case HandCategory.OnePair: return 0.42;
        case HandCategory.TwoPair: return 0.62;
        case HandCategory.ThreeOfAKind: return 0.76;
        case HandCategory.Straight: return 0.84;
        case HandCategory.Flush: return 0.88;
        case HandCategory.FullHouse: return 0.93;
        default: return 0.97;
    }
}
/**
 * Pick an action.
 *
 * Every branch returns something `legal` says is available, and a raise is
 * always clamped into `[minRaiseTo, maxRaiseTo]`. That is the whole contract:
 * the table must never stall because a bot asked for something impossible.
 */
export function decide(spot) {
    const { legal, roll } = spot;
    const strength = handStrength(spot.hole, spot.board);
    // Nothing to call: take a free card, or bet a strong hand now and then.
    if (legal.canCheck) {
        if (legal.canRaise && strength > 0.7 && roll < 0.45)
            return raiseTo(spot, 0.6);
        if (legal.canRaise && strength > 0.55 && roll < 0.15)
            return raiseTo(spot, 0.4);
        return { type: 'check' };
    }
    // Facing a bet. Price it against the pot, roughly.
    const price = spot.pot > 0 ? spot.toCall / (spot.pot + spot.toCall) : 1;
    const worthIt = strength > price * 0.9;
    if (legal.canRaise && strength > 0.8 && roll < 0.35)
        return raiseTo(spot, 0.75);
    if (worthIt && legal.canCall)
        return { type: 'call' };
    // A cheap call with anything playable, so the bot does not fold every hand
    // and the human never gets to see a flop.
    if (legal.canCall && spot.toCall <= Math.max(1, spot.stack * 0.05) && strength > 0.25) {
        return { type: 'call' };
    }
    if (legal.canFold)
        return { type: 'fold' };
    return legal.canCall ? { type: 'call' } : { type: 'check' };
}
/** A raise sized off the pot, always inside the legal range. */
function raiseTo(spot, fraction) {
    const { legal } = spot;
    const target = Math.round(legal.minRaiseTo + spot.pot * fraction);
    const amount = Math.min(Math.max(target, legal.minRaiseTo), legal.maxRaiseTo);
    return { type: 'raise', amount };
}
//# sourceMappingURL=botPolicy.js.map