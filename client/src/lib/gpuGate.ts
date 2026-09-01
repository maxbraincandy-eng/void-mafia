/**
 * Deciding whether to trust the GPU.
 *
 * THE PROBLEM THIS SOLVES
 * ──────────────────────
 * A compute shader cannot be verified where this was written — there is no
 * adapter and no device — and a shader bug does not throw. It writes slightly
 * wrong pixels, quietly, into every photograph taken with it. Half a channel
 * off from a rounding difference, a row misindexed at a workgroup boundary, a
 * driver that implements `unpack4x8unorm` a hair differently: none of it
 * crashes, all of it degrades the product, and none of it is visible without
 * the correct answer sitting beside it.
 *
 * So the correct answer is put beside it. On first use the same known input
 * goes through both the shader and the CPU function it replaces, and the
 * results are compared. Disagreement beyond a tolerance means the GPU is not
 * trusted for the rest of the session and every photo goes down the path that
 * was tested.
 *
 * That converts "unverifiable where it was written" into "verified on the
 * device it actually runs on", which is strictly better than either shipping it
 * blind or not shipping it.
 *
 * WHY THE TOLERANCE IS NOT ZERO
 * ─────────────────────────────
 * The CPU path computes in JavaScript doubles; a shader computes in 32-bit
 * floats. Identical arithmetic in the two produces answers that differ in the
 * last bit, which after rounding to 8 bits is occasionally one level. Demanding
 * byte-equality would reject every correct implementation. Two levels is well
 * inside invisible and far outside the reach of a real indexing bug, which
 * misses by tens.
 */

export interface Verdict {
  trusted: boolean;
  /** Largest absolute difference found, in 8-bit levels. */
  maxDelta: number;
  /** Where the worst disagreement was, for a bug report. */
  atByte: number;
  reason: string;
}

/** A rounding difference between float widths. A bug misses by tens. */
export const GPU_TOLERANCE = 2;

/**
 * Compare a candidate result against the reference implementation.
 *
 * Alpha is skipped. The merge carries it through from the reference frame
 * untouched, so it says nothing about whether the arithmetic is right, and a
 * shader that packs it differently would fail for a reason that does not matter.
 */
export function compare(
  candidate: ArrayLike<number>,
  reference: ArrayLike<number>,
  tolerance = GPU_TOLERANCE,
): Verdict {
  if (candidate.length !== reference.length) {
    return {
      trusted: false, maxDelta: Infinity, atByte: -1,
      reason: `size mismatch: ${candidate.length} vs ${reference.length}`,
    };
  }

  let maxDelta = 0;
  let atByte = -1;
  for (let i = 0; i < reference.length; i++) {
    if (i % 4 === 3) continue;
    const d = Math.abs(candidate[i] - reference[i]);
    if (d > maxDelta) { maxDelta = d; atByte = i; }
  }

  return maxDelta <= tolerance
    ? { trusted: true, maxDelta, atByte, reason: 'agrees with the reference implementation' }
    : { trusted: false, maxDelta, atByte, reason: `differs by ${maxDelta} levels at byte ${atByte}` };
}

/**
 * A capability that has to earn its place before it is used.
 *
 * The check runs at most once. It is cached whichever way it goes: a device
 * that failed will fail again, and re-testing on every photo would spend the
 * speed the GPU was brought in for.
 *
 * Anything thrown during the check counts as a failure. A shader that will not
 * compile, an adapter that vanished when the tab was backgrounded, an
 * out-of-memory on a device with less than the buffer needs — all of them mean
 * the same thing to the caller, which is "use the CPU".
 */
export class VerifiedPath<T> {
  private verdict: Verdict | null = null;
  private checking: Promise<Verdict> | null = null;

  constructor(
    /** Runs the candidate implementation on the self-test input. */
    private candidate: (probe: T) => Promise<ArrayLike<number> | null>,
    /** Runs the reference implementation on the same input. */
    private reference: (probe: T) => ArrayLike<number>,
    /** The self-test input. Small — this is a correctness check, not a benchmark. */
    private probe: () => T,
    private tolerance = GPU_TOLERANCE,
  ) {}

  /** The verdict, once it exists. Null before the first check completes. */
  get result(): Verdict | null { return this.verdict; }

  async trusted(): Promise<boolean> {
    if (this.verdict) return this.verdict.trusted;
    if (!this.checking) this.checking = this.check();
    return (await this.checking).trusted;
  }

  private async check(): Promise<Verdict> {
    try {
      const input = this.probe();
      const got = await this.candidate(input);
      if (!got) {
        this.verdict = { trusted: false, maxDelta: Infinity, atByte: -1, reason: 'unavailable' };
        return this.verdict;
      }
      this.verdict = compare(got, this.reference(input), this.tolerance);
    } catch (e: any) {
      this.verdict = {
        trusted: false, maxDelta: Infinity, atByte: -1,
        reason: `threw during verification: ${String(e?.message ?? e).slice(0, 120)}`,
      };
    }
    return this.verdict;
  }

  /** Force a re-test. For a developer readout, not for the shutter. */
  reset(): void {
    this.verdict = null;
    this.checking = null;
  }
}
