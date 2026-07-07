// ── Premium Worlds — shared types ─────────────────────────────────────
// A modular, scalable 3D social-world system, deliberately separate from the
// classic 2D Virtual Spaces (which are untouched). Each world is a self-
// contained `WorldDef` that builds its environment against a `WorldContext`;
// the generic `WorldEngine` handles camera, character control, loop and perf.
import type * as THREE from 'three';

export interface WorldCollider { x: number; z: number; r: number; }      // cylinder (organic scenes)
// `pose` seats aren't sit-downs: the avatar stands and holds a pose (e.g. the
// bow "titanic" arms-out stance) while still locked in place with a Stand button.
export interface WorldSeat { id: string; x: number; y: number; z: number; yaw: number; pose?: 'titanic' | 'hammock'; }
// A tappable object. `effect` runs the visual/audio (locally AND when another
// player triggers it over the network), so it must be idempotent/replayable.
export interface WorldInteractable { id: string; x: number; z: number; r: number; label: string; effect: () => void; }
export type AmbientKind = 'ocean' | 'fire' | 'wind' | 'night';
export interface AmbientSource { kind: AmbientKind; x: number; z: number; radius: number; }
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
  fog: { color: number; density: number };
  clear: number;                // renderer clear colour
  build(ctx: WorldContext): void;
}
