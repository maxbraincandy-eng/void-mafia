/**
 * How many seats sit on each side of the table.
 *
 * WHY NOT A GRID PERIMETER
 * ────────────────────────
 * This used to pick the smallest grid whose perimeter could hold everyone and
 * then space the seats evenly around it. At ten players that is a 4×4 grid with
 * twelve cells and two to spare, and "evenly spaced" put both gaps on corners —
 * so the top row ran #1 #2 #3 and then stopped short, and the bottom row did the
 * same at the other end. A missing corner is the one gap a rectangle cannot
 * absorb: it reads as the layout having failed rather than as space.
 *
 * So the sides are counted directly instead. Ten becomes three across the top,
 * three across the bottom and two down each side — which is symmetric on both
 * axes, has no corner to miss, and is how ten people actually sit at a table.
 *
 * An odd count cannot be symmetric, and the extra seat goes to the bottom row:
 * the top of the screen is where the eye starts, so a ragged edge is less
 * noticeable at the far end.
 */
export function ringShape(n: number): { top: number; bottom: number; side: number } {
  /*
   * Few down the sides, because the screen is wide.
   *
   * The ring is only used on a landscape box — around 2:1 on a laptop — and a
   * seat on a side costs a whole row of height while a seat on an end costs a
   * fraction of the width. Ten players as three-and-three with two down each
   * side is four rows tall: it runs out of height with five hundred pixels of
   * width unused, the tiles come out small, and the stage left in the middle is
   * portrait, which is the wrong shape for the camera that goes in it.
   *
   * Four-and-four with one a side is three rows, fills the width, and leaves a
   * landscape stage. Past ten the ends would get too long, so a second row of
   * sides comes back.
   */
  const side = n <= 10 ? 1 : 2;
  const rest = Math.max(0, n - side * 2);
  const top = Math.floor(rest / 2);
  return { top, bottom: rest - top, side };
}
