// ── Deathrun — renderer + game loop ───────────────────────────────────
// First-person, because bhop is a first-person skill: you read your speed off
// the HUD and your landing off the horizon. The engine owns rendering, the
// local player's movement, trap playback and remote avatars; every rule
// (who is the Death, when the round ends) lives on the server.
//
// Performance: the whole temple is ~180 boxes, so brushes are merged into ONE
// mesh per material — a dozen draw calls for the entire map. Trap parts stay
// separate because they move, but there are only a few dozen of those.
import * as THREE from 'three';
import { CS, moveBody, speedUnits, type Body, type Box } from './physics';
import { partAt, type DrMap, type MatKey, type Trap, inZone } from './map';

export interface DrHud {
  speed: number;          // u/s
  onGround: boolean;
  progress: number;       // 0..1 along the course
  alive: boolean;
  finished: boolean;
  role: 'runner' | 'death';
  nearTrap: Trap | null;  // the Death is standing at a button
  trapReady: boolean;
  target: string | null;  // duel: who your swing would hit
  hp: number;
}

export interface RemoteState { x: number; y: number; z: number; ry: number; name: string; death: boolean; alive: boolean }

const MAT: Record<MatKey, THREE.MeshStandardMaterialParameters> = {
  stone: { color: 0xbfa980, roughness: 0.92 },
  stoneDark: { color: 0x8d7a58, roughness: 0.95 },
  sand: { color: 0xd9c391, roughness: 0.96 },
  gold: { color: 0xd9a441, roughness: 0.42, metalness: 0.65 },
  wood: { color: 0x7a5636, roughness: 0.9 },
  metal: { color: 0x8b8f98, roughness: 0.42, metalness: 0.75 },
  lava: { color: 0xff5a1e, roughness: 0.6, emissive: 0xff3300, emissiveIntensity: 0.75 },
  water: { color: 0x2f6f8f, roughness: 0.2, metalness: 0.5 },
  glass: { color: 0x9fd8ee, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.28 },
  trim: { color: 0xc0a060, roughness: 0.6 },
  blade: { color: 0xd6dae0, roughness: 0.28, metalness: 0.9 },
  spike: { color: 0xa8adb6, roughness: 0.35, metalness: 0.8 },
  grass: { color: 0x4f8236, roughness: 1 },
};

const EYE_LERP = 14;

export class DeathrunEngine {
  onHud: ((h: DrHud) => void) | null = null;
  onDie: ((cause: string) => void) | null = null;
  onFinish: (() => void) | null = null;
  input = { fwd: 0, side: 0, jump: false, duck: false, run: true };

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private raf = 0;
  private disposed = false;
  private clock = new THREE.Clock();

  private map: DrMap;
  private solidBoxes: Box[] = [];        // static world
  private trapMeshes = new Map<string, THREE.Mesh[]>();
  private trapFiredAt = new Map<string, number>();   // trapId → performance-clock seconds
  private gateMesh: THREE.Mesh | null = null;
  private gateOpen = false;

  private body: Body;
  private yaw = -Math.PI / 2;
  private pitch = 0;
  private eyeY = 0;
  private role: 'runner' | 'death' = 'runner';
  private alive = true;
  private finished = false;
  private hp = 3;

  private remotes = new Map<string, { s: RemoteState; g: THREE.Group; cur: { x: number; y: number; z: number; ry: number } }>();
  private pendingLook = { x: 0, y: 0 };
  private hudAccum = 0;
  private nearTrap: Trap | null = null;
  private trapCooldown: Record<string, number> = {};
  private duelTarget: string | null = null;
  private swingT = -1;
  private swordGroup: THREE.Group | null = null;
  private perfAccum = 0; private perfFrames = 0;
  private isMobile = false;

  constructor(canvas: HTMLCanvasElement, map: DrMap) {
    this.map = map;
    this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.isMobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.3 : 1.7));
    this.renderer.shadowMap.enabled = false;         // a corridor of boxes reads fine with baked-feeling light
    this.camera = new THREE.PerspectiveCamera(96, 1, 0.05, 700);   // wide FOV: bhop tradition, and it sells speed

    this.scene.background = new THREE.Color(map.sky);
    this.scene.fog = new THREE.FogExp2(map.fog.color, map.fog.density);

    this.body = { pos: { ...map.runnerSpawns[0] }, vel: { x: 0, y: 0, z: 0 }, onGround: false, ducking: false };
    this.eyeY = this.body.pos.y + CS.eye;

    this.buildLights();
    this.buildWorld();
    this.buildSky();
    this.buildSword();
    this.resize();
    this.loop();
  }

  // ── setup ───────────────────────────────────────────────────────────
  private buildLights() {
    this.scene.add(new THREE.AmbientLight(0xffe6c0, 1.15));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.5);
    sun.position.set(-60, 90, 40);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8fb0d8, 0.5);
    fill.position.set(40, 30, -60);
    this.scene.add(fill);
  }

  private buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x3f7fc4) }, bot: { value: new THREE.Color(this.map.sky) } },
      vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 bot; void main(){ float h=clamp((normalize(vP).y+0.12)/0.75,0.0,1.0); gl_FragColor=vec4(mix(bot,top,h),1.0);}',
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(600, 20, 12), mat));
  }

  /** Merge every static brush into one mesh per material — 12 draw calls, not 180. */
  private buildWorld() {
    const byMat = new Map<MatKey, THREE.BufferGeometry[]>();
    for (const b of this.map.brushes) {
      const g = new THREE.BoxGeometry(b.box.hx * 2, b.box.hy * 2, b.box.hz * 2);
      g.translate(b.box.x, b.box.y, b.box.z);
      if (!byMat.has(b.mat)) byMat.set(b.mat, []);
      byMat.get(b.mat)!.push(g);
      if (b.solid !== false) this.solidBoxes.push(b.box);
      if (b.deadly) this.staticDeadly.push(b.box);
    }
    for (const [mat, geos] of byMat) {
      const merged = mergeBoxes(geos);
      const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial(MAT[mat]));
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }
    // trap parts stay individual — they move
    for (const trap of this.map.traps) {
      const meshes = trap.parts.map(p => {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(p.box.hx * 2, p.box.hy * 2, p.box.hz * 2),
          new THREE.MeshStandardMaterial(MAT[p.mat]),
        );
        m.position.set(p.box.x, p.box.y, p.box.z);
        this.scene.add(m);
        return m;
      });
      this.trapMeshes.set(trap.id, meshes);
      // the Death's button
      const btn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.5, 0.9, 12),
        new THREE.MeshStandardMaterial({ color: 0x8b1a1a, roughness: 0.5, emissive: 0x4a0808, emissiveIntensity: 0.6 }),
      );
      btn.position.set(trap.button.x, trap.button.y - 0.55, trap.button.z);
      btn.name = `btn:${trap.id}`;
      this.scene.add(btn);
    }
    // the start gate — a slab that sinks when the round begins
    const gb = this.map.startGate;
    this.gateMesh = new THREE.Mesh(
      new THREE.BoxGeometry(gb.hx * 2, gb.hy * 2, gb.hz * 2),
      new THREE.MeshStandardMaterial({ color: 0x6d5a3a, roughness: 0.8, metalness: 0.2 }),
    );
    this.gateMesh.position.set(gb.x, gb.y, gb.z);
    this.scene.add(this.gateMesh);
    this.solidBoxes.push(gb);
    this.gateBox = gb;
  }
  private staticDeadly: Box[] = [];
  private gateBox: Box | null = null;

  private buildSword() {
    // held sword, parented to the camera — pure viewmodel, no collision
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.9, 0.11), new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.25, metalness: 0.9 }));
    blade.position.set(0, 0.5, 0); g.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.22, 4), new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.25, metalness: 0.9 }));
    tip.position.set(0, 1.03, 0); tip.rotation.y = Math.PI / 4; g.add(tip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.4, metalness: 0.7 }));
    guard.position.set(0, 0.06, 0); g.add(guard);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.24, 8), new THREE.MeshStandardMaterial({ color: 0x4a2f1e, roughness: 0.9 }));
    grip.position.set(0, -0.09, 0); g.add(grip);
    g.position.set(0.34, -0.34, -0.55);
    g.rotation.set(0.35, -0.25, 0.28);
    g.visible = false;
    this.camera.add(g);
    this.scene.add(this.camera);
    this.swordGroup = g;
  }

  // ── public API ──────────────────────────────────────────────────────
  addLook(dx: number, dy: number) { this.pendingLook.x += dx; this.pendingLook.y += dy; }
  getYaw() { return this.yaw; }
  getPos() { return { x: this.body.pos.x, y: this.body.pos.y, z: this.body.pos.z }; }

  setRole(role: 'runner' | 'death') { this.role = role; }
  setHp(hp: number) { this.hp = hp; }
  setAlive(a: boolean) { this.alive = a; }

  /** Teleport for a phase change (round start, duel). */
  spawnAt(p: { x: number; y: number; z: number }, yaw: number) {
    this.body.pos = { x: p.x, y: p.y, z: p.z };
    this.body.vel = { x: 0, y: 0, z: 0 };
    this.body.onGround = false;
    this.yaw = yaw; this.pitch = 0;
    this.eyeY = p.y + CS.eye;
    this.alive = true; this.finished = false;
  }

  setGateOpen(open: boolean) {
    if (open === this.gateOpen) return;
    this.gateOpen = open;
    if (!this.gateBox || !this.gateMesh) return;
    if (open) {
      const i = this.solidBoxes.indexOf(this.gateBox);
      if (i >= 0) this.solidBoxes.splice(i, 1);
      this.gateMesh.visible = false;
    } else {
      if (!this.solidBoxes.includes(this.gateBox)) this.solidBoxes.push(this.gateBox);
      this.gateMesh.visible = true;
    }
  }

  /** Server says a trap fired `ageMs` ago — replay its keyframes from there. */
  fireTrap(trapId: string, ageMs: number) {
    this.trapFiredAt.set(trapId, this.clock.elapsedTime - ageMs / 1000);
  }
  setTrapCooldowns(cd: Record<string, number>) { this.trapCooldown = cd; }

  /** The Death presses the button they're standing at. */
  pressTrap(): Trap | null { return this.nearTrap; }

  /** Duel: who a swing right now would hit. */
  swingTarget(): string | null { return this.duelTarget; }
  playSwing(remoteId?: string) {
    if (!remoteId) { this.swingT = 0; return; }
    const r = this.remotes.get(remoteId);
    if (r) r.g.userData.swing = 0;
  }

  upsertRemote(id: string, s: RemoteState) {
    let e = this.remotes.get(id);
    if (!e) {
      const g = buildRunner(s.death);
      this.scene.add(g);
      e = { s, g, cur: { x: s.x, y: s.y, z: s.z, ry: s.ry } };
      this.remotes.set(id, e);
    }
    e.s = s;
    if (e.g.userData.death !== s.death) {           // role changed between rounds
      this.scene.remove(e.g); disposeTree(e.g);
      e.g = buildRunner(s.death); this.scene.add(e.g);
    }
    e.g.visible = s.alive;
  }
  removeRemote(id: string) {
    const e = this.remotes.get(id);
    if (!e) return;
    this.scene.remove(e.g); disposeTree(e.g);
    this.remotes.delete(id);
  }

  resize() {
    const c = this.renderer.domElement;
    const w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose?.();
    });
    this.renderer.dispose();
  }

  // ── frame ───────────────────────────────────────────────────────────
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = this.clock.getDelta();
    if (dt > 0.05) dt = 0.05;                        // a long stall must not teleport you
    const now = this.clock.elapsedTime;

    // look
    this.yaw -= this.pendingLook.x * 0.0032;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - this.pendingLook.y * 0.0028));
    this.pendingLook.x = 0; this.pendingLook.y = 0;

    this.updateTraps(now);

    if (this.alive) {
      this.body.ducking = this.input.duck && this.body.onGround;
      moveBody(this.body, {
        fwd: this.input.fwd, side: this.input.side, yaw: this.yaw,
        jump: this.input.jump, duck: this.input.duck,
      }, dt, { boxes: this.solidBoxes }, CS);
      this.checkHazards();
    }

    // eye: follow the feet with a little lag so landings have weight
    const targetEye = this.body.pos.y + (this.body.ducking ? CS.eye * 0.55 : CS.eye);
    this.eyeY += (targetEye - this.eyeY) * Math.min(1, dt * EYE_LERP);
    this.camera.position.set(this.body.pos.x, this.eyeY, this.body.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    this.updateNearTrap();
    this.updateRemotes(dt);
    this.updateSword(dt);

    this.hudAccum += dt;
    if (this.hudAccum > 0.06) {                      // ~16/s: the speedometer must feel live
      this.hudAccum = 0;
      this.emitHud();
    }

    // adaptive resolution
    this.perfAccum += dt; this.perfFrames++;
    if (this.perfAccum >= 1) {
      const fps = this.perfFrames / this.perfAccum;
      const cur = this.renderer.getPixelRatio();
      const max = Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.3 : 1.7);
      if (fps < 45 && cur > 0.75) this.renderer.setPixelRatio(Math.max(0.75, cur - 0.15));
      else if (fps > 58 && cur < max) this.renderer.setPixelRatio(Math.min(max, cur + 0.1));
      this.perfAccum = 0; this.perfFrames = 0;
    }

    this.renderer.render(this.scene, this.camera);
  };

  /** Drive every trap's meshes from its fire time, and collect live hitboxes. */
  private liveDeadly: Box[] = [];
  private updateTraps(now: number) {
    this.liveDeadly.length = 0;
    for (const trap of this.map.traps) {
      const firedAt = this.trapFiredAt.get(trap.id);
      const t = firedAt === undefined ? -1 : now - firedAt;
      if (firedAt !== undefined && t > trap.duration + 1) { this.trapFiredAt.delete(trap.id); }
      const meshes = this.trapMeshes.get(trap.id);
      if (!meshes) continue;
      for (let i = 0; i < trap.parts.length; i++) {
        const p = trap.parts[i], m = meshes[i];
        const s = partAt(p, t);
        m.visible = s.visible;
        m.position.set(s.box.x, s.box.y, s.box.z);
        if (p.spin) {
          if (p.spin.axis === 'x') m.rotation.x = s.spin;
          else if (p.spin.axis === 'y') m.rotation.y = s.spin;
          else m.rotation.z = s.spin;
        }
        if (s.deadly) this.liveDeadly.push(s.box);
        // a part that becomes solid (crusher, piston) must also block movement,
        // but rebuilding solidBoxes every frame is wasteful — traps that matter
        // for collision are all deadly, so touching them ends the run anyway.
      }
    }
  }

  private hullHits(b: Box): boolean {
    const hw = CS.width / 2, h = this.body.ducking ? CS.duckHeight : CS.height;
    const p = this.body.pos;
    return Math.abs(p.x - b.x) < hw + b.hx
      && Math.abs(p.z - b.z) < hw + b.hz
      && p.y < b.y + b.hy && p.y + h > b.y - b.hy;
  }

  private checkHazards() {
    if (!this.alive) return;
    if (this.body.pos.y < this.map.fallY) { this.die('fall'); return; }
    for (const b of this.liveDeadly) if (this.hullHits(b)) { this.die('trap'); return; }
    for (const b of this.staticDeadly) if (this.hullHits(b)) { this.die('lava'); return; }
    if (!this.finished && this.role === 'runner' && inZone(this.body.pos, this.map.finish)) {
      this.finished = true;
      this.onFinish?.();
    }
  }

  private die(cause: string) {
    this.alive = false;
    this.body.vel = { x: 0, y: 0, z: 0 };
    this.onDie?.(cause);
  }

  private updateNearTrap() {
    this.nearTrap = null;
    if (this.role !== 'death') return;
    let bd = 3.0 * 3.0;
    for (const trap of this.map.traps) {
      const dx = trap.button.x - this.body.pos.x, dy = trap.button.y - 1 - this.body.pos.y, dz = trap.button.z - this.body.pos.z;
      if (Math.abs(dy) > 2.5) continue;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; this.nearTrap = trap; }
    }
  }

  private updateRemotes(dt: number) {
    const k = Math.min(1, dt * 14);
    this.duelTarget = null;
    let bestDot = Math.cos(1.15);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    for (const [id, e] of this.remotes) {
      e.cur.x += (e.s.x - e.cur.x) * k;
      e.cur.y += (e.s.y - e.cur.y) * k;
      e.cur.z += (e.s.z - e.cur.z) * k;
      let d = e.s.ry - e.cur.ry;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      e.cur.ry += d * k;
      e.g.position.set(e.cur.x, e.cur.y, e.cur.z);
      e.g.rotation.y = e.cur.ry;
      // swing animation on remote avatars
      if (typeof e.g.userData.swing === 'number') {
        e.g.userData.swing += dt;
        const arm = e.g.userData.arm as THREE.Object3D | undefined;
        if (arm) arm.rotation.x = -Math.sin(Math.min(1, e.g.userData.swing / 0.28) * Math.PI) * 2.1;
        if (e.g.userData.swing > 0.4) { delete e.g.userData.swing; if (arm) arm.rotation.x = 0; }
      }
      // duel targeting: in range and inside the swing arc
      if (!e.s.alive) continue;
      const dx = e.cur.x - this.body.pos.x, dz = e.cur.z - this.body.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.6 || dist < 0.001) continue;
      const dot = (dx / dist) * fx + (dz / dist) * fz;
      if (dot > bestDot) { bestDot = dot; this.duelTarget = id; }
    }
  }

  private updateSword(dt: number) {
    const g = this.swordGroup;
    if (!g) return;
    g.visible = this.alive && this.hp > 0 && this.swordVisible;
    if (this.swingT >= 0) {
      this.swingT += dt;
      const f = Math.min(1, this.swingT / 0.26);
      g.rotation.x = 0.35 - Math.sin(f * Math.PI) * 1.9;
      g.rotation.z = 0.28 + Math.sin(f * Math.PI) * 0.6;
      if (this.swingT > 0.34) { this.swingT = -1; g.rotation.set(0.35, -0.25, 0.28); }
    } else {
      // idle bob tied to actual speed — the viewmodel sells how fast you're going
      const sp = Math.min(1, speedUnits(this.body.vel) / 500);
      const t = this.clock.elapsedTime;
      g.position.set(0.34 + Math.sin(t * 7) * 0.012 * sp, -0.34 + Math.abs(Math.sin(t * 9)) * 0.02 * sp, -0.55);
    }
  }
  swordVisible = false;

  private emitHud() {
    const { x0, x1 } = this.map;
    const prog = Math.max(0, Math.min(1, (this.body.pos.x - x0) / (x1 - x0)));
    const ready = !this.nearTrap || (this.trapCooldown[this.nearTrap.id] ?? 0) <= Date.now();
    this.onHud?.({
      speed: speedUnits(this.body.vel),
      onGround: this.body.onGround,
      progress: prog,
      alive: this.alive,
      finished: this.finished,
      role: this.role,
      nearTrap: this.nearTrap,
      trapReady: ready,
      target: this.duelTarget,
      hp: this.hp,
    });
  }
}

// ── helpers ───────────────────────────────────────────────────────────
/** Concatenate box geometries into one buffer (no BufferGeometryUtils import). */
function mergeBoxes(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vcount = 0, icount = 0;
  for (const g of geos) { vcount += g.attributes.position.count; icount += g.index ? g.index.count : 0; }
  const pos = new Float32Array(vcount * 3);
  const nor = new Float32Array(vcount * 3);
  const uv = new Float32Array(vcount * 2);
  const idx = new Uint32Array(icount);
  let vo = 0, io = 0;
  for (const g of geos) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    const u = g.attributes.uv as THREE.BufferAttribute;
    pos.set(p.array as Float32Array, vo * 3);
    nor.set(n.array as Float32Array, vo * 3);
    uv.set(u.array as Float32Array, vo * 2);
    const gi = g.index!;
    for (let i = 0; i < gi.count; i++) idx[io + i] = (gi.array as ArrayLike<number>)[i] + vo;
    vo += p.count; io += gi.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/** A blocky runner. The Death is the same build in bone-white and black. */
function buildRunner(death: boolean): THREE.Group {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: death ? 0xe8e2d2 : 0xd9a06a, roughness: 0.85 });
  const cloth = new THREE.MeshStandardMaterial({ color: death ? 0x1a1620 : 0x3b6ea8, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.68, 0.3), cloth); torso.position.y = 1.16; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skin); head.position.y = 1.66; g.add(head);
  if (death) {
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.45, 6), cloth); hood.position.y = 1.82; g.add(hood);
  }
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.82, 0.22), cloth); leg.position.set(s * 0.16, 0.41, 0); g.add(leg);
  }
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.18), skin); armL.position.set(-0.36, 1.18, 0); g.add(armL);
  // the right arm is the one that swings, so it gets a pivot at the shoulder
  const pivot = new THREE.Group(); pivot.position.set(0.36, 1.45, 0); g.add(pivot);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.18), skin); armR.position.y = -0.28; pivot.add(armR);
  const sword = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.1), new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.25, metalness: 0.9 }));
  sword.position.set(0, -0.85, 0.1); pivot.add(sword);
  g.userData.arm = pivot;
  g.userData.death = death;
  return g;
}

function disposeTree(o: THREE.Object3D) {
  o.traverse(n => {
    const m = n as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose?.();
  });
}
