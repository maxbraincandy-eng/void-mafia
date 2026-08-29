/**
 * Choosing which frames belong in the photograph.
 *
 * Raising the burst from five frames to fourteen made this necessary rather
 * than merely nice: more evidence is only better if the bad evidence is thrown
 * out, and the odds that one frame of fourteen caught a shake are much higher
 * than one of five.
 *
 * The failure mode has no symptom of its own. A blurred frame aligns perfectly
 * well, merges quietly, and spreads its blur across every pixel — the photo is
 * simply a bit softer than it should have been, which nobody can see without
 * the version that rejected it to compare against.
 *
 *   npx tsx --test src/lib/frameQuality.test.ts
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import { scoreFrame, selectFrames, framesForZoom, SELECTION_DEFAULTS } from './frameQuality.js';
import type { Pixels } from './photoPipeline.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A scene with real structure at several scales. */
function scene(w: number, h: number, brightness = 0): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 96 + 46 * Math.sin(x * 0.09) * Math.cos(y * 0.07);
      v += 34 * Math.sin(x * 0.42 + y * 0.23);
      if (((x / 11) | 0) % 3 === 0) v += 30;
      const p = (y * w + x) * 4;
      const c = Math.max(0, Math.min(255, v + brightness));
      data[p] = c; data[p + 1] = c; data[p + 2] = c; data[p + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

/** Smear horizontally, the way a hand moving during the exposure does. */
function smeared(img: Pixels, radius: number): Pixels {
  const { width: w, height: h } = img;
  const out = new Uint8ClampedArray(img.data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0, n = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = Math.max(0, Math.min(w - 1, x + k));
          sum += img.data[(y * w + xx) * 4 + c]; n++;
        }
        out[(y * w + x) * 4 + c] = sum / n;
      }
      out[(y * w + x) * 4 + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

// ── Scoring ───────────────────────────────────────────────────────────────────

test('a smeared frame scores lower than the frame it came from', () => {
  const sharp = scene(120, 90);
  assert.ok(scoreFrame(smeared(sharp, 3)).sharpness < scoreFrame(sharp).sharpness * 0.7,
    'motion blur did not register as a loss of sharpness');
});

test('sharpness rises with the amount of detail present', () => {
  const flat: Pixels = { data: new Uint8ClampedArray(60 * 60 * 4).fill(128), width: 60, height: 60 };
  assert.ok(scoreFrame(scene(60, 60)).sharpness > scoreFrame(flat).sharpness * 5,
    'a flat field scored close to a detailed one');
});

test('brightness and clipping are measured', () => {
  const dark = scene(80, 60, -70);
  const bright = scene(80, 60, +70);
  assert.ok(scoreFrame(dark).luma < scoreFrame(bright).luma - 40);

  const blown: Pixels = { data: new Uint8ClampedArray(40 * 40 * 4).fill(255), width: 40, height: 40 };
  assert.ok(scoreFrame(blown).clipped > 0.9, 'a blown frame did not report clipping');
  assert.ok(scoreFrame(scene(40, 40)).clipped < 0.05, 'a normal frame reported clipping');
});

test('a frame too small to have gradients scores zero rather than throwing', () => {
  assert.equal(scoreFrame({ data: new Uint8ClampedArray(4), width: 1, height: 1 }).sharpness, 0);
});

// ── Selection ─────────────────────────────────────────────────────────────────

test('the one smeared frame in a burst is dropped', () => {
  /*
   * The case this file exists for. The merge would have kept it — it aligns
   * perfectly well — and spread its blur across the result.
   */
  const frames = [scene(120, 90), scene(120, 90), smeared(scene(120, 90), 4), scene(120, 90), scene(120, 90)];
  const sel = selectFrames(frames);

  assert.deepEqual(sel.rejected.map(r => r.index), [2]);
  assert.equal(sel.rejected[0].reason, 'blurred');
  assert.deepEqual(sel.keep, [0, 1, 3, 4]);
});

test('a frame where auto-exposure hunted is dropped', () => {
  /*
   * Merging frames a stop apart averages towards a brightness none of them had
   * — a flat, washed result that looks like the tone mapping misfired, in a
   * stage that has nothing to do with tone mapping.
   */
  const frames = [scene(100, 80), scene(100, 80), scene(100, 80, 55), scene(100, 80)];
  const sel = selectFrames(frames);
  assert.deepEqual(sel.rejected.map(r => r.index), [2]);
  assert.equal(sel.rejected[0].reason, 'exposure');
});

test('a burst of equally good frames loses none of them', () => {
  // The common case, and the one where over-eager rejection would quietly cost
  // quality on every photo taken in decent conditions.
  const frames = [0, 1, 2, 3, 4, 5].map(() => scene(100, 80));
  const sel = selectFrames(frames);
  assert.equal(sel.rejected.length, 0);
  assert.equal(sel.keep.length, 6);
});

test('small natural variation in sharpness is tolerated', () => {
  // Hand tremor varies frame to frame and a little softness is normal. A floor
  // tight enough to catch that would reject most of every real burst.
  const frames = [scene(120, 90), smeared(scene(120, 90), 1), scene(120, 90), smeared(scene(120, 90), 1)];
  const sel = selectFrames(frames);
  assert.equal(sel.keep.length, 4, `dropped ${sel.rejected.length} frames for ordinary variation`);
});

test('a uniformly soft burst is kept, because that is what the scene looks like', () => {
  /*
   * There is no absolute threshold for "sharp enough" — a photograph of fog is
   * legitimately low in gradient energy. Scores are relative to the burst's own
   * best for exactly this reason, so a soft scene does not read as a failed one.
   */
  const frames = [0, 1, 2, 3].map(() => smeared(scene(120, 90), 4));
  const sel = selectFrames(frames);
  assert.equal(sel.rejected.length, 0);
});

test('never fewer than the floor, however bad the burst', () => {
  /*
   * A burst is expensive to collect and a merge of two soft frames still beats
   * one soft frame. Refusing to merge because nothing met a threshold throws
   * away the whole point of having taken a burst.
   */
  const frames = [scene(90, 70), smeared(scene(90, 70), 8), smeared(scene(90, 70), 9), smeared(scene(90, 70), 10)];
  const sel = selectFrames(frames, { ...SELECTION_DEFAULTS, sharpnessFloor: 0.99 });
  assert.ok(sel.keep.length >= SELECTION_DEFAULTS.minKeep, `kept only ${sel.keep.length}`);
  assert.ok(sel.keep.includes(0), 'the sharpest frame was not among those kept');
});

test('a burst at or below the floor is passed through untouched', () => {
  const two = [scene(60, 50), smeared(scene(60, 50), 6)];
  const sel = selectFrames(two);
  assert.deepEqual(sel.keep, [0, 1], 'there was nothing to choose between');
  assert.equal(sel.rejected.length, 0);
});

test('kept frames stay in their original order', () => {
  /*
   * The merge picks its own reference by a different measure. Handing it a
   * re-ordered burst would make the indices in two reports disagree, which is
   * the kind of bug that only shows up in a readout nobody double-checks.
   */
  const frames = [scene(80, 60), smeared(scene(80, 60), 5), scene(80, 60), scene(80, 60)];
  const sel = selectFrames(frames);
  assert.deepEqual(sel.keep, [...sel.keep].sort((a, b) => a - b));
  assert.equal(sel.scores.length, frames.length, 'every frame is scored, including the rejected');
});

// ── Burst size ────────────────────────────────────────────────────────────────

test('higher zoom asks for more frames', () => {
  /*
   * Reconstruction onto a finer grid needs the burst to have sampled enough
   * distinct sub-pixel phases to fill it. At 1× there is no finer grid and the
   * frames buy noise reduction alone, which saturates quickly.
   */
  const max = 14;
  assert.ok(framesForZoom(4, max) > framesForZoom(2, max));
  assert.ok(framesForZoom(2, max) > framesForZoom(1, max));
  assert.equal(framesForZoom(5, max), max, 'the highest zoom should use the whole budget');
});

test('the device tier is a ceiling that zoom cannot raise', () => {
  // A phone that cannot chew through three frames is not asked for twenty
  // because the zoom happened to be high.
  for (const tierMax of [3, 6, 10, 14]) {
    for (const zoom of [1, 1.5, 2, 3, 4, 5, 10]) {
      const n = framesForZoom(zoom, tierMax);
      assert.ok(n <= tierMax, `zoom ${zoom} asked for ${n} on a tier capped at ${tierMax}`);
      assert.ok(n >= 2, `zoom ${zoom} on tier ${tierMax} gave ${n} — that is not a burst`);
    }
  }
});
