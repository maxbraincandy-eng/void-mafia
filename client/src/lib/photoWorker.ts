/**
 * The photo pipeline, off the main thread.
 *
 * Enhancing a twelve-megapixel photo is around two and a half seconds of solid
 * arithmetic. On the main thread that is two and a half seconds during which
 * the page cannot paint, the spinner does not spin and a tap does nothing —
 * which reads as a crash, not as work in progress. Several people will press
 * the shutter again.
 *
 * The pipeline is pure functions over a pixel buffer, so it moves here almost
 * unchanged. The result comes back as a transferable, which hands over the
 * forty-eight megabytes by reference rather than copying them.
 *
 * The input is deliberately NOT transferred. Transferring would neuter the
 * caller's buffer, and the caller still needs it — that buffer is the original
 * the result screen shows when the compare button is held.
 */

import { enhance, type EnhanceOptions, type Pixels } from './photoPipeline';
import { mergeBurst, type MergeReport } from './burstMerge';

interface Request {
  /** One or more frames. Two or more are aligned and merged before enhancing. */
  frames: { data: Uint8ClampedArray; width: number; height: number }[];
  options: EnhanceOptions;
}

self.onmessage = (e: MessageEvent<Request>) => {
  const { frames, options } = e.data;
  try {
    /*
     * Merge first, enhance second, and never the other way round.
     *
     * Enhancing each frame before merging would sharpen each frame's own noise
     * into something the merge then treats as real detail and preserves —
     * and the anti-ghosting compares frames to a reference, which only means
     * anything while they are still directly comparable.
     */
    let report: MergeReport | null = null;
    let base: Pixels;
    if (frames.length > 1) {
      const merged = mergeBurst(frames);
      base = merged.merged;
      report = merged.report;
    } else {
      base = frames[0];
    }

    const out = enhance(base, options);
    (self as unknown as Worker).postMessage(
      { ok: true, data: out.data, width: out.width, height: out.height, report },
      [out.data.buffer as ArrayBuffer],
    );
  } catch (err: any) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(err?.message ?? err) });
  }
};
