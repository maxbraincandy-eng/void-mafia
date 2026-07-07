// ── Premium World: Beach Camp 3D ──────────────────────────────────────
// A nighttime tropical beach built around a central campfire. Everything is
// procedural (no asset downloads) but styled for the highest visual bar in
// Void Mafia: animated moonlit ocean, dynamic firelight, swaying palms,
// lanterns, string lights, seating, drifting embers, and a carved DB Both sign.
import * as THREE from 'three';
import type { WorldDef, WorldContext, WorldSeat } from './types';

const SEA_Z = -30;          // shoreline sits around here
const WORLD_R = 34;         // playable radius

// Deterministic scatter so the layout is stable between sessions.
let _s = 20260707;
function rnd() { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967295; }
function rrng(a: number, b: number) { return a + (b - a) * rnd(); }

export const beachCamp: WorldDef = {
  id: 'beach_camp',
  name: 'Beach Camp 3D',
  subtitle: 'ღამის ტროპიკული სანაპირო · კოცონი · ხმა',
  icon: '🔥',
  status: 'live',
  spawn: { x: 0, z: 8.5, yaw: 0 },
  fog: { color: 0x0a1626, density: 0.017 },
  clear: 0x060b16,

  build(ctx: WorldContext) {
    _s = 20260707;
    const { scene } = ctx;

    buildSky(ctx);
    buildSand(ctx);
    buildOcean(ctx);
    buildCampfire(ctx);
    buildSeating(ctx);
    buildPalms(ctx);
    buildProps(ctx);
    buildStringLights(ctx);
    buildDbSign(ctx);
    buildFireworks(ctx);
    buildAirParticles(ctx);

    // ambient audio sources — ocean is faint far away and swells toward the
    // shore (steep radius); fire is quiet and local (only near it you hear pops).
    ctx.addAmbient({ kind: 'ocean', x: 0, z: SEA_Z, radius: 46 });
    ctx.addAmbient({ kind: 'fire', x: 0, z: 0, radius: 11 });
    ctx.addAmbient({ kind: 'wind', x: 0, z: 0, radius: 100 });
    ctx.addAmbient({ kind: 'night', x: 0, z: 0, radius: 100 });

    void scene;
  },
};

// ── Sky: gradient dome + stars + moon + clouds ────────────────────────
function buildSky(ctx: WorldContext) {
  const { scene } = ctx;
  const geo = new THREE.SphereGeometry(200, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x030713) }, bot: { value: new THREE.Color(0x14243f) } },
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 bot; void main(){ float h=clamp((normalize(vP).y+0.15)/0.9,0.0,1.0); gl_FragColor=vec4(mix(bot,top,h),1.0); }',
  });
  scene.add(new THREE.Mesh(geo, mat));

  // stars
  const N = 900; const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = rnd() * Math.PI * 2, v = rnd() * 0.5 + 0.05, r = 190;
    arr[i * 3] = Math.cos(u) * Math.cos(v) * r;
    arr[i * 3 + 1] = Math.sin(v) * r;
    arr[i * 3 + 2] = Math.sin(u) * Math.cos(v) * r;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 0.9, sizeAttenuation: true, transparent: true, opacity: 0.9, fog: false }));
  scene.add(stars);
  ctx.onUpdate((_d, e) => { stars.rotation.y = e * 0.004; (stars.material as THREE.PointsMaterial).opacity = 0.7 + Math.sin(e * 0.7) * 0.15; });

  // moon + glow
  const moonMesh = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xf4f6ff, fog: false }));
  moonMesh.position.set(-30, 70, -170);
  scene.add(moonMesh);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(0xbcd0ff), transparent: true, opacity: 0.6, depthWrite: false, fog: false }));
  glow.position.copy(moonMesh.position); glow.scale.setScalar(46);
  scene.add(glow);

  // soft clouds
  const cloudTex = cloudTexture();
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0x2a3550, transparent: true, opacity: rrng(0.25, 0.5), depthWrite: false, fog: false }));
    s.position.set(rrng(-140, 140), rrng(40, 90), -170);
    s.scale.set(rrng(60, 110), rrng(24, 40), 1);
    scene.add(s);
    ctx.onUpdate((d) => { s.position.x += d * 0.4; if (s.position.x > 160) s.position.x = -160; });
  }
}

// ── Sand ──────────────────────────────────────────────────────────────
function buildSand(ctx: WorldContext) {
  const tex = sandTexture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(18, 18);
  const geo = new THREE.PlaneGeometry(160, 160, 40, 40);
  // gentle dunes
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const d = Math.hypot(x, y);
    p.setZ(i, Math.sin(x * 0.08) * 0.12 + Math.cos(y * 0.09) * 0.12 + Math.max(0, (d - 40) * 0.05));
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0xb99a6c, roughness: 1, metalness: 0 });
  const sand = new THREE.Mesh(geo, mat);
  sand.rotation.x = -Math.PI / 2; sand.receiveShadow = true;
  ctx.scene.add(sand);
}

// ── Ocean: animated waves + moonlight streak ──────────────────────────
function buildOcean(ctx: WorldContext) {
  const geo = new THREE.PlaneGeometry(220, 120, 44, 26);
  const mat = new THREE.MeshStandardMaterial({ color: 0x0b2a44, roughness: 0.22, metalness: 0.5, transparent: true, opacity: 0.96 });
  const sea = new THREE.Mesh(geo, mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.15, SEA_Z - 55);
  ctx.scene.add(sea);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const base = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) base[i] = p.getZ(i);
  let nf = 0;
  ctx.onUpdate((_d, e) => {
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      p.setZ(i, base[i] + Math.sin(x * 0.12 + e * 1.1) * 0.35 + Math.cos(y * 0.14 + e * 0.9) * 0.3 + Math.sin((x + y) * 0.08 + e * 1.6) * 0.15);
    }
    p.needsUpdate = true;
    // Normal recompute is the costly part — do it every frame normally, every
    // 3rd frame when the engine reports it's under load.
    if (!ctx.perf.reduced || (++nf % 3 === 0)) geo.computeVertexNormals();
  });

  // moonlight reflection streak on the water
  const streak = new THREE.Mesh(new THREE.PlaneGeometry(9, 70), new THREE.MeshBasicMaterial({ map: radialTexture(0xdfeaff, true), transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  streak.rotation.x = -Math.PI / 2; streak.position.set(-4, -0.05, SEA_Z - 25);
  ctx.scene.add(streak);
  ctx.onUpdate((_d, e) => { (streak.material as THREE.MeshBasicMaterial).opacity = 0.32 + Math.sin(e * 1.4) * 0.08; });

  // foam line at the shore
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(200, 6), new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.28, depthWrite: false }));
  foam.rotation.x = -Math.PI / 2; foam.position.set(0, 0.02, SEA_Z + 2);
  ctx.scene.add(foam);
  ctx.onUpdate((_d, e) => { foam.position.z = SEA_Z + 2 + Math.sin(e * 0.6) * 1.4; (foam.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.abs(Math.sin(e * 0.6)) * 0.18; });
}

// ── Campfire: flames, light, embers, sparks, smoke ────────────────────
function buildCampfire(ctx: WorldContext) {
  const g = new THREE.Group();
  ctx.scene.add(g);
  // stone ring — one InstancedMesh
  const ringDummy = new THREE.Object3D();
  const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1), new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 1 }), 9);
  stones.castShadow = true; stones.receiveShadow = true;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2; const r = rrng(0.28, 0.4);
    ringDummy.position.set(Math.cos(a) * 1.15, 0.18, Math.sin(a) * 1.15); ringDummy.scale.setScalar(r); ringDummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    ringDummy.updateMatrix(); stones.setMatrixAt(i, ringDummy.matrix);
  }
  stones.instanceMatrix.needsUpdate = true; g.add(stones);
  // logs
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x3a2415, roughness: 1 }));
    log.position.set(Math.cos(a) * 0.35, 0.35, Math.sin(a) * 0.35);
    log.rotation.z = Math.PI / 2 - 0.5; log.rotation.y = a; log.castShadow = true;
    g.add(log);
  }
  // flame — stacked additive cones
  const flame = new THREE.Group(); flame.position.y = 0.35; g.add(flame);
  const cones: THREE.Mesh[] = [];
  const cols = [0xffcc33, 0xff8a1e, 0xff5a10];
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.5 - i * 0.12, 1.4 - i * 0.3, 10), new THREE.MeshBasicMaterial({ color: cols[i], transparent: true, opacity: 0.7 - i * 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    c.position.y = 0.6 - i * 0.12; flame.add(c); cones.push(c);
  }
  // dynamic firelight
  const light = new THREE.PointLight(0xff7b2e, 3.4, 18, 2); light.position.set(0, 1.1, 0);
  light.castShadow = true; light.shadow.mapSize.set(512, 512);
  g.add(light);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(0xff8a3a), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.y = 0.7; glow.scale.setScalar(4); g.add(glow);

  // embers + sparks
  const EN = 60; const ep = new Float32Array(EN * 3); const ev: number[] = [];
  for (let i = 0; i < EN; i++) { ep[i * 3] = rrng(-0.3, 0.3); ep[i * 3 + 1] = rrng(0.3, 1.2); ep[i * 3 + 2] = rrng(-0.3, 0.3); ev.push(rrng(0.6, 1.8)); }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  const embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xffb257, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(embers);

  // smoke
  const smokeTex = radialTexture(0x223041);
  const smokes: THREE.Sprite[] = [];
  for (let i = 0; i < 5; i++) {
    const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x2a3444, transparent: true, opacity: 0.0, depthWrite: false }));
    sm.position.set(rrng(-0.2, 0.2), rrng(1.5, 3), rrng(-0.2, 0.2)); sm.scale.setScalar(rrng(1.5, 2.6)); g.add(sm); smokes.push(sm);
  }

  ctx.addCollider({ x: 0, z: 0, r: 1.5 });

  // Toss something on the fire → a brief flare + shower of sparks (networked).
  let flareUntil = 0;
  ctx.addInteractable({ id: 'fire_toss', x: 0, z: 0, r: 2.9, label: '🔥 ცეცხლში ჩააგდე', effect: () => { flareUntil = performance.now() + 900; } });

  ctx.onUpdate((d, e) => {
    const flaring = performance.now() < flareUntil;
    const fl = 0.8 + Math.sin(e * 22) * 0.12 + Math.sin(e * 37) * 0.08;
    light.intensity = (flaring ? 7.5 : 3.0) * fl + Math.random() * 0.4;
    const fls = flaring ? 1.5 : 1;
    flame.scale.set((0.9 + Math.sin(e * 18) * 0.08) * fls, fl * fls, (0.9 + Math.cos(e * 15) * 0.08) * fls);
    cones.forEach((c, i) => { c.rotation.y = e * (1.5 + i); });
    (glow.material as THREE.SpriteMaterial).opacity = (0.4 + fl * 0.2) * (flaring ? 1.8 : 1);
    // embers rise + recycle (faster + wider during a flare)
    const pa = eg.attributes.position as THREE.BufferAttribute;
    const vmul = flaring ? 3.2 : 1, spread = flaring ? 0.6 : 0.3;
    for (let i = 0; i < EN; i++) {
      let y = pa.getY(i) + ev[i] * vmul * d;
      let x = pa.getX(i) + Math.sin(e * 2 + i) * 0.01;
      if (y > 3.2) { y = 0.3; x = rrng(-spread, spread); pa.setZ(i, rrng(-spread, spread)); }
      pa.setX(i, x); pa.setY(i, y);
    }
    pa.needsUpdate = true;
    // smoke drift
    for (const sm of smokes) {
      sm.position.y += d * 0.5; sm.position.x += d * 0.15; sm.scale.x = sm.scale.y += d * 0.25;
      const m = sm.material as THREE.SpriteMaterial;
      m.opacity = Math.max(0, 0.22 - (sm.position.y - 1.5) * 0.05);
      if (sm.position.y > 5) { sm.position.set(rrng(-0.2, 0.2), 1.5, rrng(-0.2, 0.2)); sm.scale.setScalar(rrng(1.5, 2.6)); }
    }
  });
}

// ── Seating around the fire ───────────────────────────────────────────
function buildSeating(ctx: WorldContext) {
  const seats: { r: number; a: number; kind: 'log' | 'stump' | 'cushion' | 'rock' }[] = [];
  const kinds: ('log' | 'stump' | 'cushion' | 'rock')[] = ['log', 'stump', 'cushion', 'rock', 'log', 'cushion', 'stump', 'rock'];
  for (let i = 0; i < 8; i++) seats.push({ r: 3.3, a: (i / 8) * Math.PI * 2 + 0.2, kind: kinds[i] });
  seats.forEach((s, i) => {
    const x = Math.cos(s.a) * s.r, z = Math.sin(s.a) * s.r;
    const yaw = Math.atan2(x, z); // face the fire
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; ctx.scene.add(g);
    let seatY = 0.35;
    if (s.kind === 'log') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.6, 10), new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 1 }));
      m.rotation.z = Math.PI / 2; m.position.y = 0.28; m.castShadow = true; m.receiveShadow = true; g.add(m); seatY = 0.56;
    } else if (s.kind === 'stump') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.6, 12), new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 1 }));
      m.position.y = 0.3; m.castShadow = true; m.receiveShadow = true; g.add(m); seatY = 0.6;
    } else if (s.kind === 'cushion') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.24, 0.8), new THREE.MeshStandardMaterial({ color: [0x7c3aed, 0x0ea5b7, 0xb91c1c][i % 3], roughness: 0.9 }));
      m.position.y = 0.13; m.castShadow = true; m.receiveShadow = true; g.add(m); seatY = 0.26;
    } else {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5), new THREE.MeshStandardMaterial({ color: 0x555049, roughness: 1 }));
      m.scale.y = 0.6; m.position.y = 0.3; m.castShadow = true; m.receiveShadow = true; g.add(m); seatY = 0.5;
    }
    ctx.addCollider({ x, z, r: 0.55 });
    const seat: WorldSeat = { id: `seat${i}`, x, y: seatY, z, yaw };
    ctx.addSeat(seat);
  });
}

// ── Palms ─────────────────────────────────────────────────────────────
function buildPalms(ctx: WorldContext) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4326, roughness: 1 });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x1f5a2e, roughness: 0.9, side: THREE.DoubleSide });
  const spots = [[-11, 3], [12, 1], [-14, -8], [15, -6], [-8, -12], [9, -14], [-18, 6], [18, 5]];
  for (const [x, z] of spots) {
    const g = new THREE.Group(); g.position.set(x, 0, z); ctx.scene.add(g);
    const lean = rrng(-0.18, 0.18);
    const h = rrng(4.5, 6.5);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, h, 8), trunkMat);
    trunk.position.y = h / 2; trunk.rotation.z = lean; trunk.castShadow = true; g.add(trunk);
    const crown = new THREE.Group(); crown.position.set(Math.sin(lean) * h, h, 0); g.add(crown);
    const fronds: THREE.Mesh[] = [];
    for (let f = 0; f < 7; f++) {
      const fr = new THREE.Mesh(new THREE.ConeGeometry(0.28, 3.2, 4), frondMat);
      fr.rotation.z = Math.PI / 2 - 0.5; fr.rotation.y = (f / 7) * Math.PI * 2;
      fr.position.set(Math.cos((f / 7) * Math.PI * 2) * 1.5, 0, Math.sin((f / 7) * Math.PI * 2) * 1.5);
      fr.castShadow = true; crown.add(fr); fronds.push(fr);
    }
    ctx.addCollider({ x, z, r: 0.5 });
    const ph = rnd() * 6;
    ctx.onUpdate((_d, e) => { crown.rotation.z = Math.sin(e * 0.8 + ph) * 0.04; fronds.forEach((fr, i) => { fr.rotation.x = Math.sin(e * 1.3 + i + ph) * 0.08; }); });
  }
}

// ── Rocks, driftwood, lanterns, plants ────────────────────────────────
function buildProps(ctx: WorldContext) {
  const dummy = new THREE.Object3D();

  // rocks — one InstancedMesh (12 draw calls → 1)
  const rockData: { x: number; z: number; r: number; rx: number; ry: number; rz: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const x = rrng(-24, 24), z = rrng(-26, 12);
    if (Math.hypot(x, z) < 4) continue;
    rockData.push({ x, z, r: rrng(0.4, 1.3), rx: rnd() * 3, ry: rnd() * 3, rz: rnd() * 3 });
  }
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1), new THREE.MeshStandardMaterial({ color: 0x4c4842, roughness: 1 }), rockData.length);
  rocks.castShadow = true; rocks.receiveShadow = true;
  rockData.forEach((rk, i) => {
    dummy.position.set(rk.x, rk.r * 0.5, rk.z); dummy.scale.set(rk.r, rk.r * 0.7, rk.r); dummy.rotation.set(rk.rx, rk.ry, rk.rz);
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
    ctx.addCollider({ x: rk.x, z: rk.z, r: rk.r * 0.8 });
  });
  rocks.instanceMatrix.needsUpdate = true; ctx.scene.add(rocks);

  // driftwood — one InstancedMesh
  const driftData: { x: number; z: number; l: number; ry: number; rz: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const x = rrng(-20, 20), z = rrng(-24, 6);
    if (Math.hypot(x, z) < 5) continue;
    driftData.push({ x, z, l: rrng(1.5, 3), ry: rnd() * Math.PI, rz: rrng(-0.3, 0.3) });
  }
  const drift = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.16, 1, 6), new THREE.MeshStandardMaterial({ color: 0x6b5636, roughness: 1 }), driftData.length);
  drift.castShadow = true;
  driftData.forEach((dw, i) => {
    dummy.position.set(dw.x, 0.15, dw.z); dummy.scale.set(1, dw.l, 1); dummy.rotation.set(Math.PI / 2, dw.ry, dw.rz);
    dummy.updateMatrix(); drift.setMatrixAt(i, dummy.matrix);
  });
  drift.instanceMatrix.needsUpdate = true; ctx.scene.add(drift);

  // beach plants — merged grass tuft, one InstancedMesh (110 draw calls → 1),
  // gentle per-instance sway (22 matrix writes/frame).
  const plants = new THREE.InstancedMesh(grassTuftGeo(), new THREE.MeshStandardMaterial({ color: 0x2c6b38, roughness: 0.9 }), 24);
  plants.castShadow = true;
  const plantSpots: { x: number; z: number; ph: number; s: number }[] = [];
  for (let i = 0; i < 24; i++) {
    const x = rrng(-26, 26), z = rrng(-26, 12);
    if (Math.hypot(x, z) < 3.5) continue;
    plantSpots.push({ x, z, ph: rnd() * 6, s: rrng(0.8, 1.4) });
  }
  plants.count = plantSpots.length;
  ctx.scene.add(plants);
  ctx.onUpdate((_d, e) => {
    for (let i = 0; i < plantSpots.length; i++) {
      const p = plantSpots[i];
      dummy.position.set(p.x, 0, p.z); dummy.scale.setScalar(p.s); dummy.rotation.set(0, 0, Math.sin(e * 1.5 + p.ph) * 0.13);
      dummy.updateMatrix(); plants.setMatrixAt(i, dummy.matrix);
    }
    plants.instanceMatrix.needsUpdate = true;
  });
  // lanterns (warm point lights, limited count)
  const lanternSpots = [[-4, 5], [4, 5], [-6, -3], [6, -3], [0, -7]];
  for (const [x, z] of lanternSpots) {
    const g = new THREE.Group(); g.position.set(x, 0, z); ctx.scene.add(g);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 }));
    post.position.y = 0.65; post.castShadow = true; g.add(post);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), new THREE.MeshStandardMaterial({ color: 0xffcf7a, emissive: 0xffb347, emissiveIntensity: 1.4, transparent: true, opacity: 0.85 }));
    glass.position.y = 1.35; g.add(glass);
    const l = new THREE.PointLight(0xffb45a, 1.1, 6, 2); l.position.y = 1.35; g.add(l);
    ctx.addCollider({ x, z, r: 0.3 });
    const ph = rnd() * 6;
    ctx.onUpdate((_d, e) => { l.intensity = 1.0 + Math.sin(e * 8 + ph) * 0.15; });
  }
}

// ── String lights strung between two palms ────────────────────────────
function buildStringLights(ctx: WorldContext) {
  const a = new THREE.Vector3(-11, 5, 3), b = new THREE.Vector3(12, 5.4, 1);
  const bulbs = 16;
  for (let i = 0; i <= bulbs; i++) {
    const t = i / bulbs;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const y = a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 1.4; // catenary sag
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffe6a8, emissive: 0xffcf7a, emissiveIntensity: 1.6 }));
    bulb.position.set(x, y, z); ctx.scene.add(bulb);
    const ph = i * 0.7;
    ctx.onUpdate((_d, e) => { (bulb.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.3 + Math.sin(e * 4 + ph) * 0.4; });
  }
}

// ── Carved driftwood sign near the camp ───────────────────────────────
function buildDbSign(ctx: WorldContext) {
  const g = new THREE.Group(); g.position.set(7.5, 0, 3.5); g.rotation.y = -0.6; ctx.scene.add(g);
  const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.7, 7), new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 1 }));
  post1.position.set(-0.52, 0.85, 0); post1.castShadow = true; g.add(post1);
  const post2 = post1.clone(); post2.position.x = 0.52; g.add(post2);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.9, 0.06), new THREE.MeshStandardMaterial({ map: dbSignTexture(), color: 0xffffff, roughness: 0.8, emissive: 0x3a2410, emissiveIntensity: 0.55 }));
  board.position.set(0, 1.25, 0.05); board.castShadow = true; g.add(board);
  const l = new THREE.PointLight(0xffcf7a, 0.7, 3.2, 2); l.position.set(0, 1.25, 0.6); g.add(l);
  ctx.addCollider({ x: 7.5, z: 3.5, r: 0.6 });
}

// ── Fireworks launcher over the ocean (interactable, networked) ───────
function buildFireworks(ctx: WorldContext) {
  const LX = -7, LZ = -19;
  const g = new THREE.Group(); g.position.set(LX, 0, LZ); ctx.scene.add(g);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.0, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 }));
  post.position.y = 0.5; post.castShadow = true; g.add(post);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.55, 8), new THREE.MeshStandardMaterial({ color: 0x7a2020, roughness: 0.8, emissive: 0x330808, emissiveIntensity: 0.6 }));
  tube.position.set(0, 1.05, 0); tube.rotation.z = 0.22; g.add(tube);
  ctx.addCollider({ x: LX, z: LZ, r: 0.4 });

  const MAX = 260;
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX), vx = new Float32Array(MAX), vy = new Float32Array(MAX), vz = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) pos[i * 3 + 1] = -80;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.32, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  ctx.scene.add(pts);
  let cursor = 0;

  const flash = new THREE.PointLight(0xffffff, 0, 55, 2); flash.position.set(0, 16, -45); ctx.scene.add(flash);
  let flashUntil = 0;

  const rocketMat = new THREE.SpriteMaterial({ map: radialTexture(0xfff2c0), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const rockets: { spr: THREE.Sprite; y: number; vy: number; x: number; z: number; color: THREE.Color; apex: number }[] = [];
  const palette = [0xff3b6b, 0x3ba0ff, 0x8aff3b, 0xffd23b, 0xc06bff, 0xff8a3b, 0xffffff];

  const burst = (x: number, y: number, z: number, color: THREE.Color) => {
    for (let k = 0; k < 48; k++) {
      const i = cursor; cursor = (cursor + 1) % MAX;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = 3 + Math.random() * 3.5;
      vx[i] = Math.sin(ph) * Math.cos(th) * sp; vy[i] = Math.cos(ph) * sp; vz[i] = Math.sin(ph) * Math.sin(th) * sp;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const c = color.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.25);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      life[i] = 1.5 + Math.random() * 0.7;
    }
    flash.position.set(x, y, z); flash.color.copy(color); flashUntil = performance.now() + 260;
  };

  ctx.addInteractable({
    id: 'firework', x: LX, z: LZ, r: 2.7, label: '🎆 გაუშვი ფეიერვერკი',
    effect: () => {
      const color = new THREE.Color(palette[Math.floor(Math.random() * palette.length)]);
      const tx = -8 + (Math.random() - 0.5) * 30, tz = -42 + (Math.random() - 0.5) * 18;
      const spr = new THREE.Sprite(rocketMat); spr.scale.setScalar(0.55); spr.position.set(tx, 1.4, tz); ctx.scene.add(spr);
      rockets.push({ spr, x: tx, z: tz, y: 1.4, vy: 12 + Math.random() * 3, color, apex: 14 + Math.random() * 5 });
    },
  });

  ctx.onUpdate((d) => {
    const now = performance.now();
    for (let r = rockets.length - 1; r >= 0; r--) {
      const rk = rockets[r]; rk.y += rk.vy * d; rk.vy -= 9 * d; rk.spr.position.y = rk.y;
      if (rk.y >= rk.apex || rk.vy <= 1) { burst(rk.x, rk.y, rk.z, rk.color); ctx.scene.remove(rk.spr); rockets.splice(r, 1); }
    }
    const pa = geo.attributes.position as THREE.BufferAttribute;
    const ca = geo.attributes.color as THREE.BufferAttribute;
    let dirty = false;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      life[i] -= d; vy[i] -= 5 * d;
      pos[i * 3] += vx[i] * d; pos[i * 3 + 1] += vy[i] * d; pos[i * 3 + 2] += vz[i] * d;
      const fade = Math.max(0, life[i] / 2);
      ca.setXYZ(i, col[i * 3] * fade, col[i * 3 + 1] * fade, col[i * 3 + 2] * fade);
      if (life[i] <= 0) pos[i * 3 + 1] = -80;
      dirty = true;
    }
    if (dirty) { pa.needsUpdate = true; ca.needsUpdate = true; }
    flash.intensity = now < flashUntil ? 4 * ((flashUntil - now) / 260) : 0;
  });
}

// ── Floating air particles (motes) ────────────────────────────────────
function buildAirParticles(ctx: WorldContext) {
  const N = 140; const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { arr[i * 3] = rrng(-30, 30); arr[i * 3 + 1] = rrng(0.5, 8); arr[i * 3 + 2] = rrng(-28, 12); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfe0ff, size: 0.05, transparent: true, opacity: 0.5, depthWrite: false }));
  ctx.scene.add(pts);
  const pa = geo.attributes.position as THREE.BufferAttribute;
  ctx.onUpdate((d, e) => {
    for (let i = 0; i < N; i++) {
      pa.setX(i, pa.getX(i) + Math.sin(e * 0.5 + i) * 0.003);
      pa.setY(i, pa.getY(i) + d * 0.15);
      if (pa.getY(i) > 8) pa.setY(i, 0.5);
    }
    pa.needsUpdate = true;
  });
}

// ── Geometry helpers (merge cones into a grass tuft for instancing) ───
function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nis = geos.map(g => (g.index ? g.toNonIndexed() : g));
  let count = 0; for (const g of nis) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of nis) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array as Float32Array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return m;
}
function grassTuftGeo(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = [];
  for (let b = 0; b < 5; b++) {
    const g = new THREE.ConeGeometry(0.05, 0.55 + rnd() * 0.45, 4).toNonIndexed();
    g.rotateZ((rnd() - 0.5) * 0.9);
    g.rotateY(rnd() * Math.PI);
    g.translate((rnd() - 0.5) * 0.22, 0.32, (rnd() - 0.5) * 0.22);
    blades.push(g);
  }
  return mergeGeos(blades);
}

// ── Procedural textures ───────────────────────────────────────────────
function sandTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  g.fillStyle = '#c2a978'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 6000; i++) { const v = 150 + Math.floor(Math.random() * 70); g.fillStyle = `rgba(${v},${v - 20},${v - 60},0.35)`; g.fillRect(Math.random() * 128, Math.random() * 128, 1, 1); }
  return new THREE.CanvasTexture(c);
}
function radialTexture(color: number, vertical = false): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  const col = new THREE.Color(color);
  const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
  if (vertical) {
    const grad = g.createLinearGradient(32, 0, 32, 64);
    grad.addColorStop(0, `rgba(${rgb},0)`); grad.addColorStop(0.5, `rgba(${rgb},0.9)`); grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
  } else {
    const grad = g.createRadialGradient(32, 32, 1, 32, 32, 32);
    grad.addColorStop(0, `rgba(${rgb},1)`); grad.addColorStop(0.5, `rgba(${rgb},0.4)`); grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
  }
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function cloudTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  for (let i = 0; i < 40; i++) { const x = Math.random() * 128, y = 40 + Math.random() * 48, r = 10 + Math.random() * 30; const gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  return new THREE.CanvasTexture(c);
}
function dbSignTexture(): THREE.Texture {
  const W = 300, H = 200;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  // wood grain
  g.fillStyle = '#6b4a28'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(50,32,16,${Math.random() * 0.3})`; g.beginPath(); g.moveTo(0, Math.random() * H); g.lineTo(W, Math.random() * H); g.stroke(); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // carved (dark shadow offset + warm highlight) helper
  const carve = (text: string, y: number, size: number, color = '#ffdca0') => {
    g.font = `bold ${size}px Georgia, serif`;
    g.fillStyle = 'rgba(18,10,4,0.6)'; g.fillText(text, W / 2 + 2, y + 2);
    g.fillStyle = color; g.fillText(text, W / 2, y);
  };
  carve('Max +', 46, 46);
  carve('Salius', 100, 46);
  carve('=', 156, 40);
  // white heart to the right of the "="
  g.font = '40px serif';
  g.fillText('🤍', W / 2 + 44, 158);
  return new THREE.CanvasTexture(c);
}
