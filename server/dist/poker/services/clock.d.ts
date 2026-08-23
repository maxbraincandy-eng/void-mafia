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
export interface Clock {
    now(): number;
    setTimeout(fn: () => void, ms: number): TimerHandle;
    clearTimeout(handle: TimerHandle): void;
}
export type TimerHandle = {
    readonly id: number;
};
export declare const systemClock: Clock;
/**
 * A clock that only moves when a test moves it.
 *
 * `advance` fires every timer whose deadline has passed, in deadline order, and
 * keeps going while callbacks schedule more timers — so a chain of "hand ends →
 * pause → next hand deals → action clock starts" plays out in one call, exactly
 * as it would in real time, without any real time passing.
 */
export declare class ManualClock implements Clock {
    private current;
    private nextId;
    private timers;
    constructor(startAt?: number);
    now(): number;
    setTimeout(fn: () => void, ms: number): TimerHandle;
    clearTimeout(handle: TimerHandle): void;
    /** Move time forward, firing everything that comes due on the way. */
    advance(ms: number): void;
    /** How many timers are outstanding — a leak check for tests. */
    get pending(): number;
}
//# sourceMappingURL=clock.d.ts.map