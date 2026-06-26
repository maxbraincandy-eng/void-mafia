import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const REACTIONS = ['🔥','❤️','😂','💀','🤝','👑'] as const;
export type ReactionEmoji = typeof REACTIONS[number];

interface Props {
  myReaction: string | null;
  reactions: Record<string, number>;
  onReact: (emoji: string) => void;
  disabled?: boolean;
}

export function ReactionPicker({ myReaction, reactions, onReact, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const total = Object.values(reactions).reduce((a, b) => a + b, 0);
  const topReactions = Object.entries(reactions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([e]) => e);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        disabled={disabled}
        onMouseDown={e => { e.preventDefault(); setOpen(o => !o); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
          borderRadius: 20, border: myReaction ? '1px solid rgba(155,0,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
          background: myReaction ? 'rgba(155,0,255,0.12)' : 'transparent',
          cursor: 'pointer', transition: 'all .15s',
        }}
      >
        <span style={{ fontSize: 14 }}>
          {topReactions.length > 0 ? topReactions.join('') : '🤍'}
        </span>
        {total > 0 && (
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: myReaction ? '#c084fc' : 'rgba(255,255,255,0.4)' }}>
            {total}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 4 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            style={{
              position: 'absolute', bottom: '110%', left: 0, zIndex: 100,
              display: 'flex', gap: 6, padding: '8px 10px',
              background: 'rgba(14,8,30,0.97)', backdropFilter: 'blur(20px)',
              border: '1px solid rgba(155,0,255,0.25)', borderRadius: 28,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            {REACTIONS.map(emoji => (
              <button
                key={emoji}
                onClick={() => { onReact(emoji); setOpen(false); }}
                style={{
                  fontSize: 22, background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '2px 4px', borderRadius: 8, transition: 'transform .1s',
                  filter: myReaction === emoji ? 'drop-shadow(0 0 6px rgba(155,0,255,0.8))' : 'none',
                  transform: myReaction === emoji ? 'scale(1.25)' : 'scale(1)',
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.3)')}
                onMouseLeave={e => (e.currentTarget.style.transform = myReaction === emoji ? 'scale(1.25)' : 'scale(1)')}
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
