/**
 * The street furniture stands on the street.
 *
 * Lamps, parked cars and trees are all placed the same way — walked along the
 * real road centrelines and pushed out past the kerb — because the first
 * version of each scattered them at random and each one ended up inside a
 * wall. That is a failure that renders perfectly: no exception, no warning,
 * just a tree growing through a first-floor window that you only find by
 * walking there.
 *
 * So the rules get asserted against the real committed road and building data,
 * not a fixture: the whole question is whether they hold for Tbilisi's actual
 * street plan, where lanes are three metres wide and buildings touch.
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import { treeSpots, carSpots } from './tbilisiBuild.js';
import { unpackBuildings, unpackRoads, b64ToBytes } from './tbilisiPack.js';
import { TBILISI_ROADS_B64, TBILISI_BUILDINGS_B64, TBILISI_LANDMARKS } from './tbilisiData.js';
import { oldTbilisi } from './oldTbilisi.js';

/**
 * The building colliders, as `buildCity` computes them: the circle round each
 * footprint. Restated here rather than imported because `buildCity` needs a
 * renderer and this does not — and because a placement rule tested against the
 * same code that produced the input proves nothing.
 */
function buildingCircles(): { x: number; z: number; r: number }[] {
  return unpackBuildings(b64ToBytes(TBILISI_BUILDINGS_B64)).map(b => {
    let cx = 0, cz = 0;
    for (const p of b.pts) { cx += p.x; cz += p.z; }
    cx /= b.pts.length; cz /= b.pts.length;
    let r = 0;
    for (const p of b.pts) r = Math.max(r, Math.hypot(p.x - cx, p.z - cz));
    return { x: cx, z: cz, r };
  });
}

const CIRCLES = buildingCircles();

/** The same options the world passes, so the tests check what ships. */
const CAR_OPTS = {
  count: 8, minWidth: 6, apart: 45, clearOf: CIRCLES,
  anchor: oldTbilisi.spawn, within: 300,
};

test('trees stand clear of the buildings', () => {
  const spots = treeSpots(TBILISI_ROADS_B64, {
    spacing: 19, limit: 320, minWidth: 5, clearOf: CIRCLES,
  });
  assert.ok(spots.length > 120, `only ${spots.length} trees placed — the streets went missing`);

  for (const t of spots) {
    for (const c of CIRCLES) {
      const d = Math.hypot(c.x - t.x, c.z - t.z);
      assert.ok(d >= c.r + 2.2, `a tree at ${t.x.toFixed(1)},${t.z.toFixed(1)} is ${d.toFixed(1)} m from a building of radius ${c.r.toFixed(1)}`);
    }
  }
});

test('trees are not stacked on each other', () => {
  const spots = treeSpots(TBILISI_ROADS_B64, {
    spacing: 19, limit: 320, minWidth: 5, clearOf: CIRCLES,
  });
  // The crowns are up to 2.9 m across, so anything under about six metres is
  // one bush rather than an avenue.
  let worst = Infinity;
  for (let i = 0; i < spots.length; i++) {
    for (let k = i + 1; k < spots.length; k++) {
      worst = Math.min(worst, Math.hypot(spots[i]!.x - spots[k]!.x, spots[i]!.z - spots[k]!.z));
    }
  }
  assert.ok(worst >= 19 * 0.55, `two trees are ${worst.toFixed(1)} m apart`);
});

test('every tree stands on some road\'s kerb line, and none in a carriageway', () => {
  const roads = unpackRoads(b64ToBytes(TBILISI_ROADS_B64)).filter(r => r.width >= 5);
  const spots = treeSpots(TBILISI_ROADS_B64, {
    spacing: 19, limit: 320, minWidth: 5, clearOf: CIRCLES,
  });

  /** Perpendicular distance from a point to a road's centreline. */
  const distTo = (r: { pts: { x: number; z: number }[] }, x: number, z: number) => {
    let best = Infinity;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i]!, b = r.pts[i + 1]!;
      const dx = b.x - a.x, dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
      best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
    }
    return best;
  };

  /*
   * Against the road it was placed on, not the nearest one.
   *
   * The first version of this asserted against whichever centreline was
   * closest, and it failed on six trees out of three hundred — correctly
   * placed beside a sixteen-metre avenue, and nearer to a two-metre back lane
   * running parallel to it. Nearness is not the rule; standing on a kerb is.
   */
  for (const t of spots) {
    /*
     * Within the verge band, rather than exactly 1.9 m out: a tree planted
     * near a bend is measured to the next segment of its own road, which is
     * closer than the offset it was pushed out by.
     */
    const onVerge = roads.some(r => distTo(r, t.x, t.z) <= r.width / 2 + 1.95);
    assert.ok(onVerge, `a tree at ${t.x.toFixed(1)},${t.z.toFixed(1)} is not set off any road`);
    // And the other way this goes wrong: standing in the middle of the road.
    const inRoad = roads.find(r => distTo(r, t.x, t.z) < r.width / 2 - 0.05);
    assert.equal(inRoad, undefined, `a tree at ${t.x.toFixed(1)},${t.z.toFixed(1)} is inside a ${inRoad?.width} m carriageway`);
  }
});

test('trees are the same trees on every load', () => {
  const o = { spacing: 19, limit: 320, minWidth: 5, clearOf: CIRCLES };
  const a = treeSpots(TBILISI_ROADS_B64, o);
  const b = treeSpots(TBILISI_ROADS_B64, o);
  assert.deepEqual(a, b, 'the same district came out with different trees');
});

test('parked cars stand clear of the buildings and of each other', () => {
  const spots = carSpots(TBILISI_ROADS_B64, CAR_OPTS);
  assert.equal(spots.length, 8, `${spots.length} parking spots found on the wide streets`);

  for (const s of spots) {
    for (const c of CIRCLES) {
      const d = Math.hypot(c.x - s.x, c.z - s.z);
      assert.ok(d >= c.r + 3.4, `a car at ${s.x.toFixed(1)},${s.z.toFixed(1)} is ${d.toFixed(1)} m from a building of radius ${c.r.toFixed(1)}`);
    }
  }
  for (let i = 0; i < spots.length; i++) {
    for (let k = i + 1; k < spots.length; k++) {
      const d = Math.hypot(spots[i]!.x - spots[k]!.x, spots[i]!.z - spots[k]!.z);
      assert.ok(d >= 45, `two cars are parked ${d.toFixed(1)} m apart`);
    }
  }
});

test('a parked car points along its street, not across it', () => {
  const roads = unpackRoads(b64ToBytes(TBILISI_ROADS_B64)).filter(r => r.width >= 6);
  const spots = carSpots(TBILISI_ROADS_B64, CAR_OPTS);

  for (const s of spots) {
    // The nearest segment to the spot is the one it was placed on.
    let best = Infinity, bd = { dx: 0, dz: 0 };
    for (const r of roads) {
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const a = r.pts[i]!, b = r.pts[i + 1]!;
        const dx = b.x - a.x, dz = b.z - a.z;
        const len2 = dx * dx + dz * dz;
        if (len2 < 1e-6) continue;
        const t = Math.max(0, Math.min(1, ((s.x - a.x) * dx + (s.z - a.z) * dz) / len2));
        const d = Math.hypot(s.x - (a.x + dx * t), s.z - (a.z + dz * t));
        if (d < best) { best = d; bd = { dx, dz }; }
      }
    }
    /*
     * The engine drives a vehicle along its local −Z, so the car's heading
     * vector is (−sin yaw, −cos yaw). That must lie along the road, either way
     * up: |cos| of the angle between them near one.
     */
    const hx = -Math.sin(s.yaw), hz = -Math.cos(s.yaw);
    const rl = Math.hypot(bd.dx, bd.dz);
    const align = Math.abs((hx * bd.dx + hz * bd.dz) / rl);
    assert.ok(align > 0.97, `a car is parked at ${(Math.acos(Math.min(1, align)) * 180 / Math.PI).toFixed(0)}° to its street`);
  }
});

/**
 * The spawn is somewhere worth standing.
 *
 * Three times now this has been wrong in three different ways — in the river,
 * in the middle of an empty plain, and facing a wall three metres off — and
 * every one of them rendered without complaint. The spawn is a constant in a
 * file, so nothing else in the project has any opinion about it at all.
 */
test('the spawn stands in a street, with somewhere to look', () => {
  const clearance = (x: number, z: number) => {
    let m = Infinity;
    for (const c of CIRCLES) m = Math.min(m, Math.hypot(c.x - x, c.z - z) - c.r);
    return m;
  };

  const { x, z, yaw } = oldTbilisi.spawn;
  const room = clearance(x, z);
  assert.ok(room > 1.6, `the spawn has ${room.toFixed(1)} m of standing room — it is inside a building`);
  assert.ok(room < 12, `the spawn has ${room.toFixed(1)} m of standing room — it is out in a field, not in a street`);

  // The engine's forward is (−sin yaw, −cos yaw). March it until a wall stops it.
  const hx = -Math.sin(yaw), hz = -Math.cos(yaw);
  let view = 70;
  for (let t = 1; t <= 70; t += 0.5) {
    if (clearance(x + hx * t, z + hz * t) < 0.4) { view = t; break; }
  }
  assert.ok(view >= 28, `the spawn faces a wall ${view.toFixed(1)} m away`);

  // And Sioni, the reason for standing here, is in front rather than behind.
  const sioni = TBILISI_LANDMARKS.find(l => l.name.includes('სიონის'));
  assert.ok(sioni, 'Sioni is not in the landmark data');
  const dx = sioni.x - x, dz = sioni.z - z, d = Math.hypot(dx, dz);
  assert.ok(d > 15 && d < 90, `Sioni is ${d.toFixed(0)} m from the spawn`);
  const cos = (hx * dx + hz * dz) / d;
  assert.ok(cos > 0.7, `Sioni is ${(Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI).toFixed(0)}° off the spawn's heading`);
});

/**
 * A car you can get to.
 *
 * This is the one that shipped. Six Volgas, every one of them on a real
 * street, pointing the right way, clear of every wall — and 241, 371, 409,
 * 473, 508 and 513 metres from where you arrive, all of them on the avenues
 * across the river, because `minWidth: 7` excluded every street in the old
 * town and the widest within eighty metres of the spawn is 6.4. Six tests
 * passed on it. None of them asked the only question that mattered, which is
 * whether a player would ever find one.
 */
test('a car is parked within a short walk of the spawn', () => {
  const spots = carSpots(TBILISI_ROADS_B64, CAR_OPTS);
  const { x, z } = oldTbilisi.spawn;
  const nearest = Math.min(...spots.map(s => Math.hypot(s.x - x, s.z - z)));
  assert.ok(nearest < 70, `the nearest car is ${nearest.toFixed(0)} m from the spawn`);
});

test('the cars are spread over the district, not strung along one avenue', () => {
  const spots = carSpots(TBILISI_ROADS_B64, CAR_OPTS);
  const { x, z } = oldTbilisi.spawn;
  const d = spots.map(s => Math.hypot(s.x - x, s.z - z)).sort((a, b) => a - b);

  // Nothing out at the edge of the extract, where farthest-point sampling
  // sends them if it is left unbounded.
  assert.ok(d[d.length - 1]! <= 320, `a car is ${d[d.length - 1]!.toFixed(0)} m out — past the walkable district`);

  // And genuinely spread rather than clustered: the median is well away from
  // both the spawn and the outer bound.
  const median = d[Math.floor(d.length / 2)]!;
  assert.ok(median > 90 && median < 280, `the median car is ${median.toFixed(0)} m from the spawn`);
});
