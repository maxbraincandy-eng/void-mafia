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
export interface BucketSpec {
    /** Maximum tokens the bucket holds — the size of a permitted burst. */
    capacity: number;
    /** Tokens added per second. */
    refillPerSecond: number;
}
/** Per-action limits. Deliberately generous for play, tight for everything else. */
export declare const POKER_LIMITS: Record<string, BucketSpec>;
export declare class RateLimiter {
    private readonly specs;
    private readonly clock;
    private buckets;
    private lastSweep;
    constructor(specs?: Record<string, BucketSpec>, clock?: Clock);
    /**
     * Take one token. `true` means go ahead.
     *
     * An unknown action name is refused rather than allowed: a typo in a handler
     * should fail closed, not silently create an unlimited channel.
     */
    take(key: string, action: string, cost?: number): boolean;
    /** Seconds until the next token, for telling the client when to come back. */
    retryAfter(key: string, action: string): number;
    forget(key: string): void;
    /**
     * Drop buckets that have refilled to capacity — otherwise every profile that
     * ever sent a message stays in memory forever, which is a slow leak that only
     * shows up in production.
     */
    private sweep;
    /** Bucket count, for a leak assertion in tests. */
    get size(): number;
}
//# sourceMappingURL=rateLimit.d.ts.map