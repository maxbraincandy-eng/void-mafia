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
  const didLongPress = useRef(false);

  const total = Object.values(reactions).reduce((a, b) => a + b, 0);
  const topReactions = Object.entries(reactions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([e]) => e);

  // Close picker on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
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

  const startLongPress = () => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      if (total > 0) {
        setOpen(false);
        setShowWho(true);
        fetchReactors();
      }
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handlePrimaryPress = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!didLongPress.current) setOpen(o => !o);
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
        onMouseDown={startLongPress}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
        onTouchStart={startLongPress}
        onTouchEnd={(e) => { cancelLongPress(); handlePrimaryPress(e); }}
        onMouseDownCapture={(e) => { if (e.button === 0) { e.preventDefault(); } }}
        onClick={(e) => { if (!didLongPress.current) { e.preventDefault(); setOpen(o => !o); } }}
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

      {/* Emoji picker */}
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

      {/* Who reacted sheet */}
      <AnimatePresence>
        {showWho && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
              onClick={() => setShowWho(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
                background: 'rgba(8,4,20,0.98)', backdropFilter: 'blur(28px)',
                border: '1px solid rgba(155,0,255,0.15)', borderTopLeftRadius: 24, borderTopRightRadius: 24,
                padding: '20px 20px 40px',
                maxHeight: '60vh', overflowY: 'auto',
              }}
            >
              <div style={{ width: 36, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '0 auto 16px' }} />
              <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                რეაქციები
              </p>

              {loadingWho && (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <div style={{ width: 20, height: 20, border: '2px solid rgba(155,0,255,0.4)', borderTopColor: '#9b00ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto' }} />
                </div>
              )}

              {reactors && reactors.length === 0 && (
                <p style={{ color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', fontSize: 12 }}>ჯერ არ არის</p>
              )}

              {reactors && Object.entries(grouped).map(([emoji, rows]) => (
                <div key={emoji} style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 16, marginBottom: 8 }}>{emoji} <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{rows.length}</span></p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {rows.map(r => (
                      <div key={r.player_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          background: r.avatar_url ? `url(${r.avatar_url}) center/cover` : 'rgba(155,0,255,0.15)',
                          border: '1px solid rgba(155,0,255,0.2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 14,
                        }}>
                          {!r.avatar_url && r.username[0]?.toUpperCase()}
                        </div>
                        <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{r.username}</span>
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
