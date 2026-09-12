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

/**
 * Tbilisi's palette, not a computer's.
 *
 * Every building came out the same beige, because most of OSM's buildings are
 * tagged `building=yes` and everything in that bucket wore one texture. Nine
 * hundred identical boxes is what made the district read as a housing estate
 * rather than as an old town — the data was right and the city was wrong.
 *
 * These are the plaster and brick colours the old town is actually painted in:
 * ochre, sand, faded rose, pale green, cream. Carried as vertex colours, so the
 * variety costs one attribute rather than one draw call per shade.
 */
const WALL_TINTS = [
  0xd9c5a0, 0xc9a97e, 0xe0d3bb, 0xa87850, 0xd7b894,
  0xc98f78, 0x9d7f5e, 0xdcc9ae, 0x8f6a4c, 0xbfae8e,
  0xb06a52, 0xe2d6c0, 0x7d6248, 0xcf9f6a, 0xa9937a,
  0xd3a88c, 0x8a6f58, 0xe6dcc4,
];
/** Terracotta, weathered. Old Town's roofs are tile and they are not uniform. */
const ROOF_TINTS = [0x9c5a42, 0x8a4e3a, 0xad6a4c, 0x7d4534, 0xa05f45, 0x93553f];

/**
 * A stable pick from a building's own position.
 *
 * Seeded by where it stands rather than by its index, so adding one building to
 * the extract does not repaint the whole city.
 */
function tintFor(list: number[], x: number, z: number): number {
  const h = Math.abs(Math.round(x * 7.3) * 73856093 ^ Math.round(z * 7.3) * 19349663);
  return list[h % list.length]!;
}

/**
 * The balconies.
 *
 * The one feature that makes a photograph of Tbilisi recognisable as Tbilisi
 * and not as any other old town on this latitude: carved wooden galleries hung
 * off the first floor, overhanging the lane. Nothing in OSM knows they exist,
 * so they are hung here — on street-facing walls of houses, which is where they
 * are.
 *
 * Instanced: one box for the deck, one for the rail, a few uprights. Two draw
 * calls for the whole district however many there turn out to be.
 */
export interface Balcony { x: number; z: number; yaw: number; w: number; y: number; }

export interface BuiltCity {
  meshes: THREE.Mesh[];
  /** Where to hang a wooden gallery, in world metres. */
  balconies: Balcony[];
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
  col?: number[], rgb?: [number, number, number],
): void {
  const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  // cross > 0 is clockwise from above, which is the back face.
  const [p0, p1, p2] = cross > 0 ? [a, c, b] : [a, b, c];
  const [t0, t1, t2] = cross > 0 ? [ua, uc, ub] : [ua, ub, uc];
  pos.push(p0.x, y, p0.z, p1.x, y, p1.z, p2.x, y, p2.z);
  for (let i = 0; i < 3; i++) nor.push(0, 1, 0);
  uv.push(t0[0], t0[1], t1[0], t1[1], t2[0], t2[1]);
  if (col && rgb) for (let i = 0; i < 3; i++) col.push(rgb[0], rgb[1], rgb[2]);
}

/** 0xRRGGBB → linear-ish floats, jittered a little so a terrace is not a block. */
function rgbOf(hex: number, jitter: number): [number, number, number] {
  const j = 1 + jitter;
  return [
    Math.min(1, ((hex >> 16) & 255) / 255 * j),
    Math.min(1, ((hex >> 8) & 255) / 255 * j),
    Math.min(1, (hex & 255) / 255 * j),
  ];
}

/**
 * The long axis of a footprint, by principal component.
 *
 * A hip roof needs a ridge, and a ridge needs a direction. Taking the longest
 * EDGE gets this wrong on any plan with a short jog in a long wall, which Old
 * Town is full of; the principal axis of the vertices is the direction the
 * building actually runs.
 */
function longAxis(pts: { x: number; z: number }[], cx: number, cz: number) {
  let sxx = 0, szz = 0, sxz = 0;
  for (const p of pts) {
    const dx = p.x - cx, dz = p.z - cz;
    sxx += dx * dx; szz += dz * dz; sxz += dx * dz;
  }
  const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  let ax = Math.cos(theta), az = Math.sin(theta);

  /*
   * And make sure it really is the LONG one.
   *
   * `0.5·atan2(2σxz, σxx − σzz)` returns the major axis only when σxx > σzz;
   * on a plan that is wider across than along it hands back the minor axis
   * instead. The ridge then runs the short way, collapses to nearly a point,
   * and every eave slopes up to meet it — which is where the circus tents over
   * half the district came from. Measuring both spans costs one pass and
   * cannot be fooled.
   */
  let spanA = 0, spanB = 0;
  let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
  for (const p of pts) {
    const dx = p.x - cx, dz = p.z - cz;
    const a = dx * ax + dz * az;
    const b = -dx * az + dz * ax;
    minA = Math.min(minA, a); maxA = Math.max(maxA, a);
    minB = Math.min(minB, b); maxB = Math.max(maxB, b);
  }
  spanA = maxA - minA; spanB = maxB - minB;
  if (spanB > spanA) { const t = ax; ax = -az; az = t; }
  return { ax, az };
}

/**
 * A hip roof over the footprint.
 *
 * The single biggest thing separating "a city extruded from OSM" from "an old
 * town": flat tops read as a modern estate no matter what colour the walls are.
 * Real Old Town is pitched tile, and the ridge runs along the building.
 *
 * Built by lofting every wall edge up to the nearest point on a ridge segment
 * inset along the long axis. It is not a correct straight-skeleton roof — a
 * deeply concave plan gets a slightly odd fold — but over a terrace or a
 * courtyard block it is a hip roof, at three vertices an edge.
 */
function hipRoof(
  b: PackedBuilding, cx: number, cz: number,
  pos: number[], nor: number[], uv: number[], col: number[],
): number {
  const { ax, az } = longAxis(b.pts, cx, cz);
  let minT = Infinity, maxT = -Infinity, halfW = 0;
  for (const p of b.pts) {
    const t = (p.x - cx) * ax + (p.z - cz) * az;
    const w = Math.abs(-(p.x - cx) * az + (p.z - cz) * ax);
    minT = Math.min(minT, t); maxT = Math.max(maxT, t); halfW = Math.max(halfW, w);
  }
  /*
   * A real pitch, or none.
   *
   * Rise was capped at 2.8 m regardless of span, so a twenty-metre-wide house
   * got an eight-degree slope — which from the street is a flat sheet balanced
   * on a building, not a roof. Tying it to the half-span keeps the ANGLE
   * constant instead of the height, and refusing anything wider than eleven
   * metres of half-span keeps the marquees out entirely.
   */
  if (halfW > 11) return -1;
  const rise = Math.max(1.6, Math.min(4.5, halfW * 0.8));
  /*
   * The ridge keeps most of the building's length.
   *
   * Inset by the roof's own half-width — which is what a hip roof actually
   * does, the hip sloping back at roughly the same angle as the eaves — rather
   * than by a fraction of the plan, which shortened the ridge to nothing on a
   * squat building and gave it a pyramid.
   */
  const inset = Math.min(halfW, (maxT - minT) * 0.35);
  const r0 = { x: cx + ax * (minT + inset), z: cz + az * (minT + inset) };
  const r1 = { x: cx + ax * (maxT - inset), z: cz + az * (maxT - inset) };
  // The ridge has to be over the building, not beside it.
  if (!ridgeFits(b.pts, r0, r1)) return -1;

  /** Nearest point on the ridge segment — where this eave's slope runs up to. */
  const onRidge = (p: { x: number; z: number }) => {
    const dx = r1.x - r0.x, dz = r1.z - r0.z;
    const L2 = dx * dx + dz * dz;
    if (L2 < 1e-6) return r0;
    let t = ((p.x - r0.x) * dx + (p.z - r0.z) * dz) / L2;
    t = Math.max(0, Math.min(1, t));
    return { x: r0.x + dx * t, z: r0.z + dz * t };
  };

  const tint = rgbOf(tintFor(ROOF_TINTS, cx, cz), ((Math.round(cx) % 7) - 3) * 0.012);
  const eaveY = b.height, ridgeY = b.height + rise;
  let tris = 0;
  const n = b.pts.length;
  for (let i = 0; i < n; i++) {
    const a = b.pts[i]!, c = b.pts[(i + 1) % n]!;
    const ra = onRidge(a), rc = onRidge(c);
    // Two sloping triangles per eave, meeting the ridge. Normals are computed
    // afterwards from the geometry, so a sloped face is lit as a sloped face.
    pushSlope(pos, nor, uv, col, tint,
      [a.x, eaveY, a.z], [c.x, eaveY, c.z], [rc.x, ridgeY, rc.z]);
    pushSlope(pos, nor, uv, col, tint,
      [a.x, eaveY, a.z], [rc.x, ridgeY, rc.z], [ra.x, ridgeY, ra.z]);
    tris += 2;
  }
  return tris;
}

/** Ray-crossing point-in-polygon, in the ground plane. */
function inside(pts: { x: number; z: number }[], x: number, z: number): boolean {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!, b = pts[j]!;
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
  }
  return hit;
}

/**
 * Can a straight ridge sit on this plan at all?
 *
 * Compactness alone lets an L through — an L is not spindly, it is just bent —
 * and a straight ridge through the centroid of an L lies partly OUTSIDE the
 * building. The eaves on the far arm then slope up to a point in mid-air, and
 * the result is a large flat sheet hanging beside the house it belongs to.
 * Sampling the ridge is the direct question, so it is the one asked.
 */
function ridgeFits(pts: { x: number; z: number }[], r0: { x: number; z: number }, r1: { x: number; z: number }): boolean {
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    if (!inside(pts, r0.x + (r1.x - r0.x) * t, r0.z + (r1.z - r0.z) * t)) return false;
  }
  return true;
}

/**
 * How round a footprint is: 4πA / P², one for a circle, near zero for a spike.
 * Used to decide whether a plan can carry a pitched roof at all.
 */
function compactness(pts: { x: number; z: number }[]): number {
  let a = 0, per = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j]!.x * pts[i]!.z - pts[i]!.x * pts[j]!.z;
    per += Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.z - pts[j]!.z);
  }
  a = Math.abs(a / 2);
  return per > 0 ? (4 * Math.PI * a) / (per * per) : 0;
}

/**
 * A flat roof with a low parapet, for the plans a pitch cannot sit on.
 *
 * Ear-clipped rather than fanned from the centroid. These are by definition the
 * awkward plans — that is why they are here — and a fan over a concave plan
 * lays triangles outside the walls: flat sheets hanging in the air beside the
 * building they belong to, which is exactly how they looked.
 */
function flatRoof(
  three: typeof THREE,
  b: PackedBuilding, c: { x: number; z: number },
  pos: number[], nor: number[], uv: number[], col: number[],
): number {
  const tint = rgbOf(tintFor(ROOF_TINTS, c.x, c.z), -0.12);
  const n = b.pts.length;
  let tris = 0;
  const ring = b.pts.map(p => new three.Vector2(p.x, p.z));
  let faces: number[][] = [];
  try { faces = three.ShapeUtils.triangulateShape(ring, []); } catch { faces = []; }
  if (faces.length) {
    for (const f of faces) {
      const [p0, p1, p2] = f.map(i => b.pts[i]!);
      if (!p0 || !p1 || !p2) continue;
      pushUpTri(pos, nor, uv, b.height + 0.5, p0, p1, p2, [0, 0], [1, 0], [0.5, 1], col, tint);
      tris++;
    }
  } else {
    // A ring the clipper cannot read is rare and not worth a hole in the roof.
    for (let i = 0; i < n; i++) {
      const a = b.pts[i]!, d = b.pts[(i + 1) % n]!;
      pushUpTri(pos, nor, uv, b.height + 0.5, c, a, d, [0.5, 0.5], [0, 0], [1, 0], col, tint);
      tris++;
    }
  }
  // A parapet, so the edge is not a paper cut against the sky.
  for (let i = 0; i < n; i++) {
    const a = b.pts[i]!, d = b.pts[(i + 1) % n]!;
    pushSlope(pos, nor, uv, col, tint,
      [a.x, b.height, a.z], [d.x, b.height, d.z], [d.x, b.height + 0.5, d.z]);
    pushSlope(pos, nor, uv, col, tint,
      [a.x, b.height, a.z], [d.x, b.height + 0.5, d.z], [a.x, b.height + 0.5, a.z]);
    tris += 2;
  }
  return tris;
}

/** One sloped triangle with a real normal — roofs must not be lit as floors. */
function pushSlope(
  pos: number[], nor: number[], uv: number[], col: number[],
  rgb: [number, number, number],
  a: [number, number, number], b: [number, number, number], c: [number, number, number],
): void {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const L = Math.hypot(nx, ny, nz) || 1;
  nx /= L; ny /= L; nz /= L;
  // Keep it pointing up: the winding of an eave depends on the footprint's.
  const flip = ny < 0;
  const tri = flip ? [a, c, b] : [a, b, c];
  if (flip) { nx = -nx; ny = -ny; nz = -nz; }
  for (const p of tri) { pos.push(p[0], p[1], p[2]); nor.push(nx, ny, nz); }
  uv.push(0, 0, 1, 0, 0.5, 1);
  for (let i = 0; i < 3; i++) col.push(rgb[0], rgb[1], rgb[2]);
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
  pos: number[], nor: number[], uv: number[], col: number[],
  cx: number, cz: number,
): number {
  const n = b.pts.length;
  const h = b.height;
  let tris = 0;
  // One plaster colour for the whole building, with a hair of jitter so two
  // neighbours sharing a shade are not the same wall.
  const wall = rgbOf(tintFor(WALL_TINTS, cx, cz), ((Math.round(cz) % 5) - 2) * 0.018);

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
      col.push(wall[0], wall[1], wall[2]);
    }
    tris += 2;
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
  roofMaterial: THREE.Material,
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

  const groups: Record<string, { pos: number[]; nor: number[]; uv: number[]; col: number[]; tris: number }> = {};
  const colliders: { x: number; z: number; r: number }[] = [];
  const balconies: Balcony[] = [];
  let triangles = 0;

  // Roofs are their own bucket: one tile material for the whole district, and
  // the walls keep theirs. Two draw calls between them.
  const roofs = { pos: [] as number[], nor: [] as number[], uv: [] as number[], col: [] as number[] };

  for (const b of list) {
    const c = footprintCircle(b.pts);
    const g = KIND_TO_GROUP[b.kind] ?? 'stone';
    const bucket = groups[g] ?? (groups[g] = { pos: [], nor: [], uv: [], col: [], tris: 0 });
    const t = extrude(b, bucket.pos, bucket.nor, bucket.uv, bucket.col, c.x, c.z);
    bucket.tris += t;
    triangles += t;
    /*
     * A pitched roof on anything that is not a church — those have their own
     * shape and get it from the landmark builders — and not on the big flat
     * blocks, where a hip roof over a forty-metre span would be a marquee.
     */
    /*
     * A pitched roof only where the plan can carry one.
     *
     * Lofting every eave to a ridge works on a rectangle and folds into a
     * star — an umbrella — on a deeply concave courtyard plan, which Old Town
     * is full of. Compactness (4πA/P²) is 1 for a circle and falls away as a
     * plan gets spindly or notched; below about a third the result is not a
     * roof. Those get a flat top with a parapet, which is also true of plenty
     * of the real ones.
     */
    if (b.kind !== 3) {
      /*
       * A pitched roof belongs on a HOUSE.
       *
       * At a 34 m radius the rule was putting a hip roof over a sixty-metre
       * block, and a single ridge across that span is a marquee — the wide low
       * sheets floating over the district were not a bug in the geometry, they
       * were correct roofs on buildings far too big to have one. Sixteen metres
       * is about the largest footprint in the old town that really is one house
       * under one roof; bigger blocks get a flat top, which is what they have.
       */
      const pitched = c.r < 16 && compactness(b.pts) > 0.42
        ? hipRoof(b, c.x, c.z, roofs.pos, roofs.nor, roofs.uv, roofs.col)
        : -1;
      // −1 means the ridge would not have sat on the building. Flat, then.
      triangles += pitched >= 0
        ? pitched
        : flatRoof(three, b, c, roofs.pos, roofs.nor, roofs.uv, roofs.col);
    }

    /*
     * One collider per building, inscribed rather than enclosing.
     *
     * The enclosing circle of a long terrace reaches well past its ends and
     * would wall off the lane beside it; 0.62 of it is a compromise that keeps
     * the walker out of the building without closing the street. Old Town's
     * lanes are three metres wide, so this is not a detail.
     */
    colliders.push({ x: c.x, z: c.z, r: Math.max(1.2, c.r * 0.62) });

    /*
     * Hang a gallery off the longest wall, if this is a house with a first
     * floor to hang it from.
     *
     * The longest edge is a good proxy for the street frontage: a building's
     * biggest uninterrupted wall is almost always the one facing the road,
     * because that is the side the plot is measured from.
     */
    if (b.height >= 6 && b.height < 20 && c.r < 22) {
      let best = -1, bestLen = 0;
      for (let i = 0; i < b.pts.length; i++) {
        const p0 = b.pts[i]!, p1 = b.pts[(i + 1) % b.pts.length]!;
        const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
        if (len > bestLen) { bestLen = len; best = i; }
      }
      if (best >= 0 && bestLen >= 5.5) {
        const p0 = b.pts[best]!, p1 = b.pts[(best + 1) % b.pts.length]!;
        const dx = p1.x - p0.x, dz = p1.z - p0.z;
        const len = Math.hypot(dx, dz);
        // Outward normal of the edge, so the gallery hangs over the street and
        // not into the building.
        const nx = dz / len, nz = -dx / len;
        const mx = (p0.x + p1.x) / 2, mz = (p0.z + p1.z) / 2;
        balconies.push({
          x: mx + nx * 0.55, z: mz + nz * 0.55,
          yaw: Math.atan2(nx, nz),
          w: Math.min(bestLen - 1.2, 7),
          // On the first floor, which is where they are — never the ground.
          y: Math.min(b.height - 2.2, 3.6),
        });
      }
    }
  }

  const meshes: THREE.Mesh[] = [];
  for (const [name, g] of Object.entries(groups)) {
    if (!g.pos.length) continue;
    const geo = new three.BufferGeometry();
    geo.setAttribute('position', new three.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new three.Float32BufferAttribute(g.nor, 3));
    geo.setAttribute('uv', new three.Float32BufferAttribute(g.uv, 2));
    geo.setAttribute('color', new three.Float32BufferAttribute(g.col, 3));
    geo.computeBoundingSphere();
    const mesh = new three.Mesh(geo, materials[name as FacadeGroup]);
    mesh.matrixAutoUpdate = false;
    meshes.push(mesh);
  }

  if (roofs.pos.length) {
    const geo = new three.BufferGeometry();
    geo.setAttribute('position', new three.Float32BufferAttribute(roofs.pos, 3));
    geo.setAttribute('normal', new three.Float32BufferAttribute(roofs.nor, 3));
    geo.setAttribute('uv', new three.Float32BufferAttribute(roofs.uv, 2));
    geo.setAttribute('color', new three.Float32BufferAttribute(roofs.col, 3));
    geo.computeBoundingSphere();
    const mesh = new three.Mesh(geo, roofMaterial);
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

  return { meshes, colliders, balconies, buildings: list.length, triangles };
}

/**
 * Build the galleries as instanced parts.
 *
 * Three instanced meshes — deck, rail, posts — rather than a merged buffer,
 * because every balcony is the same shape at a different width, and an instance
 * can carry that in its matrix. A merged mesh would be six hundred copies of
 * the same eighty vertices.
 */
export function buildBalconies(
  three: typeof THREE, list: Balcony[], wood: THREE.Material, limit: number,
): THREE.Object3D[] {
  const use = list.slice(0, limit);
  if (!use.length) return [];
  const deckGeo = new three.BoxGeometry(1, 0.12, 1.25);
  const railGeo = new three.BoxGeometry(1, 0.09, 0.08);
  const postGeo = new three.BoxGeometry(0.07, 0.85, 0.07);

  const decks = new three.InstancedMesh(deckGeo, wood, use.length);
  const rails = new three.InstancedMesh(railGeo, wood, use.length);
  // Four uprights a balcony: the two ends and two between.
  const posts = new three.InstancedMesh(postGeo, wood, use.length * 4);

  const m = new three.Matrix4();
  const q = new three.Quaternion();
  const e = new three.Euler();
  const v = new three.Vector3();
  const sc = new three.Vector3();
  let pi = 0;
  use.forEach((b, i) => {
    e.set(0, b.yaw, 0); q.setFromEuler(e);
    v.set(b.x, b.y, b.z); sc.set(b.w, 1, 1);
    decks.setMatrixAt(i, m.compose(v, q, sc));
    v.set(b.x, b.y + 0.9, b.z);
    rails.setMatrixAt(i, m.compose(v, q, sc));
    // Uprights along the front edge, spaced across the width.
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
    for (let k = 0; k < 4; k++) {
      const t = (k / 3 - 0.5) * b.w * 0.92;
      v.set(b.x + rx * t + fx * 0.58, b.y + 0.48, b.z + rz * t + fz * 0.58);
      posts.setMatrixAt(pi++, m.compose(v, q, sc.set(1, 1, 1)));
      sc.set(b.w, 1, 1);
    }
  });
  decks.instanceMatrix.needsUpdate = true;
  rails.instanceMatrix.needsUpdate = true;
  posts.instanceMatrix.needsUpdate = true;
  return [decks, rails, posts];
}

/**
 * Plane trees along the streets.
 *
 * The renders from eye level were the problem this solves: the footprints are
 * real and the roofs are right, but between the walls and the kerb there was
 * nothing at all, and a hundred metres of bare cobble reads as a car park
 * rather than a city. Tbilisi's streets and its embankment are lined with
 * planes, so that is what goes in — set back off the kerb on both sides, and
 * dropped wherever one would be standing in a wall.
 *
 * Two InstancedMeshes for the lot. The foliage is a low-poly icosahedron
 * rather than a sphere: at dusk it is a mass with a silhouette, and a hundred
 * segments of it would be a hundred segments nobody sees.
 */
export interface TreeSpot { x: number; z: number; h: number; r: number; }

/**
 * Where the trees go — separated from the meshes so the placement rules can be
 * tested without standing up a renderer, the way the lamps and the cars are.
 */
export function treeSpots(
  roadsB64: string,
  o: {
    spacing: number; limit: number; minWidth: number;
    clearOf: { x: number; z: number; r: number }[];
  },
): TreeSpot[] {
  const roads = unpackRoads(b64ToBytes(roadsB64))
    .filter(r => r.width >= o.minWidth)
    .sort((a, b) => b.width - a.width);

  const spots: TreeSpot[] = [];
  // Deterministic: the city must be the same city on every load.
  let s = 0x7ea31;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967295; };

  /** Perpendicular distance from a point to a road's centreline. */
  const distTo = (r: { pts: { x: number; z: number }[] }, x: number, z: number) => {
    let best = Infinity;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i]!, b = r.pts[i + 1]!;
      const dx = b.x - a.x, dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
      const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
      if (d < best) best = d;
    }
    return best;
  };

  const free = (x: number, z: number) => {
    for (const c of o.clearOf) if (Math.hypot(c.x - x, c.z - z) < c.r + 2.2) return false;
    for (const p of spots) if (Math.hypot(p.x - x, p.z - z) < o.spacing * 0.55) return false;
    /*
     * Not in anybody else's road.
     *
     * Set back from its own kerb is not enough: where two streets meet, the
     * verge of one is the carriageway of the other, and a tree went up in the
     * middle of a junction. Every road gets a say, not just the one being
     * walked.
     */
    for (const r of roads) if (distTo(r, x, z) < r.width / 2) return false;
    return true;
  };

  for (const r of roads) {
    if (spots.length >= o.limit) break;
    let carried = rnd() * o.spacing;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i]!, b = r.pts[i + 1]!;
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;
      const ux = dx / len, uz = dz / len;
      let t = carried;
      while (t < len && spots.length < o.limit) {
        // Past the kerb and the lamps, on whichever side this one landed.
        const off = (r.width / 2 + 1.9) * (rnd() < 0.5 ? 1 : -1);
        const x = a.x + ux * t + uz * off, z = a.z + uz * t - ux * off;
        if (free(x, z)) spots.push({ x, z, h: 5.5 + rnd() * 3, r: 1.8 + rnd() * 1.1 });
        t += o.spacing;
      }
      carried = t - len;
    }
  }
  return spots;
}

export function buildTrees(
  three: typeof THREE,
  roadsB64: string,
  o: {
    spacing: number; limit: number; minWidth: number;
    clearOf: { x: number; z: number; r: number }[];
  },
): THREE.Object3D[] {
  const spots = treeSpots(roadsB64, o);
  if (!spots.length) return [];
  let s = 0x21f5b;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967295; };

  const trunkGeo = new three.CylinderGeometry(0.13, 0.21, 1, 6);
  const leafGeo = new three.IcosahedronGeometry(1, 1);
  const barkMat = new three.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 1 });
  const leafMat = new three.MeshStandardMaterial({ color: 0x3d5335, roughness: 1, flatShading: true });
  const trunks = new three.InstancedMesh(trunkGeo, barkMat, spots.length);
  const crowns = new three.InstancedMesh(leafGeo, leafMat, spots.length);

  const m = new three.Matrix4(), q = new three.Quaternion();
  const e = new three.Euler(), v = new three.Vector3(), sc = new three.Vector3();
  spots.forEach((p, i) => {
    // A little yaw so the facets do not all catch the moon the same way.
    e.set(0, rnd() * Math.PI * 2, 0); q.setFromEuler(e);
    v.set(p.x, p.h / 2, p.z); sc.set(1, p.h, 1);
    trunks.setMatrixAt(i, m.compose(v, q, sc));
    // Squashed a shade: a plane's crown is wider than it is tall.
    v.set(p.x, p.h + p.r * 0.55, p.z); sc.set(p.r, p.r * 0.82, p.r);
    crowns.setMatrixAt(i, m.compose(v, q, sc));
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  return [trunks, crowns];
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
 * Where to leave a car so it is on a street, facing along it.
 *
 * Placed from the road centrelines rather than scattered, for the same reason
 * the lamps are: a car dropped at random sits inside a wall or across a
 * building, and a car parked at a random angle looks abandoned rather than
 * parked. Yaw comes from the segment's own direction, so it points the way the
 * street goes.
 *
 * Only wide roads — a Volga does not fit up a three-metre lane in Abanotubani,
 * and neither does the camera that follows it.
 *
 * `anchor` is the reason this does not simply take the first spots it finds.
 *
 * It did, walking the widest roads first, and the result passed every test it
 * had: six cars, all on real streets, all pointing the right way, none inside a
 * building. They were also 241, 371, 409, 473, 508 and 513 metres from the
 * spawn — every one of them on the avenues across the river, because the
 * widest street within eighty metres of where you arrive is 6.4 m and the
 * filter was set at 7. A car you cannot reach is not a car you can drive. So
 * the first spot is the one nearest the anchor, and the rest are chosen by
 * farthest-point sampling, which spreads them over the district instead of
 * stringing them along whichever avenue happened to be widest.
 */
export function carSpots(
  roadsB64: string,
  o: {
    count: number; minWidth: number; apart: number;
    clearOf: { x: number; z: number; r: number }[];
    anchor?: { x: number; z: number };
    /**
     * How far from the anchor a car may be parked.
     *
     * Farthest-point sampling on its own goes to the corners: the eight cars
     * landed at 44 m and then 439 to 759, out at the edges of the extract,
     * with nothing in the district between. Bounding the candidates keeps the
     * spread inside the part of the city anybody is going to walk.
     */
    within?: number;
  },
): { x: number; z: number; yaw: number }[] {
  const roads = unpackRoads(b64ToBytes(roadsB64)).filter(r => r.width >= o.minWidth);

  /** Room for a 4.7 m saloon plus the door. */
  const clearOfWalls = (x: number, z: number) => {
    for (const c of o.clearOf) if (Math.hypot(c.x - x, c.z - z) < c.r + 3.4) return false;
    return true;
  };

  // Every mid-segment that could hold a car, before choosing between them.
  const cand: { x: number; z: number; yaw: number }[] = [];
  for (const r of roads) {
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i]!, b = r.pts[i + 1]!;
      const dx = b.x - a.x, dz = b.z - a.z;
      // Long enough to hold a car and still be a straight piece of road.
      if (Math.hypot(dx, dz) < 14) continue;
      const mx = a.x + dx * 0.5, mz = a.z + dz * 0.5;
      if (!clearOfWalls(mx, mz)) continue;
      /*
       * The engine drives vehicles along their local −Z, so a heading of
       * atan2(dx, dz) would point the car backwards down the street. The π
       * turn is that convention, not a fudge.
       */
      cand.push({ x: mx, z: mz, yaw: Math.atan2(dx, dz) + Math.PI });
    }
  }
  if (!cand.length) return [];

  const out: { x: number; z: number; yaw: number }[] = [];
  const anchor = o.anchor ?? cand[0]!;
  const pool = o.within === undefined ? cand
    : cand.filter(c => Math.hypot(c.x - anchor.x, c.z - anchor.z) <= o.within!);
  // Fall back to the whole district rather than returning nothing if the
  // radius is tighter than the street plan allows.
  const use = pool.length >= o.count ? pool : cand;

  // Nearest the anchor first: one car within walking distance of the spawn.
  let pick = 0, bestD = Infinity;
  use.forEach((c, i) => {
    const d = Math.hypot(c.x - anchor.x, c.z - anchor.z);
    if (d < bestD) { bestD = d; pick = i; }
  });
  out.push(use.splice(pick, 1)[0]!);

  // Then the one farthest from everything already placed, repeatedly.
  while (out.length < o.count && use.length) {
    let best = -1, bestScore = -Infinity;
    use.forEach((c, i) => {
      let near = Infinity;
      for (const p of out) near = Math.min(near, Math.hypot(p.x - c.x, p.z - c.z));
      if (near > bestScore) { bestScore = near; best = i; }
    });
    if (best < 0 || bestScore < o.apart) break;
    out.push(use.splice(best, 1)[0]!);
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
