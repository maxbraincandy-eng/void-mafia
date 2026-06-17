import { generateId } from '../utils/helpers.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface PlayedCard {
  playerId: string;
  seatIndex: number;
  card: Card;
}

export interface JokerPlayer {
  id: string;
  socketId: string;
  name: string;
  profileId: string | null;
  seatIndex: number; // 0-3
}

export interface JokerSettings {
  mode: 'classic' | 'nines_only';
  khishtiPenalty: number;      // default 200
  bonusEnabled: boolean;       // default true
  spectatorsAllowed: boolean;  // default true
  privateTable: boolean;       // default false
  pulkaBonusPoints: number;    // default 400
}

export interface JokerRoundResult {
  roundIndex: number;
  cardCount: number;
  declarations: Record<string, number>;
  taken: Record<string, number>;
  points: Record<string, number>;
  khishtiPlayers: string[];
  pulkaId: number | null;
  pulkaBonusPlayers: Record<string, number>; // playerId -> bonus points
}

export interface JokerChatMsg {
  senderId: string;
  senderName: string;
  text: string;
  ts: number;
}

export interface JokerMatch {
  id: string;
  code: string;
  status: 'waiting' | 'declaration' | 'playing' | 'round_end' | 'finished';
  settings: JokerSettings;
  players: JokerPlayer[];
  spectatorSocketIds: string[];

  roundPlan: number[];
  pulkaIds: (number | null)[];  // per-round pulka id (null if not in pulka)
  currentRoundIndex: number;
  currentDealerSeat: number;

  // Current round
  hands: Record<string, Card[]>;
  declarations: Record<string, number | null>;
  currentDeclarationSeat: number;
  tricksTaken: Record<string, number>;

  // Current trick
  currentTrick: PlayedCard[];
  currentTrickLeaderSeat: number;
  currentPlaySeat: number;

  // Scores
  scores: Record<string, number>;
  roundHistory: JokerRoundResult[];

  // Pulka tracking: playerId -> pulkaId -> count of exact rounds so far in that pulka
  pulkaExacts: Record<string, Record<number, number>>;

  chat: JokerChatMsg[];
  createdAt: number;
  updatedAt: number;
}

// ─── In-memory store ─────────────────────────────────────────────────────────

const matchStore = new Map<string, JokerMatch>();

// ─── Utility helpers ─────────────────────────────────────────────────────────

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateMatchCode(): string {
  const digits = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');
  return `JK-${digits}`;
}

function uniqueMatchCode(): string {
  let code: string;
  let attempts = 0;
  do {
    code = generateMatchCode();
    attempts++;
    if (attempts > 10000) throw new Error('Could not generate unique match code');
  } while ([...matchStore.values()].some(m => m.code === code));
  return code;
}

// ─── Utility exports ─────────────────────────────────────────────────────────

/**
 * Build and shuffle a standard 52-card deck.
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return shuffle(deck);
}

/**
 * Return the round plan (card-count array) for the given mode.
 * Classic:    [9,9,9,9, 9,8,7,6,5,4,3,2,1, 1,2,3,4,5,6,7,8,9, 9,9,9,9]
 * Nines-only: [9,9,9,9]
 */
export function getJokerRoundPlan(mode: 'classic' | 'nines_only'): number[] {
  if (mode === 'nines_only') {
    return [9, 9, 9, 9];
  }
  return [
    9, 9, 9, 9,
    9, 8, 7, 6, 5, 4, 3, 2, 1,
    1, 2, 3, 4, 5, 6, 7, 8, 9,
    9, 9, 9, 9,
  ];
}

/**
 * Assign a pulka id (integer) to each round that belongs to a pulka, null otherwise.
 * Classic:    rounds 0-3  -> pulka 1,  rounds 22-25 -> pulka 2
 * Nines-only: rounds 0-3  -> pulka 1
 */
export function computePulkaIds(
  mode: 'classic' | 'nines_only',
  roundPlan: number[],
): (number | null)[] {
  const result: (number | null)[] = new Array(roundPlan.length).fill(null);

  if (mode === 'nines_only') {
    // All 4 rounds belong to pulka 1
    for (let i = 0; i < roundPlan.length; i++) {
      result[i] = 1;
    }
    return result;
  }

  // Classic: first 4 rounds (0-3) = pulka 1, last 4 rounds (22-25) = pulka 2
  for (let i = 0; i <= 3 && i < roundPlan.length; i++) result[i] = 1;
  for (let i = 22; i <= 25 && i < roundPlan.length; i++) result[i] = 2;
  return result;
}

// ─── Game logic ───────────────────────────────────────────────────────────────

/**
 * Deal `cardCount` cards per player from a freshly shuffled deck.
 * Dealing starts from seat (dealerSeat+1)%4 going clockwise.
 * Updates match.hands in-place.
 */
export function dealRound(match: JokerMatch): void {
  const cardCount = match.roundPlan[match.currentRoundIndex];
  const deck = createDeck();

  // Reset hands
  const newHands: Record<string, Card[]> = {};
  for (const player of match.players) {
    newHands[player.id] = [];
  }

  // Build dealing order: clockwise from seat after dealer
  const dealOrder: JokerPlayer[] = [];
  for (let offset = 1; offset <= 4; offset++) {
    const seat = (match.currentDealerSeat + offset) % 4;
    const player = match.players.find(p => p.seatIndex === seat);
    if (player) dealOrder.push(player);
  }

  // Deal one card at a time, round-robin
  let deckIndex = 0;
  for (let cardNum = 0; cardNum < cardCount; cardNum++) {
    for (const player of dealOrder) {
      if (deckIndex < deck.length) {
        newHands[player.id].push(deck[deckIndex++]);
      }
    }
  }

  match.hands = newHands;
}

/**
 * Validate a card play.
 * Returns an error string if invalid, null if valid.
 * Follow-suit: if trick is non-empty and player has the led suit, they must play it.
 */
export function validateCardPlay(
  hand: Card[],
  card: Card,
  trick: PlayedCard[],
): string | null {
  // Card must be in hand
  const inHand = hand.some(c => c.suit === card.suit && c.rank === card.rank);
  if (!inHand) {
    return 'Card is not in your hand.';
  }

  // If trick is empty, any card is fine (leading the trick)
  if (trick.length === 0) {
    return null;
  }

  const ledSuit = trick[0].card.suit;

  // If player is not playing the led suit, check they have no led-suit cards
  if (card.suit !== ledSuit) {
    const hasLedSuit = hand.some(c => c.suit === ledSuit);
    if (hasLedSuit) {
      return `You must follow suit (${ledSuit}).`;
    }
  }

  return null;
}

/**
 * Resolve the current trick.
 * Highest-ranked card of the led suit wins (no trump).
 */
export function resolveTrick(trick: PlayedCard[]): { winnerId: string; winnerSeat: number } {
  if (trick.length === 0) {
    throw new Error('Cannot resolve an empty trick.');
  }

  const ledSuit = trick[0].card.suit;

  let winner = trick[0];
  for (let i = 1; i < trick.length; i++) {
    const played = trick[i];
    if (played.card.suit === ledSuit && played.card.rank > winner.card.rank) {
      winner = played;
    }
  }

  return { winnerId: winner.playerId, winnerSeat: winner.seatIndex };
}

/**
 * Calculate score for one player for one round.
 *
 * if (declared > 0 && actual === 0):   -khishtiPenalty   (khishti)
 * elif (actual === declared):           declared === 0 ? +50 : declared * 50
 * else:                                 -(abs(actual - declared) * 50)
 */
export function calcRoundScore(
  declared: number,
  actual: number,
  khishtiPenalty: number,
): { points: number; khishti: boolean } {
  if (declared > 0 && actual === 0) {
    return { points: -khishtiPenalty, khishti: true };
  }
  if (actual === declared) {
    const points = declared === 0 ? 50 : declared * 50;
    return { points, khishti: false };
  }
  const points = -(Math.abs(actual - declared) * 50);
  return { points, khishti: false };
}

// ─── Score application ────────────────────────────────────────────────────────

/**
 * Called when all tricks in a round are done.
 * Calculates scores, checks pulka bonus, updates match in-place, returns the round result.
 */
export function applyRoundScores(match: JokerMatch): JokerRoundResult {
  const roundIndex = match.currentRoundIndex;
  const cardCount = match.roundPlan[roundIndex];
  const pulkaId = match.pulkaIds[roundIndex];
  const { khishtiPenalty, pulkaBonusPoints } = match.settings;

  const declarations: Record<string, number> = {};
  const taken: Record<string, number> = {};
  const points: Record<string, number> = {};
  const khishtiPlayers: string[] = [];
  const pulkaBonusPlayers: Record<string, number> = {};

  for (const player of match.players) {
    const declared = match.declarations[player.id] ?? 0;
    const actual = match.tricksTaken[player.id] ?? 0;

    declarations[player.id] = declared;
    taken[player.id] = actual;

    const { points: pts, khishti } = calcRoundScore(declared, actual, khishtiPenalty);
    points[player.id] = pts;

    if (khishti) {
      khishtiPlayers.push(player.id);
    }

    // Update running score
    match.scores[player.id] = (match.scores[player.id] ?? 0) + pts;

    // Pulka tracking: only for exact rounds (not khishti, score >= 0)
    if (pulkaId !== null && !khishti && pts >= 0) {
      if (!match.pulkaExacts[player.id]) {
        match.pulkaExacts[player.id] = {};
      }
      const prev = match.pulkaExacts[player.id][pulkaId] ?? 0;
      const next = prev + 1;
      match.pulkaExacts[player.id][pulkaId] = next;

      // Award pulka bonus if player has been exact in all 4 rounds of this pulka
      if (next >= 4) {
        pulkaBonusPlayers[player.id] = pulkaBonusPoints;
        match.scores[player.id] += pulkaBonusPoints;
      }
    }
  }

  const result: JokerRoundResult = {
    roundIndex,
    cardCount,
    declarations,
    taken,
    points,
    khishtiPlayers,
    pulkaId,
    pulkaBonusPlayers,
  };

  match.roundHistory.push(result);
  match.updatedAt = Date.now();

  return result;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function createMatch(creator: JokerPlayer, settings: JokerSettings): JokerMatch {
  const id = generateId();
  const code = uniqueMatchCode();
  const roundPlan = getJokerRoundPlan(settings.mode);
  const pulkaIds = computePulkaIds(settings.mode, roundPlan);

  const scores: Record<string, number> = {};
  const tricksTaken: Record<string, number> = {};
  const declarations: Record<string, number | null> = {};
  const hands: Record<string, Card[]> = {};
  const pulkaExacts: Record<string, Record<number, number>> = {};

  scores[creator.id] = 0;
  tricksTaken[creator.id] = 0;
  declarations[creator.id] = null;
  hands[creator.id] = [];
  pulkaExacts[creator.id] = {};

  const now = Date.now();

  const match: JokerMatch = {
    id,
    code,
    status: 'waiting',
    settings,
    players: [creator],
    spectatorSocketIds: [],

    roundPlan,
    pulkaIds,
    currentRoundIndex: 0,
    currentDealerSeat: 0,

    hands,
    declarations,
    currentDeclarationSeat: 1, // seat after dealer
    tricksTaken,

    currentTrick: [],
    currentTrickLeaderSeat: 1,
    currentPlaySeat: 1,

    scores,
    roundHistory: [],

    pulkaExacts,

    chat: [],
    createdAt: now,
    updatedAt: now,
  };

  matchStore.set(id, match);
  return match;
}

export function getMatch(id: string): JokerMatch | undefined {
  return matchStore.get(id);
}

export function getMatchByCode(code: string): JokerMatch | undefined {
  for (const match of matchStore.values()) {
    if (match.code === code) return match;
  }
  return undefined;
}

export function deleteMatch(id: string): void {
  matchStore.delete(id);
}

export function getOpenMatches(): JokerMatch[] {
  return [...matchStore.values()].filter(
    m => m.status === 'waiting' && !m.settings.privateTable,
  );
}

export function getMatchForSocket(socketId: string): JokerMatch | undefined {
  for (const match of matchStore.values()) {
    const isPlayer = match.players.some(p => p.socketId === socketId);
    if (isPlayer) return match;
    if (match.spectatorSocketIds.includes(socketId)) return match;
  }
  return undefined;
}

/**
 * Mark the match as finished and schedule its deletion after 10 minutes.
 */
export function finishMatch(match: JokerMatch): void {
  match.status = 'finished';
  match.updatedAt = Date.now();
  setTimeout(() => {
    matchStore.delete(match.id);
  }, 10 * 60 * 1000);
}
