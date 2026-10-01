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
