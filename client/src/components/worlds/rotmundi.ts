// ── Premium World: Rotmundi ───────────────────────────────────────────
// A peaceful old seaport town of friendly sea spirits. A warm stone harbour
// square opens south onto a sunlit bay; behind it a cosy OLD TOWN of plastered
// houses with red-tiled roofs climbs the hill in terraces, crowned by a castle;
// a striped lighthouse guards a headland; tall sailing ships lie at anchor;
// ghostly white seals bob and wave in the shallows and colourful shadowbirds
// streak the sky. Day/night + weather via the shared atmosphere system.
//
// Deliberately NOT the neon-window-tower look of the other worlds — this is a
// hand-built warm Mediterranean-style harbour, terraced back off the square so
// the space feels open, not walled in.
import * as THREE from 'three';
import type { WorldDef, WorldContext } from './types';
import { setupAtmosphere, MOODS_SEA } from './atmosphere';

const PLAZA_R = 21;
let _s = 330077;
function rnd() { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967295; }
function rr(a: number, b: number) { return a + (b - a) * rnd(); }
const _neon = new Map<number, THREE.MeshBasicMaterial>();
function neon(c: number) { let m = _neon.get(c); if (!m) { m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false }); _neon.set(c, m); } return m; }
const ATM: { setAmp?: (v: number) => void } = {};

// The bay opens to the SOUTH (+Z). Houses fill the back arc; nothing is built in
// this angular window so the square looks onto open water.
function facingBay(ang: number) { const d = Math.abs(((ang - Math.PI / 2 + Math.PI) % (Math.PI * 2)) - Math.PI); return d < 1.15; }

// Sparse, warm "cottage windows" — a few lit panes on a dark map, so at night
// houses glow cosily instead of reading as a glass office grid.
let _winTex: THREE.Texture | null = null;
function windowTexture(): THREE.Texture {
  if (_winTex) return _winTex;
  const c = document.createElement('canvas'); c.width = 48; c.height = 64; const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, 48, 64);
  const cols = ['#ffcf7a', '#ffe0a0', '#ffb86a'];
  for (let ry = 0; ry < 3; ry++) for (let cx = 0; cx < 2; cx++) {
    if (rnd() < 0.62) { g.fillStyle = cols[(rnd() * 3) | 0]; g.globalAlpha = 0.7 + rnd() * 0.3; g.fillRect(10 + cx * 20, 10 + ry * 18, 10, 11); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.3, 1.6); _winTex = t; return t;
}

export const rotmundi: WorldDef = {
  id: 'rotmundi',
  name: 'Rotmundi',
  subtitle: 'ძველი პორტი · სელაპები · ხმა',
  icon: '⚓',
  status: 'live',
  spawn: { x: 0, z: 6, yaw: 0 },     // on the square, looking out over the bay
  fog: { color: 0xbcd0e0, density: 0.0085 },
  clear: 0xaecbe0,

  build(ctx: WorldContext) {
    _s = 330077; _neon.clear();
    const sky = buildSky(ctx);
    buildBay(ctx);
    buildSquare(ctx);
    buildOldTown(ctx);
    buildCastle(ctx);
    buildLighthouse(ctx);
    buildShips(ctx);
    buildPier(ctx);
    buildGhostSeals(ctx);
    buildShadowbirds(ctx);
    buildMarket(ctx);
    buildLoveWall(ctx);
    buildFountain(ctx);
    buildSwim(ctx);
    buildBoundary(ctx);

    (ctx.scene.fog as any).userData = { base: 0.0085 };
    setupAtmosphere(ctx, { sky, moods: MOODS_SEA, cycle: 260, onAmp: (v) => ATM.setAmp?.(v) });

    ctx.addAmbient({ kind: 'ocean', x: 0, z: 40, radius: 80 });
    ctx.addAmbient({ kind: 'wind', x: 0, z: 0, radius: 130 });
    ctx.addAmbient({ kind: 'night', x: 0, z: 0, radius: 130 });
  },
};

// ── Sky dome (returns its gradient colours for the atmosphere machine) ─
function buildSky(ctx: WorldContext) {
  const uniforms = { top: { value: new THREE.Color(0x3a6aa8) }, mid: { value: new THREE.Color(0x7a9ad0) }, bot: { value: new THREE.Color(0xdfeaf6) } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; void main(){ float h=clamp((normalize(vP).y+0.12)/0.85,0.0,1.0); vec3 c=h<0.5?mix(bot,mid,h*2.0):mix(mid,top,(h-0.5)*2.0); gl_FragColor=vec4(c,1.0);}',
  });
  ctx.scene.add(new THREE.Mesh(new THREE.SphereGeometry(340, 24, 14), mat));
  const N = 360; const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const u = rnd() * Math.PI * 2, v = rnd() * 0.45 + 0.1, r = 320; arr[i * 3] = Math.cos(u) * Math.cos(v) * r; arr[i * 3 + 1] = Math.sin(v) * r; arr[i * 3 + 2] = Math.sin(u) * Math.cos(v) * r; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
  ctx.scene.add(stars);
  ctx.onUpdate((_d, e) => { (stars.material as THREE.PointsMaterial).opacity = Math.max(0, Math.sin(e / 260 * Math.PI * 2 - 1.2)) * 0.7; });
  return { top: uniforms.top.value, mid: uniforms.mid.value, bot: uniforms.bot.value };
}

// ── The bay (animated water) — wraps most of the square ───────────────
function buildBay(ctx: WorldContext) {
  const geo = new THREE.PlaneGeometry(600, 600, 64, 64);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1f6f92, roughness: 0.18, metalness: 0.5 });
  const holder: { shader?: any } = {};
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 }; sh.uniforms.uAmp = { value: 1 }; holder.shader = sh;
    sh.vertexShader = 'uniform float uTime; uniform float uAmp;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       float w = sin(position.x*0.09 + uTime*0.9)*0.28 + cos(position.y*0.12 + uTime*1.1)*0.22;
       transformed.z += w * uAmp;`);
  };
  const sea = new THREE.Mesh(geo, mat); sea.rotation.x = -Math.PI / 2; sea.position.y = -1.2; ctx.scene.add(sea);
  ATM.setAmp = (v) => { if (holder.shader) holder.shader.uniforms.uAmp.value = v; };
  ctx.onUpdate((_d, e) => { if (holder.shader && !ctx.perf.reduced) holder.shader.uniforms.uTime.value = e; });
}

// ── Warm stone harbour square + a low seawall (bay side open) ─────────
function buildSquare(ctx: WorldContext) {
  const stone = new THREE.MeshStandardMaterial({ color: 0xbfae90, roughness: 0.95 });
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(PLAZA_R, PLAZA_R + 0.6, 1.4, 56), stone);
  plaza.position.y = -0.7; plaza.receiveShadow = true; ctx.scene.add(plaza);
  // cobble arcs
  for (const r of [8, 14, 19]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 6, 64), new THREE.MeshStandardMaterial({ color: 0x9a8b6e, roughness: 1 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; ctx.scene.add(ring); }
  // continuous low seawall around the edge, with a gap for the pier (south) and
  // an open promenade toward the bay
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xc8b896, roughness: 0.9 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x9a8b6e, roughness: 1 });
  const N = 64;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, x = Math.cos(a) * PLAZA_R, z = Math.sin(a) * PLAZA_R, yaw = Math.atan2(z, x);
    if (z > PLAZA_R - 5 && Math.abs(x) < 3.2) continue; // pier gap
    const len = 2 * PLAZA_R * Math.sin(Math.PI / N) + 0.1;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, len), wallMat); seg.position.set(x, 0.2, z); seg.rotation.y = yaw; ctx.scene.add(seg);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, len), capMat); cap.position.set(x, 0.66, z); cap.rotation.y = yaw; ctx.scene.add(cap);
    // lantern posts on the bay side
    if (z > -2 && i % 5 === 0) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.7, 6), capMat); post.position.set(x * 0.94, 0.85, z * 0.94); ctx.scene.add(post); const lant = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), neon(0xffcf7a)); lant.position.set(x * 0.94, 1.75, z * 0.94); ctx.scene.add(lant); }
  }
}

// ── The old town: terraced plastered houses with red-tiled roofs ──────
function buildOldTown(ctx: WorldContext) {
  const COUNT = ctx.perf.reduced ? 72 : 150;
  const plaster = [0xe6cfa6, 0xd9b98a, 0xe8d8b0, 0xc89a6a, 0xd8c19a, 0xcaa878, 0xe0b88a];
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveMap: windowTexture(), emissiveIntensity: 0.55 });
  bodyMat.vertexColors = false;
  const roofCols = [0xb0432e, 0xa83a2a, 0xc25436, 0x9a3626];
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bodyMat, COUNT);
  const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(0.72, 1, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), COUNT);
  const d = new THREE.Object3D(); const bc = new THREE.Color(), rc = new THREE.Color();
  let placed = 0, tries = 0;
  while (placed < COUNT && tries < COUNT * 5) {
    tries++;
    const ang = rr(0, Math.PI * 2);
    if (facingBay(ang)) continue;                       // leave the bay open
    const rad = rr(PLAZA_R + 3, PLAZA_R + 62);
    const hill = Math.pow((rad - PLAZA_R - 3) / 62, 1.05) * 16;   // climb the hillside
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    if (Math.hypot(x - 40, z - 18) < 9) continue;       // not on the lighthouse rock
    const h = rr(2.4, 5.6), w = rr(2.8, 4.6), dep = rr(2.8, 4.4);
    const ry = ang + rr(-0.4, 0.4);
    d.position.set(x, hill + h / 2, z); d.scale.set(w, h, dep); d.rotation.set(0, ry, 0); d.updateMatrix(); bodies.setMatrixAt(placed, d.matrix);
    bc.setHex(plaster[(rnd() * plaster.length) | 0]); bodies.setColorAt(placed, bc);
    d.position.set(x, hill + h + 0.5, z); d.scale.set(w * 1.02, 1.5, dep * 1.02); d.rotation.set(0, ry + Math.PI / 4, 0); d.updateMatrix(); roofs.setMatrixAt(placed, d.matrix);
    rc.setHex(roofCols[(rnd() * roofCols.length) | 0]); roofs.setColorAt(placed, rc);
    // block the ground-floor footprint so you can't walk into the town wall
    if (rad < PLAZA_R + 8) ctx.addCollider({ x, z, r: Math.max(w, dep) * 0.5 });
    placed++;
  }
  bodies.count = placed; roofs.count = placed;
  bodies.instanceMatrix.needsUpdate = true; roofs.instanceMatrix.needsUpdate = true;
  bodies.frustumCulled = false; roofs.frustumCulled = false;
  ctx.scene.add(bodies); ctx.scene.add(roofs);
}

// ── Castle crowning the hill behind the town ──────────────────────────
function buildCastle(ctx: WorldContext) {
  const g = new THREE.Group(); g.position.set(-6, 15.5, -60); ctx.scene.add(g);
  const stone = new THREE.MeshStandardMaterial({ color: 0xcabfa4, roughness: 1 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x3a6a9a, roughness: 0.8 });
  const keep = new THREE.Mesh(new THREE.BoxGeometry(10, 13, 10), stone); keep.position.y = 6.5; g.add(keep);
  // battlement teeth
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const t = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 1), stone); t.position.set(Math.cos(a) * 4.6, 13.4, Math.sin(a) * 4.6); g.add(t); }
  for (const [tx, tz, th] of [[-6, -6, 18], [6, -6, 18], [-6, 6, 16], [6, 6, 16]] as const) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.4, th, 12), stone); tower.position.set(tx, th / 2, tz); g.add(tower);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.8, 4.5, 12), roof); cone.position.set(tx, th + 2.2, tz); g.add(cone);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9), neon(0x9b5cff)); flag.position.set(tx + 0.8, th + 5, tz); g.add(flag);
  }
}

// ── Striped lighthouse on a headland with a sweeping beam ─────────────
function buildLighthouse(ctx: WorldContext) {
  const g = new THREE.Group(); g.position.set(40, 0, 18); ctx.scene.add(g);
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 7, 4, 10), new THREE.MeshStandardMaterial({ color: 0x6a6156, roughness: 1 })); rock.position.y = -0.5; g.add(rock);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.1, 13, 16), new THREE.MeshStandardMaterial({ color: 0xf2eee2, roughness: 0.7 })); tower.position.y = 8; g.add(tower);
  for (let i = 0; i < 3; i++) { const band = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.82, 1.3, 16), new THREE.MeshStandardMaterial({ color: 0xd6382e, roughness: 0.7 })); band.position.y = 3.5 + i * 3.3; g.add(band); }
  const room = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 1.7, 12), neon(0xffe6a0)); room.position.y = 14.5; g.add(room);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.7, 12), new THREE.MeshStandardMaterial({ color: 0x2a2e3a, metalness: 0.6, roughness: 0.4 })); cap.position.y = 16.2; g.add(cap);
  const lamp = new THREE.PointLight(0xffe6a0, 1.6, 46, 2); lamp.position.set(40, 14.5, 18); ctx.scene.add(lamp);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(3.4, 50, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.08, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
  beam.rotation.z = Math.PI / 2; beam.position.set(40, 14.5, 18); ctx.scene.add(beam);
  ctx.onUpdate((_d, e) => { beam.rotation.y = e * 0.55; lamp.intensity = 1.4 + Math.sin(e * 3) * 0.2; });
}

// ── Tall sailing ships at anchor in the bay ───────────────────────────
function buildShips(ctx: WorldContext) {
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.9 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x7a5836, roughness: 0.9 });
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xeae2d0, roughness: 1, side: THREE.DoubleSide });
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 1 });
  for (const [sx, sz, ry, sc] of [[-13, 34, 0.5, 1.1], [12, 44, -0.7, 1.35], [0, 60, 0.2, 1.5]] as const) {
    const g = new THREE.Group(); g.position.set(sx, 0, sz); g.rotation.y = ry; g.scale.setScalar(sc); ctx.scene.add(g);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 9), hullMat); hull.position.y = -0.1; g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3, 4), hullMat); bow.rotation.x = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(0, -0.1, -5.2); bow.scale.set(1, 1, 0.5); g.add(bow);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 8.6), deckMat); deck.position.y = 0.85; g.add(deck);
    const castle = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 2.4), deckMat); castle.position.set(0, 1.7, 3.2); g.add(castle);
    for (const [mz, mh] of [[-3, 8], [0.5, 9.5], [3.2, 7]] as const) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, mh, 6), mastMat); mast.position.set(0, mh / 2 + 0.8, mz); g.add(mast);
      for (let s = 0; s < 2; s++) { const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2), sailMat); sail.position.set(0, 2.6 + s * 2.6, mz); sail.rotation.y = Math.PI / 2; g.add(sail); }
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.6), neon([0xd83a3a, 0x3a8ad8, 0x9b5cff][(mz + 4) % 3 | 0])); flag.position.set(0, mh + 1.1, mz); g.add(flag);
    }
    ctx.onUpdate((_d, e) => { g.rotation.z = Math.sin(e * 0.6 + sx) * 0.03; g.position.y = Math.sin(e * 0.7 + sz) * 0.08; });
  }
}

// ── Pier reaching into the bay with fishing spots + a bench ───────────
function buildPier(ctx: WorldContext) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a2716, roughness: 1 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.25, 15), wood); deck.position.set(0, -0.05, PLAZA_R + 5.5); deck.receiveShadow = true; ctx.scene.add(deck);
  for (let z = PLAZA_R; z <= PLAZA_R + 13; z += 2.2) for (const sx of [-2.2, 2.2]) { const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 2.4, 6), dark); pile.position.set(sx, -1.1, z); ctx.scene.add(pile); ctx.addCollider({ x: sx, z, r: 0.3 }); }
  for (const sx of [-1.4, 1.4]) ctx.addSeat({ id: `fish${sx}`, x: sx, y: 0.45, z: PLAZA_R + 12, yaw: Math.atan2(sx, (PLAZA_R + 12) - (PLAZA_R + 40)) });
  for (let z = PLAZA_R + 2; z <= PLAZA_R + 12; z += 5) for (const sx of [-2.4, 2.4]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), dark); post.position.set(sx, 0.7, z); ctx.scene.add(post); const lant = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), neon(0xffcf7a)); lant.position.set(sx, 1.5, z); ctx.scene.add(lant); }
}

// ── Friendly ghost seals — translucent, bobbing, waving a flipper ─────
function buildGhostSeals(ctx: WorldContext) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeaf4ff, roughness: 0.6, transparent: true, opacity: 0.82, emissive: 0x6a9ac0, emissiveIntensity: 0.35 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a2230, toneMapped: false });
  const spots: Array<[number, number]> = [[-4, PLAZA_R + 6], [5, PLAZA_R + 8], [-9, PLAZA_R + 12], [10, PLAZA_R + 13], [0, PLAZA_R + 17]];
  spots.forEach(([x, z], i) => {
    const g = new THREE.Group(); g.position.set(x, -0.7, z); g.rotation.y = Math.atan2(-x, -z); ctx.scene.add(g);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 12), bodyMat); body.scale.set(1, 1.15, 1.5); body.position.y = 0.3; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), bodyMat); head.position.set(0, 0.85, -0.55); g.add(head);
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), bodyMat); snout.position.set(0, 0.75, -0.9); snout.scale.set(1, 0.8, 1.1); g.add(snout);
    for (const ex of [-0.16, 0.16]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMat); eye.position.set(ex, 0.92, -0.85); g.add(eye); }
    const flipper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.34), bodyMat); flipper.position.set(0.55, 0.4, 0.1); g.add(flipper);
    const ph = i * 1.3;
    ctx.onUpdate((_d, e) => {
      g.position.y = -0.7 + Math.sin(e * 1.3 + ph) * 0.14;
      g.rotation.z = Math.sin(e * 1.0 + ph) * 0.08;
      flipper.rotation.z = -0.6 + Math.abs(Math.sin(e * 3 + ph)) * 1.4;
    });
  });
}

// ── Shadowbirds — fast colourful birds streaking across the sky ───────
function buildShadowbirds(ctx: WorldContext) {
  const COUNT = ctx.perf.reduced ? 14 : 28;
  const geo = new THREE.ConeGeometry(0.16, 0.8, 4); geo.rotateX(Math.PI / 2);
  const cols = [0xff3b6a, 0x35e0a0, 0x6ab0ff, 0xffcf6a, 0xc06bff];
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), COUNT);
  const seeds = Array.from({ length: COUNT }, () => ({ r: rr(16, 55), a: rr(0, Math.PI * 2), y: rr(16, 42), sp: rr(0.25, 0.55), tilt: rr(-0.3, 0.3) }));
  const col = new THREE.Color(); for (let i = 0; i < COUNT; i++) inst.setColorAt(i, col.setHex(cols[i % cols.length]));
  const d = new THREE.Object3D();
  ctx.onUpdate((_dt, e) => {
    for (let i = 0; i < COUNT; i++) { const s = seeds[i]; const a = s.a + e * s.sp; const x = Math.cos(a) * s.r, z = Math.sin(a) * s.r, y = s.y + Math.sin(e * 1.5 + i) * 2.2; d.position.set(x, y, z); d.rotation.set(s.tilt, -a + Math.PI / 2, Math.sin(e * 6 + i) * 0.5); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); }
    inst.instanceMatrix.needsUpdate = true;
  });
  inst.frustumCulled = false; ctx.scene.add(inst);
}

// ── Market stalls with awnings + relaxing benches on the square ───────
function buildMarket(ctx: WorldContext) {
  const awn = [0xd83a3a, 0x3a8ad8, 0x3aa85a, 0xd8a83a];
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 1 });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI + 0.5 + i * 0.5, rad = 14;    // along the town side of the square
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(-x, -z); ctx.scene.add(g);
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.0), wood); table.position.y = 0.45; g.add(table);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 1.4), new THREE.MeshStandardMaterial({ color: awn[i % awn.length], roughness: 0.9 })); awning.position.set(0, 2.1, 0); awning.rotation.x = 0.2; g.add(awning);
    for (const px of [-1.1, 1.1]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6), wood); pole.position.set(px, 1.05, 0.4); g.add(pole); }
    const lant = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), neon(0xffcf7a)); lant.position.set(0, 1.9, 0.5); g.add(lant);
    ctx.addCollider({ x, z, r: 1.2 });
  }
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4, x = Math.cos(a) * 8, z = Math.sin(a) * 8; const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.5), wood); b.position.set(x, 0.4, z); b.rotation.y = Math.atan2(-x, -z); ctx.scene.add(b); ctx.addSeat({ id: `bench${i}`, x, y: 0.55, z, yaw: Math.atan2(x, z) }); ctx.addCollider({ x, z, r: 0.5 }); }
}

// ── Love wall — glowing "მაქსი + სალიუსი = ♥" ─────────────────────────
function buildLoveWall(ctx: WorldContext) {
  const wx = -15, wz = -6;
  const g = new THREE.Group(); g.position.set(wx, 0, wz); g.rotation.y = Math.atan2(-wx, -wz) + Math.PI; ctx.scene.add(g);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.5), new THREE.MeshStandardMaterial({ color: 0x6a6152, roughness: 1 })); wall.position.y = 1.5; g.add(wall);
  const ivy = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.6, 0.55), new THREE.MeshStandardMaterial({ color: 0x2f5a34, roughness: 1 })); ivy.position.set(0, 2.9, 0); g.add(ivy);
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const cg = c.getContext('2d')!;
  cg.clearRect(0, 0, 512, 256); cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillStyle = '#ff6ab0'; cg.shadowColor = '#ff2d80'; cg.shadowBlur = 22;
  cg.font = 'bold 52px "Noto Sans Georgian","Segoe UI",sans-serif'; cg.fillText('მაქსი + სალიუსი', 256, 96);
  cg.font = 'bold 62px "Noto Sans Georgian",sans-serif'; cg.fillText('= ♥', 256, 180);
  const tex = new THREE.CanvasTexture(c);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  sign.position.set(0, 1.6, 0.28); g.add(sign);
  ctx.addCollider({ x: wx, z: wz, r: 1.6 });
}

// ── Central fountain ──────────────────────────────────────────────────
function buildFountain(ctx: WorldContext) {
  const g = new THREE.Group(); g.position.set(0, 0, -2); ctx.scene.add(g);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.6, 20), new THREE.MeshStandardMaterial({ color: 0xa89a7c, roughness: 0.9 })); basin.position.y = 0.3; g.add(basin);
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshStandardMaterial({ color: 0x3aa8c8, transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.4, emissive: 0x1a6a80, emissiveIntensity: 0.4 })); water.rotation.x = -Math.PI / 2; water.position.y = 0.58; g.add(water);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.6, 12), new THREE.MeshStandardMaterial({ color: 0xa89a7c, roughness: 1 })); col.position.y = 1.3; g.add(col);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), neon(0x9fe0ff)); top.position.y = 2.2; g.add(top);
  ctx.addCollider({ x: 0, z: -2, r: 2.6 });
}

// ── Swim zones + docked boats ─────────────────────────────────────────
function buildSwim(ctx: WorldContext) {
  for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2; ctx.addSwimZone({ x: Math.cos(a) * (PLAZA_R + 4), z: Math.sin(a) * (PLAZA_R + 4), r: 5.5, waterY: -0.9 }); }
  ctx.addSwimZone({ x: 0, z: PLAZA_R + 18, r: 9, waterY: -0.9 });
  ctx.addVehicle({ id: 'boat1', kind: 'boat', x: 4.6, z: PLAZA_R + 12, yaw: 0 });
  ctx.addVehicle({ id: 'jetski1', kind: 'jetski', x: -4.6, z: PLAZA_R + 11, yaw: 0 });
}

// ── Keep players on the square + pier ─────────────────────────────────
function buildBoundary(ctx: WorldContext) {
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2, x = Math.cos(a) * (PLAZA_R - 0.3), z = Math.sin(a) * (PLAZA_R - 0.3); if (z > PLAZA_R - 5 && Math.abs(x) < 3.2) continue; ctx.addCollider({ x, z, r: 1.1 }); }
  for (let z = PLAZA_R; z <= PLAZA_R + 13; z += 1.5) { ctx.addCollider({ x: -2.4, z, r: 0.5 }); ctx.addCollider({ x: 2.4, z, r: 0.5 }); }
}
