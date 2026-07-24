// ── Premium World: Cyber Lounge ───────────────────────────────────────
// A neon night-club lounge — dark reflective floor, glowing grid, holographic
// centrepiece, a neon bar, booths, a pulsing dance floor and a big screen.
// Everything is procedural (no downloads). Built for performance: neon is done
// with unlit/emissive materials (no per-light cost), the dance floor is a single
// InstancedMesh, particles are one Points cloud, only two real lights exist, and
// heavy per-frame work throttles off when ctx.perf.reduced is set.
import * as THREE from 'three';
import type { WorldDef, WorldContext } from './types';
import { tNow } from '@/store/langStore';

const HW = 15;          // half-width  (x: -15..15)
const HD = 13;          // half-depth  (z: -13..13)
const WALL_H = 5.5;

const CYAN = 0x00e5ff, MAGENTA = 0xff2bd6, PURPLE = 0x9b5cff, PINK = 0xff4d8d, BLUE = 0x3a7bff;
const NEON = [CYAN, MAGENTA, PURPLE, PINK, BLUE];

let _s = 4242421;
function rnd() { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967295; }

// Cheap unlit neon material (no lighting cost). Reused via a small cache.
const _neonCache = new Map<number, THREE.MeshBasicMaterial>();
function neon(color: number): THREE.MeshBasicMaterial {
  let m = _neonCache.get(color);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, toneMapped: false }); _neonCache.set(color, m); }
  return m;
}

export const cyberLounge: WorldDef = {
  id: 'cyber_lounge',
  name: 'Cyber Lounge',
  subtitle: 'ნეონის ქალაქი · კლუბი · ხმა',
  icon: '🌆',
  status: 'live',
  spawn: { x: 0, z: HD - 4, yaw: Math.PI },
  fog: { color: 0x0a0620, density: 0.03 },
  clear: 0x06030f,

  build(ctx: WorldContext) {
    _s = 4242421;
    _neonCache.clear();
    buildShell(ctx);
    buildFloorGrid(ctx);
    buildCeiling(ctx);
    buildBar(ctx);
    buildBooths(ctx);
    buildDanceFloor(ctx);
    buildScreen(ctx);
    buildHologram(ctx);
    buildDjBooth(ctx);
    buildPillars(ctx);
    buildDust(ctx);

    ctx.ambientLight.color.setHex(0x2a1840);
    ctx.ambientLight.intensity = 0.55;
    ctx.moon.intensity = 0.25;
    ctx.moon.color.setHex(0x6a7bff);

    ctx.addAmbient({ kind: 'night', x: 0, z: 0, radius: 120 });
  },
};

// ── Room shell: floor, walls (+ neon trim), wall colliders ─────────────
function buildShell(ctx: WorldContext) {
  const { scene } = ctx;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HW * 2, HD * 2),
    new THREE.MeshStandardMaterial({ color: 0x0a0a16, metalness: 0.75, roughness: 0.35 }),
  );
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x0d0a1c, roughness: 0.85, metalness: 0.2 });
  const walls: Array<[number, number, number, number, number]> = [
    // x, z, w(x-span), d(z-span), trim-color
    [0, -HD, HW * 2, 0.4, CYAN],   // front (screen wall)
    [0, HD, HW * 2, 0.4, MAGENTA], // back
    [-HW, 0, 0.4, HD * 2, PURPLE], // left
    [HW, 0, 0.4, HD * 2, BLUE],    // right
  ];
  for (const [x, z, w, d, trim] of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat);
    wall.position.set(x, WALL_H / 2, z); scene.add(wall);
    // neon trim strips near floor and mid-height along the wall
    for (const [yy, hh] of [[0.25, 0.06], [WALL_H - 0.6, 0.12]] as const) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w > 1 ? w - 0.2 : 0.08, hh, d > 1 ? d - 0.2 : 0.08), neon(trim));
      strip.position.set(x, yy, z); scene.add(strip);
    }
  }

  // Wall colliders — rows of circles just inside each wall so players stay in.
  const step = 2.4, R = 1.4;
  for (let z = -HD + 1; z <= HD - 1; z += step) { ctx.addCollider({ x: -HW + 0.4, z, r: R }); ctx.addCollider({ x: HW - 0.4, z, r: R }); }
  for (let x = -HW + 1; x <= HW - 1; x += step) { ctx.addCollider({ x, z: -HD + 0.4, r: R }); ctx.addCollider({ x, z: HD - 0.4, r: R }); }
}

// ── Glowing floor grid (unlit lines) — pulses gently ───────────────────
function buildFloorGrid(ctx: WorldContext) {
  const grid = new THREE.GridHelper(HW * 2, 30, CYAN, 0x2a1a4a);
  (grid.material as THREE.Material & { transparent: boolean; opacity: number; toneMapped: boolean }).transparent = true;
  (grid.material as any).opacity = 0.35;
  (grid.material as any).toneMapped = false;
  grid.position.y = 0.02; ctx.scene.add(grid);
  ctx.onUpdate((_d, e) => { (grid.material as any).opacity = 0.28 + Math.sin(e * 1.2) * 0.12; });
}

// ── Ceiling with neon strip lights + two real accent lights ────────────
function buildCeiling(ctx: WorldContext) {
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HD * 2), new THREE.MeshStandardMaterial({ color: 0x08060f, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = WALL_H; ctx.scene.add(ceil);

  // parallel neon tubes across the ceiling (unlit)
  const tubeGeo = new THREE.BoxGeometry(HW * 2 - 1, 0.08, 0.12);
  for (let i = 0; i < 5; i++) {
    const col = NEON[i % NEON.length];
    const tube = new THREE.Mesh(tubeGeo, neon(col));
    tube.position.set(0, WALL_H - 0.15, -HD + 2.5 + i * ((HD * 2 - 5) / 4));
    ctx.scene.add(tube);
  }

  // Only two real lights in the whole world — a cyan & a magenta wash.
  const l1 = new THREE.PointLight(CYAN, 0.9, 26, 2); l1.position.set(-7, WALL_H - 0.8, -4); ctx.scene.add(l1);
  const l2 = new THREE.PointLight(MAGENTA, 0.9, 26, 2); l2.position.set(7, WALL_H - 0.8, 4); ctx.scene.add(l2);
  ctx.onUpdate((_d, e) => {
    if (ctx.perf.reduced) return;
    l1.intensity = 0.8 + Math.sin(e * 2.1) * 0.25;
    l2.intensity = 0.8 + Math.sin(e * 2.1 + 2) * 0.25;
  });
}

// ── Neon bar along the left wall, with stools ──────────────────────────
function buildBar(ctx: WorldContext) {
  const BX = -HW + 2.2, BZ = -4;
  const g = new THREE.Group(); g.position.set(BX, 0, BZ); g.rotation.y = Math.PI / 2; ctx.scene.add(g);

  const body = new THREE.Mesh(new THREE.BoxGeometry(7, 1.1, 1.1), new THREE.MeshStandardMaterial({ color: 0x121030, roughness: 0.5, metalness: 0.4 }));
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(7.3, 0.12, 1.35), new THREE.MeshStandardMaterial({ color: 0x1c1840, roughness: 0.3, metalness: 0.6 }));
  top.position.y = 1.16; g.add(top);
  // glowing front strip
  const strip = new THREE.Mesh(new THREE.BoxGeometry(7, 0.16, 0.06), neon(CYAN)); strip.position.set(0, 0.55, 0.56); g.add(strip);
  // back shelf with glowing bottles
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(7, 0.1, 0.4), new THREE.MeshStandardMaterial({ color: 0x0e0c22, roughness: 0.8 }));
  shelf.position.set(0, 1.7, -0.6); g.add(shelf);
  const bottleGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.4, 6);
  for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(bottleGeo, neon(NEON[i % NEON.length])); b.position.set(-3 + i * 0.75, 1.95, -0.6); g.add(b); }

  ctx.addCollider({ x: BX, z: BZ, r: 1.2, h: 1.3 });
  // extend collider along the bar length (world-space, since the group is rotated)
  for (let i = -1; i <= 1; i++) ctx.addCollider({ x: BX, z: BZ + i * 2.4, r: 1.1 });

  // stools facing the bar (players sit facing +x toward the counter)
  for (let i = 0; i < 4; i++) {
    const sz = BZ - 3.4 + i * 2.2, sx = BX + 1.7;
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.62, 10), new THREE.MeshStandardMaterial({ color: 0x1a1636, roughness: 0.5, metalness: 0.4 }));
    stool.position.set(sx, 0.31, sz); stool.castShadow = true; ctx.scene.add(stool);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 6, 16), neon(PINK)); ring.rotation.x = Math.PI / 2; ring.position.set(sx, 0.6, sz); ctx.scene.add(ring);
    ctx.addCollider({ x: sx, z: sz, r: 0.34 });
    ctx.addSeat({ id: `bar${i}`, x: sx, y: 0.64, z: sz, yaw: Math.atan2(BX - sx, BZ - sz), prop: 'drink' });
  }
}

// ── Lounge booths — low neon couches around a table, 2 seats each ──────
function buildBooths(ctx: WorldContext) {
  const spots: Array<[number, number, number]> = [
    [HW - 4, -6, PURPLE], [HW - 4, 6, CYAN], [4, HD - 3.5, PINK],
  ];
  const couchMat = new THREE.MeshStandardMaterial({ color: 0x171334, roughness: 0.7, metalness: 0.2 });
  for (const [cx, cz, col] of spots) {
    const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = Math.atan2(-cx, -cz); ctx.scene.add(g);
    // curved couch base (three segments in an arc)
    for (let k = -1; k <= 1; k++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.8), couchMat);
      seg.position.set(k * 1.0, 0.25, -0.9); seg.rotation.y = k * 0.28; seg.castShadow = true; g.add(seg);
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.14), couchMat); back.position.set(k * 1.0, 0.7, -1.28); back.rotation.y = k * 0.28; g.add(back);
    }
    // neon underglow strip
    const glow = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 0.1), neon(col)); glow.position.set(0, 0.03, -0.5); g.add(glow);
    // glass table with glowing rim
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.55, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0x0e0c22, roughness: 0.3, metalness: 0.5 }));
    table.position.set(0, 0.25, 0.5); g.add(table);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.03, 6, 20), neon(col)); rim.rotation.x = Math.PI / 2; rim.position.set(0, 0.52, 0.5); g.add(rim);

    ctx.addCollider({ x: cx, z: cz, r: 1.5 });
    // two seats on the couch, facing the table
    for (const sgn of [-1, 1]) {
      const lx = sgn * 0.9, lz = -0.7;
      const wx = cx + lx * Math.cos(g.rotation.y) - lz * Math.sin(g.rotation.y);
      const wz = cz + lx * Math.sin(g.rotation.y) + lz * Math.cos(g.rotation.y);
      ctx.addSeat({ id: `booth_${cx}_${sgn}`, x: wx, y: 0.55, z: wz, yaw: Math.atan2(cx - wx, cz - wz), prop: 'drink' });
    }
  }
}

// ── Central dance floor — one InstancedMesh, colours cycle each beat ───
function buildDanceFloor(ctx: WorldContext) {
  const N = 6, T = 1.15, CX = 0, CZ = 0;
  const geo = new THREE.BoxGeometry(T * 0.92, 0.08, T * 0.92);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.9 });
  const inst = new THREE.InstancedMesh(geo, mat, N * N);
  const dummy = new THREE.Object3D();
  const base = new THREE.Color();
  let idx = 0;
  for (let ix = 0; ix < N; ix++) for (let iz = 0; iz < N; iz++) {
    dummy.position.set(CX + (ix - (N - 1) / 2) * T, 0.05, CZ + (iz - (N - 1) / 2) * T);
    dummy.updateMatrix(); inst.setMatrixAt(idx, dummy.matrix);
    inst.setColorAt(idx, base.setHex(NEON[(ix + iz) % NEON.length]));
    idx++;
  }
  inst.instanceMatrix.needsUpdate = true;
  ctx.scene.add(inst);

  // dance-floor border glow
  const border = new THREE.Mesh(new THREE.TorusGeometry(N * T * 0.72, 0.05, 8, 40), neon(MAGENTA));
  border.rotation.x = Math.PI / 2; border.position.set(CX, 0.04, CZ); ctx.scene.add(border);

  const c = new THREE.Color();
  let acc = 0;
  ctx.onUpdate((d, e) => {
    acc += d;
    // ~8 fps colour churn; skip entirely on reduced-perf devices
    if (ctx.perf.reduced || acc < 0.125) return; acc = 0;
    let i = 0;
    for (let ix = 0; ix < N; ix++) for (let iz = 0; iz < N; iz++) {
      const hue = (e * 0.12 + (ix + iz) * 0.09) % 1;
      c.setHSL(hue, 1, 0.55); inst.setColorAt(i++, c);
    }
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  });

  // dance-pose spots so people can strike a move on the floor
  ctx.addSeat({ id: 'dance0', x: CX - 1.4, y: 0.1, z: CZ, yaw: Math.PI, pose: 'danceL' });
  ctx.addSeat({ id: 'dance1', x: CX + 1.4, y: 0.1, z: CZ, yaw: Math.PI, pose: 'danceR' });
}

// ── Big screen on the front wall (world cinema) + facing seats ─────────
function buildScreen(ctx: WorldContext) {
  const SW = 6.4, SH = 3.6, SCY = 2.9, SZ = -HD + 0.35;
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.4, SH + 0.4, 0.16), new THREE.MeshStandardMaterial({ color: 0x0a0820, roughness: 0.6, metalness: 0.4 }));
  bezel.position.set(0, SCY, SZ - 0.05); ctx.scene.add(bezel);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.05, 4, 4), neon(CYAN)); frame.visible = false; ctx.scene.add(frame);
  // glowing edge frame (four thin neon bars)
  for (const [w, h, dx, dy] of [[SW + 0.4, 0.08, 0, SH / 2 + 0.2], [SW + 0.4, 0.08, 0, -SH / 2 - 0.2], [0.08, SH + 0.4, SW / 2 + 0.2, 0], [0.08, SH + 0.4, -SW / 2 - 0.2, 0]] as const) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), neon(CYAN)); bar.position.set(dx, SCY + dy, SZ + 0.05); ctx.scene.add(bar);
  }
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ color: 0x0b1024, toneMapped: false }));
  scr.position.set(0, SCY, SZ + 0.02); ctx.scene.add(scr);

  ctx.setScreen({ x: 0, y: SCY, z: SZ + 0.03, w: SW, h: SH, ry: 0 });

  // two rows of seats facing the screen (-z)
  const rows: Array<[number, number]> = [[-2.4, -HD + 4.5], [0, -HD + 4.5], [2.4, -HD + 4.5], [-1.2, -HD + 6.4], [1.2, -HD + 6.4]];
  rows.forEach(([sx, sz], i) => {
    const yaw = Math.atan2(sx - 0, sz - SZ);
    const g = new THREE.Group(); g.position.set(sx, 0, sz); g.rotation.y = yaw; ctx.scene.add(g);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.7), new THREE.MeshStandardMaterial({ color: 0x1a1440, roughness: 0.6, metalness: 0.3 }));
    seat.position.y = 0.34; seat.castShadow = true; g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.7), seat.material as THREE.Material); back.position.set(-0.3, 0.52, 0); g.add(back);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.7), neon(NEON[i % NEON.length])); gl.position.set(-0.37, 0.52, 0); g.add(gl);
    ctx.addCollider({ x: sx, z: sz, r: 0.5 });
    ctx.addSeat({ id: `screen${i}`, x: sx, y: 0.46, z: sz, yaw });
  });
}

// ── Floating holographic centrepiece above the dance floor ────────────
function buildHologram(ctx: WorldContext) {
  const holo = new THREE.Group(); holo.position.set(0, 3.6, 0); ctx.scene.add(holo);
  const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), new THREE.MeshBasicMaterial({ color: CYAN, wireframe: true, toneMapped: false, transparent: true, opacity: 0.8 }));
  holo.add(ico);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.02, 6, 40), neon(MAGENTA)); ring.rotation.x = Math.PI / 2.4; holo.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.015, 6, 40), neon(PURPLE)); ring2.rotation.x = Math.PI / 3; holo.add(ring2);
  ctx.onUpdate((d, e) => {
    ico.rotation.y += d * 0.6; ico.rotation.x += d * 0.2;
    ring.rotation.z += d * 0.5; ring2.rotation.z -= d * 0.35;
    holo.position.y = 3.6 + Math.sin(e * 1.1) * 0.15;
  });
}

// ── DJ booth (id 'dj' opens the shared music panel) ───────────────────
function buildDjBooth(ctx: WorldContext) {
  const DX = 0, DZ = -HD + 8.5;
  const g = new THREE.Group(); g.position.set(DX, 0, DZ); ctx.scene.add(g);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 0.9), new THREE.MeshStandardMaterial({ color: 0x110e28, roughness: 0.5, metalness: 0.4 }));
  desk.position.y = 0.5; desk.castShadow = true; g.add(desk);
  const face = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.02), neon(PINK)); face.position.set(0, 0.5, 0.46); g.add(face);
  for (const dx of [-0.6, 0.6]) { const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 20), neon(CYAN)); deck.position.set(dx, 1.05, 0); g.add(deck); }
  ctx.addCollider({ x: DX, z: DZ, r: 1.3 });
  ctx.addInteractable({ id: 'dj', x: DX, z: DZ + 1.2, r: 1.8, label: tNow().worlds.djMusic, effect: () => { /* music panel opens via onInteract('dj') */ } });
}

// ── Corner pillars with rotating neon rings ───────────────────────────
function buildPillars(ctx: WorldContext) {
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0c0a1e, roughness: 0.7, metalness: 0.3 });
  const geo = new THREE.CylinderGeometry(0.4, 0.45, WALL_H, 10);
  const rings: THREE.Mesh[] = [];
  for (const [px, pz] of [[-HW + 2, -HD + 2], [HW - 2, -HD + 2], [-HW + 2, HD - 2], [HW - 2, HD - 2]] as const) {
    const p = new THREE.Mesh(geo, pillarMat); p.position.set(px, WALL_H / 2, pz); ctx.scene.add(p);
    for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 6, 20), neon(NEON[k % NEON.length])); r.rotation.x = Math.PI / 2; r.position.set(px, 1 + k * 1.5, pz); ctx.scene.add(r); rings.push(r); }
    ctx.addCollider({ x: px, z: pz, r: 0.7 });
  }
  ctx.onUpdate((d) => { if (ctx.perf.reduced) return; for (const r of rings) r.rotation.z += d * 0.8; });
}

// ── Floating neon dust — one Points cloud ─────────────────────────────
function buildDust(ctx: WorldContext) {
  const N = 90; const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { arr[i * 3] = (rnd() - 0.5) * HW * 2; arr[i * 3 + 1] = rnd() * WALL_H; arr[i * 3 + 2] = (rnd() - 0.5) * HD * 2; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fd8ff, size: 0.06, transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }));
  ctx.scene.add(pts);
  ctx.onUpdate((d) => {
    if (ctx.perf.reduced) return;
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) { let y = p.getY(i) + d * 0.25; if (y > WALL_H) y = 0; p.setY(i, y); }
    p.needsUpdate = true;
  });
}
