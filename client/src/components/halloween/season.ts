/**
 * Is it Halloween on the street? October and 1–3 November, Tbilisi time.
 *
 * Its own module so the games hub can ask without loading the game. The server
 * decides for real (trickOrTreatRules.isSeason); this only hides the tile.
 */
export function isHalloweenSeason(now: number = Date.now()): boolean {
  const d = new Date(now + 4 * 3600_000);
  const m = d.getUTCMonth() + 1;
  return m === 10 || (m === 11 && d.getUTCDate() <= 3);
}
