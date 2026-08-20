import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { socket, emitWithAck } from '@/lib/socket';
import type { Friend, Res } from '@/types/index';

interface InvitePerson extends Friend { isKnown?: boolean }

/**
 * Invite anyone to a match.
 *
 * Deliberately NOT a friends picker. A lobby that needs three more people needs
 * them now, and the friends list at that exact moment is usually empty or
 * offline — so the list opens on everyone who is online, and the search box
 * reaches every account by name or #id. Someone met once in a room can be
 * pulled into the next game without a friend request first.
 *
 * Offline people can still be invited; the invite arrives as a notification
 * instead of an overlay, and the button says so rather than implying the person
 * is about to walk in.
 */
export function GameInviteButton({ game, code, compact = false }: { game: string; code: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<InvitePerson[] | null>(null);
  const [sent, setSent] = useState<Record<string, 'live' | 'push' | 'failed'>>({});
  const [note, setNote] = useState<string | null>(null);

  // Debounced: every keystroke is a query over every account, and the answer to
  // a half-typed name is never the one wanted.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const run = () => {
      emitWithAck<{ q: string }, Res<InvitePerson[]>>('invite:people', { q })
        .then(res => { if (alive) setPeople(res.ok ? (res.data ?? []) : []); })
        .catch(() => { if (alive) setPeople([]); });
    };
    const t = setTimeout(run, q ? 260 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [open, q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!open) { setQ(''); setPeople(null); setNote(null); } }, [open]);

  const invite = (p: InvitePerson) => {
    (socket as any).emit('game:invite', { targetProfileId: p.profileId, game, code }, (res: any) => {
      if (!res?.ok) { setSent(s => ({ ...s, [p.profileId]: 'failed' })); setNote(res?.error ?? null); return; }
      setSent(s => ({ ...s, [p.profileId]: res.data?.delivered === 'push' ? 'push' : 'live' }));
      setNote(null);
    });
  };

  const label = (p: InvitePerson) => {
    const st = sent[p.profileId];
    if (st === 'live') return '✓ გაიგზავნა';
    if (st === 'push') return '✓ შეტყობინება';
    if (st === 'failed') return 'ისევ';
    return 'მოწვევა';
  };

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

              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="მოძებნე ნებისმიერი — სახელი ან #id"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 12, marginBottom: 10, fontFamily: 'monospace', fontSize: 13, color: 'white', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(155,0,255,.28)', outline: 'none' }}
              />

              {note && <p style={{ fontFamily: 'monospace', fontSize: 11, color: '#ff8fa3', marginBottom: 8 }}>{note}</p>}

              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {people === null && <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.25)', textAlign: 'center', padding: '12px 0' }}>…</p>}
                {people?.length === 0 && (
                  <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.25)', textAlign: 'center', padding: '12px 0' }}>
                    {q ? 'ვერავინ მოიძებნა' : 'ჯერ არავინაა ონლაინ — მოძებნე სახელით'}
                  </p>
                )}
                {people?.map(p => (
                  <div key={p.profileId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)' }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(155,0,255,.15)', border: '1px solid rgba(155,0,255,.25)', fontSize: 14, overflow: 'hidden' }}>
                      {p.avatarUrl ? <img src={p.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : p.avatar}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.username}{p.isKnown ? ' ★' : ''}
                      </p>
                      <p style={{ fontFamily: 'monospace', fontSize: 9, color: p.isOnline ? '#00ff88' : 'rgba(255,255,255,.25)' }}>
                        {p.isOnline ? 'ონლაინ' : 'ოფლაინ'}{p.publicId ? ` · #${p.publicId}` : ''}
                      </p>
                    </div>
                    <button onClick={() => invite(p)} disabled={sent[p.profileId] === 'live' || sent[p.profileId] === 'push'}
                      className="px-3 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
                      style={{
                        fontFamily: 'monospace', fontSize: 11, flexShrink: 0,
                        background: sent[p.profileId] ? 'rgba(0,255,136,.12)' : 'rgba(155,0,255,.14)',
                        border: `1px solid ${sent[p.profileId] ? 'rgba(0,255,136,.3)' : 'rgba(155,0,255,.35)'}`,
                        color: sent[p.profileId] ? '#00ff88' : '#c084fc',
                      }}>
                      {label(p)}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
