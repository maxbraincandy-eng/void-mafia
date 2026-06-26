import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket } from '@/lib/socket';

const REACTIONS = ['🔥','❤️','😂','💀','🤝','👑'] as const;
export type ReactionEmoji = typeof REACTIONS[number];

interface Props {
  postId: string;
  myReaction: string | null;
  reactions: Record<string, number>;
  onReact: (emoji: string) => void;
  disabled?: boolean;
}

interface ReactorRow { emoji: string; username: string; avatar_url: string | null; player_id: string }

export function ReactionPicker({ postId, myReaction, reactions, onReact, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [showWho, setShowWho] = useState(false);
  const [reactors, setReactors] = useState<ReactorRow[] | null>(null);
  const [loadingWho, setLoadingWho] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);

  const total = Object.values(reactions).reduce((a, b) => a + b, 0);
  const topReactions = Object.entries(reactions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([e]) => e);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const fetchReactors = useCallback(() => {
    setLoadingWho(true);
    setReactors(null);
    (socket as any).emit('community:get_reaction_users', { postId }, (res: any) => {
      setLoadingWho(false);
      if (res.ok) setReactors(res.data);
    });
  }, [postId]);

  const onPressStart = () => {
    longFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longFired.current = true;
      setOpen(false);
      if (total > 0) {
        setShowWho(true);
        fetchReactors();
      }
    }, 500);
  };

  const onPressCancel = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const onPressEnd = () => {
    onPressCancel();
    // short tap — toggle picker (only if long press didn't fire)
    if (!longFired.current) {
      setOpen(o => !o);
    }
  };

  // Group reactors by emoji
  const grouped: Record<string, ReactorRow[]> = {};
  if (reactors) {
    for (const r of reactors) {
      if (!grouped[r.emoji]) grouped[r.emoji] = [];
      grouped[r.emoji].push(r);
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        disabled={disabled}
        onMouseDown={onPressStart}
        onMouseUp={onPressEnd}
        onMouseLeave={onPressCancel}
        onTouchStart={(e) => { e.preventDefault(); onPressStart(); }}
        onTouchEnd={(e) => { e.preventDefault(); onPressEnd(); }}
        onTouchCancel={onPressCancel}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
          borderRadius: 20,
          border: myReaction ? '1px solid rgba(155,0,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
          background: myReaction ? 'rgba(155,0,255,0.12)' : 'transparent',
          cursor: 'pointer', transition: 'all .15s', WebkitUserSelect: 'none', userSelect: 'none',
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

      {/* Emoji picker — short tap */}
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
              whiteSpace: 'nowrap',
            }}
          >
            {REACTIONS.map(emoji => (
              <button
                key={emoji}
                onMouseDown={(e) => { e.stopPropagation(); onReact(emoji); setOpen(false); }}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onReact(emoji); setOpen(false); }}
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

      {/* Who reacted — centered modal */}
      <AnimatePresence>
        {showWho && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{
                position: 'fixed', inset: 0, zIndex: 300,
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
              }}
              onClick={() => setShowWho(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: 12 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              style={{
                position: 'fixed',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 301,
                width: 'min(340px, calc(100vw - 32px))',
                maxHeight: '60vh',
                overflowY: 'auto',
                background: 'rgba(8,4,22,0.97)',
                backdropFilter: 'blur(28px) saturate(1.4)',
                border: '1px solid rgba(155,0,255,0.2)',
                borderRadius: 20,
                padding: '20px 20px 24px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  რეაქციები
                </p>
                <button
                  onClick={() => setShowWho(false)}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>

              {loadingWho && (
                <div style={{ textAlign: 'center', padding: '28px 0' }}>
                  <div style={{
                    width: 22, height: 22,
                    border: '2px solid rgba(155,0,255,0.3)',
                    borderTopColor: '#9b00ff',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                    margin: '0 auto',
                  }} />
                </div>
              )}

              {reactors && reactors.length === 0 && (
                <p style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>ჯერ არ არის</p>
              )}

              {reactors && Object.entries(grouped).map(([emoji, rows]) => (
                <div key={emoji} style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 13, marginBottom: 8, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                    {emoji} <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{rows.length}</span>
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {rows.map(r => (
                      <div key={r.player_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                          backgroundImage: r.avatar_url ? `url(${r.avatar_url})` : undefined,
                          backgroundSize: 'cover', backgroundPosition: 'center',
                          background: r.avatar_url ? undefined : 'rgba(155,0,255,0.15)',
                          border: '1px solid rgba(155,0,255,0.2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace',
                        }}>
                          {!r.avatar_url && r.username[0]?.toUpperCase()}
                        </div>
                        <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{r.username}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
