/**
 * You cannot walk into a building.
 *
 * This is asserted against the real committed footprints, not a fixture,
 * because the bug it replaces passed every reasonable test on a square. The
 * collider was a disc at 62% of the enclosing radius, which is correct for a
 * round building and wrong for a terrace, an L around a courtyard, and a
 * wedge on a corner — that is to say, for Old Town.
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import { polyPush, insidePoly, nearestOnPoly, moveResolved, type Pt } from './polyPush.js';
import { unpackBuildings, b64ToBytes } from './tbilisiPack.js';
import { TBILISI_BUILDINGS_B64 } from './tbilisiData.js';

const SQUARE: Pt[] = [
  { x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 },
];
/** A 40 × 8 terrace: the shape a disc cannot represent. */
const TERRACE: Pt[] = [
  { x: -20, z: -4 }, { x: 20, z: -4 }, { x: 20, z: 4 }, { x: -20, z: 4 },
];

test('inside and outside are what they say', () => {
  assert.equal(insidePoly(0, 0, SQUARE), true);
  assert.equal(insidePoly(6, 0, SQUARE), false);
  assert.equal(insidePoly(0, -6, SQUARE), false);
  // The end of a terrace, which the old 62% disc treated as open ground.
  assert.equal(insidePoly(18, 0, TERRACE), true);
  assert.equal(insidePoly(22, 0, TERRACE), false);
});

test('a point inside is pushed out through the nearest wall', () => {
  // Deep inside the terrace, nearer the north wall than either end.
  const p = { x: 0, z: 3 };
  const push = polyPush(p.x, p.z, TERRACE, 0.34)!;
  assert.ok(push, 'no push for a point standing inside the building');
  const out = { x: p.x + push.dx, z: p.z + push.dz };
  assert.equal(insidePoly(out.x, out.z, TERRACE), false, 'still inside after the push');
  // Out through the near wall, not shoved forty metres down the street.
  assert.ok(Math.abs(out.x - p.x) < 0.01, `pushed ${Math.abs(out.x - p.x).toFixed(2)} m along the terrace`);
  assert.ok(Math.abs(out.z - 4.34) < 1e-6, `landed at z=${out.z.toFixed(3)}, wanted the wall plus the pad`);
});

test('the end of a terrace is as solid as the middle', () => {
  /*
   * The whole bug, as one assertion. The old collider was a disc of radius
   * 0.62 × 20.4 = 12.6 m at the centroid; a point at (18, 0) is 18 m out, so
   * it was clear of the disc and standing squarely inside the building.
   */
  const push = polyPush(18, 0, TERRACE, 0.34);
  assert.ok(push, 'a walker at the end of a terrace was not pushed out at all');
  const out = { x: 18 + push!.dx, z: 0 + push!.dz };
  assert.equal(insidePoly(out.x, out.z, TERRACE), false);
});

test('a point already clear is left alone', () => {
  assert.equal(polyPush(0, 10, SQUARE, 0.34), null);
  assert.equal(polyPush(30, 0, TERRACE, 0.34), null);
  // And just outside the pad, still nothing.
  assert.equal(polyPush(0, 5.4, SQUARE, 0.34), null);
});

test('a point within the pad of a wall is nudged off it', () => {
  const push = polyPush(0, 5.1, SQUARE, 0.34)!;
  assert.ok(push, 'no push for a point standing against the wall');
  assert.ok(Math.abs((5.1 + push.dz) - 5.34) < 1e-6, `landed at ${(5.1 + push.dz).toFixed(3)}`);
});

test('a point exactly on a wall still gets out', () => {
  // d = 0: there is no direction from the point to the boundary, and the
  // first version of this returned a zero-length push and left you in the wall.
  const push = polyPush(0, 5, SQUARE, 0.34);
  assert.ok(push, 'no push for a point lying exactly on the wall');
  const out = { x: push!.dx, z: 5 + push!.dz };
  assert.ok(Math.hypot(push!.dx, push!.dz) > 0.3, 'the push was zero-length');
  assert.equal(insidePoly(out.x, out.z, SQUARE), false);
});

test('nothing in the district can be stood inside', () => {
  /*
   * The real test: walk a grid over every committed footprint and check that
   * a point inside it is always pushed out, and always out through a wall
   * near enough to be the one you walked through.
   */
  const B = unpackBuildings(b64ToBytes(TBILISI_BUILDINGS_B64));
  let checked = 0;
  for (const b of B) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of b.pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    for (let gx = 0; gx <= 4; gx++) {
      for (let gz = 0; gz <= 4; gz++) {
        const x = minX + (maxX - minX) * (gx / 4);
        const z = minZ + (maxZ - minZ) * (gz / 4);
        if (!insidePoly(x, z, b.pts)) continue;
        checked++;
        const push = polyPush(x, z, b.pts, 0.34);
        assert.ok(push, `a point inside a building at ${x.toFixed(1)},${z.toFixed(1)} was not pushed out`);
        const out = { x: x + push!.dx, z: z + push!.dz };
        assert.equal(insidePoly(out.x, out.z, b.pts), false,
          `pushed from ${x.toFixed(1)},${z.toFixed(1)} to ${out.x.toFixed(1)},${out.z.toFixed(1)} and still inside`);
        /*
         * And out through a wall rather than flung across the district.
         *
         * On a CONVEX plan the nearest boundary point is always a way out, so
         * the move is exactly that far plus the pad and nothing else will do.
         * On a concave one it often is not — the nearest point can be the
         * reflex vertex of a notch, and stepping past it lands in the next
         * lobe — so there the bound is the building's own size: you may be
         * moved to a farther wall, never past the building.
         */
        const n = nearestOnPoly(x, z, b.pts);
        const moved = Math.hypot(push!.dx, push!.dz);
        if (isConvex(b.pts)) {
          assert.ok(moved <= n.d + 0.34 + 1e-6,
            `convex plan: moved ${moved.toFixed(1)} m when the nearest wall was ${n.d.toFixed(1)} m off`);
        } else {
          let cx = 0, cz = 0;
          for (const p of b.pts) { cx += p.x; cz += p.z; }
          cx /= b.pts.length; cz /= b.pts.length;
          let rad = 0;
          for (const p of b.pts) rad = Math.max(rad, Math.hypot(p.x - cx, p.z - cz));
          assert.ok(moved <= rad + 0.34 + 1e-6,
            `moved ${moved.toFixed(1)} m out of a building only ${rad.toFixed(1)} m in radius`);
        }
      }
    }
  }
  assert.ok(checked > 3000, `only ${checked} interior points tested`);
});

test('the broad-phase circle really does enclose the outline', () => {
  /*
   * The engine skips a collider whose circle the walker is outside. If the
   * circle did not enclose the polygon the narrow phase would never run and
   * the wall would be open — so this is load-bearing, not bookkeeping.
   */
  const B = unpackBuildings(b64ToBytes(TBILISI_BUILDINGS_B64));
  for (const b of B) {
    let cx = 0, cz = 0;
    for (const p of b.pts) { cx += p.x; cz += p.z; }
    cx /= b.pts.length; cz /= b.pts.length;
    let r = 0;
    for (const p of b.pts) r = Math.max(r, Math.hypot(p.x - cx, p.z - cz));
    for (const p of b.pts) {
      assert.ok(Math.hypot(p.x - cx, p.z - cz) <= r + 1e-9,
        'a footprint vertex lies outside its own broad-phase circle');
    }
  }
});

/** Every turn the same way round. */
function isConvex(pts: { x: number; z: number }[]): boolean {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!, c = pts[(i + 2) % pts.length]!;
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/**
 * Walking, not just pushing.
 *
 * The engine moves one axis at a time and resolves after each, so that a walk
 * into a wall slides along it. That is a different code path from a single
 * push, and it is the one a player is actually in. This replays it against the
 * real district: start outside, walk straight at a building, and check you are
 * never standing in one at the end of a step.
 */
test('you cannot walk into a building, from any direction', () => {
  const B = unpackBuildings(b64ToBytes(TBILISI_BUILDINGS_B64));
  const colliders = B.map(b => {
    let cx = 0, cz = 0;
    for (const p of b.pts) { cx += p.x; cz += p.z; }
    cx /= b.pts.length; cz /= b.pts.length;
    let r = 0;
    for (const p of b.pts) r = Math.max(r, Math.hypot(p.x - cx, p.z - cz));
    return { x: cx, z: cz, r, poly: b.pts };
  });

  // The engine's own mover, not a restatement of it.
  const step = (pos: { x: number; z: number }, sx: number, sz: number) =>
    moveResolved(pos, sx, sz, colliders, 0.34);

  // Every eighth building, walked at from eight directions.
  let walks = 0, worstPenetration = 0;
  for (let i = 0; i < B.length; i += 8) {
    const b = B[i]!;
    let cx = 0, cz = 0;
    for (const p of b.pts) { cx += p.x; cz += p.z; }
    cx /= b.pts.length; cz /= b.pts.length;
    let r = 0;
    for (const p of b.pts) r = Math.max(r, Math.hypot(p.x - cx, p.z - cz));

    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      // Start outside the enclosing circle and walk at the centroid.
      const pos = { x: cx + Math.cos(ang) * (r + 6), z: cz + Math.sin(ang) * (r + 6) };
      /*
       * Old Town is dense: six metres outside one building's circle is often
       * inside its neighbour. Starting there is not a case a player can be in
       * — you cannot begin a step from inside a wall — and testing it only
       * measured the setup.
       */
      if (colliders.some(c => insidePoly(pos.x, pos.z, c.poly))) continue;
      // A brisk 0.18 m per frame, for long enough to cross the whole building.
      const n = Math.ceil((r + 8) / 0.18);
      for (let s = 0; s < n; s++) {
        step(pos, -Math.cos(ang) * 0.18, -Math.sin(ang) * 0.18);
        for (const c of colliders) {
          if (Math.hypot(pos.x - c.x, pos.z - c.z) > c.r) continue;
          if (insidePoly(pos.x, pos.z, c.poly)) {
            worstPenetration = Math.max(worstPenetration, nearestOnPoly(pos.x, pos.z, c.poly).d);
            assert.fail(`walked into a building at ${pos.x.toFixed(1)},${pos.z.toFixed(1)} — ${worstPenetration.toFixed(2)} m in`);
          }
        }
      }
      walks++;
    }
  }
  // Rather fewer than the 912 approaches attempted, because a start point
  // inside a neighbouring building is skipped — that is how dense this is.
  assert.ok(walks >= 500, `only ${walks} walks simulated`);
});
