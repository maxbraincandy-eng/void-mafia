/**
 * The shapes the table service owns, kept apart from the service itself so the
 * view builder can depend on them without depending on the machinery.
 */
import type { HandState } from '../engine/state.js';
export interface PlayerRef {
    playerId: string;
    name: string;
    avatar?: string;
    avatarUrl?: string | null;
}
export interface TableConfig {
    name: string;
    maxSeats: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    /** Gameplay chips a seat starts with. A game setting, not a purchase. */
    buyIn: number;
    actionSeconds: number;
    isPrivate: boolean;
    password: string | null;
    /** Seconds between a settled hand and the next deal. */
    handIntervalSeconds: number;
    /** Seconds a disconnected player keeps their seat before sitting out. */
    disconnectGraceSeconds: number;
}
export declare const DEFAULT_TABLE_CONFIG: Omit<TableConfig, 'name'>;
export type TableStatus = 'open' | 'playing' | 'closed';
export interface Seat {
    seat: number;
    player: PlayerRef;
    /** Gameplay chips at this seat. Discarded when the player stands up. */
    stack: number;
    sittingOut: boolean;
    connected: boolean;
    joinedAt: number;
    handsPlayed: number;
    handsWon: number;
    /** Set while the player is away; the seat is released when it expires. */
    disconnectedAt: number | null;
}
export interface PokerTable {
    id: string;
    code: string;
    config: TableConfig;
    hostId: string;
    status: TableStatus;
    seats: Seat[];
    /** Watching, not seated. */
    observers: Map<string, PlayerRef>;
    hand: HandState | null;
    handNo: number;
    buttonSeat: number;
    sessionId: string;
    createdAt: number;
    closedAt: number | null;
    closeReason: string | null;
    /**
     * Increments on every applied action. A client echoes the value it last saw;
     * an action carrying any other value is a duplicate or a replay and is
     * refused. See `01-architecture.md` §5.
     */
    actionSeq: number;
    /** Set when the host stands up mid-hand: close as soon as the hand ends. */
    closeAfterHand: boolean;
}
/** What the lobby list shows. Never includes a card or a stack. */
export interface TableSummary {
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
    status: TableStatus;
    handNo: number;
}
export interface TableEvent {
    tableId: string;
    /** Empty means everyone at the table. */
    playerIds: string[];
    event: string;
    payload: unknown;
}
/** Where the service sends what happened. The socket layer implements it. */
export type EventSink = (event: TableEvent) => void;
export interface AuditEntry {
    at: number;
    actorId: string | null;
    actorKind: 'player' | 'admin' | 'system';
    event: string;
    tableId?: string;
    handId?: string;
    detail?: Record<string, unknown>;
}
export type AuditSink = (entry: AuditEntry) => void;
/** Written once, at settlement. Never updated. See `02-database.md` §2.4. */
export interface HandHistory {
    handId: string;
    sessionId: string;
    tableId: string;
    handNo: number;
    buttonSeat: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    board: string[];
    actions: HandState['actions'];
    potTotal: number;
    deckHash: string;
    deckSeed: string;
    deckOrder: string[];
    startedAt: number;
    endedAt: number;
    players: {
        playerId: string;
        seat: number;
        holeCards: string[];
        contributed: number;
        won: number;
        net: number;
        showed: boolean;
        handRank: string | null;
    }[];
}
export type HistorySink = (history: HandHistory) => void;
//# sourceMappingURL=types.d.ts.map