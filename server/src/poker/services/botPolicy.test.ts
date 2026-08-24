import { test } from 'node:test';
import { strict as assert } from 'assert';

import { decide, handStrength } from './botPolicy.js';
import { PokerTableService } from './tableService.js';
import { ManualClock } from './clock.js';
import { seededRandomness } from '../engine/cards.js';
import { actionsFor, potTotal } from '../engine/state.js';
import type { LegalActions } from '../engine/betting.js';
import type { PlayerRef, PokerTable, TableEvent } from './types.js';

// ─── The policy on its own ───────────────────────────────────────────────────

const legal = (over: Partial<LegalActions> = {}): LegalActions => ({
  seat: 0,
  canFold: true, canCheck: false, canCall: true, callAmount: 20,
  canRaise: true, minRaiseTo: 40, maxRaiseTo: 1000,
  canAllIn: true, allInTo: 1000,
  ...over,
});

test('a better hand reads as stronger', () => {
  assert.ok(handStrength(['Ah', 'Ad'], []) > handStrength(['7h', '2c'], []),
    'aces beat seven-deuce before the flop');
  assert.ok(handStrength(['Ah', 'Kh'], ['Qh', 'Jh', 'Th']) > handStrength(['Ah', 'Kd'], ['2c', '7s', '9h']),
    'a made straight flush beats ace high');
  assert.ok(handStrength(['Ah', 'As'], ['Ad', '7s', '9h']) > handStrength(['Ah', 'Ks'], ['Ad', '7s', '9h']),
    'trips beat a pair');
});

test('a free card is taken rather than folded', () => {
  const action = decide({
    legal: legal({ canCheck: true, canCall: false, callAmount: 0, canRaise: false }),
    hole: ['7h', '2c'], board: ['As', 'Kd', '9h'], toCall: 0, pot: 100, stack: 1000, roll: 0.9,
  });
  assert.equal(action.type, 'check', 'nobody folds when checking is free');
});

test('rubbish facing a big bet goes in the muck', () => {
  const action = decide({
    legal: legal({ callAmount: 800 }),
    hole: ['7h', '2c'], board: ['As', 'Kd', '9h'], toCall: 800, pot: 100, stack: 1000, roll: 0.9,
  });
  assert.equal(action.type, 'fold');
});

test('a monster raises inside the legal range', () => {
  const action = decide({
    legal: legal({ minRaiseTo: 40, maxRaiseTo: 300 }),
    hole: ['Ah', 'As'], board: ['Ad', 'Ac', '9h'], toCall: 20, pot: 5000, stack: 300, roll: 0.1,
  });
  assert.equal(action.type, 'raise');
  assert.ok(action.amount! >= 40 && action.amount! <= 300,
    `raise ${action.amount} escaped [40, 300] — the engine would refuse it and the table would stall`);
});

/**
 * The contract, swept.
 *
 * A bot that plays badly is fine. A bot that plays *illegally* throws inside
 * the hand loop and freezes the table for the human sitting at it, so every
 * decision over a thousand random spots must be one the legal set offered.
 */
test('a thousand random spots never produce an illegal action', () => {
  const ranks = '23456789TJQKA'.split('');
  const suits = 'shdc'.split('');
  const card = (n: number) => `${ranks[n % 13]}${suits[Math.floor(n / 13) % 4]}`;

  for (let i = 0; i < 1000; i++) {
    const canCheck = i % 3 === 0;
    const canRaise = i % 5 !== 0;
    const minRaiseTo = 20 + (i % 100);
    const spot = {
      legal: legal({
        canCheck,
        canCall: !canCheck,
        callAmount: canCheck ? 0 : 5 + (i % 400),
        canRaise,
        minRaiseTo: canRaise ? minRaiseTo : 0,
        maxRaiseTo: canRaise ? minRaiseTo + (i % 500) : 0,
      }),
      hole: [card(i), card(i * 7 + 3)],
      board: i % 4 === 0 ? [] : [card(i * 3), card(i * 5 + 1), card(i * 11 + 2)],
      toCall: canCheck ? 0 : 5 + (i % 400),
      pot: (i % 900) + 10,
      stack: 50 + (i % 2000),
      roll: (i % 100) / 100,
    };

    const action = decide(spot);

    if (action.type === 'check') assert.ok(spot.legal.canCheck, `spot ${i}: checked when it was not free`);
    if (action.type === 'call') assert.ok(spot.legal.canCall, `spot ${i}: called with nothing to call`);
    if (action.type === 'fold') assert.ok(spot.legal.canFold, `spot ${i}: folded when it could not`);
    if (action.type === 'raise') {
      assert.ok(spot.legal.canRaise, `spot ${i}: raised when it could not`);
      assert.ok(
        action.amount! >= spot.legal.minRaiseTo && action.amount! <= spot.legal.maxRaiseTo,
        `spot ${i}: raise ${action.amount} outside [${spot.legal.minRaiseTo}, ${spot.legal.maxRaiseTo}]`,
      );
    }
  }
});

// ─── Bots at a real table ────────────────────────────────────────────────────

function harness(seed = 3) {
  const clock = new ManualClock();
  const events: TableEvent[] = [];
  const service = new PokerTableService({
    emit: e => events.push(e),
    clock,
    rng: seededRandomness(seed),
    isBot: id => id.startsWith('bot_'),
    botThinkMs: 50,
  });
  return { service, clock, events };
}

const bot = (n: number): PlayerRef => ({ playerId: `bot_${n}`, name: `Bot ${n}` });
const human = (n: number): PlayerRef => ({ playerId: `u${n}`, name: `Human ${n}` });

function chipsAt(table: PokerTable): number {
  const hand = table.hand && table.hand.phase !== 'COMPLETE' ? table.hand : null;
  if (!hand) return table.seats.reduce((sum, s) => sum + s.stack, 0);
  const dealtIn = new Set(hand.seats.map(s => s.playerId));
  return hand.seats.reduce((sum, s) => sum + s.stack, 0)
    + potTotal(hand)
    + table.seats.filter(s => !dealtIn.has(s.player.playerId)).reduce((sum, s) => sum + s.stack, 0);
}

/**
 * The test that matters: a table of nothing but bots has to finish hands on its
 * own. If it cannot, an owner sitting down with bots gets a frozen table, which
 * is worse than having no bots at all.
 */
test('a table of bots plays hands by itself, and conserves chips', () => {
  const { service, clock } = harness();
  const table = service.createTable(bot(0), { name: 'Bots', maxSeats: 6 });
  for (let i = 0; i < 4; i++) service.sit(table.id, bot(i), i);

  const total = table.seats.reduce((sum, s) => sum + s.stack, 0);

  // Twenty minutes of table time, in one go.
  clock.advance(20 * 60 * 1000);

  assert.ok(table.handNo >= 5, `expected several hands to have played, got ${table.handNo}`);
  assert.equal(chipsAt(table), total, 'bots do not create or destroy chips');
});

test('a bot never leaves the human waiting on a dead turn', () => {
  const { service, clock } = harness(11);
  const table = service.createTable(human(1), { name: 'Mixed', maxSeats: 6, actionSeconds: 30 });
  service.sit(table.id, human(1), 0);
  for (let i = 0; i < 3; i++) service.sit(table.id, bot(i), i + 1);
  clock.advance(table.config.handIntervalSeconds * 1000 + 10);

  // Play the human's turns instantly; the bots act on their own timer.
  for (let step = 0; step < 400; step++) {
    const hand = table.hand;
    if (!hand || hand.phase === 'COMPLETE') { clock.advance(6_000); continue; }
    const acting = hand.seats.find(s => s.seat === hand.actingSeat);
    if (!acting) { clock.advance(500); continue; }
    if (acting.playerId === 'u1') {
      const legalNow = actionsFor(hand, 'u1')!;
      service.act(table.id, 'u1', {
        handId: hand.handId, actionSeq: table.actionSeq,
        action: { type: legalNow.canCheck ? 'check' : 'call' },
      });
    } else {
      clock.advance(200);   // let the bot's think-timer fire
    }
  }

  assert.ok(table.handNo >= 3, `the table kept moving: ${table.handNo} hands`);
});

test('a seat with no chips is not dealt in', () => {
  const { service, clock } = harness(21);
  const table = service.createTable(bot(0), { name: 'Bust', maxSeats: 6 });
  for (let i = 0; i < 3; i++) service.sit(table.id, bot(i), i);

  /*
   * Emptied before the first deal, on purpose.
   *
   * The first version of this test ran the table for half an hour and then
   * looked for a zero stack — which found an all-in mid-hand, not a bust, and
   * eventually a table down to one bot holding everything, where no further
   * hand can be dealt at all. Neither told us anything about the rule.
   */
  const victim = table.seats[1]!;
  victim.stack = 0;

  clock.advance(table.config.handIntervalSeconds * 1000 + 10);

  assert.ok(table.hand, 'the other two still have a game');
  assert.equal(table.hand!.seats.length, 2);
  assert.ok(
    !table.hand!.seats.some(s => s.playerId === victim.player.playerId),
    'a seat that started the deal with nothing is not in the hand',
  );
});
