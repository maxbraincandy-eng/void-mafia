import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import { emitWithAck } from '@/lib/socket';
import type { CommunityPostV2, CommunityComment, Res } from '@/types/index';
import { Avatar, BadgeRow, MrMaxGlow, timeAgo, ModalShell, TextArea, TextInput, PillButton, Spinner } from '@/components/community/shared';
import { PollDisplay } from '@/components/community/PollDisplay';
import { YouTubeEmbed, extractYouTubeId } from '@/components/community/YouTubeEmbed';
import { ReactionPicker } from './ReactionPicker';
import { PlayerName } from '@/components/ui/PlayerName';
import { GifPicker } from './GifPicker';
import { useSocialStore } from '@/store/socialStore';

// ── Confirm dialog (კი/არა) ────────────────────────────────────────────
export function ConfirmDialog({ question, onYes, onNo }: { question: string; onYes: () => void; onNo: () => void }) {
  return (
    <ModalShell onClose={onNo} accent="purple">
      <p className="font-display font-bold text-white text-base mb-5 text-center leading-relaxed">{question}</p>
      <div className="flex gap-2.5">
        <button
          onClick={onYes}
          className="flex-1 py-3 rounded-xl font-display font-bold text-sm uppercase tracking-wider transition-all active:scale-[0.97]"
          style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.5), rgba(192,38,211,0.4))', border: '1px solid rgba(155,0,255,0.5)', color: '#fff' }}
        >
          კი
        </button>
        <button
          onClick={onNo}
          className="flex-1 py-3 rounded-xl font-display font-bold text-sm uppercase tracking-wider transition-all active:scale-[0.97]"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.6)' }}
        >
          არა
        </button>
      </div>
    </ModalShell>
  );
}

// ── Share-to-Story canvas render ───────────────────────────────────────
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('img'));
    img.src = src;
  });
}

/** Renders a post as a 720×1280 story card (dark void bg, author, text, optional image). */
async function renderPostToStoryImage(post: CommunityPostV2): Promise<string> {
  const W = 720, H = 1280;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#160b2a'); g.addColorStop(0.5, '#0b0518'); g.addColorStop(1, '#05030e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // subtle orbs
  ctx.fillStyle = 'rgba(155,0,255,0.09)';
  ctx.beginPath(); ctx.arc(W - 60, 120, 220, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,229,255,0.05)';
  ctx.beginPath(); ctx.arc(40, H - 140, 260, 0, Math.PI * 2); ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(192,132,252,0.9)';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(`@${post.authorName}`, W / 2, 170);

  let y = 240;
  // Post image (data URLs draw fine; skip external if it fails)
  if (post.imageUrl) {
    try {
      const img = await loadImg(post.imageUrl);
      const maxW = W - 120, maxH = 560;
      const sc = Math.min(maxW / img.width, maxH / img.height, 1);
      const dw = img.width * sc, dh = img.height * sc;
      ctx.save();
      const rx = (W - dw) / 2, ry = y, r = 24;
      ctx.beginPath();
      ctx.moveTo(rx + r, ry);
      ctx.arcTo(rx + dw, ry, rx + dw, ry + dh, r);
      ctx.arcTo(rx + dw, ry + dh, rx, ry + dh, r);
      ctx.arcTo(rx, ry + dh, rx, ry, r);
      ctx.arcTo(rx, ry, rx + dw, ry, r);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, rx, ry, dw, dh);
      ctx.restore();
      y += dh + 60;
    } catch { /* text-only fallback */ }
  }

  // Wrapped post text
  const text = (post.content ?? '').trim();
  if (text) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '34px sans-serif';
    const maxWidth = W - 140;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const probe = line ? line + ' ' + w : w;
      if (ctx.measureText(probe).width > maxWidth && line) { lines.push(line); line = w; }
      else line = probe;
      if (lines.length >= 14) break;
    }
    if (line && lines.length < 14) lines.push(line);
    if (lines.length === 14) lines[13] = lines[13] + '…';
    const lh = 50;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i]!, W / 2, y + i * lh);
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.font = '22px monospace';
  ctx.fillText('VOID MAFIA · COMMUNITY', W / 2, H - 70);

  let q = 0.82;
  let out = canvas.toDataURL('image/jpeg', q);
  while (out.length > 600_000 && q > 0.4) {
    q -= 0.12;
    out = canvas.toDataURL('image/jpeg', q);
  }
  return out;
}

const URL_RE = /(https?:\/\/[^\s]+)/g;
void URL_RE;

// ── Comments (threaded, likes, GIFs) ───────────────────────────────────
function CommentsSection({ postId, onOpenProfile, myProfileId }: { postId: string; onOpenProfile: (id: string) => void; myProfileId: string | undefined }) {
  const t = useT();
  const { fetchComments, addComment, deleteComment, likeComment } = useCommunityStore();
  const [comments, setComments] = useState<CommunityComment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);
  const [showGif, setShowGif] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const fetched = await fetchComments(postId);
      setComments(fetched);
      setLoading(false);
    })();
  }, [postId, fetchComments]);

  async function send(gifUrl?: string) {
    const content = draft.trim();
    if ((!content && !gifUrl) || sending) return;
    setSending(true);
    try {
      const comment = await addComment(postId, content, { parentId: replyTo?.id ?? null, gifUrl: gifUrl ?? null });
      setComments(prev => (prev ? [...prev, comment] : [comment]));
      setDraft('');
      setReplyTo(null);
    } finally { setSending(false); }
  }

  async function handleDelete(commentId: string) {
    try {
      await deleteComment(postId, commentId);
      setComments(prev => prev ? prev.filter(c => c.id !== commentId && c.parentId !== commentId) : prev);
    } catch {}
  }

  async function handleLike(c: CommunityComment) {
    // optimistic
    setComments(prev => prev ? prev.map(x => x.id === c.id
      ? { ...x, likedByMe: !x.likedByMe, likes: (x.likes ?? 0) + (x.likedByMe ? -1 : 1) }
      : x) : prev);
    try { await likeComment(c.id); } catch { /* revert not critical */ }
  }

  const roots = (comments ?? []).filter(c => !c.parentId);
  const childrenOf = (id: string) => (comments ?? []).filter(c => c.parentId === id);

  const renderComment = (c: CommunityComment, isReply: boolean) => (
    <div key={c.id} className={`flex items-start gap-2 ${isReply ? 'ml-8' : ''}`}>
      <button onClick={() => onOpenProfile(c.authorId)} className="flex-shrink-0 active:scale-95 transition-transform">
        <Avatar avatar={c.authorAvatar} avatarUrl={c.authorAvatarUrl} size={isReply ? 20 : 24} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <button onClick={() => onOpenProfile(c.authorId)} className="hover:opacity-80 transition-opacity">
            <PlayerName profileId={c.authorId} name={c.authorName} className="font-mono text-[12px] text-white/50" />
          </button>
          <span className="font-mono text-[12px] text-white/20">· {timeAgo(c.createdAt)}</span>
          {c.authorId === myProfileId && (
            <button
              onClick={() => handleDelete(c.id)}
              className="ml-auto font-mono text-[12px] text-red-400/50 hover:text-red-400 transition-colors"
            >
              ✕
            </button>
          )}
        </div>
        {c.content && <p className="font-mono text-xs text-white/70 break-words">{renderContent(c.content, [], () => {}, name => {
            if (name.toLowerCase() === 'virtual-space') useSocialStore.getState().requestOpenSpace();
          })}</p>}
        {c.gifUrl && (
          <img src={c.gifUrl} alt="GIF" className="mt-1 rounded-lg max-w-[200px] max-h-[160px] object-cover border border-white/10" loading="lazy" />
        )}
        <div className="flex items-center gap-3 mt-0.5">
          <button
            onClick={() => handleLike(c)}
            className="flex items-center gap-1 font-mono text-[11px] transition-colors active:scale-90"
            style={{ color: c.likedByMe ? '#ff2d55' : 'rgba(255,255,255,0.3)' }}
          >
            {c.likedByMe ? '❤️' : '🤍'}{(c.likes ?? 0) > 0 && <span>{c.likes}</span>}
          </button>
          {!isReply && (
            <button
              onClick={() => setReplyTo(c)}
              className="font-mono text-[11px] text-white/30 hover:text-white/60 transition-colors"
            >
              ↩ პასუხი
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="mt-3 pt-3 border-t border-white/10 space-y-2.5">
      {loading ? (
        <Spinner color="#9b00ff" />
      ) : !comments || comments.length === 0 ? (
        <p className="font-mono text-[11px] text-white/25 text-center py-2">{t.community.feed.noComments}</p>
      ) : (
        <div className="space-y-2">
          {roots.map(c => (
            <div key={c.id} className="space-y-1.5">
              {renderComment(c, false)}
              {childrenOf(c.id).map(r => renderComment(r, true))}
            </div>
          ))}
        </div>
      )}

      {/* Reply-to bar */}
      {replyTo && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
          style={{ background: 'rgba(155,0,255,0.08)', borderLeft: '2px solid rgba(192,132,252,0.6)' }}>
          <p className="flex-1 font-mono text-[11px] text-white/45 truncate">↩ {replyTo.authorName}: {replyTo.content || '🎞 GIF'}</p>
          <button onClick={() => setReplyTo(null)} className="font-mono text-[11px] text-white/35">✕</button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowGif(true)}
          disabled={sending}
          className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center font-mono text-[10px] font-bold transition-all active:scale-90 disabled:opacity-40"
          style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)', color: '#00e5ff' }}
          title="GIF"
        >
          GIF
        </button>
        <div className="flex-1">
          <TextInput value={draft} onChange={setDraft} placeholder={replyTo ? `პასუხი ${replyTo.authorName}-ს…` : t.community.feed.commentPh} maxLength={500} />
        </div>
        <PillButton onClick={() => send()} disabled={!draft.trim() || sending}>
          {t.community.feed.send}
        </PillButton>
      </div>

      <AnimatePresence>
        {showGif && <GifPicker onSelect={url => { send(url); }} onClose={() => setShowGif(false)} />}
      </AnimatePresence>
    </div>
  );
}

function ReportModal({ postId, onClose }: { postId: string; onClose: () => void }) {
  const t = useT();
  const reportPost = useCommunityStore(s => s.reportPost);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (!reason.trim() || submitting) return;
    setSubmitting(true);
    try { await reportPost(postId, reason.trim()); setSent(true); }
    finally { setSubmitting(false); }
  }

  return (
    <ModalShell onClose={onClose} accent="purple">
      <h3 className="font-display font-bold text-white text-lg mb-4">{t.community.feed.reportTitle}</h3>
      {sent ? (
        <p className="font-mono text-sm text-white/60">{t.community.feed.reportSent}</p>
      ) : (
        <div className="space-y-3">
          <TextArea value={reason} onChange={setReason} placeholder={t.community.feed.reportReasonPh} maxLength={500} rows={4} />
          <button
            onClick={handleSubmit} disabled={!reason.trim() || submitting}
            className="w-full py-3 rounded-xl font-display font-semibold text-sm uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.4), rgba(0,245,255,0.25))', border: '1px solid rgba(155,0,255,0.4)', color: '#fff' }}
          >
            {submitting ? '…' : t.community.feed.report}
          </button>
        </div>
      )}
    </ModalShell>
  );
}

function renderContent(content: string, hashtags: string[], onHashtag: (tag: string) => void, onMention: (name: string) => void) {
  const parts = content.split(/(#\w+|@[\w-]+|https?:\/\/[^\s]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('#')) {
      const tag = part.slice(1);
      return (
        <button key={i} onClick={() => onHashtag(tag)} className="font-mono text-xs transition-colors" style={{ color: '#00f5ff' }}>
          {part}
        </button>
      );
    }
    if (part.startsWith('@')) {
      const name = part.slice(1);
      const isSpace = name.toLowerCase() === 'virtual-space';
      return (
        <button key={i} onClick={() => onMention(name)} className="font-mono text-xs transition-colors"
          style={isSpace
            ? { color: '#00d4ff', textShadow: '0 0 8px rgba(0,212,255,0.7), 0 0 16px rgba(0,212,255,0.4)' }
            : { color: '#c084fc' }
          }>
          {part}
        </button>
      );
    }
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer"
          className="font-mono text-xs underline underline-offset-2 break-all"
          style={{ color: '#60a5fa' }}>
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function PostCardV2({
  post: initialPost, onOpenProfile,
}: {
  post: CommunityPostV2;
  onOpenProfile: (playerId: string) => void;
}) {
  const t = useT();
  // Subscribe directly so like/save/comment updates show instantly without relying on parent re-render
  const post = useCommunityStore(s => s.feedV2Posts.find(p => p.id === initialPost.id) ?? initialPost);
  const profile = useAuthStore(s => s.profile);
  const { toggleReaction, deletePost, toggleSave, setActiveHashtag, editPost } = useCommunityStore();
  const isMrMax = post.authorBadges?.includes('owner');
  const isMod = profile?.isModerator ?? false;
  const isOwn = post.authorId === profile?.id;

  const [showComments, setShowComments] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showModMenu, setShowModMenu] = useState(false);
  const [pollVoting, setPollVoting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmShare, setConfirmShare] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sharedOk, setSharedOk] = useState(false);
  const [hearts, setHearts] = useState<number[]>([]);
  const lastImgTapRef = useRef(0);
  const heartIdRef = useRef(0);
  const { votePoll } = useCommunityStore();

  async function handleVote(optionId: string) {
    setPollVoting(true);
    try { await votePoll(post.id, optionId); } finally { setPollVoting(false); }
  }

  // Double-tap post media → ❤️ reaction with a floating heart burst
  function handleMediaTap() {
    const now = Date.now();
    if (now - lastImgTapRef.current < 320) {
      lastImgTapRef.current = 0;
      if (post.myReaction !== '❤️') toggleReaction(post.id, '❤️');
      const id = heartIdRef.current++;
      setHearts(h => [...h, id]);
      navigator.vibrate?.(30);
      setTimeout(() => setHearts(h => h.filter(x => x !== id)), 900);
    } else {
      lastImgTapRef.current = now;
    }
  }

  async function handleShareToStory() {
    setConfirmShare(false);
    setSharing(true);
    try {
      const imageUrl = await renderPostToStoryImage(post);
      const res = await emitWithAck<{ imageUrl: string; caption: string }, Res<unknown>>('community:story_create', { imageUrl, caption: '' });
      if ((res as any).ok) {
        setSharedOk(true);
        setTimeout(() => setSharedOk(false), 2500);
      }
    } catch { /* ignore */ }
    finally { setSharing(false); }
  }

  async function handleSaveEdit() {
    if (!editDraft.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await editPost(post.id, editDraft.trim());
      setEditing(false);
    } catch { /* keep editing open */ }
    finally { setSavingEdit(false); }
  }

  const cardBorder = isMrMax ? 'rgba(255,215,0,0.4)' : 'rgba(155,0,255,0.2)';
  const cardBg = isMrMax ? 'rgba(255,215,0,0.04)' : 'rgba(255,255,255,0.02)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border px-4 py-3.5 space-y-3"
      style={{ borderColor: cardBorder, background: cardBg }}
    >
      {post.isPinned && (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[12px] uppercase tracking-widest text-white/40">📌 {t.community.feed.pinned}</span>
        </div>
      )}

      {/* Author row */}
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => onOpenProfile(post.authorId)} className="flex items-center gap-2 min-w-0 active:scale-95 transition-transform">
          <Avatar avatar={post.authorAvatar} avatarUrl={post.authorAvatarUrl} size={36} />
          <div className="text-left min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {isMrMax ? (
                <MrMaxGlow><p className="font-mono text-xs text-yellow-300 font-bold truncate">{post.authorName}</p></MrMaxGlow>
              ) : (
                <PlayerName profileId={post.authorId} name={post.authorName} className="font-mono text-xs text-white/80 truncate" />
              )}
              {post.authorBadges?.length > 0 && <BadgeRow badges={post.authorBadges} />}
            </div>
            <p className="font-mono text-[12px] text-white/30">
              {timeAgo(post.createdAt)}
              {post.editedAt && <span className="text-white/20"> · (შესწორებულია)</span>}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          {(isMod || isOwn) && (
            <div className="relative">
              <button onClick={() => setShowModMenu(v => !v)} className="font-mono text-[11px] text-white/25 hover:text-white/50 px-1 transition-colors">⋯</button>
              {showModMenu && (
                <div className="absolute right-0 top-full mt-1 z-10 rounded-xl border border-white/10 bg-black/90 backdrop-blur-xl p-2 space-y-1 min-w-[140px]">
                  {isOwn && (
                    <>
                      <button onClick={() => { setEditDraft(post.content); setEditing(true); setShowModMenu(false); }}
                        className="w-full text-left px-2 py-1 rounded-lg font-mono text-[11px] text-white/60 hover:text-white hover:bg-white/5 transition-colors">
                        ✏️ რედაქტირება
                      </button>
                      <button onClick={() => { deletePost(post.id); setShowModMenu(false); }}
                        className="w-full text-left px-2 py-1 rounded-lg font-mono text-[11px] text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                        {t.community.feed.delete}
                      </button>
                    </>
                  )}
                  {isMod && (
                    <>
                      <button onClick={() => setShowModMenu(false)} className="w-full text-left px-2 py-1 rounded-lg font-mono text-[11px] text-white/50 hover:bg-white/5 transition-colors">{t.community.moderation.pinPost}</button>
                      <button onClick={() => setShowModMenu(false)} className="w-full text-left px-2 py-1 rounded-lg font-mono text-[11px] text-white/50 hover:bg-white/5 transition-colors">{t.community.moderation.featurePost}</button>
                      <button onClick={() => setShowModMenu(false)} className="w-full text-left px-2 py-1 rounded-lg font-mono text-[11px] text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-colors">{t.community.moderation.hidePost}</button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content — or inline edit mode */}
      {editing ? (
        <div className="space-y-2">
          <TextArea value={editDraft} onChange={setEditDraft} maxLength={2000} rows={4} placeholder="" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)}
              className="px-3 py-1.5 rounded-lg font-mono text-[11px] text-white/40 border border-white/10">
              გაუქმება
            </button>
            <button onClick={handleSaveEdit} disabled={!editDraft.trim() || savingEdit}
              className="px-4 py-1.5 rounded-lg font-mono text-[11px] font-bold disabled:opacity-40"
              style={{ background: 'rgba(155,0,255,0.25)', border: '1px solid rgba(155,0,255,0.4)', color: '#c084fc' }}>
              {savingEdit ? '…' : '💾 შენახვა'}
            </button>
          </div>
        </div>
      ) : (
        <p className="font-mono text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
          {renderContent(post.content, post.hashtags ?? [], tag => { setActiveHashtag(tag); setShowModMenu(false); }, name => {
            if (name.toLowerCase() === 'virtual-space') useSocialStore.getState().requestOpenSpace();
          })}
        </p>
      )}

      {/* YouTube embed — auto-detected from content or videoUrl */}
      {(() => {
        const ytId = extractYouTubeId(post.content) ?? (post.videoUrl ? extractYouTubeId(post.videoUrl) : null);
        return ytId ? <YouTubeEmbed videoId={ytId} /> : null;
      })()}

      {/* Media — double-tap to ❤️ */}
      {(post.imageUrl || post.gifUrl) && (
        <div className="relative" onClick={handleMediaTap} onDoubleClick={e => e.preventDefault()}>
          {post.imageUrl && (
            <img src={post.imageUrl} alt="" className="w-full rounded-xl border border-white/10 object-cover max-h-80 select-none" draggable={false} />
          )}
          {post.gifUrl && (
            <img src={post.gifUrl} alt="GIF" className="w-full rounded-xl border border-white/10 object-cover max-h-60 select-none" draggable={false} />
          )}
          <AnimatePresence>
            {hearts.map(id => (
              <motion.span
                key={id}
                initial={{ opacity: 0, scale: 0.4, y: 0 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.5, 1.2], y: -70 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.85, ease: 'easeOut' }}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{ fontSize: 64, filter: 'drop-shadow(0 0 16px rgba(255,45,85,0.8))' }}
              >
                ❤️
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}
      {post.videoUrl && !extractYouTubeId(post.videoUrl) && (
        <a href={post.videoUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 font-mono text-xs text-white/50 hover:text-white/80 transition-colors">
          🎬 {post.videoUrl}
        </a>
      )}
      {post.audioUrl && (
        <div style={{ marginTop: 8, borderRadius: 12, overflow: 'hidden' }}>
          <audio src={post.audioUrl} controls style={{ width: '100%', height: 36 }} />
        </div>
      )}

      {/* Recommendation card */}
      {post.recTitle && (
        <div className="rounded-xl border border-white/10 p-3 flex items-center gap-3" style={{ background: 'rgba(155,0,255,0.08)' }}>
          {post.imageUrl && <img src={post.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />}
          <div className="min-w-0">
            {post.recCategory && (
              <span className="font-mono text-[12px] uppercase tracking-widest text-white/35">{post.recCategory}</span>
            )}
            <p className="font-display font-bold text-white text-sm truncate">{post.recTitle}</p>
          </div>
        </div>
      )}

      {/* Poll */}
      {post.poll && <PollDisplay post={post} onVote={handleVote} voting={pollVoting} />}

      {/* Hashtags */}
      {post.hashtags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {post.hashtags.map(tag => (
            <button key={tag} onClick={() => setActiveHashtag(tag)}
              className="font-mono text-[12px] px-2 py-0.5 rounded-full transition-colors"
              style={{ color: '#00f5ff', background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.2)' }}>
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-3 pt-1 flex-wrap">
        <ReactionPicker
          postId={post.id}
          myReaction={post.myReaction ?? null}
          reactions={post.reactions ?? (post.likedByMe ? { '❤️': post.likesCount } : {})}
          onReact={(emoji) => toggleReaction(post.id, emoji)}
        />

        <button
          onClick={() => setShowComments(v => !v)}
          className="flex items-center gap-1.5 font-mono text-[11px] text-white/40 hover:text-white/70 transition-colors"
        >
          <span>💬</span>
          <span>{post.commentsCount}</span>
          <span className="uppercase tracking-wider">{showComments ? t.community.feed.comments : t.community.feed.comment}</span>
        </button>

        <button
          onClick={() => toggleSave(post.id)}
          className="flex items-center gap-1.5 font-mono text-[11px] transition-colors active:scale-95"
          style={{ color: post.savedByMe ? '#00f5ff' : 'rgba(255,255,255,0.4)' }}
        >
          <span>{post.savedByMe ? '🔖' : '📑'}</span>
          <span className="uppercase tracking-wider">{post.savedByMe ? t.community.feed.saved : t.community.feed.save}</span>
        </button>

        <button
          onClick={() => setConfirmShare(true)}
          disabled={sharing}
          className="flex items-center gap-1.5 font-mono text-[11px] transition-colors active:scale-95 disabled:opacity-40"
          style={{ color: sharedOk ? '#00ff88' : 'rgba(255,255,255,0.4)' }}
          title="Story-ზე გაზიარება"
        >
          <span>{sharing ? '…' : sharedOk ? '✓' : '📤'}</span>
          <span className="uppercase tracking-wider">{sharedOk ? 'გაზიარდა' : 'Story'}</span>
        </button>

        <button
          onClick={() => setShowReport(true)}
          className="ml-auto font-mono text-[11px] text-white/25 hover:text-white/50 uppercase tracking-wider transition-colors"
        >
          რეპორტი
        </button>
      </div>

      {showComments && <CommentsSection postId={post.id} onOpenProfile={onOpenProfile} myProfileId={profile?.id} />}

      <AnimatePresence>
        {showReport && <ReportModal postId={post.id} onClose={() => setShowReport(false)} />}
        {confirmShare && (
          <ConfirmDialog
            question="დარწმუნებული ხართ რომ გინდათ ამ პოსტის Story-ზე გადაზიარება?"
            onYes={handleShareToStory}
            onNo={() => setConfirmShare(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
