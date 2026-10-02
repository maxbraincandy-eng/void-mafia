/**
 * ტკბილეული თუ ხრიკი — the rules, without a database.
 *
 *   npx tsx --test src/services/trickOrTreat.test.ts
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import {
  ghostChance, rollDoor, knock, goHome, newWalk, isSeason, seasonOf, nextMidnight, tbilisiDate,
  shareLine, MAX_DOORS, WalkError, type Walk, type Door,
} from './trickOrTreatRules.js';

/** Open the next door, having planted what is behind it. */
const knockWith = (w: Walk, d: Door): Walk => knock({ ...w, peek: d }).walk;
const fixed = () => ({ knockWith });

/** An rng that returns these numbers in turn, then repeats the last. */
const seq = (...xs: number[]) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]!; };

test('the ghost gets likelier with every door, and stops at 55%', () => {
  assert.equal(ghostChance(1), 0.06);
  for (let n = 1; n < 40; n++) assert.ok(ghostChance(n + 1) >= ghostChance(n), `door ${n + 1} is safer than ${n}`);
  assert.equal(ghostChance(40), 0.55);
});

test('a ghost is rolled exactly as often as the screen says', () => {
  // The rng's first draw decides ghost or not: just under the chance is a ghost.
  assert.equal(rollDoor(5, seq(ghostChance(5) - 0.0001, 0)).kind, 'ghost');
  assert.notEqual(rollDoor(5, seq(ghostChance(5), 0)).kind, 'ghost');
});

test('candy grows the further down the street you are', () => {
  const at = (n: number) => rollDoor(n, seq(0.99, 0.1, 0)).amount;   // not a ghost, candy, low roll
  assert.ok(at(12) > at(1), `door 12 gave ${at(12)}, door 1 gave ${at(1)}`);
  assert.equal(rollDoor(3, seq(0.99, 0.75)).kind, 'treat');
  assert.equal(rollDoor(3, seq(0.99, 0.75)).amount, 11);
});

test('every kind of door can turn up', () => {
  const kinds = new Set<string>();
  // mulberry32: small, seeded, and well spread.
  let a = 12345;
  const rng = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 4000; i++) kinds.add(rollDoor(1 + (i % 15), rng).kind);
  assert.deepEqual([...kinds].sort(), ['amulet', 'candy', 'cat', 'ghost', 'lantern', 'treat']);
});

test('candy and treats go in the bag', () => {
  const f = fixed();
  let w = f.knockWith(newWalk(), { kind: 'candy', amount: 3 });
  w = f.knockWith(w, { kind: 'treat', amount: 10 });
  assert.equal(w.bag, 13);
  assert.equal(w.status, 'walking');
});

test('a ghost without an amulet ends the walk and empties the bag', () => {
  const f = fixed();
  let w = f.knockWith(newWalk(), { kind: 'candy', amount: 9 });
  w = f.knockWith(w, { kind: 'ghost', amount: 0 });
  assert.equal(w.status, 'scared');
  assert.equal(w.bag, 0);
  assert.equal(w.banked, 0);
});

test('an amulet stops one ghost, and only one', () => {
  const f = fixed();
  let w = f.knockWith(newWalk(), { kind: 'amulet', amount: 0 });
  w = f.knockWith(w, { kind: 'candy', amount: 4 });
  w = f.knockWith(w, { kind: 'ghost', amount: 0 });
  assert.equal(w.status, 'walking', 'the amulet did not save the walk');
  assert.equal(w.bag, 4, 'the bag was lost despite the amulet');
  assert.equal(w.amulet, false, 'the amulet was not used up');
  assert.equal(w.doors.at(-1)!.saved, true);
  w = f.knockWith(w, { kind: 'ghost', amount: 0 });
  assert.equal(w.status, 'scared');
});

test('a second amulet while holding one is a little candy instead', () => {
  const f = fixed();
  let w = f.knockWith(newWalk(), { kind: 'amulet', amount: 0 });
  w = f.knockWith(w, { kind: 'amulet', amount: 0 });
  assert.equal(w.amulet, true);
  assert.equal(w.bag, 2);
  assert.equal(w.doors.at(-1)!.kind, 'candy');
});

test('a lantern shows the next door, and the next door is exactly that', () => {
  // Lantern on door 1, then the peeked roll for door 2 is a ghost.
  const rng = seq(0.99, 0.9, /* peek: */ 0.0);
  const { walk } = knock(newWalk(), rng);
  assert.equal(walk.doors[0]!.kind, 'lantern');
  assert.equal(walk.peek?.kind, 'ghost', 'the lantern did not show the next door');
  // Knocking again must open the door that was shown, whatever the rng says now.
  const after = knock(walk, () => 0.999).walk;
  assert.equal(after.doors[1]!.kind, 'ghost');
  assert.equal(after.peek, null);
});

test('going home banks the bag, once', () => {
  const f = fixed();
  const w = goHome(f.knockWith(newWalk(), { kind: 'candy', amount: 7 }));
  assert.equal(w.status, 'home');
  assert.equal(w.banked, 7);
  assert.throws(() => goHome(w), WalkError);
  assert.throws(() => knock(w), WalkError);
});

test('a finished walk cannot be knocked on', () => {
  const f = fixed();
  const scared = f.knockWith(newWalk(), { kind: 'ghost', amount: 0 });
  assert.throws(() => knock(scared), WalkError);
});

test('the end of the street walks you home with your bag', () => {
  let w = newWalk();
  for (let i = 0; i < MAX_DOORS; i++) w = knock({ ...w, peek: { kind: 'cat', amount: 0 } }).walk;
  assert.equal(w.status, 'home');
  assert.equal(w.doors.length, MAX_DOORS);
});

test('the season is October and the first three days of November, Tbilisi time', () => {
  const tbilisi = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h - 4);
  assert.equal(isSeason(tbilisi(2026, 9, 30, 23)), false);
  assert.equal(isSeason(tbilisi(2026, 10, 1, 0) + 1000), true, 'not open at Tbilisi midnight on 1 October');
  assert.equal(isSeason(tbilisi(2026, 10, 31)), true);
  assert.equal(isSeason(tbilisi(2026, 11, 3, 23)), true);
  assert.equal(isSeason(tbilisi(2026, 11, 4, 0) + 1000), false);
  assert.equal(seasonOf(tbilisi(2026, 10, 15)), 2026);
});

test('the day turns over at Tbilisi midnight', () => {
  const t = Date.UTC(2026, 9, 10, 19, 59);          // 23:59 Tbilisi
  assert.equal(tbilisiDate(t).key, '2026-10-10');
  assert.equal(tbilisiDate(t + 2 * 60_000).key, '2026-10-11');
  assert.equal(nextMidnight(t), Date.UTC(2026, 9, 10, 20, 0));
});

test('the shared line shows the path, never an unopened door', () => {
  const w = goHome(knock({ ...newWalk(), peek: { kind: 'candy', amount: 3 } }).walk);
  const withPeek = { ...w, peek: { kind: 'ghost', amount: 0 } as Door };
  const line = shareLine(withPeek);
  assert.ok(line.includes('🍬'));
  assert.ok(!line.includes('👻'), 'the shared line gave away a door that was never opened');
  assert.ok(line.includes('🏠 3'));
});

test('gear: an amulet to start with, a lit first door, a sweeter bag', () => {
  const w = newWalk(['amulet', 'lantern', 'sweet'], () => 0.5);
  assert.equal(w.amulet, true);
  assert.equal(w.sweet, true);
  assert.ok(w.peek, 'the lantern did not light the first door');
  const plain = knock(newWalk([], () => 0.5), () => 0.5).door;
  const sweet = knock(newWalk(['sweet']), () => 0.5).door;
  assert.equal(sweet.amount, plain.amount + 1);
});
