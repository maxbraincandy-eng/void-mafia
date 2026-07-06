import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { socket, connectSocket, emitWithAck } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { useBackroomsVoice, applyBackroomsSpatial, leaveBackroomsVoice } from '@/hooks/useBackroomsVoice';
import { BackroomsEngine, type HudState, type RemotePlayerState } from './engine';

// ── Backrooms (Phase 2) — 3D liminal world with multiplayer presence ───
// Flow: instance lobby → shared 3D world. Each instance has a numeric seed so
// every player in it sees the same procedural maze. Remote players are pushed
// straight into the engine (no React state) for smooth 60fps rendering.

const JOY_R = 56;

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
  const [rows, setRows] = useState<InstanceRow[] | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    connectSocket();
    emitWithAck<void, { ok: boolean; data?: InstanceRow[] }>('backrooms:list')
      .then(r => { if (r.ok && r.data) setRows(r.data); else setErr('სია ვერ ჩაიტვირთა'); })
      .catch(() => setErr('კავშირი ვერ დამყარდა'));
  }, []);
  useEffect(() => { load(); }, [load]);

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'radial-gradient(ellipse at center, #14100a 0%, #050403 100%)', display: 'flex', flexDirection: 'column', padding: '0 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 'max(18px, env(safe-area-inset-top))', paddingBottom: 10 }}>
        <span style={{ fontSize: 24 }}>🟨</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 700, fontSize: 17, letterSpacing: 2, color: '#f5de80' }}>BACKROOMS</div>
          <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: 'rgba(245,222,128,0.4)' }}>აირჩიე ინსტანსი · ვინც ერთ ინსტანსშია ერთმანეთს ხედავს</div>
        </div>
        <button onClick={onClose} style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(10,8,4,0.6)', border: '1px solid rgba(255,240,180,0.2)', color: 'rgba(255,245,210,0.85)', fontSize: 17 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
        {err && <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#ff5540', textAlign: 'center', marginTop: 30 }}>{err}</p>}
        {!rows && !err && <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,245,210,0.4)', textAlign: 'center', marginTop: 30, letterSpacing: 2 }}>ჩატვირთვა…</p>}
        {rows?.map(r => {
          const full = r.count >= r.maxPlayers;
          return (
            <button key={r.id} disabled={full}
              onClick={() => onJoin(r.id, useAuthStore.getState().profile?.username ?? 'Lost')}
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
                  👤 {r.count}/{r.maxPlayers} {full ? '· სავსე' : r.count > 0 ? '· აქტიური' : '· ცარიელი'}
                </div>
              </div>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#f5de80', border: '1px solid rgba(255,214,90,0.4)', borderRadius: 8, padding: '6px 10px' }}>
                {full ? '—' : 'შესვლა'}
              </span>
            </button>
          );
        })}
        <button onClick={load} style={{ display: 'block', margin: '6px auto', fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,245,210,0.4)', background: 'transparent', border: 'none' }}>↻ განახლება</button>
      </div>
    </div>,
    document.body,
  );
}

// ── World ───────────────────────────────────────────────────────────────
function World({ instanceId, onExit, onClose }: { instanceId: string; onExit: () => void; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<BackroomsEngine | null>(null);
  const [hud, setHud] = useState<HudState>({ battery: 1, flashlightOn: true, level: 'LEVEL 0', x: 0, z: 0, event: null });
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
    const onEvent = (ev: { kind: string; duration?: number; sound?: string; x?: number; z?: number }) => {
      engineRef.current?.triggerEvent(ev);
    };
    socket.on('backrooms:player-joined', onJoined);
    socket.on('backrooms:player-left', onLeft);
    socket.on('backrooms:player-moved', onMoved);
    socket.on('backrooms:event', onEvent);

    emitWithAck<{ instanceId: string; name: string }, { ok: boolean; data?: JoinData; error?: string }>(
      'backrooms:join', { instanceId, name: useAuthStore.getState().profile?.username ?? 'Lost' },
    ).then(res => {
      if (cancelled) return;
      if (!res.ok || !res.data) { setErrMsg(res.error ?? 'ვერ შეხვედი'); setStatus('error'); return; }
      mySocketId.current = res.data.mySocketId;
      players.current = new Map(res.data.players.map(p => [p.socketId, p]));

      // Create the engine now that we know the world seed.
      if (canvasRef.current && !engineRef.current) {
        const eng = new BackroomsEngine(canvasRef.current, res.data.seed);
        engineRef.current = eng;
        eng.onHud = setHud;
        eng.resize();
        eng.start();
        pushRemotes();
      }
      setStatus('in');
    }).catch(() => { if (!cancelled) { setErrMsg('კავშირი გაწყდა'); setStatus('error'); } });

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

    const onResize = () => engineRef.current?.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

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
      leaveBackroomsVoice();
      socket.emit('backrooms:leave');
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
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
      }
    }, 33);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); clearInterval(iv); };
  }, []);

  // Reflect who's talking onto the remote avatars' head-lamps.
  useEffect(() => { engineRef.current?.setSpeaking(voice.speakingIds); }, [voice.speakingIds]);

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

  const remoteCount = Math.max(0, players.current.size - (mySocketId.current ? 1 : 0));

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#000', overflow: 'hidden', touchAction: 'none' }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)' }} />

      {/* Blackout: heavy dark + faint red emergency wash. Flicker: subtle wash. */}
      {hud.event === 'blackout' && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, rgba(40,0,0,0.25) 0%, rgba(0,0,0,0.78) 100%)', animation: 'vm-br-emergency 2.4s ease-in-out infinite' }} />
      )}
      {hud.event === 'flicker' && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'rgba(0,0,0,0.18)' }} />
      )}
      {hud.event === 'blackout' && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none', fontFamily: 'monospace', fontSize: 11, letterSpacing: 4, color: 'rgba(255,80,60,0.5)' }}>
          ⚠ საგანგებო განათება
        </div>
      )}

      {/* Joining / error overlays */}
      {status !== 'in' && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,2,1,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 13, letterSpacing: 3, color: 'rgba(245,222,128,0.7)' }}>
            {status === 'joining' ? 'ბექრუმსში შესვლა…' : (errMsg || 'შეცდომა')}
          </div>
          {status === 'error' && (
            <button data-hud-btn onClick={onExit} style={{ fontFamily: 'monospace', fontSize: 12, color: '#f5de80', background: 'rgba(255,214,90,0.1)', border: '1px solid rgba(255,214,90,0.4)', borderRadius: 10, padding: '8px 16px' }}>← უკან</button>
          )}
        </div>
      )}

      {/* Top-left: level + battery + presence */}
      <div style={{ position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', left: 16, pointerEvents: 'none' }}>
        <div style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 700, fontSize: 13, letterSpacing: 3, color: 'rgba(255,245,210,0.8)' }}>{hud.level}</div>
        <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: 'rgba(255,245,210,0.35)', marginTop: 2 }}>👤 {remoteCount + 1} · THE BACKROOMS</div>
        <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 1, marginTop: 3, color: voice.error ? '#ff8a70' : voice.joined ? (voice.muted ? 'rgba(255,245,210,0.4)' : '#8effc0') : 'rgba(245,222,128,0.55)' }}>
          {voice.error ? '🎙️ ' + voice.error : voice.joined ? (voice.muted ? '🔇 გაჩუმებული' : '🎙️ ლაპარაკობ · სივრცული ხმა') : '🎙️ დააჭირე მიკროფონს რომ ილაპარაკო'}
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
        <button data-hud-btn onClick={onExit} title="ინსტანსები" style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(10,8,4,0.55)', border: '1px solid rgba(255,240,180,0.2)', color: 'rgba(255,245,210,0.85)', fontSize: 15, backdropFilter: 'blur(4px)' }}>🚪</button>
        <button data-hud-btn onClick={onClose} style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(10,8,4,0.55)', border: '1px solid rgba(255,240,180,0.2)', color: 'rgba(255,245,210,0.85)', fontSize: 18, backdropFilter: 'blur(4px)' }}>✕</button>
      </div>

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
      </div>

      <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,245,210,0.25)', letterSpacing: 1, whiteSpace: 'nowrap' }}>
        WASD · მაუსით მოხედვა · SHIFT სირბილი · SPACE ხტომა · F ფანარი
      </div>
    </div>,
    document.body,
  );
}
