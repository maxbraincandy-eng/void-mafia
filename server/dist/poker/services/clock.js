/**
 * Time, as a dependency.
 *
 * The table service is mostly timers: an action clock, a disconnect grace
 * period, a pause between hands. Timers are the part of a game server that is
 * hardest to trust, because the bugs in them only appear at a particular moment
 * and a test that uses real time either sleeps (slow, flaky) or does not test
 * them at all.
 *
 * So time is injected. Production passes `systemClock`; tests pass a
 * `ManualClock` and advance it by exact milliseconds, which makes "the player
 * folds one millisecond after the clock runs out, not one before" an assertion
 * rather than a hope.
 */
export const systemClock = {
    now: () => Date.now(),
    setTimeout(fn, ms) {
        const timer = setTimeout(fn, ms);
        // Node timers are objects; wrap them so the interface stays numeric-ish and
        // the test clock can implement the same shape without lying about types.
        return { id: 0, timer };
    },
    clearTimeout(handle) {
        const timer = handle.timer;
        if (timer)
            clearTimeout(timer);
    },
};
/**
 * A clock that only moves when a test moves it.
 *
 * `advance` fires every timer whose deadline has passed, in deadline order, and
 * keeps going while callbacks schedule more timers — so a chain of "hand ends →
 * pause → next hand deals → action clock starts" plays out in one call, exactly
 * as it would in real time, without any real time passing.
 */
export class ManualClock {
    constructor(startAt = 1700000000000) {
        this.nextId = 1;
        this.timers = new Map();
        this.current = startAt;
    }
    now() { return this.current; }
    setTimeout(fn, ms) {
        const id = this.nextId++;
        this.timers.set(id, { at: this.current + Math.max(0, ms), fn });
        return { id };
    }
    clearTimeout(handle) { this.timers.delete(handle.id); }
    /** Move time forward, firing everything that comes due on the way. */
    advance(ms) {
        const target = this.current + ms;
        for (;;) {
            const due = [...this.timers.entries()]
                .filter(([, t]) => t.at <= target)
                .sort((a, b) => a[1].at - b[1].at);
            const next = due[0];
            if (!next)
                break;
            const [id, timer] = next;
            this.timers.delete(id);
            this.current = Math.max(this.current, timer.at);
            timer.fn();
        }
        this.current = target;
    }
    /** How many timers are outstanding — a leak check for tests. */
    get pending() { return this.timers.size; }
}
//# sourceMappingURL=clock.js.map