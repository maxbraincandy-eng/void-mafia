import { randomBytes } from 'crypto';
import { Deck, cryptoRandomness, type Card, type Randomness, type ShuffleCommitment } from './cards.js';
import { evaluateBest, describeHand, type HandValue } from './evaluator.js';
import { buildPots, distribute, type Contribution, type Payout, type Pot } from './pots.js';
import {
  isBettingRoundComplete, legalActions, validateAction,
  type Action, type BettingContext, type BettingSeat, type LegalActions,
} from './betting.js';

/**
 * The hand: one deterministic state machine, server-side, and the only thing
 * in the system allowed to decide what happened.
 *
 *   STARTING → PRE_FLOP → FLOP → TURN → RIVER → SHOWDOWN → SETTLEMENT → COMPLETE
 *
 * Every transition is a function of the current state plus one validated
 * action. Nothing here reads the network, the clock, or a client; the socket
 * layer feeds it actions and timeouts and publishes what comes back. That
 * separation is what makes the rules testable — and what makes "the client
 * said it won" impossible to express.
 *
 * A hand ends early whenever one player is left unfolded: no cards are shown,
 * the pot is pushed, and the hand history records it as uncontested.
 *
 * CHIPS
 * ─────
 * The stacks here are gameplay chips. They have no monetary value, cannot be
 * transferred between players, and cannot leave the table. See
 * `src/future-economy/README.md` for where that boundary is drawn and why the
 * engine must stay ignorant of any of it.
 */

export type Street = 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER';
export type HandPhase = 'STARTING' | Street | 'SHOWDOWN' | 'SETTLEMENT' | 'COMPLETE';

export interface SeatState {
  playerId: string;
  seat: number;
  stack: number;
  /** Server-side only. Never included in another player's view. */
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  committedThisStreet: number;
  committedTotal: number;
  actedThisRound: boolean;
  /** Set when the hand reaches showdown and this player has to show. */
  revealed: boolean;
}

export interface ActionRecord {
  index: number;
  street: Street;
  playerId: string;
  type: Action['type'] | 'post-blind' | 'post-ante';
  /** Chips added to the pot by this action. */
  amount: number;
  /** Total this street after the action — what a raise "went to". */
  to: number;
  at: number;
}

export interface Blinds {
  small: number;
  big: number;
  ante: number;
}

export interface HandState {
  handId: string;
  tableId: string;
  phase: HandPhase;
  buttonSeat: number;
  seats: SeatState[];
  board: Card[];
  betToMatch: number;
  minRaiseTo: number;
  lastAggressorSeat: number | null;
  actingSeat: number | null;
  blinds: Blinds;
  pots: Pot[];
  actions: ActionRecord[];
  payouts: Payout[];
  /** Filled at showdown, and only for players who had to show. */
  showdown: { playerId: string; hand: HandValue; description: string }[];
  startedAt: number;
  endedAt: number | null;
  commitment: ShuffleCommitment;
  /** Cards that left the deck, in order — for the hand history, after the end. */
  deckOrder: Card[];
  deck: Deck;
}

export interface SeatConfig {
  playerId: string;
  seat: number;
  stack: number;
}

export class RuleError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

const STREETS: Street[] = ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER'];

function toBettingSeat(s: SeatState): BettingSeat {
  return {
    playerId: s.playerId, seat: s.seat, stack: s.stack,
    committedThisStreet: s.committedThisStreet, folded: s.folded,
    allIn: s.allIn, actedThisRound: s.actedThisRound,
  };
}

function context(hand: HandState): BettingContext {
  return { seats: hand.seats.map(toBettingSeat), betToMatch: hand.betToMatch, minRaiseTo: hand.minRaiseTo };
}

/** Seats in clockwise order starting after `fromSeat`. */
function orderFrom(hand: HandState, fromSeat: number): SeatState[] {
  const sorted = [...hand.seats].sort((a, b) => a.seat - b.seat);
  const start = sorted.findIndex(s => s.seat > fromSeat);
  const at = start === -1 ? 0 : start;
  return [...sorted.slice(at), ...sorted.slice(0, at)];
}

function nextToAct(hand: HandState, fromSeat: number): SeatState | null {
  for (const s of orderFrom(hand, fromSeat)) {
    if (!s.folded && !s.allIn && s.stack > 0 && !(s.actedThisRound && s.committedThisStreet === hand.betToMatch)) {
      return s;
    }
  }
  return null;
}

function seatOf(hand: HandState, playerId: string): SeatState {
  const s = hand.seats.find(x => x.playerId === playerId);
  if (!s) throw new RuleError('NOT_AT_TABLE', 'You are not in this hand.');
  return s;
}

function commit(hand: HandState, seat: SeatState, amount: number): number {
  const paid = Math.min(amount, seat.stack);
  seat.stack -= paid;
  seat.committedThisStreet += paid;
  seat.committedTotal += paid;
  if (seat.stack === 0) seat.allIn = true;
  return paid;
}

function record(hand: HandState, seat: SeatState, type: ActionRecord['type'], amount: number): void {
  hand.actions.push({
    index: hand.actions.length,
    street: (STREETS.includes(hand.phase as Street) ? hand.phase : 'PRE_FLOP') as Street,
    playerId: seat.playerId,
    type,
    amount,
    to: seat.committedThisStreet,
    at: Date.now(),
  });
}

/**
 * Deal a hand.
 *
 * Heads-up is not a special case bolted on: with two players the button IS the
 * small blind and acts first pre-flop, then last on every later street. The
 * blind order below produces that from the same code as a full ring.
 */
export function startHand(params: {
  tableId: string;
  buttonSeat: number;
  seats: SeatConfig[];
  blinds: Blinds;
  rng?: Randomness;
  handId?: string;
}): HandState {
  const { tableId, buttonSeat, blinds } = params;
  const players = [...params.seats].sort((a, b) => a.seat - b.seat).filter(s => s.stack > 0);
  if (players.length < 2) throw new RuleError('NOT_ENOUGH_PLAYERS', 'A hand needs at least two players with chips.');

  const deck = new Deck(params.rng ?? cryptoRandomness);
  const hand: HandState = {
    handId: params.handId ?? randomBytes(9).toString('hex'),
    tableId,
    phase: 'STARTING',
    buttonSeat,
    seats: players.map(p => ({
      playerId: p.playerId, seat: p.seat, stack: p.stack, hole: [],
      folded: false, allIn: false, committedThisStreet: 0, committedTotal: 0,
      actedThisRound: false, revealed: false,
    })),
    board: [],
    betToMatch: 0,
    minRaiseTo: blinds.big,
    lastAggressorSeat: null,
    actingSeat: null,
    blinds,
    pots: [],
    actions: [],
    payouts: [],
    showdown: [],
    startedAt: Date.now(),
    endedAt: null,
    commitment: deck.commitment,
    deckOrder: [],
    deck,
  };

  // Antes first: everyone pays, and a player who cannot cover one is all-in.
  if (blinds.ante > 0) {
    for (const s of hand.seats) {
      const paid = commit(hand, s, blinds.ante);
      if (paid > 0) record(hand, s, 'post-ante', paid);
    }
    // Antes belong to the pot, not to the current bet.
    for (const s of hand.seats) s.committedThisStreet = 0;
  }

  const after = orderFrom(hand, buttonSeat);
  const heads = hand.seats.length === 2;
  const smallSeat = heads ? hand.seats.find(s => s.seat === buttonSeat)! : after[0]!;
  const bigSeat = heads ? after[0]! : after[1]!;

  const sbPaid = commit(hand, smallSeat, blinds.small);
  record(hand, smallSeat, 'post-blind', sbPaid);
  const bbPaid = commit(hand, bigSeat, blinds.big);
  record(hand, bigSeat, 'post-blind', bbPaid);

  hand.betToMatch = Math.max(smallSeat.committedThisStreet, bigSeat.committedThisStreet);
  hand.minRaiseTo = hand.betToMatch + blinds.big;
  hand.lastAggressorSeat = bigSeat.seat;

  // Two cards each, one at a time, starting left of the button — the order is
  // cosmetic but the hand history should read like the deal looked.
  for (let round = 0; round < 2; round++) {
    for (const s of orderFrom(hand, buttonSeat)) s.hole.push(deck.draw(1)[0]!);
  }

  hand.phase = 'PRE_FLOP';
  // The blinds have paid but not acted: the big blind still has the option.
  for (const s of hand.seats) s.actedThisRound = false;
  hand.actingSeat = (nextToAct(hand, bigSeat.seat) ?? null)?.seat ?? null;
  if (hand.actingSeat === null) settleIfDone(hand);
  return hand;
}

/** What the player to act may do. Null when it is nobody's turn. */
export function actionsFor(hand: HandState, playerId: string): LegalActions | null {
  if (hand.actingSeat === null) return null;
  const seat = hand.seats.find(s => s.seat === hand.actingSeat);
  if (!seat || seat.playerId !== playerId) return null;
  return legalActions(context(hand), toBettingSeat(seat));
}

/**
 * Apply one validated action and move the hand on.
 *
 * Throws `RuleError` rather than returning a flag, because every caller has to
 * treat an illegal action as an incident to log — not as an outcome to display.
 */
export function applyAction(hand: HandState, playerId: string, action: Action): HandState {
  if (!STREETS.includes(hand.phase as Street)) {
    throw new RuleError('NOT_BETTING', 'The hand is not in a betting round.');
  }
  const seat = seatOf(hand, playerId);
  if (hand.actingSeat !== seat.seat) throw new RuleError('OUT_OF_TURN', 'It is not your turn.');

  const err = validateAction(context(hand), toBettingSeat(seat), action);
  if (err) throw new RuleError(err.code, err.message);

  const before = hand.betToMatch;

  switch (action.type) {
    case 'fold':
      seat.folded = true;
      seat.actedThisRound = true;
      record(hand, seat, 'fold', 0);
      break;

    case 'check':
      seat.actedThisRound = true;
      record(hand, seat, 'check', 0);
      break;

    case 'call': {
      const paid = commit(hand, seat, hand.betToMatch - seat.committedThisStreet);
      seat.actedThisRound = true;
      record(hand, seat, 'call', paid);
      break;
    }

    case 'raise':
    case 'allIn': {
      const target = action.type === 'allIn'
        ? seat.committedThisStreet + seat.stack
        : Math.floor(action.amount!);
      const paid = commit(hand, seat, target - seat.committedThisStreet);
      seat.actedThisRound = true;
      record(hand, seat, action.type, paid);

      if (seat.committedThisStreet > before) {
        const raiseSize = seat.committedThisStreet - before;
        const fullRaise = raiseSize >= (hand.minRaiseTo - before);
        hand.betToMatch = seat.committedThisStreet;
        hand.lastAggressorSeat = seat.seat;

        if (fullRaise) {
          // A real raise re-opens the betting for everyone behind.
          hand.minRaiseTo = hand.betToMatch + raiseSize;
          for (const s of hand.seats) if (s !== seat && !s.folded && !s.allIn) s.actedThisRound = false;
        }
        // A short all-in does NOT re-open it: players who have already called
        // the earlier bet keep `actedThisRound`, and may only call the extra.
      }
      break;
    }
  }

  advance(hand);
  return hand;
}

/** Everyone folded to one player: push the pot, show nothing. */
function onlyOneLeft(hand: HandState): boolean {
  return hand.seats.filter(s => !s.folded).length === 1;
}

/**
 * Move the hand forward as far as it can go without another decision: next
 * player, next street, run the board out when everyone is all-in, showdown.
 */
function advance(hand: HandState): void {
  if (onlyOneLeft(hand)) { settle(hand); return; }

  if (!isBettingRoundComplete(context(hand))) {
    const next = nextToAct(hand, hand.actingSeat ?? hand.buttonSeat);
    hand.actingSeat = next ? next.seat : null;
    if (hand.actingSeat === null) settleIfDone(hand);
    return;
  }

  // Street over: collect the bets and deal the next one.
  for (const s of hand.seats) { s.committedThisStreet = 0; s.actedThisRound = false; }
  hand.betToMatch = 0;
  hand.minRaiseTo = hand.blinds.big;
  hand.lastAggressorSeat = null;

  const idx = STREETS.indexOf(hand.phase as Street);
  const nextStreet = STREETS[idx + 1];

  if (!nextStreet) { showdown(hand); return; }

  hand.deck.burn();
  hand.board.push(...hand.deck.draw(nextStreet === 'FLOP' ? 3 : 1));
  hand.phase = nextStreet;

  const stillBetting = hand.seats.filter(s => !s.folded && !s.allIn && s.stack > 0);
  if (stillBetting.length <= 1) {
    // Nobody can act any more — run the rest of the board out and show.
    while (hand.board.length < 5) {
      hand.deck.burn();
      hand.board.push(...hand.deck.draw(hand.board.length === 0 ? 3 : 1));
    }
    hand.phase = 'RIVER';
    showdown(hand);
    return;
  }

  const first = nextToAct(hand, hand.buttonSeat);
  hand.actingSeat = first ? first.seat : null;
  if (hand.actingSeat === null) showdown(hand);
}

function settleIfDone(hand: HandState): void {
  if (onlyOneLeft(hand) || hand.seats.every(s => s.folded || s.allIn || s.stack === 0)) settle(hand);
}

function showdown(hand: HandState): void {
  hand.phase = 'SHOWDOWN';
  const contenders = hand.seats.filter(s => !s.folded);
  for (const s of contenders) {
    s.revealed = true;
    const value = evaluateBest([...s.hole, ...hand.board]);
    hand.showdown.push({ playerId: s.playerId, hand: value, description: describeHand(value) });
  }
  settle(hand);
}

/**
 * Build the pots, decide the winners, pay them, and freeze the hand.
 *
 * Called from exactly two places — a fold that leaves one player, and the
 * showdown — so there is one settlement path and one place where chips move.
 */
function settle(hand: HandState): void {
  hand.phase = 'SETTLEMENT';

  const contributions: Contribution[] = hand.seats.map(s => ({
    playerId: s.playerId, committed: s.committedTotal, folded: s.folded,
  }));
  hand.pots = buildPots(contributions);

  const values = new Map<string, HandValue>();
  const live = hand.seats.filter(s => !s.folded);
  if (live.length === 1) {
    // Uncontested: no cards are evaluated and none are shown.
    values.set(live[0]!.playerId, { category: 1, ranks: [], score: 0, cards: [] } as unknown as HandValue);
  } else {
    for (const entry of hand.showdown) values.set(entry.playerId, entry.hand);
  }

  const order = orderFrom(hand, hand.buttonSeat).map(s => s.playerId);
  hand.payouts = distribute(hand.pots, values, order);

  for (const payout of hand.payouts) {
    const seat = hand.seats.find(s => s.playerId === payout.playerId);
    if (seat) seat.stack += payout.amount;
  }

  hand.deckOrder = hand.deck.fullOrder();
  hand.actingSeat = null;
  hand.endedAt = Date.now();
  hand.phase = 'COMPLETE';
}

/**
 * A player who leaves or times out folds — and if it was their turn, the hand
 * carries on immediately rather than waiting for a client that is not there.
 */
export function forceFold(hand: HandState, playerId: string): HandState {
  const seat = seatOf(hand, playerId);
  if (seat.folded || hand.phase === 'COMPLETE') return hand;
  if (hand.actingSeat === seat.seat) return applyAction(hand, playerId, { type: 'fold' });
  seat.folded = true;
  record(hand, seat, 'fold', 0);
  if (onlyOneLeft(hand)) settle(hand);
  return hand;
}

/**
 * A timeout checks when checking is free and folds otherwise — the standard
 * behaviour, and the one that cannot be used to hurt the absent player more
 * than their absence already does.
 */
export function actOnTimeout(hand: HandState, playerId: string): HandState {
  const legal = actionsFor(hand, playerId);
  if (!legal) return hand;
  return applyAction(hand, playerId, { type: legal.canCheck ? 'check' : 'fold' });
}

/** Total chips in the middle right now — for display only. */
export function potTotal(hand: HandState): number {
  return hand.seats.reduce((sum, s) => sum + s.committedTotal, 0);
}
