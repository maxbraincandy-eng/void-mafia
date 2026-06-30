import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { emitWithAck } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import type { Res } from '@/types/index';

export interface StoryItem { id: string; imageUrl: string; caption: string; createdAt: number; }
export interface StoryGroup {
  authorId: string; username: string; avatar: string; avatarUrl: string | null;
  publicId: number | null; stories: StoryItem[];
}

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

// Resize an image file to a story-sized JPEG data URL.
function resizeStoryImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const maxDim = 900;
        let w = img.width, h = img.height;
        if (w > h) { if (w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; } }
        else { if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; } }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.78));
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const group = groups[gi];
  const story = group?.stories[si];

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

  // Auto-advance + mark seen
  useEffect(() => {
    if (!story) return;
    markSeen(story.id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(advance, 5000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [story?.id, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!group || !story) return null;
  const isMine = group.authorId === myId;

  const handleDelete = async () => {
    try { await emitWithAck('community:story_delete', { id: story.id }); } catch { /* ignore */ }
    onDeleted();
    onClose();
  };

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 1400, background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Progress bars */}
      <div style={{ display: 'flex', gap: 4, padding: '10px 12px 6px' }}>
        {group.stories.map((s, idx) => (
          <div key={s.id} style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2, background: '#fff',
              width: idx < si ? '100%' : idx === si ? '100%' : '0%',
              animation: idx === si ? `vm-story-progress 5s linear forwards` : undefined,
            }} />
          </div>
        ))}
      </div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 14px 10px' }}>
        <button onClick={() => { onOpenProfile(group.authorId); onClose(); }} className="flex items-center gap-2">
          <Avatar avatar={group.avatar} avatarUrl={group.avatarUrl} size={32} />
          <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#fff', fontWeight: 600 }}>{group.username}</span>
        </button>
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{timeAgo(story.createdAt)}</span>
        <div style={{ flex: 1 }} />
        {isMine && (
          <button onClick={handleDelete} style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)' }} title="წაშლა">🗑</button>
        )}
        <button onClick={onClose} style={{ fontSize: 20, color: 'rgba(255,255,255,0.85)', lineHeight: 1 }}>✕</button>
      </div>
      {/* Image + tap zones */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <img key={story.id} src={story.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        <button onClick={back} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '32%', background: 'transparent', border: 'none' }} aria-label="prev" />
        <button onClick={advance} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '40%', background: 'transparent', border: 'none' }} aria-label="next" />
        {story.caption && (
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: 24, textAlign: 'center', fontFamily: 'monospace', fontSize: 14, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.9)', background: 'rgba(0,0,0,0.35)', padding: '8px 12px', borderRadius: 12, backdropFilter: 'blur(4px)' }}>
            {story.caption}
          </div>
        )}
      </div>
    </motion.div>,
    document.body
  );
}

// ── Composer ──────────────────────────────────────────────────────────
function StoryComposer({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fileRef.current?.click(); }, []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) { onClose(); return; }
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
  const [composer, setComposer] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() => loadSeen());

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

  const markSeen = useCallback((id: string) => {
    setSeen(prev => { if (prev.has(id)) return prev; const n = new Set(prev); n.add(id); saveSeen(n); return n; });
  }, []);

  const groupSeen = (g: StoryGroup) => g.stories.every(s => seen.has(s.id));

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
      {/* Add own story */}
      <button onClick={() => setComposer(true)} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ width: 60 }}>
        <div style={{ position: 'relative', width: 56, height: 56, borderRadius: '50%', padding: 2, border: '1.5px dashed rgba(255,255,255,0.18)' }}>
          {profile && <Avatar avatar={profile.avatar} avatarUrl={profile.avatarUrl ?? null} size={50} />}
          <span style={{ position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: '50%', background: '#9b00ff', color: '#fff', fontSize: 14, lineHeight: '18px', textAlign: 'center', border: '2px solid #06040f' }}>+</span>
        </div>
        <span className="font-mono text-[10px] text-white/45 truncate" style={{ maxWidth: 58 }}>შენი Story</span>
      </button>

      {groups.map((g, i) => {
        const fresh = !groupSeen(g);
        return (
          <button key={g.authorId} onClick={() => setViewer(i)} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ width: 60 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', padding: 2, background: fresh ? 'linear-gradient(135deg,#9b00ff,#00e5ff,#ff00cc)' : 'rgba(255,255,255,0.12)' }}>
              <div style={{ width: '100%', height: '100%', borderRadius: '50%', padding: 2, background: '#06040f' }}>
                <Avatar avatar={g.avatar} avatarUrl={g.avatarUrl} size={48} />
              </div>
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
      {composer && <StoryComposer onClose={() => setComposer(false)} onPosted={fetchStories} />}
    </div>
  );
}
