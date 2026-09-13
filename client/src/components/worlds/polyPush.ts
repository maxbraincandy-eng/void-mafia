/**
 * Keeping a walker out of a shape that is not a circle.
 *
 * A building in `ძველი თბილისი` is a real OSM footprint — a terrace forty
 * metres long and eight deep, an L around a courtyard, a wedge on a corner.
 * The engine's collider was a disc, and a disc that encloses a terrace reaches
 * halfway across the lane beside it, so it was shrunk to 62% of the enclosing
 * radius as a compromise. The compromise is why you could walk in through the
 * front of almost any building: everything outside that disc but inside the
 * walls was open ground as far as the engine was concerned.
 *
 * So the disc stays as the broad phase — nothing outside it can be touching —
 * and this resolves the rest against the outline itself.
 */

export interface Pt { x: number; z: number; }

/**
 * Is the point inside the ring?
 *
 * Crossing number on a ray going +x. Winding is irrelevant, which matters
 * because the packed footprints are not consistently wound.
 */
export function insidePoly(px: number, pz: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
    const a = poly[i]!, b = poly[k]!;
    if ((a.z > pz) !== (b.z > pz) &&
        px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Nearest point on the ring's boundary, and how far off it is. */
export function nearestOnPoly(px: number, pz: number, poly: Pt[]): { x: number; z: number; d: number } {
  let bx = poly[0]!.x, bz = poly[0]!.z, bd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    // A footprint can carry a repeated point; skip rather than divide by zero.
    const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / len2));
    const qx = a.x + dx * t, qz = a.z + dz * t;
    const d = Math.hypot(px - qx, pz - qz);
    if (d < bd) { bd = d; bx = qx; bz = qz; }
  }
  return { x: bx, z: bz, d: bd };
}

/**
 * The smallest move that puts the point `pad` clear of the outline, or null if
 * it is already clear.
 *
 * Pushing to the NEAREST edge rather than away from the centroid is what lets
 * a walker slide along a wall: on a long terrace the centroid is tens of
 * metres away and pushing from it shoves you down the street.
 */
export function polyPush(px: number, pz: number, poly: Pt[], pad: number): { dx: number; dz: number } | null {
  if (poly.length < 3) return null;
  if (!insidePoly(px, pz, poly) && nearestOnPoly(px, pz, poly).d >= pad) return null;

  /*
   * Every wall is offered as a way out, and the shortest one that works wins.
   *
   * Simply stepping to the nearest point on the boundary is wrong on a
   * concave plan, and Old Town is nothing but concave plans. On a footprint
   * with a notch in it the nearest boundary point is often the notch's REFLEX
   * VERTEX: stepping to that vertex and a third of a metre further does not
   * leave the building, it crosses the neck of the notch and arrives inside
   * the other lobe. Measured on the committed extract, a walker standing at
   * −394.7, 14.8 came out at −391.7, 14.0 — still indoors.
   *
   * So a candidate is generated per EDGE, offset along that edge's own
   * normal, and checked. A vertex has no normal; a wall does.
   */
  let best: { dx: number; dz: number } | null = null, bestD2 = Infinity;
  let loose: { dx: number; dz: number } | null = null, looseD2 = Infinity;

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const ex = b.x - a.x, ez = b.z - a.z;
    const len2 = ex * ex + ez * ez;
    if (len2 < 1e-9) continue;                      // a repeated point is not a wall
    const t = Math.max(0, Math.min(1, ((px - a.x) * ex + (pz - a.z) * ez) / len2));
    const qx = a.x + ex * t, qz = a.z + ez * t;
    const len = Math.sqrt(len2);
    const nx = -ez / len, nz = ex / len;

    // Both perpendiculars: which one is outward depends on the winding, and
    // the packed footprints are not consistently wound.
    for (const s of [1, -1]) {
      const cx = qx + nx * s * pad, cz = qz + nz * s * pad;
      if (insidePoly(cx, cz, poly)) continue;
      const d2 = (cx - px) ** 2 + (cz - pz) ** 2;
      // Preferred: genuinely `pad` clear of the whole outline, not just of
      // this one wall — inside a notch narrower than two pads there is no
      // such point, and then merely being outdoors will do.
      if (nearestOnPoly(cx, cz, poly).d >= pad - 1e-6) {
        if (d2 < bestD2) { bestD2 = d2; best = { dx: cx - px, dz: cz - pz }; }
      } else if (d2 < looseD2) {
        looseD2 = d2; loose = { dx: cx - px, dz: cz - pz };
      }
    }
  }
  if (best) return best;
  if (loose) return loose;

  /*
   * Nothing worked: a degenerate ring with no usable edge. Fall back to the
   * nearest boundary point so the walker is at least moved, rather than
   * silently left standing in a wall.
   */
  const n = nearestOnPoly(px, pz, poly);
  if (n.d < 1e-6) return null;
  const ux = (n.x - px) / n.d, uz = (n.z - pz) / n.d;
  return { dx: ux * (n.d + pad), dz: uz * (n.d + pad) };
}

/** What the mover needs to know about an obstacle. */
export interface PushCollider { x: number; z: number; r: number; h?: number; poly?: Pt[]; }

/**
 * Move a point by (sx, sz) and resolve it out of everything it hits.
 *
 * Exported rather than left inline in the engine so the tests exercise the
 * code that actually runs. A test that restates the mover agrees with its own
 * restatement, which is the same as not testing it.
 *
 * One axis at a time, each resolved before the next, because that is what
 * turns a walk into a wall into a slide along it — resolving the whole vector
 * at once sticks you to the wall instead. Only the component for the axis just
 * moved is taken from each push.
 */
export function moveResolved(
  pos: { x: number; z: number },
  sx: number, sz: number,
  colliders: PushCollider[],
  pad: number,
  skip?: (c: PushCollider) => boolean,
): void {
  const resolve = (axis: 'x' | 'z') => {
    for (const c of colliders) {
      if (skip?.(c)) continue;
      const dx = pos.x - c.x, dz = pos.z - c.z, min = c.r + pad;
      if (dx > min || dx < -min || dz > min || dz < -min) continue;
      if (c.poly) {
        const push = polyPush(pos.x, pos.z, c.poly, pad);
        if (!push) continue;
        if (axis === 'x') pos.x += push.dx; else pos.z += push.dz;
        continue;
      }
      const d = Math.hypot(dx, dz);
      if (d >= min || d <= 0.0001) continue;
      if (axis === 'x') pos.x = c.x + dx / d * min; else pos.z = c.z + dz / d * min;
    }
  };

  /*
   * Where the walker stood before the step, and whether that was legal.
   *
   * Needed for the last resort below. If the walker was already inside
   * something — dropped there by a spawn or a teleport — refusing to move
   * would trap them there permanently, so the revert only applies when there
   * was a good position to go back to.
   */
  const fromX = pos.x, fromZ = pos.z;
  const startedClear = !insideAny(pos.x, pos.z, colliders, skip);

  pos.x += sx; resolve('x');
  pos.z += sz; resolve('z');
  /*
   * There is deliberately no third pass resolving both axes at once.
   *
   * One was written, to mop up the few centimetres an axis-wise resolve can
   * leave at a corner, and it was iterated to a fixed point because Old Town's
   * buildings touch and one round shoved the walker out of a terrace and into
   * its neighbour. Then it was measured over fifty-nine thousand steps walking
   * into real buildings: it took the steps that end with the walker stopped
   * dead from 5.93% to 6.47%. It was making the wedges it was meant to fix.
   */

  /*
   * Last resort: if the walker is still in a wall, do not take the step.
   *
   * Old Town's buildings touch, and where two of them meet there is a seam
   * with no point that is a third of a metre clear of both. A walker driven
   * into one is pushed out of the first building and into the second, out of
   * that and back into the first, and the loop above runs out of rounds with
   * them 8 cm inside. There is no position to resolve to, so the honest
   * answer is that the step does not happen: you stop at the wall.
   */
  if (startedClear && insideAny(pos.x, pos.z, colliders, skip)) {
    pos.x = fromX; pos.z = fromZ;
  }
}

/** Is this point inside any collider's outline? */
function insideAny(
  x: number, z: number, colliders: PushCollider[], skip?: (c: PushCollider) => boolean,
): boolean {
  for (const c of colliders) {
    if (skip?.(c)) continue;
    const dx = x - c.x, dz = z - c.z;
    if (dx > c.r || dx < -c.r || dz > c.r || dz < -c.r) continue;
    if (c.poly ? insidePoly(x, z, c.poly) : Math.hypot(dx, dz) < c.r) return true;
  }
  return false;
}
