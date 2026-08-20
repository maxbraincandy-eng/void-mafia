import { useEffect, useState } from 'react';
import { emitWithAck } from '@/lib/socket';
import type { Friend, Res } from '@/types/index';

export interface InvitePerson extends Friend { isKnown?: boolean }

/** What happened to one invite: an overlay now, or a notification for later. */
export type InviteDelivery = 'live' | 'push';

/**
 * "Who do you want in this game?" — answered with everyone, not with a friends
 * list.
 *
 * The list a player needs is the one that has people in it AT THAT MOMENT: a
 * table two short does not wait for a friend request to be accepted. So it
 * opens on whoever is online and the search box reaches every account by name
 * or #id; people already connected to you are marked with a star rather than
 * being the only ones shown.
 *
 * Offline people can be invited too. That invite arrives as a notification
 * instead of an overlay, and the button says which happened — "sent" and "they
 * will see it later" are different promises.
 *
 * The picker owns the searching and the per-person state; WHAT an invite is
 * differs between a mafia room (the server knows which room you are in) and a
 * party game (a code travels with it), so that is the caller's one job.
 */
export function InvitePeoplePicker({
  invite,
  emptyHint,
}: {
  invite: (p: InvitePerson) => Promise<InviteDelivery>;
  emptyHint?: string;
}) {
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<InvitePerson[] | null>(null);
  const [sent, setSent] = useState<Record<string, InviteDelivery | 'failed'>>({});
  const [note, setNote] = useState<string | null>(null);

  // Debounced: each keystroke queries every account, and a half-typed name is
  // never the question being asked.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      emitWithAck<{ q: string }, Res<InvitePerson[]>>('invite:people', { q })
        .then(res => { if (alive) setPeople(res.ok ? (res.data ?? []) : []); })
        .catch(() => { if (alive) setPeople([]); });
    }, q ? 260 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const run = (p: InvitePerson) => {
    invite(p)
      .then(d => { setSent(s => ({ ...s, [p.profileId]: d })); setNote(null); })
      .catch(e => { setSent(s => ({ ...s, [p.profileId]: 'failed' })); setNote(e?.message ?? null); });
  };

  const label = (p: InvitePerson) => {
    const st = sent[p.profileId];
    return st === 'live' ? '✓ გაიგზავნა'
      : st === 'push' ? '✓ შეტყობინება'
      : st === 'failed' ? 'ისევ'
      : 'მოწვევა';
  };

  return (
    <>
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
            {q ? 'ვერავინ მოიძებნა' : (emptyHint ?? 'ჯერ არავინაა ონლაინ — მოძებნე სახელით')}
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
            <button onClick={() => run(p)} disabled={sent[p.profileId] === 'live' || sent[p.profileId] === 'push'}
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
    </>
  );
}
