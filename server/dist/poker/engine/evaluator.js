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
export var HandCategory;
(function (HandCategory) {
    HandCategory[HandCategory["HighCard"] = 1] = "HighCard";
    HandCategory[HandCategory["OnePair"] = 2] = "OnePair";
    HandCategory[HandCategory["TwoPair"] = 3] = "TwoPair";
    HandCategory[HandCategory["ThreeOfAKind"] = 4] = "ThreeOfAKind";
    HandCategory[HandCategory["Straight"] = 5] = "Straight";
    HandCategory[HandCategory["Flush"] = 6] = "Flush";
    HandCategory[HandCategory["FullHouse"] = 7] = "FullHouse";
    HandCategory[HandCategory["FourOfAKind"] = 8] = "FourOfAKind";
    HandCategory[HandCategory["StraightFlush"] = 9] = "StraightFlush";
    /**
     * Not a separate rank in the rules — it is the top straight flush — but the
     * table wants to be told, so it is a label the evaluator can hand back.
     */
    HandCategory[HandCategory["RoyalFlush"] = 10] = "RoyalFlush";
})(HandCategory || (HandCategory = {}));
export const CATEGORY_NAME = {
    [HandCategory.HighCard]: 'High Card',
    [HandCategory.OnePair]: 'One Pair',
    [HandCategory.TwoPair]: 'Two Pair',
    [HandCategory.ThreeOfAKind]: 'Three of a Kind',
    [HandCategory.Straight]: 'Straight',
    [HandCategory.Flush]: 'Flush',
    [HandCategory.FullHouse]: 'Full House',
    [HandCategory.FourOfAKind]: 'Four of a Kind',
    [HandCategory.StraightFlush]: 'Straight Flush',
    [HandCategory.RoyalFlush]: 'Royal Flush',
};
const BASE = 15;
function packScore(category, ranks) {
    // StraightFlush and RoyalFlush must compare equal at the category level: a
    // royal IS a straight flush, and packing it higher would make it beat a
    // straight flush by category rather than by its top card — which happens to
    // give the same answer, but for the wrong reason.
    const cat = category === HandCategory.RoyalFlush ? HandCategory.StraightFlush : category;
    let score = cat;
    for (let i = 0; i < 5; i++)
        score = score * BASE + (ranks[i] ?? 0);
    return score;
}
function sortDesc(a, b) { return b - a; }
/**
 * Straight detection, including the wheel.
 *
 * A-2-3-4-5 is a straight in which the ace plays low, and it is the ONE place
 * an ace is not the highest card in the deck. Returning the high card of the
 * run (5, not 14) is what makes it lose to 2-3-4-5-6, which is correct.
 */
function straightHigh(uniqueDesc) {
    const set = new Set(uniqueDesc);
    for (const high of uniqueDesc) {
        if (high < 5)
            break;
        if (set.has(high - 1) && set.has(high - 2) && set.has(high - 3) && set.has(high - 4))
            return high;
    }
    // The wheel: ace counted as one.
    if (set.has(14) && set.has(5) && set.has(4) && set.has(3) && set.has(2))
        return 5;
    return null;
}
/** Score exactly five cards. */
export function evaluate5(cards) {
    if (cards.length !== 5)
        throw new Error('evaluate5 needs exactly five cards');
    const ranks = cards.map(c => c.rank).sort(sortDesc);
    const bySuit = new Map();
    for (const c of cards)
        bySuit.set(c.suit, (bySuit.get(c.suit) ?? 0) + 1);
    const isFlush = bySuit.size === 1;
    const counts = new Map();
    for (const r of ranks)
        counts.set(r, (counts.get(r) ?? 0) + 1);
    // Group by count first, then by rank: trips beat the pair regardless of rank,
    // and the kicker order inside a group is always high-to-low.
    const groups = [...counts.entries()]
        .sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
    const uniqueDesc = [...counts.keys()].sort(sortDesc);
    const high = straightHigh(uniqueDesc);
    const isStraight = high !== null && counts.size === 5;
    const make = (category, tiebreak) => ({
        category,
        ranks: tiebreak,
        score: packScore(category, tiebreak),
        cards: cards.slice(),
    });
    if (isStraight && isFlush) {
        return make(high === 14 ? HandCategory.RoyalFlush : HandCategory.StraightFlush, [high]);
    }
    if (groups[0][1] === 4) {
        const quad = groups[0][0];
        const kicker = groups[1][0];
        return make(HandCategory.FourOfAKind, [quad, kicker]);
    }
    if (groups[0][1] === 3 && groups[1][1] === 2) {
        return make(HandCategory.FullHouse, [groups[0][0], groups[1][0]]);
    }
    if (isFlush)
        return make(HandCategory.Flush, ranks);
    if (isStraight)
        return make(HandCategory.Straight, [high]);
    if (groups[0][1] === 3) {
        const kickers = groups.slice(1).map(g => g[0]).sort(sortDesc);
        return make(HandCategory.ThreeOfAKind, [groups[0][0], ...kickers]);
    }
    if (groups[0][1] === 2 && groups[1][1] === 2) {
        const pairHigh = Math.max(groups[0][0], groups[1][0]);
        const pairLow = Math.min(groups[0][0], groups[1][0]);
        const kicker = groups[2][0];
        return make(HandCategory.TwoPair, [pairHigh, pairLow, kicker]);
    }
    if (groups[0][1] === 2) {
        const kickers = groups.slice(1).map(g => g[0]).sort(sortDesc);
        return make(HandCategory.OnePair, [groups[0][0], ...kickers]);
    }
    return make(HandCategory.HighCard, ranks);
}
/** Every 5-card subset of a 7-card set: 21 of them, generated once. */
const COMBOS_7_5 = (() => {
    const out = [];
    for (let a = 0; a < 7; a++)
        for (let b = a + 1; b < 7; b++)
            for (let c = b + 1; c < 7; c++)
                for (let d = c + 1; d < 7; d++)
                    for (let e = d + 1; e < 7; e++)
                        out.push([a, b, c, d, e]);
    return out;
})();
/**
 * The best five of seven — two hole cards and five community cards.
 *
 * Works for five or six cards too, so an all-in shown before the river can be
 * scored against the board as it stands.
 */
export function evaluateBest(cards) {
    if (cards.length < 5)
        throw new Error('Need at least five cards to evaluate');
    if (cards.length === 5)
        return evaluate5(cards);
    let best = null;
    if (cards.length === 7) {
        for (const combo of COMBOS_7_5) {
            const five = [cards[combo[0]], cards[combo[1]], cards[combo[2]], cards[combo[3]], cards[combo[4]]];
            const value = evaluate5(five);
            if (!best || value.score > best.score)
                best = value;
        }
        return best;
    }
    // Six cards (or any other length): enumerate generically.
    const idx = cards.map((_, i) => i);
    const pick = (start, chosen) => {
        if (chosen.length === 5) {
            const value = evaluate5(chosen.map(i => cards[i]));
            if (!best || value.score > best.score)
                best = value;
            return;
        }
        for (let i = start; i < idx.length; i++)
            pick(i + 1, [...chosen, i]);
    };
    pick(0, []);
    return best;
}
/** Negative when a is worse, 0 on a genuine tie, positive when a wins. */
export function compareHands(a, b) {
    return a.score - b.score;
}
/** A short, human line for the showdown: "Full House, kings full of nines". */
export function describeHand(value) {
    const name = (r, plural = false) => {
        const names = {
            2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight',
            9: 'nine', 10: 'ten', 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace',
        };
        const n = names[r] ?? String(r);
        if (!plural)
            return n;
        return n === 'six' ? 'sixes' : `${n}s`;
    };
    const [a, b] = value.ranks;
    switch (value.category) {
        case HandCategory.RoyalFlush: return 'Royal Flush';
        case HandCategory.StraightFlush: return `Straight Flush, ${name(a)} high`;
        case HandCategory.FourOfAKind: return `Four of a Kind, ${name(a, true)}`;
        case HandCategory.FullHouse: return `Full House, ${name(a, true)} full of ${name(b, true)}`;
        case HandCategory.Flush: return `Flush, ${name(a)} high`;
        case HandCategory.Straight: return `Straight, ${name(a)} high`;
        case HandCategory.ThreeOfAKind: return `Three of a Kind, ${name(a, true)}`;
        case HandCategory.TwoPair: return `Two Pair, ${name(a, true)} and ${name(b, true)}`;
        case HandCategory.OnePair: return `One Pair, ${name(a, true)}`;
        default: return `High Card, ${name(a)}`;
    }
}
//# sourceMappingURL=evaluator.js.map