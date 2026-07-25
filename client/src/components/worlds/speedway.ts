// ── Premium World: Speedway (ავტოდრომი) ───────────────────────────────
// A full racing facility built around the engine's new LAND vehicles: a banked
// stadium oval of real asphalt with painted lines and kerbs, grass verges and a
// continuous barrier + catch fence, a start/finish line under a lit gantry with
// five two-seat racers on the grid, a working pit lane with five garages, a
// paddock, a grandstand full of people and a trackside jumbotron.
//
// The circuit is generated from ONE arc-length parameterisation (`pathAt`), so
// the asphalt, the lines, the kerbs, the barriers and their colliders all follow
// exactly the same centreline — nothing can drift out of alignment.
//
// Performance (phones first):
//  • Track surface, lines, verges and both barrier walls are one ribbon mesh
//    each — a handful of draw calls for the whole 350-metre circuit.
//  • Kerbs, ad-board posts, catch-fence posts, tyre stacks, the crowd, trees and
//    the grass tufts are each a single InstancedMesh.
//  • No extra dynamic lights: the floodlights and start lights are unlit
//    (MeshBasic) emissive panels, so they cost nothing.
//  • Per-frame CPU work is a helicopter, a few flags and the start sequence;
//    the crowd sways in the vertex shader.
import * as THREE from 'three';
import type { WorldDef, WorldContext } from './types';
import { setupAtmosphere, type Mood } from './atmosphere';

// ── circuit geometry ──────────────────────────────────────────────────
const L = 40;                       // half-length of each straight
const R = 30;                       // corner radius of the centreline
const TW = 6.8;                     // track half-width → a 13.6 m road
const VERGE = 3.4;                  // grass verge between asphalt and barrier
const BW = TW + VERGE;              // 10.2 — barrier offset from the centreline

const S_TOP = 2 * L;                // 80      end of the main (pit) straight
const S_ARC = Math.PI * R;          // 94.25   one corner
const S_R = S_TOP + S_ARC;          // 174.25  end of turn 1-2
const S_BOT = S_R + 2 * L;          // 254.25  end of the back straight
const TOTAL = S_BOT + S_ARC;        // 348.5   one lap

// pit complex + paddock, all on the outside of the main straight
const PIT_Z0 = R + BW;              // 40.2 — the pit wall IS the track barrier
const PIT_Z1 = PIT_Z0 + 7.2;        // 47.4
const GAR_Z0 = PIT_Z1 + 1.2;        // 48.6
const GAR_Z1 = GAR_Z0 + 7.5;        // 56.1
const PAD_Z = GAR_Z1 + 4;           // 60.1 — paddock apron
const BAY_X = [-26, -13, 0, 13, 26];
// infield set-pieces (kept here so the grass sampler can carve around them)
const SCR_X = 8, SCR_Z = -9;        // jumbotron, facing +Z at the fan zone
const LAKE: [number, number] = [-20, 4];
const HELI: [number, number] = [26, 8];
const STAND_Z = -(R + BW + 4);      // -44.2 — grandstand front, back straight
const FENCE_R = 118;                // property boundary

// Barrier gaps. Pit entry sits early on the straight and the exit late, so the
// lane runs the same way as the track (as it does on a real circuit).
const PIT_IN: [number, number] = [6, 20];      // x −34 … −20
const PIT_OUT: [number, number] = [60, 74];    // x  20 …  34
// Pedestrian crossings through the inner barrier. The main-straight one is
// offset down the road (x 8…18) rather than at x = 0, because the start gantry's
// legs stand on the verge either side of the line and would block the way.
const CROSS_A: [number, number] = [48, 58];
const CROSS_B: [number, number] = [S_R + 35, S_R + 45];
// A spectator gate through the OUTER barrier on the back straight, so the
// grandstand is a short walk from the track instead of a lap of the property.
// Deliberately narrow, and posted in the middle: a person threads it, a car
// cannot (see `buildGate`).
const GATE_MESH: [number, number] = [S_R + 38.2, S_R + 41.8];   // x −1.8 … 1.8
const GATE_COLL: [number, number] = [S_R + 37.4, S_R + 42.6];   // x −2.6 … 2.6
const GATE_X = 40 - 40;                                          // gate centre, x = 0

const outerGap = (s: number) => (s > PIT_IN[0] && s < PIT_IN[1]) || (s > PIT_OUT[0] && s < PIT_OUT[1]) || (s > GATE_MESH[0] && s < GATE_MESH[1]);
const outerCollGap = (s: number) => (s > PIT_IN[0] && s < PIT_IN[1]) || (s > PIT_OUT[0] && s < PIT_OUT[1]) || (s > GATE_COLL[0] && s < GATE_COLL[1]);
const innerGap = (s: number) => (s > CROSS_A[0] && s < CROSS_A[1]) || (s > CROSS_B[0] && s < CROSS_B[1]);

let _s = 40725;
function rnd() { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967295; }
function rr(a: number, b: number) { return a + (b - a) * rnd(); }

/**
 * The circuit centreline by arc length. Returns the point, the OUTWARD normal
 * and the tangent (the racing direction). The shape is a stadium: two straights
 * at z = ±R joined by semicircles centred on (±L, 0).
 */
function pathAt(s: number) {
  let t = ((s % TOTAL) + TOTAL) % TOTAL;
  if (t < S_TOP) return { x: -L + t, z: R, nx: 0, nz: 1, tx: 1, tz: 0 };
  t -= S_TOP;
  if (t < S_ARC) {
    const a = Math.PI / 2 - t / R, ca = Math.cos(a), sa = Math.sin(a);
    return { x: L + ca * R, z: sa * R, nx: ca, nz: sa, tx: sa, tz: -ca };
  }
  t -= S_ARC;
  if (t < S_TOP) return { x: L - t, z: -R, nx: 0, nz: -1, tx: -1, tz: 0 };
  t -= S_TOP;
  const a = -Math.PI / 2 - t / R, ca = Math.cos(a), sa = Math.sin(a);
  return { x: -L + ca * R, z: sa * R, nx: ca, nz: sa, tx: sa, tz: -ca };
}

/** A flat horizontal band between two centreline offsets (negative = infield). */
function bandGeo(a: number, b: number, s0: number, s1: number, seg: number, uScale = 8) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const s = s0 + (s1 - s0) * (i / seg), p = pathAt(s);
    pos.push(p.x + p.nx * a, 0, p.z + p.nz * a, p.x + p.nx * b, 0, p.z + p.nz * b);
    uv.push(0, s / uScale, 1, s / uScale);
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/**
 * A vertical wall following the centreline at `off`, from y0 to y1. Emitted as
 * independent quads so `skip` can punch gaps (pit entry, crossings) straight
 * out of the mesh.
 */
function wallGeo(off: number, y0: number, y1: number, seg: number, skip?: (s: number) => boolean, uScale = 8) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const step = TOTAL / seg;
  let n = 0;
  for (let i = 0; i < seg; i++) {
    const sA = i * step, sB = sA + step;
    if (skip && (skip(sA) || skip(sB) || skip((sA + sB) / 2))) continue;
    const pA = pathAt(sA), pB = pathAt(sB);
    const ax = pA.x + pA.nx * off, az = pA.z + pA.nz * off;
    const bx = pB.x + pB.nx * off, bz = pB.z + pB.nz * off;
    pos.push(ax, y0, az, bx, y0, bz, ax, y1, az, bx, y1, bz);
    uv.push(sA / uScale, 0, sB / uScale, 0, sA / uScale, 1, sB / uScale, 1);
    idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); n += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

const MOODS_TRACK: Mood[] = [
  [0x4a86c8, 0x8fb6de, 0xe6f0fa, 1.5, 0xfff2dc, 1.1, 0xa8bcd8],   // bright afternoon
  [0x2d5a9a, 0x9a6a86, 0xf0a860, 1.15, 0xffd8a0, 1.0, 0xa08498],  // golden hour
  [0x0d1430, 0x24244e, 0x3a3a62, 0.85, 0xc8d4ff, 0.82, 0x6a6c96], // floodlit dusk
];
const CYCLE = 330;
// Peaks at the dusk keyframe — drives the floodlights and the neon trim.
const nightAt = (e: number) => { const ph = ((e / CYCLE) % 1) * 3; return Math.max(0, 1 - Math.abs(ph - 2)); };

export const speedway: WorldDef = {
  id: 'speedway',
  name: 'Speedway',
  subtitle: 'ავტოდრომი · რბოლა · ხმა',
  icon: '🏁',
  status: 'live',
  // on the grid apron behind the cars, looking up the main straight at them
  spawn: { x: -37, z: R, yaw: -Math.PI / 2 },
  oceanR: FENCE_R - 6,
  fog: { color: 0xd2e2f0, density: 0.0042 },
  clear: 0xbcd8ee,

  build(ctx: WorldContext) {
    _s = 40725;
    const sky = buildSky(ctx);
    buildGround(ctx);
    buildTrack(ctx);
    buildKerbs(ctx);
    buildStartLine(ctx);
    buildBarriers(ctx);
    buildTyreStacks(ctx);
    buildPitLane(ctx);
    buildGarages(ctx);
    buildPaddock(ctx);
    buildGrandstand(ctx);
    buildGantry(ctx);
    buildFloodlights(ctx);
    buildInfield(ctx);
    buildJumbotron(ctx);
    buildMarshalPosts(ctx);
    buildGrassTufts(ctx);
    buildTreeLine(ctx);
    buildHelicopter(ctx);
    buildCars(ctx);

    (ctx.scene.fog as any).userData = { base: 0.0042 };
    setupAtmosphere(ctx, { sky, moods: MOODS_TRACK, cycle: CYCLE, rain: false });
    // Deliberately soft: an autodrome is loud, but players have to hear each
    // other over it.
    ctx.addAmbient({ kind: 'wind', x: 0, z: 0, radius: 160, gain: 0.24 });
    ctx.addAmbient({ kind: 'night', x: 0, z: 0, radius: 160, gain: 0.18 });
  },
};

// ── sky ───────────────────────────────────────────────────────────────
function buildSky(ctx: WorldContext) {
  const uniforms = {
    top: { value: new THREE.Color(0x4a86c8) },
    mid: { value: new THREE.Color(0x8fb6de) },
    bot: { value: new THREE.Color(0xe6f0fa) },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; void main(){ float h=clamp((normalize(vP).y+0.14)/0.86,0.0,1.0); vec3 c=h<0.5?mix(bot,mid,h*2.0):mix(mid,top,(h-0.5)*2.0); gl_FragColor=vec4(c,1.0);}',
  });
  ctx.scene.add(new THREE.Mesh(new THREE.SphereGeometry(430, 28, 16), mat));

  // thin high cloud band — one instanced squashed sphere set, slow drift
  const N = ctx.perf.reduced ? 26 : 60;
  const inst = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.72, fog: false }),
    N * 3,
  );
  const d = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2, rad = rr(120, 400), y = rr(70, 130), sc = rr(12, 30);
    for (let j = 0; j < 3; j++) {
      d.position.set(Math.cos(a) * rad + rr(-sc, sc), y + rr(-3, 3), Math.sin(a) * rad + rr(-sc, sc));
      d.scale.set(sc * rr(0.7, 1.2), sc * rr(0.2, 0.32), sc * rr(0.6, 1));
      d.updateMatrix(); inst.setMatrixAt(k++, d.matrix);
    }
  }
  inst.count = k; inst.frustumCulled = false; ctx.scene.add(inst);
  ctx.onUpdate((dt) => { inst.rotation.y += dt * 0.004; });

  // sun disc + stars that only show at the floodlit end of the cycle
  const sun = new THREE.Mesh(new THREE.CircleGeometry(11, 24), new THREE.MeshBasicMaterial({ color: 0xfff4d8, fog: false, transparent: true, opacity: 0.92 }));
  sun.position.set(-150, 110, -300); sun.lookAt(0, 0, 0); ctx.scene.add(sun);
  const SN = 380, arr = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) { const u = rnd() * Math.PI * 2, v = rnd() * 0.5 + 0.08, rad = 410; arr[i * 3] = Math.cos(u) * Math.cos(v) * rad; arr[i * 3 + 1] = Math.sin(v) * rad; arr[i * 3 + 2] = Math.sin(u) * Math.cos(v) * rad; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
  ctx.scene.add(stars);
  ctx.onUpdate((_d, e) => { (stars.material as THREE.PointsMaterial).opacity = nightAt(e) * 0.75; });
  return { top: uniforms.top.value, mid: uniforms.mid.value, bot: uniforms.bot.value };
}

// ── ground ────────────────────────────────────────────────────────────
function buildGround(ctx: WorldContext) {
  const g = new THREE.Mesh(new THREE.CircleGeometry(FENCE_R + 260, 56), new THREE.MeshStandardMaterial({ color: 0x3f6b2c, roughness: 1 }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; ctx.scene.add(g);
  // low hills on the horizon so the property doesn't end in nothing
  const hill = new THREE.MeshStandardMaterial({ color: 0x4a6a52, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.4, dist = rr(230, 330), h = rr(22, 46);
    const m = new THREE.Mesh(new THREE.ConeGeometry(h * rr(1.6, 2.4), h, 7), hill);
    m.position.set(Math.cos(a) * dist, h / 2 - 6, Math.sin(a) * dist);
    m.rotation.y = rnd() * Math.PI; ctx.scene.add(m);
  }
}

// ── asphalt, painted lines, verges, run-off ───────────────────────────
function buildTrack(ctx: WorldContext) {
  const SEG = ctx.perf.reduced ? 180 : 300;

  // mown verge either side of the road, right up to the barriers
  const vergeMat = new THREE.MeshStandardMaterial({ color: 0x4f8236, roughness: 1 });
  for (const [a, b] of [[TW, BW], [-BW, -TW]] as const) {
    const m = new THREE.Mesh(bandGeo(a, b, 0, TOTAL, SEG), vergeMat);
    m.position.y = 0.012; m.receiveShadow = true; ctx.scene.add(m);
  }
  // gravel run-off on the outside of both corners
  const gravel = new THREE.MeshStandardMaterial({ color: 0xb4a184, roughness: 1 });
  for (const [s0, s1] of [[S_TOP + 6, S_R - 6], [S_BOT + 6, TOTAL - 6]] as const) {
    const m = new THREE.Mesh(bandGeo(TW + 0.2, BW - 0.5, s0, s1, 60), gravel);
    m.position.y = 0.016; ctx.scene.add(m);
  }
  // the road itself
  const asphalt = new THREE.Mesh(bandGeo(-TW, TW, 0, TOTAL, SEG), new THREE.MeshStandardMaterial({ color: 0x33363c, roughness: 0.82, metalness: 0.05 }));
  asphalt.position.y = 0.025; asphalt.receiveShadow = true; ctx.scene.add(asphalt);
  // a slightly darker, glossier racing line worn into the asphalt
  const line = new THREE.Mesh(bandGeo(-1.6, 1.6, 0, TOTAL, SEG), new THREE.MeshStandardMaterial({ color: 0x2b2d33, roughness: 0.55, metalness: 0.12 }));
  line.position.y = 0.03; ctx.scene.add(line);
  // white edge lines
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.7 });
  for (const off of [TW - 0.35, -(TW - 0.35)]) {
    const m = new THREE.Mesh(bandGeo(off - 0.11, off + 0.11, 0, TOTAL, SEG), white);
    m.position.y = 0.034; ctx.scene.add(m);
  }
}

// ── kerbs: one instanced red/white block set along both corner edges ───
function buildKerbs(ctx: WorldContext) {
  const arcs: Array<[number, number]> = [[S_TOP + 2, S_R - 2], [S_BOT + 2, TOTAL - 2]];
  const STEP = 1.5;
  let total = 0;
  for (const [s0, s1] of arcs) total += Math.floor((s1 - s0) / STEP) * 2;
  const inst = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.09, 1.42),
    new THREE.MeshStandardMaterial({ roughness: 0.7 }),
    total,
  );
  const d = new THREE.Object3D(), col = new THREE.Color();
  let n = 0, flip = 0;
  for (const [s0, s1] of arcs) {
    for (let s = s0; s < s1; s += STEP) {
      const p = pathAt(s);
      for (const side of [1, -1]) {
        const off = side * (TW + 0.62);
        d.position.set(p.x + p.nx * off, 0.045, p.z + p.nz * off);
        d.rotation.y = Math.atan2(p.tx, p.tz);
        d.scale.set(1.24, 1, 1);
        d.updateMatrix(); inst.setMatrixAt(n, d.matrix);
        col.setHex((flip + (side > 0 ? 0 : 1)) % 2 === 0 ? 0xd8dde2 : 0xd23c3c);
        inst.setColorAt(n, col); n++;
      }
      flip++;
    }
  }
  inst.count = n; inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.frustumCulled = false;
  ctx.scene.add(inst);
  // kerbs are driven over, so no colliders — the low `h` also lets the engine's
  // car sweep ignore them if a world ever does add one.
}

// ── start/finish line + painted grid boxes ────────────────────────────
function buildStartLine(ctx: WorldContext) {
  // chequered strip across the full road width at x = 0 on the main straight
  const c = document.createElement('canvas'); c.width = 256; c.height = 32;
  const g2 = c.getContext('2d')!;
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 2; j++) {
      g2.fillStyle = (i + j) % 2 ? '#f2f4f6' : '#1a1c22';
      g2.fillRect(i * 16, j * 16, 16, 16);
    }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  ctx.disposables.push(tex);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(TW * 2, 1.5), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  strip.rotation.x = -Math.PI / 2; strip.rotation.z = Math.PI / 2;
  strip.position.set(0, 0.036, R); ctx.scene.add(strip);

  // painted grid boxes behind the line, one per parked car. The cars point along
  // +X, so a box is 5.2 long in X and 3.2 wide in Z: two side lines plus a rear
  // line closing it off.
  const paint = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.7 });
  for (const [gx, gz] of GRID) {
    for (const [w, d, ox, oz] of [[5.2, 0.16, 0, -1.6], [5.2, 0.16, 0, 1.6], [0.16, 3.2, -2.6, 0]] as const) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), paint);
      m.position.set(gx + ox, 0.038, gz + oz); ctx.scene.add(m);
    }
  }
}

// ── barriers: wall + catch fence + posts, with the gaps punched through ─
function buildBarriers(ctx: WorldContext) {
  const banner = bannerTexture();
  ctx.disposables.push(banner);
  const SEG = ctx.perf.reduced ? 200 : 320;

  // outer: concrete base with sponsor boards, then a tall catch fence
  const outer = new THREE.Mesh(wallGeo(BW, 0, 1.05, SEG, outerGap), new THREE.MeshStandardMaterial({ map: banner, roughness: 0.75, side: THREE.DoubleSide }));
  outer.receiveShadow = true; ctx.scene.add(outer);
  const cap = new THREE.Mesh(wallGeo(BW, 1.05, 1.16, SEG, outerGap), new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.7, side: THREE.DoubleSide }));
  ctx.scene.add(cap);
  const mesh = meshTexture(); ctx.disposables.push(mesh);
  const fence = new THREE.Mesh(wallGeo(BW + 0.22, 1.16, 4.1, SEG, outerGap, 4), new THREE.MeshStandardMaterial({ map: mesh, transparent: true, opacity: 0.55, roughness: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ctx.scene.add(fence);

  // inner: lower wall, no catch fence (nothing behind it to protect)
  const inner = new THREE.Mesh(wallGeo(-BW, 0, 0.95, SEG, innerGap), new THREE.MeshStandardMaterial({ map: banner, roughness: 0.75, side: THREE.DoubleSide }));
  ctx.scene.add(inner);
  const icap = new THREE.Mesh(wallGeo(-BW, 0.95, 1.05, SEG, innerGap), new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.7, side: THREE.DoubleSide }));
  ctx.scene.add(icap);

  // catch-fence posts (outer only) — one instanced set
  const POST_STEP = 6;
  const posts = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.16, 3.1, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x9aa2ac, roughness: 0.6, metalness: 0.4 }),
    Math.ceil(TOTAL / POST_STEP) + 4,
  );
  const d = new THREE.Object3D();
  let n = 0;
  for (let s = 0; s < TOTAL; s += POST_STEP) {
    if (outerGap(s)) continue;
    const p = pathAt(s);
    d.position.set(p.x + p.nx * (BW + 0.22), 2.65, p.z + p.nz * (BW + 0.22));
    d.rotation.y = Math.atan2(p.tx, p.tz); d.scale.setScalar(1);
    d.updateMatrix(); posts.setMatrixAt(n++, d.matrix);
  }
  posts.count = n; posts.instanceMatrix.needsUpdate = true; posts.frustumCulled = false;
  ctx.scene.add(posts);

  // Colliders. Spacing is measured along the CENTRELINE, but the outer barrier
  // sits 10.2 further out, so on a corner its real spacing is stretched by
  // (R+BW)/R = 1.34×. At 2.2 that came to 2.95 — a 1.47 half-gap against a 1.44
  // pedestrian block radius, i.e. a 3 cm pinhole you could slip through on every
  // corner. 1.9 keeps the stretched spacing at 2.55 (a 1.27 half-gap), sealing
  // both barriers for people (1.44) and cars (2.25) all the way round.
  for (let s = 0; s < TOTAL; s += 1.9) {
    const p = pathAt(s);
    if (!outerCollGap(s)) ctx.addCollider({ x: p.x + p.nx * BW, z: p.z + p.nz * BW, r: 1.1 });
    if (!innerGap(s)) ctx.addCollider({ x: p.x - p.nx * BW, z: p.z - p.nz * BW, r: 1.1 });
  }
  buildGate(ctx);
}

/**
 * The spectator gate: two posts 3.2 apart in the barrier gap. A person needs
 * 0.89 of clearance from a 0.55 post and threads the middle; a car needs 1.70
 * from EACH post, and no point between two posts 3.2 apart satisfies both — so
 * the circuit stays sealed to traffic while the crowd walks in and out.
 */
function buildGate(ctx: WorldContext) {
  const GZ = -(R + BW);
  const g = new THREE.Group(); g.position.set(GATE_X, 0, GZ); ctx.scene.add(g);
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa2ac, roughness: 0.55, metalness: 0.5 });
  for (const sx of [-1.6, 1.6]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.6, 10), steel);
    post.position.set(sx, 1.3, 0); post.castShadow = true; g.add(post);
    // a stub of wall either side, so the opening reads as a real gateway
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.05, 0.5), new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.75 }));
    jamb.position.set(sx * 1.35, 0.52, 0); g.add(jamb);
    ctx.addCollider({ x: GATE_X + sx, z: GZ, r: 0.55 });
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.4, 0.5), steel);
  lintel.position.set(0, 2.75, 0); g.add(lintel);
  const sign = fasciaTexture('GATE 1'); ctx.disposables.push(sign);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.62), new THREE.MeshBasicMaterial({ map: sign, toneMapped: false }));
  plate.position.set(0, 2.75, 0.28); g.add(plate);
}

// ── tyre stacks bracing the corner walls ──────────────────────────────
function buildTyreStacks(ctx: WorldContext) {
  const arcs: Array<[number, number]> = [[S_TOP + 8, S_R - 8], [S_BOT + 8, TOTAL - 8]];
  let total = 0;
  for (const [s0, s1] of arcs) total += Math.floor((s1 - s0) / 3.2) * 3;
  const inst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.28, 12),
    new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.95 }),
    total,
  );
  const d = new THREE.Object3D(); const col = new THREE.Color();
  let n = 0, k = 0;
  for (const [s0, s1] of arcs) {
    for (let s = s0; s < s1; s += 3.2, k++) {
      const p = pathAt(s);
      for (let i = 0; i < 3; i++) {
        // hugging the wall: a car scraping the barrier stops with its flank at
        // 9.33 from the centreline, exactly where these stacks begin
        d.position.set(p.x + p.nx * (BW - 0.45), 0.14 + i * 0.28, p.z + p.nz * (BW - 0.45));
        d.rotation.set(0, rnd() * Math.PI, 0); d.scale.setScalar(1);
        d.updateMatrix(); inst.setMatrixAt(n, d.matrix);
        // a splash of colour every few stacks so the corners read at distance
        col.setHex(k % 4 === 0 ? (i === 1 ? 0xd23c3c : 0x16181d) : 0x16181d);
        inst.setColorAt(n, col); n++;
      }
    }
  }
  inst.count = n; inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.frustumCulled = false; ctx.scene.add(inst);
}

// ── pit lane ──────────────────────────────────────────────────────────
function buildPitLane(ctx: WorldContext) {
  const CZ = (PIT_Z0 + PIT_Z1) / 2, DEPTH = PIT_Z1 - PIT_Z0;
  const lane = new THREE.Mesh(new THREE.BoxGeometry(78, 0.05, DEPTH), new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.8 }));
  lane.position.set(0, 0.024, CZ); lane.receiveShadow = true; ctx.scene.add(lane);
  // fast-lane markings + a speed-limit line
  const paint = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.7 });
  for (const z of [PIT_Z0 + 2.4, PIT_Z1 - 0.4]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(78, 0.02, 0.16), paint);
    m.position.set(0, 0.052, z); ctx.scene.add(m);
  }
  for (const bx of BAY_X) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 4.4), paint);
    for (const dx of [-3.2, 3.2]) { const c = box.clone(); c.position.set(bx + dx, 0.052, PIT_Z1 - 2.3); ctx.scene.add(c); }
    const num = numberPlate(BAY_X.indexOf(bx) + 1);
    ctx.disposables.push(num);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: num, transparent: true, toneMapped: false }));
    plate.rotation.x = -Math.PI / 2; plate.position.set(bx, 0.054, PIT_Z1 - 2.3); ctx.scene.add(plate);
  }
  // the pit wall's inner face carries a walkway + timing boards facing the track
  const walk = new THREE.Mesh(new THREE.BoxGeometry(44, 0.12, 1.5), new THREE.MeshStandardMaterial({ color: 0x53575e, roughness: 0.85 }));
  walk.position.set(0, 0.09, PIT_Z0 + 1.0); ctx.scene.add(walk);

  // three two-seat pit-wall benches: pairs can sit and watch the cars stream by
  for (const bx of [-16, 0, 16]) pairBench(ctx, bx, PIT_Z0 + 2.6, Math.PI, `pw${bx}`, 0x2e3440, 0x35e0e0);

  // timing tower at the end of the pit wall
  const tower = new THREE.Group(); tower.position.set(-40.5, 0, PIT_Z0 + 3.2); ctx.scene.add(tower);
  const col = new THREE.Mesh(new THREE.BoxGeometry(3.4, 13, 3.4), new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.7 }));
  col.position.y = 6.5; col.castShadow = true; tower.add(col);
  const board = boardTexture(['P1  VOID', 'P2  MAX', 'P3  NIKA', 'P4  ANA', 'P5  LUKA']);
  ctx.disposables.push(board);
  for (const ry of [0, Math.PI / 2]) {
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(3, 4.4), new THREE.MeshBasicMaterial({ map: board, toneMapped: false }));
    scr.position.set(Math.sin(ry) * 1.75, 8.4, Math.cos(ry) * 1.75); scr.rotation.y = ry; tower.add(scr);
  }
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 3.6), new THREE.MeshBasicMaterial({ color: 0x35e0e0, toneMapped: false }));
    ring.position.y = 1.2 + i * 2.3; tower.add(ring);
  }
  ctx.addCollider({ x: -40.5, z: PIT_Z0 + 3.2, r: 2.2 });
}

// ── five garages opening onto the pit lane ────────────────────────────
function buildGarages(ctx: WorldContext) {
  const HW = 5, DEPTH = GAR_Z1 - GAR_Z0, CZ = (GAR_Z0 + GAR_Z1) / 2;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe4e8ec, roughness: 0.8 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x2b3040, roughness: 0.7 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x585d66, roughness: 0.75 });

  for (let i = 0; i < BAY_X.length; i++) {
    const bx = BAY_X[i];
    const g = new THREE.Group(); g.position.set(bx, 0, 0); ctx.scene.add(g);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(HW * 2, 0.06, DEPTH), floorMat);
    floor.position.set(0, 0.03, CZ); floor.receiveShadow = true; g.add(floor);
    const back = new THREE.Mesh(new THREE.BoxGeometry(HW * 2, 4.4, 0.35), wallMat);
    back.position.set(0, 2.2, GAR_Z1); back.castShadow = true; g.add(back);
    for (const sx of [-HW, HW]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.4, DEPTH), wallMat);
      side.position.set(sx, 2.2, CZ); side.castShadow = true; g.add(side);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 + 0.9, 0.3, DEPTH + 1.4), trimMat);
    roof.position.set(0, 4.55, CZ - 0.4); g.add(roof);
    // fascia with the bay number
    const num = numberPlate(i + 1); ctx.disposables.push(num);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: num, transparent: true, toneMapped: false }));
    plate.position.set(0, 3.6, GAR_Z0 - 0.75); plate.rotation.y = Math.PI; g.add(plate);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 + 0.9, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: 0x35e0e0, toneMapped: false }));
    strip.position.set(0, 4.3, GAR_Z0 - 0.9); g.add(strip);
    // kit inside: a tool chest, a jack, two tyre sets
    const chest = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.8), new THREE.MeshStandardMaterial({ color: 0xc02b3c, roughness: 0.5, metalness: 0.3 }));
    chest.position.set(-2.6, 0.6, GAR_Z1 - 0.9); chest.castShadow = true; g.add(chest);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.9), trimMat);
    bench.position.set(2.4, 0.95, GAR_Z1 - 0.85); g.add(bench);
    for (let t = 0; t < 6; t++) {
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.3, 14), new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.95 }));
      tyre.position.set(3.6 - (t % 2) * 1.0, 0.15 + Math.floor(t / 2) * 0.3, GAR_Z0 + 1.4); g.add(tyre);
    }
    // walls block: back row + both sides
    for (let x = -HW + 0.6; x <= HW - 0.6; x += 2.4) ctx.addCollider({ x: bx + x, z: GAR_Z1, r: 1.2 });
    for (const sx of [-HW, HW]) for (let z = GAR_Z0 + 0.8; z <= GAR_Z1; z += 2.4) ctx.addCollider({ x: bx + sx, z, r: 0.6 });
  }
}

// ── paddock behind the garages: hospitality, podium, couples' corners ──
function buildPaddock(ctx: WorldContext) {
  const deck = new THREE.Mesh(new THREE.BoxGeometry(76, 0.1, 22), new THREE.MeshStandardMaterial({ color: 0x6d5a44, roughness: 0.9 }));
  deck.position.set(0, 0.05, PAD_Z + 7); deck.receiveShadow = true; ctx.scene.add(deck);

  // podium — three steps, a trophy, and two spots on the top step
  const pg = new THREE.Group(); pg.position.set(0, 0, PAD_Z + 3.5); ctx.scene.add(pg);
  const stepMat = new THREE.MeshStandardMaterial({ color: 0x2b3040, roughness: 0.6, metalness: 0.2 });
  const heights = [0.75, 1.05, 0.5];
  const offs = [-2.4, 0, 2.4];
  for (let i = 0; i < 3; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(2.3, heights[i], 2.3), stepMat);
    st.position.set(offs[i], heights[i] / 2, 0); st.castShadow = true; pg.add(st);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.08, 2.42), new THREE.MeshBasicMaterial({ color: i === 1 ? 0xffcc44 : 0x35e0e0, toneMapped: false }));
    trim.position.set(offs[i], heights[i] + 0.02, 0); pg.add(trim);
  }
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.14, 0.5, 14), new THREE.MeshStandardMaterial({ color: 0xffd45a, roughness: 0.25, metalness: 0.9 }));
  cup.position.set(0, 1.35, 0); pg.add(cup);
  const cupFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 14), (cup.material as THREE.Material));
  cupFoot.position.set(0, 1.11, 0); pg.add(cupFoot);
  // The winners' step seats a pair. yaw π faces +Z (out across the paddock), so
  // "forward of centre" is +z — they perch on the front of the 2.3-deep step
  // with hips 0.07 above its 1.05 top.
  ctx.addSeat({ id: 'podium-l', x: -0.55, y: 1.12, z: PAD_Z + 3.5 + 0.3, yaw: Math.PI });
  ctx.addSeat({ id: 'podium-r', x: 0.55, y: 1.12, z: PAD_Z + 3.5 + 0.3, yaw: Math.PI });
  ctx.addCollider({ x: -2.4, z: PAD_Z + 3.5, r: 1.2 });
  ctx.addCollider({ x: 2.4, z: PAD_Z + 3.5, r: 1.2 });

  // hospitality: shaded tables with two-seat benches
  for (const [tx, tz] of [[-22, PAD_Z + 6], [-11, PAD_Z + 9], [12, PAD_Z + 9], [23, PAD_Z + 6]] as const) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.7, 8), new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.6, metalness: 0.4 }));
    post.position.set(tx, 1.35, tz); ctx.scene.add(post);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(3.1, 0.85, 8), new THREE.MeshStandardMaterial({ color: 0xd8493f, roughness: 0.85 }));
    shade.position.set(tx, 3.0, tz); shade.castShadow = true; ctx.scene.add(shade);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.1, 18), new THREE.MeshStandardMaterial({ color: 0x8d6f4e, roughness: 0.85 }));
    top.position.set(tx, 0.78, tz); ctx.scene.add(top);
    ctx.addCollider({ x: tx, z: tz, r: 0.5, h: 0.9 });
    pairBench(ctx, tx, tz + 2.1, 0, `pdk${tx}`, 0x4a3c2c, 0xffcc44);
  }

  // a lounge sofa where one partner can sit in the other's lap, looking back
  // down at the podium (yaw 0 → facing −Z)
  lapSofa(ctx, 0, PAD_Z + 13.5, 0);

  // two couples' embrace pads flanking the podium
  hugPad(ctx, -8.5, PAD_Z + 3.0, 0.5, 'pad-hug-l');
  hugPad(ctx, 8.5, PAD_Z + 3.0, -0.5, 'pad-hug-r');

  // motorhomes parked at the back — scenery that closes the paddock off
  for (let i = 0; i < 6; i++) {
    const x = -32 + i * 13, z = PAD_Z + 19;
    const body = new THREE.Mesh(new THREE.BoxGeometry(9, 3.4, 3.2), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xeceff2 : 0xd7dbe0, roughness: 0.6, metalness: 0.15 }));
    body.position.set(x, 1.9, z); body.castShadow = true; ctx.scene.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(9.05, 0.9, 3.25), new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.1, metalness: 0.7 }));
    glass.position.set(x, 2.5, z); ctx.scene.add(glass);
    for (const wx of [-3, 3]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.95 }));
      w.rotation.z = Math.PI / 2; w.position.set(x + wx, 0.42, z - 1.5); ctx.scene.add(w);
    }
    for (let k = -3; k <= 3; k += 2) ctx.addCollider({ x: x + k * 1.4, z, r: 1.5 });
  }
}

// ── grandstand on the back straight ───────────────────────────────────
function buildGrandstand(ctx: WorldContext) {
  const HW = 46, TIERS = 8;
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9bfc6, roughness: 0.9 });
  const g = new THREE.Group(); ctx.scene.add(g);
  for (let i = 0; i < TIERS; i++) {
    const z = STAND_Z - 1.6 - i * 1.7, h = 0.9 + i * 1.15;
    const step = new THREE.Mesh(new THREE.BoxGeometry(HW * 2, h, 1.7), concrete);
    step.position.set(0, h / 2, z); step.receiveShadow = true; g.add(step);
  }
  // crowd — one instanced set of stubby figures, swaying in the vertex shader
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const holder: { shader?: any } = {};
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    holder.shader = shader;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float ph = instanceMatrix[3][0]*0.9 + instanceMatrix[3][2]*1.3;
       transformed.x += sin(uTime*1.9 + ph) * 0.07 * max(transformed.y, 0.0);
       transformed.y += abs(sin(uTime*2.4 + ph)) * 0.06;`);
  };
  const PER = ctx.perf.reduced ? 28 : 56;
  const crowd = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 8), mat, TIERS * PER);
  const d = new THREE.Object3D(), col = new THREE.Color();
  let n = 0;
  for (let i = 0; i < TIERS; i++) {
    const z = STAND_Z - 1.6 - i * 1.7, y = 0.9 + i * 1.15;
    for (let k = 0; k < PER; k++) {
      if (rnd() < 0.12) continue;                       // empty seats
      d.position.set(-HW + 1.2 + (k + rr(-0.25, 0.25)) * ((HW * 2 - 2.4) / PER), y + 0.45, z + rr(-0.3, 0.3));
      d.rotation.set(0, rr(-0.4, 0.4), 0); d.scale.setScalar(rr(0.85, 1.12));
      d.updateMatrix(); crowd.setMatrixAt(n, d.matrix);
      col.setHSL(rnd(), 0.62, rr(0.42, 0.66)); crowd.setColorAt(n, col); n++;
    }
  }
  crowd.count = n; crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  crowd.frustumCulled = false; g.add(crowd);
  ctx.onUpdate((_dt, e) => { if (holder.shader) holder.shader.uniforms.uTime.value = e; });

  // roof on pillars, with a lit fascia
  const roof = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 + 3, 0.4, 17), new THREE.MeshStandardMaterial({ color: 0x2b3040, roughness: 0.7 }));
  roof.position.set(0, 13.6, STAND_Z - 8.5); roof.rotation.x = -0.06; g.add(roof);
  for (let x = -HW; x <= HW; x += 11.5) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 13.6, 0.5), concrete);
    p.position.set(x, 6.8, STAND_Z - 16); g.add(p);
    ctx.addCollider({ x, z: STAND_Z - 16, r: 0.5 });
  }
  const fas = fasciaTexture('VOID SPEEDWAY'); ctx.disposables.push(fas);
  // a plane's normal is +Z, so leaving it unrotated points the lettering at the
  // track (the stand sits at negative z, looking back toward the circuit)
  const band = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, 2.2), new THREE.MeshBasicMaterial({ map: fas, toneMapped: false }));
  band.position.set(0, 12.4, STAND_Z - 0.2); g.add(band);

  // terrace at ground level in front, with two-seat benches for pairs
  const terrace = new THREE.Mesh(new THREE.BoxGeometry(HW * 2, 0.08, 3.2), new THREE.MeshStandardMaterial({ color: 0x8d939b, roughness: 0.9 }));
  terrace.position.set(0, 0.04, STAND_Z + 1.4); g.add(terrace);
  for (const bx of [-24, -8, 8, 24]) pairBench(ctx, bx, STAND_Z + 1.6, 0, `gs${bx}`, 0x3a4150, 0xff5a7a);
  // the stand blocks: one row along its face
  for (let x = -HW; x <= HW; x += 2.6) ctx.addCollider({ x, z: STAND_Z - 1.4, r: 1.3 });
}

// ── start gantry with a working light sequence ─────────────────────────
function buildGantry(ctx: WorldContext) {
  const g = new THREE.Group(); g.position.set(0, 0, R); ctx.scene.add(g);
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa2ac, roughness: 0.55, metalness: 0.5 });
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.55, 9.5, 0.55), steel);
    leg.position.set(0, 4.75, side * (TW + 1.6)); leg.castShadow = true; g.add(leg);
    ctx.addCollider({ x: 0, z: R + side * (TW + 1.6), r: 0.6 });
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, (TW + 1.6) * 2), steel);
  beam.position.set(0, 9.2, 0); g.add(beam);
  for (let i = -3; i <= 3; i++) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), steel);
    brace.position.set(0, 8.3, i * 2.2); g.add(brace);
  }
  // five light pods, each with a red pair and a green pair
  const off = new THREE.MeshBasicMaterial({ color: 0x2a1010, toneMapped: false });
  const reds: THREE.Mesh[] = [], greens: THREE.Mesh[] = [];
  const redMat = () => new THREE.MeshBasicMaterial({ color: 0xff2418, toneMapped: false });
  const greenMat = () => new THREE.MeshBasicMaterial({ color: 0x2bff6a, toneMapped: false });
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 2.4;
    const pod = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.8 }));
    pod.position.set(0, 7.7, x); pod.rotation.y = Math.PI / 2; g.add(pod);
    for (const dy of [0.55, -0.05]) {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), redMat());
      lamp.position.set(-0.27, 7.7 + dy, x); lamp.rotation.y = -Math.PI / 2; g.add(lamp); reds.push(lamp);
    }
    const gl = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), greenMat());
    gl.position.set(-0.27, 7.0, x); gl.rotation.y = -Math.PI / 2; g.add(gl); greens.push(gl);
  }
  const banner = fasciaTexture('START / FINISH'); ctx.disposables.push(banner);
  const bnr = new THREE.Mesh(new THREE.PlaneGeometry((TW + 1.4) * 2, 1.6), new THREE.MeshBasicMaterial({ map: banner, toneMapped: false }));
  bnr.position.set(-0.4, 10.2, 0); bnr.rotation.y = -Math.PI / 2; g.add(bnr);

  // sequence: reds come on one by one, hold, then all out → green flash
  const seq = { t: -1 };
  for (const l of reds) l.material = off;
  for (const l of greens) l.material = off;
  const redOn = redMat(), greenOn = greenMat();
  ctx.onUpdate((dt) => {
    if (seq.t < 0) return;
    seq.t += dt;
    const lit = seq.t < 5 ? Math.floor(seq.t) + 1 : 5;
    const away = seq.t > 5.9;
    for (let i = 0; i < 5; i++) {
      const on = !away && i < lit;
      reds[i * 2].material = on ? redOn : off;
      reds[i * 2 + 1].material = on ? redOn : off;
      greens[i].material = away && seq.t < 8.4 ? greenOn : off;
    }
    if (seq.t > 9) { seq.t = -1; for (const l of reds) l.material = off; for (const l of greens) l.material = off; }
  });
  ctx.addInteractable({
    id: 'lights', x: 0, z: R - 3.4, r: 3.0, label: '🚦 სტარტის შუქები',
    effect: () => { seq.t = 0; },
  });
}

// ── floodlight pylons ─────────────────────────────────────────────────
function buildFloodlights(ctx: WorldContext) {
  const lampsOn: THREE.MeshBasicMaterial[] = [];
  const steel = new THREE.MeshStandardMaterial({ color: 0x8f959e, roughness: 0.6, metalness: 0.45 });
  // clear of the corner run-offs, the garages and the grandstand tiers
  for (const [x, z] of [[-72, 30], [72, 30], [-72, -30], [72, -30], [-44, 62], [44, 62], [0, -66]] as const) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 22, 10), steel);
    mast.position.set(x, 11, z); mast.castShadow = true; ctx.scene.add(mast);
    ctx.addCollider({ x, z, r: 0.9 });
    const rig = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.4, 1.4), steel);
    rig.position.set(x, 22.2, z); rig.lookAt(0, 18, 0); ctx.scene.add(rig);
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xfff6de, toneMapped: false, transparent: true, opacity: 0.25 });
      lampsOn.push(mat);
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.9), mat);
      const lx = (i % 4 - 1.5) * 1.55, ly = i < 4 ? 0.55 : -0.5;
      lamp.position.set(x, 22.2, z); lamp.lookAt(0, 6, 0);
      lamp.translateX(lx); lamp.translateY(ly); lamp.translateZ(0.2);
      ctx.scene.add(lamp);
    }
  }
  ctx.onUpdate((_d, e) => { const n = nightAt(e); for (const m of lampsOn) m.opacity = 0.16 + n * 0.84; });
}

// ── infield: lawn, picnic corner, ad boards ───────────────────────────
function buildInfield(ctx: WorldContext) {
  // a shallow ornamental lake plus a helipad, purely to fill the eye
  const lake = new THREE.Mesh(new THREE.CircleGeometry(9, 34), new THREE.MeshStandardMaterial({ color: 0x2f6f8f, roughness: 0.18, metalness: 0.55, transparent: true, opacity: 0.92 }));
  lake.rotation.x = -Math.PI / 2; lake.position.set(LAKE[0], 0.02, LAKE[1]); ctx.scene.add(lake);
  ctx.onUpdate((_d, e) => { if (ctx.perf.reduced) return; (lake.material as THREE.MeshStandardMaterial).opacity = 0.88 + Math.sin(e * 0.8) * 0.05; });
  for (let i = 0; i < 7; i++) { const a = rr(0, Math.PI * 2); const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(rr(0.4, 0.95)), new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 1 })); rk.position.set(LAKE[0] + Math.cos(a) * 9.4, 0.2, LAKE[1] + Math.sin(a) * 9.4); rk.rotation.set(rnd(), rnd(), rnd()); ctx.scene.add(rk); }

  const pad = new THREE.Mesh(new THREE.CircleGeometry(6, 28), new THREE.MeshStandardMaterial({ color: 0x3d4148, roughness: 0.85 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(HELI[0], 0.02, HELI[1]); ctx.scene.add(pad);
  const hRing = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.16, 6, 30), new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.7 }));
  hRing.rotation.x = -Math.PI / 2; hRing.position.set(HELI[0], 0.04, HELI[1]); ctx.scene.add(hRing);
  for (const [dx, w, dp] of [[-1.3, 0.4, 3.4], [1.3, 0.4, 3.4], [0, 2.6, 0.4]] as const) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, dp), new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.7 }));
    m.position.set(HELI[0] + dx, 0.05, HELI[1]); ctx.scene.add(m);
  }

  // Fan zone in front of the jumbotron: two-seat benches facing the screen
  // (yaw 0 → the sitter looks along −Z, straight at it) and an embrace pad.
  for (const bx of [SCR_X - 4.5, SCR_X + 4.5]) pairBench(ctx, bx, SCR_Z + 6.2, 0, `inf${Math.round(bx)}`, 0x4a3c2c, 0x8de04a);
  hugPad(ctx, SCR_X, SCR_Z + 10.5, 0, 'inf-hug');
  // shade trees around the fan zone, clear of the pad and the screen
  for (let i = 0; i < 9; i++) {
    const a = rr(0, Math.PI * 2), rad = rr(9, 16);
    const x = SCR_X + Math.cos(a) * rad, z = SCR_Z + 6 + Math.sin(a) * rad;
    if (Math.abs(z) > R - BW - 2 || Math.abs(x) > L - 4) continue;
    if (z > 6) continue;                                  // keep the crossing corridors clear
    if (Math.hypot(x - SCR_X, z - (SCR_Z + 10.5)) < 3) continue;
    if (Math.hypot(x - LAKE[0], z - LAKE[1]) < 10.5) continue;
    if (Math.hypot(x - HELI[0], z - HELI[1]) < 7.5) continue;
    treeAt(ctx, x, z, rr(2.6, 4.2));
  }
}

// ── trackside jumbotron (the world's shared screen) ────────────────────
function buildJumbotron(ctx: WorldContext) {
  const SW = 11.4, SH = 6.4, SCY = 6.2;
  // Stands in the infield facing +Z (a plane's normal), i.e. up at the main
  // straight — so the fan-zone benches in front of it and everyone racing past
  // on the pit straight can both see the screen.
  const X = SCR_X, Z = SCR_Z, RY = 0;
  const g = new THREE.Group(); g.position.set(X, 0, Z); g.rotation.y = RY; ctx.scene.add(g);
  for (const sx of [-4.6, 4.6]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, SCY - 1.2, 0.7), new THREE.MeshStandardMaterial({ color: 0x53575e, roughness: 0.7, metalness: 0.3 }));
    leg.position.set(sx, (SCY - 1.2) / 2, 0); leg.castShadow = true; g.add(leg);
  }
  const case_ = new THREE.Mesh(new THREE.BoxGeometry(SW + 1.1, SH + 1.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.8 }));
  case_.position.set(0, SCY, -0.1); case_.castShadow = true; g.add(case_);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ color: 0x0b1024, toneMapped: false }));
  panel.position.set(0, SCY, 0.22); g.add(panel);
  for (const [w, h, dx, dy] of [[SW + 0.7, 0.1, 0, SH / 2 + 0.35], [SW + 0.7, 0.1, 0, -SH / 2 - 0.35], [0.1, SH + 0.7, SW / 2 + 0.35, 0], [0.1, SH + 0.7, -SW / 2 - 0.35, 0]] as const) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), new THREE.MeshBasicMaterial({ color: 0x35e0e0, toneMapped: false }));
    bar.position.set(dx, SCY + dy, 0.26); g.add(bar);
  }
  ctx.addCollider({ x: X, z: Z, r: 2.4, h: 1.2 });
  // the engine projects video onto this rect; 'dj' opens the shared video panel
  ctx.setScreen({ x: X + Math.sin(RY) * 0.24, y: SCY, z: Z + Math.cos(RY) * 0.24, w: SW, h: SH, ry: RY });
  ctx.addInteractable({
    id: 'dj', x: X + Math.sin(RY) * 3.4, z: Z + Math.cos(RY) * 3.4, r: 2.6,
    label: '📺 ეკრანი', effect: () => { /* panel opens via onInteract('dj') */ },
  });
}

// ── marshal posts with waving flags ───────────────────────────────────
function buildMarshalPosts(ctx: WorldContext) {
  const flags: Array<{ m: THREE.Mesh; ph: number }> = [];
  for (const s of [S_TOP + 20, S_TOP + 70, S_BOT + 20, S_BOT + 70, 100, 280]) {
    const p = pathAt(s);
    const x = p.x + p.nx * (BW + 1.6), z = p.z + p.nz * (BW + 1.6);
    const hut = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.3, 1.5), new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.8 }));
    hut.position.set(x, 1.15, z); hut.rotation.y = Math.atan2(p.tx, p.tz); hut.castShadow = true; ctx.scene.add(hut);
    ctx.addCollider({ x, z, r: 1.1 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.6 }));
    pole.position.set(x, 3.4, z); ctx.scene.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.95), new THREE.MeshStandardMaterial({ color: 0xf0c419, roughness: 0.85, side: THREE.DoubleSide }));
    flag.position.set(x + 0.78, 4.4, z); ctx.scene.add(flag);
    flags.push({ m: flag, ph: rr(0, 6.2) });
  }
  ctx.onUpdate((_d, e) => {
    if (ctx.perf.reduced) return;
    for (const f of flags) { f.m.rotation.y = Math.sin(e * 2.1 + f.ph) * 0.4; f.m.rotation.z = Math.sin(e * 3.1 + f.ph) * 0.09; }
  });
}

// ── grass tufts on the verges + infield (one instanced set) ───────────
function buildGrassTufts(ctx: WorldContext) {
  const w = 0.09, tw = 0.02, h = 0.46;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -w, 0, 0, w, 0, 0, tw, h, 0, -w, 0, 0, tw, h, 0, -tw, h, 0,
  ]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), 2));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  const mat = new THREE.MeshStandardMaterial({ color: 0x5f9138, roughness: 1, side: THREE.DoubleSide });
  const holder: { shader?: any } = {};
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    holder.shader = shader;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float ph = instanceMatrix[3][0]*0.7 + instanceMatrix[3][2]*0.7;
       float sway = sin(uTime*1.7 + ph) + 0.4*sin(uTime*3.2 + ph*1.7);
       transformed.x += sway * 0.15 * uv.y * uv.y;`);
  };
  const COUNT = ctx.perf.reduced ? 2000 : 4200;
  const inst = new THREE.InstancedMesh(geo, mat, COUNT);
  const d = new THREE.Object3D(), col = new THREE.Color();
  let n = 0;
  for (let i = 0; i < COUNT; i++) {
    let x: number, z: number;
    if (i % 3 === 0) {
      // verge tufts, hugging the barriers
      const s = rnd() * TOTAL, p = pathAt(s);
      const off = (TW + 0.5 + rnd() * (VERGE - 1.0)) * (rnd() < 0.5 ? 1 : -1);
      x = p.x + p.nx * off; z = p.z + p.nz * off;
    } else {
      // infield lawn
      const a = rnd() * Math.PI * 2, rad = Math.sqrt(rnd()) * (R - TW - VERGE - 1);
      x = Math.cos(a) * rad * (L / R + 0.6) * 0.72; z = Math.sin(a) * rad;
      if (Math.abs(x) > L - 2) continue;
    }
    if (Math.hypot(x - LAKE[0], z - LAKE[1]) < 9.6) continue;
    if (Math.hypot(x - HELI[0], z - HELI[1]) < 6.4) continue;
    if (Math.hypot(x - SCR_X, z - SCR_Z) < 5.4) continue;
    d.position.set(x, 0, z);
    d.rotation.set(0, rnd() * Math.PI, 0);
    const sc = rr(0.7, 1.45); d.scale.set(sc, rr(0.8, 1.35), sc);
    d.updateMatrix(); inst.setMatrixAt(n, d.matrix);
    const gg = rr(0.7, 1.05); col.setRGB(0.3 * gg, 0.55 * gg, 0.2 * gg); inst.setColorAt(n, col);
    n++;
  }
  inst.count = n; inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.frustumCulled = false; ctx.scene.add(inst);
  ctx.onUpdate((_d, e) => { if (holder.shader) holder.shader.uniforms.uTime.value = e; });
}

// ── perimeter: a tree line and the property fence ─────────────────────
function buildTreeLine(ctx: WorldContext) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f5c2a, roughness: 1 });
  const N = ctx.perf.reduced ? 90 : 170;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.5, 1, 6), trunkMat, N);
  const leaves = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), leafMat, N * 2);
  const d = new THREE.Object3D(), col = new THREE.Color();
  let k = 0;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + rr(-0.02, 0.02);
    const rad = FENCE_R + rr(3, 26), h = rr(6, 11);
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    d.position.set(x, h / 2, z); d.rotation.set(0, rnd() * Math.PI, 0); d.scale.set(1, h, 1);
    d.updateMatrix(); trunks.setMatrixAt(i, d.matrix);
    for (let j = 0; j < 2; j++) {
      const rr2 = h * rr(0.3, 0.44);
      d.position.set(x + rr(-1, 1), h * rr(0.75, 1.0), z + rr(-1, 1));
      d.rotation.set(0, rnd() * Math.PI, 0); d.scale.setScalar(rr2);
      d.updateMatrix(); leaves.setMatrixAt(k, d.matrix);
      col.setRGB(rr(0.14, 0.24), rr(0.32, 0.46), rr(0.12, 0.22)); leaves.setColorAt(k, col); k++;
    }
  }
  leaves.count = k; trunks.frustumCulled = false; leaves.frustumCulled = false;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  ctx.scene.add(trunks); ctx.scene.add(leaves);

  // the fence itself: a low rail plus chunky, widely-spaced colliders. Nobody
  // inspects the property line up close, so a coarse seal keeps the collider
  // count down (blocking radius 3.84 vs a 3.0 half-gap).
  const rail = new THREE.Mesh(new THREE.TorusGeometry(FENCE_R, 0.09, 4, 120), new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.7, metalness: 0.3 }));
  rail.rotation.x = Math.PI / 2; rail.position.y = 1.5; ctx.scene.add(rail);
  const rail2 = rail.clone(); rail2.position.y = 0.8; ctx.scene.add(rail2);
  const step = 6 / FENCE_R;
  for (let a = 0; a < Math.PI * 2; a += step) {
    ctx.addCollider({ x: Math.cos(a) * FENCE_R, z: Math.sin(a) * FENCE_R, r: 3.5 });
  }
}

// ── a camera helicopter orbiting the circuit ──────────────────────────
function buildHelicopter(ctx: WorldContext) {
  const g = new THREE.Group(); ctx.scene.add(g);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1f2a44, roughness: 0.45, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 10), bodyMat); body.scale.set(1, 0.95, 1.7); g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 3.6), bodyMat); tail.position.set(0, 0.25, 3.2); g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.7), bodyMat); fin.position.set(0, 0.85, 4.6); g.add(fin);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), new THREE.MeshStandardMaterial({ color: 0x8fc4e8, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.6 }));
  glass.scale.set(0.95, 0.8, 1.1); glass.position.set(0, 0.1, -1.1); g.add(glass);
  for (const sx of [-0.9, 0.9]) { const skid = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3), bodyMat); skid.position.set(sx, -1.3, 0); g.add(skid); }
  const rotor = new THREE.Group(); rotor.position.y = 1.35; g.add(rotor);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 7.5), new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.7 })); b.rotation.y = (i / 4) * Math.PI * 2; rotor.add(b); }
  const tRotor = new THREE.Group(); tRotor.position.set(0.2, 0.85, 4.6); g.add(tRotor);
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.1), new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.7 })); b.rotation.z = (i / 3) * Math.PI * 2; tRotor.add(b); }
  ctx.onUpdate((dt, e) => {
    const a = e * 0.055;
    g.position.set(Math.cos(a) * 96, 34 + Math.sin(e * 0.3) * 1.6, Math.sin(a) * 62);
    g.rotation.y = -a + Math.PI / 2; g.rotation.z = 0.16;
    rotor.rotation.y += dt * 26; tRotor.rotation.x += dt * 30;
  });
}

// ── the starting grid: five two-seat racers ───────────────────────────
// Staggered like a real grid — the pairs sit either side of the racing line.
const GRID: Array<[number, number]> = [[-7, R - 3.4], [-11.5, R + 3.4], [-18, R - 3.4], [-22.5, R + 3.4], [-29, R - 3.4]];
const CAR_COLORS = [0xe23b4e, 0x2f7de0, 0xf0b429, 0x35c98a, 0x9b5cff];

function buildCars(ctx: WorldContext) {
  for (let i = 0; i < GRID.length; i++) {
    const [x, z] = GRID[i];
    ctx.addVehicle({
      id: `car${i + 1}`, x, z,
      yaw: -Math.PI / 2,                 // pointing up the straight (+X)
      kind: 'car', color: CAR_COLORS[i], num: i + 1,
    });
  }
}

// ── shared local furniture ────────────────────────────────────────────
/**
 * A bench with TWO individual seats side by side, so a pair sits together
 * instead of one person taking the whole thing. `yaw` follows the engine's seat
 * convention: the sitter faces −(sin yaw, cos yaw), and the bench's long axis is
 * the sitter's right, (cos yaw, −sin yaw).
 */
function pairBench(ctx: WorldContext, x: number, z: number, yaw: number, id: string, wood: number, accent: number) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; ctx.scene.add(g);
  const mat = new THREE.MeshStandardMaterial({ color: wood, roughness: 0.88 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.13, 0.62), mat);
  seat.position.y = 0.5; seat.castShadow = true; g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.5, 0.12), mat);
  back.position.set(0, 0.82, 0.3); back.rotation.x = -0.16; g.add(back);
  for (const sx of [-0.95, 0.95]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.55), mat);
    leg.position.set(sx, 0.25, 0); g.add(leg);
  }
  // a divider so it reads as two individual places
  const split = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.6), new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }));
  split.position.set(0, 0.6, 0); g.add(split);
  ctx.addCollider({ x, z, r: 0.75, h: 0.55 });
  // seats: ±0.55 along the bench's long axis → a 1.10 gap, clear of the 0.68
  // avatar width, and both inside the 1.15 half-length of the bench
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  ctx.addSeat({ id: `${id}-a`, x: x - rx * 0.55, y: 0.57, z: z - rz * 0.55, yaw });
  ctx.addSeat({ id: `${id}-b`, x: x + rx * 0.55, y: 0.57, z: z + rz * 0.55, yaw });
}

/**
 * A loveseat where one partner sits on the other's lap, both facing the same
 * way. Heights are the pair verified in Rotmund: the base sits on the 0.575
 * cushion at 0.62, and the top rider's hips at 0.80 land just above their
 * partner's thighs, nudged 0.26 forward onto them.
 */
function lapSofa(ctx: WorldContext, x: number, z: number, yaw: number) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; ctx.scene.add(g);
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a3f57, roughness: 0.88 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.45, 1.15), mat);
  base.position.y = 0.35; base.castShadow = true; g.add(base);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.78, 0.2), mat);
  back.position.set(0, 0.84, 0.48); g.add(back);
  for (const ax of [-0.9, 0.9]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 1.15), mat);
    arm.position.set(ax, 0.5, 0); g.add(arm);
  }
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff4d6d, toneMapped: false }));
  heart.scale.set(1, 0.9, 0.6); heart.position.y = 2.1; g.add(heart);
  ctx.onUpdate((_d, e) => { heart.position.y = 2.05 + Math.sin(e * 1.6) * 0.08; heart.rotation.y = e * 0.7; });
  ctx.addCollider({ x, z, r: 0.95, h: 0.6 });
  ctx.addSeat({ id: 'lap-base', x, y: 0.62, z, yaw, pose: 'lapBase' });
  ctx.addSeat({ id: 'lap-top', x: x - Math.sin(yaw) * 0.26, y: 0.80, z: z - Math.cos(yaw) * 0.26, yaw, pose: 'lapTop' });
}

/** A couples' embrace pad — two facing spots that lock into a standing hug. */
function hugPad(ctx: WorldContext, x: number, z: number, yaw: number, id: string) {
  const GAP = 0.3;
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; ctx.scene.add(g);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.1, 26), new THREE.MeshStandardMaterial({ color: 0x3a3040, roughness: 0.75, metalness: 0.2 }));
  pad.position.y = 0.05; pad.receiveShadow = true; g.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.045, 8, 36), new THREE.MeshBasicMaterial({ color: 0xff5a7a, toneMapped: false }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; g.add(ring);
  for (const s of [-1, 1]) {
    const mark = new THREE.Mesh(new THREE.CircleGeometry(0.3, 18), new THREE.MeshBasicMaterial({ color: 0xff5a7a, transparent: true, opacity: 0.42, toneMapped: false }));
    mark.rotation.x = -Math.PI / 2; mark.position.set(0, 0.12, s * GAP * 1.6); g.add(mark);
  }
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff4d6d, toneMapped: false }));
  heart.scale.set(1, 0.9, 0.6); heart.position.y = 2.3; g.add(heart);
  ctx.onUpdate((_d, e) => { heart.position.y = 2.28 + Math.sin(e * 1.6) * 0.09; heart.rotation.y = e * 0.7; });
  const sx = Math.sin(yaw) * GAP, sz = Math.cos(yaw) * GAP;
  ctx.addSeat({ id: `${id}-l`, x: x + sx, y: 0, z: z + sz, yaw, pose: 'hugL' });
  ctx.addSeat({ id: `${id}-r`, x: x - sx, y: 0, z: z - sz, yaw: yaw + Math.PI, pose: 'hugR' });
}

function treeAt(ctx: WorldContext, x: number, z: number, h: number) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, h, 7), new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 }));
  trunk.position.set(x, h / 2, z); trunk.castShadow = true; ctx.scene.add(trunk);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(h * rr(0.3, 0.42), 9, 7), new THREE.MeshStandardMaterial({ color: 0x336b2c, roughness: 1 }));
    b.position.set(x + rr(-0.7, 0.7), h * rr(0.8, 1.05), z + rr(-0.7, 0.7)); b.castShadow = true; ctx.scene.add(b);
  }
  ctx.addCollider({ x, z, r: 0.5 });
}

// ── canvas textures ───────────────────────────────────────────────────
/** Sponsor boards running along the barrier walls. */
function bannerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d')!;
  const words = ['VOID', 'SPEEDWAY', 'MAFIA', 'VOID·GE'];
  const cols = ['#12151c', '#c8202f', '#12151c', '#1d5ec8'];
  for (let i = 0; i < 4; i++) {
    g.fillStyle = cols[i]; g.fillRect(i * 128, 0, 128, 96);
    g.fillStyle = '#f2f4f6'; g.font = 'bold 30px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(words[i], i * 128 + 64, 50);
  }
  g.fillStyle = '#35e0e0'; g.fillRect(0, 88, 512, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The catch fence's diamond mesh (alpha grid). */
function meshTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(210,216,224,0.95)'; g.lineWidth = 3;
  for (let i = -64; i < 128; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke();
    g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 64, 0); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A big painted numeral for a pit box / garage bay. */
function numberPlate(n: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#f2f4f6'; g.font = 'bold 108px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The timing tower's running order. */
function boardTexture(rows: string[]): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 376;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0b1024'; g.fillRect(0, 0, 256, 376);
  g.fillStyle = '#35e0e0'; g.fillRect(0, 0, 256, 6);
  g.font = 'bold 30px system-ui, sans-serif'; g.textBaseline = 'middle';
  rows.forEach((r, i) => {
    g.fillStyle = i === 0 ? '#ffd45a' : '#dfe6f0';
    g.fillText(r, 18, 52 + i * 62);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Lit lettering for the grandstand roof / start gantry. */
function fasciaTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#12151c'; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#35e0e0'; g.fillRect(0, 0, 1024, 6); g.fillRect(0, 122, 1024, 6);
  g.fillStyle = '#f2f4f6'; g.font = 'bold 76px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 512, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
