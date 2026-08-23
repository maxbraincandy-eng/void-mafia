/**
 * The table service — everything that is not a rule.
 *
 * WHAT IT DOES
 * ────────────
 * Owns the tables. Seats people, gives a seat its gameplay chips, decides when
 * a hand starts, runs the action clock, holds a seat for a player whose phone
 * dropped, closes a table when the host leaves or the last player stands up,
 * and hands every state change to a sink so the socket layer can send it on.
 *
 * WHAT IT DOES NOT DO
 * ───────────────────
 * Decide anything about a hand of poker. It never inspects a card, never
 * compares two hands, never moves a chip into or out of a pot, never works out
 * whose turn it is. Every one of those questions goes to `engine/state.ts` and
 * comes back as a new `HandState`. If a rule needs changing, this file is the
 * wrong file.
 *
 * WHY IT TAKES A CLOCK AND A SINK
 * ───────────────────────────────
 * So it can be tested. With `ManualClock` and an array-collecting sink, a test
 * plays twenty hands, drops a player mid-street, expires their clock and
 * asserts what every viewer received — in about a millisecond, with no server,
 * no socket and no database. That is the difference between timers that are
 * tested and timers that are hoped about.
 *
 * CHIPS
 * ─────
 * `seat.stack` is a gameplay counter. It is granted when a player sits and
 * discarded when they stand: not credited, not stored, not carried anywhere.
 * That dead end is deliberate — see `server/src/future-economy/README.md`.
 */
import { type Randomness } from '../engine/cards.js';
import type { Action } from '../engine/betting.js';
import { type TableView } from './views.js';
import { type Clock } from './clock.js';
import { type AuditSink, type EventSink, type HistorySink, type PlayerRef, type PokerTable, type Seat, type TableConfig, type TableSummary } from './types.js';
export interface TableServiceDeps {
    emit: EventSink;
    audit?: AuditSink;
    history?: HistorySink;
    clock?: Clock;
    rng?: Randomness;
    newId?: () => string;
    newCode?: () => string;
}
/** Bounds a host may not exceed. A table is a game setting, not a free-form form. */
export declare const LIMITS: {
    readonly maxSeats: {
        readonly min: 2;
        readonly max: 9;
    };
    readonly smallBlind: {
        readonly min: 1;
        readonly max: 5000;
    };
    readonly buyIn: {
        readonly min: 100;
        readonly max: 1000000;
    };
    readonly actionSeconds: {
        readonly min: 10;
        readonly max: 120;
    };
    readonly nameLength: 40;
};
export declare class TableError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare class PokerTableService {
    private tables;
    private byCode;
    /** One action timer per table, and the deadline it will fire at. */
    private actionTimers;
    /** At most one pending "deal the next hand" per table. */
    private startTimers;
    private otherTimers;
    private readonly clock;
    private readonly rng;
    private readonly emit;
    private readonly audit;
    private readonly history;
    private readonly newId;
    private readonly newCode;
    constructor(deps: TableServiceDeps);
    listTables(): TableSummary[];
    getTable(tableId: string): PokerTable | null;
    getTableByCode(code: string): PokerTable | null;
    /** Every table this player is seated at or watching — for reconnect. */
    tablesFor(playerId: string): PokerTable[];
    createTable(host: PlayerRef, patch: Partial<TableConfig> & {
        name?: string;
    }): PokerTable;
    private validateConfig;
    joinTable(code: string, player: PlayerRef, password?: string): PokerTable;
    sit(tableId: string, player: PlayerRef, seatNo: number): Seat;
    /**
     * Stand up.
     *
     * A live hand is folded first — the chips already in the pot stay in the pot,
     * which is the only answer that is fair to the players still in it.
     */
    leave(tableId: string, playerId: string): void;
    /**
     * Sit out or come back.
     *
     * Sitting out takes effect from the next deal — a hand already dealt is still
     * the player's to finish. Leaving mid-hand is what folding is for.
     */
    sitOut(tableId: string, playerId: string, out: boolean): void;
    /**
     * Top up a busted seat.
     *
     * Free, unlimited, and only when the stack is empty and no hand is live —
     * because the chips are a gameplay counter and running out of them should end
     * a hand, not an evening. A rebuy that could happen mid-hand would let a
     * player reload after seeing a card, so it cannot.
     */
    rebuy(tableId: string, playerId: string): void;
    /**
     * A socket dropped or came back.
     *
     * A dropped player keeps their seat for `disconnectGraceSeconds` — long
     * enough to walk through a tunnel — and their clock keeps running in any live
     * hand, because the other players should not wait for someone who is not
     * there. When the grace period expires the seat is released.
     */
    setConnected(playerId: string, connected: boolean): void;
    private markConnected;
    /** After a reconnect: the caller's own view, rebuilt from authoritative state. */
    resume(playerId: string): {
        table: TableView;
    }[];
    /**
     * The only way a player changes a hand.
     *
     * Three checks before the engine is even asked: the player is seated here,
     * the hand they think they are acting in is the hand that is running, and
     * their `actionSeq` matches the server's. The third is what makes a captured
     * packet replayed ten times a no-op instead of ten bets.
     */
    act(tableId: string, playerId: string, params: {
        handId: string;
        actionSeq: number;
        action: Action;
    }): void;
    /**
     * Schedule a hand if the table can support one. Safe to call at any time,
     * from anywhere, as often as you like — it is idempotent.
     *
     * The deal is always one interval away, never immediate. Dealing the instant
     * a second player sits down means the third person to arrive walks into a
     * hand they were not dealt into and has to watch it out; the pause is what
     * lets a table fill up. It is the same pause used between hands, so there is
     * one answer to "when does the next hand start" rather than two.
     */
    private maybeStartHand;
    /**
     * Who gets dealt in.
     *
     * A disconnected player inside their grace period is still dealt in: they may
     * well be back before the action reaches them, and if they are not, the short
     * clock in `startActionTimer` folds them without holding the table up.
     */
    private playable;
    private dealHand;
    /**
     * Run one engine call and deal with everything that follows from it: the
     * clock, the broadcast, settlement, the next hand.
     *
     * Every path that changes a hand goes through here, so there is one place
     * where "what happens after the rules have spoken" is decided.
     */
    private runEngine;
    private afterEngine;
    private settle;
    private buildHistory;
    private startActionTimer;
    private clearActionTimer;
    private later;
    private clearTimers;
    closeTable(table: PokerTable, reason: string): void;
    /** Admin/host: close a table. Cannot change a result — there is no such call. */
    closeTableById(tableId: string, actorId: string, reason?: string): void;
    /** Process shutdown: stop every timer so nothing fires into a dead process. */
    shutdown(): void;
    viewFor(table: PokerTable, viewerId: string | null): TableView;
    /**
     * Send the table to everyone — as a **separate view per person**, never one
     * shared object. This is the loop that keeps hole cards where they belong.
     */
    private pushTable;
    private emitToTable;
    private broadcastList;
    private reject;
    private log;
    private require;
}
//# sourceMappingURL=tableService.d.ts.map