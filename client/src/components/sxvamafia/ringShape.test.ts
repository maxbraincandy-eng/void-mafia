/**
 * The desktop ring's shape.
 *
 * Pure arithmetic, and the reason it is worth pinning: the version before this
 * spaced seats around a grid perimeter, which at ten players left both spare
 * cells on corners — the top row ran #1 #2 #3 and stopped short, and the bottom
 * row did the same at the other end. A missing corner is the one gap a
 * rectangle cannot absorb.
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import { ringShape } from './ringShape.js';

/** The ring is only used from eight seats up; twelve is the table maximum. */
const COUNTS = [8, 9, 10, 11, 12, 13, 14];

test('every seat gets a place, and only one', () => {
  for (const n of COUNTS) {
    const { top, bottom, side } = ringShape(n);
    assert.equal(top + bottom + side * 2, n, `${n} seats`);
    assert.ok(side >= 1, `${n}: the sides are what make it a ring rather than a grid`);
    assert.ok(top >= 1 && bottom >= 1, `${n}: no empty end`);
  }
});

test('the two ends never differ by more than one seat', () => {
  for (const n of COUNTS) {
    const { top, bottom } = ringShape(n);
    assert.ok(Math.abs(top - bottom) <= 1, `${n}: top ${top}, bottom ${bottom}`);
  }
});

test('an even table is symmetric on both axes', () => {
  // The sides are equal by construction; this is about the ends.
  for (const n of [8, 10, 12, 14]) {
    const { top, bottom } = ringShape(n);
    assert.equal(top, bottom, `${n} seats should mirror top to bottom`);
  }
});

test('an odd table puts the extra seat at the bottom', () => {
  // The eye starts at the top of the screen, so a ragged edge is less
  // noticeable at the far end.
  for (const n of [9, 11, 13]) {
    const { top, bottom } = ringShape(n);
    assert.equal(bottom, top + 1, `${n} seats`);
  }
});

test('ten players sit four, four, and one down each side', () => {
  // The case that prompted this. The old layout put 3 across the top and 3
  // across the bottom with the corners missing, so the gaps landed between #3
  // and #4 and between #8 and #9.
  assert.deepEqual(ringShape(10), { top: 4, bottom: 4, side: 1 });
});

test('the board comes out landscape, because the screen is', () => {
  /*
   * Tiles are 16:9, so a shape's aspect is across / ((side + 2) * 9/16). The
   * ring only runs on a box around 2:1, and a board much taller than that runs
   * out of height with the width unused — which is what made the tiles small
   * and left a portrait hole for the stage.
   */
  for (const n of COUNTS) {
    const { top, bottom, side } = ringShape(n);
    const aspect = Math.max(top, bottom) * 16 / (9 * (side + 2));
    assert.ok(aspect >= 1.7, `${n} seats: board aspect ${aspect.toFixed(2)} is too tall`);
    assert.ok(aspect <= 3.0, `${n} seats: board aspect ${aspect.toFixed(2)} is too wide`);
  }
});

test('no end gets so long the tiles shrink', () => {
  for (const n of COUNTS) {
    const { top, bottom } = ringShape(n);
    assert.ok(Math.max(top, bottom) <= 5, `${n} seats`);
  }
});

test('the sides stay short so the board stays wide', () => {
  for (const n of COUNTS) {
    assert.ok(ringShape(n).side <= 2, `${n} seats`);
  }
});
