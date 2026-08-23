import { test } from 'node:test';
import { strict as assert } from 'assert';
import { seededRandomness } from './cards.js';
import {
  startHand, applyAction, actionsFor, forceFold, actOnTimeout, potTotal,
  RuleError, type HandState, type SeatConfig,
} from './state.js';

const BLINDS = { small: 10, big: 20, ante: 0 };

function table(stacks: number[], seed = 7): HandState {
  const seats: SeatConfig[] = stacks.map((stack, i) => ({ playerId: `p${i}`, seat: i, stack }));
  return startHand({ tableId: 't1', buttonSeat: 0, seats, blinds: BLINDS, rng: seededRandomness(seed), handId: 'h1' });
}

const acting = (h: HandState) => h.seats.find(s => s.seat === h.actingSeat)!.playerId;
const stackOf = (h: HandState, id: string) => h.seats.find(s => s.playerId === id)!.stack;
const chipsInPlay = (h: HandState) => h.seats.reduce((sum, s) => sum + s.stack, 0);

test('the deal: blinds are posted, everyone has two cards, and action starts under the gun', () => {
  const h = table([1000, 1000, 1000]);
  assert.equal(h.phase, 'PRE_FLOP');
  assert.equal(stackOf(h, 'p1'), 990, 'small blind');
  assert.equal(stackOf(h, 'p2'), 980, 'big blind');
  assert.equal(potTotal(h), 30);
  assert.ok(h.seats.every(s => s.hole.length === 2));
  assert.equal(acting(h), 'p0', 'the button acts first three-handed pre-flop');
  // No two players hold the same card, and none of them are on the board.
  const all = h.seats.flatMap(s => s.hole).map(c => `${c.rank}${c.suit}`);
  assert.equal(new Set(all).size, all.length);
});

test('a hand where everybody folds pushes the pot without a showdown', () => {
  let h = table([1000, 1000, 1000]);
  h = applyAction(h, 'p0', { type: 'fold' });
  h = applyAction(h, 'p1', { type: 'fold' });
  assert.equal(h.phase, 'COMPLETE');
  assert.equal(h.showdown.length, 0, 'nobody has to show');
  assert.equal(stackOf(h, 'p2'), 1010, 'the big blind collects the small blind');
  assert.equal(chipsInPlay(h), 3000, 'chips are conserved');
});

test('the big blind gets their option when everyone limps', () => {
  let h = table([1000, 1000, 1000]);
  h = applyAction(h, 'p0', { type: 'call' });
  h = applyAction(h, 'p1', { type: 'call' });
  assert.equal(h.phase, 'PRE_FLOP', 'still pre-flop: the big blind has not acted');
  assert.equal(acting(h), 'p2');
  const legal = actionsFor(h, 'p2')!;
  assert.ok(legal.canCheck, 'the big blind may check');
  assert.ok(legal.canRaise, 'or raise');
  h = applyAction(h, 'p2', { type: 'check' });
  assert.equal(h.phase, 'FLOP');
  assert.equal(h.board.length, 3);
});

test('a full hand plays through every street to a showdown', () => {
  let h = table([1000, 1000]);
  // Heads-up: the button is the small blind and acts first pre-flop.
  assert.equal(acting(h), 'p0');
  h = applyAction(h, 'p0', { type: 'call' });
  h = applyAction(h, 'p1', { type: 'check' });
  assert.equal(h.phase, 'FLOP');
  assert.equal(acting(h), 'p1', 'and last after the flop');

  h = applyAction(h, 'p1', { type: 'check' });
  h = applyAction(h, 'p0', { type: 'check' });
  assert.equal(h.phase, 'TURN');
  assert.equal(h.board.length, 4);

  h = applyAction(h, 'p1', { type: 'check' });
  h = applyAction(h, 'p0', { type: 'check' });
  assert.equal(h.phase, 'RIVER');
  assert.equal(h.board.length, 5);

  h = applyAction(h, 'p1', { type: 'check' });
  h = applyAction(h, 'p0', { type: 'check' });
  assert.equal(h.phase, 'COMPLETE');
  assert.equal(h.showdown.length, 2, 'both hands are shown');
  assert.equal(chipsInPlay(h), 2000);
  assert.equal(h.payouts.reduce((s, p) => s + p.amount, 0), 40, 'the whole pot was paid out');
});

test('a raise must be at least the size of the last raise', () => {
  let h = table([1000, 1000, 1000]);
  const legal = actionsFor(h, 'p0')!;
  assert.equal(legal.minRaiseTo, 40, 'over a 20 big blind, the minimum raise is to 40');
  assert.throws(() => applyAction(h, 'p0', { type: 'raise', amount: 30 }), (e: RuleError) => e.code === 'RAISE_TOO_SMALL');

  h = applyAction(h, 'p0', { type: 'raise', amount: 60 });   // a raise of 40
  const next = actionsFor(h, 'p1')!;
  assert.equal(next.minRaiseTo, 100, 'the next raise must add at least another 40');
  assert.equal(next.callAmount, 50, 'the small blind has 10 in already');
});

test('acting out of turn, twice, or after folding is refused', () => {
  let h = table([1000, 1000, 1000]);
  assert.throws(() => applyAction(h, 'p1', { type: 'call' }), (e: RuleError) => e.code === 'OUT_OF_TURN');
  h = applyAction(h, 'p0', { type: 'fold' });
  assert.throws(() => applyAction(h, 'p0', { type: 'call' }), (e: RuleError) => e.code === 'OUT_OF_TURN');
  assert.throws(() => applyAction(h, 'zz', { type: 'call' }), (e: RuleError) => e.code === 'NOT_AT_TABLE');
});

test('you cannot check into a bet, or raise more than you have', () => {
  const h = table([1000, 1000, 1000]);
  assert.throws(() => applyAction(h, 'p0', { type: 'check' }), (e: RuleError) => e.code === 'CANNOT_CHECK');
  assert.throws(() => applyAction(h, 'p0', { type: 'raise', amount: 5000 }), (e: RuleError) => e.code === 'RAISE_TOO_BIG');
});

test('an all-in short of a full raise does not re-open the betting', () => {
  // p0 has 70 — enough to raise, but not a full raise over a raise to 60.
  let h = table([70, 1000, 1000], 11);
  h = applyAction(h, 'p0', { type: 'call' });        // 20
  h = applyAction(h, 'p1', { type: 'raise', amount: 60 });
  h = applyAction(h, 'p2', { type: 'call' });        // matches 60
  // Back to p0, who can only reach 70: a raise of 10 over 60, not the 40 needed.
  const legal = actionsFor(h, 'p0')!;
  assert.equal(legal.maxRaiseTo, 70);
  h = applyAction(h, 'p0', { type: 'allIn' });
  assert.equal(h.seats.find(s => s.playerId === 'p0')!.allIn, true);

  // p1 owes 10 more but must not be able to re-raise: the action was not
  // re-opened by a short all-in.
  const p1 = actionsFor(h, 'p1')!;
  assert.equal(p1.callAmount, 10);
  assert.equal(p1.canRaise, false, 'a short all-in does not give p1 a fresh raise');
  assert.throws(() => applyAction(h, 'p1', { type: 'raise', amount: 200 }), (e: RuleError) => e.code === 'CANNOT_RAISE');

  // p2, who is also already in for 60, is in the same position.
  h = applyAction(h, 'p1', { type: 'call' });
  assert.equal(actionsFor(h, 'p2')!.canRaise, false);
});

test('an all-in for less builds a side pot the short stack cannot win', () => {
  let h = table([100, 1000, 1000], 3);
  h = applyAction(h, 'p0', { type: 'allIn' });                  // 100
  h = applyAction(h, 'p1', { type: 'call' });                   // 100 total
  h = applyAction(h, 'p2', { type: 'raise', amount: 400 });
  h = applyAction(h, 'p1', { type: 'call' });                   // 400 total
  // p0 is all-in, but the other two still have chips, so the hand goes on
  // without them — it is only over when nobody can act.
  assert.equal(h.phase, 'FLOP');
  assert.equal(actionsFor(h, 'p0'), null, 'an all-in player is never asked to act');
  h = applyAction(h, 'p1', { type: 'check' });
  h = applyAction(h, 'p2', { type: 'check' });
  h = applyAction(h, 'p1', { type: 'check' });
  h = applyAction(h, 'p2', { type: 'check' });
  h = applyAction(h, 'p1', { type: 'check' });
  h = applyAction(h, 'p2', { type: 'check' });
  assert.equal(h.phase, 'COMPLETE');
  assert.ok(h.pots.length >= 2, 'a main pot and at least one side pot');
  assert.equal(h.pots[0]!.eligible.length, 3);
  assert.ok(!h.pots[1]!.eligible.includes('p0'), 'the short stack is not in the side pot');
  assert.equal(chipsInPlay(h), 2100, 'chips are conserved across the whole hand');
  assert.equal(h.board.length, 5, 'the board runs out when nobody can act');
});

test('everyone all-in runs the board and settles in one step', () => {
  let h = table([200, 200, 200], 21);
  h = applyAction(h, 'p0', { type: 'allIn' });
  h = applyAction(h, 'p1', { type: 'allIn' });
  h = applyAction(h, 'p2', { type: 'allIn' });
  assert.equal(h.phase, 'COMPLETE');
  assert.equal(h.board.length, 5);
  assert.equal(h.showdown.length, 3);
  assert.equal(chipsInPlay(h), 600);
  assert.equal(h.actingSeat, null);
});

test('a timeout checks when it is free and folds when it is not', () => {
  let h = table([1000, 1000, 1000]);
  h = actOnTimeout(h, 'p0');                       // facing the big blind → fold
  assert.equal(h.seats.find(s => s.playerId === 'p0')!.folded, true);
  h = applyAction(h, 'p1', { type: 'call' });
  h = actOnTimeout(h, 'p2');                       // nothing to call → check
  assert.equal(h.phase, 'FLOP');
});

test('a player who leaves mid-hand folds and the hand carries on', () => {
  let h = table([1000, 1000, 1000]);
  h = forceFold(h, 'p1');                          // not their turn yet
  assert.equal(h.seats.find(s => s.playerId === 'p1')!.folded, true);
  assert.equal(acting(h), 'p0', 'the action pointer is untouched');
  h = applyAction(h, 'p0', { type: 'call' });
  assert.equal(acting(h), 'p2');
});

test('the deck is committed before the deal and verifies afterwards', async () => {
  const h = table([1000, 1000]);
  assert.match(h.commitment.hash, /^[0-9a-f]{64}$/);
  assert.equal(h.commitment.clientEntropy, null, 'no client entropy yet — not provably fair');
  const { Deck } = await import('./cards.js');
  let done = h;
  done = applyAction(done, 'p0', { type: 'fold' });
  assert.equal(done.phase, 'COMPLETE');
  assert.ok(Deck.verify(done.commitment, done.deckOrder), 'the revealed seed reproduces the published hash');
  assert.ok(!Deck.verify({ ...done.commitment, seed: 'tampered' }, done.deckOrder), 'a wrong seed fails');
});

test('a thousand random hands never lose a chip or hang', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    const stacks = [40 + (seed % 400), 100 + (seed % 900), 500, 1000].slice(0, 2 + (seed % 3));
    const start = stacks.reduce((a, b) => a + b, 0);
    let h = table(stacks, seed);
    let guard = 0;
    while (h.phase !== 'COMPLETE' && guard++ < 200) {
      const id = acting(h);
      const legal = actionsFor(h, id)!;
      const roll = (seed * 31 + guard * 17) % 100;
      if (roll < 12) h = applyAction(h, id, { type: 'fold' });
      else if (roll < 20 && legal.canRaise) h = applyAction(h, id, { type: 'allIn' });
      else if (roll < 35 && legal.canRaise) {
        h = applyAction(h, id, { type: 'raise', amount: Math.min(legal.maxRaiseTo, legal.minRaiseTo) });
      } else if (legal.canCheck) h = applyAction(h, id, { type: 'check' });
      else h = applyAction(h, id, { type: 'call' });
    }
    assert.equal(h.phase, 'COMPLETE', `hand ${seed} did not finish`);
    assert.equal(chipsInPlay(h), start, `hand ${seed} lost or invented chips`);
    const paid = h.payouts.reduce((s, p) => s + p.amount, 0);
    const put = h.seats.reduce((s, x) => s + x.committedTotal, 0);
    assert.equal(paid, put, `hand ${seed} paid out something other than the pot`);
  }
});
