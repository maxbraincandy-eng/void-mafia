/**
 * Cutting an image into strips, and putting it back.
 *
 * WHY THIS IS ITS OWN FILE WITH ITS OWN TESTS
 * ───────────────────────────────────────────
 * Parallelising an image filter is easy to do and easy to do wrong, and the
 * wrong version does not crash — it produces faint horizontal lines where the
 * strips met, which look like a sensor fault and get blamed on the camera.
 *
 * The failure has one cause: a filter reads pixels its output does not cover.
 * The merge samples each frame at an alignment offset, so an output row near
 * the top of a strip needs source rows above that strip. Hand a worker only the
 * rows it must produce and it silently clamps at the boundary instead, which is
 * exactly where the seam comes from.
 *
 * So a strip carries a halo: extra rows above and below that the worker may
 * read but must not return. The arithmetic for that is fiddly enough to be
 * worth stating once, in functions small enough to check, rather than inline in
 * three places where two of them will drift.
 */

import type { Pixels } from './photoPipeline';

export interface Strip {
  /** Rows this strip is responsible for producing. */
  y0: number;
  y1: number;
  /** Rows it is allowed to read, including the halo. */
  readY0: number;
  readY1: number;
}

/**
 * Divide `height` rows across `count` workers, each with `halo` rows of
 * overlap to read from.
 *
 * Strips are contiguous and exactly cover the image: every row is produced by
 * exactly one worker. That is the property the seam depends on, and it is
 * asserted rather than assumed.
 */
export function strips(height: number, count: number, halo: number): Strip[] {
  const n = Math.max(1, Math.min(count, height));
  const out: Strip[] = [];
  for (let i = 0; i < n; i++) {
    // Rounded this way so the boundaries of adjacent strips agree exactly and
    // no row is produced twice or missed.
    const y0 = Math.floor((i * height) / n);
    const y1 = Math.floor(((i + 1) * height) / n);
    if (y1 <= y0) continue;
    out.push({
      y0, y1,
      readY0: Math.max(0, y0 - halo),
      readY1: Math.min(height, y1 + halo),
    });
  }
  return out;
}

/** The rows `[y0, y1)` of an image, as an image in their own right. */
export function sliceRows(img: Pixels, y0: number, y1: number): Pixels {
  const a = Math.max(0, Math.min(img.height, y0));
  const b = Math.max(a, Math.min(img.height, y1));
  const rows = b - a;
  const stride = img.width * 4;
  const data = new Uint8ClampedArray(rows * stride);
  data.set(img.data.subarray(a * stride, b * stride));
  return { data, width: img.width, height: rows };
}

/**
 * Reassemble strips into one image.
 *
 * Each piece carries the rows it was responsible for, in order. A gap or an
 * overlap here would be the seam this whole file exists to avoid, so the total
 * is checked against the expected height rather than trusted.
 */
export function stitch(pieces: { y0: number; y1: number; data: Uint8ClampedArray }[], width: number, height: number): Pixels {
  const stride = width * 4;
  const out = new Uint8ClampedArray(width * height * 4);
  let covered = 0;
  for (const p of pieces) {
    const rows = p.y1 - p.y0;
    if (rows <= 0) continue;
    out.set(p.data.subarray(0, rows * stride), p.y0 * stride);
    covered += rows;
  }
  if (covered !== height) {
    throw new Error(`stitch: covered ${covered} of ${height} rows — the strips do not tile`);
  }
  return { data: out, width, height };
}
