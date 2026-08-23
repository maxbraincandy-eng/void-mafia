/**
 * The client's view of poker.
 *
 * These mirror `server/src/poker/services/views.ts` exactly. Note what is NOT
 * here: there is no type for an opponent's cards, because there is no payload
 * that carries them. `SeatView.cards` is `string[] | null` and it is null for
 * everybody but you until a showdown — the client cannot render what it was
 * never sent, which is the point.
 */

export interface PokerLegalActions {
  seat: number;
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  canAllIn: boolean;
  allInTo: number;
}

export type PokerPhase =
  | 'STARTING' | 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER'
  | 'SHOWDOWN' | 'SETTLEMENT' | 'COMPLETE';

export interface PokerSeatView {
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
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  committedThisStreet: number;
  committedTotal: number;
  isButton: boolean;
  isActing: boolean;
  /** Yours, or a hand shown at a showdown. Null otherwise — and not sent. */
  cards: string[] | null;
  cardCount: number;
  handRank: string | null;
}

export interface PokerHandView {
  handId: string;
  handNo: number;
  phase: PokerPhase;
  board: string[];
  pot: number;
  pots: { amount: number; eligible: number }[];
  betToMatch: number;
  minRaiseTo: number;
  actingSeat: number | null;
  buttonSeat: number;
  actingDeadline: number | null;
  blinds: { small: number; big: number; ante: number };
  deckHash: string;
  deckSeed: string | null;
  lastAction: { playerId: string; type: string; amount: number; to: number } | null;
  payouts: { playerId: string; amount: number; uncontested: boolean }[];
}

export interface PokerTableView {
  id: string;
  code: string;
  name: string;
  hostId: string;
  status: 'open' | 'playing' | 'closed';
  maxSeats: number;
  config: {
    smallBlind: number;
    bigBlind: number;
    ante: number;
    buyIn: number;
    actionSeconds: number;
    isPrivate: boolean;
  };
  seats: PokerSeatView[];
  observers: number;
  handNo: number;
  actionSeq: number;
  hand: PokerHandView | null;
  youCan: PokerLegalActions | null;
  yourSeat: number | null;
}

export interface PokerTableSummary {
  id: string;
  code: string;
  name: string;
  hostName: string;
  seated: number;
  maxSeats: number;
  smallBlind: number;
  bigBlind: number;
  isPrivate: boolean;
  hasPassword: boolean;
  status: 'open' | 'playing' | 'closed';
  handNo: number;
}

export interface PokerCompliance {
  notice: {
    noticeShort: string;
    noticeLong: string;
    termsUrl: string | null;
    minimumAge: number | null;
    productDescriptor: string;
  };
  facts: {
    chipsHaveCashValue: false;
    depositEnabled: boolean;
    withdrawalEnabled: boolean;
    playerToPlayerTransferEnabled: boolean;
    redemptionEnabled: boolean;
    realMoneyWagering: false;
  };
}

export interface PokerChatMessage {
  tableId: string;
  playerId: string;
  name: string;
  text: string;
  at: number;
}

export interface PokerSettlement {
  tableId: string;
  handId: string;
  pots: { amount: number; eligible: string[] }[];
  payouts: { playerId: string; amount: number; potIndex: number; uncontested: boolean }[];
  showdown: { playerId: string; description: string }[];
  deckSeed: string;
  stacks: { playerId: string; stack: number }[];
}
