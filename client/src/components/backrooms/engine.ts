// ── Backrooms 3D engine (Phase 1: single-player procedural liminal world) ──
// A self-contained Three.js first-person engine. Lives outside React so the
// render loop and WebGL context are never torn down by re-renders. The React
// wrapper (Backrooms.tsx) only feeds it input and reads HUD state.
//
// World model: an endless lattice of support pillars spaced CELL apart, with
// random wall panels strung between neighbouring pillars — the classic open
// "office with pillars and maze walls" liminal layout. The visible window of
// pillars/walls recenters on the player (a treadmill) so the world feels
// infinite while draw calls stay bounded (InstancedMesh, ~2 draw calls).

import * as THREE from 'three';

export interface HudState {
  battery: number;        // flashlight charge, 0..1
  flashlightOn: boolean;
  level: string;          // e.g. "LEVEL 0"
  x: number;              // world position (for later multiplayer/debug)
  z: number;
  event: string | null;   // active dynamic event ('flicker' | 'blackout' | null)
  voidPhase: 'none' | 'warning' | 'sweep'; // the VOID IS COMING event
  region: string;         // current region type ('normal' | 'red' | 'library' | ...)
  nearClue: boolean;      // a readable clue is within interact range
  chased: boolean;        // a mirror clone is hunting the player
}

export interface BackroomsEvent { kind: string; duration?: number; sound?: string; x?: number; z?: number; shelters?: { x: number; z: number }[]; }

export interface NetState { x: number; y: number; z: number; ry: number; fl: boolean; }
export interface RemotePlayerState { socketId: string; name: string; x: number; y: number; z: number; ry: number; fl: boolean; skin?: number; shirt?: number; }

interface RemoteAvatar {
  group: THREE.Group;
  lamp: THREE.Mesh;
  gestureSprite: THREE.Sprite;
  gestureUntil: number;
  signalUntil: number;
  target: { x: number; y: number; z: number; ry: number; fl: boolean };
  cur: { x: number; y: number; z: number; ry: number };
  name: string;
}

// ── Tunables ──────────────────────────────────────────────────────────
const CELL = 6;            // lattice spacing (metres)
const WALL_H = 3.0;        // ceiling height
const EYE = 1.6;           // eye height
const PHALF = 0.4;         // pillar half-width
const WALL_THICK = 0.28;   // maze-wall thickness
const WALL_DENSITY = 0.3;  // fraction of lattice edges that carry a wall
const WINDOW = 8;          // pillar window radius in cells (17×17 lattice)
const PLAYER_R = 0.32;     // player collision radius
const WALK = 3.2, SPRINT = 5.6, GRAVITY = 18, JUMP_V = 6.0;

// Deterministic 0..1 hash so the infinite world is stable & reproducible.
function hash3(x: number, z: number, s: number): number {
  let h = (x | 0) * 374761393 + (z | 0) * 668265263 + s * 2147483647;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

// ── Rare regions (Phase 6) ─────────────────────────────────────────────
// The world is divided into coarse REGION×REGION blocks; a small fraction of
// blocks are "special" — a red hall, a black room, a server room, a silent
// library, a cafeteria, a flooded room — deterministically per seed so every
// player in an instance discovers the same rare places.
type RegionType = 'normal' | 'red' | 'black' | 'server' | 'library' | 'cafeteria' | 'flood';
const REGION = 8; // cells per region side
interface Palette { wall: number; floor: number; ceil: number; fog: number; light: number; prop?: 'shelf' | 'table' | 'rack'; propColor?: number; water?: boolean; }
const PALETTES: Record<RegionType, Palette> = {
  normal:    { wall: 0xbaa94c, floor: 0x8a8060, ceil: 0xece3b8, fog: 0x12100a, light: 1.0 },
  red:       { wall: 0x7a1a1a, floor: 0x3a1212, ceil: 0x5a2020, fog: 0x1a0505, light: 0.85 },
  black:     { wall: 0x141416, floor: 0x0a0a0c, ceil: 0x161618, fog: 0x020203, light: 0.4 },
  server:    { wall: 0x243032, floor: 0x141c1e, ceil: 0x2a3436, fog: 0x08110f, light: 0.55, prop: 'rack', propColor: 0x0e1618 },
  library:   { wall: 0x5a4526, floor: 0x33270f, ceil: 0x6f5a34, fog: 0x140f06, light: 0.9, prop: 'shelf', propColor: 0x3a2c16 },
  cafeteria: { wall: 0xa8ac96, floor: 0x787c68, ceil: 0xd8d8b8, fog: 0x14140e, light: 1.1, prop: 'table', propColor: 0x9a9486 },
  flood:     { wall: 0x30424a, floor: 0x16242c, ceil: 0x3a4c54, fog: 0x0a1a1e, light: 0.7, water: true },
};
const SPECIAL_TYPES: RegionType[] = ['red', 'black', 'server', 'library', 'cafeteria', 'flood'];
function regionTypeFor(cellX: number, cellZ: number, seed: number): RegionType {
  const rx = Math.floor(cellX / REGION), rz = Math.floor(cellZ / REGION);
  if (hash3(rx, rz, seed + 777) < 0.9) return 'normal'; // ~10% of regions are special
  return SPECIAL_TYPES[Math.floor(hash3(rx, rz, seed + 888) * SPECIAL_TYPES.length) % SPECIAL_TYPES.length];
}

// Cryptic clues — environmental storytelling; never fully explained.
const CLUE_DENSITY = 0.012;
const CLUE_NOTES = [
  'დღე 47. კიდევ ვხედავ იმავე დერეფნებს. ან ისინი მიმეორებენ.',
  'არ ენდო შუქს. როცა ქრება, ის ახლოსაა.',
  'ვცადე დათვლა. 738-მდე მივედი. მერე ისევ თავიდან.',
  'თუ ამას კითხულობ — არ გააჩერო. არასდროს გააჩერო.',
  'ჩვენ აქ ვიყავით. ბევრი. ახლა მხოლოდ ხმები დარჩა.',
  'კარი, რომელიც გუშინ იყო, დღეს აღარაა.',
  'NO-CLIP. ეს ერთადერთი გზაა გარეთ. ან ასე ვფიქრობდი.',
  'ის ჩემს სახეს ატარებს. ჩემს სახელს გვიძახის.',
  'დაბადების დღე. ტორტი. სინათლე. — აღარ მახსოვს რა არის.',
  '█████ არ არის მარტო. არასდროს ყოფილა.',
];
function clueAt(cellX: number, cellZ: number, seed: number): boolean {
  return hash3(cellX, cellZ, seed + 1234) < CLUE_DENSITY;
}

// Is the open square whose min-corner pillar is (cx,cz) walled on all 4 sides?
// (Used to avoid spawning inside a sealed pocket.)
function cellSealed(cx: number, cz: number, seed: number): boolean {
  return hash3(cx, cz, 11 + seed) < WALL_DENSITY       // bottom edge (+X panel at row cz)
    && hash3(cx, cz + 1, 11 + seed) < WALL_DENSITY      // top edge (+X panel at row cz+1)
    && hash3(cx, cz, 23 + seed) < WALL_DENSITY          // left edge (+Z panel at col cx)
    && hash3(cx + 1, cz, 23 + seed) < WALL_DENSITY;     // right edge (+Z panel at col cx+1)
}
function noteFor(cellX: number, cellZ: number, seed: number): string {
  return CLUE_NOTES[Math.floor(hash3(cellX, cellZ, seed + 4321) * CLUE_NOTES.length) % CLUE_NOTES.length];
}

interface AABB { cx: number; cz: number; hx: number; hz: number; wall?: boolean; }

// Liang–Barsky: does segment (x1,z1)->(x2,z2) intersect the AABB?
function segIntersectsAabb(x1: number, z1: number, x2: number, z2: number, c: AABB): boolean {
  const minx = c.cx - c.hx, maxx = c.cx + c.hx, minz = c.cz - c.hz, maxz = c.cz + c.hz;
  const dx = x2 - x1, dz = z2 - z1;
  let t0 = 0, t1 = 1;
  const edges: [number, number][] = [[-dx, x1 - minx], [dx, maxx - x1], [-dz, z1 - minz], [dz, maxz - z1]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return false; }
    else {
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}

export class BackroomsEngine {
  // Input surface (mutated by the React wrapper each frame).
  input = { move: { x: 0, y: 0 }, sprint: false };
  onHud: ((h: HudState) => void) | null = null;

  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;

  // Camera orientation / motion
  private yaw = 0;
  private pitch = 0;
  private vel = new THREE.Vector3();
  private pos = new THREE.Vector3(0, EYE, 0);
  private onGround = true;
  private pendingLook = { x: 0, y: 0 };
  private jumpQueued = false;

  // World treadmill state
  private curCell = { x: 9999, z: 9999 };
  private colliders: AABB[] = [];
  private pillarMesh!: THREE.InstancedMesh;
  private wallMesh!: THREE.InstancedMesh;
  private floor!: THREE.Mesh;
  private ceil!: THREE.Mesh;
  private lightPool: THREE.PointLight[] = [];
  private flashlight!: THREE.SpotLight;
  private ambient!: THREE.AmbientLight;
  private hemi!: THREE.HemisphereLight;

  // Flashlight battery
  private battery = 1;
  private flashOn = true;
  private hudAccum = 0;

  // Dynamic events (flicker / blackout) + horror audio
  private flickerUntil = 0;
  private blackoutUntil = 0;
  private activeEvent: string | null = null;
  private heartTimer: ReturnType<typeof setInterval> | null = null;

  // The VOID IS COMING event
  private voidPhase: 'none' | 'warning' | 'sweep' = 'none';
  private voidLevel = 0;              // 0..1 tension ramp (darken + fog + bass)
  private baseFogDensity = 0.085;
  private voidBass: OscillatorNode | null = null;
  private voidBassGain: GainNode | null = null;
  private whisperTimer: ReturnType<typeof setInterval> | null = null;

  // Rare regions + clues
  private propMesh!: THREE.InstancedMesh;
  private glowMesh!: THREE.InstancedMesh;
  private graffitiMesh!: THREE.InstancedMesh;
  private clueMesh!: THREE.InstancedMesh;
  private water!: THREE.Mesh;
  private waterTex!: THREE.Texture;
  private shelterGroup: THREE.Group | null = null;

  // Horror entities: mirrors + clone, void smoke, gliding shadow figures,
  // dormant wall shadows. onEffect notifies the HUD (jumpscare/shadow flash).
  onEffect: ((kind: 'jumpscare' | 'shadow') => void) | null = null;
  private wallColliders: AABB[] = [];
  private mirrors: { x: number; z: number; key: string }[] = [];
  private mirrorFrameMesh!: THREE.InstancedMesh;
  private mirrorGlassMesh!: THREE.InstancedMesh;
  private mirrorCooldown = new Map<string, number>();
  private clone: { group: THREE.Group; until: number } | null = null;
  private smokeMat!: THREE.SpriteMaterial;
  private smoke: { spr: THREE.Sprite; vx: number; vy: number; vz: number; life: number }[] = [];
  private figs: { spr: THREE.Sprite; mat: THREE.SpriteMaterial; active: boolean; vx: number; vz: number; until: number; stung: boolean }[] = [];
  private wallShadowMat!: THREE.SpriteMaterial;
  private wallShadows: THREE.Sprite[] = [];
  private nextDreadAt = 0;
  private clues: { x: number; z: number; note: string }[] = [];
  private curRegion: RegionType = 'normal';
  private regionCol = { floor: new THREE.Color(0x8a8060), ceil: new THREE.Color(0xece3b8), fog: new THREE.Color(0x12100a), light: 1 };
  private nearClue = false;
  private _tmpCol = new THREE.Color();

  // Polish / perf
  private shake = 0;
  private perfAccum = 0;
  private perfFrames = 0;
  private curPR = 1;

  // Ambient audio
  private audioCtx: AudioContext | null = null;
  private audioNodes: { stop: () => void } | null = null;

  private textures: THREE.Texture[] = [];

  // Multiplayer
  private worldSeed = 0;
  private remotes = new Map<string, RemoteAvatar>();
  private speaking = new Set<string>();

  constructor(canvas: HTMLCanvasElement, seed = 0) {
    this.worldSeed = (seed | 0);
    // Spawn in the open middle of a cell that isn't a sealed pocket (scan a
    // small spiral out from the origin), with a little jitter so co-spawning
    // players don't stack exactly on top of each other.
    let scx = 0, scz = 0;
    scan: for (let r = 0; r <= 8; r++) {
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue;
        if (!cellSealed(a, b, this.worldSeed)) { scx = a; scz = b; break scan; }
      }
    }
    this.pos.set(scx * CELL + CELL / 2 + (Math.random() - 0.5) * 1.6, EYE, scz * CELL + CELL / 2 + (Math.random() - 0.5) * 1.6);
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.curPR = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.curPR);
    this.renderer.setClearColor(0x0a0a06, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x12100a, 0.085);

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 120);
    this.camera.position.copy(this.pos);

    this.buildStaticWorld();
    this.buildLights();
    this.resize();
  }

  // ── Public control surface ───────────────────────────────────────────
  addLook(dx: number, dy: number) { this.pendingLook.x += dx; this.pendingLook.y += dy; }
  jump() { this.jumpQueued = true; }
  toggleFlashlight() { if (this.battery > 0.001) this.flashOn = !this.flashOn; }
  setFlashlight(on: boolean) { if (on && this.battery <= 0.001) return; this.flashOn = on; }
  addBattery(amount: number) { this.battery = Math.min(1, this.battery + amount); }

  // Resume the ambient/SFX AudioContext (browsers start it suspended until a gesture).
  resumeAudio() { this.audioCtx?.resume?.().catch(() => {}); }

  getNetState(): NetState {
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z, ry: this.yaw, fl: this.flashOn && this.battery > 0 };
  }

  // Listener transform for the spatial-audio layer.
  getListener(): { x: number; z: number; yaw: number } {
    return { x: this.pos.x, z: this.pos.z, yaw: this.yaw };
  }

  // How much the maze walls block the straight line between two points, 0..1.
  // Only real wall panels count (support pillars are too small/sparse to muffle).
  occlusionBetween(x1: number, z1: number, x2: number, z2: number): number {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len;
    // Pull the endpoints inward so a wall a listener/speaker is standing against
    // doesn't register as occlusion.
    const shrink = Math.min(0.7, len * 0.25);
    const ax = x1 + ux * shrink, az = z1 + uz * shrink;
    const bx = x2 - ux * shrink, bz = z2 - uz * shrink;
    let count = 0;
    for (const c of this.colliders) {
      if (!c.wall) continue;
      if (segIntersectsAabb(ax, az, bx, bz, c)) { count++; if (count >= 2) break; }
    }
    return Math.min(1, count * 0.6);
  }

  // Reconcile the set of remote avatars against the server's player list.
  setRemotePlayers(players: RemotePlayerState[]) {
    const seen = new Set<string>();
    for (const p of players) {
      seen.add(p.socketId);
      let a = this.remotes.get(p.socketId);
      if (!a) { a = this.makeRemoteAvatar(p.name, p.skin, p.shirt); this.remotes.set(p.socketId, a); this.scene.add(a.group); }
      a.target = { x: p.x, y: p.y, z: p.z, ry: p.ry, fl: p.fl };
    }
    // Remove avatars that left.
    for (const [id, a] of this.remotes) {
      if (seen.has(id)) continue;
      this.scene.remove(a.group);
      a.group.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as any; if (mat?.map) mat.map.dispose?.(); mat?.dispose?.();
      });
      this.remotes.delete(id);
    }
  }

  // A simple blocky humanoid (legs, torso, arms, head). `dark` builds the
  // all-black red-eyed variant used by the mirror clone.
  private buildHumanoid(skin: number, shirt: number, dark = false): THREE.Group {
    const g = new THREE.Group();
    const skinMat = new THREE.MeshLambertMaterial({ color: dark ? 0x050508 : skin });
    const shirtMat = new THREE.MeshLambertMaterial({ color: dark ? 0x070709 : shirt });
    const pantsMat = new THREE.MeshLambertMaterial({ color: dark ? 0x050507 : 0x23262e });
    const legG = new THREE.BoxGeometry(0.14, 0.6, 0.16);
    const l1 = new THREE.Mesh(legG, pantsMat); l1.position.set(-0.1, 0.3, 0); g.add(l1);
    const l2 = new THREE.Mesh(legG, pantsMat); l2.position.set(0.1, 0.3, 0); g.add(l2);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.26), shirtMat); torso.position.y = 0.94; g.add(torso);
    const armG = new THREE.BoxGeometry(0.11, 0.56, 0.14);
    const a1 = new THREE.Mesh(armG, shirtMat); a1.position.set(-0.3, 0.92, 0); g.add(a1);
    const a2 = new THREE.Mesh(armG, shirtMat); a2.position.set(0.3, 0.92, 0); g.add(a2);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), skinMat); head.position.y = 1.42; g.add(head);
    if (dark) {
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
      const eyeG = new THREE.SphereGeometry(0.04, 6, 6);
      const e1 = new THREE.Mesh(eyeG, eyeMat); e1.position.set(-0.06, 1.45, -0.14); g.add(e1);
      const e2 = new THREE.Mesh(eyeG, eyeMat); e2.position.set(0.06, 1.45, -0.14); g.add(e2);
      // dim red aura so the thing reads even in pitch black
      const aura = new THREE.PointLight(0x990000, 1.6, 5, 2);
      aura.position.set(0, 1.4, 0);
      g.add(aura);
    }
    return g;
  }

  private makeRemoteAvatar(name: string, skin?: number, shirt?: number): RemoteAvatar {
    const group = this.buildHumanoid(skin ?? 0xf2c9a0, shirt ?? 0x7c3aed);
    // Head lamp (glows when their flashlight is on).
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff3c0, transparent: true }),
    );
    lamp.position.set(0, 1.5, -0.17);
    group.add(lamp);
    // Name sprite floating above.
    const sprite = this.makeNameSprite(name);
    sprite.position.set(0, 2.05, 0);
    group.add(sprite);
    // Gesture sprite (wave/point emoji), hidden until a gesture arrives.
    const gestureSprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    gestureSprite.scale.set(0.7, 0.7, 1);
    gestureSprite.position.set(0, 2.45, 0);
    gestureSprite.visible = false;
    group.add(gestureSprite);
    return { group, lamp, gestureSprite, gestureUntil: 0, signalUntil: 0, name, target: { x: 0, y: 1.6, z: 0, ry: 0, fl: false }, cur: { x: 0, y: 1.6, z: 0, ry: 0 } };
  }

  private makeEmojiTexture(emoji: string): THREE.Texture {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.font = '48px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(emoji, 32, 36);
    const tex = new THREE.CanvasTexture(c);
    this.textures.push(tex);
    return tex;
  }

  // A remote player waved / pointed / flashed their light.
  remoteGesture(socketId: string, kind: string) {
    const a = this.remotes.get(socketId); if (!a) return;
    const now = performance.now();
    if (kind === 'signal') { a.signalUntil = now + 1800; return; }
    const emoji = kind === 'point' ? '👉' : '👋';
    const mat = a.gestureSprite.material as THREE.SpriteMaterial;
    mat.map?.dispose();
    mat.map = this.makeEmojiTexture(emoji);
    mat.needsUpdate = true;
    a.gestureSprite.visible = true;
    a.gestureUntil = now + 2600;
  }

  private makeNameSprite(name: string): THREE.Sprite {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d')!;
    g.font = 'bold 30px monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 14, 256, 36);
    g.fillStyle = 'rgba(255,245,210,0.9)';
    g.fillText(name.slice(0, 14), 128, 33);
    const tex = new THREE.CanvasTexture(c);
    this.textures.push(tex);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    spr.scale.set(1.6, 0.4, 1);
    return spr;
  }

  setSpeaking(ids: Set<string>) { this.speaking = ids; }

  private updateRemotes(dt: number) {
    const k = Math.min(1, dt * 10); // smoothing toward target
    for (const [id, a] of this.remotes) {
      a.cur.x += (a.target.x - a.cur.x) * k;
      a.cur.y += (a.target.y - a.cur.y) * k;
      a.cur.z += (a.target.z - a.cur.z) * k;
      // shortest-arc yaw lerp
      let dry = a.target.ry - a.cur.ry;
      while (dry > Math.PI) dry -= Math.PI * 2;
      while (dry < -Math.PI) dry += Math.PI * 2;
      a.cur.ry += dry * k;
      a.group.position.set(a.cur.x, a.cur.y - EYE, a.cur.z); // feet on floor
      a.group.rotation.y = a.cur.ry;
      const now = performance.now();
      // Flashlight-signal blink overrides normal lamp opacity.
      const signaling = now < a.signalUntil;
      const lampMat = a.lamp.material as THREE.MeshBasicMaterial;
      lampMat.opacity = signaling ? (Math.sin(now / 60) > 0 ? 1 : 0.1) : (a.target.fl ? 1 : 0.12);
      a.lamp.visible = true;
      // A talking player's head-lamp pulses so you can see who's speaking.
      const talk = this.speaking.has(id) ? 1.35 + Math.sin(now / 90) * 0.35 : 1;
      a.lamp.scale.setScalar(talk);
      // Gesture emoji fades out.
      if (a.gestureSprite.visible && now > a.gestureUntil) a.gestureSprite.visible = false;
    }
  }

  start() {
    this.startAudio();
    this.clock.start();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.stopHeartbeat();
    this.stopVoidBass();
    this.clearShelters();
    this.removeClone();
    if (this.whisperTimer) { clearInterval(this.whisperTimer); this.whisperTimer = null; }
    this.audioNodes?.stop();
    try { this.audioCtx?.close(); } catch { /* ignore */ }
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose();
    });
    this.textures.forEach(t => t.dispose());
    this.renderer.dispose();
  }

  // ── World construction ───────────────────────────────────────────────
  private buildStaticWorld() {
    const maxPillars = (WINDOW * 2 + 1) ** 2;
    const maxWalls = maxPillars * 2;

    // Floor + ceiling: large planes that follow the player; textures are
    // world-anchored via UV offset so the surface never appears to slide.
    const carpet = this.makeCarpetTexture();
    const floorGeo = new THREE.PlaneGeometry(240, 240);
    const floorMat = new THREE.MeshLambertMaterial({ map: carpet, color: 0x8a8060 });
    this.floor = new THREE.Mesh(floorGeo, floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);

    const ceilTex = this.makeCeilingTexture();
    const ceilMat = new THREE.MeshLambertMaterial({ map: ceilTex, color: 0xece3b8, emissive: 0x2a2612, emissiveMap: ceilTex, emissiveIntensity: 0.9 });
    this.ceil = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), ceilMat);
    this.ceil.rotation.x = Math.PI / 2;
    this.ceil.position.y = WALL_H;
    this.scene.add(this.ceil);

    // Pillars & walls as instanced meshes (recentered each cell crossing).
    // Greyscale textures + per-instance colour (instanceColor) let a region
    // recolour its walls (red hall, black room, …) with zero extra draw calls.
    const wallTex = this.makeWallTexture();
    const pillarMat = new THREE.MeshLambertMaterial({ map: wallTex, color: 0xffffff });
    const pillarGeo = new THREE.BoxGeometry(PHALF * 2, WALL_H, PHALF * 2);
    this.pillarMesh = new THREE.InstancedMesh(pillarGeo, pillarMat, maxPillars);
    this.pillarMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pillarMesh.frustumCulled = false;
    this.scene.add(this.pillarMesh);

    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex, color: 0xffffff });
    const wallGeo = new THREE.BoxGeometry(1, WALL_H, 1); // scaled per instance
    this.wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, maxWalls);
    this.wallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wallMesh.frustumCulled = false;
    this.scene.add(this.wallMesh);

    // Signature props for special regions (shelves+books / tables+chairs /
    // server racks). Each prop is composed of several coloured box instances.
    const propMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.propMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), propMat, maxPillars * 4);
    this.propMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.propMesh.frustumCulled = false;
    this.scene.add(this.propMesh);

    // Unlit glowing details (server-rack status strips).
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.glowMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), glowMat, 256);
    this.glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glowMesh.frustumCulled = false;
    this.scene.add(this.glowMesh);

    // Wall graffiti — "ვოიდი ახლოს არის!" scrawled in red on random wall panels.
    const graffitiMat = new THREE.MeshBasicMaterial({ map: this.makeGraffitiTexture(), transparent: true, depthWrite: false });
    this.graffitiMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 0.8), graffitiMat, 64);
    this.graffitiMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.graffitiMesh.frustumCulled = false;
    this.scene.add(this.graffitiMesh);

    // Standing mirrors (very rare) — dark frame + pale reflective glass.
    const mirrorFrameMat = new THREE.MeshLambertMaterial({ color: 0x33261a });
    this.mirrorFrameMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mirrorFrameMat, 12);
    this.mirrorFrameMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mirrorFrameMesh.frustumCulled = false;
    this.scene.add(this.mirrorFrameMesh);
    const mirrorGlassMat = new THREE.MeshBasicMaterial({ map: this.makeGlassTexture() });
    this.mirrorGlassMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.78, 1.82), mirrorGlassMat, 12);
    this.mirrorGlassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mirrorGlassMesh.frustumCulled = false;
    this.scene.add(this.mirrorGlassMesh);

    // Void smoke pool — black blobs that pour out of the walls during the Void.
    const blobTex = this.makeBlobTexture();
    this.smokeMat = new THREE.SpriteMaterial({ map: blobTex, color: 0x000000, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 36; i++) {
      const spr = new THREE.Sprite(this.smokeMat);
      spr.position.set(0, -100, 0);
      spr.scale.setScalar(2);
      this.scene.add(spr);
      this.smoke.push({ spr, vx: 0, vy: 0, vz: 0, life: 0 });
    }

    // Gliding humanoid shadow figures — Void monsters + rare ambient dread.
    const silTex = this.makeSilhouetteTexture();
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.SpriteMaterial({ map: silTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const spr = new THREE.Sprite(mat);
      spr.scale.set(1.15, 2.2, 1);
      spr.position.set(0, -100, 0);
      this.scene.add(spr);
      this.figs.push({ spr, mat, active: false, vx: 0, vz: 0, until: 0, stung: false });
    }

    // Dormant human shadows standing at walls — present before the Void, never move.
    this.wallShadowMat = new THREE.SpriteMaterial({ map: silTex, color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
    for (let i = 0; i < 12; i++) {
      const spr = new THREE.Sprite(this.wallShadowMat);
      spr.scale.set(1.0, 2.0, 1);
      spr.visible = false;
      this.scene.add(spr);
      this.wallShadows.push(spr);
    }

    // Clues — small glowing notes scattered rarely across the world.
    const clueMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
    this.clueMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.34, 0.04), clueMat, 64);
    this.clueMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.clueMesh.frustumCulled = false;
    this.scene.add(this.clueMesh);

    // Water plane for flooded rooms (hidden unless the player is in one).
    // Textured + slightly emissive so it reads as water even in the gloom;
    // the texture drifts and the plane bobs in the frame loop.
    this.waterTex = this.makeWaterTexture();
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshLambertMaterial({
        map: this.waterTex, color: 0xbfe8f0, transparent: true, opacity: 0.82,
        emissive: 0x1a4652, emissiveMap: this.waterTex, emissiveIntensity: 0.55,
      }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0.14;
    this.water.visible = false;
    this.scene.add(this.water);
    this.textures.push(this.waterTex);

    this.textures.push(carpet, ceilTex, wallTex);
  }

  private buildLights() {
    this.ambient = new THREE.AmbientLight(0x5a5230, 0.45);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0xfff2c0, 0x24200e, 0.3);
    this.scene.add(this.hemi);

    // A small pool of warm fluorescent point lights that follow the player,
    // snapped to the nearest ceiling lattice points → moving pools of light.
    for (let i = 0; i < 4; i++) {
      const pl = new THREE.PointLight(0xfff0c4, 6, CELL * 2.4, 2);
      pl.position.set(0, WALL_H - 0.2, 0);
      this.scene.add(pl);
      this.lightPool.push(pl);
    }

    // Flashlight — a spotlight locked to the camera.
    this.flashlight = new THREE.SpotLight(0xfff8e6, 0, 22, Math.PI / 6.5, 0.45, 1.4);
    this.flashlight.position.set(0, 0, 0);
    this.scene.add(this.flashlight);
    this.scene.add(this.flashlight.target);
  }

  // ── Procedural textures (canvas) ─────────────────────────────────────
  // Textures are greyscale so per-region material/instance colour tints them.
  private makeCarpetTexture(): THREE.Texture {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 5000; i++) {
      const v = 90 + Math.floor(Math.random() * 90);
      g.fillStyle = `rgba(${v},${v},${v},0.5)`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 1, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(120, 120);
    return t;
  }

  private makeWallTexture(): THREE.Texture {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 64, 64);
    // faint vertical wallpaper striping + grime
    for (let x = 0; x < 64; x += 4) {
      g.fillStyle = x % 8 === 0 ? 'rgba(120,120,120,0.5)' : 'rgba(170,170,170,0.35)';
      g.fillRect(x, 0, 2, 64);
    }
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(70,70,70,${Math.random() * 0.18})`;
      g.fillRect(Math.random() * 64, Math.random() * 64, 1, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 2);
    return t;
  }

  private makeCeilingTexture(): THREE.Texture {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#b0b0b0'; g.fillRect(0, 0, 128, 128);
    // ceiling tile grid
    g.strokeStyle = 'rgba(70,70,70,0.6)'; g.lineWidth = 2;
    for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    // fluorescent light panel in the centre of each tile block
    g.fillStyle = '#ffffff';
    g.fillRect(40, 8, 48, 12);
    g.fillRect(40, 108, 48, 12);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(60, 60);
    return t;
  }

  private makeWaterTexture(): THREE.Texture {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1b4652'; g.fillRect(0, 0, 128, 128);
    // ripple arcs + sparkle highlights
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(140,220,235,${0.10 + Math.random() * 0.20})`;
      g.lineWidth = 1 + Math.random() * 1.5;
      g.beginPath();
      const x = Math.random() * 128, y = Math.random() * 128, r = 4 + Math.random() * 14;
      const a0 = Math.random() * Math.PI * 2;
      g.arc(x, y, r, a0, a0 + 1.1 + Math.random() * 1.6);
      g.stroke();
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(180,240,250,${0.05 + Math.random() * 0.12})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(30, 30);
    return t;
  }

  private makeGraffitiTexture(): THREE.Texture {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 512, 160);
    g.font = 'bold 52px monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save();
    g.translate(256, 78); g.rotate(-0.03);
    g.fillStyle = 'rgba(120,10,10,0.5)';
    g.fillText('ვოიდი ახლოს არის!', 2, 3);
    g.fillStyle = 'rgba(168,18,14,0.92)';
    g.fillText('ვოიდი ახლოს არის!', 0, 0);
    g.restore();
    // paint drips below the letters
    for (let i = 0; i < 14; i++) {
      g.fillStyle = 'rgba(150,14,10,0.55)';
      g.fillRect(40 + Math.random() * 432, 95 + Math.random() * 12, 2, 6 + Math.random() * 30);
    }
    const t = new THREE.CanvasTexture(c);
    this.textures.push(t);
    return t;
  }

  private makeBlobTexture(): THREE.Texture {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(0,0,0,0.9)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0.45)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    this.textures.push(t);
    return t;
  }

  private makeSilhouetteTexture(): THREE.Texture {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(16,16,24,0.97)';
    (g as any).filter = 'blur(1.5px)';
    g.beginPath(); g.arc(32, 22, 11, 0, Math.PI * 2); g.fill();               // head
    g.beginPath(); g.moveTo(18, 34); g.lineTo(46, 34); g.lineTo(42, 84); g.lineTo(22, 84); g.closePath(); g.fill(); // torso
    g.fillRect(23, 82, 7, 40); g.fillRect(34, 82, 7, 40);                      // legs
    g.fillRect(14, 36, 6, 38); g.fillRect(44, 36, 6, 38);                      // arms
    // faint red eyes — the only thing you notice in the dark
    (g as any).filter = 'none';
    g.fillStyle = 'rgba(255,40,30,0.92)';
    g.beginPath(); g.arc(27.5, 20, 2.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(36.5, 20, 2.2, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c);
    this.textures.push(t);
    return t;
  }

  private makeGlassTexture(): THREE.Texture {
    const c = document.createElement('canvas'); c.width = 32; c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 32, 64);
    grad.addColorStop(0, '#b8ccd4');
    grad.addColorStop(0.45, '#5e7078');
    grad.addColorStop(0.55, '#9fb6be');
    grad.addColorStop(1, '#3c4a50');
    g.fillStyle = grad; g.fillRect(0, 0, 32, 64);
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(4, 60); g.lineTo(24, 8); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.beginPath(); g.moveTo(12, 62); g.lineTo(30, 20); g.stroke();
    const t = new THREE.CanvasTexture(c);
    this.textures.push(t);
    return t;
  }

  // ── World treadmill: rebuild instances & colliders around the player ──
  private rebuildWindow(centerCx: number, centerCz: number) {
    const dummy = new THREE.Object3D();
    const colliders: AABB[] = [];
    const clues: { x: number; z: number; note: string }[] = [];
    const mirrors: { x: number; z: number; key: string }[] = [];
    const col = this._tmpCol;
    let pi = 0, wi = 0, ppi = 0, ci = 0, gli = 0, gri = 0, mi = 0, ws = 0;

    for (let dz = -WINDOW; dz <= WINDOW; dz++) {
      for (let dx = -WINDOW; dx <= WINDOW; dx++) {
        const cx = centerCx + dx, cz = centerCz + dz;
        const wx = cx * CELL, wz = cz * CELL;
        const region = regionTypeFor(cx, cz, this.worldSeed);
        const pal = PALETTES[region];
        col.setHex(pal.wall);

        // pillar
        dummy.position.set(wx, WALL_H / 2, wz);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        this.pillarMesh.setMatrixAt(pi, dummy.matrix);
        this.pillarMesh.setColorAt(pi, col);
        pi++;
        colliders.push({ cx: wx, cz: wz, hx: PHALF, hz: PHALF });

        // wall panel toward +X neighbour (runs along X)
        if (hash3(cx, cz, 11 + this.worldSeed) < WALL_DENSITY) {
          const mx = wx + CELL / 2, mz = wz;
          dummy.position.set(mx, WALL_H / 2, mz);
          dummy.scale.set(CELL - PHALF * 2, 1, WALL_THICK);
          dummy.updateMatrix();
          this.wallMesh.setMatrixAt(wi, dummy.matrix);
          this.wallMesh.setColorAt(wi, col);
          wi++;
          colliders.push({ cx: mx, cz: mz, hx: (CELL - PHALF * 2) / 2, hz: WALL_THICK / 2, wall: true });
          // graffiti on this wall (faces ±Z)
          if (gri < 64 && hash3(cx, cz, 91 + this.worldSeed) < 0.09) {
            const side = hash3(cx, cz, 92) < 0.5 ? 1 : -1;
            dummy.position.set(mx, 1.55, mz + side * (WALL_THICK / 2 + 0.03));
            dummy.scale.set(1, 1, 1);
            dummy.rotation.set(0, side === 1 ? 0 : Math.PI, 0);
            dummy.updateMatrix();
            this.graffitiMesh.setMatrixAt(gri++, dummy.matrix);
            dummy.rotation.set(0, 0, 0);
          }
          // dormant human shadow standing at the wall — it never moves…
          if (ws < 12 && hash3(cx, cz, 717 + this.worldSeed) < 0.05) {
            const side = hash3(cx, cz, 718) < 0.5 ? 1 : -1;
            const spr = this.wallShadows[ws++];
            const sc = 0.9 + hash3(cx, cz, 720) * 0.3;
            spr.scale.set(sc, sc * 2, 1);
            spr.position.set(mx + (hash3(cx, cz, 719) - 0.5) * 2, sc, mz + side * 0.55);
            spr.visible = true;
          }
        }
        // wall panel toward +Z neighbour (runs along Z)
        if (hash3(cx, cz, 23 + this.worldSeed) < WALL_DENSITY) {
          const mx = wx, mz = wz + CELL / 2;
          dummy.position.set(mx, WALL_H / 2, mz);
          dummy.scale.set(WALL_THICK, 1, CELL - PHALF * 2);
          dummy.updateMatrix();
          this.wallMesh.setMatrixAt(wi, dummy.matrix);
          this.wallMesh.setColorAt(wi, col);
          wi++;
          colliders.push({ cx: mx, cz: mz, hx: WALL_THICK / 2, hz: (CELL - PHALF * 2) / 2, wall: true });
          // graffiti on this wall (faces ±X)
          if (gri < 64 && hash3(cx, cz, 93 + this.worldSeed) < 0.09) {
            const side = hash3(cx, cz, 94) < 0.5 ? 1 : -1;
            dummy.position.set(mx + side * (WALL_THICK / 2 + 0.03), 1.55, mz);
            dummy.scale.set(1, 1, 1);
            dummy.rotation.set(0, side === 1 ? Math.PI / 2 : -Math.PI / 2, 0);
            dummy.updateMatrix();
            this.graffitiMesh.setMatrixAt(gri++, dummy.matrix);
            dummy.rotation.set(0, 0, 0);
          }
        }

        // Signature props for special regions — composed, solid, and dense
        // enough to actually furnish the space.
        if (pal.prop && hash3(cx, cz, 55 + this.worldSeed) < 0.75) {
          const ox = wx + CELL / 2, oz = wz + CELL / 2;
          const rot = hash3(cx, cz, 66) < 0.5;
          // Places one coloured box of the composition; `rot` swaps the
          // footprint 90° (offsets + scale) without a rotation matrix.
          const put = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number) => {
            dummy.position.set(ox + (rot ? dz : dx), y, oz + (rot ? -dx : dz));
            dummy.scale.set(rot ? sz : sx, sy, rot ? sx : sz);
            dummy.updateMatrix();
            this.propMesh.setMatrixAt(ppi, dummy.matrix);
            this.propMesh.setColorAt(ppi, this._tmpCol.setHex(color));
            ppi++;
          };
          if (pal.prop === 'shelf') {
            // bookcase + three packed book rows (rows slightly proud so they read)
            put(0, 1.15, 0, 0.62, 2.3, 2.4, 0x3a2c16);
            const bookCols = [0x7a2020, 0x24506e, 0x556b2f, 0x6e5a1f, 0x4a2a5a];
            for (let b = 0; b < 3; b++) {
              put(0, 0.62 + b * 0.62, 0, 0.72, 0.42, 2.15, bookCols[Math.floor(hash3(cx, cz, 100 + b) * bookCols.length) % bookCols.length]);
            }
            colliders.push({ cx: ox, cz: oz, hx: rot ? 1.25 : 0.4, hz: rot ? 0.4 : 1.25 });
          } else if (pal.prop === 'rack') {
            put(0, 1.15, 0, 0.9, 2.3, 1.1, 0x10181a);
            // glowing status strip on the front face
            const glowCols = [0x1fff9a, 0x18d8ff, 0x5aff3a];
            dummy.position.set(ox + (rot ? 0 : 0.49), 1.15, oz + (rot ? 0.49 : 0));
            dummy.scale.set(rot ? 0.86 : 0.05, 1.9, rot ? 0.05 : 0.86);
            dummy.updateMatrix();
            this.glowMesh.setMatrixAt(gli, dummy.matrix);
            this.glowMesh.setColorAt(gli, this._tmpCol.setHex(glowCols[Math.floor(hash3(cx, cz, 105) * glowCols.length) % glowCols.length]));
            gli++;
            colliders.push({ cx: ox, cz: oz, hx: rot ? 0.6 : 0.5, hz: rot ? 0.5 : 0.6 });
          } else {
            // cafeteria table: top + pedestal + two seats
            put(0, 0.76, 0, 1.9, 0.09, 1.0, 0x9a9486);
            put(0, 0.38, 0, 0.5, 0.72, 0.5, 0x6a655c);
            put(0, 0.27, 1.0, 0.5, 0.54, 0.5, 0x565b4e);
            put(0, 0.27, -1.0, 0.5, 0.54, 0.5, 0x565b4e);
            colliders.push({ cx: ox, cz: oz, hx: rot ? 1.3 : 1.0, hz: rot ? 1.0 : 1.3 });
          }
        }

        // Clue (rare, any region) — a glowing note near the cell centre.
        if (ci < 64 && clueAt(cx, cz, this.worldSeed)) {
          const nx = wx + CELL / 2 + (hash3(cx, cz, 71) - 0.5) * 2;
          const nz = wz + CELL / 2 + (hash3(cx, cz, 72) - 0.5) * 2;
          dummy.position.set(nx, 1.15, nz);
          dummy.scale.set(1, 1, 1);
          dummy.rotation.set(0, hash3(cx, cz, 73) * Math.PI, 0);
          dummy.updateMatrix();
          this.clueMesh.setMatrixAt(ci, dummy.matrix);
          ci++;
          clues.push({ x: nx, z: nz, note: noteFor(cx, cz, this.worldSeed) });
        }

        // Standing mirror (rare) — your reflection may not stay put.
        if (mi < 12 && hash3(cx, cz, 3131 + this.worldSeed) < 0.015) {
          const ox = wx + CELL / 2, oz = wz + CELL / 2;
          const mrot = hash3(cx, cz, 3132) < 0.5;
          dummy.rotation.set(0, 0, 0);
          dummy.position.set(ox, 1.02, oz);
          dummy.scale.set(mrot ? 0.1 : 0.95, 2.05, mrot ? 0.95 : 0.1);
          dummy.updateMatrix();
          this.mirrorFrameMesh.setMatrixAt(mi, dummy.matrix);
          // glass, slightly proud of the frame's front face
          dummy.position.set(ox + (mrot ? 0.06 : 0), 1.05, oz + (mrot ? 0 : 0.06));
          dummy.scale.set(1, 1, 1);
          dummy.rotation.set(0, mrot ? Math.PI / 2 : 0, 0);
          dummy.updateMatrix();
          this.mirrorGlassMesh.setMatrixAt(mi, dummy.matrix);
          dummy.rotation.set(0, 0, 0);
          mi++;
          colliders.push({ cx: ox, cz: oz, hx: mrot ? 0.12 : 0.5, hz: mrot ? 0.5 : 0.12 });
          mirrors.push({ x: ox, z: oz, key: `${cx},${cz}` });
        }
      }
    }
    this.pillarMesh.count = pi;
    this.pillarMesh.instanceMatrix.needsUpdate = true;
    if (this.pillarMesh.instanceColor) this.pillarMesh.instanceColor.needsUpdate = true;
    this.wallMesh.count = wi;
    this.wallMesh.instanceMatrix.needsUpdate = true;
    if (this.wallMesh.instanceColor) this.wallMesh.instanceColor.needsUpdate = true;
    this.propMesh.count = ppi;
    this.propMesh.instanceMatrix.needsUpdate = true;
    if (this.propMesh.instanceColor) this.propMesh.instanceColor.needsUpdate = true;
    this.glowMesh.count = gli;
    this.glowMesh.instanceMatrix.needsUpdate = true;
    if (this.glowMesh.instanceColor) this.glowMesh.instanceColor.needsUpdate = true;
    this.graffitiMesh.count = gri;
    this.graffitiMesh.instanceMatrix.needsUpdate = true;
    this.clueMesh.count = ci;
    this.clueMesh.instanceMatrix.needsUpdate = true;
    this.mirrorFrameMesh.count = mi;
    this.mirrorFrameMesh.instanceMatrix.needsUpdate = true;
    this.mirrorGlassMesh.count = mi;
    this.mirrorGlassMesh.instanceMatrix.needsUpdate = true;
    for (let i = ws; i < this.wallShadows.length; i++) this.wallShadows[i].visible = false;
    this.colliders = colliders;
    this.wallColliders = colliders.filter(c => c.wall);
    this.clues = clues;
    this.mirrors = mirrors;
  }

  // ── Per-frame update ─────────────────────────────────────────────────
  private frame() {
    let dt = this.clock.getDelta();
    if (dt > 0.05) dt = 0.05; // clamp big hitches

    // Look
    this.yaw -= this.pendingLook.x * 0.0026;
    this.pitch -= this.pendingLook.y * 0.0026;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
    this.pendingLook.x = 0; this.pendingLook.y = 0;

    // Horizontal movement in camera space
    const speed = this.input.sprint ? SPRINT : WALK;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward = (-sin, -cos); right = (cos, -sin)
    let mx = this.input.move.x, my = this.input.move.y;
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }
    const dirX = (-sin) * my + (cos) * mx;
    const dirZ = (-cos) * my + (-sin) * mx;
    const stepX = dirX * speed * dt;
    const stepZ = dirZ * speed * dt;

    // Collide-and-slide against nearby AABBs (resolve axes independently).
    this.moveWithCollision(stepX, stepZ);

    // Vertical (jump + gravity)
    if (this.jumpQueued && this.onGround) { this.vel.y = JUMP_V; this.onGround = false; }
    this.jumpQueued = false;
    this.vel.y -= GRAVITY * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= EYE) { this.pos.y = EYE; this.vel.y = 0; this.onGround = true; }

    // Treadmill recenter on cell change
    const ccx = Math.round(this.pos.x / CELL), ccz = Math.round(this.pos.z / CELL);
    if (ccx !== this.curCell.x || ccz !== this.curCell.z) {
      this.curCell = { x: ccx, z: ccz };
      this.rebuildWindow(ccx, ccz);
    }

    // Camera transform
    this.camera.position.copy(this.pos);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // Floor/ceiling follow + world-anchored UVs
    this.floor.position.set(this.pos.x, 0, this.pos.z);
    this.ceil.position.set(this.pos.x, WALL_H, this.pos.z);

    // Flooded-room water: drifting ripple texture + gentle bob
    if (this.water.visible) {
      const wt = performance.now() / 1000;
      this.waterTex.offset.set((wt * 0.006) % 1, (wt * 0.004) % 1);
      this.water.position.y = 0.14 + Math.sin(wt * 1.1) * 0.02;
    }

    // Flashlight follows camera
    this.updateFlashlight(dt);

    // Fluorescent light pool → nearest ceiling lattice points
    this.updateLightPool();

    // Dynamic-event lighting (flicker / blackout)
    this.updateEventLighting(performance.now());

    // Rare-region tint + lighting (multiplies on top of the event lighting)
    this.updateRegion(dt);

    // The Void event darkens + thickens fog on top of everything
    this.updateVoid(dt);

    // Smoke, gliding shadows, and random personal scares (always on)
    this.updateDread(dt);

    // Mirrors + clone chase
    this.updateHorror(dt);

    // Remote players (smoothed toward last network position)
    this.updateRemotes(dt);

    // HUD ~5×/s
    this.hudAccum += dt;
    if (this.hudAccum > 0.2) {
      this.hudAccum = 0;
      this.onHud?.({ battery: this.battery, flashlightOn: this.flashOn, level: 'LEVEL 0', x: this.pos.x, z: this.pos.z, event: this.activeEvent, voidPhase: this.voidPhase, region: this.curRegion, nearClue: this.nearClue, chased: !!this.clone });
    }

    // Adaptive resolution: drop pixel ratio if FPS sags, restore when it recovers.
    this.perfAccum += dt; this.perfFrames++;
    if (this.perfAccum >= 1) {
      const fps = this.perfFrames / this.perfAccum;
      const maxPR = Math.min(window.devicePixelRatio || 1, 2);
      if (fps < 45 && this.curPR > 0.72) { this.curPR = Math.max(0.7, this.curPR - 0.15); this.renderer.setPixelRatio(this.curPR); this.resize(); }
      else if (fps > 57 && this.curPR < maxPR) { this.curPR = Math.min(maxPR, this.curPR + 0.1); this.renderer.setPixelRatio(this.curPR); this.resize(); }
      this.perfAccum = 0; this.perfFrames = 0;
    }

    // Camera shake during dangerous events (temporary per-frame offset).
    this.applyShake(dt);

    this.renderer.render(this.scene, this.camera);
  }

  private applyShake(dt: number) {
    const now = performance.now();
    let target = 0;
    if (now < this.blackoutUntil) target = 0.012;
    if (this.voidPhase === 'warning') target = Math.max(target, 0.006 + this.voidLevel * 0.02);
    if (this.voidPhase === 'sweep') target = 0.055;
    this.shake += (target - this.shake) * Math.min(1, dt * 6);
    if (this.shake < 0.0006) return;
    const s = this.shake;
    this.camera.rotation.x += (Math.random() - 0.5) * s;
    this.camera.rotation.y += (Math.random() - 0.5) * s;
    this.camera.position.x += (Math.random() - 0.5) * s * 2;
    this.camera.position.y += (Math.random() - 0.5) * s * 2;
  }

  private moveWithCollision(stepX: number, stepZ: number) {
    // X axis
    this.pos.x += stepX;
    for (const a of this.colliders) {
      if (Math.abs(this.pos.z - a.cz) > a.hz + PLAYER_R) continue;
      const dx = this.pos.x - a.cx;
      const overlapX = a.hx + PLAYER_R - Math.abs(dx);
      if (overlapX > 0 && Math.abs(dx) < a.hx + PLAYER_R) {
        // only if also within Z extent
        if (Math.abs(this.pos.z - a.cz) < a.hz + PLAYER_R) {
          this.pos.x += dx > 0 ? overlapX : -overlapX;
        }
      }
    }
    // Z axis
    this.pos.z += stepZ;
    for (const a of this.colliders) {
      if (Math.abs(this.pos.x - a.cx) > a.hx + PLAYER_R) continue;
      const dz = this.pos.z - a.cz;
      const overlapZ = a.hz + PLAYER_R - Math.abs(dz);
      if (overlapZ > 0 && Math.abs(dz) < a.hz + PLAYER_R) {
        if (Math.abs(this.pos.x - a.cx) < a.hx + PLAYER_R) {
          this.pos.z += dz > 0 ? overlapZ : -overlapZ;
        }
      }
    }
  }

  private updateFlashlight(dt: number) {
    if (this.flashOn && this.battery > 0) {
      this.battery = Math.max(0, this.battery - dt / 240); // ~4 min of continuous light
      if (this.battery === 0) this.flashOn = false;
    }
    const on = this.flashOn && this.battery > 0;
    // slight flicker when low
    const flick = this.battery < 0.15 ? (0.6 + Math.random() * 0.4) : 1;
    this.flashlight.intensity = on ? 3.2 * flick : 0;
    this.flashlight.position.copy(this.pos);
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
    this.flashlight.target.position.copy(this.pos).add(dir.multiplyScalar(6));
  }

  private updateLightPool() {
    // Place the 4 pooled lights at the 4 nearest ceiling lattice points.
    const baseX = Math.round(this.pos.x / CELL);
    const baseZ = Math.round(this.pos.z / CELL);
    const offsets = [[0, 0], [1, 0], [0, 1], [1, 1]];
    for (let i = 0; i < this.lightPool.length; i++) {
      const ox = this.pos.x > baseX * CELL ? offsets[i][0] : -offsets[i][0];
      const oz = this.pos.z > baseZ * CELL ? offsets[i][1] : -offsets[i][1];
      const lx = (baseX + ox) * CELL;
      const lz = (baseZ + oz) * CELL;
      this.lightPool[i].position.set(lx, WALL_H - 0.25, lz);
    }
  }

  // ── Dynamic events ───────────────────────────────────────────────────
  // Server broadcasts synced events; each client runs them locally so the
  // whole instance flickers / goes dark / hears the same sound together.
  triggerEvent(ev: BackroomsEvent) {
    const now = performance.now();
    if (ev.kind === 'flicker') {
      this.flickerUntil = now + (ev.duration ?? 6000);
      this.playPositional('buzz', this.pos.x, this.pos.z);
    } else if (ev.kind === 'blackout') {
      this.blackoutUntil = now + (ev.duration ?? 12000);
      this.startHeartbeat();
      this.playPositional('slam', this.pos.x, this.pos.z);
    } else if (ev.kind === 'ambient') {
      this.playPositional(ev.sound ?? 'footstep', ev.x, ev.z);
    } else if (ev.kind === 'void_warning') {
      this.startVoidWarning();
      this.setShelters(ev.shelters ?? []);
    } else if (ev.kind === 'void_spared') {
      this.playPositional('vent', this.pos.x, this.pos.z);
    } else if (ev.kind === 'void_sweep') {
      this.voidPhase = 'sweep';
    } else if (ev.kind === 'void_teleport') {
      this.voidTeleport(ev.x ?? this.pos.x, ev.z ?? this.pos.z);
    } else if (ev.kind === 'void_end') {
      this.endVoid();
    } else if (ev.kind === 'mimic_kill') {
      // The thing wearing a friend's face got you.
      this.onEffect?.('jumpscare');
      this.playPositional('scream');
      this.playPositional('sting');
      this.voidTeleport(ev.x ?? this.pos.x, ev.z ?? this.pos.z);
    } else if (ev.kind === 'mimic_reveal') {
      this.playPositional('scream', ev.x, ev.z);
    }
  }

  // ── The VOID IS COMING event ─────────────────────────────────────────
  private startVoidWarning() {
    if (this.voidPhase !== 'none') return;
    this.voidPhase = 'warning';
    this.startHeartbeat();
    this.startVoidBass();
    // whispers drift in around the player while tension builds
    if (!this.whisperTimer) {
      this.whisperTimer = setInterval(() => {
        const ang = Math.random() * Math.PI * 2, d = 3 + Math.random() * 8;
        this.playPositional(Math.random() < 0.5 ? 'whisper' : 'scrape', this.pos.x + Math.cos(ang) * d, this.pos.z + Math.sin(ang) * d);
      }, 2200);
    }
  }

  private voidTeleport(x: number, z: number) {
    this.pos.set(x, EYE, z);
    this.vel.set(0, 0, 0);
    this.curCell = { x: 9999, z: 9999 }; // force a world rebuild around the new spot
  }

  private endVoid() {
    this.voidPhase = 'none';
    this.stopHeartbeat();
    this.stopVoidBass();
    this.clearShelters();
    if (this.whisperTimer) { clearInterval(this.whisperTimer); this.whisperTimer = null; }
  }

  // ── Void shelters — glowing green safe zones players can run to ──────
  private setShelters(list: { x: number; z: number }[]) {
    this.clearShelters();
    if (!list.length) return;
    const g = new THREE.Group();
    for (const s of list) {
      // fog:false so the beacon is visible from far away — that's the point.
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 1.1, WALL_H, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x2aff8a, transparent: true, opacity: 0.16, fog: false, side: THREE.DoubleSide, depthWrite: false }),
      );
      beam.position.set(s.x, WALL_H / 2, s.z);
      g.add(beam);
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, WALL_H, 8),
        new THREE.MeshBasicMaterial({ color: 0xaaffcc, transparent: true, opacity: 0.85, fog: false, depthWrite: false }),
      );
      core.position.copy(beam.position);
      g.add(core);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.0, 1.3, 24),
        new THREE.MeshBasicMaterial({ color: 0x2aff8a, transparent: true, opacity: 0.5, fog: false, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(s.x, 0.04, s.z);
      g.add(ring);
    }
    this.scene.add(g);
    this.shelterGroup = g;
  }

  private clearShelters() {
    if (!this.shelterGroup) return;
    this.scene.remove(this.shelterGroup);
    this.shelterGroup.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
    this.shelterGroup = null;
  }

  private startVoidBass() {
    const ctx = this.audioCtx; if (!ctx || this.voidBass) return;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 34;
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 51; // slight beat
    const g = ctx.createGain(); g.gain.value = 0.0001;
    o.connect(g); sub.connect(g); g.connect(ctx.destination);
    o.start(); sub.start();
    this.voidBass = o; this.voidBassGain = g;
    // keep a handle to stop the sub too
    (this.voidBass as any)._sub = sub;
  }
  private stopVoidBass() {
    try {
      this.voidBassGain?.gain.setTargetAtTime(0.0001, this.audioCtx?.currentTime ?? 0, 0.4);
      const o = this.voidBass; const sub = (o as any)?._sub as OscillatorNode | undefined;
      setTimeout(() => { try { o?.stop(); sub?.stop(); } catch { /* ignore */ } }, 800);
    } catch { /* ignore */ }
    this.voidBass = null; this.voidBassGain = null;
  }

  private updateVoid(dt: number) {
    const target = this.voidPhase === 'sweep' ? 1 : this.voidPhase === 'warning' ? 0.55 : 0;
    // ease toward target (sweep ramps faster than the slow warning build)
    const rate = this.voidPhase === 'sweep' ? 1.4 : 0.12;
    this.voidLevel += (target - this.voidLevel) * Math.min(1, dt * rate);
    const v = this.voidLevel;
    if (v < 0.01 && this.voidPhase === 'none') {
      // idle — make sure the world is fully restored
      (this.scene.fog as THREE.FogExp2).density = this.baseFogDensity;
      this.renderer.setClearColor(0x0a0a06, 1);
      return;
    }
    // Fog thickens dramatically → the black fog "swallows" the corridors.
    (this.scene.fog as THREE.FogExp2).density = this.baseFogDensity + v * (0.55 - this.baseFogDensity);
    // Everything darkens toward black.
    const dark = 1 - v * 0.96;
    for (const pl of this.lightPool) pl.intensity *= dark;
    this.ambient.intensity *= dark;
    this.hemi.intensity *= dark;
    (this.ceil.material as THREE.MeshLambertMaterial).emissiveIntensity *= dark;
    this.renderer.setClearColor(0x000000, 1);
    // Bass swells with tension.
    if (this.voidBassGain && this.audioCtx) this.voidBassGain.gain.setTargetAtTime(0.02 + v * 0.22, this.audioCtx.currentTime, 0.2);
  }

  // ── Dread: smoke, gliding shadows, and random personal scares ─────────
  // Runs every frame (unlike updateVoid, which bails while idle) so ambient
  // shadow figures keep moving outside the Void too.
  private updateDread(dt: number) {
    const v = this.voidLevel;
    // Black smoke pours out of the walls and swallows the corridors.
    if (v > 0.04 && this.smoke.length) {
      this.smokeMat.opacity = Math.min(0.85, v);
      for (const s of this.smoke) {
        s.life -= dt;
        s.spr.position.x += s.vx * dt;
        s.spr.position.y += s.vy * dt;
        s.spr.position.z += s.vz * dt;
        const dx = s.spr.position.x - this.pos.x, dz = s.spr.position.z - this.pos.z;
        if (s.life <= 0 || dx * dx + dz * dz > 900) this.respawnSmoke(s);
      }
    } else if (this.smokeMat.opacity > 0) {
      this.smokeMat.opacity = Math.max(0, this.smokeMat.opacity - dt * 0.6);
    }

    // Gliding humanoid shadows — the only things that move in the dark.
    const allowed = this.voidPhase === 'sweep' ? 3 : this.voidPhase === 'warning' ? 1 : 0;
    let active = 0;
    for (const f of this.figs) if (f.active) active++;
    if (active < allowed && Math.random() < dt * 0.5) {
      const f = this.figs.find(x => !x.active);
      if (f) this.launchFig(f);
    }
    const nowMs = performance.now();
    for (const f of this.figs) {
      if (!f.active) continue;
      f.spr.position.x += f.vx * dt;
      f.spr.position.z += f.vz * dt;
      f.spr.position.y = 1.05 + Math.sin(nowMs / 300) * 0.06;
      const dx = f.spr.position.x - this.pos.x, dz = f.spr.position.z - this.pos.z;
      const d2 = dx * dx + dz * dz;
      if (!f.stung && d2 < 4) {
        // it passed right next to you
        f.stung = true;
        this.playPositional('sting', f.spr.position.x, f.spr.position.z);
        this.onEffect?.('shadow');
      }
      if (nowMs > f.until || d2 > 1100) { f.active = false; f.mat.opacity = 0; f.spr.position.y = -100; }
    }

    // Personal dread scheduler — even in "calm" stretches something happens
    // every minute or two: whispers, a shadow gliding by, flickering lights,
    // a heartbeat… and, very rarely, a face in the dark.
    if (this.nextDreadAt === 0) this.nextDreadAt = nowMs + 25000 + Math.random() * 25000;
    if (nowMs >= this.nextDreadAt && this.voidPhase === 'none' && !this.clone) {
      this.nextDreadAt = nowMs + 50000 + Math.random() * 80000;
      const r = Math.random();
      const ang2 = Math.random() * Math.PI * 2, dd = 5 + Math.random() * 9;
      const sx = this.pos.x + Math.cos(ang2) * dd, sz = this.pos.z + Math.sin(ang2) * dd;
      if (r < 0.4) {
        this.playPositional(Math.random() < 0.5 ? 'whisper' : 'footstep', sx, sz);
      } else if (r < 0.65) {
        const f = this.figs.find(x => !x.active);
        if (f) this.launchFig(f);
      } else if (r < 0.8) {
        this.flickerUntil = nowMs + 2600;
        this.playPositional('buzz', sx, sz);
      } else if (r < 0.93) {
        this.startHeartbeat();
        this.playPositional('growl', sx, sz);
        setTimeout(() => {
          if (this.voidPhase === 'none' && performance.now() > this.blackoutUntil && !this.clone) this.stopHeartbeat();
        }, 7000);
      } else {
        // rare pure jumpscare — a face in the dark, then nothing
        this.onEffect?.('jumpscare');
        this.playPositional('sting');
        this.playPositional('scream');
      }
    }
  }

  private respawnSmoke(s: { spr: THREE.Sprite; vx: number; vy: number; vz: number; life: number }) {
    const walls = this.wallColliders;
    if (!walls.length) { s.life = 1; return; }
    // prefer a wall near the player so the smoke visibly pours out around them
    let w = walls[Math.floor(Math.random() * walls.length)];
    for (let i = 0; i < 6; i++) {
      const cand = walls[Math.floor(Math.random() * walls.length)];
      const d2 = (cand.cx - this.pos.x) * (cand.cx - this.pos.x) + (cand.cz - this.pos.z) * (cand.cz - this.pos.z);
      if (d2 < 400) { w = cand; break; }
    }
    s.spr.position.set(w.cx + (Math.random() - 0.5) * 3, 0.4 + Math.random() * 0.8, w.cz + (Math.random() - 0.5) * 3);
    s.vx = (Math.random() - 0.5) * 0.5;
    s.vy = 0.25 + Math.random() * 0.3;
    s.vz = (Math.random() - 0.5) * 0.5;
    s.life = 4 + Math.random() * 5;
    s.spr.scale.setScalar(1.6 + Math.random() * 2.2);
  }

  private launchFig(f: { spr: THREE.Sprite; mat: THREE.SpriteMaterial; active: boolean; vx: number; vz: number; until: number; stung: boolean }) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 13 + Math.random() * 6;
    const sx = this.pos.x + Math.cos(ang) * dist;
    const sz = this.pos.z + Math.sin(ang) * dist;
    // aim to pass near — not exactly through — the player
    const off = (Math.random() - 0.5) * 5;
    const tx = this.pos.x + Math.cos(ang + Math.PI / 2) * off;
    const tz = this.pos.z + Math.sin(ang + Math.PI / 2) * off;
    const dx = tx - sx, dz = tz - sz;
    const len = Math.hypot(dx, dz) || 1;
    const speed = 2.4 + Math.random() * 1.2;
    f.vx = dx / len * speed;
    f.vz = dz / len * speed;
    f.spr.position.set(sx, 1.05, sz);
    f.mat.opacity = 0.8;
    f.active = true;
    f.stung = false;
    f.until = performance.now() + 10000;
    this.playPositional('growl', sx, sz);
  }

  // ── Mirrors + the clone that steps out of them ────────────────────────
  private updateHorror(dt: number) {
    const now = performance.now();
    // Stand too close to a mirror and your reflection steps out.
    if (!this.clone) {
      for (const m of this.mirrors) {
        const dx = m.x - this.pos.x, dz = m.z - this.pos.z;
        const d2 = dx * dx + dz * dz;
        // faint whispering pulls you toward nearby mirrors
        if (d2 < 49 && Math.random() < dt * 0.12) this.playPositional('whisper', m.x, m.z);
        if (d2 > 6.8) continue;
        if (now < (this.mirrorCooldown.get(m.key) ?? 0)) continue;
        this.mirrorCooldown.set(m.key, now + 75000);
        this.spawnClone(m.x, m.z);
        break;
      }
    }
    if (!this.clone) return;
    const c = this.clone;
    const dx = this.pos.x - c.group.position.x, dz = this.pos.z - c.group.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.001) {
      // faster than walking, slower than sprinting — you can escape, barely
      const step = Math.min(d, 4.6 * dt);
      c.group.position.x += dx / d * step;
      c.group.position.z += dz / d * step;
      c.group.rotation.y = Math.atan2(-dx, -dz);
    }
    c.group.position.y = Math.abs(Math.sin(now / 160)) * 0.08;
    if (d < 0.95) {
      // caught — jumpscare, wake up somewhere else
      this.onEffect?.('jumpscare');
      this.playPositional('scream');
      this.playPositional('sting');
      this.scatterSelf();
      this.removeClone();
    } else if (now > c.until) {
      // outran it — it dissolves
      this.removeClone();
      this.playPositional('vent', this.pos.x, this.pos.z);
    }
  }

  private spawnClone(x: number, z: number) {
    const g = this.buildHumanoid(0, 0, true);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.clone = { group: g, until: performance.now() + 11000 };
    this.startHeartbeat();
    this.playPositional('sting', x, z);
    this.playPositional('scream', x, z);
  }

  private removeClone() {
    if (!this.clone) return;
    this.scene.remove(this.clone.group);
    this.clone.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
    this.clone = null;
    // don't kill the heartbeat if a blackout or the Void still needs it
    if (this.voidPhase === 'none' && performance.now() > this.blackoutUntil) this.stopHeartbeat();
  }

  // Respawn at a random distant unsealed cell (mirror-clone death).
  private scatterSelf() {
    const baseCx = Math.round(this.pos.x / CELL), baseCz = Math.round(this.pos.z / CELL);
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * Math.PI * 2;
      const cells = 20 + Math.floor(Math.random() * 25);
      const cx = baseCx + Math.round(Math.cos(ang) * cells);
      const cz = baseCz + Math.round(Math.sin(ang) * cells);
      if (cellSealed(cx, cz, this.worldSeed)) continue;
      this.voidTeleport(cx * CELL + CELL / 2, cz * CELL + CELL / 2);
      return;
    }
  }

  // ── Rare regions + clue proximity (applied after event lighting) ─────
  private updateRegion(dt: number) {
    const region = regionTypeFor(Math.round(this.pos.x / CELL), Math.round(this.pos.z / CELL), this.worldSeed);
    this.curRegion = region;
    const pal = PALETTES[region];
    const k = Math.min(1, dt * 2.2);
    this.regionCol.floor.lerp(this._tmpCol.setHex(pal.floor), k);
    this.regionCol.ceil.lerp(this._tmpCol.setHex(pal.ceil), k);
    this.regionCol.fog.lerp(this._tmpCol.setHex(pal.fog), k);
    this.regionCol.light += (pal.light - this.regionCol.light) * k;
    (this.floor.material as THREE.MeshLambertMaterial).color.copy(this.regionCol.floor);
    (this.ceil.material as THREE.MeshLambertMaterial).color.copy(this.regionCol.ceil);
    (this.scene.fog as THREE.FogExp2).color.copy(this.regionCol.fog);
    const lm = this.regionCol.light;
    for (const pl of this.lightPool) pl.intensity *= lm;
    this.ambient.intensity *= lm;
    this.hemi.intensity *= lm;

    // Flood water follows the player, shown only inside flooded rooms.
    this.water.visible = region === 'flood';
    if (region === 'flood') this.water.position.set(this.pos.x, 0.14, this.pos.z);

    // Clue proximity → interact prompt
    let near = false;
    for (const c of this.clues) {
      const dx = c.x - this.pos.x, dz = c.z - this.pos.z;
      if (dx * dx + dz * dz < 3.24) { near = true; break; } // 1.8m
    }
    this.nearClue = near;
  }

  // Read the nearest clue within interact range (or null).
  readClue(): string | null {
    let best: string | null = null; let bd = 3.24; // 1.8m²
    for (const c of this.clues) {
      const dx = c.x - this.pos.x, dz = c.z - this.pos.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = c.note; }
    }
    return best;
  }

  private updateEventLighting(now: number) {
    const blackout = now < this.blackoutUntil;
    const flicker = !blackout && now < this.flickerUntil;
    let poolMul = 1, ambMul = 1, emis = 0.9;
    if (blackout) {
      // Emergency lighting only — near-dark, faint red; your flashlight matters now.
      poolMul = 0.05; ambMul = 0.1; emis = 0.04;
      this.activeEvent = 'blackout';
    } else if (flicker) {
      const on = Math.random() > 0.35;
      poolMul = on ? 1 : 0.1; ambMul = on ? 1 : 0.4; emis = on ? 0.9 : 0.12;
      this.activeEvent = 'flicker';
    } else {
      if (this.activeEvent) this.stopHeartbeat();
      this.activeEvent = null;
    }
    for (const pl of this.lightPool) pl.intensity = 6 * poolMul;
    this.ambient.intensity = 0.45 * ambMul;
    this.ambient.color.setHex(blackout ? 0x5a1e12 : 0x5a5230);
    this.hemi.intensity = 0.3 * ambMul;
    (this.ceil.material as THREE.MeshLambertMaterial).emissiveIntensity = emis;
  }

  // ── Positional horror one-shots (procedural, no assets) ──────────────
  private playPositional(sound: string, x?: number, z?: number) {
    const ctx = this.audioCtx; if (!ctx) return;
    const px = x ?? this.pos.x, pz = z ?? this.pos.z;
    const dx = px - this.pos.x, dz = pz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 46) return;
    const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
    const pan = dist > 0.001 ? Math.max(-1, Math.min(1, (dx * cosY - dz * sinY) / dist)) : 0;
    let g = Math.max(0, 1 - dist / 46); g = g * g;
    const panner = ctx.createStereoPanner(); panner.pan.value = pan;
    const out = ctx.createGain(); out.gain.value = g;
    panner.connect(out).connect(ctx.destination);
    this.synth(sound, ctx, panner, out.gain);
  }

  private noiseSource(ctx: AudioContext, dur: number): AudioBufferSourceNode {
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; return src;
  }

  private synth(sound: string, ctx: AudioContext, dest: AudioNode, outGain: AudioParam) {
    const t = ctx.currentTime;
    const env = (node: AudioNode, peak: number, attack: number, dur: number) => {
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      node.connect(g).connect(dest); return g;
    };
    switch (sound) {
      case 'footstep': {
        for (let i = 0; i < 4; i++) {
          const tt = t + i * 0.34;
          const src = this.noiseSource(ctx, 0.12);
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
          const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, tt);
          g.gain.exponentialRampToValueAtTime(0.9, tt + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.12);
          src.connect(lp).connect(g).connect(dest); src.start(tt); src.stop(tt + 0.13);
        }
        break;
      }
      case 'whisper': {
        const src = this.noiseSource(ctx, 1.6); src.loop = false;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 6;
        const trem = ctx.createGain();
        const lfo = ctx.createOscillator(); lfo.frequency.value = 7; const lg = ctx.createGain(); lg.gain.value = 0.5;
        lfo.connect(lg).connect(trem.gain); trem.gain.value = 0.5;
        env(trem, 0.5, 0.2, 1.6); // trem → env gain → dest
        src.connect(bp).connect(trem);
        src.start(t); src.stop(t + 1.6); lfo.start(t); lfo.stop(t + 1.6);
        break;
      }
      case 'buzz': {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 120;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 4;
        o.connect(bp); env(bp, 0.35, 0.05, 0.9); o.start(t); o.stop(t + 0.95);
        break;
      }
      case 'slam': {
        const src = this.noiseSource(ctx, 0.25);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
        const g = ctx.createGain(); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        src.connect(lp).connect(g).connect(dest); src.start(t); src.stop(t + 0.3);
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
        env(o, 0.9, 0.005, 0.32); o.start(t); o.stop(t + 0.33);
        break;
      }
      case 'scrape': {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(180, t); o.frequency.linearRampToValueAtTime(90, t + 1.1);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 12;
        o.connect(bp); env(bp, 0.4, 0.1, 1.2); o.start(t); o.stop(t + 1.2);
        break;
      }
      case 'scream': {
        const src = this.noiseSource(ctx, 1.2);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9;
        bp.frequency.setValueAtTime(500, t); bp.frequency.linearRampToValueAtTime(1600, t + 0.5); bp.frequency.linearRampToValueAtTime(700, t + 1.1);
        src.connect(bp); env(bp, 0.5, 0.15, 1.2); src.start(t); src.stop(t + 1.2);
        break;
      }
      case 'vent': {
        const src = this.noiseSource(ctx, 1.4);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
        src.connect(lp); env(lp, 0.3, 0.3, 1.4); src.start(t); src.stop(t + 1.4);
        break;
      }
      case 'sting': {
        // harsh detuned screech — jumpscare accent
        const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.setValueAtTime(680, t); o1.frequency.linearRampToValueAtTime(920, t + 0.35);
        const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.setValueAtTime(713, t); o2.frequency.linearRampToValueAtTime(870, t + 0.35);
        env(o1, 0.4, 0.01, 0.5); env(o2, 0.4, 0.01, 0.5);
        o1.start(t); o1.stop(t + 0.5); o2.start(t); o2.stop(t + 0.5);
        break;
      }
      case 'growl': {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(58, t); o.frequency.linearRampToValueAtTime(42, t + 1.2);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
        o.connect(lp); env(lp, 0.7, 0.08, 1.3);
        o.start(t); o.stop(t + 1.3);
        break;
      }
      case 'rumble':
      default: {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 44;
        env(o, 0.6, 0.4, 2.2); o.start(t); o.stop(t + 2.3);
        break;
      }
    }
    void outGain;
  }

  private startHeartbeat() {
    if (this.heartTimer || !this.audioCtx) return;
    const beat = () => {
      const ctx = this.audioCtx; if (!ctx) return;
      this.thump(ctx, 0.9);
      setTimeout(() => { if (this.audioCtx) this.thump(this.audioCtx, 0.55); }, 190);
    };
    beat();
    this.heartTimer = setInterval(beat, 1150);
  }
  private stopHeartbeat() { if (this.heartTimer) { clearInterval(this.heartTimer); this.heartTimer = null; } }
  private thump(ctx: AudioContext, scale: number) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55 * scale, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.26);
  }

  // ── Ambient audio (fluorescent hum + low rumble) ─────────────────────
  private startAudio() {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx: AudioContext = new Ctx();
      this.audioCtx = ctx;

      const master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);

      // Low room rumble
      const rumble = ctx.createOscillator(); rumble.type = 'sine'; rumble.frequency.value = 48;
      const rg = ctx.createGain(); rg.gain.value = 0.05;
      rumble.connect(rg).connect(master); rumble.start();

      // Fluorescent buzz: filtered noise around ~2kHz, very quiet
      const bufSize = 2 * ctx.sampleRate;
      const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = noiseBuf; noise.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = 8;
      const ng = ctx.createGain(); ng.gain.value = 0.015;
      noise.connect(bp).connect(ng).connect(master); noise.start();

      // A faint 120Hz mains hum
      const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 120;
      const hg = ctx.createGain(); hg.gain.value = 0.008;
      const hlp = ctx.createBiquadFilter(); hlp.type = 'lowpass'; hlp.frequency.value = 400;
      hum.connect(hlp).connect(hg).connect(master); hum.start();

      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      this.audioNodes = { stop: () => { try { rumble.stop(); noise.stop(); hum.stop(); } catch { /* ignore */ } } };
    } catch { /* audio optional */ }
  }
}
