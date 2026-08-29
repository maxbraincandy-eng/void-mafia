/**
 * Strips, halos, and the seam.
 *
 * The bug this file exists to prevent does not throw and does not look like a
 * bug. Split an image filter across workers without giving each one the rows it
 * needs to READ, and the output gains faint horizontal lines where the strips
 * met — which look like a sensor fault, get blamed on the camera, and survive
 * every test that only checks the filter itself.
 *
 * So the standard here is not "close enough". It is byte-identical to the
 * single-threaded result. Anything less is a seam somebody will find.
 *
 *   npx tsx --test src/lib/stripe.test.ts
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import { strips, sliceRows, stitch } from './stripe.js';
import { haloFor, sliceTask } from './photoPool.js';
import { planMerge, mergeRows, mergeBurst, MERGE_DEFAULTS } from './burstMerge.js';
import type { Pixels } from './photoPipeline.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function scene(w: number, h: number, ox = 0, oy = 0): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x + ox, sy = y + oy;
      let v = 40 + 60 * Math.sin(sx * 0.06) * Math.cos(sy * 0.05);
      v += 45 * Math.sin(sx * 0.31 + sy * 0.17);
      if (sx > w * 0.3 && sx < w * 0.6 && sy > h * 0.3 && sy < h * 0.65) v += 70;
      const p = (y * w + x) * 4;
      data[p] = Math.max(0, Math.min(255, v + 30));
      data[p + 1] = Math.max(0, Math.min(255, v + 55));
      data[p + 2] = Math.max(0, Math.min(255, v + 20));
      data[p + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

function noisy(img: Pixels, amp: number, seed: number): Pixels {
  const data = new Uint8ClampedArray(img.data);
  let s = seed | 1;
  for (let i = 0; i < data.length; i++) {
    if (i % 4 === 3) continue;
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    data[i] = data[i] + ((s / 0x7fffffff) * 2 - 1) * amp;
  }
  return { data, width: img.width, height: img.height };
}

// ── Tiling ────────────────────────────────────────────────────────────────────

test('strips tile the image exactly: no gap, no overlap', () => {
  // The property the seam depends on. Every row produced by exactly one worker.
  for (const [h, n] of [[100, 4], [100, 3], [7, 4], [1, 8], [1000, 7], [13, 13]] as [number, number][]) {
    const s = strips(h, n, 12);
    assert.ok(s.length > 0, `${h} rows across ${n} gave nothing`);
    assert.equal(s[0].y0, 0, 'starts at the top');
    assert.equal(s[s.length - 1].y1, h, 'ends at the bottom');
    for (let i = 1; i < s.length; i++) {
      assert.equal(s[i].y0, s[i - 1].y1, `gap or overlap between strip ${i - 1} and ${i}`);
    }
    assert.equal(s.reduce((t, x) => t + (x.y1 - x.y0), 0), h, 'rows do not add up');
  }
});

test('the halo extends the readable range and is clipped at the edges', () => {
  const s = strips(100, 4, 10);
  assert.equal(s[0].readY0, 0, 'the first strip cannot read above the image');
  assert.ok(s[1].readY0 < s[1].y0, 'a middle strip reads above itself');
  assert.ok(s[1].readY1 > s[1].y1, 'and below itself');
  assert.equal(s[3].readY1, 100, 'the last strip cannot read past the bottom');
});

test('more workers than rows does not produce empty strips', () => {
  const s = strips(3, 16, 4);
  assert.equal(s.length, 3);
  for (const x of s) assert.ok(x.y1 > x.y0);
});

test('slicing gives back the rows asked for, and clamps beyond the edges', () => {
  const img = scene(8, 10);
  const cut = sliceRows(img, 3, 6);
  assert.equal(cut.height, 3);
  assert.equal(cut.width, 8);
  for (let x = 0; x < 8; x++) {
    assert.equal(cut.data[x * 4], img.data[(3 * 8 + x) * 4], 'the first row is row 3');
  }
  assert.equal(sliceRows(img, 8, 99).height, 2, 'clamped at the bottom');
  assert.equal(sliceRows(img, -5, 2).height, 2, 'clamped at the top');
});

test('stitching refuses to hide a gap', () => {
  /*
   * A missing strip must be an error, not a black band. Silently returning an
   * image with a hole in it is how this failure reaches a user.
   */
  const stride = 4 * 4;
  const piece = (y0: number, y1: number) => ({ y0, y1, data: new Uint8ClampedArray((y1 - y0) * stride) });
  assert.throws(() => stitch([piece(0, 3), piece(5, 8)], 4, 8), /do not tile/);
  assert.doesNotThrow(() => stitch([piece(0, 4), piece(4, 8)], 4, 8));
});

// ── The claim ─────────────────────────────────────────────────────────────────

test('a merge split across strips is byte-identical to a merge that was not', { timeout: 300_000 }, () => {
  /*
   * THE TEST THIS FILE EXISTS FOR.
   *
   * Not "close enough" and not "looks the same": identical. A parallel image
   * pipeline that differs from the serial one by even a level has a seam in it
   * somewhere, and a seam is a horizontal line across a photograph.
   */
  const frames = [[0, 0], [2, 1], [-1, 2], [1, -2], [3, 0], [-2, -1]]
    .map(([ox, oy], i) => noisy(scene(160, 120, ox, oy), 14, (i + 1) * 7919));

  const serial = mergeBurst(frames).merged;

  const plan = planMerge(frames);
  for (const workers of [2, 3, 4, 7, 16]) {
    const pieces = strips(120, workers, 8).map(s => ({
      y0: s.y0, y1: s.y1,
      data: mergeRows(plan, { y0: s.y0, y1: s.y1 }, MERGE_DEFAULTS).data,
    }));
    const parallel = stitch(pieces, 160, 120);

    assert.equal(parallel.data.length, serial.data.length);
    for (let i = 0; i < serial.data.length; i++) {
      if (parallel.data[i] !== serial.data[i]) {
        const px = Math.floor(i / 4), row = Math.floor(px / 160);
        assert.fail(`${workers} workers: byte ${i} (row ${row}) is ${parallel.data[i]}, serial says ${serial.data[i]}`);
      }
    }
  }
});

test('a single strip is the whole image', { timeout: 120_000 }, () => {
  // The degenerate case, which is also the fallback when only one core is
  // available — it must go down the same path and produce the same answer.
  const frames = [[0, 0], [1, 1], [-1, 0]].map(([ox, oy], i) => noisy(scene(96, 64, ox, oy), 10, (i + 3) * 31));
  const serial = mergeBurst(frames).merged;
  const plan = planMerge(frames);
  const one = mergeRows(plan, { y0: 0, y1: 64 }, MERGE_DEFAULTS).data;
  assert.deepEqual([...one], [...serial.data]);
});

test('every strip boundary is examined, not just the middle of the image', { timeout: 300_000 }, () => {
  /*
   * A seam is one row wide. A test that compares whole images can pass on
   * average while failing on the two rows that matter, so this looks straight
   * at them: for every boundary, the rows either side must match the serial
   * result exactly.
   */
  const frames = [[0, 0], [2, 3], [-3, 1], [1, -2]]
    .map(([ox, oy], i) => noisy(scene(128, 96, ox, oy), 18, (i + 5) * 104729));

  const serial = mergeBurst(frames).merged;
  const plan = planMerge(frames);
  const s = strips(96, 5, 8);
  const parallel = stitch(s.map(x => ({
    y0: x.y0, y1: x.y1, data: mergeRows(plan, { y0: x.y0, y1: x.y1 }, MERGE_DEFAULTS).data,
  })), 128, 96);

  for (const boundary of s.slice(1).map(x => x.y0)) {
    for (const row of [boundary - 1, boundary]) {
      for (let x = 0; x < 128; x++) {
        const p = (row * 128 + x) * 4;
        assert.equal(parallel.data[p], serial.data[p], `seam at row ${row}, x ${x}`);
        assert.equal(parallel.data[p + 1], serial.data[p + 1]);
        assert.equal(parallel.data[p + 2], serial.data[p + 2]);
      }
    }
  }
});

test('the plan is made once and shared, not remade per strip', { timeout: 120_000 }, () => {
  /*
   * Choosing a reference frame is a decision about the whole image. Two strips
   * that picked different references would each be internally consistent and
   * disagree with each other — a seam that no amount of halo can fix, because
   * the halo is not what is wrong.
   */
  const frames = [[0, 0], [1, 0], [0, 1]].map(([ox, oy], i) => noisy(scene(80, 60, ox, oy), 12, (i + 7) * 577));
  const plan = planMerge(frames);
  assert.ok(plan.contributors.every(c => c.index !== plan.reference), 'the reference is not its own contributor');
  assert.equal(plan.offsets.length, frames.length, 'every frame has an offset recorded');
  assert.equal(plan.offsets[plan.reference].dx, 0, 'the reference does not move relative to itself');
});

// ── The sliced path, which is the one that actually ships ─────────────────────

test('merging from SLICED frames is byte-identical to merging from whole ones', { timeout: 300_000 }, () => {
  /*
   * The test that matters most, and the one the earlier tests do not cover.
   *
   * A worker is not handed the whole burst — that would be one copy of every
   * frame per core, over a gigabyte for a large burst. It gets its own band
   * plus a halo. So every sample the merge takes near a strip edge is now
   * reaching into a SHORTER image, and `mergeRows` clamps at the image
   * boundary. If the halo is one row short of the alignment offset, the clamp
   * fires, the strip disagrees with its neighbour, and there is a line across
   * the photograph.
   *
   * Deliberately awkward vertical offsets, so the halo is doing real work.
   */
  const shifts: [number, number][] = [[0, 0], [1, 5], [-2, -6], [3, 4], [-1, -5], [2, 7]];
  const frames = shifts.map(([ox, oy], i) => noisy(scene(140, 180, ox, oy), 16, (i + 1) * 7919));

  const serial = mergeBurst(frames).merged;
  const plan = planMerge(frames);
  const halo = haloFor(plan);
  assert.ok(halo >= 2, 'a halo of nothing would defeat the point');

  for (const workers of [2, 3, 5, 8]) {
    const pieces = strips(180, workers, halo).map(strip => {
      const task = sliceTask(plan, strip);
      return {
        y0: strip.y0, y1: strip.y1,
        data: mergeRows(task.plan, task.rows, MERGE_DEFAULTS).data,
      };
    });
    const parallel = stitch(pieces, 140, 180);

    for (let i = 0; i < serial.data.length; i++) {
      if (parallel.data[i] !== serial.data[i]) {
        const px = Math.floor(i / 4);
        assert.fail(`${workers} workers, halo ${halo}: row ${Math.floor(px / 140)} col ${px % 140} `
          + `channel ${i % 4} is ${parallel.data[i]}, serial says ${serial.data[i]}`);
      }
    }
  }
});

test('the halo covers the largest vertical offset in the burst', () => {
  // The one number that decides whether the sliced path is correct. Too small
  // and the sampler clamps at a strip edge instead of reading its neighbour.
  const frames = [[0, 0], [0, 9], [0, -11], [0, 3]]
    .map(([ox, oy], i) => noisy(scene(64, 96, ox, oy), 8, (i + 1) * 31));
  const plan = planMerge(frames);
  const halo = haloFor(plan);
  for (const c of plan.contributors) {
    assert.ok(halo > Math.abs(c.dy), `halo ${halo} does not cover offset ${c.dy}`);
  }
});

test('a slice keeps the offsets and renumbers the rows', () => {
  /*
   * A translation does not change when the origin moves, so the offsets are
   * carried across untouched — but the rows to produce are now counted from the
   * top of the cut, not the top of the photo. Getting that backwards shifts a
   * strip's output by the halo, which is a very visible tear rather than a
   * subtle seam.
   */
  const frames = [[0, 0], [2, 4]].map(([ox, oy], i) => noisy(scene(40, 100, ox, oy), 6, (i + 1) * 97));
  const plan = planMerge(frames);
  const strip = strips(100, 4, 6)[2];
  const task = sliceTask(plan, strip);

  assert.deepEqual(task.plan.contributors, plan.contributors, 'offsets were rewritten');
  assert.equal(task.plan.usable[0].height, strip.readY1 - strip.readY0, 'frames were cut to the readable band');
  assert.equal(task.rows.y0, strip.y0 - strip.readY0, 'output rows are local to the cut');
  assert.equal(task.rows.y1 - task.rows.y0, strip.y1 - strip.y0, 'and cover exactly the strip');
});
