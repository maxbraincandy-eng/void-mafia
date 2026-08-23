/**
 * Rate limiting, as a token bucket per key per action.
 *
 * WHY A BUCKET AND NOT A COOLDOWN
 * ───────────────────────────────
 * A fixed cooldown is wrong for poker. A player facing a raise legitimately
 * fires several messages in a second — call, then a chat message, then a
 * reconnect — and a cooldown either blocks that or is set so loose it stops
 * nothing. A bucket lets a burst through and then throttles, which is the shape
 * of real use and the shape a flood is not.
 *
 * Keyed by profile id, not by socket: reconnecting is exactly what a flooder
 * would do to reset a limit, and identity survives a reconnect where a socket
 * id does not.
 */

import type { Clock } from './clock.js';
import { systemClock } from './clock.js';

export interface BucketSpec {
  /** Maximum tokens the bucket holds — the size of a permitted burst. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
}

/** Per-action limits. Deliberately generous for play, tight for everything else. */
export const POKER_LIMITS: Record<string, BucketSpec> = {
  action: { capacity: 12, refillPerSecond: 4 },
  chat: { capacity: 5, refillPerSecond: 0.5 },
  create: { capacity: 3, refillPerSecond: 0.05 },
  join: { capacity: 10, refillPerSecond: 0.5 },
  sit: { capacity: 8, refillPerSecond: 0.25 },
  list: { capacity: 10, refillPerSecond: 1 },
  resume: { capacity: 10, refillPerSecond: 0.5 },
};

interface Bucket { tokens: number; at: number }

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  constructor(
    private readonly specs: Record<string, BucketSpec> = POKER_LIMITS,
    private readonly clock: Clock = systemClock,
  ) {}

  /**
   * Take one token. `true` means go ahead.
   *
   * An unknown action name is refused rather than allowed: a typo in a handler
   * should fail closed, not silently create an unlimited channel.
   */
  take(key: string, action: string, cost = 1): boolean {
    const spec = this.specs[action];
    if (!spec) return false;

    const now = this.clock.now();
    this.sweep(now);

    const id = `${action}:${key}`;
    const bucket = this.buckets.get(id) ?? { tokens: spec.capacity, at: now };
    const elapsed = Math.max(0, now - bucket.at) / 1000;
    bucket.tokens = Math.min(spec.capacity, bucket.tokens + elapsed * spec.refillPerSecond);
    bucket.at = now;

    if (bucket.tokens < cost) { this.buckets.set(id, bucket); return false; }
    bucket.tokens -= cost;
    this.buckets.set(id, bucket);
    return true;
  }

  /** Seconds until the next token, for telling the client when to come back. */
  retryAfter(key: string, action: string): number {
    const spec = this.specs[action];
    const bucket = this.buckets.get(`${action}:${key}`);
    if (!spec || !bucket || bucket.tokens >= 1) return 0;
    return Math.ceil((1 - bucket.tokens) / spec.refillPerSecond);
  }

  forget(key: string): void {
    for (const id of this.buckets.keys()) if (id.endsWith(`:${key}`)) this.buckets.delete(id);
  }

  /**
   * Drop buckets that have refilled to capacity — otherwise every profile that
   * ever sent a message stays in memory forever, which is a slow leak that only
   * shows up in production.
   */
  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [id, bucket] of this.buckets) {
      const action = id.slice(0, id.indexOf(':'));
      const spec = this.specs[action];
      if (!spec) { this.buckets.delete(id); continue; }
      const full = bucket.tokens + ((now - bucket.at) / 1000) * spec.refillPerSecond >= spec.capacity;
      if (full) this.buckets.delete(id);
    }
  }

  /** Bucket count, for a leak assertion in tests. */
  get size(): number { return this.buckets.size; }
}
