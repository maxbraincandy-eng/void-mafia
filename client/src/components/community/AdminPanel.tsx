import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';

interface Res<T> { ok: boolean; data: T; error?: string }
type Tab = 'users' | 'reports' | 'content' | 'recovery' | 'audit' | 'badges';

interface AdminPanelProps {
  onClose: () => void;
  myModLevel: string;
}

// ── Design tokens ──────────────────────────────────────────────────────
const BG      = '#07000f';
const BG2     = '#0e0020';
const BG3     = '#130030';
const BORDER  = 'rgba(155,0,255,0.18)';
const ACCENT  = '#ffc800';
const PURPLE  = '#9b00ff';
const CYAN    = '#00f5ff';
const DANGER  = '#ff3060';
const GREEN   = '#00e676';
const WARN    = '#ff9800';
const MUTED   = 'rgba(255,255,255,0.38)';
const WHITE   = '#fff';

function fmt(ts: number | null | undefined) {
  if (!ts) return '—';
  const d = new Date(Number(ts));
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtShort(ts: number | null | undefined) {
  if (!ts) return '—';
  return new Date(Number(ts)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Shared components ──────────────────────────────────────────────────

function Chip({ label, color = MUTED }: { label: string; color?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999,
      fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
      background: `${color}1a`, color, border: `1px solid ${color}40`,
    }}>
      {label}
    </span>
  );
}

function Btn({ label, color = ACCENT, onClick, disabled, small }: {
  label: string; color?: string; onClick: () => void; disabled?: boolean; small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? '4px 10px' : '6px 14px',
        borderRadius: 8, fontSize: small ? 11 : 12, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
        background: `${color}15`, color, border: `1px solid ${color}50`,
        opacity: disabled ? 0.4 : 1, transition: 'all 0.15s', letterSpacing: 0.3,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px',
      marginBottom: 8, ...style,
    }}>
      {children}
    </div>
  );
}

function StatusBar({ text, isError }: { text: string; isError?: boolean }) {
  return (
    <div style={{
      padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: 12, fontWeight: 600,
      background: isError ? `${DANGER}15` : `${GREEN}15`,
      border: `1px solid ${isError ? DANGER : GREEN}40`,
      color: isError ? DANGER : GREEN,
    }}>
      {isError ? '⚠ ' : '✓ '}{text}
    </div>
  );
}

function Input({ value, onChange, placeholder, onEnter }: {
  value: string; onChange: (v: string) => void; placeholder?: string; onEnter?: () => void;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && onEnter?.()}
      placeholder={placeholder}
      style={{
        flex: 1, background: BG3, border: `1px solid ${BORDER}`,
        borderRadius: 8, padding: '9px 12px', color: WHITE, fontSize: 13, outline: 'none',
        width: '100%', boxSizing: 'border-box',
      }}
    />
  );
}

// ── Users Tab ──────────────────────────────────────────────────────────
function UsersTab({ myModLevel }: { myModLevel: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);

  const search = async () => {
    if (query.trim().length < 2) return;
    setLoading(true);
    setResults([]);
    setSelected(null);
    try {
      const res = await emitWithAck<any, Res<any[]>>('admin:user_search', { query });
      if (res.ok) setResults(res.data);
      else { setFeedback(res.error ?? 'Error'); setFeedbackError(true); }
    } finally { setLoading(false); }
  };

  const openProfile = async (playerId: string) => {
    setSelected(null);
    try {
      const res = await emitWithAck<any, Res<any>>('admin:user_profile', { playerId });
      if (res.ok) setSelected(res.data);
    } catch {}
  };

  const doAction = async (action: string, extra?: any) => {
    if (!selected) return;
    setFeedback(''); setFeedbackError(false);
    try {
      const res = await emitWithAck<any, Res<any>>('admin:user_action', { action, playerId: selected.id, reason, ...extra });
      if (res.ok) {
        setFeedback(`"${action}" applied.`);
        await openProfile(selected.id);
        setReason('');
      } else { setFeedback(res.error ?? 'Error'); setFeedbackError(true); }
    } catch (e: any) { setFeedback(e.message); setFeedbackError(true); }
  };

  if (selected) {
    const s = selected;
    return (
      <div>
        <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: CYAN, cursor: 'pointer', fontSize: 13, marginBottom: 12, padding: 0, fontWeight: 600 }}>
          ← Back to results
        </button>
        {feedback && <StatusBar text={feedback} isError={feedbackError} />}

        {/* Profile header */}
        <Row>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: BG3, border: `2px solid ${PURPLE}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
              {s.avatar || '?'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: WHITE, fontWeight: 700, fontSize: 15 }}>{s.username}</div>
              <div style={{ color: MUTED, fontSize: 11, marginTop: 1 }}>#{s.friend_code || '—'} · ID: {s.id?.slice(0,12)}…</div>
            </div>
            {s.moderator_level && <Chip label={s.moderator_level} color={s.moderator_level === 'owner' ? ACCENT : PURPLE} />}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {s.ban && <Chip label="BANNED" color={DANGER} />}
            {s.suspension && <Chip label="SUSPENDED" color={DANGER} />}
            {s.mute && <Chip label="MUTED" color={WARN} />}
            {s.profile_locked && <Chip label="PROFILE LOCKED" color={PURPLE} />}
            {s.force_public && <Chip label="FORCE PUBLIC" color={CYAN} />}
          </div>
        </Row>

        {/* Stats grid */}
        <Row>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: 'Games', value: s.games ?? 0 },
              { label: 'Posts', value: s.post_count ?? 0 },
              { label: 'Joined', value: fmtShort(s.joined_at) },
              { label: 'Last seen', value: fmtShort(s.last_seen_at) },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ color: WHITE, fontWeight: 700, fontSize: 14 }}>{value}</div>
                <div style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </Row>

        {/* Warnings */}
        {s.warnings?.length > 0 && (
          <Section title={`Warnings (${s.warnings.length})`}>
            {s.warnings.slice(0, 5).map((w: any) => (
              <Row key={w.id} style={{ padding: '8px 12px', marginBottom: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12 }}>
                  <span style={{ color: WARN, whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtShort(w.issued_at)}</span>
                  <span style={{ color: WHITE }}>{w.reason || '(no reason)'}</span>
                  <span style={{ color: MUTED, whiteSpace: 'nowrap', flexShrink: 0 }}>by {w.issued_by_name}</span>
                </div>
              </Row>
            ))}
          </Section>
        )}

        {/* Reason */}
        <Section title="Reason (optional)">
          <Input value={reason} onChange={setReason} placeholder="Provide a reason for the action…" />
        </Section>

        {/* Actions by severity */}
        <Section title="Moderation actions">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <Btn label="Warn" color={WARN} onClick={() => doAction('warn')} small />
            <Btn label="Mute 1h" color={WARN} onClick={() => doAction('mute', { duration: 3600 })} small />
            <Btn label="Mute 24h" color={WARN} onClick={() => doAction('mute', { duration: 86400 })} small />
            <Btn label="Mute 7d" color={WARN} onClick={() => doAction('mute', { duration: 604800 })} small />
            {s.mute && <Btn label="Unmute" color={GREEN} onClick={() => doAction('unmute')} small />}
          </div>
          <div style={{ width: '100%', height: 1, background: BORDER, margin: '6px 0' }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <Btn label="Suspend 1d" color={DANGER} onClick={() => doAction('suspend', { duration: 86400 })} small />
            <Btn label="Suspend 7d" color={DANGER} onClick={() => doAction('suspend', { duration: 604800 })} small />
            <Btn label="Suspend 30d" color={DANGER} onClick={() => doAction('suspend', { duration: 2592000 })} small />
            <Btn label="Suspend ∞" color={DANGER} onClick={() => doAction('suspend', { duration: 0 })} small />
            {s.suspension && <Btn label="Unsuspend" color={GREEN} onClick={() => doAction('unsuspend')} small />}
          </div>
          <div style={{ width: '100%', height: 1, background: BORDER, margin: '6px 0' }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Btn label="Community Ban" color={DANGER} onClick={() => doAction('ban')} small />
            {s.ban && <Btn label="Unban" color={GREEN} onClick={() => doAction('unban')} small />}
          </div>
        </Section>

        {/* Admin/owner controls */}
        {(myModLevel === 'admin' || myModLevel === 'owner') && (
          <Section title="Profile controls">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Btn small label={s.profile_locked ? 'Unlock Profile' : 'Lock Profile'} color={PURPLE} onClick={() => doAction('profile_controls', { profileLocked: !s.profile_locked })} />
              <Btn small label={s.secret_mode_disabled ? 'Re-enable Secret Mode' : 'Disable Secret Mode'} color={CYAN} onClick={() => doAction('profile_controls', { secretModeDisabled: !s.secret_mode_disabled })} />
              <Btn small label={s.force_public ? 'Remove Force Public' : 'Force Public'} color={CYAN} onClick={() => doAction('profile_controls', { forcePublic: !s.force_public })} />
            </div>
          </Section>
        )}
      </div>
    );
  }

  return (
    <div>
      {feedback && <StatusBar text={feedback} isError={feedbackError} />}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Input value={query} onChange={setQuery} placeholder="Search by name, friend code, or ID…" onEnter={search} />
        <Btn label={loading ? '…' : 'Search'} onClick={search} disabled={loading} />
      </div>
      {results.length === 0 && !loading && (
        <div style={{ color: MUTED, textAlign: 'center', padding: '30px 0', fontSize: 13 }}>
          Search for a player above
        </div>
      )}
      {results.map(u => (
        <Row key={u.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: BG3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
              {u.avatar || '?'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: WHITE, fontWeight: 600, fontSize: 13 }}>{u.username}</div>
              <div style={{ color: MUTED, fontSize: 11 }}>#{u.friend_code || '—'}</div>
            </div>
            {u.moderator_level && <Chip label={u.moderator_level} color={u.moderator_level === 'owner' ? ACCENT : PURPLE} />}
            <Btn label="View" small onClick={() => openProfile(u.id)} />
          </div>
        </Row>
      ))}
    </div>
  );
}

// ── Reports Tab ────────────────────────────────────────────────────────
function ReportsTab() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await emitWithAck<any, Res<any[]>>('admin:report_list', {});
      if (res.ok) setReports(res.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolve = async (reportId: string, status: string) => {
    const res = await emitWithAck<any, Res<any>>('community:report_resolve', { reportId, status });
    if (res.ok) {
      setReports(r => r.map(x => x.id === reportId ? { ...x, status } : x));
      setFeedback('Resolved.');
    } else setFeedback(res.error ?? 'Error');
  };

  const pending = reports.filter(r => r.status === 'pending');
  const resolved = reports.filter(r => r.status !== 'pending');

  if (loading) return <div style={{ color: MUTED, textAlign: 'center', padding: 30 }}>Loading reports…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <Chip label={`${pending.length} pending`} color={pending.length > 0 ? DANGER : MUTED} />
          <Chip label={`${resolved.length} resolved`} color={MUTED} />
        </div>
        <Btn label="↻ Refresh" small onClick={load} />
      </div>
      {feedback && <StatusBar text={feedback} />}
      {reports.length === 0 && <div style={{ color: MUTED, textAlign: 'center', padding: 30, fontSize: 13 }}>No reports found.</div>}
      {reports.map(r => (
        <Row key={r.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                <Chip label={r.status} color={r.status === 'pending' ? WARN : r.status === 'resolved' ? GREEN : MUTED} />
                <Chip label={r.target_type || 'post'} color={PURPLE} />
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>
                <span style={{ color: WHITE, fontWeight: 600 }}>{r.reporter_name || r.reporter_id}</span> reported{r.target_name ? <> <span style={{ color: CYAN }}>{r.target_name}</span></> : ''}
              </div>
              <div style={{ fontSize: 12, color: WHITE, marginBottom: 4 }}>{r.reason}</div>
              {r.post_content && (
                <div style={{ fontSize: 11, color: MUTED, background: BG3, borderRadius: 6, padding: '5px 8px', marginTop: 4, maxHeight: 50, overflow: 'hidden' }}>
                  {r.post_content.slice(0, 200)}
                </div>
              )}
              <div style={{ color: MUTED, fontSize: 11, marginTop: 6 }}>{fmt(r.created_at)}</div>
            </div>
            {r.status === 'pending' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                <Btn label="Resolve" color={GREEN} small onClick={() => resolve(r.id, 'resolved')} />
                <Btn label="Dismiss" color={MUTED} small onClick={() => resolve(r.id, 'dismissed')} />
              </div>
            )}
          </div>
        </Row>
      ))}
    </div>
  );
}

// ── Content Tab ────────────────────────────────────────────────────────
function ContentTab({ myModLevel }: { myModLevel: string }) {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);
  const isOwner = myModLevel === 'owner';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await emitWithAck<any, Res<any[]>>('admin:post_list', {});
      if (res.ok) setPosts(res.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const postAction = async (postId: string, action: string) => {
    setFeedback(''); setFeedbackError(false);
    const res = await emitWithAck<any, Res<any>>('admin:post_action', { postId, action });
    if (res.ok) {
      setFeedback(`Post ${action} done.`);
      if (action === 'delete' || action === 'hide') setPosts(p => p.filter(x => x.id !== postId));
      else setPosts(p => p.map(x => x.id === postId ? {
        ...x,
        isPinned: action === 'pin' ? true : action === 'unpin' ? false : x.isPinned,
        isFeatured: action === 'feature' ? true : action === 'unfeature' ? false : x.isFeatured,
      } : x));
    } else { setFeedback(res.error ?? 'Error'); setFeedbackError(true); }
  };

  if (loading) return <div style={{ color: MUTED, textAlign: 'center', padding: 30 }}>Loading content…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Chip label={`${posts.length} posts`} color={MUTED} />
        <Btn label="↻ Refresh" small onClick={load} />
      </div>
      {feedback && <StatusBar text={feedback} isError={feedbackError} />}
      {posts.length === 0 && <div style={{ color: MUTED, textAlign: 'center', padding: 30 }}>No posts found.</div>}
      {posts.map((p: any) => (
        <Row key={p.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              {/* badges */}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 5 }}>
                {p.isPinned && <Chip label="pinned" color={ACCENT} />}
                {p.isFeatured && <Chip label="featured" color={PURPLE} />}
                {p.hidden && <Chip label="hidden" color={MUTED} />}
                {p.isAnonymous && <Chip label="anonymous" color={CYAN} />}
              </div>
              {/* author */}
              <div style={{ fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: p.isAnonymous ? CYAN : MUTED }}>{p.authorName}</span>
                {p.realAuthorName && (
                  <span style={{ color: ACCENT, fontSize: 10, marginLeft: 6 }}>→ {p.realAuthorName}</span>
                )}
                <span style={{ color: MUTED }}> · {fmtShort(p.createdAt)}</span>
              </div>
              {/* content */}
              <div style={{ fontSize: 12, color: WHITE, overflow: 'hidden', maxHeight: 44, lineHeight: 1.5 }}>
                {(p.content || '').slice(0, 160) || <span style={{ color: MUTED, fontStyle: 'italic' }}>[{p.postType}]</span>}
              </div>
              {/* stats */}
              <div style={{ display: 'flex', gap: 10, marginTop: 5, fontSize: 11, color: MUTED }}>
                <span>♥ {p.likesCount}</span>
                <span>💬 {p.commentsCount}</span>
              </div>
            </div>
            {/* actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
              {isOwner && <Btn label="Delete" color={DANGER} small onClick={() => postAction(p.id, 'delete')} />}
              {!p.isPinned
                ? <Btn label="Pin" color={ACCENT} small onClick={() => postAction(p.id, 'pin')} />
                : <Btn label="Unpin" color={MUTED} small onClick={() => postAction(p.id, 'unpin')} />}
              {!p.isFeatured
                ? <Btn label="Feature" color={PURPLE} small onClick={() => postAction(p.id, 'feature')} />
                : <Btn label="Unfeature" color={MUTED} small onClick={() => postAction(p.id, 'unfeature')} />}
              {!p.hidden && <Btn label="Hide" color={MUTED} small onClick={() => postAction(p.id, 'hide')} />}
            </div>
          </div>
        </Row>
      ))}
    </div>
  );
}

// ── Recovery Tab ───────────────────────────────────────────────────────
function RecoveryTab() {
  const [contentType, setContentType] = useState<'posts' | 'comments' | 'debates'>('posts');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async (type: 'posts' | 'comments' | 'debates') => {
    setLoading(true);
    setItems([]);
    try {
      const res = await emitWithAck<any, Res<any[]>>('admin:deleted_content', { type });
      if (res.ok) setItems(res.data);
      else setFeedback(res.error ?? 'Error');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(contentType); }, [contentType, load]);

  const restore = async (id: string) => {
    const event = contentType === 'posts' ? 'admin:post_action' : contentType === 'comments' ? 'admin:comment_action' : 'admin:debate_action';
    const key = contentType === 'posts' ? 'postId' : contentType === 'comments' ? 'commentId' : 'debateId';
    const res = await emitWithAck<any, Res<any>>(event, { action: 'restore', [key]: id });
    if (res.ok) {
      setFeedback('Restored successfully.');
      setItems(it => it.filter(x => x.id !== id));
    } else setFeedback(res.error ?? 'Error');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['posts', 'comments', 'debates'] as const).map(t => (
          <button
            key={t}
            onClick={() => setContentType(t)}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 11, cursor: 'pointer', fontWeight: 600,
              background: contentType === t ? `${PURPLE}25` : 'transparent',
              border: `1px solid ${contentType === t ? PURPLE : BORDER}`,
              color: contentType === t ? WHITE : MUTED,
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {feedback && <StatusBar text={feedback} />}
      {loading && <div style={{ color: MUTED, textAlign: 'center', padding: 30 }}>Loading…</div>}
      {!loading && items.length === 0 && <div style={{ color: MUTED, textAlign: 'center', padding: 30, fontSize: 13 }}>Nothing deleted.</div>}
      {items.map((item: any) => (
        <Row key={item.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>
                <span style={{ color: WHITE, fontWeight: 600 }}>{item.author_name || item.creator_name || '?'}</span>
                {' · '}Deleted {fmt(item.deleted_at)}
                {item.deleted_by_name && <> by <span style={{ color: WARN }}>{item.deleted_by_name}</span></>}
              </div>
              <div style={{ fontSize: 12, color: WHITE, overflow: 'hidden', maxHeight: 44 }}>
                {(item.content || item.topic || '(no content)').slice(0, 180)}
              </div>
            </div>
            <Btn label="↩ Restore" color={GREEN} small onClick={() => restore(item.id)} />
          </div>
        </Row>
      ))}
    </div>
  );
}

// ── Audit Tab ──────────────────────────────────────────────────────────
function AuditTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await emitWithAck<any, Res<any[]>>('admin:audit_logs', {});
      if (res.ok) setLogs(res.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const actionColor = (action: string) => {
    if (action.includes('delete') || action.includes('ban') || action.includes('suspend')) return DANGER;
    if (action.includes('restore') || action.includes('unban') || action.includes('unsuspend')) return GREEN;
    if (action.includes('warn') || action.includes('mute') || action.includes('hide')) return WARN;
    if (action.includes('pin') || action.includes('feature') || action.includes('badge')) return ACCENT;
    return CYAN;
  };

  if (loading) return <div style={{ color: MUTED, textAlign: 'center', padding: 30 }}>Loading logs…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Chip label={`${logs.length} entries`} color={MUTED} />
        <Btn label="↻ Refresh" small onClick={load} />
      </div>
      {logs.length === 0 && <div style={{ color: MUTED, textAlign: 'center', padding: 30, fontSize: 13 }}>No audit logs yet.</div>}
      {logs.map((l: any, i) => (
        <div key={l.id} style={{ display: 'flex', gap: 10, paddingBottom: 10, marginBottom: 4, borderBottom: i < logs.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
          {/* timeline dot */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: actionColor(l.action), marginTop: 4, boxShadow: `0 0 6px ${actionColor(l.action)}` }} />
            {i < logs.length - 1 && <div style={{ width: 1, flex: 1, background: BORDER, marginTop: 4 }} />}
          </div>
          {/* content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
              <span style={{ color: actionColor(l.action), fontWeight: 700, fontSize: 11, letterSpacing: 0.5 }}>{l.action.toUpperCase()}</span>
              <span style={{ color: MUTED, fontSize: 10 }}>{fmt(l.created_at)}</span>
            </div>
            <div style={{ fontSize: 12, color: WHITE }}>
              by <span style={{ color: CYAN, fontWeight: 600 }}>{l.mod_name || l.mod_id}</span>
              {l.target_name && <> → <span style={{ color: WHITE }}>{l.target_name}</span></>}
            </div>
            {l.note && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{l.note}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Badges Tab ─────────────────────────────────────────────────────────
const BADGE_TYPES = ['owner', 'admin', 'moderator', 'contributor', 'verified'];
const BADGE_COLORS: Record<string, string> = {
  owner: ACCENT, admin: DANGER, moderator: PURPLE, contributor: CYAN, verified: GREEN,
};

function BadgesTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);

  const search = async () => {
    if (query.trim().length < 2) return;
    setLoading(true);
    try {
      const res = await emitWithAck<any, Res<any[]>>('admin:user_search', { query });
      if (res.ok) setResults(res.data);
    } finally { setLoading(false); }
  };

  const openProfile = async (playerId: string) => {
    const res = await emitWithAck<any, Res<any>>('admin:user_profile', { playerId });
    if (res.ok) setSelected(res.data);
  };

  const assignBadge = async (badge: string) => {
    if (!selected) return;
    setFeedback(''); setFeedbackError(false);
    const res = await emitWithAck<any, Res<any>>('community:badge_assign', { targetId: selected.id, badge });
    if (res.ok) { setFeedback(`Badge "${badge}" assigned.`); await openProfile(selected.id); }
    else { setFeedback(res.error ?? 'Error'); setFeedbackError(true); }
  };

  const revokeBadge = async (badge: string) => {
    if (!selected) return;
    setFeedback(''); setFeedbackError(false);
    const res = await emitWithAck<any, Res<any>>('community:badge_revoke', { targetId: selected.id, badge });
    if (res.ok) { setFeedback(`Badge "${badge}" revoked.`); await openProfile(selected.id); }
    else { setFeedback(res.error ?? 'Error'); setFeedbackError(true); }
  };

  return (
    <div>
      {feedback && <StatusBar text={feedback} isError={feedbackError} />}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Input value={query} onChange={setQuery} placeholder="Search player…" onEnter={search} />
        <Btn label={loading ? '…' : 'Search'} onClick={search} disabled={loading} />
      </div>

      {!selected && results.map(u => (
        <Row key={u.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: WHITE, fontWeight: 600 }}>{u.username}</div>
              <div style={{ color: MUTED, fontSize: 11 }}>#{u.friend_code || '—'}</div>
            </div>
            <Btn label="Select" small onClick={() => openProfile(u.id)} />
          </div>
        </Row>
      ))}

      {selected && (
        <div>
          <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: CYAN, cursor: 'pointer', fontSize: 13, marginBottom: 12, padding: 0, fontWeight: 600 }}>
            ← Back
          </button>
          <Row>
            <div style={{ color: WHITE, fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{selected.username}</div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>CURRENT BADGES</div>
              {(!selected.badges || selected.badges.length === 0) && <div style={{ color: MUTED, fontSize: 12 }}>No badges assigned.</div>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(selected.badges ?? []).map((b: any) => (
                  <div key={b.badge} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Chip label={b.badge} color={BADGE_COLORS[b.badge] ?? MUTED} />
                    <button onClick={() => revokeBadge(b.badge)} style={{ background: 'none', border: 'none', color: DANGER, cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          </Row>
          <Section title="Assign badge">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {BADGE_TYPES.map(b => (
                <Btn key={b} label={b} color={BADGE_COLORS[b] ?? ACCENT} small onClick={() => assignBadge(b)} />
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

// ── Main AdminPanel ────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: string; minLevel?: string }[] = [
  { id: 'users',    label: 'Users',    icon: '👥' },
  { id: 'reports',  label: 'Reports',  icon: '🚨' },
  { id: 'content',  label: 'Content',  icon: '📋' },
  { id: 'badges',   label: 'Badges',   icon: '🏅' },
  { id: 'audit',    label: 'Audit',    icon: '🔍', minLevel: 'admin' },
  { id: 'recovery', label: 'Recovery', icon: '🔄', minLevel: 'owner' },
];

const LEVEL_ORDER: Record<string, number> = { moderator: 1, senior_moderator: 2, admin: 3, owner: 4 };

const RANK_COLOR: Record<string, string> = {
  moderator: '#9b00ff', senior_moderator: '#c084fc', admin: '#ff9800', owner: '#ffc800',
};

export default function AdminPanel({ onClose, myModLevel }: AdminPanelProps) {
  const [tab, setTab] = useState<Tab>('users');
  const myLevel = LEVEL_ORDER[myModLevel] ?? 0;
  const visibleTabs = TABS.filter(t => !t.minLevel || myLevel >= (LEVEL_ORDER[t.minLevel] ?? 99));

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 220 }}
        style={{
          width: '100%', maxWidth: 600, height: '92vh',
          background: BG, borderRadius: '20px 20px 0 0',
          border: `1px solid ${BORDER}`, borderBottom: 'none',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 18px 0',
          background: `linear-gradient(180deg, ${BG3} 0%, ${BG} 100%)`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: MUTED }}>⚙ Admin Console</span>
              </div>
              <div style={{ marginTop: 4 }}>
                <Chip label={myModLevel.replace('_', ' ')} color={RANK_COLOR[myModLevel] ?? PURPLE} />
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`,
                borderRadius: '50%', width: 30, height: 30, color: MUTED,
                cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              ×
            </button>
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 0, overflowX: 'auto', paddingBottom: 0 }} className="scrollbar-none">
            {visibleTabs.map(t => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '8px 14px', background: 'none', border: 'none',
                    borderBottom: active ? `2px solid ${PURPLE}` : '2px solid transparent',
                    color: active ? WHITE : MUTED,
                    fontWeight: active ? 700 : 500,
                    fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                    transition: 'all 0.15s', letterSpacing: 0.3,
                  }}
                >
                  <span style={{ fontSize: 13 }}>{t.icon}</span>{t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 24px' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.14 }}
            >
              {tab === 'users'    && <UsersTab myModLevel={myModLevel} />}
              {tab === 'reports'  && <ReportsTab />}
              {tab === 'content'  && <ContentTab myModLevel={myModLevel} />}
              {tab === 'badges'   && <BadgesTab />}
              {tab === 'audit'    && <AuditTab />}
              {tab === 'recovery' && <RecoveryTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
