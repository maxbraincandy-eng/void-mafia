// ── Premium Worlds — generic engine ───────────────────────────────────
// Third-person social-world engine: renders any WorldDef, drives a smooth
// character controller + orbit camera with collision, positional ambient
// audio, and adaptive resolution. Kept out of React so the WebGL context and
// loop survive re-renders. Reused by every present and future Premium World.
import * as THREE from 'three';
import { Avatar, type EmoteKind } from './avatar';
import type { WorldDef, WorldContext, WorldCollider, WorldSeat, WorldInteractable, AmbientSource, AvatarConfig, WorldScreen } from './types';
import type { CharacterSpec } from '../character/spec';

export interface WorldHud {
  world: string;
  sitting: boolean;
  canInteract: string | null; // label of the nearby interactable (e.g. "დაჯექი")
  players: number;
  nearScreen: boolean;        // player is near the cinema screen
}

export interface ScreenRect { left: number; top: number; width: number; height: number; }

export interface RemoteWorldPlayer { socketId: string; name: string; bodyColor: string; glowColor: string; spec?: CharacterSpec; x: number; z: number; ry: number; seatId: string | null; }
export interface WorldNetState { x: number; z: number; ry: number; seatId: string | null; }

interface RemoteEntry {
  avatar: Avatar;
  plate: THREE.Sprite;
  ring: THREE.Mesh;
  target: { x: number; z: number; ry: number; seatId: string | null };
  cur: { x: number; z: number; ry: number };
}

export type QualityMode = 'auto' | 'high' | 'low';

const EYE = 1.5;
const WALK = 2.6, RUN = 5.4;
const CAM_DIST = 5.2, CAM_HEIGHT = 2.1;

export class WorldEngine {
  input = { move: { x: 0, y: 0 }, run: false };
  onHud: ((h: WorldHud) => void) | null = null;

  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;

  private def: WorldDef;
  private avatar: Avatar;
  private pos = new THREE.Vector3();
  private vy = 0;                     // vertical velocity (jump/gravity)
  private facing = 0;                 // avatar yaw
  private camYaw = 0;
  private camPitch = 0.22;
  private camPos = new THREE.Vector3();
  private pendingLook = { x: 0, y: 0 };

  private colliders: WorldCollider[] = [];
  private seats: WorldSeat[] = [];
  private interactables: WorldInteractable[] = [];
  private nearObj: WorldInteractable | null = null;
  private seated: WorldSeat | null = null;
  private lastObjInteract = 0;
  onInteract: ((id: string) => void) | null = null;
  private updates: ((dt: number, elapsed: number) => void)[] = [];
  private ambients: AmbientSource[] = [];
  private screen: WorldScreen | null = null;
  private nearScreen = false;
  private _v = new THREE.Vector3();
  private upAxis = new THREE.Vector3(0, 1, 0);

  private moon!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;

  private audioCtx: AudioContext | null = null;
  private audioStops: (() => void)[] = [];
  private hudAccum = 0;
  private nearSeat: WorldSeat | null = null;

  // adaptive perf + quality
  private perfAccum = 0; private perfFrames = 0; private curPR = 1;
  private quality: QualityMode = 'auto';
  private shadowsForced: boolean | null = null;
  private worldPerf = { reduced: false };

  // multiplayer
  private remotes = new Map<string, RemoteEntry>();
  private bubbles = new Map<string, { spr: THREE.Sprite; until: number }>();
  private occupiedSeats = new Set<string>();
  private speaking = new Set<string>();

  constructor(canvas: HTMLCanvasElement, def: WorldDef, avatar: AvatarConfig | CharacterSpec) {
    this.canvas = canvas;
    this.def = def;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.curPR = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.curPR);
    this.renderer.setClearColor(def.clear, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    (this.renderer as any).outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene.fog = new THREE.FogExp2(def.fog.color, def.fog.density);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);

    this.avatar = new Avatar(avatar);
    this.pos.set(def.spawn.x, 0, def.spawn.z);
    this.facing = def.spawn.yaw;
    this.camYaw = def.spawn.yaw;
    this.avatar.group.position.copy(this.pos);
    this.scene.add(this.avatar.group);

    this.buildLights();
    this.buildWorld();
    this.resize();
  }

  // ── public control ──────────────────────────────────────────────────
  rebuildAvatar(spec: CharacterSpec) {
    this.scene.remove(this.avatar.group);
    this.avatar.dispose();
    this.avatar = new Avatar(spec);
    this.avatar.group.position.copy(this.pos);
    this.avatar.group.rotation.y = this.facing;
    this.scene.add(this.avatar.group);
  }

  addLook(dx: number, dy: number) { this.pendingLook.x += dx; this.pendingLook.y += dy; }
  interact() {
    if (this.seated) { this.stand(); return; }
    // prefer whichever (seat or object) is closer
    const sd = this.nearSeat ? (this.nearSeat.x - this.pos.x) ** 2 + (this.nearSeat.z - this.pos.z) ** 2 : Infinity;
    const od = this.nearObj ? (this.nearObj.x - this.pos.x) ** 2 + (this.nearObj.z - this.pos.z) ** 2 : Infinity;
    if (this.nearObj && od <= sd) {
      const now = performance.now();
      if (now - this.lastObjInteract < 550) return; // debounce accidental double-fire
      this.lastObjInteract = now;
      this.nearObj.effect(); this.onInteract?.(this.nearObj.id); return;
    }
    if (this.nearSeat) this.sit(this.nearSeat);
  }
  jump() { if (!this.seated && this.pos.y <= 0.02) this.vy = 8.0; }
  // 1 near the screen, fading with distance — drives the cinema volume. The
  // audible radius is generous so the TV can be heard from most of the camp
  // (spawn, fire, DJ booth, karaoke are all ~12-20 units away); it only fully
  // fades out near the far edge of the world.
  screenAudibility(): number {
    if (!this.screen) return 1;
    const d = Math.hypot(this.screen.x - this.pos.x, this.screen.z - this.pos.z);
    return Math.max(0, Math.min(1, (30 - d) / 22));
  }
  emote() { this.avatar.wave(); }
  localEmote(kind: EmoteKind) { this.avatar.emote(kind); }
  // Snapshot the current 3D view (HUD is separate DOM, so it's a clean photo).
  capturePhoto(): string { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL('image/png'); }
  remoteEmote(socketId: string, kind: EmoteKind) { this.remotes.get(socketId)?.avatar.emote(kind); }
  triggerInteract(id: string) { this.interactables.find(o => o.id === id)?.effect(); }
  resumeAudio() { this.audioCtx?.resume?.().catch(() => {}); if (!this.audioCtx) this.startAudio(); }

  // ── multiplayer ─────────────────────────────────────────────────────
  getNetState(): WorldNetState { return { x: this.pos.x, z: this.pos.z, ry: this.facing, seatId: this.seated?.id ?? null }; }
  getListener() { return { x: this.pos.x, z: this.pos.z, yaw: this.camYaw }; }
  setSpeaking(ids: Set<string>) { this.speaking = ids; }

  // Project the cinema screen quad to viewport pixels so a DOM <iframe> can be
  // laid over it (null when the screen is behind the camera / viewed edge-on).
  getScreenRect(): ScreenRect | null {
    const s = this.screen; if (!s) return null;
    const cw = this.canvas.clientWidth || 1, ch = this.canvas.clientHeight || 1;
    const normal = new THREE.Vector3(Math.sin(s.ry), 0, Math.cos(s.ry));
    const right = new THREE.Vector3(Math.cos(s.ry), 0, -Math.sin(s.ry));
    const center = new THREE.Vector3(s.x, s.y, s.z);
    // only when looking at the front face
    if (this.camera.position.clone().sub(center).dot(normal) < 0.15) return null;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      this._v.copy(center).addScaledVector(right, sx * s.w / 2).addScaledVector(this.upAxis, sy * s.h / 2);
      const view = this._v.clone().applyMatrix4(this.camera.matrixWorldInverse);
      if (view.z > -0.2) return null; // a corner is behind the camera
      this._v.project(this.camera);
      const px = (this._v.x * 0.5 + 0.5) * cw, py = (-this._v.y * 0.5 + 0.5) * ch;
      minx = Math.min(minx, px); miny = Math.min(miny, py); maxx = Math.max(maxx, px); maxy = Math.max(maxy, py);
    }
    const w = maxx - minx, h = maxy - miny;
    if (w < 40 || h < 24) return null; // too far / tiny
    return { left: minx, top: miny, width: w, height: h };
  }

  setQuality(mode: QualityMode) {
    this.quality = mode;
    const maxPR = Math.min(window.devicePixelRatio || 1, 2);
    if (mode === 'high') this.curPR = maxPR;
    else if (mode === 'low') this.curPR = 1.0;
    if (mode !== 'auto') { this.renderer.setPixelRatio(this.curPR); this.resize(); }
    this.worldPerf.reduced = mode === 'low';
  }
  setShadows(on: boolean) {
    this.shadowsForced = on;
    this.renderer.shadowMap.enabled = on;
    this.moon.castShadow = on;
    this.scene.traverse(o => {
      const m = o as THREE.Mesh; if (!m.material) return;
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(mm => { mm.needsUpdate = true; });
    });
  }

  setRemotePlayers(list: RemoteWorldPlayer[]) {
    const seen = new Set<string>();
    const occ = new Set<string>();
    for (const p of list) {
      seen.add(p.socketId);
      if (p.seatId) occ.add(p.seatId);
      let e = this.remotes.get(p.socketId);
      if (!e) {
        const avatar = new Avatar(p.spec ?? { bodyColor: p.bodyColor, glowColor: p.glowColor });
        const plate = this.makeNameplate(p.name);
        plate.position.y = 2.15;
        avatar.group.add(plate);
        // speaking ring at the feet (green, hidden until they talk)
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.44, 0.56, 28),
          new THREE.MeshBasicMaterial({ color: 0x2aff8a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
        avatar.group.add(ring);
        this.scene.add(avatar.group);
        e = { avatar, plate, ring, target: { x: p.x, z: p.z, ry: p.ry, seatId: p.seatId }, cur: { x: p.x, z: p.z, ry: p.ry } };
        this.remotes.set(p.socketId, e);
      }
      e.target = { x: p.x, z: p.z, ry: p.ry, seatId: p.seatId };
    }
    for (const [id, e] of this.remotes) {
      if (seen.has(id)) continue;
      this.scene.remove(e.avatar.group);
      e.avatar.dispose();
      (e.plate.material as THREE.SpriteMaterial).map?.dispose();
      (e.plate.material as THREE.Material).dispose();
      this.remotes.delete(id);
    }
    this.occupiedSeats = occ;
  }

  rebuildRemoteAvatar(socketId: string, spec: CharacterSpec | null) {
    const e = this.remotes.get(socketId);
    if (!e) return;
    const pos = e.avatar.group.position.clone();
    const ry = e.avatar.group.rotation.y;
    e.avatar.group.remove(e.plate);
    e.avatar.group.remove(e.ring);
    this.scene.remove(e.avatar.group);
    e.avatar.dispose();
    const avatar = new Avatar(spec ?? { bodyColor: '#9b00ff', glowColor: '#00e5ff' });
    avatar.group.position.copy(pos);
    avatar.group.rotation.y = ry;
    avatar.group.add(e.plate);
    avatar.group.add(e.ring);
    this.scene.add(avatar.group);
    e.avatar = avatar;
  }

  // Cheap single-peer target update for high-frequency move packets. Falls back
  // to nothing if the peer isn't known yet (the next full pushRemotes adds it).
  updateRemoteTarget(socketId: string, x: number, z: number, ry: number, seatId: string | null) {
    const e = this.remotes.get(socketId);
    if (!e) return;
    const prevSeat = e.target.seatId;
    if (prevSeat && prevSeat !== seatId) this.occupiedSeats.delete(prevSeat);
    if (seatId) this.occupiedSeats.add(seatId);
    e.target = { x, z, ry, seatId };
  }

  remoteWave(socketId: string) { this.remotes.get(socketId)?.avatar.wave(); }

  private updateRemotes(dt: number) {
    const k = Math.min(1, dt * 10);
    for (const [id, e] of this.remotes) {
      const px = e.cur.x, pz = e.cur.z;
      e.cur.x += (e.target.x - e.cur.x) * k;
      e.cur.z += (e.target.z - e.cur.z) * k;
      let dry = e.target.ry - e.cur.ry;
      while (dry > Math.PI) dry -= Math.PI * 2;
      while (dry < -Math.PI) dry += Math.PI * 2;
      e.cur.ry += dry * k;
      const seat = e.target.seatId ? this.seats.find(s => s.id === e.target.seatId) : null;
      const pose = seat?.pose ?? null;
      e.avatar.group.position.set(e.cur.x, seat ? seat.y : 0, e.cur.z);
      e.avatar.group.rotation.y = e.cur.ry;
      const speed = Math.hypot(e.cur.x - px, e.cur.z - pz) / Math.max(dt, 0.001);
      e.avatar.state = seat && !pose ? 'sit' : 'idle';
      e.avatar.holdPose = pose;
      e.avatar.setProp(seat?.prop ?? null);
      e.avatar.update(dt, seat ? 0 : speed);
      const talk = this.speaking.has(id);
      e.plate.scale.set(talk ? 1.9 : 1.7, talk ? 0.47 : 0.42, 1);
      // fade distant nameplates so a crowded fire doesn't turn into text soup
      const dist = Math.hypot(e.cur.x - this.pos.x, e.cur.z - this.pos.z);
      (e.plate.material as THREE.SpriteMaterial).opacity = Math.max(0, Math.min(1, 1 - (dist - 16) / 12));
      const rm = e.ring.material as THREE.MeshBasicMaterial;
      rm.opacity = talk ? 0.55 + Math.sin(performance.now() / 140) * 0.25 : 0;
    }
  }

  private makeNameplate(name: string): THREE.Sprite {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d')!;
    g.font = 'bold 26px "Space Grotesk", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(name.slice(0, 16)).width + 28;
    g.fillStyle = 'rgba(10,8,22,0.6)';
    const rx = 128 - w / 2; roundRect(g, rx, 16, w, 32, 10); g.fill();
    g.fillStyle = '#e9d5ff'; g.fillText(name.slice(0, 16), 128, 33);
    const tex = new THREE.CanvasTexture(c);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    spr.scale.set(1.7, 0.42, 1);
    return spr;
  }

  // A floating chat bubble above an avatar's head. key '__me__' = local player,
  // otherwise a remote socketId. Replaces any existing bubble for that key.
  showChatBubble(key: string, text: string) {
    const group = key === '__me__' ? this.avatar.group : this.remotes.get(key)?.avatar.group;
    if (!group) return;
    const prev = this.bubbles.get(key);
    if (prev) { prev.spr.parent?.remove(prev.spr); (prev.spr.material as THREE.SpriteMaterial).map?.dispose(); prev.spr.material.dispose(); }
    const spr = this.makeBubble(text);
    spr.position.set(0, 2.55, 0);
    group.add(spr);
    this.bubbles.set(key, { spr, until: performance.now() + 6500 });
  }

  private updateBubbles() {
    const now = performance.now();
    for (const [k, b] of this.bubbles) {
      const left = b.until - now;
      if (left <= 0) { b.spr.parent?.remove(b.spr); (b.spr.material as THREE.SpriteMaterial).map?.dispose(); b.spr.material.dispose(); this.bubbles.delete(k); continue; }
      (b.spr.material as THREE.SpriteMaterial).opacity = Math.min(1, left / 500);
    }
  }

  private makeBubble(text: string): THREE.Sprite {
    const t = text.slice(0, 90);
    const c = document.createElement('canvas'); const g = c.getContext('2d')!;
    const font = '24px "Space Grotesk", system-ui, sans-serif';
    g.font = font;
    const maxW = 330;
    const words = t.split(' '); const lines: string[] = []; let cur = '';
    for (const w of words) { const test = cur ? cur + ' ' + w : w; if (g.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test; }
    if (cur) lines.push(cur);
    const lh = 30, pad = 16;
    const tw = Math.max(40, ...lines.map(l => g.measureText(l).width));
    c.width = Math.ceil(Math.min(maxW, tw)) + pad * 2; c.height = lines.length * lh + pad * 2;
    const g2 = c.getContext('2d')!; g2.font = font; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.fillStyle = 'rgba(12,10,24,0.85)'; roundRect(g2, 0, 0, c.width, c.height, 14); g2.fill();
    g2.strokeStyle = 'rgba(192,132,252,0.55)'; g2.lineWidth = 2; roundRect(g2, 1, 1, c.width - 2, c.height - 2, 13); g2.stroke();
    g2.fillStyle = '#f3e9ff';
    lines.forEach((l, i) => g2.fillText(l, c.width / 2, pad + lh / 2 + i * lh));
    const tex = new THREE.CanvasTexture(c);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const sc = c.width / 190; spr.scale.set(sc, sc * c.height / c.width, 1);
    return spr;
  }

  start() {
    this.clock.start();
    const loop = () => { if (this.disposed) return; this.raf = requestAnimationFrame(loop); this.frame(); };
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
    this.audioStops.forEach(s => s());
    try { this.audioCtx?.close(); } catch { /* ignore */ }
    this.avatar.dispose();
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose?.();
    });
    this.renderer.dispose();
  }

  // ── world / lights ──────────────────────────────────────────────────
  private buildLights() {
    this.ambientLight = new THREE.AmbientLight(0x35406a, 0.7);
    this.scene.add(this.ambientLight);
    // Moonlight — cool key light, casts the scene's soft shadows.
    this.moon = new THREE.DirectionalLight(0x9fb6e0, 0.9);
    this.moon.position.set(-22, 34, -18);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(1024, 1024);
    const sc = this.moon.shadow.camera as THREE.OrthographicCamera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 90;
    this.moon.shadow.bias = -0.0008;
    this.scene.add(this.moon);
    this.scene.add(this.moon.target);
  }

  private buildWorld() {
    const ctx: WorldContext = {
      three: THREE,
      scene: this.scene,
      renderer: this.renderer,
      moon: this.moon,
      ambientLight: this.ambientLight,
      addCollider: (c) => this.colliders.push(c),
      addSeat: (s) => this.seats.push(s),
      addInteractable: (o) => this.interactables.push(o),
      addAmbient: (a) => this.ambients.push(a),
      setScreen: (s) => { this.screen = s; },
      onUpdate: (fn) => this.updates.push(fn),
      disposables: [],
      perf: this.worldPerf,
    };
    this.def.build(ctx);
  }

  // ── per-frame ───────────────────────────────────────────────────────
  private frame() {
    let dt = this.clock.getDelta();
    if (dt > 0.05) dt = 0.05;
    const elapsed = this.clock.elapsedTime;

    // camera orbit from swipe
    this.camYaw -= this.pendingLook.x * 0.0032;
    // range spans looking up at the sky (negative) to steeply down (positive)
    this.camPitch = Math.max(-0.85, Math.min(1.2, this.camPitch + this.pendingLook.y * 0.0028));
    this.pendingLook.x = 0; this.pendingLook.y = 0;

    // deep water → swimming (slower, half-submerged), but not while on the pier
    const onPier = this.pos.x > -8 && this.pos.x < -4;
    const swimming = !this.seated && this.pos.z < -34 && Math.abs(this.pos.x) < 42 && !onPier;

    // movement (camera-relative), unless seated
    let moveSpeed = 0;
    if (!this.seated) {
      let mx = this.input.move.x, my = this.input.move.y;
      const mag = Math.hypot(mx, my);
      if (mag > 1) { mx /= mag; my /= mag; }
      if (mag > 0.05) {
        const speed = (this.input.run ? RUN : WALK) * (swimming ? 0.5 : 1);
        const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
        // forward = (-sin,-cos) relative to camera yaw
        const dirX = (-sin) * my + cos * mx;
        const dirZ = (-cos) * my + (-sin) * mx;
        const len = Math.hypot(dirX, dirZ) || 1;
        const nx = dirX / len, nz = dirZ / len;
        this.moveWithCollision(nx * speed * dt, nz * speed * dt);
        // face movement direction (shortest-arc turn)
        const targetFace = Math.atan2(-nx, -nz);
        let d = targetFace - this.facing;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.facing += d * Math.min(1, dt * 12);
        moveSpeed = speed * Math.min(1, mag);
      }
      // vertical (jump + gravity)
      if (this.vy !== 0 || this.pos.y > 0) {
        this.pos.y += this.vy * dt;
        this.vy -= 22 * dt;
        if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; }
      }
    }

    // nearest (free) seat + nearest interactable prompt
    this.nearSeat = null; this.nearObj = null;
    if (!this.seated) {
      let bd = 2.3 * 2.3;
      for (const s of this.seats) {
        if (this.occupiedSeats.has(s.id)) continue;
        const dx = s.x - this.pos.x, dz = s.z - this.pos.z;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; this.nearSeat = s; }
      }
      for (const o of this.interactables) {
        const dx = o.x - this.pos.x, dz = o.z - this.pos.z;
        const d = dx * dx + dz * dz;
        if (d < o.r * o.r && (!this.nearObj || d < (this.nearObj.x - this.pos.x) ** 2 + (this.nearObj.z - this.pos.z) ** 2)) this.nearObj = o;
      }
    }

    // avatar transform + animation
    this.avatar.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.avatar.group.rotation.y = this.facing;
    this.avatar.state = this.seated && !this.seated.pose ? 'sit' : 'idle';
    this.avatar.holdPose = this.seated?.pose ?? (swimming ? 'swim' : null);
    this.avatar.setProp(this.seated?.prop ?? null);
    this.avatar.update(dt, moveSpeed);

    // third-person camera with ground clamp + collider pull-in
    this.updateCamera(dt);

    // remote players
    this.updateRemotes(dt);

    // world updates (waves, fire, wind…)
    for (const u of this.updates) u(dt, elapsed);

    // positional ambient audio mix
    this.updateAudio();

    // adaptive resolution
    this.perfAccum += dt; this.perfFrames++;
    if (this.perfAccum >= 1) {
      const fps = this.perfFrames / this.perfAccum;
      const maxPR = Math.min(window.devicePixelRatio || 1, 1.75);
      if (this.quality === 'auto') {
        if (fps < 50 && this.curPR > 0.66) { this.curPR = Math.max(0.65, this.curPR - 0.18); this.renderer.setPixelRatio(this.curPR); this.resize(); }
        else if (fps > 58 && this.curPR < maxPR) { this.curPR = Math.min(maxPR, this.curPR + 0.08); this.renderer.setPixelRatio(this.curPR); this.resize(); }
        // Under load, drop shadows entirely (unless the user forced them on).
        if (fps < 34 && this.renderer.shadowMap.enabled && this.shadowsForced !== true) { this.renderer.shadowMap.enabled = false; this.moon.castShadow = false; }
        this.worldPerf.reduced = this.curPR < 1.05;
      }
      this.perfAccum = 0; this.perfFrames = 0;
    }

    // HUD ~5/s
    this.hudAccum += dt;
    if (this.hudAccum > 0.2) {
      this.hudAccum = 0;
      this.nearScreen = !!this.screen && Math.hypot(this.screen.x - this.pos.x, this.screen.z - this.pos.z) < 9;
      const label = this.seated ? (this.seated.pose ? '🚢 ჩამოდი' : 'ადექი') : this.nearObj ? this.nearObj.label : this.nearSeat ? (this.nearSeat.pose ? '🚢 დადექი' : 'დაჯექი') : null;
      this.onHud?.({ world: this.def.name, sitting: !!this.seated, canInteract: label, players: 1 + this.remotes.size, nearScreen: this.nearScreen });
    }

    this.updateBubbles();
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(dt: number) {
    const eyeH = this.seated ? 0.7 : EYE;
    const cp = this.camPitch;   // + = look down, − = look up
    // Camera orbits BEHIND at a bounded elevation instead of swinging overhead,
    // so tilting up actually reveals the sky rather than going top-down.
    const camElev = (this.seated ? 1.1 : CAM_HEIGHT) + cp * 1.5;
    const target = new THREE.Vector3(
      this.pos.x + Math.sin(this.camYaw) * CAM_DIST,
      this.pos.y + camElev,
      this.pos.z + Math.cos(this.camYaw) * CAM_DIST,
    );
    // pull the camera in if a collider sits between avatar head and camera
    const head = new THREE.Vector3(this.pos.x, this.pos.y + eyeH, this.pos.z);
    let dist = CAM_DIST;
    const dir = target.clone().sub(head);
    const full = dir.length(); dir.normalize();
    for (const c of this.colliders) {
      const toC = new THREE.Vector2(c.x - head.x, c.z - head.z);
      const along = toC.x * dir.x + toC.y * dir.z;
      if (along < 0 || along > full) continue;
      const px = head.x + dir.x * along, pz = head.z + dir.z * along;
      const perp = Math.hypot(c.x - px, c.z - pz);
      if (perp < c.r + 0.3) dist = Math.min(dist, along - 0.3);
    }
    dist = Math.max(1.4, dist);
    const desired = head.clone().add(dir.multiplyScalar(dist * (full / CAM_DIST)));
    if (desired.y < 0.5) desired.y = 0.5; // don't dip under the sand
    this.camPos.lerp(desired, Math.min(1, dt * 8));
    this.camera.position.copy(this.camPos);
    // Pitch drives the look height: pitch down (cp>0) aims low, pitch up (cp<0)
    // aims high — so you can look straight up at the sky. Seated gets a lift so
    // the default view frames the screen/stage in front.
    const lookY = this.pos.y + eyeH - cp * 3.4 + (this.seated ? 1.0 : 0);
    this.camera.lookAt(this.pos.x, lookY, this.pos.z);
  }

  private moveWithCollision(sx: number, sz: number) {
    const y = this.pos.y;
    this.pos.x += sx;
    for (const c of this.colliders) {
      if (c.h !== undefined && y >= c.h) continue;   // jumped clear of a low obstacle
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + 0.34;
      if (d < min && d > 0.0001) { this.pos.x = c.x + dx / d * min; }
    }
    this.pos.z += sz;
    for (const c of this.colliders) {
      if (c.h !== undefined && y >= c.h) continue;
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + 0.34;
      if (d < min && d > 0.0001) { this.pos.z = c.z + dz / d * min; }
    }
  }

  private sit(s: WorldSeat) {
    this.seated = s;
    this.pos.set(s.x, s.y, s.z);
    this.vy = 0;
    this.facing = s.yaw;
    this.input.move.x = 0; this.input.move.y = 0;
  }
  private stand() {
    if (!this.seated) return;
    // step out in front of the seat
    this.pos.set(this.seated.x - Math.sin(this.seated.yaw) * 0.9, 0, this.seated.z - Math.cos(this.seated.yaw) * 0.9);
    this.vy = 0;
    this.seated = null;
  }

  // ── positional ambient audio (ocean / fire / wind / night) ───────────
  private startAudio() {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx: AudioContext = new Ctx();
      this.audioCtx = ctx;
      const master = ctx.createGain(); master.gain.value = 0.65; master.connect(ctx.destination);
      for (const a of this.ambients) this.buildAmbient(ctx, master, a);
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch { /* audio optional */ }
  }

  private buildAmbient(ctx: AudioContext, master: GainNode, a: AmbientSource) {
    const noise = (dur: number) => {
      const n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; return s;
    };
    const pan = ctx.createStereoPanner();
    const g = ctx.createGain(); g.gain.value = 0;
    pan.connect(g).connect(master);
    (a as any)._pan = pan; (a as any)._g = g;

    if (a.kind === 'ocean') {
      const src = noise(3);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 460;
      const swell = ctx.createGain(); swell.gain.value = 0.42;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13; const la = ctx.createGain(); la.gain.value = 0.28;
      lfo.connect(la).connect(swell.gain); lfo.start();
      src.connect(lp).connect(swell).connect(pan); src.start();
      this.audioStops.push(() => { try { src.stop(); lfo.stop(); } catch { /* ignore */ } });
    } else if (a.kind === 'fire') {
      // Quiet, low body of the fire — barely there.
      const bed = noise(3);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150;
      const bedGain = ctx.createGain(); bedGain.gain.value = 0.045;
      bed.connect(lp).connect(bedGain).connect(pan); bed.start();
      // Only occasional small crackle pops.
      let alive = true; let timer: ReturnType<typeof setTimeout> | null = null;
      const pop = () => {
        if (!alive || !this.audioCtx) return;
        const t = ctx.currentTime;
        const dur = 0.025 + Math.random() * 0.05;
        const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        const s = ctx.createBufferSource(); s.buffer = buf;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300 + Math.random() * 1900; bp.Q.value = 3;
        const g2 = ctx.createGain(); g2.gain.value = 0.05 + Math.random() * 0.09;
        s.connect(bp).connect(g2).connect(pan); s.start(t); s.stop(t + dur + 0.02);
        timer = setTimeout(pop, 700 + Math.random() * 3200); // rare
      };
      timer = setTimeout(pop, 900 + Math.random() * 2000);
      this.audioStops.push(() => { alive = false; if (timer) clearTimeout(timer); try { bed.stop(); } catch { /* ignore */ } });
    } else if (a.kind === 'wind') {
      const src = noise(3);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
      src.connect(lp).connect(pan); src.start();
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08; const lg = ctx.createGain(); lg.gain.value = 0.25;
      const base = ctx.createConstantSource(); base.offset.value = 0.3;
      base.connect(g.gain); lfo.connect(lg).connect(g.gain); lfo.start(); base.start();
      src.start();
      this.audioStops.push(() => { try { src.stop(); lfo.stop(); base.stop(); } catch { /* ignore */ } });
      (a as any)._static = true;
    } else { // night bed
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 62;
      const og = ctx.createGain(); og.gain.value = 0.05; o.connect(og).connect(pan); o.start();
      this.audioStops.push(() => { try { o.stop(); } catch { /* ignore */ } });
    }
  }

  private updateAudio() {
    if (!this.audioCtx) return;
    const cosY = Math.cos(this.camYaw), sinY = Math.sin(this.camYaw);
    for (const a of this.ambients) {
      const g = (a as any)._g as GainNode | undefined;
      const pan = (a as any)._pan as StereoPannerNode | undefined;
      if (!g || !pan) continue;
      const dx = a.x - this.pos.x, dz = a.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      let vol = Math.max(0, 1 - dist / a.radius); vol *= vol;
      if (!(a as any)._static) g.gain.setTargetAtTime(vol * 0.9, this.audioCtx.currentTime, 0.4);
      const p = dist > 0.5 ? Math.max(-1, Math.min(1, (dx * cosY - dz * sinY) / dist)) : 0;
      pan.pan.setTargetAtTime(p, this.audioCtx.currentTime, 0.3);
    }
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
