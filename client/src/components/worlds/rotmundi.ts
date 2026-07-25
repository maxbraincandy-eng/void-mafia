// ── Premium World: Rotmundi ───────────────────────────────────────────
// "პორტ ქალაქი" — the port city of friendly sea spirits, built to the concept:
// you stand on a broad stone promenade under the great HARBOUR GATE BANNER and
// look north across a sunlit basin. Tall galleons ride at anchor, ghostly white
// seals bob and wave right off the quay, flocks of colourful shadowbirds trail
// across a bright cloudy sky, and a dense tiered old town of terracotta roofs,
// domes and spires climbs the hills all around, crowned by the castle, with a
// lighthouse on the western hill and snow peaks far beyond.
//
// Layout (bay opens NORTH / -Z):
//   promenade  x -26…26, z 9…25   ← spawn, gate, market, love wall, props
//   main pier  x  -2.5…2.5, z -10…9      west dock  x -20…-13, z 3…9
//   basin      everything z < 9 (water)  → seals, boats, galleons, swimming
//   old town   hills wrapping the basin, castle centre-north, lighthouse west
import * as THREE from 'three';
import type { WorldDef, WorldContext } from './types';
import { addHugSpot } from './props';
import { setupAtmosphere, type Mood } from './atmosphere';

// ── dimensions ────────────────────────────────────────────────────────
const Q_HW = 26, Q_Z0 = 9, Q_Z1 = 25;          // promenade extents
const CA_X = 0, CA_Z = -150;                    // castle, on the top terrace
const LH_X = -78, LH_Z = -28;                   // lighthouse, on the first terrace
const WATER_R = 56;                            // the bay: riders/swimmers stay inside
const LAND_R = 62;                             // all scenery land starts beyond this
const PIER_HW = 2.5, PIER_Z = -10;             // main pier reaches to z = -10
const DOCK_X0 = -20, DOCK_X1 = -13, DOCK_Z0 = 3;

let _s = 811207;
function rnd() { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967295; }
function rr(a: number, b: number) { return a + (b - a) * rnd(); }
const _lit = new Map<number, THREE.MeshBasicMaterial>();
function lit(c: number) { let m = _lit.get(c); if (!m) { m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false }); _lit.set(c, m); } return m; }
const ATM: { setAmp?: (v: number) => void } = {};

// Bright-day-led cycle: this city is sunny first, golden at sunset, softly
// moonlit at night — the concept's "TIME & ATMOSPHERE" strip.
const MOODS_PORT: Mood[] = [
  [0x4a86c8, 0x8fb6de, 0xeaf2fa, 1.35, 0xfff6e8, 1.35, 0xbccadc],  // bright day
  [0x2a3f7a, 0x8a4a6a, 0xf0a256, 0.85, 0xffd8a0, 1.1, 0xa88098],   // golden sunset
  [0x060a22, 0x1a2450, 0x2c3a60, 0.95, 0xc8d6ff, 0.8, 0x5a6490],   // starry night
];

// ── house windows: a few warm panes, cosy not corporate ───────────────
let _winTex: THREE.Texture | null = null;
function windowTexture(): THREE.Texture {
  if (_winTex) return _winTex;
  const c = document.createElement('canvas'); c.width = 48; c.height = 64; const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, 48, 64);
  const cols = ['#ffd07a', '#ffe4a8', '#ffb066'];
  for (let ry = 0; ry < 3; ry++) for (let cx = 0; cx < 2; cx++) {
    if (rnd() < 0.6) { g.fillStyle = cols[(rnd() * 3) | 0]; g.globalAlpha = 0.7 + rnd() * 0.3; g.fillRect(10 + cx * 20, 9 + ry * 18, 10, 12); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.3, 1.6); _winTex = t; return t;
}

export const rotmundi: WorldDef = {
  id: 'rotmundi',
  name: 'Rotmundi',
  subtitle: 'პორტ ქალაქი · სელაპები · ხმა',
  icon: '⚓',
  status: 'live',
  spawn: { x: 0, z: 21, yaw: 0 },     // on the promenade, facing the harbour
  oceanR: WATER_R,                    // boats stay inside the bay
  fog: { color: 0xcfe0ee, density: 0.0055 },
  clear: 0xbcd8ee,

  build(ctx: WorldContext) {
    _s = 811207; _lit.clear();
    const sky = buildSky(ctx);
    buildClouds(ctx);
    buildMountains(ctx);
    buildBasin(ctx);
    buildLand(ctx);
    buildOldTown(ctx);
    buildCastle(ctx);
    buildLighthouse(ctx);
    buildPromenade(ctx);
    buildHarborGate(ctx);
    buildPier(ctx);
    buildFishermanDock(ctx);
    buildGalleons(ctx);
    buildFlagship(ctx);
    buildSecretCove(ctx);
    buildVilla(ctx);
    buildRowboats(ctx);
    buildWrecks(ctx);
    buildGhostSeals(ctx);
    buildShadowbirds(ctx);
    buildSeagulls(ctx);
    buildMarket(ctx);
    buildLoveWall(ctx);
    buildQuayProps(ctx);
    buildWater(ctx);
    buildBoundary(ctx);

    (ctx.scene.fog as any).userData = { base: 0.0055 };
    setupAtmosphere(ctx, { sky, moods: MOODS_PORT, cycle: 300, onAmp: (v) => ATM.setAmp?.(v) });

    ctx.addAmbient({ kind: 'ocean', x: 0, z: -20, radius: 90 });
    ctx.addAmbient({ kind: 'wind', x: 0, z: 0, radius: 150 });
    ctx.addAmbient({ kind: 'night', x: 0, z: 0, radius: 150 });
  },
};

// ── Sky ───────────────────────────────────────────────────────────────
function buildSky(ctx: WorldContext) {
  const uniforms = { top: { value: new THREE.Color(0x4a86c8) }, mid: { value: new THREE.Color(0x8fb6de) }, bot: { value: new THREE.Color(0xeaf2fa) } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; void main(){ float h=clamp((normalize(vP).y+0.14)/0.86,0.0,1.0); vec3 c=h<0.5?mix(bot,mid,h*2.0):mix(mid,top,(h-0.5)*2.0); gl_FragColor=vec4(c,1.0);}',
  });
  ctx.scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 28, 16), mat));
  // stars fade in only at night
  const N = 420; const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const u = rnd() * Math.PI * 2, v = rnd() * 0.45 + 0.1, r = 380; arr[i * 3] = Math.cos(u) * Math.cos(v) * r; arr[i * 3 + 1] = Math.sin(v) * r; arr[i * 3 + 2] = Math.sin(u) * Math.cos(v) * r; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.85, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
  ctx.scene.add(stars);
  ctx.onUpdate((_d, e) => { (stars.material as THREE.PointsMaterial).opacity = Math.max(0, Math.sin(e / 300 * Math.PI * 2 - 1.4)) * 0.8; });
  return { top: uniforms.top.value, mid: uniforms.mid.value, bot: uniforms.bot.value };
}

// ── Big puffy white clouds (one instanced sphere set, slow drift) ─────
function buildClouds(ctx: WorldContext) {
  const PUFFS = ctx.perf.reduced ? 40 : 90;
  const inst = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xdfe8f4, emissiveIntensity: 0.35, fog: false }),
    PUFFS,
  );
  const d = new THREE.Object3D();
  const seeds: Array<{ cx: number; cy: number; cz: number; ox: number; oy: number; oz: number; s: number }> = [];
  let n = 0;
  while (n < PUFFS) {
    const cx = rr(-260, 260), cy = rr(58, 108), cz = rr(-300, 130);
    const lobes = 3 + ((rnd() * 3) | 0);
    for (let i = 0; i < lobes && n < PUFFS; i++, n++) {
      seeds.push({ cx, cy, cz, ox: rr(-13, 13), oy: rr(-3, 4), oz: rr(-9, 9), s: rr(7, 15) });
    }
  }
  seeds.forEach((s, i) => { d.position.set(s.cx + s.ox, s.cy + s.oy, s.cz + s.oz); d.scale.set(s.s, s.s * 0.62, s.s); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); });
  inst.instanceMatrix.needsUpdate = true; inst.frustumCulled = false; ctx.scene.add(inst);
  // gentle drift across the sky
  ctx.onUpdate((dt) => {
    if (ctx.perf.reduced) return;
    for (let i = 0; i < seeds.length; i++) { const s = seeds[i]; s.cx += dt * 0.6; if (s.cx > 280) s.cx = -280; d.position.set(s.cx + s.ox, s.cy + s.oy, s.cz + s.oz); d.scale.set(s.s, s.s * 0.62, s.s); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); }
    inst.instanceMatrix.needsUpdate = true;
  });
}

// ── Snow-capped mountains on the far horizon ───────────────────────────
function buildMountains(ctx: WorldContext) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b7789, roughness: 1 });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf2f7ff, roughness: 0.9 });
  for (let i = 0; i < 16; i++) {
    const a = rr(Math.PI * 0.62, Math.PI * 2.42);           // wrap the far side
    const dist = rr(250, 350), h = rr(48, 100), rad = h * rr(0.75, 1.05);
    const x = Math.cos(a) * dist, z = Math.sin(a) * dist - 40;
    const m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 6), rockMat); m.position.set(x, h / 2 - 6, z); m.rotation.y = rnd() * Math.PI; ctx.scene.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.4, h * 0.34, 6), snowMat); cap.position.set(x, h - h * 0.17 - 6, z); cap.rotation.y = m.rotation.y; ctx.scene.add(cap);
  }
}

// ── The harbour basin (animated water) ────────────────────────────────
function buildBasin(ctx: WorldContext) {
  const geo = new THREE.PlaneGeometry(700, 700, 72, 72);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1d7fa4, roughness: 0.15, metalness: 0.45 });
  const holder: { shader?: any } = {};
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 }; sh.uniforms.uAmp = { value: 1 }; holder.shader = sh;
    sh.vertexShader = 'uniform float uTime; uniform float uAmp;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       float w = sin(position.x*0.10 + uTime*0.95)*0.24 + cos(position.y*0.13 + uTime*1.15)*0.2 + sin((position.x+position.y)*0.05 + uTime*0.6)*0.12;
       transformed.z += w * uAmp;`);
  };
  const sea = new THREE.Mesh(geo, mat); sea.rotation.x = -Math.PI / 2; sea.position.y = -1.1; ctx.scene.add(sea);
  ATM.setAmp = (v) => { if (holder.shader) holder.shader.uniforms.uAmp.value = v; };
  ctx.onUpdate((_d, e) => { if (holder.shader && !ctx.perf.reduced) holder.shader.uniforms.uTime.value = e; });
}

// ── Land: EXACT stepped terraces (no height field, no floating) ───────
// The previous attempt displaced a plane by a Gaussian height field. Two things
// broke: the wide bumps summed to ABOVE water level out at the islands, so green
// terrain covered the bay; and the mesh only sampled height every ~5 units, so
// buildings placed from the analytic function floated over the interpolated
// surface. Now the land is a set of FLAT annular terraces at known heights — a
// building on terrace k sits at exactly T_H[k], so it can never float, and
// everything inside LAND_R is left as open water.
const T_R = [LAND_R, LAND_R + 20, LAND_R + 40, LAND_R + 60, LAND_R + 96];  // ring radii
const T_H = [0, 7, 15, 24, 34];                                            // their heights
function buildLand(ctx: WorldContext) {
  const grass = new THREE.MeshStandardMaterial({ color: 0x54804a, roughness: 1 });
  const rockM = new THREE.MeshStandardMaterial({ color: 0x8a7f6c, roughness: 1 });

  // base shelf: an annulus at quay level filling everything outside the bay
  const base = new THREE.Mesh(new THREE.RingGeometry(T_R[0], T_R[4] + 90, 64, 1), grass);
  base.rotation.x = -Math.PI / 2; base.position.set(0, T_H[0], 0); base.receiveShadow = true; ctx.scene.add(base);
  // fill the strip between the promenade and the ring on the landward side
  const fillD = T_R[0] - Q_Z1 + 10;
  const fill = new THREE.Mesh(new THREE.BoxGeometry(T_R[0] * 2, 2.4, fillD), grass);
  fill.position.set(0, -1.2, Q_Z1 + fillD / 2 - 1); fill.receiveShadow = true; ctx.scene.add(fill);

  // rising terraces: each a flat ring top plus a riser wall at its inner edge
  for (let k = 1; k < T_R.length; k++) {
    const top = new THREE.Mesh(new THREE.RingGeometry(T_R[k], T_R[4] + 90, 64, 1), grass);
    top.rotation.x = -Math.PI / 2; top.position.set(0, T_H[k], 0); top.receiveShadow = true; ctx.scene.add(top);
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(T_R[k], T_R[k], T_H[k] - T_H[k - 1], 64, 1, true), rockM);
    riser.position.set(0, (T_H[k] + T_H[k - 1]) / 2, 0); ctx.scene.add(riser);
  }
}

// ── Dense tiered old town: houses, domes, towers (all instanced) ──────
function buildOldTown(ctx: WorldContext) {
  const COUNT = ctx.perf.reduced ? 150 : 320;
  const plaster = [0xf0dcb4, 0xe6c79a, 0xf4e6c8, 0xd8ae82, 0xecd4ae, 0xdcbe94, 0xf2d8ac, 0xcfa478];
  const roofCols = [0xc0503a, 0xb0432e, 0xcf5f42, 0xa4392a, 0xbb4b34];

  const bodies = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveMap: windowTexture(), emissiveIntensity: 0.5 }),
    COUNT,
  );
  const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(0.72, 1, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), COUNT);
  // a scatter of blue/teal domes and slim spires for the fantasy silhouette
  const DOMES = ctx.perf.reduced ? 14 : 30;
  const domes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.25 }), DOMES);
  const spires = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), DOMES);
  const domeCols = [0x3f7fb8, 0x2f6f96, 0x4a8fa8, 0x5a6fb8, 0x3a86a0];

  const d = new THREE.Object3D(); const c = new THREE.Color();

  // Neighbourhoods rather than an even ring: pick a handful of centres and
  // cluster around them, leaving open gaps between so the town has silhouette
  // instead of being one continuous band of boxes.
  const HOODS = 9;
  const hoodA: number[] = [];
  for (let i = 0; i < HOODS; i++) hoodA.push((i / HOODS) * Math.PI * 2 + rr(-0.16, 0.16));

  let placed = 0, tries = 0, dn = 0;
  while (placed < COUNT && tries < COUNT * 8) {
    tries++;
    const a = hoodA[(rnd() * HOODS) | 0] + rr(-0.2, 0.2);
    // pick a terrace, then a radius safely inside its flat top
    const k = 1 + ((rnd() * (T_R.length - 1)) | 0);
    const inner = T_R[k] + 3, outer = (k + 1 < T_R.length ? T_R[k + 1] : T_R[4] + 42) - 3;
    const rad = rr(inner, outer);
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (Math.hypot(x - LH_X, z - LH_Z) < 20) continue;                    // lighthouse ground
    if (Math.hypot(x - CA_X, z - CA_Z) < 24) continue;                    // castle ground
    // exact terrace height — a building can never float above its ring
    const hill = T_H[k];
    // taller nearer the water, squatter up the hill, with a wide spread
    const h = rr(3.0, 11.5) * (k <= 2 ? 1.15 : 0.85), w = rr(3.0, 6.6), dep = rr(3.0, 6.2);
    const ry = a + rr(-0.45, 0.45);
    d.position.set(x, hill + h / 2, z); d.scale.set(w, h, dep); d.rotation.set(0, ry, 0); d.updateMatrix(); bodies.setMatrixAt(placed, d.matrix);
    bodies.setColorAt(placed, c.setHex(plaster[(rnd() * plaster.length) | 0]));
    d.position.set(x, hill + h + 0.55, z); d.scale.set(w * 1.03, 1.7, dep * 1.03); d.rotation.set(0, ry + Math.PI / 4, 0); d.updateMatrix(); roofs.setMatrixAt(placed, d.matrix);
    roofs.setColorAt(placed, c.setHex(roofCols[(rnd() * roofCols.length) | 0]));
    // every so often crown a building with a dome or a spire
    if (dn < DOMES && rnd() < 0.12) {
      const dr = w * 0.5;
      d.position.set(x, hill + h + 0.2, z); d.scale.set(dr, dr * 1.15, dr); d.rotation.set(0, 0, 0); d.updateMatrix(); domes.setMatrixAt(dn, d.matrix);
      domes.setColorAt(dn, c.setHex(domeCols[(rnd() * domeCols.length) | 0]));
      d.position.set(x, hill + h + dr * 1.5, z); d.scale.set(dr * 0.5, dr * 1.5, dr * 0.5); d.updateMatrix(); spires.setMatrixAt(dn, d.matrix);
      spires.setColorAt(dn, c.setHex(0xd8c88a));
      dn++;
    }
    placed++;
  }
  bodies.count = placed; roofs.count = placed; domes.count = dn; spires.count = dn;
  for (const m of [bodies, roofs, domes, spires]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; ctx.scene.add(m); }
}

// ── Rotmundi Castle on the mount across the water ─────────────────────
function buildCastle(ctx: WorldContext) {
  const g = new THREE.Group(); g.position.set(CA_X, T_H[T_H.length - 1], CA_Z); ctx.scene.add(g);
  const stone = new THREE.MeshStandardMaterial({ color: 0xe0d6bc, roughness: 0.95 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x3a6ea8, roughness: 0.7, metalness: 0.15 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b45a, roughness: 0.5, metalness: 0.6 });

  const keep = new THREE.Mesh(new THREE.BoxGeometry(20, 22, 20), stone); keep.position.y = 11; g.add(keep);
  // grand central dome + lantern
  const dome = new THREE.Mesh(new THREE.SphereGeometry(8, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), roof); dome.position.y = 22; g.add(dome);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.2, 2, 20), stone); drum.position.y = 22; g.add(drum);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 3, 12), stone); lantern.position.y = 31; g.add(lantern);
  const finial = new THREE.Mesh(new THREE.ConeGeometry(1.9, 4, 12), gold); finial.position.y = 34.5; g.add(finial);
  // corner towers with spires
  for (const [tx, tz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]] as const) {
    const th = 30;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, th, 14), stone); tower.position.set(tx, th / 2, tz); g.add(tower);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4.2, 8, 14), roof); cone.position.set(tx, th + 4, tz); g.add(cone);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5), lit(0x9b5cff)); flag.position.set(tx + 1.4, th + 9, tz); g.add(flag);
  }
  // battlement teeth around the keep
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const t = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2, 1.6), stone); t.position.set(Math.cos(a) * 9.6, 23, Math.sin(a) * 9.6); g.add(t); }
}

// ── Lighthouse Hill (west) with a sweeping beam ───────────────────────
function buildLighthouse(ctx: WorldContext) {
  const g = new THREE.Group(); g.position.set(LH_X, T_H[1], LH_Z); ctx.scene.add(g);
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(9, 15, 7, 12), new THREE.MeshStandardMaterial({ color: 0x7d7466, roughness: 1 })); rock.position.y = -1; g.add(rock);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 22, 18), new THREE.MeshStandardMaterial({ color: 0xf6f2e6, roughness: 0.7 })); tower.position.y = 13; g.add(tower);
  for (let i = 0; i < 4; i++) { const band = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.85, 2.1, 18), new THREE.MeshStandardMaterial({ color: 0xd6382e, roughness: 0.7 })); band.position.y = 5 + i * 5.2; g.add(band); }
  const room = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 2.6, 14), lit(0xffe6a0)); room.position.y = 25; g.add(room);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.6, 14), new THREE.MeshStandardMaterial({ color: 0x2f3a4a, metalness: 0.6, roughness: 0.4 })); cap.position.y = 27.6; g.add(cap);
  const lampY = T_H[1] + 25;
  const lamp = new THREE.PointLight(0xffe6a0, 1.8, 70, 2); lamp.position.set(LH_X, lampY, LH_Z); ctx.scene.add(lamp);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(5, 90, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.07, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
  beam.rotation.z = Math.PI / 2; beam.position.set(LH_X, lampY, LH_Z); ctx.scene.add(beam);
  ctx.onUpdate((_d, e) => { beam.rotation.y = e * 0.5; lamp.intensity = 1.6 + Math.sin(e * 3) * 0.25; });
}

// ── The stone promenade (walkable heart of the world) ──────────────────
function buildPromenade(ctx: WorldContext) {
  const slab = new THREE.MeshStandardMaterial({ color: 0xcbbb9c, roughness: 0.95 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(Q_HW * 2, 2.4, Q_Z1 - Q_Z0), slab);
  deck.position.set(0, -1.2, (Q_Z0 + Q_Z1) / 2); deck.receiveShadow = true; ctx.scene.add(deck);
  // cobble banding across the promenade
  const band = new THREE.MeshStandardMaterial({ color: 0xb0a184, roughness: 1 });
  for (let z = Q_Z0 + 2; z < Q_Z1; z += 3.2) { const b = new THREE.Mesh(new THREE.BoxGeometry(Q_HW * 2 - 0.4, 0.05, 0.3), band); b.position.set(0, 0.02, z); ctx.scene.add(b); }
  // quay edge coping + iron bollards along the waterline
  const cope = new THREE.Mesh(new THREE.BoxGeometry(Q_HW * 2, 0.35, 0.7), new THREE.MeshStandardMaterial({ color: 0xb5a68a, roughness: 0.9 }));
  cope.position.set(0, 0.16, Q_Z0 + 0.2); ctx.scene.add(cope);
  const iron = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.6, metalness: 0.5 });
  for (let x = -Q_HW + 2; x <= Q_HW - 2; x += 4.2) {
    if (Math.abs(x) < PIER_HW + 1.4) continue;
    if (x > DOCK_X0 - 1 && x < DOCK_X1 + 1) continue;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.72, 10), iron); b.position.set(x, 0.36, Q_Z0 + 0.3); ctx.scene.add(b);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), iron); cap.position.set(x, 0.74, Q_Z0 + 0.3); ctx.scene.add(cap);
    ctx.addCollider({ x, z: Q_Z0 + 0.3, r: 0.3 });
  }
  // ornate harbour lampposts down the promenade
  for (const x of [-19, -10, 10, 19]) for (const z of [Q_Z0 + 3.5, Q_Z1 - 3]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 4.4, 10), iron); post.position.set(x, 2.2, z); ctx.scene.add(post);
    const arm = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), lit(0xffe0a0)); arm.position.set(x, 4.55, z); ctx.scene.add(arm);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 10), iron); hood.position.set(x, 5.0, z); ctx.scene.add(hood);
    ctx.addCollider({ x, z, r: 0.35 });
  }
}

// ── THE HARBOUR GATE: the great banner over the promenade ─────────────
function buildHarborGate(ctx: WorldContext) {
  const GZ = 15;                     // spans the promenade, framed against the bay
  const iron = new THREE.MeshStandardMaterial({ color: 0x2b2e36, roughness: 0.55, metalness: 0.55 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b356, roughness: 0.42, metalness: 0.72 });

  // two tall ornate posts
  for (const sx of [-7.5, 7.5]) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.95, 1.1, 12), new THREE.MeshStandardMaterial({ color: 0xb5a68a, roughness: 0.95 })); base.position.set(sx, 0.55, GZ); ctx.scene.add(base);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 11, 12), iron); post.position.set(sx, 6.6, GZ); post.castShadow = true; ctx.scene.add(post);
    for (const ry of [2.6, 5.4, 8.2]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 6, 14), gold); ring.rotation.x = Math.PI / 2; ring.position.set(sx, ry, GZ); ctx.scene.add(ring); }
    // lantern crowning each post
    const lant = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), lit(0xffe0a0)); lant.position.set(sx, 12.4, GZ); ctx.scene.add(lant);
    const lhood = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.7, 10), gold); lhood.position.set(sx, 13.05, GZ); ctx.scene.add(lhood);
    ctx.addCollider({ x: sx, z: GZ, r: 0.9 });
  }
  // cross beam
  const beam = new THREE.Mesh(new THREE.BoxGeometry(16.4, 0.4, 0.4), iron); beam.position.set(0, 11.4, GZ); ctx.scene.add(beam);
  // ship's wheel + anchor emblem crowning the gate
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.13, 8, 22), gold); wheel.position.set(0, 13.2, GZ); ctx.scene.add(wheel);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), gold); sp.position.set(0, 13.2, GZ); sp.rotation.z = a; ctx.scene.add(sp); }
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), gold); hub.position.set(0, 13.2, GZ); ctx.scene.add(hub);
  ctx.onUpdate((d) => { wheel.rotation.z += d * 0.15; });

  // the banner itself — purple with gold Georgian lettering
  const c = document.createElement('canvas'); c.width = 1024; c.height = 420;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 420); grd.addColorStop(0, '#4a1d63'); grd.addColorStop(0.5, '#5b2478'); grd.addColorStop(1, '#39154d');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 420);
  g.strokeStyle = '#d9b356'; g.lineWidth = 9; g.strokeRect(16, 16, 992, 388);
  g.strokeStyle = 'rgba(217,179,86,0.5)'; g.lineWidth = 3; g.strokeRect(34, 34, 956, 352);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#f0d488'; g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 14; g.shadowOffsetY = 5;
  g.font = 'bold 150px "Noto Sans Georgian","Segoe UI",sans-serif';
  g.fillText('როტმუნდი', 512, 176);
  g.shadowBlur = 6;
  g.fillStyle = '#e8dcc0'; g.font = 'bold 74px "Space Grotesk",monospace';
  g.letterSpacing = '16px';
  g.fillText('ROTMUNDI', 512, 306);
  const tex = new THREE.CanvasTexture(c);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 5.9), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.16 }));
  banner.position.set(0, 8.2, GZ); ctx.scene.add(banner);
  // hanging cords + a soft luff in the breeze
  for (const sx of [-7.1, 7.1]) { const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 6), gold); cord.position.set(sx, 11, GZ); ctx.scene.add(cord); }
  ctx.onUpdate((_d, e) => { banner.rotation.x = Math.sin(e * 1.1) * 0.035; banner.position.z = GZ + Math.sin(e * 0.9) * 0.06; });
}

// ── Main pier out into the basin (seals on both sides) ────────────────
function buildPier(ctx: WorldContext) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 1 });
  const len = Q_Z0 - PIER_Z;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(PIER_HW * 2, 0.3, len), wood);
  deck.position.set(0, -0.15, (Q_Z0 + PIER_Z) / 2); deck.receiveShadow = true; ctx.scene.add(deck);
  // planking
  for (let z = PIER_Z + 0.6; z < Q_Z0; z += 1.1) { const p = new THREE.Mesh(new THREE.BoxGeometry(PIER_HW * 2 - 0.12, 0.04, 0.1), dark); p.position.set(0, 0.02, z); ctx.scene.add(p); }
  // piles + rope rail posts
  for (let z = PIER_Z + 0.5; z <= Q_Z0; z += 2.4) for (const sx of [-PIER_HW, PIER_HW]) {
    const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 3, 8), dark); pile.position.set(sx, -1.5, z); ctx.scene.add(pile);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 8), dark); post.position.set(sx, 0.55, z); ctx.scene.add(post);
    ctx.addCollider({ x: sx, z, r: 0.34 });
  }
  // fishing spots at the pier head, facing out to sea
  for (const sx of [-1.3, 1.3]) ctx.addSeat({ id: `fish${sx}`, x: sx, y: 0.1, z: PIER_Z + 1.6, yaw: Math.atan2(sx, (PIER_Z + 1.6) - (PIER_Z - 20)) });
  // a lantern at the head
  const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 2.6, 8), dark); lp.position.set(0, 1.3, PIER_Z + 0.8); ctx.scene.add(lp);
  const lb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), lit(0xffe0a0)); lb.position.set(0, 2.8, PIER_Z + 0.8); ctx.scene.add(lb);
}

// ── Fisherman docks (west side) with nets and crates ─────────────────
function buildFishermanDock(ctx: WorldContext) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 1 });
  const cx = (DOCK_X0 + DOCK_X1) / 2, cz = (DOCK_Z0 + Q_Z0) / 2;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(DOCK_X1 - DOCK_X0, 0.3, Q_Z0 - DOCK_Z0), wood);
  deck.position.set(cx, -0.15, cz); deck.receiveShadow = true; ctx.scene.add(deck);
  for (let x = DOCK_X0 + 0.6; x < DOCK_X1; x += 2.2) for (const z of [DOCK_Z0 + 0.4, Q_Z0 - 0.4]) { const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 3, 8), dark); pile.position.set(x, -1.5, z); ctx.scene.add(pile); }
  // hanging net between two poles
  for (const sx of [DOCK_X0 + 0.8, DOCK_X1 - 0.8]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.4, 8), dark); pole.position.set(sx, 1.7, DOCK_Z0 + 0.8); ctx.scene.add(pole); ctx.addCollider({ x: sx, z: DOCK_Z0 + 0.8, r: 0.3 }); }
  const net = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.2), new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 1, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  net.position.set(cx, 1.9, DOCK_Z0 + 0.8); ctx.scene.add(net);
  // crates + a lobster pot
  for (let i = 0; i < 3; i++) { const cr = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), dark); cr.position.set(DOCK_X0 + 1.4 + i * 1.4, 0.4, Q_Z0 - 1.4); cr.rotation.y = rr(0, 1); ctx.scene.add(cr); ctx.addCollider({ x: cr.position.x, z: cr.position.z, r: 0.5 }); }
  // a bench looking out over the water
  ctx.addSeat({ id: 'dockbench', x: cx, y: 0.1, z: DOCK_Z0 + 2.2, yaw: Math.atan2(0, 2.2) });
}

// ── Tall galleons at anchor ───────────────────────────────────────────
function buildGalleons(ctx: WorldContext) {
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x5f3d22, roughness: 0.88 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x2f1f12, roughness: 0.9 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.9 });
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xf0e8d4, roughness: 1, side: THREE.DoubleSide });
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 1 });
  const flagCols = [0xd83a3a, 0x3a8ad8, 0x9b5cff, 0xd8a83a];

  // Two only, kept out near the harbour mouth — four of them filled the bay.
  const ships: Array<[number, number, number, number]> = [
    [-20, -46, 0.5, 1.6], [14, -50, -0.5, 1.8],
  ];
  ships.forEach(([sx, sz, ry, sc], si) => {
    const g = new THREE.Group(); g.position.set(sx, -1.3, sz); g.rotation.y = ry; g.scale.setScalar(sc); ctx.scene.add(g);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 11), hullMat); hull.position.y = 0.2; hull.castShadow = true; g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.7, 3.6, 4), hullMat); bow.rotation.x = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(0, 0.2, -6.4); bow.scale.set(1, 1, 0.5); g.add(bow);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.3, 11), trimMat); stripe.position.y = 1.1; g.add(stripe);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 10.6), deckMat); deck.position.y = 1.35; g.add(deck);
    // stern castle
    const castle = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 3), deckMat); castle.position.set(0, 2.5, 3.9); g.add(castle);
    const cRoof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.2, 3.2), trimMat); cRoof.position.set(0, 3.7, 3.9); g.add(cRoof);
    // bowsprit
    const bs = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 4.4, 6), mastMat); bs.position.set(0, 2, -7.4); bs.rotation.x = 1.25; g.add(bs);
    // three masts with square sails + yards
    for (const [mz, mh] of [[-3.4, 12], [0.4, 15], [3.4, 10.5]] as const) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, mh, 8), mastMat); mast.position.set(0, mh / 2 + 1.4, mz); g.add(mast);
      for (let s = 0; s < 3; s++) {
        const y = 3.6 + s * 3.4; if (y > mh) break;
        const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.4, 6), mastMat); yard.rotation.z = Math.PI / 2; yard.position.set(0, y + 1.3, mz); g.add(yard);
        const sail = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.7), sailMat); sail.position.set(0, y, mz); sail.rotation.y = Math.PI / 2; g.add(sail);
        ctx.onUpdate((_d, e) => { sail.scale.x = 1 + Math.sin(e * 1.3 + s + si) * 0.04; });
      }
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), lit(flagCols[(si + (mz > 0 ? 1 : 0)) % flagCols.length])); flag.position.set(0.8, mh + 1.1, mz); g.add(flag);
    }
    ctx.onUpdate((_d, e) => { g.rotation.z = Math.sin(e * 0.55 + si) * 0.028; g.position.y = -1.3 + Math.sin(e * 0.68 + si * 2) * 0.09; });
  });
}

// ── THE FLAGSHIP: a galleon you can actually board ───────────────────
// Built so its DECK PLANE IS EXACTLY y = 0 (the engine's walkable height), with
// a floating boarding jetty + gangplank alongside — ride a boat out, tie up,
// walk aboard, and take the bow pose at the figurehead.
const FS_X = -8, FS_Z = -32, FS_RY = 0.32;      // flagship pose/anchor
const FS_HW = 2.6, FS_LEN = 9.5;                // half-width, half-length of the deck
function buildFlagship(ctx: WorldContext) {
  const g = new THREE.Group(); g.position.set(FS_X, 0, FS_Z); g.rotation.y = FS_RY; ctx.scene.add(g);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x6b4527, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x35231a, roughness: 0.9 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x9a7248, roughness: 0.9 });
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xf4ecd8, roughness: 1, side: THREE.DoubleSide });
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 1 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b45a, roughness: 0.45, metalness: 0.6 });

  // hull below the deck plane (top exactly at y = 0)
  const hull = new THREE.Mesh(new THREE.BoxGeometry(FS_HW * 2, 3.2, FS_LEN * 2), hullMat); hull.position.y = -1.6; hull.castShadow = true; g.add(hull);
  const wale = new THREE.Mesh(new THREE.BoxGeometry(FS_HW * 2 + 0.16, 0.34, FS_LEN * 2), dark); wale.position.y = -0.55; g.add(wale);
  const gild = new THREE.Mesh(new THREE.BoxGeometry(FS_HW * 2 + 0.2, 0.1, FS_LEN * 2), gold); gild.position.y = -0.3; g.add(gild);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(FS_HW, 5, 4), hullMat); bow.rotation.x = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(0, -1.4, -FS_LEN - 1.6); bow.scale.set(1, 1, 0.55); g.add(bow);
  // planked deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(FS_HW * 2, 0.12, FS_LEN * 2), deckMat); deck.position.y = -0.06; deck.receiveShadow = true; g.add(deck);
  for (let z = -FS_LEN + 0.5; z < FS_LEN; z += 1.1) { const pl = new THREE.Mesh(new THREE.BoxGeometry(FS_HW * 2 - 0.1, 0.03, 0.09), dark); pl.position.set(0, 0.02, z); g.add(pl); }
  // bulwarks (low side walls) with a boarding gap amidships to starboard
  for (const sx of [-FS_HW, FS_HW]) for (let z = -FS_LEN; z <= FS_LEN; z += 1.2) {
    if (sx > 0 && Math.abs(z - 1.5) < 1.6) continue;            // gangway gap
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 1.2), hullMat); w.position.set(sx, 0.34, z); g.add(w);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 1.2), dark); cap.position.set(sx, 0.75, z); g.add(cap);
  }
  const stern = new THREE.Mesh(new THREE.BoxGeometry(FS_HW * 2, 0.8, 0.18), hullMat); stern.position.set(0, 0.36, FS_LEN); g.add(stern);
  // aft castle with a lantern + the ship's wheel
  const castle = new THREE.Mesh(new THREE.BoxGeometry(FS_HW * 2 - 0.4, 1.5, 3), deckMat); castle.position.set(0, 0.75, FS_LEN - 2); g.add(castle);
  const sternLantern = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), lit(0xffd88a)); sternLantern.position.set(0, 2.0, FS_LEN - 0.6); g.add(sternLantern);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 18), mastMat); wheel.position.set(0, 2.05, FS_LEN - 3.4); wheel.rotation.x = 0.35; g.add(wheel);
  for (let i = 0; i < 8; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.06), mastMat); sp.position.copy(wheel.position); sp.rotation.set(0.35, 0, (i / 8) * Math.PI * 2); g.add(sp); }
  ctx.onUpdate((d) => { wheel.rotation.z += d * 0.25; });
  // gilded figurehead under the bowsprit
  const fig = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.3, 8), gold); fig.rotation.x = Math.PI / 2 + 0.4; fig.position.set(0, -0.2, -FS_LEN - 1.2); g.add(fig);
  // angled down and set low so it never crosses the bow sightline
  const bs = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 3.4, 6), mastMat); bs.position.set(0, -0.75, -FS_LEN - 1.5); bs.rotation.x = 1.05; g.add(bs);
  // three masts with yards, square sails and rigging
  for (const [mz, mh] of [[-4.6, 15], [0.6, 19], [4.8, 13]] as const) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, mh, 10), mastMat); mast.position.set(0, mh / 2, mz); g.add(mast);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.36, 0.3, 10), mastMat); top.position.set(0, mh * 0.62, mz); g.add(top);
    for (let s = 0; s < 3; s++) {
      const y = 3.8 + s * 4.2; if (y + 2.6 > mh) break;
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5.6, 6), mastMat); yard.rotation.z = Math.PI / 2; yard.position.set(0, y + 1.5, mz); g.add(yard);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(5.3, 3.1), sailMat); sail.position.set(0, y, mz); sail.rotation.y = Math.PI / 2; g.add(sail);
      ctx.onUpdate((_d, e) => { sail.scale.x = 1 + Math.sin(e * 1.25 + s + mz) * 0.045; });
    }
    // rigging: shrouds down to the rail (skipped on the foremast so the bow
    // pose keeps a clean view forward)
    if (mz > -4) for (const sx of [-FS_HW, FS_HW]) for (const off of [-1.1, 1.1]) {
      const l = Math.hypot(FS_HW, mh * 0.6);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, l, 4), dark);
      rope.position.set(sx / 2, mh * 0.3, mz + off / 2); rope.rotation.z = Math.atan2(sx, mh * 0.6); rope.rotation.x = Math.atan2(off, mh * 0.6);
      g.add(rope);
    }
    const flagCol = [0x9b5cff, 0xd83a3a, 0x3a8ad8][Math.abs(Math.round(mz)) % 3];
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.1), lit(flagCol)); flag.position.set(0.9, mh + 0.8, mz); g.add(flag);
    ctx.onUpdate((_d, e) => { flag.rotation.y = Math.sin(e * 2.2 + mz) * 0.4; });
  }
  // deck lanterns so the ship glows at night
  for (const lz of [-6, -1, 5]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), lit(0xffd88a)); l.position.set(0, 1.1, lz); g.add(l); }
  const glow = new THREE.PointLight(0xffd08a, 1.1, 22, 2); glow.position.set(FS_X, 3, FS_Z); ctx.scene.add(glow);
  ctx.onUpdate((_d, e) => { glow.intensity = 1.0 + Math.sin(e * 2.6) * 0.15; });

  // ── boarding jetty alongside the gangway (also at deck level) ──
  const cs = Math.cos(FS_RY), sn = Math.sin(FS_RY);
  const jl = FS_HW + 2.4;                                     // offset to starboard
  const jx = FS_X + jl * cs, jz = FS_Z - jl * sn + 1.5 * cs;
  const jetty = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.24, 5), new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 1 }));
  jetty.position.set(jx, -0.12, jz); jetty.rotation.y = FS_RY; jetty.receiveShadow = true; ctx.scene.add(jetty);
  for (const o of [-2, 2]) for (const s2 of [-1.4, 1.4]) { const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.4, 8), dark); pile.position.set(jx + s2 * cs + o * sn, -1.7, jz - s2 * sn + o * cs); ctx.scene.add(pile); }
  // gangplank bridging jetty → gangway gap
  const plank = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 1.5), new THREE.MeshStandardMaterial({ color: 0x9a7248, roughness: 1 }));
  const px = FS_X + (FS_HW + 1.2) * cs, pz = FS_Z - (FS_HW + 1.2) * sn + 1.5 * cs;
  plank.position.set(px, 0.02, pz); plank.rotation.y = FS_RY; ctx.scene.add(plank);

  // dry ground: the deck, the gangplank and the jetty (rotated rects)
  ctx.addDryZone({ x: FS_X, z: FS_Z, hw: FS_HW + 0.2, hd: FS_LEN + 0.3, yaw: FS_RY });
  ctx.addDryZone({ x: px, z: pz, hw: 1.5, hd: 1.0, yaw: FS_RY });
  ctx.addDryZone({ x: jx, z: jz, hw: 1.9, hd: 2.6, yaw: FS_RY });

  // bulwark colliders so you can't walk off the deck (gangway stays open)
  for (const sx of [-FS_HW - 0.1, FS_HW + 0.1]) for (let z = -FS_LEN; z <= FS_LEN; z += 1.3) {
    if (sx > 0 && Math.abs(z - 1.5) < 1.7) continue;
    ctx.addCollider({ x: FS_X + sx * cs + z * sn, z: FS_Z - sx * sn + z * cs, r: 0.45 });
  }
  for (const z of [-FS_LEN - 0.2, FS_LEN + 0.2]) for (let sx = -FS_HW; sx <= FS_HW; sx += 1.2) {
    // leave the very bow clear for the pose spots
    if (z < 0 && Math.abs(sx) < 1.2) continue;
    ctx.addCollider({ x: FS_X + sx * cs + z * sn, z: FS_Z - sx * sn + z * cs, r: 0.45 });
  }

  // ── THE TITANIC PAIR at the bow ──
  // Front stands at the rail with arms spread; the partner stands right behind
  // with both arms wrapped around their waist. Both face the bow direction,
  // which for a group rotated by FS_RY is exactly yaw = FS_RY.
  const bowL = FS_LEN - 0.7;
  const fx = FS_X - sn * bowL, fz = FS_Z - cs * bowL;
  const bx = FS_X - sn * (bowL - 0.62), bz = FS_Z - cs * (bowL - 0.62);
  ctx.addSeat({ id: 'titanic-front', x: fx, y: 0, z: fz, yaw: FS_RY, pose: 'titanic' });
  ctx.addSeat({ id: 'titanic-back', x: bx, y: 0, z: bz, yaw: FS_RY, pose: 'titanicBack' });
  // a heart marker so the spot reads as the couples pose
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), lit(0xff4d6d));
  heart.scale.set(1, 0.9, 0.6); heart.position.set(0, 2.6, -bowL); g.add(heart);
  ctx.onUpdate((_d, e) => { heart.position.y = 2.55 + Math.sin(e * 1.6) * 0.09; heart.rotation.y = e * 0.7; });

  // moor a boat at the jetty so you can always get back
  ctx.addVehicle({ id: 'flagboat', kind: 'boat', x: jx + 2.6 * cs, z: jz - 2.6 * sn, yaw: FS_RY, waterY: -1.1 });
}

// ── SECRET COVE: a sandy shore across the basin you can land on ──────
const COVE_X = -34, COVE_Z = -26;
function buildSecretCove(ctx: WorldContext) {
  const sand = new THREE.MeshStandardMaterial({ color: 0xd8c496, roughness: 1 });
  const rock = new THREE.MeshStandardMaterial({ color: 0x7a7264, roughness: 1 });
  // the beach shelf — top exactly at y = 0 so you walk straight out of the water
  const beach = new THREE.Mesh(new THREE.CylinderGeometry(13, 15, 2.4, 32), sand);
  beach.position.set(COVE_X, -1.2, COVE_Z); beach.receiveShadow = true; ctx.scene.add(beach);
  // a gentle wet ramp into the water so the landing reads naturally
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 5), sand);
  ramp.position.set(COVE_X + 6, -0.6, COVE_Z + 8); ramp.rotation.x = -0.14; ramp.rotation.y = -0.6; ctx.scene.add(ramp);
  // sheltering cliffs behind
  for (let i = 0; i < 9; i++) {
    const a = rr(Math.PI * 0.75, Math.PI * 1.95);
    const r = rr(14, 20), h = rr(7, 18);
    const c = new THREE.Mesh(new THREE.ConeGeometry(rr(5, 9), h, 7), rock);
    c.position.set(COVE_X + Math.cos(a) * r, h / 2 - 1.5, COVE_Z + Math.sin(a) * r); c.rotation.y = rnd() * Math.PI; ctx.scene.add(c);
    ctx.addCollider({ x: c.position.x, z: c.position.z, r: 4.5 });
  }
  // palms + a bonfire + log seats to make it a destination
  for (let i = 0; i < 5; i++) {
    const a = rr(0, Math.PI * 2), r = rr(5, 11);
    const x = COVE_X + Math.cos(a) * r, z = COVE_Z + Math.sin(a) * r;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 6, 8), new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 1 }));
    trunk.position.set(x, 3, z); trunk.rotation.z = rr(-0.12, 0.12); ctx.scene.add(trunk);
    for (let f = 0; f < 6; f++) { const fr = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.09, 0.7), new THREE.MeshStandardMaterial({ color: 0x2f6a34, roughness: 1 })); const fa = (f / 6) * Math.PI * 2; fr.position.set(x + Math.cos(fa) * 1.5, 6, z + Math.sin(fa) * 1.5); fr.rotation.set(0, fa, -0.3); ctx.scene.add(fr); }
    ctx.addCollider({ x, z, r: 0.5 });
  }
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 8), lit(0xff9a3c)); fire.position.set(COVE_X, 0.75, COVE_Z); ctx.scene.add(fire);
  const fl = new THREE.PointLight(0xff7a2a, 2.0, 16, 2); fl.position.set(COVE_X, 1.2, COVE_Z); ctx.scene.add(fl);
  ctx.onUpdate((_d, e) => { if (ctx.perf.reduced) return; const f = 0.85 + Math.sin(e * 12) * 0.13; fire.scale.set(1, f, 1); fl.intensity = 1.9 + Math.sin(e * 15) * 0.4; });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4, sx = COVE_X + Math.cos(a) * 2.8, sz = COVE_Z + Math.sin(a) * 2.8;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.3, 10), new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 1 }));
    log.rotation.z = Math.PI / 2; log.rotation.y = a; log.position.set(sx, 0.3, sz); ctx.scene.add(log);
    ctx.addCollider({ x: sx, z: sz, r: 0.42 });
    ctx.addSeat({ id: `cove${i}`, x: sx, y: 0.58, z: sz, yaw: Math.atan2(sx - COVE_X, sz - COVE_Z) });
  }
  // a hug spot on the sand
  addHugSpot(ctx, COVE_X + 5.5, COVE_Z - 4, 0.8, 0xffb877, 'cove-love');
  // the cove is dry ground; a boat waits so you can head back
  ctx.addDryZone({ x: COVE_X, z: COVE_Z, r: 13.4 });
  ctx.addVehicle({ id: 'coveboat', kind: 'boat', x: COVE_X + 11, z: COVE_Z + 10, yaw: 0.6, waterY: -1.1 });
}

// ── THE VILLA: a furnished house on the island across the bay ─────────
// Reachable by boat. Its floor is exactly at walk height, it is OPEN-TOPPED so
// the third-person camera never clips into black, and it holds a wall TV you can
// put YouTube on, two 2-seat sofas, a lap-sitting loveseat and full furnishings.
const VL_X = 24, VL_Z = -32;                  // island centre
const V_HW = 9, V_HD = 7.5, V_WH = 3.0;       // villa interior half-extents / wall height
function buildVilla(ctx: WorldContext) {
  const sand = new THREE.MeshStandardMaterial({ color: 0xd8c496, roughness: 1 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x54804a, roughness: 1 });

  // the island pad — top exactly at walk height so you step out of the water
  const isle = new THREE.Mesh(new THREE.CylinderGeometry(17, 19, 2.4, 36), sand);
  isle.position.set(VL_X, -1.2, VL_Z); isle.receiveShadow = true; ctx.scene.add(isle);
  const lawn = new THREE.Mesh(new THREE.CylinderGeometry(14.4, 14.4, 0.12, 36), grass);
  lawn.position.set(VL_X, 0.02, VL_Z); ctx.scene.add(lawn);

  // landing jetty on the west side, facing the harbour
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 1 });
  const jetty = new THREE.Mesh(new THREE.BoxGeometry(4, 0.24, 8), wood);
  jetty.position.set(VL_X - 18, -0.12, VL_Z); jetty.receiveShadow = true; ctx.scene.add(jetty);
  for (const dz of [-3, 0, 3]) for (const dx of [-1.6, 1.6]) { const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.2, 8), dark); pile.position.set(VL_X - 18 + dx, -1.7, VL_Z + dz); ctx.scene.add(pile); }

  // ── the villa shell (open top) ──
  const g = new THREE.Group(); g.position.set(VL_X, 0, VL_Z); ctx.scene.add(g);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xefe2c8, roughness: 0.9 });
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 1 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(V_HW * 2, 0.12, V_HD * 2), new THREE.MeshStandardMaterial({ color: 0x8a6a46, roughness: 0.85 }));
  floor.position.y = 0.06; floor.receiveShadow = true; g.add(floor);
  for (let x = -V_HW + 0.6; x < V_HW; x += 1.2) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, V_HD * 2 - 0.2), beamMat); pl.position.set(x, 0.13, 0); g.add(pl); }
  const wall = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  };
  const TH = 0.3, DOOR = 3.2;
  wall(V_HW * 2 + TH, V_WH, TH, 0, V_WH / 2, -V_HD);                 // back (the TV wall)
  wall(TH, V_WH, V_HD * 2, V_HW, V_WH / 2, 0);                       // east
  wall(TH, V_WH, V_HD * 2, -V_HW, V_WH / 2, 0);                      // west
  const seg = (V_HW * 2 - DOOR) / 2;                                 // front with a wide doorway
  wall(seg, V_WH, TH, -(DOOR / 2 + seg / 2), V_WH / 2, V_HD);
  wall(seg, V_WH, TH, (DOOR / 2 + seg / 2), V_WH / 2, V_HD);
  // open beam frame + eaves (reads as a roof, leaves the centre open)
  for (const [px, pz] of [[-V_HW, -V_HD], [V_HW, -V_HD], [-V_HW, V_HD], [V_HW, V_HD]] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, V_WH + 1.5, 0.32), beamMat); post.position.set(px, (V_WH + 1.5) / 2, pz); g.add(post);
  }
  for (const sgn of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(V_HW * 2 + 0.5, 0.22, 0.22), beamMat); beam.position.set(0, V_WH + 1.4, sgn * V_HD); g.add(beam);
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, V_HD * 2), beamMat); side.position.set(sgn * V_HW, V_WH + 1.4, 0); g.add(side);
    const eave = new THREE.Mesh(new THREE.BoxGeometry(V_HW * 2 + 1.4, 0.16, 1.6), new THREE.MeshStandardMaterial({ color: 0xb0432e, roughness: 1 }));
    eave.position.set(0, V_WH + 1.6, sgn * (V_HD - 0.2)); eave.rotation.x = sgn * -0.5; g.add(eave);
  }
  // glowing side windows
  for (const wz of [-3.4, 0, 3.4]) for (const sx of [-V_HW - 0.02, V_HW + 0.02]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 1.5), lit(0xffe0a8)); win.position.set(sx, 1.7, wz); g.add(win);
  }

  // ── the wall TV (world cinema: put YouTube on it) ──
  const SW = 6.2, SH = 3.5, SCY = 2.0, SZ = -V_HD + 0.2;
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.4, SH + 0.4, 0.16), new THREE.MeshStandardMaterial({ color: 0x14151c, roughness: 0.5, metalness: 0.4 }));
  bezel.position.set(0, SCY, SZ - 0.06); g.add(bezel);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ color: 0x0b1024, toneMapped: false }));
  panel.position.set(0, SCY, SZ + 0.03); g.add(panel);
  for (const [w, h, dx, dy] of [[SW + 0.4, 0.06, 0, SH / 2 + 0.2], [SW + 0.4, 0.06, 0, -SH / 2 - 0.2], [0.06, SH + 0.4, SW / 2 + 0.2, 0], [0.06, SH + 0.4, -SW / 2 - 0.2, 0]] as const) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), lit(0x9b5cff)); bar.position.set(dx, SCY + dy, SZ + 0.05); g.add(bar);
  }
  ctx.setScreen({ x: VL_X, y: SCY, z: VL_Z + SZ + 0.04, w: SW, h: SH, ry: 0 });
  // the remote: id 'dj' is what opens the shared music/video panel
  ctx.addInteractable({ id: 'dj', x: VL_X, z: VL_Z + SZ + 2.2, r: 2.4, label: '📺 ტელევიზორი', effect: () => { /* panel opens via onInteract('dj') */ } });
  const tvGlow = new THREE.PointLight(0x7a8cff, 1.0, 14, 2); tvGlow.position.set(0, SCY, SZ + 2); g.add(tvGlow);
  ctx.onUpdate((_d, e) => { tvGlow.intensity = 0.9 + Math.sin(e * 2.2) * 0.15; });

  // ── seating facing the TV: TWO 2-SEAT SOFAS ──
  const sofaMat = new THREE.MeshStandardMaterial({ color: 0x3f4657, roughness: 0.88 });
  const faceTV = (wx: number, wz: number) => Math.atan2(wx - VL_X, wz - (VL_Z + SZ));
  for (const [sx, sz] of [[-3.3, 1.4], [3.3, 1.4]] as const) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.45, 1.1), sofaMat); base.position.set(sx, 0.35, sz); base.castShadow = true; g.add(base);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.7, 0.2), sofaMat); back.position.set(sx, 0.78, sz + 0.45); g.add(back);
    for (const ax of [-1.4, 1.4]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 1.1), sofaMat); arm.position.set(sx + ax, 0.5, sz); g.add(arm); }
    // two seats per sofa → 2 + 2
    for (const off of [-0.7, 0.7]) {
      const wx = VL_X + sx + off, wz = VL_Z + sz;
      ctx.addSeat({ id: `sofa${sx}${off}`, x: wx, y: 0.62, z: wz, yaw: faceTV(wx, wz) });
    }
    ctx.addCollider({ x: VL_X + sx, z: VL_Z + sz + 0.5, r: 0.6 });
  }

  // ── the LAP-SIT loveseat: one sits in the other's lap, both watch the TV ──
  const lx = 0, lz = 3.4;
  const lBase = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 1.1), new THREE.MeshStandardMaterial({ color: 0x5a3f57, roughness: 0.88 }));
  lBase.position.set(lx, 0.35, lz); lBase.castShadow = true; g.add(lBase);
  const lBack = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 0.2), (lBase.material as THREE.Material)); lBack.position.set(lx, 0.82, lz + 0.45); g.add(lBack);
  for (const ax of [-0.85, 0.85]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 1.1), (lBase.material as THREE.Material)); arm.position.set(lx + ax, 0.5, lz); g.add(arm); }
  const lheart = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), lit(0xff4d6d)); lheart.scale.set(1, 0.9, 0.6); lheart.position.set(lx, 2.1, lz); g.add(lheart);
  ctx.onUpdate((_d, e) => { lheart.position.y = 2.05 + Math.sin(e * 1.6) * 0.08; lheart.rotation.y = e * 0.7; });
  {
    const wx = VL_X + lx, wz = VL_Z + lz, yw = faceTV(wx, wz);
    // the one underneath sits on the cushion; the one on top sits higher and a
    // touch forward, so they end up on their partner's lap
    ctx.addSeat({ id: 'lap-base', x: wx, y: 0.62, z: wz, yaw: yw, pose: 'lapBase' });
    // up on the thighs and turned a quarter step, so the legs hang off to the
    // side and the upper body tips back into the partner (see the reference)
    ctx.addSeat({ id: 'lap-top', x: wx - Math.sin(yw) * 0.18, y: 1.02, z: wz - Math.cos(yw) * 0.18, yaw: yw + Math.PI / 2, pose: 'lapTop' });
    ctx.addCollider({ x: wx, z: wz + 0.55, r: 0.6 });
  }

  // ── furnishings ──
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x4a3527, roughness: 0.9 });
  const rug = new THREE.Mesh(new THREE.CircleGeometry(4.2, 32), new THREE.MeshStandardMaterial({ color: 0x7a3b3b, roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.14, 0.3); g.add(rug);
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 1.2), woodDark); table.position.set(0, 0.55, 0.2); g.add(table);
  for (const [tx, tz] of [[-1.1, -0.4], [1.1, -0.4], [-1.1, 0.8], [1.1, 0.8]] as const) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), woodDark); leg.position.set(tx, 0.28, 0.2 + tz * 0.35); g.add(leg); }
  ctx.addCollider({ x: VL_X, z: VL_Z + 0.2, r: 1.1 });
  // kitchen counter along the east wall
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 5.4), new THREE.MeshStandardMaterial({ color: 0x2f3540, roughness: 0.6, metalness: 0.25 }));
  counter.position.set(V_HW - 0.9, 0.55, -1.5); g.add(counter);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.1, 5.5), new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.35, metalness: 0.5 })); top.position.set(V_HW - 0.9, 1.1, -1.5); g.add(top);
  for (let i = 0; i < 4; i++) { const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.34, 8), lit([0x6aff9e, 0xffcf6a, 0x6ab0ff, 0xff6a8a][i])); jar.position.set(V_HW - 0.9, 1.32, -3.4 + i * 1.2); g.add(jar); }
  for (let z = -3.6; z <= 0.6; z += 1.4) ctx.addCollider({ x: VL_X + V_HW - 0.9, z: VL_Z + z, r: 0.75 });
  // bookshelf on the west wall
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 3.4), woodDark); shelf.position.set(-V_HW + 0.5, 1.2, -2.2); g.add(shelf);
  for (let r2 = 0; r2 < 4; r2++) for (let b = 0; b < 7; b++) {
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.16), new THREE.MeshStandardMaterial({ color: [0xb0432e, 0x2f6a8a, 0x6a8a3a, 0x8a5aa0, 0xd8a83a][(r2 + b) % 5], roughness: 0.9 }));
    book.position.set(-V_HW + 0.52, 0.5 + r2 * 0.6, -3.7 + b * 0.45); g.add(book);
  }
  for (let z = -3.4; z <= -1; z += 1.2) ctx.addCollider({ x: VL_X - V_HW + 0.5, z: VL_Z + z, r: 0.7 });
  // standing lamps + hanging pendant
  for (const [px2, pz2] of [[-V_HW + 1.6, 3.4], [V_HW - 1.6, 3.4]] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.9, 8), woodDark); pole.position.set(px2, 0.95, pz2); g.add(pole);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 12), lit(0xffe0a8)); shade.position.set(px2, 2.05, pz2); g.add(shade);
  }
  const pendant = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), lit(0xffe0a8)); pendant.position.set(0, V_WH + 0.5, 0.3); g.add(pendant);
  const roomLight = new THREE.PointLight(0xffd8a8, 1.9, 26, 2); roomLight.position.set(VL_X, V_WH - 0.2, VL_Z + 0.3); ctx.scene.add(roomLight);
  ctx.onUpdate((_d, e) => { roomLight.intensity = 1.8 + Math.sin(e * 2.6) * 0.12; });
  // potted plants
  for (const [px2, pz2] of [[-V_HW + 1.1, -V_HD + 1.2], [V_HW - 1.1, V_HD - 1.2]] as const) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.66, 12), new THREE.MeshStandardMaterial({ color: 0xb56a48, roughness: 1 })); pot.position.set(px2, 0.4, pz2); g.add(pot);
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshStandardMaterial({ color: 0x2f6a34, roughness: 1 })); bush.position.set(px2, 1.1, pz2); bush.scale.y = 1.2; g.add(bush);
    ctx.addCollider({ x: VL_X + px2, z: VL_Z + pz2, r: 0.55 });
  }

  // ── zones + boundaries ──
  ctx.addDryZone({ x: VL_X, z: VL_Z, r: 17.4 });          // the whole island (villa included)
  ctx.addDryZone({ x: VL_X - 18, z: VL_Z, hw: 2.4, hd: 4.4 });   // landing jetty
  // villa walls (front doorway kept clear)
  const addWall = (ax: number, az: number, len: number, horiz: boolean, gap = 0) => {
    const n = Math.max(1, Math.round(len / 1.1));
    for (let i = 0; i <= n; i++) {
      const t = (i / n - 0.5) * len;
      if (gap > 0 && Math.abs(t) < gap / 2) continue;
      ctx.addCollider({ x: VL_X + (horiz ? t : ax), z: VL_Z + (horiz ? az : t), r: 0.6 });
    }
  };
  addWall(0, -V_HD, V_HW * 2, true);
  addWall(-V_HW, 0, V_HD * 2, false);
  addWall(V_HW, 0, V_HD * 2, false);
  addWall(0, V_HD, V_HW * 2, true, DOOR + 1.2);
  // No shoreline wall: the beach shelves straight into the sea, so you can wade
  // or swim ashore from any side and walk back out again. The ring of colliders
  // that used to be here blocked every approach but one narrow arc, which is
  // what made getting onto the island so fiddly.
  // palms + a boat home
  for (let i = 0; i < 5; i++) {
    const a = rr(0, Math.PI * 2), r2 = rr(11, 15.5);
    const x = VL_X + Math.cos(a) * r2, z = VL_Z + Math.sin(a) * r2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 6, 8), new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 1 })); trunk.position.set(x, 3, z); trunk.rotation.z = rr(-0.1, 0.1); ctx.scene.add(trunk);
    for (let f = 0; f < 6; f++) { const fr = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.09, 0.7), new THREE.MeshStandardMaterial({ color: 0x2f6a34, roughness: 1 })); const fa = (f / 6) * Math.PI * 2; fr.position.set(x + Math.cos(fa) * 1.5, 6, z + Math.sin(fa) * 1.5); fr.rotation.set(0, fa, -0.3); ctx.scene.add(fr); }
    ctx.addCollider({ x, z, r: 0.5 });
  }
  ctx.addVehicle({ id: 'villaboat', kind: 'boat', x: VL_X - 21.5, z: VL_Z + 1, yaw: -Math.PI / 2, waterY: -1.1 });
}

// ── Little rowboats dotted about the basin ────────────────────────────
function buildRowboats(ctx: WorldContext) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 1 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xc45a4a, roughness: 0.9 });
  for (const [bx, bz, ry] of [[-7, -3, 0.4], [8, -6, -0.7], [-20, -14, 1.1], [19, -20, 0.2], [4, -14, -0.3]] as const) {
    const g = new THREE.Group(); g.position.set(bx, -1.35, bz); g.rotation.y = ry; ctx.scene.add(g);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 3.1), wood); hull.position.y = 0.25; g.add(hull);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 4), wood); nose.rotation.x = -Math.PI / 2; nose.rotation.y = Math.PI / 4; nose.position.set(0, 0.25, -1.9); nose.scale.set(1, 1, 0.5); g.add(nose);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.1, 3.15), trim); rim.position.y = 0.5; g.add(rim);
    for (const sx of [-0.75, 0.75]) { const oar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 2), wood); oar.position.set(sx, 0.5, 0.2); oar.rotation.z = sx > 0 ? -0.3 : 0.3; g.add(oar); }
    const ph = bx + bz;
    ctx.onUpdate((_d, e) => { g.position.y = -1.35 + Math.sin(e * 1.1 + ph) * 0.08; g.rotation.z = Math.sin(e * 0.9 + ph) * 0.06; });
  }
}

// ── Old Ship Graveyard (east shallows) ────────────────────────────────
function buildWrecks(ctx: WorldContext) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x33261a, roughness: 1 });
  const sail = new THREE.MeshStandardMaterial({ color: 0x5a5344, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.65 });
  for (const [x, z, ry, tilt] of [[46, -20, 0.6, 0.22], [40, -40, 1.2, 0.16]] as const) {
    const g = new THREE.Group(); g.position.set(x, -0.5, z); g.rotation.set(0, ry, tilt); ctx.scene.add(g);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 10), wood); g.add(hull);
    // broken ribs poking out of the hull
    for (let i = 0; i < 6; i++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.16), wood); rib.position.set(rr(-1.5, 1.5), 1.6, -4 + i * 1.6); rib.rotation.z = rr(-0.3, 0.3); g.add(rib); }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 11, 6), wood); mast.position.set(0, 5, rr(-2, 2)); mast.rotation.z = rr(-0.2, 0.2); g.add(mast);
    const tatter = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4), sail); tatter.position.set(0, 5, 0); g.add(tatter);
  }
}

// ── Friendly ghost seals: bob, roll, and wave a flipper ───────────────
function buildGhostSeals(ctx: WorldContext) {
  const body = new THREE.MeshStandardMaterial({ color: 0xf2f8ff, roughness: 0.55, transparent: true, opacity: 0.88, emissive: 0x9fc4e0, emissiveIntensity: 0.4 });
  const eye = new THREE.MeshBasicMaterial({ color: 0x1a2230, toneMapped: false });
  const nose = new THREE.MeshBasicMaterial({ color: 0x35404f, toneMapped: false });
  // clustered right off the quay + pier — the "Ghost Seal Lagoon"
  const spots: Array<[number, number]> = [[-5.5, 4], [5, 2], [-9, -1.5], [8.5, -4], [-3, -7], [12, 3], [-14, 1]];
  spots.forEach(([x, z], i) => {
    const g = new THREE.Group(); g.position.set(x, -1.42, z);
    g.rotation.y = Math.atan2(x - 0, z - 22);            // look toward the promenade
    ctx.scene.add(g);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), body); torso.scale.set(1, 1.1, 1.6); torso.position.y = 0.32; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.44, 16, 12), body); head.position.set(0, 0.95, -0.6); g.add(head);
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), body); snout.position.set(0, 0.84, -0.96); snout.scale.set(1, 0.82, 1.15); g.add(snout);
    const nz = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), nose); nz.position.set(0, 0.85, -1.14); g.add(nz);
    for (const ex of [-0.17, 0.17]) { const e2 = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), eye); e2.position.set(ex, 1.03, -0.92); g.add(e2); }
    for (const wx of [-0.12, 0.12]) { const wh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.012), nose); wh.position.set(wx * 2.6, 0.84, -1.06); wh.rotation.y = wx > 0 ? -0.3 : 0.3; g.add(wh); }
    const flipper = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.15, 0.36), body); flipper.position.set(0.58, 0.45, 0.05); g.add(flipper);
    const flipperL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.34), body); flipperL.position.set(-0.56, 0.3, 0.1); flipperL.rotation.z = 0.3; g.add(flipperL);
    // ripple ring on the surface
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.045, 6, 26), new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.32; g.add(ring);
    const ph = i * 1.27;
    ctx.onUpdate((_d, e) => {
      g.position.y = -1.42 + Math.sin(e * 1.35 + ph) * 0.13;
      g.rotation.z = Math.sin(e * 1.05 + ph) * 0.09;
      flipper.rotation.z = -0.65 + Math.abs(Math.sin(e * 3.1 + ph)) * 1.5;   // wave!
      const t = (e * 0.55 + i * 0.3) % 1;
      ring.scale.setScalar(0.6 + t * 1.1);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.38 * (1 - t);
    });
  });
}

// ── Shadowbirds: fast, colourful, with light trails ──────────────────
function buildShadowbirds(ctx: WorldContext) {
  const COUNT = ctx.perf.reduced ? 18 : 40;
  const geo = new THREE.ConeGeometry(0.2, 0.95, 4); geo.rotateX(Math.PI / 2);
  const cols = [0xff2f5a, 0x2fe08a, 0x6ab0ff, 0xffc93a, 0xd06bff, 0xff6ab0];
  const birds = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), COUNT);
  // wings: a second instanced set of thin planes flapping with the body
  const wings = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 0.4), new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.85, side: THREE.DoubleSide }), COUNT);
  const trails = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 0.1), new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }), COUNT);
  const c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) { const col = cols[i % cols.length]; birds.setColorAt(i, c.setHex(col)); wings.setColorAt(i, c.setHex(col)); trails.setColorAt(i, c.setHex(col)); }
  // flocks: birds share a flock centre so they move in groups, as in the concept
  const FLOCKS = 5;
  const flocks = Array.from({ length: FLOCKS }, () => ({ r: rr(30, 90), a: rr(0, Math.PI * 2), y: rr(22, 52), sp: rr(0.14, 0.3) }));
  const seeds = Array.from({ length: COUNT }, (_, i) => ({ f: i % FLOCKS, ox: rr(-9, 9), oy: rr(-5, 5), oz: rr(-9, 9), ph: rr(0, 9) }));
  const d = new THREE.Object3D();
  ctx.onUpdate((_dt, e) => {
    for (let i = 0; i < COUNT; i++) {
      const s = seeds[i], f = flocks[s.f];
      const a = f.a + e * f.sp;
      const x = Math.cos(a) * f.r + s.ox, z = Math.sin(a) * f.r - 30 + s.oz;
      const y = f.y + s.oy + Math.sin(e * 1.6 + s.ph) * 2.4;
      const head = -a + Math.PI / 2;
      d.position.set(x, y, z); d.rotation.set(Math.sin(e + s.ph) * 0.2, head, 0); d.updateMatrix(); birds.setMatrixAt(i, d.matrix);
      d.rotation.set(Math.PI / 2 + Math.sin(e * 9 + s.ph) * 0.7, head, 0); d.updateMatrix(); wings.setMatrixAt(i, d.matrix);
      // trail sits just behind the bird along its heading
      d.position.set(x - Math.cos(a + Math.PI / 2) * 1.5, y, z - Math.sin(a + Math.PI / 2) * 1.5);
      d.rotation.set(Math.PI / 2, head, 0); d.updateMatrix(); trails.setMatrixAt(i, d.matrix);
    }
    birds.instanceMatrix.needsUpdate = true; wings.instanceMatrix.needsUpdate = true; trails.instanceMatrix.needsUpdate = true;
  });
  for (const m of [trails, wings, birds]) { m.frustumCulled = false; ctx.scene.add(m); }
}

// ── Seagulls perched on the quay + a couple wheeling overhead ─────────
function buildSeagulls(ctx: WorldContext) {
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f8fb, roughness: 0.8 });
  const grey = new THREE.MeshStandardMaterial({ color: 0xa8b2bd, roughness: 0.9 });
  const beak = new THREE.MeshBasicMaterial({ color: 0xf0a03a, toneMapped: false });
  for (const [x, z] of [[-22, Q_Z0 + 1.2], [-6.5, Q_Z0 + 1.1], [13, Q_Z0 + 1.3], [21, Q_Z0 + 1.1]] as const) {
    const g = new THREE.Group(); g.position.set(x, 0.3, z); g.rotation.y = rr(-1, 1); ctx.scene.add(g);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), white); b.scale.set(1, 1, 1.4); b.position.y = 0.2; g.add(b);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), white); h.position.set(0, 0.38, -0.2); g.add(h);
    const bk = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 6), beak); bk.rotation.x = -Math.PI / 2; bk.position.set(0, 0.37, -0.34); g.add(bk);
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.3), grey); w.position.set(0, 0.26, 0.05); g.add(w);
    const ph = x;
    ctx.onUpdate((_d, e) => { h.position.y = 0.38 + Math.sin(e * 1.6 + ph) * 0.02; g.rotation.y += Math.sin(e * 0.4 + ph) * 0.002; });
  }
}

// ── Market District: stalls, awnings, bunting, produce ───────────────
function buildMarket(ctx: WorldContext) {
  const awn = [0xd8453a, 0x3a86d8, 0x3aa85a, 0xd8a83a, 0xb060c0];
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 1 });
  const stallX = [-21.5, -16.5, 15.5, 20.5];
  stallX.forEach((x, i) => {
    const z = Q_Z1 - 3.4;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI; ctx.scene.add(g);   // face the water
    const table = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 1.2), wood); table.position.y = 0.5; g.add(table);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.06, 1.3), new THREE.MeshStandardMaterial({ color: awn[i % awn.length], roughness: 0.95 })); cloth.position.y = 1.04; g.add(cloth);
    // produce / fish crates on the table
    for (let k = 0; k < 4; k++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: [0xd84a4a, 0xe0a83a, 0x5aa84a, 0xc06bd8][k], roughness: 0.8 }));
      p.position.set(-1.1 + k * 0.75, 1.2, 0); g.add(p);
    }
    // awning + posts
    const awning = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.1, 2.0), new THREE.MeshStandardMaterial({ color: awn[i % awn.length], roughness: 0.9 }));
    awning.position.set(0, 2.5, 0.2); awning.rotation.x = 0.22; g.add(awning);
    // scalloped valance
    const val = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.34, 0.06), new THREE.MeshStandardMaterial({ color: 0xf4ead2, roughness: 0.95 })); val.position.set(0, 2.3, 1.15); g.add(val);
    for (const px of [-1.7, 1.7]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.5, 8), dark); pole.position.set(px, 1.25, 1.0); g.add(pole); }
    const lant = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), lit(0xffd88a)); lant.position.set(0, 2.2, 1.0); g.add(lant);
    ctx.addCollider({ x, z, r: 1.5 });
  });
  // bunting strung between the lampposts across the promenade
  const flagGeo = new THREE.PlaneGeometry(0.5, 0.62);
  for (const [x1, x2] of [[-19, -10], [-10, 10], [10, 19]] as const) {
    const z = Q_Z1 - 3, n = 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n, sag = Math.sin(t * Math.PI) * 1.1;
      const f = new THREE.Mesh(flagGeo, lit(awn[i % awn.length]));
      f.position.set(x1 + (x2 - x1) * t, 4.3 - sag, z); f.rotation.x = 0.3; ctx.scene.add(f);
      const ph = i + x1;
      ctx.onUpdate((_d, e) => { f.rotation.y = Math.sin(e * 2 + ph) * 0.35; });
    }
  }
}

// ── Love Wall: ivy-clad stone with the glowing inscription + lantern ─
function buildLoveWall(ctx: WorldContext) {
  const WX = Q_HW - 2.5, WZ = 17;
  const g = new THREE.Group(); g.position.set(WX, 0, WZ); g.rotation.y = -Math.PI / 2; ctx.scene.add(g);
  const stone = new THREE.MeshStandardMaterial({ color: 0x8f8471, roughness: 1 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 0.7), stone); wall.position.y = 2.5; wall.castShadow = true; g.add(wall);
  // stone course lines
  for (let i = 1; i < 6; i++) { const line = new THREE.Mesh(new THREE.BoxGeometry(9.05, 0.06, 0.74), new THREE.MeshStandardMaterial({ color: 0x726858, roughness: 1 })); line.position.y = i * 0.8; g.add(line); }
  // ivy along the top and trailing down
  const ivyMat = new THREE.MeshStandardMaterial({ color: 0x2f6a34, roughness: 1 });
  const cap = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.7, 0.9), ivyMat); cap.position.y = 5.1; g.add(cap);
  for (let i = 0; i < 22; i++) { const leaf = new THREE.Mesh(new THREE.SphereGeometry(rr(0.18, 0.36), 8, 6), ivyMat); leaf.position.set(rr(-4.4, 4.4), rr(2.6, 5.0), 0.42); leaf.scale.y = 0.7; g.add(leaf); }
  // flowering vines
  for (let i = 0; i < 14; i++) { const fl = new THREE.Mesh(new THREE.SphereGeometry(rr(0.08, 0.15), 8, 6), lit([0xff7ab0, 0xd86ad8, 0xff9ad0][(rnd() * 3) | 0])); fl.position.set(rr(-4.3, 4.3), rr(2.4, 4.9), 0.5); g.add(fl); }

  // the glowing inscription
  const c = document.createElement('canvas'); c.width = 768; c.height = 384; const cg = c.getContext('2d')!;
  cg.clearRect(0, 0, 768, 384);
  cg.textAlign = 'center'; cg.textBaseline = 'middle';
  cg.fillStyle = '#ff7ab8'; cg.shadowColor = '#ff2d80'; cg.shadowBlur = 34;
  cg.font = 'bold 84px "Noto Sans Georgian","Segoe UI",sans-serif';
  cg.fillText('მაქსი', 384, 82);
  cg.font = 'bold 66px "Noto Sans Georgian",sans-serif';
  cg.fillText('+', 384, 158);
  cg.font = 'bold 84px "Noto Sans Georgian","Segoe UI",sans-serif';
  cg.fillText('სალიუსი =', 384, 236);
  cg.font = 'bold 104px sans-serif';
  cg.fillText('♥', 384, 322);
  const tex = new THREE.CanvasTexture(c);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  sign.position.set(0, 2.7, 0.38); g.add(sign);
  const glow = new THREE.PointLight(0xff5aa0, 0.9, 12, 2); glow.position.set(0, 2.7, 1.4); g.add(glow);
  ctx.onUpdate((_d, e) => { glow.intensity = 0.8 + Math.sin(e * 2.4) * 0.18; });

  // wrought-iron lantern beside the inscription
  const iron = new THREE.MeshStandardMaterial({ color: 0x2b2e36, roughness: 0.6, metalness: 0.5 });
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.0), iron); bracket.position.set(3.9, 4.1, 0.6); g.add(bracket);
  const lampBox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), lit(0xffd88a)); lampBox.position.set(3.9, 3.7, 1.0); g.add(lampBox);
  const lampCap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.35, 4), iron); lampCap.position.set(3.9, 4.2, 1.0); g.add(lampCap);

  ctx.addCollider({ x: WX, z: WZ, r: 1.2 });
  for (const dz of [-3.2, 3.2]) ctx.addCollider({ x: WX, z: WZ + dz, r: 1.2 });
  // a bench facing the wall + a hug spot in front of it
  ctx.addSeat({ id: 'lovebench', x: WX - 3.4, y: 0.1, z: WZ, yaw: Math.atan2((WX - 3.4) - WX, 0) });
  addHugSpot(ctx, WX - 5.4, WZ, Math.PI / 2, 0xff5aa0, 'love1');
}

// ── Quay dressing: barrels, crates, flower pots, benches ─────────────
function buildQuayProps(ctx: WorldContext) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 1 });
  const hoop = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.6, metalness: 0.4 });
  const terra = new THREE.MeshStandardMaterial({ color: 0xb56a48, roughness: 1 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3a7a42, roughness: 1 });

  // barrels + crates in clusters
  for (const [bx, bz] of [[-24, 12.5], [-24, 14.5], [-22.6, 13.4], [23.5, 12.4], [24.6, 13.8], [-13, 23], [12.5, 23.4]] as const) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.44, 1.1, 12), wood); bar.position.set(bx, 0.55, bz); bar.castShadow = true; ctx.scene.add(bar);
    for (const hy of [0.3, 0.85]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 6, 14), hoop); h.rotation.x = Math.PI / 2; h.position.set(bx, hy, bz); ctx.scene.add(h); }
    ctx.addCollider({ x: bx, z: bz, r: 0.6 });
  }
  for (const [cx2, cz2, s] of [[-19, 12.6, 0.9], [18.5, 23.2, 1.0], [-8, 23.4, 0.85]] as const) {
    const cr = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), wood); cr.position.set(cx2, s / 2, cz2); cr.rotation.y = rr(0, 1.2); cr.castShadow = true; ctx.scene.add(cr);
    ctx.addCollider({ x: cx2, z: cz2, r: s * 0.7 });
  }
  // flowering pots along the promenade — the concept is full of blossom
  for (let i = 0; i < 14; i++) {
    const x = -Q_HW + 3 + i * (Q_HW * 2 - 6) / 13;
    const z = Q_Z1 - 1.2;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.34, 0.66, 12), terra); pot.position.set(x, 0.33, z); ctx.scene.add(pot);
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 8), leaf); bush.position.set(x, 0.85, z); bush.scale.y = 0.8; ctx.scene.add(bush);
    for (let k = 0; k < 7; k++) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lit([0xff7ab0, 0xd86ad8, 0xffd45a, 0xff9a6a][(rnd() * 4) | 0]));
      fl.position.set(x + rr(-0.4, 0.4), 0.85 + rr(-0.2, 0.32), z + rr(-0.4, 0.4)); ctx.scene.add(fl);
    }
    ctx.addCollider({ x, z, r: 0.5 });
  }
  // benches looking out over the harbour
  for (const bx of [-15, -3, 7, 17]) {
    const z = Q_Z0 + 3.2;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.16, 0.6), wood); seat.position.set(bx, 0.46, z); seat.castShadow = true; ctx.scene.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.12), wood); back.position.set(bx, 0.78, z + 0.26); ctx.scene.add(back);
    for (const lx of [-0.85, 0.85]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.46, 0.5), hoop); leg.position.set(bx + lx, 0.2, z); ctx.scene.add(leg); }
    ctx.addCollider({ x: bx, z, r: 0.6 });
    // face the water (-z)
    ctx.addSeat({ id: `bench${bx}`, x: bx, y: 0.46, z, yaw: Math.atan2(0, 30) });
  }
  // a second hug spot on the west promenade
  addHugSpot(ctx, -Q_HW + 6, 20, 0, 0xff7ab0, 'love2');
}

// ── Water: dry zones, swim zones, moored rides ────────────────────────
function buildWater(ctx: WorldContext) {
  // DRY (never swimmable) — must overlap each other, and stay tight to the
  // actual walkable surfaces so a swimmer alongside isn't treated as standing.
  ctx.addDryZone({ x: 0, z: (Q_Z0 + Q_Z1) / 2, hw: Q_HW + 0.5, hd: (Q_Z1 - Q_Z0) / 2 + 1.2 });        // promenade
  ctx.addDryZone({ x: 0, z: (Q_Z0 + PIER_Z) / 2, hw: PIER_HW + 0.5, hd: (Q_Z0 - PIER_Z) / 2 + 0.8 }); // main pier
  ctx.addDryZone({ x: (DOCK_X0 + DOCK_X1) / 2, z: (DOCK_Z0 + Q_Z0) / 2, hw: (DOCK_X1 - DOCK_X0) / 2 + 0.6, hd: (Q_Z0 - DOCK_Z0) / 2 + 0.8 });

  // Open water across the whole basin and out to sea.
  for (let x = -56; x <= 56; x += 11) for (let z = 8; z >= -56; z -= 11) { if (Math.hypot(x, z) > WATER_R + 6) continue; ctx.addSwimZone({ x, z, r: 9, waterY: -1.65 }); }

  // moored rides at the pier head (within boarding reach of the rails)
  ctx.addVehicle({ id: 'boat1', kind: 'boat', x: 4.4, z: PIER_Z + 2.4, yaw: 0, waterY: -1.1 });
  ctx.addVehicle({ id: 'jetski1', kind: 'jetski', x: -4.2, z: PIER_Z + 2.0, yaw: 0, waterY: -1.1 });

  // ── seal the bay: swimmers used to be able to strike out past the shoreline
  // and end up standing inside distant hills. Ring the water, and close the
  // flanks so nobody gets around the quay onto the backing land.
  // Ring the water just inside the shoreline. Radius 59 clears both islands
  // (their outer edges reach ~57) while still stopping swimmers well short of
  // the terraced land at 62 — otherwise you could stand on scenery.
  for (let i = 0; i < 100; i++) {
    const a = (i / 100) * Math.PI * 2;
    const x = Math.cos(a) * 59, z = Math.sin(a) * 59;
    if (z > Q_Z0 - 2) continue;                 // the quay already closes the south
    ctx.addCollider({ x, z, r: 2.2 });
  }
  for (let z = Q_Z0 - 1; z <= Q_Z1 + 6; z += 1.6) { ctx.addCollider({ x: -Q_HW - 1.6, z, r: 1.1 }); ctx.addCollider({ x: Q_HW + 1.6, z, r: 1.1 }); }
}

// ── Keep players on the promenade, pier and dock ─────────────────────
function buildBoundary(ctx: WorldContext) {
  const step = 1.6;
  // waterline (z = Q_Z0) with gaps for the pier and the fisherman dock
  for (let x = -Q_HW; x <= Q_HW; x += step) {
    if (Math.abs(x) < PIER_HW + 0.3) continue;
    if (x > DOCK_X0 - 0.4 && x < DOCK_X1 + 0.4) continue;
    ctx.addCollider({ x, z: Q_Z0 - 0.5, r: 0.9 });
  }
  // back edge + sides of the promenade
  for (let x = -Q_HW; x <= Q_HW; x += step) ctx.addCollider({ x, z: Q_Z1 + 0.5, r: 0.9 });
  for (let z = Q_Z0; z <= Q_Z1; z += step) { ctx.addCollider({ x: -Q_HW - 0.5, z, r: 0.9 }); ctx.addCollider({ x: Q_HW + 0.5, z, r: 0.9 }); }
  // pier side rails (the head stays open so you can dive in / board)
  for (let z = PIER_Z + 1; z <= Q_Z0; z += step) { ctx.addCollider({ x: -PIER_HW - 0.35, z, r: 0.55 }); ctx.addCollider({ x: PIER_HW + 0.35, z, r: 0.55 }); }
  // fisherman dock edges
  for (let x = DOCK_X0; x <= DOCK_X1; x += step) ctx.addCollider({ x, z: DOCK_Z0 - 0.5, r: 0.8 });
  for (let z = DOCK_Z0; z <= Q_Z0; z += step) { ctx.addCollider({ x: DOCK_X0 - 0.5, z, r: 0.8 }); ctx.addCollider({ x: DOCK_X1 + 0.5, z, r: 0.8 }); }
}
