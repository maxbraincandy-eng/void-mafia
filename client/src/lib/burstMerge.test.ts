/**
 * Aligning and merging a burst.
 *
 * The previous version of this idea — averaging frames without aligning them —
 * passed every test it had, because its tests stacked identical frames. Held by
 * a human it blurred the photo. So every test here shifts the frames first, the
 * way a hand does, and one of them walks an object through the burst to check
 * it does not come out as a ghost.
 *
 *   npx tsx --test src/lib/burstMerge.test.ts
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import { mergeBurst, alignPair, lumaOf, pickReference, MERGE_DEFAULTS } from './burstMerge.js';
import type { Pixels } from './photoPipeline.js';

// ── Scene building ────────────────────────────────────────────────────────────

/**
 * A scene with structure at several scales — alignment needs something to lock
 * onto, and a flat field or a single edge is not representative of a photo.
 */
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

function withNoise(img: Pixels, amplitude: number, seed: number): Pixels {
  const data = new Uint8ClampedArray(img.data);
  let s = seed | 1;
  for (let i = 0; i < data.length; i++) {
    if (i % 4 === 3) continue;
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    data[i] = data[i] + ((s / 0x7fffffff) * 2 - 1) * amplitude;
  }
  return { data, width: img.width, height: img.height };
}

/** Paint a solid square, standing in for something that moved mid-burst. */
function withBlob(img: Pixels, cx: number, cy: number, r: number): Pixels {
  const data = new Uint8ClampedArray(img.data);
  for (let y = Math.max(0, cy - r); y < Math.min(img.height, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x < Math.min(img.width, cx + r); x++) {
      const p = (y * img.width + x) * 4;
      data[p] = 250; data[p + 1] = 30; data[p + 2] = 30;
    }
  }
  return { data, width: img.width, height: img.height };
}

const px = (im: Pixels, x: number, y: number) => {
  const p = (y * im.width + x) * 4;
  return [im.data[p], im.data[p + 1], im.data[p + 2]];
};

/** RMS difference from a reference — the measure of "how noisy is this". */
function rms(a: Pixels, b: Pixels): number {
  let t = 0, n = 0;
  for (let i = 0; i < a.data.length; i++) {
    if (i % 4 === 3) continue;
    const d = a.data[i] - b.data[i];
    t += d * d; n++;
  }
  return Math.sqrt(t / n);
}

const pyr = (img: Pixels) => {
  // Rebuild what mergeBurst does internally, for the alignment tests.
  const levels: { data: Float32Array; w: number; h: number }[] = [
    { data: lumaOf(img), w: img.width, h: img.height },
  ];
  for (let i = 1; i < 4; i++) {
    const p = levels[i - 1];
    if (p.w < 32 || p.h < 32) break;
    const nw = p.w >> 1, nh = p.h >> 1;
    const d = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      d[y * nw + x] = (p.data[(y * 2) * p.w + x * 2] + p.data[(y * 2) * p.w + x * 2 + 1]
        + p.data[(y * 2 + 1) * p.w + x * 2] + p.data[(y * 2 + 1) * p.w + x * 2 + 1]) * 0.25;
    }
    levels.push({ data: d, w: nw, h: nh });
  }
  return levels;
};

// ── Alignment ─────────────────────────────────────────────────────────────────

test('a known shift is recovered', { timeout: 60_000 }, () => {
  // The whole thing rests on this. If the offset is wrong, merging makes the
  // photo worse than not merging at all.
  const base = scene(256, 256);
  for (const [ox, oy] of [[3, 0], [0, -4], [5, 5], [-6, 2], [-2, -7]] as [number, number][]) {
    const moved = scene(256, 256, ox, oy);
    const { dx, dy } = alignPair(pyr(base), pyr(moved));
    /*
     * The offset is where to SAMPLE the frame, not how far its content moved —
     * the merge reads `frame[x + dx]`, so content that drifted right by `ox`
     * is fetched by going left. Hence the negation, which is the convention
     * and not a correction.
     */
    assert.ok(Math.abs(dx + ox) < 1, `dx ${dx.toFixed(2)} for shift ${ox}`);
    assert.ok(Math.abs(dy + oy) < 1, `dy ${dy.toFixed(2)} for shift ${oy}`);
  }
});

test('a shift is still found through heavy noise', { timeout: 60_000 }, () => {
  // Alignment runs on exactly the frames that need merging, which are the noisy
  // ones. Working only on clean input would be useless.
  const base = withNoise(scene(256, 256), 18, 7);
  const moved = withNoise(scene(256, 256, 4, -3), 18, 991);
  const { dx, dy } = alignPair(pyr(base), pyr(moved));
  assert.ok(Math.abs(dx + 4) < 1.2, `dx ${dx.toFixed(2)}`);
  assert.ok(Math.abs(dy - 3) < 1.2, `dy ${dy.toFixed(2)}`);
});

test('identical frames align to zero', { timeout: 60_000 }, () => {
  const a = scene(192, 192);
  const { dx, dy } = alignPair(pyr(a), pyr(a));
  assert.ok(Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3, `drifted to ${dx}, ${dy}`);
});

test('the sharpest frame is chosen as the reference', { timeout: 60_000 }, () => {
  /*
   * Somewhere in a handheld burst is a frame caught mid-shake. Aligning
   * everything onto that one merges the whole burst onto a blurred base, and
   * the result cannot come out better than its reference.
   */
  const sharp = scene(160, 160);
  const blurred = (() => {
    const out = new Uint8ClampedArray(sharp.data.length);
    const { width: w, height: h } = sharp;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0, n = 0;
        for (let k = -3; k <= 3; k++) {
          const xx = Math.max(0, Math.min(w - 1, x + k));
          sum += sharp.data[(y * w + xx) * 4 + c]; n++;
        }
        out[(y * w + x) * 4 + c] = sum / n;
      }
    }
    return { data: out, width: w, height: h };
  })();

  assert.equal(pickReference([pyr(blurred), pyr(sharp), pyr(blurred)]), 1);
});

// ── Merging ───────────────────────────────────────────────────────────────────

test('a shifted, noisy burst merges cleaner than any single frame', { timeout: 120_000 }, () => {
  /*
   * The headline claim, tested the way it actually happens: the frames are
   * offset, because a hand shakes, and noisy, because that is why anyone
   * merges. The old unaligned version fails this — it blurs.
   */
  const truth = scene(224, 224);
  const shifts: [number, number][] = [[0, 0], [1, 0], [-1, 1], [2, -1], [0, 2], [-2, -2]];
  const frames = shifts.map(([ox, oy], i) => withNoise(scene(224, 224, ox, oy), 24, (i + 1) * 7919));

  const { merged, report } = mergeBurst(frames);

  // Compare against the truth as the reference frame saw it.
  const refTruth = scene(224, 224, shifts[report.reference][0], shifts[report.reference][1]);
  const single = rms(frames[report.reference], refTruth);
  const stacked = rms(merged, refTruth);

  assert.ok(stacked < single * 0.75, `merged ${stacked.toFixed(1)} vs single ${single.toFixed(1)}`);
  assert.equal(report.dropped, 0, 'every frame was usable');
});

test('merging does not soften what it merges', { timeout: 120_000 }, () => {
  /*
   * The failure mode of the unaligned version, and the reason it was worse than
   * doing nothing: it reduced noise by smearing, and a smeared photo has less
   * detail than the frame it started from. Gradient energy catches that — it
   * falls when an image goes soft, whatever happens to the noise.
   */
  const frames: Pixels[] = [[0, 0], [1, 1], [-1, 0], [2, 1], [0, -2]]
    .map(([ox, oy], i) => withNoise(scene(224, 224, ox, oy), 14, (i + 3) * 104729));

  const { merged, report } = mergeBurst(frames);

  const sharpness = (im: Pixels) => {
    let s = 0;
    for (let y = 1; y < im.height - 1; y++) {
      for (let x = 1; x < im.width - 1; x++) {
        const p = (y * im.width + x) * 4;
        const gx = im.data[p + 4] - im.data[p - 4];
        const gy = im.data[p + im.width * 4] - im.data[p - im.width * 4];
        s += Math.abs(gx) + Math.abs(gy);
      }
    }
    return s / (im.width * im.height);
  };

  // Merged should not be dramatically softer than the reference it was built
  // on. Some of the reference's "sharpness" is noise being removed, so a small
  // drop is correct and expected; a large one means misalignment.
  const before = sharpness(frames[report.reference]);
  const after = sharpness(merged);
  assert.ok(after > before * 0.6, `sharpness fell from ${before.toFixed(1)} to ${after.toFixed(1)}`);
});

test('something that moved is rejected, not ghosted', { timeout: 120_000 }, () => {
  /*
   * The single most visible way burst merging goes wrong. A person walks
   * through two frames of eight; average them blindly and they appear as a
   * translucent smear across the photo.
   *
   * The reference is forced to be a clean frame by making it the sharpest, and
   * the blob is added only to later frames.
   */
  const clean = () => scene(224, 224);
  const frames: Pixels[] = [
    withNoise(clean(), 6, 11),
    withNoise(clean(), 6, 22),
    withBlob(withNoise(clean(), 6, 33), 60, 60, 16),
    withBlob(withNoise(clean(), 6, 44), 60, 60, 16),
  ];

  const { merged, report } = mergeBurst(frames);
  const refPixel = px(frames[report.reference], 60, 60);
  const blobFree = report.reference === 0 || report.reference === 1;
  assert.ok(blobFree, `reference ${report.reference} should be a blob-free frame`);

  const got = px(merged, 60, 60);
  // Red would climb towards 250 if the blob were averaged in. It must stay near
  // the reference's own value.
  assert.ok(Math.abs(got[0] - refPixel[0]) < 30,
    `red ${got[0]} drifted from reference ${refPixel[0]} — the blob ghosted through`);

  // And away from the blob, the merge still did its job.
  assert.ok(report.agreement > 0.5, `agreement ${report.agreement.toFixed(2)} — merging stopped working`);
});

test('a frame that will not align is dropped', { timeout: 120_000 }, () => {
  // A lurch, or the subject turning. Merging it blurs everything uniformly,
  // which is worse than the noise it was brought in to remove.
  const good = [0, 1, 2].map(i => withNoise(scene(192, 192, i, 0), 8, (i + 1) * 31));
  const garbage = withNoise(scene(192, 192), 120, 5);       // unrecognisable
  const { report } = mergeBurst([...good, garbage], { ...MERGE_DEFAULTS, maxAlignError: 20 });
  assert.ok(report.dropped >= 1, 'the unalignable frame was kept');
});

test('frames that changed size mid-burst are ignored', { timeout: 60_000 }, () => {
  // A size change means the camera reconfigured; merging across it is worse
  // than the noise.
  const a = scene(160, 160);
  const b = scene(80, 80);
  const { merged } = mergeBurst([a, b, a]);
  assert.equal(merged.width, 160);
});

test('a single frame comes back untouched', { timeout: 60_000 }, () => {
  const only = scene(64, 64);
  const { merged, report } = mergeBurst([only]);
  assert.equal(merged, only);
  assert.equal(report.reference, 0);
});

test('merging nothing is an error, not an empty photo', () => {
  assert.throws(() => mergeBurst([]), /nothing to merge/);
});

test('the report says which frame led and how well they agreed', { timeout: 120_000 }, () => {
  // Both are shown on screen. A low agreement means the scene was moving, which
  // is exactly when a viewer should be told the merge did less than usual.
  const frames = [0, 1, 2, 3].map(i => withNoise(scene(160, 160, i, 0), 10, (i + 9) * 577));
  const { report } = mergeBurst(frames);
  assert.ok(report.reference >= 0 && report.reference < frames.length);
  assert.equal(report.offsets.length, frames.length);
  assert.ok(report.agreement > 0 && report.agreement <= 1);
  assert.equal(report.offsets[report.reference].dx, 0, 'the reference does not move relative to itself');
});
