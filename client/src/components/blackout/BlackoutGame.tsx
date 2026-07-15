import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { socket } from '@/lib/socket';
import { useBlackoutStore, blackoutRemotePos } from '@/store/blackoutStore';
import {
  BLACKOUT_WORLD_W as WORLD_W, BLACKOUT_WORLD_H as WORLD_H,
  BLACKOUT_KILL_DIST as KILL_DIST, BLACKOUT_REPORT_DIST as REPORT_DIST,
  BLACKOUT_DOOR_HACK_DIST as DOOR_HACK_DIST, BLACKOUT_EMERGENCY_DIST as EMERGENCY_DIST,
  BLACKOUT_EMERGENCY_POS as EMERGENCY_POS, BLACKOUT_DOORS as DOORS,
} from '@/types/blackout';
import type { BlackoutEject } from '@/types/blackout';
import { SFX } from '@/lib/audioEngine';

/**
 * Blackout — social deduction with real-time top-down movement.
 * Lights cycle on/off; in the dark names vanish, everyone gets a flashlight
 * cone, and the killer strikes. Report a body → meeting → vote → eject.
 */

// ── Map (must visually match server world bounds; collision is client-side) ──
const WALLS: { x: number; y: number; w: number; h: number }[] = [
  // Border
  { x: 0, y: 0, w: WORLD_W, h: 20 }, { x: 0, y: WORLD_H - 20, w: WORLD_W, h: 20 },
  { x: 0, y: 0, w: 20, h: WORLD_H }, { x: WORLD_W - 20, y: 0, w: 20, h: WORLD_H },
  // Top divider (door gaps at 230-330, 730-830, 1250-1350)
  { x: 20, y: 480, w: 210, h: 20 }, { x: 330, y: 480, w: 400, h: 20 },
  { x: 830, y: 480, w: 420, h: 20 }, { x: 1350, y: 480, w: 230, h: 20 },
  // Bottom divider (same gaps)
  { x: 20, y: 700, w: 210, h: 20 }, { x: 330, y: 700, w: 400, h: 20 },
  { x: 830, y: 700, w: 420, h: 20 }, { x: 1350, y: 700, w: 230, h: 20 },
  // Vertical room dividers
  { x: 510, y: 20, w: 20, h: 460 }, { x: 1070, y: 20, w: 20, h: 460 },
  { x: 510, y: 720, w: 20, h: 460 }, { x: 1070, y: 720, w: 20, h: 460 },
];

const ROOMS: { x: number; y: number; w: number; h: number; key: string; tint: string }[] = [
  { x: 20, y: 20, w: 490, h: 460, key: 'office', tint: 'rgba(80,60,140,0.14)' },
  { x: 530, y: 20, w: 540, h: 460, key: 'lab', tint: 'rgba(40,120,120,0.13)' },
  { x: 1090, y: 20, w: 490, h: 460, key: 'servers', tint: 'rgba(120,50,90,0.13)' },
  { x: 20, y: 500, w: 1560, h: 200, key: 'corridor', tint: 'rgba(70,70,90,0.10)' },
  { x: 20, y: 720, w: 490, h: 460, key: 'kitchen', tint: 'rgba(140,110,40,0.11)' },
  { x: 530, y: 720, w: 540, h: 460, key: 'storage', tint: 'rgba(60,100,60,0.12)' },
  { x: 1090, y: 720, w: 490, h: 460, key: 'generator', tint: 'rgba(150,70,40,0.12)' },
];

const SEAT_COLORS = ['#00e5ff', '#ff2d55', '#3fae5a', '#ffd34d', '#c084fc', '#ff8c26', '#4d9fff', '#ff6bd6', '#9be564', '#e0e0e0', '#f97316', '#22d3ee'];

const SPEED = 245;          // px/s
const BODY_R = 17;          // player radius
const EMIT_MS = 85;         // position packets ~12Hz

// Doorway barrier rects when a door is hacked shut (gap is 100px wide)
const DOOR_RECTS: Record<string, { x: number; y: number; w: number; h: number }> = Object.fromEntries(
  DOORS.map(d => [d.id, { x: d.x - 50, y: d.y - 10, w: 100, h: 20 }]),
);

// Security camera positions (one per room) + coverage radius
const CAMS: { x: number; y: number }[] = [
  { x: 265, y: 250 }, { x: 800, y: 250 }, { x: 1335, y: 250 },
  { x: 265, y: 950 }, { x: 800, y: 950 }, { x: 1335, y: 950 },
];
const CAM_RADIUS = 310;

const collides = (x: number, y: number, lockedRects: { x: number; y: number; w: number; h: number }[]) => {
  for (const w of WALLS) {
    if (x + BODY_R > w.x && x - BODY_R < w.x + w.w && y + BODY_R > w.y && y - BODY_R < w.y + w.h) return true;
  }
  for (const w of lockedRects) {
    if (x + BODY_R > w.x && x - BODY_R < w.x + w.w && y + BODY_R > w.y && y - BODY_R < w.y + w.h) return true;
  }
  return false;
};

interface Actions {
  killTargetId: string | null;
  canReport: boolean;
  cooldownLeft: number;
  canSabotage: boolean;
  sabotageCd: number;
  canEmergency: boolean;
  hackDoorId: string | null;
  hackCd: number;
}

export function BlackoutGame() {
  const t = useT();
  const tb = t.games.blackout;
  const profile = useAuthStore(s => s.profile);
  const nickname = profile?.username ?? 'Player';
  const { match, leaveMatch, startMatch, kill, report, sabotage, emergency, hackDoor, vote, rematch, sendChat, error, clearError } = useBlackoutStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camCanvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef({ keys: {} as Record<string, boolean>, jx: 0, jy: 0 });
  const joyStart = useRef({ x: 0, y: 0, active: false });
  const [actions, setActions] = useState<Actions>({ killTargetId: null, canReport: false, cooldownLeft: 0, canSabotage: false, sabotageCd: 0, canEmergency: false, hackDoorId: null, hackCd: 0 });
  const [camOpen, setCamOpen] = useState(false);
  const [deathBanner, setDeathBanner] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [roleSplash, setRoleSplash] = useState(false);
  const [ejectBanner, setEjectBanner] = useState<BlackoutEject | null>(null);
  const [chatText, setChatText] = useState('');

  const status = match?.status;
  const myId = match?.myUserId ?? '';
  const me = match?.players.find(p => p.userId === myId);
  const isHost = match?.hostId === myId;
  const amAlive = !!me?.alive;
  const round = match?.round ?? 0;
  const lastEjectKey = match?.lastEject ? `${match.round}:${match.lastEject.nickname ?? 'tie'}` : '';

  // Role splash on game start
  useEffect(() => {
    if (status === 'play' && round === 1 && match?.myRole) {
      setRoleSplash(true);
      const timer = setTimeout(() => setRoleSplash(false), 3200);
      return () => clearTimeout(timer);
    }
  }, [status === 'play' && round === 1, match?.myRole]);

  // Eject result banner after each meeting
  useEffect(() => {
    if (!lastEjectKey) return;
    const le = useBlackoutStore.getState().match?.lastEject;
    if (!le) return;
    setEjectBanner(le);
    if (le.userId) SFX.eliminate(); else SFX.ping();
    const timer = setTimeout(() => setEjectBanner(null), 4500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEjectKey]);

  // SFX on lights/status transitions + my-death banner
  const prevRef = useRef({ lightsOn: true, status: '', alive: true });
  useEffect(() => {
    if (!match) return;
    const prev = prevRef.current;
    const meNow = match.players.find(p => p.userId === match.myUserId);
    if (match.status === 'play' && prev.status === 'play' && prev.lightsOn !== match.lightsOn) {
      if (match.lightsOn) SFX.dayStart(); else SFX.nightStart();
    }
    if (match.status === 'meeting' && prev.status === 'play') SFX.voteStart();
    if (match.status === 'play' && prev.status === 'waiting') SFX.gameStart();
    if (match.status === 'finished' && prev.status && prev.status !== 'finished') SFX.gameOver();
    if (prev.alive && meNow && !meNow.alive && (match.status === 'play' || match.status === 'meeting')) {
      SFX.eliminate();
      setDeathBanner(true);
      setTimeout(() => setDeathBanner(false), 3000);
    }
    prevRef.current = { lightsOn: match.lightsOn, status: match.status, alive: meNow?.alive ?? true };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.lightsOn, match?.status, match?.players]);

  // Auto-close the camera overlay when leaving play or dying
  useEffect(() => {
    if (status !== 'play' || !amAlive) setCamOpen(false);
  }, [status, amAlive]);

  // ── Security camera minimap loop ──
  useEffect(() => {
    if (!camOpen) return;
    const canvas = camCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0, disposed = false;
    const loop = () => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      const m = useBlackoutStore.getState().match;
      if (!m) return;
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#050310';
      ctx.fillRect(0, 0, W, H);
      const s = Math.min(W / WORLD_W, H / WORLD_H);
      const ox = (W - WORLD_W * s) / 2, oy = (H - WORLD_H * s) / 2;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(s, s);
      for (const r of ROOMS) { ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(r.x, r.y, r.w, r.h); }
      for (const w of WALLS) { ctx.fillStyle = 'rgba(155,0,255,0.35)'; ctx.fillRect(w.x, w.y, w.w, w.h); }
      // Camera coverage
      const blink = Math.floor(Date.now() / 600) % 2 === 0;
      for (const c of CAMS) {
        ctx.fillStyle = 'rgba(0,229,255,0.05)';
        ctx.beginPath(); ctx.arc(c.x, c.y, CAM_RADIUS, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = blink ? '#ff2d55' : 'rgba(255,45,85,0.3)';
        ctx.beginPath(); ctx.arc(c.x, c.y, 12, 0, Math.PI * 2); ctx.fill();
      }
      const inCoverage = (x: number, y: number) => CAMS.some(c => Math.hypot(c.x - x, c.y - y) <= CAM_RADIUS);
      // Corpses in coverage
      for (const c of m.corpses) {
        if (!inCoverage(c.x, c.y)) continue;
        ctx.strokeStyle = '#ff2d55'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(c.x - 14, c.y - 14); ctx.lineTo(c.x + 14, c.y + 14);
        ctx.moveTo(c.x + 14, c.y - 14); ctx.lineTo(c.x - 14, c.y + 14); ctx.stroke();
      }
      // Live players in coverage — anonymous dots only
      for (const p of m.players) {
        if (!p.alive) continue;
        const rp = p.userId === m.myUserId ? null : blackoutRemotePos.get(p.userId);
        const px = rp?.x ?? p.x, py = rp?.y ?? p.y;
        if (!inCoverage(px, py)) continue;
        ctx.fillStyle = p.userId === m.myUserId ? '#00e5ff' : '#9be564';
        ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    };
    raf = requestAnimationFrame(loop);
    return () => { disposed = true; cancelAnimationFrame(raf); };
  }, [camOpen]);

  // 1s countdown ticker (lights + meeting)
  useEffect(() => {
    const iv = setInterval(() => {
      const m = useBlackoutStore.getState().match;
      if (!m) return;
      const until = m.status === 'meeting' ? (m.meeting?.endsAt ?? 0) : m.lightsChangeAt;
      setCountdown(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(iv);
  }, []);

  // ── Game loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!match || (status !== 'play' && status !== 'meeting' && status !== 'finished')) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dark = document.createElement('canvas'); // offscreen darkness layer
    const dctx = dark.getContext('2d')!;
    let raf = 0, disposed = false, last = performance.now();
    let lastRound = -1;
    const pos = { x: WORLD_W / 2, y: WORLD_H / 2, fx: 1, fy: 0 }; // fx/fy = facing

    const input = inputRef.current;
    const kd = (e: KeyboardEvent) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { e.preventDefault(); input.keys[e.code] = true; }
    };
    const ku = (e: KeyboardEvent) => { input.keys[e.code] = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    const emitIv = setInterval(() => {
      const m = useBlackoutStore.getState().match;
      if (!m || m.status !== 'play' || disposed) return;
      (socket as any).emit('blackout:move', { x: Math.round(pos.x), y: Math.round(pos.y) });
    }, EMIT_MS);

    const lastActions = { kill: '', report: false, cd: 0 };

    const loop = (frameTs: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min((frameTs - last) / 1000, 0.05);
      last = frameTs;
      const m = useBlackoutStore.getState().match;
      if (!m) return;

      const meNow = m.players.find(p => p.userId === m.myUserId);
      // Snap to server position on round reset / game start
      if (m.round !== lastRound && meNow) { lastRound = m.round; pos.x = meNow.x; pos.y = meNow.y; }

      // ── Physics (frozen during meetings) ──
      const now = Date.now();
      const lockedRects = Object.entries(m.doors)
        .filter(([, until]) => until > now)
        .map(([id]) => DOOR_RECTS[id]!)
        .filter(Boolean);
      if (m.status === 'play') {
        const k = input.keys;
        let dx = (k['KeyA'] || k['ArrowLeft'] ? -1 : 0) + (k['KeyD'] || k['ArrowRight'] ? 1 : 0) + input.jx;
        let dy = (k['KeyW'] || k['ArrowUp'] ? -1 : 0) + (k['KeyS'] || k['ArrowDown'] ? 1 : 0) + input.jy;
        const len = Math.hypot(dx, dy);
        if (len > 0.15) {
          dx /= Math.max(1, len); dy /= Math.max(1, len);
          const nx = pos.x + dx * SPEED * dt;
          const ny = pos.y + dy * SPEED * dt;
          if (!collides(nx, pos.y, lockedRects)) pos.x = nx;
          if (!collides(pos.x, ny, lockedRects)) pos.y = ny;
          pos.fx = dx || pos.fx; pos.fy = dy || pos.fy;
          const fl = Math.hypot(pos.fx, pos.fy) || 1;
          pos.fx /= fl; pos.fy /= fl;
        }
      }

      // Lerp remote positions
      for (const rp of blackoutRemotePos.values()) {
        const kk = Math.min(1, dt * 12);
        rp.x += (rp.tx - rp.x) * kk;
        rp.y += (rp.ty - rp.y) * kk;
      }

      // ── Proximity actions ──
      const iAmKiller = m.myRole === 'killer';
      const meAlive = !!meNow?.alive;
      let killTarget: string | null = null;
      let bestD = KILL_DIST;
      if (iAmKiller && meAlive && !m.lightsOn && m.status === 'play') {
        for (const p of m.players) {
          if (p.userId === m.myUserId || !p.alive || m.killers?.includes(p.userId)) continue;
          const rp = blackoutRemotePos.get(p.userId);
          const d = rp ? Math.hypot(rp.x - pos.x, rp.y - pos.y) : Infinity;
          if (d < bestD) { bestD = d; killTarget = p.userId; }
        }
      }
      let canReport = false;
      if (meAlive && m.status === 'play') {
        for (const c of m.corpses) {
          if (Math.hypot(c.x - pos.x, c.y - pos.y) <= REPORT_DIST) { canReport = true; break; }
        }
      }
      const cd = Math.max(0, Math.ceil((m.myKillCooldownUntil - now) / 1000));
      // Sabotage (killer, lights on)
      const sabotageCd = Math.max(0, Math.ceil((m.sabotageCooldownUntil - now) / 1000));
      const canSabotage = iAmKiller && meAlive && m.lightsOn && m.status === 'play';
      // Emergency button (corridor, lights on, once per game)
      const canEmergency = meAlive && m.status === 'play' && m.lightsOn && !m.myEmergencyUsed
        && Math.hypot(EMERGENCY_POS.x - pos.x, EMERGENCY_POS.y - pos.y) <= EMERGENCY_DIST;
      // Hacker: nearest door in range
      let hackDoorNear: string | null = null;
      if (m.mySpecialty === 'hacker' && meAlive && m.status === 'play') {
        let bd = DOOR_HACK_DIST;
        for (const d of DOORS) {
          if ((m.doors[d.id] ?? 0) > now) continue;
          const dd = Math.hypot(d.x - pos.x, d.y - pos.y);
          if (dd < bd) { bd = dd; hackDoorNear = d.id; }
        }
      }
      const hackCd = Math.max(0, Math.ceil((m.myHackCooldownUntil - now) / 1000));
      const sig = `${killTarget}|${canReport}|${cd}|${canSabotage}|${sabotageCd}|${canEmergency}|${hackDoorNear}|${hackCd}`;
      if (sig !== lastActions.kill) {
        lastActions.kill = sig;
        setActions({ killTargetId: killTarget, canReport, cooldownLeft: cd, canSabotage, sabotageCd, canEmergency, hackDoorId: hackDoorNear, hackCd });
      }

      // ── Render ──
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        dark.width = canvas.width; dark.height = canvas.height;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const zoom = Math.max(W / 980, H / 740);
      let camX = pos.x - W / zoom / 2, camY = pos.y - H / zoom / 2;
      camX = Math.max(0, Math.min(WORLD_W - W / zoom, camX));
      camY = Math.max(0, Math.min(WORLD_H - H / zoom, camY));

      ctx.fillStyle = '#07040f';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.scale(zoom, zoom);
      ctx.translate(-camX, -camY);

      // Floors
      for (const r of ROOMS) {
        ctx.fillStyle = '#0e0a1e';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = r.tint;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      // Floor grid
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= WORLD_W; gx += 80) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, WORLD_H); ctx.stroke(); }
      for (let gy = 0; gy <= WORLD_H; gy += 80) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(WORLD_W, gy); ctx.stroke(); }
      // Room labels (only meaningful with lights on; hidden under darkness anyway)
      ctx.font = '600 26px "Space Grotesk", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      for (const r of ROOMS) {
        const label = (tb.rooms as Record<string, string>)[r.key] ?? r.key;
        ctx.fillText(label, r.x + r.w / 2, r.y + 44);
      }
      // Walls
      for (const w of WALLS) {
        ctx.fillStyle = '#221a3e';
        ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.fillStyle = 'rgba(155,0,255,0.28)';
        ctx.fillRect(w.x, w.y, w.w, 3);
      }
      // Emergency button (corridor center)
      {
        const used = m.myEmergencyUsed;
        ctx.beginPath(); ctx.arc(EMERGENCY_POS.x, EMERGENCY_POS.y, 34, 0, Math.PI * 2);
        ctx.fillStyle = used ? 'rgba(120,120,130,0.25)' : 'rgba(255,45,85,0.22)'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = used ? 'rgba(160,160,170,0.4)' : 'rgba(255,45,85,0.75)'; ctx.stroke();
        ctx.font = '26px system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⚠', EMERGENCY_POS.x, EMERGENCY_POS.y + 1);
        ctx.textBaseline = 'alphabetic';
      }
      // Security cameras (world markers, blinking)
      {
        const blink = Math.floor(now / 700) % 2 === 0;
        for (const c of CAMS) {
          ctx.fillStyle = blink ? 'rgba(255,45,85,0.9)' : 'rgba(255,45,85,0.35)';
          ctx.beginPath(); ctx.arc(c.x, c.y - 0, 5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(0,229,255,0.3)'; ctx.lineWidth = 2;
          ctx.strokeRect(c.x - 11, c.y - 11, 22, 22);
        }
      }
      // Hacked (locked) doors — glowing barriers
      for (const [id, until] of Object.entries(m.doors)) {
        if (until <= now) continue;
        const r = DOOR_RECTS[id];
        if (!r) continue;
        ctx.fillStyle = 'rgba(255,45,85,0.55)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = 'rgba(255,140,160,0.9)';
        for (let bx = r.x + 6; bx < r.x + r.w - 4; bx += 16) ctx.fillRect(bx, r.y + 3, 5, r.h - 6);
      }
      // Corpses
      for (const c of m.corpses) {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.fillStyle = 'rgba(200,30,50,0.85)';
        ctx.beginPath(); ctx.ellipse(0, 6, 20, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = SEAT_COLORS[c.seat % SEAT_COLORS.length]!;
        ctx.globalAlpha = 0.75;
        ctx.beginPath(); ctx.arc(-4, -2, 12, Math.PI * 0.15, Math.PI * 1.2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      // Players
      const amGhost = !meAlive && m.status !== 'finished';
      for (const p of m.players) {
        if (p.userId === m.myUserId) continue;
        if (!p.alive && !amGhost && m.status !== 'finished') continue; // living can't see ghosts
        const rp = blackoutRemotePos.get(p.userId);
        if (!rp) continue;
        drawPlayer(ctx, rp.x, rp.y, SEAT_COLORS[p.seat % SEAT_COLORS.length]!, !p.alive);
        if (m.lightsOn || m.status === 'finished') {
          ctx.font = '600 15px "Space Grotesk", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = p.alive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)';
          ctx.fillText(p.nickname, rp.x, rp.y - 28);
        }
      }
      // Me
      if (meNow) {
        drawPlayer(ctx, pos.x, pos.y, SEAT_COLORS[(meNow.seat) % SEAT_COLORS.length]!, !meNow.alive, true);
        if (m.lightsOn) {
          ctx.font = '600 15px "Space Grotesk", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(0,229,255,0.9)';
          ctx.fillText(meNow.nickname, pos.x, pos.y - 28);
        }
      }
      ctx.restore();

      // ── Darkness + flashlight ──
      if (!m.lightsOn && m.status !== 'finished') {
        dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        dctx.globalCompositeOperation = 'source-over';
        dctx.fillStyle = 'rgba(2,1,10,0.965)';
        dctx.fillRect(0, 0, W, H);
        // Cut the flashlight cone + halo around me (ghosts see everything)
        const sx = (pos.x - camX) * zoom, sy = (pos.y - camY) * zoom;
        dctx.globalCompositeOperation = 'destination-out';
        if (amGhost) {
          dctx.fillStyle = 'rgba(255,255,255,0.55)';
          dctx.fillRect(0, 0, W, H);
        } else {
          const coneR = (m.myRole === 'killer' ? 340 : 280) * zoom;
          const ang = Math.atan2(pos.fy, pos.fx);
          const grad = dctx.createRadialGradient(sx, sy, 10, sx, sy, coneR);
          grad.addColorStop(0, 'rgba(255,255,255,1)');
          grad.addColorStop(0.75, 'rgba(255,255,255,0.85)');
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          dctx.fillStyle = grad;
          dctx.beginPath();
          dctx.moveTo(sx, sy);
          dctx.arc(sx, sy, coneR, ang - 0.55, ang + 0.55);
          dctx.closePath();
          dctx.fill();
          const halo = dctx.createRadialGradient(sx, sy, 4, sx, sy, 85 * zoom);
          halo.addColorStop(0, 'rgba(255,255,255,1)');
          halo.addColorStop(1, 'rgba(255,255,255,0)');
          dctx.fillStyle = halo;
          dctx.beginPath(); dctx.arc(sx, sy, 85 * zoom, 0, Math.PI * 2); dctx.fill();
        }
        dctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(dark, 0, 0, W, H);
      }
    };

    raf = requestAnimationFrame(loop);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      clearInterval(emitIv);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id, status === 'waiting']);

  if (!match) return null;

  // ── Joystick ─────────────────────────────────────────────────────────────
  const joyHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      joyStart.current = { x: e.clientX, y: e.clientY, active: true };
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!joyStart.current.active) return;
      const dx = e.clientX - joyStart.current.x, dy = e.clientY - joyStart.current.y;
      const len = Math.hypot(dx, dy);
      const cap = 46;
      inputRef.current.jx = len > 6 ? (dx / Math.max(len, cap)) * Math.min(1, len / cap) : 0;
      inputRef.current.jy = len > 6 ? (dy / Math.max(len, cap)) * Math.min(1, len / cap) : 0;
    },
    onPointerUp: () => { joyStart.current.active = false; inputRef.current.jx = 0; inputRef.current.jy = 0; },
    onPointerCancel: () => { joyStart.current.active = false; inputRef.current.jx = 0; inputRef.current.jy = 0; },
  };

  const alivePlayers = match.players.filter(p => p.alive);
  const myVoted = !!match.meeting?.votedIds.includes(myId);

  const submitChat = () => {
    const text = chatText.trim();
    if (!text) return;
    sendChat(text, nickname);
    setChatText('');
  };

  return createPortal(
    <div className="fixed inset-0 z-[500] select-none" style={{ background: '#05030f' }}>

      {/* ══ WAITING LOBBY ══ */}
      {status === 'waiting' && (
        <div className="absolute inset-0 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-sm rounded-3xl p-6 text-center" style={{ background: 'rgba(14,9,30,0.97)', border: '1px solid rgba(155,0,255,0.3)' }}>
            <p className="text-4xl mb-2">🔦</p>
            <h2 className="font-display font-bold text-2xl text-white mb-1">{tb.title}</h2>
            <p className="font-mono text-[12px] text-white/40 mb-4">{tb.subtitle}</p>
            <button
              onClick={() => { try { navigator.clipboard?.writeText(match.code); } catch { /* ignore */ } }}
              className="font-mono font-bold text-3xl tracking-[0.3em] text-neon-cyan mb-1 mx-auto block"
            >
              {match.code}
            </button>
            <p className="font-mono text-[11px] text-white/30 mb-4">{tb.shareCode}</p>
            <div className="space-y-1.5 mb-5 max-h-56 overflow-y-auto">
              {match.players.map(p => (
                <div key={p.userId} className="flex items-center gap-2.5 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: SEAT_COLORS[p.seat % SEAT_COLORS.length] }} />
                  <span className="font-mono text-sm text-white/80 truncate">{p.nickname}</span>
                  {p.userId === match.hostId && <span className="text-[11px] font-mono text-neon-yellow/70 ml-auto">HOST</span>}
                </div>
              ))}
            </div>
            <p className="font-mono text-[12px] text-white/35 mb-4">
              {match.players.length}/{match.maxPlayers} · {match.players.length < 4 ? tb.minPlayers : tb.ready}
            </p>
            <div className="flex gap-2.5">
              {isHost && (
                <button
                  onClick={() => startMatch()}
                  disabled={match.players.length < 4}
                  className="flex-1 py-3 rounded-xl font-display font-bold text-sm disabled:opacity-35"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#0ea5e9)', color: '#fff' }}
                >
                  {tb.startGame}
                </button>
              )}
              <button onClick={() => leaveMatch()} className="flex-1 py-3 rounded-xl font-mono text-sm text-white/50" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
                {tb.leave}
              </button>
            </div>
            {error && <p className="mt-3 font-mono text-[12px] text-neon-red" onClick={clearError}>{error}</p>}
          </div>
        </div>
      )}

      {/* ══ GAME STAGE ══ */}
      {status !== 'waiting' && (
        <>
          <canvas ref={canvasRef} className="w-full h-full block" style={{ touchAction: 'none' }} />

          {/* HUD top */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pointer-events-none">
            <div
              className="font-mono text-[13px] font-bold px-3 py-1.5 rounded-xl"
              style={{
                background: 'rgba(10,6,24,0.75)',
                border: `1px solid ${match.lightsOn ? 'rgba(255,211,77,0.4)' : 'rgba(155,0,255,0.45)'}`,
                color: match.lightsOn ? '#ffd34d' : '#c084fc',
              }}
            >
              {status === 'meeting' ? `🗳 ${countdown}s` : match.lightsOn ? `💡 ${countdown}s` : `🌑 ${countdown}s`}
            </div>
            <div className="flex items-center gap-2 pointer-events-auto">
              {match.myRole && status === 'play' && (
                <span
                  className="font-mono text-[12px] px-2.5 py-1.5 rounded-xl"
                  style={{
                    background: 'rgba(10,6,24,0.75)',
                    border: `1px solid ${match.myRole === 'killer' ? 'rgba(255,45,85,0.45)' : 'rgba(0,229,255,0.35)'}`,
                    color: match.myRole === 'killer' ? '#ff2d55' : '#00e5ff',
                  }}
                >
                  {match.myRole === 'killer' ? `🔪 ${tb.roleKiller}` : match.mySpecialty === 'security' ? `📹 ${tb.specialtySecurity}` : match.mySpecialty === 'hacker' ? `🔒 ${tb.specialtyHacker}` : `🛡 ${tb.roleCrew}`}
                </span>
              )}
              <button
                onClick={() => leaveMatch()}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white/70"
                style={{ background: 'rgba(10,6,24,0.75)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Dead badge */}
          {!amAlive && status !== 'finished' && (
            <div className="absolute top-[calc(env(safe-area-inset-top,0px)+56px)] left-1/2 -translate-x-1/2 pointer-events-none font-mono text-[12px] px-3 py-1 rounded-lg" style={{ background: 'rgba(10,6,24,0.7)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.1)' }}>
              👻 {tb.youAreDead}
            </div>
          )}

          {/* Joystick zone (left half) */}
          {status === 'play' && (
            <div className="absolute left-0 bottom-0 w-1/2 h-2/3" style={{ touchAction: 'none' }} {...joyHandlers} />
          )}

          {/* Action buttons */}
          {status === 'play' && amAlive && (
            <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+22px)] right-5 flex flex-col gap-3 items-end">
              {match.myRole === 'killer' && !match.lightsOn && (
                <button
                  onClick={() => { if (actions.killTargetId) { kill(actions.killTargetId); SFX.punch(); } }}
                  disabled={!actions.killTargetId || actions.cooldownLeft > 0}
                  className="w-[72px] h-[72px] rounded-full flex flex-col items-center justify-center font-display font-bold text-[13px] transition-all active:scale-90 disabled:opacity-35"
                  style={{ background: 'rgba(120,10,30,0.75)', border: '2px solid rgba(255,45,85,0.7)', color: '#ff8ca3' }}
                >
                  <span className="text-xl leading-none">🔪</span>
                  {actions.cooldownLeft > 0 ? `${actions.cooldownLeft}s` : tb.kill}
                </button>
              )}
              {actions.canSabotage && (
                <button
                  onClick={() => sabotage()}
                  disabled={actions.sabotageCd > 0}
                  className="w-[72px] h-[72px] rounded-full flex flex-col items-center justify-center font-display font-bold text-[12px] transition-all active:scale-90 disabled:opacity-35"
                  style={{ background: 'rgba(60,20,100,0.75)', border: '2px solid rgba(155,0,255,0.65)', color: '#c084fc' }}
                >
                  <span className="text-xl leading-none">⚡</span>
                  {actions.sabotageCd > 0 ? `${actions.sabotageCd}s` : tb.sabotage}
                </button>
              )}
              {match.mySpecialty === 'hacker' && (
                <button
                  onClick={() => actions.hackDoorId && hackDoor(actions.hackDoorId)}
                  disabled={!actions.hackDoorId || actions.hackCd > 0}
                  className="w-[72px] h-[72px] rounded-full flex flex-col items-center justify-center font-display font-bold text-[12px] transition-all active:scale-90 disabled:opacity-30"
                  style={{ background: 'rgba(10,80,60,0.72)', border: '2px solid rgba(63,174,90,0.65)', color: '#7fe0a0' }}
                >
                  <span className="text-xl leading-none">🔒</span>
                  {actions.hackCd > 0 ? `${actions.hackCd}s` : tb.lockDoor}
                </button>
              )}
              {match.mySpecialty === 'security' && (
                <button
                  onClick={() => setCamOpen(true)}
                  className="w-[72px] h-[72px] rounded-full flex flex-col items-center justify-center font-display font-bold text-[12px] transition-all active:scale-90"
                  style={{ background: 'rgba(10,50,90,0.72)', border: '2px solid rgba(0,229,255,0.55)', color: '#7fd8ff' }}
                >
                  <span className="text-xl leading-none">📹</span>
                  {tb.cameras}
                </button>
              )}
              {actions.canEmergency && (
                <button
                  onClick={() => emergency()}
                  className="w-[72px] h-[72px] rounded-full flex flex-col items-center justify-center font-display font-bold text-[11px] transition-all active:scale-90"
                  style={{ background: 'rgba(140,20,30,0.8)', border: '2px solid rgba(255,80,80,0.8)', color: '#ffb3b3' }}
                >
                  <span className="text-xl leading-none">⚠</span>
                  {tb.emergencyBtn}
                </button>
              )}
              <button
                onClick={() => report()}
                disabled={!actions.canReport}
                className="w-[72px] h-[72px] rounded-full flex flex-col items-center justify-center font-display font-bold text-[12px] transition-all active:scale-90 disabled:opacity-30"
                style={{ background: 'rgba(120,90,10,0.72)', border: '2px solid rgba(255,211,77,0.6)', color: '#ffe08a' }}
              >
                <span className="text-xl leading-none">📢</span>
                {tb.report}
              </button>
            </div>
          )}

          {/* Security cameras overlay */}
          {camOpen && (
            <div className="absolute inset-0 flex flex-col" style={{ background: 'rgba(2,1,8,0.94)', zIndex: 5 }}>
              <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-2 flex-shrink-0">
                <span className="font-mono text-[13px] font-bold tracking-widest" style={{ color: '#7fd8ff' }}>📹 {tb.cameras}</span>
                <button
                  onClick={() => setCamOpen(false)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white/70"
                  style={{ background: 'rgba(10,6,24,0.75)', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  ✕
                </button>
              </div>
              <canvas ref={camCanvasRef} className="flex-1 w-full block" />
              <p className="text-center font-mono text-[11px] text-white/30 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pt-2">{tb.camerasHint}</p>
            </div>
          )}

          {/* Death banner */}
          {deathBanner && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ background: 'rgba(40,0,8,0.55)', zIndex: 6 }}>
              <div className="text-center">
                <p className="text-6xl mb-2">💀</p>
                <p className="font-display font-bold text-2xl" style={{ color: '#ff2d55' }}>{tb.youWereKilled}</p>
              </div>
            </div>
          )}

          {/* Role splash */}
          {roleSplash && match.myRole && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ background: 'rgba(3,1,12,0.82)' }}>
              <div className="text-center">
                <p className="text-6xl mb-3">{match.myRole === 'killer' ? '🔪' : '🛡'}</p>
                <p className="font-display font-bold text-3xl mb-2" style={{ color: match.myRole === 'killer' ? '#ff2d55' : '#00e5ff' }}>
                  {match.myRole === 'killer' ? tb.roleKiller : tb.roleCrew}
                </p>
                <p className="font-mono text-[13px] text-white/50 max-w-[260px] mx-auto leading-relaxed">
                  {match.myRole === 'killer' ? tb.killerHint : tb.crewHint}
                </p>
                {match.mySpecialty && (
                  <p className="mt-3 font-mono text-[13px] max-w-[260px] mx-auto leading-relaxed" style={{ color: match.mySpecialty === 'security' ? '#7fd8ff' : '#7fe0a0' }}>
                    {match.mySpecialty === 'security' ? `📹 ${tb.specialtySecurity} — ${tb.securityHint}` : `🔒 ${tb.specialtyHacker} — ${tb.hackerHint}`}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Eject banner */}
          {ejectBanner && status !== 'finished' && !roleSplash && (
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 pointer-events-none px-5 py-3 rounded-2xl text-center" style={{ background: 'rgba(10,6,24,0.92)', border: '1px solid rgba(155,0,255,0.4)' }}>
              <p className="font-display font-bold text-base text-white">
                {ejectBanner.nickname
                  ? tb.ejected.replace('{name}', ejectBanner.nickname).replace('{role}', ejectBanner.role === 'killer' ? tb.roleKiller : tb.roleCrew)
                  : tb.noEject}
              </p>
            </div>
          )}
        </>
      )}

      {/* ══ MEETING OVERLAY ══ */}
      {status === 'meeting' && match.meeting && (
        <div className="absolute inset-0 flex items-center justify-center p-3" style={{ background: 'rgba(4,2,14,0.88)' }}>
          <div className="w-full max-w-md rounded-3xl p-4 flex flex-col" style={{ background: 'rgba(14,9,30,0.98)', border: '1px solid rgba(255,45,85,0.35)', maxHeight: '92%' }}>
            <div className="text-center mb-3">
              <p className="text-3xl mb-1">🚨</p>
              <p className="font-display font-bold text-lg text-white">{tb.meeting}</p>
              <p className="font-mono text-[12px] text-white/45">
                {match.meeting.bodyName
                  ? tb.bodyFound.replace('{reporter}', match.meeting.reporterName).replace('{name}', match.meeting.bodyName)
                  : tb.emergencyCalled.replace('{reporter}', match.meeting.reporterName)}
                {' · '}⏱ {countdown}s
              </p>
            </div>
            {/* Vote grid */}
            <div className="grid grid-cols-2 gap-1.5 mb-3 overflow-y-auto" style={{ maxHeight: 220 }}>
              {alivePlayers.map(p => (
                <button
                  key={p.userId}
                  onClick={() => amAlive && !myVoted && p.userId !== myId && vote(p.userId)}
                  disabled={!amAlive || myVoted || p.userId === myId}
                  className="flex items-center gap-2 px-2.5 py-2.5 rounded-xl text-left transition-all active:scale-[0.97] disabled:opacity-60"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: SEAT_COLORS[p.seat % SEAT_COLORS.length] }} />
                  <span className="font-mono text-[13px] text-white/85 truncate flex-1">{p.nickname}{p.userId === myId ? ' ✦' : ''}</span>
                  {match.meeting!.votedIds.includes(p.userId) && <span className="text-[11px] text-neon-green/80">✓</span>}
                </button>
              ))}
            </div>
            {amAlive && !myVoted ? (
              <button
                onClick={() => vote('skip')}
                className="w-full py-2.5 rounded-xl font-mono text-[13px] text-white/60 mb-3"
                style={{ border: '1px solid rgba(255,255,255,0.18)' }}
              >
                {tb.skipVote}
              </button>
            ) : (
              <p className="text-center font-mono text-[12px] text-white/35 mb-3">{amAlive ? tb.voted : tb.youAreDead}</p>
            )}
            {/* Chat */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1 mb-2 px-1" style={{ maxHeight: 130 }}>
              {match.chat.slice(-25).map(msg => (
                <p key={msg.id} className="font-mono text-[12px] text-white/70 leading-snug">
                  <span className="text-neon-cyan/70">{msg.nickname}:</span> {msg.text}
                </p>
              ))}
            </div>
            {amAlive && (
              <div className="flex gap-2">
                <input
                  value={chatText}
                  onChange={e => setChatText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitChat(); }}
                  placeholder={tb.chatPlaceholder}
                  maxLength={200}
                  className="flex-1 px-3 py-2 rounded-xl font-mono text-[13px] text-white bg-white/5 border border-white/10 outline-none focus:border-neon-cyan/40"
                />
                <button onClick={submitChat} className="px-4 rounded-xl font-mono text-[13px] text-neon-cyan" style={{ border: '1px solid rgba(0,229,255,0.35)' }}>➤</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ FINISHED OVERLAY ══ */}
      {status === 'finished' && (
        <div className="absolute inset-0 flex items-center justify-center p-4" style={{ background: 'rgba(4,2,14,0.88)' }}>
          <div className="w-full max-w-sm rounded-3xl p-6 text-center" style={{ background: 'rgba(14,9,30,0.98)', border: '1px solid rgba(155,0,255,0.35)' }}>
            <p className="text-5xl mb-3">{match.winner === 'crew' ? '🛡' : '🔪'}</p>
            <p className="font-display font-bold text-2xl mb-2" style={{ color: match.winner === 'crew' ? '#00e5ff' : '#ff2d55' }}>
              {match.winner === 'crew' ? tb.crewWins : tb.killersWin}
            </p>
            {match.killers && (
              <p className="font-mono text-[13px] text-white/50 mb-5">
                {tb.killersWere}{' '}
                <span className="text-neon-red/80">
                  {match.players.filter(p => match.killers!.includes(p.userId)).map(p => p.nickname).join(', ')}
                </span>
              </p>
            )}
            <div className="flex gap-2.5">
              {isHost && (
                <button onClick={() => rematch()} className="flex-1 py-3 rounded-xl font-display font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg,#7c3aed,#0ea5e9)' }}>
                  {tb.rematch}
                </button>
              )}
              <button onClick={() => leaveMatch()} className="flex-1 py-3 rounded-xl font-mono text-sm text-white/50" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
                {tb.leave}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, dead: boolean, isMe = false): void {
  ctx.save();
  ctx.translate(x, y);
  if (dead) ctx.globalAlpha = 0.35;
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(0, 14, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
  // Body
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 17, 0, 0, Math.PI * 2); ctx.fill();
  // Visor
  ctx.fillStyle = 'rgba(200,240,255,0.9)';
  ctx.beginPath(); ctx.ellipse(4, -5, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
  if (isMe) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 16, 20, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
