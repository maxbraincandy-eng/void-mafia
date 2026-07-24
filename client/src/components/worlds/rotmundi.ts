// ── Premium World: Rotmundi ───────────────────────────────────────────
// A peaceful seaport town of friendly sea spirits. A round stone harbour
// square opens onto a lagoon where ghostly white seals bob and wave; colourful
// "shadowbirds" streak across the sky; a tiered old city, a castle and a
// lighthouse ring the bay; a pier reaches out with fishing spots and moored
// boats. Day/night + weather via the shared atmosphere system. Swim in the
// lagoon, ride a boat, sit by the love wall.
import * as THREE from 'three';
import type { WorldDef, WorldContext } from './types';
import { tNow } from '@/store/langStore';
import { setupAtmosphere, MOODS_SEA } from './atmosphere';

const PLAZA_R = 20;
let _s = 330077;
function rnd() { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967295; }
function rr(a: number, b: number) { return a + (b - a) * rnd(); }
const _neon = new Map<number, THREE.MeshBasicMaterial>();
function neon(c: number) { let m = _neon.get(c); if (!m) { m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false }); _neon.set(c, m); } return m; }

const ATM: { setAmp?: (v: number) => void } = {};

let _winTex: THREE.Texture | null = null;
function windowTexture(): THREE.Texture {
  if (_winTex) return _winTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d')!;
  g.fillStyle = '#0a0806'; g.fillRect(0, 0, 64, 128);
  const cols = ['#ffd98a', '#ffe8b0', '#ffbe7a', '#ffcf9a'];
  for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 9) if (rnd() < 0.5) { g.fillStyle = cols[(rnd() * cols.length) | 0]; g.globalAlpha = 0.5 + rnd() * 0.5; g.fillRect(x, y, 5, 5); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 5); _winTex = t; return t;
}

export const rotmundi: WorldDef = {
  id: 'rotmundi',
  name: 'Rotmundi',
  subtitle: 'პორტ ქალაქი · სელაპები · ხმა',
  icon: '⚓',
  status: 'live',
  spawn: { x: 0, z: -3, yaw: Math.PI },
  fog: { color: 0x9fb4d0, density: 0.009 },
  clear: 0x9fc0dc,

  build(ctx: WorldContext) {
    _s = 330077; _neon.clear();
    const sky = buildSky(ctx);
    buildLagoon(ctx);
    buildPlaza(ctx);
    buildCity(ctx);
    buildCastle(ctx);
    buildLighthouse(ctx);
    buildPier(ctx);
    buildGhostSeals(ctx);
    buildShadowbirds(ctx);
    buildMarket(ctx);
    buildLoveWall(ctx);
    buildFountain(ctx);
    buildShipwrecks(ctx);
    buildSwim(ctx);
    buildBoundary(ctx);

    (ctx.scene.fog as any).userData = { base: 0.009 };
    setupAtmosphere(ctx, { sky, moods: MOODS_SEA, cycle: 260, onAmp: (v) => ATM.setAmp?.(v) });

    ctx.addAmbient({ kind: 'ocean', x: 0, z: 30, radius: 70 });
    ctx.addAmbient({ kind: 'wind', x: 0, z: 0, radius: 120 });
    ctx.addAmbient({ kind: 'night', x: 0, z: 0, radius: 120 });
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
  const N = 380; const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const u = rnd() * Math.PI * 2, v = rnd() * 0.45 + 0.1, r = 320; arr[i * 3] = Math.cos(u) * Math.cos(v) * r; arr[i * 3 + 1] = Math.sin(v) * r; arr[i * 3 + 2] = Math.sin(u) * Math.cos(v) * r; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, sizeAttenuation: false, transparent: true, opacity: 0.0, fog: false }));
  ctx.scene.add(stars);
  ctx.onUpdate((_d, e) => { (stars.material as THREE.PointsMaterial).opacity = Math.max(0, Math.sin(e / 260 * Math.PI * 2 - 1.2)) * 0.7; });
  return { top: uniforms.top.value, mid: uniforms.mid.value, bot: uniforms.bot.value };
}

// ── Lagoon water (animated) + swim amplitude hook ─────────────────────
function buildLagoon(ctx: WorldContext) {
  const geo = new THREE.PlaneGeometry(560, 560, 64, 64);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a5a78, roughness: 0.2, metalness: 0.5 });
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

// ── Round stone harbour square (walkable) ─────────────────────────────
function buildPlaza(ctx: WorldContext) {
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(PLAZA_R, PLAZA_R, 0.5, 48), new THREE.MeshStandardMaterial({ color: 0x8a8172, roughness: 0.9 }));
  plaza.position.y = -0.2; plaza.receiveShadow = true; ctx.scene.add(plaza);
  // cobble rings
  for (const r of [7, 13, 18]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 6, 60), new THREE.MeshStandardMaterial({ color: 0x6a6255, roughness: 1 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; ctx.scene.add(ring); }
  // quay wall around the edge (with a south gap for the pier)
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6f6656, roughness: 1 });
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2, x = Math.cos(a) * PLAZA_R, z = Math.sin(a) * PLAZA_R;
    if (z > PLAZA_R - 4 && Math.abs(x) < 3) continue; // south pier gap
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), wallMat); post.position.set(x, 0.25, z); ctx.scene.add(post);
  }
}

// ── Tiered old city rising behind & around the bay ────────────────────
function buildCity(ctx: WorldContext) {
  const COUNT = ctx.perf.reduced ? 70 : 150;
  const mat = new THREE.MeshStandardMaterial({ color: 0x6a4a34, roughness: 1, emissive: 0xffffff, emissiveMap: windowTexture(), emissiveIntensity: 0.75 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: 1 });
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, COUNT);
  const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(0.8, 0.9, 4), roofMat, COUNT);
  const d = new THREE.Object3D(); const c = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    // ring around the bay, denser to the north (behind), rising up a hill
    const a = rr(-2.3, 2.3) + (rnd() < 0.5 ? Math.PI : 0) * 0; // bias to back arc
    const ang = rr(Math.PI * 0.15, Math.PI * 0.85) + (rnd() < 0.4 ? -Math.PI * 0.7 : 0);
    const rad = rr(PLAZA_R + 6, PLAZA_R + 70);
    const hill = Math.max(0, (rad - PLAZA_R - 6) * 0.18);   // terraces climb with distance
    const h = rr(3, 9), w = rr(2.6, 5);
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad - 14;  // shove the city toward -z (behind)
    d.position.set(x, hill + h / 2 - 1, z); d.scale.set(w, h, w); d.rotation.set(0, rnd() * Math.PI, 0); d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
    const g = rr(0.7, 1.15); c.setRGB(0.42 * g, 0.3 * g, 0.22 * g); inst.setColorAt(i, c);
    d.position.set(x, hill + h - 1 + 0.4, z); d.scale.set(w * 1.15, 1, w * 1.15); d.rotation.y += Math.PI / 4; d.updateMatrix(); roofs.setMatrixAt(i, d.matrix);
    void a;
  }
  inst.instanceMatrix.needsUpdate = true; roofs.instanceMatrix.needsUpdate = true; inst.frustumCulled = false; roofs.frustumCulled = false;
  ctx.scene.add(inst); ctx.scene.add(roofs);
}

// ── Castle on the hill (cluster of towers) ────────────────────────────
function buildCastle(ctx: WorldContext) {
  const g = new THREE.Group(); g.position.set(-18, 0, -52); ctx.scene.add(g);
  const stone = new THREE.MeshStandardMaterial({ color: 0x8f8672, roughness: 1 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x2f5a8a, roughness: 0.8 });
  const keep = new THREE.Mesh(new THREE.BoxGeometry(9, 12, 9), stone); keep.position.y = 6; g.add(keep);
  for (const [tx, tz, th] of [[-5.5, -5.5, 16], [5.5, -5.5, 16], [-5.5, 5.5, 14], [5.5, 5.5, 14]] as const) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.3, th, 10), stone); tower.position.set(tx, th / 2, tz); g.add(tower);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 4, 10), roof); cone.position.set(tx, th + 2, tz); g.add(cone);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), neon(0x9b5cff)); flag.position.set(tx + 0.7, th + 4.5, tz); g.add(flag);
  }
  const gate = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 0.5), new THREE.MeshStandardMaterial({ color: 0x3a2716, roughness: 1 })); gate.position.set(0, 2, 4.6); g.add(gate);
}

// ── Lighthouse on a rock, with a sweeping beam ────────────────────────
function buildLighthouse(ctx: WorldContext) {
  const g = new THREE.Group(); g.position.set(40, 0, 18); ctx.scene.add(g);
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 3, 10), new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 1 })); rock.position.y = -0.5; g.add(rock);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.0, 12, 14), new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.7 })); tower.position.y = 7; g.add(tower);
  for (let i = 0; i < 3; i++) { const band = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 1.2, 14), new THREE.MeshStandardMaterial({ color: 0xd83a3a, roughness: 0.7 })); band.position.y = 3 + i * 3.2; g.add(band); }
  const room = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 1.6, 12), neon(0xffe6a0)); room.position.y = 13.4; g.add(room);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2, 1.6, 12), new THREE.MeshStandardMaterial({ color: 0x2a2e3a, metalness: 0.6, roughness: 0.4 })); cap.position.y = 15; g.add(cap);
  const lamp = new THREE.PointLight(0xffe6a0, 1.6, 40, 2); lamp.position.set(40, 13.4, 18); ctx.scene.add(lamp);
  // sweeping beam
  const beam = new THREE.Mesh(new THREE.ConeGeometry(3.2, 46, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.09, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
  beam.rotation.z = Math.PI / 2; beam.position.set(40, 13.4, 18); ctx.scene.add(beam);
  ctx.onUpdate((_d, e) => { beam.rotation.y = e * 0.6; lamp.intensity = 1.4 + Math.sin(e * 3) * 0.2; });
}

// ── Main pier reaching south with fishing spots + moored boats ────────
function buildPier(ctx: WorldContext) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a2716, roughness: 1 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.25, 16), wood); deck.position.set(0, -0.05, PLAZA_R + 5); deck.receiveShadow = true; ctx.scene.add(deck);
  for (let z = PLAZA_R; z <= PLAZA_R + 13; z += 2.2) for (const sx of [-2.2, 2.2]) { const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 2.4, 6), dark); pile.position.set(sx, -1.1, z); ctx.scene.add(pile); ctx.addCollider({ x: sx, z, r: 0.3 }); }
  // fishing spots (seats facing the water) at the pier end
  for (const sx of [-1.4, 1.4]) ctx.addSeat({ id: `fish${sx}`, x: sx, y: 0.45, z: PLAZA_R + 12, yaw: Math.atan2(sx - 0, (PLAZA_R + 12) - (PLAZA_R + 40)) });
  // a bell buoy + lantern posts
  for (let z = PLAZA_R + 2; z <= PLAZA_R + 12; z += 5) for (const sx of [-2.4, 2.4]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), dark); post.position.set(sx, 0.7, z); ctx.scene.add(post); const lant = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), neon(0xffcf7a)); lant.position.set(sx, 1.5, z); ctx.scene.add(lant); }
}

// ── Friendly ghost seals — translucent, bobbing, waving a flipper ─────
function buildGhostSeals(ctx: WorldContext) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeaf4ff, roughness: 0.6, transparent: true, opacity: 0.82, emissive: 0x6a9ac0, emissiveIntensity: 0.35 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a2230, toneMapped: false });
  const spots: Array<[number, number]> = [[-4, PLAZA_R + 7], [5, PLAZA_R + 9], [-8, PLAZA_R + 12], [9, PLAZA_R + 14], [0, PLAZA_R + 16]];
  spots.forEach(([x, z], i) => {
    const g = new THREE.Group(); g.position.set(x, -0.7, z); g.rotation.y = Math.atan2(-x, -(z)); ctx.scene.add(g);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 12), bodyMat); body.scale.set(1, 1.15, 1.5); body.position.y = 0.3; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), bodyMat); head.position.set(0, 0.85, -0.55); g.add(head);
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), bodyMat); snout.position.set(0, 0.75, -0.9); snout.scale.set(1, 0.8, 1.1); g.add(snout);
    for (const ex of [-0.16, 0.16]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMat); eye.position.set(ex, 0.92, -0.85); g.add(eye); }
    const flipper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.34), bodyMat); flipper.position.set(0.55, 0.4, 0.1); g.add(flipper);
    const ph = i * 1.3;
    ctx.onUpdate((_d, e) => {
      g.position.y = -0.7 + Math.sin(e * 1.3 + ph) * 0.14;                    // bob
      g.rotation.z = Math.sin(e * 1.0 + ph) * 0.08;
      flipper.rotation.z = -0.6 + Math.abs(Math.sin(e * 3 + ph)) * 1.4;        // wave!
    });
  });
}

// ── Shadowbirds — fast colourful birds streaking across the sky ───────
function buildShadowbirds(ctx: WorldContext) {
  const COUNT = ctx.perf.reduced ? 14 : 30;
  const geo = new THREE.ConeGeometry(0.18, 0.9, 4); geo.rotateX(Math.PI / 2);
  const cols = [0xff3b6a, 0x35e0a0, 0x6ab0ff, 0xffcf6a, 0xc06bff];
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ vertexColors: false, toneMapped: false }), COUNT);
  const seeds = Array.from({ length: COUNT }, () => ({ r: rr(18, 60), a: rr(0, Math.PI * 2), y: rr(14, 40), sp: rr(0.25, 0.6), tilt: rr(-0.3, 0.3) }));
  const col = new THREE.Color(); for (let i = 0; i < COUNT; i++) inst.setColorAt(i, col.setHex(cols[i % cols.length]));
  const d = new THREE.Object3D();
  ctx.onUpdate((_dt, e) => {
    for (let i = 0; i < COUNT; i++) {
      const s = seeds[i]; const a = s.a + e * s.sp;
      const x = Math.cos(a) * s.r, z = Math.sin(a) * s.r - 8, y = s.y + Math.sin(e * 1.5 + i) * 2;
      d.position.set(x, y, z); d.rotation.set(s.tilt, -a + Math.PI / 2, Math.sin(e * 6 + i) * 0.5); d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });
  inst.frustumCulled = false; ctx.scene.add(inst);
}

// ── Market district — stalls with awnings + relax benches ─────────────
function buildMarket(ctx: WorldContext) {
  const awn = [0xd83a3a, 0x3a8ad8, 0x3aa85a, 0xd8a83a];
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 1 });
  for (let i = 0; i < 5; i++) {
    const a = -2.4 + i * 0.55, rad = 13;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad - 4;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(-x, -(z + 4)); ctx.scene.add(g);
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.0), wood); table.position.y = 0.45; g.add(table);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 1.4), new THREE.MeshStandardMaterial({ color: awn[i % awn.length], roughness: 0.9 })); awning.position.set(0, 2.1, 0); awning.rotation.x = 0.2; g.add(awning);
    for (const px of [-1.1, 1.1]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6), wood); pole.position.set(px, 1.05, 0.4); g.add(pole); }
    const lant = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), neon(0xffcf7a)); lant.position.set(0, 1.9, 0.5); g.add(lant);
    ctx.addCollider({ x, z, r: 1.2 });
  }
  // relax benches around the plaza
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4, x = Math.cos(a) * 9, z = Math.sin(a) * 9; const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.5), wood); b.position.set(x, 0.4, z); b.rotation.y = Math.atan2(-x, -z); ctx.scene.add(b); ctx.addSeat({ id: `bench${i}`, x, y: 0.55, z, yaw: Math.atan2(x, z) }); ctx.addCollider({ x, z, r: 0.5 }); }
}

// ── Love wall — glowing "მაქსი + სალიუსი = ♥" ─────────────────────────
function buildLoveWall(ctx: WorldContext) {
  const wx = -14, wz = 2;
  const g = new THREE.Group(); g.position.set(wx, 0, wz); g.rotation.y = Math.atan2(-wx, -wz); ctx.scene.add(g);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.5), new THREE.MeshStandardMaterial({ color: 0x5a5248, roughness: 1 })); wall.position.y = 1.5; g.add(wall);
  const ivy = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.6, 0.55), new THREE.MeshStandardMaterial({ color: 0x2f5a34, roughness: 1 })); ivy.position.set(0, 2.9, 0); g.add(ivy);
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const cg = c.getContext('2d')!;
  cg.clearRect(0, 0, 512, 256);
  cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillStyle = '#ff6ab0'; cg.shadowColor = '#ff2d80'; cg.shadowBlur = 22;
  cg.font = 'bold 52px "Noto Sans Georgian","Segoe UI",sans-serif';
  cg.fillText('მაქსი + სალიუსი', 256, 96);
  cg.font = 'bold 60px "Noto Sans Georgian",sans-serif';
  cg.fillText('= ♥', 256, 178);
  const tex = new THREE.CanvasTexture(c);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  sign.position.set(0, 1.6, 0.28); g.add(sign);
  ctx.addCollider({ x: wx, z: wz, r: 1.6 });
}

// ── Central fountain ──────────────────────────────────────────────────
function buildFountain(ctx: WorldContext) {
  const g = new THREE.Group(); ctx.scene.add(g);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.6, 20), new THREE.MeshStandardMaterial({ color: 0x7a7264, roughness: 0.9 })); basin.position.y = 0.3; g.add(basin);
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshStandardMaterial({ color: 0x3aa8c8, transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.4, emissive: 0x1a6a80, emissiveIntensity: 0.4 })); water.rotation.x = -Math.PI / 2; water.position.y = 0.58; g.add(water);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.6, 12), new THREE.MeshStandardMaterial({ color: 0x7a7264, roughness: 1 })); col.position.y = 1.3; g.add(col);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), neon(0x9fe0ff)); top.position.y = 2.2; g.add(top);
  ctx.addCollider({ x: 0, z: 0, r: 2.6 });
}

// ── Old ship graveyard silhouettes out in the bay ─────────────────────
function buildShipwrecks(ctx: WorldContext) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 });
  for (const [x, z, ry] of [[-34, 34, 0.5], [30, 40, -0.6], [-46, 8, 1.2]] as const) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; g.rotation.z = 0.12; ctx.scene.add(g);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 10), wood); hull.position.y = -0.3; g.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 9, 6), wood); mast.position.set(0, 4, 0); mast.rotation.z = 0.15; g.add(mast);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(3, 4), new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })); sail.position.set(0, 4.5, 0); g.add(sail);
  }
}

// ── Swim zones + docked boats ─────────────────────────────────────────
function buildSwim(ctx: WorldContext) {
  // a ring of swim zones just outside the quay so you can dive off the pier
  for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2; ctx.addSwimZone({ x: Math.cos(a) * (PLAZA_R + 4), z: Math.sin(a) * (PLAZA_R + 4), r: 5.5, waterY: -0.9 }); }
  ctx.addSwimZone({ x: 0, z: PLAZA_R + 16, r: 8, waterY: -0.9 }); // deeper lagoon off the pier
  // moored boats at the pier end
  ctx.addVehicle({ id: 'boat1', kind: 'boat', x: 4.5, z: PLAZA_R + 12, yaw: 0 });
  ctx.addVehicle({ id: 'jetski1', kind: 'jetski', x: -4.5, z: PLAZA_R + 11, yaw: 0 });
}

// ── Keep players on the square + pier ─────────────────────────────────
function buildBoundary(ctx: WorldContext) {
  for (let i = 0; i < 46; i++) { const a = (i / 46) * Math.PI * 2, x = Math.cos(a) * (PLAZA_R - 0.3), z = Math.sin(a) * (PLAZA_R - 0.3); if (z > PLAZA_R - 4 && Math.abs(x) < 3) continue; ctx.addCollider({ x, z, r: 1.1 }); }
  // pier side rails
  for (let z = PLAZA_R; z <= PLAZA_R + 13; z += 1.5) { ctx.addCollider({ x: -2.4, z, r: 0.5 }); ctx.addCollider({ x: 2.4, z, r: 0.5 }); }
  void tNow;
}
