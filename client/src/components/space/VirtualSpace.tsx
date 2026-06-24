import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualSpace, SpacePlayer } from '@/hooks/useVirtualSpace';
import { useAuthStore } from '@/store/authStore';

// ── Constants ─────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#9b00ff', '#00e5ff', '#ff00aa', '#00ff88',
  '#ff6600', '#3b82f6', '#ffcc00', '#ff2255',
];

const AVATAR_EMOJIS = [
  '😎', '🐱', '👾', '🤖', '👽', '🦊', '🐸', '🎭',
  '🦋', '🌙', '⭐', '🎮', '🎵', '🔥', '💎', '🌊',
  '🐼', '🦁', '🐺', '🦄', '🎪', '🧠', '👻', '🥷',
];

// Decorative props at fixed % positions [x, y, emoji, label]
const PROPS: [number, number, string, string][] = [
  [12, 18, '🌿', ''],
  [88, 15, '🌿', ''],
  [20, 72, '🛋️', 'ლაუნჯი'],
  [78, 68, '🎮', 'გეიმინგი'],
  [50, 12, '🎵', 'სტუდია'],
  [82, 82, '🍹', 'ბარი'],
  [30, 42, '🪑', ''],
  [38, 42, '🪑', ''],
  [62, 42, '🪑', ''],
  [70, 42, '🪑', ''],
  [50, 85, '🎲', 'ხალხის ადგილი'],
  [14, 50, '🌿', ''],
  [86, 50, '🌿', ''],
];

// ── Sub-components ────────────────────────────────────────────────────

function AvatarSprite({ player, isMe }: { player: SpacePlayer; isMe: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${player.x}%`,
        top: `${player.y}%`,
        transform: 'translate(-50%, -100%)',
        transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1), top 0.25s cubic-bezier(0.4,0,0.2,1)',
        zIndex: isMe ? 30 : 20,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      {/* Chat bubble */}
      <AnimatePresence>
        {player.message && (
          <motion.div
            key={player.message}
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              background: 'rgba(10,5,28,0.92)',
              border: `1px solid ${player.color}55`,
              borderRadius: 12,
              padding: '5px 10px',
              maxWidth: 160,
              textAlign: 'center',
              fontSize: 12,
              color: 'rgba(255,255,255,0.92)',
              boxShadow: `0 0 16px ${player.color}30`,
              marginBottom: 4,
              wordBreak: 'break-word',
              lineHeight: 1.35,
            }}
          >
            {player.message}
            {/* Triangle pointer */}
            <div style={{
              position: 'absolute',
              bottom: -6,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: `6px solid ${player.color}55`,
            }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar circle */}
      <div
        style={{
          width: isMe ? 52 : 46,
          height: isMe ? 52 : 46,
          borderRadius: '50%',
          background: `radial-gradient(circle at 38% 35%, ${player.color}cc, ${player.color}55)`,
          border: `2.5px solid ${player.color}`,
          boxShadow: isMe
            ? `0 0 0 3px ${player.color}40, 0 0 24px ${player.color}60`
            : `0 0 16px ${player.color}50`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: isMe ? '1.55rem' : '1.35rem',
          userSelect: 'none',
        }}
      >
        {player.emoji}
      </div>

      {/* Name tag */}
      <div
        style={{
          fontSize: 10,
          fontFamily: 'monospace',
          color: isMe ? player.color : 'rgba(255,255,255,0.7)',
          background: 'rgba(0,0,0,0.55)',
          borderRadius: 6,
          padding: '1px 6px',
          border: isMe ? `1px solid ${player.color}50` : 'none',
          letterSpacing: '0.04em',
          maxWidth: 80,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginTop: 2,
        }}
      >
        {isMe ? '◉ ' : ''}{player.name}
      </div>
    </div>
  );
}

// ── Customizer modal ───────────────────────────────────────────────────

function AvatarCustomizer({ onJoin }: { onJoin: (emoji: string, color: string) => void }) {
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [emoji, setEmoji] = useState('😎');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-full px-6 py-8 gap-6"
    >
      {/* Preview */}
      <div className="flex flex-col items-center gap-2">
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: `radial-gradient(circle at 38% 35%, ${color}cc, ${color}55)`,
            border: `3px solid ${color}`,
            boxShadow: `0 0 0 4px ${color}30, 0 0 32px ${color}60`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.2rem',
          }}
        >
          {emoji}
        </div>
        <p className="font-mono text-xs text-white/30 tracking-wider">PREVIEW</p>
      </div>

      {/* Color picker */}
      <div className="w-full">
        <p className="font-mono text-[11px] text-white/30 uppercase tracking-widest mb-2">ფერი</p>
        <div className="flex gap-2 flex-wrap">
          {AVATAR_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: c,
                border: color === c ? '3px solid white' : '2px solid transparent',
                boxShadow: color === c ? `0 0 12px ${c}` : 'none',
                transition: 'all 0.15s',
              }}
            />
          ))}
        </div>
      </div>

      {/* Emoji picker */}
      <div className="w-full">
        <p className="font-mono text-[11px] text-white/30 uppercase tracking-widest mb-2">ავატარი</p>
        <div className="grid grid-cols-8 gap-1.5">
          {AVATAR_EMOJIS.map(e => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className="text-xl rounded-lg transition-all active:scale-90"
              style={{
                padding: '6px 0',
                background: emoji === e ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                border: emoji === e ? `1px solid ${color}80` : '1px solid rgba(255,255,255,0.06)',
                boxShadow: emoji === e ? `0 0 8px ${color}60` : 'none',
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Join button */}
      <button
        onClick={() => onJoin(emoji, color)}
        className="w-full py-3 rounded-2xl font-display font-bold text-sm uppercase tracking-widest transition-all active:scale-95"
        style={{
          background: `linear-gradient(135deg, ${color}33, ${color}18)`,
          border: `1.5px solid ${color}`,
          color,
          boxShadow: `0 0 24px ${color}40`,
          letterSpacing: '0.12em',
        }}
      >
        სივრცეში შესვლა →
      </button>
    </motion.div>
  );
}

// ── Main overlay ──────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export function VirtualSpace({ onClose }: Props) {
  const profile = useAuthStore(s => s.profile);
  const playerName = profile?.username ?? 'Player';

  const { joined, mySocketId, players, join, leave, moveLocal, sendChat } = useVirtualSpace();

  const [chat, setChat] = useState('');
  const [clickRipple, setClickRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Join with avatar settings
  async function handleJoin(emoji: string, color: string) {
    await join(playerName, emoji, color);
  }

  // Handle world click → move
  function handleWorldClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!joined || !mySocketId) return;
    const rect = worldRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    // Stay in bounds
    const cx = Math.max(5, Math.min(95, x));
    const cy = Math.max(5, Math.min(92, y));
    moveLocal(mySocketId, cx, cy);
    setClickRipple({ x: cx, y: cy, key: Date.now() });
  }

  // Handle touch → move
  function handleWorldTouch(e: React.TouchEvent<HTMLDivElement>) {
    if (!joined || !mySocketId) return;
    const touch = e.touches[0];
    const rect = worldRef.current!.getBoundingClientRect();
    const x = ((touch.clientX - rect.left) / rect.width) * 100;
    const y = ((touch.clientY - rect.top) / rect.height) * 100;
    const cx = Math.max(5, Math.min(95, x));
    const cy = Math.max(5, Math.min(92, y));
    moveLocal(mySocketId, cx, cy);
    setClickRipple({ x: cx, y: cy, key: Date.now() });
  }

  function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    const msg = chat.trim();
    if (!msg) return;
    sendChat(msg);
    setChat('');
  }

  const handleClose = useCallback(() => {
    leave();
    onClose();
  }, [leave, onClose]);

  const playerCount = players.size;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ background: '#04001a' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{
          background: 'rgba(5,0,20,0.95)',
          borderBottom: '1px solid rgba(155,0,255,0.2)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <span className="text-lg">🌐</span>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-white text-sm">Void Space</p>
          <p className="font-mono text-[11px] text-white/30">
            {playerCount} {playerCount === 1 ? 'მოთამაშე' : 'მოთამაშე'} სივრცეში
          </p>
        </div>
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-90"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
        >
          ✕
        </button>
      </div>

      {/* Content */}
      {!joined ? (
        <div className="flex-1 overflow-y-auto" style={{ background: 'rgba(5,0,20,0.98)' }}>
          <AvatarCustomizer onJoin={handleJoin} />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* World */}
          <div
            ref={worldRef}
            className="flex-1 relative overflow-hidden select-none cursor-crosshair"
            style={{ background: 'radial-gradient(ellipse at 50% 50%, #0d0033 0%, #04001a 100%)' }}
            onClick={handleWorldClick}
            onTouchStart={handleWorldTouch}
          >
            {/* Neon grid floor */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ opacity: 0.12 }}
            >
              <defs>
                <pattern id="grid" width="8%" height="10%" patternUnits="objectBoundingBox">
                  <path d="M 0 0 L 0 100% M 0 0 L 100% 0" stroke="#9b00ff" strokeWidth="0.5" fill="none" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
              {/* Perspective fade at top */}
              <defs>
                <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#04001a" stopOpacity="0.9" />
                  <stop offset="40%" stopColor="#04001a" stopOpacity="0" />
                </linearGradient>
              </defs>
              <rect width="100%" height="100%" fill="url(#fade)" />
            </svg>

            {/* Zone glows */}
            <div className="absolute pointer-events-none" style={{ left: '14%', top: '62%', width: '18%', height: '18%', background: 'radial-gradient(ellipse, rgba(155,0,255,0.07), transparent 70%)', borderRadius: '50%' }} />
            <div className="absolute pointer-events-none" style={{ left: '68%', top: '58%', width: '18%', height: '18%', background: 'radial-gradient(ellipse, rgba(0,229,255,0.07), transparent 70%)', borderRadius: '50%' }} />
            <div className="absolute pointer-events-none" style={{ left: '40%', top: '3%', width: '20%', height: '20%', background: 'radial-gradient(ellipse, rgba(255,0,170,0.06), transparent 70%)', borderRadius: '50%' }} />

            {/* Decorative props */}
            {PROPS.map(([px, py, em, label], i) => (
              <div
                key={i}
                className="absolute pointer-events-none flex flex-col items-center"
                style={{ left: `${px}%`, top: `${py}%`, transform: 'translate(-50%, -50%)' }}
              >
                <span style={{ fontSize: '1.5rem', filter: 'drop-shadow(0 0 8px rgba(155,0,255,0.4))' }}>{em}</span>
                {label && (
                  <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)', marginTop: 2, whiteSpace: 'nowrap' }}>{label}</span>
                )}
              </div>
            ))}

            {/* Click ripple */}
            <AnimatePresence>
              {clickRipple && (
                <motion.div
                  key={clickRipple.key}
                  initial={{ scale: 0, opacity: 0.8 }}
                  animate={{ scale: 2.5, opacity: 0 }}
                  transition={{ duration: 0.45 }}
                  style={{
                    position: 'absolute',
                    left: `${clickRipple.x}%`,
                    top: `${clickRipple.y}%`,
                    width: 28,
                    height: 28,
                    marginLeft: -14,
                    marginTop: -14,
                    borderRadius: '50%',
                    border: '2px solid rgba(155,0,255,0.7)',
                    pointerEvents: 'none',
                  }}
                  onAnimationComplete={() => setClickRipple(null)}
                />
              )}
            </AnimatePresence>

            {/* Avatars */}
            {[...players.values()].map(p => (
              <AvatarSprite key={p.socketId} player={p} isMe={p.socketId === mySocketId} />
            ))}

            {/* Hint */}
            {players.size === 1 && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
                <p className="font-mono text-[11px] text-white/20 animate-pulse">
                  დააჭირე ნებისმიერ ადგილას გადასაადგილებლად
                </p>
              </div>
            )}
          </div>

          {/* Chat input */}
          <form
            onSubmit={handleSendChat}
            className="flex-shrink-0 flex items-center gap-2 px-3 py-2"
            style={{
              background: 'rgba(5,0,20,0.97)',
              borderTop: '1px solid rgba(155,0,255,0.15)',
            }}
          >
            <input
              ref={chatInputRef}
              value={chat}
              onChange={e => setChat(e.target.value)}
              maxLength={120}
              placeholder="დაწერე რამე…"
              className="flex-1 bg-transparent font-mono text-sm text-white placeholder-white/20 outline-none"
              style={{ fontSize: 14 }}
              onFocus={e => e.stopPropagation()}
            />
            <button
              type="submit"
              disabled={!chat.trim()}
              className="px-3 py-1.5 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-30"
              style={{ background: 'rgba(155,0,255,0.15)', border: '1px solid rgba(155,0,255,0.4)', color: '#c084fc' }}
            >
              →
            </button>
          </form>
        </div>
      )}
    </motion.div>
  );
}
