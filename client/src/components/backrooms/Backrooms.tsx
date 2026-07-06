import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BackroomsEngine, type HudState } from './engine';

// ── Backrooms (Phase 1) — full-screen 3D liminal world, single-player ──
// The React layer owns only the DOM (canvas + HUD) and input capture; all
// simulation/rendering lives in BackroomsEngine. Lazy-loaded from App so
// Three.js is kept out of the main bundle.

const JOY_R = 56; // joystick radius (px)

export default function Backrooms({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<BackroomsEngine | null>(null);
  const [hud, setHud] = useState<HudState>({ battery: 1, flashlightOn: true, level: 'LEVEL 0', x: 0, z: 0 });

  // Joystick visual state
  const [joy, setJoy] = useState<{ active: boolean; ox: number; oy: number; kx: number; ky: number }>(
    { active: false, ox: 0, oy: 0, kx: 0, ky: 0 });

  // Touch tracking: one finger drives movement (left), one drives look (right).
  const moveTouch = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const lookTouch = useRef<{ id: number; x: number; y: number } | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const mouseLook = useRef<{ x: number; y: number } | null>(null);

  // ── Engine lifecycle ────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return;
    const eng = new BackroomsEngine(canvasRef.current);
    engineRef.current = eng;
    eng.onHud = setHud;
    eng.resize();
    eng.start();

    const onResize = () => eng.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    // Keep the screen awake while exploring.
    let wakeLock: any = null;
    const acquireWake = async () => {
      try { wakeLock = await (navigator as any).wakeLock?.request('screen'); } catch { /* ignore */ }
    };
    acquireWake();
    const onVis = () => { if (document.visibilityState === 'visible') acquireWake(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      document.removeEventListener('visibilitychange', onVis);
      try { wakeLock?.release?.(); } catch { /* ignore */ }
      eng.dispose();
      engineRef.current = null;
    };
  }, []);

  // ── Keyboard (desktop) → move vector each frame via a small poller ────
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.current[k] = true;
      if (k === 'f') engineRef.current?.toggleFlashlight();
      if (k === ' ') engineRef.current?.jump();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    const iv = setInterval(() => {
      const eng = engineRef.current; if (!eng) return;
      const k = keys.current;
      // Keyboard only drives movement when a touch stick isn't active.
      if (!moveTouch.current) {
        let x = 0, y = 0;
        if (k['w'] || k['arrowup']) y += 1;
        if (k['s'] || k['arrowdown']) y -= 1;
        if (k['d'] || k['arrowright']) x += 1;
        if (k['a'] || k['arrowleft']) x -= 1;
        eng.input.move.x = x; eng.input.move.y = y;
        eng.input.sprint = !!(k['shift']);
      }
    }, 33);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); clearInterval(iv); };
  }, []);

  // ── Touch controls ───────────────────────────────────────────────────
  const isControlTarget = (t: EventTarget | null) =>
    t instanceof HTMLElement && t.closest('[data-hud-btn]') != null;

  const onTouchStart = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (isControlTarget(t.target)) continue;
      const leftZone = t.clientX < window.innerWidth * 0.5;
      if (leftZone && !moveTouch.current) {
        moveTouch.current = { id: t.identifier, ox: t.clientX, oy: t.clientY };
        setJoy({ active: true, ox: t.clientX, oy: t.clientY, kx: 0, ky: 0 });
      } else if (!lookTouch.current) {
        lookTouch.current = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const eng = engineRef.current; if (!eng) return;
    for (const t of Array.from(e.changedTouches)) {
      if (moveTouch.current && t.identifier === moveTouch.current.id) {
        let dx = t.clientX - moveTouch.current.ox;
        let dy = t.clientY - moveTouch.current.oy;
        const mag = Math.hypot(dx, dy);
        if (mag > JOY_R) { dx = dx / mag * JOY_R; dy = dy / mag * JOY_R; }
        setJoy(j => ({ ...j, kx: dx, ky: dy }));
        eng.input.move.x = dx / JOY_R;
        eng.input.move.y = -dy / JOY_R; // screen-down = backward
        eng.input.sprint = mag > JOY_R * 0.85; // push to the edge to sprint
      } else if (lookTouch.current && t.identifier === lookTouch.current.id) {
        eng.addLook(t.clientX - lookTouch.current.x, t.clientY - lookTouch.current.y);
        lookTouch.current.x = t.clientX; lookTouch.current.y = t.clientY;
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const eng = engineRef.current;
    for (const t of Array.from(e.changedTouches)) {
      if (moveTouch.current && t.identifier === moveTouch.current.id) {
        moveTouch.current = null;
        setJoy({ active: false, ox: 0, oy: 0, kx: 0, ky: 0 });
        if (eng) { eng.input.move.x = 0; eng.input.move.y = 0; eng.input.sprint = false; }
      } else if (lookTouch.current && t.identifier === lookTouch.current.id) {
        lookTouch.current = null;
      }
    }
  };

  // ── Mouse-look (desktop) ─────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    if (isControlTarget(e.target)) return;
    if (e.clientX < window.innerWidth * 0.5) return; // left half reserved for future stick
    mouseLook.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!mouseLook.current) return;
    engineRef.current?.addLook(e.clientX - mouseLook.current.x, e.clientY - mouseLook.current.y);
    mouseLook.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { mouseLook.current = null; };

  const btn = (label: string, on: () => void, opts?: { hold?: boolean; off?: () => void; active?: boolean }) => (
    <button
      data-hud-btn
      onTouchStart={opts?.hold ? (e) => { e.preventDefault(); on(); } : undefined}
      onTouchEnd={opts?.hold ? (e) => { e.preventDefault(); opts.off?.(); } : undefined}
      onClick={opts?.hold ? undefined : on}
      style={{
        width: 60, height: 60, borderRadius: '50%',
        background: opts?.active ? 'rgba(255,240,180,0.18)' : 'rgba(10,8,4,0.55)',
        border: `1px solid ${opts?.active ? 'rgba(255,240,180,0.5)' : 'rgba(255,240,180,0.18)'}`,
        color: 'rgba(255,245,210,0.85)', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)', userSelect: 'none', touchAction: 'none',
      }}
    >{label}</button>
  );

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#000', overflow: 'hidden', touchAction: 'none' }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {/* film-grain / vignette overlay for mood */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)' }} />

      {/* Top-left: level + flashlight battery */}
      <div style={{ position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', left: 16, pointerEvents: 'none' }}>
        <div style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 700, fontSize: 13, letterSpacing: 3, color: 'rgba(255,245,210,0.8)' }}>
          {hud.level}
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: 'rgba(255,245,210,0.35)', marginTop: 2 }}>
          ვოიდ ბექრუმსი · THE BACKROOMS
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 12, opacity: hud.flashlightOn ? 1 : 0.35 }}>🔦</span>
          <div style={{ width: 90, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(hud.battery * 100)}%`, height: '100%',
              background: hud.battery < 0.15 ? '#ff5540' : hud.battery < 0.4 ? '#ffb040' : '#8effc0',
              transition: 'width .3s linear' }} />
          </div>
        </div>
      </div>

      {/* Top-right: exit */}
      <button data-hud-btn onClick={onClose}
        style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', right: 14, width: 40, height: 40,
          borderRadius: '50%', background: 'rgba(10,8,4,0.55)', border: '1px solid rgba(255,240,180,0.2)',
          color: 'rgba(255,245,210,0.85)', fontSize: 18, backdropFilter: 'blur(4px)' }}>✕</button>

      {/* Joystick base (left) — appears where the thumb lands */}
      {joy.active && (
        <>
          <div style={{ position: 'absolute', left: joy.ox - JOY_R, top: joy.oy - JOY_R, width: JOY_R * 2, height: JOY_R * 2,
            borderRadius: '50%', border: '2px solid rgba(255,240,180,0.25)', background: 'rgba(255,240,180,0.05)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: joy.ox + joy.kx - 24, top: joy.oy + joy.ky - 24, width: 48, height: 48,
            borderRadius: '50%', background: 'rgba(255,240,180,0.28)', border: '1px solid rgba(255,240,180,0.5)', pointerEvents: 'none' }} />
        </>
      )}
      {/* Left-bottom hint when idle */}
      {!joy.active && (
        <div style={{ position: 'absolute', left: 40, bottom: 60, width: JOY_R * 2, height: JOY_R * 2,
          borderRadius: '50%', border: '2px dashed rgba(255,240,180,0.15)', pointerEvents: 'none' }} />
      )}

      {/* Right-bottom control cluster */}
      <div style={{ position: 'absolute', right: 22, bottom: 'max(48px, env(safe-area-inset-bottom))',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {btn('🔦', () => engineRef.current?.toggleFlashlight(), { active: hud.flashlightOn })}
          {btn('⤒', () => engineRef.current?.jump())}
        </div>
        {btn('🏃', () => { engineRef.current && (engineRef.current.input.sprint = true); },
          { hold: true, off: () => { engineRef.current && (engineRef.current.input.sprint = false); } })}
      </div>

      {/* Desktop hint */}
      <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none',
        fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,245,210,0.25)', letterSpacing: 1, whiteSpace: 'nowrap' }}>
        WASD · მაუსით მოხედვა · SHIFT სირბილი · SPACE ხტომა · F ფანარი
      </div>
    </div>,
    document.body
  );
}
