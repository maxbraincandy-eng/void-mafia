/**
 * OpenStreetMap → a district this game can actually draw.
 *
 * Run once, by hand, and commit the result. Nothing here ships to a browser:
 * the app has no runtime asset fetching for worlds and this keeps it that way.
 * What ships is the packed output — a few tens of kilobytes of geometry.
 *
 *   node client/tools/osmExtract.mjs <dir-of-osm-json> <out.ts>
 *
 * WHY PACK AT ALL
 * ───────────────
 * The raw Overpass answer for eight hundred metres of Old Town is megabytes of
 * JSON: full precision lat/lon as decimal strings, every tag, every node id.
 * Almost none of that survives into a mesh. Projected to local metres and
 * quantised to decimetres, a building footprint is about twenty-six bytes, and
 * the whole district fits in less than one of the seven worlds already in the
 * bundle.
 *
 * WHY DECIMETRES
 * ──────────────
 * int16 decimetres reaches ±3.2 km, which is four times the district, and
 * resolves 10 cm — an order of magnitude finer than a wall is thick. Metres
 * would visibly square off the diagonal streets of Abanotubani; float32 would
 * double the size to record noise that nobody can see.
 *
 * DATA © OpenStreetMap contributors, ODbL (opendatacommons.org/licenses/odbl).
 * The licence requires attribution wherever this is shown, and the world draws
 * it on screen. Do not remove it.
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

// ── Projection ───────────────────────────────────────────────────────────────
/**
 * Equirectangular about a local origin.
 *
 * Good enough because the district is under a kilometre: over that span the
 * error against a proper conformal projection is centimetres, well inside the
 * decimetre the output is quantised to anyway. A UTM implementation would be
 * more correct and indistinguishable.
 */
const R = 6378137;
export function projector(lat0, lon0) {
  const k = Math.cos((lat0 * Math.PI) / 180);
  return (lat, lon) => ({
    // East is +x, NORTH is −z: three.js looks down −z, so a scene laid out this
    // way has north away from the camera at the default yaw, which is what a
    // map-shaped world wants.
    x: ((lon - lon0) * Math.PI / 180) * R * k,
    z: -((lat - lat0) * Math.PI / 180) * R,
  });
}

// ── Footprint tidying ────────────────────────────────────────────────────────
/** Ring area via the shoelace, in m². Sign tells us the winding. */
function signedArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j].x * pts[i].z) - (pts[i].x * pts[j].z);
  }
  return a / 2;
}

/**
 * Drop vertices that carry no shape, Douglas–Peucker style.
 *
 * OSM footprints are traced off aerial imagery and carry runs of points a few
 * centimetres apart along what is plainly one straight wall. At 0.4 m the
 * outline is unchanged to the eye and the vertex count roughly halves, which is
 * both the file size and the triangle count.
 */
function simplify(pts, tol = 0.4) {
  if (pts.length < 4) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let far = -1, best = tol;
    const ax = pts[a].x, az = pts[a].z;
    const dx = pts[b].x - ax, dz = pts[b].z - az;
    const len = Math.hypot(dx, dz) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i].x - ax) * dz - (pts[i].z - az) * dx) / len;
      if (d > best) { best = d; far = i; }
    }
    if (far > 0) { keep[far] = true; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// ── Clipping ─────────────────────────────────────────────────────────────────
/**
 * The district's own edge, in metres from the origin.
 *
 * Overpass returns WHOLE ways, not the part inside the bounding box. Ask for
 * the buildings in eight hundred metres of Old Town and you also get the entire
 * Mtkvari — a polygon four kilometres across, because one bank of it happens to
 * clip the corner. Packed as int16 decimetres that runs past ±3276 m and the
 * far points are silently clamped onto the limit, which folds the river into a
 * degenerate spike and takes the triangulator down with it.
 *
 * So everything is clipped to the district before it is packed. This bound is
 * comfortably outside the bbox that was fetched and comfortably inside what the
 * format can hold.
 */
const CLIP_M = 700;

/**
 * Sutherland–Hodgman against an axis-aligned box.
 *
 * Chosen over a general clipper because the boundary is four half-planes and
 * this is twenty lines with no special cases: it handles the river entering and
 * leaving the district several times, which is what it actually does.
 */
function clipPolygon(pts, m = CLIP_M) {
  const edges = [
    { inside: p => p.x >= -m, at: (a, b) => lerpTo(a, b, (-m - a.x) / (b.x - a.x)) },
    { inside: p => p.x <= m, at: (a, b) => lerpTo(a, b, (m - a.x) / (b.x - a.x)) },
    { inside: p => p.z >= -m, at: (a, b) => lerpTo(a, b, (-m - a.z) / (b.z - a.z)) },
    { inside: p => p.z <= m, at: (a, b) => lerpTo(a, b, (m - a.z) / (b.z - a.z)) },
  ];
  let out = pts;
  for (const e of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const cur = src[i], prev = src[(i + src.length - 1) % src.length];
      const ci = e.inside(cur), pi = e.inside(prev);
      if (ci) { if (!pi) out.push(e.at(prev, cur)); out.push(cur); }
      else if (pi) out.push(e.at(prev, cur));
    }
    if (!out.length) return [];
  }
  return out;
}
function lerpTo(a, b, t) { return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }; }

/** A polyline clipped to the district, as the runs that stayed inside. */
function clipPolyline(pts, m = CLIP_M) {
  const runs = [];
  let cur = [];
  const inside = p => p.x >= -m && p.x <= m && p.z >= -m && p.z <= m;
  for (const p of pts) {
    if (inside(p)) cur.push(p);
    else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  return runs.filter(r => r.length >= 2);
}

// ── Heights ──────────────────────────────────────────────────────────────────
/** Metres per storey. Old Town's are tall — nineteenth-century, high ceilings. */
const STOREY_M = 3.4;

/**
 * How tall this building is, and whether anybody actually said so.
 *
 * The distinction is the honest part. OSM carries a real height for a small
 * minority of Tbilisi's buildings; for the rest this guesses from what the
 * building IS and how big its footprint is, which produces a believable skyline
 * rather than a surveyed one. The flag rides along so the world can say so, and
 * so a later pass can tell what still needs a source.
 */
export function heightOf(tags) {
  const h = parseFloat(tags.height ?? '');
  if (Number.isFinite(h) && h > 1 && h < 300) return { m: h, real: true };
  const lv = parseFloat(tags['building:levels'] ?? '');
  if (Number.isFinite(lv) && lv >= 1 && lv < 90) return { m: lv * STOREY_M, real: true };

  const kind = tags.building ?? 'yes';
  // Things whose shape is dictated by their job rather than by their plot.
  const fixed = {
    church: 18, cathedral: 26, chapel: 9, mosque: 16, synagogue: 14,
    garage: 3, garages: 3, shed: 3, hut: 3, kiosk: 3, roof: 4,
    ruins: 5, castle: 14, tower: 24,
  }[kind];
  if (fixed) return { m: fixed, real: false };
  return { m: 0, real: false };   // filled in once the footprint area is known
}

/**
 * The fallback, once we know how big the footprint is.
 *
 * Old Town is two to four storeys and the exceptions are institutional. Area is
 * a decent proxy: a 40 m² house on a lane is not six floors, and a 1200 m²
 * block on the embankment is not one.
 */
function estimateFromArea(area) {
  if (area < 60) return 2 * STOREY_M;
  if (area < 200) return 3 * STOREY_M;
  if (area < 600) return 4 * STOREY_M;
  return 5 * STOREY_M;
}

// ── Packing ──────────────────────────────────────────────────────────────────
const DM = 10;                       // decimetres per metre
const q = (m) => Math.max(-32768, Math.min(32767, Math.round(m * DM)));

/**
 * Buildings → bytes.
 *
 *   u8   vertex count (a ring with more than 255 corners is split off earlier)
 *   u8   height in decimetres ÷ 4, so one byte reaches 102 m at 40 cm steps
 *   u8   kind, an index into KINDS
 *   i16  x, i16 z  × count
 */
export const KINDS = ['yes', 'house', 'apartments', 'church', 'commercial', 'retail', 'civic', 'ruins', 'garage'];
const HEIGHT_STEP = 0.4;

export function packBuildings(list) {
  const bytes = [];
  const push16 = (v) => { bytes.push(v & 0xff, (v >> 8) & 0xff); };
  for (const b of list) {
    bytes.push(b.pts.length);
    bytes.push(Math.max(1, Math.min(255, Math.round(b.height / HEIGHT_STEP))));
    bytes.push(Math.max(0, KINDS.indexOf(b.kind)));
    for (const p of b.pts) { push16(q(p.x)); push16(q(p.z)); }
  }
  return Uint8Array.from(bytes);
}

/** Road centrelines → bytes. Same shape, with a width instead of a height. */
export function packRoads(list) {
  const bytes = [];
  const push16 = (v) => { bytes.push(v & 0xff, (v >> 8) & 0xff); };
  for (const r of list) {
    bytes.push(Math.min(255, r.pts.length));
    bytes.push(Math.max(1, Math.min(255, Math.round(r.width * 10))));  // decimetres
    for (const p of r.pts.slice(0, 255)) { push16(q(p.x)); push16(q(p.z)); }
  }
  return Uint8Array.from(bytes);
}

/**
 * The river, as a filled outline.
 *
 * A u16 count, because the Mtkvari's bank through the old town is nearly a
 * thousand points and everything else here fits in a byte. Packed as one ring
 * per water body; the builder ear-clips them, since a river is far too concave
 * for the centroid fan the buildings use.
 */
export function packWater(rings) {
  const bytes = [];
  const push16 = (v) => { bytes.push(v & 0xff, (v >> 8) & 0xff); };
  for (const ring of rings) {
    push16(ring.length);
    for (const p of ring) { push16(q(p.x)); push16(q(p.z)); }
  }
  return Uint8Array.from(bytes);
}

/** How wide to draw a street that OSM only gives a classification for. */
export function roadWidth(tags) {
  const w = parseFloat(tags.width ?? '');
  if (Number.isFinite(w) && w > 0.5 && w < 40) return w;
  const lanes = parseFloat(tags.lanes ?? '');
  if (Number.isFinite(lanes) && lanes >= 1) return Math.min(24, lanes * 3.2);
  return {
    motorway: 16, trunk: 14, primary: 12, secondary: 10, tertiary: 8,
    residential: 6.5, unclassified: 6, service: 4,
    living_street: 5, pedestrian: 5, footway: 2.2, path: 1.8, steps: 2.2, track: 3,
  }[tags.highway] ?? 5;
}

// ── The run ──────────────────────────────────────────────────────────────────
function ringOf(way, project) {
  const g = way.geometry?.filter(Boolean) ?? [];
  if (g.length < 4) return null;
  let pts = g.map(p => project(p.lat, p.lon));
  // Overpass closes a ring by repeating the first node; the mesh does not want
  // it twice.
  const first = pts[0], last = pts[pts.length - 1];
  if (Math.hypot(first.x - last.x, first.z - last.z) < 0.2) pts = pts.slice(0, -1);
  pts = simplify(pts);
  if (pts.length < 3 || pts.length > 255) return null;
  // Counter-clockwise, so the extruder does not have to care about winding.
  if (signedArea(pts) < 0) pts.reverse();
  return pts;
}

function kindOf(tags) {
  const b = tags.building ?? 'yes';
  if (KINDS.includes(b)) return b;
  if (b === 'cathedral' || b === 'chapel' || b === 'mosque' || b === 'synagogue') return 'church';
  if (b === 'detached' || b === 'residential' || b === 'terrace') return 'house';
  if (b === 'office' || b === 'industrial' || b === 'warehouse') return 'commercial';
  if (b === 'public' || b === 'government' || b === 'school' || b === 'hospital' || b === 'university') return 'civic';
  if (b === 'garages' || b === 'shed' || b === 'hut') return 'garage';
  return 'yes';
}

function main() {
  const [dir, out] = process.argv.slice(2);
  if (!dir || !out) {
    console.error('usage: node osmExtract.mjs <dir-of-osm-json> <out.ts>');
    process.exit(2);
  }
  const read = (n) => JSON.parse(readFileSync(path.join(dir, `${n}.json`), 'utf8'));

  // The origin: Meidan, near enough. Everything is metres from here.
  const ORIGIN = { lat: 41.6911, lon: 44.8090 };
  const project = projector(ORIGIN.lat, ORIGIN.lon);

  // ── Buildings ──
  const rawB = read('buildings').elements.filter(e => e.type === 'way' && e.geometry);
  let realHeights = 0;
  const buildings = [];
  for (const w of rawB) {
    let pts = ringOf(w, project);
    if (!pts) continue;
    pts = clipPolygon(pts);
    if (pts.length < 3 || pts.length > 255) continue;
    const tags = w.tags ?? {};
    const area = Math.abs(signedArea(pts));
    if (area < 12) continue;                 // sheds and mapping noise
    let { m, real } = heightOf(tags);
    if (!m) m = estimateFromArea(area);
    if (real) realHeights++;
    buildings.push({ pts, height: Math.min(101, m), kind: kindOf(tags), area, name: tags.name ?? null });
  }
  buildings.sort((a, b) => b.area - a.area);

  // ── Roads ──
  const SKIP = new Set(['proposed', 'construction', 'raceway', 'bus_guideway']);
  const roads = [];
  for (const w of read('roads').elements) {
    if (w.type !== 'way' || !w.geometry || SKIP.has(w.tags?.highway)) continue;
    const whole = w.geometry.map(p => project(p.lat, p.lon));
    for (const run of clipPolyline(whole)) {
      const pts = simplify(run, 0.6);
      if (pts.length < 2) continue;
      roads.push({ pts, width: roadWidth(w.tags ?? {}), name: w.tags?.name ?? null });
    }
  }

  /*
   * The Mtkvari.
   *
   * OSM maps the river through the city as a `natural=water` polygon — the
   * actual bank, nearly a thousand points of it — rather than a line with a
   * width. Using that is the difference between the river being where it is and
   * a ribbon drawn between two bridges. Simplified harder than the buildings:
   * a riverbank is a natural edge and nobody is going to notice a metre of it.
   */
  const waterRings = [];
  for (const w of read('water').elements) {
    if (w.type !== 'way' || !w.geometry) continue;
    const t = w.tags ?? {};
    if (t.natural !== 'water' && t.waterway !== 'riverbank') continue;
    if (w.geometry.length < 20) continue;          // ponds and mapping scraps
    let pts = w.geometry.map(p => project(p.lat, p.lon));
    const f = pts[0], l = pts[pts.length - 1];
    if (Math.hypot(f.x - l.x, f.z - l.z) < 0.5) pts = pts.slice(0, -1);
    pts = clipPolygon(pts);
    if (pts.length < 3) continue;
    pts = simplify(pts, 1.5);
    // Positive winding, to match the buildings and to give the triangulator a
    // contour it can read without guessing.
    if (signedArea(pts) < 0) pts.reverse();
    if (pts.length >= 3) waterRings.push(pts);
  }

  // ── Landmarks: real positions for the things worth hand-modelling ──
  const landmarks = [];
  for (const e of read('landmarks').elements) {
    const t = e.tags ?? {};
    if (!t.name) continue;
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null) continue;
    const p = project(lat, lon);
    landmarks.push({ name: t.name, x: +p.x.toFixed(1), z: +p.z.toFixed(1), kind: t.historic ?? t.tourism ?? t.amenity ?? t.man_made ?? '' });
  }

  /*
   * Landmarks outside the bounding box that the district can still see.
   *
   * The mast is two kilometres west and four hundred metres up; it is the one
   * thing visible from every street in the old town, so leaving it out because
   * it fell outside the extract would miss the point. Coordinates and height
   * are OSM's own (way `თბილისის ტელეანძა`, height=274.5), not estimates.
   */
  const OUTSIDE = [
    { name: 'თბილისის ტელეანძა', lat: 41.6958161, lon: 44.7849547, height: 274.5, kind: 'mast' },
  ];
  for (const o of OUTSIDE) {
    const p2 = project(o.lat, o.lon);
    landmarks.push({ name: o.name, x: +p2.x.toFixed(1), z: +p2.z.toFixed(1), kind: o.kind, height: o.height });
  }

  const bBytes = packBuildings(buildings);
  const rBytes = packRoads(roads);
  const wBytes = packWater(waterRings);
  const b64 = (u8) => Buffer.from(u8).toString('base64');

  const ts = `/**
 * ძველი თბილისი, packed.
 *
 * GENERATED — do not edit by hand. Regenerate with:
 *   node client/tools/osmExtract.mjs <osm-json-dir> ${path.basename(out)}
 *
 * Data © OpenStreetMap contributors, made available under the Open Database
 * Licence (ODbL). The licence requires that attribution travels with the data;
 * the world draws it on screen and that credit must not be removed.
 *
 * Buildings: ${buildings.length} (${realHeights} with a height somebody actually
 * surveyed — ${(100 * realHeights / buildings.length).toFixed(1)}%; the rest are
 * estimated from footprint area and building type, so the skyline is plausible
 * rather than measured).
 * Roads: ${roads.length}. Water rings: ${waterRings.length} (${waterRings.reduce((n, r) => n + r.length, 0)} points).
 * Origin: ${ORIGIN.lat}, ${ORIGIN.lon} — x is east, z is south, both in metres.
 */

export const TBILISI_ORIGIN = { lat: ${ORIGIN.lat}, lon: ${ORIGIN.lon} };
export const TBILISI_STATS = {
  buildings: ${buildings.length},
  roads: ${roads.length},
  surveyedHeights: ${realHeights},
  surveyedPct: ${+(100 * realHeights / buildings.length).toFixed(1)},
};
export const BUILDING_KINDS = ${JSON.stringify(KINDS)} as const;
/** u8 count, u8 height÷0.4 m, u8 kind, then count × (i16 x, i16 z) decimetres. */
export const TBILISI_BUILDINGS_B64 = '${b64(bBytes)}';
/** u8 count, u8 width in decimetres, then count × (i16 x, i16 z) decimetres. */
export const TBILISI_ROADS_B64 = '${b64(rBytes)}';
/** u16 count, then count × (i16 x, i16 z) decimetres. One ring per water body. */
export const TBILISI_WATER_B64 = '${b64(wBytes)}';
export const TBILISI_LANDMARKS = ${JSON.stringify(landmarks, null, 1)} as const;
`;

  writeFileSync(out, ts);
  console.error(JSON.stringify({
    buildings: buildings.length,
    surveyedHeights: realHeights,
    surveyedPct: +(100 * realHeights / buildings.length).toFixed(1),
    roads: roads.length,
    landmarks: landmarks.length,
    buildingBytes: bBytes.length,
    roadBytes: rBytes.length,
    waterRings: waterRings.length,
    waterBytes: wBytes.length,
    tsBytes: ts.length,
    avgVerticesPerBuilding: +(buildings.reduce((n, b) => n + b.pts.length, 0) / buildings.length).toFixed(1),
  }, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
