import { randomInt, createHash, randomBytes } from 'crypto';
export const SUITS = ['s', 'h', 'd', 'c'];
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const RANK_CHAR = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
    10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};
const CHAR_RANK = Object.fromEntries(Object.entries(RANK_CHAR).map(([r, c]) => [c, Number(r)]));
/** "As", "Td", "2c" — the notation used in hand histories and tests. */
export function cardToString(card) {
    return `${RANK_CHAR[card.rank]}${card.suit}`;
}
export function parseCard(text) {
    const t = text.trim();
    const rank = CHAR_RANK[t[0].toUpperCase()];
    const suit = t[1].toLowerCase();
    if (rank === undefined || !SUITS.includes(suit))
        throw new Error(`Not a card: ${text}`);
    return { rank, suit };
}
/** Parse a whole board or hand: "As Kd 7c". */
export function parseCards(text) {
    return text.trim().split(/\s+/).filter(Boolean).map(parseCard);
}
export const cryptoRandomness = {
    int: (maxExclusive) => randomInt(maxExclusive),
};
/** A fixed sequence, for tests only. Never reachable from production config. */
export function seededRandomness(seed) {
    let s = seed >>> 0;
    return {
        int(maxExclusive) {
            // xorshift32 — deterministic, adequate for reproducing a test deck.
            s ^= s << 13;
            s >>>= 0;
            s ^= s >> 17;
            s ^= s << 5;
            s >>>= 0;
            return s % maxExclusive;
        },
    };
}
/** A fresh 52-card deck in a fixed order. Never dealt from without shuffling. */
export function createDeck() {
    const deck = [];
    for (const suit of SUITS)
        for (const rank of RANKS)
            deck.push({ rank, suit });
    return deck;
}
/**
 * Fisher–Yates, the only correct in-place shuffle.
 *
 * Walking from the end and swapping with a uniform pick from the unshuffled
 * prefix gives every one of the 52! orders exactly equal probability. The
 * common "sort by random" shuffle does not, and the bias is measurable.
 */
export function shuffle(cards, rng = cryptoRandomness) {
    const out = cards.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
    }
    return out;
}
/**
 * A shuffled deck that cards are drawn from, once, in order.
 *
 * Deliberately not re-shufflable and not re-orderable: a hand gets a Deck and
 * can only take cards off the top, so there is no place in the engine where a
 * card could be chosen after the fact.
 */
export class Deck {
    constructor(rng = cryptoRandomness, clientEntropy = null) {
        this.index = 0;
        const seed = randomBytes(16).toString('hex');
        this.cards = shuffle(createDeck(), rng);
        const order = this.cards.map(cardToString).join('');
        this.commitment = {
            seed,
            clientEntropy,
            hash: createHash('sha256').update(`${seed}:${clientEntropy ?? ''}:${order}`).digest('hex'),
        };
    }
    get remaining() { return this.cards.length - this.index; }
    draw(count = 1) {
        if (count > this.remaining)
            throw new Error('Deck exhausted');
        const out = this.cards.slice(this.index, this.index + count);
        this.index += count;
        return out;
    }
    /**
     * Hold'em burns a card before the flop, turn and river. It changes nothing
     * statistically — the deck is already random — but the hand history has to
     * account for every card that left the deck, so it is a real draw.
     */
    burn() { return this.draw(1)[0]; }
    /**
     * Re-derive the commitment from a revealed seed and the order that was dealt.
     * Anyone holding the finished hand history can run this.
     */
    static verify(commitment, order) {
        const joined = order.map(cardToString).join('');
        const hash = createHash('sha256')
            .update(`${commitment.seed}:${commitment.clientEntropy ?? ''}:${joined}`)
            .digest('hex');
        return hash === commitment.hash;
    }
    /** The full order, for the hand history — only ever called after settlement. */
    fullOrder() { return this.cards.slice(); }
}
//# sourceMappingURL=cards.js.map