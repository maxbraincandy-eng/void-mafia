// ── Premium World: Private Yacht ──────────────────────────────────────
// A luxury superyacht adrift on a moonlit ocean — the most cinematic world.
// One walkable main deck (the engine is single-level), styled as an
// ultra-premium superyacht: infinity pool, jacuzzi, lit bar, DJ, glowing dance
// floor, sunbeds & loungers, cuddle loveseats, an outdoor cinema, a helm, and a
// GLASS FLOOR with fish drifting below (the "underwater lounge" moment). A tall
// glass superstructure reads as multiple decks; a distant neon skyline and an
// animated sea complete the scene.
//
// Phone-budget AAA: the ocean waves + the fish + the city all animate in-shader
// or via a single InstancedMesh; only a few real lights; everything else glows
// with emissive/unlit materials; per-frame CPU throttles on ctx.perf.reduced.
import * as THREE from 'three';
import type { WorldDef, WorldContext } from './types';
import { tNow } from '@/store/langStore';

const HL = 23;    // half-length (bow -Z … stern +Z)
const HW = 8.5;   // half-width
const VIOLET = 0x9b5cff, CYAN = 0x35e0e0, WARM = 0xffb877, PINK = 0xff4d6d;

let _s = 771201;
function rnd() { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967295; }
function rr(a: number, b: number) { return a + (b - a) * rnd(); }
const _neon = new Map<number, THREE.MeshBasicMaterial>();
function neon(c: number) { let m = _neon.get(c); if (!m) { m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false }); _neon.set(c, m); } return m; }

let _winTex: THREE.Texture | null = null;
function windowTexture(): THREE.Texture {
  if (_winTex) return _winTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d')!;
  g.fillStyle = '#05060c'; g.fillRect(0, 0, 64, 128);
  const cols = ['#ffd98a', '#fff2c8', '#9fd4ff', '#cbb3ff'];
  for (let y = 3; y < 128; y += 7) for (let x = 3; x < 64; x += 8) if (rnd() < 0.5) { g.fillStyle = cols[(rnd() * cols.length) | 0]; g.globalAlpha = 0.5 + rnd() * 0.5; g.fillRect(x, y, 5, 4); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 6); _winTex = t; return t;
}

export const privateYacht: WorldDef = {
  id: 'yacht_club',
  name: 'Private Yacht',
  subtitle: 'ლუქს იახტა · ოკეანე · ხმა',
  icon: '🛥️',
  status: 'live',
  spawn: { x: 0, z: 10, yaw: Math.PI },
  fog: { color: 0x1a1836, density: 0.0075 },
  clear: 0x0a0a20,

  build(ctx: WorldContext) {
    _s = 771201; _neon.clear();
    ctx.ambientLight.color.setHex(0x5a5c8a); ctx.ambientLight.intensity = 0.9;
    ctx.moon.color.setHex(0xcdd6ff); ctx.moon.intensity = 1.0; ctx.moon.position.set(-50, 46, -60);

    buildSky(ctx);
    buildOcean(ctx);
    buildCity(ctx);
    buildHull(ctx);
    buildSuperstructure(ctx);
    buildRailing(ctx);
    buildPoolZone(ctx);
    buildGlassFloor(ctx);
    buildBar(ctx);
    buildDance(ctx);
    buildLounge(ctx);
    buildBow(ctx);
    buildLoveseats(ctx);
    buildScreen(ctx);
    buildHelm(ctx);
    buildStringLights(ctx);
    buildBoundary(ctx);

    ctx.addAmbient({ kind: 'night', x: 0, z: 0, radius: 140 });
    ctx.addAmbient({ kind: 'wind', x: 0, z: 0, radius: 140 });
    ctx.addAmbient({ kind: 'ocean', x: 0, z: -HL, radius: 80 });
  },
};

// ── Dusk-to-night sky + stars + moon ──────────────────────────────────
function buildSky(ctx: WorldContext) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x080a24) }, mid: { value: new THREE.Color(0x2a2a5a) }, bot: { value: new THREE.Color(0x9a5a6a) } },
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; void main(){ float h=clamp((normalize(vP).y+0.12)/0.85,0.0,1.0); vec3 c=h<0.5?mix(bot,mid,h*2.0):mix(mid,top,(h-0.5)*2.0); gl_FragColor=vec4(c,1.0);}',
  });
  ctx.scene.add(new THREE.Mesh(new THREE.SphereGeometry(340, 24, 14), mat));
  const N = 460; const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const u = rnd() * Math.PI * 2, v = rnd() * 0.46 + 0.08, r = 320; arr[i * 3] = Math.cos(u) * Math.cos(v) * r; arr[i * 3 + 1] = Math.sin(v) * r; arr[i * 3 + 2] = Math.sin(u) * Math.cos(v) * r; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false }));
  ctx.scene.add(stars); ctx.onUpdate((_d, e) => { if (!ctx.perf.reduced) (stars.material as THREE.PointsMaterial).opacity = 0.6 + Math.sin(e * 0.5) * 0.2; });
  const moon = new THREE.Mesh(new THREE.CircleGeometry(13, 28), new THREE.MeshBasicMaterial({ color: 0xf3ecff, fog: false })); moon.position.set(-150, 120, -200); moon.lookAt(0, 0, 0); ctx.scene.add(moon);
}

// ── Animated ocean (sine waves in the vertex shader; lit + fogged) ────
function buildOcean(ctx: WorldContext) {
  const geo = new THREE.PlaneGeometry(620, 620, 72, 72);
  const mat = new THREE.MeshStandardMaterial({ color: 0x0c2438, roughness: 0.18, metalness: 0.6 });
  const holder: { shader?: any } = {};
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 }; holder.shader = sh;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       float w = sin(position.x*0.08 + uTime*0.9)*0.35 + cos(position.y*0.11 + uTime*1.1)*0.28 + sin((position.x+position.y)*0.05 + uTime*0.6)*0.2;
       transformed.z += w;`);
  };
  const sea = new THREE.Mesh(geo, mat); sea.rotation.x = -Math.PI / 2; sea.position.y = -1.4; ctx.scene.add(sea);
  ctx.onUpdate((_d, e) => { if (holder.shader && !ctx.perf.reduced) holder.shader.uniforms.uTime.value = e; });
  // moon glitter streak toward the moon
  const streak = new THREE.Mesh(new THREE.PlaneGeometry(10, 120), new THREE.MeshBasicMaterial({ color: 0xdfe6ff, transparent: true, opacity: 0.16, toneMapped: false, depthWrite: false }));
  streak.rotation.x = -Math.PI / 2; streak.position.set(-70, -1.35, -90); streak.rotation.z = 0.6; ctx.scene.add(streak);
}

// ── Distant night-city skyline (one InstancedMesh) ────────────────────
function buildCity(ctx: WorldContext) {
  const COUNT = ctx.perf.reduced ? 40 : 80;
  const mat = new THREE.MeshStandardMaterial({ color: 0x0c0e1a, roughness: 1, emissive: 0xffffff, emissiveMap: windowTexture(), emissiveIntensity: 0.9 });
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, COUNT);
  const d = new THREE.Object3D();
  for (let i = 0; i < COUNT; i++) {
    // clustered along one horizon arc so it reads as a far city, not a ring
    const a = rr(1.6, 3.6), rad = rr(150, 240), h = rr(14, 60), w = rr(5, 11);
    d.position.set(Math.cos(a) * rad, h / 2 - 1.4, Math.sin(a) * rad); d.scale.set(w, h, w); d.rotation.set(0, rnd() * Math.PI, 0); d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
  }
  inst.instanceMatrix.needsUpdate = true; inst.frustumCulled = false; ctx.scene.add(inst);
}

// ── Yacht hull (deck at y=0, sleek white + carbon, bow to the -Z) ─────
function buildHull(ctx: WorldContext) {
  const white = new THREE.MeshStandardMaterial({ color: 0xeef0f4, roughness: 0.35, metalness: 0.2 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x14151c, roughness: 0.4, metalness: 0.5 });
  // deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(HW * 2, 0.4, HL * 2 - 4), new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.55, metalness: 0.15 }));
  deck.position.set(0, -0.2, 2); deck.receiveShadow = true; ctx.scene.add(deck);
  // teak planking hint (thin lines along the deck)
  for (let x = -HW + 1; x < HW; x += 1.4) { const plank = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, HL * 2 - 5), new THREE.MeshStandardMaterial({ color: 0x3a3228, roughness: 0.7 })); plank.position.set(x, 0.02, 2); ctx.scene.add(plank); }
  // hull sides going into the water
  for (const sgn of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, HL * 2 - 4), white); side.position.set(sgn * HW, -1.7, 2); side.castShadow = true; ctx.scene.add(side);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, HL * 2 - 4), neon(VIOLET)); stripe.position.set(sgn * HW, -0.7, 2); ctx.scene.add(stripe);
  }
  // bow wedge
  const bow = new THREE.Mesh(new THREE.ConeGeometry(HW, 8, 4), white); bow.rotation.x = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.scale.set(1, 1, 0.5); bow.position.set(0, -0.2, -HL - 1.5); ctx.scene.add(bow);
  const bowHull = new THREE.Mesh(new THREE.ConeGeometry(HW, 7, 4), white); bowHull.rotation.x = -Math.PI / 2; bowHull.rotation.y = Math.PI / 4; bowHull.scale.set(1, 1, 0.5); bowHull.position.set(0, -1.9, -HL - 1); ctx.scene.add(bowHull);
  // stern
  const stern = new THREE.Mesh(new THREE.BoxGeometry(HW * 2, 3.4, 1), white); stern.position.set(0, -1.7, HL - 1); ctx.scene.add(stern);
  void carbon;
}

// ── Glass superstructure (reads as several decks) ─────────────────────
function buildSuperstructure(ctx: WorldContext) {
  const SZ = 15;
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x2a3550, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.6, emissive: 0x1a2a4a, emissiveIntensity: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8ebf0, roughness: 0.35, metalness: 0.2 });
  // three stacked, receding decks — visual only (colliders block the base)
  const tiers: Array<[number, number, number, number]> = [[13, 6.5, 2.6, 0], [10, 5.2, 2.4, 2.6], [7, 4, 2.2, 5.0]];
  for (const [w, d, h, y] of tiers) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), white); body.position.set(0, y + h / 2, SZ + 1); body.castShadow = true; ctx.scene.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, h - 0.7, d + 0.05), glassMat); glass.position.set(0, y + h / 2, SZ + 1); ctx.scene.add(glass);
    // warm interior glow line
    const lit = new THREE.Mesh(new THREE.BoxGeometry(w - 0.5, 0.1, d + 0.08), neon(WARM)); lit.position.set(0, y + 0.4, SZ + 1); ctx.scene.add(lit);
  }
  // radar mast + a subtle violet beacon
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3, 6), white); mast.position.set(0, 8.6, SZ + 1); ctx.scene.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), neon(VIOLET)); beacon.position.set(0, 10.2, SZ + 1); ctx.scene.add(beacon);
  ctx.onUpdate((_d, e) => { (beacon.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(e * 3) * 0.4; (beacon.material as THREE.MeshBasicMaterial).transparent = true; });
  // colliders around the base so players don't walk through it
  for (let x = -6.5; x <= 6.5; x += 1.3) { ctx.addCollider({ x, z: SZ + 2.6, r: 0.8 }); ctx.addCollider({ x, z: SZ - 0.6, r: 0.8 }); }
  for (let z = SZ - 0.6; z <= SZ + 2.6; z += 1.3) { ctx.addCollider({ x: -6.5, z, r: 0.8 }); ctx.addCollider({ x: 6.5, z, r: 0.8 }); }
}

// ── Glass + steel deck railing all around ─────────────────────────────
function buildRailing(ctx: WorldContext) {
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.12, metalness: 0.3, roughness: 0.05, side: THREE.DoubleSide });
  const rail = new THREE.MeshStandardMaterial({ color: 0x2a2e3a, metalness: 0.8, roughness: 0.25 });
  const seg = 2.2;
  const addRun = (x1: number, z1: number, x2: number, z2: number) => {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), n = Math.max(1, Math.round(len / seg)), yaw = Math.atan2(dz, dx);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, mx = x1 + dx * t, mz = z1 + dz * t;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(len / n * 0.94, 1.0, 0.04), glass); panel.position.set(mx, 0.55, mz); panel.rotation.y = -yaw; ctx.scene.add(panel);
      const top = new THREE.Mesh(new THREE.BoxGeometry(len / n, 0.07, 0.09), rail); top.position.set(mx, 1.1, mz); top.rotation.y = -yaw; ctx.scene.add(top);
    }
  };
  addRun(-HW + 0.2, -HL + 6, -HW + 0.2, HL - 2);  // port
  addRun(HW - 0.2, -HL + 6, HW - 0.2, HL - 2);    // starboard
  addRun(-HW + 0.2, HL - 2, HW - 0.2, HL - 2);    // stern
  addRun(-HW + 0.2, -HL + 6, 0, -HL - 0.5); addRun(0, -HL - 0.5, HW - 0.2, -HL + 6); // bow point
}

// ── Infinity pool + jacuzzi (mid-deck) ────────────────────────────────
function buildPoolZone(ctx: WorldContext) {
  const PX = 0, PZ = -3;
  const rim = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 4.4), new THREE.MeshStandardMaterial({ color: 0x1a1c26, roughness: 0.35, metalness: 0.5 })); rim.position.set(PX, 0.1, PZ); ctx.scene.add(rim);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.8), new THREE.MeshStandardMaterial({ color: 0x2fb8d8, transparent: true, opacity: 0.82, roughness: 0.1, metalness: 0.6, emissive: 0x0e5a70, emissiveIntensity: 0.5 }));
  water.rotation.x = -Math.PI / 2; water.position.set(PX, 0.22, PZ); ctx.scene.add(water);
  const glow = new THREE.PointLight(0x3fd0e0, 1.2, 14, 2); glow.position.set(PX, 1.2, PZ); ctx.scene.add(glow);
  ctx.onUpdate((_d, e) => { if (ctx.perf.reduced) return; (water.material as THREE.MeshStandardMaterial).opacity = 0.78 + Math.sin(e * 0.9) * 0.06; });
  ctx.addCollider({ x: PX, z: PZ, r: 2.4 });
  // jacuzzi to the side
  const jx = 5.2, jz = -3;
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.4, 0.8, 20), new THREE.MeshStandardMaterial({ color: 0x1a1c26, roughness: 0.4, metalness: 0.4 })); tub.position.set(jx, 0.4, jz); ctx.scene.add(tub);
  const jw = new THREE.Mesh(new THREE.CircleGeometry(1.35, 24), new THREE.MeshStandardMaterial({ color: 0x38c8d8, transparent: true, opacity: 0.85, roughness: 0.1, emissive: 0x0e5a70, emissiveIntensity: 0.6 })); jw.rotation.x = -Math.PI / 2; jw.position.set(jx, 0.78, jz); ctx.scene.add(jw);
  ctx.addCollider({ x: jx, z: jz, r: 1.6 });
  // seats around the jacuzzi rim
  for (let i = 0; i < 3; i++) { const a = -0.6 + i * 0.6; const sx = jx + Math.cos(a) * 1.9, sz = jz + Math.sin(a) * 1.9; ctx.addSeat({ id: `jac${i}`, x: sx, y: 0.55, z: sz, yaw: Math.atan2(sx - jx, sz - jz), prop: 'drink' }); }
}

// ── Glass floor with fish drifting below (the underwater moment) ──────
function buildGlassFloor(ctx: WorldContext) {
  const GX = 0, GZ = -12, W = 6, D = 5;
  // a viewing well below the deck
  const well = new THREE.Mesh(new THREE.BoxGeometry(W, 3, D), new THREE.MeshStandardMaterial({ color: 0x06222e, side: THREE.BackSide, roughness: 1, emissive: 0x03323f, emissiveIntensity: 0.5 }));
  well.position.set(GX, -1.5, GZ); ctx.scene.add(well);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.18, roughness: 0.02, metalness: 0.4, side: THREE.DoubleSide }));
  glass.rotation.x = -Math.PI / 2; glass.position.set(GX, 0.06, GZ); ctx.scene.add(glass);
  // caustic light rays
  const ray = new THREE.PointLight(0x40c0e0, 1.0, 8, 2); ray.position.set(GX, -0.6, GZ); ctx.scene.add(ray);
  // fish — one InstancedMesh circling below the glass
  const COUNT = ctx.perf.reduced ? 8 : 16;
  const fishGeo = new THREE.ConeGeometry(0.12, 0.5, 5); fishGeo.rotateX(Math.PI / 2);
  const fish = new THREE.InstancedMesh(fishGeo, neon(0x8fe8ff), COUNT);
  const seeds = Array.from({ length: COUNT }, () => ({ r: rr(0.6, 2.4), a: rr(0, Math.PI * 2), y: rr(-2.6, -0.6), sp: rr(0.2, 0.6) }));
  const d = new THREE.Object3D();
  ctx.onUpdate((_dt, e) => {
    if (ctx.perf.reduced && (e % 0.2) > 0.05) return;
    for (let i = 0; i < COUNT; i++) { const s = seeds[i]; const a = s.a + e * s.sp; const x = GX + Math.cos(a) * s.r, z = GZ + Math.sin(a) * s.r; d.position.set(x, s.y, z); d.rotation.y = -a + Math.PI / 2; d.updateMatrix(); fish.setMatrixAt(i, d.matrix); }
    fish.instanceMatrix.needsUpdate = true;
  });
  ctx.scene.add(fish);
  // border glow + label rug
  const border = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.05, 4, 4), neon(CYAN)); border.visible = false; ctx.scene.add(border);
  for (const [w, h, dx, dz] of [[W, 0.06, 0, D / 2], [W, 0.06, 0, -D / 2], [0.06, D, W / 2, 0], [0.06, D, -W / 2, 0]] as const) { const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, h), neon(CYAN)); bar.position.set(GX + dx, 0.08, GZ + dz); ctx.scene.add(bar); }
  void ray;
}

// ── Sleek lit bar with stools (aft, port side) ────────────────────────
function buildBar(ctx: WorldContext) {
  const BX = -5.5, BZ = 8;
  const g = new THREE.Group(); g.position.set(BX, 0, BZ); g.rotation.y = 0.5; ctx.scene.add(g);
  const body = new THREE.Mesh(new THREE.BoxGeometry(4, 1.1, 1.0), new THREE.MeshStandardMaterial({ color: 0x14151f, roughness: 0.3, metalness: 0.6 })); body.position.y = 0.55; body.castShadow = true; g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.1, 1.25), new THREE.MeshStandardMaterial({ color: 0x0a0b12, roughness: 0.2, metalness: 0.8 })); top.position.y = 1.16; g.add(top);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(4, 0.14, 0.05), neon(VIOLET)); strip.position.set(0, 0.5, 0.52); g.add(strip);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(4, 1.4, 0.14), new THREE.MeshStandardMaterial({ color: 0x11121a, roughness: 0.6 })); shelf.position.set(0, 1.4, -0.7); g.add(shelf);
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 1.3), neon(0x2a2050)); bg.position.set(0, 1.4, -0.62); g.add(bg);
  const bottleGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.32, 6);
  for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(bottleGeo, neon([0x6aff9e, 0xff6a8a, 0x6ab0ff, 0xffcf6a, 0xc06bff][i % 5])); b.position.set(-1.5 + i * 0.5, 1.4, -0.6); g.add(b); }
  const l = new THREE.PointLight(VIOLET, 1.1, 12, 2); l.position.set(0, 2.0, 0); g.add(l);
  ctx.onUpdate((_d, e) => { if (!ctx.perf.reduced) l.intensity = 1.0 + Math.sin(e * 5) * 0.2; });
  ctx.addCollider({ x: BX, z: BZ, r: 1.6 });
  for (let i = 0; i < 3; i++) {
    const lx = -1.2 + i * 1.2, lz = 1.15, wx = BX + lx * Math.cos(0.5) - lz * Math.sin(0.5), wz = BZ + lx * Math.sin(0.5) + lz * Math.cos(0.5);
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.7, 12), new THREE.MeshStandardMaterial({ color: 0x22242f, roughness: 0.5, metalness: 0.4 })); stool.position.set(wx, 0.35, wz); ctx.scene.add(stool);
    ctx.addCollider({ x: wx, z: wz, r: 0.32 });
    ctx.addSeat({ id: `bar${i}`, x: wx, y: 0.7, z: wz, yaw: Math.atan2(wx - BX, wz - BZ), prop: 'drink' });
  }
}

// ── Glowing dance floor + DJ booth (aft, starboard) ───────────────────
function buildDance(ctx: WorldContext) {
  const DX = 4.5, DZ = 8, N = 4, T = 1.0;
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(T * 0.9, 0.06, T * 0.9), new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.9 }), N * N);
  const dm = new THREE.Object3D(); const c = new THREE.Color(); let idx = 0;
  for (let ix = 0; ix < N; ix++) for (let iz = 0; iz < N; iz++) { dm.position.set(DX + (ix - (N - 1) / 2) * T, 0.05, DZ + (iz - (N - 1) / 2) * T); dm.updateMatrix(); inst.setMatrixAt(idx, dm.matrix); inst.setColorAt(idx, c.setHex([VIOLET, CYAN, PINK, 0x6ab0ff][idx % 4])); idx++; }
  inst.instanceMatrix.needsUpdate = true; ctx.scene.add(inst);
  let acc = 0; const cc = new THREE.Color();
  ctx.onUpdate((dt, e) => { acc += dt; if (ctx.perf.reduced || acc < 0.13) return; acc = 0; let i = 0; for (let ix = 0; ix < N; ix++) for (let iz = 0; iz < N; iz++) { cc.setHSL((e * 0.13 + (ix + iz) * 0.1) % 1, 1, 0.55); inst.setColorAt(i++, cc); } if (inst.instanceColor) inst.instanceColor.needsUpdate = true; });
  // DJ booth
  const g = new THREE.Group(); g.position.set(DX, 0, DZ + 3); g.rotation.y = Math.PI; ctx.scene.add(g);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.8), new THREE.MeshStandardMaterial({ color: 0x14151f, roughness: 0.4, metalness: 0.5 })); desk.position.y = 0.5; g.add(desk);
  const face = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.02), neon(VIOLET)); face.position.set(0, 0.5, 0.42); g.add(face);
  for (const dx of [-0.5, 0.5]) { const dk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 18), neon(CYAN)); dk.position.set(dx, 1.05, 0); g.add(dk); }
  ctx.addCollider({ x: DX, z: DZ + 3, r: 1.1 });
  ctx.addInteractable({ id: 'dj', x: DX, z: DZ + 1.6, r: 1.8, label: tNow().worlds.djMusic, effect: () => { /* music panel via onInteract('dj') */ } });
}

// ── Sectional lounges (aft-center) ────────────────────────────────────
function buildLounge(ctx: WorldContext) {
  const LX = 0, LZ = 8.5;
  const sofaMat = new THREE.MeshStandardMaterial({ color: 0x2b2e3a, roughness: 0.85 });
  const g = new THREE.Group(); g.position.set(LX, 0, LZ); ctx.scene.add(g);
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.45, 1.0), sofaMat); base.position.set(0, 0.28, 0); base.castShadow = true; g.add(base);
  const back = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.6, 0.2), sofaMat); back.position.set(0, 0.68, 0.4); g.add(back);
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.7), new THREE.MeshStandardMaterial({ color: 0x0e0f16, roughness: 0.3, metalness: 0.5 })); table.position.set(0, 0.18, -1.1); g.add(table);
  ctx.addCollider({ x: LX, z: LZ + 0.2, r: 1.4 });
  for (const sx of [-1.2, 0, 1.2]) ctx.addSeat({ id: `lounge${sx}`, x: LX + sx, y: 0.55, z: LZ, yaw: 0, prop: 'drink' }); // face the bow (-z)
}

// ── Bow: helipad + sunbeds ────────────────────────────────────────────
function buildBow(ctx: WorldContext) {
  const HX = 0, HZ = -18;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.06, 32), new THREE.MeshStandardMaterial({ color: 0x14161e, roughness: 0.7 })); pad.position.set(HX, 0.05, HZ); ctx.scene.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.08, 8, 40), neon(WARM)); ring.rotation.x = Math.PI / 2; ring.position.set(HX, 0.09, HZ); ctx.scene.add(ring);
  // big H
  for (const [w, h, dx] of [[0.4, 2.6, -0.9], [0.4, 2.6, 0.9], [1.8, 0.4, 0]] as const) { const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, h), neon(0xffffff)); bar.position.set(HX + dx, 0.1, HZ); ctx.scene.add(bar); }
  // sunbeds flanking, facing the bow view
  const bedMat = new THREE.MeshStandardMaterial({ color: 0xece7dc, roughness: 0.9 });
  for (const bx of [-5.5, 5.5]) {
    const bg = new THREE.Group(); bg.position.set(bx, 0, HZ + 2); ctx.scene.add(bg);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 2.0), bedMat); bed.position.y = 0.35; bed.castShadow = true; bg.add(bed);
    const rest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.16), bedMat); rest.position.set(0, 0.58, 0.9); rest.rotation.x = -0.5; bg.add(rest);
    ctx.addSeat({ id: `bed${bx}`, x: bx, y: 0.55, z: HZ + 2, yaw: Math.atan2(0, -1), prop: 'drink' }); // recline toward the bow
    ctx.addCollider({ x: bx, z: HZ + 2, r: 0.7 });
  }
}

// ── Cuddle loveseats (embrace pose) ───────────────────────────────────
function loveseat(ctx: WorldContext, x: number, z: number, yaw: number, col: number, id: string) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; ctx.scene.add(g);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2b2e3a, roughness: 0.85 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 1.0), mat); base.position.y = 0.26; base.castShadow = true; g.add(base);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 0.2), mat); back.position.set(0, 0.6, -0.4); g.add(back);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.1), neon(col)); glow.position.set(0, 0.04, 0.45); g.add(glow);
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), neon(PINK)); heart.position.set(0, 1.5, 0); heart.scale.set(1, 0.9, 0.6); g.add(heart);
  ctx.onUpdate((_d, e) => { heart.position.y = 1.45 + Math.sin(e * 1.6) * 0.08; heart.rotation.y = e * 0.7; });
  ctx.addCollider({ x, z, r: 0.9 });
  const d = 0.34, cx = Math.cos(yaw), sx = Math.sin(yaw);
  ctx.addSeat({ id: `${id}-l`, x: x + cx * d, y: 0.5, z: z - sx * d, yaw, pose: 'cuddleL' });
  ctx.addSeat({ id: `${id}-r`, x: x - cx * d, y: 0.5, z: z + sx * d, yaw, pose: 'cuddleR' });
}
function buildLoveseats(ctx: WorldContext) {
  loveseat(ctx, -6, -8, 1.0, VIOLET, 'love1');
  loveseat(ctx, 6, -8, -1.0, CYAN, 'love2');
}

// ── Outdoor cinema screen (on the superstructure face) ────────────────
function buildScreen(ctx: WorldContext) {
  const SW = 5.4, SH = 3.0, SCY = 3.2, SZ = 12.4;
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.4, SH + 0.4, 0.16), new THREE.MeshStandardMaterial({ color: 0x0a0b12, roughness: 0.5, metalness: 0.4 })); bezel.position.set(0, SCY, SZ + 0.05); ctx.scene.add(bezel);
  for (const [w, h, dx, dy] of [[SW + 0.4, 0.08, 0, SH / 2 + 0.2], [SW + 0.4, 0.08, 0, -SH / 2 - 0.2], [0.08, SH + 0.4, SW / 2 + 0.2, 0], [0.08, SH + 0.4, -SW / 2 - 0.2, 0]] as const) { const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), neon(VIOLET)); bar.position.set(dx, SCY + dy, SZ); ctx.scene.add(bar); }
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ color: 0x0b1024, toneMapped: false })); scr.position.set(0, SCY, SZ - 0.02); ctx.scene.add(scr);
  ctx.setScreen({ x: 0, y: SCY, z: SZ - 0.03, w: SW, h: SH, ry: 0 });
}

// ── Captain's helm (a seat + wheel at the bow-facing console) ─────────
function buildHelm(ctx: WorldContext) {
  const HX = 0, HZ = 12.6;
  const g = new THREE.Group(); g.position.set(HX, 0, HZ); ctx.scene.add(g);
  const console2 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 0.7), new THREE.MeshStandardMaterial({ color: 0x14151f, roughness: 0.4, metalness: 0.5 })); console2.position.y = 0.45; g.add(console2);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.05), neon(CYAN)); panel.position.set(0, 0.6, -0.35); panel.rotation.x = 0.5; g.add(panel);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 8, 20), new THREE.MeshStandardMaterial({ color: 0x2a2e3a, metalness: 0.7, roughness: 0.3 })); wheel.position.set(0, 1.0, 0.1); wheel.rotation.x = 0.4; g.add(wheel);
  ctx.onUpdate((d) => { if (!ctx.perf.reduced) wheel.rotation.z += d * 0.2; });
  ctx.addCollider({ x: HX, z: HZ, r: 1.0 });
  ctx.addSeat({ id: 'captain', x: HX, z: HZ + 1.2, y: 0.55, yaw: Math.atan2(0, -1) }); // captain faces the bow
}

// ── Hanging string lights over the aft social deck ────────────────────
function buildStringLights(ctx: WorldContext) {
  const bulbs: Array<[number, number, number]> = [];
  for (let run = 0; run < 3; run++) {
    const x1 = -HW + 1.5, x2 = HW - 1.5, z = 4 + run * 3.5;
    for (let t = 0; t <= 1.0001; t += 1 / 8) { const sag = Math.sin(t * Math.PI) * 0.7; bulbs.push([x1 + (x2 - x1) * t, 3.2 - sag, z]); }
  }
  const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 6), neon(WARM), bulbs.length);
  const d = new THREE.Object3D(); bulbs.forEach(([x, y, z], i) => { d.position.set(x, y, z); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); });
  inst.instanceMatrix.needsUpdate = true; ctx.scene.add(inst);
}

// ── Keep players aboard (rail ring) ───────────────────────────────────
function buildBoundary(ctx: WorldContext) {
  const addRun = (x1: number, z1: number, x2: number, z2: number) => { const n = Math.round(Math.hypot(x2 - x1, z2 - z1) / 1.4); for (let i = 0; i <= n; i++) { const t = i / n; ctx.addCollider({ x: x1 + (x2 - x1) * t, z: z1 + (z2 - z1) * t, r: 1.0 }); } };
  addRun(-HW + 0.4, -HL + 6, -HW + 0.4, HL - 2);
  addRun(HW - 0.4, -HL + 6, HW - 0.4, HL - 2);
  addRun(-HW + 0.4, HL - 2, HW - 0.4, HL - 2);
  addRun(-HW + 0.4, -HL + 6, 0, -HL + 0.5); addRun(0, -HL + 0.5, HW - 0.4, -HL + 6);
}
