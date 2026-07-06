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

interface AABB { cx: number; cz: number; hx: number; hz: number; }

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

  // Flashlight battery
  private battery = 1;
  private flashOn = true;
  private hudAccum = 0;

  // Ambient audio
  private audioCtx: AudioContext | null = null;
  private audioNodes: { stop: () => void } | null = null;

  private textures: THREE.Texture[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x0a0a06, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x12100a, 0.075);

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
    const wallTex = this.makeWallTexture();
    const pillarMat = new THREE.MeshLambertMaterial({ map: wallTex, color: 0xbaa94c });
    const pillarGeo = new THREE.BoxGeometry(PHALF * 2, WALL_H, PHALF * 2);
    this.pillarMesh = new THREE.InstancedMesh(pillarGeo, pillarMat, maxPillars);
    this.pillarMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pillarMesh.frustumCulled = false;
    this.scene.add(this.pillarMesh);

    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex, color: 0xb0a049 });
    const wallGeo = new THREE.BoxGeometry(1, WALL_H, 1); // scaled per instance
    this.wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, maxWalls);
    this.wallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wallMesh.frustumCulled = false;
    this.scene.add(this.wallMesh);

    this.textures.push(carpet, ceilTex, wallTex);
  }

  private buildLights() {
    this.scene.add(new THREE.AmbientLight(0x5a5230, 0.55));
    const hemi = new THREE.HemisphereLight(0xfff2c0, 0x24200e, 0.35);
    this.scene.add(hemi);

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
  private makeCarpetTexture(): THREE.Texture {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2b2717'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 5000; i++) {
      const v = 20 + Math.floor(Math.random() * 40);
      g.fillStyle = `rgba(${v + 20},${v + 16},${v - 4},0.5)`;
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
    g.fillStyle = '#b6a648'; g.fillRect(0, 0, 64, 64);
    // faint vertical wallpaper striping + grime
    for (let x = 0; x < 64; x += 4) {
      g.fillStyle = x % 8 === 0 ? 'rgba(150,135,55,0.5)' : 'rgba(190,175,90,0.35)';
      g.fillRect(x, 0, 2, 64);
    }
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(90,80,30,${Math.random() * 0.15})`;
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
    g.fillStyle = '#c9c096'; g.fillRect(0, 0, 128, 128);
    // ceiling tile grid
    g.strokeStyle = 'rgba(90,84,52,0.6)'; g.lineWidth = 2;
    for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    // fluorescent light panel in the centre of each tile block
    g.fillStyle = '#fff8dc';
    g.fillRect(40, 8, 48, 12);
    g.fillRect(40, 108, 48, 12);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(60, 60);
    return t;
  }

  // ── World treadmill: rebuild instances & colliders around the player ──
  private rebuildWindow(centerCx: number, centerCz: number) {
    const dummy = new THREE.Object3D();
    const colliders: AABB[] = [];
    let pi = 0, wi = 0;

    for (let dz = -WINDOW; dz <= WINDOW; dz++) {
      for (let dx = -WINDOW; dx <= WINDOW; dx++) {
        const cx = centerCx + dx, cz = centerCz + dz;
        const wx = cx * CELL, wz = cz * CELL;

        // pillar
        dummy.position.set(wx, WALL_H / 2, wz);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        this.pillarMesh.setMatrixAt(pi++, dummy.matrix);
        colliders.push({ cx: wx, cz: wz, hx: PHALF, hz: PHALF });

        // wall panel toward +X neighbour (runs along X)
        if (hash3(cx, cz, 11) < WALL_DENSITY) {
          const mx = wx + CELL / 2, mz = wz;
          dummy.position.set(mx, WALL_H / 2, mz);
          dummy.scale.set(CELL - PHALF * 2, 1, WALL_THICK);
          dummy.updateMatrix();
          this.wallMesh.setMatrixAt(wi++, dummy.matrix);
          colliders.push({ cx: mx, cz: mz, hx: (CELL - PHALF * 2) / 2, hz: WALL_THICK / 2 });
        }
        // wall panel toward +Z neighbour (runs along Z)
        if (hash3(cx, cz, 23) < WALL_DENSITY) {
          const mx = wx, mz = wz + CELL / 2;
          dummy.position.set(mx, WALL_H / 2, mz);
          dummy.scale.set(WALL_THICK, 1, CELL - PHALF * 2);
          dummy.updateMatrix();
          this.wallMesh.setMatrixAt(wi++, dummy.matrix);
          colliders.push({ cx: mx, cz: mz, hx: WALL_THICK / 2, hz: (CELL - PHALF * 2) / 2 });
        }
      }
    }
    this.pillarMesh.count = pi;
    this.pillarMesh.instanceMatrix.needsUpdate = true;
    this.wallMesh.count = wi;
    this.wallMesh.instanceMatrix.needsUpdate = true;
    this.colliders = colliders;
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

    // Flashlight follows camera
    this.updateFlashlight(dt);

    // Fluorescent light pool → nearest ceiling lattice points
    this.updateLightPool();

    // HUD ~5×/s
    this.hudAccum += dt;
    if (this.hudAccum > 0.2) {
      this.hudAccum = 0;
      this.onHud?.({ battery: this.battery, flashlightOn: this.flashOn, level: 'LEVEL 0', x: this.pos.x, z: this.pos.z });
    }

    this.renderer.render(this.scene, this.camera);
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
