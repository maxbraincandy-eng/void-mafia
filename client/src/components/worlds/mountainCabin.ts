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
    buildLoveseats(ctx);
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
    // keep grass out of the lake, the gathering patch and the lodge footprint
    if (Math.hypot(x + 19, z - 14) < 11.5) continue;
    if (Math.hypot(x, z + 2) < 8.5) continue;
    if (Math.hypot(x - 15, z + 10) < 8) continue;
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
    if (Math.hypot(x - 15, z + 10) < 9) continue;    // not on the lodge
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
    if (Math.hypot(x - 15, z + 10) < 8) continue;
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

// ── Enterable lodge — spacious, bright, OPEN-TOP so the third-person camera
//    never gets trapped and daylight fills the room. A cosy fireside seating
//    area (long sofa + two armchairs) sits inside; a bench waits on the porch.
function buildCabin(ctx: WorldContext) {
  const CX = 15, CZ = -10;           // lodge centre (axis-aligned so you can walk in)
  const HWD = 6, HDD = 5;            // half-width / half-depth of the interior
  const WH = 2.6, TH = 0.3;          // wall height / thickness (low walls = airy)
  const DOOR = 3.0;                  // wide doorway in the +z (front) wall
  const g = new THREE.Group(); g.position.set(CX, 0, CZ); ctx.scene.add(g);

  const logMat = new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 1 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x3a2716, roughness: 1 });
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffd48a, toneMapped: false });

  const wall = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), logMat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  };
  wall(HWD * 2 + TH, WH, TH, 0, WH / 2, -HDD);          // back
  wall(TH, WH, HDD * 2, -HWD, WH / 2, 0);               // left
  wall(TH, WH, HDD * 2, HWD, WH / 2, 0);                // right
  const seg = (HWD * 2 - DOOR) / 2;                     // front: two segments + doorway
  wall(seg, WH, TH, -(DOOR / 2 + seg / 2), WH / 2, HDD);
  wall(seg, WH, TH, (DOOR / 2 + seg / 2), WH / 2, HDD);

  // wooden floor
  const floor = new THREE.Mesh(new THREE.BoxGeometry(HWD * 2, 0.1, HDD * 2), new THREE.MeshStandardMaterial({ color: 0x5a4128, roughness: 1 })); floor.position.y = 0.05; floor.receiveShadow = true; g.add(floor);

  // Open timber frame (posts + top beams + a ridge) — reads as a lodge from
  // outside but leaves the centre open to the sky, so nothing traps the camera.
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 1 });
  for (const [px, pz] of [[-HWD, -HDD], [HWD, -HDD], [-HWD, HDD], [HWD, HDD]] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, WH + 1.4, 0.3), beamMat); post.position.set(px, (WH + 1.4) / 2, pz); post.castShadow = true; g.add(post);
  }
  for (const sgn of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(HWD * 2 + 0.4, 0.2, 0.2), beamMat); beam.position.set(0, WH + 1.3, sgn * HDD); g.add(beam);
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, HDD * 2), beamMat); side.position.set(sgn * HWD, WH + 1.3, 0); g.add(side);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, HDD * 2 + 0.4), beamMat); ridge.position.set(0, WH + 2.2, 0); g.add(ridge);
  for (const sgn of [-1, 1]) { const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, HDD * 2 + 0.6), beamMat); rafter.position.set(sgn * HWD * 0.6, WH + 1.75, 0); g.add(rafter); }
  // small eave panels along the two long sides only (a hint of roof, centre open)
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x513a24, roughness: 1 });
  for (const sgn of [-1, 1]) { const eave = new THREE.Mesh(new THREE.BoxGeometry(HWD * 2 + 1, 0.16, 1.4), roofMat); eave.position.set(0, WH + 1.5, sgn * (HDD - 0.2)); eave.rotation.x = sgn * -0.5; g.add(eave); }

  // glowing windows on the side + back walls
  for (const [wx, wz, ww, wd] of [[-HWD - 0.02, -2, 0.06, 1.1], [-HWD - 0.02, 2, 0.06, 1.1], [HWD + 0.02, -2, 0.06, 1.1], [-2.5, -HDD - 0.02, 1.1, 0.06], [2.5, -HDD - 0.02, 1.1, 0.06]] as const) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(ww, 1.0, wd), winMat); win.position.set(wx, 1.5, wz); g.add(win);
  }

  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.7), new THREE.MeshStandardMaterial({ color: 0x555055, roughness: 1 })); chim.position.set(-HWD + 0.7, WH + 1.6, -HDD + 0.7); g.add(chim);

  // ── fireside seating: hearth, rug, coffee table, sofa + two armchairs ──
  const hearth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.5), new THREE.MeshStandardMaterial({ color: 0x6b6560, roughness: 1 })); hearth.position.set(0, 0.6, -HDD + 0.35); g.add(hearth);
  const hfire = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 8), new THREE.MeshBasicMaterial({ color: 0xffa63c, toneMapped: false })); hfire.position.set(0, 0.55, -HDD + 0.55); g.add(hfire);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.4, 28), new THREE.MeshStandardMaterial({ color: 0x7a3b2c, roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.11, -0.6); g.add(rug);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.6, 0.5, 16), darkWood); table.position.set(0, 0.25, -0.6); g.add(table);
  const ilight = new THREE.PointLight(0xffc98a, 2.2, 20, 2); ilight.position.set(0, 2.6, -0.6); g.add(ilight);
  ctx.onUpdate((_d, e) => { if (!ctx.perf.reduced) { ilight.intensity = 2.1 + Math.sin(e * 10) * 0.3; hfire.scale.y = 0.85 + Math.sin(e * 11) * 0.15; } });

  const HEARTH_Z = CZ - HDD;   // world z of the hearth (seats face it)
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x6a4630, roughness: 0.9 });
  const faceHearth = (wx: number, wz: number) => Math.atan2(wx - CX, wz - HEARTH_Z);

  // long sofa along the +z side, 3 sit spots, facing the hearth
  const sofaZ = 1.6;
  const sofaBase = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.45, 1.0), seatMat); sofaBase.position.set(0, 0.28, sofaZ); sofaBase.castShadow = true; g.add(sofaBase);
  const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 0.2), seatMat); sofaBack.position.set(0, 0.7, sofaZ + 0.4); g.add(sofaBack);
  for (const sx of [-1.4, 0, 1.4]) { const wxp = CX + sx, wzp = CZ + sofaZ; ctx.addSeat({ id: `sofa_${sx}`, x: wxp, y: 0.6, z: wzp, yaw: faceHearth(wxp, wzp) }); }
  ctx.addCollider({ x: CX, z: CZ + sofaZ + 0.3, r: 0.5 });

  // two armchairs angled at the sides, facing the hearth
  for (const sx of [-3.4, 3.4]) {
    const cz = -0.4;
    const chair = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 1.0), seatMat); chair.position.set(sx, 0.28, cz); chair.castShadow = true; g.add(chair);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.18), seatMat); back.position.set(sx, 0.7, cz + (sx > 0 ? 0.4 : 0.4)); g.add(back);
    const wxp = CX + sx, wzp = CZ + cz; ctx.addSeat({ id: `chair_${sx}`, x: wxp, y: 0.6, z: wzp, yaw: faceHearth(wxp, wzp) });
    ctx.addCollider({ x: wxp, z: wzp, r: 0.6 });
  }

  // ── wall colliders (wide doorway kept clear) ──
  const addWall = (ax: number, az: number, len: number, horizontal: boolean, gap = 0) => {
    const n = Math.max(1, Math.round(len / 1.0));
    for (let i = 0; i <= n; i++) {
      const t = (i / n - 0.5) * len;
      if (gap > 0 && Math.abs(t) < gap / 2) continue;
      ctx.addCollider({ x: CX + (horizontal ? t : ax), z: CZ + (horizontal ? az : t), r: 0.55 });
    }
  };
  addWall(0, -HDD, HWD * 2, true);
  addWall(-HWD, 0, HDD * 2, false);
  addWall(HWD, 0, HDD * 2, false);
  addWall(0, HDD, HWD * 2, true, DOOR + 1.4);   // generous clear doorway

  // ── porch bench outside, facing the campfire ──
  const bx = CX, bz = CZ + HDD + 1.8;
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 0.5), darkWood); bench.position.set(bx, 0.45, bz); bench.castShadow = true; ctx.scene.add(bench);
  for (const s of [-0.7, 0.7]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.45), darkWood); leg.position.set(bx + s, 0.22, bz); ctx.scene.add(leg); }
  ctx.addCollider({ x: bx, z: bz, r: 0.6 });
  ctx.addSeat({ id: 'porch', x: bx, y: 0.6, z: bz, yaw: Math.atan2(bx - 0, bz - (-2)) });
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
    ctx.addSeat({ id: `fire${i}`, x: sx, y: 0.62, z: sz, yaw: Math.atan2(sx - FX, sz - FZ) });
  }
}

// ── Cuddle loveseats (log bench for two) — embrace pose ───────────────
function loveseat(ctx: WorldContext, x: number, z: number, yaw: number, id: string) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; ctx.scene.add(g);
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 1 });
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.9), wood); bench.position.y = 0.25; bench.castShadow = true; g.add(bench);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.16), wood); back.position.set(0, 0.55, -0.37); g.add(back);
  const fur = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.8), new THREE.MeshStandardMaterial({ color: 0xcbb79a, roughness: 1 })); fur.position.y = 0.44; g.add(fur);
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), new THREE.MeshBasicMaterial({ color: 0xff4d6d, toneMapped: false })); heart.position.set(0, 1.4, 0); heart.scale.set(1, 0.9, 0.6); g.add(heart);
  ctx.onUpdate((_d, e) => { heart.position.y = 1.35 + Math.sin(e * 1.6) * 0.08; heart.rotation.y = e * 0.7; });
  ctx.addCollider({ x, z, r: 0.9 });
  const d = 0.34, cx = Math.cos(yaw), sx = Math.sin(yaw);
  ctx.addSeat({ id: `${id}-l`, x: x + cx * d, y: 0.55, z: z - sx * d, yaw, pose: 'cuddleL' });
  ctx.addSeat({ id: `${id}-r`, x: x - cx * d, y: 0.55, z: z + sx * d, yaw, pose: 'cuddleR' });
}
function buildLoveseats(ctx: WorldContext) {
  loveseat(ctx, -13, 9, -2.4, 'love1');   // by the lake, facing the water
  loveseat(ctx, 8, 4, Math.PI + 0.4, 'love2');
}

// ── Invisible boundary so players stay in the clearing ────────────────
function buildBoundary(ctx: WorldContext) {
  const n = 40;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ctx.addCollider({ x: Math.cos(a) * (R + 1), z: Math.sin(a) * (R + 1), r: 2.2 }); }
  void tNow;
}
