// ── deathrun_temple ───────────────────────────────────────────────────
// A tribute to the CS 1.6 classic: one long sandstone corridor of trap rooms.
// Runners sprint it; the Death walks a raised control gallery alongside and
// presses buttons. Whoever reaches the far gate alive fights the Death with
// swords in the arena beyond.
//
// Rooms are listed in SEC as absolute x boundaries rather than a fixed stride,
// because the bhop room needs to be twice as long as the rest — its five
// platforms and their growing gaps come to 50 m on their own.
import { bb, box, type Brush, type DrMap, type Trap } from '../map';

const W = 6;              // corridor half-width
const WALL_H = 9;
//        0   1   2   3    4    5(bhop)  6    7    8    9    10
const SEC = [0, 28, 56, 84, 112, 168, 196, 224, 252, 280, 308];
const ROOMS = SEC.length - 1;

const brushes: Brush[] = [];
const traps: Trap[] = [];

// ── shell helpers ─────────────────────────────────────────────────────
function corridorFloor(x0: number, x1: number, mat: 'stone' | 'sand' = 'stone') {
  brushes.push(bb(x0, -1.2, -W, x1, 0, W, mat));
}
function pit(x0: number, x1: number) {
  // an open lava pit under a section — falling in kills on contact
  brushes.push(bb(x0, -9, -W, x1, -7.6, W, 'lava', { solid: true, deadly: true }));
}
function walls(x0: number, x1: number) {
  brushes.push(bb(x0, -1.2, -W - 1.4, x1, WALL_H, -W, 'sand'));
  brushes.push(bb(x0, -1.2, W, x1, WALL_H, W + 1.4, 'sand'));
}
function trim(x: number) {
  brushes.push(bb(x - 0.5, WALL_H - 1.1, -W - 1.5, x + 0.5, WALL_H + 0.6, W + 1.5, 'gold'));
  for (const z of [-W - 0.4, W + 0.4]) {
    brushes.push(bb(x - 0.75, -1.2, z - 0.75, x + 0.75, WALL_H, z + 0.75, 'stoneDark'));
    brushes.push(bb(x - 1.0, WALL_H, z - 1.0, x + 1.0, WALL_H + 0.8, z + 1.0, 'gold'));
  }
}
const BTN = (room: number, at = 0.5) => ({ x: SEC[room] + (SEC[room + 1] - SEC[room]) * at, y: 11, z: -18 });

// ── start room + gate ─────────────────────────────────────────────────
corridorFloor(-16, 0, 'sand');
walls(-16, 0);
brushes.push(bb(-16, -1.2, -W - 1.4, -15, WALL_H, W + 1.4, 'stoneDark'));
for (const z of [-4, 0, 4]) brushes.push(bb(-14.5, 0, z - 1.2, -13.5, 1.2, z + 1.2, 'gold'));
const START_GATE = box(-0.6, 0, -W, 0.6, 6, W);

for (let i = 0; i < ROOMS; i++) { walls(SEC[i], SEC[i + 1]); trim(SEC[i]); }
trim(SEC[ROOMS]);

// ── room 1 — SPIKE FLOOR ──────────────────────────────────────────────
corridorFloor(SEC[0], SEC[1]);
traps.push({
  id: 'spikes', name: 'ეკლები', icon: '🔻', button: BTN(0),
  duration: 4.2, cooldown: 6,
  parts: Array.from({ length: 5 }, (_, k) => ({
    // rows rise one after another, so sprinting in blind gets you
    box: box(SEC[0] + 4 + k * 4.6, -3.2, -W, SEC[0] + 5.6 + k * 4.6, -0.05, W),
    mat: 'spike' as const, deadly: true, solid: false,
    move: { axis: 'y' as const, to: 3.0, out: [0.15 * k, 0.15 * k + 0.22] as [number, number], back: [2.6, 3.4] as [number, number] },
  })),
});

// ── room 2 — CRUSHERS ─────────────────────────────────────────────────
corridorFloor(SEC[1], SEC[2]);
traps.push({
  id: 'crush', name: 'საბეგველი', icon: '⬇️', button: BTN(1),
  duration: 5, cooldown: 7,
  parts: [8, 18].map((dx, k) => ({
    box: box(SEC[1] + dx - 2.6, WALL_H - 2.4, -W, SEC[1] + dx + 2.6, WALL_H, W),
    mat: 'metal' as const, deadly: true,
    move: { axis: 'y' as const, to: -(WALL_H - 1.2), out: [0.5 * k, 0.5 * k + 0.35] as [number, number], back: [1.9 + 0.5 * k, 3.2 + 0.5 * k] as [number, number] },
  })),
});

// ── room 3 — FALLING FLOOR over lava ──────────────────────────────────
pit(SEC[2], SEC[3]);
{
  const N = 9, w = (SEC[3] - SEC[2]) / N;
  const parts = Array.from({ length: N }, (_, k) => {
    const x0 = SEC[2] + k * w;
    brushes.push(bb(x0 + 0.06, -1.2, -W, x0 + w - 0.06, 0, W, k % 2 ? 'stone' : 'stoneDark'));
    return {
      box: box(x0 + 0.06, -1.2, -W, x0 + w - 0.06, 0, W),
      mat: (k % 2 ? 'stone' : 'stoneDark') as 'stone' | 'stoneDark',
      hide: [0.25 * k, 4.4] as [number, number],
    };
  });
  traps.push({ id: 'drop', name: 'ჩამონგრევა', icon: '🕳️', button: BTN(2), duration: 6, cooldown: 8, parts });
}

// ── room 4 — SAW BLADES ───────────────────────────────────────────────
corridorFloor(SEC[3], SEC[4]);
traps.push({
  id: 'saws', name: 'ხერხები', icon: '⚙️', button: BTN(3),
  duration: 7, cooldown: 8,
  parts: [6, 13, 20].map((dx, k) => ({
    box: box(SEC[3] + dx - 0.16, 0.2, -2.4, SEC[3] + dx + 0.16, 5.0, 2.4),
    mat: 'blade' as const, deadly: true, solid: false,
    spin: { axis: 'x' as const, rate: 7.5 + k, r: 2.4 },
    // they also sweep across, so there is no safe lane to hug
    move: { axis: 'z' as const, to: k % 2 ? 7 : -7, out: [0.2, 2.2] as [number, number], back: [3.4, 5.6] as [number, number] },
  })),
});

// ── room 5 — THE BHOP SECTION (double length, no trap: pure movement) ──
// Gaps grow 4.6 → 7.0 m. A jump lasts 2·v_jump/g = 0.67 s, so ground run speed
// (250 u/s = 6.35 m/s) carries only 4.25 m: the FIRST gap already asks for speed
// you can only be carrying if you kept hopping. The last needs ~410 u/s.
pit(SEC[4], SEC[5]);
const BHOP_GAPS = [4.6, 5.2, 5.8, 6.4, 7.0];
const BHOP_PADS: Array<[number, number]> = [];
{
  let x = SEC[4];
  brushes.push(bb(x - 0.4, -1.2, -W, x + 3.2, 0, W, 'stone'));
  BHOP_PADS.push([x - 0.4, x + 3.2]);
  x += 3.2;
  for (let k = 0; k < BHOP_GAPS.length; k++) {
    x += BHOP_GAPS[k];
    const len = k === BHOP_GAPS.length - 1 ? 4.2 : 3.4;
    // 9 m wide: strafing is a lateral technique, so a pad you can only hit dead
    // centre punishes the exact input the room is asking you to make
    brushes.push(bb(x, -1.2, -4.5, x + len, 0, 4.5, k % 2 ? 'stone' : 'stoneDark'));
    brushes.push(bb(x + len / 2 - 0.5, 0, -0.5, x + len / 2 + 0.5, 0.08, 0.5, 'gold', { solid: false }));
    BHOP_PADS.push([x, x + len]);
    x += len;
  }
  brushes.push(bb(x, -1.2, -W, SEC[5], 0, W, 'stone'));
  BHOP_PADS.push([x, SEC[5]]);
}

// ── room 6 — FIRE JETS ────────────────────────────────────────────────
corridorFloor(SEC[5], SEC[6]);
traps.push({
  id: 'fire', name: 'ცეცხლი', icon: '🔥', button: BTN(5),
  duration: 6, cooldown: 7,
  parts: [4, 9, 14, 19, 24].flatMap((dx, k) => ([-1, 1].map(s => ({
    box: box(SEC[5] + dx - 1.1, 0, s > 0 ? 0 : -W, SEC[5] + dx + 1.1, 3.4, s > 0 ? W : 0),
    mat: 'lava' as const, deadly: true, solid: false,
    flash: [0.3 * k + (s > 0 ? 0 : 0.9), 0.3 * k + (s > 0 ? 0 : 0.9) + 1.5] as [number, number],
  })))),
});

// ── room 7 — COLLAPSING BRIDGE ────────────────────────────────────────
pit(SEC[6], SEC[7]);
{
  const N = 8, w = (SEC[7] - SEC[6]) / N;
  const parts = Array.from({ length: N }, (_, k) => {
    brushes.push(bb(SEC[6] + k * w + 0.05, -0.9, -2.2, SEC[6] + (k + 1) * w - 0.05, 0, 2.2, 'wood'));
    return {
      box: box(SEC[6] + k * w + 0.05, -0.9, -2.2, SEC[6] + (k + 1) * w - 0.05, 0, 2.2),
      mat: 'wood' as const,
      move: { axis: 'y' as const, to: -12, out: [0.3 + 0.22 * k, 1.1 + 0.22 * k] as [number, number], back: [5.2, 6.4] as [number, number] },
    };
  });
  for (const z of [-2.6, 2.6]) brushes.push(bb(SEC[6], 0, z - 0.18, SEC[7], 1.3, z + 0.18, 'wood', { solid: false }));
  traps.push({ id: 'bridge', name: 'ხიდი', icon: '🪵', button: BTN(6), duration: 7, cooldown: 9, parts });
}

// ── room 8 — PISTON SQUEEZE ───────────────────────────────────────────
corridorFloor(SEC[7], SEC[8]);
traps.push({
  id: 'piston', name: 'პრესი', icon: '↔️', button: BTN(7),
  duration: 6, cooldown: 8,
  parts: [7, 15, 22].flatMap((dx, k) => ([-1, 1].map(s => ({
    box: box(SEC[7] + dx - 2.2, -1.2, s * (W + 1.2) - 1.2, SEC[7] + dx + 2.2, 4.6, s * (W + 1.2) + 1.2),
    mat: 'metal' as const, deadly: true,
    move: { axis: 'z' as const, to: -s * 6.0, out: [0.35 * k, 0.35 * k + 0.4] as [number, number], back: [2.4 + 0.35 * k, 3.6 + 0.35 * k] as [number, number] },
  })))),
});

// ── room 9 — ARROW GAUNTLET ───────────────────────────────────────────
corridorFloor(SEC[8], SEC[9]);
for (const z of [-W - 0.2, W + 0.2]) for (let k = 0; k < 6; k++) {
  brushes.push(bb(SEC[8] + 3 + k * 4.2, 1.4, z - 0.25, SEC[8] + 3.9 + k * 4.2, 2.3, z + 0.25, 'stoneDark', { solid: false }));
}
traps.push({
  id: 'arrows', name: 'ისრები', icon: '🏹', button: BTN(8),
  duration: 5.5, cooldown: 7,
  parts: Array.from({ length: 12 }, (_, k) => {
    const s = k % 2 ? 1 : -1;
    return {
      box: box(SEC[8] + 3 + (k >> 1) * 4.2, 1.55, s * (W - 0.3), SEC[8] + 3.7 + (k >> 1) * 4.2, 2.05, s * (W + 0.3)),
      mat: 'blade' as const, deadly: true, solid: false,
      move: { axis: 'z' as const, to: -s * (2 * W - 0.6), out: [0.4 + (k >> 1) * 0.32, 0.72 + (k >> 1) * 0.32] as [number, number], back: [4.4, 4.9] as [number, number] },
    };
  }),
});

// ── room 10 — THE BOULDER ─────────────────────────────────────────────
corridorFloor(SEC[9], SEC[10]);
traps.push({
  id: 'boulder', name: 'ლოდი', icon: '🪨', button: BTN(9, 0.28),
  duration: 8, cooldown: 10,
  parts: [{
    box: box(SEC[9] - 5.2, -1.2, -4.4, SEC[9] + 3.6, 7.6, 4.4),
    mat: 'stoneDark' as const, deadly: true,
    spin: { axis: 'z' as const, rate: -2.6, r: 4.4 },
    move: { axis: 'x' as const, to: (SEC[10] - SEC[9]) + 6, out: [0.4, 5.4] as [number, number] },
  }],
});

// ── finish + duel arena ───────────────────────────────────────────────
const FIN_X = SEC[ROOMS];
corridorFloor(FIN_X, FIN_X + 14, 'sand');
walls(FIN_X, FIN_X + 14);
for (const z of [-3.2, 3.2]) brushes.push(bb(FIN_X + 5.6, 0, z - 0.6, FIN_X + 6.4, 6.5, z + 0.6, 'gold'));
brushes.push(bb(FIN_X + 5.6, 6.5, -3.8, FIN_X + 6.4, 7.4, 3.8, 'gold'));

// ── the descent hall: one open room where the Death's gallery comes down
// to ground level, so both sides walk into the arena through the same mouth.
const HALL_X0 = FIN_X + 14, HALL_X1 = FIN_X + 43;
const AR_X = FIN_X + 60, AR_R = 17;
brushes.push(bb(HALL_X0, -1.2, -18, HALL_X1, 0, 10, 'sand'));
brushes.push(bb(HALL_X0, -1.2, 10, HALL_X1, WALL_H, 11.4, 'sand'));
brushes.push(bb(HALL_X0, -1.2, -19.4, HALL_X1, WALL_H, -18, 'sand'));
// arena floor
brushes.push(bb(AR_X - AR_R, -1.4, -AR_R, AR_X + AR_R, 0, AR_R, 'sand'));
// approach from the hall to the arena mouth
brushes.push(bb(HALL_X1, -1.2, -AR_R, AR_X - AR_R, 0, 10, 'sand'));
// Ring wall — the −x side is deliberately OPEN (that is the entrance); two
// corner stubs keep it reading as an enclosure. An unbroken ring here walled
// the survivors out of their own duel.
for (const [x0, z0, x1, z1] of [
  [AR_X - AR_R - 1.4, -AR_R - 1.4, AR_X + AR_R + 1.4, -AR_R],
  [AR_X - AR_R - 1.4, AR_R, AR_X + AR_R + 1.4, AR_R + 1.4],
  [AR_X + AR_R, -AR_R, AR_X + AR_R + 1.4, AR_R],
  [AR_X - AR_R - 1.4, -AR_R, AR_X - AR_R, -AR_R + 3],
  [AR_X - AR_R - 1.4, AR_R - 3, AR_X - AR_R, AR_R],
] as const) brushes.push(bb(x0, -1.4, z0, x1, 3.2, z1, 'stoneDark'));
for (let k = 0; k < 8; k++) {
  const a = (k / 8) * Math.PI * 2 + 0.4;
  const px = AR_X + Math.cos(a) * (AR_R - 2.4), pz = Math.sin(a) * (AR_R - 2.4);
  brushes.push(bb(px - 0.8, 0, pz - 0.8, px + 0.8, 6.5, pz + 0.8, 'stoneDark'));
  brushes.push(bb(px - 1.0, 6.5, pz - 1.0, px + 1.0, 7.2, pz + 1.0, 'gold'));
}

// ── the Death's control gallery ───────────────────────────────────────
// Runs the whole length at y=10 on the −z side, with a rail low enough to see
// over and a stair at the end down to the arena, so the Death joins the duel.
brushes.push(bb(-18, 9.6, -22, HALL_X0, 10, -13, 'stoneDark'));
brushes.push(bb(-18, 10, -13.6, HALL_X0, 11.3, -13, 'gold'));
brushes.push(bb(-18, 10, -22.6, HALL_X0, 13, -22, 'sand'));
// staircase down into the descent hall — 9 steps of 1.2 m, well inside the
// hall's own footprint so nothing crosses a wall
for (let k = 0; k < 9; k++) {
  brushes.push(bb(HALL_X0 + k * 2.6, -1.2, -17.6, HALL_X0 + 2.6 + k * 2.6, 10 - k * 1.2, -13, 'stoneDark'));
}

export const temple: DrMap = {
  id: 'temple',
  name: 'deathrun_temple',
  runnerSpawns: Array.from({ length: 12 }, (_, k) => ({ x: -14 + (k % 3) * 1.6, y: 0.1, z: -4 + Math.floor(k / 3) * 2.6 })),
  deathSpawn: { x: -14, y: 10.2, z: -17.5 },
  startGate: START_GATE,
  finish: { x: FIN_X + 6, z: 0, hx: 1.6, hz: 3.6 },
  duel: {
    spawnA: { x: AR_X - 9, y: 0.2, z: 0 },
    spawnB: { x: AR_X + 9, y: 0.2, z: 0 },
    centre: { x: AR_X, y: 0, z: 0 },
  },
  brushes,
  traps,
  fallY: -14,
  x0: 0,
  x1: FIN_X + 6,
  sky: 0xe8c98a,
  fog: { color: 0xd9bf90, density: 0.0075 },
};

/** Exported for the map verifier: the bhop pads and the gaps between them. */
export const _bhop = { gaps: BHOP_GAPS, pads: BHOP_PADS, sec: SEC };
