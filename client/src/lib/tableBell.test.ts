/**
 * When the table bell rings.
 *
 * The whole point of this sound is that it is not annoying, and "not annoying"
 * is entirely a property of when it fires rather than of what it sounds like.
 * Every case here is a way the same one-line intent turns into somebody
 * reaching for the mute button.
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import { nextBell, NO_BELL, type BellMemory, type BellInput } from './tableBell.js';

/** Drive a sequence of states through and collect what rang. */
function run(steps: BellInput[]): { sounds: (string | null)[]; mem: BellMemory } {
  let mem = NO_BELL;
  const sounds: (string | null)[] = [];
  for (const s of steps) { const r = nextBell(mem, s); mem = r.mem; sounds.push(r.play); }
  return { sounds, mem };
}

const speech = (speaker: string | null, endsAt: number, now: number): BellInput =>
  ({ phase: 'speech', speaker, endsAt, now });

test('the summons rings once, as the clock reaches zero', () => {
  const t0 = 1_000_000;
  const { sounds } = run([
    speech('a', t0 + 3000, t0),
    speech('a', t0 + 3000, t0 + 1500),
    speech('a', t0 + 3000, t0 + 3000),   // ← here
  ]);
  assert.deepEqual(sounds, [null, null, 'timeUp']);
});

test('it does not ring on every tick of an expired clock', () => {
  /*
   * The countdown is recomputed from a clock that advances several times a
   * second, and "time is up" stays true for every one of them. Without the
   * per-speaker guard this is a bell every 400 ms until the server answers.
   */
  const t0 = 1_000_000;
  const ticks = [0, 400, 800, 1200, 1600, 2000].map(d => speech('a', t0, t0 + d));
  const { sounds } = run(ticks);
  assert.deepEqual(sounds.filter(Boolean), ['timeUp'], `rang ${sounds.filter(Boolean).length} times`);
});

test('the speech running out does not ring twice', () => {
  /*
   * A speech that runs out advances itself, so "time is up" and "the floor
   * moved" arrive within a frame of each other. Two bells back to back is the
   * exact noise this was supposed to replace.
   */
  const t0 = 1_000_000;
  const { sounds } = run([
    speech('a', t0 + 1000, t0),
    speech('a', t0 + 1000, t0 + 1000),   // time up
    speech('b', t0 + 61_000, t0 + 1180), // the server's advance, moments later
  ]);
  assert.deepEqual(sounds, [null, 'timeUp', null]);
});

test('a moderator cutting somebody off does ring — quietly', () => {
  // The case the second sound exists for: the floor moves with time left.
  const t0 = 1_000_000;
  const { sounds } = run([
    speech('a', t0 + 60_000, t0),
    speech('a', t0 + 60_000, t0 + 5_000),
    speech('b', t0 + 60_000, t0 + 5_200),
  ]);
  assert.deepEqual(sounds, [null, null, 'next']);
});

test('a switch long after the summons is the host, not the auto-advance', () => {
  // A host who lets somebody finish their sentence and then moves on should
  // still get the acknowledgement.
  const t0 = 1_000_000;
  const { sounds } = run([
    speech('a', t0, t0),                 // time up immediately
    speech('a', t0, t0 + 8_000),
    speech('b', t0 + 60_000, t0 + 8_100),
  ]);
  assert.deepEqual(sounds, ['timeUp', null, 'next']);
});

test('the first speaker of a round arrives quietly', () => {
  // Entering the speech phase has its own sound already; announcing the first
  // speaker as well says one thing twice.
  const t0 = 1_000_000;
  const { sounds } = run([speech('a', t0 + 60_000, t0)]);
  assert.deepEqual(sounds, [null]);
});

test('leaving the phase resets, so the next round also starts quietly', () => {
  const t0 = 1_000_000;
  const { sounds } = run([
    speech('a', t0 + 1000, t0),
    speech('a', t0 + 1000, t0 + 1000),           // time up
    { phase: 'vote', speaker: null, endsAt: 0, now: t0 + 2000 },
    { phase: 'night', speaker: null, endsAt: 0, now: t0 + 9000 },
    speech('c', t0 + 70_000, t0 + 20_000),       // a new round's first speaker
  ]);
  assert.deepEqual(sounds, [null, 'timeUp', null, null, null]);
});

test('the same speaker can be rung for again in a later round', () => {
  /*
   * Speech order repeats every day, so remembering "already rang for a" for the
   * rest of the game would silently drop the summons for whoever spoke first.
   */
  const t0 = 1_000_000;
  const { sounds } = run([
    speech('a', t0 + 1000, t0 + 1000),           // day 1: rings
    { phase: 'night', speaker: null, endsAt: 0, now: t0 + 5000 },
    speech('a', t0 + 100_000, t0 + 90_000),      // day 2, same player, time left
    speech('a', t0 + 100_000, t0 + 100_000),     // ← rings again
  ]);
  assert.deepEqual(sounds, ['timeUp', null, null, 'timeUp']);
});

test('an untimed speech never rings the summons', () => {
  // `endsAt` is 0 when nothing is counting down; `0 - now <= 0` would otherwise
  // read as "expired" on every single tick.
  const t0 = 1_000_000;
  const { sounds } = run([
    speech('a', 0, t0),
    speech('a', 0, t0 + 5000),
    speech('a', 0, t0 + 50_000),
  ]);
  assert.deepEqual(sounds, [null, null, null]);
});
