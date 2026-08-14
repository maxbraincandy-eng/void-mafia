// ── Appeal a restriction ──────────────────────────────────────────────
// A ban currently reaches a player as an error string when they try to join a
// room, and there it ends: no explanation they can respond to, no route back.
// A wrongly banned player simply disappears, and the mistake is never
// discovered — which is also why moderators never learn they made one.
//
// This renders nothing at all for the overwhelming majority who have no
// restriction, so it is safe to mount from the always-available menu.
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import { T, hairline } from '@/design/tokens';
import type { Res } from '@/types/index';

interface Mine {
  restricted: 'ban' | 'mute' | null;
  reason: string | null;
  expiresAt: number | null;
  appeal: { id: string; status: 'open' | 'granted' | 'denied'; body: string; createdAt: number; decision: string } | null;
}

const STATUS_KA: Record<string, string> = {
  open: 'განიხილება', granted: 'დაკმაყოფილდა', denied: 'უარყოფილია',
};

export function AppealPanel() {
  const [mine, setMine] = useState<Mine | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    emitWithAck<undefined, Res<Mine>>('appeal:mine')
      .then(r => { if (r.ok) setMine(r.data); })
      .catch(() => {});
  };
  useEffect(load, []);

  // Nothing to appeal — render nothing rather than an empty section.
  if (!mine || (!mine.restricted && !mine.appeal)) return null;

  const submit = async () => {
    if (busy || body.trim().length < 10) return;
    setBusy(true); setMsg(null);
    try {
      const r = await emitWithAck<{ body: string }, Res<any>>('appeal:create', { body: body.trim() });
      if (r.ok) { setBody(''); setMsg('გაიგზავნა — მოდერატორი განიხილავს.'); load(); }
      else setMsg(('error' in r && r.error) || 'ვერ გაიგზავნა');
    } catch (e: any) { setMsg(e?.message ?? 'ვერ გაიგზავნა'); }
    finally { setBusy(false); }
  };

  const a = mine.appeal;
  const canFile = !!mine.restricted && (!a || a.status !== 'open');

  return (
    <AnimatePresence>
      <motion.div style={S.wrap} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <div style={S.head}>
          <span style={S.title}>
            {mine.restricted === 'ban' ? '🚫 შენ დაბლოკილი ხარ'
              : mine.restricted === 'mute' ? '🔇 შენ დადუმებული ხარ'
              : '📄 შენი გასაჩივრება'}
          </span>
        </div>

        {mine.reason && <p style={S.reason}>მიზეზი: {mine.reason}</p>}
        {mine.expiresAt && (
          <p style={S.reason}>
            მოქმედებს: {new Date(mine.expiresAt).toLocaleString('ka-GE')}-მდე
          </p>
        )}

        {a && (
          <div style={{ ...S.status, borderColor: a.status === 'granted' ? T.color.success : a.status === 'denied' ? T.color.danger : T.color.warn }}>
            <span style={{ color: a.status === 'granted' ? T.color.success : a.status === 'denied' ? T.color.danger : T.color.warn }}>
              {STATUS_KA[a.status]}
            </span>
            {a.decision && <p style={S.decision}>{a.decision}</p>}
          </div>
        )}

        {canFile && (
          <>
            <textarea
              value={body} onChange={e => setBody(e.target.value)}
              placeholder="ახსენი მოკლედ, რატომ ფიქრობ, რომ ეს გადაწყვეტილება არასწორია…"
              maxLength={800} rows={4} style={S.input}
            />
            <button onClick={submit} disabled={busy || body.trim().length < 10} style={{
              ...S.send, opacity: busy || body.trim().length < 10 ? 0.5 : 1,
            }}>
              {busy ? 'იგზავნება…' : 'გასაჩივრება'}
            </button>
          </>
        )}
        {msg && <p style={S.msg}>{msg}</p>}
      </motion.div>
    </AnimatePresence>
  );
}

const S: Record<string, any> = {
  wrap: { display: 'grid', gap: T.space.md, padding: T.space.xl, borderRadius: T.radius.lg, background: T.color.dangerSoft, border: `1px solid ${T.color.dangerSoft}`, marginBottom: T.space.xl },
  head: { display: 'flex', alignItems: 'center', gap: T.space.md },
  title: { fontSize: T.font.body, fontWeight: T.weight.bold, color: T.text.primary },
  reason: { fontSize: T.font.small, color: T.text.secondary, margin: 0, lineHeight: 1.5 },
  status: { padding: '8px 10px', borderRadius: T.radius.md, border: '1px solid', background: T.surface.sunken, fontSize: T.font.small },
  decision: { margin: '4px 0 0', color: T.text.secondary, lineHeight: 1.5 },
  input: { width: '100%', padding: '10px 12px', borderRadius: T.radius.md, background: T.surface.sunken, border: `1px solid ${T.surface.lineStrong}`, color: T.text.primary, fontSize: T.font.body, resize: 'vertical', outline: 'none', fontFamily: 'inherit' },
  send: { width: '100%', padding: '11px', borderRadius: T.radius.md, border: 'none', background: T.gradient.accent, color: T.text.onAccent, fontWeight: T.weight.bold, fontSize: T.font.body },
  msg: { fontSize: T.font.small, color: T.text.muted, margin: 0, textAlign: 'center' },
};
