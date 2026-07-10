import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { emitWithAck, socket } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/store/langStore';
import type { Res } from '@/types/index';

export interface StoryItem { id: string; imageUrl: string; caption: string; createdAt: number; viewCount?: number; tags?: { id: string; username: string }[]; musicVideoId?: string; musicTitle?: string; }
export interface StoryGroup {
  authorId: string; username: string; avatar: string; avatarUrl: string | null;
  publicId: number | null; stories: StoryItem[];
}
export interface StoryViewerRow {
  id: string; username: string; avatar: string; avatarUrl: string | null;
  publicId: number | null; viewedAt: number; reaction?: string | null;
}

// Must match STORY_REACTIONS on the server.
const STORY_EMOJIS = ['💜', '🔥', '👍', '⭐', '🤯', '😂'] as const;
type StoryReactionData = { reactions: Record<string, number>; myReaction: string | null };

const SEEN_KEY = 'vm_seen_stories';
function loadSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')); } catch { return new Set(); }
}
function saveSeen(s: Set<string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-500))); } catch { /* ignore */ }
}

function timeAgo(ts: number, t: ReturnType<typeof useT>): string {
  const d = Date.now() - ts;
  if (d < 60_000) return t.stories.now;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}${t.stories.minSuffix}`;
  return `${Math.floor(d / 3_600_000)}${t.stories.hourSuffix}`;
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

function createStoryThumb(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const maxH = 80;
      const scale = Math.min(maxH / img.height, maxH / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', 0.35));
    };
    img.onerror = () => resolve('');
    img.src = imageUrl;
  });
}

function Avatar({ avatar, avatarUrl, size }: { avatar: string; avatarUrl: string | null; size: number }) {
  return avatarUrl
    ? <img src={avatarUrl} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
    : <div className="flex items-center justify-center rounded-full text-white/80" style={{ width: size, height: size, fontSize: size * 0.5, background: 'linear-gradient(135deg,rgba(255,0,128,.5),rgba(138,43,226,.5))' }}>{avatar}</div>;
}

// ── Story music player (YouTube IFrame API singleton) ─────────────────
// A raw <iframe autoplay> won't play: browsers block autoplay-with-sound
// and YouTube pauses players it thinks are off-screen. So we drive a real
// IFrame-API player (like the DJ booth) kept on-screen but visually hidden.
function _loadStoryYTApi(): Promise<void> {
  return new Promise(resolve => {
    const w = window as any;
    if (w.YT?.Player) { resolve(); return; }
    if (!document.getElementById('vm-yt-iframe-api')) {
      const s = document.createElement('script');
      s.id = 'vm-yt-iframe-api';
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
    // Poll for readiness rather than hijacking the global onYouTubeIframeAPIReady
    // callback (VirtualSpace's DJ player also uses it).
    const iv = setInterval(() => { if (w.YT?.Player) { clearInterval(iv); resolve(); } }, 100);
    setTimeout(() => { clearInterval(iv); resolve(); }, 8000);
  });
}

let _storyYT: any = null;
let _storyYTReady = false;
let _storyYTPending: string | null = null;

function _ensureStoryPlayer() {
  if (_storyYT) return;
  let div = document.getElementById('vm-story-music');
  if (!div) {
    div = document.createElement('div');
    div.id = 'vm-story-music';
    // On-screen (so YouTube considers it visible) but essentially invisible.
    div.style.cssText = 'position:fixed;bottom:0;right:0;width:120px;height:80px;opacity:0.001;pointer-events:none;z-index:0;';
    document.body.appendChild(div);
  }
  _loadStoryYTApi().then(() => {
    const w = window as any;
    if (!w.YT?.Player) return;
    _storyYT = new w.YT.Player(div, {
      width: 120, height: 80,
      playerVars: { autoplay: 1, controls: 0, rel: 0, playsinline: 1 },
      events: {
        onReady: () => {
          _storyYTReady = true;
          if (_storyYTPending) { const v = _storyYTPending; _storyYTPending = null; storyMusicPlay(v); }
        },
        onStateChange: (e: { data: number }) => {
          // Loop the track while the story stays open (0 === ENDED).
          if (e.data === 0) { try { _storyYT?.seekTo?.(0, true); _storyYT?.playVideo?.(); } catch { /* ignore */ } }
        },
      },
    });
  });
}

function storyMusicPlay(videoId: string) {
  _ensureStoryPlayer();
  if (!_storyYTReady || !_storyYT) { _storyYTPending = videoId; return; }
  try {
    _storyYT.loadVideoById({ videoId });
    _storyYT.setVolume?.(100);
    _storyYT.playVideo?.();
  } catch { /* ignore */ }
}
function storyMusicResume() { try { _storyYT?.playVideo?.(); } catch { /* ignore */ } }
function storyMusicPause() { try { _storyYT?.pauseVideo?.(); } catch { /* ignore */ } }
function storyMusicStop() { _storyYTPending = null; try { _storyYT?.stopVideo?.(); } catch { /* ignore */ } }

// ── Story viewer (full-screen, Instagram-style) ───────────────────────
function StoryViewer({ groups, startIndex, onClose, onOpenProfile, myId, onDeleted, markSeen }: {
  groups: StoryGroup[]; startIndex: number; onClose: () => void;
  onOpenProfile: (id: string) => void; myId: string | undefined;
  onDeleted: () => void; markSeen: (id: string) => void;
}) {
  const t = useT();
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
  // Instagram-style reaction picker (swipe up on others' stories) + float burst.
  const [pickerOpen, setPickerOpen] = useState(false);
  // Delete confirmation (own story) — pauses the story while open.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [floats, setFloats] = useState<{ id: number; emoji: string; left: number; dy: number; dur: number }[]>([]);
  const floatId = useRef(0);
  // Story reply (DM) input state
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const replyInputRef = useRef<HTMLInputElement>(null);
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
    setReplyText(''); setReplySent(false); setInputFocused(false);
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

  // Music playback — YouTube IFrame-API player (see singleton above).
  useEffect(() => {
    const vid = story?.musicVideoId;
    if (!vid) { storyMusicStop(); return; }
    storyMusicPlay(vid);
    // Autoplay-with-sound is blocked on mobile until a user gesture; retry on
    // the first tap anywhere in the viewer so the track kicks in immediately.
    const retry = () => { storyMusicResume(); };
    const opts = { capture: true, passive: true } as AddEventListenerOptions;
    window.addEventListener('pointerdown', retry, opts);
    window.addEventListener('touchstart', retry, opts);
    return () => {
      window.removeEventListener('pointerdown', retry, opts);
      window.removeEventListener('touchstart', retry, opts);
    };
  }, [story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop the music when the viewer closes.
  useEffect(() => () => { storyMusicStop(); }, []);

  // Pause the music while the story is held (press & hold), resume on release.
  useEffect(() => {
    if (!story?.musicVideoId) return;
    if (paused) storyMusicPause(); else storyMusicResume();
  }, [paused, story?.musicVideoId]);

  // Float a little burst of the reacted emoji up the screen (Instagram-style).
  const burst = (emoji: string) => {
    const items = Array.from({ length: 5 }, () => ({
      id: floatId.current++, emoji,
      left: 22 + Math.random() * 56, dy: -220 - Math.random() * 140, dur: 1.1 + Math.random() * 0.6,
    }));
    setFloats(f => [...f, ...items]);
    const ids = new Set(items.map(i => i.id));
    setTimeout(() => setFloats(f => f.filter(x => !ids.has(x.id))), 1800);
  };

  const react = (emoji: string) => {
    if (!story) return;
    const adding = myReaction !== emoji; // toggling off shouldn't burst
    setMyReaction(prev => (prev === emoji ? null : emoji)); // optimistic
    emitWithAck<{ storyId: string; reaction: string }, Res<StoryReactionData>>('community:story_react', { storyId: story.id, reaction: emoji })
      .then(r => { if ((r as any).ok) { setReactions((r as any).data.reactions ?? {}); setMyReaction((r as any).data.myReaction ?? null); } })
      .catch(() => {});
    if (adding) burst(emoji);
    setPickerOpen(false);
  };

  const sendReply = async () => {
    const text = replyText.trim();
    if (!text || replySending || !group || !story) return;
    setReplySending(true);
    try {
      const thumb = await createStoryThumb(story.imageUrl);
      const startRes = await emitWithAck<any, Res<{ id: string }>>('dm:start', { profileId: group.authorId });
      if (!(startRes as any).ok) throw new Error('Failed');
      const convId = (startRes as any).data.id;
      const msg = thumb
        ? `📸story:${thumb}\n${text}`
        : `📸 ${t.stories.storyReplyPrefix}\n${text}`;
      await emitWithAck<any, Res<any>>('dm:send', { conversationId: convId, text: msg, type: 'text' });
      setReplyText('');
      setReplySent(true);
      setInputFocused(false);
      replyInputRef.current?.blur();
      setTimeout(() => setReplySent(false), 2000);
    } catch { /* silently fail */ }
    setReplySending(false);
  };

  if (!group || !story) return null;

  const handleDelete = async () => {
    setConfirmDelete(false);
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
    if (dy > 0) { onClose(); }               // swipe down → close (all users)
    else if (isMine) { openSheet(); }        // swipe up → viewers (own story)
    else { setPickerOpen(true); }            // swipe up → reaction picker (others' story)
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
                animation: active ? `vm-story-progress ${s.musicVideoId ? 15 : 5}s linear forwards` : undefined,
                animationPlayState: active && (paused || pickerOpen || confirmDelete || inputFocused) ? 'paused' : 'running',
              }} />
            </div>
          );
        })}
      </div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 14px 10px' }}>
        {sheetOpen ? (
          <button onClick={closeSheet} style={{ fontSize: 20, color: '#fff', lineHeight: 1 }} aria-label="back">‹ {t.stories.back}</button>
        ) : (
          <button onClick={() => { onOpenProfile(group.authorId); onClose(); }} className="flex items-center gap-2">
            <Avatar avatar={group.avatar} avatarUrl={group.avatarUrl} size={32} />
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#fff', fontWeight: 600 }}>{group.username}</span>
          </button>
        )}
        {!sheetOpen && <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{timeAgo(story.createdAt, t)}</span>}
        <div style={{ flex: 1 }} />
        {isMine && !sheetOpen && (
          <button onClick={() => setConfirmDelete(true)} style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)' }} title={t.stories.delete}>🗑</button>
        )}
        <button onClick={onClose} style={{ fontSize: 20, color: 'rgba(255,255,255,0.85)', lineHeight: 1 }}>✕</button>
      </div>
      {/* Music indicator */}
      {story?.musicTitle && !sheetOpen && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px 6px',
          overflow: 'hidden',
        }}>
          <span style={{ fontSize: 13, flexShrink: 0, animation: 'vm-music-spin 2s linear infinite' }}>🎵</span>
          <span style={{
            fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.7)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{story.musicTitle}</span>
        </div>
      )}
      {/* Image + tap zones (image half-collapses when the viewers sheet is open) */}
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', transition: 'flex-basis .25s ease, height .25s ease', flex: sheetOpen ? '0 0 42%' : 1 }}>
        <img key={story.id} src={story.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        {!sheetOpen && <button onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } back(); }} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '32%', background: 'transparent', border: 'none' }} aria-label="prev" />}
        {!sheetOpen && <button onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } advance(); }} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '40%', background: 'transparent', border: 'none' }} aria-label="next" />}
        {(story.caption || (story.tags && story.tags.length > 0)) && !sheetOpen && (
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: 24, textAlign: 'center', fontFamily: 'monospace', fontSize: 14, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.9)', background: 'rgba(0,0,0,0.35)', padding: '8px 12px', borderRadius: 12, backdropFilter: 'blur(4px)' }}>
            {story.caption && <p style={{ margin: 0 }}>{story.caption}</p>}
            {story.tags && story.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 4, marginTop: story.caption ? 6 : 0 }}>
                {story.tags.map(t => (
                  <span key={t.id} onClick={(e) => { e.stopPropagation(); onOpenProfile(t.id); onClose(); }} style={{ fontSize: 11, color: '#c084fc', cursor: 'pointer' }}>@{t.username}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {/* Footer: viewers eye (own stories) — tap or swipe up to expand */}
      {isMine && !sheetOpen && (
        <button onClick={openSheet} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 14px 16px', color: 'rgba(255,255,255,0.85)', background: 'transparent', border: 'none' }}>
          <span style={{ fontSize: 16 }}>👁</span>
          <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{story.viewCount ?? 0}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>▲ {t.stories.whoViewed}</span>
        </button>
      )}
      {/* Footer: reply input + reaction button (others' stories) */}
      {!isMine && !sheetOpen && !pickerOpen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.08)', borderRadius: 24,
            border: '1px solid rgba(255,255,255,0.12)', padding: '6px 12px',
          }}>
            <input
              ref={replyInputRef}
              type="text"
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => { if (!replyText.trim()) setInputFocused(false); }}
              onKeyDown={e => { if (e.key === 'Enter') sendReply(); }}
              placeholder={t.stories.replyTo.replace('{n}', group.username)}
              disabled={replySending}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontFamily: 'monospace', fontSize: 13, color: '#fff',
                padding: '4px 0',
              }}
            />
            {replyText.trim() && (
              <button
                onClick={sendReply}
                disabled={replySending}
                style={{
                  background: 'rgba(155,0,255,0.7)', border: 'none', borderRadius: '50%',
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, transition: 'all .15s',
                  opacity: replySending ? 0.5 : 1,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={() => setPickerOpen(true)}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '50%', width: 40, height: 40, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, cursor: 'pointer',
            }}
          >
            {myReaction ?? '😍'}
          </button>
        </div>
      )}
      {/* Sent confirmation */}
      <AnimatePresence>
        {replySent && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            style={{
              position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
              background: 'rgba(155,0,255,0.85)', borderRadius: 20, padding: '8px 18px',
              fontFamily: 'monospace', fontSize: 12, color: '#fff', whiteSpace: 'nowrap',
              boxShadow: '0 4px 20px rgba(155,0,255,0.4)',
            }}
          >
            ✓ {t.stories.sent}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating emoji burst (rises + fades on react) */}
      {floats.map(f => (
        <motion.div key={f.id}
          initial={{ y: 0, opacity: 0, scale: 0.4 }}
          animate={{ y: f.dy, opacity: [0, 1, 1, 0], scale: [0.4, 1.25, 1] }}
          transition={{ duration: f.dur, ease: 'easeOut' }}
          style={{ position: 'absolute', bottom: 70, left: `${f.left}%`, fontSize: 34, pointerEvents: 'none', zIndex: 6 }}
        >{f.emoji}</motion.div>
      ))}

      {/* Instagram-style reaction picker — slides up on swipe/tap, timer paused */}
      <AnimatePresence>
        {pickerOpen && !isMine && !sheetOpen && (
          <>
            <div onClick={() => setPickerOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 4 }} />
            <motion.div
              initial={{ y: 90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 90, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              style={{
                position: 'absolute', bottom: 26, left: 14, right: 14, zIndex: 5,
                display: 'flex', justifyContent: 'space-around', alignItems: 'center',
                background: 'rgba(18,8,38,0.72)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
                border: '1px solid rgba(255,255,255,0.14)', borderRadius: 44, padding: '10px 6px',
                boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
              }}
            >
              {/* Plain buttons — always rendered at full scale. (A previous
                  framer-motion staggered scale-from-0 entrance could get stuck
                  mid-spring, leaving some emojis invisible.) Selected state and
                  tap pop use a pure CSS transform + transition, which can't jam. */}
              {STORY_EMOJIS.map((e) => (
                <button key={e} onClick={() => react(e)}
                  className="vm-story-emoji"
                  style={{
                    background: 'transparent', border: 'none', fontSize: 33, lineHeight: 1, padding: 4, cursor: 'pointer',
                    transform: myReaction === e ? 'scale(1.18)' : 'scale(1)',
                    transition: 'transform 0.14s ease',
                    filter: myReaction === e ? 'drop-shadow(0 0 7px rgba(155,0,255,0.85))' : undefined,
                  }}
                >{e}</button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* Delete confirm (own story) */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
            onClick={() => setConfirmDelete(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 12 }}
              onClick={e => e.stopPropagation()}
              style={{ width: 'min(320px, 86vw)', borderRadius: 20, padding: '22px 18px', background: 'rgba(14,8,30,0.98)', border: '1px solid rgba(155,0,255,0.3)', boxShadow: '0 16px 60px rgba(0,0,0,0.6)' }}
            >
              <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 15, color: '#fff', textAlign: 'center', marginBottom: 18, lineHeight: 1.5 }}>
                {t.stories.deleteConfirm}
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={handleDelete}
                  style={{ flex: 1, padding: '11px 0', borderRadius: 12, fontFamily: 'monospace', fontWeight: 700, fontSize: 13, background: 'rgba(255,45,85,0.85)', border: '1px solid rgba(255,45,85,0.9)', color: '#fff' }}
                >
                  {t.stories.yes}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{ flex: 1, padding: '11px 0', borderRadius: 12, fontFamily: 'monospace', fontWeight: 700, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}
                >
                  {t.stories.no}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Viewers half-sheet */}
      {sheetOpen && (
        <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(8,4,22,0.98)', borderTop: '1px solid rgba(155,0,255,.25)', padding: '14px 16px 24px' }}>
          <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 13, color: '#fff', marginBottom: 12 }}>
            👁 {t.stories.viewedLabel} {viewers ? viewers.length : ''}
          </p>
          {viewersBusy && <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>…</p>}
          {!viewersBusy && viewers && viewers.length === 0 && (
            <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{t.stories.noViewers}</p>
          )}
          {!viewersBusy && viewers && viewers.map(v => (
            <button key={v.id} onClick={() => { onOpenProfile(v.id); onClose(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 4px', background: 'transparent', border: 'none' }}>
              <Avatar avatar={v.avatar} avatarUrl={v.avatarUrl} size={36} />
              <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#fff' }}>{v.username}</span>
              {v.reaction && <span style={{ fontSize: 15, lineHeight: 1 }}>{v.reaction}</span>}
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{timeAgo(v.viewedAt, t)}</span>
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
  const t = useT();
  const [img, setImg] = useState<string | null>(image);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [tags, setTags] = useState<{ id: string; username: string }[]>([]);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagPeople, setTagPeople] = useState<{ profileId: string; username: string; avatarUrl: string | null }[] | null>(null);
  const [tagFilter, setTagFilter] = useState('');
  const [music, setMusic] = useState<{ videoId: string; title: string } | null>(null);
  const [musicOpen, setMusicOpen] = useState(false);
  const [musicQuery, setMusicQuery] = useState('');
  const [musicResults, setMusicResults] = useState<{ videoId: string; title: string; author: string; duration: number }[]>([]);
  const [musicSearching, setMusicSearching] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr('');
    try { setImg(await resizeStoryImage(f)); } catch { setErr(t.stories.imageLoadError); }
  };

  const openTagPicker = () => {
    setTagOpen(true);
    if (!tagPeople) {
      emitWithAck<void, Res<any[]>>('friend:invitable_list').then(res => {
        if (res.ok && res.data) setTagPeople(res.data.map((p: any) => ({ profileId: p.profileId, username: p.username, avatarUrl: p.avatarUrl ?? null })));
        else setTagPeople([]);
      }).catch(() => setTagPeople([]));
    }
  };

  const toggleTag = (p: { profileId: string; username: string }) => {
    setTags(prev => prev.some(t => t.id === p.profileId) ? prev.filter(t => t.id !== p.profileId) : prev.length < 10 ? [...prev, { id: p.profileId, username: p.username }] : prev);
  };

  const searchMusic = () => {
    if (!musicQuery.trim() || musicSearching) return;
    setMusicSearching(true);
    emitWithAck<{ query: string }, { ok: boolean; data?: any }>('space:yt-search', { query: musicQuery.trim() }).then(res => {
      setMusicSearching(false);
      if (res.ok && Array.isArray(res.data)) setMusicResults(res.data);
      else setMusicResults([]);
    }).catch(() => { setMusicSearching(false); setMusicResults([]); });
  };

  const post = async () => {
    if (!img || busy) return;
    setBusy(true); setErr('');
    try {
      const payload: any = { imageUrl: img, caption, tags };
      if (music) { payload.musicVideoId = music.videoId; payload.musicTitle = music.title; }
      const res = await emitWithAck<any, Res<StoryItem>>('community:story_create', payload);
      if ((res as any).ok) { onPosted(); onClose(); }
      else setErr((res as any).error ?? t.stories.shareError);
    } catch { setErr(t.stories.connectionError); }
    finally { setBusy(false); }
  };

  const filtered = (tagPeople ?? []).filter(p => !tagFilter || p.username.toLowerCase().includes(tagFilter.toLowerCase()));

  return createPortal(
    <div onClick={() => !busy && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(380px,100%)', maxHeight: '90vh', overflowY: 'auto', background: 'rgba(8,4,22,.99)', border: '1px solid rgba(155,0,255,.3)', borderRadius: 20, padding: 16 }}>
        <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 15, color: '#fff', marginBottom: 10, textAlign: 'center' }}>📖 {t.stories.newStory}</p>
        {img ? (
          <img src={img} alt="" style={{ width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 12, background: '#000' }} />
        ) : (
          <button onClick={() => fileRef.current?.click()} style={{ width: '100%', padding: '40px', borderRadius: 12, border: '1px dashed rgba(255,255,255,.2)', color: 'rgba(255,255,255,.5)', fontFamily: 'monospace', fontSize: 13, background: 'rgba(255,255,255,.02)' }}>+ {t.stories.chooseImage}</button>
        )}
        {err && <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#ff2d55', textAlign: 'center', marginTop: 8 }}>{err}</p>}
        {img && (
          <input value={caption} onChange={e => setCaption(e.target.value)} maxLength={200} placeholder={t.stories.captionPlaceholder}
            style={{ width: '100%', marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: '#fff', fontFamily: 'monospace', fontSize: 13, outline: 'none' }} />
        )}
        {img && (
          <div style={{ marginTop: 10 }}>
            <button onClick={openTagPicker} style={{ fontFamily: 'monospace', fontSize: 12, color: '#c084fc', background: 'rgba(155,0,255,.1)', border: '1px solid rgba(155,0,255,.3)', borderRadius: 10, padding: '7px 12px', cursor: 'pointer' }}>
              👥 {tags.length > 0 ? `${tags.length} ${t.stories.tagged}` : t.stories.tagBtn}
            </button>
            {tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {tags.map(t => (
                  <span key={t.id} onClick={() => setTags(prev => prev.filter(x => x.id !== t.id))} style={{ fontFamily: 'monospace', fontSize: 11, color: '#c084fc', background: 'rgba(155,0,255,.15)', border: '1px solid rgba(155,0,255,.3)', borderRadius: 8, padding: '3px 8px', cursor: 'pointer' }}>
                    @{t.username} ✕
                  </span>
                ))}
              </div>
            )}
            {tagOpen && (
              <div style={{ marginTop: 8, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: 8 }}>
                <input value={tagFilter} onChange={e => setTagFilter(e.target.value)} placeholder={t.stories.searchPlaceholder}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: '#fff', fontFamily: 'monospace', fontSize: 12, outline: 'none', marginBottom: 6 }} />
                <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {!tagPeople && <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.3)', textAlign: 'center', padding: 8 }}>…</p>}
                  {tagPeople && filtered.length === 0 && <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.3)', textAlign: 'center', padding: 8 }}>{t.stories.notFound}</p>}
                  {filtered.map(p => {
                    const selected = tags.some(t => t.id === p.profileId);
                    return (
                      <button key={p.profileId} onClick={() => toggleTag(p)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: selected ? 'rgba(155,0,255,.15)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(155,0,255,.15)', border: '1px solid rgba(155,0,255,.25)', overflow: 'hidden', flexShrink: 0 }}>
                          {p.avatarUrl && <img src={p.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                        </div>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: selected ? '#c084fc' : 'rgba(255,255,255,.7)', flex: 1 }}>{p.username}</span>
                        {selected && <span style={{ fontSize: 12, color: '#c084fc' }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setTagOpen(false)} style={{ width: '100%', marginTop: 6, padding: '6px', borderRadius: 8, fontFamily: 'monospace', fontSize: 11, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: 'rgba(255,255,255,.5)', cursor: 'pointer' }}>{t.stories.close}</button>
              </div>
            )}
          </div>
        )}
        {img && (
          <div style={{ marginTop: 10 }}>
            {!music ? (
              <button onClick={() => setMusicOpen(o => !o)} style={{ fontFamily: 'monospace', fontSize: 12, color: '#ff69b4', background: 'rgba(255,0,150,.08)', border: '1px solid rgba(255,0,150,.3)', borderRadius: 10, padding: '7px 12px', cursor: 'pointer' }}>
                🎵 {t.stories.addMusic}
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 10, background: 'rgba(255,0,150,.1)', border: '1px solid rgba(255,0,150,.3)' }}>
                <span style={{ fontSize: 14 }}>🎵</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#ff69b4', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{music.title}</span>
                <button onClick={() => { setMusic(null); setMusicOpen(false); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
              </div>
            )}
            {musicOpen && !music && (
              <div style={{ marginTop: 8, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={musicQuery} onChange={e => setMusicQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') searchMusic(); }} placeholder={t.stories.songNamePlaceholder}
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,0,150,.2)', color: '#fff', fontFamily: 'monospace', fontSize: 12, outline: 'none' }} />
                  <button onClick={searchMusic} disabled={!musicQuery.trim() || musicSearching} style={{ padding: '7px 12px', borderRadius: 8, fontFamily: 'monospace', fontSize: 11, background: 'rgba(255,0,150,.15)', border: '1px solid rgba(255,0,150,.4)', color: '#ff69b4', cursor: 'pointer', flexShrink: 0 }}>{musicSearching ? '…' : '🔍'}</button>
                </div>
                {musicResults.length > 0 && (
                  <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {musicResults.map(r => (
                      <button key={r.videoId} onClick={() => { setMusic({ videoId: r.videoId, title: r.title }); setMusicOpen(false); setMusicResults([]); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 8, background: 'rgba(255,0,150,.05)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ fontSize: 12, flexShrink: 0 }}>▶</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>{r.title}</p>
                          <p style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,.35)', margin: 0 }}>{r.author}{r.duration > 0 ? ` · ${Math.floor(r.duration / 60)}:${String(r.duration % 60).padStart(2, '0')}` : ''}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={() => setMusicOpen(false)} style={{ width: '100%', marginTop: 6, padding: '6px', borderRadius: 8, fontFamily: 'monospace', fontSize: 11, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: 'rgba(255,255,255,.5)', cursor: 'pointer' }}>{t.stories.close}</button>
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={onClose} disabled={busy} style={{ flex: 1, padding: '11px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)', color: 'rgba(255,255,255,.6)' }}>{t.stories.cancel}</button>
          <button onClick={post} disabled={!img || busy} style={{ flex: 2, padding: '11px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13, fontWeight: 700, background: 'rgba(155,0,255,.18)', border: '1px solid rgba(155,0,255,.45)', color: '#c084fc', opacity: img ? 1 : 0.4 }}>{busy ? '…' : `📢 ${t.stories.share}`}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Strip ─────────────────────────────────────────────────────────────
export function StoriesStrip({ onOpenProfile }: { onOpenProfile: (id: string) => void }) {
  const t = useT();
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
        <span className="font-mono text-[10px] text-white/45 truncate" style={{ maxWidth: 58 }}>{t.stories.yourStory}</span>
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
