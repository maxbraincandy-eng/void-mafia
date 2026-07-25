// ── Premium World: Skyline Terrace ────────────────────────────────────
// A luxury rooftop terrace at dusk, floating high above a living neon city —
// the flagship world. A glass-railed deck with an infinity pool, a lit bar, a
// modern fire pit, sectional lounges, cuddle loveseats, hanging string lights,
// planters and an outdoor screen, ringed by a skyline of thousands of glowing
// windows.
//
// AAA look on a phone budget:
//  • The whole city is ONE InstancedMesh (~110 towers) whose windows glow via a
//    single shared emissive canvas texture — the "city lights" cost ~1 draw call.
//  • String-light bulbs, planters and pool tiles are instanced too.
//  • Only four real lights; everything else glows via unlit/emissive materials.
//  • Fog fades the far skyline; water shimmer / fire flicker throttle off on
//    ctx.perf.reduced.
import * as THREE from 'three';
import type { WorldDef, WorldContext } from './types';
import { addHugSpot } from './props';
import { tNow } from '@/store/langStore';

const DECK_R = 18;   // rooftop radius (glass railing sits here)

let _s = 555321;
function rnd() { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967295; }
function rr(a: number, b: number) { return a + (b - a) * rnd(); }

const _neon = new Map<number, THREE.MeshBasicMaterial>();
function neon(c: number) { let m = _neon.get(c); if (!m) { m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false }); _neon.set(c, m); } return m; }

// One shared window texture: dark facade speckled with warm/cool lit windows.
let _winTex: THREE.Texture | null = null;
function windowTexture(): THREE.Texture {
  if (_winTex) return _winTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#05060c'; g.fillRect(0, 0, 64, 128);
  const cols = ['#ffd98a', '#fff2c8', '#9fd4ff', '#ffb37a', '#cbb3ff'];
  for (let y = 3; y < 128; y += 7) for (let x = 3; x < 64; x += 8) {
    if (rnd() < 0.55) { g.fillStyle = cols[(rnd() * cols.length) | 0]; g.globalAlpha = 0.45 + rnd() * 0.55; g.fillRect(x, y, 5, 4); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 7);
  _winTex = t; return t;
}

export const skylineTerrace: WorldDef = {
  id: 'skyline_terrace',
  name: 'Skyline Terrace',
  subtitle: 'ცის ხაზი · აუზი · ხმა',
  icon: '🏙️',
  status: 'live',
  spawn: { x: 0, z: 11, yaw: Math.PI },
  fog: { color: 0x241a3a, density: 0.009 },
  clear: 0x120c26,

  build(ctx: WorldContext) {
    _s = 555321; _neon.clear();
    ctx.ambientLight.color.setHex(0x5a5a86); ctx.ambientLight.intensity = 0.95;
    ctx.moon.color.setHex(0xbfd0ff); ctx.moon.intensity = 0.9; ctx.moon.position.set(40, 46, -30);

    buildSky(ctx);
    buildCity(ctx);
    buildTower(ctx);
    buildDeck(ctx);
    buildRailing(ctx);
    buildPool(ctx);
    buildLounge(ctx);
    buildLoveseats(ctx);
    buildBar(ctx);
    buildFirepit(ctx);
    buildGreenery(ctx);
    buildStringLights(ctx);
    buildDj(ctx);
    buildScreen(ctx);
    buildBoundary(ctx);

    ctx.addAmbient({ kind: 'night', x: 0, z: 0, radius: 130 });
    ctx.addAmbient({ kind: 'wind', x: 0, z: 0, radius: 130 });
    ctx.addAmbient({ kind: 'fire', x: -9, z: -6, radius: 8 });
  },
};

// ── Dusk sky: gradient dome + stars + moon + a warm horizon glow ──────
function buildSky(ctx: WorldContext) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x0a0a2a) }, mid: { value: new THREE.Color(0x3a2a6a) }, bot: { value: new THREE.Color(0xd8804a) } },
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; void main(){ float h=clamp((normalize(vP).y+0.12)/0.85,0.0,1.0); vec3 c = h<0.5 ? mix(bot,mid,h*2.0) : mix(mid,top,(h-0.5)*2.0); gl_FragColor=vec4(c,1.0);}',
  });
  ctx.scene.add(new THREE.Mesh(new THREE.SphereGeometry(320, 24, 14), mat));
  // stars (upper hemisphere only)
  const N = 500; const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const u = rnd() * Math.PI * 2, v = rnd() * 0.45 + 0.1, r = 300; arr[i * 3] = Math.cos(u) * Math.cos(v) * r; arr[i * 3 + 1] = Math.sin(v) * r; arr[i * 3 + 2] = Math.sin(u) * Math.cos(v) * r; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false }));
  ctx.scene.add(stars); ctx.onUpdate((_d, e) => { if (!ctx.perf.reduced) (stars.material as THREE.PointsMaterial).opacity = 0.6 + Math.sin(e * 0.6) * 0.2; });
  const moon = new THREE.Mesh(new THREE.CircleGeometry(11, 28), new THREE.MeshBasicMaterial({ color: 0xf3ecff, fog: false })); moon.position.set(120, 110, -230); moon.lookAt(0, 0, 0); ctx.scene.add(moon);
}

// ── The city: one InstancedMesh of glowing towers all around & below ──
function buildCity(ctx: WorldContext) {
  const COUNT = ctx.perf.reduced ? 60 : 120;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x0c0e1a, roughness: 1, metalness: 0, emissive: 0xffffff, emissiveMap: windowTexture(), emissiveIntensity: 1.0 });
  const inst = new THREE.InstancedMesh(geo, mat, COUNT);
  const d = new THREE.Object3D(); const c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    const a = rnd() * Math.PI * 2, rad = rr(34, 150);
    const w = rr(5, 12), h = rr(18, 78), dep = rr(5, 12);
    // towers rise from far below (the city floor) so most tops sit below the
    // terrace — you look DOWN onto them — with a few piercing the skyline.
    const top = rr(-34, 16);
    d.position.set(Math.cos(a) * rad, top - h / 2, Math.sin(a) * rad);
    d.scale.set(w, h, dep); d.rotation.set(0, rnd() * Math.PI, 0); d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
    const g = rr(0.7, 1.1); c.setRGB(0.05 * g, 0.06 * g, 0.1 * g); inst.setColorAt(i, c);
  }
  inst.instanceMatrix.needsUpdate = true; inst.frustumCulled = false; ctx.scene.add(inst);
  // faint city ground far below to close the void
  const base = new THREE.Mesh(new THREE.CircleGeometry(220, 32), new THREE.MeshStandardMaterial({ color: 0x090a16, roughness: 1 })); base.rotation.x = -Math.PI / 2; base.position.y = -60; ctx.scene.add(base);
}

// ── The skyscraper our terrace crowns (grounds the drop below the rails)
function buildTower(ctx: WorldContext) {
  const facade = new THREE.MeshStandardMaterial({ color: 0x14162a, roughness: 0.9, metalness: 0.1, emissive: 0xffffff, emissiveMap: windowTexture(), emissiveIntensity: 0.7 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(DECK_R + 1.5, DECK_R + 3, 60, 24), facade);
  body.position.y = -30.2; ctx.scene.add(body);
}

// ── Rooftop deck (premium tiled platform) ─────────────────────────────
function buildDeck(ctx: WorldContext) {
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(DECK_R, DECK_R, 0.5, 40), new THREE.MeshStandardMaterial({ color: 0x24222e, roughness: 0.5, metalness: 0.3 }));
  deck.position.y = -0.2; deck.receiveShadow = true; ctx.scene.add(deck);
  // inlaid tile rings (thin emissive-free lines for a designed look)
  for (const r of [6, 11, 16]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 6, 60), new THREE.MeshStandardMaterial({ color: 0x3a3648, roughness: 0.6, metalness: 0.4 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; ctx.scene.add(ring); }
  // a soft warm glow strip around the deck edge
  const edge = new THREE.Mesh(new THREE.TorusGeometry(DECK_R - 0.3, 0.06, 6, 80), neon(0xffb877)); edge.rotation.x = Math.PI / 2; edge.position.y = 0.12; ctx.scene.add(edge);
}

// ── Glass balustrade around the roof (see-through, with rails) ────────
function buildRailing(ctx: WorldContext) {
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.14, metalness: 0.3, roughness: 0.05, side: THREE.DoubleSide });
  const rail = new THREE.MeshStandardMaterial({ color: 0x2a2e3a, metalness: 0.7, roughness: 0.3 });
  const N = 30;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, a2 = ((i + 1) / N) * Math.PI * 2;
    const mx = Math.cos((a + a2) / 2) * DECK_R, mz = Math.sin((a + a2) / 2) * DECK_R;
    const len = 2 * DECK_R * Math.sin(Math.PI / N);
    const yaw = Math.atan2(mz, mx) + Math.PI / 2;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(len * 0.96, 1.1, 0.05), glass); panel.position.set(mx, 0.75, mz); panel.rotation.y = yaw; ctx.scene.add(panel);
    const top = new THREE.Mesh(new THREE.BoxGeometry(len, 0.09, 0.12), rail); top.position.set(mx, 1.35, mz); top.rotation.y = yaw; ctx.scene.add(top);
  }
}

// ── Infinity pool at the far edge, glowing turquoise ──────────────────
function buildPool(ctx: WorldContext) {
  const PX = 0, PZ = -12;
  const basin = new THREE.Mesh(new THREE.BoxGeometry(11, 0.4, 5), new THREE.MeshStandardMaterial({ color: 0x1a1c28, roughness: 0.4, metalness: 0.4 })); basin.position.set(PX, 0.05, PZ); ctx.scene.add(basin);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 4.4), new THREE.MeshStandardMaterial({ color: 0x2fd0d8, transparent: true, opacity: 0.82, roughness: 0.1, metalness: 0.6, emissive: 0x0e6a70, emissiveIntensity: 0.5 }));
  water.rotation.x = -Math.PI / 2; water.position.set(PX, 0.28, PZ); ctx.scene.add(water);
  const glow = new THREE.PointLight(0x3fe0e0, 1.3, 16, 2); glow.position.set(PX, 1.2, PZ); ctx.scene.add(glow);
  ctx.onUpdate((_d, e) => { if (ctx.perf.reduced) return; (water.material as THREE.MeshStandardMaterial).opacity = 0.78 + Math.sin(e * 0.9) * 0.06; glow.intensity = 1.2 + Math.sin(e * 1.3) * 0.2; });
  ctx.addCollider({ x: PX, z: PZ, r: 3.2 });
  // a couple of sun loungers beside the pool (seats)
  const lMat = new THREE.MeshStandardMaterial({ color: 0xece7dc, roughness: 0.9 });
  for (const lx of [-4.6, 4.6]) {
    const g = new THREE.Group(); g.position.set(lx, 0, PZ + 3.6); g.rotation.y = lx < 0 ? 0.3 : -0.3; ctx.scene.add(g);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 2.0), lMat); bed.position.y = 0.4; bed.castShadow = true; g.add(bed);
    const rest = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.16), lMat); rest.position.set(0, 0.62, -0.9); rest.rotation.x = 0.5; g.add(rest);
    ctx.addSeat({ id: `lounger${lx}`, x: lx, y: 0.6, z: PZ + 3.6, yaw: Math.atan2(lx, PZ + 3.6 - PZ), prop: 'drink' });
    ctx.addCollider({ x: lx, z: PZ + 3.6, r: 0.6 });
  }
}

// ── Sectional lounge around a coffee table ────────────────────────────
function buildLounge(ctx: WorldContext) {
  const LX = 8, LZ = 4;
  const sofaMat = new THREE.MeshStandardMaterial({ color: 0x2c2f3c, roughness: 0.85 });
  const g = new THREE.Group(); g.position.set(LX, 0, LZ); g.rotation.y = -2.2; ctx.scene.add(g);
  // L-shaped sectional (two runs)
  for (const [sx, sz, rot, len] of [[0, -1.4, 0, 4.0], [-1.9, 0, Math.PI / 2, 3.0]] as const) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(len, 0.45, 1.0), sofaMat); base.position.set(sx, 0.28, sz); base.rotation.y = rot; base.castShadow = true; g.add(base);
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, 0.6, 0.2), sofaMat); back.position.set(sx + Math.sin(rot) * -0.4, 0.68, sz + Math.cos(rot) * -0.4); back.rotation.y = rot; g.add(back);
  }
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.9), new THREE.MeshStandardMaterial({ color: 0x14151d, roughness: 0.3, metalness: 0.5 })); table.position.set(-0.4, 0.2, -0.2); g.add(table);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.6, 28), new THREE.MeshStandardMaterial({ color: 0x2a2436, roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(-0.4, 0.02, -0.4); g.add(rug);
  ctx.addCollider({ x: LX, z: LZ, r: 1.6 });
  // three sit spots along the long run, facing the table
  const cs = Math.cos(-2.2), sn = Math.sin(-2.2);
  for (const lx of [-1.5, 0, 1.5]) {
    const wx = LX + (lx * cs - (-1.0) * sn), wz = LZ + (lx * sn + (-1.0) * cs);
    ctx.addSeat({ id: `lounge${lx}`, x: wx, y: 0.55, z: wz, yaw: Math.atan2(wx - LX, wz - LZ), prop: 'drink' });
  }
}

// ── Couples hug spots (face-to-face embrace) ──────────────────────────
function buildLoveseats(ctx: WorldContext) {
  addHugSpot(ctx, -11, 6, 2.4, 0xff2bd6, 'love1');
  addHugSpot(ctx, 12, -4, -1.0, 0x35e0e0, 'love2');
  addHugSpot(ctx, -3, 13, Math.PI, 0x9b5cff, 'love3');
}

// ── Sleek lit bar with stools ─────────────────────────────────────────
function buildBar(ctx: WorldContext) {
  const BX = -12, BZ = -3;
  const g = new THREE.Group(); g.position.set(BX, 0, BZ); g.rotation.y = 0.7; ctx.scene.add(g);
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.1, 1.0), new THREE.MeshStandardMaterial({ color: 0x1a1c28, roughness: 0.4, metalness: 0.5 })); body.position.y = 0.55; body.castShadow = true; g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.1, 1.25), new THREE.MeshStandardMaterial({ color: 0x0e0f18, roughness: 0.2, metalness: 0.7 })); top.position.y = 1.16; g.add(top);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.14, 0.05), neon(0x35e0e0)); strip.position.set(0, 0.5, 0.52); g.add(strip);
  const back = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.6, 0.15), new THREE.MeshStandardMaterial({ color: 0x14151f, roughness: 0.6 })); back.position.set(0, 1.5, -0.7); g.add(back);
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.5), neon(0x2a3050)); bg.position.set(0, 1.5, -0.62); g.add(bg);
  const bottleGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.34, 6);
  for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(bottleGeo, neon([0x6aff9e, 0xff6a8a, 0x6ab0ff, 0xffcf6a, 0xc06bff][i % 5])); b.position.set(-1.7 + i * 0.5, 1.5, -0.55); g.add(b); }
  const l = new THREE.PointLight(0x35e0e0, 1.2, 12, 2); l.position.set(0, 2.0, 0); g.add(l);
  ctx.onUpdate((_d, e) => { if (!ctx.perf.reduced) l.intensity = 1.1 + Math.sin(e * 5) * 0.2; });
  ctx.addCollider({ x: BX, z: BZ, r: 1.6 });
  for (let i = 0; i < 3; i++) {
    const lx = -1.3 + i * 1.3, lz = 1.15;
    const wx = BX + lx * Math.cos(0.7) - lz * Math.sin(0.7), wz = BZ + lx * Math.sin(0.7) + lz * Math.cos(0.7);
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.7, 12), new THREE.MeshStandardMaterial({ color: 0x22242f, roughness: 0.5, metalness: 0.4 })); stool.position.set(wx, 0.35, wz); stool.castShadow = true; ctx.scene.add(stool);
    ctx.addCollider({ x: wx, z: wz, r: 0.34 });
    ctx.addSeat({ id: `bar${i}`, x: wx, y: 0.7, z: wz, yaw: Math.atan2(wx - BX, wz - BZ), prop: 'drink' });
  }
}

// ── Modern rectangular fire pit ───────────────────────────────────────
function buildFirepit(ctx: WorldContext) {
  const FX = -9, FZ = -6;
  const g = new THREE.Group(); g.position.set(FX, 0, FZ); ctx.scene.add(g);
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.2), new THREE.MeshStandardMaterial({ color: 0x1a1c26, roughness: 0.4, metalness: 0.4 })); table.position.y = 0.25; g.add(table);
  // glass wind guard
  const guard = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xaad4ff, transparent: true, opacity: 0.16, roughness: 0 })); guard.position.y = 0.72; g.add(guard);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 8), neon(0xffa63c)); flame.position.y = 0.75; g.add(flame);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 8), neon(0xffe27a)); core.position.y = 0.68; g.add(core);
  const fl = new THREE.PointLight(0xff8a3a, 2.0, 12, 2); fl.position.set(0, 1.0, 0); g.add(fl);
  ctx.onUpdate((_d, e) => { if (ctx.perf.reduced) return; const f = 0.85 + Math.sin(e * 12) * 0.12; flame.scale.set(1, f, 1); core.scale.set(1, f, 1); fl.intensity = 1.9 + Math.sin(e * 15) * 0.4; });
  ctx.addCollider({ x: FX, z: FZ, r: 1.3 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.5, sx = FX + Math.cos(a) * 2.6, sz = FZ + Math.sin(a) * 2.6;
    const pouf = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.45, 14), new THREE.MeshStandardMaterial({ color: [0x8a4a5a, 0x4a5a8a, 0x5a8a6a, 0x8a7a4a][i], roughness: 0.9 })); pouf.position.set(sx, 0.22, sz); pouf.castShadow = true; ctx.scene.add(pouf);
    ctx.addCollider({ x: sx, z: sz, r: 0.42 });
    ctx.addSeat({ id: `fire${i}`, x: sx, y: 0.5, z: sz, yaw: Math.atan2(sx - FX, sz - FZ) });
  }
}

// ── Greenery: instanced planters + potted palms ───────────────────────
function buildGreenery(ctx: WorldContext) {
  const spots: Array<[number, number]> = [];
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + 0.2; spots.push([Math.cos(a) * (DECK_R - 1.6), Math.sin(a) * (DECK_R - 1.6)]); }
  const potGeo = new THREE.CylinderGeometry(0.4, 0.32, 0.7, 8);
  const potMat = new THREE.MeshStandardMaterial({ color: 0x2a2c38, roughness: 0.7 });
  const hedgeGeo = new THREE.IcosahedronGeometry(0.55, 0);
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x2f5a34, roughness: 1 });
  const pots = new THREE.InstancedMesh(potGeo, potMat, spots.length);
  const hedges = new THREE.InstancedMesh(hedgeGeo, hedgeMat, spots.length);
  const d = new THREE.Object3D(); const c = new THREE.Color();
  spots.forEach(([x, z], i) => {
    d.position.set(x, 0.35, z); d.rotation.set(0, 0, 0); d.scale.setScalar(1); d.updateMatrix(); pots.setMatrixAt(i, d.matrix);
    d.position.set(x, 0.95, z); d.scale.set(1, 0.85, 1); d.updateMatrix(); hedges.setMatrixAt(i, d.matrix);
    const g = rr(0.85, 1.1); c.setRGB(0.16 * g, 0.36 * g, 0.2 * g); hedges.setColorAt(i, c);
    ctx.addCollider({ x, z, r: 0.5 });
  });
  pots.instanceMatrix.needsUpdate = true; hedges.instanceMatrix.needsUpdate = true; ctx.scene.add(pots); ctx.scene.add(hedges);
}

// ── Hanging string lights (instanced warm bulbs on catenary curves) ───
function buildStringLights(ctx: WorldContext) {
  const bulbs: Array<[number, number, number]> = [];
  const posts = 8;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2, a2 = ((i + 1) / posts) * Math.PI * 2, r = DECK_R - 2;
    const x1 = Math.cos(a) * r, z1 = Math.sin(a) * r, x2 = Math.cos(a2) * r, z2 = Math.sin(a2) * r;
    for (let t = 0; t <= 1.0001; t += 1 / 6) { const sag = Math.sin(t * Math.PI) * 0.9; bulbs.push([x1 + (x2 - x1) * t, 3.4 - sag, z1 + (z2 - z1) * t]); }
    // pole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 6), new THREE.MeshStandardMaterial({ color: 0x22242f, metalness: 0.5, roughness: 0.5 })); pole.position.set(x1, 2.1, z1); ctx.scene.add(pole);
  }
  const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 6), neon(0xffd98a), bulbs.length);
  const d = new THREE.Object3D();
  bulbs.forEach(([x, y, z], i) => { d.position.set(x, y, z); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); });
  inst.instanceMatrix.needsUpdate = true; ctx.scene.add(inst);
  const l = new THREE.PointLight(0xffd98a, 0.7, 40, 2); l.position.set(0, 4, 0); ctx.scene.add(l);
  void l;
}

// ── DJ booth (opens the shared music panel via id 'dj') ───────────────
function buildDj(ctx: WorldContext) {
  const DX = 11, DZ = 9;
  const g = new THREE.Group(); g.position.set(DX, 0, DZ); g.rotation.y = -2.3; ctx.scene.add(g);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 0.9), new THREE.MeshStandardMaterial({ color: 0x14151f, roughness: 0.4, metalness: 0.5 })); desk.position.y = 0.5; desk.castShadow = true; g.add(desk);
  const face = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.02), neon(0xc06bff)); face.position.set(0, 0.5, 0.46); g.add(face);
  for (const dx of [-0.55, 0.55]) { const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 18), neon(0x35e0e0)); deck.position.set(dx, 1.05, 0); g.add(deck); }
  ctx.addCollider({ x: DX, z: DZ, r: 1.2 });
  ctx.addInteractable({ id: 'dj', x: DX, z: DZ + 1.2, r: 1.8, label: tNow().worlds.djMusic, effect: () => { /* opens music panel via onInteract('dj') */ } });
}

// ── Outdoor screen (world cinema) facing the lounge ───────────────────
function buildScreen(ctx: WorldContext) {
  const SW = 6.0, SH = 3.4, SCY = 2.6, SX = 15.5, SZ = 0, ry = -Math.PI / 2;
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.16, SH + 0.4, SW + 0.4), new THREE.MeshStandardMaterial({ color: 0x0a0b12, roughness: 0.5, metalness: 0.4 })); bezel.position.set(SX + 0.05, SCY, SZ); ctx.scene.add(bezel);
  for (const [h, w, dy, dz] of [[0.08, SW + 0.4, SH / 2 + 0.2, 0], [0.08, SW + 0.4, -SH / 2 - 0.2, 0], [SH + 0.4, 0.08, 0, SW / 2 + 0.2], [SH + 0.4, 0.08, 0, -SW / 2 - 0.2]] as const) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, w), neon(0x35e0e0)); bar.position.set(SX, SCY + dy, SZ + dz); ctx.scene.add(bar);
  }
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ color: 0x0b1024, toneMapped: false })); scr.rotation.y = ry; scr.position.set(SX - 0.02, SCY, SZ); ctx.scene.add(scr);
  ctx.setScreen({ x: SX - 0.03, y: SCY, z: SZ, w: SW, h: SH, ry });
  ctx.addCollider({ x: SX + 0.1, z: SZ, r: 1.4 });
}

// ── Keep players on the deck (ring just inside the glass) ─────────────
function buildBoundary(ctx: WorldContext) {
  const n = 44;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ctx.addCollider({ x: Math.cos(a) * (DECK_R - 0.2), z: Math.sin(a) * (DECK_R - 0.2), r: 1.4 }); }
}
