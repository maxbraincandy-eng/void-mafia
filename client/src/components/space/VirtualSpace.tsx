import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualSpace, type SpacePlayer, type SpaceMask } from '@/hooks/useVirtualSpace';
import { useSpaceVoice } from '@/hooks/useSpaceVoice';
import { useAuthStore } from '@/store/authStore';

// ── Avatar palette ────────────────────────────────────────────────────

const BODY_COLORS = ['#9b00ff', '#00e5ff', '#ff00aa', '#00ff88', '#ff6600', '#3b82f6', '#ffcc00', '#ff2255'];
const GLOW_COLORS = ['#00e5ff', '#9b00ff', '#00ff88', '#ff00aa', '#ffcc00', '#ff6600', '#ff2255', '#c084fc'];
const MASKS: { id: SpaceMask; label: string }[] = [
  { id: 'none',  label: 'None'  },
  { id: 'half',  label: 'Half'  },
  { id: 'full',  label: 'Full'  },
  { id: 'visor', label: 'Visor' },
];

const LS_BODY  = 'vs_bodyColor';
const LS_GLOW  = 'vs_glowColor';
const LS_MASK  = 'vs_mask';

// ── CSS keyframes injected once ───────────────────────────────────────

const SPACE_CSS = `
@keyframes vs-float  { 0%,100%{transform:translateY(0)}  50%{transform:translateY(-4px)} }
@keyframes vs-pulse  { 0%,100%{opacity:.7} 50%{opacity:1} }
@keyframes vs-speak  { 0%,100%{transform:scale(1);opacity:.9} 50%{transform:scale(1.2);opacity:.4} }
@keyframes vs-spin   { to{transform:rotate(360deg)} }
@keyframes vs-glow   { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.35)} }
@keyframes vs-drift  { 0%{transform:translateY(0) translateX(0);opacity:0}
                       10%{opacity:.55}  90%{opacity:.25}
                       100%{transform:translateY(-55px) translateX(12px);opacity:0} }
`;

// ── Humanoid SVG avatar ───────────────────────────────────────────────

interface AvatarProps {
  bodyColor: string;
  glowColor: string;
  mask: SpaceMask;
  size?: number;
  speaking?: boolean;
  walking?: boolean;
  isMe?: boolean;
}

function HumanoidAvatar({ bodyColor, glowColor, mask, size = 1, speaking, walking, isMe }: AvatarProps) {
  const w = Math.round(32 * size);
  const h = Math.round(56 * size);
  const dim = `0 0 32 56`;
  const bodyDark  = bodyColor + 'cc';
  const bodyLight = bodyColor + 'ee';
  const glowDim   = glowColor + '55';

  return (
    <div style={{ position: 'relative', width: w, height: h, flexShrink: 0 }}>
      {/* Speaking ring */}
      {speaking && (
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.9, 0.35, 0.9] }}
          transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            top: -6, left: Math.round(w / 2) - Math.round(11 * size) - 6,
            width: Math.round(22 * size) + 12,
            height: Math.round(22 * size) + 12,
            borderRadius: '50%',
            border: `2px solid ${glowColor}`,
            boxShadow: `0 0 12px ${glowColor}80`,
            pointerEvents: 'none',
          }}
        />
      )}

      <svg width={w} height={h} viewBox={dim} fill="none" xmlns="http://www.w3.org/2000/svg"
        style={{
          filter: speaking
            ? `drop-shadow(0 0 8px ${glowColor}cc)`
            : `drop-shadow(0 0 ${isMe ? 5 : 3}px ${bodyColor}99)`,
        }}
      >
        {/* Ground shadow */}
        <ellipse cx="16" cy="54" rx="7" ry="2.5" fill="rgba(0,0,0,0.35)" />

        {/* Legs */}
        <rect
          x="9" y="36" width="5" height="17" rx="2.5"
          fill={bodyDark}
          style={walking ? { animation: 'vs-float 0.32s ease-in-out infinite alternate' } : {}}
        />
        <rect
          x="18" y="36" width="5" height="17" rx="2.5"
          fill={bodyDark}
          style={walking ? { animation: 'vs-float 0.32s ease-in-out 0.16s infinite alternate' } : {}}
        />

        {/* Body */}
        <rect x="7" y="21" width="18" height="17" rx="3.5" fill={bodyLight} />

        {/* Body accent stripe */}
        <rect x="14" y="23" width="4" height="13" rx="2" fill={glowColor} opacity="0.28" />

        {/* Chest badge */}
        <circle cx="16" cy="26" r="2.2" fill={glowColor} opacity="0.5" />
        <circle cx="16" cy="26" r="1"   fill="white"     opacity="0.7" />

        {/* Arms */}
        <rect x="1"  y="23" width="5.5" height="13" rx="2.5" fill={bodyDark} />
        <rect x="25.5" y="23" width="5.5" height="13" rx="2.5" fill={bodyDark} />

        {/* Neck */}
        <rect x="13" y="16" width="6" height="7" rx="2" fill={bodyLight} />

        {/* Head */}
        <circle cx="16" cy="9" r="9" fill={bodyLight} />

        {/* Head highlight */}
        <circle cx="12.5" cy="6.5" r="4" fill="white" opacity="0.07" />

        {/* Eyes */}
        <circle cx="12.5" cy="9" r="2.2" fill={glowColor} opacity="0.9" />
        <circle cx="19.5" cy="9" r="2.2" fill={glowColor} opacity="0.9" />
        <circle cx="12.5" cy="9" r="0.9" fill="white" opacity="0.95" />
        <circle cx="19.5" cy="9" r="0.9" fill="white" opacity="0.95" />
        <circle cx="12.5" cy="9" r="3"   fill={glowColor} opacity="0.12" />
        <circle cx="19.5" cy="9" r="3"   fill={glowColor} opacity="0.12" />

        {/* Mask overlays */}
        {mask === 'half' && (
          <>
            <rect x="9" y="11" width="14" height="7" rx="3"
              fill="rgba(0,0,0,0.65)" stroke={glowColor} strokeWidth="0.6" opacity="0.95" />
            <line x1="10" y1="14" x2="22" y2="14" stroke={glowColor} strokeWidth="0.5" opacity="0.5" />
          </>
        )}
        {mask === 'full' && (
          <>
            <circle cx="16" cy="9" r="8.5" fill="rgba(0,0,0,0.6)" stroke={glowColor} strokeWidth="0.8" opacity="0.95" />
            <rect x="9" y="7" width="14" height="4" rx="2" fill={glowColor} opacity="0.18" />
          </>
        )}
        {mask === 'visor' && (
          <>
            <rect x="8" y="5.5" width="16" height="7" rx="3.5"
              fill={glowColor} opacity="0.28" />
            <rect x="8" y="5.5" width="16" height="7" rx="3.5"
              fill="none" stroke={glowColor} strokeWidth="0.8" opacity="0.9" />
            <line x1="8" y1="9" x2="24" y2="9" stroke={glowColor} strokeWidth="0.4" opacity="0.6" />
          </>
        )}

        {/* "Me" crown */}
        {isMe && (
          <g transform="translate(12,-1)">
            <polygon points="4,0 5.5,3 4,2.5 2.5,3" fill={glowColor} opacity="0.9" />
            <rect x="2" y="2.5" width="4" height="1" rx="0.5" fill={glowColor} opacity="0.7" />
          </g>
        )}
      </svg>
    </div>
  );
}

// ── Avatar on map ─────────────────────────────────────────────────────

function AvatarOnMap({
  player,
  isMe,
  speaking,
}: {
  player: SpacePlayer;
  isMe: boolean;
  speaking: boolean;
}) {
  const prevPos = useRef({ x: player.x, y: player.y });
  const [walking, setWalking] = useState(false);
  const walkRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevPos.current.x !== player.x || prevPos.current.y !== player.y) {
      prevPos.current = { x: player.x, y: player.y };
      setWalking(true);
      if (walkRef.current) clearTimeout(walkRef.current);
      walkRef.current = setTimeout(() => setWalking(false), 350);
    }
    return () => { if (walkRef.current) clearTimeout(walkRef.current); };
  }, [player.x, player.y]);

  return (
    <div
      style={{
        position: 'absolute',
        left: `${player.x}%`,
        top: `${player.y}%`,
        transform: 'translate(-50%, -100%)',
        transition: 'left 0.35s cubic-bezier(0.4,0,0.2,1), top 0.35s cubic-bezier(0.4,0,0.2,1)',
        zIndex: isMe ? 30 : 20,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
      }}
    >
      {/* Chat bubble */}
      <AnimatePresence>
        {player.message && (
          <motion.div
            key={player.message + player.socketId}
            initial={{ opacity: 0, y: 8, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            style={{
              position: 'relative',
              background: 'rgba(8,3,24,0.88)',
              backdropFilter: 'blur(10px)',
              border: `1px solid rgba(255,255,255,0.14)`,
              borderRadius: 14,
              padding: '6px 12px',
              maxWidth: 168,
              textAlign: 'center',
              fontSize: 12,
              color: 'rgba(255,255,255,0.93)',
              boxShadow: `0 4px 20px rgba(0,0,0,0.5), 0 0 14px ${player.glowColor}28`,
              marginBottom: 4,
              wordBreak: 'break-word',
              lineHeight: 1.4,
            }}
          >
            {player.message}
            <div style={{
              position: 'absolute', bottom: -6, left: '50%',
              transform: 'translateX(-50%)',
              width: 0, height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '6px solid rgba(255,255,255,0.1)',
            }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar */}
      <motion.div
        animate={walking
          ? { rotate: [-1.5, 1.5], y: [0, -2, 0] }
          : { y: [0, -3, 0] }}
        transition={walking
          ? { duration: 0.28, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <HumanoidAvatar
          bodyColor={player.bodyColor}
          glowColor={player.glowColor}
          mask={player.mask}
          speaking={speaking}
          walking={walking}
          isMe={isMe}
        />
      </motion.div>

      {/* Name tag */}
      <div style={{
        fontSize: 10,
        fontFamily: 'monospace',
        color: isMe ? player.glowColor : 'rgba(255,255,255,0.65)',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        borderRadius: 6,
        padding: '1px 7px',
        border: isMe ? `1px solid ${player.glowColor}55` : '1px solid rgba(255,255,255,0.08)',
        letterSpacing: '0.04em',
        maxWidth: 88,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        marginTop: 2,
        boxShadow: isMe ? `0 0 8px ${player.glowColor}30` : 'none',
      }}>
        {isMe ? '● ' : ''}{player.name}
      </div>
    </div>
  );
}

// ── Room objects (CSS-drawn) ──────────────────────────────────────────

function RoomObjects() {
  return (
    <>
      {/* ── LOUNGE zone ────── */}
      {/* Zone glow */}
      <div className="absolute pointer-events-none" style={{
        left: '14%', top: '68%', transform: 'translate(-50%,-50%)',
        width: 160, height: 90,
        background: 'radial-gradient(ellipse, rgba(120,0,255,0.12) 0%, transparent 70%)',
        borderRadius: '50%',
      }} />
      {/* Sofa */}
      <div className="absolute pointer-events-none" style={{ left: '12%', top: '73%', transform: 'translate(-50%,-50%)' }}>
        <div style={{ position: 'relative', width: 72, height: 42 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 18, background: 'linear-gradient(180deg,rgba(120,0,255,.3),rgba(80,0,180,.15))', borderRadius: '7px 7px 0 0', border: '1px solid rgba(155,0,255,.45)', boxShadow: '0 0 12px rgba(155,0,255,.2)' }} />
          <div style={{ position: 'absolute', top: 16, left: 7, right: 7, height: 20, background: 'rgba(100,0,200,.2)', borderRadius: '0 0 5px 5px', border: '1px solid rgba(155,0,255,.3)', borderTop: 'none' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, width: 9, height: 36, background: 'rgba(120,0,255,.25)', borderRadius: '5px 0 0 5px', border: '1px solid rgba(155,0,255,.3)' }} />
          <div style={{ position: 'absolute', top: 0, right: 0, width: 9, height: 36, background: 'rgba(120,0,255,.25)', borderRadius: '0 5px 5px 0', border: '1px solid rgba(155,0,255,.3)' }} />
        </div>
      </div>
      {/* Coffee table */}
      <div className="absolute pointer-events-none" style={{ left: '22%', top: '76%', transform: 'translate(-50%,-50%)', width: 38, height: 18, background: 'rgba(80,0,160,.18)', borderRadius: 6, border: '1px solid rgba(155,0,255,.3)', boxShadow: '0 0 10px rgba(155,0,255,.15)' }} />
      {/* Sign */}
      <div className="absolute pointer-events-none" style={{ left: '14%', top: '62%', transform: 'translate(-50%,-50%)', fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(155,0,255,.85)', textShadow: '0 0 8px rgba(155,0,255,.8),0 0 18px rgba(155,0,255,.4)' }}>
        LOUNGE
      </div>

      {/* ── GAMING zone ────── */}
      <div className="absolute pointer-events-none" style={{ left: '78%', top: '68%', transform: 'translate(-50%,-50%)', width: 150, height: 90, background: 'radial-gradient(ellipse,rgba(0,200,255,.1) 0%,transparent 70%)', borderRadius: '50%' }} />
      {/* Monitor */}
      <div className="absolute pointer-events-none" style={{ left: '79%', top: '69%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
        <div style={{ width: 52, height: 34, background: 'linear-gradient(135deg,rgba(0,200,255,.14),rgba(0,100,200,.07))', border: '1.5px solid rgba(0,229,255,.65)', borderRadius: 4, boxShadow: '0 0 20px rgba(0,229,255,.3)', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 3 }}>
          {[40,60,50,70].map((w,i) => <div key={i} style={{ height: 2.5, width: `${w}%`, background: 'rgba(0,229,255,.55)', borderRadius: 1 }} />)}
        </div>
        <div style={{ width: 4, height: 9, background: 'rgba(0,229,255,.35)' }} />
        <div style={{ width: 22, height: 4, background: 'rgba(0,229,255,.28)', borderRadius: 2 }} />
      </div>
      {/* Chair */}
      <div className="absolute pointer-events-none" style={{ left: '73%', top: '75%', transform: 'translate(-50%,-50%)', width: 20, height: 22, background: 'rgba(0,200,255,.12)', borderRadius: 4, border: '1px solid rgba(0,229,255,.3)' }} />
      {/* Sign */}
      <div className="absolute pointer-events-none" style={{ left: '78%', top: '60%', transform: 'translate(-50%,-50%)', fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(0,229,255,.85)', textShadow: '0 0 8px rgba(0,229,255,.8),0 0 18px rgba(0,229,255,.4)' }}>
        GAMING
      </div>

      {/* ── DJ BOOTH zone ────── */}
      <div className="absolute pointer-events-none" style={{ left: '50%', top: '18%', transform: 'translate(-50%,-50%)', width: 160, height: 80, background: 'radial-gradient(ellipse,rgba(255,0,150,.1) 0%,transparent 70%)', borderRadius: '50%' }} />
      {/* Deck */}
      <div className="absolute pointer-events-none" style={{ left: '50%', top: '20%', transform: 'translate(-50%,-50%)', width: 74, height: 38, background: 'linear-gradient(180deg,rgba(255,0,150,.14),rgba(200,0,120,.06))', borderRadius: 8, border: '1px solid rgba(255,0,150,.45)', boxShadow: '0 0 22px rgba(255,0,150,.22)', display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 8px' }}>
        <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid rgba(255,0,150,.65)', background: 'rgba(255,0,150,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,0,150,.6)' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[1,2,3].map(i => <div key={i} style={{ width: 12, height: 2, background: 'rgba(255,0,150,.5)', borderRadius: 1 }} />)}
        </div>
        <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid rgba(255,0,150,.65)', background: 'rgba(255,0,150,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,0,150,.6)' }} />
        </div>
      </div>
      {/* Sign */}
      <div className="absolute pointer-events-none" style={{ left: '50%', top: '8%', transform: 'translate(-50%,-50%)', fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,0,150,.85)', textShadow: '0 0 8px rgba(255,0,150,.8),0 0 18px rgba(255,0,150,.4)' }}>
        DJ BOOTH
      </div>

      {/* ── BAR zone ────── */}
      <div className="absolute pointer-events-none" style={{ left: '88%', top: '40%', transform: 'translate(-50%,-50%)', width: 90, height: 130, background: 'radial-gradient(ellipse,rgba(255,140,0,.1) 0%,transparent 70%)', borderRadius: '50%' }} />
      {/* Bar counter */}
      <div className="absolute pointer-events-none" style={{ left: '91%', top: '40%', transform: 'translate(-50%,-50%)' }}>
        <div style={{ width: 14, height: 60, background: 'linear-gradient(90deg,rgba(255,140,0,.28),rgba(200,100,0,.14))', borderRadius: '5px 0 0 5px', border: '1px solid rgba(255,140,0,.5)', boxShadow: '0 0 18px rgba(255,140,0,.18)' }} />
        <div style={{ position: 'absolute', top: 6, left: 16, display: 'flex', gap: 3 }}>
          {['rgba(255,80,0,.7)','rgba(100,200,255,.7)','rgba(180,0,255,.7)'].map((c,i) => (
            <div key={i} style={{ width: 4, height: 14, background: c, borderRadius: '2px 2px 0 0', boxShadow: `0 0 6px ${c}` }} />
          ))}
        </div>
      </div>
      {/* Sign */}
      <div className="absolute pointer-events-none" style={{ left: '86%', top: '30%', transform: 'translate(-50%,-50%)', fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,140,0,.9)', textShadow: '0 0 8px rgba(255,140,0,.9),0 0 18px rgba(255,140,0,.45)' }}>
        BAR
      </div>

      {/* ── Center circle ────── */}
      <div className="absolute pointer-events-none" style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 90, height: 90, borderRadius: '50%', border: '1px solid rgba(255,255,255,.04)', boxShadow: '0 0 30px rgba(255,255,255,.03)', background: 'radial-gradient(ellipse,rgba(255,255,255,.025) 0%,transparent 70%)' }} />

      {/* ── Corner plants ────── */}
      {[[8,18],[92,18]] .map(([px,py],i) => (
        <div key={i} className="absolute pointer-events-none" style={{ left: `${px}%`, top: `${py}%`, transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 10, height: 22, background: 'rgba(0,200,80,.14)', border: '1px solid rgba(0,200,80,.38)', borderRadius: '50% 50% 20% 20%', boxShadow: '0 0 10px rgba(0,200,80,.2)' }} />
          <div style={{ width: 18, height: 7, background: 'rgba(0,200,80,.1)', border: '1px solid rgba(0,200,80,.28)', borderRadius: '50%', marginTop: -3, marginLeft: 0 }} />
          <div style={{ width: 8, height: 12, background: 'rgba(30,30,30,.4)', border: '1px solid rgba(0,200,80,.25)', borderRadius: '0 0 4px 4px', marginTop: 0 }} />
        </div>
      ))}
    </>
  );
}

// ── Ambient particles ─────────────────────────────────────────────────

const PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  x: 4 + ((i * 53 + 11) % 88),
  y: 6 + ((i * 67 + 19) % 84),
  color: ['#9b00ff','#00e5ff','#ff00aa','#00ff88'][i % 4],
  size: 1.5 + (i % 3) * 0.5,
  dur: 3 + (i % 6),
  del: (i * 0.55) % 4,
}));

function Particles() {
  return (
    <>
      {PARTICLES.map((p, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${p.x}%`,
          top: `${p.y}%`,
          width: p.size,
          height: p.size,
          borderRadius: '50%',
          background: p.color,
          opacity: 0.5,
          pointerEvents: 'none',
          animation: `vs-drift ${p.dur}s ease-in-out ${p.del}s infinite`,
          boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
        }} />
      ))}
    </>
  );
}

// ── Avatar customizer screen ──────────────────────────────────────────

interface CustomizerProps {
  playerName: string;
  onJoin: (bodyColor: string, glowColor: string, mask: SpaceMask) => void;
}

function AvatarCustomizer({ playerName, onJoin }: CustomizerProps) {
  const [bodyColor, setBodyColor] = useState(() => localStorage.getItem(LS_BODY) ?? BODY_COLORS[0]);
  const [glowColor, setGlowColor] = useState(() => localStorage.getItem(LS_GLOW) ?? GLOW_COLORS[0]);
  const [mask, setMask]           = useState<SpaceMask>(() => (localStorage.getItem(LS_MASK) as SpaceMask) ?? 'none');

  function handleJoin() {
    localStorage.setItem(LS_BODY, bodyColor);
    localStorage.setItem(LS_GLOW, glowColor);
    localStorage.setItem(LS_MASK, mask);
    onJoin(bodyColor, glowColor, mask);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-5 px-5 py-6"
    >
      {/* Preview */}
      <div className="flex flex-col items-center gap-2">
        <div style={{
          width: 80, height: 80,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `radial-gradient(ellipse at 40% 35%, ${glowColor}18, transparent 70%), rgba(8,3,24,.7)`,
          borderRadius: '50%',
          border: `1.5px solid ${bodyColor}55`,
          boxShadow: `0 0 0 4px ${bodyColor}20, 0 0 30px ${glowColor}30`,
        }}>
          <HumanoidAvatar bodyColor={bodyColor} glowColor={glowColor} mask={mask} size={1.3} isMe />
        </div>
        <p style={{ fontFamily: 'monospace', fontSize: 11, color: bodyColor, textShadow: `0 0 8px ${bodyColor}80`, letterSpacing: '0.1em' }}>
          {playerName}
        </p>
      </div>

      {/* Body color */}
      <div className="w-full">
        <p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-2">სხეულის ფერი</p>
        <div className="flex gap-2 flex-wrap">
          {BODY_COLORS.map(c => (
            <button key={c} onClick={() => setBodyColor(c)} style={{
              width: 30, height: 30, borderRadius: '50%', background: c, flexShrink: 0,
              border: bodyColor === c ? '2.5px solid white' : '2px solid transparent',
              boxShadow: bodyColor === c ? `0 0 12px ${c}, 0 0 0 2px ${c}40` : 'none',
              transition: 'all .15s',
            }} />
          ))}
        </div>
      </div>

      {/* Glow color */}
      <div className="w-full">
        <p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-2">გლოვის ფერი</p>
        <div className="flex gap-2 flex-wrap">
          {GLOW_COLORS.map(c => (
            <button key={c} onClick={() => setGlowColor(c)} style={{
              width: 30, height: 30, borderRadius: '50%', background: c, flexShrink: 0,
              border: glowColor === c ? '2.5px solid white' : '2px solid transparent',
              boxShadow: glowColor === c ? `0 0 12px ${c}, 0 0 0 2px ${c}40` : 'none',
              transition: 'all .15s',
            }} />
          ))}
        </div>
      </div>

      {/* Mask */}
      <div className="w-full">
        <p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-2">ნიღაბი</p>
        <div className="flex gap-2">
          {MASKS.map(m => (
            <button key={m.id} onClick={() => setMask(m.id)}
              className="flex-1 py-1.5 rounded-xl font-mono text-[11px] uppercase tracking-wider transition-all active:scale-95"
              style={{
                background: mask === m.id ? `${bodyColor}22` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${mask === m.id ? bodyColor + '80' : 'rgba(255,255,255,0.08)'}`,
                color: mask === m.id ? bodyColor : 'rgba(255,255,255,0.3)',
                boxShadow: mask === m.id ? `0 0 10px ${bodyColor}30` : 'none',
              }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Enter button */}
      <button
        onClick={handleJoin}
        className="w-full py-3.5 rounded-2xl font-display font-bold text-sm uppercase tracking-widest transition-all active:scale-95"
        style={{
          background: `linear-gradient(135deg, ${bodyColor}30, ${bodyColor}15)`,
          border: `1.5px solid ${bodyColor}`,
          color: bodyColor,
          boxShadow: `0 0 28px ${bodyColor}40, inset 0 0 20px ${bodyColor}08`,
          letterSpacing: '0.14em',
        }}
      >
        Void Lounge-ში შესვლა →
      </button>

      <p className="font-mono text-[10px] text-white/20 text-center leading-relaxed">
        ხმოვანი ჩატი ავტომატურად ჩაირთება.<br />
        მიკროფონის ნებართვა საჭიროა.
      </p>
    </motion.div>
  );
}

// ── Chat drawer ───────────────────────────────────────────────────────

function ChatDrawer({
  history,
  mySocketId,
  open,
}: {
  history: { socketId: string; name: string; bodyColor: string; glowColor: string; message: string; ts: number }[];
  mySocketId: string;
  open: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [open, history.length]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: 220,
            background: 'rgba(4,0,18,0.92)',
            backdropFilter: 'blur(16px)',
            borderLeft: '1px solid rgba(155,0,255,0.15)',
            zIndex: 50,
            display: 'flex', flexDirection: 'column',
          }}
        >
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <p style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              ჩატი · {history.length}
            </p>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.length === 0 && (
              <p style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.15)', textAlign: 'center', paddingTop: 20 }}>
                ჯერ გზავნილები არ არის
              </p>
            )}
            {history.map((msg, i) => {
              const isOwn = msg.socketId === mySocketId;
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 9, color: isOwn ? msg.glowColor : msg.bodyColor, letterSpacing: '0.05em', opacity: 0.8 }}>
                    {isOwn ? 'მე' : msg.name}
                  </span>
                  <div style={{
                    maxWidth: '92%',
                    background: isOwn ? `${msg.glowColor}18` : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${isOwn ? msg.glowColor + '40' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: isOwn ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    padding: '5px 9px',
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.88)',
                    wordBreak: 'break-word',
                    lineHeight: 1.4,
                  }}>
                    {msg.message}
                  </div>
                  <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>
                    {new Date(msg.ts).toLocaleTimeString('ka', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Main component ────────────────────────────────────────────────────

interface Props { onClose: () => void }

export function VirtualSpace({ onClose }: Props) {
  // Inject CSS keyframes once
  useEffect(() => {
    const el = document.getElementById('vs-styles') ?? (() => {
      const s = document.createElement('style');
      s.id = 'vs-styles';
      document.head.appendChild(s);
      return s;
    })();
    el.textContent = SPACE_CSS;
    return () => { el.textContent = ''; };
  }, []);

  const profile    = useAuthStore(s => s.profile);
  const playerName = profile?.username ?? 'Player';

  const { joined, mySocketId, players, chatHistory, join, leave, moveLocal, sendChat } = useVirtualSpace();
  const { joined: voiceJoined, muted, speakingIds, status: voiceStatus, joinVoice, leaveVoice, toggleMute } = useSpaceVoice();

  const [chat, setChat]           = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ripple, setRipple]       = useState<{ x: number; y: number; k: number } | null>(null);
  const worldRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    leaveVoice();
    leave();
    onClose();
  }, [leave, leaveVoice, onClose]);

  async function handleJoin(bodyColor: string, glowColor: string, mask: SpaceMask) {
    const ok = await join(playerName, bodyColor, glowColor, mask);
    if (ok) {
      // Auto-join voice on space enter
      joinVoice();
    }
  }

  function handleWorldTap(clientX: number, clientY: number) {
    if (!joined || !mySocketId) return;
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
  }

  const playerCount = players.size;

  // Speaking: 'local' maps to self, peer socketIds map directly
  function isSpeaking(player: SpacePlayer): boolean {
    if (player.socketId === mySocketId) return speakingIds.has('local');
    return speakingIds.has(player.socketId);
  }

  const voiceLabel = voiceJoined
    ? (muted ? '🔇 muted' : '🎤 live')
    : voiceStatus === 'failed' ? '⚠ no mic'
    : '○ connecting…';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ background: '#020010' }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        background: 'rgba(3,0,14,.96)',
        borderBottom: '1px solid rgba(155,0,255,.18)',
        backdropFilter: 'blur(14px)',
        flexShrink: 0,
        paddingTop: `calc(10px + env(safe-area-inset-top, 0px))`,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#9b00ff', boxShadow: '0 0 10px #9b00ff', animation: 'vs-pulse 2s ease-in-out infinite' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 14, color: 'white', letterSpacing: '0.05em' }}>
            VOID LOUNGE
          </p>
          <p style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,.28)', letterSpacing: '0.08em' }}>
            {playerCount} online · {voiceLabel}
          </p>
        </div>
        {joined && (
          <button
            onClick={toggleMute}
            className="w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-90"
            style={{
              background: muted ? 'rgba(255,45,85,.12)' : 'rgba(0,229,255,.08)',
              border: `1px solid ${muted ? 'rgba(255,45,85,.35)' : 'rgba(0,229,255,.25)'}`,
              fontSize: 14,
            }}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇' : '🎤'}
          </button>
        )}
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-90"
          style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.45)', fontSize: 14 }}
        >
          ✕
        </button>
      </div>

      {/* Content */}
      {!joined ? (
        <div className="flex-1 overflow-y-auto" style={{ background: 'rgba(4,0,18,.98)' }}>
          <AvatarCustomizer playerName={playerName} onJoin={handleJoin} />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* World */}
          <div
            ref={worldRef}
            className="flex-1 relative overflow-hidden select-none cursor-crosshair"
            style={{
              background: `
                radial-gradient(ellipse at 25% 55%, rgba(100,0,255,.13) 0%, transparent 55%),
                radial-gradient(ellipse at 75% 20%, rgba(0,150,255,.08) 0%, transparent 48%),
                radial-gradient(ellipse at 55% 80%, rgba(255,0,130,.07) 0%, transparent 45%),
                radial-gradient(ellipse at 90% 45%, rgba(255,130,0,.06) 0%, transparent 40%),
                #020010
              `,
            }}
            onClick={e => handleWorldTap(e.clientX, e.clientY)}
            onTouchStart={e => {
              e.preventDefault();
              const t = e.touches[0];
              handleWorldTap(t.clientX, t.clientY);
            }}
          >
            {/* Ambient particles */}
            <Particles />

            {/* Floor grid SVG */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.09 }}>
              <defs>
                <pattern id="vs-grid" width="6%" height="8%" patternUnits="objectBoundingBox">
                  <path d="M 0 0 L 0 100% M 0 0 L 100% 0" stroke="#9b00ff" strokeWidth="0.4" fill="none" />
                </pattern>
                <linearGradient id="vs-topfade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#020010" stopOpacity=".95" />
                  <stop offset="35%" stopColor="#020010" stopOpacity="0" />
                </linearGradient>
              </defs>
              <rect width="100%" height="100%" fill="url(#vs-grid)" />
              <rect width="100%" height="100%" fill="url(#vs-topfade)" />
            </svg>

            {/* Vignette */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: 'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(2,0,16,.55) 100%)',
            }} />

            {/* Room objects */}
            <RoomObjects />

            {/* Click ripple */}
            <AnimatePresence>
              {ripple && (
                <motion.div
                  key={ripple.k}
                  initial={{ scale: 0, opacity: 0.85 }}
                  animate={{ scale: 3, opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  onAnimationComplete={() => setRipple(null)}
                  style={{
                    position: 'absolute',
                    left: `${ripple.x}%`, top: `${ripple.y}%`,
                    width: 24, height: 24,
                    marginLeft: -12, marginTop: -12,
                    borderRadius: '50%',
                    border: '1.5px solid rgba(155,0,255,.75)',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </AnimatePresence>

            {/* Avatars */}
            {[...players.values()].map(p => (
              <AvatarOnMap
                key={p.socketId}
                player={p}
                isMe={p.socketId === mySocketId}
                speaking={isSpeaking(p)}
              />
            ))}

            {/* Hint overlay */}
            {playerCount === 1 && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                <p className="font-mono text-[10px] text-white/18 tracking-wider" style={{ animation: 'vs-pulse 2.5s ease-in-out infinite' }}>
                  ↓ დააჭირე ნებისმიერ ადგილს გადასაადგილებლად
                </p>
              </div>
            )}

            {/* Chat drawer */}
            <ChatDrawer history={chatHistory} mySocketId={mySocketId} open={drawerOpen} />
          </div>

          {/* Bottom bar */}
          <form
            onSubmit={handleSendChat}
            style={{
              display: 'flex', gap: 8, padding: '8px 12px',
              paddingBottom: `calc(8px + env(safe-area-inset-bottom, 0px))`,
              background: 'rgba(3,0,14,.97)',
              borderTop: '1px solid rgba(155,0,255,.14)',
              flexShrink: 0,
            }}
          >
            <input
              value={chat}
              onChange={e => setChat(e.target.value)}
              maxLength={140}
              placeholder="გზავნილი…"
              style={{
                flex: 1, background: 'rgba(255,255,255,.04)', fontFamily: 'monospace',
                fontSize: 13, color: 'white', outline: 'none',
                padding: '8px 12px', borderRadius: 12,
                border: '1px solid rgba(255,255,255,.1)',
              }}
              onFocus={e => e.stopPropagation()}
            />
            <button
              type="submit"
              disabled={!chat.trim()}
              style={{
                padding: '8px 14px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13,
                background: 'rgba(155,0,255,.15)', border: '1px solid rgba(155,0,255,.4)', color: '#c084fc',
                transition: 'all .15s', flexShrink: 0,
              }}
            >
              →
            </button>
            {/* Chat toggle */}
            <button
              type="button"
              onClick={() => setDrawerOpen(o => !o)}
              style={{
                padding: '8px 10px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13,
                background: drawerOpen ? 'rgba(155,0,255,.18)' : 'rgba(255,255,255,.04)',
                border: `1px solid ${drawerOpen ? 'rgba(155,0,255,.45)' : 'rgba(255,255,255,.1)'}`,
                color: drawerOpen ? '#c084fc' : 'rgba(255,255,255,.4)',
                transition: 'all .15s', flexShrink: 0, position: 'relative',
              }}
            >
              ☰
              {chatHistory.length > 0 && !drawerOpen && (
                <span style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: '50%', background: '#9b00ff', boxShadow: '0 0 6px #9b00ff' }} />
              )}
            </button>
          </form>
        </div>
      )}
    </motion.div>
  );
}
