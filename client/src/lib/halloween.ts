/**
 * Halloween in classic Mafia: 1 October to 1 November inclusive, Tbilisi time.
 *
 * Decides the decoration and whether the vampire is offered. The server keeps
 * its own copy for dealing roles (server/src/services/halloween.ts); keep the
 * two dates in step.
 */
export function isMafiaHalloween(now: number = Date.now()): boolean {
  const d = new Date(now + 4 * 3600_000);
  const month = d.getUTCMonth() + 1;
  return month === 10 || (month === 11 && d.getUTCDate() === 1);
}
