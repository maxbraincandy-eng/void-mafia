import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { socket, emitWithAck } from '@/lib/socket';
import type { Friend, Res } from '@/types/index';

/**
 * Invite button for a game lobby. Opens a picker of invitable people
 * (friends + community follows) and sends a game invite carrying the match code.
 */
export function GameInviteButton({ game, code }: { game: string; code: string }) {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [invited, setInvited] = useState<Record<string, 'sent' | 'failed'>>({});

  useEffect(() => {
    if (!open) return;
    setFriends(null);
    emitWithAck<void, Res<Friend[]>>('friend:invitable_list')
      .then(res => setFriends(res.ok ? (res.data ?? []) : []))
      .catch(() => setFriends([]));
  }, [open]);

  const invite = (f: Friend) => {
    (socket as any).emit('game:invite', { targetProfileId: f.profileId, game, code }, (res: any) => {
      setInvited(prev => ({ ...prev, [f.profileId]: res?.ok ? 'sent' : 'failed' }));
    });
  };

  const online = (friends ?? []).filter(f => f.isOnline);
  const offline = (friends ?? []).filter(f => !f.isOnline);

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="font-mono text-[12px] px-4 py-2 rounded-xl transition-all active:scale-95"
        style={{ background: 'rgba(155,0,255,.15)', border: '1px solid rgba(155,0,255,.4)', color: '#c084fc' }}>
        ✦ მეგობრის მოწვევა
      </button>

      {open && createPortal(
        <AnimatePresence>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <motion.div onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              style={{ width: 'min(360px, 100%)', maxHeight: '80vh', overflowY: 'auto', background: 'rgba(8,3,22,.99)', border: '1px solid rgba(155,0,255,.3)', borderRadius: 20, padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 16, color: 'white' }}>✦ მეგობრის მოწვევა</p>
                <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', fontSize: 16, cursor: 'pointer' }}>✕</button>
              </div>
              <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 14 }}>კოდი: {code}</p>
              {friends === null && <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.25)', textAlign: 'center', padding: '12px 0' }}>იტვირთება…</p>}
              {friends?.length === 0 && <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.25)', textAlign: 'center', padding: '12px 0' }}>ვერავინ მოიძებნა</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...online, ...offline].map(f => {
                  const st = invited[f.profileId];
                  return (
                    <div key={f.profileId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)' }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(155,0,255,.15)', border: '1px solid rgba(155,0,255,.25)', fontSize: 14, overflow: 'hidden' }}>
                        {f.avatarUrl ? <img src={f.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : f.avatar}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.username}</p>
                        <p style={{ fontFamily: 'monospace', fontSize: 9, color: f.isOnline ? '#00ff88' : 'rgba(255,255,255,.25)' }}>{f.isOnline ? 'online' : 'offline'}</p>
                      </div>
                      <button onClick={() => invite(f)} disabled={!f.isOnline || st === 'sent'}
                        className="px-3 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-40"
                        style={{ fontFamily: 'monospace', fontSize: 11, flexShrink: 0, background: st === 'sent' ? 'rgba(0,255,136,.12)' : 'rgba(155,0,255,.14)', border: `1px solid ${st === 'sent' ? 'rgba(0,255,136,.3)' : 'rgba(155,0,255,.35)'}`, color: st === 'sent' ? '#00ff88' : '#c084fc' }}>
                        {st === 'sent' ? '✓ sent' : st === 'failed' ? 'retry' : 'invite'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
