import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { socket, connectSocket, emitWithAck } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/store/langStore';
import { useBackroomsVoice, applyBackroomsSpatial, leaveBackroomsVoice } from '@/hooks/useBackroomsVoice';
import { BackroomsEngine, type HudState, type RemotePlayerState } from './engine';

// ── Backrooms (Phase 2) — 3D liminal world with multiplayer presence ───
// Flow: instance lobby → shared 3D world. Each instance has a numeric seed so
// every player in it sees the same procedural maze. Remote players are pushed
// straight into the engine (no React state) for smooth 60fps rendering.

const JOY_R = 56;

// ── Immersive mode (Android) ────────────────────────────────────────────
// The app manifest locks the PWA to portrait, which Android honours (iOS
// ignores it) — so Android phones never rotated in the 3D world. On entering
// an instance (still inside the tap gesture, which fullscreen requires) we go
// fullscreen and lock landscape; on leaving we restore.
const isTouchDevice = () => typeof window !== 'undefined' && 'ontouchstart' in window;
async function enterImmersive(): Promise<void> {
  if (!isTouchDevice()) return;
  try { await (document.documentElement as any).requestFullscreen?.({ navigationUI: 'hide' }); } catch { /* iOS: unsupported */ }
  try { await (screen.orientation as any)?.lock?.('landscape'); } catch {
    try { (screen.orientation as any)?.unlock?.(); } catch { /* ignore */ }
  }
}
function exitImmersive(): void {
  if (!isTouchDevice()) return;
  try { (screen.orientation as any)?.unlock?.(); } catch { /* ignore */ }
  try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch { /* ignore */ }
}

// ── Avatar customisation ────────────────────────────────────────────────
const BR_SKINS = [0xf2c9a0, 0xdfae83, 0xb07b4f, 0x8a5a33, 0x6b4226];
const BR_SHIRTS = [0x7c3aed, 0x0ea5b7, 0xb91c1c, 0x15803d, 0xca8a04, 0x334155];
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
function loadAvatar(): { skin: number; shirt: number } {
  try {
    const a = JSON.parse(localStorage.getItem('vm_br_avatar') ?? '');
    if (a && BR_SKINS.includes(a.skin) && BR_SHIRTS.includes(a.shirt)) return a;
  } catch { /* fall through */ }
  return { skin: BR_SKINS[0], shirt: BR_SHIRTS[0] };
}
function saveAvatar(a: { skin: number; shirt: number }) {
  try { localStorage.setItem('vm_br_avatar', JSON.stringify(a)); } catch { /* ignore */ }
}

// Jumpscare face — drawn once, cached as a data URL.
let _scareFace: string | null = null;
function scareFace(): string {
  if (_scareFace) return _scareFace;
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  g.save(); g.translate(256, 270); g.scale(1, 1.35);
  const grad = g.createRadialGradient(0, 0, 40, 0, 0, 150);
  grad.addColorStop(0, '#cfc4b2'); grad.addColorStop(0.8, '#7d7365'); grad.addColorStop(1, '#000');
  g.fillStyle = grad; g.beginPath(); g.arc(0, 0, 150, 0, Math.PI * 2); g.fill(); g.restore();
  g.fillStyle = '#000';
  g.save(); g.translate(190, 225); g.scale(1, 1.4); g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.fill(); g.restore();
  g.save(); g.translate(322, 225); g.scale(1, 1.4); g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.fill(); g.restore();
  g.save(); g.translate(256, 350); g.scale(1, 1.8); g.beginPath(); g.arc(0, 0, 42, 0, Math.PI * 2); g.fill(); g.restore();
  _scareFace = c.toDataURL();
  return _scareFace;
}

interface InstanceRow { id: string; name: string; seed: number; maxPlayers: number; count: number; }
interface JoinData { seed: number; name: string; mySocketId: string; players: RemotePlayerState[]; }

export default function Backrooms({ onClose }: { onClose: () => void }) {
  const [instance, setInstance] = useState<{ id: string; name: string } | null>(null);

  if (!instance) {
    return <Lobby onJoin={(id, name) => setInstance({ id, name })} onClose={onClose} />;
  }
  return <World instanceId={instance.id} onExit={() => setInstance(null)} onClose={onClose} />;
}

// ── Lobby ───────────────────────────────────────────────────────────────
function Lobby({ onJoin, onClose }: { onJoin: (id: string, name: string) => void; onClose: () => void }) {
  const t = useT();
  const [rows, setRows] = useState<InstanceRow[] | null>(null);
  const [err, setErr] = useState('');
  const [avatar, setAvatar] = useState(loadAvatar);

  const pick = (patch: Partial<{ skin: number; shirt: number }>) => {
    setAvatar(prev => { const next = { ...prev, ...patch }; saveAvatar(next); return next; });
  };

  const load = useCallback(() => {
    connectSocket();
    emitWithAck<void, { ok: boolean; data?: InstanceRow[] }>('backrooms:list')
      .then(r => { if (r.ok && r.data) setRows(r.data); else setErr(t.backrooms.listLoadFailed); })
      .catch(() => setErr(t.backrooms.connectFailed));
  }, [t]);
  useEffect(() => { load(); }, [load]);

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'radial-gradient(ellipse at center, #14100a 0%, #050403 100%)', display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 'max(18px, env(safe-area-inset-top))', paddingBottom: 10 }}>
        <span style={{ fontSize: 24 }}>🟨</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 700, fontSize: 17, letterSpacing: 2, color: '#f5de80' }}>BACKROOMS</div>
          <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: 'rgba(245,222,128,0.4)' }}>{t.backrooms.lobbySubtitle}</div>
        </div>
        <button onClick={onClose} style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(10,8,4,0.6)', border: '1px solid rgba(255,240,180,0.2)', color: 'rgba(255,245,210,0.85)', fontSize: 17 }}>✕</button>
      </div>

      {/* Avatar customisation */}
      <div style={{ marginBottom: 14, padding: '14px 16px', borderRadius: 16, background: 'linear-gradient(135deg, rgba(24,20,6,0.9), rgba(10,8,3,0.9))', border: '1px solid rgba(255,214,90,0.22)', display: 'flex', gap: 16, alignItems: 'center' }}>
        {/* preview */}
        <div style={{ width: 46, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: hex(avatar.skin), boxShadow: '0 0 10px rgba(0,0,0,0.6)' }} />
          <div style={{ width: 30, height: 34, borderRadius: 6, background: hex(avatar.shirt) }} />
          <div style={{ width: 24, height: 16, borderRadius: 3, background: '#23262e' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: 'rgba(255,245,210,0.5)', marginBottom: 6 }}>{t.backrooms.yourAvatar}</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {BR_SKINS.map(s => (
              <button key={s} onClick={() => pick({ skin: s })}
                style={{ width: 26, height: 26, borderRadius: '50%', background: hex(s), border: avatar.skin === s ? '2px solid #f5de80' : '2px solid rgba(255,255,255,0.12)', padding: 0 }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {BR_SHIRTS.map(s => (
              <button key={s} onClick={() => pick({ shirt: s })}
                style={{ width: 26, height: 26, borderRadius: 8, background: hex(s), border: avatar.shirt === s ? '2px solid #f5de80' : '2px solid rgba(255,255,255,0.12)', padding: 0 }} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
        {err && <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#ff5540', textAlign: 'center', marginTop: 30 }}>{err}</p>}
        {!rows && !err && <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,245,210,0.4)', textAlign: 'center', marginTop: 30, letterSpacing: 2 }}>{t.backrooms.loading}</p>}
        {rows?.map(r => {
          const full = r.count >= r.maxPlayers;
          return (
            <button key={r.id} disabled={full}
              onClick={() => { enterImmersive(); onJoin(r.id, useAuthStore.getState().profile?.username ?? 'Lost'); }}
              style={{
                width: '100%', textAlign: 'left', marginBottom: 12, padding: '16px 16px', borderRadius: 16,
                background: 'linear-gradient(135deg, rgba(24,20,6,0.9), rgba(10,8,3,0.9))',
                border: '1px solid rgba(255,214,90,0.22)', opacity: full ? 0.45 : 1,
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
              <span style={{ fontSize: 26 }}>🚪</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 700, fontSize: 14, color: '#f5de80', letterSpacing: 1 }}>{r.name}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,245,210,0.4)', marginTop: 3 }}>
                  👤 {r.count}/{r.maxPlayers} {full ? t.backrooms.slotFull : r.count > 0 ? t.backrooms.slotActive : t.backrooms.slotEmpty}
                </div>
              </div>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#f5de80', border: '1px solid rgba(255,214,90,0.4)', borderRadius: 8, padding: '6px 10px' }}>
                {full ? '—' : t.backrooms.enter}
              </span>
            </button>
          );
        })}
        <button onClick={load} style={{ display: 'block', margin: '6px auto', fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,245,210,0.4)', background: 'transparent', border: 'none' }}>{t.backrooms.refresh}</button>
      </div>
    </div>,
    document.body,
  );
}

// ── World ───────────────────────────────────────────────────────────────
function World({ instanceId, onExit, onClose }: { instanceId: string; onExit: () => void; onClose: () => void }) {
  const t = useT();
  const regionNames: Record<string, string> = {
    red: t.backrooms.regionRed,
    black: t.backrooms.regionBlack,
    server: t.backrooms.regionServer,
    library: t.backrooms.regionLibrary,
    cafeteria: t.backrooms.regionCafeteria,
    flood: t.backrooms.regionFlood,
  };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<BackroomsEngine | null>(null);
  const [hud, setHud] = useState<HudState>({ battery: 1, flashlightOn: true, level: 'LEVEL 0', x: 0, z: 0, event: null, voidPhase: 'none', region: 'normal', nearClue: false, chased: false });
  const [note, setNote] = useState<string | null>(null);
  const [spared, setSpared] = useState(false);
  const sparedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rotateToast, setRotateToast] = useState(false);
  const [scare, setScare] = useState(false);
  const [shadowFlash, setShadowFlash] = useState(false);
  const fxTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [status, setStatus] = useState<'joining' | 'in' | 'error'>('joining');
  const [errMsg, setErrMsg] = useState('');

  const voice = useBackroomsVoice();

  const [joy, setJoy] = useState({ active: false, ox: 0, oy: 0, kx: 0, ky: 0 });
  const moveTouch = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const lookTouch = useRef<{ id: number; x: number; y: number } | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const mouseLook = useRef<{ x: number; y: number } | null>(null);

  // Remote players live in a ref (never React state) and are pushed to the engine.
  const players = useRef<Map<string, RemotePlayerState>>(new Map());
  const mySocketId = useRef<string>('');

  const pushRemotes = useCallback(() => {
    const list = [...players.current.values()].filter(p => p.socketId !== mySocketId.current);
    engineRef.current?.setRemotePlayers(list);
  }, []);

  // ── Join + socket wiring + engine lifecycle ─────────────────────────
  useEffect(() => {
    connectSocket();
    let cancelled = false;

    const onJoined = (p: RemotePlayerState) => { players.current.set(p.socketId, p); pushRemotes(); };
    const onLeft = ({ socketId }: { socketId: string }) => { players.current.delete(socketId); pushRemotes(); };
    const onMoved = (p: RemotePlayerState) => {
      const cur = players.current.get(p.socketId);
      if (cur) { cur.x = p.x; cur.y = p.y; cur.z = p.z; cur.ry = p.ry; cur.fl = p.fl; }
      else players.current.set(p.socketId, p);
      pushRemotes();
    };
    const onEvent = (ev: { kind: string; duration?: number; sound?: string; x?: number; z?: number; shelters?: { x: number; z: number }[] }) => {
      engineRef.current?.triggerEvent(ev);
      if (ev.kind === 'void_spared') {
        setSpared(true);
        if (sparedTimer.current) clearTimeout(sparedTimer.current);
        sparedTimer.current = setTimeout(() => setSpared(false), 3500);
      }
    };
    const onGesture = ({ socketId, kind }: { socketId: string; kind: string }) => {
      engineRef.current?.remoteGesture(socketId, kind);
    };
    socket.on('backrooms:player-joined', onJoined);
    socket.on('backrooms:player-left', onLeft);
    socket.on('backrooms:player-moved', onMoved);
    socket.on('backrooms:event', onEvent);
    socket.on('backrooms:gesture', onGesture);

    const av = loadAvatar();
    emitWithAck<{ instanceId: string; name: string; skin: number; shirt: number }, { ok: boolean; data?: JoinData; error?: string }>(
      'backrooms:join', { instanceId, name: useAuthStore.getState().profile?.username ?? 'Lost', skin: av.skin, shirt: av.shirt },
    ).then(res => {
      if (cancelled) return;
      if (!res.ok || !res.data) { setErrMsg(res.error ?? t.backrooms.joinFailed); setStatus('error'); return; }
      mySocketId.current = res.data.mySocketId;
      players.current = new Map(res.data.players.map(p => [p.socketId, p]));

      // Create the engine now that we know the world seed.
      if (canvasRef.current && !engineRef.current) {
        const eng = new BackroomsEngine(canvasRef.current, res.data.seed);
        engineRef.current = eng;
        eng.onHud = setHud;
        eng.onEffect = (kind) => {
          if (kind === 'jumpscare') {
            setScare(true);
            fxTimers.current.push(setTimeout(() => setScare(false), 700));
          } else {
            setShadowFlash(true);
            fxTimers.current.push(setTimeout(() => setShadowFlash(false), 280));
          }
        };
        eng.resize();
        eng.start();
        pushRemotes();
      }
      setStatus('in');
    }).catch(() => { if (!cancelled) { setErrMsg(t.backrooms.connectionLost); setStatus('error'); } });

    // Broadcast our position + drive spatial voice ~10Hz.
    const moveIv = setInterval(() => {
      const eng = engineRef.current; if (!eng) return;
      if (socket.connected) socket.emit('backrooms:move', eng.getNetState());
      const L = eng.getListener();
      const peers = [];
      for (const p of players.current.values()) {
        if (p.socketId === mySocketId.current) continue;
        peers.push({ socketId: p.socketId, x: p.x, z: p.z, occ: eng.occlusionBetween(L.x, L.z, p.x, p.z) });
      }
      applyBackroomsSpatial(L, peers);
    }, 100);

    // Rotation robustness: iOS reports stale viewport sizes right after
    // orientationchange (→ black band on top) and can leave the page scrolled
    // so fixed HUD buttons render offset from their hit areas (taps landing
    // "above" the button). Resize in several passes + pin scroll to 0.
    const doResize = () => { engineRef.current?.resize(); window.scrollTo(0, 0); };
    const onResize = () => { doResize(); setTimeout(doResize, 250); setTimeout(doResize, 700); };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    const vv: VisualViewport | undefined = (window as any).visualViewport;
    vv?.addEventListener('resize', onResize);
    vv?.addEventListener('scroll', doResize);

    let wakeLock: any = null;
    const acquireWake = async () => { try { wakeLock = await (navigator as any).wakeLock?.request('screen'); } catch { /* ignore */ } };
    acquireWake();
    const onVis = () => { if (document.visibilityState === 'visible') acquireWake(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      clearInterval(moveIv);
      socket.off('backrooms:player-joined', onJoined);
      socket.off('backrooms:player-left', onLeft);
      socket.off('backrooms:player-moved', onMoved);
      socket.off('backrooms:event', onEvent);
      socket.off('backrooms:gesture', onGesture);
      leaveBackroomsVoice();
      socket.emit('backrooms:leave');
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      vv?.removeEventListener('resize', onResize);
      vv?.removeEventListener('scroll', doResize);
      if (sparedTimer.current) clearTimeout(sparedTimer.current);
      fxTimers.current.forEach(clearTimeout);
      fxTimers.current = [];
      exitImmersive();
      document.removeEventListener('visibilitychange', onVis);
      try { wakeLock?.release?.(); } catch { /* ignore */ }
      engineRef.current?.dispose();
      engineRef.current = null;
      players.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  // ── Keyboard (desktop) ──────────────────────────────────────────────
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
      if (!moveTouch.current) {
        let x = 0, y = 0;
        if (k['w'] || k['arrowup']) y += 1;
        if (k['s'] || k['arrowdown']) y -= 1;
        if (k['d'] || k['arrowright']) x += 1;
        if (k['a'] || k['arrowleft']) x -= 1;
        eng.input.move.x = x; eng.input.move.y = y;
        eng.input.sprint = !!k['shift'];
        eng.input.steer = false; // desktop keeps classic strafing + mouse-look
      }
    }, 33);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); clearInterval(iv); };
  }, []);

  // Reflect who's talking onto the remote avatars' head-lamps.
  useEffect(() => { engineRef.current?.setSpeaking(voice.speakingIds); }, [voice.speakingIds]);

  // Suggest landscape to newcomers holding the phone in portrait (6s toast).
  useEffect(() => {
    if (window.innerHeight <= window.innerWidth) return;
    setRotateToast(true);
    const t = setTimeout(() => setRotateToast(false), 6000);
    return () => clearTimeout(t);
  }, []);

  // ── Touch controls ──────────────────────────────────────────────────
  const isControlTarget = (t: EventTarget | null) => t instanceof HTMLElement && t.closest('[data-hud-btn]') != null;

  const onTouchStart = (e: React.TouchEvent) => {
    engineRef.current?.resumeAudio();
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
        eng.input.move.y = -dy / JOY_R;
        eng.input.sprint = mag > JOY_R * 0.85;
        eng.input.steer = true; // stick sideways = turn the camera too
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
        if (eng) { eng.input.move.x = 0; eng.input.move.y = 0; eng.input.sprint = false; eng.input.steer = false; }
      } else if (lookTouch.current && t.identifier === lookTouch.current.id) {
        lookTouch.current = null;
      }
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    engineRef.current?.resumeAudio();
    if (isControlTarget(e.target)) return;
    if (e.clientX < window.innerWidth * 0.5) return;
    mouseLook.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!mouseLook.current) return;
    engineRef.current?.addLook(e.clientX - mouseLook.current.x, e.clientY - mouseLook.current.y);
    mouseLook.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { mouseLook.current = null; };

  const sendGesture = (kind: string) => {
    if (socket.connected) socket.emit('backrooms:gesture', { kind });
    if (kind === 'signal') { // blink my own flashlight so nearby players see the light too
      const e = engineRef.current; if (!e) return;
      e.setFlashlight(false); setTimeout(() => e.setFlashlight(true), 140);
    }
  };
  const gbtn = (label: string, kind: string) => (
    <button data-hud-btn onPointerDown={(e) => { e.preventDefault(); sendGesture(kind); }} onContextMenu={(e) => e.preventDefault()}
      style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(10,8,4,0.5)', border: '1px solid rgba(255,240,180,0.18)', color: 'rgba(255,245,210,0.85)', fontSize: 18, backdropFilter: 'blur(4px)', touchAction: 'none', userSelect: 'none' }}>
      {label}
    </button>
  );

  // All HUD buttons act on pointerdown: iOS suppresses synthesized click
  // events while another touch (the joystick) is active, so onClick-based
  // buttons went dead during movement. Pointer events fire per-finger.
  const btn = (label: string, on: () => void, opts?: { hold?: boolean; off?: () => void; active?: boolean }) => (
    <button
      data-hud-btn
      onPointerDown={(e) => { e.preventDefault(); on(); }}
      onPointerUp={opts?.hold ? (e) => { e.preventDefault(); opts.off?.(); } : undefined}
      onPointerCancel={opts?.hold ? () => opts.off?.() : undefined}
      onPointerLeave={opts?.hold ? () => opts.off?.() : undefined}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        width: 60, height: 60, borderRadius: '50%',
        background: opts?.active ? 'rgba(255,240,180,0.18)' : 'rgba(10,8,4,0.55)',
        border: `1px solid ${opts?.active ? 'rgba(255,240,180,0.5)' : 'rgba(255,240,180,0.18)'}`,
        color: 'rgba(255,245,210,0.85)', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)', userSelect: 'none', touchAction: 'none', WebkitUserSelect: 'none',
      }}
    >{label}</button>
  );

  const remoteCount = Math.max(0, players.current.size - (mySocketId.current ? 1 : 0));

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#000', overflow: 'hidden', touchAction: 'none' }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)' }} />

      {/* Film grain */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.06, mixBlendMode: 'overlay',
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        backgroundSize: '150px 150px', animation: 'vm-grain 0.5s steps(3) infinite',
      }} />

      {/* Chromatic-aberration fringe (intensifies during danger) */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', transition: 'box-shadow 0.6s ease',
        boxShadow: (hud.voidPhase !== 'none' || hud.event === 'blackout')
          ? 'inset 8px 0 26px rgba(255,0,40,0.18), inset -8px 0 26px rgba(0,220,255,0.18)'
          : 'inset 3px 0 16px rgba(255,0,40,0.05), inset -3px 0 16px rgba(0,220,255,0.05)',
      }} />

      {/* Blackout: heavy dark + faint red emergency wash. Flicker: subtle wash. */}
      {hud.event === 'blackout' && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, rgba(40,0,0,0.25) 0%, rgba(0,0,0,0.78) 100%)', animation: 'vm-br-emergency 2.4s ease-in-out infinite' }} />
      )}
      {hud.event === 'flicker' && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'rgba(0,0,0,0.18)' }} />
      )}
      {hud.event === 'blackout' && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none', fontFamily: 'monospace', fontSize: 11, letterSpacing: 4, color: 'rgba(255,80,60,0.5)' }}>
          {t.backrooms.emergencyLighting}
        </div>
      )}

      {/* ── VOID IS COMING — cinematic overlay ── */}
      {hud.voidPhase !== 'none' && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          transition: 'background 1.4s ease',
          background: hud.voidPhase === 'sweep'
            ? 'rgba(0,0,0,0.9)'
            : 'radial-gradient(ellipse at center, rgba(28,0,0,0.14) 0%, rgba(0,0,0,0.74) 100%)',
        }}>
          {hud.voidPhase === 'warning' && (
            <>
              <div style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 900, fontSize: 'min(11vw,54px)', letterSpacing: 6, color: '#ff2b2b', textShadow: '0 0 26px rgba(255,0,0,0.65)', animation: 'vm-void-pulse 1.05s ease-in-out infinite' }}>
                VOID IS COMING
              </div>
              <div style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 800, fontSize: 'min(8.5vw,34px)', letterSpacing: 3, color: 'rgba(255,120,110,0.9)', animation: 'vm-void-pulse 1.05s ease-in-out infinite' }}>
                {t.backrooms.voidComing}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 13, letterSpacing: 2, color: 'rgba(120,255,170,0.85)', marginTop: 10, textShadow: '0 0 12px rgba(40,255,140,0.5)', textAlign: 'center', padding: '0 20px' }}>
                {t.backrooms.voidFindGreen}
              </div>
            </>
          )}
          {hud.voidPhase === 'sweep' && (
            <div style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 900, fontSize: 'min(9vw,40px)', letterSpacing: 8, color: 'rgba(120,0,0,0.55)', animation: 'vm-void-pulse 0.5s ease-in-out infinite' }}>
              ▓▓▓
            </div>
          )}
        </div>
      )}

      {/* Mirror-clone chase: pulsing red danger vignette */}
      {hud.chased && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 12,
          boxShadow: 'inset 0 0 120px rgba(255,0,20,0.45)', animation: 'vm-br-emergency 0.9s ease-in-out infinite' }} />
      )}

      {/* Shadow-figure close pass: quick dark flash */}
      {shadowFlash && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 24, background: 'rgba(0,0,0,0.6)' }} />
      )}

      {/* Jumpscare */}
      {scare && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 40, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', overflow: 'hidden' }}>
          <img src={scareFace()} alt="" style={{ width: 'min(90vw, 70vh)', animation: 'vm-scare 0.7s ease-out forwards' }} />
        </div>
      )}

      {/* Void survival toast */}
      {spared && (
        <div style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 16, pointerEvents: 'none', fontFamily: '"Space Grotesk",monospace', fontWeight: 800, fontSize: 'min(6vw,22px)', letterSpacing: 2, color: '#4dff9a', textShadow: '0 0 18px rgba(40,255,140,0.6)', whiteSpace: 'nowrap' }}>
          {t.backrooms.voidEscaped}
        </div>
      )}

      {/* Landscape suggestion for newcomers (portrait only, 6s) */}
      {rotateToast && status === 'in' && (
        <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)', zIndex: 15, pointerEvents: 'none', width: 'min(300px, 78vw)', textAlign: 'center', background: 'rgba(6,4,2,0.78)', border: '1px solid rgba(255,240,180,0.25)', borderRadius: 14, padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6, color: 'rgba(255,245,210,0.9)', backdropFilter: 'blur(6px)' }}>
          {t.backrooms.rotateHint}
        </div>
      )}

      {/* Rare-region discovery label */}
      {status === 'in' && hud.region !== 'normal' && regionNames[hud.region] && (
        <div style={{ position: 'absolute', top: 'max(78px, calc(env(safe-area-inset-top) + 64px))', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none',
          fontFamily: 'monospace', fontSize: 11, letterSpacing: 3, color: 'rgba(255,245,210,0.6)', border: '1px solid rgba(255,245,210,0.18)', borderRadius: 20, padding: '5px 14px', background: 'rgba(6,4,2,0.5)', backdropFilter: 'blur(4px)', whiteSpace: 'nowrap' }}>
          {regionNames[hud.region]}
        </div>
      )}

      {/* Clue note reader */}
      {note && (
        <div data-hud-btn onPointerDown={() => setNote(null)}
          style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(2,1,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <div style={{ maxWidth: 360, padding: '22px 20px', borderRadius: 8, background: 'rgba(232,226,200,0.94)', boxShadow: '0 12px 50px rgba(0,0,0,0.7)', transform: 'rotate(-1.2deg)' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 15, lineHeight: 1.7, color: '#1a1408', whiteSpace: 'pre-wrap' }}>{note}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: 'rgba(26,20,8,0.4)', marginTop: 16, textAlign: 'right' }}>{t.backrooms.tapToClose}</div>
          </div>
        </div>
      )}

      {/* Joining / error overlays */}
      {status !== 'in' && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,2,1,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 13, letterSpacing: 3, color: 'rgba(245,222,128,0.7)' }}>
            {status === 'joining' ? t.backrooms.joining : (errMsg || t.backrooms.error)}
          </div>
          {status === 'error' && (
            <button data-hud-btn onClick={onExit} style={{ fontFamily: 'monospace', fontSize: 12, color: '#f5de80', background: 'rgba(255,214,90,0.1)', border: '1px solid rgba(255,214,90,0.4)', borderRadius: 10, padding: '8px 16px' }}>{t.backrooms.back}</button>
          )}
        </div>
      )}

      {/* Top-left: level + battery + presence */}
      <div style={{ position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', left: 16, pointerEvents: 'none' }}>
        <div style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 700, fontSize: 13, letterSpacing: 3, color: 'rgba(255,245,210,0.8)' }}>{hud.level}</div>
        <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: 'rgba(255,245,210,0.35)', marginTop: 2 }}>👤 {remoteCount + 1} · THE BACKROOMS</div>
        <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 1, marginTop: 3, color: voice.error ? '#ff8a70' : voice.joined ? (voice.muted ? 'rgba(255,245,210,0.4)' : '#8effc0') : 'rgba(245,222,128,0.55)' }}>
          {voice.error ? '🎙️ ' + voice.error : voice.joined ? (voice.muted ? t.backrooms.micMuted : t.backrooms.micTalking) : t.backrooms.micHint}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 12, opacity: hud.flashlightOn ? 1 : 0.35 }}>🔦</span>
          <div style={{ width: 90, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(hud.battery * 100)}%`, height: '100%', background: hud.battery < 0.15 ? '#ff5540' : hud.battery < 0.4 ? '#ffb040' : '#8effc0', transition: 'width .3s linear' }} />
          </div>
        </div>
      </div>

      {/* Top-right: back to lobby + close */}
      <div style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', right: 14, display: 'flex', gap: 8 }}>
        <button data-hud-btn onPointerDown={(e) => { e.preventDefault(); onExit(); }} title={t.backrooms.instances} style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(10,8,4,0.55)', border: '1px solid rgba(255,240,180,0.2)', color: 'rgba(255,245,210,0.85)', fontSize: 15, backdropFilter: 'blur(4px)', touchAction: 'none' }}>🚪</button>
        <button data-hud-btn onPointerDown={(e) => { e.preventDefault(); onClose(); }} style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(10,8,4,0.55)', border: '1px solid rgba(255,240,180,0.2)', color: 'rgba(255,245,210,0.85)', fontSize: 18, backdropFilter: 'blur(4px)', touchAction: 'none' }}>✕</button>
      </div>

      {/* Social gestures (top-right, below close/lobby) */}
      {status === 'in' && (
        <div style={{ position: 'absolute', top: 'max(62px, calc(env(safe-area-inset-top) + 50px))', right: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {gbtn('👋', 'wave')}
          {gbtn('👉', 'point')}
          {gbtn('💡', 'signal')}
        </div>
      )}

      {/* Joystick */}
      {joy.active && (
        <>
          <div style={{ position: 'absolute', left: joy.ox - JOY_R, top: joy.oy - JOY_R, width: JOY_R * 2, height: JOY_R * 2, borderRadius: '50%', border: '2px solid rgba(255,240,180,0.25)', background: 'rgba(255,240,180,0.05)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: joy.ox + joy.kx - 24, top: joy.oy + joy.ky - 24, width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,240,180,0.28)', border: '1px solid rgba(255,240,180,0.5)', pointerEvents: 'none' }} />
        </>
      )}
      {!joy.active && status === 'in' && (
        <div style={{ position: 'absolute', left: 40, bottom: 60, width: JOY_R * 2, height: JOY_R * 2, borderRadius: '50%', border: '2px dashed rgba(255,240,180,0.15)', pointerEvents: 'none' }} />
      )}

      {/* Right-bottom controls */}
      <div style={{ position: 'absolute', right: 22, bottom: 'max(48px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {btn(voice.joined ? (voice.muted ? '🔇' : '🎙️') : '🎙️',
            () => { if (!voice.joined) voice.joinVoice(); else voice.toggleMute(); },
            { active: voice.joined && !voice.muted })}
          {btn('🔦', () => engineRef.current?.toggleFlashlight(), { active: hud.flashlightOn })}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {btn('🏃', () => { engineRef.current && (engineRef.current.input.sprint = true); }, { hold: true, off: () => { engineRef.current && (engineRef.current.input.sprint = false); } })}
          {btn('⤒', () => engineRef.current?.jump())}
        </div>
        {hud.nearClue && btn('✋', () => { const n = engineRef.current?.readClue(); if (n) setNote(n); }, { active: true })}
      </div>

      <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,245,210,0.25)', letterSpacing: 1, whiteSpace: 'nowrap' }}>
        {t.backrooms.controlsHint}
      </div>
    </div>,
    document.body,
  );
}
