// ── Premium Worlds — generic engine ───────────────────────────────────
// Third-person social-world engine: renders any WorldDef, drives a smooth
// character controller + orbit camera with collision, positional ambient
// audio, and adaptive resolution. Kept out of React so the WebGL context and
// loop survive re-renders. Reused by every present and future Premium World.
import * as THREE from 'three';
import { Avatar, type EmoteKind } from './avatar';
import type { WorldDef, WorldContext, WorldCollider, WorldSeat, WorldInteractable, AmbientSource, AvatarConfig, WorldScreen, WorldSwimZone, WorldDryZone, WorldVehicle, VehicleKind } from './types';
import type { CharacterSpec } from '../character/spec';
import { tNow } from '@/store/langStore';

export interface WorldHud {
  world: string;
  sitting: boolean;
  // At the wheel of a vehicle. `sitting` is also true then (you're in a seat and
  // the action button becomes "get out"), but the touch controls MUST stay up —
  // gating the joystick on `sitting` alone left phones unable to drive at all.
  driving: boolean;
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
const VEH_Y = -0.5;                 // default hull float height (world may override)
const OCEAN_R = 74;                 // how far you can roam on the water

type VehicleInst = WorldVehicle & {
  mesh: THREE.Group; ry: number; homeX: number; homeZ: number; homeYaw: number;
  floatY: number; seatY: number; land: boolean;
  drv: SeatOffset; pass: SeatOffset;
  speed: number;                     // land only: current signed road speed (m/s)
  wheels: THREE.Object3D[];          // land only: spun/steered per frame
};
/**
 * Where a rider sits, in the vehicle's own frame: `dz` is how far ASTERN of the
 * centre (local +Z points backwards, since the engine's forward is −Z) and `dx`
 * how far to the rider's RIGHT. Water craft seat the pair in line; a car seats
 * them shoulder to shoulder in two bucket seats.
 */
type SeatOffset = { dx: number; dz: number };
const VEH_SEATS: Record<VehicleKind, { drv: SeatOffset; pass: SeatOffset; seatH: number }> = {
  jetski: { drv: { dx: 0, dz: 0 }, pass: { dx: 0, dz: 0.9 }, seatH: 0.75 },
  boat: { drv: { dx: 0, dz: 0 }, pass: { dx: 0, dz: 1.5 }, seatH: 0.75 },
  car: { drv: { dx: -0.46, dz: 0.15 }, pass: { dx: 0.46, dz: 0.15 }, seatH: 0.98 },
};
// Land driving: top speeds (walk/boost), how briskly the throttle takes effect
// and how hard it steers at speed.
const CAR_TOP = 17, CAR_BOOST = 27, CAR_REV = 6.5, CAR_ACCEL = 2.1, CAR_STEER = 1.85;
const CAR_PAD = 1.15;               // hull radius used against barriers/walls

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
  /**
   * Third person orbits behind the avatar; first person sits in its head and
   * hides the body so you don't see the inside of your own chest. The mode is
   * per-session and applies to every world.
   */
  private camMode: 'third' | 'first' = 'third';
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
  // swimming + vehicles
  private swimZones: WorldSwimZone[] = [];
  private dryZones: WorldDryZone[] = [];
  private vehicles: VehicleInst[] = [];
  private riding: VehicleInst | null = null;
  private ridingRole: 'driver' | 'passenger' = 'driver';
  private nearVehicle: VehicleInst | null = null;
  private vehTextures: THREE.Texture[] = [];   // canvas textures (racing numbers)
  private groundY = 0;              // eased target floor height (0 = deck, <0 = water)
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
  private isMobile = false;
  private targetFPS = 60;
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

    // Thermal budget: phones (esp. 120 Hz ProMotion) cook when rendering an
    // uncapped, MSAA'd, high-DPR scene. On mobile we drop MSAA, cap the pixel
    // ratio harder, use a cheaper shadow filter, and the render loop is capped
    // to ~60 fps (see start()). preserveDrawingBuffer is off — capturePhoto()
    // renders synchronously right before toDataURL, so screenshots still work.
    this.isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.isMobile, powerPreference: 'high-performance' });
    this.curPR = Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.25 : 1.5);
    this.renderer.setPixelRatio(this.curPR);
    this.renderer.setClearColor(def.clear, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
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
    if (this.riding) { this.dismount(); return; }
    if (this.seated) { this.stand(); return; }
    // prefer whichever (vehicle / seat / object) is closest
    const sd = this.nearSeat ? (this.nearSeat.x - this.pos.x) ** 2 + (this.nearSeat.z - this.pos.z) ** 2 : Infinity;
    const od = this.nearObj ? (this.nearObj.x - this.pos.x) ** 2 + (this.nearObj.z - this.pos.z) ** 2 : Infinity;
    const vd = this.nearVehicle ? (this.nearVehicle.mesh.position.x - this.pos.x) ** 2 + (this.nearVehicle.mesh.position.z - this.pos.z) ** 2 : Infinity;
    if (this.nearVehicle && vd <= sd && vd <= od) {
      const v = this.nearVehicle;
      // Someone already at the helm? Then take the rear seat and ride along.
      const driven = this.driverOf(v.id) !== null;
      const pillionTaken = this.passengerOf(v.id) !== null;
      if (!driven) this.mount(v, 'driver');
      else if (!pillionTaken) this.mount(v, 'passenger');
      return;
    }
    if (this.nearObj && od <= sd) {
      const now = performance.now();
      if (now - this.lastObjInteract < 550) return; // debounce accidental double-fire
      this.lastObjInteract = now;
      this.nearObj.effect(); this.onInteract?.(this.nearObj.id); return;
    }
    if (this.nearSeat) this.sit(this.nearSeat);
  }
  jump() { if (!this.seated && !this.riding && this.pos.y <= this.groundY + 0.05) this.vy = 8.0; }

  /** Switch between first- and third-person. Returns the mode now in effect. */
  setCameraMode(mode: 'third' | 'first'): 'third' | 'first' {
    this.camMode = mode;
    this.syncAvatarVisibility();
    return this.camMode;
  }

  /**
   * The avatar is hidden only in first person on foot. Sitting and driving stay
   * in third person — the point of those is seeing the thing you are in — so
   * this is re-evaluated on every frame rather than at the toggle alone;
   * seating happens long after the mode was chosen.
   */
  private syncAvatarVisibility() {
    this.avatar.group.visible = this.camMode === 'third' || !!this.seated || !!this.riding;
  }
  toggleCameraMode(): 'third' | 'first' {
    return this.setCameraMode(this.camMode === 'third' ? 'first' : 'third');
  }
  getCameraMode(): 'third' | 'first' { return this.camMode; }
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
  getNetState(): WorldNetState {
    // `seatId` is an opaque string the server just relays, so we piggyback the
    // vehicle a player is on: 'veh:<id>' at the helm, 'vehp:<id>' in the rear
    // seat. That lets every client place the hull and the riders without any
    // protocol change.
    const tag = this.riding ? `${this.ridingRole === 'driver' ? 'veh' : 'vehp'}:${this.riding.id}` : (this.seated?.id ?? null);
    return { x: this.pos.x, z: this.pos.z, ry: this.facing, seatId: tag };
  }
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
      const tag = e.target.seatId;
      // A rider's tag names a vehicle rather than a seat. The driver's broadcast
      // position is their SEAT, so invert their seat offset to get the hull and
      // move the mesh for everyone (identity for water craft, a half-metre to
      // the side for a car, whose driver sits in the left bucket).
      const vehId = tag && (tag.startsWith('veh:') ? tag.slice(4) : tag.startsWith('vehp:') ? tag.slice(5) : null);
      const veh = vehId ? this.vehicles.find(v => v.id === vehId) : null;
      if (veh && tag!.startsWith('veh:')) {
        const hc = this.hullCentre(e.cur.x, e.cur.z, e.cur.ry, veh.drv);
        veh.mesh.position.set(hc.x, veh.floatY, hc.z);
        veh.mesh.rotation.y = e.cur.ry; veh.ry = e.cur.ry;
        if (veh.land) {
          // roll the wheels from how far the hull actually moved this frame
          const roll = Math.hypot(e.cur.x - px, e.cur.z - pz) / 0.44;
          for (const w of veh.wheels) w.rotation.x -= roll;
        }
      }
      const seat = !veh && tag ? this.seats.find(s => s.id === tag) : null;
      const pose = seat?.pose ?? null;
      e.avatar.group.position.set(e.cur.x, veh ? veh.seatY : seat ? seat.y : 0, e.cur.z);
      e.avatar.group.rotation.y = e.cur.ry;
      const speed = Math.hypot(e.cur.x - px, e.cur.z - pz) / Math.max(dt, 0.001);
      e.avatar.state = veh || (seat && !pose) ? 'sit' : 'idle';
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
    // Cap the render rate. Without this a 120 Hz ProMotion phone renders twice
    // the frames it needs, which is a large, needless thermal load. Movement
    // stays correct because frame() uses the real clock delta, not a fixed step.
    let last = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const minMs = 1000 / this.targetFPS;
      const elapsed = now - last;
      if (elapsed < minMs - 1) return; // too soon — skip this vsync tick
      last = now - (elapsed % minMs);   // keep a steady cadence
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
    this.audioStops.forEach(s => s());
    try { this.audioCtx?.close(); } catch { /* ignore */ }
    this.avatar.dispose();
    this.vehTextures.forEach(t => t.dispose());
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
    this.moon.shadow.mapSize.set(this.isMobile ? 512 : 1024, this.isMobile ? 512 : 1024);
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
      addSwimZone: (z) => this.swimZones.push(z),
      addDryZone: (z) => this.dryZones.push(z),
      addVehicle: (v) => {
        const wheels: THREE.Object3D[] = [];
        const mesh = this.buildVehicle(v, wheels);
        const yaw = v.yaw ?? 0;
        const land = v.kind === 'car';
        // Land vehicles sit ON the ground; hulls float slightly into the water.
        const floatY = land ? 0 : v.waterY !== undefined ? v.waterY - 0.2 : VEH_Y;
        const spec = VEH_SEATS[v.kind];
        mesh.position.set(v.x, floatY, v.z); mesh.rotation.y = yaw;
        this.scene.add(mesh);
        this.vehicles.push({
          ...v, mesh, ry: yaw, homeX: v.x, homeZ: v.z, homeYaw: yaw, floatY,
          seatY: floatY + spec.seatH, land, drv: spec.drv, pass: spec.pass, speed: 0, wheels,
        });
      },
      setScreen: (s) => { this.screen = s; },
      onUpdate: (fn) => this.updates.push(fn),
      disposables: [],
      perf: this.worldPerf,
    };
    this.def.build(ctx);
  }

  // ── vehicles ─────────────────────────────────────────────────────────
  private buildVehicle(v: WorldVehicle, wheels: THREE.Object3D[]): THREE.Group {
    const kind = v.kind;
    const g = new THREE.Group();
    const accent = new THREE.MeshBasicMaterial({ color: 0x35e0e0, toneMapped: false });
    if (kind === 'car') { this.buildCar(g, v, wheels); return g; }
    if (kind === 'jetski') {
      const hullMat = new THREE.MeshStandardMaterial({ color: 0xff3b6a, roughness: 0.4, metalness: 0.3 });
      const hull = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 2.0), hullMat); hull.position.y = 0.35; hull.castShadow = true; g.add(hull);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 4), hullMat); nose.rotation.x = -Math.PI / 2; nose.rotation.y = Math.PI / 4; nose.position.set(0, 0.35, -1.3); nose.scale.set(1, 1, 0.6); g.add(nose);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.9), new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.8 })); seat.position.set(0, 0.6, 0.2); g.add(seat);
      const bars = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0x111, roughness: 0.5 })); bars.position.set(0, 0.75, -0.5); g.add(bars);
      // pillion pad + grab handle so a second rider has somewhere to sit
      const pillion = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 0.6), new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.8 })); pillion.position.set(0, 0.62, 0.95); g.add(pillion);
      const grab = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 14), new THREE.MeshStandardMaterial({ color: 0x111, roughness: 0.5 })); grab.rotation.x = Math.PI / 2; grab.position.set(0, 0.7, 0.6); g.add(grab);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 1.4), accent); strip.position.set(0, 0.5, 0.1); g.add(strip);
    } else {
      const hullMat = new THREE.MeshStandardMaterial({ color: 0xeef0f4, roughness: 0.35, metalness: 0.2 });
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 4.0), hullMat); hull.position.y = 0.4; hull.castShadow = true; g.add(hull);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 4), hullMat); nose.rotation.x = -Math.PI / 2; nose.rotation.y = Math.PI / 4; nose.position.set(0, 0.4, -2.4); nose.scale.set(1, 1, 0.6); g.add(nose);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 3.4), new THREE.MeshStandardMaterial({ color: 0x3a3228, roughness: 0.7 })); deck.position.set(0, 0.72, 0.2); g.add(deck);
      const screen = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a3550, transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.6 })); screen.position.set(0, 1.05, -0.6); screen.rotation.x = -0.3; g.add(screen);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.1, 3.0), accent); strip.position.set(0, 0.55, 0.2); g.add(strip);
      // rear bench for a passenger
      const rear = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.7), new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.8 })); rear.position.set(0, 0.86, 1.5); g.add(rear);
      const rearBack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.42, 0.12), new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.8 })); rearBack.position.set(0, 1.13, 1.86); g.add(rearBack);
    }
    return g;
  }

  /**
   * An open-top two-seat racer. Deliberately roofless: the riders' hips sit at
   * `seatY`, so a closed cabin would slice through their heads — and open
   * cockpits let everyone see who's driving and who's riding shotgun.
   * Local −Z is the direction of travel.
   */
  private buildCar(g: THREE.Group, v: WorldVehicle, wheels: THREE.Object3D[]) {
    const paint = new THREE.MeshStandardMaterial({ color: v.color ?? 0xe23b4e, roughness: 0.28, metalness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.75 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x0e0f13, roughness: 0.95 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xb8c0cc, roughness: 0.3, metalness: 0.85 });
    const carbon = new THREE.MeshStandardMaterial({ color: 0x1d2027, roughness: 0.5, metalness: 0.3 });

    // floor pan + open cockpit tub (side pods either side of the two seats)
    const pan = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.14, 3.5), carbon); pan.position.y = 0.31; pan.castShadow = true; g.add(pan);
    for (const sx of [-0.95, 0.95]) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.58, 2.9), paint); pod.position.set(sx, 0.63, 0.1); pod.castShadow = true; g.add(pod);
    }
    // nose + splitter, tapering to the tip
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.44, 1.5), paint); nose.position.set(0, 0.6, -1.7); nose.castShadow = true; g.add(nose);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.7), paint); tip.position.set(0, 0.52, -2.6); g.add(tip);
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.5), carbon); splitter.position.set(0, 0.3, -2.75); g.add(splitter);
    // engine deck + intake behind the seats
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.56, 1.35), paint); deck.position.set(0, 0.66, 1.75); deck.castShadow = true; g.add(deck);
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.5), dark); intake.position.set(0, 1.05, 1.5); g.add(intake);
    for (const sx of [-0.4, 0.4]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 8), chrome);
      pipe.rotation.x = Math.PI / 2; pipe.position.set(sx, 0.62, 2.5); g.add(pipe);
    }
    // roll bar behind the cockpit + rear wing on two struts
    for (const sx of [-0.62, 0.62]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.05, 8), chrome); post.position.set(sx, 1.32, 1.02); g.add(post);
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.1), carbon); strut.position.set(sx * 0.9, 1.16, 2.35); g.add(strut);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.28, 8), chrome); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.84, 1.02); g.add(bar);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.5), carbon); wing.position.set(0, 1.38, 2.35); wing.rotation.x = 0.16; g.add(wing);
    // two bucket seats — cushion tops land just under the riders' hips (seatY)
    for (const sx of [-0.46, 0.46]) {
      const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.15, 0.6), dark); cushion.position.set(sx, 0.85, 0.25); g.add(cushion);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.7, 0.14), dark); back.position.set(sx, 1.27, 0.62); back.rotation.x = -0.09; g.add(back);
      const belt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.03), new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.9 })); belt.position.set(sx, 1.25, 0.53); belt.rotation.z = 0.3; g.add(belt);
    }
    // dash, wheel, mirrors
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.22), dark); dash.position.set(0, 0.95, -0.85); g.add(dash);
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.032, 6, 18), dark); sw.position.set(-0.46, 1.06, -0.6); sw.rotation.x = 1.15; g.add(sw);
    for (const sx of [-1.05, 1.05]) {
      const mir = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.05), chrome); mir.position.set(sx, 1.0, -0.75); g.add(mir);
    }
    // lights
    const head = new THREE.MeshBasicMaterial({ color: 0xfff4d0, toneMapped: false });
    const tail = new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false });
    for (const sx of [-0.42, 0.42]) {
      const hl = new THREE.Mesh(new THREE.CircleGeometry(0.15, 14), head); hl.position.set(sx, 0.56, -2.96); g.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.05), tail); tl.position.set(sx, 0.78, 2.44); g.add(tl);
    }
    // racing number on the nose + both flanks
    if (v.num !== undefined) {
      const tex = numberTexture(v.num, v.color ?? 0xe23b4e);
      const numMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
      this.vehTextures.push(tex);
      const bonnet = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), numMat);
      bonnet.rotation.x = -Math.PI / 2; bonnet.position.set(0, 0.83, -1.7); g.add(bonnet);
      for (const sx of [-1, 1]) {
        const flank = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), numMat);
        flank.position.set(sx * 1.17, 0.68, 0.1); flank.rotation.y = sx * Math.PI / 2; g.add(flank);
      }
    }
    // four wheels. Each lives in its own group: rotating the group about X rolls
    // the wheel, about Y steers it (the fronts).
    const tyre = new THREE.CylinderGeometry(0.44, 0.44, 0.32, 16);
    const rim = new THREE.CylinderGeometry(0.24, 0.24, 0.34, 12);
    for (const sz of [-1.55, 1.6]) for (const sx of [-1.16, 1.16]) {
      const hub = new THREE.Group(); hub.position.set(sx, 0.44, sz); g.add(hub);
      const t = new THREE.Mesh(tyre, rubber); t.rotation.z = Math.PI / 2; t.castShadow = true; hub.add(t);
      const r = new THREE.Mesh(rim, chrome); r.rotation.z = Math.PI / 2; hub.add(r);
      for (let i = 0; i < 5; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.07), chrome);
        spoke.rotation.x = (i / 5) * Math.PI; hub.add(spoke);
      }
      wheels.push(hub);
    }
  }

  /** True when standing on a registered dry region (deck / pier / plaza). */
  private onDryGround(): boolean {
    for (const z of this.dryZones) {
      if (z.r !== undefined) {
        const dx = this.pos.x - z.x, dz = this.pos.z - z.z;
        if (dx * dx + dz * dz < z.r * z.r) return true;
      } else {
        let dx = this.pos.x - z.x, dz = this.pos.z - z.z;
        // A local offset (lx,lz) maps to world as dx = lx·cos + lz·sin,
        // dz = −lx·sin + lz·cos, so the inverse is lx = dx·cos − dz·sin and
        // lz = dx·sin + dz·cos (using +yaw, not −yaw).
        if (z.yaw) { const c = Math.cos(z.yaw), s = Math.sin(z.yaw); const lx = dx * c - dz * s; dz = dx * s + dz * c; dx = lx; }
        if (Math.abs(dx) < (z.hw ?? 0) && Math.abs(dz) < (z.hd ?? 0)) return true;
      }
    }
    return false;
  }

  /** socketId of whoever is driving this vehicle, from the networked seat tag. */
  private driverOf(id: string): string | null {
    for (const [sid, e] of this.remotes) if (e.target.seatId === `veh:${id}`) return sid;
    return null;
  }
  private passengerOf(id: string): string | null {
    for (const [sid, e] of this.remotes) if (e.target.seatId === `vehp:${id}`) return sid;
    return null;
  }
  /**
   * A rider's world position. With yaw `ry` the vehicle's forward is
   * −(sin ry, cos ry), so local +dz (astern) maps to +(sin, cos)·dz and the
   * rider's right (+dx) to +(cos, −sin)·dx.
   */
  private seatWorld(cx: number, cz: number, ry: number, s: SeatOffset) {
    const sn = Math.sin(ry), cs = Math.cos(ry);
    return { x: cx + sn * s.dz + cs * s.dx, z: cz + cs * s.dz - sn * s.dx };
  }
  /** Inverse of `seatWorld`: the hull centre implied by a rider's position. */
  private hullCentre(sx: number, sz: number, ry: number, s: SeatOffset) {
    const sn = Math.sin(ry), cs = Math.cos(ry);
    return { x: sx - sn * s.dz - cs * s.dx, z: sz - cs * s.dz + sn * s.dx };
  }
  private riderPos(v: VehicleInst, role: 'driver' | 'passenger') {
    return this.seatWorld(v.mesh.position.x, v.mesh.position.z, v.ry, role === 'driver' ? v.drv : v.pass);
  }

  private mount(v: VehicleInst, role: 'driver' | 'passenger' = 'driver') {
    this.riding = v; this.ridingRole = role; this.seated = null;
    this.facing = v.ry; this.camYaw = v.ry;
    if (role === 'driver') v.speed = 0;
    const p = this.riderPos(v, role);
    this.pos.set(p.x, v.seatY, p.z);
    this.vy = 0; this.input.move.x = 0; this.input.move.y = 0;
  }
  /**
   * Step off WHERE YOU ARE — the vehicle stays put. This is what lets you ride
   * across the water and get out at the far shore (it used to teleport you back
   * to the berth, so the other end was unreachable). We look for dry ground
   * nearby first and step onto it; otherwise you slip into the water and swim.
   */
  private dismount() {
    const v = this.riding; if (!v) return;
    this.riding = null;
    const px = v.mesh.position.x, pz = v.mesh.position.z;
    // Land vehicle: step out of your own door onto the ground beside it, then
    // shove clear of anything solid. No water to fall into, so no shore probe.
    if (v.land) {
      v.speed = 0;
      const side = this.ridingRole === 'passenger' ? 1 : -1;
      const out = this.seatWorld(px, pz, v.ry, { dx: side * 2.1, dz: 0.4 });
      this.pos.x = out.x; this.pos.z = out.z; this.pos.y = 0; this.vy = 0;
      this.moveWithCollision(0, 0);
      return;
    }
    // probe around the hull for a dry landing spot (ring of candidates)
    const save = { x: this.pos.x, z: this.pos.z };
    let landed = false;
    for (const rad of [1.9, 2.8, 3.8]) {
      for (let i = 0; i < 12 && !landed; i++) {
        const a = (i / 12) * Math.PI * 2;
        this.pos.x = px + Math.cos(a) * rad; this.pos.z = pz + Math.sin(a) * rad;
        if (this.onDryGround()) landed = true;
      }
      if (landed) break;
    }
    if (!landed) {
      // no shore in reach — slide into the water beside the hull and swim
      this.pos.x = save.x + Math.cos(v.ry) * 1.6; this.pos.z = save.z - Math.sin(v.ry) * 1.6;
    }
    this.vy = 0;
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

    // swim zones: inside one, the avatar drops to water level and swims.
    // Beach keeps its original hardcoded shoreline swim (shore stays at y=0).
    const onPier = this.pos.x > -8 && this.pos.x < -4;
    let inZone: WorldSwimZone | null = null;
    if (!this.riding && !this.seated && !this.onDryGround()) {
      for (const z of this.swimZones) { const dx = this.pos.x - z.x, dz = this.pos.z - z.z; if (dx * dx + dz * dz < z.r * z.r) { inZone = z; break; } }
    }
    const beachSwim = this.def.id === 'beach_camp' && this.pos.z < -34 && Math.abs(this.pos.x) < 42 && !onPier;
    const swimming = !this.seated && !this.riding && (beachSwim || !!inZone);
    const desiredGroundY = inZone ? (inZone.waterY ?? -0.9) : 0;

    // movement (camera-relative)
    let moveSpeed = 0;
    if (this.riding && this.ridingRole === 'passenger') {
      // ── riding along in the other seat ──
      // The hull is driven by whoever is at the helm (their networked position
      // moves the mesh in updateRemotes), so we simply sit in our own seat.
      const v = this.riding;
      const p = this.riderPos(v, 'passenger');
      this.pos.set(p.x, v.seatY, p.z);
      this.facing = v.ry;
      if (v.land) this.followCam(v.ry, dt);
    } else if (this.riding && this.riding.land) {
      // ── driving a car ──
      // A proper car model: the stick's vertical axis is throttle/brake and the
      // horizontal axis steers (only while actually rolling, like a real car),
      // so the track can be driven in a line instead of crabbing sideways.
      const v = this.riding;
      let mx = this.input.move.x, my = this.input.move.y;
      const mag = Math.hypot(mx, my); if (mag > 1) { mx /= mag; my /= mag; }
      if (Math.abs(my) < 0.06) my = 0;
      const top = this.input.run ? CAR_BOOST : CAR_TOP;
      const want = my >= 0 ? my * top : my * CAR_REV;
      v.speed += (want - v.speed) * Math.min(1, dt * CAR_ACCEL);
      if (my === 0 && Math.abs(v.speed) < 0.25) v.speed = 0;
      // steering authority ramps in with speed and flips in reverse
      const grip = Math.min(1, Math.abs(v.speed) / 6) * (v.speed < 0 ? -1 : 1);
      v.ry -= mx * CAR_STEER * grip * dt;
      const c = v.mesh.position;
      const step = v.speed * dt;
      const p = { x: c.x - Math.sin(v.ry) * step, z: c.z - Math.cos(v.ry) * step };
      // barriers stop it properly; the roam radius is just a backstop so a car
      // can never be driven off past the edge of the scenery
      const bound = this.def.oceanR ?? OCEAN_R;
      const rr = Math.hypot(p.x, p.z);
      if (rr > bound) { p.x = p.x / rr * bound; p.z = p.z / rr * bound; v.speed *= 0.4; }
      if (this.pushOut(p, CAR_PAD)) v.speed *= 0.35;      // scraped a barrier
      c.set(p.x, v.floatY, p.z); v.mesh.rotation.y = v.ry;
      // spin the wheels with road speed; point the fronts where we're steering
      const roll = step / 0.44;
      for (let i = 0; i < v.wheels.length; i++) {
        v.wheels[i].rotation.x -= roll;
        if (i < 2) v.wheels[i].rotation.y = -mx * 0.5;     // first pair = front axle
      }
      const seat = this.riderPos(v, 'driver');
      this.pos.set(seat.x, v.seatY, seat.z);
      this.facing = v.ry;
      this.followCam(v.ry, dt);
    } else if (this.riding) {
      // ── driving a water vehicle ──
      const v = this.riding;
      let mx = this.input.move.x, my = this.input.move.y;
      const mag = Math.hypot(mx, my); if (mag > 1) { mx /= mag; my /= mag; }
      if (mag > 0.05) {
        const speed = this.input.run ? 12 : 8;
        const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
        const nx = ((-sin) * my + cos * mx), nz = ((-cos) * my + (-sin) * mx);
        const len = Math.hypot(nx, nz) || 1; const ux = nx / len, uz = nz / len;
        let px = this.pos.x + ux * speed * dt, pz = this.pos.z + uz * speed * dt;
        const bound = this.def.oceanR ?? OCEAN_R;
        const rr = Math.hypot(px, pz); if (rr > bound) { px = px / rr * bound; pz = pz / rr * bound; }
        // Refuse to drive onto dry ground (decks, piers, beaches).
        const keepX = this.pos.x, keepZ = this.pos.z;
        this.pos.x = px; this.pos.z = pz;
        if (this.onDryGround()) { this.pos.x = keepX; this.pos.z = keepZ; }
        const tf = Math.atan2(-ux, -uz); let d = tf - this.facing;
        while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        this.facing += d * Math.min(1, dt * 6);
        moveSpeed = speed * Math.min(1, mag);
      }
      this.pos.y = v.seatY;
      v.mesh.position.set(this.pos.x, v.floatY, this.pos.z); v.mesh.rotation.y = this.facing; v.ry = this.facing;
    } else if (!this.seated) {
      let mx = this.input.move.x, my = this.input.move.y;
      const mag = Math.hypot(mx, my);
      if (mag > 1) { mx /= mag; my /= mag; }
      if (mag > 0.05) {
        const speed = (this.input.run ? RUN : WALK) * (swimming ? 0.5 : 1);
        const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
        const dirX = (-sin) * my + cos * mx;
        const dirZ = (-cos) * my + (-sin) * mx;
        const len = Math.hypot(dirX, dirZ) || 1;
        const nx = dirX / len, nz = dirZ / len;
        this.moveWithCollision(nx * speed * dt, nz * speed * dt);
        const targetFace = Math.atan2(-nx, -nz);
        let d = targetFace - this.facing;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.facing += d * Math.min(1, dt * 12);
        moveSpeed = speed * Math.min(1, mag);
      }
      // vertical: gravity/jump clamped to the eased floor (deck or water level)
      this.groundY += (desiredGroundY - this.groundY) * Math.min(1, dt * 6);
      if (this.vy !== 0 || this.pos.y > this.groundY + 0.001) {
        this.pos.y += this.vy * dt;
        this.vy -= 22 * dt;
        if (this.pos.y <= this.groundY) { this.pos.y = this.groundY; this.vy = 0; }
      } else {
        this.pos.y += (this.groundY - this.pos.y) * Math.min(1, dt * 6);
      }
    }

    // nearest (free) seat + interactable + docked vehicle prompt
    this.nearSeat = null; this.nearObj = null; this.nearVehicle = null;
    if (!this.seated && !this.riding) {
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
      let vbd = 4.2 * 4.2;
      for (const v of this.vehicles) {
        const dx = v.mesh.position.x - this.pos.x, dz = v.mesh.position.z - this.pos.z;
        const d = dx * dx + dz * dz;
        if (d < vbd) { vbd = d; this.nearVehicle = v; }
      }
    }

    // avatar transform + animation
    this.avatar.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.avatar.group.rotation.y = this.facing;
    this.avatar.state = (this.seated && !this.seated.pose) || this.riding ? 'sit' : 'idle';
    this.avatar.holdPose = this.seated?.pose ?? (swimming ? 'swim' : null);
    this.avatar.setProp(this.seated?.prop ?? null);
    this.avatar.update(dt, moveSpeed);

    // third-person camera with ground clamp + collider pull-in
    this.syncAvatarVisibility();
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
      const maxPR = Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.35 : 1.75);
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
      const W = tNow().worlds;
      const nv = this.nearVehicle;
      const vIcon = nv?.land ? '🏎️' : '🛥️';
      const label = this.riding ? '🚪 გადმოსვლა'
        : this.seated ? (this.seated.pose ? W.shipDown : W.standUp)
        : nv
          ? (this.driverOf(nv.id) ? (this.passengerOf(nv.id) ? `${vIcon} სავსეა` : `${vIcon} მიჯექი`) : `${vIcon} მართვა`)
        : this.nearObj ? this.nearObj.label
        : this.nearSeat ? (this.nearSeat.pose ? W.shipStand : W.sit)
        : null;
      this.onHud?.({
        world: this.def.name,
        sitting: !!this.seated || !!this.riding,
        driving: !!this.riding && this.ridingRole === 'driver',
        canInteract: label, players: 1 + this.remotes.size, nearScreen: this.nearScreen,
      });
    }

    this.updateBubbles();
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(dt: number) {
    const eyeH = this.seated ? 0.7 : EYE;
    const cp = this.camPitch;   // + = look down, − = look up

    // ── first person ──
    // The camera IS the head: no orbit, no collider pull-in (nothing can come
    // between you and yourself), and the look target is projected forward along
    // the same yaw/pitch the third-person camera uses, so the two modes agree
    // about where "forward" is and switching never spins the view.
    if (this.camMode === 'first' && !this.seated && !this.riding) {
      const head = new THREE.Vector3(this.pos.x, this.pos.y + eyeH + 0.12, this.pos.z);
      // Snap rather than lerp: smoothing the camera onto your own head reads as
      // motion sickness, not weight.
      this.camPos.copy(head);
      this.camera.position.copy(this.camPos);
      const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
      this.camera.lookAt(
        head.x + fwd.x * 10,
        head.y - cp * 10,
        head.z + fwd.z * 10,
      );
      return;
    }

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
      // Cheap exact reject first: nothing farther than the segment's own length
      // (plus the collider) can possibly cross it. Worlds like the speedway ring
      // themselves with hundreds of barrier colliders, and this keeps the
      // per-frame sweep to a couple of comparisons for nearly all of them.
      const cdx = c.x - head.x, cdz = c.z - head.z;
      const reach = full + c.r + 0.3;
      if (cdx > reach || cdx < -reach || cdz > reach || cdz < -reach) continue;
      const along = cdx * dir.x + cdz * dir.z;
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

  /**
   * Shove a point out of every collider it overlaps (a wider radius than a
   * pedestrian's, since a car is a metre-wide object). Returns true if anything
   * was hit, which the driving code uses to scrub speed on a barrier scrape.
   * Pushing out rather than reverting is what lets a car slide along a wall
   * instead of sticking to it.
   */
  private pushOut(p: { x: number; z: number }, pad: number): boolean {
    let hit = false;
    for (const c of this.colliders) {
      if (c.h !== undefined && c.h <= 0.34) continue;    // kerbs and low trim: drive over
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + pad;
      if (d < min && d > 0.0001) { p.x = c.x + dx / d * min; p.z = c.z + dz / d * min; hit = true; }
    }
    return hit;
  }

  /** Ease the orbit camera back behind a steering vehicle (racing-game chase). */
  private followCam(ry: number, dt: number) {
    let d = ry - this.camYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.camYaw += d * Math.min(1, dt * 2.6);
  }

  private moveWithCollision(sx: number, sz: number) {
    const y = this.pos.y;
    this.pos.x += sx;
    for (const c of this.colliders) {
      if (c.h !== undefined && y >= c.h) continue;   // jumped clear of a low obstacle
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      const min = c.r + 0.34;
      // exact reject: hypot(dx,dz) >= max(|dx|,|dz|), so either axis clearing the
      // radius rules the collider out without the sqrt
      if (dx > min || dx < -min || dz > min || dz < -min) continue;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 0.0001) { this.pos.x = c.x + dx / d * min; }
    }
    this.pos.z += sz;
    for (const c of this.colliders) {
      if (c.h !== undefined && y >= c.h) continue;
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      const min = c.r + 0.34;
      if (dx > min || dx < -min || dz > min || dz < -min) continue;
      const d = Math.hypot(dx, dz);
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
      if (!(a as any)._static) g.gain.setTargetAtTime(vol * 0.9 * (a.gain ?? 1), this.audioCtx.currentTime, 0.4);
      const p = dist > 0.5 ? Math.max(-1, Math.min(1, (dx * cosY - dz * sinY) / dist)) : 0;
      pan.pan.setTargetAtTime(p, this.audioCtx.currentTime, 0.3);
    }
  }
}

/** A racing roundel: white disc, dark number, a ring in the car's own paint. */
function numberTexture(n: number, paint: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  const hex = `#${paint.toString(16).padStart(6, '0')}`;
  g.fillStyle = '#f4f6f8'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
  g.strokeStyle = hex; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 53, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#14161c'; g.font = 'bold 78px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
