/**
 * The GPU merge, gated behind proof that it works on this device.
 *
 * This is the piece that makes the shader shippable. It builds the self-test
 * input, runs it through both implementations, and hands the verdict to
 * `VerifiedPath`, which caches it for the session.
 *
 * WHAT THE PROBE HAS TO CONTAIN
 * ─────────────────────────────
 * Everything the real path does, or the check proves nothing. A probe of flat
 * colour would pass with a sampler that ignored its coordinates entirely; a
 * probe with whole-pixel offsets would pass with a broken interpolator; a probe
 * where every frame matched would pass with the robustness weight inverted.
 *
 * So it has structure at pixel scale, fractional offsets on both axes, one
 * frame that disagrees strongly enough to be partly rejected, and a size that
 * is not a multiple of the workgroup — the last of those is how an off-by-one
 * in the boundary guard gets caught, and a shader that dropped the final
 * partial workgroup would otherwise pass every test in this file.
 */

import { mergeRows, type MergeOptions, type MergePlan, MERGE_DEFAULTS } from './burstMerge';
import { gpuMerge, gpuDevice } from './gpuMerge';
import { VerifiedPath } from './gpuGate';
import type { Pixels } from './photoPipeline';

/** Deliberately not a multiple of the 8×8 workgroup. */
const PROBE_W = 37;
const PROBE_H = 29;

export interface ProbeInput {
  frames: Pixels[];
  reference: number;
  contributors: { index: number; dx: number; dy: number }[];
  options: MergeOptions;
}

export function buildProbe(): ProbeInput {
  const make = (ox: number, oy: number, tint: number): Pixels => {
    const data = new Uint8ClampedArray(PROBE_W * PROBE_H * 4);
    for (let y = 0; y < PROBE_H; y++) {
      for (let x = 0; x < PROBE_W; x++) {
        // Structure at pixel scale, so an interpolator that is subtly wrong
        // cannot hide. A smooth gradient would forgive almost anything.
        const v = 40 + 90 * ((x + ox) % 3) / 2 + 60 * ((y + oy) % 4) / 3
          + 45 * Math.sin((x + ox) * 1.7 + (y + oy) * 1.1);
        const p = (y * PROBE_W + x) * 4;
        data[p] = Math.max(0, Math.min(255, v + tint));
        data[p + 1] = Math.max(0, Math.min(255, v * 0.8 + 30));
        data[p + 2] = Math.max(0, Math.min(255, v * 1.1 - tint));
        data[p + 3] = 255;
      }
    }
    return { data, width: PROBE_W, height: PROBE_H };
  };

  return {
    frames: [make(0, 0, 0), make(1, 0, 0), make(0, 1, 0), make(2, 1, 90)],
    reference: 0,
    contributors: [
      // Fractional on both axes, and one of each sign.
      { index: 1, dx: 0.37, dy: -0.61 },
      { index: 2, dx: -1.24, dy: 0.83 },
      // Tinted hard, so the robustness weight has to actually reject it in
      // places. An inverted or ignored weight changes this pixel a great deal.
      { index: 3, dx: 0.5, dy: 0.5 },
    ],
    options: MERGE_DEFAULTS,
  };
}

/** The CPU answer for the probe — the thing the shader has to match. */
function cpuAnswer(p: ProbeInput): Uint8ClampedArray {
  const plan: MergePlan = {
    reference: p.reference,
    contributors: p.contributors,
    offsets: [],
    dropped: 0,
    usable: p.frames,
  };
  return mergeRows(plan, { y0: 0, y1: PROBE_H }, p.options).data;
}

const gate = new VerifiedPath<ProbeInput>(
  input => gpuMerge(input),
  cpuAnswer,
  buildProbe,
);

/** What the self-test concluded, for a developer readout. Null before it ran. */
export function gpuVerdict() { return gate.result; }

/**
 * Merge on the GPU if — and only if — this device has proved it can.
 *
 * Answers null in every other case, which the caller reads as "use the cores".
 * The gate is asked first and its answer is cached, so the cost of the proof is
 * paid once per session rather than once per photograph.
 */
export async function tryGpuMerge(
  frames: Pixels[],
  reference: number,
  contributors: { index: number; dx: number; dy: number }[],
  options: MergeOptions,
): Promise<Pixels | null> {
  if (!(await gpuDevice())) return null;
  if (!(await gate.trusted())) return null;

  const out = await gpuMerge({ frames, reference, contributors, options });
  if (!out) return null;
  return { data: out, width: frames[0].width, height: frames[0].height };
}
