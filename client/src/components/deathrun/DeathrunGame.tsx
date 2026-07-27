// ── Deathrun — room + HUD ─────────────────────────────────────────────
// Lobby, then a first-person canvas with the speedometer that every bhop
// player actually plays by. Touch controls: left half is the movement stick,
// right half looks, and the action buttons sit under the right thumb.
import { useCallback, useEffect, useRef, useState } from 'react';
import { socket, emitWithAck } from '@/lib/socket';
import { DeathrunEngine, type DrHud } from './engine';
import { temple } from './maps/temple';
import { CS } from './physics';

interface DrPlayerView {
  userId: string; nickname: string; seat: number; connected: boolean;
  role: 'runner' | 'death'; alive: boolean; finished: boolean; hp: number;
  best: number | null; wins: number; escapes: number; kills: number;
}
interface DrStateView {
  id: string; code: string; status: 'waiting' | 'countdown' | 'running' | 'duel' | 'over';
  hostId: string; map: string; round: number; phaseEndsAt: number; startedAt: number;
  trapFired: Record<string, number>; trapCooldown: Record<string, number>;
  duellists: string[]; lastWinner: string | null; maxPlayers: number;
  log: { id: string; text: string; at: number }[];
  players: DrPlayerView[];
}
interface RoomItem { id: string; code: string; status: string; players: number; maxPlayers: number; host: string; map: string }

const JOY_R = 62;
const ok = <T,>(r: any): T => { if (r?.ok === false || r?.error) throw new Error(r.error ?? 'შეცდომა'); return (r?.data ?? r) as T; };

export default function DeathrunGame({ nickname, onClose }: { nickname: string; onClose: () => void }) {
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [state, setState] = useState<DrStateView | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState<DrHud>({ speed: 0, onGround: true, progress: 0, alive: true, finished: false, role: 'runner', nearTrap: null, trapReady: true, target: null, hp: 3 });
  const [joy, setJoy] = useState({ active: false, ox: 0, oy: 0, kx: 0, ky: 0 });
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DeathrunEngine | null>(null);
  const stateRef = useRef<DrStateView | null>(null);
  const meRef = useRef<string>('');
  const moveTouch = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const lookTouch = useRef<{ id: number; x: number; y: number } | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const lastSwing = useRef(0);
  const diedRef = useRef(false);

  const matchId = state?.id ?? null;
  const me = state?.players.find(p => p.userId === meRef.current) ?? null;
  const isHost = !!state && state.hostId === meRef.current;
  const phaseLeft = state?.phaseEndsAt ? Math.max(0, state.phaseEndsAt - now) : 0;

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);

  const showToast = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 2200); }, []);

  // ── lobby list ──
  const refresh = useCallback(() => {
    emitWithAck<undefined, any>('deathrun:list').then(r => setRooms(ok<RoomItem[]>(r))).catch(() => {});
  }, []);
  useEffect(() => {
    if (state) return;
    refresh();
    const t = setInterval(refresh, 4000);
    const onList = (l: RoomItem[]) => setRooms(l);
    socket.on('deathrun:list_update' as any, onList);
    return () => { clearInterval(t); socket.off('deathrun:list_update' as any, onList); };
  }, [state, refresh]);

  // ── socket wiring ──
  useEffect(() => {
    const onState = (s: DrStateView) => { setState(s); if (!meRef.current) meRef.current = ''; };
    const onMoved = (d: { userId: string; x: number; y: number; z: number; ry: number }) => {
      const eng = engineRef.current, st = stateRef.current;
      if (!eng || !st) return;
      const p = st.players.find(v => v.userId === d.userId);
      if (!p) return;
      eng.upsertRemote(d.userId, { x: d.x, y: d.y, z: d.z, ry: d.ry, name: p.nickname, death: p.role === 'death', alive: p.alive });
    };
    const onTrap = (d: { trapId: string; at: number }) => {
      engineRef.current?.fireTrap(d.trapId, Date.now() - d.at);
    };
    const onSwung = (d: { userId: string }) => engineRef.current?.playSwing(d.userId);
    const onHit = (d: { by: string; victim: string; hp: number; dead: boolean }) => {
      if (d.victim === meRef.current) {
        engineRef.current?.setHp(d.hp);
        if (d.dead) { engineRef.current?.setAlive(false); showToast('დაგამარცხეს'); }
        else showToast(`დარტყმა · ${d.hp} სიცოცხლე`);
      }
    };
    socket.on('deathrun:state' as any, onState);
    socket.on('deathrun:moved' as any, onMoved);
    socket.on('deathrun:trap_fired' as any, onTrap);
    socket.on('deathrun:swung' as any, onSwung);
    socket.on('deathrun:hit_landed' as any, onHit);
    return () => {
      socket.off('deathrun:state' as any, onState);
      socket.off('deathrun:moved' as any, onMoved);
      socket.off('deathrun:trap_fired' as any, onTrap);
      socket.off('deathrun:swung' as any, onSwung);
      socket.off('deathrun:hit_landed' as any, onHit);
    };
  }, [showToast]);

  // ── engine lifecycle ──
  useEffect(() => {
    if (!matchId || !canvasRef.current) return;
    const eng = new DeathrunEngine(canvasRef.current, temple);
    engineRef.current = eng;
    eng.onHud = setHud;
    eng.onDie = (cause) => {
      if (diedRef.current) return;
      diedRef.current = true;
      socket.emit('deathrun:died' as any, { matchId, cause });
      showToast(cause === 'fall' ? 'ჩავარდი' : cause === 'lava' ? 'ლავა' : 'ხაფანგი');
    };
    eng.onFinish = () => {
      emitWithAck<any, any>('deathrun:finish', { matchId })
        .then(r => { const d = ok<{ time: number | null }>(r); if (d.time) showToast(`გავიდა · ${(d.time / 1000).toFixed(1)}წმ`); })
        .catch(() => {});
    };
    const onResize = () => eng.resize();
    window.addEventListener('resize', onResize);

    const send = setInterval(() => {
      const p = eng.getPos();
      socket.emit('deathrun:move' as any, { matchId, x: p.x, y: p.y, z: p.z, ry: eng.getYaw() });
    }, 60);

    return () => {
      clearInterval(send);
      window.removeEventListener('resize', onResize);
      eng.dispose();
      engineRef.current = null;
    };
  }, [matchId, showToast]);

  // ── keyboard ──
  useEffect(() => {
    if (!matchId) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') e.preventDefault();
      keys.current[e.code] = true;
      if (e.code === 'KeyE') doAction();
      if (e.code === 'Escape') onClose();
    };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement === canvasRef.current) engineRef.current?.addLook(e.movementX, e.movementY);
    };
    const click = () => {
      if (document.pointerLockElement !== canvasRef.current) canvasRef.current?.requestPointerLock?.();
      else doSwing();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('mousemove', move);
    canvasRef.current?.addEventListener('mousedown', click);
    const tick = setInterval(() => {
      const eng = engineRef.current; if (!eng) return;
      const k = keys.current;
      if (moveTouch.current) return;                  // touch stick owns the input
      eng.input.fwd = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0);
      eng.input.side = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
      eng.input.jump = !!k['Space'];
      eng.input.duck = !!(k['ShiftLeft'] || k['ControlLeft']);
    }, 16);
    const cv = canvasRef.current;
    return () => {
      clearInterval(tick);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('mousemove', move);
      cv?.removeEventListener('mousedown', click);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // ── phase reactions: spawn, gate, sword ──
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng || !state || !me) return;
    eng.setRole(me.role);
    eng.setHp(me.hp);
    eng.setTrapCooldowns(state.trapCooldown);
    eng.swordVisible = state.status === 'duel' && state.duellists.includes(me.userId);

    if (state.status === 'countdown') {
      diedRef.current = false;
      eng.setGateOpen(false);
      if (me.role === 'death') eng.spawnAt(temple.deathSpawn, -Math.PI / 2);
      else eng.spawnAt(temple.runnerSpawns[me.seat % temple.runnerSpawns.length], -Math.PI / 2);
      eng.setAlive(true);
    } else if (state.status === 'running') {
      eng.setGateOpen(true);
    } else if (state.status === 'duel') {
      diedRef.current = false;
      eng.setGateOpen(true);
      if (state.duellists.includes(me.userId)) {
        const isDeath = me.role === 'death';
        eng.spawnAt(isDeath ? temple.duel.spawnB : temple.duel.spawnA, isDeath ? Math.PI / 2 : -Math.PI / 2);
        eng.setAlive(true);
      }
    }
    // replay any trap that is still mid-animation for a late joiner
    for (const [id, at] of Object.entries(state.trapFired)) {
      const age = Date.now() - at;
      const trap = temple.traps.find(t => t.id === id);
      if (trap && age < trap.duration * 1000) eng.fireTrap(id, age);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status, state?.round, me?.role, me?.hp]);

  // ── actions ──
  const doAction = useCallback(() => {
    const eng = engineRef.current, st = stateRef.current;
    if (!eng || !st) return;
    const trap = eng.pressTrap();
    if (trap) {
      emitWithAck<any, any>('deathrun:trap', { matchId: st.id, trapId: trap.id, cooldown: trap.cooldown * 1000 })
        .then(r => ok(r))
        .catch(e => showToast(e.message));
    }
  }, [showToast]);

  const doSwing = useCallback(() => {
    const eng = engineRef.current, st = stateRef.current;
    if (!eng || !st || st.status !== 'duel') return;
    const t = Date.now();
    if (t - lastSwing.current < 650) return;
    lastSwing.current = t;
    eng.playSwing();
    socket.emit('deathrun:swing' as any, { matchId: st.id });
    const victim = eng.swingTarget();
    if (victim) emitWithAck<any, any>('deathrun:hit', { matchId: st.id, victimId: victim }).catch(() => {});
  }, []);

  // ── touch ──
  const isCtl = (t: EventTarget | null) => t instanceof HTMLElement && t.closest('[data-hud]') != null;
  const onTouchStart = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (isCtl(t.target)) continue;
      if (t.clientX < window.innerWidth * 0.45 && !moveTouch.current) {
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
      const m = moveTouch.current;
      if (m && t.identifier === m.id) {
        let dx = t.clientX - m.ox, dy = t.clientY - m.oy;
        const mag = Math.hypot(dx, dy);
        if (mag > JOY_R) { dx = dx / mag * JOY_R; dy = dy / mag * JOY_R; }
        setJoy({ active: true, ox: m.ox, oy: m.oy, kx: dx, ky: dy });
        eng.input.side = dx / JOY_R;
        eng.input.fwd = -dy / JOY_R;
      }
      const l = lookTouch.current;
      if (l && t.identifier === l.id) {
        eng.addLook(t.clientX - l.x, t.clientY - l.y);
        l.x = t.clientX; l.y = t.clientY;
      }
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const eng = engineRef.current;
    for (const t of Array.from(e.changedTouches)) {
      if (moveTouch.current?.id === t.identifier) {
        moveTouch.current = null;
        setJoy({ active: false, ox: 0, oy: 0, kx: 0, ky: 0 });
        if (eng) { eng.input.fwd = 0; eng.input.side = 0; }
      }
      if (lookTouch.current?.id === t.identifier) lookTouch.current = null;
    }
  };

  // ── lobby actions ──
  const create = async () => {
    try { setState(ok<DrStateView>(await emitWithAck('deathrun:create', { nickname, maxPlayers: 10 }))); }
    catch (e: any) { setError(e.message); }
  };
  const join = async (arg: { code?: string; matchId?: string }) => {
    try { setState(ok<DrStateView>(await emitWithAck('deathrun:join', { ...arg, nickname }))); }
    catch (e: any) { setError(e.message); }
  };
  const start = async () => {
    try { await emitWithAck('deathrun:start', { matchId }); } catch (e: any) { showToast(e.message); }
  };
  const leave = () => { if (matchId) socket.emit('deathrun:leave' as any, { matchId }); setState(null); onClose(); };

  // identify myself from the first state we get (the server keys on profile id,
  // which the client doesn't know — the host of a freshly created room is us)
  useEffect(() => {
    if (!state || meRef.current) return;
    const mine = state.players.find(p => p.nickname === nickname);
    meRef.current = mine?.userId ?? state.hostId;
  }, [state, nickname]);

  // ── render ──
  if (!state) {
    return (
      <div style={S.wrap}>
        <div style={S.lobby}>
          <div style={S.title}>DEATHRUN <span style={{ color: '#ff6b4a' }}>· ბჰოპი</span></div>
          <div style={S.sub}>10 ხაფანგი · ბჰოპ სექცია · ხმალაობა ფინალში</div>
          {error && <div style={S.err}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button style={S.btnMain} onClick={create}>ოთახის შექმნა</button>
            <button style={S.btnGhost} onClick={onClose}>დახურვა</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="კოდი" maxLength={6} style={S.input} />
            <button style={S.btnGhost} onClick={() => join({ code })}>შესვლა</button>
          </div>
          <div style={{ marginTop: 18, fontSize: 12, color: '#8b93a7', letterSpacing: 1 }}>ღია ოთახები</div>
          <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 6 }}>
            {rooms.length === 0 && <div style={{ color: '#6b7280', fontSize: 13, padding: '10px 0' }}>ჯერ არცერთი</div>}
            {rooms.map(r => (
              <button key={r.id} style={S.roomRow} onClick={() => join({ matchId: r.id })}>
                <span style={{ fontFamily: 'monospace', color: '#ff6b4a', fontWeight: 700 }}>{r.code}</span>
                <span style={{ flex: 1, textAlign: 'left', marginLeft: 10 }}>{r.host}</span>
                <span style={{ color: '#8b93a7' }}>{r.players}/{r.maxPlayers}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const inLobby = state.status === 'waiting' || state.status === 'over';
  const spd = Math.round(hud.speed);
  const spdColor = spd > 500 ? '#ff3b6a' : spd > 380 ? '#ffb020' : spd > 260 ? '#7ee787' : '#c9d1d9';

  return (
    <div style={S.wrap} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />

      {/* speedometer — the number bhop is actually played by */}
      {!inLobby && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 92, textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ fontFamily: '"Space Grotesk",monospace', fontSize: 46, fontWeight: 800, color: spdColor, textShadow: '0 2px 12px rgba(0,0,0,.7)', lineHeight: 1 }}>{spd}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 3, color: 'rgba(255,255,255,.55)' }}>U/S{hud.onGround ? '' : ' · AIR'}</div>
        </div>
      )}

      {/* crosshair */}
      {!inLobby && <div style={{ position: 'absolute', left: '50%', top: '50%', width: 4, height: 4, marginLeft: -2, marginTop: -2, borderRadius: '50%', background: hud.target ? '#ff3b6a' : 'rgba(255,255,255,.7)', pointerEvents: 'none' }} />}

      {/* top bar */}
      <div style={S.top}>
        <button data-hud style={S.chip} onClick={leave}>✕</button>
        <div style={{ ...S.chip, color: me?.role === 'death' ? '#ff6b4a' : '#7ee787' }}>
          {me?.role === 'death' ? '☠️ სიკვდილი' : '🏃 მორბენალი'}
        </div>
        <div style={S.chip}>რაუნდი {state.round}</div>
        {phaseLeft > 0 && <div style={S.chip}>{Math.ceil(phaseLeft / 1000)}წმ</div>}
        <div style={{ ...S.chip, fontFamily: 'monospace' }}>{state.code}</div>
      </div>

      {/* progress along the course */}
      {state.status === 'running' && (
        <div style={{ position: 'absolute', left: 16, right: 16, top: 56, height: 4, borderRadius: 3, background: 'rgba(255,255,255,.14)', pointerEvents: 'none' }}>
          <div style={{ width: `${hud.progress * 100}%`, height: '100%', borderRadius: 3, background: 'linear-gradient(90deg,#7ee787,#ffb020,#ff3b6a)' }} />
        </div>
      )}

      {/* duel health */}
      {state.status === 'duel' && me && state.duellists.includes(me.userId) && (
        <div style={{ position: 'absolute', left: 16, bottom: 24, display: 'flex', gap: 6, pointerEvents: 'none' }}>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} style={{ width: 26, height: 8, borderRadius: 4, background: i < hud.hp ? '#ff3b6a' : 'rgba(255,255,255,.16)' }} />
          ))}
        </div>
      )}

      {/* lobby / scoreboard overlay */}
      {inLobby && (
        <div style={S.overlay}>
          <div style={S.panel}>
            <div style={S.title}>{state.status === 'over' ? (state.lastWinner === 'death' ? '☠️ სიკვდილმა მოიგო' : '🏃 მორბენლებმა მოიგეს') : 'ოთახი'}</div>
            <div style={S.sub}>კოდი <b style={{ color: '#ff6b4a', fontFamily: 'monospace' }}>{state.code}</b> · {state.players.length}/{state.maxPlayers}</div>
            <div style={{ maxHeight: 230, overflowY: 'auto', marginTop: 12 }}>
              {[...state.players].sort((a, b) => b.wins - a.wins).map(p => (
                <div key={p.userId} style={S.row}>
                  <span style={{ opacity: p.connected ? 1 : 0.4, flex: 1, textAlign: 'left' }}>
                    {p.role === 'death' ? '☠️ ' : ''}{p.nickname}{p.userId === state.hostId ? ' 👑' : ''}
                  </span>
                  <span style={{ color: '#8b93a7', fontSize: 12, fontFamily: 'monospace' }}>
                    {p.wins}🏆 {p.escapes}🏁 {p.kills}⚔️ {p.best ? `${(p.best / 1000).toFixed(1)}წმ` : '—'}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {isHost
                ? <button style={S.btnMain} onClick={start}>{state.round ? 'შემდეგი რაუნდი' : 'დაწყება'}</button>
                : <div style={{ ...S.btnGhost, opacity: 0.6 }}>ველოდებით ჰოსტს…</div>}
              <button style={S.btnGhost} onClick={leave}>გასვლა</button>
            </div>
            {state.players.filter(p => p.connected).length < 2 && <div style={{ ...S.sub, marginTop: 8 }}>საჭიროა მინიმუმ 2 მოთამაშე</div>}
          </div>
        </div>
      )}

      {/* countdown */}
      {state.status === 'countdown' && (
        <div style={{ ...S.overlay, background: 'rgba(6,4,12,.35)', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 88, fontWeight: 900, color: '#fff', textShadow: '0 4px 24px rgba(0,0,0,.7)' }}>{Math.ceil(phaseLeft / 1000)}</div>
            <div style={{ color: '#e9d5ff', letterSpacing: 3, fontFamily: 'monospace' }}>
              {me?.role === 'death' ? 'ხაფანგებთან მიდი' : 'მოემზადე'}
            </div>
          </div>
        </div>
      )}

      {/* dead banner */}
      {!hud.alive && !inLobby && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '38%', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#ff3b6a', textShadow: '0 2px 14px rgba(0,0,0,.8)' }}>დაიღუპე</div>
          <div style={{ color: 'rgba(255,255,255,.6)', fontFamily: 'monospace', fontSize: 12, letterSpacing: 2 }}>უყურე დანარჩენებს</div>
        </div>
      )}

      {toast && <div style={S.toast}>{toast}</div>}

      {/* touch stick */}
      {joy.active && (
        <>
          <div style={{ position: 'absolute', left: joy.ox - JOY_R, top: joy.oy - JOY_R, width: JOY_R * 2, height: JOY_R * 2, borderRadius: '50%', border: '2px solid rgba(255,107,74,.3)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: joy.ox + joy.kx - 26, top: joy.oy + joy.ky - 26, width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,107,74,.3)', border: '1px solid rgba(255,107,74,.6)', pointerEvents: 'none' }} />
        </>
      )}

      {/* action buttons */}
      {!inLobby && (
        <div style={{ position: 'absolute', right: 20, bottom: 'max(28px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          {hud.role === 'death' && hud.nearTrap && (
            <button data-hud onPointerDown={e => { e.preventDefault(); doAction(); }}
              style={{ ...S.round(78), background: hud.trapReady ? 'linear-gradient(135deg,#ff3b6a,#8b1a1a)' : 'rgba(60,40,40,.6)', fontSize: 13, lineHeight: 1.2 }}>
              <div style={{ fontSize: 24 }}>{hud.nearTrap.icon}</div>{hud.nearTrap.name}
            </button>
          )}
          {state.status === 'duel' && (
            <button data-hud onPointerDown={e => { e.preventDefault(); doSwing(); }} style={{ ...S.round(72), background: 'linear-gradient(135deg,#c9a227,#8b6b14)' }}>⚔️</button>
          )}
          <button data-hud
            onPointerDown={e => { e.preventDefault(); if (engineRef.current) engineRef.current.input.duck = true; }}
            onPointerUp={() => { if (engineRef.current) engineRef.current.input.duck = false; }}
            onPointerLeave={() => { if (engineRef.current) engineRef.current.input.duck = false; }}
            style={S.round(58)}>⤓</button>
          {/* HOLD to auto-hop — timing a jump frame-perfectly is impossible on glass */}
          <button data-hud
            onPointerDown={e => { e.preventDefault(); if (engineRef.current) engineRef.current.input.jump = true; }}
            onPointerUp={() => { if (engineRef.current) engineRef.current.input.jump = false; }}
            onPointerLeave={() => { if (engineRef.current) engineRef.current.input.jump = false; }}
            style={{ ...S.round(78), background: 'linear-gradient(135deg,#7c3aed,#c026d3)' }}>⤴</button>
        </div>
      )}

      {/* desktop hint */}
      {!inLobby && (
        <div style={{ position: 'absolute', left: 16, bottom: 24, fontFamily: 'monospace', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,.34)', pointerEvents: 'none' }}>
          WASD · SPACE (გეჭიროს) · E · კლიკი = ხმალი
        </div>
      )}
    </div>
  );
}

const S: Record<string, any> = {
  wrap: { position: 'fixed', inset: 0, background: '#0b0810', zIndex: 60, overflow: 'hidden', userSelect: 'none', touchAction: 'none' },
  lobby: { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(420px,92vw)', background: 'rgba(14,11,22,.94)', border: '1px solid rgba(255,107,74,.28)', borderRadius: 18, padding: 20 },
  overlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(6,4,12,.72)', backdropFilter: 'blur(6px)' },
  panel: { width: 'min(430px,92vw)', background: 'rgba(14,11,22,.96)', border: '1px solid rgba(255,107,74,.28)', borderRadius: 18, padding: 20 },
  title: { fontFamily: '"Space Grotesk",monospace', fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: 1 },
  sub: { fontSize: 12.5, color: '#8b93a7', marginTop: 4 },
  err: { marginTop: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,59,106,.14)', color: '#ff8fa6', fontSize: 13 },
  input: { flex: 1, minWidth: 0, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, color: '#fff', padding: '10px 12px', fontFamily: 'monospace', fontSize: 16, letterSpacing: 3, textAlign: 'center' },
  btnMain: { flex: 1, padding: '12px 14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#ff6b4a,#c026d3)', color: '#fff', fontWeight: 700, fontSize: 15 },
  btnGhost: { padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.05)', color: '#e9d5ff', fontSize: 14, textAlign: 'center' },
  roomRow: { display: 'flex', alignItems: 'center', width: '100%', padding: '10px 12px', marginTop: 6, borderRadius: 12, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)', color: '#e9d5ff', fontSize: 14 },
  row: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 10, background: 'rgba(255,255,255,.04)', marginTop: 5, color: '#e9d5ff', fontSize: 14 },
  top: { position: 'absolute', left: 12, right: 12, top: 'max(12px, env(safe-area-inset-top))', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  chip: { padding: '5px 10px', borderRadius: 20, background: 'rgba(12,10,24,.62)', border: '1px solid rgba(255,255,255,.12)', color: '#e9d5ff', fontSize: 12, backdropFilter: 'blur(6px)' },
  toast: { position: 'absolute', left: '50%', top: '22%', transform: 'translateX(-50%)', padding: '9px 16px', borderRadius: 14, background: 'rgba(12,10,24,.86)', border: '1px solid rgba(255,107,74,.4)', color: '#fff', fontSize: 14, pointerEvents: 'none' },
  round: (n: number) => ({ width: n, height: n, borderRadius: '50%', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(20,16,32,.7)', color: '#fff', fontSize: 24, backdropFilter: 'blur(6px)', touchAction: 'none' }),
};

export { CS };
