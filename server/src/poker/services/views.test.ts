import { test } from 'node:test';
import { strict as assert } from 'assert';

import { PokerTableService } from './tableService.js';
import { ManualClock } from './clock.js';
import { seededRandomness, type Randomness } from '../engine/cards.js';
import { buildTableSummary } from './views.js';
import type { PlayerRef, PokerTable, TableEvent } from './types.js';
import type { SeatView, TableView } from './views.js';

const player = (n: number): PlayerRef => ({ playerId: `p${n}`, name: `Player ${n}` });

function harness(seed: number, players = 4, patch = {}) {
  const clock = new ManualClock();
  const events: TableEvent[] = [];
  const rng = seededRandomness(seed);
  const service = new PokerTableService({ emit: e => events.push(e), clock, rng });
  const table = service.createTable(player(0), { name: 'V', maxSeats: 6, ...patch });
  for (let i = 0; i < players; i++) service.sit(table.id, player(i), i);
  clock.advance(table.config.handIntervalSeconds * 1000 + 10);
  return { service, clock, events, table, rng };
}

/** Play a hand with a mix of folds, calls, checks and raises. */
function playRandomly(service: PokerTableService, table: PokerTable, rng: Randomness, limit = 300): void {
  for (let i = 0; i < limit && table.hand && table.hand.phase !== 'COMPLETE'; i++) {
    const hand = table.hand;
    if (hand.actingSeat === null) break;
    const pid = hand.seats.find(s => s.seat === hand.actingSeat)!.playerId;
    const legal = service.viewFor(table, pid).youCan!;
    const roll = rng.int(10);

    let action;
    if (roll < 2 && legal.canFold && !legal.canCheck) action = { type: 'fold' as const };
    else if (roll < 8) action = legal.canCheck ? { type: 'check' as const } : { type: 'call' as const };
    else if (legal.canRaise) {
      const span = legal.maxRaiseTo - legal.minRaiseTo;
      action = { type: 'raise' as const, amount: legal.minRaiseTo + (span > 0 ? rng.int(Math.min(span, 200)) : 0) };
    } else action = legal.canCheck ? { type: 'check' as const } : { type: 'call' as const };

    service.act(table.id, pid, { handId: hand.handId, actionSeq: table.actionSeq, action });
  }
}

function states(events: TableEvent[]): { viewer: string; view: TableView }[] {
  return events
    .filter(e => e.event === 'poker:state')
    .map(e => ({ viewer: e.playerIds[0]!, view: e.payload as TableView }));
}

// ─── The one that matters ────────────────────────────────────────────────────

/**
 * The information rule, asserted directly:
 *
 *   a card belonging to seat X appears in the payload sent to viewer Y
 *   if and only if X === Y, or the hand has ended and X had to show.
 *
 * Run over hundreds of hands of mixed folds, calls and raises, checking every
 * single state payload that was emitted along the way — not the final one, all
 * of them, because a leak on the turn that is gone by the river is still a leak.
 */
test('no state payload ever contains another player\'s cards', () => {
  let payloadsChecked = 0;
  let cardsSeen = 0;

  for (let seed = 1; seed <= 25; seed++) {
    const { service, clock, events, table, rng } = harness(seed, 4);

    for (let h = 0; h < 8; h++) {
      playRandomly(service, table, rng);
      clock.advance(table.config.handIntervalSeconds * 1000 + 10);
      if (table.status === 'closed') break;
    }

    for (const { viewer, view } of states(events)) {
      payloadsChecked += 1;
      for (const seat of view.seats) {
        if (seat.cards === null) continue;
        cardsSeen += seat.cards.length;

        if (seat.playerId === viewer) continue;                    // your own cards

        const finished = view.hand !== null
          && ['SHOWDOWN', 'SETTLEMENT', 'COMPLETE'].includes(view.hand.phase);
        assert.ok(
          finished,
          `seed ${seed}: viewer ${viewer} was sent seat ${seat.seat}'s cards `
          + `during ${view.hand?.phase ?? 'no hand'}`,
        );
        assert.equal(seat.folded, false, 'a folded hand is never shown');
        assert.ok(seat.handRank, 'a shown hand comes with the rank it was shown for');
      }
    }
  }

  assert.ok(payloadsChecked > 2000, `expected a real sample, checked ${payloadsChecked}`);
  assert.ok(cardsSeen > 0, 'the test would pass trivially if no cards were ever sent');
});

test('every seat reports a card count, so the table renders without the faces', () => {
  const { service, table } = harness(3, 4);
  const view = service.viewFor(table, 'p1');
  for (const seat of view.seats) {
    assert.equal(seat.cardCount, 2, 'everyone visibly holds two cards');
  }
  assert.equal(view.seats.filter(s => s.cards !== null).length, 1, 'exactly one seat shows its faces');
});

test('the shuffle seed is withheld until the hand is over', () => {
  const { service, clock, events, table, rng } = harness(11, 3);
  playRandomly(service, table, rng);

  for (const { view } of states(events)) {
    if (!view.hand) continue;
    if (view.hand.phase !== 'COMPLETE') {
      assert.equal(view.hand.deckSeed, null, 'publishing the seed early would publish the deck');
    }
    assert.equal(view.hand.deckHash.length, 64, 'the commitment is published from the start');
  }

  clock.advance(1);
  const finished = states(events).filter(s => s.view.hand?.phase === 'COMPLETE');
  assert.ok(finished.length > 0);
  assert.ok(finished.every(s => typeof s.view.hand!.deckSeed === 'string'), 'and revealed at the end');
});

test('an observer sees the table and none of the cards', () => {
  const { service, table } = harness(5, 3);
  service.joinTable(table.code, { playerId: 'watcher', name: 'Watcher' });

  const view = service.viewFor(table, 'watcher');
  assert.equal(view.yourSeat, null);
  assert.equal(view.youCan, null, 'a watcher has no legal actions, ever');
  assert.ok(view.seats.every((s: SeatView) => s.cards === null), 'and no cards at all');
  assert.ok(view.hand, 'but they can watch the hand');
});

test('only the acting player is told what they may do', () => {
  const { service, table } = harness(7, 4);
  const acting = table.hand!.seats.find(s => s.seat === table.hand!.actingSeat)!.playerId;

  for (const seat of table.seats) {
    const view = service.viewFor(table, seat.player.playerId);
    if (seat.player.playerId === acting) {
      assert.ok(view.youCan, 'the player to act is told their options');
      assert.equal(view.youCan!.seat, seat.seat);
    } else {
      assert.equal(view.youCan, null, 'and nobody else is');
    }
  }
});

test('the mid-hand stack shown is the engine\'s, not the seat\'s stale copy', () => {
  const { service, table } = harness(13, 3);
  const hand = table.hand!;
  const bb = hand.seats.find(s => s.committedThisStreet === hand.blinds.big)!;

  const view = service.viewFor(table, bb.playerId);
  const shown = view.seats.find(s => s.playerId === bb.playerId)!;
  assert.equal(shown.stack, table.config.buyIn - hand.blinds.big, 'the blind has already left the stack');
  assert.equal(shown.committedThisStreet, hand.blinds.big);
});

test('the lobby row carries no cards, no stacks and no hand state', () => {
  const { table } = harness(17, 3);
  const summary = buildTableSummary(table) as Record<string, unknown>;
  const text = JSON.stringify(summary);

  for (const key of ['cards', 'hole', 'stack', 'board', 'deck', 'pot']) {
    assert.ok(!text.toLowerCase().includes(key), `a lobby row must not carry "${key}"`);
  }
  assert.equal(summary.seated, 3);
  assert.equal(summary.hasPassword, false);
});

test('a private table is never listed, but can still be joined by code', () => {
  const { service, table } = harness(19, 2, { isPrivate: true, password: 'secret' });
  assert.equal(service.listTables().length, 0);

  assert.throws(() => service.joinTable(table.code, player(9), 'wrong'));
  const joined = service.joinTable(table.code, player(9), 'secret');
  assert.equal(joined.id, table.id);
});
