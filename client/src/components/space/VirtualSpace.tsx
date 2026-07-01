import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualSpace, type SpacePlayer, type SpaceMask, type SpaceMeta as SpaceMetaT } from '@/hooks/useVirtualSpace';
import { SpacesLobby, SpaceInvitePanel } from './SpacesLobby';
import { ProfileModalV2 } from '@/components/community/ProfileModalV2';
import { useSpaceVoice } from '@/hooks/useSpaceVoice';
import { useLivekitRoomVoice, useLiveKitEnabled } from '@/hooks/useLivekitVoice';
import { LiveKitVoiceBarView } from '@/components/game/LiveKitVoiceBar';
import { useAuthStore } from '@/store/authStore';
import { useNameColor } from '@/store/nameColorStore';
import { useCommunityStore } from '@/store/communityStore';
import { SPACE_THEME_DEFS, getSpaceTheme, itemIdForTheme } from '@/constants/spaceThemes';
import { RARITY_COLOR, nameColorGlow } from '@/constants/cosmetics';
import { useSocialStore } from '@/store/socialStore';
import { useCheckersStore } from '@/store/checkersStore';
import { useJokerStore } from '@/store/jokerStore';
import { useLudoStore } from '@/store/ludoStore';
import { useWWWStore } from '@/store/wwwStore';
import { useUnoStore } from '@/store/unoStore';
import { socket, emitWithAck } from '@/lib/socket';
import type { Res, PlayerCosmetics } from '@/types/index';

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

interface TVQueueItem { videoId: string; title: string }
interface TVState { videoId: string; title: string; startedAt: number; position: number; isPlaying: boolean; byName: string; queue: TVQueueItem[]; skipVotes: number; skipNeeded: number }
function tvComputedPos(s: TVState): number {
  return s.isPlaying ? Math.max(0, (Date.now() - s.startedAt) / 1000) : Math.max(0, s.position);
}

// ── Room layouts ────────────────────────────────────────────────────────
type SeatType = 'couch' | 'chair' | 'pouf';
interface SeatDef { id: string; type: SeatType; x: number; y: number; }
interface RoomLayout { tv: { x: number; y: number }; seats: SeatDef[]; decor: 'lounge' | 'home' | 'penthouse' }

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
  // Night penthouse — skyline window, wall TV, modern sectional + chairs, rug.
  penthouse: {
    tv: { x: 50, y: 21 },
    decor: 'penthouse',
    seats: [
      { id: 'sofaL', type: 'couch', x: 38, y: 44 },
      { id: 'sofaR', type: 'couch', x: 62, y: 44 },
      { id: 'armL',  type: 'chair', x: 22, y: 54 },
      { id: 'armR',  type: 'chair', x: 78, y: 54 },
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

function renderHat(hat: string | undefined, glow: string, body: string) {
  switch (hat) {
    case 'cap':    return <><path d="M6 3 Q16 -4 26 3 L26 5 L6 5 Z" fill={glow} /><rect x="6" y="4.5" width="13" height="2" rx="1" fill={glow} opacity="0.7" /></>;
    case 'beanie': return <><path d="M6 4 Q16 -6 26 4 Z" fill={glow} /><rect x="5" y="3.5" width="22" height="2.5" rx="1.2" fill={body} /><circle cx="16" cy="-5" r="2" fill={glow} /></>;
    case 'crown':  return <path d="M8 4 L8 -2 L12 1 L16 -4 L20 1 L24 -2 L24 4 Z" fill="#ffcc00" stroke="#ffaa00" strokeWidth="0.4" />;
    case 'halo':   return <ellipse cx="16" cy="-4" rx="7" ry="2.2" fill="none" stroke="#ffe98a" strokeWidth="1.6" style={{ filter: 'drop-shadow(0 0 4px #ffe98a)' }} />;
    case 'party':  return <><path d="M16 -8 L11 4 L21 4 Z" fill={glow} stroke="#fff" strokeWidth="0.3" /><circle cx="16" cy="-8" r="1.4" fill="#fff" /></>;
    case 'cat':    return <><path d="M8 3 L6 -4 L13 0 Z" fill={body} /><path d="M24 3 L26 -4 L19 0 Z" fill={body} /><path d="M9 1.5 L8 -2 L11.5 0 Z" fill={glow} opacity="0.5" /><path d="M23 1.5 L24 -2 L20.5 0 Z" fill={glow} opacity="0.5" /></>;
    default:       return null;
  }
}
const PET_EMOJI: Record<string, string> = { cat: '🐱', bot: '🤖', ghost: '👻', star: '⭐', fish: '🐟', fish2: '🐠', egg: '🥚', chick: '🐥', moon: '🌓', car: '🚗' };

// Sleek sedan avatar (side profile) with a 3-pointed Mercedes-style star.
function CarBody({ bodyColor, glowColor }: { bodyColor: string; glowColor: string }) {
  const bd = bodyColor + 'ee';
  const win = glowColor + '55';
  return (
    <g>
      <ellipse cx="16" cy="50" rx="13" ry="2.5" fill="rgba(0,0,0,0.35)" />
      {/* lower body */}
      <path d="M2 44 Q3 40 7 39 L11 33 Q12 31 15 31 L23 31 Q26 31 27 34 L30 40 Q31 42 30 45 L29 47 L3 47 Q2 46 2 44 Z" fill={bd} stroke={glowColor} strokeWidth="0.5" />
      {/* cabin / windows */}
      <path d="M11.5 33.5 L14.5 33 L14.5 38 L9 38 Z" fill={win} />
      <path d="M16 33 L22.5 33.5 L25 38 L16 38 Z" fill={win} />
      {/* headlight / taillight */}
      <rect x="28.5" y="40" width="2" height="2.4" rx="1" fill="#fff6cc" />
      <rect x="2" y="41" width="1.8" height="2" rx="0.9" fill="#ff3b3b" />
      {/* wheels */}
      <circle cx="9" cy="47" r="4" fill="#0b0b14" stroke={glowColor} strokeWidth="0.8" />
      <circle cx="9" cy="47" r="1.6" fill="#2a2a3a" />
      <circle cx="23" cy="47" r="4" fill="#0b0b14" stroke={glowColor} strokeWidth="0.8" />
      <circle cx="23" cy="47" r="1.6" fill="#2a2a3a" />
      {/* Mercedes 3-point star on the door */}
      <circle cx="16" cy="42" r="3.2" fill="none" stroke="#e8eaf0" strokeWidth="0.7" />
      <g stroke="#e8eaf0" strokeWidth="0.7" strokeLinecap="round">
        <line x1="16" y1="42" x2="16" y2="39" />
        <line x1="16" y1="42" x2="13.4" y2="43.6" />
        <line x1="16" y1="42" x2="18.6" y2="43.6" />
      </g>
    </g>
  );
}

function HumanoidAvatar({ bodyColor, glowColor, mask, size = 1, speaking, walking, gesture, sitting, hat, pet, form, isMe }: {
  bodyColor: string; glowColor: string; mask: SpaceMask;
  size?: number; speaking?: boolean; walking?: boolean; gesture?: string | null; sitting?: boolean; hat?: string; pet?: string; form?: string; isMe?: boolean;
}) {
  const isCar = form === 'car';

  const w = Math.round(32 * size);
  const h = Math.round(56 * size);
  const bd = bodyColor + 'cc';
  const bl = bodyColor + 'ee';
  const isWalking = walking && !sitting;
  return (
   <div style={{ position: 'relative', width: w, height: h, flexShrink: 0, transform: sitting ? 'translateY(5px)' : undefined, transition: 'transform .25s ease', animation: gestureAnim(gesture, sitting) }}>

      {pet && pet !== 'none' && PET_EMOJI[pet] && (
        <div style={{ position: 'absolute', bottom: 2, left: -Math.round(14 * size), fontSize: Math.round(13 * size), animation: 'vs-float 1.6s ease-in-out infinite', pointerEvents: 'none' }}>
          {PET_EMOJI[pet]}
        </div>
      )}

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
        style={{ overflow: 'visible', filter: speaking ? `drop-shadow(0 0 8px ${glowColor}cc)` : `drop-shadow(0 0 ${isMe ? 5 : 3}px ${bodyColor}99)` }}
      >
        {isCar ? <CarBody bodyColor={bodyColor} glowColor={glowColor} /> : <>
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
        {(!hat || hat === 'none') && isMe && <g transform="translate(12,-1)"><polygon points="4,0 5.5,3 4,2.5 2.5,3" fill={glowColor} opacity="0.9" /><rect x="2" y="2.5" width="4" height="1" rx="0.5" fill={glowColor} opacity="0.7" /></g>}
        {renderHat(hat, glowColor, bodyColor)}
        </>}
      </svg>
    </div>
  );
}



// ── Avatar on map ─────────────────────────────────────────────────────

function AvatarOnMap({ player, isMe, speaking, onTap }: { player: SpacePlayer; isMe: boolean; speaking: boolean; onTap?: () => void }) {

  const prev = useRef({ x: player.x, y: player.y });
  const [walking, setWalking] = useState(false);
  const nameColor = useNameColor(player.profileId);
  const wt = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hp = player.hp ?? 10;
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
        style={{ position: 'relative', pointerEvents: onTap && !isMe ? 'auto' : 'none', cursor: onTap && !isMe ? 'pointer' : 'default' }}
        onClick={onTap && !isMe ? (e) => { e.stopPropagation(); onTap(); } : undefined}
        onTouchStart={onTap && !isMe ? (e) => e.stopPropagation() : undefined}
        onPointerDown={onTap && !isMe ? (e) => e.stopPropagation() : undefined}
      >
        <HumanoidAvatar bodyColor={player.bodyColor} glowColor={player.glowColor} mask={player.mask} speaking={speaking} walking={walking} gesture={player.gesture} sitting={!!player.seat} hat={player.hat} pet={player.pet} form={player.form} isMe={isMe} />
      </motion.div>
      {/* Health bar — appears once a player has taken damage */}
      {hp < 10 && (
        <div style={{ width: 46, height: 4, borderRadius: 3, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.12)', marginTop: 3, overflow: 'hidden' }}>
          <div style={{ width: `${hp * 10}%`, height: '100%', borderRadius: 3, transition: 'width 0.25s ease, background 0.25s', background: hp > 6 ? '#00ff88' : hp > 3 ? '#facc15' : '#ff2d55', boxShadow: `0 0 6px ${hp > 6 ? '#00ff88' : hp > 3 ? '#facc15' : '#ff2d55'}99` }} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: nameColor ?? (isMe ? player.glowColor : 'rgba(255,255,255,0.65)'), textShadow: nameColor ? nameColorGlow(nameColor) : undefined, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', borderRadius: 6, padding: '1px 7px', border: isMe ? `1px solid ${player.glowColor}55` : '1px solid rgba(255,255,255,0.08)', letterSpacing: '0.04em', maxWidth: 96, marginTop: 2, boxShadow: isMe ? `0 0 8px ${player.glowColor}30` : 'none' }}>
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

function RoomObjects({ djActive, onDJClick, onGamesClick, decor }: { djActive: boolean; onDJClick: () => void; onGamesClick: () => void; decor: 'lounge' | 'home' | 'penthouse' }) {
  const home = decor === 'home';
  const pent = decor === 'penthouse';
  const PAL = decor === 'home'
    ? { l: '255,170,80', r: '255,140,90', sign: 'HOME CINEMA', signCss: '0 0 6px #ffb060,0 0 16px #ff9040,0 0 36px rgba(255,160,80,.6)', div: 'linear-gradient(90deg,rgba(255,170,80,.3),rgba(255,200,120,.8),rgba(255,150,90,.6),rgba(255,200,120,.8),rgba(255,170,80,.3))', divGlow: '0 0 16px rgba(255,180,100,.4)' }
    : decor === 'penthouse'
    ? { l: '90,170,255', r: '150,120,255', sign: 'SKY PENTHOUSE', signCss: '0 0 6px #8ab8ff,0 0 16px #6aa0ff,0 0 36px rgba(120,150,255,.6)', div: 'linear-gradient(90deg,rgba(90,170,255,.3),rgba(150,200,255,.85),rgba(120,140,255,.6),rgba(150,200,255,.85),rgba(90,170,255,.3))', divGlow: '0 0 16px rgba(120,170,255,.45)' }
    : { l: '155,0,255', r: '0,229,255', sign: 'VOID LOUNGE', signCss: '0 0 6px #00e5ff,0 0 16px #00e5ff,0 0 36px rgba(0,229,255,.7),0 0 60px rgba(0,229,255,.3)', div: 'linear-gradient(90deg,rgba(155,0,255,.4),rgba(0,229,255,.9),rgba(255,0,150,.7),rgba(0,229,255,.9),rgba(155,0,255,.4))', divGlow: '0 0 16px rgba(0,229,255,.5),0 0 32px rgba(155,0,255,.25)' };
  return (
    <>
      {/* Wall strips */}
      <div className="absolute pointer-events-none" style={{ left:5,top:0,bottom:'63%',width:2,background:`linear-gradient(180deg,rgba(${PAL.l},0) 0%,rgba(${PAL.l},.8) 55%,rgba(${PAL.l},0) 100%)`,boxShadow:`0 0 14px rgba(${PAL.l},.5)`,borderRadius:2 }}/>
      <div className="absolute pointer-events-none" style={{ right:5,top:0,bottom:'63%',width:2,background:`linear-gradient(180deg,rgba(${PAL.r},0) 0%,rgba(${PAL.r},.8) 55%,rgba(${PAL.r},0) 100%)`,boxShadow:`0 0 14px rgba(${PAL.r},.5)`,borderRadius:2 }}/>
      {/* Wall/floor divider */}
      <div className="absolute pointer-events-none" style={{ left:0,right:0,top:'37%',height:2.5,background:PAL.div,boxShadow:PAL.divGlow }}/>
      {/* Sign */}
      <div className="absolute pointer-events-none" style={{ left:'50%',top:'9%',transform:'translate(-50%,-50%)',fontFamily:'"Space Grotesk",monospace',fontWeight:900,fontSize:13,letterSpacing:'0.28em',color:'#fff',textShadow:PAL.signCss,animation:'vs-flicker 6s linear infinite',whiteSpace:'nowrap' }}>{PAL.sign}</div>

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

      {pent ? (
        <>
          {/* Panoramic night skyline window across the top wall */}
          <div className="absolute pointer-events-none" style={{ left:'50%',top:'21%',transform:'translate(-50%,-50%)',width:'88%',height:'30%',borderRadius:10,overflow:'hidden',background:'linear-gradient(180deg,#04060f 0%,#0a1330 45%,#13203f 100%)',border:'2px solid rgba(120,160,255,.35)',boxShadow:'0 0 30px rgba(80,140,255,.25), inset 0 0 40px rgba(0,0,0,.5)' }}>
            {/* moon */}
            <div style={{ position:'absolute',top:'14%',right:'12%',width:18,height:18,borderRadius:'50%',background:'radial-gradient(circle at 35% 35%,#fffbe8,#d9e2ff)',boxShadow:'0 0 18px rgba(220,230,255,.8)' }}/>
            {/* stars */}
            {[[15,18],[28,30],[42,14],[58,26],[70,16],[82,34],[36,40],[64,42]].map(([l,t],i)=>(
              <div key={i} style={{ position:'absolute',left:`${l}%`,top:`${t}%`,width:2,height:2,borderRadius:'50%',background:'#cfe0ff',boxShadow:'0 0 4px #cfe0ff',animation:`vs-pulse ${2+(i%3)}s ease-in-out infinite` }}/>
            ))}
            {/* skyline silhouette */}
            <div style={{ position:'absolute',left:0,right:0,bottom:0,height:'52%',display:'flex',alignItems:'flex-end',gap:3,padding:'0 6px' }}>
              {[40,62,48,80,55,92,50,70,44,86,58,74,46].map((h,i)=>(
                <div key={i} style={{ flex:1,height:`${h}%`,background:'linear-gradient(180deg,rgba(20,30,60,.95),rgba(10,16,36,1))',borderTop:'1px solid rgba(120,160,255,.2)',position:'relative' }}>
                  {/* lit windows */}
                  {(i%2===0) && <div style={{ position:'absolute',top:'20%',left:'30%',width:2,height:2,background:'rgba(255,210,120,.85)',boxShadow:'0 0 3px rgba(255,200,100,.7)' }}/>}
                  {(i%3===0) && <div style={{ position:'absolute',top:'45%',left:'55%',width:2,height:2,background:'rgba(150,200,255,.85)' }}/>}
                </div>
              ))}
            </div>
          </div>
          {/* cool ambient glow */}
          <div className="absolute pointer-events-none" style={{ left:'50%',top:'62%',transform:'translate(-50%,-50%)',width:'85%',height:'60%',background:'radial-gradient(ellipse,rgba(90,140,255,.10) 0%,transparent 70%)',borderRadius:'50%' }}/>
          {/* coffee table */}
          <div className="absolute pointer-events-none" style={{ left:'50%',top:'52%',transform:'translate(-50%,-50%)',width:64,height:20,background:'linear-gradient(180deg,rgba(40,55,95,.7),rgba(20,28,55,.8))',borderRadius:8,border:'1px solid rgba(120,160,255,.3)',boxShadow:'0 6px 14px rgba(0,0,0,.4)' }}/>
          {/* large rug = dance / move floor (fills lower area) */}
          <div className="absolute pointer-events-none" style={{ left:'50%',top:'72%',transform:'translate(-50%,-50%)',width:'64%',maxWidth:360,aspectRatio:'1.8 / 1',borderRadius:'50%',background:'radial-gradient(ellipse, rgba(90,140,255,.16) 0%, rgba(40,60,140,.08) 55%, transparent 75%)',border:'1.5px dashed rgba(130,170,255,.35)',boxShadow:'inset 0 0 34px rgba(80,130,255,.12)' }}/>
          <div className="absolute pointer-events-none" style={{ left:'50%',top:'63%',transform:'translate(-50%,-50%)',fontFamily:'monospace',fontSize:8,letterSpacing:'0.24em',color:'rgba(150,190,255,.85)',textShadow:'0 0 8px rgba(100,150,255,.6)' }}>🪩 DANCE FLOOR</div>
          {/* tall plant left + floor lamp right */}
          <div className="absolute pointer-events-none" style={{ left:'9%',top:'56%',transform:'translate(-50%,-50%)' }}><Plant/></div>
          <div className="absolute pointer-events-none" style={{ left:'91%',top:'60%',transform:'translate(-50%,-50%)',display:'flex',flexDirection:'column',alignItems:'center' }}>
            <div style={{ width:18,height:11,background:'radial-gradient(ellipse,rgba(200,220,255,.9),rgba(120,160,255,.3))',borderRadius:'9px 9px 3px 3px',boxShadow:'0 0 20px rgba(150,190,255,.7)' }}/>
            <div style={{ width:2,height:34,background:'rgba(80,100,150,.6)' }}/>
            <div style={{ width:14,height:4,background:'rgba(80,100,150,.5)',borderRadius:2 }}/>
          </div>
        </>
      ) : home ? (
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

          {/* Gaming — clickable: opens the Quick Play panel */}
          <div className="absolute pointer-events-none" style={{ left:'79%',top:'68%',transform:'translate(-50%,-50%)',width:170,height:110,background:'radial-gradient(ellipse,rgba(0,200,255,.1) 0%,transparent 70%)',borderRadius:'50%' }}/>
          <div className="absolute pointer-events-none" style={{ left:'78%',top:'53%',transform:'translate(-50%,-50%)',fontFamily:'monospace',fontSize:8,letterSpacing:'0.2em',color:'rgba(0,229,255,.85)',textShadow:'0 0 8px rgba(0,229,255,.7)' }}>GAMING</div>
          <GamingStation/>
          <button onClick={e=>{e.stopPropagation();onGamesClick();}} style={{ position:'absolute',left:'79%',top:'66%',transform:'translate(-50%,-50%)',width:90,height:80,cursor:'pointer',background:'transparent',border:'none',padding:0,zIndex:15,display:'flex',flexDirection:'column',justifyContent:'flex-end',alignItems:'center' }} title="Games">
            <span style={{ fontFamily:'monospace',fontSize:8,color:'rgba(0,229,255,.75)',letterSpacing:'0.1em' }}>↑ TAP TO PLAY</span>
          </button>

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

const HATS: { id: string; label: string }[] = [
  { id: 'none', label: 'არა' }, { id: 'cap', label: '🧢' }, { id: 'crown', label: '👑' },
  { id: 'halo', label: '😇' }, { id: 'party', label: '🎉' }, { id: 'cat', label: '🐱' }, { id: 'beanie', label: '🎩' },
];
const PETS: { id: string; label: string }[] = [
  { id: 'none', label: 'არა' }, { id: 'cat', label: '🐱' }, { id: 'bot', label: '🤖' }, { id: 'ghost', label: '👻' }, { id: 'star', label: '⭐' },
  { id: 'fish', label: '🐟' }, { id: 'fish2', label: '🐠' }, { id: 'egg', label: '🥚' }, { id: 'chick', label: '🐥' }, { id: 'moon', label: '🌓' }, { id: 'car', label: '🚗' },
];
const FORMS: { id: string; label: string }[] = [
  { id: 'human', label: '🧍 ადამიანი' }, { id: 'car', label: '🚘 მანქანა' },
];
const LS_HAT = 'vs_hat', LS_PET = 'vs_pet', LS_FORM = 'vs_form';

// Premium space cosmetics: option id → { itemId (server catalog), price }. Others are free.
type Premium = Record<string, { id: string; price: number }>;
const PREMIUM_HATS: Premium = { party: { id: 'sp_hat_party', price: 500 }, crown: { id: 'sp_hat_crown', price: 800 }, halo: { id: 'sp_hat_halo', price: 800 } };
const PREMIUM_PETS: Premium = { fish2: { id: 'sp_pet_fish2', price: 400 }, chick: { id: 'sp_pet_chick', price: 400 }, bot: { id: 'sp_pet_bot', price: 600 }, star: { id: 'sp_pet_star', price: 600 } };
const PREMIUM_FORMS: Premium = { car: { id: 'sp_form_car', price: 1500 } };

// ── Photobooth — compose a neon group "photo" of present avatars on a canvas ──
function lightenHex(hex: string, amt = 0.45): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round((n >> 16 & 255) + (255 - (n >> 16 & 255)) * amt);
  const g = Math.round((n >> 8 & 255) + (255 - (n >> 8 & 255)) * amt);
  const b = Math.round((n & 255) + (255 - (n & 255)) * amt);
  return `rgb(${r},${g},${b})`;
}
function renderPhotobooth(list: SpacePlayer[], spaceName: string, accent: string): string {
  const W = 680, H = 460;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0a0520'); bg.addColorStop(0.5, '#0d0a24'); bg.addColorStop(1, '#05030f');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const rg = ctx.createRadialGradient(W / 2, -40, 20, W / 2, -40, 420);
  rg.addColorStop(0, accent + '44'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = accent + '66'; ctx.lineWidth = 3; ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px "Space Grotesk", sans-serif';
  ctx.fillText('📸 ' + (spaceName || 'VOID LOUNGE'), W / 2, 54);

  const people = list.slice(0, 8);
  const rows = people.length <= 4 ? 1 : 2;
  const perRow = Math.ceil(people.length / rows);
  const r = people.length <= 4 ? 48 : 42;
  const areaTop = 96;
  people.forEach((p, i) => {
    const row = Math.floor(i / perRow), col = i % perRow;
    const rowCount = row === rows - 1 ? people.length - perRow * (rows - 1) : perRow;
    const gap = W / (rowCount + 1);
    const x = gap * (col + 1);
    const y = rows === 1 ? 230 : areaTop + r + 8 + row * 150;
    ctx.save();
    ctx.shadowColor = p.glowColor; ctx.shadowBlur = 22;
    const og = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
    og.addColorStop(0, lightenHex(p.bodyColor)); og.addColorStop(1, p.bodyColor);
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2.5; ctx.strokeStyle = p.glowColor; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(r * 0.66)}px "Space Grotesk", sans-serif`;
    ctx.fillText((p.name || '?').slice(0, 1).toUpperCase(), x, y + r * 0.34);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '14px monospace';
    ctx.fillText((p.name || '').slice(0, 12), x, y + r + 22);
  });

  ctx.fillStyle = accent; ctx.font = '13px monospace';
  ctx.fillText(`${people.length} in the lounge`, W / 2, H - 44);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '12px monospace';
  ctx.fillText('voidmafia.one', W / 2, H - 24);
  return c.toDataURL('image/jpeg', 0.82);
}

function AvatarCustomizer({ playerName, onJoin }: { playerName: string; onJoin: (b: string, g: string, m: SpaceMask, hat: string, pet: string, form: string) => void }) {
  const authProfile = useAuthStore(s => s.profile);
  const owned = authProfile?.cosmetics?.unlockedItems ?? [];
  // Staff (moderators / admins / owners) get the car avatar for free.
  const isStaff = !!authProfile?.isModerator;
  const hasItem = (id: string) => owned.includes(id) || (id === 'sp_form_car' && isStaff);
  const [coins, setCoins] = useState<number | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [shopMsg, setShopMsg] = useState('');
  useEffect(() => { emitWithAck<undefined, Res<{ coins: number }>>('coins:balance').then(r => { if (r.ok) setCoins(r.data.coins); }).catch(() => {}); }, []);
  const [bodyColor, setBodyColor] = useState(() => localStorage.getItem(LS_BODY) ?? BODY_COLORS[0]);
  const [glowColor, setGlowColor] = useState(() => localStorage.getItem(LS_GLOW) ?? GLOW_COLORS[0]);
  const [mask, setMask] = useState<SpaceMask>(() => (localStorage.getItem(LS_MASK) as SpaceMask) ?? 'none');
  const [hat, setHat] = useState(() => localStorage.getItem(LS_HAT) ?? 'none');
  const [pet, setPet] = useState(() => localStorage.getItem(LS_PET) ?? 'none');
  const [form, setForm] = useState(() => localStorage.getItem(LS_FORM) ?? 'human');
  function go() { localStorage.setItem(LS_BODY,bodyColor); localStorage.setItem(LS_GLOW,glowColor); localStorage.setItem(LS_MASK,mask); localStorage.setItem(LS_HAT,hat); localStorage.setItem(LS_PET,pet); localStorage.setItem(LS_FORM,form); onJoin(bodyColor,glowColor,mask,hat,pet,form); }

  // Pick an option; if it's a locked premium item, buy it with coins first.
  async function pick(optId: string, prem: Premium, setter: (v: string) => void) {
    const it = prem[optId];
    if (!it || hasItem(it.id)) { setter(optId); return; }
    if (buying) return;
    setBuying(it.id); setShopMsg('');
    const res = await emitWithAck<{ itemId: string }, Res<{ cosmetics: PlayerCosmetics; newBalance: number }>>('cosmetics:buy_item', { itemId: it.id }).catch(() => null);
    setBuying(null);
    if (res?.ok) {
      useAuthStore.setState(s => s.profile ? { profile: { ...s.profile, cosmetics: res.data.cosmetics } } : s);
      setCoins(res.data.newBalance);
      setter(optId);
    } else { setShopMsg((res as any)?.error ?? 'შეძენა ვერ მოხერხდა'); setTimeout(() => setShopMsg(''), 3000); }
  }

  // Renders an option button with a 🔒+price overlay if it's a locked premium item.
  const optBtn = (o: { id: string; label: string }, prem: Premium, selected: string, setter: (v: string) => void, cls: string) => {
    const it = prem[o.id];
    const locked = it && !hasItem(it.id);
    const isSel = selected === o.id;
    return (
      <button key={o.id} onClick={() => pick(o.id, prem, setter)} className={cls + ' transition-all active:scale-95'}
        style={{ position: 'relative', background: isSel ? `${glowColor}22` : 'rgba(255,255,255,0.03)', border: `1px solid ${isSel ? glowColor + '80' : 'rgba(255,255,255,0.08)'}`, color: isSel ? glowColor : 'rgba(255,255,255,0.4)' }}>
        {o.label}
        {locked && <span style={{ display: 'block', fontSize: 8, color: '#facc15', marginTop: 1 }}>{buying === it.id ? '…' : `🔒${it.price}`}</span>}
      </button>
    );
  };

  return (
    <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} className="flex flex-col items-center gap-5 px-5 py-6">
      <div className="flex flex-col items-center gap-2">
        <div style={{ width:80,height:80,display:'flex',alignItems:'center',justifyContent:'center',background:`radial-gradient(ellipse at 40% 35%, ${glowColor}18, transparent 70%), rgba(8,3,24,.7)`,borderRadius:'50%',border:`1.5px solid ${bodyColor}55`,boxShadow:`0 0 0 4px ${bodyColor}20, 0 0 30px ${glowColor}30` }}>
          <HumanoidAvatar bodyColor={bodyColor} glowColor={glowColor} mask={mask} hat={hat} pet={pet} form={form} size={1.3} isMe />
        </div>
        <p style={{ fontFamily:'monospace',fontSize:11,color:bodyColor,textShadow:`0 0 8px ${bodyColor}80`,letterSpacing:'0.1em' }}>{playerName}</p>
        {coins !== null && <p style={{ fontFamily:'monospace',fontSize:11,color:'#facc15' }}>🪙 {coins.toLocaleString()}</p>}
        {shopMsg && <p style={{ fontFamily:'monospace',fontSize:10,color:'#ff2d55' }}>{shopMsg}</p>}
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
      <div className="w-full"><p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-2">ფორმა</p>
        <div className="flex gap-2">{FORMS.map(o=>optBtn(o, PREMIUM_FORMS, form, setForm, 'flex-1 py-1.5 rounded-xl font-mono text-[11px]'))}</div>
      </div>
      <div className="w-full"><p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-2">ქუდი</p>
        <div className="flex gap-2 flex-wrap">{HATS.map(o=>optBtn(o, PREMIUM_HATS, hat, setHat, 'py-1.5 px-3 rounded-xl font-mono text-[13px]'))}</div>
      </div>
      <div className="w-full"><p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-2">თანამგზავრი</p>
        <div className="flex gap-2 flex-wrap">{PETS.map(o=>optBtn(o, PREMIUM_PETS, pet, setPet, 'py-1.5 px-3 rounded-xl font-mono text-[13px]'))}</div>
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

  // ── Player lifecycle: when ANYONE is playing a video, it plays for EVERYONE
  // in the space (forced watch-party broadcast) — no need to walk to the TV. ──
  useEffect(() => {
    if (hasVideo) {
      if (farTimerRef.current) { clearTimeout(farTimerRef.current); farTimerRef.current = null; }
      if (!_ytTv && screenRef.current) {
        _ytTvStateCb = (st: number) => {
          if (st === 1 && pendingSearchRef.current) {
            // Search result started playing on the controller's player → publish it.
            pendingSearchRef.current = false;
            const vid = tvGetVidP();
            if (vid) (socket as any).emit('tv:set', { videoId: vid, title: tvGetTitleP() });
          }
          // Video ended → tell the server so it auto-advances the queue.
          if (st === 0) {
            const cur = stateRef.current;
            if (cur?.videoId) (socket as any).emit('tv:ended', { videoId: cur.videoId });
          }
        };
        _createTvPlayer(screenRef.current, () => {
          readyRef.current = true;
          setPlayerReady(true);
          applyState();
        });
      } else if (_ytTv && readyRef.current) {
        applyState();
      }
    } else if (!hasVideo && _ytTv && !pendingSearchRef.current) {
      // No active video — tear the player down shortly after.
      if (!farTimerRef.current) {
        farTimerRef.current = setTimeout(() => {
          farTimerRef.current = null;
          _destroyTvPlayer();
          readyRef.current = false;
          curVidRef.current = '';
          setPlayerReady(false);
        }, 800);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasVideo, tvState?.videoId, tvState?.isPlaying, tvState?.startedAt, tvState?.position]);

  // ── Audio: everyone in the room hears it. Proximity only softens it a
  // little (60–100%) — it never mutes, so you hear it from anywhere. ──────
  useEffect(() => {
    if (!_ytTv || !readyRef.current) return;
    const t = Math.max(0, Math.min(1, 1 - myDist / (TV_NEAR_RADIUS * 1.6)));
    tvSetVolP(Math.round(60 + 40 * t));
  }, [myDist, playerReady]);

  // ── Drift correction while playing ─────────────────────────────────────
  useEffect(() => {
    if (!tvState?.isPlaying) return;
    const t = setInterval(applyState, 4000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tvState?.isPlaying, tvState?.videoId]);

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
              style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 9, color: accent, letterSpacing: '0.08em' }}>🎬 NOW PLAYING</span>
              <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,.4)' }}>· 👁 {viewerCount}</span>
              {!!tvState?.queue?.length && <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,.4)' }}>· 📋 {tvState.queue.length}</span>}
              {(tvState?.skipVotes ?? 0) > 0 && <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#ff9f43' }}>· ⏭ {tvState!.skipVotes}/{tvState!.skipNeeded}</span>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Screen */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 10, overflow: 'hidden', background: '#000', border: `2px solid ${hasVideo ? accent + '99' : 'rgba(255,255,255,.12)'}`, boxShadow: hasVideo ? `0 0 28px ${accent}45, inset 0 0 30px rgba(0,0,0,.6)` : '0 6px 24px rgba(0,0,0,.5)', transition: 'border-color .3s, box-shadow .3s' }}>
          {/* Player (mounts for everyone whenever a video is active) */}
          <div ref={screenRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: fade ? 0 : 1, transition: 'opacity .3s', pointerEvents: 'none' }} />
          {/* Off state */}
          {!hasVideo && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'radial-gradient(ellipse at 50% 40%, rgba(0,40,60,.5), #000)', pointerEvents: 'none' }}>
              <span style={{ fontSize: 22, opacity: 0.5 }}>📺</span>
              <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,.35)' }}>
                {canControl ? 'TAP TO START' : 'OFF'}
              </span>
            </div>
          )}
          {/* Autoplay blocked — tap to start watching */}
          {needsTap && hasVideo && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'rgba(0,0,0,.55)', pointerEvents: 'none' }}>
              <span style={{ fontSize: 26 }}>▶</span>
              <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,.7)' }}>დააჭირე ყურებისთვის</span>
            </div>
          )}
          {/* Tap target — opens the watch-party panel for everyone (queue / skip;
              controllers also get transport). Also unblocks autoplay via gesture. */}
          <button
            onClick={() => setPanelOpen(true)}
            onTouchStart={(e) => { e.stopPropagation(); }}
            onPointerDown={(e) => { e.stopPropagation(); }}
            style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none', cursor: 'pointer', pointerEvents: 'auto' }}
            aria-label="TV"
          />
        </div>
        {localTitle && (
          <p style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,.5)', textAlign: 'center', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{localTitle}</p>
        )}
        {/* Skip pill — everyone can vote-skip; controllers skip instantly */}
        {hasVideo && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 5, pointerEvents: 'auto' }}>
            <button
              onClick={() => (socket as any).emit(canControl ? 'tv:next' : 'tv:vote_skip')}
              onTouchStart={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ fontFamily: 'monospace', fontSize: 10, padding: '4px 12px', borderRadius: 20, background: 'rgba(255,159,67,.12)', border: '1px solid rgba(255,159,67,.4)', color: '#ff9f43', cursor: 'pointer' }}>
              ⏭ {canControl ? 'Skip' : `Vote skip ${tvState ? `${tvState.skipVotes}/${tvState.skipNeeded}` : ''}`}
            </button>
          </div>
        )}
      </div>

      {/* Watch-party panel (open for everyone) */}
      <AnimatePresence>
        {panelOpen && (
          <TVControlPanel
            tvState={tvState}
            canControl={canControl}
            onClose={() => setPanelOpen(false)}
            onSetLink={setByLink}
            onSearch={doSearch}
            onEnqueueLink={(raw) => { const v = extractVideoId(raw); if (!v) return false; (socket as any).emit('tv:enqueue', { videoId: v, title: '' }); return true; }}
            onTogglePlay={togglePlay}
            onSeek={(p) => (socket as any).emit('tv:seek', { position: p })}
            onStop={stop}
            onNext={() => (socket as any).emit('tv:next')}
            onVoteSkip={() => (socket as any).emit('tv:vote_skip')}
            getTime={() => (playerReady ? tvGetTimeP() : (tvState ? tvComputedPos(tvState) : 0))}
            getDuration={() => _ytTv?.getDuration?.() ?? 0}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function TVControlPanel({ tvState, canControl, onClose, onSetLink, onSearch, onEnqueueLink, onTogglePlay, onSeek, onStop, onNext, onVoteSkip, getTime, getDuration }: {
  tvState: TVState | null;
  canControl: boolean;
  onClose: () => void;
  onSetLink: (raw: string) => boolean;
  onSearch: (q: string) => void;
  onEnqueueLink: (raw: string) => boolean;
  onTogglePlay: () => void;
  onSeek: (p: number) => void;
  onStop: () => void;
  onNext: () => void;
  onVoteSkip: () => void;
  getTime: () => number;
  getDuration: () => number;
}) {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'link' | 'search'>('link');
  const [err, setErr] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  const accent = '#00e5ff';
  const dur = getDuration();
  const cur = getTime();

  const playNow = () => {
    const v = input.trim(); if (!v) return;
    if (mode === 'search') { onSearch(v); setInput(''); return; }
    if (onSetLink(v)) { setInput(''); setErr(false); } else setErr(true);
  };
  const queueIt = () => {
    const v = input.trim(); if (!v) return;
    if (onEnqueueLink(v)) { setInput(''); setErr(false); } else setErr(true);
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
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 71, maxHeight: '80%', overflowY: 'auto', background: 'rgba(4,0,18,.98)', backdropFilter: 'blur(24px)', borderTop: `1.5px solid ${accent}55`, borderRadius: '18px 18px 0 0', padding: '16px 16px calc(16px + env(safe-area-inset-bottom,0px))' }}
      >
        <div style={{ width: 36, height: 3, background: 'rgba(255,255,255,.15)', borderRadius: 2, margin: '0 auto 16px' }} />
        <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 14, color: 'white', marginBottom: 12 }}>🎬 Watch Party</p>

        {/* link / search toggle (search plays now — controllers only) */}
        {canControl && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {(['link', 'search'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setErr(false); }}
                style={{ flex: 1, padding: '7px', borderRadius: 10, fontFamily: 'monospace', fontSize: 11, background: mode === m ? `${accent}22` : 'rgba(255,255,255,.04)', border: `1px solid ${mode === m ? accent : 'rgba(255,255,255,.1)'}`, color: mode === m ? accent : 'rgba(255,255,255,.4)' }}>
                {m === 'link' ? '🔗 ბმული' : '🔍 ძებნა'}
              </button>
            ))}
          </div>
        )}

        <input value={input} onChange={e => { setInput(e.target.value); setErr(false); }}
          onKeyDown={e => { if (e.key === 'Enter') (canControl ? playNow : queueIt)(); }}
          placeholder={mode === 'search' ? 'მოძებნე...' : 'YouTube ბმული ან ID'}
          style={{ width: '100%', background: 'rgba(255,255,255,.04)', fontFamily: 'monospace', fontSize: 13, color: 'white', outline: 'none', padding: '9px 12px', borderRadius: 12, border: `1px solid ${err ? 'rgba(255,45,85,.5)' : 'rgba(255,255,255,.1)'}`, marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {canControl && (
            <button onClick={playNow} style={{ flex: 1, padding: '9px', borderRadius: 12, fontFamily: 'monospace', fontSize: 12, background: `${accent}1f`, border: `1px solid ${accent}55`, color: accent }}>▶ ახლა</button>
          )}
          {mode === 'link' && (
            <button onClick={queueIt} style={{ flex: 1, padding: '9px', borderRadius: 12, fontFamily: 'monospace', fontSize: 12, background: 'rgba(155,0,255,.14)', border: '1px solid rgba(155,0,255,.4)', color: '#c084fc' }}>+ რიგში</button>
          )}
        </div>

        {/* Up-next queue */}
        {!!tvState?.queue?.length && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>📋 რიგი · {tvState.queue.length}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 120, overflowY: 'auto' }}>
              {tvState.queue.map((q, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', borderRadius: 9, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,.3)' }}>{i + 1}</span>
                  <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.title || q.videoId}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tvState && (
          <>
            {canControl ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,.4)', flexShrink: 0 }}>{fmt(cur)}</span>
                  <input type="range" min={0} max={Math.max(1, dur)} value={Math.min(cur, dur || cur)}
                    onChange={e => onSeek(Number(e.target.value))} style={{ flex: 1, accentColor: accent }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,.4)', flexShrink: 0 }}>{dur ? fmt(dur) : '--:--'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={onTogglePlay} style={{ flex: 1, padding: '10px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, background: `${accent}1f`, border: `1px solid ${accent}55`, color: accent }}>
                    {tvState.isPlaying ? '⏸ Pause' : '▶ Play'}
                  </button>
                  <button onClick={onNext} style={{ padding: '10px 14px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, background: 'rgba(255,159,67,.14)', border: '1px solid rgba(255,159,67,.4)', color: '#ff9f43' }}>⏭ Skip</button>
                  <button onClick={onStop} style={{ padding: '10px 14px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, background: 'rgba(255,45,85,.12)', border: '1px solid rgba(255,45,85,.35)', color: '#ff2d55' }}>⏹</button>
                </div>
              </>
            ) : (
              <button onClick={onVoteSkip} style={{ width: '100%', padding: '11px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, background: 'rgba(255,159,67,.14)', border: '1px solid rgba(255,159,67,.4)', color: '#ff9f43' }}>
                ⏭ ხმა გამოტოვებას · {tvState.skipVotes}/{tvState.skipNeeded}
              </button>
            )}
          </>
        )}
      </motion.div>
    </>
  );
}

// ── Expression picker (reactions + gestures) ──────────────────────────

const REACT_EMOJIS = ['😂', '🤍', '🔥', '👍', '😮', '😢', '🎉', '👏'];
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
  const openProfile = useSocialStore(s => s.openProfile);
  const openDmWith = useSocialStore(s => s.openDmWith);
  const [selectedPlayer, setSelectedPlayer] = useState<SpacePlayer | null>(null);
  const [weapon, setWeapon] = useState<'fist' | 'tomato' | 'snowball'>('fist');
  const [duelInvite, setDuelInvite] = useState<{ fromSocketId: string; fromName: string } | null>(null);
  const [duelBanner, setDuelBanner] = useState<{ text: string; result: boolean } | null>(null);
  const [koOpen, setKoOpen] = useState(false);
  const [koList, setKoList] = useState<{ id: string; username: string; avatar: string; avatarUrl: string | null; knockouts: number }[] | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoSharing, setPhotoSharing] = useState(false);
  const [photoMsg, setPhotoMsg] = useState('');
  const createPostV2 = useCommunityStore(s => s.createPostV2);
  const [followState, setFollowState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [socialProfileId, setSocialProfileId] = useState<string | null>(null);
  const openDmList = useSocialStore(s => s.openDmList);

  const { joined, ghost, mySocketId, players, chatHistory, space, reactions, projectiles, join, leave, moveLocal, sendChat, sit, stand, react, gesture, setTyping, listSpaces, createSpace, resolveSpace, inviteToSpace, setSpaceTheme, hit, knockout, clearKnockout, challengeDuel, respondDuel, ghostJoin, ghostLeave } = useVirtualSpace();
  // Owner Ghost Mode: when on, the owner observes spaces without spawning.
  const [ghostMode, setGhostMode] = useState(false);
  useEffect(() => {
    if (profile?.moderatorLevel === 'owner') {
      (socket as any).emit('mod:get_ghost', (res: any) => { if (res?.ok) setGhostMode(!!res.data.ghost); });
    }
  }, [profile?.moderatorLevel]);
  const { joined: voiceJoined, muted, speakingIds, status: voiceStatus, joinVoice, joinVoiceGhost, leaveVoice, toggleMute } = useSpaceVoice();

  // LiveKit voice for the Virtual Space: each space maps to a LiveKit room of
  // the same id. When LiveKit is enabled it REPLACES the legacy mesh voice here
  // (the mesh join calls below are guarded on livekitRef) so the mic isn't
  // double-captured. Ghosts join listen-only.
  const livekitEnabled = useLiveKitEnabled();
  const spaceVoice = useLivekitRoomVoice({
    roomId: joined && space ? space.id : null,
    identity: profile?.id ?? null,
    active: livekitEnabled && joined && !!space,
    listenOnly: ghost,
  });
  const livekitRef = useRef(false);
  useEffect(() => { livekitRef.current = livekitEnabled; }, [livekitEnabled]);

  // ── Space selection flow: lobby → customize → in-space ────────────────
  const [view, setView] = useState<'lobby' | 'customize'>('lobby');
  const [selectedSpace, setSelectedSpace] = useState<SpaceMetaT | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [resolvingDeepLink, setResolvingDeepLink] = useState(false);

  // Deep link / invite: resolve the code and teleport straight in (auto-join
  // with the saved avatar), so accepting an invite drops you right into the space.
  useEffect(() => {
    if (!initialSpaceCode) return;
    setResolvingDeepLink(true);
    resolveSpace(initialSpaceCode).then(res => {
      if (res.ok && res.space) {
        setSelectedSpace(res.space);
        const body = localStorage.getItem(LS_BODY) ?? BODY_COLORS[0];
        const glow = localStorage.getItem(LS_GLOW) ?? GLOW_COLORS[0];
        const mask = (localStorage.getItem(LS_MASK) as SpaceMask) ?? 'none';
        const hat = localStorage.getItem(LS_HAT) ?? 'none';
        const pet = localStorage.getItem(LS_PET) ?? 'none';
        const form = localStorage.getItem(LS_FORM) ?? 'human';
        joinTimeRef.current = Date.now();
        if (ghostMode) {
          ghostJoin(res.space.id).then(ok => { if (ok && !livekitRef.current) joinVoiceGhost(); }).finally(() => setResolvingDeepLink(false)); // observe + listen-only
        } else {
          join(res.space.id, playerName, body, glow, mask, hat, pet, form).then(ok => {
            if (ok && !livekitRef.current) joinVoice();
            setResolvingDeepLink(false);
          });
        }
      } else {
        setResolvingDeepLink(false); // not found → fall back to the lobby
      }
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
  const [confirmExit, setConfirmExit] = useState(false);
  const [showGames, setShowGames] = useState(false);
  const [launchingGame, setLaunchingGame] = useState<string | null>(null);

  // Gaming zone → spin up one of the casual games. The game overlay renders on
  // top, so we close the space (leave voice) and drop into the match.
  const ckCreate = useCheckersStore(s => s.createMatch);
  const jkCreate = useJokerStore(s => s.createMatch);
  const ldCreate = useLudoStore(s => s.createMatch);
  const wwCreate = useWWWStore(s => s.createMatch);
  const unoCreate = useUnoStore(s => s.createMatch);


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
  const djGestureArmedRef = useRef(false);
  useEffect(() => { myNameRef.current = playerName; }, [playerName]);

  // If the browser blocks DJ autoplay, resume on the next tap anywhere — no
  // button to press, it just starts as soon as the listener touches the screen.
  function armDjGesturePlay(videoId: string, startedAt: number) {
    if (djGestureArmedRef.current) return;
    djGestureArmedRef.current = true;
    const retry = () => {
      djGestureArmedRef.current = false;
      if (_yt) ytPlay(videoId, Math.max(0, (Date.now() - startedAt) / 1000));
    };
    document.addEventListener('touchstart', retry, { once: true, passive: true });
    document.addEventListener('click', retry, { once: true });
  }

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

      // Forced broadcast: when anyone DJs, the music auto-plays for EVERYONE in
      // the room — no "listen" button, no approval. (If the OS blocks autoplay,
      // armDjGesturePlay resumes it on the listener's next tap.)
      hasOptedInRef.current = true;
      if (!_yt) {
        // Player still initialising — queue it; fired in onReady callback
        pendingPlayRef.current = { videoId: state.videoId, seek };
      } else {
        ytPlay(state.videoId, seek);
        const vid = state.videoId, startedAt = state.startedAt;
        setTimeout(() => { if (!localPlayingRef.current) armDjGesturePlay(vid, startedAt); }, 900);
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

  const handleClose = useCallback(() => { leaveVoice(); if (ghost) ghostLeave(); else leave(); onClose(); }, [leave, leaveVoice, onClose, ghost, ghostLeave]);

  const launchGame = useCallback(async (gameId: string) => {
    if (launchingGame) return;
    setLaunchingGame(gameId);
    try {
      if (gameId === 'checkers') await ckCreate(playerName);
      else if (gameId === 'joker') await jkCreate(playerName);
      else if (gameId === 'ludo') await ldCreate(playerName, 4);
      else if (gameId === 'www') await wwCreate(playerName);
      else if (gameId === 'uno') await unoCreate(playerName, 4);
      // Match created → its overlay mounts above; leave the space and drop in.
      setShowGames(false);
      handleClose();
    } catch {
      setLaunchingGame(null);
    }
  }, [launchingGame, ckCreate, jkCreate, ldCreate, wwCreate, unoCreate, playerName, handleClose]);

  async function handleJoin(bodyColor: string, glowColor: string, mask: SpaceMask, hat: string, pet: string, form: string) {
    // Capture the user gesture timestamp BEFORE await so onDJUpdate's
    // justJoined check is accurate when music is playing in the room.
    joinTimeRef.current = Date.now();
    const ok = await join(selectedSpace?.id ?? 'main', playerName, bodyColor, glowColor, mask, hat, pet, form);
    if (ok && !livekitRef.current) joinVoice();
  }

  // Owner ghost-observe: skip the customizer and enter without spawning/voice.
  const handleGhostEnter = useCallback(() => {
    joinTimeRef.current = Date.now();
    ghostJoin(selectedSpace?.id ?? 'main').then(ok => { if (ok && !livekitRef.current) joinVoiceGhost(); }); // listen-only voice
  }, [ghostJoin, selectedSpace, joinVoiceGhost]);

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
    if (ghost) return; // ghost observers have no avatar to move
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
  const themeDef = getSpaceTheme(space?.theme);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const canChangeTheme = space?.canControlTv ?? false;

  // Knocked out of the space — drop voice & close transient UI; the knockout
  // overlay then prompts a re-entry.
  useEffect(() => {
    if (knockout) { leaveVoice(); setSelectedPlayer(null); }
  }, [knockout, leaveVoice]);

  // Duel lifecycle (friendly 1v1 — no wagering).
  useEffect(() => {
    const onInvite = (d: { fromSocketId: string; fromName: string }) => setDuelInvite(d);
    const onStart = (d: { aName: string; bName: string }) => {
      setDuelInvite(null);
      setDuelBanner({ text: `⚔️ ${d.aName} vs ${d.bName}`, result: false });
    };
    const onEnd = (d: { winnerName: string; loserName: string }) => {
      setDuelBanner({ text: `🏆 ${d.winnerName} გაიმარჯვა!`, result: true });
      setTimeout(() => setDuelBanner(null), 4000);
    };
    const onDeclined = (d: { byName: string }) => {
      setDuelBanner({ text: `${d.byName}-მ უარყო დუელი`, result: true });
      setTimeout(() => setDuelBanner(null), 2500);
    };
    (socket as any).on('space:duel_invite', onInvite);
    (socket as any).on('space:duel_start', onStart);
    (socket as any).on('space:duel_end', onEnd);
    (socket as any).on('space:duel_declined', onDeclined);
    return () => {
      (socket as any).off('space:duel_invite', onInvite);
      (socket as any).off('space:duel_start', onStart);
      (socket as any).off('space:duel_end', onEnd);
      (socket as any).off('space:duel_declined', onDeclined);
    };
  }, []);

  const openKoBoard = useCallback(() => {
    setKoOpen(true); setKoList(null);
    emitWithAck<undefined, Res<typeof koList>>('space:ko_leaderboard').then(r => { if (r.ok) setKoList(r.data as any); }).catch(() => {});
  }, []);

  const takePhoto = useCallback(() => {
    try {
      const list = [...players.values()];
      if (!list.length) return;
      setPhotoMsg('');
      setPhoto(renderPhotobooth(list, space?.name ?? 'VOID LOUNGE', themeDef.accent));
    } catch { /* canvas unsupported */ }
  }, [players, space?.name, themeDef.accent]);

  const sharePhoto = useCallback(async () => {
    if (!photo || photoSharing) return;
    setPhotoSharing(true); setPhotoMsg('');
    try {
      await createPostV2({ postType: 'image', content: `📸 ${space?.name ?? 'VOID LOUNGE'}`, imageUrl: photo, visibility: 'public' });
      setPhotoMsg('გაზიარდა ფიდში! 🎉');
      setTimeout(() => { setPhoto(null); setPhotoMsg(''); }, 1400);
    } catch (e: any) {
      setPhotoMsg(e?.message ?? 'ვერ გაიზიარა');
    } finally {
      setPhotoSharing(false);
    }
  }, [photo, photoSharing, createPostV2, space?.name]);

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
      <div style={{ display:'flex',alignItems:'center',gap:6,padding:'10px 12px',paddingTop:'calc(10px + env(safe-area-inset-top,0px))',background:'rgba(3,0,14,.96)',borderBottom:'1px solid rgba(155,0,255,.18)',backdropFilter:'blur(14px)',flexShrink:0 }}>
        <div style={{ width:8,height:8,borderRadius:'50%',background:'#9b00ff',boxShadow:'0 0 10px #9b00ff',animation:'vs-pulse 2s ease-in-out infinite',flexShrink:0 }}/>
        <div style={{ flex:1,minWidth:0 }}>
          <p style={{ fontFamily:'"Space Grotesk",sans-serif',fontWeight:700,fontSize:14,color:'white',letterSpacing:'0.05em',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
            {joined && space ? `${space.icon} ${space.name}`.toUpperCase() : 'VOID LOUNGE'}
          </p>
          <p style={{ fontFamily:'monospace',fontSize:10,color:'rgba(255,255,255,.28)',letterSpacing:'0.08em',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
            {joined ? (livekitEnabled ? `${players.size} online` : `${players.size} online · ${voiceLabel}`) : 'სოციალური სივრცე'}
          </p>
        </div>
        {joined && (
          <button onClick={openDmList} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl transition-all active:scale-90" style={{ background:'rgba(0,229,255,.08)',border:'1px solid rgba(0,229,255,.25)',fontSize:13 }} title="Messages">
            💬
          </button>
        )}
        {joined && (
          <button onClick={()=>setShowInvite(true)} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl transition-all active:scale-90" style={{ background:'rgba(155,0,255,.1)',border:'1px solid rgba(155,0,255,.3)',fontSize:14 }} title="მოწვევა">
            ✦
          </button>
        )}
        {joined && !ghost && !livekitEnabled && (
          <button onClick={toggleMute} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl transition-all active:scale-90" style={{ background:muted?'rgba(255,45,85,.12)':'rgba(0,229,255,.08)',border:`1px solid ${muted?'rgba(255,45,85,.35)':'rgba(0,229,255,.25)'}`,fontSize:14 }}>
            {muted ? '🔇' : '🎤'}
          </button>
        )}
        {ghost && (
          <span className="shrink-0 flex items-center gap-1 px-2 h-8 rounded-xl font-mono text-[10px] font-bold tracking-widest" style={{ background:'rgba(155,0,255,.14)', border:'1px solid rgba(155,0,255,.45)', color:'#c084fc' }}>
            👻 GHOST
          </span>
        )}
        {joined && (
          <button onClick={takePhoto} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl transition-all active:scale-90" style={{ background:'rgba(0,229,255,.1)',border:'1px solid rgba(0,229,255,.3)',fontSize:14 }} title="Photobooth">
            📸
          </button>
        )}
        {joined && (
          <button onClick={openKoBoard} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl transition-all active:scale-90" style={{ background:'rgba(255,180,0,.1)',border:'1px solid rgba(255,180,0,.3)',fontSize:14 }} title="KO რეიტინგი">
            🏆
          </button>
        )}
        {joined && canChangeTheme && (
          <button onClick={()=>setThemePickerOpen(true)} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl transition-all active:scale-90" style={{ background:`${themeDef.accent}14`,border:`1px solid ${themeDef.accent}40`,fontSize:14 }} title="თემა">
            🎨
          </button>
        )}
        <button onClick={() => { if (joined) setConfirmExit(true); else handleClose(); }} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl transition-all active:scale-90" style={{ background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.1)',color:'rgba(255,255,255,.45)',fontSize:14 }}>✕</button>
      </div>

      {/* LiveKit voice — replaces the mesh in the space when configured. */}
      {livekitEnabled && joined && (
        <div className="px-3 pb-2 shrink-0"><LiveKitVoiceBarView voice={spaceVoice} /></div>
      )}

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
                {ghostMode ? (
                  <div className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
                    <div style={{ fontSize: 52 }}>👻</div>
                    <p className="font-display font-bold text-white text-base">Ghost Observe</p>
                    <p className="font-mono text-[12px] text-white/40 leading-relaxed max-w-[260px]">
                      Enter invisibly to moderate — no avatar, no voice, no notification. Nobody will know you're watching.
                    </p>
                    <button onClick={handleGhostEnter}
                      className="px-6 py-3 rounded-xl font-mono text-sm font-bold transition-all active:scale-95"
                      style={{ background: 'rgba(155,0,255,.18)', border: '1px solid rgba(155,0,255,.45)', color: '#c084fc' }}>
                      👻 Enter as Ghost
                    </button>
                  </div>
                ) : (
                  <AvatarCustomizer playerName={playerName} onJoin={handleJoin}/>
                )}
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
              background: themeDef.bg,
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
            <RoomObjects djActive={!!djState?.isPlaying} onDJClick={()=>setDjPanelOpen(o=>!o)} onGamesClick={()=>setShowGames(true)} decor={layout.decor}/>

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

            {/* Flying projectiles (throwables / punches) + splat on impact */}
            {projectiles.map(pr => {
              const fly = pr.weapon === 'tomato' ? '🍅' : pr.weapon === 'snowball' ? '❄️' : '👊';
              const splat = pr.weapon === 'tomato' ? '🍅' : pr.weapon === 'snowball' ? '❄️' : '💥';
              const glow = pr.weapon === 'tomato' ? 'rgba(255,60,60,0.9)' : pr.weapon === 'snowball' ? 'rgba(160,220,255,0.95)' : 'rgba(255,200,60,0.9)';
              return (
                <div key={pr.id}>
                  <motion.div
                    initial={{ left: `${pr.fromX}%`, top: `${pr.fromY}%`, opacity: 0, scale: 0.6 }}
                    animate={{ left: `${pr.toX}%`, top: `${pr.toY}%`, opacity: [0, 1, 1, 1], scale: 1, rotate: pr.weapon === 'tomato' ? 540 : pr.weapon === 'snowball' ? 360 : 0 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    style={{ position: 'absolute', transform: 'translate(-50%, -120%)', zIndex: 45, pointerEvents: 'none', fontSize: 20, filter: `drop-shadow(0 0 5px ${glow})` }}
                  >{fly}</motion.div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.3 }}
                    animate={{ opacity: [0, 1, 0], scale: [0.3, 1.4, 1.1] }}
                    transition={{ duration: 0.42, delay: 0.38, ease: 'easeOut' }}
                    style={{ position: 'absolute', left: `${pr.toX}%`, top: `${pr.toY}%`, transform: 'translate(-50%, -120%)', zIndex: 46, pointerEvents: 'none', fontSize: 26, filter: `drop-shadow(0 0 8px ${glow})` }}
                  >{splat}</motion.div>
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
  <AvatarOnMap key={p.socketId} player={p} isMe={p.socketId===mySocketId} speaking={isSpeaking(p)} onTap={()=>{ setSelectedPlayer(p); setFollowState('idle'); }} />
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
            {ghost ? (
              <div style={{ flex:1,display:'flex',alignItems:'center',gap:6,fontFamily:'monospace',fontSize:12,color:'#c084fc',paddingLeft:4 }}>👻 Observing — read only</div>
            ) : (<>
            <input value={chat} onChange={e=>{ setChat(e.target.value); if(e.target.value.trim()) setTyping(true); else setTyping(false); }} maxLength={140} placeholder="გზავნილი…"
              style={{ flex:1,background:'rgba(255,255,255,.04)',fontFamily:'monospace',fontSize:13,color:'white',outline:'none',padding:'8px 12px',borderRadius:12,border:'1px solid rgba(255,255,255,.1)' }}
              onFocus={e=>e.stopPropagation()}
              onBlur={()=>setTyping(false)}
            />
            <button type="button" onClick={()=>setShowExpr(o=>!o)} style={{ padding:'8px 10px',borderRadius:12,fontFamily:'monospace',fontSize:15,lineHeight:1,background:showExpr?'rgba(255,0,150,.2)':'rgba(255,255,255,.04)',border:`1px solid ${showExpr?'rgba(255,0,150,.5)':'rgba(255,255,255,.1)'}`,transition:'all .15s',flexShrink:0 }} title="გამოხატვა">😊</button>
            <button type="submit" disabled={!chat.trim()} style={{ padding:'8px 14px',borderRadius:12,fontFamily:'monospace',fontSize:13,background:'rgba(155,0,255,.15)',border:'1px solid rgba(155,0,255,.4)',color:'#c084fc',transition:'all .15s',flexShrink:0 }}>→</button>
            </>)}
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

      {/* Player popup — tap someone's avatar */}
      {selectedPlayer && createPortal(
        <div onClick={() => setSelectedPlayer(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 'min(300px, 100%)', background: 'rgba(8,3,22,.99)', border: `1px solid ${selectedPlayer.glowColor}55`, borderRadius: 20, padding: '20px', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(ellipse at 40% 35%, ${selectedPlayer.glowColor}22, transparent 70%)`, borderRadius: '50%', border: `1.5px solid ${selectedPlayer.bodyColor}66` }}>
              <HumanoidAvatar bodyColor={selectedPlayer.bodyColor} glowColor={selectedPlayer.glowColor} mask={selectedPlayer.mask} hat={selectedPlayer.hat} pet={selectedPlayer.pet} form={selectedPlayer.form} size={1.05} />
            </div>
            <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 16, color: 'white', marginBottom: 10 }}>{selectedPlayer.name}</p>
            {(() => {
              const liveHp = players.get(selectedPlayer.socketId)?.hp ?? selectedPlayer.hp ?? 10;
              const here = players.has(selectedPlayer.socketId);
              const col = liveHp > 6 ? '#00ff88' : liveHp > 3 ? '#facc15' : '#ff2d55';
              return (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 120, height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                      <div style={{ width: `${liveHp * 10}%`, height: '100%', background: col, boxShadow: `0 0 8px ${col}aa`, transition: 'width 0.25s ease' }} />
                    </div>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: col }}>{liveHp}/10</span>
                  </div>
                  {/* Weapon picker */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    {([['fist','👊'],['tomato','🍅'],['snowball','❄️']] as const).map(([w, ic]) => (
                      <button key={w} onClick={() => setWeapon(w)}
                        style={{ flex: 1, padding: '8px', borderRadius: 10, fontSize: 18, background: weapon === w ? 'rgba(255,45,85,.2)' : 'rgba(255,255,255,.04)', border: `1px solid ${weapon === w ? 'rgba(255,45,85,.5)' : 'rgba(255,255,255,.1)'}`, transition: 'transform .08s' }}>{ic}</button>
                    ))}
                  </div>
                  <button
                    disabled={!here}
                    onClick={() => { if (players.has(selectedPlayer.socketId)) hit(selectedPlayer.socketId, weapon); }}
                    style={{ width: '100%', padding: '12px', borderRadius: 12, fontFamily: 'monospace', fontSize: 14, fontWeight: 700, background: 'rgba(255,45,85,.16)', border: '1px solid rgba(255,45,85,.45)', color: '#ff6b81', opacity: here ? 1 : 0.4, transition: 'transform .08s' }}
                    onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.95)'; }}
                    onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                  >{weapon === 'tomato' ? '🍅 სროლა' : weapon === 'snowball' ? '❄️ სროლა' : '👊 დარტყმა'}</button>
                  <button
                    disabled={!here}
                    onClick={() => { if (players.has(selectedPlayer.socketId)) { challengeDuel(selectedPlayer.socketId); setSelectedPlayer(null); } }}
                    style={{ width: '100%', marginTop: 8, padding: '11px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, fontWeight: 700, background: 'rgba(255,180,0,.12)', border: '1px solid rgba(255,180,0,.4)', color: '#facc15', opacity: here ? 1 : 0.4 }}
                  >⚔️ დუელზე გამოწვევა</button>
                </div>
              );
            })()}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => {
                  if (me && selectedPlayer) { const a = 6 - Math.random()*12; moveLocal(mySocketId, Math.max(5,Math.min(95,selectedPlayer.x + a)), Math.max(5,Math.min(92,selectedPlayer.y + 4))); }
                  setSelectedPlayer(null);
                }}
                style={{ padding: '11px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, background: 'rgba(0,229,255,.12)', border: '1px solid rgba(0,229,255,.35)', color: '#00e5ff' }}>🚶 გადასვლა</button>
              {selectedPlayer.profileId && profile?.id !== selectedPlayer.profileId && (
                <>
                  <button disabled={followState !== 'idle'} onClick={() => {
                      const tid = selectedPlayer.profileId!;
                      setFollowState('busy');
                      (socket as any).emit('friend:request', { toProfileId: tid }, () => {
                        // ok OR already-sent/already-friends → mark as sent
                        setFollowState('done');
                      });
                    }}
                    style={{ padding: '11px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, background: followState==='done' ? 'rgba(0,255,136,.12)' : 'rgba(155,0,255,.14)', border: `1px solid ${followState==='done' ? 'rgba(0,255,136,.4)' : 'rgba(155,0,255,.4)'}`, color: followState==='done' ? '#00ff88' : '#c084fc' }}>
                    {followState === 'busy' ? '…' : followState === 'done' ? '✓ მოთხოვნა გაიგზავნა' : '➕ მეგობრობის მოთხოვნა'}
                  </button>
                  {/* These open as glass overlays ON TOP of the lounge — they no longer eject you. */}
                  <button onClick={() => { const tid = selectedPlayer.profileId!; setSelectedPlayer(null); openDmWith(tid); }}
                    style={{ padding: '11px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, background: 'rgba(0,255,136,.12)', border: '1px solid rgba(0,255,136,.35)', color: '#00ff88' }}>💬 Message</button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { const tid = selectedPlayer.profileId!; setSelectedPlayer(null); setSocialProfileId(tid); }}
                      style={{ flex: 1, padding: '11px', borderRadius: 12, fontFamily: 'monospace', fontSize: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)', color: 'rgba(255,255,255,.7)' }}>👤 Social</button>
                    <button onClick={() => { const tid = selectedPlayer.profileId!; setSelectedPlayer(null); openProfile(tid); }}
                      style={{ flex: 1, padding: '11px', borderRadius: 12, fontFamily: 'monospace', fontSize: 12, background: 'rgba(255,159,67,.12)', border: '1px solid rgba(255,159,67,.35)', color: '#ff9f43' }}>🎮 Mafia</button>
                  </div>
                </>
              )}
              <button onClick={() => setSelectedPlayer(null)}
                style={{ padding: '9px', borderRadius: 12, fontFamily: 'monospace', fontSize: 12, background: 'transparent', border: 'none', color: 'rgba(255,255,255,.35)' }}>დახურვა</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Space theme picker (owner / main lounge) */}
      {themePickerOpen && createPortal(
        <div onClick={() => setThemePickerOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 'min(460px,100%)', maxHeight: '80vh', overflowY: 'auto', background: 'rgba(8,3,22,.99)', borderTop: `1.5px solid ${themeDef.accent}55`, borderRadius: '22px 22px 0 0', padding: 20 }}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-display font-bold text-white" style={{ fontSize: 15 }}>🎨 Space Theme</p>
              <button onClick={() => setThemePickerOpen(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/35" style={{ background: 'rgba(255,255,255,.05)' }}>✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SPACE_THEME_DEFS.map(th => {
                const owned = th.price === 0 || (profile?.cosmetics?.unlockedItems ?? []).includes(itemIdForTheme(th.id));
                const active = (space?.theme ?? 'void') === th.id;
                return (
                  <button key={th.id}
                    onClick={async () => {
                      if (!owned) { setThemePickerOpen(false); return; }
                      const ok = await setSpaceTheme(th.id);
                      if (ok) setThemePickerOpen(false);
                    }}
                    className="text-left rounded-2xl overflow-hidden transition-all active:scale-95"
                    style={{ border: `1px solid ${active ? th.accent : owned ? `${th.accent}40` : 'rgba(255,255,255,.08)'}`, opacity: owned ? 1 : 0.65 }}>
                    <div style={{ height: 54, background: th.bg }} />
                    <div style={{ padding: '7px 9px', background: active ? `${th.accent}1a` : 'rgba(255,255,255,.02)' }}>
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-[12px]" style={{ color: active ? th.accent : 'rgba(255,255,255,.7)' }}>{th.name}</p>
                        {active && <span style={{ fontSize: 9, color: th.accent }}>● active</span>}
                      </div>
                      <p className="font-mono text-[10px]" style={{ color: RARITY_COLOR[th.rarity] }}>
                        {owned ? (th.price === 0 ? 'Default' : 'Owned') : `🔒 ${th.price} coins`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-center font-mono text-[10px] text-white/20 leading-relaxed pt-3 px-2">
              Locked themes can be bought from the Coin Shop → Spaces tab. Everyone in the room sees the active theme.
            </p>
          </div>
        </div>,
        document.body
      )}

      {/* Photobooth preview */}
      {photo && createPortal(
        <div onClick={() => !photoSharing && setPhoto(null)} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(420px,100%)', background: 'rgba(8,3,22,.99)', border: '1px solid rgba(0,229,255,.3)', borderRadius: 20, padding: 16 }}>
            <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 15, color: '#fff', marginBottom: 10, textAlign: 'center' }}>📸 Photobooth</p>
            <img src={photo} alt="group photo" style={{ width: '100%', borderRadius: 12, display: 'block' }} />
            {photoMsg && <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#00ff88', textAlign: 'center', marginTop: 8 }}>{photoMsg}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => setPhoto(null)} disabled={photoSharing}
                style={{ flex: 1, padding: '11px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)', color: 'rgba(255,255,255,.6)' }}>დახურვა</button>
              <button onClick={sharePhoto} disabled={photoSharing}
                style={{ flex: 2, padding: '11px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, fontWeight: 700, background: 'rgba(0,229,255,.14)', border: '1px solid rgba(0,229,255,.4)', color: '#00e5ff' }}>
                {photoSharing ? '…' : '📢 ფიდში გაზიარება'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Duel banner (top center) */}
      <AnimatePresence>
        {duelBanner && (
          <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -30, opacity: 0 }}
            style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', zIndex: 120, padding: '8px 18px', borderRadius: 14, fontFamily: '"Space Grotesk",monospace', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', background: duelBanner.result ? 'rgba(250,204,21,.16)' : 'rgba(255,45,85,.16)', border: `1px solid ${duelBanner.result ? 'rgba(250,204,21,.5)' : 'rgba(255,45,85,.5)'}`, color: duelBanner.result ? '#facc15' : '#ff6b81', backdropFilter: 'blur(8px)', boxShadow: '0 4px 20px rgba(0,0,0,.5)' }}>
            {duelBanner.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Duel invite overlay */}
      {duelInvite && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            style={{ width: 'min(320px,100%)', textAlign: 'center', background: 'rgba(8,3,22,.99)', border: '1px solid rgba(255,180,0,.45)', borderRadius: 20, padding: '26px 22px' }}>
            <div style={{ fontSize: 44, marginBottom: 6 }}>⚔️</div>
            <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 16, color: '#fff', marginBottom: 6 }}>დუელის გამოწვევა</p>
            <p style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,.55)', marginBottom: 18 }}>
              <span style={{ color: '#facc15' }}>{duelInvite.fromName}</span> გიწვევს დუელზე. მიიღებ?
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { respondDuel(duelInvite.fromSocketId, false); setDuelInvite(null); }}
                style={{ flex: 1, padding: '12px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)', color: 'rgba(255,255,255,.6)' }}>უარი</button>
              <button onClick={() => { respondDuel(duelInvite.fromSocketId, true); setDuelInvite(null); }}
                style={{ flex: 1, padding: '12px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, fontWeight: 700, background: 'rgba(0,255,136,.14)', border: '1px solid rgba(0,255,136,.45)', color: '#00ff88' }}>⚔️ მიღება</button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* KO leaderboard panel */}
      {koOpen && createPortal(
        <div onClick={() => setKoOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1250, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(340px,100%)', maxHeight: '76vh', overflowY: 'auto', background: 'rgba(8,3,22,.99)', border: '1px solid rgba(255,180,0,.3)', borderRadius: 20, padding: 20 }}>
            <div className="flex items-center justify-between mb-3">
              <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 15, color: '#facc15' }}>🏆 KO რეიტინგი</p>
              <button onClick={() => setKoOpen(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/35" style={{ background: 'rgba(255,255,255,.05)' }}>✕</button>
            </div>
            {koList === null ? (
              <p className="text-center font-mono text-[12px] text-white/30 py-6">…</p>
            ) : koList.length === 0 ? (
              <p className="text-center font-mono text-[12px] text-white/30 py-6">ჯერ არავის ჩაურტყამს. იყავი პირველი! 👊</p>
            ) : (
              <div className="space-y-1.5">
                {koList.map((u, i) => (
                  <div key={u.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)' }}>
                    <span style={{ width: 22, textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: i === 0 ? '#facc15' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'rgba(255,255,255,.3)' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </span>
                    <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-sm flex-shrink-0" style={{ background: 'linear-gradient(135deg,rgba(255,0,128,.5),rgba(138,43,226,.5))' }}>
                      {u.avatarUrl ? <img src={u.avatarUrl} alt={u.username} className="w-full h-full object-cover" /> : u.avatar}
                    </div>
                    <span className="flex-1 min-w-0 truncate font-mono text-[13px] text-white/80">{u.username}</span>
                    <span className="font-mono text-[13px] font-bold" style={{ color: '#ff6b81' }}>{u.knockouts} KO</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Knockout overlay — shown to a player who hit 0 HP and was ejected */}
      {knockout && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            style={{ width: 'min(320px,100%)', textAlign: 'center', background: 'rgba(8,3,22,.99)', border: '1px solid rgba(255,45,85,.45)', borderRadius: 20, padding: '28px 22px', boxShadow: '0 0 50px rgba(255,45,85,.25)' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>💥</div>
            <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 18, color: '#fff', marginBottom: 6 }}>ნოკაუტი!</p>
            <p style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,.55)', marginBottom: 18, lineHeight: 1.5 }}>
              <span style={{ color: '#ff6b81' }}>{knockout.byName}</span>-მ გაგაგდო Space-დან. ხელახლა შემოდი სათამაშოდ.
            </p>
            <button onClick={clearKnockout}
              style={{ width: '100%', padding: '12px', borderRadius: 12, fontFamily: 'monospace', fontSize: 14, fontWeight: 700, background: 'rgba(155,0,255,.18)', border: '1px solid rgba(155,0,255,.45)', color: '#c084fc' }}>
              ↩ ხელახლა შესვლა
            </button>
          </motion.div>
        </div>,
        document.body
      )}

      {/* Social profile overlay (community profile with followers/following) */}
      {socialProfileId && (
        <ProfileModalV2 profileId={socialProfileId} onClose={() => setSocialProfileId(null)} />
      )}

      {/* Gaming zone — Quick Play */}
      {showGames && createPortal(
        <div onClick={() => !launchingGame && setShowGames(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 'min(360px, 100%)', background: 'rgba(8,3,22,.99)', border: '1px solid rgba(0,229,255,.3)', borderRadius: 20, padding: '18px 18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 16, color: 'white' }}>🎮 Quick Play</p>
              <button onClick={() => !launchingGame && setShowGames(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', fontSize: 16, cursor: 'pointer' }}>✕</button>
            </div>
            <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 14 }}>აირჩიე თამაში — შეიქმნება ოთახი და მოიწვევ მეგობრებს</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { id: 'uno', label: 'UNO', emoji: '🎴', accent: '#ff2d55' },
                { id: 'checkers', label: 'Checkers', emoji: '⚪', accent: '#00e5ff' },
                { id: 'joker', label: 'Joker', emoji: '🃏', accent: '#ffcc00' },
                { id: 'ludo', label: 'Ludo', emoji: '🎲', accent: '#00ff88' },
                { id: 'www', label: 'Who Wants', emoji: '❓', accent: '#9b00ff' },
              ].map(g => (
                <button key={g.id} disabled={!!launchingGame} onClick={() => launchGame(g.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: `${g.accent}14`, border: `1px solid ${g.accent}44`, cursor: 'pointer', opacity: launchingGame && launchingGame !== g.id ? 0.4 : 1, transition: 'all .15s' }}>
                  <span style={{ fontSize: 22 }}>{g.emoji}</span>
                  <span style={{ flex: 1, textAlign: 'left', fontFamily: 'monospace', fontSize: 14, color: 'white' }}>{g.label}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: g.accent }}>{launchingGame === g.id ? '…' : 'Play →'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Exit confirmation — portal to body so it can't be clipped/mis-stacked */}
      {confirmExit && createPortal(
        <div
          onClick={() => setConfirmExit(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 'min(320px, 100%)', background: 'rgba(8,3,22,.99)', border: '1px solid rgba(155,0,255,.3)', borderRadius: 20, padding: '22px 20px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,.7)' }}>
            <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 16, color: 'white', marginBottom: 6 }}>დარწმუნებული ხარ?</p>
            <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,.45)', marginBottom: 18 }}>Are you sure you want to exit?</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmExit(false)}
                style={{ flex: 1, padding: '11px', borderRadius: 14, fontFamily: 'monospace', fontSize: 13, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', color: 'rgba(255,255,255,.6)' }}>
                No
              </button>
              <button onClick={() => { setConfirmExit(false); handleClose(); }}
                style={{ flex: 1, padding: '11px', borderRadius: 14, fontFamily: 'monospace', fontSize: 13, background: 'rgba(255,45,85,.16)', border: '1px solid rgba(255,45,85,.4)', color: '#ff2d55' }}>
                Yes
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Hidden YouTube player — always mounted, initialises before join */}
      <div ref={ytDivRef} style={{position:'fixed',opacity:0,pointerEvents:'none',width:1,height:1,left:-10,top:-10,zIndex:-1}}/>
    </motion.div>
  );
}

