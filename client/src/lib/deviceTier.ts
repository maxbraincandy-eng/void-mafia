/**
 * What this phone can afford.
 *
 * WHY THE CAMERA HAS TO ASK
 * ─────────────────────────
 * Every quality ceiling in this pipeline so far was a compute decision, not an
 * algorithmic one: five frames instead of sixteen, reconstruction on the zoom
 * crop instead of the whole frame. Those numbers were picked so that the
 * slowest plausible phone would not sit frozen for half a minute.
 *
 * Picking one number for every device means a flagship does a fraction of what
 * it could and a budget phone still struggles. So the camera asks first, and
 * the answer decides how much evidence it is worth collecting.
 *
 * WHAT IT ASKS, AND WHAT IT DOES NOT
 * ──────────────────────────────────
 * Core count and memory, both of which browsers report. Not a user-agent
 * string: the list of device names is endless, wrong within a year, and lies
 * whenever anybody sets a custom one. Two numbers that describe the actual
 * machine beat a name that describes a marketing decision.
 *
 * Both are deliberately coarse. `hardwareConcurrency` is capped by some
 * browsers for fingerprinting reasons and `deviceMemory` is rounded to a power
 * of two — which is fine, because the decision this feeds is "four frames or
 * twelve", not a scheduling problem.
 */

export type Tier = 'ultra' | 'high' | 'medium' | 'low';

export interface Capability {
  tier: Tier;
  /** Workers to run the parallel stages across. Never more than the cores. */
  workers: number;
  /** Frames to collect for a merged shot. */
  frames: number;
  /** Milliseconds the burst may spend being captured. */
  burstBudgetMs: number;
  /** Reconstruct the zoom crop onto a finer grid. */
  superResolve: boolean;
  /** Megapixels above which a photo is processed at reduced resolution. */
  maxMegapixels: number;
}

const PROFILES: Record<Tier, Omit<Capability, 'tier' | 'workers'>> = {
  /*
   * Enough cores to make sixteen frames cost about what five used to. This is
   * the tier where the pipeline finally gets to do what it was designed to do.
   */
  ultra: { frames: 14, burstBudgetMs: 3200, superResolve: true, maxMegapixels: 16 },
  high: { frames: 10, burstBudgetMs: 2800, superResolve: true, maxMegapixels: 14 },
  medium: { frames: 6, burstBudgetMs: 2200, superResolve: true, maxMegapixels: 12 },
  /*
   * Still multi-frame — the merge is where most of the quality is and it is
   * worth having even here — but no reconstruction, which is the expensive
   * stage, and a lower ceiling on what gets processed at full size.
   */
  low: { frames: 3, burstBudgetMs: 1600, superResolve: false, maxMegapixels: 8 },
};

function coreCount(): number {
  const n = Number((navigator as any).hardwareConcurrency);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 4;
}

function memoryGb(): number {
  // Absent on Safari and Firefox. Absence is not "small" — assuming the worst
  // would put every iPhone on the lowest tier, which is plainly wrong.
  const g = Number((navigator as any).deviceMemory);
  return Number.isFinite(g) && g > 0 ? g : 4;
}

export function tierFor(cores: number, gb: number): Tier {
  if (cores >= 8 && gb >= 8) return 'ultra';
  if (cores >= 6 && gb >= 4) return 'high';
  if (cores >= 4) return 'medium';
  return 'low';
}

export function capability(): Capability {
  const cores = coreCount();
  const tier = tierFor(cores, memoryGb());
  return {
    tier,
    /*
     * One core is left alone. The main thread still has to paint a viewfinder
     * and answer taps while this runs, and saturating every core makes the
     * interface stutter — which reads as a slower camera even when the photo
     * arrives sooner.
     */
    workers: Math.max(1, Math.min(cores - 1, 8)),
    ...PROFILES[tier],
  };
}
