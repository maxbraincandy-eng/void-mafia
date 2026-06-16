/**
 * Shared visual primitives for the Community Hub.
 * Purple/cyan neon theme — visually distinct from Mafia game-room red/danger styling.
 */
import { ReactNode } from 'react';
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
      <h2 className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/30">{label}</h2>
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
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
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
    </motion.div>
  );
}

export function Avatar({
  avatar, avatarUrl, size = 36,
}: {
  avatar: string;
  avatarUrl: string | null;
  size?: number;
}) {
  return (
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
