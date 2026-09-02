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

import { ringShape, fitTile } from './ringShape.js';

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

// ── The phone ─────────────────────────────────────────────────────────────────

/*
 * A phone in the hand: about 340 points of stage across and 560 down, holding
 * portrait tiles. The shape has to come out different from the laptop's or the
 * tiles end up 79 by 44 — a letterbox slit rather than a face.
 */
const PHONE = { boxAspect: 340 / 560, tileAspect: 3 / 4 };

test('a phone gets a taller board than a laptop, from the same seat count', () => {
  for (const n of COUNTS) {
    const phone = ringShape(n, PHONE);
    const laptop = ringShape(n);
    assert.ok(phone.side >= laptop.side, `${n}: the phone should stack more down the sides`);
    assert.ok(Math.max(phone.top, phone.bottom) <= Math.max(laptop.top, laptop.bottom),
      `${n}: the phone should put fewer across the ends`);
  }
});

test('twelve on a phone is four, four and two down each side', () => {
  // The layout this was asked for, and the one a full table lands on: four
  // across the top, two down each side, four along the bottom, host in the
  // middle.
  assert.deepEqual(ringShape(12, PHONE), { top: 4, bottom: 4, side: 2 });
});

test('every phone shape still seats everyone, with room for a stage', () => {
  for (const n of COUNTS) {
    const { top, bottom, side } = ringShape(n, PHONE);
    assert.equal(top + bottom + side * 2, n, `${n} seats`);
    assert.ok(side >= 1, `${n}: no sides means no ring`);
    /*
     * The stage sits between the side columns and takes what they leave, so a
     * board narrower than three tiles has no middle for the host at all — the
     * one failure that would put the host's camera at a negative width.
     */
    assert.ok(Math.max(top, bottom) >= 3, `${n}: ${Math.max(top, bottom)} across leaves no stage`);
  }
});

test('the phone board comes out portrait, because the phone is', () => {
  for (const n of COUNTS) {
    const { top, bottom, side } = ringShape(n, PHONE);
    const aspect = (Math.max(top, bottom) * PHONE.tileAspect) / (side + 2);
    assert.ok(aspect <= 1, `${n} seats: board aspect ${aspect.toFixed(2)} is landscape on a portrait screen`);
    assert.ok(aspect >= 0.4, `${n} seats: board aspect ${aspect.toFixed(2)} is too tall to fit`);
  }
});

test('the shape follows the box it is given, not the seat count alone', () => {
  /*
   * The property the whole function rests on. Twelve players on a laptop and
   * twelve on a phone are the same twelve people; if the shape came back the
   * same for both, the box argument would be decoration.
   */
  assert.notDeepEqual(ringShape(10, PHONE), ringShape(10));
});

// ── The frame every seat gets ─────────────────────────────────────────────────

/** The stage a phone and a laptop actually hand the table, measured. */
const PHONE_BOX = { availW: 366, availH: 621 };
const LAPTOP_BOX = { availW: 1416, availH: 688 };

/** Every ring the two screens can produce, as columns × rows of tiles. */
function ringGrids() {
  const out: { name: string; box: typeof PHONE_BOX; cols: number; rows: number; mode: 'webcam' | 'fill'; gap: number }[] = [];
  for (const n of COUNTS) {
    const p = ringShape(n, PHONE);
    out.push({ name: `phone ${n}`, box: PHONE_BOX, cols: Math.max(p.top, p.bottom), rows: p.side + 2, mode: 'fill' as const, gap: 6 });
    const l = ringShape(n);
    out.push({ name: `laptop ${n}`, box: LAPTOP_BOX, cols: Math.max(l.top, l.bottom), rows: l.side + 2, mode: 'webcam' as const, gap: 10 });
  }
  return out;
}

test('the whole board fits the box it was given', () => {
  /*
   * The bug this replaced: the grid was sized off width alone and the last row
   * sat underneath the host bar, off the bottom of the screen. A table with a
   * row you cannot see is not a table.
   */
  for (const g of ringGrids()) {
    const t = fitTile({ ...g.box, cols: g.cols, rows: g.rows, gap: g.gap, mode: g.mode });
    const boardW = t.w * g.cols + g.gap * (g.cols - 1);
    const boardH = t.h * g.rows + g.gap * (g.rows - 1);
    assert.ok(boardW <= g.box.availW + 0.5, `${g.name}: board ${boardW.toFixed(0)} wide in ${g.box.availW}`);
    assert.ok(boardH <= g.box.availH + 0.5, `${g.name}: board ${boardH.toFixed(0)} tall in ${g.box.availH}`);
  }
});

test('a tile is always a camera frame, never a ribbon', () => {
  // Cropped to fill, an extreme frame shows a slice rather than a face. The
  // bands are what keep "fill the screen" from turning into that.
  for (const g of ringGrids()) {
    const t = fitTile({ ...g.box, cols: g.cols, rows: g.rows, gap: g.gap, mode: g.mode });
    const aspect = t.w / t.h;
    if (g.mode === 'fill') {
      assert.ok(aspect >= 0.5 - 1e-9 && aspect <= 2 + 1e-9, `${g.name}: frame aspect ${aspect.toFixed(2)}`);
    } else {
      assert.ok(Math.abs(aspect - 16 / 9) < 1e-9, `${g.name}: a laptop tile should stay 16:9, got ${aspect.toFixed(2)}`);
    }
  }
});

test('a phone board uses the height it has', () => {
  /*
   * Four 16:9 tiles across a phone left a third of the screen empty and the
   * tiles 49 points tall. Filling the height is the whole reason the portrait
   * frame is allowed to stretch, so it is worth pinning that it actually does.
   */
  for (const n of COUNTS) {
    const p = ringShape(n, PHONE);
    const t = fitTile({ ...PHONE_BOX, cols: Math.max(p.top, p.bottom), rows: p.side + 2, gap: 6, mode: 'fill' });
    const boardH = t.h * (p.side + 2) + 6 * (p.side + 1);
    assert.ok(boardH >= PHONE_BOX.availH * 0.9,
      `${n} seats: board fills only ${Math.round(100 * boardH / PHONE_BOX.availH)}% of the height`);
  }
});

test('a small table still fits without scrolling', () => {
  // The fallback grid, which is where four to seven players and the mafia's
  // first night land. Everybody plus the host, two columns on a phone.
  for (const n of [4, 5, 6, 7]) {
    const cols = 2;
    const rows = Math.ceil((n + 1) / cols);
    const t = fitTile({ ...PHONE_BOX, cols, rows, gap: 8, mode: 'fill' });
    const boardH = t.h * rows + 8 * (rows - 1);
    assert.ok(boardH <= PHONE_BOX.availH + 0.5, `${n} players: ${boardH.toFixed(0)} tall in ${PHONE_BOX.availH}`);
  }
});

test('a tile never comes back at zero or negative size', () => {
  // A box can be measured at nothing for a frame during a phase change, and a
  // negative width would put the video element into an error state it does not
  // come back from.
  for (const box of [{ availW: 0, availH: 0 }, { availW: 40, availH: 900 }, { availW: 900, availH: 30 }]) {
    for (const mode of ['fill', 'webcam'] as const) {
      const t = fitTile({ ...box, cols: 5, rows: 4, gap: 10, mode });
      assert.ok(t.w > 0 && t.h > 0, `${JSON.stringify(box)} ${mode} → ${t.w}×${t.h}`);
    }
  }
});
