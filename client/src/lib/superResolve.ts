/**
 * Multi-frame super-resolution.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE MERGE NEXT DOOR
 * ──────────────────────────────────────────────────
 * `burstMerge` fuses a burst onto the reference frame's own grid. That removes
 * noise and nothing else: every frame lands on the same pixel centres, so the
 * output has exactly the resolution one frame had.
 *
 * This fuses onto a FINER grid. That is the whole difference, and it is where
 * resolution actually comes from.
 *
 * A hand never holds still. Across a burst each frame lands on a slightly
 * different sub-pixel phase — one sampled the scene at x, the next at x+0.3,
 * the next at x+0.6. Each is a different set of measurements of the same
 * continuous image. Placed on a grid three times finer and interpolated
 * between, they reconstruct detail that is genuinely present in the burst and
 * absent from every individual frame. No model, no invention: the information
 * was recorded, and this is what puts it back together.
 *
 * THE HONEST LIMIT
 * ────────────────
 * It only works when the frames actually differ in phase. A burst from a phone
 * on a tripod, or one where the sensor's own stabilisation held the frame
 * perfectly, contains N copies of the same measurements — and the correct
 * result there is an ordinary upscale, because there is nothing else in the
 * data. `phaseDiversity` in the report says which case happened, so nothing
 * downstream claims a gain that was never available.
 *
 * WHY IT RUNS ON A CROP
 * ─────────────────────
 * Because that is what zoom is, and because the cost is set by the OUTPUT grid.
 * Super-resolving a whole 12-megapixel frame by 2× means a 48-megapixel
 * accumulator and about a billion kernel evaluations. Super-resolving the
 * centre ninth of it — which is what a 3× shot is looking at — is a fraction of
 * that, and it is the only part anybody is going to look at.
 */

import { crop, lanczosResize, type Pixels } from './photoPipeline';
import { alignPair, buildPyramid, lumaOf, type Level } from './burstMerge';

export interface SuperResolveOptions {
  /** Output grid multiplier. 2 and 3 are the useful range for a phone burst. */
  scale: number;
  /**
   * How far a frame may differ from the reference before its contribution is
   * dropped at that pixel. In 8-bit levels, over three channels.
   */
  motionThreshold: number;
  /**
   * Side of the local alignment tile, in low-resolution pixels. Global
   * translation cannot describe parallax or the slight rotation of a hand, and
   * a burst that is well aligned in the middle and a pixel out at the corners
   * super-resolves the middle and smears the corners.
   */
  tileSize: number;
  /** Frames whose global alignment is this poor are not used at all. */
  maxAlignError: number;
  /**
   * Width of the splat kernel, in OUTPUT pixels — deliberately not scaled by
   * `scale`.
   *
   * This is the number the whole reconstruction turns on. Each low-resolution
   * sample is deposited at its sub-pixel position with a Gaussian this wide; a
   * kernel much wider than one output cell smears neighbouring samples into
   * each other and destroys precisely the positional precision that makes the
   * burst worth more than one frame. Tuned by measurement against ground
   * truth, not by eye — see the sweep in the test file's history.
   */
  kernelSigma: number;
}

/**
 * Measured, not chosen.
 *
 * `kernelSigma` is deliberately narrow. Wider kernels score better on PSNR and
 * even on SSIM against a synthetic scene — and produce an image with a fraction
 * of the gradient energy of a plain upscale. That is a blur winning a metric,
 * not a reconstruction winning an argument, and it is exactly the trap this
 * whole feature exists to avoid. At 0.5 the output carries the same edge energy
 * as an ordinary upscale and is measurably closer to the truth; there is a
 * standing test that fails if it ever goes soft.
 *
 * `scale` is capped at 2 because 2 is where the gain over "merge the burst and
 * upscale it" is demonstrable. At 3 it is not — see `MAX_HONEST_SCALE`.
 */
export const SR_DEFAULTS: SuperResolveOptions = {
  scale: 2,
  motionThreshold: 26,
  tileSize: 32,
  maxAlignError: 34,
  kernelSigma: 0.5,
};

/**
 * The largest reconstruction factor that has been shown to beat the obvious
 * alternative.
 *
 * Measured against ground truth, a 2× reconstruction beats merging the burst
 * and upscaling it. A 3× one does not — it lands within noise of the same
 * baseline, because the sub-pixel alignment is not accurate enough at a third
 * of a pixel for the finer grid to be filled with anything trustworthy.
 *
 * So zoom beyond 2× crops further rather than reconstructing further. That is
 * the honest arrangement: a claim of 3× super-resolution would be a claim the
 * measurements do not support, and the directive this was built to is explicit
 * that "better" is only to be said where it can be shown.
 */
export const MAX_HONEST_SCALE = 2;

export interface SuperResolveReport {
  reference: number;
  /** Frames that contributed, including the reference. */
  used: number;
  dropped: number;
  scale: number;
  /**
   * 0..1. How well the burst covered the sub-pixel phases — 0 means every
   * frame landed on the same phase and no resolution was recoverable, 1 means
   * the phases were spread evenly and the reconstruction had everything it
   * could ask for.
   *
   * This is the number that decides whether "super-resolution" is an honest
   * description of what happened.
   */
  phaseDiversity: number;
  /** Mean fraction of output cells that received a real sample. */
  coverage: number;
}

/** Per-tile local offsets for one frame, plus the global fallback. */
interface Field {
  /** Tile grid dimensions. */
  cols: number;
  rows: number;
  /** dx, dy per tile, interleaved. */
  d: Float32Array;
}

/**
 * Refine a global offset per tile.
 *
 * A hand rotates as well as translates, and anything at a different distance
 * moves by a different amount. One offset for the whole frame is right in the
 * middle and progressively wrong towards the edges — which shows up as a photo
 * that is sharp in the centre and smeared at the corners, the classic look of
 * naive stacking.
 *
 * Each tile searches a small window around the global estimate, then gets its
 * own sub-pixel fit. Offsets are interpolated between tile centres at use, so
 * there is no seam where one tile's answer becomes the next one's.
 */
function alignField(
  ref: Level, frame: Level, gx: number, gy: number, tileSize: number,
): Field {
  const cols = Math.max(1, Math.ceil(ref.w / tileSize));
  const rows = Math.max(1, Math.ceil(ref.h / tileSize));
  const d = new Float32Array(cols * rows * 2);
  const R = 2;                                    // search window around global

  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const x0 = tx * tileSize, y0 = ty * tileSize;
      const x1 = Math.min(ref.w, x0 + tileSize), y1 = Math.min(ref.h, y0 + tileSize);

      /*
       * Squared differences, for the same reason `ssd` exists next door: this
       * cost is about to have a parabola fitted through it, and only a
       * quadratic cost gives an unbiased vertex. The tile offsets ARE the
       * sub-pixel information the reconstruction runs on.
       */
      const cost = (ox: number, oy: number) => {
        let total = 0, count = 0;
        for (let y = y0; y < y1; y++) {
          const fy = y + oy;
          if (fy < 0 || fy >= ref.h) continue;
          for (let x = x0; x < x1; x++) {
            const fx = x + ox;
            if (fx < 0 || fx >= ref.w) continue;
            const v = ref.data[y * ref.w + x] - frame.data[fy * ref.w + fx];
            total += v * v;
            count++;
          }
        }
        return count === 0 ? Infinity : total / count;
      };

      let best = Infinity, bx = Math.round(gx), by = Math.round(gy);
      for (let oy = by - R; oy <= by + R; oy++) {
        for (let ox = bx - R; ox <= bx + R; ox++) {
          const e = cost(ox, oy);
          if (e < best) { best = e; bx = ox; by = oy; }
        }
      }

      // Sub-pixel, per tile. Rounding here would discard exactly the fractional
      // offsets this whole file exists to exploit.
      const c = cost(bx, by);
      const fit = (m: number, p: number) => {
        const denom = m - 2 * c + p;
        if (denom <= 0) return 0;
        return Math.max(-0.5, Math.min(0.5, (m - p) / (2 * denom)));
      };
      const i = (ty * cols + tx) * 2;
      d[i] = bx + fit(cost(bx - 1, by), cost(bx + 1, by));
      d[i + 1] = by + fit(cost(bx, by - 1), cost(bx, by + 1));
    }
  }
  return { cols, rows, d };
}

/** The offset at an arbitrary pixel, interpolated between tile centres. */
function offsetAt(f: Field, x: number, y: number, tileSize: number): [number, number] {
  const fx = x / tileSize - 0.5, fy = y / tileSize - 0.5;
  const x0 = Math.max(0, Math.min(f.cols - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(f.rows - 1, Math.floor(fy)));
  const x1 = Math.min(f.cols - 1, x0 + 1), y1 = Math.min(f.rows - 1, y0 + 1);
  const ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0));

  const i00 = (y0 * f.cols + x0) * 2, i01 = (y0 * f.cols + x1) * 2;
  const i10 = (y1 * f.cols + x0) * 2, i11 = (y1 * f.cols + x1) * 2;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return [
    lerp(lerp(f.d[i00], f.d[i01], ax), lerp(f.d[i10], f.d[i11], ax), ay),
    lerp(lerp(f.d[i00 + 1], f.d[i01 + 1], ax), lerp(f.d[i10 + 1], f.d[i11 + 1], ax), ay),
  ];
}

/** Bilinear RGB fetch, for comparing a frame against the reference. */
function sample(p: Pixels, x: number, y: number, out: Float32Array): void {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const ax = x - x0, ay = y - y0;
  const xa = Math.max(0, Math.min(p.width - 1, x0)), xb = Math.max(0, Math.min(p.width - 1, x0 + 1));
  const ya = Math.max(0, Math.min(p.height - 1, y0)), yb = Math.max(0, Math.min(p.height - 1, y0 + 1));
  const wa = (1 - ax) * (1 - ay), wb = ax * (1 - ay), wc = (1 - ax) * ay, wd = ax * ay;
  const pAA = (ya * p.width + xa) * 4, pAB = (ya * p.width + xb) * 4;
  const pBA = (yb * p.width + xa) * 4, pBB = (yb * p.width + xb) * 4;
  out[0] = p.data[pAA] * wa + p.data[pAB] * wb + p.data[pBA] * wc + p.data[pBB] * wd;
  out[1] = p.data[pAA + 1] * wa + p.data[pAB + 1] * wb + p.data[pBA + 1] * wc + p.data[pBB + 1] * wd;
  out[2] = p.data[pAA + 2] * wa + p.data[pAB + 2] * wb + p.data[pBA + 2] * wc + p.data[pBB + 2] * wd;
}

/**
 * Reconstruct a higher-resolution image from a burst.
 *
 * The frames are assumed to be the same size and roughly the same scene; the
 * caller has already cropped them to the region of interest, so everything here
 * is spent on the pixels that will be looked at.
 *
 * Each low-resolution sample is splatted onto the output grid at the sub-pixel
 * position its own alignment says it belongs, weighted by a small Gaussian and
 * by how much that frame agrees with the reference there. Cells that end up
 * with no real contribution fall back to an interpolated reference, so a moving
 * subject degrades to "as good as one frame" rather than to a hole.
 */
export function superResolve(
  frames: Pixels[],
  options: Partial<SuperResolveOptions> = {},
): { image: Pixels; report: SuperResolveReport } {
  const opts = { ...SR_DEFAULTS, ...options };
  /*
   * Clamped, not trusted.
   *
   * Above 2× the reconstruction measures WORSE than an ordinary upscale of the
   * same burst — the sub-pixel alignment is not accurate enough at a third of a
   * pixel, so the finer grid gets filled with confidently wrong samples. An API
   * that offers a setting which reliably makes the picture worse is a trap, so
   * asking for more gives you the most that works, and the report says what was
   * actually done.
   */
  const s = Math.max(1, Math.min(MAX_HONEST_SCALE, Math.round(opts.scale)));

  if (frames.length === 0) throw new Error('superResolve: nothing to reconstruct');
  const first = frames[0];
  const usable = frames.filter(f => f.width === first.width && f.height === first.height);

  const lw = first.width, lh = first.height;
  const hw = lw * s, hh = lh * s;

  // One frame, or scale 1: there is nothing to reconstruct FROM, and saying so
  // by falling back is more honest than running the machinery on no evidence.
  if (usable.length === 1 || s === 1) {
    const image = s === 1 ? usable[0] : lanczosResize(usable[0], hw, hh);
    return {
      image,
      report: { reference: 0, used: 1, dropped: frames.length - 1, scale: s, phaseDiversity: 0, coverage: 1 },
    };
  }

  const pyramids = usable.map(f => buildPyramid(lumaOf(f), lw, lh));
  // The sharpest frame leads: everything is reconstructed relative to it, so a
  // frame caught mid-shake would cap the result at its own blur.
  let refIdx = 0, bestScore = -1;
  for (let i = 0; i < pyramids.length; i++) {
    const lv = pyramids[i][Math.min(1, pyramids[i].length - 1)];
    let score = 0;
    for (let y = 1; y < lv.h - 1; y += 2) {
      for (let x = 1; x < lv.w - 1; x += 2) {
        const i0 = y * lv.w + x;
        const gx = lv.data[i0 + 1] - lv.data[i0 - 1];
        const gy = lv.data[i0 + lv.w] - lv.data[i0 - lv.w];
        score += gx * gx + gy * gy;
      }
    }
    if (score > bestScore) { bestScore = score; refIdx = i; }
  }

  const ref = usable[refIdx];
  const contributors: { frame: Pixels; field: Field }[] = [];
  const phases: number[] = [];
  let dropped = 0;

  for (let i = 0; i < usable.length; i++) {
    if (i === refIdx) {
      contributors.push({ frame: ref, field: { cols: 1, rows: 1, d: new Float32Array(2) } });
      phases.push(0, 0);
      continue;
    }
    const g = alignPair(pyramids[refIdx], pyramids[i]);
    if (g.error > opts.maxAlignError) { dropped++; continue; }
    contributors.push({
      frame: usable[i],
      field: alignField(pyramids[refIdx][0], pyramids[i][0], g.dx, g.dy, opts.tileSize),
    });
    /*
     * Only the fractional part carries new information: a whole-pixel shift
     * re-measures the same phase and adds nothing but another noise sample.
     * Both axes go in, because a burst can be well spread along one and not the
     * other, and reporting only x would call that a failure or a success
     * depending on which way the hand happened to drift.
     */
    phases.push(((g.dx % 1) + 1) % 1);
    phases.push(((g.dy % 1) + 1) % 1);
  }

  const acc = new Float32Array(hw * hh * 3);
  const wsum = new Float32Array(hw * hh);

  /*
   * The splat kernel.
   *
   * Narrow on purpose. Widening it makes coverage easy and throws away the
   * sub-pixel precision that is the entire point — a kernel much wider than one
   * output cell is a blur, and a blurred reconstruction is just an upscale that
   * took longer.
   */
  const sigma = opts.kernelSigma;
  // Three sigma covers the kernel; beyond that the weights are noise. Floored
  // at one cell so there is always something to deposit into.
  const radius = Math.max(1, sigma * 3);
  const inv2s2 = 1 / (2 * sigma * sigma);
  const motionInv = 1 / (opts.motionThreshold * opts.motionThreshold);
  const rgb = new Float32Array(3);
  const refRgb = new Float32Array(3);

  for (const { frame, field } of contributors) {
    const isRef = frame === ref;
    for (let y = 0; y < lh; y++) {
      for (let x = 0; x < lw; x++) {
        let dx = 0, dy = 0;
        if (!isRef) {
          const o = offsetAt(field, x, y, opts.tileSize);
          dx = o[0]; dy = o[1];
        }

        // Where this sample's scene content sits in reference coordinates.
        const rx = x - dx, ry = y - dy;
        if (rx < 0 || ry < 0 || rx > lw - 1 || ry > lh - 1) continue;

        const p = (y * lw + x) * 4;
        rgb[0] = frame.data[p]; rgb[1] = frame.data[p + 1]; rgb[2] = frame.data[p + 2];

        let weight = 1;
        if (!isRef) {
          /*
           * Robustness. Compare this sample against the reference at the same
           * scene position; a large disagreement means something moved, and
           * merging it would put a second copy of a moving object into the
           * reconstruction. This is what keeps super-resolution from producing
           * the double edges and doubled faces that naive stacking produces.
           */
          sample(ref, rx, ry, refRgb);
          const d0 = rgb[0] - refRgb[0], d1 = rgb[1] - refRgb[1], d2 = rgb[2] - refRgb[2];
          weight = Math.max(0, 1 - ((d0 * d0 + d1 * d1 + d2 * d2) / 3) * motionInv);
          if (weight <= 0) continue;
        }

        // Onto the fine grid.
        const hx = (rx + 0.5) * s - 0.5;
        const hy = (ry + 0.5) * s - 0.5;
        const xLo = Math.max(0, Math.ceil(hx - radius)), xHi = Math.min(hw - 1, Math.floor(hx + radius));
        const yLo = Math.max(0, Math.ceil(hy - radius)), yHi = Math.min(hh - 1, Math.floor(hy + radius));

        for (let oy = yLo; oy <= yHi; oy++) {
          const ddy = oy - hy;
          for (let ox = xLo; ox <= xHi; ox++) {
            const ddx = ox - hx;
            const k = Math.exp(-(ddx * ddx + ddy * ddy) * inv2s2) * weight;
            if (k < 1e-3) continue;
            const o = oy * hw + ox;
            acc[o * 3] += rgb[0] * k;
            acc[o * 3 + 1] += rgb[1] * k;
            acc[o * 3 + 2] += rgb[2] * k;
            wsum[o] += k;
          }
        }
      }
    }
  }

  /*
   * Anywhere the burst left no evidence — behind a moving subject, or at the
   * very edge — falls back to an interpolated reference. A hole would be worse
   * than an upscale, and an upscale is exactly what one frame can support.
   */
  const fallback = lanczosResize(ref, hw, hh);
  const out = new Uint8ClampedArray(hw * hh * 4);
  let covered = 0;
  for (let i = 0, p = 0; i < hw * hh; i++, p += 4) {
    const w = wsum[i];
    if (w > 0.08) {
      const k = 1 / w;
      out[p] = acc[i * 3] * k;
      out[p + 1] = acc[i * 3 + 1] * k;
      out[p + 2] = acc[i * 3 + 2] * k;
      covered++;
    } else {
      out[p] = fallback.data[p];
      out[p + 1] = fallback.data[p + 1];
      out[p + 2] = fallback.data[p + 2];
    }
    out[p + 3] = 255;
  }

  return {
    image: { data: out, width: hw, height: hh },
    report: {
      reference: refIdx,
      used: contributors.length,
      dropped,
      scale: s,
      phaseDiversity: diversityOf(phases),
      coverage: covered / (hw * hh),
    },
  };
}

/**
 * How well the burst covered the sub-pixel phases.
 *
 * Super-resolution needs the frames to have landed at different fractional
 * positions. Phases bunched at the same value mean the hand was steady, or
 * stabilisation cancelled the tremor, and there is genuinely nothing extra in
 * the data — the correct output then is an upscale, and the correct thing to
 * report is that no resolution was recovered.
 *
 * Measured as one minus the length of the mean unit vector of the phases taken
 * as angles. Circular, because phase 0.99 and phase 0.01 are neighbours.
 */
export function diversityOf(phases: number[]): number {
  if (phases.length < 2) return 0;
  let sx = 0, sy = 0;
  for (const p of phases) {
    const a = p * Math.PI * 2;
    sx += Math.cos(a); sy += Math.sin(a);
  }
  const r = Math.hypot(sx, sy) / phases.length;
  return Math.max(0, Math.min(1, 1 - r));
}

/**
 * The zoom path: crop, then reconstruct at scale.
 *
 * Crops every frame to the same region in reference coordinates before
 * reconstructing, so the expensive part only ever runs on the pixels the zoom
 * is actually looking at.
 */
export function superResolveZoom(
  frames: Pixels[],
  zoom: number,
  options: Partial<SuperResolveOptions> = {},
): { image: Pixels; report: SuperResolveReport } {
  const first = frames[0];
  const cw = first.width / zoom, ch = first.height / zoom;
  const x = (first.width - cw) / 2, y = (first.height - ch) / 2;
  const cropped = frames.map(f => crop(f, x, y, cw, ch));
  return superResolve(cropped, options);
}
