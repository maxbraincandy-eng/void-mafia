/**
 * The things people actually recognise.
 *
 * OpenStreetMap gives this world its streets and the shape of its blocks, and
 * nothing at all about what a building looks like — there is no facade in the
 * data, and no roof shape worth the name. So the handful of objects that make a
 * skyline identifiable are modelled here by hand, the way every other world in
 * this folder is built: primitives, a seeded random, no downloaded assets.
 *
 * These are the ones that carry Tbilisi:
 *   the Mtatsminda mast   — the silhouette above the city, visible from
 *                           everywhere, and the thing that was asked for
 *   Narikala              — the fortress wall along the ridge
 *   the sulphur domes     — Abanotubani's brick blisters, unlike anything else
 *   a Georgian church     — the conical drum, reused for Sioni and Metekhi
 *   the Bridge of Peace   — the glass curve over the Mtkvari
 *
 * Everything is metres from the district origin at Meidan, matching the packed
 * street data.
 */

import type * as THREE from 'three';

/** Cheap deterministic noise, so the same city is built every time. */
let _s = 0x5eed71;
export function resetLandmarkSeed(): void { _s = 0x5eed71; }
function rnd(): number { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967295; }
function rr(a: number, b: number): number { return a + (b - a) * rnd(); }

export interface LandmarkCtx {
  three: typeof THREE;
  scene: THREE.Scene;
  disposables: (THREE.Texture | THREE.Material | THREE.BufferGeometry)[];
  addCollider(c: { x: number; z: number; r: number; h?: number }): void;
}

/**
 * The television mast on Mtatsminda.
 *
 * A lattice tower on the ridge above the city, lit at night. The real one is
 * about 275 m tall standing on a mountain that is itself some 400 m above the
 * river, which is why it is the one thing visible from every street in the old
 * town — and why it is built here at full height rather than scaled to fit.
 *
 * The lattice is four legs and a ladder of cross-bracing rather than a truss
 * mesh: at the distance it is always seen from, the silhouette is the whole of
 * it, and a real space-frame would be thousands of triangles nobody resolves.
 */
export function mtatsmindaMast(ctx: LandmarkCtx, x: number, baseY: number, z: number): void {
  const { three: T, scene } = ctx;
  const g = new T.Group();
  g.position.set(x, baseY, z);

  const steel = new T.MeshStandardMaterial({ color: 0x8a8f9c, roughness: 0.7, metalness: 0.5 });
  const lamp = new T.MeshBasicMaterial({ color: 0xff4d4d, toneMapped: false });
  ctx.disposables.push(steel, lamp);

  const H = 275;
  const baseHalf = 13;      // leg spread at the ground
  const topHalf = 1.6;      // and at the top

  // Four legs, tapering — a cylinder leaning inwards is far cheaper than a
  // lofted profile and reads identically past a hundred metres.
  const legGeo = new T.CylinderGeometry(0.5, 1.1, H, 6);
  ctx.disposables.push(legGeo);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const leg = new T.Mesh(legGeo, steel);
    const dx = (baseHalf - topHalf) / 2 * sx;
    const dz = (baseHalf - topHalf) / 2 * sz;
    leg.position.set(sx * (baseHalf + topHalf) / 4, H / 2, sz * (baseHalf + topHalf) / 4);
    // Lean each leg in towards the axis by the taper over the height.
    leg.rotation.z = -Math.atan2(dx, H);
    leg.rotation.x = Math.atan2(dz, H);
    g.add(leg);
  }

  // Cross-bracing: a ring every twelve metres, shrinking with the taper.
  const ringGeo = new T.TorusGeometry(1, 0.22, 4, 10);
  ctx.disposables.push(ringGeo);
  for (let y = 10; y < H; y += 12) {
    const t = y / H;
    const half = baseHalf * (1 - t) + topHalf * t;
    const ring = new T.Mesh(ringGeo, steel);
    ring.scale.set(half, half, 1);
    ring.position.y = y;
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }

  // The mast above the lattice, and the aircraft warning lights that make it
  // read at night from the far bank.
  const spire = new T.Mesh(new T.CylinderGeometry(0.25, 0.7, 46, 6), steel);
  spire.position.y = H + 23;
  g.add(spire);
  const bulbGeo = new T.SphereGeometry(1.5, 6, 5);
  ctx.disposables.push(bulbGeo);
  for (const y of [H * 0.45, H * 0.72, H + 46]) {
    const b = new T.Mesh(bulbGeo, lamp);
    b.position.y = y;
    g.add(b);
  }

  scene.add(g);
}

/**
 * The ridge Mtatsminda and Narikala stand on.
 *
 * Not a heightmap — there is no elevation data in this world's asset budget, so
 * this is a shaped ridge that rises south-west of the river, which is where the
 * real one is. It exists to put the mast and the fortress somewhere believable
 * and to close the view out of the old town; walking up it is not offered, and
 * the collider ring says so.
 *
 * `crestY` is deliberately a parameter rather than a constant: the honest
 * version of this world one day reads a DEM, and the only thing that changes is
 * where these numbers come from.
 */
export function mtatsmindaRidge(
  ctx: LandmarkCtx,
  o: { x: number; z: number; length: number; width: number; crestY: number; yaw: number },
): void {
  const { three: T, scene } = ctx;
  const SEG = 48;
  const geo = new T.PlaneGeometry(o.length, o.width, SEG, 18);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / o.length;          // −0.5 … 0.5 along the ridge
    const v = pos.getY(i) / o.width;           // −0.5 … 0.5 across it
    // A cosine hump across, tapering at both ends, roughened a little so it is
    // not a machined extrusion.
    const across = Math.cos(Math.min(Math.abs(v) * Math.PI, Math.PI / 2));
    const along = Math.cos(Math.min(Math.abs(u) * Math.PI * 0.9, Math.PI / 2));
    const bump = Math.sin(u * 31) * Math.cos(v * 17) * 0.06;
    pos.setZ(i, o.crestY * Math.max(0, across * along + bump));
  }
  geo.computeVertexNormals();
  const mat = new T.MeshStandardMaterial({ color: 0x2b2f27, roughness: 1, flatShading: true });
  ctx.disposables.push(geo, mat);
  const m = new T.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = o.yaw;
  m.position.set(o.x, 0, o.z);
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  scene.add(m);
}

/**
 * Narikala — a curtain wall with square towers, following the ridge.
 *
 * The fortress is a line of wall rather than a building, so it is built as a
 * path: the caller gives the crest it should sit on and this walks it.
 */
export function narikala(
  ctx: LandmarkCtx,
  pts: { x: number; y: number; z: number }[],
): void {
  const { three: T, scene } = ctx;
  const stone = new T.MeshStandardMaterial({ color: 0x6b6154, roughness: 0.95 });
  ctx.disposables.push(stone);
  const g = new T.Group();

  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1) continue;
    const h = 9;
    const seg = new T.Mesh(new T.BoxGeometry(len, h, 2.6), stone);
    seg.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + h / 2, (a.z + b.z) / 2);
    seg.rotation.y = -Math.atan2(dz, dx);
    g.add(seg);

    // A tower at every joint — square, taller than the wall, which is what the
    // real one looks like along the ridge.
    const tw = new T.Mesh(new T.BoxGeometry(6, h + 6, 6), stone);
    tw.position.set(a.x, a.y + (h + 6) / 2, a.z);
    g.add(tw);
    ctx.addCollider({ x: a.x, z: a.z, r: 4 });
  }
  scene.add(g);
}

/**
 * A Georgian church.
 *
 * The form that makes one recognisable at a glance is a cross plan under a
 * drum, with a CONE on top rather than a dome — which is what separates it from
 * every Byzantine or Russian church people might otherwise read it as. Reused
 * for Sioni, Metekhi and Anchiskhati because they genuinely share it; the
 * proportions differ and the caller sets them.
 */
export function georgianChurch(
  ctx: LandmarkCtx,
  o: { x: number; y: number; z: number; scale?: number; yaw?: number },
): void {
  const { three: T, scene } = ctx;
  const s = o.scale ?? 1;
  const stone = new T.MeshStandardMaterial({ color: 0xa89b84, roughness: 0.9 });
  const roof = new T.MeshStandardMaterial({ color: 0x4a4f52, roughness: 0.8 });
  ctx.disposables.push(stone, roof);
  const g = new T.Group();
  g.position.set(o.x, o.y, o.z);
  g.rotation.y = o.yaw ?? 0;
  g.scale.setScalar(s);

  // The cross: two barrel-roofed arms crossing at the centre.
  const armL = new T.Mesh(new T.BoxGeometry(18, 11, 8), stone);
  armL.position.y = 5.5; g.add(armL);
  const armS = new T.Mesh(new T.BoxGeometry(8, 11, 15), stone);
  armS.position.y = 5.5; g.add(armS);

  // Gabled caps, so the arms are not flat-topped boxes.
  const capGeo = new T.CylinderGeometry(4.6, 4.6, 8.2, 3, 1, false);
  ctx.disposables.push(capGeo);
  const capA = new T.Mesh(capGeo, roof);
  capA.rotation.set(0, 0, Math.PI / 2); capA.position.set(0, 11.6, 0); capA.scale.set(1, 2.2, 1);
  g.add(capA);

  // The drum and its cone — the silhouette that names it.
  const drum = new T.Mesh(new T.CylinderGeometry(4.2, 4.2, 10, 12), stone);
  drum.position.y = 16; g.add(drum);
  const cone = new T.Mesh(new T.ConeGeometry(5.4, 7.5, 12), roof);
  cone.position.y = 24.7; g.add(cone);
  const cross = new T.Mesh(new T.BoxGeometry(0.3, 2.4, 0.3), roof);
  cross.position.y = 29.6; g.add(cross);
  const crossArm = new T.Mesh(new T.BoxGeometry(1.3, 0.3, 0.3), roof);
  crossArm.position.y = 30.1; g.add(crossArm);

  scene.add(g);
  ctx.addCollider({ x: o.x, z: o.z, r: 9 * s });
}

/**
 * Abanotubani — the sulphur baths.
 *
 * Brick domes sitting almost flush with the ground, each with a little glazed
 * lantern at the crown. There is nothing else in the city that looks like this,
 * and it is what most photographs of Tbilisi are of.
 */
export function sulphurDomes(
  ctx: LandmarkCtx,
  o: { x: number; z: number; count?: number; spread?: number },
): void {
  const { three: T, scene } = ctx;
  const brick = new T.MeshStandardMaterial({ color: 0x8d6a4f, roughness: 0.95 });
  const glass = new T.MeshStandardMaterial({
    color: 0xffdca8, roughness: 0.3, emissive: 0xffb562, emissiveIntensity: 0.8,
  });
  ctx.disposables.push(brick, glass);
  const domeGeo = new T.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const lanternGeo = new T.CylinderGeometry(0.5, 0.62, 0.9, 8);
  ctx.disposables.push(domeGeo, lanternGeo);

  const g = new T.Group();
  const n = o.count ?? 7;
  const spread = o.spread ?? 26;
  for (let i = 0; i < n; i++) {
    const r = rr(2.6, 4.4);
    const px = o.x + rr(-spread, spread);
    const pz = o.z + rr(-spread * 0.55, spread * 0.55);
    const dome = new T.Mesh(domeGeo, brick);
    dome.scale.set(r, r * 0.72, r);
    dome.position.set(px, 0.25, pz);
    g.add(dome);
    const lantern = new T.Mesh(lanternGeo, glass);
    lantern.scale.setScalar(r * 0.42);
    lantern.position.set(px, 0.25 + r * 0.72, pz);
    g.add(lantern);
    ctx.addCollider({ x: px, z: pz, r: r * 0.9 });
  }
  scene.add(g);
}

/**
 * The Bridge of Peace.
 *
 * A bow-shaped steel-and-glass canopy over the Mtkvari, lit from inside. Built
 * as a deck on an arc with a curved roof of ribs — the real canopy is a doubly
 * curved shell, and a rib cage is both the honest simplification and the thing
 * that actually reads from underneath, which is where it is usually seen from.
 */
export function bridgeOfPeace(
  ctx: LandmarkCtx,
  o: { x: number; z: number; yaw: number; span: number },
): void {
  const { three: T, scene } = ctx;
  const deckMat = new T.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.8 });
  const steel = new T.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.45, metalness: 0.7 });
  const glow = new T.MeshBasicMaterial({ color: 0x9fd8ff, toneMapped: false, transparent: true, opacity: 0.55 });
  ctx.disposables.push(deckMat, steel, glow);

  const g = new T.Group();
  g.position.set(o.x, 0, o.z);
  g.rotation.y = o.yaw;

  const SEG = 26;
  const rise = 4.5;
  // The deck: a shallow arc of short plates, which also gives the walker a
  // surface that follows the curve instead of a flat plank.
  for (let i = 0; i < SEG; i++) {
    const t0 = i / SEG - 0.5, t1 = (i + 1) / SEG - 0.5;
    const y0 = 6 + rise * Math.cos(t0 * Math.PI);
    const y1 = 6 + rise * Math.cos(t1 * Math.PI);
    const x0 = t0 * o.span, x1 = t1 * o.span;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const plate = new T.Mesh(new T.BoxGeometry(len, 0.5, 9), deckMat);
    plate.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    plate.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    g.add(plate);

    // A rib every other plate, and a pane of glow between them.
    if (i % 2 === 0) {
      const h = 5.2;
      const rib = new T.Mesh(new T.TorusGeometry(4.6, 0.16, 5, 12, Math.PI), steel);
      rib.position.set((x0 + x1) / 2, (y0 + y1) / 2 + 0.3, 0);
      rib.rotation.y = Math.PI / 2;
      g.add(rib);
      const pane = new T.Mesh(new T.PlaneGeometry(len * 2, h), glow);
      pane.position.set((x0 + x1) / 2, (y0 + y1) / 2 + h / 2 + 0.4, 4.5);
      g.add(pane);
      const pane2 = pane.clone();
      pane2.position.z = -4.5; pane2.rotation.y = Math.PI;
      g.add(pane2);
    }
  }

  // Piers in the water at the quarter points.
  for (const t of [-0.28, 0.28]) {
    const pier = new T.Mesh(new T.CylinderGeometry(1.6, 2.2, 12, 8), deckMat);
    pier.position.set(t * o.span, 0, 0);
    g.add(pier);
  }

  scene.add(g);
}
