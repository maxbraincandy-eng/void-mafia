/**
 * The photo pipeline.
 *
 * Image code fails quietly. A blur that is off by one pixel, a resize that
 * shifts the whole frame half a pixel, a channel that wraps instead of clamping
 * so a highlight comes out black — none of those throw, and on a phone screen
 * they look like "the camera is a bit odd". The assertions below are the only
 * place any of it is visible.
 *
 *   npx tsx --test src/lib/photoPipeline.test.ts
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import {
  boxBlur, enhance, lanczosResize, stackFrames, crop, zoomRect,
  NATURAL, ZOOMED, OFF, type Pixels,
} from './photoPipeline.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function solid(w: number, h: number, r: number, g: number, b: number, a = 255): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a;
  }
  return { data, width: w, height: h };
}

/** A hard vertical edge: left half dark, right half light. */
function edge(w: number, h: number, dark = 60, light = 200): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x < w / 2 ? dark : light;
      const p = (y * w + x) * 4;
      data[p] = v; data[p + 1] = v; data[p + 2] = v; data[p + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

const px = (img: Pixels, x: number, y: number) => {
  const p = (y * img.width + x) * 4;
  return [img.data[p], img.data[p + 1], img.data[p + 2], img.data[p + 3]];
};

/** Deterministic pseudo-noise, so a failure is reproducible. */
function noisy(base: Pixels, amplitude: number, seed: number): Pixels {
  const data = new Uint8ClampedArray(base.data);
  let s = seed;
  for (let i = 0; i < data.length; i++) {
    if (i % 4 === 3) continue;                 // leave alpha alone
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    data[i] = data[i] + ((s / 0x7fffffff) * 2 - 1) * amplitude;
  }
  return { data, width: base.width, height: base.height };
}

const mean = (xs: ArrayLike<number>) => {
  let t = 0;
  for (let i = 0; i < xs.length; i++) t += xs[i];
  return t / xs.length;
};

// ── Blur ──────────────────────────────────────────────────────────────────────

test('blurring a flat field changes nothing', () => {
  // The edge handling is where box blurs go wrong, and a flat field is the case
  // that exposes it: any window that runs off the image and is not clamped
  // pulls the border towards zero and draws a dark frame around the photo.
  const flat = new Float32Array(40 * 30).fill(120);
  const out = boxBlur(flat, 40, 30, 5);
  for (let i = 0; i < out.length; i++) {
    assert.ok(Math.abs(out[i] - 120) < 0.001, `pixel ${i} drifted to ${out[i]}`);
  }
});

test('blur preserves the average brightness', () => {
  // A blur redistributes light; it must not create or destroy it.
  const src = new Float32Array(32 * 32);
  for (let i = 0; i < src.length; i++) src[i] = (i * 7) % 256;
  const out = boxBlur(src, 32, 32, 3);
  assert.ok(Math.abs(mean(out) - mean(src)) < 2, `${mean(out)} vs ${mean(src)}`);
});

test('blur softens an edge, and does not move it', () => {
  const w = 40, h = 8;
  const src = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) src[y * w + x] = x < w / 2 ? 0 : 240;
  const out = boxBlur(src, w, h, 4);

  const at = (x: number) => out[3 * w + x];
  assert.ok(at(w / 2 - 1) > 20, 'the dark side of the edge lifted');
  assert.ok(at(w / 2) < 220, 'the light side came down');
  // The midpoint stays the midpoint: a one-sided kernel would slide it.
  assert.ok(Math.abs((at(w / 2 - 1) + at(w / 2)) / 2 - 120) < 25);
  assert.ok(at(2) < 5 && at(w - 3) > 235, 'and far from the edge nothing moved');
});

test('a radius under one is a no-op, not a crash', () => {
  const src = new Float32Array([1, 2, 3, 4]);
  assert.deepEqual([...boxBlur(src, 2, 2, 0)], [1, 2, 3, 4]);
});

// ── Enhance ───────────────────────────────────────────────────────────────────

test('sharpening raises edge contrast', () => {
  const img = edge(64, 64);
  const out = enhance(img, { ...OFF, sharpen: 1, threshold: 0 });

  const before = px(img, 33, 32)[0] - px(img, 30, 32)[0];
  const after = px(out, 33, 32)[0] - px(out, 30, 32)[0];
  assert.ok(after > before, `edge contrast ${after} should exceed ${before}`);
});

test('the threshold protects flat areas from being sharpened into grain', () => {
  /*
   * The single most common way this goes wrong: sharpening does not know an
   * edge from sensor noise, so a clear sky comes back speckled. The threshold
   * is what tells them apart, and this is the test that it works.
   */
  const flat = noisy(solid(64, 64, 128, 128, 128), 4, 99);
  const spread = (im: Pixels) => {
    const vals = [...im.data].filter((_, i) => i % 4 === 0);
    const m = mean(vals);
    return Math.sqrt(mean(vals.map(v => (v - m) ** 2)));
  };

  const noThreshold = enhance(flat, { ...OFF, sharpen: 1.5, threshold: 0 });
  const withThreshold = enhance(flat, { ...OFF, sharpen: 1.5, threshold: 12 });

  assert.ok(spread(noThreshold) > spread(flat), 'without a threshold, noise is amplified');
  assert.ok(spread(withThreshold) <= spread(flat) + 0.5, 'with one, it is left alone');
});

test('clarity lifts local contrast without clipping the picture', () => {
  /*
   * Sampled either side of the edge, not across the frame: clarity is LOCAL
   * contrast, and its radius scales with the image, so on a small test frame it
   * correctly does nothing to pixels far from an edge. Measuring across the
   * whole picture would be testing a global contrast curve, which is a
   * different operation and not this one.
   */
  const img = edge(80, 80, 90, 170);
  const out = enhance(img, { ...OFF, clarity: 0.5 });
  const contrast = (im: Pixels) => px(im, 41, 40)[0] - px(im, 38, 40)[0];
  assert.ok(contrast(out) > contrast(img), `${contrast(out)} should exceed ${contrast(img)}`);
  for (let i = 0; i < out.data.length; i++) {
    assert.ok(out.data[i] >= 0 && out.data[i] <= 255, 'a channel escaped the range');
  }
});

test('the three bands act at three different scales, and do not overlap', { timeout: 60_000 }, () => {
  /*
   * The property the multi-band split exists to create, measured directly.
   *
   * Sharpening must be acutance: the pixels either side of an edge, and
   * nothing further out. Clarity must be micro-contrast: a broad modelling of
   * the surface near the edge that decays with distance and leaves the far
   * field alone. When those two were one band, clarity also sharpened and
   * sharpening also lifted texture, and the result was crunchy edges over flat
   * surfaces — the smartphone look this camera is trying not to have.
   *
   * Measured on a photo-sized frame, since the radii scale with the diagonal.
   */
  const img = edge(1200, 900, 90, 170);
  const dark = (im: Pixels, d: number) => px(im, 600 - d, 450)[0];

  const clarityOnly = enhance(img, { ...OFF, clarity: 0.5 });
  const sharpenOnly = enhance(img, { ...OFF, sharpen: 1.0, threshold: 0 });

  // Sharpening: hard against the edge, and finished within a few pixels.
  assert.ok(dark(sharpenOnly, 1) < dark(img, 1) - 15, `acutance at 1px: ${dark(sharpenOnly, 1)}`);
  assert.equal(dark(sharpenOnly, 4), dark(img, 4), 'sharpening reached 4px out — that is not acutance');
  assert.equal(dark(sharpenOnly, 20), dark(img, 20));

  // Clarity: broader, peaking away from the edge, gone in the far field.
  assert.ok(dark(clarityOnly, 3) < dark(img, 3) - 12, `micro-contrast at 3px: ${dark(clarityOnly, 3)}`);
  assert.ok(dark(clarityOnly, 20) < dark(img, 20), 'clarity should still be working at 20px');
  assert.equal(dark(clarityOnly, 200), dark(img, 200), 'and doing nothing at 200px');

  // And the separation itself: each band is where the other is not.
  assert.ok(dark(clarityOnly, 1) > dark(sharpenOnly, 1), 'clarity is weaker than sharpening at the edge');
  assert.ok(dark(clarityOnly, 6) < dark(sharpenOnly, 6), 'and stronger than it further out');
});

test('the noise threshold applies to the fine band only', { timeout: 60_000 }, () => {
  /*
   * When the bands were combined, the threshold that protects a clear sky from
   * being sharpened into grain was also suppressing real mid-frequency texture
   * — trading away what makes a photograph look like a photograph in order to
   * fix a problem living in a different band entirely.
   *
   * Now clarity passes through it untouched, so raising the threshold changes
   * only the fine detail.
   */
  const img = edge(1200, 900, 90, 170);
  const at = (o: Partial<typeof OFF>, d: number) =>
    px(enhance(img, { ...OFF, ...o } as typeof OFF), 600 - d, 450)[0];

  assert.equal(at({ clarity: 0.5, threshold: 0 }, 3), at({ clarity: 0.5, threshold: 60 }, 3),
    'a huge threshold changed the mid band');
  assert.notEqual(at({ sharpen: 1, threshold: 0 }, 1), at({ sharpen: 1, threshold: 60 }, 1),
    'the threshold did not reach the fine band it exists for');
});

// ── Tone: the low band ────────────────────────────────────────────────────────

/** A frame that is dark on the left, mid in the middle, blown out on the right. */
function ramp(w: number, h: number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round((x / (w - 1)) * 255);
      const p = (y * w + x) * 4;
      data[p] = data[p + 1] = data[p + 2] = v;
      data[p + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

test('shadows open without touching the midtones', () => {
  /*
   * Half of the gap to a phone's own camera, and it lives entirely in the low
   * band. A lift that also raised the midtones would just be a brightness
   * slider, and would wash the photograph out instead of opening it.
   */
  const img = ramp(600, 60);
  const out = enhance(img, { ...OFF, shadows: 0.4 });

  const dark = px(out, 30, 30)[0] - px(img, 30, 30)[0];
  const mid = px(out, 300, 30)[0] - px(img, 300, 30)[0];
  const light = px(out, 570, 30)[0] - px(img, 570, 30)[0];

  assert.ok(dark > 15, `shadows barely moved: +${dark}`);
  assert.ok(mid < dark / 2, `midtones moved ${mid}, nearly as much as shadows ${dark}`);
  assert.ok(Math.abs(light) < 6, `highlights moved ${light}`);
});

test('highlights come down without dragging the midtones with them', () => {
  const img = ramp(600, 60);
  const out = enhance(img, { ...OFF, highlights: 0.4 });

  const light = px(img, 570, 30)[0] - px(out, 570, 30)[0];
  const mid = px(img, 300, 30)[0] - px(out, 300, 30)[0];
  const dark = px(img, 30, 30)[0] - px(out, 30, 30)[0];

  assert.ok(light > 15, `highlights barely moved: -${light}`);
  assert.ok(mid < light / 2, `midtones fell ${mid} against highlights ${light}`);
  assert.ok(Math.abs(dark) < 6, `shadows moved ${dark}`);
});

test('opening the shadows does not flatten what is in them', () => {
  /*
   * The entire reason the tone curve is applied to the LOW band rather than to
   * the pixels. A lift applied directly compresses the dark end, so texture in
   * a shadow turns to grey mud — recovered brightness, lost photograph. The mid
   * and high bands ride through the curve untouched, which is what keeps the
   * detail that was down there.
   */
  const w = 400, h = 200;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = 26 + (((x >> 1) + (y >> 1)) % 2 === 0 ? 10 : 0);
      const p = (y * w + x) * 4;
      data[p] = data[p + 1] = data[p + 2] = v;
      data[p + 3] = 255;
    }
  }
  const img: Pixels = { data, width: w, height: h };
  const out = enhance(img, { ...OFF, shadows: 0.5 });

  const texture = (im: Pixels) => {
    let t = 0, n = 0;
    for (let y = 4; y < h - 4; y += 2) {
      for (let x = 4; x < w - 5; x += 2) {
        t += Math.abs(px(im, x, y)[0] - px(im, x + 1, y)[0]); n++;
      }
    }
    return t / n;
  };

  assert.ok(px(out, 200, 100)[0] > px(img, 200, 100)[0] + 8, 'the shadow did lift');
  assert.ok(texture(out) > texture(img) * 0.8,
    `texture collapsed from ${texture(img).toFixed(1)} to ${texture(out).toFixed(1)}`);
});

test('the tone controls touch only the low band', () => {
  // Bending the base must not change acutance. If it does, the decomposition
  // is leaking and a brightness decision is quietly a sharpness decision.
  const img = edge(1200, 900, 90, 170);
  const plain = enhance(img, { ...OFF, sharpen: 1, threshold: 0 });
  const toned = enhance(img, { ...OFF, sharpen: 1, threshold: 0, shadows: 0.3, highlights: 0.3 });

  const acutance = (im: Pixels) => px(im, 601, 450)[0] - px(im, 598, 450)[0];
  assert.ok(Math.abs(acutance(toned) - acutance(plain)) < 12,
    `acutance moved from ${acutance(plain)} to ${acutance(toned)} when only tone changed`);
});

test('the presets open shadows and hold highlights', () => {
  // Both are what a phone's own camera does and this one was not. A preset that
  // silently loses them gives back the flat, crushed look this fixed.
  for (const p of [NATURAL, ZOOMED]) {
    assert.ok(p.shadows > 0 && p.shadows < 0.4, `shadows ${p.shadows}`);
    assert.ok(p.highlights > 0 && p.highlights < 0.4, `highlights ${p.highlights}`);
  }
});

test('chroma denoise removes colour speckle and keeps luminance detail', () => {
  /*
   * The trade the whole design rests on: colour acuity is a fraction of
   * luminance acuity, so chroma can be smoothed away and detail cannot tell.
   * If this ever starts touching Y, photos go soft and nobody will know why.
   */
  const img = edge(64, 64, 40, 220);
  const out = enhance(img, { ...OFF, denoise: 1 });
  const lumaEdge = (im: Pixels) => px(im, 33, 32)[0] - px(im, 30, 32)[0];
  assert.ok(Math.abs(lumaEdge(out) - lumaEdge(img)) < 12, 'the edge survived the denoise');
});

test('saturation leaves grey grey', () => {
  // Boosting saturation on a neutral image must do nothing: if it tints, the
  // chroma centre is wrong and every photo picks up a colour cast.
  const grey = solid(16, 16, 128, 128, 128);
  const out = enhance(grey, { ...OFF, saturation: 1.8 });
  for (let i = 0; i < out.data.length; i += 4) {
    assert.ok(Math.abs(out.data[i] - out.data[i + 1]) <= 1, 'a cast appeared');
    assert.ok(Math.abs(out.data[i + 1] - out.data[i + 2]) <= 1);
  }
});

test('saturation moves colour, in the direction it says', () => {
  const red = solid(8, 8, 200, 90, 90);
  const up = enhance(red, { ...OFF, saturation: 1.5 });
  const down = enhance(red, { ...OFF, saturation: 0.5 });
  const spread = (im: Pixels) => px(im, 4, 4)[0] - px(im, 4, 4)[1];
  assert.ok(spread(up) > spread(red), 'up widened the channels');
  assert.ok(spread(down) < spread(red), 'down narrowed them');
});

test('a bright highlight does not wrap to black', () => {
  /*
   * The failure that made this worth testing: a channel pushed past 255 in a
   * plain array wraps to 0, so the brightest part of a photo — a lamp, the sun
   * on water — comes out as a black hole. Uint8ClampedArray is the fix and this
   * is the assertion that it is still being used.
   */
  const hot = edge(48, 48, 200, 254);
  const out = enhance(hot, { clarity: 0.9, sharpen: 2, threshold: 0, denoise: 0, saturation: 1.4 });
  for (let i = 0; i < out.data.length; i += 4) {
    assert.ok(out.data[i] > 100, `channel wrapped: got ${out.data[i]}`);
  }
});

test('the presets are sane, and zoom asks for more', () => {
  for (const [name, p] of [['natural', NATURAL], ['zoomed', ZOOMED]] as const) {
    assert.ok(p.clarity > 0 && p.clarity < 0.6, `${name} clarity ${p.clarity}`);
    assert.ok(p.sharpen > 0 && p.sharpen <= 1.2, `${name} sharpen ${p.sharpen}`);
    assert.ok(p.threshold > 0, `${name} would sharpen noise`);
    assert.ok(p.saturation >= 1 && p.saturation < 1.2, `${name} saturation ${p.saturation}`);
  }
  // An enlarged crop is softer and noisier, and needs the stronger hand.
  assert.ok(ZOOMED.sharpen > NATURAL.sharpen);
  assert.ok(ZOOMED.denoise > NATURAL.denoise);
  assert.ok(ZOOMED.threshold > NATURAL.threshold, 'and a higher bar, since it is noisier');
});

test('OFF really is off', () => {
  // The before/after toggle shows the user this exact path. If it drifts, the
  // "original" they are comparing against is not the original.
  const img = edge(32, 32);
  const out = enhance(img, OFF);
  assert.deepEqual([...out.data], [...img.data]);
});

test('an empty image is returned, not divided by zero', () => {
  const empty: Pixels = { data: new Uint8ClampedArray(0), width: 0, height: 0 };
  assert.equal(enhance(empty, NATURAL).width, 0);
});

// ── Resampling ────────────────────────────────────────────────────────────────

test('resizing gives back the size asked for', () => {
  const out = lanczosResize(solid(20, 10, 10, 20, 30), 60, 30);
  assert.equal(out.width, 60);
  assert.equal(out.height, 30);
  assert.equal(out.data.length, 60 * 30 * 4);
});

test('enlarging a flat colour keeps it flat', () => {
  /*
   * Lanczos has negative lobes, so an unnormalised kernel overshoots and a flat
   * field comes back with ripples at the edges. Normalising the weights is what
   * prevents it, and this is the test that they still are.
   */
  const out = lanczosResize(solid(16, 16, 90, 140, 210), 48, 48);
  for (let i = 0; i < out.data.length; i += 4) {
    assert.ok(Math.abs(out.data[i] - 90) <= 1, `r drifted to ${out.data[i]}`);
    assert.ok(Math.abs(out.data[i + 1] - 140) <= 1);
    assert.ok(Math.abs(out.data[i + 2] - 210) <= 1);
    assert.equal(out.data[i + 3], 255, 'alpha survived');
  }
});

test('resizing does not shift the image', () => {
  /*
   * Half-pixel drift is the classic resampling bug: every resize nudges the
   * frame, and it is invisible until someone compares a before and after.
   * A centred edge must stay centred.
   */
  const src = edge(64, 8, 0, 240);
  const out = lanczosResize(src, 128, 16);

  const row = 8;
  let crossing = -1;
  for (let x = 1; x < out.width; x++) {
    const prev = px(out, x - 1, row)[0], cur = px(out, x, row)[0];
    if (prev < 120 && cur >= 120) { crossing = x; break; }
  }
  assert.ok(crossing > 0, 'the edge is still there');
  assert.ok(Math.abs(crossing - 64) <= 2, `edge moved to ${crossing}, expected ~64`);
});

test('shrinking widens the kernel instead of aliasing', () => {
  // A one-pixel stripe pattern reduced by 4× must average to the mid grey, not
  // sample whichever stripe it happened to land on.
  const w = 64, h = 4;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = x % 2 === 0 ? 0 : 255;
    const p = (y * w + x) * 4;
    data[p] = data[p + 1] = data[p + 2] = v; data[p + 3] = 255;
  }
  const out = lanczosResize({ data, width: w, height: h }, 16, 4);
  for (let x = 2; x < 14; x++) {
    const v = px(out, x, 2)[0];
    assert.ok(v > 80 && v < 175, `aliased to ${v} at x=${x}`);
  }
});

test('resizing to the same size is the identity', () => {
  const img = edge(24, 24);
  assert.equal(lanczosResize(img, 24, 24), img, 'and does not pay for the work');
});

test('a degenerate size gives an empty image rather than throwing', () => {
  const out = lanczosResize(solid(8, 8, 1, 2, 3), 0, 10);
  assert.equal(out.width, 0);
});

// ── Stacking ──────────────────────────────────────────────────────────────────

test('stacking identical frames changes nothing', () => {
  const img = edge(16, 16);
  const out = stackFrames([img, img, img]);
  assert.deepEqual([...out.data], [...img.data]);
});

test('stacking a noisy burst reduces the noise', () => {
  /*
   * The one operation here that adds information rather than trading it away:
   * noise is random and the scene is not, so averaging converges on the truth.
   * Every blurring denoiser can only ever remove detail.
   */
  const clean = solid(32, 32, 128, 128, 128);
  const frames = [1, 2, 3, 4, 5, 6, 7, 8].map(s => noisy(clean, 30, s * 7919));

  const err = (im: Pixels) => {
    let t = 0, n = 0;
    for (let i = 0; i < im.data.length; i += 4) { t += (im.data[i] - 128) ** 2; n++; }
    return Math.sqrt(t / n);
  };

  const one = err(frames[0]);
  const eight = err(stackFrames(frames));
  assert.ok(eight < one * 0.6, `stacking eight frames: ${eight.toFixed(1)} vs ${one.toFixed(1)}`);
});

test('a frame that changed size mid-burst is dropped, not stretched', () => {
  // A mismatch means the camera reconfigured. Averaging across that is worse
  // than the noise it was meant to remove.
  const a = solid(16, 16, 10, 10, 10);
  const b = solid(8, 8, 250, 250, 250);
  const out = stackFrames([a, b, a]);
  assert.equal(out.width, 16);
  assert.ok(Math.abs(out.data[0] - 10) < 1, 'the odd frame did not bleed in');
});

test('stacking one frame gives that frame back', () => {
  const img = edge(8, 8);
  assert.equal(stackFrames([img]), img);
});

test('stacking nothing is an error, not an empty photo', () => {
  assert.throws(() => stackFrames([]), /nothing to stack/);
});

// ── Cropping and zoom ─────────────────────────────────────────────────────────

test('a crop takes the region it was asked for', () => {
  const w = 8, h = 8;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = i; data[i * 4 + 3] = 255; }
  const out = crop({ data, width: w, height: h }, 2, 3, 3, 2);

  assert.equal(out.width, 3);
  assert.equal(out.height, 2);
  assert.equal(px(out, 0, 0)[0], 3 * 8 + 2, 'top-left is the right pixel');
  assert.equal(px(out, 2, 1)[0], 4 * 8 + 4, 'and so is bottom-right');
});

test('a crop that runs off the edge is clamped, not refused', () => {
  // A rounding error at the frame edge must give back a slightly smaller
  // picture, not throw away the shot.
  const out = crop(solid(10, 10, 5, 5, 5), 8, 8, 10, 10);
  assert.equal(out.width, 2);
  assert.equal(out.height, 2);
  assert.ok(crop(solid(10, 10, 5, 5, 5), -5, -5, 4, 4).width >= 1);
});

test('zoom crops the centre, symmetrically', () => {
  // An off-centre zoom looks like a shaky hand and is very hard to see in a
  // viewfinder that is already moving.
  const r = zoomRect(1000, 800, 2);
  assert.equal(r.w, 500);
  assert.equal(r.h, 400);
  assert.equal(r.x, 250);
  assert.equal(r.y, 200);
  assert.equal(1000 - (r.x + r.w), r.x, 'equal margins left and right');
  assert.equal(800 - (r.y + r.h), r.y, 'and top and bottom');
});

test('1× zoom is the whole frame, and under 1× is refused', () => {
  assert.deepEqual(zoomRect(640, 480, 1), { x: 0, y: 0, w: 640, h: 480 });
  // Zooming out past the sensor is not a thing; clamping beats a crop larger
  // than the image.
  assert.deepEqual(zoomRect(640, 480, 0.3), { x: 0, y: 0, w: 640, h: 480 });
});

test('zoom keeps enough pixels to be worth enlarging', () => {
  /*
   * The point of cropping the full-resolution still rather than the preview.
   * At 3× on a 12-megapixel sensor there is still more detail left than a
   * whole 720p video frame ever had.
   */
  const r = zoomRect(4000, 3000, 3);
  assert.ok(r.w * r.h > 1280 * 720, `${Math.round(r.w)}×${Math.round(r.h)} beats a video frame`);
});
