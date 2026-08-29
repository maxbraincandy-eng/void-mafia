/**
 * The phone's other cores.
 *
 * WHY THIS EXISTS INSTEAD OF A GPU PATH
 * ─────────────────────────────────────
 * WebGPU would be faster. It is also unverifiable in the environment this was
 * built in — no adapter, no device — and a shader bug does not throw. It writes
 * slightly wrong pixels, quietly, into every photograph. Shipping image code
 * that cannot be checked is worse than shipping slower image code that can, so
 * this uses cores, which can be checked, and checks it: the parallel result is
 * asserted byte-identical to the serial one.
 *
 * WHY SPEED IS QUALITY HERE
 * ─────────────────────────
 * Every ceiling in this pipeline was a compute decision. Five frames rather
 * than fourteen. Reconstruction on the zoom crop rather than the frame. Those
 * numbers exist because one core had to finish before somebody gave up on the
 * shutter. Six cores move all of them, and more frames is more real
 * measurement — which is the one kind of quality that cannot be faked.
 *
 * WHAT IS SPLIT AND WHAT IS NOT
 * ─────────────────────────────
 * The accumulation is split: it is per-pixel and the strips do not interact.
 * The alignment is not. Choosing a reference frame and measuring offsets are
 * decisions about the whole image, and two strips that chose differently would
 * each be internally consistent and disagree with each other — a seam no halo
 * can repair, because the halo is not what is wrong.
 */

import type { Pixels } from './photoPipeline';
import type { MergePlan, MergeOptions } from './burstMerge';
import { strips, sliceRows, stitch, type Strip } from './stripe';

/** How many rows either side a strip must be able to read. */
export function haloFor(plan: MergePlan): number {
  let max = 0;
  for (const c of plan.contributors) max = Math.max(max, Math.abs(c.dy));
  // Ceiling plus two: the offset is fractional and the sampler reads the row
  // below the one it lands on. One short here is a seam.
  return Math.ceil(max) + 2;
}

/**
 * The frames a strip needs, cut down to the rows it may read.
 *
 * Sending every worker every frame would mean N copies of the whole burst —
 * fourteen frames of three megapixels across seven workers is over a gigabyte.
 * Each worker gets its own band plus the halo, so the total sent is roughly one
 * copy however many workers there are.
 *
 * The returned plan is rewritten into the slice's coordinates: same offsets,
 * because a translation does not change when the origin moves, but the frames
 * are now shorter and the rows to produce are numbered from the top of the cut.
 */
export function sliceTask(plan: MergePlan, strip: Strip): {
  plan: MergePlan;
  rows: { y0: number; y1: number };
} {
  const usable = plan.usable.map(f => sliceRows(f, strip.readY0, strip.readY1));
  return {
    plan: { ...plan, usable },
    rows: { y0: strip.y0 - strip.readY0, y1: strip.y1 - strip.readY0 },
  };
}

// ── The pool ──────────────────────────────────────────────────────────────────

type Job = { resolve: (v: any) => void; reject: (e: any) => void; message: any; transfer: Transferable[] };

/**
 * A fixed set of workers, fed from a queue.
 *
 * Created once and reused: spinning up a worker costs tens of milliseconds and
 * a burst does it several times per shot. Torn down explicitly, because a
 * camera screen that leaks a worker per photo runs a phone out of threads.
 */
export class PhotoPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: Job[] = [];
  private pending = new Map<Worker, Job>();
  private broken = false;

  constructor(size: number, private makeWorker: () => Worker) {
    for (let i = 0; i < Math.max(1, size); i++) {
      try {
        const w = makeWorker();
        w.onmessage = e => this.finish(w, e.data);
        w.onerror = () => this.fail(w);
        this.workers.push(w);
        this.idle.push(w);
      } catch {
        // Workers unavailable — a strict content-security policy, or an
        // embedded WebView. The caller falls back to running inline.
        this.broken = true;
        break;
      }
    }
    if (this.workers.length === 0) this.broken = true;
  }

  get usable(): boolean { return !this.broken; }
  get size(): number { return this.workers.length; }

  run<T>(message: any, transfer: Transferable[] = []): Promise<T> {
    if (this.broken) return Promise.reject(new Error('pool unavailable'));
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ resolve, reject, message, transfer });
      this.pump();
    });
  }

  private pump(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const w = this.idle.pop()!;
      const job = this.queue.shift()!;
      this.pending.set(w, job);
      try {
        w.postMessage(job.message, job.transfer);
      } catch (e) {
        this.pending.delete(w);
        job.reject(e);
        this.idle.push(w);
      }
    }
  }

  private finish(w: Worker, data: any): void {
    const job = this.pending.get(w);
    this.pending.delete(w);
    this.idle.push(w);
    if (job) (data?.ok === false ? job.reject(new Error(data.error ?? 'worker failed')) : job.resolve(data));
    this.pump();
  }

  private fail(w: Worker): void {
    const job = this.pending.get(w);
    this.pending.delete(w);
    if (job) job.reject(new Error('worker error'));
    // A worker that errored is not trusted again; the rest carry on.
    this.workers = this.workers.filter(x => x !== w);
    this.idle = this.idle.filter(x => x !== w);
    if (this.workers.length === 0) this.broken = true;
    this.pump();
  }

  destroy(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.idle = [];
    for (const j of this.queue) j.reject(new Error('pool destroyed'));
    this.queue = [];
    this.broken = true;
  }
}

/**
 * Merge a planned burst across the pool.
 *
 * Falls back to a single inline call whenever the pool is unavailable or the
 * image is too small to be worth splitting — below a few hundred rows the
 * postMessage copies cost more than the parallelism saves.
 */
export async function mergeAcrossPool(
  pool: PhotoPool | null,
  plan: MergePlan,
  width: number,
  height: number,
  options: MergeOptions,
  inline: (plan: MergePlan, rows: { y0: number; y1: number }) => { data: Uint8ClampedArray; agreementSum: number; samples: number },
): Promise<{ image: Pixels; agreement: number }> {
  const workers = pool?.usable ? pool.size : 1;
  if (workers < 2 || height < 240) {
    const one = inline(plan, { y0: 0, y1: height });
    return {
      image: { data: one.data, width, height },
      agreement: one.samples > 0 ? one.agreementSum / one.samples : 1,
    };
  }

  const halo = haloFor(plan);
  const parts = strips(height, workers, halo);

  const done = await Promise.all(parts.map(async strip => {
    const task = sliceTask(plan, strip);
    const res = await pool!.run<{ data: Uint8ClampedArray; agreementSum: number; samples: number }>({
      kind: 'mergeRows',
      frames: task.plan.usable,
      reference: task.plan.reference,
      contributors: task.plan.contributors,
      rows: task.rows,
      options,
    });
    return { y0: strip.y0, y1: strip.y1, data: res.data, agreementSum: res.agreementSum, samples: res.samples };
  }));

  /*
   * Agreement is summed across the strips rather than assumed.
   *
   * It is the number the readout uses to admit that the scene was moving and
   * most of the burst was therefore rejected. A parallel path that lost track
   * of it and reported a constant would be claiming a clean merge on every
   * photo, including the ones where it did almost nothing — which is precisely
   * the kind of quiet overclaim this pipeline is built to avoid.
   */
  const agreementSum = done.reduce((t, d) => t + d.agreementSum, 0);
  const samples = done.reduce((t, d) => t + d.samples, 0);

  return {
    image: stitch(done, width, height),
    agreement: samples > 0 ? agreementSum / samples : 1,
  };
}
