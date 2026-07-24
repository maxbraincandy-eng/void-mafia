// ── Shared dynamic atmosphere: day/night cycle + weather ──────────────
// A reusable day/night + weather machine for the premium worlds. The world
// builds its own sky (exposing the three gradient Colors) and passes them in;
// this drives them, the moon/ambient lights, fog and (optionally) an ocean wave
// amplitude, plus a rain Points cloud and lightning during storms.
import * as THREE from 'three';
import type { WorldContext } from './types';

// mood keyframe: [topHex, midHex, botHex, moonInt, moonHex, ambInt, ambHex]
export type Mood = [number, number, number, number, number, number, number];

export const MOODS_SEA: Mood[] = [
  [0x3a6aa8, 0x7a9ad0, 0xdfeaf6, 1.15, 0xffffff, 1.2, 0x9fb4d8],   // day (bright)
  [0x14224e, 0x6a3a6a, 0xe0904a, 0.8, 0xffe0b0, 1.05, 0x8a6c8a],   // sunset
  [0x05061a, 0x1a1a44, 0x2a2a55, 1.05, 0xcdd6ff, 0.85, 0x5a5c8a],  // night (moonlit)
];

export interface AtmoOpts {
  sky: { top: THREE.Color; mid: THREE.Color; bot: THREE.Color };
  moods?: Mood[];
  cycle?: number;            // seconds for a full day
  onAmp?: (v: number) => void;
  rain?: boolean;
}

function lerpC(out: THREE.Color, a: number, b: number, t: number) { return out.setHex(a).lerp(_tmp.setHex(b), t); }
const _tmp = new THREE.Color();

export function setupAtmosphere(ctx: WorldContext, opts: AtmoOpts) {
  const MOODS = opts.moods ?? MOODS_SEA;
  const CYCLE = opts.cycle ?? 260;

  let rg: THREE.BufferGeometry | null = null; let rainMat: THREE.PointsMaterial | null = null; let RN = 0;
  if (opts.rain !== false) {
    RN = ctx.perf.reduced ? 260 : 540;
    const pos = new Float32Array(RN * 3);
    for (let i = 0; i < RN; i++) { pos[i * 3] = (Math.random() - 0.5) * 190; pos[i * 3 + 1] = Math.random() * 36; pos[i * 3 + 2] = (Math.random() - 0.5) * 190; }
    rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rainMat = new THREE.PointsMaterial({ color: 0xbcd0e0, size: 0.5, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const rain = new THREE.Points(rg, rainMat); rain.frustumCulled = false; ctx.scene.add(rain);
  }
  const flash = new THREE.PointLight(0xcfe0ff, 0, 340, 0.5); flash.position.set(-20, 80, -50); ctx.scene.add(flash);

  const SEQ: Array<[string, number]> = [['calm', 80], ['rain', 42], ['storm', 34], ['rain', 22], ['calm', 92], ['storm', 26]];
  let si = 0, wt = SEQ[0][1], wet = 0, storm = 0, nextFlash = 3;
  const cTop = new THREE.Color(), cMid = new THREE.Color(), cBot = new THREE.Color(), cA = new THREE.Color(), cMoon = new THREE.Color();
  const stormFog = new THREE.Color(0x262b40);

  ctx.onUpdate((dt, e) => {
    const p = ((e / CYCLE) % 1) * MOODS.length; const i0 = Math.floor(p) % MOODS.length, i1 = (i0 + 1) % MOODS.length, f = p - Math.floor(p);
    const A = MOODS[i0], B = MOODS[i1];
    wt -= dt; if (wt <= 0) { si = (si + 1) % SEQ.length; wt = SEQ[si][1]; }
    const st = SEQ[si][0];
    wet += ((st === 'rain' || st === 'storm' ? 1 : 0) - wet) * Math.min(1, dt * 0.5);
    storm += ((st === 'storm' ? 1 : 0) - storm) * Math.min(1, dt * 0.4);
    const dark = storm * 0.55;

    opts.sky.top.copy(lerpC(cTop, A[0], B[0], f)).multiplyScalar(1 - dark);
    opts.sky.mid.copy(lerpC(cMid, A[1], B[1], f)).multiplyScalar(1 - dark);
    opts.sky.bot.copy(lerpC(cBot, A[2], B[2], f)).multiplyScalar(1 - dark * 0.8);

    ctx.moon.intensity = (A[3] + (B[3] - A[3]) * f) * (1 - storm * 0.55) + flash.intensity * 0.02;
    ctx.moon.color.copy(lerpC(cMoon, A[4], B[4], f));
    ctx.ambientLight.intensity = Math.max(0.62, (A[5] + (B[5] - A[5]) * f) * (1 - storm * 0.3));
    ctx.ambientLight.color.copy(lerpC(cA, A[6], B[6], f));

    const fog: any = ctx.scene.fog;
    if (fog && fog.density !== undefined) { fog.density = (fog.userData?.base ?? 0.008) + wet * 0.008 + storm * 0.02; fog.color.copy(cBot).multiplyScalar(0.55).lerp(stormFog, storm * 0.6); }
    opts.onAmp?.(1 + storm * 2.2 + wet * 0.4);

    if (rainMat && rg) {
      rainMat.opacity = wet * 0.6;
      if (wet > 0.02 && !ctx.perf.reduced) {
        const pa = rg.getAttribute('position') as THREE.BufferAttribute; const sp = (16 + storm * 22) * dt;
        for (let i = 0; i < RN; i++) { let y = pa.getY(i) - sp; if (y < -1) { y = 36; pa.setX(i, (Math.random() - 0.5) * 190); pa.setZ(i, (Math.random() - 0.5) * 190); } pa.setY(i, y); }
        pa.needsUpdate = true;
      }
    }
    flash.intensity *= Math.max(0, 1 - dt * 6);
    if (storm > 0.5) { nextFlash -= dt; if (nextFlash <= 0) { nextFlash = 2.5 + Math.random() * 4; flash.intensity = 7; } }
  });
}
