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
    buildCinema(ctx);
    buildBar(ctx);
    buildShip(ctx);
    buildDanceFloor(ctx);
    buildPhotoFrame(ctx);
    buildPier(ctx);
    buildHammock(ctx);
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
  // gentle dunes + a real shoreline: past the waterline (world z < -24, i.e.
  // local y > 24) the sand slopes down under the sea so the water is actually
  // visible when you walk up to it.
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const d = Math.hypot(x, y);
    let h = Math.sin(x * 0.08) * 0.12 + Math.cos(y * 0.09) * 0.12;
    if (y > 24) h -= (y - 24) * 0.14;               // dive below the water
    else h += Math.max(0, (d - 40) * 0.05);         // rise at the far land edges
    p.setZ(i, h);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0xb99a6c, roughness: 1, metalness: 0 });
  const sand = new THREE.Mesh(geo, mat);
  sand.rotation.x = -Math.PI / 2; sand.receiveShadow = true;
  ctx.scene.add(sand);
}

// ── Ocean: animated waves + moonlight streak ──────────────────────────
function buildOcean(ctx: WorldContext) {
  // Rippled water texture (drifting) so the sea reads as water up close too.
  const waterTex = waterTexture();
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(26, 16);
  const geo = new THREE.PlaneGeometry(220, 130, 44, 26);
  const mat = new THREE.MeshStandardMaterial({
    map: waterTex, color: 0x9fc4e0, roughness: 0.24, metalness: 0.45,
    transparent: true, opacity: 0.97,
    emissive: 0x0a2436, emissiveMap: waterTex, emissiveIntensity: 0.35,
  });
  const sea = new THREE.Mesh(geo, mat);
  sea.rotation.x = -Math.PI / 2;
  // right up to the shoreline; the sloping sand hides it inland
  sea.position.set(0, -0.06, SEA_Z - 48);
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
    // drifting ripples
    waterTex.offset.set((e * 0.008) % 1, (e * 0.005) % 1);
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
  // Kept clear of the cinema deck (around x≈19, z≈3) so trunks never block the
  // screen — the two east-side palms moved to the west beach.
  const spots = [[-11, 3], [12, -12], [-14, -8], [-15, -4], [-8, -12], [9, -14], [-18, 6], [-19, 3]];
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
  const rockets: { spr: THREE.Sprite; y: number; vy: number; vx: number; vz: number; x: number; z: number; color: THREE.Color; apex: number }[] = [];
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
      // Launch FROM the tube, rising almost straight up with a little drift so
      // it bursts overhead where the player is looking — not behind them.
      const spr = new THREE.Sprite(rocketMat); spr.scale.setScalar(0.6);
      spr.position.set(LX, 1.5, LZ); ctx.scene.add(spr);
      rockets.push({
        spr, x: LX, z: LZ, y: 1.5, vy: 13 + Math.random() * 3,
        vx: (Math.random() - 0.5) * 1.6, vz: (Math.random() - 0.5) * 1.6,
        color, apex: 15 + Math.random() * 4,
      });
    },
  });

  ctx.onUpdate((d) => {
    const now = performance.now();
    for (let r = rockets.length - 1; r >= 0; r--) {
      const rk = rockets[r];
      rk.y += rk.vy * d; rk.vy -= 9 * d; rk.x += rk.vx * d; rk.z += rk.vz * d;
      rk.spr.position.set(rk.x, rk.y, rk.z);
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

// ── Cinema: big screen on a deck away from the fire, with seating ─────
function buildCinema(ctx: WorldContext) {
  const CX = 19, CZ = 3;         // deck centre — a good distance from the fire
  const SW = 5.4, SH = 3.0;      // screen size
  const SCY = 2.7;               // screen centre height
  const ry = -Math.PI / 2;       // faces -X (toward the seats at smaller x)

  const deck = new THREE.Group(); deck.position.set(CX, 0, CZ); ctx.scene.add(deck);
  // raised wooden platform
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.3, 24), new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 1 }));
  plat.position.set(-1.5, 0.15, 0); plat.receiveShadow = true; deck.add(plat);
  // frame posts
  const postMat = new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.8, metalness: 0.2 });
  for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, SCY + SH / 2, 0.16), postMat); p.position.set(0.1, (SCY + SH / 2) / 2, sz * (SW / 2 + 0.1)); p.castShadow = true; deck.add(p); }
  // bezel
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.14, SH + 0.3, SW + 0.3), postMat);
  bezel.position.set(0.08, SCY, 0); deck.add(bezel);
  // the screen panel (dark, faintly glowing when off — the iframe covers it when playing)
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: screenOffTexture() }));
  scr.rotation.y = ry; scr.position.set(0.02, SCY, 0); deck.add(scr);
  // soft screen glow light
  const glow = new THREE.PointLight(0x5aa0ff, 1.4, 14, 2); glow.position.set(-2, SCY, 0); deck.add(glow);
  ctx.onUpdate((_d, e) => { glow.intensity = 1.1 + Math.sin(e * 1.5) * 0.25; });

  ctx.addCollider({ x: CX + 0.1, z: CZ, r: 2.2 }); // just the screen base — seats stay reachable
  ctx.setScreen({ x: CX + 0.02, y: SCY, z: CZ, w: SW, h: SH, ry });

  // theatre seating facing the screen (+X)
  const rows = [[15.4, -1.6], [15.4, 0], [15.4, 1.6], [17, -0.8], [17, 0.8]];
  rows.forEach(([sx, sz], i) => {
    // Same convention as the campfire seats (which face the fire): a seat at
    // (sx,sz) looking at the screen (CX,CZ) uses atan2(sx-CX, sz-CZ).
    const yaw = Math.atan2(sx - CX, sz - CZ);
    const g = new THREE.Group(); g.position.set(sx, 0, sz); g.rotation.y = yaw; ctx.scene.add(g);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.7), new THREE.MeshStandardMaterial({ color: [0x7c3aed, 0x0ea5b7, 0xb91c1c][i % 3], roughness: 0.8 }));
    seat.position.y = 0.32; seat.castShadow = true; seat.receiveShadow = true; g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.7), (seat.material as THREE.Material)); back.position.set(-0.3, 0.5, 0); g.add(back);
    ctx.addCollider({ x: sx, z: sz, r: 0.5 });
    ctx.addSeat({ id: `cinema${i}`, x: sx, y: 0.44, z: sz, yaw });
  });
}

// ── Beach bar (tiki) with stools ──────────────────────────────────────
function buildBar(ctx: WorldContext) {
  const BX = -17, BZ = -3;
  const g = new THREE.Group(); g.position.set(BX, 0, BZ); g.rotation.y = 0.5; ctx.scene.add(g);
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 1 });
  const woodTop = new THREE.MeshStandardMaterial({ color: 0x7a5330, roughness: 0.9 });
  // counter
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 0.9), woodDark); base.position.set(0, 0.5, 0); base.castShadow = true; base.receiveShadow = true; g.add(base);
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.12, 1.1), woodTop); top.position.set(0, 1.06, 0); top.castShadow = true; g.add(top);
  // back shelf with bottles
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 0.35), woodDark); shelf.position.set(0, 1.4, -0.7); g.add(shelf);
  const bottleCols = [0x6aff9e, 0xff6a8a, 0x6ab0ff, 0xffcf6a, 0xc06bff];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.28 + (i % 3) * 0.06, 6), new THREE.MeshStandardMaterial({ color: bottleCols[i % bottleCols.length], roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.85 }));
    b.position.set(-1.5 + i * 0.5, 1.6, -0.7); g.add(b);
  }
  // thatch roof (cone) on four posts
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.3, 4), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1 }));
  roof.position.set(0, 3.0, 0); roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
  for (const [px, pz] of [[-1.7, 0.7], [1.7, 0.7], [-1.7, -0.7], [1.7, -0.7]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 2.4, 6), woodDark); post.position.set(px, 1.2, pz); post.castShadow = true; g.add(post);
  }
  // warm bar light
  const l = new THREE.PointLight(0xffb45a, 1.6, 9, 2); l.position.set(0, 2.3, 0); g.add(l);
  ctx.onUpdate((_d, e) => { l.intensity = 1.4 + Math.sin(e * 6) * 0.2; });
  ctx.addCollider({ x: BX, z: BZ, r: 2.0 });
  // stools (seats) in front of the counter, facing it
  for (let i = 0; i < 3; i++) {
    const lx = -1 + i * 1.0, lz = 1.15;
    const wx = BX + lx * Math.cos(0.5) - lz * Math.sin(0.5);
    const wz = BZ + lx * Math.sin(0.5) + lz * Math.cos(0.5);
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.6, 10), woodDark);
    stool.position.set(wx, 0.3, wz); stool.castShadow = true; ctx.scene.add(stool);
    ctx.addCollider({ x: wx, z: wz, r: 0.35 });
    ctx.addSeat({ id: `bar${i}`, x: wx, y: 0.62, z: wz, yaw: Math.atan2(wx - BX, wz - BZ) });
  }
}

// ── A ship in the shallows you can board (with a bow "titanic" pose) ───
function buildShip(ctx: WorldContext) {
  const SX = -23, SZ = -30;      // in the shallow water near the west shore
  const g = new THREE.Group(); g.position.set(SX, 0, SZ); g.rotation.y = 0.15; ctx.scene.add(g);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.85 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x7a5836, roughness: 0.9 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.7 });
  // hull (bow points -Z, out to sea)
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 7), hullMat); hull.position.set(0, 0.5, 0); hull.castShadow = true; hull.receiveShadow = true; g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.4, 4), hullMat); bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(0, 0.6, -4.1); bow.scale.set(1, 1, 0.6); g.add(bow);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 6.8), deckMat); deck.position.set(0, 1.15, 0); deck.castShadow = true; g.add(deck);
  // cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 1.8), deckMat); cabin.position.set(0, 1.7, 2.2); cabin.castShadow = true; g.add(cabin);
  // mast + sail
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5, 8), hullMat); mast.position.set(0, 3.6, 0.5); mast.castShadow = true; g.add(mast);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3), new THREE.MeshStandardMaterial({ color: 0xf3ecdc, roughness: 0.9, side: THREE.DoubleSide }));
  sail.position.set(0, 3.6, 0.55); g.add(sail);
  ctx.onUpdate((_d, e) => { sail.scale.x = 1 + Math.sin(e * 1.4) * 0.05; sail.rotation.y = Math.sin(e * 0.8) * 0.08; g.position.y = Math.sin(e * 0.9) * 0.05; });
  // bow railing (the pose bar)
  const railMat = trimMat;
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), railMat); rail.rotation.z = Math.PI / 2; rail.position.set(0, 1.7, -3.4); g.add(rail);
  for (const px of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), railMat); p.position.set(px, 1.45, -3.4); g.add(p); }
  // hull colliders (walk around, not through)
  ctx.addCollider({ x: SX, z: SZ + 1.5, r: 1.6 });
  ctx.addCollider({ x: SX, z: SZ - 2, r: 1.4 });
  // two bow "titanic" pose spots facing out to sea (-Z)
  ctx.addSeat({ id: 'bow1', x: SX - 0.35, y: 1.35, z: SZ - 3.0, yaw: 0.15, pose: 'titanic' });
  ctx.addSeat({ id: 'bow2', x: SX + 0.35, y: 1.35, z: SZ - 2.4, yaw: 0.15, pose: 'titanic' });
}

// ── DJ / dance floor ──────────────────────────────────────────────────
function buildDanceFloor(ctx: WorldContext) {
  const DX = 10, DZ = 15, N = 6, T = 0.95;
  const g = new THREE.Group(); g.position.set(DX, 0, DZ); ctx.scene.add(g);
  // glowing tiles that cycle colour with a beat
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(T * 0.92, 0.06, T * 0.92), new THREE.MeshBasicMaterial({ vertexColors: true }), N * N);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < N * N; i++) { const x = (i % N - (N - 1) / 2) * T, z = (Math.floor(i / N) - (N - 1) / 2) * T; dummy.position.set(x, 0.05, z); dummy.updateMatrix(); tiles.setMatrixAt(i, dummy.matrix); tiles.setColorAt(i, new THREE.Color(0x222233)); }
  tiles.receiveShadow = true; g.add(tiles);
  const col = new THREE.Color();
  // DJ booth on the north edge, facing the floor
  const booth = new THREE.Group(); booth.position.set(0, 0, -(N * T) / 2 - 0.7); g.add(booth);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 0.8), new THREE.MeshStandardMaterial({ color: 0x14151c, roughness: 0.6, metalness: 0.3 })); deck.position.y = 0.55; deck.castShadow = true; booth.add(deck);
  const disc1 = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 20), new THREE.MeshStandardMaterial({ color: 0x333340, roughness: 0.3, metalness: 0.6 })); disc1.position.set(-0.55, 1.13, 0); booth.add(disc1);
  const disc2 = disc1.clone(); disc2.position.x = 0.55; booth.add(disc2);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.5), new THREE.MeshBasicMaterial({ color: 0xff4da6 })); panel.position.set(0, 0.6, 0.41); booth.add(panel);
  ctx.addCollider({ x: DX, z: DZ - (N * T) / 2 - 0.7, r: 1.3 });
  // disco ball + moving colour lights
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshStandardMaterial({ color: 0xcfd4dc, roughness: 0.1, metalness: 1, emissive: 0x222233, emissiveIntensity: 0.3 })); ball.position.set(0, 4.2, 0); g.add(ball);
  const spot1 = new THREE.PointLight(0xff4da6, 0, 10, 2); spot1.position.set(-2, 4, 0); g.add(spot1);
  const spot2 = new THREE.PointLight(0x4da6ff, 0, 10, 2); spot2.position.set(2, 4, 0); g.add(spot2);
  const spot3 = new THREE.PointLight(0x8aff5a, 0, 10, 2); spot3.position.set(0, 4, 2); g.add(spot3);
  ctx.onUpdate((_d, e) => {
    const beat = Math.floor(e * 2.2);
    for (let i = 0; i < N * N; i++) {
      const h = ((i * 37 + beat * 61) % 100) / 100;
      const on = ((i + beat) % 3 === 0) ? 1 : 0.25;
      col.setHSL(h, 0.85, 0.55 * on); tiles.setColorAt(i, col);
    }
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
    disc1.rotation.y += 0.08; disc2.rotation.y -= 0.06;
    ball.rotation.y += 0.02;
    spot1.intensity = 2 + Math.sin(e * 6) * 1.5; spot2.intensity = 2 + Math.sin(e * 6 + 2) * 1.5; spot3.intensity = 2 + Math.sin(e * 6 + 4) * 1.5;
    spot1.position.x = Math.sin(e * 1.5) * 3; spot2.position.z = Math.cos(e * 1.3) * 3;
  });
}

// ── Photo spot: a neon frame players gather in front of ───────────────
function buildPhotoFrame(ctx: WorldContext) {
  const PX = -9, PZ = 13;
  const g = new THREE.Group(); g.position.set(PX, 0, PZ); g.rotation.y = -0.3; ctx.scene.add(g);
  const neon = new THREE.MeshStandardMaterial({ color: 0xff7ac6, emissive: 0xff2f9e, emissiveIntensity: 1.6, roughness: 0.4 });
  const fw = 3.2, fh = 2.2, t = 0.12;
  const bar = (w: number, h: number, x: number, y: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), neon); b.position.set(x, y + 1.4, 0); g.add(b); };
  bar(fw, t, 0, fh / 2); bar(fw, t, 0, -fh / 2); bar(t, fh, -fw / 2, 0); bar(t, fh, fw / 2, 0);
  // little hearts in the corners
  for (const [hx, hy] of [[-fw / 2, fh / 2], [fw / 2, fh / 2]]) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), neon); h.position.set(hx, hy + 1.4, 0.05); g.add(h); }
  const l = new THREE.PointLight(0xff4da6, 1.4, 7, 2); l.position.set(0, 1.8, 0.5); g.add(l);
  ctx.onUpdate((_d, e) => { neon.emissiveIntensity = 1.3 + Math.sin(e * 3) * 0.4; l.intensity = 1.2 + Math.sin(e * 3) * 0.3; });
}

// ── Pier extending over the shallows, with lanterns ───────────────────
function buildPier(ctx: WorldContext) {
  const PX = -6;
  const plankMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 1 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 12), plankMat);
  deck.position.set(PX, 0.08, -30); deck.receiveShadow = true; deck.castShadow = true; ctx.scene.add(deck);
  for (let z = -25; z >= -36; z -= 2.2) {
    for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.4, 6), postMat); post.position.set(PX + sx * 1.0, -0.4, z); post.castShadow = true; ctx.scene.add(post); }
  }
  // lanterns along the rail
  for (let z = -26; z >= -36; z -= 3.3) {
    for (const sx of [-1, 1]) {
      const gg = new THREE.Group(); gg.position.set(PX + sx * 1.15, 0, z); ctx.scene.add(gg);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), postMat); p.position.y = 0.5; gg.add(p);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), new THREE.MeshStandardMaterial({ color: 0xffcf7a, emissive: 0xffb347, emissiveIntensity: 1.4, transparent: true, opacity: 0.85 })); glass.position.y = 1.05; gg.add(glass);
      const l = new THREE.PointLight(0xffb45a, 0.7, 5, 2); l.position.y = 1.05; gg.add(l);
    }
  }
}

// ── Couples hammock between two posts (embracing recline) ─────────────
function buildHammock(ctx: WorldContext) {
  const HX = -10, HZ = 6, RY = 0.6;
  const g = new THREE.Group(); g.position.set(HX, 0, HZ); g.rotation.y = RY; ctx.scene.add(g);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 1 });
  for (const sz of [-1.75, 1.75]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.9, 6), postMat); p.position.set(0, 0.95, sz); p.rotation.z = sz > 0 ? -0.1 : 0.1; p.castShadow = true; g.add(p); }
  // wide sagging net — roomy enough for two to lie together
  const net = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.3, 14, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xdd6a9a, roughness: 0.9, side: THREE.DoubleSide }));
  net.rotation.z = Math.PI / 2; net.rotation.x = Math.PI; net.position.set(0, 0.72, 0); net.scale.set(1, 1, 1.35); g.add(net);
  // little heart floating above so it reads as the couples spot
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshStandardMaterial({ color: 0xff4d6d, emissive: 0xff2d55, emissiveIntensity: 0.6, roughness: 0.5 }));
  heart.position.set(0, 2.2, 0); heart.scale.set(1, 0.9, 0.6); g.add(heart);
  ctx.onUpdate((_d, e) => { heart.position.y = 2.2 + Math.sin(e * 1.5) * 0.08; heart.rotation.y = e * 0.6; });
  ctx.addCollider({ x: HX, z: HZ, r: 0.85 });
  // two seats side by side (offset along the net's local X) → embrace pose
  const d = 0.34, cx = Math.cos(RY), sx = Math.sin(RY);
  ctx.addSeat({ id: 'hammock-l', x: HX + cx * d, y: 0.82, z: HZ - sx * d, yaw: RY, pose: 'cuddleL' });
  ctx.addSeat({ id: 'hammock-r', x: HX - cx * d, y: 0.82, z: HZ + sx * d, yaw: RY, pose: 'cuddleR' });
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
function waterTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0d2c46'; g.fillRect(0, 0, 128, 128);
  // ripple arcs
  for (let i = 0; i < 30; i++) {
    g.strokeStyle = `rgba(150,215,240,${0.08 + Math.random() * 0.18})`;
    g.lineWidth = 1 + Math.random() * 1.6;
    g.beginPath();
    const x = Math.random() * 128, y = Math.random() * 128, r = 5 + Math.random() * 16;
    const a0 = Math.random() * Math.PI * 2;
    g.arc(x, y, r, a0, a0 + 1.0 + Math.random() * 1.6);
    g.stroke();
  }
  // sparkle flecks
  for (let i = 0; i < 50; i++) {
    g.fillStyle = `rgba(190,235,255,${0.05 + Math.random() * 0.12})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 1);
  }
  return new THREE.CanvasTexture(c);
}

function screenOffTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 144;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 144);
  grad.addColorStop(0, '#0a1830'); grad.addColorStop(1, '#050a16');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 144);
  g.font = '54px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('📺', 128, 66);
  g.fillStyle = 'rgba(120,180,255,0.6)'; g.font = 'bold 16px monospace'; g.fillText('CINEMA', 128, 110);
  return new THREE.CanvasTexture(c);
}

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
