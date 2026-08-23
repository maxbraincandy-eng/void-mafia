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
import { systemClock } from './clock.js';
/** Per-action limits. Deliberately generous for play, tight for everything else. */
export const POKER_LIMITS = {
    action: { capacity: 12, refillPerSecond: 4 },
    chat: { capacity: 5, refillPerSecond: 0.5 },
    create: { capacity: 3, refillPerSecond: 0.05 },
    join: { capacity: 10, refillPerSecond: 0.5 },
    sit: { capacity: 8, refillPerSecond: 0.25 },
    list: { capacity: 10, refillPerSecond: 1 },
    resume: { capacity: 10, refillPerSecond: 0.5 },
};
export class RateLimiter {
    constructor(specs = POKER_LIMITS, clock = systemClock) {
        this.specs = specs;
        this.clock = clock;
        this.buckets = new Map();
        this.lastSweep = 0;
    }
    /**
     * Take one token. `true` means go ahead.
     *
     * An unknown action name is refused rather than allowed: a typo in a handler
     * should fail closed, not silently create an unlimited channel.
     */
    take(key, action, cost = 1) {
        const spec = this.specs[action];
        if (!spec)
            return false;
        const now = this.clock.now();
        this.sweep(now);
        const id = `${action}:${key}`;
        const bucket = this.buckets.get(id) ?? { tokens: spec.capacity, at: now };
        const elapsed = Math.max(0, now - bucket.at) / 1000;
        bucket.tokens = Math.min(spec.capacity, bucket.tokens + elapsed * spec.refillPerSecond);
        bucket.at = now;
        if (bucket.tokens < cost) {
            this.buckets.set(id, bucket);
            return false;
        }
        bucket.tokens -= cost;
        this.buckets.set(id, bucket);
        return true;
    }
    /** Seconds until the next token, for telling the client when to come back. */
    retryAfter(key, action) {
        const spec = this.specs[action];
        const bucket = this.buckets.get(`${action}:${key}`);
        if (!spec || !bucket || bucket.tokens >= 1)
            return 0;
        return Math.ceil((1 - bucket.tokens) / spec.refillPerSecond);
    }
    forget(key) {
        for (const id of this.buckets.keys())
            if (id.endsWith(`:${key}`))
                this.buckets.delete(id);
    }
    /**
     * Drop buckets that have refilled to capacity — otherwise every profile that
     * ever sent a message stays in memory forever, which is a slow leak that only
     * shows up in production.
     */
    sweep(now) {
        if (now - this.lastSweep < 60000)
            return;
        this.lastSweep = now;
        for (const [id, bucket] of this.buckets) {
            const action = id.slice(0, id.indexOf(':'));
            const spec = this.specs[action];
            if (!spec) {
                this.buckets.delete(id);
                continue;
            }
            const full = bucket.tokens + ((now - bucket.at) / 1000) * spec.refillPerSecond >= spec.capacity;
            if (full)
                this.buckets.delete(id);
        }
    }
    /** Bucket count, for a leak assertion in tests. */
    get size() { return this.buckets.size; }
}
//# sourceMappingURL=rateLimit.js.map