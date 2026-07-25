// ── Premium Worlds — shared types ─────────────────────────────────────
// A modular, scalable 3D social-world system, deliberately separate from the
// classic 2D Virtual Spaces (which are untouched). Each world is a self-
// contained `WorldDef` that builds its environment against a `WorldContext`;
// the generic `WorldEngine` handles camera, character control, loop and perf.
import type * as THREE from 'three';

// cylinder (organic scenes). `h` = height: if the avatar's feet clear it
// (mid-jump), the collider is passed over. Omit `h` for full-height/solid.
export interface WorldCollider { x: number; z: number; r: number; h?: number; }
// `pose` seats aren't sit-downs: the avatar stands and holds a pose (e.g. the
// bow "titanic" arms-out stance) while still locked in place with a Stand button.
// `hugL`/`hugR` are a standing face-to-face embrace: two spots placed close
// together facing each other, arms wrapped around the partner.
// `titanic` is the arms-spread bow stance; `titanicBack` is its partner — stood
// close behind with both arms wrapped around the front person's waist.
export interface WorldSeat { id: string; x: number; y: number; z: number; yaw: number; pose?: 'titanic' | 'titanicBack' | 'hammock' | 'cuddleL' | 'cuddleR' | 'hugL' | 'hugR' | 'lapBase' | 'lapTop' | 'sing' | 'danceL' | 'danceR' | 'duelL' | 'duelR'; prop?: 'drink'; }
// A tappable object. `effect` runs the visual/audio (locally AND when another
// player triggers it over the network), so it must be idempotent/replayable.
export interface WorldInteractable { id: string; x: number; z: number; r: number; label: string; effect: () => void; }
export type AmbientKind = 'ocean' | 'fire' | 'wind' | 'night';
// `gain` (default 1) scales this source so a world can keep its ambience from
// drowning out player voice chat.
export interface AmbientSource { kind: AmbientKind; x: number; z: number; radius: number; gain?: number; }
// A circular region of open water. Inside it the avatar drops to `waterY`
// (default just below the surface), swims (slower, swim pose) and can dive.
export interface WorldSwimZone { x: number; z: number; r: number; waterY?: number; }
// A region that is ALWAYS dry, vetoing any swim zone that overlaps it. Decks,
// piers, platforms and plazas register these so you never "swim" on solid
// ground where a generously-sized swim zone happens to bleed over the edge.
// Circle when `r` is given, otherwise an (optionally rotated) rectangle.
export interface WorldDryZone { x: number; z: number; r?: number; hw?: number; hd?: number; yaw?: number; }
// A rideable water vehicle docked at (x,z). Walk up, interact to board, drive
// with WASD across the ocean, interact again to dock + step back onto the deck.
export type VehicleKind = 'jetski' | 'boat';
// `waterY` is the world's water surface, so the hull floats at the right height
// (worlds put their sea at different levels).
export interface WorldVehicle { id: string; x: number; z: number; yaw?: number; kind: VehicleKind; waterY?: number; }
// A flat video screen the engine can project to the viewport (world cinema).
export interface WorldScreen { x: number; y: number; z: number; w: number; h: number; ry: number; }

export interface AvatarConfig { bodyColor: string; glowColor: string; }

// What a world author gets to populate the scene.
export interface WorldContext {
  three: typeof THREE;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  moon: THREE.DirectionalLight;
  ambientLight: THREE.AmbientLight;
  addCollider(c: WorldCollider): void;
  addSeat(s: WorldSeat): void;
  addInteractable(o: WorldInteractable): void;
  addAmbient(a: AmbientSource): void;
  addSwimZone(z: WorldSwimZone): void;
  addDryZone(z: WorldDryZone): void;
  addVehicle(v: WorldVehicle): void;
  setScreen(s: WorldScreen): void;
  onUpdate(fn: (dt: number, elapsed: number) => void): void;
  disposables: (THREE.Texture | THREE.Material | THREE.BufferGeometry)[];
  // Live perf hint the engine keeps updating — worlds throttle expensive
  // per-frame work (e.g. ocean normal recompute) when `reduced` is true.
  perf: { reduced: boolean };
}

export interface WorldDef {
  id: string;
  name: string;
  subtitle: string;
  icon: string;                 // emoji used in the lobby card
  status: 'live' | 'soon';
  spawn: { x: number; z: number; yaw: number };
  // How far a rider may roam from the origin on the water (default 74). Worlds
  // with a bounded bay set this so boats can't be driven out over the scenery.
  oceanR?: number;
  fog: { color: number; density: number };
  clear: number;                // renderer clear colour
  build(ctx: WorldContext): void;
}
