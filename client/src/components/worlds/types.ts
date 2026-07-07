// ── Premium Worlds — shared types ─────────────────────────────────────
// A modular, scalable 3D social-world system, deliberately separate from the
// classic 2D Virtual Spaces (which are untouched). Each world is a self-
// contained `WorldDef` that builds its environment against a `WorldContext`;
// the generic `WorldEngine` handles camera, character control, loop and perf.
import type * as THREE from 'three';

export interface WorldCollider { x: number; z: number; r: number; }      // cylinder (organic scenes)
export interface WorldSeat { id: string; x: number; y: number; z: number; yaw: number; }
export type AmbientKind = 'ocean' | 'fire' | 'wind' | 'night';
export interface AmbientSource { kind: AmbientKind; x: number; z: number; radius: number; }

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
  addAmbient(a: AmbientSource): void;
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
