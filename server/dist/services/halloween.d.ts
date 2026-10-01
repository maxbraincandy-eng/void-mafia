export declare function isMafiaHalloween(now?: number): boolean;
/**
 * The werewolf's night. Night k is played while room.day === k, so this is the
 * second night, the fourth, and so on: never the first, which would let a
 * werewolf strike before the town has had a single day.
 */
export declare function isFullMoon(day: number): boolean;
/** The frame everyone who finishes a classic Mafia game this Halloween keeps. */
export declare const HALLOWEEN_FRAME_ID = "frame_halloween_2026";
//# sourceMappingURL=halloween.d.ts.map