import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/store/langStore';

/**
 * Neo Bandicoot — single-player 2D platformer, self-contained canvas game.
 * Physics + game-feel assists (coyote time, jump buffering, variable jump
 * height, double jump) ported from the Godot 4.3 prototype. Keyboard uses
 * e.code (layout-independent) + on-screen touch controls. 60 fps capped,
 * crash-guarded loop; progress saved to localStorage.
 *
 * 5 levels of escalating difficulty: moving platforms (with rider carry),
 * lava, patrol enemies (stomp or spin to kill), spikes.
 */

// ── Physics ───────────────────────────────────────────────────────────
const MAX_SPEED = 250;
const ACCEL = 1600, FRICTION = 2000, AIR_ACCEL = 1000;
const GRAVITY = 1300, MAX_FALL = 760;
const JUMP_V = -470, DOUBLE_JUMP_V = -410, JUMP_CUT = 0.45;
const COYOTE = 0.10, BUFFER = 0.12, SPIN_TIME = 0.35;
const STOMP_BOUNCE = -340;

const PW = 26, PH = 40, EW = 28, EH = 26;
const WORLD_H = 720;
const SAVE_KEY = 'nbo_unlocked';

interface Rect { x: number; y: number; w: number; h: number }
interface MoverDef { bx: number; by: number; w: number; h: number; ax: 'x' | 'y'; range: number; speed: number; phase: number }
interface Hazard { x: number; y: number; w: number; lava?: boolean }
interface EnemyDef { x: number; y: number; minX: number; maxX: number; speed: number }
interface Level {
  name: string; worldW: number; spawn: { x: number; y: number }; checkpointX: number; goalX: number;
  platforms: Rect[]; movers: MoverDef[]; coins: { x: number; y: number }[]; boxes: { x: number; y: number }[];
  hazards: Hazard[]; enemies: EnemyDef[]; sky: [string, string, string]; hill1: string; hill2: string;
  banner?: { x: number; y: number; text: string };
}

// helper: enemy sitting on a platform whose top is at `topY`
const enemyOn = (x: number, topY: number, minX: number, maxX: number, speed = 60): EnemyDef => ({ x, y: topY - EH, minX, maxX, speed });

const LEVELS: Level[] = [
  // 1 · Jungle Awakening — tutorial
  {
    name: 'Jungle Awakening', worldW: 3400, spawn: { x: 80, y: 560 }, checkpointX: 1780, goalX: 3260,
    sky: ['#12082b', '#241242', '#3a1c52'], hill1: 'rgba(90,40,140,0.35)', hill2: 'rgba(140,70,200,0.28)',
    banner: { x: 120, y: 300, text: 'ბატონი მაქსი გისურვებთ ხოშიან თამაშს' },
    platforms: [
      { x: 0, y: 620, w: 1180, h: 100 }, { x: 1320, y: 620, w: 560, h: 100 }, { x: 2020, y: 620, w: 1380, h: 100 },
      { x: 340, y: 500, w: 150, h: 22 }, { x: 560, y: 400, w: 150, h: 22 }, { x: 800, y: 320, w: 130, h: 22 },
      { x: 1040, y: 430, w: 130, h: 22 }, { x: 1450, y: 490, w: 140, h: 22 }, { x: 1660, y: 380, w: 140, h: 22 },
      { x: 2160, y: 500, w: 150, h: 22 }, { x: 2400, y: 400, w: 150, h: 22 }, { x: 2660, y: 310, w: 130, h: 22 },
    ],
    movers: [],
    coins: [{ x: 380, y: 460 }, { x: 420, y: 460 }, { x: 610, y: 360 }, { x: 650, y: 360 }, { x: 850, y: 280 }, { x: 890, y: 280 }, { x: 1240, y: 540 }, { x: 1500, y: 450 }, { x: 1710, y: 340 }, { x: 2210, y: 460 }, { x: 2450, y: 360 }, { x: 2710, y: 270 }, { x: 2900, y: 560 }],
    boxes: [{ x: 520, y: 588 }, { x: 552, y: 588 }, { x: 1420, y: 588 }, { x: 2300, y: 588 }, { x: 2332, y: 588 }, { x: 2332, y: 556 }],
    hazards: [{ x: 960, y: 604, w: 90 }, { x: 1700, y: 604, w: 110 }, { x: 2520, y: 604, w: 90 }],
    enemies: [enemyOn(700, 620, 620, 900), enemyOn(2200, 620, 2080, 2480)],
  },
  // 2 · Ancient Void Ruins — moving platforms, enemies
  {
    name: 'Ancient Void Ruins', worldW: 4000, spawn: { x: 70, y: 540 }, checkpointX: 2050, goalX: 3860,
    sky: ['#04121f', '#0a2338', '#123a52'], hill1: 'rgba(30,90,140,0.35)', hill2: 'rgba(40,140,180,0.25)',
    platforms: [
      { x: 0, y: 620, w: 520, h: 100 }, { x: 760, y: 560, w: 160, h: 22 }, { x: 1080, y: 480, w: 150, h: 22 },
      { x: 1480, y: 620, w: 420, h: 100 }, { x: 1560, y: 430, w: 120, h: 22 }, { x: 1780, y: 330, w: 120, h: 22 },
      { x: 2020, y: 620, w: 360, h: 100 }, { x: 2500, y: 520, w: 140, h: 22 }, { x: 2760, y: 420, w: 140, h: 22 },
      { x: 3040, y: 620, w: 340, h: 100 }, { x: 3480, y: 620, w: 520, h: 100 }, { x: 3540, y: 470, w: 130, h: 22 },
    ],
    movers: [
      { bx: 560, by: 560, w: 110, h: 22, ax: 'x', range: 120, speed: 1.3, phase: 0 },
      { bx: 1260, by: 470, w: 110, h: 22, ax: 'y', range: 90, speed: 1.6, phase: 1 },
      { bx: 2420, by: 560, w: 110, h: 22, ax: 'x', range: 150, speed: 1.1, phase: 2 },
    ],
    coins: [{ x: 300, y: 560 }, { x: 620, y: 520 }, { x: 830, y: 500 }, { x: 1150, y: 420 }, { x: 1330, y: 430 }, { x: 1620, y: 370 }, { x: 1840, y: 270 }, { x: 2200, y: 560 }, { x: 2560, y: 460 }, { x: 2830, y: 360 }, { x: 3180, y: 560 }, { x: 3600, y: 410 }, { x: 3760, y: 560 }],
    boxes: [{ x: 400, y: 588 }, { x: 1700, y: 588 }, { x: 1700, y: 556 }, { x: 3120, y: 588 }, { x: 3600, y: 438 }],
    hazards: [{ x: 1080, y: 604, w: 380 }, { x: 2900, y: 604, w: 130 }, { x: 3560, y: 604, w: 120 }],
    enemies: [enemyOn(300, 620, 40, 480), enemyOn(2150, 620, 2040, 2360), enemyOn(3250, 620, 3060, 3440)],
  },
  // 3 · Lava Factory — lava pits, fast movers
  {
    name: 'Lava Factory', worldW: 4400, spawn: { x: 70, y: 540 }, checkpointX: 2300, goalX: 4260,
    sky: ['#1a0505', '#3a0e08', '#5a1a0a'], hill1: 'rgba(120,30,20,0.4)', hill2: 'rgba(180,60,20,0.3)',
    platforms: [
      { x: 0, y: 620, w: 460, h: 100 }, { x: 720, y: 540, w: 130, h: 22 }, { x: 1000, y: 620, w: 260, h: 100 },
      { x: 1460, y: 520, w: 120, h: 22 }, { x: 1720, y: 420, w: 120, h: 22 }, { x: 1980, y: 620, w: 300, h: 100 },
      { x: 2460, y: 530, w: 120, h: 22 }, { x: 2740, y: 430, w: 110, h: 22 }, { x: 3000, y: 620, w: 260, h: 100 },
      { x: 3460, y: 500, w: 110, h: 22 }, { x: 3720, y: 400, w: 110, h: 22 }, { x: 3980, y: 620, w: 420, h: 100 },
    ],
    movers: [
      { bx: 520, by: 560, w: 100, h: 20, ax: 'x', range: 150, speed: 1.8, phase: 0 },
      { bx: 1300, by: 480, w: 100, h: 20, ax: 'x', range: 130, speed: 2.0, phase: 1.5 },
      { bx: 2320, by: 500, w: 100, h: 20, ax: 'y', range: 130, speed: 2.2, phase: 0.7 },
      { bx: 3300, by: 540, w: 100, h: 20, ax: 'x', range: 170, speed: 1.9, phase: 2.2 },
    ],
    coins: [{ x: 250, y: 560 }, { x: 780, y: 500 }, { x: 1120, y: 560 }, { x: 1520, y: 470 }, { x: 1780, y: 370 }, { x: 2100, y: 560 }, { x: 2520, y: 480 }, { x: 2800, y: 380 }, { x: 3100, y: 560 }, { x: 3520, y: 450 }, { x: 3780, y: 350 }, { x: 4080, y: 560 }, { x: 4200, y: 560 }],
    boxes: [{ x: 300, y: 588 }, { x: 1080, y: 588 }, { x: 2060, y: 588 }, { x: 3080, y: 588 }, { x: 3080, y: 556 }],
    hazards: [{ x: 460, y: 660, w: 260, lava: true }, { x: 1260, y: 660, w: 200, lava: true }, { x: 2280, y: 660, w: 180, lava: true }, { x: 3260, y: 660, w: 200, lava: true }, { x: 1720, y: 404, w: 120 }],
    enemies: [enemyOn(1080, 620, 1000, 1240), enemyOn(2080, 620, 1980, 2260), enemyOn(4080, 620, 3980, 4380)],
  },
  // 4 · Frost Caverns — long, tight jumps, many enemies + movers
  {
    name: 'Frost Caverns', worldW: 4600, spawn: { x: 70, y: 540 }, checkpointX: 2400, goalX: 4460,
    sky: ['#071824', '#0e2f3f', '#1a4a5c'], hill1: 'rgba(80,160,190,0.3)', hill2: 'rgba(150,210,230,0.22)',
    platforms: [
      { x: 0, y: 620, w: 420, h: 100 }, { x: 640, y: 540, w: 110, h: 22 }, { x: 900, y: 460, w: 110, h: 22 },
      { x: 1160, y: 380, w: 110, h: 22 }, { x: 1440, y: 480, w: 120, h: 22 }, { x: 1700, y: 620, w: 360, h: 100 },
      { x: 2200, y: 520, w: 120, h: 22 }, { x: 2460, y: 430, w: 110, h: 22 }, { x: 2720, y: 620, w: 320, h: 100 },
      { x: 3200, y: 520, w: 110, h: 22 }, { x: 3460, y: 420, w: 110, h: 22 }, { x: 3720, y: 320, w: 110, h: 22 },
      { x: 3980, y: 620, w: 620, h: 100 },
    ],
    movers: [
      { bx: 500, by: 560, w: 100, h: 20, ax: 'y', range: 100, speed: 1.7, phase: 0 },
      { bx: 1300, by: 430, w: 100, h: 20, ax: 'x', range: 120, speed: 1.9, phase: 1 },
      { bx: 2600, by: 540, w: 100, h: 20, ax: 'x', range: 160, speed: 1.6, phase: 2 },
      { bx: 3600, by: 560, w: 100, h: 20, ax: 'y', range: 120, speed: 2.1, phase: 0.6 },
    ],
    coins: [{ x: 250, y: 560 }, { x: 690, y: 500 }, { x: 950, y: 420 }, { x: 1210, y: 340 }, { x: 1490, y: 440 }, { x: 1880, y: 560 }, { x: 2260, y: 480 }, { x: 2510, y: 390 }, { x: 2880, y: 560 }, { x: 3250, y: 480 }, { x: 3510, y: 380 }, { x: 3770, y: 280 }, { x: 4200, y: 560 }],
    boxes: [{ x: 300, y: 588 }, { x: 1780, y: 588 }, { x: 1780, y: 556 }, { x: 2800, y: 588 }, { x: 4100, y: 588 }],
    hazards: [{ x: 420, y: 604, w: 220 }, { x: 2060, y: 604, w: 140 }, { x: 3040, y: 604, w: 160 }],
    enemies: [enemyOn(200, 620, 40, 400), enemyOn(1800, 620, 1700, 2040), enemyOn(2820, 620, 2720, 3020), enemyOn(4200, 620, 3980, 4560)],
  },
  // 5 · Neon Citadel — the gauntlet: lava, fast movers, packed enemies
  {
    name: 'Neon Citadel', worldW: 5000, spawn: { x: 70, y: 540 }, checkpointX: 2600, goalX: 4860,
    sky: ['#0b0420', '#1e0a3e', '#3a1060'], hill1: 'rgba(120,40,200,0.35)', hill2: 'rgba(0,200,220,0.2)',
    platforms: [
      { x: 0, y: 620, w: 420, h: 100 }, { x: 680, y: 520, w: 110, h: 22 }, { x: 960, y: 620, w: 220, h: 100 },
      { x: 1420, y: 500, w: 100, h: 22 }, { x: 1680, y: 400, w: 100, h: 22 }, { x: 1940, y: 620, w: 260, h: 100 },
      { x: 2400, y: 520, w: 110, h: 22 }, { x: 2680, y: 620, w: 240, h: 100 }, { x: 3160, y: 500, w: 100, h: 22 },
      { x: 3420, y: 400, w: 100, h: 22 }, { x: 3680, y: 300, w: 100, h: 22 }, { x: 3940, y: 620, w: 240, h: 100 },
      { x: 4420, y: 500, w: 100, h: 22 }, { x: 4640, y: 620, w: 360, h: 100 },
    ],
    movers: [
      { bx: 500, by: 540, w: 90, h: 20, ax: 'x', range: 150, speed: 2.1, phase: 0 },
      { bx: 1250, by: 470, w: 90, h: 20, ax: 'x', range: 130, speed: 2.3, phase: 1.4 },
      { bx: 2250, by: 500, w: 90, h: 20, ax: 'y', range: 140, speed: 2.4, phase: 0.5 },
      { bx: 3120, by: 560, w: 90, h: 20, ax: 'x', range: 180, speed: 2.0, phase: 2 },
      { bx: 4260, by: 540, w: 90, h: 20, ax: 'y', range: 130, speed: 2.6, phase: 1 },
    ],
    coins: [{ x: 250, y: 560 }, { x: 730, y: 480 }, { x: 1070, y: 560 }, { x: 1470, y: 460 }, { x: 1730, y: 360 }, { x: 2050, y: 560 }, { x: 2450, y: 480 }, { x: 2800, y: 560 }, { x: 3210, y: 460 }, { x: 3470, y: 360 }, { x: 3730, y: 260 }, { x: 4050, y: 560 }, { x: 4700, y: 560 }],
    boxes: [{ x: 300, y: 588 }, { x: 1040, y: 588 }, { x: 2020, y: 588 }, { x: 2760, y: 588 }, { x: 2760, y: 556 }, { x: 4720, y: 588 }],
    hazards: [{ x: 420, y: 660, w: 260, lava: true }, { x: 1180, y: 660, w: 240, lava: true }, { x: 2200, y: 660, w: 200, lava: true }, { x: 2920, y: 660, w: 240, lava: true }, { x: 4180, y: 660, w: 240, lava: true }],
    enemies: [enemyOn(200, 620, 40, 400), enemyOn(1040, 620, 960, 1180), enemyOn(2050, 620, 1940, 2200), enemyOn(2800, 620, 2680, 2920), enemyOn(4050, 620, 3940, 4180), enemyOn(4750, 620, 4640, 4980)],
  },
];

interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string }
type Status = 'play' | 'clear' | 'win' | 'over';

export function NeoBandicoot({ onClose }: { onClose: () => void }) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readUnlocked = () => { try { return Math.min(LEVELS.length - 1, Math.max(0, +(localStorage.getItem(SAVE_KEY) || 0))); } catch { return 0; } };
  const [levelIdx, setLevelIdx] = useState(readUnlocked);
  const totalCoinsRef = useRef(0);
  const restartRef = useRef(0);
  const [hud, setHud] = useState({ coins: 0, lives: 3, time: 0, status: 'play' as Status, level: 1, name: LEVELS[0]!.name, total: 0 });

  useEffect(() => {
    const L = LEVELS[levelIdx]!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let disposed = false;
    const WORLD_W = L.worldW;

    const p = { x: L.spawn.x, y: L.spawn.y, vx: 0, vy: 0, face: 1, grounded: false, jumps: 2, coyote: 0, buffer: 0, spin: 0, hurt: 0, runPhase: 0, riding: -1 };
    let checkpoint = { ...L.spawn };
    const coins = L.coins.map(c => ({ ...c, got: false }));
    const boxes = L.boxes.map(b => ({ ...b, broken: false }));
    const movers = L.movers.map(m => ({ ...m, x: m.bx, y: m.by, _dx: 0, _dy: 0 }));
    const enemies = L.enemies.map(e => ({ ...e, dir: 1, dead: false }));
    const hazards = L.hazards;
    const parts: Particle[] = [];
    let coinCount = 0, lives = 3, status: Status = 'play', elapsed = 0, gameT = 0, shake = 0;

    const syncHud = () => setHud({ coins: coinCount, lives, time: Math.floor(elapsed), status, level: levelIdx + 1, name: L.name, total: totalCoinsRef.current + coinCount });

    const keys: Record<string, boolean> = {};
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { onClose(); return; }
      if (['KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyJ', 'KeyX'].includes(e.code)) e.preventDefault();
      if (!keys[e.code]) {
        if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') p.buffer = BUFFER;
        if (e.code === 'KeyJ' || e.code === 'KeyX') startSpin();
      }
      keys[e.code] = true;
    };
    const ku = (e: KeyboardEvent) => { keys[e.code] = false; if ((e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') && p.vy < 0) p.vy *= JUMP_CUT; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    const touch = { left: false, right: false };
    (canvas as any)._touch = touch;
    (canvas as any)._jump = () => { p.buffer = BUFFER; };
    (canvas as any)._spin = () => startSpin();

    const spawnParts = (n: number, x: number, y: number, spread: number, color: string) => {
      const cap = Math.min(n, 120 - parts.length);
      for (let i = 0; i < cap; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * spread, vy: -Math.random() * spread, life: 0.6, color });
    };
    function startSpin() {
      if (p.spin > 0 || status !== 'play') return;
      p.spin = SPIN_TIME;
      const cx = p.x + PW / 2, cy = p.y + PH / 2;
      for (const b of boxes) if (!b.broken && Math.abs(b.x + 16 - cx) < 48 && Math.abs(b.y + 16 - cy) < 48) breakBox(b);
      for (const e of enemies) if (!e.dead && Math.abs(e.x + EW / 2 - cx) < 52 && Math.abs(e.y + EH / 2 - cy) < 48) killEnemy(e);
    }
    function breakBox(b: { x: number; y: number; broken: boolean }) {
      b.broken = true; coinCount++; shake = 6;
      spawnParts(6, b.x + 16, b.y + 16, 240, '#c8873a');
    }
    function killEnemy(e: { x: number; y: number; dead: boolean }) { e.dead = true; shake = Math.max(shake, 4); spawnParts(7, e.x + EW / 2, e.y + EH / 2, 220, '#c084fc'); }
    function die() {
      lives--; shake = 10; p.hurt = 0.9;
      spawnParts(8, p.x + PW / 2, p.y + PH / 2, 280, '#ff8c26');
      if (lives <= 0) status = 'over';
      else { p.x = checkpoint.x; p.y = checkpoint.y; p.vx = 0; p.vy = 0; p.riding = -1; }
      syncHud();
    }
    function reachGoal() {
      totalCoinsRef.current += coinCount;
      try { localStorage.setItem(SAVE_KEY, String(Math.min(LEVELS.length - 1, levelIdx + 1))); } catch { /* ignore */ }
      status = levelIdx < LEVELS.length - 1 ? 'clear' : 'win';
      shake = 4; syncHud();
    }

    let raf = 0, last = performance.now(), acc = 0;
    const loop = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      if (document.hidden) { last = now; return; }
      const frame = Math.min((now - last) / 1000, 0.05);
      last = now; acc += frame;
      if (acc < 1 / 62) return;
      const dt = Math.min(acc, 1 / 30); acc = 0;
      try { if (status === 'play') { step(dt); elapsed += dt; gameT += dt; } render(); }
      catch (err) { console.warn('[bandicoot] frame error (recovered):', err); }
    };

    const blockScroll = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
    document.addEventListener('touchmove', blockScroll, { passive: false });
    let wakeLock: any = null;
    const acquireWake = () => { (navigator as any).wakeLock?.request?.('screen').then((wl: any) => { wakeLock = wl; }).catch(() => {}); };
    acquireWake();
    const onVis = () => { if (!document.hidden) { acquireWake(); last = performance.now(); } };
    document.addEventListener('visibilitychange', onVis);

    const overlap = (x: number, y: number, w: number, h: number, r: Rect) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y;
    const puff = () => spawnParts(3, p.x + PW / 2, p.y + PH, 100, 'rgba(255,255,255,0.7)');

    function step(dt: number) {
      for (const m of movers) {
        const off = Math.sin(gameT * m.speed + m.phase) * m.range;
        const nx = m.ax === 'x' ? m.bx + off : m.bx, ny = m.ax === 'y' ? m.by + off : m.by;
        m._dx = nx - m.x; m._dy = ny - m.y; m.x = nx; m.y = ny;
      }
      if (p.riding >= 0 && movers[p.riding]) { p.x += movers[p.riding]!._dx; p.y += movers[p.riding]!._dy; }
      p.riding = -1;

      const axis = (keys['KeyA'] || keys['ArrowLeft'] || touch.left ? -1 : 0) + (keys['KeyD'] || keys['ArrowRight'] || touch.right ? 1 : 0);
      const accel = axis !== 0 ? (p.grounded ? ACCEL : AIR_ACCEL) : FRICTION;
      const target = axis * MAX_SPEED;
      p.vx = p.vx < target ? Math.min(p.vx + accel * dt, target) : Math.max(p.vx - accel * dt, target);
      if (axis !== 0) p.face = axis;
      p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);

      if (p.buffer > 0) {
        if (p.grounded || p.coyote > 0) { p.vy = JUMP_V; p.jumps = 1; p.buffer = 0; p.coyote = 0; puff(); }
        else if (p.jumps > 0) { p.vy = DOUBLE_JUMP_V; p.jumps--; p.buffer = 0; puff(); }
      }

      // horizontal — everything solid (boxes never break on contact, only spin)
      p.x += p.vx * dt;
      for (const r of L.platforms) if (overlap(p.x, p.y, PW, PH, r)) { p.x = p.vx > 0 ? r.x - PW : r.x + r.w; p.vx = 0; }
      for (const m of movers) { const r = { x: m.x, y: m.y, w: m.w, h: m.h }; if (overlap(p.x, p.y, PW, PH, r)) { p.x = p.vx > 0 ? r.x - PW : r.x + r.w; p.vx = 0; } }
      for (const b of boxes) { if (b.broken) continue; const r = { x: b.x, y: b.y, w: 32, h: 32 }; if (overlap(p.x, p.y, PW, PH, r)) { p.x = p.vx > 0 ? r.x - PW : r.x + r.w; p.vx = 0; } }
      p.x = Math.max(0, Math.min(WORLD_W - PW, p.x));

      // vertical
      const wasAir = !p.grounded;
      p.y += p.vy * dt;
      p.grounded = false;
      const landOn = (r: Rect, rideIdx = -1) => { if (overlap(p.x, p.y, PW, PH, r)) { if (p.vy > 0) { p.y = r.y - PH; p.grounded = true; if (rideIdx >= 0) p.riding = rideIdx; } else { p.y = r.y + r.h; } p.vy = 0; } };
      for (const r of L.platforms) landOn(r);
      for (let mi = 0; mi < movers.length; mi++) { const m = movers[mi]!; landOn({ x: m.x, y: m.y, w: m.w, h: m.h }, mi); }
      for (const b of boxes) if (!b.broken) landOn({ x: b.x, y: b.y, w: 32, h: 32 });   // boxes are solid; stand on them

      if (p.grounded) { p.coyote = COYOTE; p.jumps = 2; if (wasAir && Math.abs(p.vy) < 1) shake = Math.max(shake, 2); }
      else p.coyote = Math.max(0, p.coyote - dt);
      p.buffer = Math.max(0, p.buffer - dt);
      p.spin = Math.max(0, p.spin - dt);
      p.hurt = Math.max(0, p.hurt - dt);

      // enemies
      for (const e of enemies) {
        if (e.dead) continue;
        e.x += e.dir * e.speed * dt;
        if (e.x <= e.minX) { e.x = e.minX; e.dir = 1; } else if (e.x >= e.maxX) { e.x = e.maxX; e.dir = -1; }
        const r = { x: e.x, y: e.y, w: EW, h: EH };
        if (overlap(p.x, p.y, PW, PH, r)) {
          const stomping = p.vy > 40 && (p.y + PH) - e.y < 22;
          if (stomping || p.spin > 0) { killEnemy(e); if (stomping) { p.vy = STOMP_BOUNCE; p.jumps = Math.max(p.jumps, 1); } }
          else if (p.hurt <= 0) { die(); return; }
        }
      }

      if (p.y > WORLD_H + 60) { die(); return; }

      if (p.hurt <= 0) {
        for (const s of hazards) {
          if (s.w <= 0) continue;
          const hy = s.y, hh = s.lava ? 60 : 20;
          if (p.x + PW > s.x + 4 && p.x < s.x + s.w - 4 && p.y + PH > hy - (s.lava ? 0 : 12) && p.y < hy + hh) { die(); return; }
        }
      }

      for (const c of coins) if (!c.got && Math.abs(c.x - (p.x + PW / 2)) < 26 && Math.abs(c.y - (p.y + PH / 2)) < 30) { c.got = true; coinCount++; spawnParts(2, c.x, c.y, 90, '#ffd34d'); }

      if (p.x > L.checkpointX && checkpoint.x < L.checkpointX) { checkpoint = { x: L.checkpointX, y: 540 }; shake = 3; }
      if (p.x + PW > L.goalX) { reachGoal(); return; }

      for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]!; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 700 * dt; q.life -= dt; if (q.life <= 0) parts.splice(i, 1); }
      if (p.grounded && Math.abs(p.vx) > 20) p.runPhase += dt * 14;
      shake = Math.max(0, shake - dt * 30);

      setHud(h => (h.coins !== coinCount || h.lives !== lives || Math.floor(elapsed) !== h.time) ? { ...h, coins: coinCount, lives, time: Math.floor(elapsed) } : h);
    }

    function render() {
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);   // low-end friendly
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const zoom = Math.max(W / 1280, H / 720) * 1.15;
      let camX = p.x + PW / 2 - W / zoom / 2, camY = p.y - H / zoom / 2;
      camX = Math.max(0, Math.min(WORLD_W - W / zoom, camX));
      camY = Math.max(-80, Math.min(WORLD_H - H / zoom + 40, camY));
      if (shake > 0) { camX += (Math.random() - 0.5) * shake; camY += (Math.random() - 0.5) * shake; }

      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, L.sky[0]); g.addColorStop(0.6, L.sky[1]); g.addColorStop(1, L.sky[2]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = L.hill1;
      for (let i = 0; i < 5; i++) { const hx = ((i * 700 - camX * 0.3) % (WORLD_W * 0.5) + WORLD_W * 0.5) % (WORLD_W * 0.5) - 200; ctx.beginPath(); ctx.arc(hx, H * 0.86, 260, Math.PI, 0); ctx.fill(); }
      ctx.fillStyle = L.hill2;
      for (let i = 0; i < 6; i++) { const hx = ((i * 560 - camX * 0.55) % (WORLD_W * 0.6) + WORLD_W * 0.6) % (WORLD_W * 0.6) - 150; ctx.beginPath(); ctx.arc(hx, H * 0.95, 180, Math.PI, 0); ctx.fill(); }

      ctx.save();
      ctx.scale(zoom, zoom);
      ctx.translate(-camX, -camY);

      if (L.banner) drawBanner(L.banner);
      for (const r of L.platforms) { ctx.fillStyle = '#5b3a24'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.fillStyle = '#3fae5a'; ctx.fillRect(r.x, r.y, r.w, 8); }
      for (const m of movers) { ctx.fillStyle = '#4a3358'; ctx.fillRect(m.x, m.y, m.w, m.h); ctx.fillStyle = '#c084fc'; ctx.fillRect(m.x, m.y, m.w, 5); }
      for (const s of hazards) {
        if (s.w <= 0) continue;
        if (s.lava) {
          const lg = ctx.createLinearGradient(0, s.y, 0, s.y + 60); lg.addColorStop(0, '#ff7a1a'); lg.addColorStop(1, '#8a1500');
          ctx.fillStyle = lg; ctx.fillRect(s.x, s.y, s.w, 60);
          ctx.fillStyle = 'rgba(255,220,120,0.6)';
          for (let bx = s.x + 6; bx < s.x + s.w; bx += 26) ctx.fillRect(bx, s.y + Math.sin(gameT * 4 + bx) * 3, 10, 4);
        } else {
          ctx.fillStyle = '#e33';
          for (let sx = s.x; sx < s.x + s.w - 8; sx += 16) { ctx.beginPath(); ctx.moveTo(sx, s.y + 16); ctx.lineTo(sx + 8, s.y); ctx.lineTo(sx + 16, s.y + 16); ctx.fill(); }
        }
      }
      for (const b of boxes) {
        if (b.broken) continue;
        ctx.fillStyle = '#c8873a'; ctx.fillRect(b.x, b.y, 32, 32);
        ctx.strokeStyle = '#8a5a22'; ctx.lineWidth = 3; ctx.strokeRect(b.x + 1.5, b.y + 1.5, 29, 29);
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + 32, b.y + 32); ctx.moveTo(b.x + 32, b.y); ctx.lineTo(b.x, b.y + 32); ctx.stroke();
      }
      for (const e of enemies) if (!e.dead) drawEnemy(e.x, e.y, e.dir);
      for (const c of coins) {
        if (c.got) continue;
        const bob = Math.sin(gameT * 3 + c.x) * 4;
        ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(c.x, c.y + bob, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.arc(c.x, c.y + bob, 5, 0, Math.PI * 2); ctx.fill();
      }
      drawFlag(L.checkpointX, 620, checkpoint.x >= L.checkpointX ? '#3fae5a' : '#888');
      drawFlag(L.goalX, 620, '#ffd34d');
      for (const q of parts) { ctx.globalAlpha = Math.max(q.life * 2, 0); ctx.fillStyle = q.color; ctx.fillRect(q.x - 3, q.y - 3, 6, 6); }
      ctx.globalAlpha = 1;
      if (!(p.hurt > 0 && Math.floor(p.hurt * 12) % 2 === 0)) drawPlayer();
      ctx.restore();
    }

    function drawBanner(b: { x: number; y: number; text: string }) {
      ctx.font = '600 20px "Space Grotesk", system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const words = b.text.split(' ');
      const lines: string[] = []; let cur = '';
      for (const w of words) { if ((cur + ' ' + w).length > 20 && cur) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; }
      if (cur) lines.push(cur);
      const bw = 300, bh = 34 + lines.length * 26;
      ctx.fillStyle = 'rgba(12,6,26,0.85)'; ctx.fillRect(b.x, b.y, bw, bh);
      ctx.strokeStyle = 'rgba(255,180,80,0.6)'; ctx.lineWidth = 3; ctx.strokeRect(b.x + 1.5, b.y + 1.5, bw - 3, bh - 3);
      ctx.fillStyle = '#ffd8a0';
      lines.forEach((ln, i) => ctx.fillText(ln, b.x + bw / 2, b.y + 24 + i * 26));
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    }
    function drawFlag(x: number, groundY: number, color: string) {
      ctx.fillStyle = '#ddd'; ctx.fillRect(x, groundY - 90, 4, 90);
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x + 4, groundY - 90); ctx.lineTo(x + 40, groundY - 78); ctx.lineTo(x + 4, groundY - 66); ctx.fill();
    }
    function drawEnemy(x: number, y: number, dir: number) {
      ctx.save(); ctx.translate(x + EW / 2, y + EH / 2);
      ctx.fillStyle = '#7a2fb0'; ctx.beginPath(); ctx.ellipse(0, 2, EW / 2, EH / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a1258'; ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(-4, -16); ctx.lineTo(-1, -8); ctx.fill(); ctx.beginPath(); ctx.moveTo(9, -8); ctx.lineTo(4, -16); ctx.lineTo(1, -8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(dir > 0 ? 1 : -7, -4, 6, 6);
      ctx.fillStyle = '#000'; ctx.fillRect(dir > 0 ? 3 : -5, -2, 3, 3);
      ctx.restore();
    }
    function drawPlayer() {
      const cx = p.x + PW / 2, cy = p.y + PH / 2;
      ctx.save(); ctx.translate(cx, cy);
      if (p.spin > 0) ctx.rotate((1 - p.spin / SPIN_TIME) * Math.PI * 4 * p.face);
      ctx.scale(p.face, 1);
      const squash = p.grounded && Math.abs(p.vx) > 20 ? 1 + Math.sin(p.runPhase) * 0.05 : 1;
      ctx.scale(1, squash);
      ctx.fillStyle = '#d96f14'; ctx.beginPath(); ctx.moveTo(-9, -14); ctx.lineTo(-13, -27); ctx.lineTo(-2, -17); ctx.fill(); ctx.beginPath(); ctx.moveTo(9, -14); ctx.lineTo(13, -27); ctx.lineTo(2, -17); ctx.fill();
      ctx.fillStyle = '#ff8c26'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 19, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe2b8'; ctx.beginPath(); ctx.ellipse(0, 7, 7, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#221126'; ctx.fillRect(1, -11, 4, 5); ctx.fillRect(7, -11, 4, 5);
      ctx.restore();
    }

    syncHud();
    raf = requestAnimationFrame(loop);
    return () => {
      disposed = true; cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      document.removeEventListener('touchmove', blockScroll); document.removeEventListener('visibilitychange', onVis);
      try { wakeLock?.release?.(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelIdx, restartRef.current]);

  const hold = (key: 'left' | 'right', on: boolean) => { const tch = (canvasRef.current as any)?._touch; if (tch) tch[key] = on; };
  const btn = (label: string, onDown: () => void, onUp?: () => void) => (
    <button className="w-16 h-16 rounded-full flex items-center justify-center text-2xl select-none"
      style={{ background: 'rgba(20,10,40,0.55)', border: '1px solid rgba(255,140,38,0.4)', color: '#ffb46a', touchAction: 'none' }}
      onPointerDown={e => { e.preventDefault(); onDown(); }}
      onPointerUp={() => onUp?.()} onPointerLeave={() => onUp?.()} onPointerCancel={() => onUp?.()}
      onContextMenu={e => e.preventDefault()}>{label}</button>
  );

  const nextLevel = () => setLevelIdx(i => Math.min(LEVELS.length - 1, i + 1));
  const retryLevel = () => { restartRef.current++; setHud(h => ({ ...h, status: 'play', lives: 3, coins: 0 })); };
  const playFromStart = () => { totalCoinsRef.current = 0; setLevelIdx(0); restartRef.current++; };

  return createPortal(
    <div className="fixed inset-0 z-[500]" style={{ background: '#0a0620' }}>
      <canvas ref={canvasRef} className="w-full h-full block" style={{ touchAction: 'none' }} />

      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pointer-events-none font-mono">
        <div className="flex items-center gap-3 text-[14px] font-bold" style={{ color: '#ffd34d', textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>
          <span>🪙 {hud.coins}</span>
          <span style={{ color: '#ff6b6b' }}>{'❤'.repeat(Math.max(hud.lives, 0))}</span>
          <span style={{ color: 'rgba(255,255,255,0.55)' }}>⏱ {hud.time}s</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="pointer-events-none font-mono text-[11px] px-2 py-1 rounded-lg" style={{ color: '#c084fc', background: 'rgba(20,10,40,0.6)', border: '1px solid rgba(192,132,252,0.3)' }}>
            {hud.level}/{LEVELS.length} · {hud.name}
          </span>
          <button onClick={onClose} className="pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center text-white/70" style={{ background: 'rgba(20,10,40,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}>✕</button>
        </div>
      </div>

      <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+18px)] left-5 flex gap-3">
        {btn('◀', () => hold('left', true), () => hold('left', false))}
        {btn('▶', () => hold('right', true), () => hold('right', false))}
      </div>
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+18px)] right-5 flex gap-3">
        {btn('🌀', () => (canvasRef.current as any)?._spin?.())}
        {btn('⬆', () => (canvasRef.current as any)?._jump?.())}
      </div>

      {hud.status !== 'play' && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(5,2,16,0.78)' }}>
          <div className="text-center px-8 py-8 rounded-3xl" style={{ background: 'rgba(16,8,36,0.95)', border: '1px solid rgba(255,140,38,0.35)' }}>
            <p className="text-5xl mb-3">{hud.status === 'win' ? '🏆' : hud.status === 'clear' ? '🎉' : '💀'}</p>
            <p className="font-display font-bold text-2xl text-white mb-1">
              {hud.status === 'win' ? t.games.bandicoot.allClear : hud.status === 'clear' ? t.games.bandicoot.levelClear : t.games.bandicoot.gameOver}
            </p>
            <p className="font-mono text-sm text-white/50 mb-5">🪙 {hud.total} · ⏱ {hud.time}s</p>
            <div className="flex gap-3 justify-center flex-wrap">
              {hud.status === 'clear' && (
                <button onClick={nextLevel} className="px-6 py-2.5 rounded-xl font-mono font-bold text-sm" style={{ background: 'rgba(63,174,90,0.2)', border: '1px solid rgba(63,174,90,0.5)', color: '#7fe0a0' }}>{t.games.bandicoot.nextLevel} →</button>
              )}
              {hud.status === 'over' && (
                <button onClick={retryLevel} className="px-6 py-2.5 rounded-xl font-mono font-bold text-sm" style={{ background: 'rgba(255,140,38,0.18)', border: '1px solid rgba(255,140,38,0.5)', color: '#ffb46a' }}>{t.games.bandicoot.retry}</button>
              )}
              {hud.status === 'win' && (
                <button onClick={playFromStart} className="px-6 py-2.5 rounded-xl font-mono font-bold text-sm" style={{ background: 'rgba(255,140,38,0.18)', border: '1px solid rgba(255,140,38,0.5)', color: '#ffb46a' }}>{t.games.bandicoot.retry}</button>
              )}
              <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-mono text-sm text-white/50" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>{t.games.bandicoot.exit}</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
