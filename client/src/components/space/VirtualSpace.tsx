import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualSpace, type SpacePlayer, type SpaceMask, type SpaceMeta as SpaceMetaT } from '@/hooks/useVirtualSpace';
import { SpacesLobby, SpaceInvitePanel } from './SpacesLobby';
import { useSpaceVoice } from '@/hooks/useSpaceVoice';
import { useAuthStore } from '@/store/authStore';
import { socket } from '@/lib/socket';

// ── Avatar palette ────────────────────────────────────────────────────

const BODY_COLORS = ['#9b00ff', '#00e5ff', '#ff00aa', '#00ff88', '#ff6600', '#3b82f6', '#ffcc00', '#ff2255'];
const GLOW_COLORS = ['#00e5ff', '#9b00ff', '#00ff88', '#ff00aa', '#ffcc00', '#ff6600', '#ff2255', '#c084fc'];
const MASKS: { id: SpaceMask; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'half', label: 'Half' },
  { id: 'full', label: 'Full' }, { id: 'visor', label: 'Visor' },
];
const LS_BODY = 'vs_bodyColor';
const LS_GLOW = 'vs_glowColor';
const LS_MASK = 'vs_mask';

// ── CSS keyframes ─────────────────────────────────────────────────────

const SPACE_CSS = `
@keyframes vs-dance  { 0%,100%{transform:translateY(0) rotate(0)} 25%{transform:translateY(-6px) rotate(-8deg)} 75%{transform:translateY(-6px) rotate(8deg)} }
@keyframes vs-float  { 0%,100%{transform:translateY(0)}  50%{transform:translateY(-4px)} }
@keyframes vs-pulse  { 0%,100%{opacity:.7} 50%{opacity:1} }
@keyframes vs-spin   { to{transform:rotate(360deg)} }
@keyframes vs-spin-r { to{transform:rotate(-360deg)} }
@keyframes vs-drift  { 0%{transform:translateY(0) translateX(0);opacity:0}
                       10%{opacity:.55} 90%{opacity:.25}
                       100%{transform:translateY(-55px) translateX(12px);opacity:0} }
@keyframes vs-eq1 { 0%,100%{height:4px}  50%{height:14px} }
@keyframes vs-eq2 { 0%,100%{height:10px} 50%{height:5px}  }
@keyframes vs-eq3 { 0%,100%{height:7px}  50%{height:18px} }
@keyframes vs-eq4 { 0%,100%{height:12px} 50%{height:3px}  }
@keyframes vs-eq5 { 0%,100%{height:5px}  50%{height:11px} }
@keyframes vs-bubble  { 0%{transform:translateY(0);opacity:.7} 100%{transform:translateY(-28px);opacity:0} }
@keyframes vs-flicker { 0%,100%{opacity:1} 8%{opacity:.6} 10%{opacity:1} 42%{opacity:.85} 44%{opacity:1} 78%{opacity:.5} 80%{opacity:1} }
@keyframes vs-sway    { 0%,100%{transform:rotate(-4deg) translateX(0)} 50%{transform:rotate(4deg) translateX(2px)} }
@keyframes vs-clap    { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06) translateY(-1px)} }
@keyframes vs-point   { 0%,100%{transform:translateX(0) rotate(0)} 50%{transform:translateX(3px) rotate(5deg)} }
@keyframes vs-react   { 0%{transform:translateY(0) scale(.4);opacity:0} 18%{transform:translateY(-10px) scale(1.15);opacity:1} 75%{opacity:.95} 100%{transform:translateY(-52px) scale(1);opacity:0} }
@keyframes vs-typing  { 0%,60%,100%{transform:translateY(0);opacity:.4} 30%{transform:translateY(-3px);opacity:1} }
@keyframes vs-scanline{ 0%{transform:translateY(-100%)} 100%{transform:translateY(600%)} }
@keyframes vs-hpulse  { 0%,100%{width:65%} 50%{width:48%} }
`;

// ── DJ state ──────────────────────────────────────────────────────────

interface DJState {
  videoId: string;
  startedAt: number;
  position: number;
  isPlaying: boolean;
  djName: string;
}

// ── YouTube player singleton ──────────────────────────────────────────
// Lives outside React so it survives panel open/close

let _yt: any = null;
let _ytStateChangeCb: ((state: number) => void) | null = null;

let _ytApiLoading = false;
let _ytApiReady = false;
const _ytApiCbs: (() => void)[] = [];

function _loadYTApi(): Promise<void> {
  return new Promise(resolve => {
    if (_ytApiReady) { resolve(); return; }
    _ytApiCbs.push(resolve);
    if (_ytApiLoading) return;
    _ytApiLoading = true;
    (window as any).onYouTubeIframeAPIReady = () => {
      _ytApiReady = true;
      _ytApiCbs.forEach(cb => cb());
      _ytApiCbs.length = 0;
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
}

function _createYTPlayer(div: HTMLElement, onReady: () => void) {
  if (_yt) { onReady(); return; }
  _loadYTApi().then(() => {
    _yt = new (window as any).YT.Player(div, {
      width: 1, height: 1,
      playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1 },
      events: {
        onReady: () => onReady(),
        onStateChange: (e: { data: number }) => _ytStateChangeCb?.(e.data),
      },
    });
  });
}

function _destroyYTPlayer() {
  try { _yt?.destroy?.(); } catch { /* ignore */ }
  _yt = null;
  _ytStateChangeCb = null;
}

// All of these must only be called from click handlers (user gesture)
function ytPlay(videoId: string, startSeconds: number) {
  _yt?.loadVideoById?.({ videoId, startSeconds: Math.max(0, startSeconds) });
}
function ytSearch(query: string) {
  _yt?.loadPlaylist?.({ listType: 'search', list: query, index: 0, startSeconds: 0 });
}
function ytCue(videoId: string, startSeconds: number) {
  _yt?.cueVideoById?.({ videoId, startSeconds: Math.max(0, startSeconds) });
}
function ytPause() { _yt?.pauseVideo?.(); }
function ytStop()  { _yt?.stopVideo?.();  }
function ytSetVol(v: number) { _yt?.setVolume?.(v); }
function ytGetTime(): number { return _yt?.getCurrentTime?.() ?? 0; }
function ytGetVideoId(): string { return _yt?.getVideoData?.()?.video_id ?? ''; }

// ── Cinema TV player (separate visible instance — never touches the DJ) ──
let _ytTv: any = null;
let _ytTvStateCb: ((s: number) => void) | null = null;
function _createTvPlayer(div: HTMLElement, onReady: () => void) {
  if (_ytTv) { onReady(); return; }
  _loadYTApi().then(() => {
    _ytTv = new (window as any).YT.Player(div, {
      width: '100%', height: '100%',
      playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1, modestbranding: 1, fs: 0, disablekb: 1, iv_load_policy: 3 },
      events: {
        onReady: () => onReady(),
        onStateChange: (e: { data: number }) => _ytTvStateCb?.(e.data),
      },
    });
  });
}
function _destroyTvPlayer() { try { _ytTv?.destroy?.(); } catch { /* ignore */ } _ytTv = null; _ytTvStateCb = null; }
function tvLoad(videoId: string, startSeconds: number) { _ytTv?.loadVideoById?.({ videoId, startSeconds: Math.max(0, startSeconds) }); }
function tvCue(videoId: string, startSeconds: number) { _ytTv?.cueVideoById?.({ videoId, startSeconds: Math.max(0, startSeconds) }); }
function tvSearchLoad(query: string) { _ytTv?.loadPlaylist?.({ listType: 'search', list: query, index: 0, startSeconds: 0 }); }
function tvPlayP() { _ytTv?.playVideo?.(); }
function tvPauseP() { _ytTv?.pauseVideo?.(); }
function tvSeekP(s: number) { _ytTv?.seekTo?.(Math.max(0, s), true); }
function tvSetVolP(v: number) { _ytTv?.setVolume?.(Math.max(0, Math.min(100, Math.round(v)))); }
function tvGetTimeP(): number { return _ytTv?.getCurrentTime?.() ?? 0; }
function tvGetVidP(): string { return _ytTv?.getVideoData?.()?.video_id ?? ''; }
function tvGetTitleP(): string { return _ytTv?.getVideoData?.()?.title ?? ''; }

// Distance (in world units) within which the TV loads & spatial audio is audible.
const TV_NEAR_RADIUS = 42;

interface TVState { videoId: string; title: string; startedAt: number; position: number; isPlaying: boolean; byName: string; }
function tvComputedPos(s: TVState): number {
  return s.isPlaying ? Math.max(0, (Date.now() - s.startedAt) / 1000) : Math.max(0, s.position);
}

// ── Room layouts ────────────────────────────────────────────────────────
type SeatType = 'couch' | 'chair' | 'pouf';
interface SeatDef { id: string; type: SeatType; x: number; y: number; }
interface RoomLayout { tv: { x: number; y: number }; seats: SeatDef[]; decor: 'lounge' | 'home' }

const ROOM_LAYOUTS: Record<string, RoomLayout> = {
  // Neon club lounge — couches + poufs facing a big wall screen.
  lounge: {
    tv: { x: 50, y: 17 },
    decor: 'lounge',
    seats: [
      { id: 'couchL', type: 'couch', x: 40, y: 32 },
      { id: 'couchR', type: 'couch', x: 60, y: 32 },
      { id: 'chairL', type: 'chair', x: 26, y: 41 },
      { id: 'chairR', type: 'chair', x: 74, y: 41 },
      { id: 'poufL',  type: 'pouf',  x: 45, y: 46 },
      { id: 'poufR',  type: 'pouf',  x: 55, y: 46 },
    ],
  },
  // Cosy home cinema — TV, four chairs in a row, and an open dance/move floor.
  home: {
    tv: { x: 50, y: 18 },
    decor: 'home',
    seats: [
      { id: 'c1', type: 'chair', x: 33, y: 40 },
      { id: 'c2', type: 'chair', x: 44, y: 40 },
      { id: 'c3', type: 'chair', x: 56, y: 40 },
      { id: 'c4', type: 'chair', x: 67, y: 40 },
    ],
  },
};
function getLayout(id: string | undefined): RoomLayout {
  return ROOM_LAYOUTS[id ?? 'lounge'] ?? ROOM_LAYOUTS.lounge;
}

// ── URL / ID helper ───────────────────────────────────────────────────

function extractVideoId(input: string): string | null {
  const s = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const url = new URL(s);
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1).split(/[?&]/)[0];
    const v = url.searchParams.get('v');
    if (v) return v;
  } catch { /* not a URL */ }
  return null;
}

// ── Humanoid avatar ───────────────────────────────────────────────────

const GESTURE_EMOJI: Record<string, string> = { wave: '👋', clap: '👏', point: '👉', dance: '💃' };
function gestureAnim(g: string | null | undefined, sitting?: boolean): string {
  if (!g || sitting) return 'none';
  if (g === 'dance') return 'vs-dance 0.5s ease-in-out infinite';
  if (g === 'wave')  return 'vs-sway 0.5s ease-in-out 4';
  if (g === 'clap')  return 'vs-clap 0.3s ease-in-out 6';
  if (g === 'point') return 'vs-point 0.5s ease-in-out 3';
  return 'none';
}

function HumanoidAvatar({ bodyColor, glowColor, mask, size = 1, speaking, walking, gesture, sitting, isMe }: {
  bodyColor: string; glowColor: string; mask: SpaceMask;
  size?: number; speaking?: boolean; walking?: boolean; gesture?: string | null; sitting?: boolean; isMe?: boolean;
}) {

  const w = Math.round(32 * size);
  const h = Math.round(56 * size);
  const bd = bodyColor + 'cc';
  const bl = bodyColor + 'ee';
  const isWalking = walking && !sitting;
  return (
   <div style={{ position: 'relative', width: w, height: h, flexShrink: 0, transform: sitting ? 'translateY(5px)' : undefined, transition: 'transform .25s ease', animation: gestureAnim(gesture, sitting) }}>

      {gesture && GESTURE_EMOJI[gesture] && (
        <div style={{ position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)', fontSize: 16, animation: 'vs-clap 0.4s ease-in-out infinite', pointerEvents: 'none', zIndex: 5 }}>
          {GESTURE_EMOJI[gesture]}
        </div>
      )}
      {speaking && (
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.9, 0.35, 0.9] }}
          transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', top: -6, left: Math.round(w / 2) - Math.round(11 * size) - 6, width: Math.round(22 * size) + 12, height: Math.round(22 * size) + 12, borderRadius: '50%', border: `2px solid ${glowColor}`, boxShadow: `0 0 12px ${glowColor}80`, pointerEvents: 'none' }}
        />
      )}
      <svg width={w} height={h} viewBox="0 0 32 56" fill="none"
        style={{ filter: speaking ? `drop-shadow(0 0 8px ${glowColor}cc)` : `drop-shadow(0 0 ${isMe ? 5 : 3}px ${bodyColor}99)` }}
      >
        <ellipse cx="16" cy="54" rx="7" ry="2.5" fill="rgba(0,0,0,0.35)" />
        {sitting ? (
          <>
            {/* seated legs — thighs forward, shins down */}
            <rect x="7"  y="38" width="11" height="5" rx="2.5" fill={bd} />
            <rect x="20" y="38" width="11" height="5" rx="2.5" fill={bd} />
            <rect x="13.5" y="42" width="5" height="11" rx="2.5" fill={bd} />
            <rect x="25.5" y="42" width="5" height="11" rx="2.5" fill={bd} />
          </>
        ) : (
          <>
            <rect x="9" y="36" width="5" height="17" rx="2.5" fill={bd} style={isWalking ? { animation: 'vs-float 0.32s ease-in-out infinite alternate' } : {}} />
            <rect x="18" y="36" width="5" height="17" rx="2.5" fill={bd} style={isWalking ? { animation: 'vs-float 0.32s ease-in-out 0.16s infinite alternate' } : {}} />
          </>
        )}
        <rect x="7" y="21" width="18" height="17" rx="3.5" fill={bl} />
        <rect x="14" y="23" width="4" height="13" rx="2" fill={glowColor} opacity="0.28" />
        <circle cx="16" cy="26" r="2.2" fill={glowColor} opacity="0.5" />
        <circle cx="16" cy="26" r="1" fill="white" opacity="0.7" />
        <rect x="1" y="23" width="5.5" height="13" rx="2.5" fill={bd} />
        <rect x="25.5" y="23" width="5.5" height="13" rx="2.5" fill={bd} />
        <rect x="13" y="16" width="6" height="7" rx="2" fill={bl} />
        <circle cx="16" cy="9" r="9" fill={bl} />
        <circle cx="12.5" cy="6.5" r="4" fill="white" opacity="0.07" />
        <circle cx="12.5" cy="9" r="2.2" fill={glowColor} opacity="0.9" />
        <circle cx="19.5" cy="9" r="2.2" fill={glowColor} opacity="0.9" />
        <circle cx="12.5" cy="9" r="0.9" fill="white" opacity="0.95" />
        <circle cx="19.5" cy="9" r="0.9" fill="white" opacity="0.95" />
        <circle cx="12.5" cy="9" r="3" fill={glowColor} opacity="0.12" />
        <circle cx="19.5" cy="9" r="3" fill={glowColor} opacity="0.12" />
        {mask === 'half' && <><rect x="9" y="11" width="14" height="7" rx="3" fill="rgba(0,0,0,0.65)" stroke={glowColor} strokeWidth="0.6" opacity="0.95" /><line x1="10" y1="14" x2="22" y2="14" stroke={glowColor} strokeWidth="0.5" opacity="0.5" /></>}
        {mask === 'full' && <><circle cx="16" cy="9" r="8.5" fill="rgba(0,0,0,0.6)" stroke={glowColor} strokeWidth="0.8" opacity="0.95" /><rect x="9" y="7" width="14" height="4" rx="2" fill={glowColor} opacity="0.18" /></>}
        {mask === 'visor' && <><rect x="8" y="5.5" width="16" height="7" rx="3.5" fill={glowColor} opacity="0.28" /><rect x="8" y="5.5" width="16" height="7" rx="3.5" fill="none" stroke={glowColor} strokeWidth="0.8" opacity="0.9" /><line x1="8" y1="9" x2="24" y2="9" stroke={glowColor} strokeWidth="0.4" opacity="0.6" /></>}
        {isMe && <g transform="translate(12,-1)"><polygon points="4,0 5.5,3 4,2.5 2.5,3" fill={glowColor} opacity="0.9" /><rect x="2" y="2.5" width="4" height="1" rx="0.5" fill={glowColor} opacity="0.7" /></g>}
      </svg>
    </div>
  );
}



// ── Avatar on map ─────────────────────────────────────────────────────

function AvatarOnMap({ player, isMe, speaking }: { player: SpacePlayer; isMe: boolean; speaking: boolean }) {

  const prev = useRef({ x: player.x, y: player.y });
  const [walking, setWalking] = useState(false);
  const wt = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (prev.current.x !== player.x || prev.current.y !== player.y) {
      prev.current = { x: player.x, y: player.y };
      setWalking(true);
      if (wt.current) clearTimeout(wt.current);
      wt.current = setTimeout(() => setWalking(false), 350);
    }
    return () => { if (wt.current) clearTimeout(wt.current); };
  }, [player.x, player.y]);

  return (
    <div style={{ position: 'absolute', left: `${player.x}%`, top: `${player.y}%`, transform: 'translate(-50%, -100%)', transition: 'left 0.35s cubic-bezier(0.4,0,0.2,1), top 0.35s cubic-bezier(0.4,0,0.2,1)', zIndex: isMe ? 30 : 20, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <AnimatePresence>
        {player.message ? (
          <motion.div key={player.message + player.socketId} initial={{ opacity: 0, y: 8, scale: 0.88 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.88 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            style={{ position: 'relative', background: 'rgba(8,3,24,0.88)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14, padding: '6px 12px', maxWidth: 168, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.93)', boxShadow: `0 4px 20px rgba(0,0,0,0.5), 0 0 14px ${player.glowColor}28`, marginBottom: 4, wordBreak: 'break-word', lineHeight: 1.4 }}
          >
            {player.message}
            <div style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '6px solid rgba(255,255,255,0.1)' }} />
          </motion.div>
        ) : player.typing && !isMe ? (
          <motion.div key="typing" initial={{ opacity: 0, y: 6, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
            style={{ display: 'flex', gap: 3, alignItems: 'center', background: 'rgba(8,3,24,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '5px 9px', marginBottom: 4 }}
          >
            {[0, 1, 2].map(i => (
              <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: player.glowColor, animation: `vs-typing 1.2s ease-in-out ${i * 0.18}s infinite` }} />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <motion.div
        animate={player.seat ? { y: 0 } : walking ? { rotate: [-1.5, 1.5], y: [0, -2, 0] } : { y: [0, -3, 0] }}
        transition={player.seat ? { duration: 0.2 } : walking ? { duration: 0.28, repeat: Infinity, ease: 'easeInOut' } : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <HumanoidAvatar bodyColor={player.bodyColor} glowColor={player.glowColor} mask={player.mask} speaking={speaking} walking={walking} gesture={player.gesture} sitting={!!player.seat} isMe={isMe} />

      </motion.div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: isMe ? player.glowColor : 'rgba(255,255,255,0.65)', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', borderRadius: 6, padding: '1px 7px', border: isMe ? `1px solid ${player.glowColor}55` : '1px solid rgba(255,255,255,0.08)', letterSpacing: '0.04em', maxWidth: 96, marginTop: 2, boxShadow: isMe ? `0 0 8px ${player.glowColor}30` : 'none' }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: speaking ? player.glowColor : '#00ff88', boxShadow: `0 0 5px ${speaking ? player.glowColor : '#00ff88'}`, flexShrink: 0, animation: speaking ? 'vs-pulse 0.8s ease-in-out infinite' : undefined }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
      </div>
    </div>
  );
}

// ── Room objects ──────────────────────────────────────────────────────

function DJBoothGraphic({ active }: { active: boolean }) {
  const sd = active ? '0.75s' : '2.2s';
  const sr = active ? '0.6s' : '1.8s';
  const glow = active ? '0 0 44px rgba(255,0,150,.6),inset 0 1px 0 rgba(255,255,255,.1)' : '0 0 28px rgba(255,0,150,.3),inset 0 1px 0 rgba(255,255,255,.08)';
  return (
    <div style={{ position: 'relative', width: 90, height: 48, background: 'linear-gradient(180deg,rgba(255,0,150,.22),rgba(200,0,120,.1))', borderRadius: 10, border: `1px solid rgba(255,0,150,${active ? '.95' : '.55'})`, boxShadow: glow }}>
      {/* Left deck */}
      <div style={{ position: 'absolute', left: 8, top: 5, width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,0,150,.08)', border: '2px solid rgba(255,0,150,.7)', boxShadow: '0 0 14px rgba(255,0,150,.4)', overflow: 'hidden', animation: `vs-spin ${sd} linear infinite` }}>
        <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', border: '1.5px solid rgba(255,0,150,.5)' }} />
        <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: '1px solid rgba(255,0,150,.35)' }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'conic-gradient(rgba(255,0,150,.4) 0deg,transparent 60deg,rgba(255,0,150,.15) 180deg,transparent 240deg,rgba(255,0,150,.4) 360deg)' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 5, height: 5, marginLeft: -2.5, marginTop: -2.5, borderRadius: '50%', background: 'rgba(255,200,230,.9)' }} />
      </div>
      {/* Right deck */}
      <div style={{ position: 'absolute', right: 8, top: 5, width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,0,150,.08)', border: '2px solid rgba(255,0,150,.7)', boxShadow: '0 0 14px rgba(255,0,150,.4)', overflow: 'hidden', animation: `vs-spin-r ${sr} linear infinite` }}>
        <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', border: '1.5px solid rgba(255,0,150,.5)' }} />
        <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: '1px solid rgba(255,0,150,.35)' }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'conic-gradient(transparent 0deg,rgba(255,0,150,.4) 90deg,transparent 180deg,rgba(255,0,150,.2) 270deg,transparent 360deg)' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 5, height: 5, marginLeft: -2.5, marginTop: -2.5, borderRadius: '50%', background: 'rgba(255,200,230,.9)' }} />
      </div>
      {/* Faders */}
      <div style={{ position: 'absolute', left: '50%', top: 6, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ position: 'relative', width: 14, height: 2.5, background: 'rgba(255,0,150,.22)', borderRadius: 2, border: '1px solid rgba(255,0,150,.4)' }}>
            <div style={{ position: 'absolute', top: -2, left: `${25 + i * 15}%`, width: 4, height: 6, background: 'rgba(255,150,200,.9)', borderRadius: 1 }} />
          </div>
        ))}
      </div>
      {/* EQ bars */}
      <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 2.5, alignItems: 'flex-end', height: 18 }}>
        {(['vs-eq1','vs-eq2','vs-eq3','vs-eq4','vs-eq5','vs-eq2','vs-eq4'] as const).map((anim, i) => (
          <div key={i} style={{ width: 3, height: active ? undefined : 4, background: i < 2 ? 'rgba(0,255,150,.85)' : i < 5 ? 'rgba(255,220,0,.85)' : 'rgba(255,60,60,.85)', borderRadius: '1.5px 1.5px 0 0', animation: active ? `${anim} ${0.35 + i * 0.06}s ease-in-out infinite` : undefined, boxShadow: active ? '0 0 4px currentColor' : 'none' }} />
        ))}
      </div>
    </div>
  );
}

function GamingStation() {
  return (
    <div className="absolute pointer-events-none" style={{ left: '79%', top: '65%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      <div style={{ width: 62, height: 42, background: 'linear-gradient(135deg,rgba(0,10,30,.9),rgba(0,20,60,.8))', border: '2px solid rgba(0,229,255,.75)', borderRadius: 5, boxShadow: '0 0 24px rgba(0,229,255,.4),inset 0 0 12px rgba(0,100,255,.15)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 3, background: 'rgba(0,20,60,.6)' }}>
          {[25,50,75].map(p=><div key={p} style={{ position:'absolute',left:`${p}%`,top:0,bottom:0,width:1,background:'rgba(0,229,255,.08)' }}/>)}
          {[33,66].map(p=><div key={p} style={{ position:'absolute',top:`${p}%`,left:0,right:0,height:1,background:'rgba(0,229,255,.08)' }}/>)}
          <div style={{ position:'absolute',left:'55%',top:'40%',width:4,height:4,borderRadius:'50%',background:'#00e5ff',boxShadow:'0 0 6px #00e5ff',animation:'vs-pulse 1.2s ease-in-out infinite' }}/>
          <div style={{ position:'absolute',left:'20%',top:'25%',width:3,height:3,borderRadius:'50%',background:'#ff3366',boxShadow:'0 0 4px #ff3366' }}/>
          <div style={{ position:'absolute',left:'70%',top:'65%',width:3,height:3,borderRadius:'50%',background:'#ff3366',boxShadow:'0 0 4px #ff3366' }}/>
          <div style={{ position:'absolute',bottom:3,left:2,right:2,height:2.5,background:'rgba(255,255,255,.1)',borderRadius:1.5 }}><div style={{ height:'100%',borderRadius:1.5,background:'linear-gradient(90deg,#00ff88,#00cc66)',animation:'vs-hpulse 2.5s ease-in-out infinite' }}/></div>
        </div>
        <div style={{ position:'absolute',left:0,right:0,height:6,background:'linear-gradient(180deg,transparent,rgba(0,229,255,.18),transparent)',animation:'vs-scanline 2.8s linear infinite',pointerEvents:'none' }}/>
      </div>
      <div style={{ width:4,height:9,background:'rgba(0,229,255,.35)' }}/>
      <div style={{ width:26,height:5,background:'rgba(0,229,255,.22)',borderRadius:3,boxShadow:'0 0 8px rgba(0,229,255,.2)' }}/>
      <div style={{ position:'absolute',bottom:-8,left:-22,width:22,height:24,background:'rgba(0,80,120,.25)',borderRadius:'4px 4px 2px 2px',border:'1px solid rgba(0,229,255,.28)' }}/>
    </div>
  );
}

function Bar() {
  return (
    <div className="absolute pointer-events-none" style={{ left: '90%', top: '55%', transform: 'translate(-50%,-50%)' }}>
      <div style={{ position:'relative',width:18,height:64,background:'linear-gradient(90deg,rgba(255,140,0,.32),rgba(200,80,0,.16))',borderRadius:'6px 2px 2px 6px',border:'1px solid rgba(255,140,0,.6)',boxShadow:'0 0 22px rgba(255,140,0,.22),inset 1px 0 0 rgba(255,200,100,.1)' }}>
        <div style={{ position:'absolute',top:-3,left:-2,right:-4,height:6,background:'rgba(255,160,0,.3)',borderRadius:'4px 2px 0 0',border:'1px solid rgba(255,140,0,.5)' }}/>
      </div>
      <div style={{ position:'absolute',top:8,left:20,display:'flex',gap:4 }}>
        {[{c:'rgba(255,80,0,.85)',bc:'#ff5000'},{c:'rgba(100,220,255,.85)',bc:'#64dcff'},{c:'rgba(180,0,255,.85)',bc:'#b400ff'}].map(({c,bc},i)=>(
          <div key={i} style={{ position:'relative',width:5,height:16,background:c,borderRadius:'2px 2px 0 0',boxShadow:`0 0 8px ${c}` }}>
            <div style={{ position:'absolute',top:2,left:1,width:2,height:2,borderRadius:'50%',background:bc,opacity:0.85,animation:`vs-bubble ${1.2+i*0.4}s ease-in ${i*0.3}s infinite` }}/>
          </div>
        ))}
      </div>
      <div style={{ position:'absolute',top:-22,left:'50%',transform:'translateX(-50%)',fontFamily:'monospace',fontSize:8,letterSpacing:'0.22em',color:'rgba(255,140,0,.95)',textShadow:'0 0 8px rgba(255,140,0,.9),0 0 18px rgba(255,140,0,.5)',whiteSpace:'nowrap',animation:'vs-pulse 3s ease-in-out infinite' }}>BAR</div>
    </div>
  );
}

function Plant({ flip }: { flip?: boolean }) {
  return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',transformOrigin:'bottom center' }}>
      <div style={{ position:'relative',width:24,height:28,transformOrigin:'bottom center',animation:'vs-sway 2.8s ease-in-out infinite' }}>
        <div style={{ position:'absolute',bottom:0,left:-4,width:14,height:22,background:'rgba(0,200,80,.22)',border:'1px solid rgba(0,220,80,.45)',borderRadius:'80% 10% 10% 30%',transform:'rotate(-15deg)',transformOrigin:'bottom right',boxShadow:'0 0 8px rgba(0,200,80,.2)',animation:`vs-sway 2.1s ease-in-out infinite ${flip?'0.5s':'0s'}` }}/>
        <div style={{ position:'absolute',bottom:0,right:-4,width:14,height:22,background:'rgba(0,200,80,.22)',border:'1px solid rgba(0,220,80,.45)',borderRadius:'10% 80% 30% 10%',transform:'rotate(15deg)',transformOrigin:'bottom left',boxShadow:'0 0 8px rgba(0,200,80,.2)',animation:`vs-sway 2.4s ease-in-out reverse infinite ${flip?'0s':'0.3s'}` }}/>
        <div style={{ position:'absolute',bottom:0,left:'50%',marginLeft:-1,width:2,height:18,background:'rgba(0,180,60,.35)' }}/>
      </div>
      <div style={{ width:22,height:9,background:'rgba(40,20,10,.5)',border:'1px solid rgba(0,200,80,.3)',borderRadius:'0 0 5px 5px',boxShadow:'0 0 6px rgba(0,200,80,.12)' }}/>
    </div>
  );
}

function RoomObjects({ djActive, onDJClick, decor }: { djActive: boolean; onDJClick: () => void; decor: 'lounge' | 'home' }) {
  const home = decor === 'home';
  return (
    <>
      {/* Wall strips — warm amber for home, neon for lounge */}
      <div className="absolute pointer-events-none" style={{ left:5,top:0,bottom:'63%',width:2,background:home?'linear-gradient(180deg,rgba(255,170,80,0) 0%,rgba(255,170,80,.7) 55%,rgba(255,170,80,0) 100%)':'linear-gradient(180deg,rgba(155,0,255,0) 0%,rgba(155,0,255,.85) 55%,rgba(155,0,255,0) 100%)',boxShadow:home?'0 0 14px rgba(255,170,80,.4)':'0 0 14px rgba(155,0,255,.6)',borderRadius:2 }}/>
      <div className="absolute pointer-events-none" style={{ right:5,top:0,bottom:'63%',width:2,background:home?'linear-gradient(180deg,rgba(255,140,90,0) 0%,rgba(255,140,90,.7) 55%,rgba(255,140,90,0) 100%)':'linear-gradient(180deg,rgba(0,229,255,0) 0%,rgba(0,229,255,.85) 55%,rgba(0,229,255,0) 100%)',boxShadow:home?'0 0 14px rgba(255,140,90,.4)':'0 0 14px rgba(0,229,255,.6)',borderRadius:2 }}/>
      {/* Wall/floor divider */}
      <div className="absolute pointer-events-none" style={{ left:0,right:0,top:'37%',height:2.5,background:home?'linear-gradient(90deg,rgba(255,170,80,.3),rgba(255,200,120,.8),rgba(255,150,90,.6),rgba(255,200,120,.8),rgba(255,170,80,.3))':'linear-gradient(90deg,rgba(155,0,255,.4),rgba(0,229,255,.9),rgba(255,0,150,.7),rgba(0,229,255,.9),rgba(155,0,255,.4))',boxShadow:home?'0 0 16px rgba(255,180,100,.4)':'0 0 16px rgba(0,229,255,.5),0 0 32px rgba(155,0,255,.25)' }}/>
      {/* Sign */}
      <div className="absolute pointer-events-none" style={{ left:'50%',top:'9%',transform:'translate(-50%,-50%)',fontFamily:'"Space Grotesk",monospace',fontWeight:900,fontSize:13,letterSpacing:'0.28em',color:'#fff',textShadow:home?'0 0 6px #ffb060,0 0 16px #ff9040,0 0 36px rgba(255,160,80,.6)':'0 0 6px #00e5ff,0 0 16px #00e5ff,0 0 36px rgba(0,229,255,.7),0 0 60px rgba(0,229,255,.3)',animation:'vs-flicker 6s linear infinite',whiteSpace:'nowrap' }}>{home?'HOME CINEMA':'VOID LOUNGE'}</div>

      {/* DJ BOOTH — clickable (right wall) */}
      <div className="absolute pointer-events-none" style={{ left:'85%',top:'50%',transform:'translate(-50%,-50%)',width:140,height:80,background:`radial-gradient(ellipse,rgba(255,0,150,${djActive?'.28':'.16'}) 0%,transparent 70%)`,borderRadius:'50%',animation:'vs-pulse 2s ease-in-out infinite' }}/>
      <div className="absolute pointer-events-none" style={{ left:'85%',top:'41%',transform:'translate(-50%,-50%)',fontFamily:'monospace',fontSize:8,letterSpacing:'0.22em',color:'rgba(255,0,150,.8)',textShadow:'0 0 8px rgba(255,0,150,.7)' }}>DJ BOOTH</div>
      <button onClick={e=>{e.stopPropagation();onDJClick();}} style={{ position:'absolute',left:'85%',top:'50%',transform:'translate(-50%,-50%)',cursor:'pointer',background:'transparent',border:'none',padding:0,zIndex:15,display:'flex',flexDirection:'column',alignItems:'center',gap:3 }} title="DJ Booth">
        <DJBoothGraphic active={djActive} />
        <span style={{ fontFamily:'monospace',fontSize:8,color:`rgba(255,0,150,${djActive?'.9':'.55'})`,letterSpacing:'0.1em' }}>{djActive?'▶ PLAYING':'↑ TAP TO DJ'}</span>
      </button>

      {/* Plants (both layouts) */}
      <div className="absolute pointer-events-none" style={{ left:'7%',top:'14%',transform:'translate(-50%,-50%)' }}><Plant/></div>
      <div className="absolute pointer-events-none" style={{ left:'93%',top:'14%',transform:'translate(-50%,-50%)' }}><Plant flip/></div>

      {home ? (
        <>
          {/* warm room glow */}
          <div className="absolute pointer-events-none" style={{ left:'50%',top:'55%',transform:'translate(-50%,-50%)',width:'80%',height:'55%',background:'radial-gradient(ellipse,rgba(255,160,80,.10) 0%,transparent 70%)',borderRadius:'50%' }}/>
          {/* round rug / dance + move floor */}
          <div className="absolute pointer-events-none" style={{ left:'50%',top:'66%',transform:'translate(-50%,-50%)',width:'52%',maxWidth:300,aspectRatio:'1.7 / 1',borderRadius:'50%',background:'radial-gradient(ellipse, rgba(255,150,70,.16) 0%, rgba(180,90,40,.08) 55%, transparent 75%)',border:'1.5px dashed rgba(255,170,90,.35)',boxShadow:'inset 0 0 30px rgba(255,140,60,.12)' }}/>
          <div className="absolute pointer-events-none" style={{ left:'50%',top:'58%',transform:'translate(-50%,-50%)',fontFamily:'monospace',fontSize:8,letterSpacing:'0.24em',color:'rgba(255,180,100,.8)',textShadow:'0 0 8px rgba(255,150,70,.6)' }}>🪩 DANCE FLOOR</div>
          {/* floor lamp (left) */}
          <div className="absolute pointer-events-none" style={{ left:'12%',top:'60%',transform:'translate(-50%,-50%)',display:'flex',flexDirection:'column',alignItems:'center' }}>
            <div style={{ width:20,height:12,background:'radial-gradient(ellipse,rgba(255,210,140,.9),rgba(255,170,80,.3))',borderRadius:'10px 10px 3px 3px',boxShadow:'0 0 22px rgba(255,190,110,.7)' }}/>
            <div style={{ width:2,height:30,background:'rgba(120,90,60,.6)' }}/>
            <div style={{ width:14,height:4,background:'rgba(120,90,60,.5)',borderRadius:2 }}/>
          </div>
          {/* side table with plant (right) */}
          <div className="absolute pointer-events-none" style={{ left:'88%',top:'70%',transform:'translate(-50%,-50%)' }}>
            <div style={{ width:30,height:14,background:'rgba(90,60,40,.5)',border:'1px solid rgba(255,170,90,.3)',borderRadius:6 }}/>
          </div>
        </>
      ) : (
        <>
          {/* Lounge */}
          <div className="absolute pointer-events-none" style={{ left:'15%',top:'72%',transform:'translate(-50%,-50%)',width:180,height:110,background:'radial-gradient(ellipse,rgba(120,0,255,.12) 0%,transparent 70%)',borderRadius:'50%' }}/>
          <div className="absolute pointer-events-none" style={{ left:'15%',top:'55%',transform:'translate(-50%,-50%)',fontFamily:'monospace',fontSize:8,letterSpacing:'0.2em',color:'rgba(155,0,255,.85)',textShadow:'0 0 8px rgba(155,0,255,.7)' }}>LOUNGE</div>
          <div className="absolute pointer-events-none" style={{ left:'13%',top:'74%',transform:'translate(-50%,-50%)' }}>
            <div style={{ position:'relative',width:90,height:50 }}>
              <div style={{ position:'absolute',top:0,left:0,right:0,height:22,background:'linear-gradient(180deg,rgba(130,0,255,.4),rgba(85,0,200,.2))',borderRadius:'9px 9px 0 0',border:'1.5px solid rgba(155,0,255,.6)',boxShadow:'0 0 20px rgba(155,0,255,.3),inset 0 1px 0 rgba(255,255,255,.07)' }}/>
              <div style={{ position:'absolute',top:20,left:9,right:9,height:26,background:'rgba(105,0,210,.2)',borderRadius:'0 0 7px 7px',border:'1px solid rgba(155,0,255,.3)',borderTop:'none' }}/>
              <div style={{ position:'absolute',top:0,left:0,width:12,height:46,background:'rgba(130,0,255,.32)',borderRadius:'7px 0 0 7px',border:'1px solid rgba(155,0,255,.4)' }}/>
              <div style={{ position:'absolute',top:0,right:0,width:12,height:46,background:'rgba(130,0,255,.32)',borderRadius:'0 7px 7px 0',border:'1px solid rgba(155,0,255,.4)' }}/>
              <div style={{ position:'absolute',top:2,left:'50%',marginLeft:-0.5,width:1,height:18,background:'rgba(155,0,255,.35)' }}/>
            </div>
          </div>
          <div className="absolute pointer-events-none" style={{ left:'25%',top:'79%',transform:'translate(-50%,-50%)',width:46,height:22,background:'rgba(85,0,170,.18)',borderRadius:8,border:'1px solid rgba(155,0,255,.35)',boxShadow:'0 0 12px rgba(155,0,255,.15)' }}/>

          {/* Gaming */}
          <div className="absolute pointer-events-none" style={{ left:'79%',top:'68%',transform:'translate(-50%,-50%)',width:170,height:110,background:'radial-gradient(ellipse,rgba(0,200,255,.1) 0%,transparent 70%)',borderRadius:'50%' }}/>
          <div className="absolute pointer-events-none" style={{ left:'78%',top:'53%',transform:'translate(-50%,-50%)',fontFamily:'monospace',fontSize:8,letterSpacing:'0.2em',color:'rgba(0,229,255,.85)',textShadow:'0 0 8px rgba(0,229,255,.7)' }}>GAMING</div>
          <GamingStation/>

          {/* Bar */}
          <div className="absolute pointer-events-none" style={{ left:'88%',top:'56%',transform:'translate(-50%,-50%)',width:90,height:130,background:'radial-gradient(ellipse,rgba(255,140,0,.1) 0%,transparent 70%)',borderRadius:'50%' }}/>
          <Bar/>
        </>
      )}
    </>
  );
}

// ── Perspective floor ─────────────────────────────────────────────────

function PerspectiveFloor() {
  const VX = 50, VY = 37;
  const rays = [0,9,18,27,36,43,50,57,64,73,82,91,100];
  const hLines = [{y:46},{y:55},{y:65},{y:77},{y:90}];
  return (
    <>
      <svg className="absolute pointer-events-none" style={{ left:0,top:0,width:'100%',height:`${VY}%` }} preserveAspectRatio="none">
        {[18,42,68,88].map((yp,i)=><line key={i} x1="0" y1={`${yp}%`} x2="100%" y2={`${yp}%`} stroke="rgba(0,229,255,.12)" strokeWidth="0.8"/>)}
        {[16,32,50,68,84].map((xp,i)=><line key={i} x1={`${xp}%`} y1="0" x2={`${xp}%`} y2="100%" stroke="rgba(120,0,255,.09)" strokeWidth="0.8"/>)}
      </svg>
      <svg className="absolute inset-0 pointer-events-none" style={{ width:'100%',height:'100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon points={`${VX},${VY} ${VX},${VY} 34,100 0,100`}   fill="rgba(120,0,255,.07)"/>
        <polygon points={`${VX},${VY} ${VX},${VY} 66,100 34,100`}  fill="rgba(255,0,150,.04)"/>
        <polygon points={`${VX},${VY} ${VX},${VY} 100,100 66,100`} fill="rgba(0,200,255,.07)"/>
        {rays.map((bx,i)=>(
          <line key={i} x1={VX} y1={VY} x2={bx} y2={100} stroke={bx<=34?'rgba(120,0,255,.65)':bx>=66?'rgba(0,229,255,.65)':'rgba(255,0,150,.55)'} strokeWidth="0.32"/>
        ))}
        {hLines.map(({y},i)=>{
          const t=(y-VY)/(100-VY);
          return <line key={i} x1={VX*(1-t)} y1={y} x2={VX+(100-VX)*t} y2={y} stroke="rgba(180,120,255,.7)" strokeWidth="0.32" opacity={0.38+i*0.11}/>;
        })}
      </svg>
    </>
  );
}

// ── Particles ─────────────────────────────────────────────────────────

const PARTICLES = Array.from({length:22},(_,i)=>({
  x:4+((i*53+11)%88), y:6+((i*67+19)%84),
  color:['#9b00ff','#00e5ff','#ff00aa','#00ff88'][i%4],
  size:1.5+(i%3)*0.5, dur:3+(i%6), del:(i*0.55)%4,
}));

function Particles() {
  return <>{PARTICLES.map((p,i)=>(
    <div key={i} style={{ position:'absolute',left:`${p.x}%`,top:`${p.y}%`,width:p.size,height:p.size,borderRadius:'50%',background:p.color,opacity:0.5,pointerEvents:'none',animation:`vs-drift ${p.dur}s ease-in-out ${p.del}s infinite`,boxShadow:`0 0 ${p.size*2}px ${p.color}` }}/>
  ))}</>;
}

// ── DJ Player Panel ───────────────────────────────────────────────────

function DJPlayerPanel({
  open, onClose, djState, myName, ytReady, localPlaying,
  onPlayDirect, onPlaySearch, onPause, onStop, onStartListening, onStopListening,
  volume, onVolume,
}: {
  open: boolean; onClose: () => void;
  djState: DJState | null; myName: string;
  ytReady: boolean; localPlaying: boolean;
  onPlayDirect: (videoId: string) => void;
  onPlaySearch: (query: string) => void;
  onPause: () => void; onStop: () => void;
  onStartListening: () => void; onStopListening: () => void;
  volume: number; onVolume: (v: number) => void;
}) {
  const [input, setInput] = useState('');
  const [searching, setSearching] = useState(false);
  const iAmDJ = djState?.isPlaying && djState.djName === myName;
  const isListener = djState?.isPlaying && !iAmDJ;

  useEffect(() => {
    if (!djState?.isPlaying) setSearching(false);
  }, [djState?.isPlaying]);

  function handlePlay() {
    const vid = extractVideoId(input);
    if (vid) {
      onPlayDirect(vid);
    } else if (input.trim()) {
      setSearching(true);
      onPlaySearch(input.trim());
    }
    setInput('');
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 32 }}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 80, background: 'rgba(4,0,18,0.97)', backdropFilter: 'blur(24px)', borderTop: '1.5px solid rgba(255,0,150,.35)', borderRadius: '18px 18px 0 0', boxShadow: '0 -12px 48px rgba(255,0,150,.2)', padding: '16px 16px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom,0px))' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14 }}>
            <div style={{ display:'flex',alignItems:'center',gap:8 }}>
              <span style={{ fontSize:18 }}>🎛</span>
              <span style={{ fontFamily:'monospace',fontSize:12,color:'rgba(255,0,150,.95)',letterSpacing:'0.14em' }}>DJ BOOTH</span>
              {djState?.isPlaying && (
                <span style={{ fontFamily:'monospace',fontSize:9,color:'rgba(255,0,150,.65)',letterSpacing:'0.08em',animation:'vs-pulse 1.5s ease-in-out infinite' }}>
                  ● LIVE · {djState.djName}
                </span>
              )}
            </div>
            <button onClick={onClose} style={{ background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',color:'rgba(255,255,255,.4)',borderRadius:10,width:30,height:30,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>
          </div>

          {/* DJ input — shown when no one is playing, or I am the DJ */}
          {(!djState?.isPlaying || iAmDJ) && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display:'flex',gap:8 }}>
                <input
                  value={input} onChange={e=>{setInput(e.target.value);setSearching(false);}}
                  onKeyDown={e=>{ if(e.key==='Enter') handlePlay(); }}
                  placeholder="YouTube URL, ID, ან სიმღერის სახელი…"
                  style={{ flex:1,background:'rgba(255,255,255,.05)',fontFamily:'monospace',fontSize:12,color:'white',outline:'none',padding:'9px 12px',borderRadius:10,border:'1px solid rgba(255,0,150,.28)' }}
                  onFocus={e=>e.stopPropagation()}
                />
                <button onClick={handlePlay} disabled={!input.trim() || !ytReady} style={{ padding:'9px 16px',borderRadius:10,fontFamily:'monospace',fontSize:12,background:'rgba(255,0,150,.2)',border:'1px solid rgba(255,0,150,.55)',color:'rgba(255,150,200,.95)',cursor:'pointer',flexShrink:0,whiteSpace:'nowrap',opacity:(!input.trim()||!ytReady)?0.45:1 }}>
                  {searching ? '⟳' : '▶ Play'}
                </button>
              </div>
              <p style={{ fontFamily:'monospace',fontSize:9,color:'rgba(255,255,255,.22)',marginTop:5,paddingLeft:2 }}>
                URL, video ID, ან მოძებნე სიმღერის სახელით
              </p>
            </div>
          )}

          {/* Now playing card */}
          {djState?.isPlaying && (
            <div style={{ background:'rgba(255,0,150,.08)',border:'1px solid rgba(255,0,150,.22)',borderRadius:12,padding:'10px 14px',marginBottom:14 }}>
              <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                <span style={{ fontSize:20,animation:'vs-pulse 2s ease-in-out infinite' }}>🎵</span>
                <div style={{ flex:1,minWidth:0 }}>
                  <p style={{ fontFamily:'monospace',fontSize:10,color:'rgba(255,150,200,.95)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                    {searching ? 'ძიება…' : `youtu.be/${djState.videoId}`}
                  </p>
                  <p style={{ fontFamily:'monospace',fontSize:9,color:'rgba(255,255,255,.3)',marginTop:2 }}>DJ: {djState.djName}</p>
                </div>
                {iAmDJ && (
                  <div style={{ display:'flex',gap:6,flexShrink:0 }}>
                    <button onClick={onPause} style={{ padding:'5px 10px',borderRadius:8,fontFamily:'monospace',fontSize:11,background:'rgba(255,200,0,.1)',border:'1px solid rgba(255,200,0,.3)',color:'rgba(255,220,60,.9)',cursor:'pointer' }}>⏸</button>
                    <button onClick={onStop}  style={{ padding:'5px 10px',borderRadius:8,fontFamily:'monospace',fontSize:11,background:'rgba(255,50,50,.1)', border:'1px solid rgba(255,60,60,.3)', color:'rgba(255,100,100,.9)',cursor:'pointer' }}>■</button>
                  </div>
                )}
              </div>

              {/* Listener controls */}
              {isListener && (
                <div style={{ marginTop:10,display:'flex',gap:8 }}>
                  {localPlaying ? (
                    <button onClick={onStopListening} style={{ flex:1,padding:'8px 0',borderRadius:10,fontFamily:'monospace',fontSize:12,background:'rgba(255,0,150,.12)',border:'1px solid rgba(255,0,150,.4)',color:'rgba(255,150,200,.9)',cursor:'pointer' }}>
                      ⏸ გაჩუმება
                    </button>
                  ) : (
                    <button onClick={onStartListening} style={{ flex:1,padding:'8px 0',borderRadius:10,fontFamily:'monospace',fontSize:13,background:'rgba(255,0,150,.18)',border:'1.5px solid rgba(255,0,150,.6)',color:'rgba(255,180,210,.95)',cursor:'pointer',boxShadow:'0 0 18px rgba(255,0,150,.25)' }}>
                      ▶ მოსმენა
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Volume */}
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            <span style={{ fontFamily:'monospace',fontSize:11,color:'rgba(255,255,255,.28)',flexShrink:0 }}>🔈</span>
            <input type="range" min={0} max={100} value={volume}
              onChange={e=>onVolume(Number(e.target.value))}
              style={{ flex:1,accentColor:'#ff0096',cursor:'pointer' }}
            />
            <span style={{ fontFamily:'monospace',fontSize:10,color:'rgba(255,255,255,.28)',flexShrink:0,width:24,textAlign:'right' }}>{volume}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Now playing bar (tap to open panel & start listening) ─────────────

function NowPlayingBar({ djState, localPlaying, onOpen, onStartListening }: {
  djState: DJState | null; localPlaying: boolean;
  onOpen: () => void; onStartListening: () => void;
}) {
  if (!djState?.isPlaying) return null;
  return (
    <div style={{ position:'absolute',top:8,left:'50%',transform:'translateX(-50%)',zIndex:60,display:'flex',alignItems:'center',gap:6,background:'rgba(4,0,18,0.88)',backdropFilter:'blur(16px)',border:'1px solid rgba(255,0,150,.35)',borderRadius:22,boxShadow:'0 4px 20px rgba(255,0,150,.15)',overflow:'hidden' }}>
      <button
        onClick={e=>{e.stopPropagation();onOpen();}}
        style={{ padding:'6px 10px 6px 14px',display:'flex',alignItems:'center',gap:6,background:'transparent',border:'none',cursor:'pointer' }}
      >
        <span style={{ fontSize:11,animation:'vs-pulse 1.4s ease-in-out infinite' }}>🎵</span>
        <span style={{ fontFamily:'monospace',fontSize:10,color:'rgba(255,180,200,.9)',letterSpacing:'0.05em',whiteSpace:'nowrap',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis' }}>
          {djState.djName}
        </span>
      </button>
      {!localPlaying && (
        <button
          onClick={e=>{e.stopPropagation();onStartListening();}}
          style={{ padding:'6px 14px 6px 6px',background:'transparent',border:'none',cursor:'pointer',fontFamily:'monospace',fontSize:10,color:'rgba(255,0,150,.95)',whiteSpace:'nowrap',letterSpacing:'0.06em' }}
        >
          ▶ მოსმენა
        </button>
      )}
      {localPlaying && (
        <div style={{ padding:'6px 14px 6px 4px',fontFamily:'monospace',fontSize:10,color:'rgba(255,0,150,.7)',letterSpacing:'0.06em',animation:'vs-pulse 1.2s ease-in-out infinite' }}>
          ♫ ისმის
        </div>
      )}
    </div>
  );
}

// ── Avatar customizer ─────────────────────────────────────────────────

function AvatarCustomizer({ playerName, onJoin }: { playerName: string; onJoin: (b: string, g: string, m: SpaceMask) => void }) {
  const [bodyColor, setBodyColor] = useState(() => localStorage.getItem(LS_BODY) ?? BODY_COLORS[0]);
  const [glowColor, setGlowColor] = useState(() => localStorage.getItem(LS_GLOW) ?? GLOW_COLORS[0]);
  const [mask, setMask] = useState<SpaceMask>(() => (localStorage.getItem(LS_MASK) as SpaceMask) ?? 'none');
  function go() { localStorage.setItem(LS_BODY,bodyColor); localStorage.setItem(LS_GLOW,glowColor); localStorage.setItem(LS_MASK,mask); onJoin(bodyColor,glowColor,mask); }
  return (
    <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} className="flex flex-col items-center gap-5 px-5 py-6">
      <div className="flex flex-col items-center gap-2">
        <div style={{ width:80,height:80,display:'flex',alignItems:'center',justifyContent:'center',background:`radial-gradient(ellipse at 40% 35%, ${glowColor}18, transparent 70%), rgba(8,3,24,.7)`,borderRadius:'50%',border:`1.5px solid ${bodyColor}55`,boxShadow:`0 0 0 4px ${bodyColor}20, 0 0 30px ${glowColor}30` }}>
          <HumanoidAvatar bodyColor={bodyColor} glowColor={glowColor} mask={mask} size={1.3} isMe />
        </div>
        <p style={{ fontFamily:'monospace',fontSize:11,color:bodyColor,textShadow:`0 0 8px ${bodyColor}80`,letterSpacing:'0.1em' }}>{playerName}</p>
      </div>
      <div className="w-full"><p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-2">სხეულის ფერი</p>
        <div className="flex gap-2 flex-wrap">{BODY_COLORS.map(c=><button key={c} onClick={()=>setBodyColor(c)} style={{ width:30,height:30,borderRadius:'50%',background:c,flexShrink:0,border:bodyColor===c?'2.5px solid white':'2px solid transparent',boxShadow:bodyColor===c?`0 0 12px ${c}, 0 0 0 2px ${c}40`:'none',transition:'all .15s' }}/>)}</div>
      </div>
      <div className="w-full"><p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-2">გლოვის ფერი</p>
        <div className="flex gap-2 flex-wrap">{GLOW_COLORS.map(c=><button key={c} onClick={()=>setGlowColor(c)} style={{ width:30,height:30,borderRadius:'50%',background:c,flexShrink:0,border:glowColor===c?'2.5px solid white':'2px solid transparent',boxShadow:glowColor===c?`0 0 12px ${c}, 0 0 0 2px ${c}40`:'none',transition:'all .15s' }}/>)}</div>
      </div>
      <div className="w-full"><p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-2">ნიღაბი</p>
        <div className="flex gap-2">{MASKS.map(m=><button key={m.id} onClick={()=>setMask(m.id)} className="flex-1 py-1.5 rounded-xl font-mono text-[11px] uppercase tracking-wider transition-all active:scale-95" style={{ background:mask===m.id?`${bodyColor}22`:'rgba(255,255,255,0.03)',border:`1px solid ${mask===m.id?bodyColor+'80':'rgba(255,255,255,0.08)'}`,color:mask===m.id?bodyColor:'rgba(255,255,255,0.3)',boxShadow:mask===m.id?`0 0 10px ${bodyColor}30`:'none' }}>{m.label}</button>)}</div>
      </div>
      <button onClick={go} className="w-full py-3.5 rounded-2xl font-display font-bold text-sm uppercase tracking-widest transition-all active:scale-95" style={{ background:`linear-gradient(135deg, ${bodyColor}30, ${bodyColor}15)`,border:`1.5px solid ${bodyColor}`,color:bodyColor,boxShadow:`0 0 28px ${bodyColor}40, inset 0 0 20px ${bodyColor}08`,letterSpacing:'0.14em' }}>
        Void Lounge-ში შესვლა →
      </button>
      <p className="font-mono text-[10px] text-white/20 text-center leading-relaxed">ხმოვანი ჩატი ავტომატურად ჩაირთება.<br/>მიკროფონის ნებართვა საჭიროა.</p>
    </motion.div>
  );
}

// ── Chat drawer ───────────────────────────────────────────────────────

function ChatDrawer({ history, mySocketId, open }: {
  history: { socketId: string; name: string; bodyColor: string; glowColor: string; message: string; ts: number }[];
  mySocketId: string; open: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [open, history.length]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{x:'100%',opacity:0}} animate={{x:0,opacity:1}} exit={{x:'100%',opacity:0}} transition={{type:'spring',stiffness:320,damping:30}}
          style={{ position:'absolute',top:0,right:0,bottom:0,width:220,background:'rgba(4,0,18,0.92)',backdropFilter:'blur(16px)',borderLeft:'1px solid rgba(155,0,255,0.15)',zIndex:50,display:'flex',flexDirection:'column' }}
          onClick={e=>e.stopPropagation()}
        >
          <div style={{ padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,0.06)',flexShrink:0 }}>
            <p style={{ fontFamily:'monospace',fontSize:10,color:'rgba(255,255,255,0.3)',letterSpacing:'0.15em',textTransform:'uppercase' }}>ჩატი · {history.length}</p>
          </div>
          <div style={{ flex:1,overflowY:'auto',padding:'8px 10px',display:'flex',flexDirection:'column',gap:6 }}>
            {history.length===0 && <p style={{ fontFamily:'monospace',fontSize:10,color:'rgba(255,255,255,0.15)',textAlign:'center',paddingTop:20 }}>ჯერ გზავნილები არ არის</p>}
            {history.map((msg,i)=>{
              const own=msg.socketId===mySocketId;
              return (
                <div key={i} style={{ display:'flex',flexDirection:'column',gap:1,alignItems:own?'flex-end':'flex-start' }}>
                  <span style={{ fontFamily:'monospace',fontSize:9,color:own?msg.glowColor:msg.bodyColor,opacity:0.8 }}>{own?'მე':msg.name}</span>
                  <div style={{ maxWidth:'92%',background:own?`${msg.glowColor}18`:'rgba(255,255,255,0.06)',border:`1px solid ${own?msg.glowColor+'40':'rgba(255,255,255,0.08)'}`,borderRadius:own?'12px 12px 4px 12px':'12px 12px 12px 4px',padding:'5px 9px',fontSize:12,color:'rgba(255,255,255,0.88)',wordBreak:'break-word',lineHeight:1.4 }}>{msg.message}</div>
                  <span style={{ fontFamily:'monospace',fontSize:9,color:'rgba(255,255,255,0.2)' }}>{new Date(msg.ts).toLocaleTimeString('ka',{hour:'2-digit',minute:'2-digit'})}</span>
                </div>
              );
            })}
            <div ref={bottomRef}/>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Cinema seat (couch / chair / pouf) ─────────────────────────────────

function CinemaSeat({ seat, occupant, isMine, onTap }: {
  seat: SeatDef;
  occupant: SpacePlayer | undefined;
  isMine: boolean;
  onTap: () => void;
}) {
  const taken = !!occupant && !isMine;
  const accent = isMine ? (occupant?.glowColor ?? '#00e5ff') : '#5b3a8a';
  const dims = seat.type === 'couch' ? { w: 64, h: 22 } : seat.type === 'chair' ? { w: 38, h: 22 } : { w: 26, h: 16 };
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (!taken) onTap(); }}
      // Stop the tap from reaching the world's tap-to-walk handler (touchstart fires
      // first on mobile and would queue a move that stands you right back up).
      onTouchStart={(e) => { e.stopPropagation(); }}
      onPointerDown={(e) => { e.stopPropagation(); }}
      style={{
        position: 'absolute', left: `${seat.x}%`, top: `${seat.y}%`,
        transform: 'translate(-50%, -42%)', zIndex: 16,
        background: 'transparent', border: 'none', padding: 0,
        cursor: taken ? 'default' : 'pointer', pointerEvents: 'auto',
        width: dims.w, height: dims.h + 10,
      }}
      aria-label={`seat ${seat.id}`}
    >
      {/* seat base */}
      <div style={{
        position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: dims.w, height: dims.h, borderRadius: seat.type === 'pouf' ? '50%' : '10px 10px 6px 6px',
        background: `linear-gradient(180deg, ${accent}33, rgba(10,4,24,.85))`,
        border: `1.5px solid ${isMine ? accent + 'cc' : taken ? 'rgba(255,255,255,.12)' : accent + '55'}`,
        boxShadow: isMine ? `0 0 16px ${accent}66` : taken ? 'none' : `0 0 8px ${accent}22`,
        transition: 'all .2s',
      }} />
      {/* backrest for couch/chair */}
      {seat.type !== 'pouf' && (
        <div style={{
          position: 'absolute', bottom: dims.h - 5, left: '50%', transform: 'translateX(-50%)',
          width: dims.w - 6, height: 9, borderRadius: '8px 8px 0 0',
          background: `linear-gradient(180deg, ${accent}44, ${accent}1f)`,
          border: `1.5px solid ${isMine ? accent + 'aa' : taken ? 'rgba(255,255,255,.1)' : accent + '44'}`,
          borderBottom: 'none',
        }} />
      )}
      {/* free-seat hint */}
      {!occupant && (
        <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', fontSize: 9, fontFamily: 'monospace', color: `${accent}cc`, whiteSpace: 'nowrap', opacity: 0.7 }}>დაჯექი</div>
      )}
    </button>
  );
}

// ── Cinema TV (synced watch party) ────────────────────────────────────

function CinemaTV({ tvState, canControl, myDist, viewerCount, tvX = 50, tvY = 17 }: {
  tvState: TVState | null;
  canControl: boolean;
  myDist: number;
  viewerCount: number;
  tvX?: number;
  tvY?: number;
}) {
  const screenRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);
  const curVidRef = useRef('');
  const pendingSearchRef = useRef(false);
  const farTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [fade, setFade] = useState(false);

  const near = myDist <= TV_NEAR_RADIUS;
  const hasVideo = !!tvState?.videoId;

  // Keep latest tvState in a ref for callbacks/intervals.
  const stateRef = useRef<TVState | null>(tvState);
  useEffect(() => { stateRef.current = tvState; }, [tvState]);

  // Autoplay is blocked without a user gesture — when the browser refuses to
  // start playback, arm a one-time gesture listener so the next tap resumes it.
  const gestureArmedRef = useRef(false);
  const [needsTap, setNeedsTap] = useState(false);
  const armGesturePlay = () => {
    if (gestureArmedRef.current) return;
    gestureArmedRef.current = true;
    setNeedsTap(true);
    const retry = () => {
      gestureArmedRef.current = false;
      setNeedsTap(false);
      const s = stateRef.current;
      if (_ytTv && readyRef.current && s?.isPlaying) { tvSeekP(tvComputedPos(s)); tvPlayP(); }
    };
    document.addEventListener('touchstart', retry, { once: true, passive: true });
    document.addEventListener('click', retry, { once: true });
  };

  // Apply the current server state to the local player (load/seek/play/pause).
  const applyState = () => {
    const s = stateRef.current;
    if (!_ytTv || !readyRef.current || !s) return;
    const pos = tvComputedPos(s);
    if (s.videoId !== curVidRef.current) {
      curVidRef.current = s.videoId;
      setFade(true);
      setTimeout(() => setFade(false), 320);
      if (s.isPlaying) tvLoad(s.videoId, pos); else tvCue(s.videoId, pos);
    } else {
      const drift = Math.abs(tvGetTimeP() - pos);
      if (s.isPlaying) {
        if (drift > 1.6) tvSeekP(pos);
        tvPlayP();
      } else {
        tvPauseP();
        if (drift > 1.6) tvSeekP(pos);
      }
    }
    // Verify playback actually started; if blocked by autoplay policy, arm a gesture.
    if (s.isPlaying) {
      setTimeout(() => {
        const st = _ytTv?.getPlayerState?.();
        if (st !== 1 && st !== 3) armGesturePlay(); // not PLAYING/BUFFERING
      }, 800);
    }
  };

  // ── Lazy player lifecycle: only mount the iframe when near the TV ──────
  useEffect(() => {
    if (near && hasVideo) {
      if (farTimerRef.current) { clearTimeout(farTimerRef.current); farTimerRef.current = null; }
      if (!_ytTv && screenRef.current) {
        _ytTvStateCb = (st: number) => {
          if (st === 1 && pendingSearchRef.current) {
            // Search result started playing on the controller's player → publish it.
            pendingSearchRef.current = false;
            const vid = tvGetVidP();
            if (vid) (socket as any).emit('tv:set', { videoId: vid, title: tvGetTitleP() });
          }
        };
        _createTvPlayer(screenRef.current, () => {
          readyRef.current = true;
          setPlayerReady(true);
          tvSetVolP(0);
          applyState();
        });
      } else if (_ytTv && readyRef.current) {
        applyState();
      }
    } else if (!near && _ytTv && !pendingSearchRef.current) {
      // Walked away — tear the player down after a short grace (saves GPU/battery).
      if (!farTimerRef.current) {
        farTimerRef.current = setTimeout(() => {
          farTimerRef.current = null;
          _destroyTvPlayer();
          readyRef.current = false;
          curVidRef.current = '';
          setPlayerReady(false);
        }, 1800);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, hasVideo, tvState?.videoId, tvState?.isPlaying, tvState?.startedAt, tvState?.position]);

  // ── Spatial audio: volume falls off with distance; voice chat untouched ─
  useEffect(() => {
    if (!_ytTv || !readyRef.current) return;
    const vol = near ? Math.max(0, Math.min(100, 100 * (1 - myDist / TV_NEAR_RADIUS))) : 0;
    tvSetVolP(vol);
  }, [myDist, near, playerReady]);

  // ── Drift correction while playing ─────────────────────────────────────
  useEffect(() => {
    if (!near || !tvState?.isPlaying) return;
    const t = setInterval(applyState, 4000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, tvState?.isPlaying, tvState?.videoId]);

  useEffect(() => () => {
    if (farTimerRef.current) clearTimeout(farTimerRef.current);
    _destroyTvPlayer();
    readyRef.current = false;
  }, []);

  // ── Controller actions ─────────────────────────────────────────────────
  const setByLink = (raw: string) => {
    const vid = extractVideoId(raw);
    if (!vid) return false;
    pendingSearchRef.current = false;
    (socket as any).emit('tv:set', { videoId: vid, title: '' });
    return true;
  };
  const doSearch = (q: string) => {
    if (!_ytTv || !readyRef.current) return;
    pendingSearchRef.current = true;
    tvSearchLoad(q); // resolves to tv:set when the result starts playing
  };
  const togglePlay = () => {
    const s = stateRef.current; if (!s) return;
    if (s.isPlaying) (socket as any).emit('tv:pause', { position: tvGetTimeP() });
    else (socket as any).emit('tv:play', { position: tvGetTimeP() || s.position });
  };
  const stop = () => (socket as any).emit('tv:stop');

  const accent = '#00e5ff';
  const localTitle = tvState?.title || (playerReady ? tvGetTitleP() : '');

  return (
    <>
      {/* TV object on the wall */}
      <div style={{ position: 'absolute', left: `${tvX}%`, top: `${tvY}%`, transform: 'translate(-50%, -50%)', zIndex: 12, width: 'min(82vw, 460px)', pointerEvents: 'none' }}>
        {/* Now Playing banner */}
        <AnimatePresence>
          {hasVideo && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 5 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 9, color: accent, letterSpacing: '0.08em' }}>🎬 NOW PLAYING</span>
              <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,.4)' }}>· 👁 {viewerCount}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Screen */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 10, overflow: 'hidden', background: '#000', border: `2px solid ${hasVideo ? accent + '99' : 'rgba(255,255,255,.12)'}`, boxShadow: hasVideo ? `0 0 28px ${accent}45, inset 0 0 30px rgba(0,0,0,.6)` : '0 6px 24px rgba(0,0,0,.5)', transition: 'border-color .3s, box-shadow .3s' }}>
          {/* Player mounts here when near */}
          <div ref={screenRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: fade ? 0 : 1, transition: 'opacity .3s', pointerEvents: 'none' }} />
          {/* Off / far state */}
          {(!hasVideo || !near) && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'radial-gradient(ellipse at 50% 40%, rgba(0,40,60,.5), #000)', pointerEvents: 'none' }}>
              <span style={{ fontSize: 22, opacity: 0.5 }}>📺</span>
              <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,.35)' }}>
                {!hasVideo ? (canControl ? 'TAP TO START' : 'OFF') : 'მიუახლოვდი →'}
              </span>
            </div>
          )}
          {/* Autoplay blocked — tap to start watching */}
          {needsTap && near && hasVideo && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'rgba(0,0,0,.55)', pointerEvents: 'none' }}>
              <span style={{ fontSize: 26 }}>▶</span>
              <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,.7)' }}>დააჭირე ყურებისთვის</span>
            </div>
          )}
          {/* Tap target (real, above the iframe). Always tappable so a gesture can
              unblock autoplay; for controllers it also opens the control panel. */}
          <button
            onClick={() => { if (canControl) setPanelOpen(true); }}
            style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none', cursor: canControl ? 'pointer' : 'default', pointerEvents: (canControl || needsTap) ? 'auto' : 'none' }}
            aria-label="TV"
          />
        </div>
        {localTitle && (
          <p style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,.5)', textAlign: 'center', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{localTitle}</p>
        )}
      </div>

      {/* Controller panel */}
      <AnimatePresence>
        {panelOpen && canControl && (
          <TVControlPanel
            tvState={tvState}
            onClose={() => setPanelOpen(false)}
            onSetLink={setByLink}
            onSearch={doSearch}
            onTogglePlay={togglePlay}
            onSeek={(p) => (socket as any).emit('tv:seek', { position: p })}
            onStop={stop}
            getTime={() => (playerReady ? tvGetTimeP() : (tvState ? tvComputedPos(tvState) : 0))}
            getDuration={() => _ytTv?.getDuration?.() ?? 0}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function TVControlPanel({ tvState, onClose, onSetLink, onSearch, onTogglePlay, onSeek, onStop, getTime, getDuration }: {
  tvState: TVState | null;
  onClose: () => void;
  onSetLink: (raw: string) => boolean;
  onSearch: (q: string) => void;
  onTogglePlay: () => void;
  onSeek: (p: number) => void;
  onStop: () => void;
  getTime: () => number;
  getDuration: () => number;
}) {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'link' | 'search'>('link');
  const [err, setErr] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  const accent = '#00e5ff';
  const dur = getDuration();
  const cur = getTime();
  void tick;

  const submit = () => {
    const v = input.trim();
    if (!v) return;
    if (mode === 'link') {
      if (onSetLink(v)) { setInput(''); setErr(false); } else setErr(true);
    } else {
      onSearch(v); setInput('');
    }
  };
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)' }} />
      <motion.div
        initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        onClick={e => e.stopPropagation()}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 71, background: 'rgba(4,0,18,.98)', backdropFilter: 'blur(24px)', borderTop: `1.5px solid ${accent}55`, borderRadius: '18px 18px 0 0', padding: '16px 16px calc(16px + env(safe-area-inset-bottom,0px))' }}
      >
        <div style={{ width: 36, height: 3, background: 'rgba(255,255,255,.15)', borderRadius: 2, margin: '0 auto 16px' }} />
        <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 14, color: 'white', marginBottom: 12 }}>🎬 Cinema TV</p>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(['link', 'search'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setErr(false); }}
              style={{ flex: 1, padding: '7px', borderRadius: 10, fontFamily: 'monospace', fontSize: 11, background: mode === m ? `${accent}22` : 'rgba(255,255,255,.04)', border: `1px solid ${mode === m ? accent : 'rgba(255,255,255,.1)'}`, color: mode === m ? accent : 'rgba(255,255,255,.4)' }}>
              {m === 'link' ? '🔗 ბმული' : '🔍 ძებნა'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input value={input} onChange={e => { setInput(e.target.value); setErr(false); }}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder={mode === 'link' ? 'YouTube ბმული ან ID' : 'მოძებნე...'}
            style={{ flex: 1, background: 'rgba(255,255,255,.04)', fontFamily: 'monospace', fontSize: 13, color: 'white', outline: 'none', padding: '9px 12px', borderRadius: 12, border: `1px solid ${err ? 'rgba(255,45,85,.5)' : 'rgba(255,255,255,.1)'}` }} />
          <button onClick={submit} style={{ padding: '9px 16px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, background: `${accent}1f`, border: `1px solid ${accent}55`, color: accent }}>{mode === 'link' ? 'Set' : 'Go'}</button>
        </div>

        {tvState && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,.4)', flexShrink: 0 }}>{fmt(cur)}</span>
              <input type="range" min={0} max={Math.max(1, dur)} value={Math.min(cur, dur || cur)}
                onChange={e => onSeek(Number(e.target.value))}
                style={{ flex: 1, accentColor: accent }} />
              <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,.4)', flexShrink: 0 }}>{dur ? fmt(dur) : '--:--'}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onTogglePlay} style={{ flex: 1, padding: '10px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, background: `${accent}1f`, border: `1px solid ${accent}55`, color: accent }}>
                {tvState.isPlaying ? '⏸ Pause' : '▶ Play'}
              </button>
              <button onClick={onStop} style={{ padding: '10px 16px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, background: 'rgba(255,45,85,.12)', border: '1px solid rgba(255,45,85,.35)', color: '#ff2d55' }}>⏹ Stop</button>
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}

// ── Expression picker (reactions + gestures) ──────────────────────────

const REACT_EMOJIS = ['😂', '❤️', '🔥', '👍', '😮', '😢', '🎉', '👏'];
const GESTURES: { id: string; emoji: string; label: string }[] = [
  { id: 'wave',  emoji: '👋', label: 'wave' },
  { id: 'clap',  emoji: '👏', label: 'clap' },
  { id: 'point', emoji: '👉', label: 'point' },
  { id: 'dance', emoji: '💃', label: 'dance' },
];

function ExpressionPicker({ onReact, onGesture, onClose }: {
  onReact: (emoji: string) => void;
  onGesture: (g: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60 }} />
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        onClick={e => e.stopPropagation()}
        style={{ position: 'absolute', left: 12, right: 12, bottom: 'calc(60px + env(safe-area-inset-bottom,0px))', zIndex: 61, background: 'rgba(8,3,22,.98)', backdropFilter: 'blur(22px)', border: '1px solid rgba(155,0,255,.3)', borderRadius: 18, padding: '12px 14px', boxShadow: '0 10px 40px rgba(0,0,0,.6)' }}
      >
        <p style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>რეაქცია</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {REACT_EMOJIS.map(e => (
            <button key={e} onClick={() => onReact(e)}
              style={{ width: 38, height: 38, borderRadius: 12, fontSize: 20, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', transition: 'all .12s' }}
              onMouseEnter={ev => (ev.currentTarget.style.transform = 'scale(1.18)')}
              onMouseLeave={ev => (ev.currentTarget.style.transform = 'scale(1)')}>
              {e}
            </button>
          ))}
        </div>
        <p style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>ჟესტი</p>
        <div style={{ display: 'flex', gap: 6 }}>
          {GESTURES.map(g => (
            <button key={g.id} onClick={() => onGesture(g.id)}
              style={{ flex: 1, padding: '9px 0', borderRadius: 12, background: 'rgba(255,0,150,.08)', border: '1px solid rgba(255,0,150,.25)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 18 }}>{g.emoji}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,.4)' }}>{g.label}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────

interface Props { onClose: () => void; initialSpaceCode?: string | null }

export function VirtualSpace({ onClose, initialSpaceCode }: Props) {
  useEffect(() => {
    const el = document.getElementById('vs-styles') ?? (() => { const s=document.createElement('style'); s.id='vs-styles'; document.head.appendChild(s); return s; })();
    el.textContent = SPACE_CSS;
    return () => { el.textContent = ''; };
  }, []);

  const profile = useAuthStore(s => s.profile);
  const playerName = profile?.username ?? 'Player';

  const { joined, mySocketId, players, chatHistory, space, reactions, join, leave, moveLocal, sendChat, sit, stand, react, gesture, setTyping, listSpaces, createSpace, resolveSpace, inviteToSpace } = useVirtualSpace();
  const { joined: voiceJoined, muted, speakingIds, status: voiceStatus, joinVoice, leaveVoice, toggleMute } = useSpaceVoice();

  // ── Space selection flow: lobby → customize → in-space ────────────────
  const [view, setView] = useState<'lobby' | 'customize'>('lobby');
  const [selectedSpace, setSelectedSpace] = useState<SpaceMetaT | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [resolvingDeepLink, setResolvingDeepLink] = useState(false);

  // Deep link / invite: resolve a code straight into the customizer.
  useEffect(() => {
    if (!initialSpaceCode) return;
    setResolvingDeepLink(true);
    resolveSpace(initialSpaceCode).then(res => {
      if (res.ok && res.space) { setSelectedSpace(res.space); setView('customize'); }
      setResolvingDeepLink(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSpaceCode]);

  const [chat, setChat] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [djPanelOpen, setDjPanelOpen] = useState(false);
  const [djState, setDjState] = useState<DJState | null>(null);
  const [tvState, setTvState] = useState<TVState | null>(null);
  const [ytReady, setYtReady] = useState(false);
  const [localPlaying, setLocalPlaying] = useState(false);

  const [showExpr, setShowExpr] = useState(false);


  // Sync helper so closures always have current value via ref
  function setLP(v: boolean) { localPlayingRef.current = v; setLocalPlaying(v); }
  const [volume, setVolume] = useState(70);
  const [ripple, setRipple] = useState<{ x: number; y: number; k: number } | null>(null);

  const worldRef = useRef<HTMLDivElement>(null);
  const ytDivRef = useRef<HTMLDivElement>(null);
  const volRef          = useRef(70);
  const searchPendingRef = useRef(false);
  const hasOptedInRef    = useRef(false);   // true once user activated audio (DJ or listener)
  const currentVideoRef  = useRef('');       // videoId confirmed playing via onStateChange
  const localPlayingRef  = useRef(false);    // mirrors localPlaying for closures
  const myNameRef        = useRef(playerName);
  const joinTimeRef      = useRef(0);        // timestamp of join gesture (set BEFORE await)
  const pendingPlayRef   = useRef<{videoId: string; seek: number} | null>(null); // queued if player not ready yet
  useEffect(() => { myNameRef.current = playerName; }, [playerName]);

  // ── YouTube player — init on mount so it's ready before join ────────

  useEffect(() => {
    if (!ytDivRef.current) return;

    _ytStateChangeCb = (state) => {
      const playing = state === 1; /* YT.PlayerState.PLAYING */
      setLP(playing);
      if (playing) {
        currentVideoRef.current = ytGetVideoId();
        if (searchPendingRef.current) {
          searchPendingRef.current = false;
          const vid = ytGetVideoId();
          if (vid) (socket as any).emit('space:dj-play', { videoId: vid, position: ytGetTime() });
        }
      }
      if (state === 0) setLP(false); /* ENDED */
    };

    _createYTPlayer(ytDivRef.current, () => {
      setYtReady(true);
      ytSetVol(volRef.current);
      // Play anything queued before the player was ready
      if (pendingPlayRef.current) {
        const { videoId, seek } = pendingPlayRef.current;
        pendingPlayRef.current = null;
        ytPlay(videoId, seek);
      }
    });

    return () => {
      _destroyYTPlayer();
      setYtReady(false);
      setLP(false);
    };
  }, []); // mount/unmount only

  // ── DJ socket events ──────────────────────────────────────────────

  useEffect(() => {
    function onDJUpdate(state: DJState | null) {
      setDjState(state);
      if (!state?.isPlaying) {
        ytStop();
        setLP(false);
        hasOptedInRef.current = false;
        pendingPlayRef.current = null;
        return;
      }
      const seek = Math.max(0, (Date.now() - state.startedAt) / 1000);

      // Same video already playing locally — don't interrupt (prevents echo for DJ)
      if (state.videoId === currentVideoRef.current && localPlayingRef.current) return;

      // Decide whether to auto-play:
      // - DJ who initiated the track
      // - Listener who already opted in (tapped ▶ მოსმენა before)
      // - Listener who JUST joined: still within iOS Safari's user-activation window
      //   (~5s) from when they tapped "Void Lounge-ში შესვლა →". Parent-page
      //   activation propagates to child iframes in iOS 14+, so ytPlay() works.
      const justJoined = joinTimeRef.current > 0 && (Date.now() - joinTimeRef.current) < 6000;
      const shouldPlay = state.djName === myNameRef.current || hasOptedInRef.current || justJoined;

      if (shouldPlay) {
        hasOptedInRef.current = true;
        if (!_yt) {
          // Player still initialising — queue it; fired in onReady callback
          pendingPlayRef.current = { videoId: state.videoId, seek };
        } else {
          ytPlay(state.videoId, seek);
        }
      } else {
        ytCue(state.videoId, seek);
      }
    }
    (socket as any).on('space:dj-update', onDJUpdate);
    return () => { (socket as any).off('space:dj-update', onDJUpdate); };
  }, []);

  // ── Cinema TV state ────────────────────────────────────────────────
  useEffect(() => {
    function onTvUpdate(state: TVState | null) { setTvState(state); }
    (socket as any).on('tv:update', onTvUpdate);
    return () => { (socket as any).off('tv:update', onTvUpdate); };
  }, []);
  // Clear TV when leaving the space.
  useEffect(() => { if (!joined) setTvState(null); }, [joined]);

  // ── Handlers ──────────────────────────────────────────────────────

  const handleClose = useCallback(() => { leaveVoice(); leave(); onClose(); }, [leave, leaveVoice, onClose]);

  async function handleJoin(bodyColor: string, glowColor: string, mask: SpaceMask) {
    // Capture the user gesture timestamp BEFORE await so onDJUpdate's
    // justJoined check is accurate when music is playing in the room.
    joinTimeRef.current = Date.now();
    const ok = await join(selectedSpace?.id ?? 'main', playerName, bodyColor, glowColor, mask);
    if (ok) joinVoice();
  }

  // Called from click → user gesture → iOS allows
  function handlePlayDirect(videoId: string) {
    hasOptedInRef.current = true;     // DJ is opted in for subsequent songs
    searchPendingRef.current = false;
    ytPlay(videoId, 0);
    (socket as any).emit('space:dj-play', { videoId, position: 0 });
  }

  // Called from click → user gesture → iOS allows
  function handlePlaySearch(query: string) {
    hasOptedInRef.current = true;     // DJ is opted in
    searchPendingRef.current = true;
    ytSearch(query);
    // videoId emitted in _ytStateChangeCb when PLAYING fires
  }

  function handlePause() {
    const pos = ytGetTime();
    ytPause();
    (socket as any).emit('space:dj-pause', { position: pos });
  }

  function handleStop() {
    ytStop();
    (socket as any).emit('space:dj-stop');
    setDjState(null);
    setLocalPlaying(false);
  }

  // Called from button click → user gesture → iOS allows autoplay
  function handleStartListening() {
    if (!djState?.isPlaying) return;
    hasOptedInRef.current = true;   // remember: auto-play future songs too
    const seek = Math.max(0, (Date.now() - djState.startedAt) / 1000);
    ytPlay(djState.videoId, seek);
  }

  function handleStopListening() {
    ytPause();
    setLP(false);
  }

  function handleVolume(v: number) {
    setVolume(v);
    volRef.current = v;
    ytSetVol(v);
  }

  function handleWorldTap(clientX: number, clientY: number) {
    if (!joined || !mySocketId || djPanelOpen) return;
    const rect = worldRef.current!.getBoundingClientRect();
    const x = Math.max(5, Math.min(95, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(5, Math.min(92, ((clientY - rect.top)  / rect.height) * 100));
    moveLocal(mySocketId, x, y);
    setRipple({ x, y, k: Date.now() });
  }

  function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    const msg = chat.trim();
    if (!msg) return;
    sendChat(msg);
    setChat('');
    setTyping(false);
  }

  function isSpeaking(p: SpacePlayer): boolean {
    return p.socketId === mySocketId ? speakingIds.has('local') : speakingIds.has(p.socketId);
  }

  const voiceLabel = voiceJoined ? (muted ? '🔇 muted' : '🎤 live') : voiceStatus === 'failed' ? '⚠ no mic' : '○ connecting…';

  // Active room layout (TV position, seats, decor).
  const layout = getLayout(space?.layout);

  // Distance from my avatar to the cinema TV + how many players are watching.
  const me = players.get(mySocketId);
  const myTvDist = me ? Math.hypot(me.x - layout.tv.x, me.y - layout.tv.y) : 999;
  const tvViewers = [...players.values()].filter(p => Math.hypot(p.x - layout.tv.x, p.y - layout.tv.y) <= TV_NEAR_RADIUS).length;
  const mySeat = me?.seat ?? null;
  // seatId → occupant for rendering occupancy.
  const seatOccupants = new Map<string, SpacePlayer>();
  for (const p of players.values()) if (p.seat) seatOccupants.set(p.seat, p);

  const handleSeatTap = (seat: SeatDef) => {
    if (!me) return;
    if (me.seat === seat.id) { stand(mySocketId); return; }
    if (seatOccupants.has(seat.id)) return; // taken
    sit(mySocketId, seat.id, seat.x, seat.y);
  };

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[200] flex flex-col" style={{background:'#020010'}}>
      {/* Header */}
      <div style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 16px',paddingTop:'calc(10px + env(safe-area-inset-top,0px))',background:'rgba(3,0,14,.96)',borderBottom:'1px solid rgba(155,0,255,.18)',backdropFilter:'blur(14px)',flexShrink:0 }}>
        <div style={{ width:8,height:8,borderRadius:'50%',background:'#9b00ff',boxShadow:'0 0 10px #9b00ff',animation:'vs-pulse 2s ease-in-out infinite' }}/>
        <div style={{ flex:1,minWidth:0 }}>
          <p style={{ fontFamily:'"Space Grotesk",sans-serif',fontWeight:700,fontSize:14,color:'white',letterSpacing:'0.05em' }}>
            {joined && space ? `${space.icon} ${space.name}`.toUpperCase() : 'VOID LOUNGE'}
          </p>
          <p style={{ fontFamily:'monospace',fontSize:10,color:'rgba(255,255,255,.28)',letterSpacing:'0.08em' }}>
            {joined ? `${players.size} online · ${voiceLabel}` : 'სოციალური სივრცე'}
          </p>
        </div>
        {joined && (
          <button onClick={()=>setShowInvite(true)} className="w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-90" style={{ background:'rgba(155,0,255,.1)',border:'1px solid rgba(155,0,255,.3)',fontSize:14 }} title="მოწვევა">
            ✦
          </button>
        )}
        {joined && (
          <button onClick={toggleMute} className="w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-90" style={{ background:muted?'rgba(255,45,85,.12)':'rgba(0,229,255,.08)',border:`1px solid ${muted?'rgba(255,45,85,.35)':'rgba(0,229,255,.25)'}`,fontSize:14 }}>
            {muted ? '🔇' : '🎤'}
          </button>
        )}
        <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-90" style={{ background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.1)',color:'rgba(255,255,255,.45)',fontSize:14 }}>✕</button>
      </div>

      {/* Content */}
      {!joined ? (
        view === 'lobby' && !resolvingDeepLink ? (
          <div className="flex-1 overflow-y-auto" style={{background:'rgba(4,0,18,.98)'}}>
            <SpacesLobby
              listSpaces={listSpaces}
              createSpace={createSpace}
              resolveSpace={resolveSpace}
              onEnter={(sp) => { setSelectedSpace(sp); setView('customize'); }}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto" style={{background:'rgba(4,0,18,.98)'}}>
            {resolvingDeepLink ? (
              <div className="flex items-center justify-center h-full">
                <div style={{ width:24,height:24,border:'2px solid rgba(155,0,255,.4)',borderTopColor:'#9b00ff',borderRadius:'50%',animation:'vs-spin .7s linear infinite' }}/>
              </div>
            ) : (
              <>
                <div className="px-5 pt-4">
                  <button onClick={()=>{ setSelectedSpace(null); setView('lobby'); }} className="font-mono text-[11px] text-white/40 hover:text-white/70 transition-all">← Spaces</button>
                  {selectedSpace && (
                    <p className="font-mono text-[12px] mt-2" style={{ color:'#c084fc' }}>{selectedSpace.icon} {selectedSpace.name}</p>
                  )}
                </div>
                <AvatarCustomizer playerName={playerName} onJoin={handleJoin}/>
              </>
            )}
          </div>
        )
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div
            ref={worldRef}
            className="flex-1 relative overflow-hidden select-none cursor-crosshair"
            style={{
              background:`radial-gradient(ellipse at 15% 70%, rgba(120,0,255,.1) 0%, transparent 40%),radial-gradient(ellipse at 80% 75%, rgba(0,150,255,.09) 0%, transparent 38%),radial-gradient(ellipse at 85% 55%, rgba(255,120,0,.06) 0%, transparent 30%),linear-gradient(180deg,rgba(9,3,26,1) 0%,rgba(9,3,24,1) 36%,rgba(2,0,10,1) 37%,rgba(1,0,7,1) 100%)`,
              // Camera nudge: lean toward the screen while seated.
              transform: mySeat ? 'scale(1.09)' : 'none',
              transformOrigin: '50% 26%',
              transition: 'transform .55s cubic-bezier(0.4,0,0.2,1)',
            }}
            onClick={e=>handleWorldTap(e.clientX,e.clientY)}
            onTouchStart={e=>{e.preventDefault();const t=e.touches[0];handleWorldTap(t.clientX,t.clientY);}}
          >

            <Particles/>
            <PerspectiveFloor/>
            <div className="absolute inset-0 pointer-events-none" style={{background:'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(2,0,16,.55) 100%)'}}/>
            <RoomObjects djActive={!!djState?.isPlaying} onDJClick={()=>setDjPanelOpen(o=>!o)} decor={layout.decor}/>

            {/* Cinema TV — synced watch party */}
            <CinemaTV tvState={tvState} canControl={space?.canControlTv ?? false} myDist={myTvDist} viewerCount={tvViewers} tvX={layout.tv.x} tvY={layout.tv.y} />

            {/* Cinema seats */}
            {layout.seats.map(seat => (
              <CinemaSeat
                key={seat.id}
                seat={seat}
                occupant={seatOccupants.get(seat.id)}
                isMine={mySeat === seat.id}
                onTap={() => handleSeatTap(seat)}
              />
            ))}

            {/* Floating emoji reactions */}
            {reactions.map(r => {
              const p = players.get(r.socketId);
              if (!p) return null;
              return (
                <div key={r.id} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -180%)', zIndex: 40, pointerEvents: 'none', fontSize: 26, animation: 'vs-react 2.3s ease-out forwards' }}>
                  {r.emoji}
                </div>
              );
            })}

            {/* Now playing bar */}
            <AnimatePresence>
              {djState?.isPlaying && !djPanelOpen && (
                <NowPlayingBar
                  djState={djState} localPlaying={localPlaying}
                  onOpen={()=>setDjPanelOpen(true)}
                  onStartListening={handleStartListening}
                />
              )}
            </AnimatePresence>

            {/* Tap ripple */}
            <AnimatePresence>
              {ripple && (
                <motion.div key={ripple.k} initial={{scale:0,opacity:0.85}} animate={{scale:3,opacity:0}} transition={{duration:0.5}}
                  onAnimationComplete={()=>setRipple(null)}
                  style={{position:'absolute',left:`${ripple.x}%`,top:`${ripple.y}%`,width:24,height:24,marginLeft:-12,marginTop:-12,borderRadius:'50%',border:'1.5px solid rgba(155,0,255,.75)',pointerEvents:'none'}}
                />
              )}
            </AnimatePresence>

            {/* Avatars */}
            {[...players.values()].map(p=>(
  <AvatarOnMap key={p.socketId} player={p} isMe={p.socketId===mySocketId} speaking={isSpeaking(p)} />
))}


            {players.size===1 && !djPanelOpen && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                <p className="font-mono text-[10px] text-white/20 tracking-wider" style={{animation:'vs-pulse 2.5s ease-in-out infinite'}}>
                  ↓ დააჭირე გადასაადგილებლად · DJ BOOTH ჩართვისთვის
                </p>
              </div>
            )}

            <ChatDrawer history={chatHistory} mySocketId={mySocketId} open={drawerOpen}/>

            {/* DJ Player Panel */}
            <DJPlayerPanel
              open={djPanelOpen} onClose={()=>setDjPanelOpen(false)}
              djState={djState} myName={playerName}
              ytReady={ytReady} localPlaying={localPlaying}
              onPlayDirect={handlePlayDirect} onPlaySearch={handlePlaySearch}
              onPause={handlePause} onStop={handleStop}
              onStartListening={handleStartListening} onStopListening={handleStopListening}
              volume={volume} onVolume={handleVolume}
            />
          </div>

          {/* Expression picker */}
          <AnimatePresence>
            {showExpr && (
              <ExpressionPicker
                onReact={(e)=>{ react(mySocketId, e); setShowExpr(false); }}
                onGesture={(g)=>{ gesture(mySocketId, g); setShowExpr(false); }}
                onClose={()=>setShowExpr(false)}
              />
            )}
          </AnimatePresence>

          {/* Bottom bar */}
          <form onSubmit={handleSendChat} style={{ display:'flex',gap:8,padding:'8px 12px',paddingBottom:'calc(8px + env(safe-area-inset-bottom,0px))',background:'rgba(3,0,14,.97)',borderTop:'1px solid rgba(155,0,255,.14)',flexShrink:0 }}>
            <input value={chat} onChange={e=>{ setChat(e.target.value); if(e.target.value.trim()) setTyping(true); else setTyping(false); }} maxLength={140} placeholder="გზავნილი…"
              style={{ flex:1,background:'rgba(255,255,255,.04)',fontFamily:'monospace',fontSize:13,color:'white',outline:'none',padding:'8px 12px',borderRadius:12,border:'1px solid rgba(255,255,255,.1)' }}
              onFocus={e=>e.stopPropagation()}
              onBlur={()=>setTyping(false)}
            />
            <button type="button" onClick={()=>setShowExpr(o=>!o)} style={{ padding:'8px 10px',borderRadius:12,fontFamily:'monospace',fontSize:15,lineHeight:1,background:showExpr?'rgba(255,0,150,.2)':'rgba(255,255,255,.04)',border:`1px solid ${showExpr?'rgba(255,0,150,.5)':'rgba(255,255,255,.1)'}`,transition:'all .15s',flexShrink:0 }} title="გამოხატვა">😊</button>
            <button type="submit" disabled={!chat.trim()} style={{ padding:'8px 14px',borderRadius:12,fontFamily:'monospace',fontSize:13,background:'rgba(155,0,255,.15)',border:'1px solid rgba(155,0,255,.4)',color:'#c084fc',transition:'all .15s',flexShrink:0 }}>→</button>
            <button type="button" onClick={()=>setDrawerOpen(o=>!o)} style={{ padding:'8px 10px',borderRadius:12,fontFamily:'monospace',fontSize:13,background:drawerOpen?'rgba(155,0,255,.18)':'rgba(255,255,255,.04)',border:`1px solid ${drawerOpen?'rgba(155,0,255,.45)':'rgba(255,255,255,.1)'}`,color:drawerOpen?'#c084fc':'rgba(255,255,255,.4)',transition:'all .15s',flexShrink:0,position:'relative' }}>
              ☰
              {chatHistory.length>0&&!drawerOpen&&<span style={{position:'absolute',top:-3,right:-3,width:8,height:8,borderRadius:'50%',background:'#9b00ff',boxShadow:'0 0 6px #9b00ff'}}/>}
            </button>
          </form>
        </div>
      )}
      {/* Invite panel */}
      <AnimatePresence>
        {showInvite && joined && space && (
          <SpaceInvitePanel space={space} inviteToSpace={inviteToSpace} onClose={()=>setShowInvite(false)} />
        )}
      </AnimatePresence>

      {/* Hidden YouTube player — always mounted, initialises before join */}
      <div ref={ytDivRef} style={{position:'fixed',opacity:0,pointerEvents:'none',width:1,height:1,left:-10,top:-10,zIndex:-1}}/>
    </motion.div>
  );
}

