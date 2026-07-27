// ── Deathrun — map format ─────────────────────────────────────────────
// A map is plain data: axis-aligned brushes for the world, plus traps whose
// motion is entirely keyframed. Nothing about a trap is decided at runtime, so
// every client that knows "trap 3 fired at T" draws and kills identically —
// which is why the netcode only ever has to relay a trap id and a timestamp.
import type { Box, Vec3 } from './physics';

export type MatKey =
  | 'stone' | 'stoneDark' | 'sand' | 'gold' | 'wood' | 'metal'
  | 'lava' | 'water' | 'glass' | 'trim' | 'blade' | 'spike' | 'grass';

export interface Brush {
  box: Box;
  mat: MatKey;
  solid?: boolean;        // default true
  deadly?: boolean;       // static hazard (lava, spike pit)
}

/** A window [start, end] in seconds from the moment the trap fires. */
export type Window = [number, number];

export interface TrapPart {
  box: Box;               // rest pose
  mat: MatKey;
  solid?: boolean;        // default true
  deadly?: boolean;       // lethal to touch while the trap is live
  /** Slide along an axis to `to` (a delta in metres) during `out`, back during `back`. */
  move?: { axis: 'x' | 'y' | 'z'; to: number; out: Window; back?: Window };
  /** Spin about an axis for the whole trap; `r` is the swept radius used for hits. */
  spin?: { axis: 'x' | 'y' | 'z'; rate: number; r: number };
  /** Disappear (and stop colliding) during this window — falling floors. */
  hide?: Window;
  /** Only exists (visible + deadly) during this window — fire, electricity. */
  flash?: Window;
}

export interface Trap {
  id: string;
  name: string;           // label on the Death's button
  icon: string;
  button: Vec3;           // where the button stands in the control corridor
  duration: number;       // seconds until it resets
  cooldown: number;
  parts: TrapPart[];
}

export interface Zone { x: number; z: number; hx: number; hz: number; y?: number; hy?: number }

export interface DrMap {
  id: string;
  name: string;
  /** Runners start behind the gate; the Death walks the control corridor. */
  runnerSpawns: Vec3[];
  deathSpawn: Vec3;
  /** Opened when the round starts. */
  startGate: Box;
  finish: Zone;
  duel: { spawnA: Vec3; spawnB: Vec3; centre: Vec3 };
  brushes: Brush[];
  traps: Trap[];
  /** Fall below this and you're dead. */
  fallY: number;
  /** Course axis: progress is measured along +x from `x0` to `x1`. */
  x0: number;
  x1: number;
  sky: number;
  fog: { color: number; density: number };
}

// ── authoring helpers ─────────────────────────────────────────────────
/** A brush from min/max corners — how you actually think about level geometry. */
export function bb(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: MatKey, extra: Partial<Brush> = {}): Brush {
  return {
    box: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, hx: Math.abs(x1 - x0) / 2, hy: Math.abs(y1 - y0) / 2, hz: Math.abs(z1 - z0) / 2 },
    mat, ...extra,
  };
}
export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box {
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, hx: Math.abs(x1 - x0) / 2, hy: Math.abs(y1 - y0) / 2, hz: Math.abs(z1 - z0) / 2 };
}

/** Where a part is right now, `t` seconds after the trap fired (t < 0 = at rest). */
export function partAt(p: TrapPart, t: number): { box: Box; visible: boolean; solid: boolean; deadly: boolean; spin: number } {
  const b = { ...p.box };
  let visible = true, solid = p.solid !== false, deadly = false, spin = 0;

  if (p.flash) {
    const [a, z] = p.flash;
    const on = t >= a && t <= z;
    visible = on; solid = false; deadly = on && !!p.deadly;
  } else if (p.hide) {
    const [a, z] = p.hide;
    const gone = t >= a && t <= z;
    visible = !gone; solid = solid && !gone;
  }

  if (p.move && t >= 0) {
    const [oa, oz] = p.move.out;
    let f = 0;
    if (t <= oa) f = 0;
    else if (t < oz) f = ease((t - oa) / (oz - oa));
    else if (p.move.back) {
      const [ba, bz] = p.move.back;
      if (t <= ba) f = 1;
      else if (t < bz) f = 1 - ease((t - ba) / (bz - ba));
      else f = 0;
    } else f = 1;
    b[p.move.axis] += p.move.to * f;
    // lethal while it is actually moving out
    if (p.deadly && t >= oa && (!p.move.back || t <= p.move.back[1])) deadly = true;
  } else if (p.deadly && !p.flash && t >= 0) {
    deadly = true;
  }

  if (p.spin && t >= 0) {
    spin = t * p.spin.rate;
    // a spinning blade is treated as its swept disc — forgiving, and it means a
    // near miss at 600 u/s doesn't depend on which frame you happened to land on
    const r = p.spin.r;
    if (p.spin.axis === 'y') { b.hx = r; b.hz = r; }
    else if (p.spin.axis === 'x') { b.hy = r; b.hz = r; }
    else { b.hx = r; b.hy = r; }
    if (p.deadly) deadly = true;
  }

  return { box: b, visible, solid, deadly, spin };
}

/** Smoothstep — traps that slam rather than glide read as mechanisms, not lifts. */
function ease(t: number): number { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); }

export function inZone(p: Vec3, z: Zone): boolean {
  if (Math.abs(p.x - z.x) > z.hx || Math.abs(p.z - z.z) > z.hz) return false;
  if (z.y !== undefined && z.hy !== undefined && Math.abs(p.y - z.y) > z.hy) return false;
  return true;
}
