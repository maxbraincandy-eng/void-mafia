import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { socket, connectSocket, emitWithAck } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { useWorldVoice, applyWorldSpatial, leaveWorldVoice } from '@/hooks/useWorldVoice';
import { WorldEngine, type WorldHud, type RemoteWorldPlayer } from './engine';
import { PREMIUM_WORLDS, getWorld } from './registry';
import type { AvatarConfig } from './types';

// ── Premium Worlds — full-screen overlay (lobby → 3D world) ────────────
// Lazy-loaded from App so Three.js + world code stay out of the main bundle.
// Classic 2D Virtual Spaces are untouched; this is an entirely separate path.

const JOY_R = 58;

function readAvatar(): AvatarConfig {
  return {
    bodyColor: localStorage.getItem('vs_bodyColor') || '#9b00ff',
    glowColor: localStorage.getItem('vs_glowColor') || '#00e5ff',
  };
}

function PlayerRow({ name, color, speaking }: { name: string; color: string; speaking: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 4px' }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: speaking ? '0 0 8px #2aff8a' : 'none', border: speaking ? '1.5px solid #2aff8a' : '1.5px solid rgba(255,255,255,0.15)' }} />
      <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#e9d5ff', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      {speaking && <span style={{ fontSize: 12 }}>🎙️</span>}
    </div>
  );
}

function isTouch() { return typeof window !== 'undefined' && 'ontouchstart' in window; }
async function enterImmersive() {
  if (!isTouch()) return;
  try { await (document.documentElement as any).requestFullscreen?.({ navigationUI: 'hide' }); } catch { /* iOS */ }
  try { await (screen.orientation as any)?.lock?.('landscape'); } catch { try { (screen.orientation as any)?.unlock?.(); } catch { /* ignore */ } }
}
function exitImmersive() {
  if (!isTouch()) return;
  try { (screen.orientation as any)?.unlock?.(); } catch { /* ignore */ }
  try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch { /* ignore */ }
}

export default function PremiumWorlds({ onClose }: { onClose: () => void }) {
  const [worldId, setWorldId] = useState<string | null>(null);
  if (!worldId) return <Lobby onEnter={(id) => { enterImmersive(); setWorldId(id); }} onClose={onClose} />;
  return <World worldId={worldId} onExit={() => { exitImmersive(); setWorldId(null); }} onClose={() => { exitImmersive(); onClose(); }} />;
}

// ── Lobby ─────────────────────────────────────────────────────────────
function Lobby({ onEnter, onClose }: { onEnter: (id: string) => void; onClose: () => void }) {
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'radial-gradient(ellipse at top, #12172e 0%, #05060d 100%)', display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 'max(18px, env(safe-area-inset-top))', paddingBottom: 12 }}>
        <span style={{ fontSize: 24 }}>✨</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 700, fontSize: 17, letterSpacing: 1, color: '#c084fc' }}>PREMIUM WORLDS</div>
          <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: 'rgba(192,132,252,0.45)' }}>მაღალი ხარისხის 3D სოციალური სივრცეები</div>
        </div>
        <button onClick={onClose} style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(20,16,40,0.6)', border: '1px solid rgba(192,132,252,0.3)', color: '#e9d5ff', fontSize: 17 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
        {PREMIUM_WORLDS.map(w => {
          const live = w.status === 'live';
          return (
            <button key={w.id} disabled={!live} onClick={() => live && onEnter(w.id)}
              style={{
                width: '100%', textAlign: 'left', marginBottom: 12, padding: 0, borderRadius: 18, overflow: 'hidden',
                border: live ? '1px solid rgba(192,132,252,0.45)' : '1px solid rgba(255,255,255,0.08)',
                background: 'linear-gradient(135deg, rgba(30,24,56,0.9), rgba(12,10,24,0.9))',
                opacity: live ? 1 : 0.5, position: 'relative',
              }}>
              <div style={{ height: 96, background: live
                ? 'linear-gradient(135deg, #1a2b4a 0%, #4a2c1a 55%, #6b3a1a 100%)'
                : 'linear-gradient(135deg, #1a1a2e, #12121e)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <span style={{ fontSize: 46, filter: live ? 'drop-shadow(0 4px 16px rgba(255,140,60,0.6))' : 'grayscale(1)' }}>{w.icon}</span>
                {live && <span style={{ position: 'absolute', top: 10, right: 12, fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, color: '#fff', background: 'rgba(124,58,237,0.9)', borderRadius: 8, padding: '3px 8px' }}>NEW</span>}
              </div>
              <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 700, fontSize: 14, color: '#e9d5ff' }}>{w.name}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(233,213,255,0.4)', marginTop: 2 }}>{w.subtitle}</div>
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: live ? '#c084fc' : 'rgba(255,255,255,0.35)', border: `1px solid ${live ? 'rgba(192,132,252,0.5)' : 'rgba(255,255,255,0.15)'}`, borderRadius: 9, padding: '7px 12px', whiteSpace: 'nowrap' }}>
                  {live ? 'შესვლა' : 'მალე'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

// ── World ─────────────────────────────────────────────────────────────
function World({ worldId, onExit, onClose }: { worldId: string; onExit: () => void; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const [hud, setHud] = useState<WorldHud>({ world: '', sitting: false, canInteract: null, players: 1 });
  const [uiVisible, setUiVisible] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const voice = useWorldVoice();
  const [joy, setJoy] = useState({ active: false, ox: 0, oy: 0, kx: 0, ky: 0 });
  const moveTouch = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const lookTouch = useRef<{ id: number; x: number; y: number } | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const mouseLook = useRef<{ x: number; y: number } | null>(null);
  const tapStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const players = useRef<Map<string, RemoteWorldPlayer>>(new Map());
  const mySocketId = useRef('');
  const [roster, setRoster] = useState<{ socketId: string; name: string; bodyColor: string }[]>([]);
  const [panel, setPanel] = useState<null | 'players' | 'settings'>(null);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [quality, setQuality] = useState<{ mode: 'auto' | 'high' | 'low'; shadows: boolean }>(() => {
    try { const q = JSON.parse(localStorage.getItem('vw_quality') ?? ''); if (q && q.mode) return q; } catch { /* default */ }
    return { mode: 'auto', shadows: true };
  });

  const poke = useCallback(() => {
    setUiVisible(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setUiVisible(false), 4000);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const def = getWorld(worldId);
    if (!def || def.status !== 'live') { onExit(); return; }
    const av = readAvatar();
    const eng = new WorldEngine(canvasRef.current, def, av);
    engineRef.current = eng;
    eng.onHud = setHud;
    eng.setQuality(quality.mode);
    eng.setShadows(quality.shadows);
    eng.resize();
    eng.start();
    poke();

    // ── multiplayer presence ──
    connectSocket();
    const pushRemotes = () => {
      const list = [...players.current.values()].filter(p => p.socketId !== mySocketId.current);
      eng.setRemotePlayers(list);
    };
    const syncRoster = () => setRoster([...players.current.values()].filter(p => p.socketId !== mySocketId.current).map(p => ({ socketId: p.socketId, name: p.name, bodyColor: p.bodyColor })));
    const onJoined = (p: RemoteWorldPlayer) => { players.current.set(p.socketId, p); pushRemotes(); syncRoster(); };
    const onLeft = ({ socketId }: { socketId: string }) => { players.current.delete(socketId); pushRemotes(); syncRoster(); };
    const onMoved = (p: any) => {
      const cur = players.current.get(p.socketId);
      if (cur) { cur.x = p.x; cur.z = p.z; cur.ry = p.ry; cur.seatId = p.seatId; }
      pushRemotes();
    };
    const onWave = ({ socketId }: { socketId: string }) => eng.remoteWave(socketId);
    const onEmote = ({ socketId, kind }: { socketId: string; kind: any }) => eng.remoteEmote(socketId, kind);
    const onInteractNet = ({ id }: { id: string }) => eng.triggerInteract(id);
    eng.onInteract = (id) => { if (socket.connected) socket.emit('world:interact', { id }); };
    socket.on('world:player-joined', onJoined);
    socket.on('world:player-left', onLeft);
    socket.on('world:player-moved', onMoved);
    socket.on('world:wave', onWave);
    socket.on('world:emote', onEmote);
    socket.on('world:interact', onInteractNet);

    emitWithAck<{ worldId: string; name: string; bodyColor: string; glowColor: string }, { ok: boolean; data?: { mySocketId: string; players: RemoteWorldPlayer[] } }>(
      'world:join', { worldId, name: useAuthStore.getState().profile?.username ?? 'Guest', bodyColor: av.bodyColor, glowColor: av.glowColor },
    ).then(res => {
      if (res.ok && res.data) {
        mySocketId.current = res.data.mySocketId;
        players.current = new Map(res.data.players.map(p => [p.socketId, p]));
        pushRemotes(); syncRoster();
      }
    }).catch(() => {});

    // ~12Hz: broadcast our state + drive spatial voice
    const netIv = setInterval(() => {
      if (!engineRef.current) return;
      const s = engineRef.current.getNetState();
      if (socket.connected) socket.emit('world:move', s);
      const L = engineRef.current.getListener();
      const peers = [...players.current.values()].filter(p => p.socketId !== mySocketId.current)
        .map(p => ({ socketId: p.socketId, x: p.x, z: p.z, occ: 0 }));
      applyWorldSpatial(L, peers);
    }, 85);

    const doResize = () => { eng.resize(); window.scrollTo(0, 0); };
    const onResize = () => { doResize(); setTimeout(doResize, 250); setTimeout(doResize, 700); };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    const vv: VisualViewport | undefined = (window as any).visualViewport;
    vv?.addEventListener('resize', onResize);

    let wake: any = null;
    const acqWake = async () => { try { wake = await (navigator as any).wakeLock?.request('screen'); } catch { /* ignore */ } };
    acqWake();
    const onVis = () => { if (document.visibilityState === 'visible') acqWake(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      vv?.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      socket.off('world:player-joined', onJoined);
      socket.off('world:player-left', onLeft);
      socket.off('world:player-moved', onMoved);
      socket.off('world:wave', onWave);
      socket.off('world:emote', onEmote);
      socket.off('world:interact', onInteractNet);
      clearInterval(netIv);
      leaveWorldVoice();
      socket.emit('world:leave');
      players.current.clear();
      if (idleTimer.current) clearTimeout(idleTimer.current);
      try { wake?.release?.(); } catch { /* ignore */ }
      eng.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  // keyboard (desktop)
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase(); keys.current[k] = true;
      if (k === 'e' || k === ' ') engineRef.current?.interact();
      if (k === 'q') { engineRef.current?.emote(); if (socket.connected) socket.emit('world:wave'); }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    const iv = setInterval(() => {
      const eng = engineRef.current; if (!eng) return;
      if (!moveTouch.current) {
        let x = 0, y = 0; const k = keys.current;
        if (k['w'] || k['arrowup']) y += 1;
        if (k['s'] || k['arrowdown']) y -= 1;
        if (k['d'] || k['arrowright']) x += 1;
        if (k['a'] || k['arrowleft']) x -= 1;
        eng.input.move.x = x; eng.input.move.y = y; eng.input.run = !!k['shift'];
      }
    }, 33);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); clearInterval(iv); };
  }, []);

  // reflect who's talking onto remote nameplates
  useEffect(() => { engineRef.current?.setSpeaking(voice.speakingIds); }, [voice.speakingIds]);

  // apply + persist quality settings
  useEffect(() => {
    engineRef.current?.setQuality(quality.mode);
    engineRef.current?.setShadows(quality.shadows);
    try { localStorage.setItem('vw_quality', JSON.stringify(quality)); } catch { /* ignore */ }
  }, [quality]);

  // keep the HUD up while a panel is open
  useEffect(() => { if (panel) { setUiVisible(true); if (idleTimer.current) clearTimeout(idleTimer.current); } else poke(); }, [panel, poke]);
  const showUI = uiVisible || panel != null;

  const doEmote = (kind: 'wave' | 'dance' | 'clap' | 'heart' | 'laugh') => {
    engineRef.current?.localEmote(kind);
    if (socket.connected) socket.emit('world:emote', { kind });
    setEmoteOpen(false); poke();
  };

  const isCtl = (t: EventTarget | null) => t instanceof HTMLElement && t.closest('[data-hud]') != null;

  const onTouchStart = (e: React.TouchEvent) => {
    engineRef.current?.resumeAudio(); poke();
    for (const t of Array.from(e.changedTouches)) {
      if (isCtl(t.target)) continue;
      const leftZone = t.clientX < window.innerWidth * 0.42;
      if (leftZone && !moveTouch.current && !hud.sitting) {
        moveTouch.current = { id: t.identifier, ox: t.clientX, oy: t.clientY };
        setJoy({ active: true, ox: t.clientX, oy: t.clientY, kx: 0, ky: 0 });
      } else if (!lookTouch.current) {
        lookTouch.current = { id: t.identifier, x: t.clientX, y: t.clientY };
        tapStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      }
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const eng = engineRef.current; if (!eng) return;
    for (const t of Array.from(e.changedTouches)) {
      if (moveTouch.current && t.identifier === moveTouch.current.id) {
        let dx = t.clientX - moveTouch.current.ox, dy = t.clientY - moveTouch.current.oy;
        const mag = Math.hypot(dx, dy);
        if (mag > JOY_R) { dx = dx / mag * JOY_R; dy = dy / mag * JOY_R; }
        setJoy(j => ({ ...j, kx: dx, ky: dy }));
        eng.input.move.x = dx / JOY_R; eng.input.move.y = -dy / JOY_R; eng.input.run = mag > JOY_R * 0.82;
      } else if (lookTouch.current && t.identifier === lookTouch.current.id) {
        eng.addLook(t.clientX - lookTouch.current.x, t.clientY - lookTouch.current.y);
        lookTouch.current.x = t.clientX; lookTouch.current.y = t.clientY;
        if (tapStart.current && Math.hypot(t.clientX - tapStart.current.x, t.clientY - tapStart.current.y) > 12) tapStart.current = null;
      }
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const eng = engineRef.current;
    for (const t of Array.from(e.changedTouches)) {
      if (moveTouch.current && t.identifier === moveTouch.current.id) {
        moveTouch.current = null; setJoy({ active: false, ox: 0, oy: 0, kx: 0, ky: 0 });
        if (eng) { eng.input.move.x = 0; eng.input.move.y = 0; eng.input.run = false; }
      } else if (lookTouch.current && t.identifier === lookTouch.current.id) {
        // a quick tap that didn't drag = interact
        if (tapStart.current && Date.now() - tapStart.current.t < 250 && !isCtl(t.target)) eng?.interact();
        lookTouch.current = null; tapStart.current = null;
      }
    }
  };

  const onMouseDown = (e: React.MouseEvent) => { engineRef.current?.resumeAudio(); poke(); if (isCtl(e.target)) return; if (e.clientX < window.innerWidth * 0.42) return; mouseLook.current = { x: e.clientX, y: e.clientY }; };
  const onMouseMove = (e: React.MouseEvent) => { if (!mouseLook.current) return; engineRef.current?.addLook(e.clientX - mouseLook.current.x, e.clientY - mouseLook.current.y); mouseLook.current = { x: e.clientX, y: e.clientY }; };
  const onMouseUp = () => { mouseLook.current = null; };

  const roundBtn = (label: string, on: () => void, size = 58, active = false): React.ReactNode => (
    <button data-hud onPointerDown={(e) => { e.preventDefault(); on(); poke(); }} onContextMenu={(e) => e.preventDefault()}
      style={{ width: size, height: size, borderRadius: '50%', background: active ? 'rgba(192,132,252,0.25)' : 'rgba(16,12,32,0.55)', border: `1px solid ${active ? 'rgba(192,132,252,0.6)' : 'rgba(192,132,252,0.28)'}`, color: '#e9d5ff', fontSize: size * 0.36, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)', touchAction: 'none', userSelect: 'none' }}>
      {label}
    </button>
  );

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#05060d', overflow: 'hidden', touchAction: 'none' }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', left: 14, right: 14, display: 'flex', alignItems: 'center', gap: 8, opacity: showUI ? 1 : 0, transition: 'opacity .4s', pointerEvents: showUI ? 'auto' : 'none' }}>
        <button data-hud onPointerDown={(e) => { e.preventDefault(); setPanel(p => p === 'players' ? null : 'players'); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(16,12,32,0.5)', border: '1px solid rgba(192,132,252,0.25)', borderRadius: 20, padding: '7px 14px', backdropFilter: 'blur(6px)', touchAction: 'none' }}>
          <span style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 700, fontSize: 12, letterSpacing: 1, color: '#e9d5ff' }}>{hud.world}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(233,213,255,0.6)' }}>👥 {hud.players}</span>
          {voice.joined && <span style={{ fontFamily: 'monospace', fontSize: 11, color: voice.muted ? 'rgba(233,213,255,0.4)' : '#8effc0' }}>{voice.muted ? '🔇' : '🎙️'}</span>}
        </button>
        <div style={{ flex: 1 }} />
        {roundBtn('⚙️', () => setPanel(p => p === 'settings' ? null : 'settings'), 40, panel === 'settings')}
        {roundBtn('🚪', onExit, 40)}
        {roundBtn('✕', onClose, 40)}
      </div>

      {/* Player list panel */}
      {panel === 'players' && (
        <div data-hud style={{ position: 'absolute', top: 'max(62px, calc(env(safe-area-inset-top) + 50px))', left: 14, width: 'min(260px, 70vw)', maxHeight: '62vh', overflowY: 'auto', background: 'rgba(12,10,24,0.9)', border: '1px solid rgba(192,132,252,0.3)', borderRadius: 14, padding: 10, backdropFilter: 'blur(10px)' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: 'rgba(233,213,255,0.5)', margin: '2px 4px 8px' }}>მოთამაშეები · {hud.players}</div>
          <PlayerRow name={`${useAuthStore.getState().profile?.username ?? 'შენ'} (შენ)`} color={readAvatar().bodyColor} speaking={false} />
          {roster.map(p => <PlayerRow key={p.socketId} name={p.name} color={p.bodyColor} speaking={voice.speakingIds.has(p.socketId)} />)}
        </div>
      )}

      {/* Settings panel */}
      {panel === 'settings' && (
        <div data-hud style={{ position: 'absolute', top: 'max(62px, calc(env(safe-area-inset-top) + 50px))', right: 14, width: 'min(250px, 74vw)', background: 'rgba(12,10,24,0.9)', border: '1px solid rgba(192,132,252,0.3)', borderRadius: 14, padding: 14, backdropFilter: 'blur(10px)' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: 'rgba(233,213,255,0.5)', marginBottom: 10 }}>⚙️ ხარისხი</div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(233,213,255,0.7)', marginBottom: 6 }}>რენდერი</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {(['auto', 'high', 'low'] as const).map(m => (
              <button key={m} onPointerDown={(e) => { e.preventDefault(); setQuality(q => ({ ...q, mode: m })); }}
                style={{ flex: 1, padding: '8px 0', borderRadius: 9, fontFamily: 'monospace', fontSize: 11, background: quality.mode === m ? 'rgba(192,132,252,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${quality.mode === m ? 'rgba(192,132,252,0.6)' : 'rgba(255,255,255,0.12)'}`, color: '#e9d5ff', touchAction: 'none' }}>
                {m === 'auto' ? 'ავტო' : m === 'high' ? 'მაღ.' : 'დაბ.'}
              </button>
            ))}
          </div>
          <button onPointerDown={(e) => { e.preventDefault(); setQuality(q => ({ ...q, shadows: !q.shadows })); }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#e9d5ff', fontFamily: 'monospace', fontSize: 11, touchAction: 'none' }}>
            <span>ჩრდილები</span>
            <span style={{ color: quality.shadows ? '#8effc0' : 'rgba(233,213,255,0.4)' }}>{quality.shadows ? 'ჩართ.' : 'გამორთ.'}</span>
          </button>
        </div>
      )}

      {/* Left joystick (hidden while seated) */}
      {!hud.sitting && joy.active && (
        <>
          <div data-hud style={{ position: 'absolute', left: joy.ox - JOY_R, top: joy.oy - JOY_R, width: JOY_R * 2, height: JOY_R * 2, borderRadius: '50%', border: '2px solid rgba(192,132,252,0.3)', background: 'rgba(192,132,252,0.06)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: joy.ox + joy.kx - 26, top: joy.oy + joy.ky - 26, width: 52, height: 52, borderRadius: '50%', background: 'rgba(192,132,252,0.32)', border: '1px solid rgba(192,132,252,0.6)', pointerEvents: 'none' }} />
        </>
      )}
      {!hud.sitting && !joy.active && showUI && (
        <div style={{ position: 'absolute', left: 44, bottom: 64, width: JOY_R * 2, height: JOY_R * 2, borderRadius: '50%', border: '2px dashed rgba(192,132,252,0.2)', pointerEvents: 'none' }} />
      )}

      {/* Right controls */}
      <div style={{ position: 'absolute', right: 24, bottom: 'max(52px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, opacity: showUI ? 1 : 0.25, transition: 'opacity .4s' }}>
        {hud.canInteract && roundBtn(hud.sitting ? '🧍' : (hud.canInteract.includes('🔥') ? '🔥' : hud.canInteract.includes('🎆') ? '🎆' : '🪑'), () => engineRef.current?.interact(), 62, true)}
        {/* Emote wheel */}
        {emoteOpen && (
          <div data-hud style={{ position: 'absolute', right: 60, bottom: 62, display: 'flex', gap: 8, background: 'rgba(12,10,24,0.75)', border: '1px solid rgba(192,132,252,0.3)', borderRadius: 30, padding: 8, backdropFilter: 'blur(8px)' }}>
            {([['👋', 'wave'], ['💃', 'dance'], ['👏', 'clap'], ['❤️', 'heart'], ['😂', 'laugh']] as const).map(([e, k]) => (
              <button key={k} data-hud onPointerDown={(ev) => { ev.preventDefault(); doEmote(k); }} onContextMenu={(ev) => ev.preventDefault()}
                style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(192,132,252,0.3)', fontSize: 20, touchAction: 'none' }}>{e}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          {roundBtn(voice.joined ? (voice.muted ? '🔇' : '🎙️') : '🎙️', () => { if (!voice.joined) voice.joinVoice(); else voice.toggleMute(); }, 50, voice.joined && !voice.muted)}
          {roundBtn('😀', () => setEmoteOpen(o => !o), 50, emoteOpen)}
        </div>
      </div>

      {/* Interact hint */}
      {hud.canInteract && showUI && (
        <div style={{ position: 'absolute', bottom: 'max(130px, calc(env(safe-area-inset-bottom) + 118px))', right: 24, pointerEvents: 'none', fontFamily: 'monospace', fontSize: 11, letterSpacing: 1, color: 'rgba(233,213,255,0.75)', background: 'rgba(16,12,32,0.5)', borderRadius: 10, padding: '4px 10px', whiteSpace: 'nowrap' }}>
          {hud.canInteract}
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', fontFamily: 'monospace', fontSize: 10, color: 'rgba(233,213,255,0.22)', letterSpacing: 1, whiteSpace: 'nowrap', opacity: showUI ? 1 : 0, transition: 'opacity .4s' }}>
        WASD მოძრაობა · მაუსი კამერა · E დაჯდომა · Q მისალმება
      </div>
    </div>,
    document.body,
  );
}
