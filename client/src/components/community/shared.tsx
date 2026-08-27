/**
 * Shared visual primitives for the Community Hub.
 * Purple/cyan neon theme — visually distinct from Mafia game-room red/danger styling.
 */
import { ReactNode, useEffect } from 'react';
import { useLiveStore } from '@/store/liveStore';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';

export type Accent = 'purple' | 'cyan';

export const ACCENT_COLORS: Record<Accent, { solid: string; bg: string; border: string; text: string; shadow: string }> = {
  purple: {
    solid: '#9b00ff',
    bg: 'rgba(155,0,255,0.12)',
    border: 'rgba(155,0,255,0.4)',
    text: 'rgba(180,80,255,0.95)',
    shadow: '0 0 40px rgba(155,0,255,0.15)',
  },
  cyan: {
    solid: '#00f5ff',
    bg: 'rgba(0,245,255,0.10)',
    border: 'rgba(0,245,255,0.35)',
    text: '#00f5ff',
    shadow: '0 0 40px rgba(0,245,255,0.12)',
  },
};

export function Spinner({ color = '#9b00ff' }: { color?: string }) {
  return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 rounded-full animate-spin" style={{ border: `2px solid ${color}33`, borderTopColor: color }} />
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="text-center py-12 text-white/20 font-mono text-sm px-6">{text}</div>;
}

export function SectionHeader({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-mono text-[12px] uppercase tracking-[0.25em] text-white/30">{label}</h2>
      {action}
    </div>
  );
}

export function PillButton({
  children, onClick, accent = 'purple', disabled, type = 'button', className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  accent?: Accent;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const c = ACCENT_COLORS[accent];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40 ${className}`}
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      {children}
    </button>
  );
}

export function ModalShell({
  onClose, accent = 'purple', children, maxWidthClass = 'max-w-sm',
}: {
  onClose: () => void;
  accent?: Accent;
  children: ReactNode;
  maxWidthClass?: string;
}) {
  const c = ACCENT_COLORS[accent];
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className={`w-full ${maxWidthClass} rounded-3xl border bg-black/95 backdrop-blur-2xl p-6 max-h-[85vh] overflow-y-auto`}
        style={{ borderColor: c.border, boxShadow: c.shadow }}
      >
        {children}
      </motion.div>
    </motion.div>,
    document.body
  );
}

/**
 * A person, wherever they appear.
 *
 * WHY THE STATUS LIVES HERE
 * ─────────────────────────
 * Twenty-one screens render this. A live ring added to each of them is
 * twenty-one places to add it, twenty-one to get the z-order wrong in, and
 * twenty-one to forget when the next status arrives. Passing `userId` instead
 * means one change reaches every surface — the feed, the friend list, a lobby,
 * chat, search — which is what "everywhere their avatar renders" has to mean to
 * be worth anything.
 *
 * IT ASKS FOR ITSELF
 * ──────────────────
 * A caller should be able to keep passing what it already passes. So the avatar
 * asks the live store, and the store turns one screenful of asks into a single
 * request — see `liveStore`. Without `userId` it behaves exactly as it did.
 *
 * BADGES THAT DO NOT FIGHT
 * ────────────────────────
 * Three things can want the same corner: the live ring, the story ring, and
 * whatever the caller stacks on top. They are given separate ground:
 *
 *   ring    — outside the frame, so a story ring and a live ring can nest
 *   pill    — bottom centre, overlapping the lower edge
 *   corner  — top right, left free for the caller's own badge
 *
 * The live ring is red and animated where the online state is a static green
 * dot: live has to be the thing your eye goes to, and two similar rings would
 * be two things to squint at.
 */
export function Avatar({
  avatar, avatarUrl, size = 36, userId, story, onLiveClick,
}: {
  avatar: string;
  avatarUrl: string | null;
  size?: number;
  /** Give this and the avatar shows the person's live status by itself. */
  userId?: string;
  /** An unwatched story ring, drawn outside the live ring. */
  story?: boolean;
  /** Overrides the default, which is to ask the store to open the stream. */
  onLiveClick?: (sessionId: string) => void;
}) {
  const live = useLiveStore(s => (userId ? s.live[userId] : null));
  const ensure = useLiveStore(s => s.ensure);
  const requestWatch = useLiveStore(s => s.requestWatch);
  useEffect(() => { if (userId) ensure([userId]); }, [userId, ensure]);

  const isLive = Boolean(live);
  // The ring sits outside the frame, so the picture never shrinks when
  // somebody goes live — a face that changes size as a ring appears is the
  // layout jumping under the reader.
  const ringPad = isLive || story ? Math.max(2, Math.round(size * 0.07)) : 0;
  const outer = size + ringPad * 2;

  const face = (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden font-display font-bold text-white"
      style={{
        width: size, height: size, fontSize: size * 0.45,
        background: 'linear-gradient(135deg, #9b00ff, #00f5ff)',
      }}
    >
      {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : avatar}
    </div>
  );

  if (!isLive && !story) return face;

  return (
    <span
      style={{
        position: 'relative', display: 'inline-flex', flexShrink: 0,
        width: outer, height: outer, alignItems: 'center', justifyContent: 'center',
        borderRadius: '50%',
        padding: ringPad,
        // Live outranks a story: one is happening now and the other is not.
        background: isLive
          ? 'conic-gradient(from 210deg, #ff2d55, #ff6b6b, #ff2d55)'
          : 'conic-gradient(from 210deg, #9b00ff, #00f5ff, #9b00ff)',
        animation: isLive ? 'liveRingPulse 1.8s ease-in-out infinite' : undefined,
        cursor: isLive ? 'pointer' : undefined,
      }}
      // Straight into the stream, not the profile — the spec is explicit, and
      // it is also what a red ring promises.
      onClick={isLive && live
        ? e => { e.stopPropagation(); (onLiveClick ?? requestWatch)(live.sessionId); }
        : undefined}
      title={isLive ? (live!.title || 'პირდაპირი ეთერი') : undefined}
    >
      {/* A gap between the ring and the face, so the ring reads as a ring
          rather than as a thick coloured border on the picture. */}
      <span style={{ borderRadius: '50%', padding: 1.5, background: '#0d0a1a', display: 'inline-flex' }}>
        {face}
      </span>

      {/* The pill overlaps the lower edge, which is where a viewer's eye
          already is after reading the face — and leaves the top corners for
          whatever the caller stacks there. */}
      {isLive && size >= 30 && (
        <span style={{
          position: 'absolute', bottom: -Math.round(size * 0.06), left: '50%', transform: 'translateX(-50%)',
          background: '#ff2d55', color: '#fff',
          fontFamily: 'monospace', fontWeight: 700, letterSpacing: 0.4,
          fontSize: Math.max(7, Math.round(size * 0.2)),
          lineHeight: 1, padding: `${Math.max(1.5, size * 0.035)}px ${Math.max(3, size * 0.1)}px`,
          borderRadius: 999, border: '1px solid rgba(0,0,0,0.45)',
          whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>LIVE</span>
      )}
    </span>
  );
}

/**
 * The one animation the live ring needs.
 *
 * Mounted by whatever renders avatars rather than added to globals.css: this is
 * the only thing that uses it, and a rule in the global sheet for one component
 * is a rule nobody can find later.
 */
export function AvatarStatusStyles() {
  return (
    <style>{`
      @keyframes liveRingPulse {
        0%, 100% { filter: brightness(1);    box-shadow: 0 0 0 0 rgba(255,45,85,0.5); }
        50%      { filter: brightness(1.18); box-shadow: 0 0 0 4px rgba(255,45,85,0); }
      }
    `}</style>
  );
}

export function TextInput({
  value, onChange, placeholder, maxLength, accent = 'purple',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  accent?: Accent;
}) {
  const c = ACCENT_COLORS[accent];
  return (
    <input
      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 font-mono text-sm text-white outline-none transition-colors"
      style={{ ['--tw-ring-color' as any]: c.solid }}
      placeholder={placeholder}
      maxLength={maxLength}
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={e => { e.currentTarget.style.borderColor = c.border; }}
      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
    />
  );
}

export function TextArea({
  value, onChange, placeholder, maxLength, rows = 3, accent = 'purple',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  accent?: Accent;
}) {
  const c = ACCENT_COLORS[accent];
  return (
    <textarea
      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 font-mono text-sm text-white outline-none resize-none transition-colors"
      placeholder={placeholder}
      maxLength={maxLength}
      rows={rows}
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={e => { e.currentTarget.style.borderColor = c.border; }}
      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
    />
  );
}

export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`;
  if (diff < 2592000_000) return `${Math.floor(diff / 86400_000)}d`;
  return new Date(ms).toLocaleDateString();
}

const BADGE_STYLE: Record<string, { emoji: string; color: string }> = {
  verified: { emoji: '✓', color: '#00b4ff' },
  owner: { emoji: '👑', color: '#ffd700' },
  moderator: { emoji: '🛡', color: '#9b00ff' },
  creator: { emoji: '✨', color: '#ff6ec7' },
  speaker: { emoji: '🎙', color: '#00f5ff' },
  philosopher: { emoji: '🧠', color: '#c084fc' },
  veteran: { emoji: '⚔', color: '#ff8c00' },
  top_detective: { emoji: '🔍', color: '#00ff88' },
  mafia_master: { emoji: '🎭', color: '#ff4444' },
};

export function BadgeIcon({ badge, size = 14 }: { badge: string; size?: number }) {
  const style = BADGE_STYLE[badge];
  if (!style) return null;
  return (
    <span
      title={badge.replace(/_/g, ' ')}
      className="inline-flex items-center justify-center rounded-full font-bold"
      style={{ color: style.color, fontSize: size, width: size + 4, height: size + 4 }}
    >
      {style.emoji}
    </span>
  );
}

export function BadgeRow({ badges, max = 4 }: { badges: string[]; max?: number }) {
  if (!badges.length) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      {badges.slice(0, max).map(b => <BadgeIcon key={b} badge={b} />)}
    </span>
  );
}

export function MrMaxGlow({ children }: { children: ReactNode }) {
  return (
    <span style={{ filter: 'drop-shadow(0 0 6px #ffd700) drop-shadow(0 0 12px rgba(155,0,255,0.6))' }}>
      {children}
    </span>
  );
}
