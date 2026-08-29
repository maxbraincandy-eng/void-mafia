/**
 * Deciding which frames deserve to be in the photograph.
 *
 * WHAT THE PIPELINE ALREADY REJECTED, AND WHAT IT DID NOT
 * ──────────────────────────────────────────────────────
 * The merge drops frames it cannot align — a lurch, a subject that turned.
 * That is a test of whether a frame can be REGISTERED, and it is silent about
 * whether the frame is any good. A frame caught mid-shake aligns perfectly well
 * and is simply blurred; merging it in spreads that blur across every pixel it
 * touches, and the more frames the burst collects the more likely one of them
 * is that frame.
 *
 * Raising the burst from five frames to fourteen made this matter. More
 * evidence is only better if the bad evidence is thrown out.
 *
 * WHY THE SCORES ARE RELATIVE
 * ───────────────────────────
 * There is no absolute threshold for "sharp enough" — a photograph of fog is
 * legitimately low in gradient energy and a brick wall is legitimately high.
 * But every frame in a burst is looking at the same scene a few tens of
 * milliseconds apart, so they are directly comparable to each other. The
 * sharpest frame in the burst defines what this scene can look like, and a
 * frame well below it is blurred rather than depicting something soft.
 *
 * EXPOSURE IS THE OTHER HALF
 * ──────────────────────────
 * Auto-exposure hunts. A burst can contain frames a stop apart, and merging
 * those averages towards a brightness none of them had — a flat, washed
 * result that looks like the tone mapping misfired. Frames far from the
 * burst's median brightness are dropped for the same reason blurred ones are:
 * they are evidence about a different photograph.
 */

import type { Pixels } from './photoPipeline';

export interface FrameScore {
  index: number;
  /** Mean gradient magnitude. Higher is sharper. Comparable only within a burst. */
  sharpness: number;
  /** Mean luminance, 0..255. */
  luma: number;
  /** Fraction of pixels pinned at 0 or 255, where no detail survives. */
  clipped: number;
}

export interface SelectionOptions {
  /**
   * A frame must reach this fraction of the burst's best sharpness.
   *
   * Generous on purpose. Real hand tremor varies frame to frame and a little
   * softness is normal; this is meant to catch the frame that was obviously
   * smeared, not to hunt for the single best one and discard a usable burst.
   */
  sharpnessFloor: number;
  /** Levels of brightness a frame may differ from the burst median. */
  exposureTolerance: number;
  /** Never return fewer than this, however bad the burst looks. */
  minKeep: number;
}

export const SELECTION_DEFAULTS: SelectionOptions = {
  sharpnessFloor: 0.62,
  exposureTolerance: 22,
  minKeep: 2,
};

/**
 * Score one frame.
 *
 * Sampled on a stride rather than every pixel. At burst sizes of a dozen or
 * more this runs on every frame before any of the real work starts, and the
 * ranking does not change for looking at a quarter of the pixels — this is a
 * comparison between frames, not a measurement of one.
 */
export function scoreFrame(img: Pixels, index = 0): FrameScore {
  const { width: w, height: h, data } = img;
  if (w < 3 || h < 3) return { index, sharpness: 0, luma: 0, clipped: 0 };

  const stride = 2;
  let grad = 0, lumaSum = 0, clipped = 0, n = 0;

  for (let y = 1; y < h - 1; y += stride) {
    for (let x = 1; x < w - 1; x += stride) {
      const p = (y * w + x) * 4;
      const l = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      const lx = 0.299 * data[p + 4] + 0.587 * data[p + 5] + 0.114 * data[p + 6];
      const ly = 0.299 * data[p + w * 4] + 0.587 * data[p + w * 4 + 1] + 0.114 * data[p + w * 4 + 2];

      grad += Math.abs(lx - l) + Math.abs(ly - l);
      lumaSum += l;
      // Only the extremes: a pixel at 0 or 255 has had its detail thrown away
      // by the sensor and no amount of merging brings it back.
      if (l <= 1 || l >= 254) clipped++;
      n++;
    }
  }

  return {
    index,
    sharpness: n > 0 ? grad / n : 0,
    luma: n > 0 ? lumaSum / n : 0,
    clipped: n > 0 ? clipped / n : 0,
  };
}

export interface Selection {
  /** Indices into the original array, in their original order. */
  keep: number[];
  scores: FrameScore[];
  /** Why each dropped frame was dropped — shown in the readout, useful in a bug report. */
  rejected: { index: number; reason: 'blurred' | 'exposure' }[];
}

/**
 * Choose the frames worth merging.
 *
 * Order is preserved rather than sorted by score: the merge picks its own
 * reference by a different measure, and handing it a re-ordered burst would
 * only make the indices in two reports disagree.
 *
 * `minKeep` is a floor, not a target. A burst where every frame is soft is a
 * photograph of something soft, and returning almost nothing would turn a
 * usable multi-frame shot into a single-frame one for no reason.
 */
export function selectFrames(
  frames: Pixels[],
  options: SelectionOptions = SELECTION_DEFAULTS,
): Selection {
  const scores = frames.map((f, i) => scoreFrame(f, i));
  if (frames.length <= options.minKeep) {
    return { keep: frames.map((_, i) => i), scores, rejected: [] };
  }

  const best = Math.max(...scores.map(s => s.sharpness));
  const sorted = [...scores].map(s => s.luma).sort((a, b) => a - b);
  const medianLuma = sorted[Math.floor(sorted.length / 2)];

  const rejected: Selection['rejected'] = [];
  const keep: number[] = [];

  for (const s of scores) {
    if (best > 0 && s.sharpness < best * options.sharpnessFloor) {
      rejected.push({ index: s.index, reason: 'blurred' });
      continue;
    }
    if (Math.abs(s.luma - medianLuma) > options.exposureTolerance) {
      rejected.push({ index: s.index, reason: 'exposure' });
      continue;
    }
    keep.push(s.index);
  }

  /*
   * If the rules cut too deep, take the sharpest frames instead of obeying
   * them. A burst is expensive to collect and a merge of four soft frames still
   * beats one soft frame — refusing to merge because nothing met a threshold
   * would throw away the whole point of having taken a burst.
   */
  if (keep.length < options.minKeep) {
    const byScore = [...scores].sort((a, b) => b.sharpness - a.sharpness).slice(0, options.minKeep);
    const chosen = new Set(byScore.map(s => s.index));
    return {
      keep: scores.filter(s => chosen.has(s.index)).map(s => s.index),
      scores,
      rejected: scores.filter(s => !chosen.has(s.index)).map(s => ({ index: s.index, reason: 'blurred' as const })),
    };
  }

  return { keep, scores, rejected };
}

/**
 * How many frames a shot at this zoom is worth collecting.
 *
 * Reconstruction onto a finer grid needs the burst to have sampled enough
 * distinct sub-pixel phases to fill it. At 1× there is no finer grid and the
 * frames buy noise reduction alone, which saturates quickly — the difference
 * between eight frames and sixteen is most of a stop at 1× and far more than
 * that at 4×, where the extra phases are also filling in resolution.
 *
 * The tier's own count is the ceiling: a phone that cannot chew through
 * fourteen frames is not asked to collect twenty because the zoom is high.
 */
export function framesForZoom(zoom: number, tierMax: number): number {
  const wanted =
    zoom < 1.5 ? Math.round(tierMax * 0.55) :
    zoom < 2.5 ? Math.round(tierMax * 0.8) :
    tierMax;
  // Two is the floor at which merging is still merging.
  return Math.max(2, Math.min(tierMax, wanted));
}
