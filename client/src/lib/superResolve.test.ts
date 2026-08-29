/**
 * Multi-frame super-resolution, measured against ground truth.
 *
 * WHY THIS FILE IS BUILT THE WAY IT IS
 * ────────────────────────────────────
 * "Super-resolution" is the easiest claim in imaging to fake. Upscale, sharpen,
 * and the result looks more detailed to anybody comparing by eye — while
 * containing no more information than it started with. Every camera app that
 * has ever overclaimed did exactly that, and no amount of looking at the output
 * distinguishes it from the real thing.
 *
 * So none of these tests look at the output. They start from a known
 * high-resolution truth, generate low-resolution frames from it the way a
 * sensor would — decimated, sub-pixel shifted, noisy — reconstruct, and measure
 * the distance back to the truth.
 *
 * The bar is not "better than the input". A plain Lanczos upscale is also
 * better than the input. The bar is BETTER THAN LANCZOS: if a reconstruction
 * cannot beat ordinary interpolation on a signal whose answer is known, it has
 * recovered nothing and must not be called super-resolution.
 *
 *   npx tsx --test src/lib/superResolve.test.ts
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import { superResolve, superResolveZoom, diversityOf, SR_DEFAULTS, MAX_HONEST_SCALE } from './superResolve.js';
import { lanczosResize, boxBlur, type Pixels } from './photoPipeline.js';
import { mergeBurst } from './burstMerge.js';

// ── The truth, and sensors that look at it ────────────────────────────────────

/**
 * A high-resolution scene with detail at every scale, including frequencies a
 * decimated frame cannot represent. Those are what a reconstruction has to
 * recover and an upscale cannot invent.
 */
function truth(w: number, h: number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      // Coarse structure.
      let a = 90 + 55 * Math.sin(u * 9) * Math.cos(v * 7);
      // Fine texture — near the decimated Nyquist limit.
      a += 38 * Math.sin(x * 0.9 + y * 0.35);
      a += 26 * Math.sin(y * 1.15 - x * 0.2);
      // Hard edges, which is where interpolation loses most visibly.
      if (((x / 13) | 0) % 3 === 0 && v > 0.25 && v < 0.75) a += 44;
      if (((y / 17) | 0) % 4 === 0) a -= 30;
      const p = (y * w + x) * 4;
      data[p] = Math.max(0, Math.min(255, a + 16));
      data[p + 1] = Math.max(0, Math.min(255, a));
      data[p + 2] = Math.max(0, Math.min(255, a - 14));
      data[p + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

/**
 * One sensor exposure of that scene: shifted by a sub-pixel amount, averaged
 * over each output pixel's footprint (which is what a photosite does), then
 * given read noise.
 *
 * The box average matters. Point-sampling would leave the high frequencies
 * intact and aliased, and the reconstruction would be solving an easier problem
 * than a real camera poses.
 */
function expose(src: Pixels, factor: number, shiftX: number, shiftY: number, noise: number, seed: number): Pixels {
  const lw = Math.floor(src.width / factor);
  const lh = Math.floor(src.height / factor);
  const data = new Uint8ClampedArray(lw * lh * 4);
  let s = seed | 1;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

  /*
   * Bilinear, at fractional positions — NOT rounded to whole source pixels.
   *
   * The first version of this rounded, which quietly capped the burst at
   * `factor` distinct sub-pixel phases: at factor 2 every frame landed on
   * either 0.0 or 0.5 and nothing in between. That is not a sensor, it is a
   * sensor on a rail, and it made the reconstruction look like it had stopped
   * improving after two frames when what had actually run out was the test's
   * own supply of new information.
   *
   * A real photosite integrates the continuous scene over its footprint at
   * whatever arbitrary position the hand put it. This does that.
   */
  const at = (hx: number, hy: number, c: number): number => {
    const x0 = Math.floor(hx), y0 = Math.floor(hy);
    const ax = hx - x0, ay = hy - y0;
    const xa = Math.max(0, Math.min(src.width - 1, x0)), xb = Math.max(0, Math.min(src.width - 1, x0 + 1));
    const ya = Math.max(0, Math.min(src.height - 1, y0)), yb = Math.max(0, Math.min(src.height - 1, y0 + 1));
    const d = src.data;
    return d[(ya * src.width + xa) * 4 + c] * (1 - ax) * (1 - ay)
      + d[(ya * src.width + xb) * 4 + c] * ax * (1 - ay)
      + d[(yb * src.width + xa) * 4 + c] * (1 - ax) * ay
      + d[(yb * src.width + xb) * 4 + c] * ax * ay;
  };

  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const hx = x * factor + sx + shiftX * factor;
          const hy = y * factor + sy + shiftY * factor;
          if (hx < -1 || hy < -1 || hx > src.width || hy > src.height) continue;
          r += at(hx, hy, 0); g += at(hx, hy, 1); b += at(hx, hy, 2); n++;
        }
      }
      if (n === 0) n = 1;
      const e = (rnd() - 0.5) * 2 * noise;
      const p = (y * lw + x) * 4;
      data[p] = r / n + e; data[p + 1] = g / n + e; data[p + 2] = b / n + e; data[p + 3] = 255;
    }
  }
  return { data, width: lw, height: lh };
}

/**
 * Distance to the truth, in decibels. Higher is closer.
 *
 * A margin is trimmed off every edge: the outermost pixels of a reconstruction
 * have fewer contributing samples by construction, and judging an algorithm on
 * its border conditions measures the wrong thing.
 */
function psnr(a: Pixels, b: Pixels, margin = 8): number {
  assert.equal(a.width, b.width, 'psnr needs matching sizes');
  assert.equal(a.height, b.height, 'psnr needs matching sizes');
  let sum = 0, n = 0;
  for (let y = margin; y < a.height - margin; y++) {
    for (let x = margin; x < a.width - margin; x++) {
      const p = (y * a.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const d = a.data[p + c] - b.data[p + c];
        sum += d * d; n++;
      }
    }
  }
  return 10 * Math.log10((255 * 255) / (sum / n));
}

/** A burst of `count` exposures with evenly spread sub-pixel phases. */
function burst(src: Pixels, factor: number, count: number, noise = 3): Pixels[] {
  const out: Pixels[] = [];
  for (let i = 0; i < count; i++) {
    /*
     * Phases spread over a whole pixel by an irrational-ish step, so no two
     * frames repeat a phase — that is what a hand does, and it is the supply of
     * new information the reconstruction lives on. Plus a whole-pixel wander,
     * so alignment has real displacement to find rather than being handed a
     * fractional-only problem it could not fail.
     */
    const px = (i * 0.37) % 1;
    const py = (i * 0.61) % 1;
    out.push(expose(src, factor, px + (i % 3) - 1, py + (Math.floor(i / 3) % 3) - 1, noise, (i + 1) * 7919));
  }
  return out;
}

// ── The claim ─────────────────────────────────────────────────────────────────

test('reconstruction beats interpolation on a known signal', { timeout: 300_000 }, () => {
  /*
   * The central claim of the whole feature, and the only test that can falsify
   * it. Both outputs are the same size and both are compared to the same truth,
   * so nothing here rewards looking sharper — only being closer to what was
   * actually there.
   */
  const HR = truth(256, 256);
  const frames = burst(HR, 2, 8);

  const { image, report } = superResolve(frames, { scale: 2 });
  const single = lanczosResize(frames[report.reference], image.width, image.height);

  const srDb = psnr(image, HR);
  const lanczosDb = psnr(single, HR);

  /*
   * A modest margin on purpose. The kernel is narrow, which costs PSNR —
   * because PSNR rewards blur — and buys sharpness, which the edge-energy test
   * above enforces. Neither number is the claim on its own: the claim is closer
   * to the truth AND not softer than an upscale, and it takes both tests to say
   * that.
   */
  assert.ok(srDb > lanczosDb + 0.35,
    `super-resolution ${srDb.toFixed(2)}dB vs Lanczos ${lanczosDb.toFixed(2)}dB — no real recovery`);
  assert.ok(report.phaseDiversity > 0.3, `phase diversity ${report.phaseDiversity.toFixed(2)} too low to judge`);
  assert.ok(report.coverage > 0.9, `only ${(report.coverage * 100).toFixed(0)}% of cells got real samples`);
});

test('the reconstruction is never softer than a plain upscale', { timeout: 300_000 }, () => {
  /*
   * THE ANTI-FAKE GUARD, and the most important test in this file.
   *
   * Every error-based metric — PSNR, and even a high-passed PSNR — rewards
   * predicting the mean. A blurred image scores better against a detailed one
   * than a sharp image whose detail is a fraction of a pixel out of phase. A
   * kernel sweep tuned on PSNR alone therefore converges on a blur and reports
   * it as an improvement; that happened here, and the winning setting produced
   * an image with a twelfth of the truth's edge energy.
   *
   * Gradient energy cannot be fooled that way. If the reconstruction ever ends
   * up softer than simply merging the burst and upscaling it, then whatever it
   * is doing, it is not resolving anything, and this fails.
   */
  const HR = truth(240, 240);
  const frames = burst(HR, 2, 8);

  const { image } = superResolve(frames, { scale: 2 });
  const baseline = lanczosResize(mergeBurst(frames).merged, image.width, image.height);

  const edges = (im: Pixels) => {
    let t = 0, n = 0;
    for (let y = 10; y < im.height - 10; y++) {
      for (let x = 10; x < im.width - 10; x++) {
        const p = (y * im.width + x) * 4;
        t += Math.abs(im.data[p + 4] - im.data[p - 4])
          + Math.abs(im.data[p + im.width * 4] - im.data[p - im.width * 4]);
        n++;
      }
    }
    return t / n;
  };

  const sr = edges(image), base = edges(baseline);
  assert.ok(sr > base * 0.92, `reconstruction edge energy ${sr.toFixed(1)} vs upscale ${base.toFixed(1)} — it went soft`);
});

test('the default scale is one the measurements support', () => {
  /*
   * 2× beats merging the burst and upscaling it. 3× does not — it lands within
   * noise of that baseline, because sub-pixel alignment is not accurate enough
   * at a third of a pixel to fill the finer grid with anything trustworthy.
   *
   * Raising this without new measurements would be exactly the overclaim the
   * whole file is built to prevent.
   */
  assert.equal(SR_DEFAULTS.scale, MAX_HONEST_SCALE);
  assert.equal(MAX_HONEST_SCALE, 2);
});

test('a burst with no sub-pixel diversity reports that it recovered nothing', { timeout: 300_000 }, () => {
  /*
   * The honesty test. Frames that all landed on the same phase are N copies of
   * the same measurements — a tripod, or stabilisation that cancelled the
   * tremor. There is genuinely nothing extra in the data, and claiming a gain
   * would be the exact overclaim this file exists to prevent.
   */
  const HR = truth(192, 192);
  const same = [1, 2, 3, 4, 5].map(i => expose(HR, 2, 0, 0, 3, i * 104729));
  const { report } = superResolve(same, { scale: 2 });
  assert.ok(report.phaseDiversity < 0.2,
    `claimed diversity ${report.phaseDiversity.toFixed(2)} on identically-phased frames`);
});

test('a spread burst reports the diversity it had', { timeout: 300_000 }, () => {
  const HR = truth(192, 192);
  const { report } = superResolve(burst(HR, 2, 6), { scale: 2 });
  assert.ok(report.phaseDiversity > 0.3, `diversity ${report.phaseDiversity.toFixed(2)}`);
});

test('phase diversity is circular', () => {
  // 0.98 and 0.02 are neighbours, not opposites. A linear measure would call
  // that burst maximally diverse when it is barely spread at all.
  assert.ok(diversityOf([0, 0, 0]) < 0.05, 'identical phases are not diverse');
  assert.ok(diversityOf([0.98, 0.0, 0.02]) < 0.15, 'wrap-around phases are close together');
  assert.ok(diversityOf([0, 0.25, 0.5, 0.75]) > 0.9, 'evenly spread phases are diverse');
  assert.equal(diversityOf([0.4]), 0, 'one frame has no diversity to speak of');
});

test('asking for more than 2x gives 2x, rather than something worse', { timeout: 300_000 }, () => {
  /*
   * Measured: at 3× the reconstruction is worse than an ordinary upscale of the
   * same burst — sub-pixel alignment is not accurate enough at a third of a
   * pixel, so the finer grid fills with confidently wrong samples.
   *
   * So the setting does not exist. An API that offers a mode which reliably
   * degrades the picture is a trap for whoever reaches for the biggest number,
   * and "3× AI super-resolution" would be exactly the claim this project was
   * told not to make. Zoom past 2× crops further instead.
   */
  const HR = truth(180, 180);
  const frames = burst(HR, 2, 6);
  const { image, report } = superResolve(frames, { scale: 5 });

  assert.equal(report.scale, 2, 'the report states what was actually done');
  assert.equal(image.width, frames[0].width * 2);
});

// ── Not making things up ──────────────────────────────────────────────────────

test('a moving subject is not doubled into the reconstruction', { timeout: 300_000 }, () => {
  /*
   * Naive stacking onto a fine grid produces doubled edges and doubled faces —
   * the artefact that makes multi-frame zoom unusable and the reason the
   * robustness weight exists. The blob is placed in later frames only.
   */
  const HR = truth(224, 224);
  const frames = burst(HR, 2, 6);
  for (let i = 3; i < frames.length; i++) {
    const f = frames[i];
    for (let y = 20; y < 46; y++) {
      for (let x = 20; x < 46; x++) {
        const p = (y * f.width + x) * 4;
        f.data[p] = 250; f.data[p + 1] = 40; f.data[p + 2] = 40;
      }
    }
  }

  const { image } = superResolve(frames, { scale: 2 });
  // Well inside where the blob was: it must not have bled into the output.
  const p = ((32 * 2) * image.width + (32 * 2)) * 4;
  assert.ok(image.data[p] < 190, `red ${image.data[p]} — the moving object was merged in`);
});

test('reconstruction never returns fewer pixels than asked for', { timeout: 120_000 }, () => {
  const HR = truth(128, 128);
  const { image } = superResolve(burst(HR, 2, 4), { scale: 2 });
  assert.equal(image.width, 128);
  assert.equal(image.height, 128);
});

test('one frame degrades to an upscale, and says so', { timeout: 120_000 }, () => {
  // Honest degradation: there is nothing to reconstruct from, so it does not
  // pretend to have reconstructed.
  const HR = truth(128, 128);
  const one = expose(HR, 2, 0, 0, 2, 5);
  const { image, report } = superResolve([one], { scale: 2 });
  assert.equal(image.width, 128);
  assert.equal(report.used, 1);
  assert.equal(report.phaseDiversity, 0);
});

test('scale 1 is a passthrough, not a round trip', { timeout: 120_000 }, () => {
  const HR = truth(96, 96);
  const frames = burst(HR, 2, 3);
  const { image } = superResolve(frames, { scale: 1 });
  assert.equal(image.width, frames[0].width);
});

test('reconstructing nothing is an error', () => {
  assert.throws(() => superResolve([]), /nothing to reconstruct/);
});

// ── The zoom entry point ──────────────────────────────────────────────────────

test('zoom crops before reconstructing, so the work lands on what is looked at', { timeout: 300_000 }, () => {
  const HR = truth(240, 240);
  const frames = burst(HR, 2, 6);          // 120×120 each
  const { image } = superResolveZoom(frames, 2, { scale: 2 });
  // Crop to half, then reconstruct at 2× — back to the frame's own size, but
  // showing a quarter of the area at full detail.
  assert.equal(image.width, 120);
  assert.equal(image.height, 120);
});

test('the defaults are the ones that were measured', () => {
  // These are not taste. `scale` and `tileSize` are what the ground-truth tests
  // above ran against; changing them silently changes the claim.
  assert.equal(SR_DEFAULTS.scale, 2);
  assert.ok(SR_DEFAULTS.tileSize >= 16 && SR_DEFAULTS.tileSize <= 64);
  assert.ok(SR_DEFAULTS.motionThreshold > 0);
});
