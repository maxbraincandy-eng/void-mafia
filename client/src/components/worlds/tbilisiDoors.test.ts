/**
 * Every street door opens onto a street.
 *
 * The rule is not "put a door on the longest wall". That was the first
 * version, and on its own it is wrong in a way nothing visible reports: Old
 * Town's buildings touch, so the longest wall is very often a party wall, and
 * 193 of the first 906 doors were placed six centimetres inside the
 * neighbouring building — buried in its masonry, drawn, lit, and invisible.
 *
 * `buildCity` needs a `three` to make its meshes, so this drives the real
 * thing rather than a restatement of the placement rule.
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import * as THREE from 'three';

import { buildCity } from './tbilisiBuild.js';
import { insidePoly, nearestOnPoly } from './polyPush.js';
import { unpackBuildings, b64ToBytes } from './tbilisiPack.js';
import { TBILISI_BUILDINGS_B64, TBILISI_ROADS_B64 } from './tbilisiData.js';

const mat = new THREE.MeshStandardMaterial();
const city = buildCity(
  THREE, TBILISI_BUILDINGS_B64, TBILISI_ROADS_B64,
  { stone: mat, brick: mat, civic: mat, sacred: mat }, mat, mat,
);
const B = unpackBuildings(b64ToBytes(TBILISI_BUILDINGS_B64));

test('nearly every building has a street door', () => {
  assert.ok(city.doors.length > B.length * 0.95,
    `${city.doors.length} doors for ${B.length} buildings`);
});

test('no door is buried inside another building', () => {
  for (const d of city.doors) {
    for (const b of B) {
      assert.equal(insidePoly(d.x, d.z, b.pts), false,
        `a door at ${d.x.toFixed(1)},${d.z.toFixed(1)} is inside a building`);
    }
  }
});

test('every door sits against a wall rather than out in the road', () => {
  for (const d of city.doors) {
    let best = Infinity;
    for (const b of B) best = Math.min(best, nearestOnPoly(d.x, d.z, b.pts).d);
    assert.ok(best < 0.25, `a door stands ${best.toFixed(2)} m from the nearest wall`);
  }
});

test('a door has room to open: nothing built where it swings', () => {
  /*
   * The point 0.8 m out along the door's own normal — clear of its step and
   * frame — must be open ground. This is the rule the placement applies, and
   * it is the one that was missing.
   */
  for (const d of city.doors) {
    const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
    const ox = d.x + fx * 0.8, oz = d.z + fz * 0.8;
    for (const b of B) {
      assert.equal(insidePoly(ox, oz, b.pts), false,
        `a door at ${d.x.toFixed(1)},${d.z.toFixed(1)} opens straight into a wall`);
    }
  }
});

test('the door faces away from its own building, not into it', () => {
  // A pace BACK along the normal should be inside something: the building the
  // door belongs to. Otherwise the yaw is inverted and the door faces indoors.
  let facingIn = 0;
  for (const d of city.doors) {
    const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
    const ix = d.x - fx * 0.5, iz = d.z - fz * 0.5;
    if (!B.some(b => insidePoly(ix, iz, b.pts))) facingIn++;
  }
  /*
   * Not every one: a door a third of the way along a wall that is itself only
   * a few metres from a corner can have half a metre of outside behind it on a
   * re-entrant plan. A handful is geometry; a lot would be a flipped normal.
   */
  assert.ok(facingIn < city.doors.length * 0.03,
    `${facingIn} of ${city.doors.length} doors have no building behind them`);
});

test('the base course is darker than the wall above it, on every wall', () => {
  /*
   * The plinth is a second quad per wall carrying a darker vertex colour. If
   * the split were dropped the walls would still render — one shade, floating
   * at the pavement — so what has to be asserted is the CONTRAST.
   *
   * Against each wall's own colour, never against a fixed threshold: the
   * palette runs from 0xe6dcc4 to 0x7d6248, so plenty of buildings are darker
   * all over than another building's plinth. The first version of this test
   * used an absolute luminance and called 45% of the upper walls plinths.
   */
  const walls = city.meshes[0]!;
  const pos = walls.geometry.attributes.position as THREE.BufferAttribute;
  const col = walls.geometry.attributes.color as THREE.BufferAttribute;

  // Same (x, z) means the same wall: the plinth quad and the one above it
  // share their two lower corners with the ground and their uppers with it.
  const byColumn = new Map<string, { lo: number; hi: number }>();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const lum = col.getX(i) * 0.3 + col.getY(i) * 0.6 + col.getZ(i) * 0.1;
    const key = `${pos.getX(i).toFixed(2)},${pos.getZ(i).toFixed(2)}`;
    const e = byColumn.get(key) ?? { lo: -1, hi: -1 };
    if (y <= 0.01) e.lo = lum;
    else if (y > 1.7) e.hi = Math.max(e.hi, lum);
    byColumn.set(key, e);
  }

  let pairs = 0, darker = 0;
  for (const e of byColumn.values()) {
    if (e.lo < 0 || e.hi < 0) continue;
    pairs++;
    if (e.lo < e.hi * 0.85) darker++;
  }
  assert.ok(pairs > 800, `only ${pairs} walls had both a plinth and a storey above it`);
  assert.ok(darker / pairs > 0.95,
    `only ${(darker / pairs * 100).toFixed(0)}% of walls have a plinth darker than the wall above`);
});
