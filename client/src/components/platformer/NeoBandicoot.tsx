import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/store/langStore';

/**
 * Neo Bandicoot — single-player 2D platformer, fully self-contained canvas game.
 * Ported from the Godot 4.3 prototype (prototypes/neo-bandicoot-godot): same
 * physics constants, same game-feel assists (coyote time, jump buffering,
 * variable jump height, double jump). Keyboard uses e.code (layout-independent)
 * + on-screen touch controls. 60 fps capped loop, DPR-aware canvas.
 */

// ── Physics (mirrors the Godot player.gd exports) ─────────────────────
const MAX_SPEED = 250;
const ACCEL = 1600;
const FRICTION = 2000;
const AIR_ACCEL = 1000;
const GRAVITY = 1300;
const MAX_FALL = 760;
const JUMP_V = -470;
const DOUBLE_JUMP_V = -410;
const JUMP_CUT = 0.45;
const COYOTE = 0.10;
const BUFFER = 0.12;
const SPIN_TIME = 0.35;

const PW = 26, PH = 40;            // player hitbox
const WORLD_W = 3400, WORLD_H = 720;

interface Rect { x: number; y: number; w: number; h: number }
interface Coin { x: number; y: number; got: boolean }
interface Box  { x: number; y: number; broken: boolean }
interface Spike { x: number; y: number; w: number }

// ── Level data (units = px; y grows downward; ground at y=620) ────────
const PLATFORMS: Rect[] = [
  { x: 0, y: 620, w: 1180, h: 100 },           // start ground
  { x: 1320, y: 620, w: 560, h: 100 },         // after first gap
  { x: 2020, y: 620, w: 1380, h: 100 },        // final stretch
  { x: 340, y: 500, w: 150, h: 22 },
  { x: 560, y: 400, w: 150, h: 22 },
  { x: 800, y: 320, w: 130, h: 22 },           // needs double jump chain
  { x: 1040, y: 430, w: 130, h: 22 },
  { x: 1450, y: 490, w: 140, h: 22 },
  { x: 1660, y: 380, w: 140, h: 22 },
  { x: 2160, y: 500, w: 150, h: 22 },
  { x: 2400, y: 400, w: 150, h: 22 },
  { x: 2660, y: 310, w: 130, h: 22 },
];
const COINS_INIT: Coin[] = [
  { x: 380, y: 460, got: false }, { x: 420, y: 460, got: false },
  { x: 610, y: 360, got: false }, { x: 650, y: 360, got: false },
  { x: 850, y: 280, got: false }, { x: 890, y: 280, got: false },
  { x: 1240, y: 540, got: false },                                   // over the gap
  { x: 1500, y: 450, got: false }, { x: 1710, y: 340, got: false },
  { x: 2210, y: 460, got: false }, { x: 2450, y: 360, got: false },
  { x: 2710, y: 270, got: false }, { x: 2900, y: 560, got: false },
];
const BOXES_INIT: Box[] = [
  { x: 520, y: 588, broken: false }, { x: 552, y: 588, broken: false },
  { x: 1420, y: 588, broken: false },
  { x: 2300, y: 588, broken: false }, { x: 2332, y: 588, broken: false }, { x: 2332, y: 556, broken: false },
];
const SPIKES: Spike[] = [
  { x: 960, y: 620, w: 90 },
  { x: 1700, y: 620, w: 110 },
  { x: 2520, y: 620, w: 90 },
];
const CHECKPOINT_X = 1780;
const GOAL_X = 3260;
const SPAWN = { x: 80, y: 560 };

interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string }

export function NeoBandicoot({ onClose }: { onClose: () => void }) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hud, setHud] = useState({ coins: 0, lives: 3, over: false, won: false, time: 0 });
  const resetSignal = useRef(0);
  const [, forceRestart] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let disposed = false;

    // ── game state ──
    const p = { x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, face: 1, grounded: false,
      jumps: 2, coyote: 0, buffer: 0, spin: 0, hurt: 0, runPhase: 0 };
    let checkpoint = { ...SPAWN };
    const coins = COINS_INIT.map(c => ({ ...c }));
    const boxes = BOXES_INIT.map(b => ({ ...b }));
    const parts: Particle[] = [];
    let coinCount = 0, lives = 3, won = false, over = false, elapsed = 0;
    let shake = 0;

    // ── input (physical keys — layout independent, like the Godot map) ──
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
    const ku = (e: KeyboardEvent) => {
      keys[e.code] = false;
      if ((e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') && p.vy < 0) p.vy *= JUMP_CUT; // variable height
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    // touch buttons write into this
    const touch = { left: false, right: false };
    (canvas as any)._touch = touch;
    (canvas as any)._jump = () => { p.buffer = BUFFER; };
    (canvas as any)._spin = () => startSpin();

    function startSpin() {
      if (p.spin > 0 || over || won) return;
      p.spin = SPIN_TIME;
      // break boxes near the player
      for (const b of boxes) {
        if (b.broken) continue;
        const cx = p.x + PW / 2, cy = p.y + PH / 2;
        if (Math.abs(b.x + 16 - cx) < 46 && Math.abs(b.y + 16 - cy) < 46) breakBox(b);
      }
    }
    function breakBox(b: Box) {
      b.broken = true; coinCount++; shake = 6;
      for (let i = 0; i < 10; i++) parts.push({ x: b.x + 16, y: b.y + 16, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 260, life: 0.6, color: '#c8873a' });
      parts.push({ x: b.x + 16, y: b.y + 8, vx: 0, vy: -140, life: 0.5, color: '#ffd34d' });
    }
    function die() {
      lives--; shake = 10; p.hurt = 0.8;
      for (let i = 0; i < 14; i++) parts.push({ x: p.x + PW / 2, y: p.y + PH / 2, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 300, life: 0.7, color: '#ff8c26' });
      if (lives <= 0) { over = true; }
      else { p.x = checkpoint.x; p.y = checkpoint.y; p.vx = 0; p.vy = 0; }
    }

    // ── fixed-ish loop, capped 60 ──
    // Hardened: a transient exception must never bubble out of rAF — the app's
    // ErrorBoundary would hard-reload the page, which reads as "the game shut
    // itself off". Log and keep running instead.
    let raf = 0, last = performance.now(), acc = 0;
    const loop = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      if (document.hidden) { last = now; return; } // paused in background
      const frame = Math.min((now - last) / 1000, 0.05);
      last = now;
      acc += frame;
      if (acc < 1 / 62) return;
      const dt = Math.min(acc, 1 / 30);
      acc = 0;
      try {
        if (!over && !won) { step(dt); elapsed += dt; }
        render();
      } catch (err) {
        console.warn('[bandicoot] frame error (recovered):', err);
      }
    };

    // Block pull-to-refresh / overscroll navigation while playing — a swipe on
    // the game area reloading the page is exactly "it turned itself off".
    const blockScroll = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
    document.addEventListener('touchmove', blockScroll, { passive: false });

    // Keep the screen awake during play (phones dim/lock on sparse touch input).
    let wakeLock: any = null;
    const acquireWake = () => {
      (navigator as any).wakeLock?.request?.('screen')
        .then((wl: any) => { wakeLock = wl; })
        .catch(() => {});
    };
    acquireWake();
    const onVis = () => { if (!document.hidden) { acquireWake(); last = performance.now(); } };
    document.addEventListener('visibilitychange', onVis);

    function step(dt: number) {
      // horizontal
      const axis = (keys['KeyA'] || keys['ArrowLeft'] || touch.left ? -1 : 0) + (keys['KeyD'] || keys['ArrowRight'] || touch.right ? 1 : 0);
      const accel = axis !== 0 ? (p.grounded ? ACCEL : AIR_ACCEL) : FRICTION;
      const target = axis * MAX_SPEED;
      p.vx = p.vx < target ? Math.min(p.vx + accel * dt, target) : Math.max(p.vx - accel * dt, target);
      if (axis !== 0) p.face = axis;

      // gravity
      p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);

      // jump: buffered press + (grounded | coyote | double jump)
      if (p.buffer > 0) {
        if (p.grounded || p.coyote > 0) { p.vy = JUMP_V; p.jumps = 1; p.buffer = 0; p.coyote = 0; puff(); }
        else if (p.jumps > 0) { p.vy = DOUBLE_JUMP_V; p.jumps--; p.buffer = 0; puff(); }
      }

      // integrate + resolve (axis-separated AABB)
      p.x += p.vx * dt;
      for (const r of PLATFORMS) {
        if (overlap(p.x, p.y, PW, PH, r)) {
          p.x = p.vx > 0 ? r.x - PW : r.x + r.w;
          p.vx = 0;
        }
      }
      p.x = Math.max(0, Math.min(WORLD_W - PW, p.x));

      const wasAir = !p.grounded;
      p.y += p.vy * dt;
      p.grounded = false;
      for (const r of PLATFORMS) {
        if (overlap(p.x, p.y, PW, PH, r)) {
          if (p.vy > 0) { p.y = r.y - PH; p.grounded = true; }
          else { p.y = r.y + r.h; }
          p.vy = 0;
        }
      }
      // unbroken boxes are solid too — landing on top or bonking from below breaks them
      for (const b of boxes) {
        if (b.broken) continue;
        const r = { x: b.x, y: b.y, w: 32, h: 32 };
        if (overlap(p.x, p.y, PW, PH, r)) {
          if (p.vy > 0) { p.y = r.y - PH; p.grounded = true; p.vy = 0; }
          else if (p.vy < 0) { p.y = r.y + r.h; p.vy = 0; breakBox(b); }
          else { p.x = p.x + PW / 2 < b.x + 16 ? r.x - PW : r.x + 32; }
        }
      }
      if (p.grounded) { p.coyote = COYOTE; p.jumps = 2; if (wasAir && Math.abs(p.vy) < 1) shake = Math.max(shake, 2); }
      else p.coyote = Math.max(0, p.coyote - dt);
      p.buffer = Math.max(0, p.buffer - dt);
      p.spin = Math.max(0, p.spin - dt);
      p.hurt = Math.max(0, p.hurt - dt);

      // fell into a pit
      if (p.y > WORLD_H + 60) die();

      // spikes
      if (p.hurt <= 0) {
        for (const s of SPIKES) {
          if (p.x + PW > s.x + 6 && p.x < s.x + s.w - 6 && p.y + PH > s.y - 16) { die(); break; }
        }
      }

      // coins
      for (const c of coins) {
        if (!c.got && Math.abs(c.x - (p.x + PW / 2)) < 26 && Math.abs(c.y - (p.y + PH / 2)) < 30) {
          c.got = true; coinCount++;
          parts.push({ x: c.x, y: c.y, vx: 0, vy: -120, life: 0.4, color: '#ffd34d' });
        }
      }

      // checkpoint + goal
      if (p.x > CHECKPOINT_X && checkpoint.x < CHECKPOINT_X) checkpoint = { x: CHECKPOINT_X, y: 540 };
      if (p.x + PW > GOAL_X) won = true;

      // particles + run anim
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i]!;
        q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 700 * dt; q.life -= dt;
        if (q.life <= 0) parts.splice(i, 1);
      }
      if (p.grounded && Math.abs(p.vx) > 20) p.runPhase += dt * 14;
      shake = Math.max(0, shake - dt * 30);

      setHud(h => (h.coins !== coinCount || h.lives !== lives || h.over !== over || h.won !== won || Math.floor(elapsed) !== h.time)
        ? { coins: coinCount, lives, over, won, time: Math.floor(elapsed) } : h);
    }

    function puff() {
      for (let i = 0; i < 5; i++) parts.push({ x: p.x + PW / 2, y: p.y + PH, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 60, life: 0.3, color: 'rgba(255,255,255,0.7)' });
    }
    function overlap(x: number, y: number, w: number, h: number, r: Rect) {
      return x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y;
    }

    // ── render ──
    function render() {
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const zoom = Math.max(W / 1280, H / 720) * 1.15;
      let camX = p.x + PW / 2 - W / zoom / 2, camY = p.y - H / zoom / 2;
      camX = Math.max(0, Math.min(WORLD_W - W / zoom, camX));
      camY = Math.max(-80, Math.min(WORLD_H - H / zoom + 40, camY));
      if (shake > 0) { camX += (Math.random() - 0.5) * shake; camY += (Math.random() - 0.5) * shake; }

      // sky
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#12082b'); g.addColorStop(0.6, '#241242'); g.addColorStop(1, '#3a1c52');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // parallax hills
      ctx.fillStyle = 'rgba(90,40,140,0.35)';
      for (let i = 0; i < 7; i++) {
        const hx = ((i * 620 - camX * 0.3) % (WORLD_W * 0.5) + WORLD_W * 0.5) % (WORLD_W * 0.5) - 200;
        ctx.beginPath(); ctx.arc(hx, H * 0.86, 260, Math.PI, 0); ctx.fill();
      }
      ctx.fillStyle = 'rgba(140,70,200,0.28)';
      for (let i = 0; i < 9; i++) {
        const hx = ((i * 440 - camX * 0.55) % (WORLD_W * 0.6) + WORLD_W * 0.6) % (WORLD_W * 0.6) - 150;
        ctx.beginPath(); ctx.arc(hx, H * 0.95, 180, Math.PI, 0); ctx.fill();
      }

      ctx.save();
      ctx.scale(zoom, zoom);
      ctx.translate(-camX, -camY);

      // platforms
      for (const r of PLATFORMS) {
        ctx.fillStyle = '#5b3a24'; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = '#3fae5a'; ctx.fillRect(r.x, r.y, r.w, 8);
      }
      // spikes
      ctx.fillStyle = '#e33';
      for (const s of SPIKES) {
        for (let sx = s.x; sx < s.x + s.w - 8; sx += 16) {
          ctx.beginPath(); ctx.moveTo(sx, s.y); ctx.lineTo(sx + 8, s.y - 16); ctx.lineTo(sx + 16, s.y); ctx.fill();
        }
      }
      // boxes
      for (const b of boxes) {
        if (b.broken) continue;
        ctx.fillStyle = '#c8873a'; ctx.fillRect(b.x, b.y, 32, 32);
        ctx.strokeStyle = '#8a5a22'; ctx.lineWidth = 3;
        ctx.strokeRect(b.x + 1.5, b.y + 1.5, 29, 29);
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + 32, b.y + 32); ctx.moveTo(b.x + 32, b.y); ctx.lineTo(b.x, b.y + 32); ctx.stroke();
      }
      // coins
      for (const c of coins) {
        if (c.got) continue;
        const bob = Math.sin(performance.now() / 300 + c.x) * 4;
        ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(c.x, c.y + bob, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.arc(c.x, c.y + bob, 5, 0, Math.PI * 2); ctx.fill();
      }
      // checkpoint + goal flags
      drawFlag(CHECKPOINT_X, 620, checkpoint.x >= CHECKPOINT_X ? '#3fae5a' : '#888');
      drawFlag(GOAL_X, 620, '#ffd34d');

      // particles
      for (const q of parts) { ctx.globalAlpha = Math.max(q.life * 2, 0); ctx.fillStyle = q.color; ctx.fillRect(q.x - 3, q.y - 3, 6, 6); }
      ctx.globalAlpha = 1;

      // player (blink while hurt-invulnerable)
      if (!(p.hurt > 0 && Math.floor(p.hurt * 12) % 2 === 0)) drawPlayer();

      ctx.restore();
    }

    function drawFlag(x: number, groundY: number, color: string) {
      ctx.fillStyle = '#ddd'; ctx.fillRect(x, groundY - 90, 4, 90);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(x + 4, groundY - 90); ctx.lineTo(x + 40, groundY - 78); ctx.lineTo(x + 4, groundY - 66); ctx.fill();
    }

    function drawPlayer() {
      const cx = p.x + PW / 2, cy = p.y + PH / 2;
      ctx.save();
      ctx.translate(cx, cy);
      if (p.spin > 0) ctx.rotate((1 - p.spin / SPIN_TIME) * Math.PI * 4 * p.face);
      ctx.scale(p.face, 1);
      const squash = p.grounded && Math.abs(p.vx) > 20 ? 1 + Math.sin(p.runPhase) * 0.05 : 1;
      ctx.scale(1, squash);
      // ears
      ctx.fillStyle = '#d96f14';
      ctx.beginPath(); ctx.moveTo(-9, -14); ctx.lineTo(-13, -27); ctx.lineTo(-2, -17); ctx.fill();
      ctx.beginPath(); ctx.moveTo(9, -14); ctx.lineTo(13, -27); ctx.lineTo(2, -17); ctx.fill();
      // body
      ctx.fillStyle = '#ff8c26';
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 19, 0, 0, Math.PI * 2); ctx.fill();
      // belly
      ctx.fillStyle = '#ffe2b8';
      ctx.beginPath(); ctx.ellipse(0, 7, 7, 10, 0, 0, Math.PI * 2); ctx.fill();
      // eyes
      ctx.fillStyle = '#221126';
      ctx.fillRect(1, -11, 4, 5); ctx.fillRect(7, -11, 4, 5);
      ctx.restore();
    }

    raf = requestAnimationFrame(loop);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      document.removeEventListener('touchmove', blockScroll);
      document.removeEventListener('visibilitychange', onVis);
      try { wakeLock?.release?.(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal.current]);

  // touch helpers reach into the canvas-scoped closures
  const hold = (key: 'left' | 'right', on: boolean) => {
    const tch = (canvasRef.current as any)?._touch; if (tch) tch[key] = on;
  };
  const btn = (label: string, onDown: () => void, onUp?: () => void) => (
    <button
      className="w-16 h-16 rounded-full flex items-center justify-center text-2xl select-none"
      style={{ background: 'rgba(20,10,40,0.55)', border: '1px solid rgba(255,140,38,0.4)', color: '#ffb46a', touchAction: 'none' }}
      onPointerDown={e => { e.preventDefault(); onDown(); }}
      onPointerUp={() => onUp?.()} onPointerLeave={() => onUp?.()} onPointerCancel={() => onUp?.()}
      onContextMenu={e => e.preventDefault()}
    >{label}</button>
  );

  const restart = () => { resetSignal.current++; setHud({ coins: 0, lives: 3, over: false, won: false, time: 0 }); forceRestart(n => n + 1); };

  return createPortal(
    <div className="fixed inset-0 z-[500]" style={{ background: '#0a0620' }}>
      <canvas ref={canvasRef} className="w-full h-full block" style={{ touchAction: 'none' }} />

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pointer-events-none font-mono">
        <div className="flex items-center gap-4 text-[15px] font-bold" style={{ color: '#ffd34d', textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>
          <span>🪙 {hud.coins}</span>
          <span style={{ color: '#ff6b6b' }}>{'❤'.repeat(Math.max(hud.lives, 0))}</span>
          <span style={{ color: 'rgba(255,255,255,0.55)' }}>⏱ {hud.time}s</span>
        </div>
        <button onClick={onClose} className="pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center text-white/70"
          style={{ background: 'rgba(20,10,40,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}>✕</button>
      </div>

      {/* touch controls */}
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+18px)] left-5 flex gap-3">
        {btn('◀', () => hold('left', true), () => hold('left', false))}
        {btn('▶', () => hold('right', true), () => hold('right', false))}
      </div>
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+18px)] right-5 flex gap-3">
        {btn('🌀', () => (canvasRef.current as any)?._spin?.())}
        {btn('⬆', () => (canvasRef.current as any)?._jump?.())}
      </div>

      {/* win / game-over overlays */}
      {(hud.won || hud.over) && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(5,2,16,0.75)' }}>
          <div className="text-center px-8 py-8 rounded-3xl" style={{ background: 'rgba(16,8,36,0.95)', border: '1px solid rgba(255,140,38,0.35)' }}>
            <p className="text-5xl mb-3">{hud.won ? '🏆' : '💀'}</p>
            <p className="font-display font-bold text-2xl text-white mb-1">
              {hud.won ? t.games.bandicoot.win : t.games.bandicoot.gameOver}
            </p>
            <p className="font-mono text-sm text-white/50 mb-5">🪙 {hud.coins} · ⏱ {hud.time}s</p>
            <div className="flex gap-3 justify-center">
              <button onClick={restart} className="px-6 py-2.5 rounded-xl font-mono font-bold text-sm"
                style={{ background: 'rgba(255,140,38,0.18)', border: '1px solid rgba(255,140,38,0.5)', color: '#ffb46a' }}>
                {t.games.bandicoot.retry}
              </button>
              <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-mono text-sm text-white/50"
                style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
                {t.games.bandicoot.exit}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
