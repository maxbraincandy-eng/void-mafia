import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';

// ── Types ──────────────────────────────────────────────────────────────
interface Res<T> { ok: boolean; data: T; error?: string }
type Tab = 'users' | 'reports' | 'content' | 'recovery' | 'audit' | 'badges';

interface AdminPanelProps {
  onClose: () => void;
  myModLevel: string;
}

// ── Colour tokens ──────────────────────────────────────────────────────
const BG     = '#0d0d1a';
const BG2    = '#13132b';
const BORDER = 'rgba(255,255,255,0.08)';
const ACCENT = '#ffc800';
const PURPLE = '#9b00ff';
const DANGER = '#ff4060';
const GREEN  = '#00e676';
const MUTED  = 'rgba(255,255,255,0.4)';

// ── Helper ─────────────────────────────────────────────────────────────
function fmt(ts: number | null | undefined) {
  if (!ts) return '—';
  return new Date(Number(ts)).toLocaleString();
}
function fmtShort(ts: number | null | undefined) {
  if (!ts) return '—';
  return new Date(Number(ts)).toLocaleDateString();
}

// ── Sub-components ─────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 999,
      fontSize: 10, fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}55`,
    }}>
      {label}
    </span>
  );
}

function ActionBtn({ label, color = ACCENT, onClick, disabled }: {
  label: string; color?: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        background: `${color}18`, color, border: `1px solid ${color}44`, opacity: disabled ? 0.4 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px',
      marginBottom: 10, ...style,
    }}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ color: MUTED, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>{children}</span>;
}

// ── Users Tab ─────────────────────────────────────────────────────────
function UsersTab({ myModLevel }: { myModLevel: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');

  const search = async () => {
    if (query.trim().length < 2) return;
    setLoading(true);
    try {
      const res = await emitWithAck<any, Res<any[]>>('admin:user_search', { query });
      if (res.ok) setResults(res.data);
      else setFeedback(res.error ?? 'Error');
    } finally { setLoading(false); }
  };

  const openProfile = async (playerId: string) => {
    setProfileLoading(true);
    setSelected(null);
    try {
      const res = await emitWithAck<any, Res<any>>('admin:user_profile', { playerId });
      if (res.ok) setSelected(res.data);
      else setFeedback(res.error ?? 'Error');
    } finally { setProfileLoading(false); }
  };

  const doAction = async (action: string, extra?: any) => {
    if (!selected) return;
    setFeedback('');
    try {
      const res = await emitWithAck<any, Res<any>>('admin:user_action', {
        action, playerId: selected.id, reason, ...extra,
      });
      if (res.ok) {
        setFeedback(`Action "${action}" applied.`);
        await openProfile(selected.id);
        setReason('');
      } else {
        setFeedback(res.error ?? 'Error');
      }
    } catch (e: any) { setFeedback(e.message); }
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', paddingBottom: 24 }}>
      {/* Search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Search by name, friend code, or id…"
          style={{
            flex: 1, background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
            padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none',
          }}
        />
        <ActionBtn label={loading ? '…' : 'Search'} onClick={search} disabled={loading} />
      </div>

      {feedback && <div style={{ color: feedback.startsWith('Action') ? GREEN : DANGER, fontSize: 12, marginBottom: 10 }}>{feedback}</div>}

      {/* Results list */}
      {!selected && results.map(u => (
        <Card key={u.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{u.username}</span>
              {u.moderator_level && <span style={{ marginLeft: 6 }}><Badge label={u.moderator_level} color={ACCENT} /></span>}
              <div style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>
                {u.friend_code && <span style={{ marginRight: 10 }}>#{u.friend_code}</span>}
                <span style={{ fontSize: 10 }}>{u.id}</span>
              </div>
            </div>
            <ActionBtn label="View" onClick={() => openProfile(u.id)} />
          </div>
        </Card>
      ))}

      {/* Profile view */}
      {profileLoading && <div style={{ color: MUTED, textAlign: 'center', padding: 20 }}>Loading profile…</div>}

      {selected && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 18 }}>←</button>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{selected.username}</span>
            {selected.moderator_level && <Badge label={selected.moderator_level} color={ACCENT} />}
          </div>

          {/* Stats */}
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
              <div><Label>Friend code</Label><br /><span style={{ color: '#fff' }}>#{selected.friend_code || '—'}</span></div>
              <div><Label>ID</Label><br /><span style={{ color: '#fff', fontSize: 10 }}>{selected.id}</span></div>
              <div><Label>Joined</Label><br /><span style={{ color: '#fff' }}>{fmtShort(selected.joined_at)}</span></div>
              <div><Label>Last seen</Label><br /><span style={{ color: '#fff' }}>{fmtShort(selected.last_seen_at)}</span></div>
              <div><Label>Posts</Label><br /><span style={{ color: '#fff' }}>{selected.post_count ?? 0}</span></div>
              <div><Label>Comments</Label><br /><span style={{ color: '#fff' }}>{selected.comment_count ?? 0}</span></div>
            </div>
          </Card>

          {/* Status badges */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {selected.ban && <Badge label="BANNED" color={DANGER} />}
            {selected.suspension && <Badge label="SUSPENDED" color={DANGER} />}
            {selected.mute && <Badge label="MUTED" color="#ff9800" />}
            {selected.profile_locked ? <Badge label="PROFILE LOCKED" color="#9b59b6" /> : null}
            {selected.force_public ? <Badge label="FORCE PUBLIC" color="#3498db" /> : null}
          </div>

          {/* Warnings */}
          {selected.warnings?.length > 0 && (
            <Card>
              <Label>Warnings ({selected.warnings.length})</Label>
              {selected.warnings.slice(0, 5).map((w: any) => (
                <div key={w.id} style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 6, marginTop: 6, fontSize: 12 }}>
                  <span style={{ color: MUTED }}>{fmtShort(w.issued_at)}</span>
                  <span style={{ marginLeft: 8, color: '#fff' }}>{w.reason || '(no reason)'}</span>
                  <span style={{ marginLeft: 8, color: MUTED }}>by {w.issued_by_name}</span>
                </div>
              ))}
            </Card>
          )}

          {/* Badges */}
          {selected.badges?.length > 0 && (
            <Card>
              <Label>Badges</Label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {selected.badges.map((b: any) => <Badge key={b.badge} label={b.badge} color={ACCENT} />)}
              </div>
            </Card>
          )}

          {/* Reason input */}
          <div style={{ marginBottom: 10 }}>
            <Label>Reason (for actions below)</Label>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Optional reason…"
              style={{
                width: '100%', marginTop: 4, background: BG, border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: '7px 10px', color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <ActionBtn label="Warn" color={ACCENT} onClick={() => doAction('warn')} />
            <ActionBtn label="Mute 1h" color="#ff9800" onClick={() => doAction('mute', { duration: 3600 })} />
            <ActionBtn label="Mute 24h" color="#ff9800" onClick={() => doAction('mute', { duration: 86400 })} />
            <ActionBtn label="Mute 7d" color="#ff9800" onClick={() => doAction('mute', { duration: 604800 })} />
            {selected.mute && <ActionBtn label="Unmute" color={GREEN} onClick={() => doAction('unmute')} />}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <ActionBtn label="Suspend 1d" color={DANGER} onClick={() => doAction('suspend', { duration: 86400 })} />
            <ActionBtn label="Suspend 3d" color={DANGER} onClick={() => doAction('suspend', { duration: 259200 })} />
            <ActionBtn label="Suspend 7d" color={DANGER} onClick={() => doAction('suspend', { duration: 604800 })} />
            <ActionBtn label="Suspend 30d" color={DANGER} onClick={() => doAction('suspend', { duration: 2592000 })} />
            <ActionBtn label="Suspend Perm" color={DANGER} onClick={() => doAction('suspend', { duration: 0 })} />
            {selected.suspension && <ActionBtn label="Unsuspend" color={GREEN} onClick={() => doAction('unsuspend')} />}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <ActionBtn label="Community Ban" color={DANGER} onClick={() => doAction('ban')} />
            {selected.ban && <ActionBtn label="Community Unban" color={GREEN} onClick={() => doAction('unban')} />}
          </div>

          {/* Profile controls (admin/owner only) */}
          {(myModLevel === 'admin' || myModLevel === 'owner') && (
            <Card>
              <Label>Profile Controls</Label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <ActionBtn
                  label={selected.profile_locked ? 'Unlock Profile' : 'Lock Profile'}
                  color="#9b59b6"
                  onClick={() => doAction('profile_controls', { profileLocked: !selected.profile_locked })}
                />
                <ActionBtn
                  label={selected.secret_mode_disabled ? 'Re-enable Secret Mode' : 'Disable Secret Mode'}
                  color="#3498db"
                  onClick={() => doAction('profile_controls', { secretModeDisabled: !selected.secret_mode_disabled })}
                />
                <ActionBtn
                  label={selected.force_public ? 'Remove Force Public' : 'Force Public Profile'}
                  color="#3498db"
                  onClick={() => doAction('profile_controls', { forcePublic: !selected.force_public })}
                />
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ── Reports Tab ───────────────────────────────────────────────────────
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
    } else {
      setFeedback(res.error ?? 'Error');
    }
  };

  if (loading) return <div style={{ color: MUTED, textAlign: 'center', padding: 20 }}>Loading reports…</div>;

  return (
    <div style={{ overflowY: 'auto', paddingBottom: 24 }}>
      {feedback && <div style={{ color: GREEN, fontSize: 12, marginBottom: 10 }}>{feedback}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: MUTED, fontSize: 12 }}>{reports.length} reports</span>
        <ActionBtn label="Refresh" onClick={load} />
      </div>
      {reports.length === 0 && <div style={{ color: MUTED, textAlign: 'center', padding: 20 }}>No reports found.</div>}
      {reports.map(r => (
        <Card key={r.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                <Badge
                  label={r.status}
                  color={r.status === 'pending' ? '#ff9800' : r.status === 'resolved' ? GREEN : MUTED}
                />
                <Badge label={r.target_type || 'post'} color={PURPLE} />
              </div>
              <div style={{ fontSize: 12, color: '#fff', marginBottom: 2 }}>
                <strong>Reporter:</strong> <span style={{ color: MUTED }}>{r.reporter_name || r.reporter_id}</span>
              </div>
              {r.target_name && (
                <div style={{ fontSize: 12, color: '#fff', marginBottom: 2 }}>
                  <strong>Target:</strong> <span style={{ color: MUTED }}>{r.target_name}</span>
                </div>
              )}
              <div style={{ fontSize: 12, color: '#fff', marginBottom: 2 }}>
                <strong>Reason:</strong> <span style={{ color: MUTED }}>{r.reason}</span>
              </div>
              {r.post_content && (
                <div style={{
                  fontSize: 11, color: MUTED, background: BG, borderRadius: 6, padding: '5px 8px',
                  marginTop: 6, maxHeight: 60, overflow: 'hidden',
                }}>
                  {r.post_content.slice(0, 200)}
                </div>
              )}
              <div style={{ color: MUTED, fontSize: 10, marginTop: 4 }}>{fmt(r.created_at)}</div>
            </div>
            {r.status === 'pending' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                <ActionBtn label="Resolve" color={GREEN} onClick={() => resolve(r.id, 'resolved')} />
                <ActionBtn label="Dismiss" color={MUTED} onClick={() => resolve(r.id, 'dismissed')} />
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Content Tab ────────────────────────────────────────────────────────
function ContentTab({ myModLevel }: { myModLevel: string }) {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await emitWithAck<any, Res<any>>('community:feed_v2', { limit: 30, offset: 0 });
      if (res.ok) setPosts((res.data as any)?.posts ?? res.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const postAction = async (postId: string, action: string) => {
    setFeedback('');
    const res = await emitWithAck<any, Res<any>>('admin:post_action', { postId, action });
    if (res.ok) {
      setFeedback(`Post ${action} done.`);
      if (action === 'delete') setPosts(p => p.filter(x => x.id !== postId));
    } else {
      setFeedback(res.error ?? 'Error');
    }
  };

  if (loading) return <div style={{ color: MUTED, textAlign: 'center', padding: 20 }}>Loading content…</div>;

  return (
    <div style={{ overflowY: 'auto', paddingBottom: 24 }}>
      {feedback && <div style={{ color: feedback.includes('Error') || feedback.includes('Only') ? DANGER : GREEN, fontSize: 12, marginBottom: 10 }}>{feedback}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: MUTED, fontSize: 12 }}>{posts.length} recent posts</span>
        <ActionBtn label="Refresh" onClick={load} />
      </div>
      {posts.length === 0 && <div style={{ color: MUTED, textAlign: 'center', padding: 20 }}>No posts found.</div>}
      {posts.map((p: any) => (
        <Card key={p.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                {p.isPinned && <Badge label="pinned" color={ACCENT} />}
                {p.isFeatured && <Badge label="featured" color={PURPLE} />}
                {p.hidden && <Badge label="hidden" color={MUTED} />}
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 3 }}>
                {p.authorName || p.author_id} · {fmtShort(p.createdAt || p.created_at)}
              </div>
              <div style={{ fontSize: 13, color: '#fff', overflow: 'hidden', maxHeight: 50, lineHeight: 1.4 }}>
                {(p.content || '').slice(0, 180)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
              <ActionBtn label="Delete" color={DANGER} onClick={() => postAction(p.id, 'delete')} />
              {!p.isPinned
                ? <ActionBtn label="Pin" color={ACCENT} onClick={() => postAction(p.id, 'pin')} />
                : <ActionBtn label="Unpin" color={MUTED} onClick={() => postAction(p.id, 'unpin')} />}
              {!p.isFeatured
                ? <ActionBtn label="Feature" color={PURPLE} onClick={() => postAction(p.id, 'feature')} />
                : <ActionBtn label="Unfeature" color={MUTED} onClick={() => postAction(p.id, 'unfeature')} />}
              {!p.hidden && <ActionBtn label="Hide" color={MUTED} onClick={() => postAction(p.id, 'hide')} />}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Recovery Tab (owner only) ──────────────────────────────────────────
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
    const action = contentType === 'posts' ? 'restore' : contentType === 'debates' ? 'restore' : 'restore';
    const event = contentType === 'posts' ? 'admin:post_action' : contentType === 'comments' ? 'admin:comment_action' : 'admin:debate_action';
    const key = contentType === 'posts' ? 'postId' : contentType === 'comments' ? 'commentId' : 'debateId';
    const res = await emitWithAck<any, Res<any>>(event, { action, [key]: id });
    if (res.ok) {
      setFeedback('Restored.');
      setItems(it => it.filter(x => x.id !== id));
    } else {
      setFeedback(res.error ?? 'Error');
    }
  };

  return (
    <div style={{ overflowY: 'auto', paddingBottom: 24 }}>
      {/* Type selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['posts', 'comments', 'debates'] as const).map(t => (
          <button
            key={t}
            onClick={() => setContentType(t)}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
              background: contentType === t ? `${ACCENT}22` : BG2,
              border: `1px solid ${contentType === t ? ACCENT : BORDER}`,
              color: contentType === t ? ACCENT : MUTED,
              fontWeight: 600,
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {feedback && <div style={{ color: GREEN, fontSize: 12, marginBottom: 10 }}>{feedback}</div>}
      {loading && <div style={{ color: MUTED, textAlign: 'center', padding: 20 }}>Loading…</div>}
      {!loading && items.length === 0 && <div style={{ color: MUTED, textAlign: 'center', padding: 20 }}>Nothing deleted.</div>}
      {items.map((item: any) => (
        <Card key={item.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 3 }}>
                {item.author_name || item.creator_name || item.author_id} · Deleted {fmt(item.deleted_at)} by {item.deleted_by_name || '?'}
              </div>
              <div style={{ fontSize: 13, color: '#fff', overflow: 'hidden', maxHeight: 50 }}>
                {(item.content || item.topic || '(no content)').slice(0, 180)}
              </div>
            </div>
            <ActionBtn label="Restore" color={GREEN} onClick={() => restore(item.id)} />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Audit Logs Tab ─────────────────────────────────────────────────────
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

  if (loading) return <div style={{ color: MUTED, textAlign: 'center', padding: 20 }}>Loading logs…</div>;

  return (
    <div style={{ overflowY: 'auto', paddingBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: MUTED, fontSize: 12 }}>{logs.length} entries</span>
        <ActionBtn label="Refresh" onClick={load} />
      </div>
      {logs.length === 0 && <div style={{ color: MUTED, textAlign: 'center', padding: 20 }}>No logs yet.</div>}
      {logs.map((l: any) => (
        <Card key={l.id} style={{ padding: '8px 12px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12 }}>
            <span style={{ color: MUTED, whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtShort(l.created_at)}</span>
            <span style={{ color: ACCENT, fontWeight: 700, flexShrink: 0 }}>{l.action}</span>
            <span style={{ color: '#fff' }}>
              by <strong>{l.mod_name || l.mod_id}</strong>
              {l.target_name && <> → <strong>{l.target_name}</strong></>}
              {l.note && <span style={{ color: MUTED }}> · {l.note}</span>}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Badges Tab ─────────────────────────────────────────────────────────
const BADGE_TYPES = ['owner', 'admin', 'moderator', 'contributor', 'verified'];

function BadgesTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [feedback, setFeedback] = useState('');

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
    const res = await emitWithAck<any, Res<any>>('community:badge_assign', { targetId: selected.id, badge });
    if (res.ok) {
      setFeedback(`Badge "${badge}" assigned.`);
      await openProfile(selected.id);
    } else {
      setFeedback(res.error ?? 'Error');
    }
  };

  const revokeBadge = async (badge: string) => {
    if (!selected) return;
    const res = await emitWithAck<any, Res<any>>('community:badge_revoke', { targetId: selected.id, badge });
    if (res.ok) {
      setFeedback(`Badge "${badge}" revoked.`);
      await openProfile(selected.id);
    } else {
      setFeedback(res.error ?? 'Error');
    }
  };

  return (
    <div style={{ overflowY: 'auto', paddingBottom: 24 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Search user…"
          style={{
            flex: 1, background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
            padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none',
          }}
        />
        <ActionBtn label={loading ? '…' : 'Search'} onClick={search} disabled={loading} />
      </div>

      {feedback && <div style={{ color: feedback.includes('Error') ? DANGER : GREEN, fontSize: 12, marginBottom: 10 }}>{feedback}</div>}

      {!selected && results.map(u => (
        <Card key={u.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#fff', fontWeight: 600 }}>{u.username}</span>
            <ActionBtn label="Select" onClick={() => openProfile(u.id)} />
          </div>
        </Card>
      ))}

      {selected && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 18 }}>←</button>
            <span style={{ color: '#fff', fontWeight: 700 }}>{selected.username}</span>
          </div>

          {/* Current badges */}
          <Card>
            <Label>Current badges</Label>
            {(!selected.badges || selected.badges.length === 0) && (
              <div style={{ color: MUTED, fontSize: 12, marginTop: 6 }}>No badges.</div>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {(selected.badges ?? []).map((b: any) => (
                <div key={b.badge} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Badge label={b.badge} color={ACCENT} />
                  <button
                    onClick={() => revokeBadge(b.badge)}
                    style={{ background: 'none', border: 'none', color: DANGER, cursor: 'pointer', fontSize: 12, padding: '0 2px' }}
                    title="Revoke"
                  >×</button>
                </div>
              ))}
            </div>
          </Card>

          {/* Assign badge */}
          <Card>
            <Label>Assign badge</Label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {BADGE_TYPES.map(b => (
                <ActionBtn key={b} label={b} color={ACCENT} onClick={() => assignBadge(b)} />
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Main AdminPanel ────────────────────────────────────────────────────
export default function AdminPanel({ onClose, myModLevel }: AdminPanelProps) {
  const [tab, setTab] = useState<Tab>('users');

  const TABS: { id: Tab; label: string; minLevel?: string }[] = [
    { id: 'users',    label: 'Users' },
    { id: 'reports',  label: 'Reports' },
    { id: 'content',  label: 'Content' },
    { id: 'badges',   label: 'Badges' },
    { id: 'audit',    label: 'Audit', minLevel: 'admin' },
    { id: 'recovery', label: 'Recovery', minLevel: 'owner' },
  ];

  const levelOrder: Record<string, number> = {
    moderator: 1, senior_moderator: 2, admin: 3, owner: 4,
  };
  const myLevel = levelOrder[myModLevel] ?? 0;

  const visibleTabs = TABS.filter(t => {
    if (!t.minLevel) return true;
    return myLevel >= (levelOrder[t.minLevel] ?? 99);
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 200 }}
        style={{
          width: '100%', maxWidth: 600, height: '90vh',
          background: BG, borderRadius: '20px 20px 0 0',
          border: `1px solid ${BORDER}`, borderBottom: 'none',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px 12px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 700 }}>Admin Panel</h2>
            <div style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>
              <Badge label={myModLevel} color={myModLevel === 'owner' ? ACCENT : PURPLE} />
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`,
              borderRadius: '50%', width: 32, height: 32, color: '#fff',
              cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex', gap: 4, padding: '10px 16px', borderBottom: `1px solid ${BORDER}`,
          overflowX: 'auto', flexShrink: 0,
        }}>
          {visibleTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                background: tab === t.id ? `${ACCENT}22` : 'transparent',
                border: `1px solid ${tab === t.id ? ACCENT : BORDER}`,
                color: tab === t.id ? ACCENT : MUTED,
                fontWeight: 600,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.12 }}
              style={{ height: '100%' }}
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
    </motion.div>
  );
}
