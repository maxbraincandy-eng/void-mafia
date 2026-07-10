import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/store/langStore';
import { motion, AnimatePresence } from 'framer-motion';
import { socket } from '@/lib/socket';

const REACTIONS = ['🔥','❤️','😂','💀','🤝','👑'] as const;
export type ReactionEmoji = typeof REACTIONS[number];

interface Props {
  postId?: string;
  commentId?: string;
  myReaction: string | null;
  reactions: Record<string, number>;
  onReact: (emoji: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

interface ReactorRow { emoji: string; username: string; avatar_url: string | null; player_id: string }

export function ReactionPicker({ postId, commentId, myReaction, reactions, onReact, disabled, compact }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [showWho, setShowWho] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0, above: true });
  const [reactors, setReactors] = useState<ReactorRow[] | null>(null);
  const [loadingWho, setLoadingWho] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);

  const total = Object.values(reactions).reduce((a, b) => a + b, 0);
  const topReactions = Object.entries(reactions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([e]) => e);

  const fetchReactors = useCallback(() => {
    setLoadingWho(true);
    setReactors(null);
    const event = commentId ? 'community:get_comment_reaction_users' : 'community:get_reaction_users';
    const payload = commentId ? { commentId } : { postId };
    (socket as any).emit(event, payload, (res: any) => {
      setLoadingWho(false);
      if (res.ok) setReactors(res.data);
    });
  }, [postId, commentId]);

  const onPressStart = () => {
    longFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longFired.current = true;
      setOpen(false);
      // Calculate position from button
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        const above = rect.top > window.innerHeight / 2;
        setPopoverPos({
          x: Math.min(rect.left, window.innerWidth - 280),
          y: above ? rect.top - 8 : rect.bottom + 8,
          above,
        });
      }
      setShowWho(true);
      fetchReactors();
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
    if (!longFired.current) setOpen(o => !o);
  };

  // Group by emoji
  const grouped: Record<string, ReactorRow[]> = {};
  if (reactors) {
    for (const r of reactors) {
      if (!grouped[r.emoji]) grouped[r.emoji] = [];
      grouped[r.emoji].push(r);
    }
  }

  return (
    <>
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
        <button
          ref={btnRef}
          disabled={disabled}
          onMouseDown={onPressStart}
          onMouseUp={onPressEnd}
          onMouseLeave={onPressCancel}
          onTouchStart={(e) => { e.preventDefault(); onPressStart(); }}
          onTouchEnd={(e) => { e.preventDefault(); onPressEnd(); }}
          onTouchCancel={onPressCancel}
          style={{
            display: 'flex', alignItems: 'center', gap: compact ? 2 : 4, padding: compact ? '2px 4px' : '4px 8px',
            borderRadius: 20,
            border: compact ? 'none' : myReaction ? '1px solid rgba(155,0,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
            background: compact ? 'transparent' : myReaction ? 'rgba(155,0,255,0.12)' : 'transparent',
            cursor: 'pointer', transition: 'all .15s',
            WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none',
          }}
        >
          <span style={{ fontSize: compact ? 12 : 14 }}>
            {topReactions.length > 0 ? topReactions.join('') : '🤍'}
          </span>
          {total > 0 && (
            <span style={{ fontSize: compact ? 10 : 11, fontFamily: 'monospace', color: myReaction ? '#c084fc' : 'rgba(255,255,255,0.4)' }}>
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
              onMouseDown={(e) => e.stopPropagation()}
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
                    fontSize: compact ? 18 : 22, background: 'transparent', border: 'none', cursor: 'pointer',
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

      {/* Who reacted — anchored popover via portal */}
      {createPortal(
        <AnimatePresence>
          {showWho && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ position: 'fixed', inset: 0, zIndex: 400 }}
                onClick={() => setShowWho(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.88, y: popoverPos.above ? 8 : -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.88 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                style={{
                  position: 'fixed',
                  left: popoverPos.x,
                  ...(popoverPos.above
                    ? { bottom: window.innerHeight - popoverPos.y }
                    : { top: popoverPos.y }),
                  zIndex: 401,
                  width: 'min(260px, calc(100vw - 32px))',
                  maxHeight: 280,
                  overflowY: 'auto',
                  background: 'rgba(8,4,22,0.97)',
                  backdropFilter: 'blur(24px) saturate(1.4)',
                  border: '1px solid rgba(155,0,255,0.2)',
                  borderRadius: 16,
                  padding: '14px 16px 16px',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <p style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {t.commB.reactions}
                  </p>
                  <button onClick={() => setShowWho(false)}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>
                    ✕
                  </button>
                </div>

                {loadingWho && (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{
                      width: 18, height: 18,
                      border: '2px solid rgba(155,0,255,0.3)',
                      borderTopColor: '#9b00ff',
                      borderRadius: '50%',
                      animation: 'spin 0.7s linear infinite',
                      margin: '0 auto',
                    }} />
                  </div>
                )}

                {reactors && reactors.length === 0 && (
                  <p style={{ color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', fontSize: 11, textAlign: 'center', padding: '12px 0' }}>{t.commB.noneYet}</p>
                )}

                {reactors && Object.entries(grouped).map(([emoji, rows]) => (
                  <div key={emoji} style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 12, marginBottom: 6, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                      {emoji} <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{rows.length}</span>
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {rows.map(r => (
                        <div key={r.player_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                            backgroundImage: r.avatar_url ? `url(${r.avatar_url})` : undefined,
                            backgroundSize: 'cover', backgroundPosition: 'center',
                            background: r.avatar_url ? undefined : 'rgba(155,0,255,0.15)',
                            border: '1px solid rgba(155,0,255,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace',
                          }}>
                            {!r.avatar_url && r.username[0]?.toUpperCase()}
                          </div>
                          <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>{r.username}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
