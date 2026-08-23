import { Deck, type Card, type Randomness, type ShuffleCommitment } from './cards.js';
import { type HandValue } from './evaluator.js';
import { type Payout, type Pot } from './pots.js';
import { type Action, type LegalActions } from './betting.js';
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
    showdown: {
        playerId: string;
        hand: HandValue;
        description: string;
    }[];
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
export declare class RuleError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/**
 * Deal a hand.
 *
 * Heads-up is not a special case bolted on: with two players the button IS the
 * small blind and acts first pre-flop, then last on every later street. The
 * blind order below produces that from the same code as a full ring.
 */
export declare function startHand(params: {
    tableId: string;
    buttonSeat: number;
    seats: SeatConfig[];
    blinds: Blinds;
    rng?: Randomness;
    handId?: string;
}): HandState;
/** What the player to act may do. Null when it is nobody's turn. */
export declare function actionsFor(hand: HandState, playerId: string): LegalActions | null;
/**
 * Apply one validated action and move the hand on.
 *
 * Throws `RuleError` rather than returning a flag, because every caller has to
 * treat an illegal action as an incident to log — not as an outcome to display.
 */
export declare function applyAction(hand: HandState, playerId: string, action: Action): HandState;
/**
 * A player who leaves or times out folds — and if it was their turn, the hand
 * carries on immediately rather than waiting for a client that is not there.
 */
export declare function forceFold(hand: HandState, playerId: string): HandState;
/**
 * A timeout checks when checking is free and folds otherwise — the standard
 * behaviour, and the one that cannot be used to hurt the absent player more
 * than their absence already does.
 */
export declare function actOnTimeout(hand: HandState, playerId: string): HandState;
/** Total chips in the middle right now — for display only. */
export declare function potTotal(hand: HandState): number;
//# sourceMappingURL=state.d.ts.map