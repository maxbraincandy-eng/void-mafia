import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';

/**
 * App-wide, strict friend-request overlay. Whenever a friend request arrives
 * (anywhere in the app), a centred blocking modal appears with the sender's
 * name and Yes / No. It cannot be dismissed except by answering. Requests
 * queue up — the next one shows after the current is answered.
 */
export function FriendRequestOverlay() {
  const requests = useGameStore(s => s.pendingFriendRequests);
  const dismiss = useGameStore(s => s.dismissFriendRequest);
  const addToast = useGameStore(s => s.addToast);
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);

  const req = requests[0];
  if (!req) return null;

  const respond = async (accept: boolean) => {
    if (busy) return;
    setBusy(accept ? 'yes' : 'no');
    try {
      if (accept) {
        await emitWithAck<{ fromProfileId: string }, Res<null>>('friend:accept', { fromProfileId: req.fromId });
        addToast(`${req.fromUsername} — ახლა მეგობრები ხართ`, 'success');
      } else {
        await emitWithAck<{ fromProfileId: string }, Res<null>>('friend:decline', { fromProfileId: req.fromId });
      }
    } catch (e: any) {
      addToast(e?.message ?? 'Failed', 'error');
    } finally {
      dismiss(req.fromId);
      setBusy(null);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="frbg"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <motion.div
          key={req.id}
          initial={{ opacity: 0, y: 20, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 360, damping: 26 }}
          style={{ width: 'min(340px, 100%)', background: 'rgba(10,4,26,0.99)', border: '1px solid rgba(155,0,255,0.4)', borderRadius: 22, padding: '24px 20px', textAlign: 'center', boxShadow: '0 24px 70px rgba(0,0,0,0.7), 0 0 40px rgba(155,0,255,0.15)' }}
        >
          {/* Avatar */}
          <div style={{ width: 66, height: 66, margin: '0 auto 12px', borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(155,0,255,0.15)', border: '1.5px solid rgba(155,0,255,0.4)', fontSize: 28 }}>
            {req.fromAvatarUrl
              ? <img src={req.fromAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span>{req.fromAvatar || req.fromUsername[0]?.toUpperCase()}</span>}
          </div>
          <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>👥 Friend Request</p>
          <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 17, color: 'white', lineHeight: 1.3, marginBottom: 2 }}>{req.fromUsername}</p>
          <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>sent you a friend request</p>

          <div style={{ display: 'flex', gap: 10 }}>
            <button disabled={!!busy} onClick={() => respond(false)}
              style={{ flex: 1, padding: '13px', borderRadius: 14, fontFamily: 'monospace', fontSize: 14, background: 'rgba(255,45,85,0.12)', border: '1px solid rgba(255,45,85,0.4)', color: '#ff2d55', cursor: 'pointer', opacity: busy === 'yes' ? 0.4 : 1 }}>
              {busy === 'no' ? '…' : 'No'}
            </button>
            <button disabled={!!busy} onClick={() => respond(true)}
              style={{ flex: 1, padding: '13px', borderRadius: 14, fontFamily: 'monospace', fontSize: 14, fontWeight: 700, background: 'rgba(0,255,136,0.16)', border: '1px solid rgba(0,255,136,0.45)', color: '#00ff88', cursor: 'pointer', opacity: busy === 'no' ? 0.4 : 1 }}>
              {busy === 'yes' ? '…' : 'Yes'}
            </button>
          </div>
          {requests.length > 1 && (
            <p style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 12 }}>+{requests.length - 1} more waiting</p>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
