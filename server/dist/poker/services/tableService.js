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
import { cardToString, cryptoRandomness } from '../engine/cards.js';
import { applyAction, actOnTimeout, forceFold, startHand, potTotal, RuleError, } from '../engine/state.js';
import { buildTableSummary, buildTableView } from './views.js';
import { systemClock } from './clock.js';
import { DEFAULT_TABLE_CONFIG, } from './types.js';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Bounds a host may not exceed. A table is a game setting, not a free-form form. */
export const LIMITS = {
    maxSeats: { min: 2, max: 9 },
    smallBlind: { min: 1, max: 5000 },
    buyIn: { min: 100, max: 1000000 },
    actionSeconds: { min: 10, max: 120 },
    nameLength: 40,
};
export class TableError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
export class PokerTableService {
    constructor(deps) {
        this.tables = new Map();
        this.byCode = new Map();
        /** One action timer per table, and the deadline it will fire at. */
        this.actionTimers = new Map();
        /** At most one pending "deal the next hand" per table. */
        this.startTimers = new Map();
        this.otherTimers = new Map();
        this.clock = deps.clock ?? systemClock;
        this.rng = deps.rng ?? cryptoRandomness;
        this.emit = deps.emit;
        this.audit = deps.audit ?? (() => { });
        this.history = deps.history ?? (() => { });
        let n = 0;
        this.newId = deps.newId ?? (() => `pt_${Date.now().toString(36)}_${(n++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
        this.newCode = deps.newCode ?? (() => {
            let code = '';
            for (let i = 0; i < 6; i++)
                code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
            return code;
        });
    }
    // ─── Lobby ────────────────────────────────────────────────────────────────
    listTables() {
        return [...this.tables.values()]
            .filter(t => t.status !== 'closed' && !t.config.isPrivate)
            // A table nobody is connected to is not a table anybody should join.
            .filter(t => t.seats.some(s => s.connected) || t.observers.size > 0)
            .map(buildTableSummary)
            .sort((a, b) => b.seated - a.seated);
    }
    getTable(tableId) { return this.tables.get(tableId) ?? null; }
    getTableByCode(code) {
        const id = this.byCode.get(code.toUpperCase());
        return id ? this.tables.get(id) ?? null : null;
    }
    /** Every table this player is seated at or watching — for reconnect. */
    tablesFor(playerId) {
        return [...this.tables.values()].filter(t => t.status !== 'closed'
            && (t.seats.some(s => s.player.playerId === playerId) || t.observers.has(playerId)));
    }
    createTable(host, patch) {
        const config = this.validateConfig({
            ...DEFAULT_TABLE_CONFIG,
            name: (patch.name ?? `${host.name}'s table`).slice(0, LIMITS.nameLength),
            ...patch,
        });
        let code = this.newCode();
        for (let tries = 0; this.byCode.has(code) && tries < 20; tries++)
            code = this.newCode();
        if (this.byCode.has(code))
            throw new TableError('CODE_COLLISION', 'Could not allocate a table code.');
        const table = {
            id: this.newId(),
            code,
            config,
            hostId: host.playerId,
            status: 'open',
            seats: [],
            observers: new Map([[host.playerId, host]]),
            hand: null,
            handNo: 0,
            buttonSeat: 0,
            sessionId: this.newId(),
            createdAt: this.clock.now(),
            closedAt: null,
            closeReason: null,
            actionSeq: 0,
            closeAfterHand: false,
        };
        this.tables.set(table.id, table);
        this.byCode.set(code, table.id);
        this.log('table_created', host.playerId, 'player', { tableId: table.id, detail: { code, config } });
        this.broadcastList();
        return table;
    }
    validateConfig(config) {
        const clamp = (v, min, max) => Math.max(min, Math.min(max, Math.floor(v)));
        const smallBlind = clamp(config.smallBlind, LIMITS.smallBlind.min, LIMITS.smallBlind.max);
        const out = {
            ...config,
            name: config.name.trim().slice(0, LIMITS.nameLength) || 'Table',
            maxSeats: clamp(config.maxSeats, LIMITS.maxSeats.min, LIMITS.maxSeats.max),
            smallBlind,
            bigBlind: clamp(config.bigBlind || smallBlind * 2, smallBlind, smallBlind * 10),
            ante: clamp(config.ante, 0, smallBlind),
            buyIn: clamp(config.buyIn, LIMITS.buyIn.min, LIMITS.buyIn.max),
            actionSeconds: clamp(config.actionSeconds, LIMITS.actionSeconds.min, LIMITS.actionSeconds.max),
            handIntervalSeconds: clamp(config.handIntervalSeconds, 1, 30),
            disconnectGraceSeconds: clamp(config.disconnectGraceSeconds, 10, 300),
        };
        // A buy-in that cannot cover a blind produces a table where every hand is an
        // all-in. That is not a rule, it is a broken setting, so it is refused here.
        if (out.buyIn < out.bigBlind * 10) {
            throw new TableError('BUY_IN_TOO_SMALL', 'The starting stack must be at least ten big blinds.');
        }
        return out;
    }
    // ─── Joining and seating ──────────────────────────────────────────────────
    joinTable(code, player, password) {
        const table = this.getTableByCode(code);
        if (!table || table.status === 'closed')
            throw new TableError('NO_TABLE', 'That table is not open.');
        if (table.config.password && table.config.password !== password) {
            this.log('join_rejected', player.playerId, 'player', { tableId: table.id, detail: { reason: 'password' } });
            throw new TableError('BAD_PASSWORD', 'Wrong table password.');
        }
        const seated = table.seats.find(s => s.player.playerId === player.playerId);
        if (seated) {
            // A rejoin, not a new arrival: refresh the identity and clear the away flag.
            seated.player = { ...seated.player, ...player };
            this.markConnected(table, player.playerId, true);
        }
        else {
            table.observers.set(player.playerId, player);
        }
        this.pushTable(table);
        return table;
    }
    sit(tableId, player, seatNo) {
        const table = this.require(tableId);
        if (table.status === 'closed')
            throw new TableError('CLOSED', 'That table has closed.');
        if (table.seats.some(s => s.player.playerId === player.playerId)) {
            throw new TableError('ALREADY_SEATED', 'You are already at this table.');
        }
        if (!Number.isInteger(seatNo) || seatNo < 0 || seatNo >= table.config.maxSeats) {
            throw new TableError('BAD_SEAT', 'That seat does not exist.');
        }
        if (table.seats.some(s => s.seat === seatNo))
            throw new TableError('SEAT_TAKEN', 'That seat is taken.');
        const seat = {
            seat: seatNo,
            player,
            // Gameplay chips, granted from nothing. See the file header.
            stack: table.config.buyIn,
            sittingOut: false,
            connected: true,
            joinedAt: this.clock.now(),
            handsPlayed: 0,
            handsWon: 0,
            disconnectedAt: null,
        };
        table.seats.push(seat);
        table.seats.sort((a, b) => a.seat - b.seat);
        table.observers.delete(player.playerId);
        this.log('seat_taken', player.playerId, 'player', { tableId, detail: { seat: seatNo, buyIn: seat.stack } });
        this.pushTable(table);
        this.broadcastList();
        this.maybeStartHand(table);
        return seat;
    }
    /**
     * Stand up.
     *
     * A live hand is folded first — the chips already in the pot stay in the pot,
     * which is the only answer that is fair to the players still in it.
     */
    leave(tableId, playerId) {
        const table = this.tables.get(tableId);
        if (!table)
            return;
        const seat = table.seats.find(s => s.player.playerId === playerId);
        if (seat) {
            if (table.hand && table.hand.phase !== 'COMPLETE' && table.hand.seats.some(s => s.playerId === playerId)) {
                this.runEngine(table, hand => forceFold(hand, playerId));
            }
            table.seats = table.seats.filter(s => s.player.playerId !== playerId);
            // The chips go nowhere. There is no balance to credit them to.
            this.log('seat_left', playerId, 'player', { tableId, detail: { seat: seat.seat, stack: seat.stack } });
        }
        table.observers.delete(playerId);
        // The house rule across this app: the host leaves, the room closes. Mid-hand
        // it waits for the hand to finish rather than yanking a pot away from the
        // players contesting it.
        if (playerId === table.hostId) {
            if (table.hand && table.hand.phase !== 'COMPLETE')
                table.closeAfterHand = true;
            else {
                this.closeTable(table, 'host_left');
                return;
            }
        }
        if (table.seats.length === 0 && table.observers.size === 0) {
            this.closeTable(table, 'empty');
            return;
        }
        this.pushTable(table);
        this.broadcastList();
        this.maybeStartHand(table);
    }
    /**
     * Sit out or come back.
     *
     * Sitting out takes effect from the next deal — a hand already dealt is still
     * the player's to finish. Leaving mid-hand is what folding is for.
     */
    sitOut(tableId, playerId, out) {
        const table = this.require(tableId);
        const seat = table.seats.find(s => s.player.playerId === playerId);
        if (!seat)
            throw new TableError('NOT_SEATED', 'You are not seated at this table.');
        seat.sittingOut = out;
        this.pushTable(table);
        if (!out)
            this.maybeStartHand(table);
    }
    /**
     * Top up a busted seat.
     *
     * Free, unlimited, and only when the stack is empty and no hand is live —
     * because the chips are a gameplay counter and running out of them should end
     * a hand, not an evening. A rebuy that could happen mid-hand would let a
     * player reload after seeing a card, so it cannot.
     */
    rebuy(tableId, playerId) {
        const table = this.require(tableId);
        const seat = table.seats.find(s => s.player.playerId === playerId);
        if (!seat)
            throw new TableError('NOT_SEATED', 'You are not seated at this table.');
        if (seat.stack > 0)
            throw new TableError('HAS_CHIPS', 'You still have chips.');
        if (table.hand && table.hand.seats.some(s => s.playerId === playerId && !s.folded) && table.hand.phase !== 'COMPLETE') {
            throw new TableError('HAND_IN_PROGRESS', 'Wait for the hand to finish.');
        }
        seat.stack = table.config.buyIn;
        this.log('rebuy', playerId, 'player', { tableId, detail: { amount: seat.stack } });
        this.pushTable(table);
        this.maybeStartHand(table);
    }
    // ─── Connection state ─────────────────────────────────────────────────────
    /**
     * A socket dropped or came back.
     *
     * A dropped player keeps their seat for `disconnectGraceSeconds` — long
     * enough to walk through a tunnel — and their clock keeps running in any live
     * hand, because the other players should not wait for someone who is not
     * there. When the grace period expires the seat is released.
     */
    setConnected(playerId, connected) {
        for (const table of this.tablesFor(playerId))
            this.markConnected(table, playerId, connected);
    }
    markConnected(table, playerId, connected) {
        const seat = table.seats.find(s => s.player.playerId === playerId);
        if (!seat || seat.connected === connected) {
            if (seat)
                seat.disconnectedAt = connected ? null : seat.disconnectedAt;
            return;
        }
        seat.connected = connected;
        seat.disconnectedAt = connected ? null : this.clock.now();
        if (!connected) {
            const grace = table.config.disconnectGraceSeconds * 1000;
            this.later(table, () => {
                const still = table.seats.find(s => s.player.playerId === playerId);
                if (still && !still.connected) {
                    this.log('seat_released', playerId, 'system', { tableId: table.id, detail: { reason: 'disconnect_grace' } });
                    this.leave(table.id, playerId);
                }
            }, grace);
        }
        this.pushTable(table);
    }
    /** After a reconnect: the caller's own view, rebuilt from authoritative state. */
    resume(playerId) {
        return this.tablesFor(playerId).map(table => {
            this.markConnected(table, playerId, true);
            return { table: this.viewFor(table, playerId) };
        });
    }
    // ─── Playing ──────────────────────────────────────────────────────────────
    /**
     * The only way a player changes a hand.
     *
     * Three checks before the engine is even asked: the player is seated here,
     * the hand they think they are acting in is the hand that is running, and
     * their `actionSeq` matches the server's. The third is what makes a captured
     * packet replayed ten times a no-op instead of ten bets.
     */
    act(tableId, playerId, params) {
        const table = this.require(tableId);
        const hand = table.hand;
        if (!hand || hand.phase === 'COMPLETE')
            throw new TableError('NO_HAND', 'There is no hand to act in.');
        if (hand.handId !== params.handId) {
            this.reject(table, playerId, 'HAND_MISMATCH', { sent: params.handId, current: hand.handId });
            throw new TableError('HAND_MISMATCH', 'That hand has already finished.');
        }
        if (params.actionSeq !== table.actionSeq) {
            this.reject(table, playerId, 'SEQ_MISMATCH', { sent: params.actionSeq, current: table.actionSeq });
            throw new TableError('SEQ_MISMATCH', 'That action is out of date.');
        }
        if (!table.seats.some(s => s.player.playerId === playerId)) {
            this.reject(table, playerId, 'NOT_SEATED', {});
            throw new TableError('NOT_SEATED', 'You are not seated at this table.');
        }
        try {
            this.runEngine(table, h => applyAction(h, playerId, params.action));
        }
        catch (err) {
            if (err instanceof RuleError) {
                this.reject(table, playerId, err.code, { action: params.action });
                throw new TableError(err.code, err.message);
            }
            throw err;
        }
    }
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
    maybeStartHand(table) {
        if (table.status === 'closed')
            return;
        if (table.hand && table.hand.phase !== 'COMPLETE')
            return;
        if (this.startTimers.has(table.id))
            return;
        if (this.playable(table).length < 2) {
            table.status = 'open';
            return;
        }
        const handle = this.clock.setTimeout(() => {
            this.startTimers.delete(table.id);
            if (table.status === 'closed')
                return;
            if (table.hand && table.hand.phase !== 'COMPLETE')
                return;
            if (this.playable(table).length < 2) {
                table.status = 'open';
                this.pushTable(table);
                return;
            }
            this.dealHand(table);
        }, table.config.handIntervalSeconds * 1000);
        this.startTimers.set(table.id, handle);
    }
    /**
     * Who gets dealt in.
     *
     * A disconnected player inside their grace period is still dealt in: they may
     * well be back before the action reaches them, and if they are not, the short
     * clock in `startActionTimer` folds them without holding the table up.
     */
    playable(table) {
        return table.seats.filter(s => !s.sittingOut && s.stack > 0);
    }
    dealHand(table) {
        const ready = this.playable(table);
        if (ready.length < 2)
            return;
        // The button moves to the next occupied seat, wrapping — which is also what
        // makes heads-up work: with two seats it simply alternates.
        const seatNos = ready.map(s => s.seat).sort((a, b) => a - b);
        const next = seatNos.find(n => n > table.buttonSeat);
        table.buttonSeat = next ?? seatNos[0];
        table.handNo += 1;
        table.status = 'playing';
        table.actionSeq += 1;
        const hand = startHand({
            tableId: table.id,
            handId: this.newId(),
            buttonSeat: table.buttonSeat,
            seats: ready.map(s => ({ playerId: s.player.playerId, seat: s.seat, stack: s.stack })),
            blinds: { small: table.config.smallBlind, big: table.config.bigBlind, ante: table.config.ante },
            rng: this.rng,
        });
        table.hand = hand;
        for (const s of ready)
            s.handsPlayed += 1;
        this.log('hand_started', null, 'system', {
            tableId: table.id, handId: hand.handId,
            detail: { handNo: table.handNo, button: table.buttonSeat, deckHash: hand.commitment.hash },
        });
        // The commitment goes out before anyone can act, which is the only moment at
        // which publishing it means anything.
        this.emitToTable(table, 'poker:hand_start', {
            tableId: table.id, handId: hand.handId, handNo: table.handNo,
            buttonSeat: table.buttonSeat, deckHash: hand.commitment.hash,
        });
        this.afterEngine(table);
    }
    /**
     * Run one engine call and deal with everything that follows from it: the
     * clock, the broadcast, settlement, the next hand.
     *
     * Every path that changes a hand goes through here, so there is one place
     * where "what happens after the rules have spoken" is decided.
     */
    runEngine(table, fn) {
        if (!table.hand)
            return;
        table.hand = fn(table.hand);
        table.actionSeq += 1;
        this.afterEngine(table);
    }
    afterEngine(table) {
        const hand = table.hand;
        if (!hand)
            return;
        this.clearActionTimer(table.id);
        if (hand.phase === 'COMPLETE') {
            this.settle(table);
            return;
        }
        if (hand.actingSeat !== null) {
            const acting = hand.seats.find(s => s.seat === hand.actingSeat);
            if (acting)
                this.startActionTimer(table, acting.playerId);
        }
        this.pushTable(table);
    }
    settle(table) {
        const hand = table.hand;
        if (!hand)
            return;
        // The engine's stacks are authoritative; the seats are a copy that only
        // catches up here, once, when the chips have finished moving.
        for (const seat of table.seats) {
            const inHand = hand.seats.find(s => s.playerId === seat.player.playerId);
            if (inHand)
                seat.stack = inHand.stack;
            const won = hand.payouts.filter(p => p.playerId === seat.player.playerId).reduce((a, p) => a + p.amount, 0);
            const contributed = inHand?.committedTotal ?? 0;
            if (won > contributed)
                seat.handsWon += 1;
        }
        const history = this.buildHistory(table, hand);
        this.history(history);
        this.log('hand_settled', null, 'system', {
            tableId: table.id, handId: hand.handId, detail: { pot: history.potTotal },
        });
        this.pushTable(table);
        this.emitToTable(table, 'poker:settlement', {
            tableId: table.id,
            handId: hand.handId,
            pots: hand.pots.map(p => ({ amount: p.amount, eligible: p.eligible })),
            payouts: hand.payouts,
            showdown: hand.showdown.map(s => ({ playerId: s.playerId, description: s.description })),
            // Published now that the hand is over, so the pre-deal hash can be checked.
            deckSeed: hand.commitment.seed,
            stacks: table.seats.map(s => ({ playerId: s.player.playerId, stack: s.stack })),
        });
        if (table.closeAfterHand) {
            this.closeTable(table, 'host_left');
            return;
        }
        this.maybeStartHand(table);
    }
    buildHistory(table, hand) {
        return {
            handId: hand.handId,
            sessionId: table.sessionId,
            tableId: table.id,
            handNo: table.handNo,
            buttonSeat: hand.buttonSeat,
            smallBlind: hand.blinds.small,
            bigBlind: hand.blinds.big,
            ante: hand.blinds.ante,
            board: hand.board.map(cardToString),
            actions: hand.actions,
            potTotal: potTotal(hand),
            deckHash: hand.commitment.hash,
            deckSeed: hand.commitment.seed,
            deckOrder: hand.deckOrder.map(cardToString),
            startedAt: hand.startedAt,
            endedAt: hand.endedAt ?? this.clock.now(),
            players: hand.seats.map(s => {
                const won = hand.payouts.filter(p => p.playerId === s.playerId).reduce((a, p) => a + p.amount, 0);
                const shown = hand.showdown.find(x => x.playerId === s.playerId);
                return {
                    playerId: s.playerId,
                    seat: s.seat,
                    // Written only now, at settlement. Nothing reads a live hand's cards.
                    holeCards: s.hole.map(cardToString),
                    contributed: s.committedTotal,
                    won,
                    net: won - s.committedTotal,
                    showed: s.revealed && !s.folded,
                    handRank: shown?.description ?? null,
                };
            }),
        };
    }
    // ─── Timers ───────────────────────────────────────────────────────────────
    startActionTimer(table, playerId) {
        const seat = table.seats.find(s => s.player.playerId === playerId);
        // A player who is not there gets a much shorter clock: the table should not
        // stall for half a minute on an empty chair.
        const seconds = seat && !seat.connected ? Math.min(5, table.config.actionSeconds) : table.config.actionSeconds;
        const deadline = this.clock.now() + seconds * 1000;
        const handle = this.clock.setTimeout(() => {
            this.actionTimers.delete(table.id);
            const hand = table.hand;
            if (!hand || hand.phase === 'COMPLETE')
                return;
            const acting = hand.seats.find(s => s.seat === hand.actingSeat);
            if (!acting || acting.playerId !== playerId)
                return;
            this.log('timeout_action', playerId, 'system', { tableId: table.id, handId: hand.handId });
            this.runEngine(table, h => actOnTimeout(h, playerId));
        }, deadline - this.clock.now());
        this.actionTimers.set(table.id, { handle, deadline, playerId });
    }
    clearActionTimer(tableId) {
        const existing = this.actionTimers.get(tableId);
        if (existing) {
            this.clock.clearTimeout(existing.handle);
            this.actionTimers.delete(tableId);
        }
    }
    later(table, fn, ms) {
        const handle = this.clock.setTimeout(() => {
            const list = this.otherTimers.get(table.id) ?? [];
            this.otherTimers.set(table.id, list.filter(h => h !== handle));
            fn();
        }, ms);
        this.otherTimers.set(table.id, [...(this.otherTimers.get(table.id) ?? []), handle]);
    }
    clearTimers(tableId) {
        this.clearActionTimer(tableId);
        const start = this.startTimers.get(tableId);
        if (start) {
            this.clock.clearTimeout(start);
            this.startTimers.delete(tableId);
        }
        for (const handle of this.otherTimers.get(tableId) ?? [])
            this.clock.clearTimeout(handle);
        this.otherTimers.delete(tableId);
    }
    // ─── Closing ──────────────────────────────────────────────────────────────
    closeTable(table, reason) {
        if (table.status === 'closed')
            return;
        table.status = 'closed';
        table.closedAt = this.clock.now();
        table.closeReason = reason;
        this.clearTimers(table.id);
        this.log('table_closed', null, 'system', { tableId: table.id, detail: { reason } });
        this.emitToTable(table, 'poker:closed', { tableId: table.id, reason });
        this.byCode.delete(table.code);
        // The record stays in memory briefly so a late `resume` gets "closed"
        // rather than "no such table", then it goes.
        this.later(table, () => this.tables.delete(table.id), 60000);
        this.broadcastList();
    }
    /** Admin/host: close a table. Cannot change a result — there is no such call. */
    closeTableById(tableId, actorId, reason = 'closed_by_host') {
        const table = this.require(tableId);
        if (table.hostId !== actorId)
            throw new TableError('NOT_HOST', 'Only the host can close the table.');
        this.closeTable(table, reason);
    }
    /** Process shutdown: stop every timer so nothing fires into a dead process. */
    shutdown() {
        for (const id of this.tables.keys())
            this.clearTimers(id);
    }
    // ─── Emitting ─────────────────────────────────────────────────────────────
    viewFor(table, viewerId) {
        const timer = this.actionTimers.get(table.id);
        return buildTableView(table, viewerId, timer ? timer.deadline : null);
    }
    /**
     * Send the table to everyone — as a **separate view per person**, never one
     * shared object. This is the loop that keeps hole cards where they belong.
     */
    pushTable(table) {
        const viewers = [
            ...table.seats.map(s => s.player.playerId),
            ...table.observers.keys(),
        ];
        for (const viewerId of viewers) {
            this.emit({
                tableId: table.id,
                playerIds: [viewerId],
                event: 'poker:state',
                payload: this.viewFor(table, viewerId),
            });
        }
    }
    emitToTable(table, event, payload) {
        this.emit({ tableId: table.id, playerIds: [], event, payload });
    }
    broadcastList() {
        this.emit({ tableId: '', playerIds: [], event: 'poker:list_update', payload: this.listTables() });
    }
    reject(table, playerId, code, detail) {
        this.log('action_rejected', playerId, 'player', {
            tableId: table.id, handId: table.hand?.handId, detail: { code, ...detail },
        });
        this.emit({
            tableId: table.id, playerIds: [playerId], event: 'poker:error',
            payload: { code, tableId: table.id, actionSeq: table.actionSeq },
        });
    }
    log(event, actorId, actorKind, extra = {}) {
        this.audit({ at: this.clock.now(), actorId, actorKind, event, ...extra });
    }
    require(tableId) {
        const table = this.tables.get(tableId);
        if (!table)
            throw new TableError('NO_TABLE', 'That table does not exist.');
        return table;
    }
}
//# sourceMappingURL=tableService.js.map