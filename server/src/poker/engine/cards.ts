import { randomInt, createHash, randomBytes } from 'crypto';

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

export const SUITS: readonly Suit[] = ['s', 'h', 'd', 'c'] as const;
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

const RANK_CHAR: Record<Rank, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};
const CHAR_RANK: Record<string, Rank> = Object.fromEntries(
  (Object.entries(RANK_CHAR) as [string, string][]).map(([r, c]) => [c, Number(r) as Rank]),
) as Record<string, Rank>;

/** "As", "Td", "2c" — the notation used in hand histories and tests. */
export function cardToString(card: Card): string {
  return `${RANK_CHAR[card.rank]}${card.suit}`;
}

export function parseCard(text: string): Card {
  const t = text.trim();
  const rank = CHAR_RANK[t[0]!.toUpperCase()];
  const suit = t[1]!.toLowerCase() as Suit;
  if (rank === undefined || !SUITS.includes(suit)) throw new Error(`Not a card: ${text}`);
  return { rank, suit };
}

/** Parse a whole board or hand: "As Kd 7c". */
export function parseCards(text: string): Card[] {
  return text.trim().split(/\s+/).filter(Boolean).map(parseCard);
}

/**
 * The only randomness the engine ever uses.
 *
 * `int(n)` must return a uniformly distributed integer in [0, n). Injectable so
 * a test can replay an exact deck; production passes `cryptoRandomness`.
 */
export interface Randomness {
  int(maxExclusive: number): number;
}

export const cryptoRandomness: Randomness = {
  int: (maxExclusive: number) => randomInt(maxExclusive),
};

/** A fixed sequence, for tests only. Never reachable from production config. */
export function seededRandomness(seed: number): Randomness {
  let s = seed >>> 0;
  return {
    int(maxExclusive: number) {
      // xorshift32 — deterministic, adequate for reproducing a test deck.
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s % maxExclusive;
    },
  };
}

/** A fresh 52-card deck in a fixed order. Never dealt from without shuffling. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  return deck;
}

/**
 * Fisher–Yates, the only correct in-place shuffle.
 *
 * Walking from the end and swapping with a uniform pick from the unshuffled
 * prefix gives every one of the 52! orders exactly equal probability. The
 * common "sort by random" shuffle does not, and the bias is measurable.
 */
export function shuffle(cards: Card[], rng: Randomness = cryptoRandomness): Card[] {
  const out = cards.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

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
export class Deck {
  private readonly cards: Card[];
  private index = 0;
  readonly commitment: ShuffleCommitment;

  constructor(rng: Randomness = cryptoRandomness, clientEntropy: string | null = null) {
    const seed = randomBytes(16).toString('hex');
    this.cards = shuffle(createDeck(), rng);
    const order = this.cards.map(cardToString).join('');
    this.commitment = {
      seed,
      clientEntropy,
      hash: createHash('sha256').update(`${seed}:${clientEntropy ?? ''}:${order}`).digest('hex'),
    };
  }

  get remaining(): number { return this.cards.length - this.index; }

  draw(count = 1): Card[] {
    if (count > this.remaining) throw new Error('Deck exhausted');
    const out = this.cards.slice(this.index, this.index + count);
    this.index += count;
    return out;
  }

  /**
   * Hold'em burns a card before the flop, turn and river. It changes nothing
   * statistically — the deck is already random — but the hand history has to
   * account for every card that left the deck, so it is a real draw.
   */
  burn(): Card { return this.draw(1)[0]!; }

  /**
   * Re-derive the commitment from a revealed seed and the order that was dealt.
   * Anyone holding the finished hand history can run this.
   */
  static verify(commitment: Pick<ShuffleCommitment, 'hash' | 'seed' | 'clientEntropy'>, order: Card[]): boolean {
    const joined = order.map(cardToString).join('');
    const hash = createHash('sha256')
      .update(`${commitment.seed}:${commitment.clientEntropy ?? ''}:${joined}`)
      .digest('hex');
    return hash === commitment.hash;
  }

  /** The full order, for the hand history — only ever called after settlement. */
  fullOrder(): Card[] { return this.cards.slice(); }
}
