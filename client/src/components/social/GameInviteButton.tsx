import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { socket } from '@/lib/socket';
import { InvitePeoplePicker, type InviteDelivery, type InvitePerson } from '@/components/social/InvitePeoplePicker';

/**
 * Invite anyone to a party-game match.
 *
 * The picker is shared with the mafia lobby (see InvitePeoplePicker); the only
 * thing this adds is the match code, which the invite has to carry because the
 * server cannot guess which of several open matches this button belongs to.
 */
export function GameInviteButton({ game, code, compact = false }: { game: string; code: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);

  const invite = (p: InvitePerson) => new Promise<InviteDelivery>((resolve, reject) => {
    (socket as any).emit('game:invite', { targetProfileId: p.profileId, game, code }, (res: any) => {
      if (res?.ok) resolve(res.data?.delivered === 'push' ? 'push' : 'live');
      else reject(new Error(res?.error ?? 'ვერ გაიგზავნა'));
    });
  });

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="font-mono px-4 py-2 rounded-xl transition-all active:scale-95"
        style={{ fontSize: 12, background: 'rgba(155,0,255,.15)', border: '1px solid rgba(155,0,255,.4)', color: '#c084fc' }}>
        {compact ? '➕' : '➕ მოწვევა'}
      </button>

      {open && createPortal(
        <AnimatePresence>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <motion.div onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              style={{ width: 'min(380px, 100%)', maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: 'rgba(8,3,22,.99)', border: '1px solid rgba(155,0,255,.3)', borderRadius: 20, padding: 18 }}>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 16, color: 'white' }}>მოწვევა</p>
                <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', fontSize: 16, cursor: 'pointer' }}>✕</button>
              </div>
              <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 10 }}>კოდი: {code}</p>

              <InvitePeoplePicker invite={invite} />
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
