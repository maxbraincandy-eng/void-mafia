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

import { cardToString, type Card } from '../engine/cards.js';
import { actionsFor, potTotal, type HandState, type SeatState } from '../engine/state.js';
import type { LegalActions } from '../engine/betting.js';
import type { PokerTable, Seat, TableSummary } from './types.js';

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
  pots: { amount: number; eligible: number }[];
  betToMatch: number;
  minRaiseTo: number;
  actingSeat: number | null;
  buttonSeat: number;
  /** Epoch ms the acting player's clock runs out, if anyone is to act. */
  actingDeadline: number | null;
  blinds: { small: number; big: number; ante: number };
  /** The shuffle commitment, published before the deal. Not provably fair. */
  deckHash: string;
  /** Revealed after settlement so the commitment can be checked. */
  deckSeed: string | null;
  lastAction: { playerId: string; type: string; amount: number; to: number } | null;
  payouts: { playerId: string; amount: number; uncontested: boolean }[];
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

function cards(list: Card[]): string[] { return list.map(cardToString); }

function handSeat(hand: HandState | null, seat: number): SeatState | undefined {
  return hand?.seats.find(s => s.seat === seat);
}

/**
 * Should `viewer` see the cards held at `seat`?
 *
 * Written as one small function on purpose: it is the whole information policy,
 * and it should be readable in five seconds by someone auditing it.
 */
function maySeeCards(viewerId: string | null, playerId: string, hand: HandState | null, inSeat: SeatState | undefined): boolean {
  if (viewerId !== null && viewerId === playerId) return true;      // your own cards
  if (!hand || !inSeat) return false;
  if (hand.phase !== 'COMPLETE' && hand.phase !== 'SETTLEMENT' && hand.phase !== 'SHOWDOWN') return false;
  return inSeat.revealed && !inSeat.folded;                          // shown at showdown
}

function seatView(
  table: PokerTable,
  seat: Seat,
  viewerId: string | null,
  deadline: number | null,
): SeatView {
  const hand = table.hand;
  const inHand = handSeat(hand, seat.seat);
  const shown = maySeeCards(viewerId, seat.player.playerId, hand, inHand);
  const showdown = hand?.showdown.find(s => s.playerId === seat.player.playerId);

  return {
    seat: seat.seat,
    playerId: seat.player.playerId,
    name: seat.player.name,
    avatar: seat.player.avatar,
    avatarUrl: seat.player.avatarUrl ?? null,
    // The live stack is the engine's while a hand is running: the seat's copy is
    // only refreshed at settlement, and showing it mid-hand would show a stack
    // that has not yet paid its bets.
    stack: inHand ? inHand.stack : seat.stack,
    connected: seat.connected,
    sittingOut: seat.sittingOut,
    handsPlayed: seat.handsPlayed,
    handsWon: seat.handsWon,
    inHand: Boolean(inHand),
    folded: inHand?.folded ?? false,
    allIn: inHand?.allIn ?? false,
    committedThisStreet: inHand?.committedThisStreet ?? 0,
    committedTotal: inHand?.committedTotal ?? 0,
    isButton: hand ? hand.buttonSeat === seat.seat : table.buttonSeat === seat.seat,
    isActing: hand?.actingSeat === seat.seat,
    cards: shown && inHand ? cards(inHand.hole) : null,
    cardCount: inHand ? inHand.hole.length : 0,
    handRank: shown && showdown ? showdown.description : null,
  };
}

function handView(table: PokerTable, hand: HandState, deadline: number | null): HandView {
  const last = hand.actions[hand.actions.length - 1] ?? null;
  return {
    handId: hand.handId,
    handNo: table.handNo,
    phase: hand.phase,
    board: cards(hand.board),
    pot: potTotal(hand),
    pots: hand.pots.map(p => ({ amount: p.amount, eligible: p.eligible.length })),
    betToMatch: hand.betToMatch,
    minRaiseTo: hand.minRaiseTo,
    actingSeat: hand.actingSeat,
    buttonSeat: hand.buttonSeat,
    actingDeadline: deadline,
    blinds: { small: hand.blinds.small, big: hand.blinds.big, ante: hand.blinds.ante },
    deckHash: hand.commitment.hash,
    // The seed is only published once the hand is over. Before that it is the
    // one piece of the commitment that must not be out in the world.
    deckSeed: hand.phase === 'COMPLETE' ? hand.commitment.seed : null,
    lastAction: last ? { playerId: last.playerId, type: last.type, amount: last.amount, to: last.to } : null,
    payouts: hand.payouts.map(p => ({ playerId: p.playerId, amount: p.amount, uncontested: p.uncontested })),
  };
}

/**
 * Build the table as one viewer is allowed to see it.
 *
 * `viewerId` is `null` for a spectator with no account context — they get the
 * public projection, which is the same one every opponent gets of every other
 * opponent.
 */
export function buildTableView(table: PokerTable, viewerId: string | null, deadline: number | null = null): TableView {
  const hand = table.hand;
  const mySeat = table.seats.find(s => s.player.playerId === viewerId) ?? null;

  return {
    id: table.id,
    code: table.code,
    name: table.config.name,
    hostId: table.hostId,
    status: table.status,
    maxSeats: table.config.maxSeats,
    config: {
      smallBlind: table.config.smallBlind,
      bigBlind: table.config.bigBlind,
      ante: table.config.ante,
      buyIn: table.config.buyIn,
      actionSeconds: table.config.actionSeconds,
      isPrivate: table.config.isPrivate,
    },
    seats: table.seats.map(s => seatView(table, s, viewerId, deadline)),
    observers: table.observers.size,
    handNo: table.handNo,
    actionSeq: table.actionSeq,
    hand: hand ? handView(table, hand, deadline) : null,
    youCan: hand && viewerId ? actionsFor(hand, viewerId) : null,
    yourSeat: mySeat ? mySeat.seat : null,
  };
}

/** The lobby row. No cards, no stacks, no hand state. */
export function buildTableSummary(table: PokerTable): TableSummary {
  const host = table.seats.find(s => s.player.playerId === table.hostId)?.player
    ?? table.observers.get(table.hostId);
  return {
    id: table.id,
    code: table.code,
    name: table.config.name,
    hostName: host?.name ?? '—',
    seated: table.seats.length,
    maxSeats: table.config.maxSeats,
    smallBlind: table.config.smallBlind,
    bigBlind: table.config.bigBlind,
    isPrivate: table.config.isPrivate,
    hasPassword: Boolean(table.config.password),
    status: table.status,
    handNo: table.handNo,
  };
}
