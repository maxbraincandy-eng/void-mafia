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
 * So the sides are counted directly instead. Ten becomes four across the top,
 * four across the bottom and one down each side — no corner to miss, and how ten
 * people actually sit at a table.
 *
 * WHY THE SHAPE IS NOT A CONSTANT
 * ───────────────────────────────
 * The counts used to be a fixed rule — one seat down each side up to ten, two
 * above — chosen for a laptop, where the box is about 2:1 and the tiles are the
 * 16:9 of a webcam. A phone is neither: the box is taller than it is wide, and
 * putting four landscape tiles across 340 points leaves each one 79 by 44, which
 * is a letterbox slit rather than a face.
 *
 * The rule that produced those numbers was really "make the board the shape of
 * the box", so that is what is written here now. The side count that gets the
 * board's aspect closest to the space it has to fill wins, and the laptop
 * numbers fall out of it unchanged — the defaults are that laptop. Distance is
 * measured in logs because aspect ratios are ratios: 2:1 is as far from 4:1 as
 * it is from 1:1, and subtraction disagrees.
 */

/**
 * One seat's frame, given the room and how many rows and columns of them there
 * are.
 *
 * WHY EVERY TILE GETS THE SAME NUMBERS
 * ────────────────────────────────────
 * A table where the tiles are different shapes reads as broken no matter which
 * shape is right, and the layout this replaced produced exactly that: the grid
 * divided whatever height was left by however many rows there were, so twelve
 * players on a phone came out 190 by 80 and the shape changed every time
 * somebody died. With the video cropped to fill, that is a horizontal slice of a
 * face.
 *
 * WHY THE SHAPE IS NOT 16:9 EVERYWHERE
 * ────────────────────────────────────
 * On a laptop it is: that is what the webcam produces, and there is room for it.
 * On a phone there is no natural shape to match — half the table is on a laptop
 * and half is holding a phone upright, so the sources disagree and the video is
 * cropped to fill either way. What is left to honour is the screen, so the frame
 * takes the shape that uses both axes. Four across a 366-point stage go from
 * 87×49 to 87×151: the difference between a strip of a face and a face.
 *
 * The band is what keeps "use both axes" from becoming a ribbon. Anywhere from
 * 1:2 to 2:1 still reads as a camera looking at somebody; past that, a face
 * cropped to fill is a slice of a face.
 */
const MAX_STRETCH = 2;

export function fitTile(o: {
  availW: number; availH: number; cols: number; rows: number; gap: number;
  /**
   * `webcam` keeps the 16:9 the camera produces. `fill` takes the shape that
   * uses both axes, inside MAX_STRETCH.
   */
  mode: 'webcam' | 'fill';
}): { w: number; h: number } {
  const wBudget = (o.availW - o.gap * (o.cols - 1)) / o.cols;
  const hBudget = (o.availH - o.gap * (o.rows - 1)) / o.rows;
  if (o.mode === 'webcam') {
    const w = Math.max(1, Math.min(wBudget, hBudget * (16 / 9)));
    return { w, h: w * (9 / 16) };
  }
  const w = Math.max(1, Math.min(wBudget, hBudget * MAX_STRETCH));
  return { w, h: Math.max(1, Math.min(hBudget, w * MAX_STRETCH)) };
}

export interface RingBox {
  /** Width ÷ height of the space the ring has to fill. */
  boxAspect: number;
  /** Width ÷ height of one seat tile. */
  tileAspect: number;
}

/** A laptop: a roughly 2:1 stage holding the 16:9 of a webcam. */
const DESKTOP: RingBox = { boxAspect: 2, tileAspect: 16 / 9 };

/**
 * The stage sits between the two side columns and takes what they leave, so a
 * board narrower than three tiles has no middle at all. That is the real floor
 * under the eight-seat minimum for using a ring — not taste.
 */
const MIN_ACROSS = 3;

export function ringShape(n: number, box: RingBox = DESKTOP): { top: number; bottom: number; side: number } {
  /*
   * An odd count cannot be symmetric, and the extra seat goes to the bottom
   * row: the top of the screen is where the eye starts, so a ragged edge is
   * less noticeable at the far end.
   */
  const split = (side: number) => {
    const rest = Math.max(0, n - side * 2);
    const top = Math.floor(rest / 2);
    return { top, bottom: rest - top, side };
  };

  /* side ≤ (n − 5) / 2 keeps the longer end at three or more. */
  const maxSide = Math.max(1, Math.floor((n - MIN_ACROSS * 2 + 1) / 2));

  let best = split(1);
  let bestCost = Infinity;
  for (let side = 1; side <= maxSide; side++) {
    const s = split(side);
    const across = Math.max(s.top, s.bottom);
    if (across < MIN_ACROSS) continue;
    // The board is `across` tiles wide and `side + 2` rows tall — the two ends
    // plus however many seats stack down a side.
    const aspect = (across * box.tileAspect) / (s.side + 2);
    const cost = Math.abs(Math.log(aspect / box.boxAspect));
    if (cost < bestCost) { bestCost = cost; best = s; }
  }
  return best;
}
