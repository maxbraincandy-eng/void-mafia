// ── Premium World: Mountain Cabin ─────────────────────────────────────
// A serene late-afternoon alpine clearing: a log cabin, a campfire, a pine
// forest, scattered rocks, distant snow-capped peaks and a small lake — set in
// a field of wind-swept grass. Everything is procedural.
//
// Performance (built to run well on phones without dulling the look):
//  • Grass is ONE InstancedMesh (~3.5k blades, 1 draw call); the sway is done in
//    the vertex shader, so it costs nothing per frame on the CPU.
//  • Trees are two InstancedMeshes (trunks + foliage), rocks one more.
//  • Only the sun (the engine's directional light) + one warm cabin light.
//  • Fog fades the far forest/peaks — cheaper AND prettier.
//  • Per-frame CPU work (fire flicker, lake shimmer) early-returns on
//    ctx.perf.reduced.
import * as THREE from 'three';
import type { WorldDef, WorldContext } from './types';
import { tNow } from '@/store/langStore';

const R = 26;   // playable radius (clearing); forest + peaks live beyond it.

let _s = 90210;
function rnd() { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967295; }
function rr(a: number, b: number) { return a + (b - a) * rnd(); }

export const mountainCabin: WorldDef = {
  id: 'mountain_cabin',
  name: 'Mountain Cabin',
  subtitle: 'ალპური მდელო · კოცონი · ხმა',
  icon: '🏔️',
  status: 'live',
  spawn: { x: 0, z: 10, yaw: Math.PI },
  fog: { color: 0xbcd0e0, density: 0.012 },
  clear: 0x9fc0dc,

  build(ctx: WorldContext) {
    _s = 90210;
    // Warm, bright late-afternoon light.
    ctx.ambientLight.color.setHex(0x9fb8d8);
    ctx.ambientLight.intensity = 1.05;
    ctx.moon.color.setHex(0xffe6c2);
    ctx.moon.intensity = 1.5;
    ctx.moon.position.set(-24, 30, 18);

    buildSky(ctx);
    buildGround(ctx);
    buildMountains(ctx);
    buildLake(ctx);
    buildGrass(ctx);
    buildForest(ctx);
    buildRocks(ctx);
    buildCabin(ctx);
    buildCampfire(ctx);
    buildBoundary(ctx);

    ctx.addAmbient({ kind: 'wind', x: 0, z: 0, radius: 120 });
    ctx.addAmbient({ kind: 'fire', x: 0, z: -2, radius: 10 });
  },
};

// ── Sky dome (clear afternoon gradient) ───────────────────────────────
function buildSky(ctx: WorldContext) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3f7fc4) }, bot: { value: new THREE.Color(0xd8e6f0) } },
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 bot; void main(){ float h=clamp((normalize(vP).y+0.1)/0.8,0.0,1.0); gl_FragColor=vec4(mix(bot,top,h),1.0); }',
  });
  ctx.scene.add(new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), mat));
  // sun disc
  const sun = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: 0xfff2d0, fog: false, transparent: true, opacity: 0.9 }));
  sun.position.set(-90, 90, -180); sun.lookAt(0, 0, 0); ctx.scene.add(sun);
}

// ── Ground: rolling grass base + a dirt clearing under the cabin ───────
function buildGround(ctx: WorldContext) {
  const g = new THREE.Mesh(new THREE.CircleGeometry(300, 48), new THREE.MeshStandardMaterial({ color: 0x466b2e, roughness: 1 }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; ctx.scene.add(g);
  // a slightly lighter, worn patch where people gather
  const patch = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 1 }));
  patch.rotation.x = -Math.PI / 2; patch.position.set(0, 0.01, -2); ctx.scene.add(patch);
}

// ── Distant snow-capped peaks (static, beyond the fog) ────────────────
function buildMountains(ctx: WorldContext) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a6472, roughness: 1 });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xeef4fb, roughness: 0.9 });
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2 + 0.3;
    const dist = rr(150, 200), h = rr(45, 85), rad = h * rr(0.7, 1.0);
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    const m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 6), rockMat);
    m.position.set(x, h / 2 - 4, z); m.rotation.y = rnd() * Math.PI; ctx.scene.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.42, h * 0.36, 6), snowMat);
    cap.position.set(x, h - h * 0.18 - 4, z); cap.rotation.y = m.rotation.y; ctx.scene.add(cap);
  }
}

// ── Small alpine lake (flat, faintly shimmering) ──────────────────────
function buildLake(ctx: WorldContext) {
  const water = new THREE.Mesh(new THREE.CircleGeometry(11, 40), new THREE.MeshStandardMaterial({ color: 0x2f6f8f, roughness: 0.2, metalness: 0.5, transparent: true, opacity: 0.9 }));
  water.rotation.x = -Math.PI / 2; water.position.set(-19, 0.03, 14); ctx.scene.add(water);
  ctx.onUpdate((_d, e) => { if (ctx.perf.reduced) return; (water.material as THREE.MeshStandardMaterial).opacity = 0.86 + Math.sin(e * 0.8) * 0.06; });
  // a couple of shore rocks
  for (let i = 0; i < 5; i++) { const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(rr(0.4, 0.9)), new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 1 })); const a = rr(0, Math.PI * 2); rk.position.set(-19 + Math.cos(a) * 11.4, 0.2, 14 + Math.sin(a) * 11.4); rk.rotation.set(rnd(), rnd(), rnd()); ctx.scene.add(rk); }
}

// ── Wind-swept grass — one InstancedMesh, sway in the vertex shader ────
function buildGrass(ctx: WorldContext) {
  // tapered blade, pivot at the base, normals pointing up so it lights like a lawn
  const w = 0.09, tw = 0.02, h = 0.5;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -w, 0, 0, w, 0, 0, tw, h, 0, -w, 0, 0, tw, h, 0, -tw, h, 0,
  ]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), 2));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));

  const mat = new THREE.MeshStandardMaterial({ color: 0x5f9138, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  const holder: { shader?: any } = {};
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    holder.shader = shader;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float ph = instanceMatrix[3][0]*0.7 + instanceMatrix[3][2]*0.7;
       float sway = sin(uTime*1.6 + ph) + 0.4*sin(uTime*3.1 + ph*1.7);
       transformed.x += sway * 0.16 * uv.y * uv.y;`);
  };

  const COUNT = ctx.perf.reduced ? 1800 : 3600;
  const inst = new THREE.InstancedMesh(geo, mat, COUNT);
  const dummy = new THREE.Object3D(); const col = new THREE.Color();
  let n = 0;
  for (let i = 0; i < COUNT; i++) {
    const a = rnd() * Math.PI * 2, rad = Math.sqrt(rnd()) * R;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    // keep grass out of the lake and the worn gathering patch
    if (Math.hypot(x + 19, z - 14) < 11.5) continue;
    if (Math.hypot(x, z + 2) < 8.5) continue;
    dummy.position.set(x, 0, z);
    dummy.rotation.y = rnd() * Math.PI;
    const sc = rr(0.7, 1.5); dummy.scale.set(sc, rr(0.8, 1.4), sc);
    dummy.updateMatrix(); inst.setMatrixAt(n, dummy.matrix);
    const g = rr(0.7, 1.05); col.setRGB(0.32 * g, 0.55 * g, 0.2 * g); inst.setColorAt(n, col);
    n++;
  }
  inst.count = n; inst.instanceMatrix.needsUpdate = true;
  inst.frustumCulled = false;
  ctx.scene.add(inst);
  ctx.onUpdate((_d, e) => { if (holder.shader) holder.shader.uniforms.uTime.value = e; });
}

// ── Pine forest — instanced trunks + foliage, ringing the clearing ────
function buildForest(ctx: WorldContext) {
  const spots: Array<[number, number, number]> = [];
  const N = 64;
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2;
    const rad = rr(R - 4, R + 22);
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (Math.hypot(x + 19, z - 14) < 13) continue;   // not in the lake
    spots.push([x, z, rr(0.8, 1.6)]);
  }
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 1 });
  const foliMat = new THREE.MeshStandardMaterial({ color: 0x2f5a2c, roughness: 1 });
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6);
  const coneGeo = new THREE.ConeGeometry(1.35, 3.4, 7);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const folis = new THREE.InstancedMesh(coneGeo, foliMat, spots.length);
  folis.castShadow = true;
  const d = new THREE.Object3D(); const c = new THREE.Color();
  spots.forEach(([x, z, s], i) => {
    d.position.set(x, 0.8 * s, z); d.rotation.set(0, rnd() * Math.PI, 0); d.scale.setScalar(s); d.updateMatrix(); trunks.setMatrixAt(i, d.matrix);
    d.position.set(x, (1.6 * s) + 1.5 * s, z); d.updateMatrix(); folis.setMatrixAt(i, d.matrix);
    const g = rr(0.8, 1.1); c.setRGB(0.16 * g, 0.36 * g, 0.17 * g); folis.setColorAt(i, c);
    // colliders only for trees near/inside the clearing (far ones are scenery)
    if (Math.hypot(x, z) < R + 2) ctx.addCollider({ x, z, r: 0.6 });
  });
  trunks.instanceMatrix.needsUpdate = true; folis.instanceMatrix.needsUpdate = true;
  ctx.scene.add(trunks); ctx.scene.add(folis);
}

// ── Scattered mossy rocks (instanced) ─────────────────────────────────
function buildRocks(ctx: WorldContext) {
  const spots: Array<[number, number, number]> = [];
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, rad = rr(5, R - 1);
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (Math.hypot(x, z + 2) < 6) continue;
    if (Math.hypot(x + 19, z - 14) < 12) continue;
    spots.push([x, z, rr(0.4, 1.1)]);
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 1 });
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const inst = new THREE.InstancedMesh(geo, mat, spots.length);
  const d = new THREE.Object3D(); const c = new THREE.Color();
  spots.forEach(([x, z, s], i) => {
    d.position.set(x, s * 0.45, z); d.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); d.scale.set(s, s * 0.75, s); d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
    const g = rr(0.8, 1.15); c.setRGB(0.42 * g, 0.46 * g, 0.5 * g); inst.setColorAt(i, c);
    if (s > 0.6) ctx.addCollider({ x, z, r: s * 0.8, h: s * 0.9 });
  });
  inst.instanceMatrix.needsUpdate = true; ctx.scene.add(inst);
}

// ── Log cabin with a glowing window, porch & a bench ──────────────────
function buildCabin(ctx: WorldContext) {
  const CX = 11, CZ = -6;
  const g = new THREE.Group(); g.position.set(CX, 0, CZ); g.rotation.y = -0.6; ctx.scene.add(g);
  const logMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 1 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x3a2716, roughness: 1 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 5), logMat); body.position.y = 1.6; body.castShadow = true; body.receiveShadow = true; g.add(body);
  // log courses (thin horizontal lines) for texture
  for (let i = 0; i < 6; i++) { const line = new THREE.Mesh(new THREE.BoxGeometry(6.05, 0.06, 5.05), darkWood); line.position.y = 0.4 + i * 0.5; g.add(line); }
  // gabled roof (two slabs)
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x513a24, roughness: 1 });
  for (const sgn of [-1, 1]) { const slab = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.2, 3.4), roofMat); slab.position.set(0, 4.05, sgn * 1.35); slab.rotation.x = sgn * -0.62; slab.castShadow = true; g.add(slab); }
  const gable = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 1.75, 5.2, 3, 1, false, 0, Math.PI), logMat);
  // door
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.12), darkWood); door.position.set(0, 1.05, 2.53); g.add(door);
  // glowing windows
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffcf7a, toneMapped: false });
  for (const wx of [-1.9, 1.9]) { const win = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.1), winMat); win.position.set(wx, 1.9, 2.52); g.add(win); }
  const win2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 1.0), winMat); win2.position.set(3.02, 1.9, 0); g.add(win2);
  // chimney with a wisp of smoke
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.7), new THREE.MeshStandardMaterial({ color: 0x555055, roughness: 1 })); chim.position.set(-2.1, 4.6, 0); g.add(chim);
  // one warm light from the cabin
  const lamp = new THREE.PointLight(0xffb765, 1.4, 16, 2); lamp.position.set(0, 2.2, 3.4); g.add(lamp);
  ctx.onUpdate((_d, e) => { if (!ctx.perf.reduced) lamp.intensity = 1.3 + Math.sin(e * 3) * 0.15; });
  void gable;

  ctx.addCollider({ x: CX, z: CZ, r: 3.6 });

  // porch bench (a seat) in front of the cabin, facing the campfire
  const bx = CX + Math.sin(-0.6) * 3.6, bz = CZ + Math.cos(-0.6) * 3.6;
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 0.5), darkWood); bench.position.set(bx, 0.45, bz); bench.castShadow = true; ctx.scene.add(bench);
  for (const s of [-0.7, 0.7]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.45), darkWood); leg.position.set(bx + s * Math.cos(-0.6), 0.22, bz - s * Math.sin(-0.6)); ctx.scene.add(leg); }
  ctx.addSeat({ id: 'porch', x: bx, y: 0.6, z: bz, yaw: Math.atan2(0 - bx, -2 - bz) });
  ctx.addCollider({ x: bx, z: bz, r: 0.5 });
}

// ── Campfire with a ring of log seats ─────────────────────────────────
function buildCampfire(ctx: WorldContext) {
  const FX = 0, FZ = -2;
  const g = new THREE.Group(); g.position.set(FX, 0, FZ); ctx.scene.add(g);
  // stone ring
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const s = new THREE.Mesh(new THREE.DodecahedronGeometry(rr(0.22, 0.34)), new THREE.MeshStandardMaterial({ color: 0x777073, roughness: 1 })); s.position.set(Math.cos(a) * 1.0, 0.15, Math.sin(a) * 1.0); s.rotation.set(rnd(), rnd(), rnd()); g.add(s); }
  // crossed logs
  const logMat = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 1 });
  for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.5, 6), logMat); l.position.y = 0.18; l.rotation.set(Math.PI / 2, (i / 4) * Math.PI, 0.2); g.add(l); }
  // flame (a couple of stacked cones) + light
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9a3c, toneMapped: false, transparent: true, opacity: 0.95 });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 8), flameMat); flame.position.y = 0.85; g.add(flame);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.8, 8), new THREE.MeshBasicMaterial({ color: 0xffe27a, toneMapped: false })); core.position.y = 0.7; g.add(core);
  const fl = new THREE.PointLight(0xff7a2a, 2.2, 13, 2); fl.position.set(0, 1.0, 0); g.add(fl);
  ctx.onUpdate((_d, e) => {
    if (ctx.perf.reduced) { return; }
    const f = 0.85 + Math.sin(e * 12) * 0.12 + Math.sin(e * 27) * 0.05;
    flame.scale.set(1, f, 1); core.scale.set(1, f, 1);
    fl.intensity = 2.0 + Math.sin(e * 15) * 0.5;
  });
  ctx.addCollider({ x: FX, z: FZ, r: 1.3 });

  // log seats around the fire
  const seats = 5;
  for (let i = 0; i < seats; i++) {
    const a = (i / seats) * Math.PI * 2 + 0.3;
    const sx = FX + Math.cos(a) * 3.0, sz = FZ + Math.sin(a) * 3.0;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.3, 10), logMat); log.rotation.z = Math.PI / 2; log.rotation.y = a; log.position.set(sx, 0.32, sz); log.castShadow = true; ctx.scene.add(log);
    ctx.addCollider({ x: sx, z: sz, r: 0.45 });
    ctx.addSeat({ id: `fire${i}`, x: sx, y: 0.62, z: sz, yaw: Math.atan2(FX - sx, FZ - sz) });
  }
}

// ── Invisible boundary so players stay in the clearing ────────────────
function buildBoundary(ctx: WorldContext) {
  const n = 40;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ctx.addCollider({ x: Math.cos(a) * (R + 1), z: Math.sin(a) * (R + 1), r: 2.2 }); }
  void tNow;
}
