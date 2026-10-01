/**
 * Halloween in classic Mafia: 1 October to 1 November inclusive, Tbilisi time.
 *
 * One switch for the server side of it — today, whether the vampire can be
 * dealt. The client has its own copy of the dates for the decoration
 * (client/src/lib/halloween.ts); keep the two in step.
 */
const TBILISI_OFFSET_MS = 4 * 3600_000;

export function isMafiaHalloween(now: number = Date.now()): boolean {
  const d = new Date(now + TBILISI_OFFSET_MS);
  const month = d.getUTCMonth() + 1;
  return month === 10 || (month === 11 && d.getUTCDate() === 1);
}

/**
 * The werewolf's night. Night k is played while room.day === k, so this is the
 * second night, the fourth, and so on: never the first, which would let a
 * werewolf strike before the town has had a single day.
 */
export function isFullMoon(day: number): boolean {
  return day >= 2 && day % 2 === 0;
}

/** The frame everyone who finishes a classic Mafia game this Halloween keeps. */
export const HALLOWEEN_FRAME_ID = 'frame_halloween_2026';
