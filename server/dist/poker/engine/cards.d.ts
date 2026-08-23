/**
 * Cards, decks, and where the shuffle comes from.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE
 * ────────────────────────────────────────
 * A deck is created and shuffled on the SERVER, and a player's hole cards are
 * only ever sent to that player. Nothing here runs in a browser, nothing here
 * takes a card value from a client, and there is no code path that lets a
 * client influence the order of the deck. Everything else in the poker package
 * depends on that being true.
 *
 * RANDOMNESS
 * ──────────
 * The default source is `crypto.randomInt`, which draws from the platform CSPRNG
 * and — unlike `Math.floor(Math.random() * n)` — is uniform over the range with
 * no modulo bias. The interface is injectable so tests can run a deterministic
 * sequence; production never passes anything but the crypto source.
 *
 * WHAT THE COMMITMENT IS, AND WHAT IT IS NOT
 * ──────────────────────────────────────────
 * Each shuffle carries a secret seed and publishes `sha256(seed : deck order)`
 * BEFORE any card is dealt. After the hand, revealing the seed lets anyone
 * recompute the hash and confirm the deck was not re-ordered mid-hand.
 *
 * That is an audit trail, and it is worth having. It is NOT a provably-fair
 * scheme in the sense a gambling regulator means: the player contributes no
 * entropy, so a dishonest server could still search for a favourable seed
 * before committing. Making it provably fair means mixing in a client seed and
 * publishing the commitment before the client's seed is known — the interface
 * below leaves room for exactly that (`clientEntropy`), and the product must
 * not claim provable fairness until it is implemented and reviewed.
 */
export type Suit = 's' | 'h' | 'd' | 'c';
/** 2–10, J=11, Q=12, K=13, A=14. Aces play low only inside the wheel straight. */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export interface Card {
    rank: Rank;
    suit: Suit;
}
export declare const SUITS: readonly Suit[];
export declare const RANKS: readonly Rank[];
/** "As", "Td", "2c" — the notation used in hand histories and tests. */
export declare function cardToString(card: Card): string;
export declare function parseCard(text: string): Card;
/** Parse a whole board or hand: "As Kd 7c". */
export declare function parseCards(text: string): Card[];
/**
 * The only randomness the engine ever uses.
 *
 * `int(n)` must return a uniformly distributed integer in [0, n). Injectable so
 * a test can replay an exact deck; production passes `cryptoRandomness`.
 */
export interface Randomness {
    int(maxExclusive: number): number;
}
export declare const cryptoRandomness: Randomness;
/** A fixed sequence, for tests only. Never reachable from production config. */
export declare function seededRandomness(seed: number): Randomness;
/** A fresh 52-card deck in a fixed order. Never dealt from without shuffling. */
export declare function createDeck(): Card[];
/**
 * Fisher–Yates, the only correct in-place shuffle.
 *
 * Walking from the end and swapping with a uniform pick from the unshuffled
 * prefix gives every one of the 52! orders exactly equal probability. The
 * common "sort by random" shuffle does not, and the bias is measurable.
 */
export declare function shuffle(cards: Card[], rng?: Randomness): Card[];
export interface ShuffleCommitment {
    /** Published before the deal; proves the order was fixed in advance. */
    hash: string;
    /** Revealed after the hand is over — never before. */
    seed: string;
    /** Reserved for a future provably-fair scheme; unused today. */
    clientEntropy: string | null;
}
/**
 * A shuffled deck that cards are drawn from, once, in order.
 *
 * Deliberately not re-shufflable and not re-orderable: a hand gets a Deck and
 * can only take cards off the top, so there is no place in the engine where a
 * card could be chosen after the fact.
 */
export declare class Deck {
    private readonly cards;
    private index;
    readonly commitment: ShuffleCommitment;
    constructor(rng?: Randomness, clientEntropy?: string | null);
    get remaining(): number;
    draw(count?: number): Card[];
    /**
     * Hold'em burns a card before the flop, turn and river. It changes nothing
     * statistically — the deck is already random — but the hand history has to
     * account for every card that left the deck, so it is a real draw.
     */
    burn(): Card;
    /**
     * Re-derive the commitment from a revealed seed and the order that was dealt.
     * Anyone holding the finished hand history can run this.
     */
    static verify(commitment: Pick<ShuffleCommitment, 'hash' | 'seed' | 'clientEntropy'>, order: Card[]): boolean;
    /** The full order, for the hand history — only ever called after settlement. */
    fullOrder(): Card[];
}
//# sourceMappingURL=cards.d.ts.map