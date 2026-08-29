/**
 * Device tiers.
 *
 * The numbers here decide how much work a phone is asked to do, and getting
 * them wrong is invisible in exactly one direction: a flagship quietly doing a
 * fraction of what it could looks fine, feels fine, and produces a worse photo
 * than it should have. So the shape of the mapping is asserted rather than left
 * to whoever last edited the table.
 *
 *   npx tsx --test src/lib/deviceTier.test.ts
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import { tierFor, capability, type Tier } from './deviceTier.js';

test('more capable hardware never gets a lower tier', () => {
  // The monotonicity that makes the table trustworthy. A phone with strictly
  // more of everything must never be asked to do less.
  const rank: Record<Tier, number> = { low: 0, medium: 1, high: 2, ultra: 3 };
  for (const cores of [1, 2, 4, 6, 8, 12, 16]) {
    for (const gb of [0.5, 1, 2, 4, 8, 16]) {
      const here = rank[tierFor(cores, gb)];
      assert.ok(rank[tierFor(cores + 2, gb)] >= here, `${cores}c/${gb}g fell going up in cores`);
      assert.ok(rank[tierFor(cores, gb * 2)] >= here, `${cores}c/${gb}g fell going up in memory`);
    }
  }
});

test('the tiers land where they are meant to', () => {
  assert.equal(tierFor(8, 8), 'ultra', 'a current flagship');
  assert.equal(tierFor(6, 4), 'high', 'a good mid-range phone');
  assert.equal(tierFor(4, 4), 'medium');
  assert.equal(tierFor(2, 2), 'low', 'a budget phone or a locked-down browser');
  assert.equal(tierFor(8, 2), 'medium', 'cores without memory is not a flagship');
});

test('every tier still takes more than one frame', () => {
  /*
   * The merge is where most of the quality is, and it is worth having even on
   * the slowest device this runs on. A tier that dropped to a single frame
   * would be shipping the plain browser snapshot this whole pipeline exists to
   * beat.
   */
  for (const [cores, gb] of [[1, 0.5], [2, 1], [4, 4], [8, 8], [16, 16]] as [number, number][]) {
    const c = { ...capabilityFor(cores, gb) };
    assert.ok(c.frames >= 2, `${c.tier} collects ${c.frames} frame(s)`);
    assert.ok(c.workers >= 1, `${c.tier} has no workers`);
  }
});

test('a stronger tier collects more evidence and is given longer to do it', () => {
  const low = capabilityFor(2, 1);
  const ultra = capabilityFor(8, 8);
  assert.ok(ultra.frames > low.frames, 'the flagship collects no more than the budget phone');
  assert.ok(ultra.burstBudgetMs >= low.burstBudgetMs);
  assert.ok(ultra.maxMegapixels >= low.maxMegapixels);
  assert.ok(ultra.superResolve && !low.superResolve,
    'reconstruction is the expensive stage and belongs to the phones that can afford it');
});

test('one core is always left for the interface', () => {
  /*
   * The main thread still has to paint a viewfinder and answer taps while this
   * runs. Saturating every core makes the interface stutter, which reads as a
   * slower camera even when the photo arrives sooner.
   */
  for (const cores of [1, 2, 4, 8, 16, 64]) {
    const w = capabilityFor(cores, 8).workers;
    assert.ok(w >= 1, `${cores} cores gave no workers`);
    if (cores > 1) assert.ok(w < cores, `${cores} cores used all ${w} of them`);
    assert.ok(w <= 8, `${cores} cores spawned ${w} workers — more than the copies are worth`);
  }
});

/** `capability()` reads globals; this exercises the same table directly. */
function capabilityFor(cores: number, gb: number) {
  const nav = globalThis.navigator as any;
  const had = !!nav;
  const prev = had ? { c: nav.hardwareConcurrency, m: nav.deviceMemory } : null;
  if (!had) (globalThis as any).navigator = {};
  const n = globalThis.navigator as any;
  Object.defineProperty(n, 'hardwareConcurrency', { value: cores, configurable: true });
  Object.defineProperty(n, 'deviceMemory', { value: gb, configurable: true });
  try {
    return capability();
  } finally {
    if (had && prev) {
      Object.defineProperty(n, 'hardwareConcurrency', { value: prev.c, configurable: true });
      Object.defineProperty(n, 'deviceMemory', { value: prev.m, configurable: true });
    } else {
      delete (globalThis as any).navigator;
    }
  }
}

test('missing browser hints do not drop a phone to the bottom tier', () => {
  /*
   * `deviceMemory` is absent on Safari and Firefox. Treating absence as "small"
   * would put every iPhone on the lowest tier — three frames and no
   * reconstruction on hardware that could manage fourteen — which is plainly
   * the wrong reading of "this browser declines to say".
   */
  const nav = globalThis.navigator as any;
  const had = !!nav;
  if (!had) (globalThis as any).navigator = {};
  const n = globalThis.navigator as any;
  Object.defineProperty(n, 'hardwareConcurrency', { value: 6, configurable: true });
  Object.defineProperty(n, 'deviceMemory', { value: undefined, configurable: true });
  try {
    assert.notEqual(capability().tier, 'low', 'an unreported memory size was read as a small one');
  } finally {
    if (!had) delete (globalThis as any).navigator;
  }
});
