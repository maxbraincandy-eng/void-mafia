import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { emitWithAck, socket } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import type { Res } from '@/types/index';

export interface StoryItem { id: string; imageUrl: string; caption: string; createdAt: number; viewCount?: number; }
export interface StoryGroup {
  authorId: string; username: string; avatar: string; avatarUrl: string | null;
  publicId: number | null; stories: StoryItem[];
}
export interface StoryViewerRow {
  id: string; username: string; avatar: string; avatarUrl: string | null;
  publicId: number | null; viewedAt: number; reaction?: string | null;
}

// Must match STORY_REACTIONS on the server.
const STORY_EMOJIS = ['🤍', '🔥', '👍', '⭐', '🤯', '😂'] as const;
type StoryReactionData = { reactions: Record<string, number>; myReaction: string | null };

const SEEN_KEY = 'vm_seen_stories';
function loadSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')); } catch { return new Set(); }
}
function saveSeen(s: Set<string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-500))); } catch { /* ignore */ }
}

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return 'ახლა';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}წთ`;
  return `${Math.floor(d / 3_600_000)}სთ`;
}

// Resize an image file to a story-sized JPEG data URL, guaranteed under the
// server's ~680KB cap (steps quality down for busy photos).
function resizeStoryImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const maxDim = 720;
        let w = img.width, h = img.height;
        if (!w || !h) { reject(new Error('Invalid image.')); return; }
        if (w > h) { if (w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; } }
        else { if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; } }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d')!.drawImage(img, 0, 0, w, h);
        let q = 0.8;
        let data = c.toDataURL('image/jpeg', q);
        while (data.length > 600_000 && q > 0.4) { q -= 0.1; data = c.toDataURL('image/jpeg', q); }
        if (!data || data.length < 200) { reject(new Error('Cannot process image.')); return; }
        resolve(data);
      } catch { reject(new Error('Cannot process image.')); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Cannot read image.')); };
    img.src = url;
  });
}

function Avatar({ avatar, avatarUrl, size }: { avatar: string; avatarUrl: string | null; size: number }) {
  return avatarUrl
    ? <img src={avatarUrl} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
    : <div className="flex items-center justify-center rounded-full text-white/80" style={{ width: size, height: size, fontSize: size * 0.5, background: 'linear-gradient(135deg,rgba(255,0,128,.5),rgba(138,43,226,.5))' }}>{avatar}</div>;
}

// ── Story viewer (full-screen, Instagram-style) ───────────────────────
function StoryViewer({ groups, startIndex, onClose, onOpenProfile, myId, onDeleted, markSeen }: {
  groups: StoryGroup[]; startIndex: number; onClose: () => void;
  onOpenProfile: (id: string) => void; myId: string | undefined;
  onDeleted: () => void; markSeen: (id: string) => void;
}) {
  const [gi, setGi] = useState(startIndex);
  const [si, setSi] = useState(0);
  const [tick, setTick] = useState(0); // remount progress bar on advance
  const [paused, setPaused] = useState(false); // press & hold (Instagram-style)
  // Viewers sheet (own stories only): swipe up to reveal who viewed.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewers, setViewers] = useState<StoryViewerRow[] | null>(null);
  const [viewersBusy, setViewersBusy] = useState(false);
  // Reactions on the current story.
  const [reactions, setReactions] = useState<Record<string, number>>({});
  const [myReaction, setMyReaction] = useState<string | null>(null);
  // Touch tracking for swipe up (open viewers) / swipe down (close) / hold-to-pause.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false); // swallow the tap that ends a hold

  const group = groups[gi];
  const story = group?.stories[si];
  const isMine = group?.authorId === myId;

  const advance = useCallback(() => {
    setSi(prevSi => {
      const g = groups[gi];
      if (g && prevSi < g.stories.length - 1) { setTick(t => t + 1); return prevSi + 1; }
      // next group
      if (gi < groups.length - 1) { setGi(gi + 1); setTick(t => t + 1); return 0; }
      onClose();
      return prevSi;
    });
  }, [gi, groups, onClose]);

  const back = useCallback(() => {
    if (si > 0) { setSi(si - 1); setTick(t => t + 1); }
    else if (gi > 0) { const pg = groups[gi - 1]; setGi(gi - 1); setSi(Math.max(0, pg.stories.length - 1)); setTick(t => t + 1); }
  }, [si, gi, groups]);

  // Close the viewers sheet and resume the story.
  const closeSheet = useCallback(() => { setSheetOpen(false); setTick(t => t + 1); }, []);

  // Open the viewers sheet for the current (own) story.
  const openSheet = useCallback(() => {
    if (!isMine || !story) return;
    setSheetOpen(true);
    setViewers(null); setViewersBusy(true);
    emitWithAck<{ storyId: string }, Res<StoryViewerRow[]>>('community:story_viewers', { storyId: story.id })
      .then(r => { setViewers((r as any).ok ? (r as any).data : []); })
      .catch(() => setViewers([]))
      .finally(() => setViewersBusy(false));
  }, [isMine, story]);

  // Mark seen + record the view (others' stories only). Auto-advance is driven
  // by the progress bar's animationend, so press-and-hold pausing the animation
  // (animationPlayState) pauses advancing too — no JS/CSS desync.
  useEffect(() => {
    if (!story) return;
    setPaused(false); // a fresh story is never paused
    markSeen(story.id);
    if (!isMine) {
      emitWithAck('community:story_view', { storyId: story.id }).catch(() => {});
    }
  }, [story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load reactions for the current story + live-update on others' reactions.
  useEffect(() => {
    if (!story) return;
    const sid = story.id;
    setReactions({}); setMyReaction(null);
    emitWithAck<{ storyId: string }, Res<StoryReactionData>>('community:story_reactions', { storyId: sid })
      .then(r => { if ((r as any).ok) { setReactions((r as any).data.reactions ?? {}); setMyReaction((r as any).data.myReaction ?? null); } })
      .catch(() => {});
    const onReacted = (d: { storyId: string; reactions: Record<string, number> }) => {
      if (d.storyId === sid) setReactions(d.reactions ?? {});
    };
    socket.on('community:story_reacted', onReacted);
    return () => { socket.off('community:story_reacted', onReacted); };
  }, [story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const react = (emoji: string) => {
    if (!story) return;
    setMyReaction(prev => (prev === emoji ? null : emoji)); // optimistic
    emitWithAck<{ storyId: string; reaction: string }, Res<StoryReactionData>>('community:story_react', { storyId: story.id, reaction: emoji })
      .then(r => { if ((r as any).ok) { setReactions((r as any).data.reactions ?? {}); setMyReaction((r as any).data.myReaction ?? null); } })
      .catch(() => {});
  };

  if (!group || !story) return null;

  const handleDelete = async () => {
    try { await emitWithAck('community:story_delete', { id: story.id }); } catch { /* ignore */ }
    onDeleted();
    onClose();
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY };
    suppressClick.current = false;
    if (sheetOpen) return;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => setPaused(true), 200); // press & hold → pause
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const start = touch.current; if (!start) return;
    const t = e.touches[0];
    // A real drag (swipe/scroll) is not a hold — cancel the pending pause.
    if (Math.abs(t.clientX - start.x) > 10 || Math.abs(t.clientY - start.y) > 10) {
      if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current; touch.current = null;
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (paused) { setPaused(false); suppressClick.current = true; } // release hold → resume, swallow the tap
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x, dy = t.clientY - start.y;
    if (Math.abs(dy) < 60 || Math.abs(dx) > Math.abs(dy)) return; // not a vertical swipe
    if (dy > 0) { onClose(); }              // swipe down → close (all users)
    else if (isMine) { openSheet(); }       // swipe up → viewers (own story)
  };

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 1400, background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Progress bars */}
      <div style={{ display: 'flex', gap: 4, padding: '10px 12px 6px' }}>
        {group.stories.map((s, idx) => {
          const active = idx === si && !sheetOpen;
          return (
            <div key={s.id} style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
              <div onAnimationEnd={active ? advance : undefined} style={{
                height: '100%', borderRadius: 2, background: '#fff',
                width: idx < si ? '100%' : idx === si ? '100%' : '0%',
                animation: active ? `vm-story-progress 5s linear forwards` : undefined,
                animationPlayState: active && paused ? 'paused' : 'running',
              }} />
            </div>
          );
        })}
      </div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 14px 10px' }}>
        {sheetOpen ? (
          <button onClick={closeSheet} style={{ fontSize: 20, color: '#fff', lineHeight: 1 }} aria-label="back">‹ უკან</button>
        ) : (
          <button onClick={() => { onOpenProfile(group.authorId); onClose(); }} className="flex items-center gap-2">
            <Avatar avatar={group.avatar} avatarUrl={group.avatarUrl} size={32} />
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#fff', fontWeight: 600 }}>{group.username}</span>
          </button>
        )}
        {!sheetOpen && <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{timeAgo(story.createdAt)}</span>}
        <div style={{ flex: 1 }} />
        {isMine && !sheetOpen && (
          <button onClick={handleDelete} style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)' }} title="წაშლა">🗑</button>
        )}
        <button onClick={onClose} style={{ fontSize: 20, color: 'rgba(255,255,255,0.85)', lineHeight: 1 }}>✕</button>
      </div>
      {/* Image + tap zones (image half-collapses when the viewers sheet is open) */}
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', transition: 'flex-basis .25s ease, height .25s ease', flex: sheetOpen ? '0 0 42%' : 1 }}>
        <img key={story.id} src={story.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        {!sheetOpen && <button onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } back(); }} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '32%', background: 'transparent', border: 'none' }} aria-label="prev" />}
        {!sheetOpen && <button onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } advance(); }} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '40%', background: 'transparent', border: 'none' }} aria-label="next" />}
        {story.caption && !sheetOpen && (
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: 24, textAlign: 'center', fontFamily: 'monospace', fontSize: 14, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.9)', background: 'rgba(0,0,0,0.35)', padding: '8px 12px', borderRadius: 12, backdropFilter: 'blur(4px)' }}>
            {story.caption}
          </div>
        )}
      </div>
      {/* Footer: viewers eye (own stories) — tap or swipe up to expand */}
      {isMine && !sheetOpen && (
        <button onClick={openSheet} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 14px 16px', color: 'rgba(255,255,255,0.85)', background: 'transparent', border: 'none' }}>
          <span style={{ fontSize: 16 }}>👁</span>
          <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{story.viewCount ?? 0}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>▲ ვინ ნახა</span>
        </button>
      )}
      {/* Footer: reaction bar (others' stories) — tap an emoji to react */}
      {!isMine && !sheetOpen && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 8px 16px' }}>
          {STORY_EMOJIS.map(e => {
            const cnt = reactions[e] ?? 0;
            const active = myReaction === e;
            return (
              <button key={e} onClick={() => react(e)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 42, padding: '6px 4px', borderRadius: 12,
                  background: active ? 'rgba(155,0,255,0.28)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${active ? 'rgba(155,0,255,0.6)' : 'rgba(255,255,255,0.1)'}`,
                  transform: active ? 'scale(1.06)' : 'none', transition: 'all .12s',
                }}>
                <span style={{ fontSize: 20, lineHeight: 1 }}>{e}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: cnt > 0 ? 'rgba(255,255,255,0.75)' : 'transparent', minHeight: 12 }}>{cnt > 0 ? cnt : '·'}</span>
              </button>
            );
          })}
        </div>
      )}
      {/* Viewers half-sheet */}
      {sheetOpen && (
        <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(8,4,22,0.98)', borderTop: '1px solid rgba(155,0,255,.25)', padding: '14px 16px 24px' }}>
          <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 13, color: '#fff', marginBottom: 12 }}>
            👁 ნახა {viewers ? viewers.length : ''}
          </p>
          {viewersBusy && <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>…</p>}
          {!viewersBusy && viewers && viewers.length === 0 && (
            <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>ჯერ არავის უნახავს</p>
          )}
          {!viewersBusy && viewers && viewers.map(v => (
            <button key={v.id} onClick={() => { onOpenProfile(v.id); onClose(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 4px', background: 'transparent', border: 'none' }}>
              <Avatar avatar={v.avatar} avatarUrl={v.avatarUrl} size={36} />
              <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#fff' }}>{v.username}</span>
              {v.reaction && <span style={{ fontSize: 15, lineHeight: 1 }}>{v.reaction}</span>}
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{timeAgo(v.viewedAt)}</span>
            </button>
          ))}
        </div>
      )}
    </motion.div>,
    document.body
  );
}

// ── Composer ──────────────────────────────────────────────────────────
// `image` is already selected+resized by the strip (file picking happens in
// the strip's direct tap so iOS reliably opens the picker). The composer just
// previews, captions, and posts — with a "change photo" picker as a fallback.
function StoryComposer({ image, onClose, onPosted }: { image: string; onClose: () => void; onPosted: () => void }) {
  const [img, setImg] = useState<string | null>(image);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return; // cancelled — keep current image
    setErr('');
    try { setImg(await resizeStoryImage(f)); } catch { setErr('სურათი ვერ ჩაიტვირთა'); }
  };

  const post = async () => {
    if (!img || busy) return;
    setBusy(true); setErr('');
    try {
      const res = await emitWithAck<{ imageUrl: string; caption: string }, Res<StoryItem>>('community:story_create', { imageUrl: img, caption });
      if ((res as any).ok) { onPosted(); onClose(); }
      else setErr((res as any).error ?? 'ვერ გაიზიარა');
    } catch { setErr('კავშირის შეცდომა'); }
    finally { setBusy(false); }
  };

  return createPortal(
    <div onClick={() => !busy && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(380px,100%)', background: 'rgba(8,4,22,.99)', border: '1px solid rgba(155,0,255,.3)', borderRadius: 20, padding: 16 }}>
        <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 15, color: '#fff', marginBottom: 10, textAlign: 'center' }}>📖 ახალი Story</p>
        {img ? (
          <img src={img} alt="" style={{ width: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 12, background: '#000' }} />
        ) : (
          <button onClick={() => fileRef.current?.click()} style={{ width: '100%', padding: '40px', borderRadius: 12, border: '1px dashed rgba(255,255,255,.2)', color: 'rgba(255,255,255,.5)', fontFamily: 'monospace', fontSize: 13, background: 'rgba(255,255,255,.02)' }}>+ აირჩიე სურათი</button>
        )}
        {err && <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#ff2d55', textAlign: 'center', marginTop: 8 }}>{err}</p>}
        {img && (
          <input value={caption} onChange={e => setCaption(e.target.value)} maxLength={200} placeholder="წარწერა (არჩევითი)…"
            style={{ width: '100%', marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: '#fff', fontFamily: 'monospace', fontSize: 13, outline: 'none' }} />
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={onClose} disabled={busy} style={{ flex: 1, padding: '11px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)', color: 'rgba(255,255,255,.6)' }}>გაუქმება</button>
          <button onClick={post} disabled={!img || busy} style={{ flex: 2, padding: '11px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, fontWeight: 700, background: 'rgba(155,0,255,.18)', border: '1px solid rgba(155,0,255,.45)', color: '#c084fc', opacity: img ? 1 : 0.4 }}>{busy ? '…' : '📢 გაზიარება (24სთ)'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Strip ─────────────────────────────────────────────────────────────
export function StoriesStrip({ onOpenProfile }: { onOpenProfile: (id: string) => void }) {
  const profile = useAuthStore(s => s.profile);
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [viewer, setViewer] = useState<number | null>(null);
  const [composerImg, setComposerImg] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() => loadSeen());
  const [storyNotif, setStoryNotif] = useState(false); // red dot: someone reacted to my story
  const fileRef = useRef<HTMLInputElement>(null);

  // File picking happens here, inside the direct tap on "+ შენი Story", so iOS
  // Safari reliably opens the picker (a deferred .click() would be blocked).
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!f) return;
    setPicking(true);
    try { setComposerImg(await resizeStoryImage(f)); }
    catch { /* ignore — bad image */ }
    finally { setPicking(false); }
  };

  const fetchStories = useCallback(() => {
    emitWithAck<undefined, Res<StoryGroup[]>>('community:stories_list')
      .then(r => { if ((r as any).ok) setGroups((r as any).data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStories();
    const onReady = () => fetchStories();
    window.addEventListener('vm:auth-ready', onReady);
    return () => window.removeEventListener('vm:auth-ready', onReady);
  }, [fetchStories]);

  // Red-dot state: unread story-reaction notifications for my own story.
  useEffect(() => {
    const refresh = () => emitWithAck<undefined, Res<number>>('community:story_notif_unread')
      .then(r => { if ((r as any).ok) setStoryNotif((r as any).data > 0); })
      .catch(() => {});
    refresh();
    const onNotif = () => setStoryNotif(true);              // live push when someone reacts
    const onReady = () => refresh();
    socket.on('community:story_notif', onNotif);
    window.addEventListener('vm:auth-ready', onReady);
    return () => { socket.off('community:story_notif', onNotif); window.removeEventListener('vm:auth-ready', onReady); };
  }, []);

  // Opening my own story (or its reaction/viewer list) clears the dot.
  const openStory = (i: number) => {
    setViewer(i);
    if (groups[i]?.authorId === profile?.id && storyNotif) {
      setStoryNotif(false);
      emitWithAck('community:story_notif_read').catch(() => {});
    }
  };

  const markSeen = useCallback((id: string) => {
    setSeen(prev => { if (prev.has(id)) return prev; const n = new Set(prev); n.add(id); saveSeen(n); return n; });
  }, []);

  const groupSeen = (g: StoryGroup) => g.stories.every(s => seen.has(s.id));

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
      {/* Add own story — file picker fires inside this direct tap */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
      <button onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ width: 60 }}>
        <div style={{ position: 'relative', width: 56, height: 56, borderRadius: '50%', padding: 2, border: '1.5px dashed rgba(255,255,255,0.18)' }}>
          {profile && <Avatar avatar={profile.avatar} avatarUrl={profile.avatarUrl ?? null} size={50} />}
          <span style={{ position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: '50%', background: '#9b00ff', color: '#fff', fontSize: 14, lineHeight: '18px', textAlign: 'center', border: '2px solid #06040f' }}>{picking ? '…' : '+'}</span>
        </div>
        <span className="font-mono text-[10px] text-white/45 truncate" style={{ maxWidth: 58 }}>შენი Story</span>
      </button>

      {groups.map((g, i) => {
        const fresh = !groupSeen(g);
        const mine = g.authorId === profile?.id;
        return (
          <button key={g.authorId} onClick={() => openStory(i)} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ width: 60 }}>
            <div style={{ position: 'relative', width: 56, height: 56, borderRadius: '50%', padding: 2, background: fresh ? 'linear-gradient(135deg,#9b00ff,#00e5ff,#ff00cc)' : 'rgba(255,255,255,0.12)' }}>
              <div style={{ width: '100%', height: '100%', borderRadius: '50%', padding: 2, background: '#06040f' }}>
                <Avatar avatar={g.avatar} avatarUrl={g.avatarUrl} size={48} />
              </div>
              {mine && storyNotif && (
                <span style={{ position: 'absolute', top: 0, right: 0, width: 14, height: 14, borderRadius: '50%', background: '#ff2d55', border: '2px solid #06040f', boxShadow: '0 0 6px rgba(255,45,85,0.8)' }} />
              )}
            </div>
            <span className="font-mono text-[10px] text-white/55 truncate" style={{ maxWidth: 58 }}>{g.username}</span>
          </button>
        );
      })}

      <AnimatePresence>
        {viewer !== null && groups[viewer] && (
          <StoryViewer
            groups={groups} startIndex={viewer}
            myId={profile?.id}
            onClose={() => setViewer(null)}
            onOpenProfile={onOpenProfile}
            onDeleted={fetchStories}
            markSeen={markSeen}
          />
        )}
      </AnimatePresence>
      {composerImg && <StoryComposer image={composerImg} onClose={() => setComposerImg(null)} onPosted={fetchStories} />}
    </div>
  );
}
