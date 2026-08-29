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
import { superResolve, MAX_HONEST_SCALE, type SuperResolveReport } from './superResolve';

interface Request {
  /** One or more frames. Two or more are aligned and merged before enhancing. */
  frames: { data: Uint8ClampedArray; width: number; height: number }[];
  options: EnhanceOptions;
  /**
   * Reconstruct onto a finer grid before enhancing. Set when the shot is
   * zoomed, since that is the only time a finer grid is worth the cost.
   */
  superResolve?: boolean;
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
    let sr: SuperResolveReport | null = null;
    let base: Pixels;

    if (frames.length > 1 && e.data.superResolve) {
      /*
       * The zoom path. Fusing onto a grid twice as fine recovers detail no
       * single frame holds — the burst sampled the scene at different sub-pixel
       * phases, and this is what puts those measurements back together.
       */
      const out = superResolve(frames, { scale: MAX_HONEST_SCALE });
      base = out.image;
      sr = out.report;
    } else if (frames.length > 1) {
      const merged = mergeBurst(frames);
      base = merged.merged;
      report = merged.report;
    } else {
      base = frames[0];
    }

    const out = enhance(base, options);
    (self as unknown as Worker).postMessage(
      { ok: true, data: out.data, width: out.width, height: out.height, report, sr },
      [out.data.buffer as ArrayBuffer],
    );
  } catch (err: any) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(err?.message ?? err) });
  }
};
