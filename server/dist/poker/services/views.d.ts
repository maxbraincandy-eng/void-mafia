/**
 * Per-viewer projection.
 *
 * This file is the reason a player cannot see another player's cards, and it is
 * worth being precise about how: opponents' hole cards are not encrypted, not
 * flagged `hidden: true`, not omitted by the UI. They are **not in the object**.
 * Anything a client could inspect, log, or patch out of a render is something
 * that was never sent.
 *
 * The rule this file exists to enforce:
 *
 *   a card belonging to seat X appears in the payload sent to viewer Y
 *   if and only if X === Y, or the hand has ended and X had to show.
 *
 * `viewsNeverLeakCards` in the test file asserts exactly that sentence over
 * random hands, and it is the test to keep green above all others here.
 */
import { type HandState } from '../engine/state.js';
import type { LegalActions } from '../engine/betting.js';
import type { PokerTable, TableSummary } from './types.js';
export interface SeatView {
    seat: number;
    playerId: string;
    name: string;
    avatar?: string;
    avatarUrl?: string | null;
    stack: number;
    connected: boolean;
    sittingOut: boolean;
    handsPlayed: number;
    handsWon: number;
    /** In the current hand. */
    inHand: boolean;
    folded: boolean;
    allIn: boolean;
    committedThisStreet: number;
    committedTotal: number;
    isButton: boolean;
    isActing: boolean;
    /** Present only for the viewer's own seat, or for a revealed showdown hand. */
    cards: string[] | null;
    /** How many cards this seat holds — the count is public, the faces are not. */
    cardCount: number;
    handRank: string | null;
}
export interface HandView {
    handId: string;
    handNo: number;
    phase: HandState['phase'];
    board: string[];
    pot: number;
    pots: {
        amount: number;
        eligible: number;
    }[];
    betToMatch: number;
    minRaiseTo: number;
    actingSeat: number | null;
    buttonSeat: number;
    /** Epoch ms the acting player's clock runs out, if anyone is to act. */
    actingDeadline: number | null;
    blinds: {
        small: number;
        big: number;
        ante: number;
    };
    /** The shuffle commitment, published before the deal. Not provably fair. */
    deckHash: string;
    /** Revealed after settlement so the commitment can be checked. */
    deckSeed: string | null;
    lastAction: {
        playerId: string;
        type: string;
        amount: number;
        to: number;
    } | null;
    payouts: {
        playerId: string;
        amount: number;
        uncontested: boolean;
    }[];
}
export interface TableView {
    id: string;
    code: string;
    name: string;
    hostId: string;
    status: PokerTable['status'];
    maxSeats: number;
    config: {
        smallBlind: number;
        bigBlind: number;
        ante: number;
        buyIn: number;
        actionSeconds: number;
        isPrivate: boolean;
    };
    seats: SeatView[];
    observers: number;
    handNo: number;
    actionSeq: number;
    hand: HandView | null;
    /** Only ever the viewer's own. Null when it is not their turn. */
    youCan: LegalActions | null;
    /** The viewer's seat number, or null if they are watching. */
    yourSeat: number | null;
}
/**
 * Build the table as one viewer is allowed to see it.
 *
 * `viewerId` is `null` for a spectator with no account context — they get the
 * public projection, which is the same one every opponent gets of every other
 * opponent.
 */
export declare function buildTableView(table: PokerTable, viewerId: string | null, deadline?: number | null): TableView;
/** The lobby row. No cards, no stacks, no hand state. */
export declare function buildTableSummary(table: PokerTable): TableSummary;
//# sourceMappingURL=views.d.ts.map