import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { socket, connectSocket, emitWithAck } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { useWorldVoice, applyWorldSpatial, leaveWorldVoice } from '@/hooks/useWorldVoice';
import { WorldEngine, type WorldHud, type RemoteWorldPlayer } from './engine';
import { WorldCinema, ytVideoId, type TVState } from './cinema';
import { PREMIUM_WORLDS, getWorld } from './registry';
import { loadSpec, defaultSpec, type CharacterSpec } from '../character/spec';

// ── Premium Worlds — full-screen overlay (lobby → 3D world) ────────────
// Lazy-loaded from App so Three.js + world code stay out of the main bundle.
// Classic 2D Virtual Spaces are untouched; this is an entirely separate path.

const JOY_R = 58;

function readSpec(): CharacterSpec {
  return loadSpec() ?? defaultSpec('male');
}

// Downscale a captured PNG data URL to a story-sized JPEG (under the server cap).
function resizeDataUrl(dataUrl: string, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > h) { if (w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; } }
      else { if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; } }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('bad image'));
    img.src = dataUrl;
  });
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

export default function PremiumWorlds({ onClose, initialWorldId }: { onClose: () => void; initialWorldId?: string | null }) {
  const [worldId, setWorldId] = useState<string | null>(initialWorldId ?? null);
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
  const cinemaBoxRef = useRef<HTMLDivElement>(null);
  const cinemaRef = useRef<WorldCinema | null>(null);
  const [hud, setHud] = useState<WorldHud>({ world: '', sitting: false, canInteract: null, players: 1, nearScreen: false });
  const [tvPanel, setTvPanel] = useState(false);
  const [tvOn, setTvOn] = useState(false);
  const [tvQuery, setTvQuery] = useState('');
  const [tvResults, setTvResults] = useState<{ videoId: string; title: string; author: string }[]>([]);
  const [tvBusy, setTvBusy] = useState(false);
  const [tvFocused, setTvFocused] = useState(false);
  const [invitePanel, setInvitePanel] = useState(false);
  const [duel, setDuel] = useState<null | { phase: 'arming' | 'go' | 'result'; iAmIn: boolean; won?: boolean; reaction?: number; falseStart?: boolean }>(null);
  const [friends, setFriends] = useState<{ profileId: string; username: string; avatarUrl: string | null }[] | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [photo, setPhoto] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [photoShared, setPhotoShared] = useState<'' | 'sending' | 'done'>('');
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
  const [fadeIn, setFadeIn] = useState(true);
  const [help, setHelp] = useState(false);
  const [quality, setQuality] = useState<{ mode: 'auto' | 'high' | 'low'; shadows: boolean }>(() => {
    try { const q = JSON.parse(localStorage.getItem('vw_quality') ?? ''); if (q && q.mode) return q; } catch { /* default */ }
    return { mode: 'auto', shadows: true };
  });

  const [micDismissed, setMicDismissed] = useState(false);
  const [chat, setChat] = useState<{ id: string; socketId: string; name: string; text: string; at: number }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const chatSeq = useRef(0);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const [kbInset, setKbInset] = useState(0);

  // Track the on-screen keyboard height so the bottom chat bar can float above
  // it (otherwise the keyboard hides what you're typing).
  useEffect(() => {
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    if (!vv) return;
    const onVV = () => setKbInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener('resize', onVV); vv.addEventListener('scroll', onVV); onVV();
    return () => { vv.removeEventListener('resize', onVV); vv.removeEventListener('scroll', onVV); };
  }, []);

  const sendChat = useCallback(() => {
    const text = chatInput.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!text) return;
    if (socket.connected) socket.emit('world:chat', { text });
    setChatInput('');
  }, [chatInput]);

  const duelTap = useCallback(() => { if (socket.connected) socket.emit('world:duel-tap'); }, []);

  const poke = useCallback(() => {
    setUiVisible(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => { setUiVisible(false); setEmoteOpen(false); }, 4000);
  }, []);

  // Auto-activate the mic on entry so newcomers can immediately hear + be
  // heard. If the browser needs a permission gesture this quietly no-ops and
  // the prominent prompt below invites a tap. Runs once.
  useEffect(() => {
    const t = setTimeout(() => voice.joinVoice(), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const def = getWorld(worldId);
    if (!def || def.status !== 'live') { onExit(); return; }
    enterImmersive(); // covers the invite path that skips the lobby
    const mySpec = readSpec();
    const eng = new WorldEngine(canvasRef.current, def, mySpec);
    engineRef.current = eng;
    eng.onHud = setHud;
    eng.setQuality(quality.mode);
    eng.setShadows(quality.shadows);
    eng.resize();
    eng.start();
    poke();
    requestAnimationFrame(() => setFadeIn(false)); // smooth fade-in from black

    // ── cinema (shared YouTube on the 3D screen) ──
    const cinema = cinemaBoxRef.current ? new WorldCinema(cinemaBoxRef.current) : null;
    cinemaRef.current = cinema;
    let cinemaRaf = 0;
    const layoutLoop = () => { cinemaRaf = requestAnimationFrame(layoutLoop); if (cinema && engineRef.current) cinema.layout(engineRef.current.getScreenRect()); };
    layoutLoop();
    const onTV = (tv: TVState | null) => { cinema?.setState(tv); setTvOn(!!tv); };
    socket.on('world:tv', onTV);
    let helpT: ReturnType<typeof setTimeout> | null = null;
    if (!localStorage.getItem('vw_seen_help')) {
      setHelp(true);
      try { localStorage.setItem('vw_seen_help', '1'); } catch { /* ignore */ }
      helpT = setTimeout(() => setHelp(false), 8000);
    }

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
    const onChat = (m: { socketId: string; name: string; text: string; at: number }) => {
      setChat(prev => [...prev, { ...m, id: `${m.at}-${m.socketId}-${chatSeq.current++}` }].slice(-40));
      eng.showChatBubble(m.socketId === mySocketId.current ? '__me__' : m.socketId, m.text);
    };
    const onDuel = (m: any) => {
      const me = mySocketId.current;
      if (m.phase === 'idle') { setDuel(null); return; }
      if (m.phase === 'arming') setDuel({ phase: 'arming', iAmIn: m.a === me || m.b === me });
      else if (m.phase === 'go') setDuel({ phase: 'go', iAmIn: m.a === me || m.b === me });
      else if (m.phase === 'result') setDuel({ phase: 'result', iAmIn: m.winner === me || m.loser === me, won: m.winner === me, reaction: m.reaction, falseStart: !!m.falseStart && m.loser === me });
    };
    eng.onInteract = (id) => { if (socket.connected) socket.emit('world:interact', { id }); if (id === 'dj') setTvPanel(true); };
    socket.on('world:player-joined', onJoined);
    socket.on('world:player-left', onLeft);
    socket.on('world:player-moved', onMoved);
    socket.on('world:wave', onWave);
    socket.on('world:emote', onEmote);
    socket.on('world:interact', onInteractNet);
    socket.on('world:chat', onChat);
    socket.on('world:duel', onDuel);

    emitWithAck<{ worldId: string; name: string; bodyColor: string; glowColor: string; spec: CharacterSpec }, { ok: boolean; data?: { mySocketId: string; players: RemoteWorldPlayer[]; tv?: TVState | null } }>(
      'world:join', { worldId, name: useAuthStore.getState().profile?.username ?? 'Guest', bodyColor: mySpec.topColor, glowColor: mySpec.glow, spec: mySpec },
    ).then(res => {
      if (res.ok && res.data) {
        mySocketId.current = res.data.mySocketId;
        players.current = new Map(res.data.players.map(p => [p.socketId, p]));
        pushRemotes(); syncRoster();
        if (res.data.tv) { cinema?.setState(res.data.tv); setTvOn(true); }
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
      socket.off('world:chat', onChat);
      socket.off('world:duel', onDuel);
      socket.off('world:tv', onTV);
      cancelAnimationFrame(cinemaRaf);
      cinema?.dispose();
      cinemaRef.current = null;
      clearInterval(netIv);
      leaveWorldVoice();
      socket.emit('world:leave');
      players.current.clear();
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (helpT) clearTimeout(helpT);
      try { wake?.release?.(); } catch { /* ignore */ }
      eng.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  // keyboard (desktop)
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return; // typing in chat
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
  // auto-close the emote wheel if it's left open
  useEffect(() => { if (!emoteOpen) return; const t = setTimeout(() => setEmoteOpen(false), 4500); return () => clearTimeout(t); }, [emoteOpen]);
  const showUI = uiVisible || panel != null;

  const doEmote = (kind: 'wave' | 'dance' | 'clap' | 'heart' | 'laugh' | 'disco' | 'spin') => {
    engineRef.current?.localEmote(kind);
    if (socket.connected) socket.emit('world:emote', { kind });
    setEmoteOpen(false); poke();
  };
  const tvSearch = () => {
    const q = tvQuery.trim(); if (!q || tvBusy) return;
    const vid = ytVideoId(q);
    if (vid) { socket.emit('world:tv-set', { videoId: vid, title: 'YouTube' }); setTvPanel(false); setTvQuery(''); return; }
    setTvBusy(true);
    emitWithAck<{ query: string }, { ok: boolean; data?: any }>('space:yt-search', { query: q })
      .then(r => { setTvBusy(false); setTvResults(r.ok && Array.isArray(r.data) ? r.data.slice(0, 8) : []); })
      .catch(() => { setTvBusy(false); setTvResults([]); });
  };
  const pickVideo = (videoId: string, title: string) => { socket.emit('world:tv-set', { videoId, title }); setTvPanel(false); setTvResults([]); setTvQuery(''); };
  const openInvite = () => {
    setInvitePanel(v => !v); poke();
    if (!friends) emitWithAck<void, { ok: boolean; data?: any[] }>('friend:invitable_list').then(r => setFriends(r.ok && r.data ? r.data.map((p: any) => ({ profileId: p.profileId, username: p.username, avatarUrl: p.avatarUrl ?? null })) : [])).catch(() => setFriends([]));
  };
  const inviteFriend = (pid: string) => { emitWithAck('world:invite', { targetProfileId: pid }).catch(() => {}); setInvited(s => new Set(s).add(pid)); };
  const takePhoto = () => {
    const url = engineRef.current?.capturePhoto(); if (!url) return;
    setFlash(true); setTimeout(() => setFlash(false), 180);
    setPhoto(url); setPhotoShared('');
  };
  const shareToStory = () => {
    if (!photo || photoShared) return;
    setPhotoShared('sending');
    resizeDataUrl(photo, 720).then(img =>
      emitWithAck('community:story_create', { imageUrl: img, caption: '🏝️ Beach Camp 3D', tags: [] })
        .then(() => setPhotoShared('done')).catch(() => setPhotoShared(''))
    ).catch(() => setPhotoShared(''));
  };

  const isCtl = (t: EventTarget | null) => t instanceof HTMLElement && t.closest('[data-hud]') != null;

  const onTouchStart = (e: React.TouchEvent) => {
    engineRef.current?.resumeAudio(); cinemaRef.current?.resume(); poke();
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

  const onMouseDown = (e: React.MouseEvent) => { engineRef.current?.resumeAudio(); cinemaRef.current?.resume(); poke(); if (isCtl(e.target)) return; if (e.clientX < window.innerWidth * 0.42) return; mouseLook.current = { x: e.clientX, y: e.clientY }; };
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
      {/* Cinema video — the YouTube iframe is positioned over the 3D screen */}
      <div ref={cinemaBoxRef} style={{ position: 'absolute', left: 0, top: 0, transform: 'translate(-99999px,0)', overflow: 'hidden', borderRadius: 4, background: '#000', pointerEvents: 'none', zIndex: 5 }} />

      {/* Enter fade-in from black */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: '#05060d', opacity: fadeIn ? 1 : 0, transition: 'opacity 0.7s ease' }} />

      {/* Camera flash */}
      {flash && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: '#fff', zIndex: 40 }} />}

      {/* Photo preview */}
      {photo && (
        <div data-hud style={{ position: 'absolute', inset: 0, zIndex: 45, background: 'rgba(3,2,8,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 14 }}>
          <img src={photo} alt="" style={{ maxWidth: '92%', maxHeight: '64%', borderRadius: 12, border: '2px solid rgba(192,132,252,0.5)', boxShadow: '0 12px 50px rgba(0,0,0,0.7)' }} />
          <div style={{ display: 'flex', gap: 12 }}>
            <a data-hud href={photo} download={`beachcamp-${Date.now()}.png`} style={{ padding: '11px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#e9d5ff', fontFamily: 'monospace', fontSize: 13, textDecoration: 'none' }}>📥 შენახვა</a>
            <button data-hud onPointerDown={(e) => { e.preventDefault(); shareToStory(); }} disabled={photoShared !== ''}
              style={{ padding: '11px 18px', borderRadius: 12, border: 'none', background: photoShared === 'done' ? 'rgba(46,255,140,0.25)' : 'linear-gradient(135deg,#7c3aed,#c026d3)', color: '#fff', fontFamily: 'monospace', fontSize: 13 }}>
              {photoShared === 'done' ? '✓ გაზიარდა' : photoShared === 'sending' ? '…' : '📖 სთორიში'}
            </button>
            <button data-hud onPointerDown={(e) => { e.preventDefault(); setPhoto(null); }} style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#e9d5ff', fontSize: 16 }}>✕</button>
          </div>
        </div>
      )}

      {/* First-time controls hint */}
      {help && (
        <div style={{ position: 'absolute', top: '22%', left: '50%', transform: 'translateX(-50%)', zIndex: 16, pointerEvents: 'none', width: 'min(340px, 82vw)', textAlign: 'center', background: 'rgba(12,10,24,0.82)', border: '1px solid rgba(192,132,252,0.3)', borderRadius: 14, padding: '12px 16px', fontFamily: 'monospace', fontSize: 11.5, lineHeight: 1.7, color: 'rgba(233,213,255,0.9)', backdropFilter: 'blur(8px)' }}>
          🕹 ჯოისტიკი — მოძრაობა · 👆 გადაფურცლე — კამერა<br />
          შეეხე — დაჯექი / ურთიერთქმედება · 😀 ემოცია · 🎙️ ხმა
          {window.innerHeight > window.innerWidth && <><br /><span style={{ color: '#c084fc' }}>📱↺ გადააბრუნე ჰორიზონტალურად</span></>}
        </div>
      )}

      {/* Prominent mic prompt — nags until voice is active so nobody sits in
          silence thinking the space is broken. Auto-join tries first; this is
          the tap-to-enable fallback (and covers a denied permission). */}
      {!voice.joined && !micDismissed && (
        <div data-hud onPointerDown={(e) => { e.preventDefault(); setMicDismissed(false); voice.joinVoice(); poke(); }}
          style={{ position: 'absolute', top: 'max(72px, calc(env(safe-area-inset-top) + 58px))', left: '50%', transform: 'translateX(-50%)', zIndex: 40, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 12, width: 'min(360px, 88vw)',
            background: 'linear-gradient(135deg, rgba(124,58,237,0.92), rgba(192,38,211,0.92))',
            border: '1px solid rgba(255,255,255,0.35)', borderRadius: 16, padding: '12px 16px',
            boxShadow: '0 8px 30px rgba(192,38,211,0.5)', backdropFilter: 'blur(8px)', animation: 'vwMicPulse 1.4s ease-in-out infinite' }}>
          <style>{'@keyframes vwMicPulse{0%,100%{box-shadow:0 8px 26px rgba(192,38,211,0.4)}50%{box-shadow:0 8px 40px rgba(192,38,211,0.85)}}'}</style>
          <span style={{ fontSize: 30, lineHeight: 1, flexShrink: 0 }}>🎙️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 700, fontSize: 14, color: '#fff', letterSpacing: 0.3 }}>
              {voice.status === 'failed' ? 'მიკროფონი დაბლოკილია — დართე ნებართვა' : 'გააქტიურე მიკროფონი'}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>დააჭირე რომ გაიგონო და ილაპარაკო</div>
          </div>
          <button data-hud onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setMicDismissed(true); }}
            style={{ width: 30, height: 30, flexShrink: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontSize: 13 }}>✕</button>
        </div>
      )}

      {/* Reaction-duel overlay (participants only) */}
      {duel && duel.iAmIn && (
        <div data-hud onPointerDown={duel.phase !== 'result' ? (e) => { e.preventDefault(); duelTap(); } : undefined}
          style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none',
            background: duel.phase === 'go' ? 'radial-gradient(circle, rgba(255,70,100,0.4), rgba(120,0,20,0.6))' : 'rgba(6,6,16,0.55)',
            pointerEvents: duel.phase === 'result' ? 'none' : 'auto',
            animation: duel.phase === 'go' ? 'vwDuelFlash .26s ease-in-out infinite alternate' : undefined }}>
          <style>{'@keyframes vwDuelFlash{from{filter:brightness(1)}to{filter:brightness(1.55)}}'}</style>
          <div style={{ textAlign: 'center', padding: '0 24px' }}>
            {duel.phase === 'arming' && (<>
              <div style={{ fontSize: 60 }}>⚡</div>
              <div style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 800, fontSize: 26, color: '#fff' }}>მოემზადე…</div>
              <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,220,150,0.92)', marginTop: 8 }}>ⓘ ნუ დააჭერ ⚡-მდე — თორემ წააგებ!</div>
            </>)}
            {duel.phase === 'go' && (<>
              <div style={{ fontSize: 104, lineHeight: 1 }}>⚡</div>
              <div style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 900, fontSize: 46, color: '#fff', letterSpacing: 2, textShadow: '0 0 20px #ff3b52' }}>ახლა!</div>
              <div style={{ fontFamily: 'monospace', fontSize: 14, color: '#ffe9c0', marginTop: 6 }}>დააჭირე ეკრანს!</div>
            </>)}
            {duel.phase === 'result' && (
              <div style={{ background: 'rgba(12,10,24,0.92)', border: '1px solid rgba(192,132,252,0.4)', borderRadius: 18, padding: '22px 30px', backdropFilter: 'blur(10px)' }}>
                <div style={{ fontSize: 54 }}>{duel.falseStart ? '❌' : duel.won ? '🏆' : '💥'}</div>
                <div style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 800, fontSize: 24, color: duel.won ? '#8effc0' : '#ff9aa8' }}>
                  {duel.falseStart ? 'ნაადრევი სროლა!' : duel.won ? 'გაიმარჯვე!' : 'დამარცხდი'}
                </div>
                {duel.won && duel.reaction != null && <div style={{ fontFamily: 'monospace', fontSize: 15, color: '#e9d5ff', marginTop: 6 }}>რეაქცია: {(duel.reaction / 1000).toFixed(2)}წ</div>}
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(233,213,255,0.6)', marginTop: 10 }}>ახალი რაუნდი მალე…</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', left: 14, right: 14, display: 'flex', alignItems: 'center', gap: 8, opacity: showUI ? 1 : 0, transition: 'opacity .4s', pointerEvents: showUI ? 'auto' : 'none' }}>
        <button data-hud onPointerDown={(e) => { e.preventDefault(); setPanel(p => p === 'players' ? null : 'players'); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(16,12,32,0.5)', border: '1px solid rgba(192,132,252,0.25)', borderRadius: 20, padding: '7px 14px', backdropFilter: 'blur(6px)', touchAction: 'none' }}>
          <span style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 700, fontSize: 12, letterSpacing: 1, color: '#e9d5ff' }}>{hud.world}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(233,213,255,0.6)' }}>👥 {hud.players}</span>
          {voice.joined && <span style={{ fontFamily: 'monospace', fontSize: 11, color: voice.muted ? 'rgba(233,213,255,0.4)' : '#8effc0' }}>{voice.muted ? '🔇' : '🎙️'}</span>}
        </button>
        <div style={{ flex: 1 }} />
        {roundBtn('📷', takePhoto, 40)}
        {roundBtn('✉️', openInvite, 40, invitePanel)}
        {roundBtn('⚙️', () => setPanel(p => p === 'settings' ? null : 'settings'), 40, panel === 'settings')}
        {roundBtn('🚪', onExit, 40)}
        {roundBtn('✕', onClose, 40)}
      </div>

      {/* Invite friends to this world */}
      {invitePanel && (
        <div data-hud style={{ position: 'absolute', top: 'max(62px, calc(env(safe-area-inset-top) + 50px))', right: 14, width: 'min(260px, 74vw)', maxHeight: '60vh', overflowY: 'auto', background: 'rgba(12,10,24,0.95)', border: '1px solid rgba(192,132,252,0.35)', borderRadius: 14, padding: 10, backdropFilter: 'blur(12px)', zIndex: 30 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: 'rgba(233,213,255,0.55)', margin: '2px 4px 8px' }}>✉️ მოიწვიე მეგობარი</div>
          {!friends && <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(233,213,255,0.4)', padding: 8 }}>…</div>}
          {friends && friends.length === 0 && <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(233,213,255,0.4)', padding: 8 }}>ონლაინ მეგობარი არ არის</div>}
          {friends && friends.map(f => (
            <button key={f.profileId} data-hud disabled={invited.has(f.profileId)} onPointerDown={(e) => { e.preventDefault(); inviteFriend(f.profileId); }}
              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 8px', marginBottom: 3, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e9d5ff', opacity: invited.has(f.profileId) ? 0.55 : 1 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'rgba(124,58,237,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{f.avatarUrl ? <img src={f.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🙂'}</div>
              <span style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.username}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: invited.has(f.profileId) ? '#8effc0' : '#c084fc' }}>{invited.has(f.profileId) ? '✓' : 'მოწვევა'}</span>
            </button>
          ))}
        </div>
      )}

      {/* Cinema panel — search / paste a YouTube video for everyone.
          While the input is focused it anchors to the TOP so the on-screen
          keyboard (which covers the bottom) can't hide it. */}
      {tvPanel && (
        <div data-hud style={{ position: 'absolute', ...(tvFocused ? { top: 'max(14px, env(safe-area-inset-top))' } : { bottom: 'max(100px, calc(env(safe-area-inset-bottom) + 90px))' }), left: '50%', transform: 'translateX(-50%)', width: 'min(420px, 92vw)', background: 'rgba(12,10,24,0.97)', border: '1px solid rgba(192,132,252,0.35)', borderRadius: 16, padding: 12, backdropFilter: 'blur(12px)', zIndex: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 1, color: 'rgba(233,213,255,0.6)', flex: 1 }}>📺 ჩართე ვიდეო ეკრანზე</span>
            {tvOn && <button data-hud onPointerDown={(e) => { e.preventDefault(); socket.emit('world:tv-toggle'); }} style={{ fontSize: 15, color: '#e9d5ff', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '5px 10px' }}>⏯</button>}
            {tvOn && <button data-hud onPointerDown={(e) => { e.preventDefault(); socket.emit('world:tv-stop'); }} style={{ fontSize: 13, color: '#ff8a8a', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 8, padding: '5px 10px' }}>⏹</button>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={tvQuery} onChange={e => setTvQuery(e.target.value)}
              onFocus={() => setTvFocused(true)} onBlur={() => setTvFocused(false)}
              onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); tvSearch(); } }}
              enterKeyHint="search" autoComplete="off" placeholder="YouTube ბმული ან ძებნა…"
              style={{ flex: 1, minWidth: 0, padding: '11px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', fontFamily: 'monospace', fontSize: 16, outline: 'none' }} />
            <button data-hud onPointerDown={(e) => { e.preventDefault(); tvSearch(); }} style={{ padding: '0 14px', borderRadius: 10, background: 'rgba(124,58,237,0.5)', border: 'none', color: '#fff', fontSize: 13 }}>{tvBusy ? '…' : '🔍'}</button>
          </div>
          {tvResults.length > 0 && (
            <div style={{ marginTop: 8, maxHeight: 180, overflowY: 'auto' }}>
              {tvResults.map(r => (
                <button key={r.videoId} data-hud onPointerDown={(e) => { e.preventDefault(); pickVideo(r.videoId, r.title); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: 4, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e9d5ff', fontFamily: 'monospace', fontSize: 11.5 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>▶ {r.title}</div>
                  <div style={{ color: 'rgba(233,213,255,0.4)', fontSize: 10, marginTop: 2 }}>{r.author}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Player list panel */}
      {panel === 'players' && (
        <div data-hud style={{ position: 'absolute', top: 'max(62px, calc(env(safe-area-inset-top) + 50px))', left: 14, width: 'min(260px, 70vw)', maxHeight: '62vh', overflowY: 'auto', background: 'rgba(12,10,24,0.9)', border: '1px solid rgba(192,132,252,0.3)', borderRadius: 14, padding: 10, backdropFilter: 'blur(10px)' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: 'rgba(233,213,255,0.5)', margin: '2px 4px 8px' }}>მოთამაშეები · {hud.players}</div>
          <PlayerRow name={`${useAuthStore.getState().profile?.username ?? 'შენ'} (შენ)`} color={readSpec().topColor} speaking={false} />
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

      {/* Chat log — recent messages, bottom-left, non-blocking */}
      {chat.length > 0 && (
        <div style={{ position: 'absolute', left: 14, bottom: chatOpen ? `${kbInset + 74}px` : 'max(158px, calc(env(safe-area-inset-bottom) + 146px))', width: 'min(300px, 64vw)', display: 'flex', flexDirection: 'column', gap: 5, pointerEvents: 'none', zIndex: 20, transition: 'bottom .18s' }}>
          {chat.slice(-6).map(m => (
            <div key={m.id} style={{ alignSelf: 'flex-start', maxWidth: '100%', background: 'rgba(12,10,24,0.6)', border: '1px solid rgba(192,132,252,0.2)', borderRadius: 12, padding: '5px 10px', backdropFilter: 'blur(4px)' }}>
              <span style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 700, fontSize: 11, color: m.socketId === mySocketId.current ? '#8effc0' : '#c9a6ff' }}>{m.name}: </span>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#f3e9ff', wordBreak: 'break-word' }}>{m.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Chat input bar (floats above the keyboard) */}
      {chatOpen && (
        <div data-hud style={{ position: 'absolute', left: 0, right: 0, bottom: `${kbInset + 12}px`, display: 'flex', justifyContent: 'center', padding: '0 14px', zIndex: 46, transition: 'bottom .12s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 'min(440px, 94vw)', background: 'rgba(12,10,24,0.92)', border: '1px solid rgba(192,132,252,0.4)', borderRadius: 24, padding: 6, backdropFilter: 'blur(12px)', boxShadow: '0 6px 24px rgba(0,0,0,0.4)' }}>
            <input ref={chatInputRef} value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); sendChat(); } }}
              placeholder="დაწერე შეტყობინება…" maxLength={300} enterKeyHint="send" autoComplete="off"
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#f3e9ff', fontFamily: 'monospace', fontSize: 16, padding: '8px 12px' }} />
            <button data-hud onPointerDown={e => { e.preventDefault(); sendChat(); chatInputRef.current?.focus(); }}
              style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg,#7c3aed,#c026d3)', color: '#fff', fontSize: 16 }}>➤</button>
            <button data-hud onPointerDown={e => { e.preventDefault(); setChatOpen(false); chatInputRef.current?.blur(); }}
              style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#e9d5ff', fontSize: 14 }}>✕</button>
          </div>
        </div>
      )}

      {/* Right controls */}
      <div style={{ position: 'absolute', right: 24, bottom: 'max(52px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, opacity: showUI ? 1 : 0.25, transition: 'opacity .4s' }}>
        {hud.canInteract && roundBtn(hud.sitting ? '🧍' : (hud.canInteract.includes('🔥') ? '🔥' : hud.canInteract.includes('🎆') ? '🎆' : hud.canInteract.includes('🚢') ? '🚢' : '🪑'), () => engineRef.current?.interact(), 62, true)}
        {hud.nearScreen && roundBtn('📺', () => setTvPanel(v => !v), 54, tvPanel)}
        {/* Emote wheel */}
        {emoteOpen && (
          <div data-hud style={{ position: 'absolute', right: 60, bottom: 62, display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, width: 210, background: 'rgba(12,10,24,0.75)', border: '1px solid rgba(192,132,252,0.3)', borderRadius: 22, padding: 8, backdropFilter: 'blur(8px)' }}>
            {([['👋', 'wave'], ['💃', 'dance'], ['🕺', 'disco'], ['💫', 'spin'], ['👏', 'clap'], ['❤️', 'heart'], ['😂', 'laugh']] as const).map(([e, k]) => (
              <button key={k} data-hud onPointerDown={(ev) => { ev.preventDefault(); doEmote(k); }} onContextMenu={(ev) => ev.preventDefault()}
                style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(192,132,252,0.3)', fontSize: 20, touchAction: 'none' }}>{e}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          {roundBtn('💬', () => { setChatOpen(o => { const n = !o; if (n) setTimeout(() => chatInputRef.current?.focus(), 50); return n; }); }, 50, chatOpen)}
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
