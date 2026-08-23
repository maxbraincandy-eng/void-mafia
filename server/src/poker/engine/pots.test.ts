import { test } from 'node:test';
import { strict as assert } from 'assert';
import { buildPots, distribute, totalsByPlayer, type Contribution } from './pots.js';
import { evaluateBest } from './evaluator.js';
import { parseCards } from './cards.js';

const hand = (text: string) => evaluateBest(parseCards(text));

/** The invariant that matters most: chips are conserved. */
function assertConserved(contributions: Contribution[]) {
  const pots = buildPots(contributions);
  const inPots = pots.reduce((s, p) => s + p.amount, 0);
  const put = contributions.reduce((s, c) => s + c.committed, 0);
  assert.equal(inPots, put, 'every chip put in must be in exactly one pot');
  return pots;
}

test('one pot when everybody matched', () => {
  const pots = assertConserved([
    { playerId: 'a', committed: 100, folded: false },
    { playerId: 'b', committed: 100, folded: false },
    { playerId: 'c', committed: 100, folded: false },
  ]);
  assert.equal(pots.length, 1);
  assert.equal(pots[0]!.amount, 300);
  assert.deepEqual(pots[0]!.eligible.sort(), ['a', 'b', 'c']);
});

test('a short all-in makes a side pot the short stack cannot win', () => {
  // a is all-in for 100; b and c go to 500.
  const pots = assertConserved([
    { playerId: 'a', committed: 100, folded: false },
    { playerId: 'b', committed: 500, folded: false },
    { playerId: 'c', committed: 500, folded: false },
  ]);
  assert.equal(pots.length, 2);
  assert.equal(pots[0]!.amount, 300, 'main pot is 100 from each of three');
  assert.deepEqual(pots[0]!.eligible.sort(), ['a', 'b', 'c']);
  assert.equal(pots[1]!.amount, 800, 'the rest belongs to the two who kept betting');
  assert.deepEqual(pots[1]!.eligible.sort(), ['b', 'c']);
});

test('folded money stays in the pot but wins nothing', () => {
  const pots = assertConserved([
    { playerId: 'a', committed: 50, folded: true },
    { playerId: 'b', committed: 200, folded: false },
    { playerId: 'c', committed: 200, folded: false },
  ]);
  const all = pots.flatMap(p => p.eligible);
  assert.ok(!all.includes('a'), 'a folded and can win nothing');
  assert.equal(pots.reduce((s, p) => s + p.amount, 0), 450);
});

test('three all-ins at different depths make three pots', () => {
  const pots = assertConserved([
    { playerId: 'a', committed: 50, folded: false },
    { playerId: 'b', committed: 150, folded: false },
    { playerId: 'c', committed: 400, folded: false },
    { playerId: 'd', committed: 400, folded: false },
  ]);
  assert.equal(pots.length, 3);
  assert.deepEqual(pots.map(p => p.amount), [200, 300, 500]);
  assert.deepEqual(pots[0]!.eligible.sort(), ['a', 'b', 'c', 'd']);
  assert.deepEqual(pots[1]!.eligible.sort(), ['b', 'c', 'd']);
  assert.deepEqual(pots[2]!.eligible.sort(), ['c', 'd']);
});

test('a short stack can win only what it matched', () => {
  const pots = buildPots([
    { playerId: 'short', committed: 100, folded: false },
    { playerId: 'big1', committed: 500, folded: false },
    { playerId: 'big2', committed: 500, folded: false },
  ]);
  const board = '7c 2s 9h 3d 5c';
  const order = ['short', 'big1', 'big2'];

  // When a deep stack has the best hand it takes both pots.
  const bigWins = new Map([
    ['short', hand(`As Ah ${board}`)],   // pair of aces
    ['big1',  hand(`9c 9d ${board}`)],   // trip nines
    ['big2',  hand(`Qc Qh ${board}`)],   // pair of queens
  ]);
  const t1 = totalsByPlayer(distribute(pots, bigWins, order));
  assert.equal(t1.get('big1'), 1100);
  assert.equal(t1.get('short') ?? 0, 0);

  // When the SHORT stack has the best hand, the side pot is still beyond it.
  const shortWins = new Map([
    ['short', hand(`As Ah ${board}`)],   // pair of aces — best at the table
    ['big1',  hand(`Kc Kh ${board}`)],   // pair of kings
    ['big2',  hand(`Qc Qh ${board}`)],   // pair of queens
  ]);
  const t2 = totalsByPlayer(distribute(pots, shortWins, order));
  assert.equal(t2.get('short'), 300, 'the main pot only — a hundred from each player');
  assert.equal(t2.get('big1'), 800, 'the side pot goes to the better of the two who built it');
  assert.equal([...t2.values()].reduce((a, b) => a + b, 0), 1100);
});

test('an uncalled bet comes back to the player who made it', () => {
  // a bet one more than anyone matched: that chip was never contested and
  // returns as a pot of its own that only a is eligible for.
  const pots = buildPots([
    { playerId: 'a', committed: 51, folded: false },
    { playerId: 'b', committed: 50, folded: false },
  ]);
  const tie = hand('As Ks Qh Jd Tc 3h 2d');
  const totals = totalsByPlayer(distribute(pots, new Map([['a', tie], ['b', tie]]), ['b', 'a']));
  assert.equal(totals.get('a')! + totals.get('b')!, 101, 'nothing is lost or invented');
  assert.equal(totals.get('a'), 51, 'fifty from the split, plus the chip nobody called');
  assert.equal(totals.get('b'), 50);
});

test('a split pot that does not halve gives the odd chip to the seat left of the button', () => {
  // Three players in for 25 each; one folded, so 75 is split two ways.
  const pots = buildPots([
    { playerId: 'a', committed: 25, folded: false },
    { playerId: 'b', committed: 25, folded: false },
    { playerId: 'c', committed: 25, folded: true },
  ]);
  const tie = hand('As Ks Qh Jd Tc 3h 2d');
  const totals = totalsByPlayer(distribute(pots, new Map([['a', tie], ['b', tie]]), ['b', 'a', 'c']));
  assert.equal(totals.get('a')! + totals.get('b')!, 75);
  assert.equal(totals.get('b'), 38, 'b is first from the button, so b gets the odd chip');
  assert.equal(totals.get('a'), 37);
});

test('an uncontested pot is pushed without a showdown', () => {
  const pots = buildPots([
    { playerId: 'a', committed: 300, folded: false },
    { playerId: 'b', committed: 120, folded: true },
  ]);
  const payouts = distribute(pots, new Map([['a', hand('As Ks Qh Jd Tc 3h 2d')]]), ['a', 'b']);
  assert.equal(payouts.length, 1);
  assert.equal(payouts[0]!.amount, 420);
  assert.equal(payouts[0]!.uncontested, true);
});

test('a layer nobody can win is folded into the pot below it', () => {
  // c bet more than anyone called, then folded: those chips still belong to the
  // hand and must be won by somebody.
  const pots = assertConserved([
    { playerId: 'a', committed: 100, folded: false },
    { playerId: 'b', committed: 100, folded: false },
    { playerId: 'c', committed: 250, folded: true },
  ]);
  assert.equal(pots.length, 1);
  assert.equal(pots[0]!.amount, 450);
  assert.deepEqual(pots[0]!.eligible.sort(), ['a', 'b']);
});

test('random contributions always conserve chips', () => {
  for (let i = 0; i < 500; i++) {
    const n = 2 + (i % 8);
    const contributions: Contribution[] = Array.from({ length: n }, (_, k) => ({
      playerId: `p${k}`,
      committed: (i * 7 + k * 13) % 500,
      folded: (i + k) % 4 === 0,
    }));
    assertConserved(contributions);
  }
});
