/**
 * The photo pipeline, off the main thread — and now across several of them.
 *
 * Enhancing a twelve-megapixel photo is over a second of solid arithmetic, and
 * merging a fourteen-frame burst is several more. On the main thread that is
 * several seconds during which the page cannot paint, the spinner does not spin
 * and a tap does nothing — which reads as a crash rather than as work, and gets
 * the shutter pressed again.
 *
 * One worker fixes the freeze. Several fix the wait — and the wait was what
 * capped quality: five frames instead of fourteen, reconstruction on the zoom
 * crop instead of the frame. Those were compute decisions, and cores move them.
 *
 * THREE JOBS, ONE WORKER SCRIPT
 * ─────────────────────────────
 * `plan` runs once over the whole burst, because choosing a reference frame and
 * measuring offsets are decisions about the entire image; two strips that chose
 * differently would disagree with each other along their shared edge.
 * `mergeRows` runs many times over strips, because accumulation is per-pixel
 * and strips do not interact. `process` is the whole thing end to end, for the
 * single-worker fallback and for bursts too small to be worth splitting.
 *
 * Results come back as transferables, which hand over the buffer by reference
 * rather than copying it. Inputs are deliberately NOT transferred: that would
 * neuter the caller's copy, and the caller still needs the frames — one of them
 * is the original the compare button shows.
 */

import { enhance, type EnhanceOptions, type Pixels } from './photoPipeline';
import {
  mergeBurst, planMerge, mergeRows, MERGE_DEFAULTS,
  type MergeReport, type MergeOptions,
} from './burstMerge';
import { superResolve, MAX_HONEST_SCALE, type SuperResolveReport } from './superResolve';

type Frame = { data: Uint8ClampedArray; width: number; height: number };

interface PlanJob { kind: 'plan'; frames: Frame[]; options: MergeOptions }
interface RowsJob {
  kind: 'mergeRows';
  frames: Frame[];
  reference: number;
  contributors: { index: number; dx: number; dy: number }[];
  rows: { y0: number; y1: number };
  options: MergeOptions;
}
interface EnhanceJob { kind: 'enhance'; frame: Frame; options: EnhanceOptions }
interface ProcessJob { kind?: 'process'; frames: Frame[]; options: EnhanceOptions; superResolve?: boolean }

type Job = PlanJob | RowsJob | EnhanceJob | ProcessJob;

const post = (msg: any, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = (e: MessageEvent<Job>) => {
  const job = e.data;
  try {
    switch (job.kind) {
      case 'plan': {
        const p = planMerge(job.frames, job.options);
        /*
         * Only the decisions travel back, never the frames. The plan holds
         * every frame it was given; returning that would copy the whole burst
         * back across the wire for the sake of a handful of numbers.
         */
        post({ ok: true, reference: p.reference, contributors: p.contributors, offsets: p.offsets, dropped: p.dropped });
        return;
      }

      case 'mergeRows': {
        const out = mergeRows(
          { reference: job.reference, contributors: job.contributors, offsets: [], dropped: 0, usable: job.frames },
          job.rows, job.options,
        );
        post({ ok: true, data: out.data, agreementSum: out.agreementSum, samples: out.samples },
          [out.data.buffer as ArrayBuffer]);
        return;
      }

      case 'enhance': {
        const out = enhance(job.frame, job.options);
        post({ ok: true, data: out.data, width: out.width, height: out.height },
          [out.data.buffer as ArrayBuffer]);
        return;
      }

      default: {
        const { frames, options } = job as ProcessJob;
        let report: MergeReport | null = null;
        let sr: SuperResolveReport | null = null;
        let base: Pixels;

        if (frames.length > 1 && (job as ProcessJob).superResolve) {
          /*
           * The zoom path. Fusing onto a grid twice as fine recovers detail no
           * single frame holds — the burst sampled the scene at different
           * sub-pixel phases, and this puts those measurements back together.
           */
          const out = superResolve(frames, { scale: MAX_HONEST_SCALE });
          base = out.image;
          sr = out.report;
        } else if (frames.length > 1) {
          const merged = mergeBurst(frames, MERGE_DEFAULTS);
          base = merged.merged;
          report = merged.report;
        } else {
          base = frames[0];
        }

        const out = enhance(base, options);
        post({ ok: true, data: out.data, width: out.width, height: out.height, report, sr },
          [out.data.buffer as ArrayBuffer]);
      }
    }
  } catch (err: any) {
    post({ ok: false, error: String(err?.message ?? err) });
  }
};
