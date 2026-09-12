/**
 * Turning packed footprints into a city, in a handful of draw calls.
 *
 * WHY THIS IS SEPARATE FROM THE WORLD
 * ──────────────────────────────────
 * `oldTbilisi.ts` is scene dressing — where the sun is, where the landmarks
 * stand, what the fog does. This is the part that has to survive eight hundred
 * buildings on a phone, and it is arithmetic rather than art. Splitting them
 * means the expensive half can be reasoned about, and tested, without a canvas.
 *
 * THE ONE RULE THAT MATTERS
 * ─────────────────────────
 * One mesh per material, never one mesh per building. Eight hundred separate
 * meshes is eight hundred draw calls and a phone gives up somewhere in the low
 * hundreds; the same geometry merged into four buffers is four. Everything else
 * here — the shared facade atlas, the instanced windows — exists to keep the
 * number of materials small enough for that to be possible.
 *
 * Data © OpenStreetMap contributors, ODbL.
 */

import type * as THREE from 'three';
import { unpackBuildings, unpackRoads, unpackWater, b64ToBytes, type PackedBuilding } from './tbilisiPack';

/**
 * Which facade a building wears.
 *
 * Four groups, not nine, because each one is a draw call and the eye cannot
 * tell a `retail` from a `commercial` at street level anyway. The kinds that DO
 * read differently — a church, a ruin — are worth their own.
 */
export type FacadeGroup = 'stone' | 'brick' | 'civic' | 'sacred';

const KIND_TO_GROUP: FacadeGroup[] = [
  'stone',   // yes
  'brick',   // house
  'stone',   // apartments
  'sacred',  // church
  'civic',   // commercial
  'civic',   // retail
  'civic',   // civic
  'brick',   // ruins
  'brick',   // garage
];

export interface BuiltCity {
  meshes: THREE.Mesh[];
  /** One circle per building, for the engine's collision sweep. */
  colliders: { x: number; z: number; r: number }[];
  buildings: number;
  triangles: number;
}

/**
 * Push one upward-facing triangle, wound so it is actually visible.
 *
 * The trap: a ring with a POSITIVE shoelace area in (x, z) traverses clockwise
 * when you look down at it from +y, because the ground plane is left-handed
 * seen from above — x goes right and z goes *down* the screen. Three culls back
 * faces by vertex order, not by the normal attribute, so every horizontal
 * surface built straight from a positively-wound ring is invisible: the ground
 * vanished and the city floated over nothing, with the correct normals sitting
 * right there in the buffer.
 *
 * Rather than flipping each caller by hand and hoping, this measures the
 * triangle it was given and swaps two vertices when it has to. It cannot be
 * wrong, and the next horizontal surface added here inherits that.
 */
function pushUpTri(
  pos: number[], nor: number[], uv: number[],
  y: number,
  a: { x: number; z: number }, b: { x: number; z: number }, c: { x: number; z: number },
  ua: [number, number], ub: [number, number], uc: [number, number],
): void {
  const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  // cross > 0 is clockwise from above, which is the back face.
  const [p0, p1, p2] = cross > 0 ? [a, c, b] : [a, b, c];
  const [t0, t1, t2] = cross > 0 ? [ua, uc, ub] : [ua, ub, uc];
  pos.push(p0.x, y, p0.z, p1.x, y, p1.z, p2.x, y, p2.z);
  for (let i = 0; i < 3; i++) nor.push(0, 1, 0);
  uv.push(t0[0], t0[1], t1[0], t1[1], t2[0], t2[1]);
}

/** Centroid and enclosing radius of a footprint. */
function footprintCircle(pts: { x: number; z: number }[]) {
  let cx = 0, cz = 0;
  for (const p of pts) { cx += p.x; cz += p.z; }
  cx /= pts.length; cz /= pts.length;
  let r = 0;
  for (const p of pts) r = Math.max(r, Math.hypot(p.x - cx, p.z - cz));
  return { x: cx, z: cz, r };
}

/**
 * Extrude one footprint into the shared arrays.
 *
 * Walls are written as two triangles per edge with a flat normal, and UVs run
 * in METRES rather than 0..1 — so a facade texture keeps the same storey height
 * on a 6 m cottage and a 40 m block, which is the difference between a city and
 * a set of stretched boxes.
 */
function extrude(
  b: PackedBuilding,
  pos: number[], nor: number[], uv: number[],
): number {
  const n = b.pts.length;
  const h = b.height;
  let tris = 0;

  for (let i = 0; i < n; i++) {
    const a = b.pts[i]!, c = b.pts[(i + 1) % n]!;
    const dx = c.x - a.x, dz = c.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    // Counter-clockwise footprint (the extractor guarantees it), so the outward
    // normal of edge a→c is (dz, -dx) normalised.
    const nx = dz / len, nz = -dx / len;

    // Two triangles, wound so the front face points out.
    const quad = [
      [a.x, 0, a.z, 0, 0], [c.x, 0, c.z, len, 0], [c.x, h, c.z, len, h],
      [a.x, 0, a.z, 0, 0], [c.x, h, c.z, len, h], [a.x, h, a.z, 0, h],
    ];
    for (const [x, y, z, u, v] of quad) {
      pos.push(x!, y!, z!); nor.push(nx, 0, nz); uv.push(u! * 0.25, v! * 0.25);
    }
    tris += 2;
  }

  /*
   * The roof, as a fan from the centroid.
   *
   * A proper ear-clipping triangulation would handle the concave courtyards of
   * Old Town exactly; a fan does not, and on a concave plan it spills a sliver
   * outside the walls. From street level a roof is seen at a glancing angle if
   * at all, and the sliver costs three vertices where a triangulator costs a
   * dependency and a per-building loop over every ear. If the city is ever
   * viewed from above, this is the first thing to replace.
   */
  const c0 = footprintCircle(b.pts);
  for (let i = 0; i < n; i++) {
    const a = b.pts[i]!, c = b.pts[(i + 1) % n]!;
    pushUpTri(pos, nor, uv, h, c0, a, c, [0.5, 0.5], [0, 0], [1, 0]);
    tris++;
  }
  return tris;
}

/**
 * Build the district.
 *
 * `materials` is supplied by the world so the look lives with the scene and the
 * geometry lives here.
 */
export function buildCity(
  three: typeof THREE,
  buildingsB64: string,
  roadsB64: string,
  materials: Record<FacadeGroup, THREE.Material>,
  roadMaterial: THREE.Material,
  opts: { maxBuildings?: number } = {},
): BuiltCity {
  const all = unpackBuildings(b64ToBytes(buildingsB64));
  /*
   * A budget, spent on the biggest footprints first.
   *
   * The extractor already sorts by area, so a cap keeps the landmarks and the
   * street walls and drops the sheds in the back courtyards — which is the
   * right thing to lose if a device cannot take all of them.
   */
  const list = opts.maxBuildings ? all.slice(0, opts.maxBuildings) : all;

  const groups: Record<string, { pos: number[]; nor: number[]; uv: number[]; tris: number }> = {};
  const colliders: { x: number; z: number; r: number }[] = [];
  let triangles = 0;

  for (const b of list) {
    const g = KIND_TO_GROUP[b.kind] ?? 'stone';
    const bucket = groups[g] ?? (groups[g] = { pos: [], nor: [], uv: [], tris: 0 });
    const t = extrude(b, bucket.pos, bucket.nor, bucket.uv);
    bucket.tris += t;
    triangles += t;

    /*
     * One collider per building, inscribed rather than enclosing.
     *
     * The enclosing circle of a long terrace reaches well past its ends and
     * would wall off the lane beside it; 0.62 of it is a compromise that keeps
     * the walker out of the building without closing the street. Old Town's
     * lanes are three metres wide, so this is not a detail.
     */
    const c = footprintCircle(b.pts);
    colliders.push({ x: c.x, z: c.z, r: Math.max(1.2, c.r * 0.62) });
  }

  const meshes: THREE.Mesh[] = [];
  for (const [name, g] of Object.entries(groups)) {
    if (!g.pos.length) continue;
    const geo = new three.BufferGeometry();
    geo.setAttribute('position', new three.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new three.Float32BufferAttribute(g.nor, 3));
    geo.setAttribute('uv', new three.Float32BufferAttribute(g.uv, 2));
    geo.computeBoundingSphere();
    const mesh = new three.Mesh(geo, materials[name as FacadeGroup]);
    mesh.matrixAutoUpdate = false;
    meshes.push(mesh);
  }

  // ── Streets ──
  const roads = unpackRoads(b64ToBytes(roadsB64));
  const rp: number[] = [], rn: number[] = [], ru: number[] = [];
  for (const r of roads) {
    const hw = r.width / 2;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i]!, b2 = r.pts[i + 1]!;
      const dx = b2.x - a.x, dz = b2.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.3) continue;
      // Perpendicular, so the ribbon has the road's width either side of the
      // centreline OSM actually records.
      const px = (dz / len) * hw, pz = (-dx / len) * hw;
      const p1 = { x: a.x - px, z: a.z - pz }, p2 = { x: a.x + px, z: a.z + pz };
      const p3 = { x: b2.x + px, z: b2.z + pz }, p4 = { x: b2.x - px, z: b2.z - pz };
      // Just above the ground plane: coplanar surfaces z-fight, and a street
      // that flickers is more distracting than one that is a centimetre proud.
      pushUpTri(rp, rn, ru, 0.02, p1, p2, p3, [0, 0], [1, 0], [1, len * 0.2]);
      pushUpTri(rp, rn, ru, 0.02, p1, p3, p4, [0, 0], [1, len * 0.2], [0, len * 0.2]);
    }
  }
  if (rp.length) {
    const geo = new three.BufferGeometry();
    geo.setAttribute('position', new three.Float32BufferAttribute(rp, 3));
    geo.setAttribute('normal', new three.Float32BufferAttribute(rn, 3));
    geo.setAttribute('uv', new three.Float32BufferAttribute(ru, 2));
    geo.computeBoundingSphere();
    const mesh = new three.Mesh(geo, roadMaterial);
    mesh.matrixAutoUpdate = false;
    meshes.push(mesh);
    triangles += rp.length / 9;
  }

  return { meshes, colliders, buildings: list.length, triangles };
}

/**
 * The ground, with the river cut out of it.
 *
 * The bug this fixes: a solid plane at y=0 covers a water surface at y=−3.2
 * completely. The river was being drawn, correctly, underneath the city — and
 * the old town's most obvious feature was simply missing, with nothing to
 * suggest anything was wrong beyond an unexplained empty strip.
 *
 * So the ground is a rectangle with the river rings as holes, and the water
 * shows through. Ear-clipped for the same reason the water is.
 */
export function buildGround(
  three: typeof THREE,
  waterB64: string,
  material: THREE.Material,
  half: number,
): THREE.Mesh {
  const rings = unpackWater(b64ToBytes(waterB64));
  const contour = [
    new three.Vector2(-half, -half), new three.Vector2(half, -half),
    new three.Vector2(half, half), new three.Vector2(-half, half),
  ];
  const holes = rings.map(r => r.map(p => new three.Vector2(p.x, p.z)));

  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const emit = (pts: THREE.Vector2[][], faces: number[][]) => {
    const flat = pts.flat();
    for (const f of faces) {
      const [a, b, c] = f.map(i => flat[i]!);
      if (!a || !b || !c) continue;
      pushUpTri(pos, nor, uv, 0,
        { x: a.x, z: a.y }, { x: b.x, z: b.y }, { x: c.x, z: c.y },
        [a.x * 0.01, a.y * 0.01], [b.x * 0.01, b.y * 0.01], [c.x * 0.01, c.y * 0.01]);
    }
  };
  try {
    emit([contour, ...holes], three.ShapeUtils.triangulateShape(contour, holes));
  } catch {
    // A bank OSM has left self-intersecting must not cost the world its floor.
    emit([contour], three.ShapeUtils.triangulateShape(contour, []));
  }

  const geo = new three.BufferGeometry();
  geo.setAttribute('position', new three.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new three.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new three.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  const mesh = new three.Mesh(geo, material);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/**
 * Where to put the street lamps: on the streets.
 *
 * Scattering them over the district put posts through walls and one directly in
 * front of the spawn. Walking the road centrelines costs a few lines and gives
 * lit lanes instead of a lit field.
 */
export function lampPositions(
  roadsB64: string, spacing: number, limit: number,
): { x: number; z: number }[] {
  const roads = unpackRoads(b64ToBytes(roadsB64));
  const out: { x: number; z: number }[] = [];
  // Widest first: the lanes that carry people, not every back alley.
  roads.sort((a, b) => b.width - a.width);
  for (const r of roads) {
    if (out.length >= limit) break;
    let carried = spacing * 0.5;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i]!, b = r.pts[i + 1]!;
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      let t = carried;
      while (t < len && out.length < limit) {
        // Set back from the centreline, the way a kerb is.
        const off = r.width / 2 + 0.6;
        out.push({ x: a.x + (dx / len) * t + (dz / len) * off, z: a.z + (dz / len) * t - (dx / len) * off });
        t += spacing;
      }
      carried = t - len;
    }
  }
  return out;
}

/**
 * The Mtkvari, from its real bank.
 *
 * Ear-clipped rather than fanned: a river through a city is about as concave as
 * a polygon gets, and a centroid fan would lay triangles straight across the old
 * town. `ShapeUtils.triangulateShape` is already in three and does the job.
 */
export function buildWater(
  three: typeof THREE,
  waterB64: string,
  material: THREE.Material,
  surfaceY: number,
): THREE.Mesh | null {
  const rings = unpackWater(b64ToBytes(waterB64));
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  for (const ring of rings) {
    // three's triangulator works in 2D (x, y); the world's ground plane is
    // (x, z), so z rides in as y and comes back out the same way.
    const contour = ring.map(p => new three.Vector2(p.x, p.z));
    let faces: number[][];
    try {
      faces = three.ShapeUtils.triangulateShape(contour, []);
    } catch {
      // A self-intersecting bank is possible in OSM and is not worth crashing a
      // world over — the river is scenery.
      continue;
    }
    for (const f of faces) {
      const [a, b, c] = f.map(i => ring[i]!);
      if (!a || !b || !c) continue;
      pushUpTri(pos, nor, uv, surfaceY, a, b, c,
        [a.x * 0.02, a.z * 0.02], [b.x * 0.02, b.z * 0.02], [c.x * 0.02, c.z * 0.02]);
    }
  }
  if (!pos.length) return null;
  const geo = new three.BufferGeometry();
  geo.setAttribute('position', new three.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new three.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new three.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  const mesh = new three.Mesh(geo, material);
  mesh.matrixAutoUpdate = false;
  return mesh;
}
