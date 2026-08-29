/**
 * Aligning and merging a handheld burst.
 *
 * WHAT THIS IS COPYING, AND WHAT IT CANNOT
 * ────────────────────────────────────────
 * This is the core of what makes a Pixel's camera good, minus the part a
 * browser cannot reach.
 *
 * HDR+ captures a burst, aligns the frames to sub-pixel accuracy, and merges
 * them while rejecting anything that moved. That buys three things at once:
 * noise falls by √N because noise is random and the scene is not; detail rises,
 * because hand tremor offsets the frames by fractions of a pixel and the merge
 * samples between the original grid points; and moving objects do not smear,
 * because they are detected and dropped rather than averaged in.
 *
 * The part we cannot have is RAW. Google merges 12-bit sensor data before
 * demosaicing, so the merge sees the actual photon counts. We are handed 8-bit
 * JPEGs that the phone's own ISP has already denoised, sharpened and tone
 * mapped. Merging those recovers far less than merging RAW would, and no
 * arrangement of this code changes that.
 *
 * It is still, by a wide margin, the largest improvement available here.
 *
 * WHY THE OLD VERSION WAS WORSE THAN NOTHING
 * ──────────────────────────────────────────
 * `stackFrames` averaged frames without aligning them. Held perfectly still it
 * reduced noise; held by a human it blurred the photo, because a two-pixel hand
 * tremor across eight frames is a two-pixel smear. That is why it was hidden
 * behind a toggle nobody should have wanted to press. Alignment is what turns
 * the same idea from a liability into the best thing on this screen.
 */

import type { Pixels } from './photoPipeline';

/** How far the coarsest level searches, in its own (heavily reduced) pixels. */
const COARSE_SEARCH = 10;
/** Refinement window at each finer level, around the doubled coarse estimate. */
const FINE_SEARCH = 2;
/** Pyramid levels. Four halvings put a 12MP frame under 50k pixels at the top. */
const LEVELS = 4;

export interface Offset { dx: number; dy: number }

export interface MergeReport {
  /** Which frame everything else was aligned to. */
  reference: number;
  /** Per-frame translation, in reference-frame pixels. */
  offsets: Offset[];
  /** Frames whose alignment was too poor to trust, and were dropped. */
  dropped: number;
  /** Mean per-pixel weight of the non-reference frames, 0..1. Low means motion. */
  agreement: number;
}

// ── Luma and pyramids ─────────────────────────────────────────────────────────

/** Alignment works on brightness alone: colour adds nothing and triples the cost. */
export function lumaOf(img: Pixels): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  const d = img.data;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    out[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
  }
  return out;
}

/** Halve, by averaging 2×2 blocks. Cheap, and the pyramid wants the smoothing. */
function halve(src: Float32Array, w: number, h: number): { data: Float32Array; w: number; h: number } {
  const nw = Math.max(1, w >> 1);
  const nh = Math.max(1, h >> 1);
  const out = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    const y0 = Math.min(h - 1, y * 2), y1 = Math.min(h - 1, y * 2 + 1);
    for (let x = 0; x < nw; x++) {
      const x0 = Math.min(w - 1, x * 2), x1 = Math.min(w - 1, x * 2 + 1);
      out[y * nw + x] = (src[y0 * w + x0] + src[y0 * w + x1] + src[y1 * w + x0] + src[y1 * w + x1]) * 0.25;
    }
  }
  return { data: out, w: nw, h: nh };
}

interface Level { data: Float32Array; w: number; h: number }

function pyramid(luma: Float32Array, w: number, h: number, levels: number): Level[] {
  const out: Level[] = [{ data: luma, w, h }];
  for (let i = 1; i < levels; i++) {
    const prev = out[i - 1];
    if (prev.w < 32 || prev.h < 32) break;      // below this, matching is noise
    out.push(halve(prev.data, prev.w, prev.h));
  }
  return out;                                   // index 0 is full resolution
}

// ── Alignment ─────────────────────────────────────────────────────────────────

/**
 * Sum of absolute differences at one candidate offset.
 *
 * Sampled on a stride rather than every pixel: at the resolutions this runs on,
 * every fourth pixel gives the same minimum for a sixteenth of the work, and
 * alignment is the part that has to stay cheap enough to run on eight frames.
 *
 * The border is skipped by the amount of the search, so a candidate that shifts
 * off the edge is not rewarded for comparing fewer pixels.
 */
function sad(
  ref: Float32Array, frame: Float32Array, w: number, h: number,
  dx: number, dy: number, margin: number, stride: number,
): number {
  let total = 0;
  let count = 0;
  for (let y = margin; y < h - margin; y += stride) {
    const fy = y + dy;
    if (fy < 0 || fy >= h) continue;
    const rowR = y * w, rowF = fy * w;
    for (let x = margin; x < w - margin; x += stride) {
      const fx = x + dx;
      if (fx < 0 || fx >= w) continue;
      const d = ref[rowR + x] - frame[rowF + fx];
      total += d < 0 ? -d : d;
      count++;
    }
  }
  return count === 0 ? Infinity : total / count;
}

/**
 * Where `frame` sits relative to `ref`.
 *
 * THE SIGN
 * ────────
 * `dx`/`dy` are the offset to SAMPLE THE FRAME AT, not the distance its content
 * moved — `frame[x + dx]` is what belongs at `ref[x]`. So content that drifted
 * three pixels right gives `dx = -3`. This is the convention the merge wants,
 * since the merge's inner loop reads `frame` at `x + dx`, and stating it here is
 * cheaper than a sign error discovered as a blurry photo.
 *
 * Coarse to fine: an exhaustive search at the top of the pyramid, where the
 * image is tiny and a ±10 pixel window covers a large real displacement, then
 * a small window at each finer level around the doubled estimate. Searching
 * ±160 pixels at full resolution directly would be ten thousand times the work
 * for the same answer.
 *
 * Finishes with a sub-pixel fit, which is the step that matters most: hand
 * tremor is fractional, and rounding it away is what turns a merge that
 * sharpens into a merge that blurs.
 */
export function alignPair(refPyr: Level[], framePyr: Level[]): { dx: number; dy: number; error: number } {
  let dx = 0, dy = 0;

  for (let lv = refPyr.length - 1; lv >= 0; lv--) {
    const r = refPyr[lv], f = framePyr[lv];
    if (!f || f.w !== r.w || f.h !== r.h) continue;

    const top = lv === refPyr.length - 1;
    const range = top ? COARSE_SEARCH : FINE_SEARCH;
    if (!top) { dx *= 2; dy *= 2; }

    // Coarse levels are small, so look at everything; fine levels are large, so
    // sample. The estimate is already close by then.
    const stride = lv === 0 ? 4 : lv === 1 ? 2 : 1;
    const margin = range + 1;

    let best = Infinity, bx = dx, by = dy;
    for (let oy = dy - range; oy <= dy + range; oy++) {
      for (let ox = dx - range; ox <= dx + range; ox++) {
        const e = sad(r.data, f.data, r.w, r.h, ox, oy, margin, stride);
        if (e < best) { best = e; bx = ox; by = oy; }
      }
    }
    dx = bx; dy = by;
  }

  /*
   * Sub-pixel, by fitting a parabola through the error either side of the
   * minimum on each axis. The vertex of that parabola is where the true minimum
   * lies between whole pixels.
   */
  const base = refPyr[0];
  const f0 = framePyr[0];
  const at = (ox: number, oy: number) => sad(base.data, f0.data, base.w, base.h, ox, oy, FINE_SEARCH + 2, 4);
  const c = at(dx, dy);
  const sub = (minus: number, plus: number) => {
    const denom = minus - 2 * c + plus;
    if (denom <= 0) return 0;
    // Clamped to half a pixel: a parabola through noise can point anywhere, and
    // a wild sub-pixel term is worse than none.
    return Math.max(-0.5, Math.min(0.5, (minus - plus) / (2 * denom)));
  };

  return {
    dx: dx + sub(at(dx - 1, dy), at(dx + 1, dy)),
    dy: dy + sub(at(dx, dy - 1), at(dx, dy + 1)),
    error: c,
  };
}

/**
 * The sharpest frame in the burst, as the one everything aligns to.
 *
 * Every frame is a candidate and they are not equal: somewhere in a handheld
 * burst is a frame caught mid-shake. Aligning to that one merges everything
 * onto a blurred reference and the result cannot be better than it. Gradient
 * energy is the standard measure of "in focus and not smeared", and it is one
 * cheap pass over a downsampled luma.
 */
export function pickReference(pyramids: Level[][]): number {
  let best = 0, bestScore = -1;
  for (let i = 0; i < pyramids.length; i++) {
    // Level 1 rather than 0: half resolution, a quarter of the work, and the
    // ranking does not change.
    const lv = pyramids[i][Math.min(1, pyramids[i].length - 1)];
    const { data, w, h } = lv;
    let score = 0;
    for (let y = 1; y < h - 1; y += 2) {
      for (let x = 1; x < w - 1; x += 2) {
        const i0 = y * w + x;
        const gx = data[i0 + 1] - data[i0 - 1];
        const gy = data[i0 + w] - data[i0 - w];
        score += gx * gx + gy * gy;
      }
    }
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

// ── Merging ───────────────────────────────────────────────────────────────────

export interface MergeOptions {
  /**
   * How far a frame's pixel may differ from the reference before it is treated
   * as something that moved rather than as noise. In 8-bit levels.
   *
   * Too low and real noise is rejected, so nothing merges and the result is
   * just the reference frame. Too high and a person walking through the shot is
   * averaged in as a ghost. This sits above typical JPEG noise and below any
   * real subject motion.
   */
  motionThreshold: number;
  /** Frames whose alignment error exceeds this are dropped entirely. */
  maxAlignError: number;
}

export const MERGE_DEFAULTS: MergeOptions = { motionThreshold: 22, maxAlignError: 34 };

/**
 * Merge an aligned burst, rejecting whatever moved.
 *
 * Every output pixel is a weighted average across the burst. The reference
 * always carries full weight; every other frame carries a weight that falls to
 * zero as its sampled value diverges from the reference. That single rule is
 * the anti-ghosting: a pedestrian who crossed the frame differs enormously from
 * the reference at those pixels, contributes nothing there, and contributes
 * fully everywhere else — so the sky still gets eight frames of noise reduction
 * while the pedestrian stays exactly as sharp as they were in one.
 *
 * Sampling is bilinear at the sub-pixel offset. That is not a detail: whole-
 * pixel sampling would throw away the fractional part of the alignment, which
 * is precisely the information that lets a merge resolve detail a single frame
 * cannot.
 */
export function mergeBurst(
  frames: Pixels[],
  options: MergeOptions = MERGE_DEFAULTS,
): { merged: Pixels; report: MergeReport } {
  if (frames.length === 0) throw new Error('mergeBurst: nothing to merge');

  const first = frames[0];
  const usable = frames.filter(f => f.width === first.width && f.height === first.height);
  if (usable.length === 1) {
    return {
      merged: usable[0],
      report: { reference: 0, offsets: [{ dx: 0, dy: 0 }], dropped: frames.length - 1, agreement: 1 },
    };
  }

  const w = first.width, h = first.height;
  const pyramids = usable.map(f => pyramid(lumaOf(f), w, h, LEVELS));
  const refIdx = pickReference(pyramids);
  const ref = usable[refIdx];

  const offsets: Offset[] = [];
  const contributors: { frame: Pixels; dx: number; dy: number }[] = [];
  let dropped = 0;

  for (let i = 0; i < usable.length; i++) {
    if (i === refIdx) { offsets[i] = { dx: 0, dy: 0 }; continue; }
    const { dx, dy, error } = alignPair(pyramids[refIdx], pyramids[i]);
    offsets[i] = { dx, dy };
    /*
     * A frame that will not align is not evidence about this scene — it caught
     * a lurch, or the subject turned. Merging it in would blur everything
     * uniformly, which is worse than the noise it was brought in to remove.
     */
    if (error > options.maxAlignError) { dropped++; continue; }
    contributors.push({ frame: usable[i], dx, dy });
  }

  const n = w * h;
  const acc = new Float32Array(n * 3);
  const wsum = new Float32Array(n);
  const refData = ref.data;

  // The reference, at full weight everywhere.
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    acc[i * 3] = refData[p];
    acc[i * 3 + 1] = refData[p + 1];
    acc[i * 3 + 2] = refData[p + 2];
    wsum[i] = 1;
  }

  const thr = options.motionThreshold;
  const inv = 1 / (thr * thr);
  let agreementSum = 0;

  for (const { frame, dx, dy } of contributors) {
    const d = frame.data;
    for (let y = 0; y < h; y++) {
      const sy = y + dy;
      const y0 = Math.floor(sy);
      const fy = sy - y0;
      const ya = Math.max(0, Math.min(h - 1, y0));
      const yb = Math.max(0, Math.min(h - 1, y0 + 1));

      for (let x = 0; x < w; x++) {
        const sx = x + dx;
        const x0 = Math.floor(sx);
        const fx = sx - x0;
        const xa = Math.max(0, Math.min(w - 1, x0));
        const xb = Math.max(0, Math.min(w - 1, x0 + 1));

        const pAA = (ya * w + xa) * 4, pAB = (ya * w + xb) * 4;
        const pBA = (yb * w + xa) * 4, pBB = (yb * w + xb) * 4;
        const wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy);
        const wc = (1 - fx) * fy, wd = fx * fy;

        const r = d[pAA] * wa + d[pAB] * wb + d[pBA] * wc + d[pBB] * wd;
        const g = d[pAA + 1] * wa + d[pAB + 1] * wb + d[pBA + 1] * wc + d[pBB + 1] * wd;
        const b = d[pAA + 2] * wa + d[pAB + 2] * wb + d[pBA + 2] * wc + d[pBB + 2] * wd;

        const i0 = y * w + x, p0 = i0 * 4;
        // Distance from the reference, over all three channels — a subject can
        // move without changing brightness, and colour catches that.
        const dr = r - refData[p0], dg = g - refData[p0 + 1], db = b - refData[p0 + 2];
        const dist2 = (dr * dr + dg * dg + db * db) / 3;

        // 1 when identical, 0 at the threshold, and never negative.
        const weight = Math.max(0, 1 - dist2 * inv);
        if (weight > 0) {
          acc[i0 * 3] += r * weight;
          acc[i0 * 3 + 1] += g * weight;
          acc[i0 * 3 + 2] += b * weight;
          wsum[i0] += weight;
        }
        agreementSum += weight;
      }
    }
  }

  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const k = 1 / wsum[i];
    out[p] = acc[i * 3] * k;
    out[p + 1] = acc[i * 3 + 1] * k;
    out[p + 2] = acc[i * 3 + 2] * k;
    out[p + 3] = refData[p + 3];
  }

  return {
    merged: { data: out, width: w, height: h },
    report: {
      reference: refIdx,
      offsets,
      dropped,
      agreement: contributors.length ? agreementSum / (n * contributors.length) : 1,
    },
  };
}
