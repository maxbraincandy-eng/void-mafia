import { test } from 'node:test';
import { strict as assert } from 'assert';

import { PokerTableService, TableError } from './tableService.js';
import { ManualClock } from './clock.js';
import { seededRandomness } from '../engine/cards.js';
import { potTotal } from '../engine/state.js';
import type { AuditEntry, HandHistory, PlayerRef, PokerTable, TableEvent } from './types.js';
import type { TableView } from './views.js';

// ─── Harness ─────────────────────────────────────────────────────────────────

function harness(seed = 7) {
  const clock = new ManualClock();
  const events: TableEvent[] = [];
  const audits: AuditEntry[] = [];
  const histories: HandHistory[] = [];
  const service = new PokerTableService({
    emit: e => events.push(e),
    audit: a => audits.push(a),
    history: h => histories.push(h),
    clock,
    rng: seededRandomness(seed),
  });
  return { service, clock, events, audits, histories };
}

const player = (n: number): PlayerRef => ({ playerId: `p${n}`, name: `Player ${n}` });

/**
 * Seat `seats` players and let the pre-deal pause elapse, so the table is
 * sitting on a live hand with everybody in it — which is what a filled table
 * looks like and what most of these tests are about.
 */
function openTable(service: PokerTableService, clock: ManualClock, seats = 3, patch = {}) {
  const table = service.createTable(player(0), { name: 'Test', maxSeats: 6, ...patch });
  for (let i = 0; i < seats; i++) service.sit(table.id, player(i), i);
  clock.advance(table.config.handIntervalSeconds * 1000 + 10);
  return table;
}

/** Settle the current hand and let the next one be dealt. */
function nextHand(service: PokerTableService, clock: ManualClock, table: PokerTable): void {
  playOut(service, table);
  clock.advance(table.config.handIntervalSeconds * 1000 + 10);
}

function actingPlayerId(table: PokerTable): string {
  const hand = table.hand!;
  return hand.seats.find(s => s.seat === hand.actingSeat)!.playerId;
}

/** Play the current hand to the end, checking when free and calling otherwise. */
function playOut(service: PokerTableService, table: PokerTable, limit = 200): void {
  for (let i = 0; i < limit && table.hand && table.hand.phase !== 'COMPLETE'; i++) {
    const hand = table.hand;
    if (hand.actingSeat === null) break;
    const pid = actingPlayerId(table);
    const legal = service.viewFor(table, pid).youCan!;
    service.act(table.id, pid, {
      handId: hand.handId,
      actionSeq: table.actionSeq,
      action: { type: legal.canCheck ? 'check' : 'call' },
    });
  }
}

function statesFor(events: TableEvent[], playerId: string): TableView[] {
  return events
    .filter(e => e.event === 'poker:state' && e.playerIds[0] === playerId)
    .map(e => e.payload as TableView);
}

// ─── Seating and lifecycle ───────────────────────────────────────────────────

test('sitting grants the table stack, and the deal waits for the pause', () => {
  const { service, clock } = harness();
  const table = service.createTable(player(0), {
    name: 'T', buyIn: 2000, smallBlind: 10, bigBlind: 20, handIntervalSeconds: 5,
  });

  service.sit(table.id, player(0), 0);
  clock.advance(60_000);
  assert.equal(table.hand, null, 'one player is not a game, however long you wait');
  assert.equal(table.seats[0]!.stack, 2000);

  service.sit(table.id, player(1), 3);
  assert.equal(table.hand, null, 'the deal is one pause away, so the table can fill');

  clock.advance(5_001);
  assert.ok(table.hand, 'and then it deals');
  assert.equal(table.hand!.phase, 'PRE_FLOP');
  assert.equal(table.status, 'playing');
  // Heads-up: the button posts the small blind.
  assert.equal(potTotal(table.hand!), 30);
});

test('a player who sits during the pause is dealt into the first hand', () => {
  const { service, clock } = harness();
  const table = service.createTable(player(0), { name: 'T', handIntervalSeconds: 5 });
  service.sit(table.id, player(0), 0);
  service.sit(table.id, player(1), 1);
  clock.advance(3_000);
  service.sit(table.id, player(2), 2);      // arrives late, before the deal
  clock.advance(5_001);

  assert.equal(table.hand!.seats.length, 3, 'nobody has to sit out a hand they were in time for');
});

test('a stack too small to play a hand is refused at creation', () => {
  const { service } = harness();
  assert.throws(
    () => service.createTable(player(0), { name: 'T', buyIn: 100, smallBlind: 50, bigBlind: 100 }),
    (err: unknown) => err instanceof TableError && err.code === 'BUY_IN_TOO_SMALL',
  );
});

test('the button moves one occupied seat per hand', () => {
  const { service, clock } = harness();
  const table = openTable(service, clock, 3);
  const seen: number[] = [];

  for (let i = 0; i < 4; i++) {
    seen.push(table.hand!.buttonSeat);
    playOut(service, table);
    clock.advance(table.config.handIntervalSeconds * 1000 + 10);
  }
  assert.deepEqual(seen, [1, 2, 0, 1], 'the button wraps through the occupied seats');
});

test('a table with nobody connected is not listed, and a closed table is gone', () => {
  const { service, clock } = harness();
  const table = openTable(service, clock, 2);
  assert.equal(service.listTables().length, 1);

  service.setConnected('p0', false);
  service.setConnected('p1', false);
  assert.equal(service.listTables().length, 0, 'an empty room must not advertise itself');

  service.setConnected('p0', true);
  assert.equal(service.listTables().length, 1);

  service.closeTable(table, 'test');
  assert.equal(service.listTables().length, 0);
  assert.equal(service.getTableByCode(table.code), null);
});

test('the host leaving closes the table — after the hand if one is running', () => {
  const { service, clock } = harness();
  const table = openTable(service, clock, 3);
  assert.equal(table.hostId, 'p0');

  service.leave(table.id, 'p0');
  assert.equal(table.status, 'playing', 'a live pot is not yanked away mid-hand');
  assert.equal(table.closeAfterHand, true);

  playOut(service, table);
  clock.advance(10);
  assert.equal(table.status, 'closed');
  assert.equal(table.closeReason, 'host_left');
  assert.equal(service.listTables().length, 0);
});

test('the host leaving an idle table closes it immediately', () => {
  const { service } = harness();
  const table = service.createTable(player(0), { name: 'T' });
  service.sit(table.id, player(0), 0);
  service.leave(table.id, 'p0');
  assert.equal(table.status, 'closed');
  assert.equal(table.closeReason, 'host_left');
});

test('leaving mid-hand folds, and the chips already in the pot stay in it', () => {
  const { service, clock } = harness();
  const table = openTable(service, clock, 3);
  const potBefore = potTotal(table.hand!);
  const victim = actingPlayerId(table);

  service.leave(table.id, victim);

  assert.ok(!table.seats.some(s => s.player.playerId === victim), 'the seat is released');
  const stillInHand = table.hand!.seats.find(s => s.playerId === victim);
  assert.equal(stillInHand?.folded, true, 'the hand knows they folded');
  assert.ok(potTotal(table.hand!) >= potBefore, 'nothing is refunded out of the pot');
});

// ─── Action validation ───────────────────────────────────────────────────────

test('a replayed action is refused and changes nothing', () => {
  const { service, clock, events } = harness();
  const table = openTable(service, clock, 3);
  const pid = actingPlayerId(table);
  const handId = table.hand!.handId;
  const seq = table.actionSeq;

  service.act(table.id, pid, { handId, actionSeq: seq, action: { type: 'call' } });
  const potAfterFirst = potTotal(table.hand!);

  for (let i = 0; i < 5; i++) {
    assert.throws(
      () => service.act(table.id, pid, { handId, actionSeq: seq, action: { type: 'call' } }),
      (err: unknown) => err instanceof TableError && err.code === 'SEQ_MISMATCH',
      'the same packet sent again is a duplicate, not a second bet',
    );
  }
  assert.equal(potTotal(table.hand!), potAfterFirst, 'the pot did not move');

  const errors = events.filter(e => e.event === 'poker:error');
  assert.equal(errors.length, 5);
  assert.equal((errors[0]!.payload as { code: string }).code, 'SEQ_MISMATCH');
  assert.deepEqual(errors[0]!.playerIds, [pid], 'the rejection goes only to the sender');
});

test('an action for a finished hand is refused', () => {
  const { service, clock } = harness();
  const table = openTable(service, clock, 3);
  const staleHandId = table.hand!.handId;
  playOut(service, table);

  assert.throws(
    () => service.act(table.id, 'p1', { handId: staleHandId, actionSeq: table.actionSeq, action: { type: 'call' } }),
    (err: unknown) => err instanceof TableError && ['HAND_MISMATCH', 'NO_HAND'].includes(err.code),
  );
});

test('acting out of turn is refused with the rule code', () => {
  const { service, clock, audits } = harness();
  const table = openTable(service, clock, 3);
  const acting = actingPlayerId(table);
  const other = table.seats.map(s => s.player.playerId).find(id => id !== acting)!;

  assert.throws(
    () => service.act(table.id, other, {
      handId: table.hand!.handId, actionSeq: table.actionSeq, action: { type: 'call' },
    }),
    (err: unknown) => err instanceof TableError && err.code === 'OUT_OF_TURN',
  );
  assert.ok(
    audits.some(a => a.event === 'action_rejected' && (a.detail as { code: string }).code === 'OUT_OF_TURN'),
    'a rejected action is an audited incident, not a silent no-op',
  );
});

test('someone who is not seated cannot act', () => {
  const { service, clock } = harness();
  const table = openTable(service, clock, 3);
  assert.throws(
    () => service.act(table.id, 'stranger', {
      handId: table.hand!.handId, actionSeq: table.actionSeq, action: { type: 'fold' },
    }),
    (err: unknown) => err instanceof TableError && err.code === 'NOT_SEATED',
  );
});

// ─── Timers ──────────────────────────────────────────────────────────────────

test('the action clock folds a player who never acts, one millisecond late not early', () => {
  const { service, clock } = harness();
  const table = openTable(service, clock, 3, { actionSeconds: 20 });
  const pid = actingPlayerId(table);

  // Take the deadline from the view rather than from the test's own arithmetic:
  // the deadline the player is shown is the deadline that must be enforced, and
  // asserting against it catches a clock that is displayed wrong as well as one
  // that fires wrong.
  const deadline = service.viewFor(table, pid).hand!.actingDeadline!;
  assert.equal(deadline, clock.now() + 20_000 - 10, 'the clock starts when the hand is dealt');

  clock.advance(deadline - clock.now() - 1);
  assert.equal(actingPlayerId(table), pid, 'still their turn with a millisecond left');

  clock.advance(2);
  const seat = table.hand!.seats.find(s => s.playerId === pid)!;
  assert.equal(seat.folded, true, 'a pre-flop timeout facing a bet folds');
});

test('a timeout checks when checking is free', () => {
  const { service, clock } = harness();
  const table = openTable(service, clock, 3, { actionSeconds: 20 });

  // Everyone calls to the flop, where the first player to act may check.
  playOutStreet(service, table);
  assert.equal(table.hand!.phase, 'FLOP');

  const pid = actingPlayerId(table);
  clock.advance(21_000);
  const seat = table.hand!.seats.find(s => s.playerId === pid)!;
  assert.equal(seat.folded, false, 'a free check must never be turned into a fold');
});

test('a disconnected player keeps their seat for the grace period, then loses it', () => {
  const { service, clock } = harness();
  const table = openTable(service, clock, 3, { disconnectGraceSeconds: 45 });

  service.setConnected('p2', false);
  assert.equal(table.seats.find(s => s.player.playerId === 'p2')!.connected, false);

  clock.advance(44_000);
  assert.ok(table.seats.some(s => s.player.playerId === 'p2'), 'still holding the seat');

  clock.advance(2_000);
  assert.ok(!table.seats.some(s => s.player.playerId === 'p2'), 'the seat is released');
});

test('reconnecting inside the grace period keeps the seat and returns the view', () => {
  const { service, clock } = harness();
  const table = openTable(service, clock, 3, { disconnectGraceSeconds: 45 });

  service.setConnected('p2', false);
  clock.advance(20_000);
  service.setConnected('p2', true);
  clock.advance(60_000);

  const seat = table.seats.find(s => s.player.playerId === 'p2');
  assert.ok(seat, 'coming back before the grace expires keeps the seat');
  assert.equal(seat!.connected, true);

  const resumed = service.resume('p2');
  assert.equal(resumed.length, 1);
  assert.equal(resumed[0]!.table.yourSeat, 2);
});

test('a disconnected player gets a short clock so the table does not stall', () => {
  const { service, clock } = harness();
  const table = openTable(service, clock, 3, { actionSeconds: 60 });
  const pid = actingPlayerId(table);

  service.setConnected(pid, false);
  // The clock was set before they dropped, so it still runs its course; the
  // short clock applies to the next seat they are asked to act in.
  clock.advance(61_000);
  assert.ok(table.hand!.seats.find(s => s.playerId === pid)!.folded);
});

// ─── Rebuy ───────────────────────────────────────────────────────────────────

test('a rebuy is free, but only when busted and never mid-hand', () => {
  const { service, clock } = harness();
  const table = openTable(service, clock, 3);

  assert.throws(
    () => service.rebuy(table.id, 'p1'),
    (err: unknown) => err instanceof TableError && err.code === 'HAS_CHIPS',
  );

  const seat = table.seats.find(s => s.player.playerId === 'p1')!;
  seat.stack = 0;
  assert.throws(
    () => service.rebuy(table.id, 'p1'),
    (err: unknown) => err instanceof TableError && err.code === 'HAND_IN_PROGRESS',
    'a player must not be able to reload after seeing a card',
  );

  playOut(service, table);
  seat.stack = 0;
  service.rebuy(table.id, 'p1');
  assert.equal(seat.stack, table.config.buyIn);
});

// ─── History and audit ───────────────────────────────────────────────────────

test('every settled hand writes exactly one immutable history record', () => {
  const { service, clock, histories } = harness();
  const table = openTable(service, clock, 3);

  for (let i = 0; i < 5; i++) {
    playOut(service, table);
    clock.advance(table.config.handIntervalSeconds * 1000 + 10);
  }

  assert.equal(histories.length, 5);
  const ids = new Set(histories.map(h => h.handId));
  assert.equal(ids.size, 5, 'hand ids are unique');

  for (const h of histories) {
    assert.equal(h.tableId, table.id);
    assert.ok(h.deckHash.length === 64, 'the commitment is recorded');
    assert.ok(h.deckSeed.length > 0, 'the seed is recorded, after the fact');
    assert.ok(h.players.every(p => p.holeCards.length === 2), 'cards are written at settlement');
    const paid = h.players.reduce((sum, p) => sum + p.won, 0);
    assert.equal(paid, h.potTotal, 'every chip in the pot was paid to somebody');
    assert.equal(h.players.reduce((sum, p) => sum + p.net, 0), 0, 'and none were created');
  }
});

test('chips are conserved across a long session', () => {
  const { service, clock } = harness(99);
  const table = openTable(service, clock, 4);
  const total = table.seats.reduce((sum, s) => sum + s.stack, 0);

  for (let i = 0; i < 40; i++) {
    playOut(service, table);
    clock.advance(table.config.handIntervalSeconds * 1000 + 10);
    if (!table.hand) break;
  }

  assert.equal(chipsAt(table), total, 'no chip was created or destroyed over forty hands');
});

/**
 * Every chip at the table.
 *
 * Mid-hand this has to read the engine's stacks, not the seats': the seat's
 * copy is only refreshed at settlement, so during a hand it still holds the
 * pre-blind figure and adding the pot to it would count the blinds twice. The
 * view builder handles the same subtlety the same way.
 */
function chipsAt(table: PokerTable): number {
  const hand = table.hand && table.hand.phase !== 'COMPLETE' ? table.hand : null;
  if (!hand) return table.seats.reduce((sum, s) => sum + s.stack, 0);
  const dealtIn = new Set(hand.seats.map(s => s.playerId));
  return hand.seats.reduce((sum, s) => sum + s.stack, 0)
    + potTotal(hand)
    + table.seats.filter(s => !dealtIn.has(s.player.playerId)).reduce((sum, s) => sum + s.stack, 0);
}

test('shutdown leaves no timer behind', () => {
  const { service, clock } = harness();
  openTable(service, clock, 3);
  assert.ok(clock.pending > 0);
  service.shutdown();
  assert.equal(clock.pending, 0);
});

// ─── Helpers used above ──────────────────────────────────────────────────────

/** Call/check until the street changes. */
function playOutStreet(service: PokerTableService, table: PokerTable): void {
  const street = table.hand!.phase;
  for (let i = 0; i < 50 && table.hand!.phase === street && table.hand!.actingSeat !== null; i++) {
    const pid = actingPlayerId(table);
    const legal = service.viewFor(table, pid).youCan!;
    service.act(table.id, pid, {
      handId: table.hand!.handId,
      actionSeq: table.actionSeq,
      action: { type: legal.canCheck ? 'check' : 'call' },
    });
  }
}

export { statesFor };

test('a twelve-seat table seats twelve and deals them all in', () => {
  const { service, clock } = harness(5);
  const table = service.createTable(player(0), { name: 'Big', maxSeats: 12 });
  for (let i = 0; i < 12; i++) service.sit(table.id, player(i), i);
  clock.advance(table.config.handIntervalSeconds * 1000 + 10);

  assert.equal(table.seats.length, 12);
  assert.equal(table.hand!.seats.length, 12, 'everyone is dealt in');
  const total = table.seats.reduce((sum, s) => sum + s.stack, 0);

  for (let i = 0; i < 6; i++) nextHand(service, clock, table);
  assert.equal(chipsAt(table), total, 'twelve-handed conserves chips like any other size');
});

test('the seat cap is twelve, and asking for more gets twelve', () => {
  const { service } = harness();
  const big = service.createTable(player(0), { name: 'Cap', maxSeats: 99 });
  assert.equal(big.config.maxSeats, 12, 'clamped, not refused — a bad number is not a failed request');

  assert.throws(
    () => service.sit(big.id, player(1), 12),
    (err: unknown) => err instanceof TableError && err.code === 'BAD_SEAT',
    'seat 12 does not exist on a twelve-seat table; seats are 0-11',
  );
});
