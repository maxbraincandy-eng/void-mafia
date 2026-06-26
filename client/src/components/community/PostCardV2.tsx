import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import type { CommunityPostV2, CommunityComment } from '@/types/index';
import { Avatar, BadgeRow, MrMaxGlow, timeAgo, ModalShell, TextArea, TextInput, PillButton, Spinner } from '@/components/community/shared';
import { PollDisplay } from '@/components/community/PollDisplay';
import { YouTubeEmbed, extractYouTubeId } from '@/components/community/YouTubeEmbed';
import { ReactionPicker } from './ReactionPicker';

const URL_RE = /(https?:\/\/[^\s]+)/g;

function CommentsSection({ postId, onOpenProfile, myProfileId }: { postId: string; onOpenProfile: (id: string) => void; myProfileId: string | undefined }) {
  const t = useT();
  const { fetchComments, addComment, deleteComment } = useCommunityStore();
  const [comments, setComments] = useState<CommunityComment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const fetched = await fetchComments(postId);
      setComments(fetched);
      setLoading(false);
    })();
  }, [postId, fetchComments]);

  async function handleSend() {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      const comment = await addComment(postId, draft.trim());
      setComments(prev => (prev ? [...prev, comment] : [comment]));
      setDraft('');
    } finally { setSending(false); }
  }

  async function handleDelete(commentId: string) {
    try {
      await deleteComment(postId, commentId);
      setComments(prev => prev ? prev.filter(c => c.id !== commentId) : prev);
    } catch {}
  }

  return (
    <div className="mt-3 pt-3 border-t border-white/10 space-y-2.5">
      {loading ? (
        <Spinner color="#9b00ff" />
      ) : !comments || comments.length === 0 ? (
        <p className="font-mono text-[11px] text-white/25 text-center py-2">{t.community.feed.noComments}</p>
      ) : (
        <div className="space-y-2">
          {comments.map(c => (
            <div key={c.id} className="flex items-start gap-2">
              <button onClick={() => onOpenProfile(c.authorId)} className="flex-shrink-0 active:scale-95 transition-transform">
                <Avatar avatar={c.authorAvatar} avatarUrl={c.authorAvatarUrl} size={24} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <button onClick={() => onOpenProfile(c.authorId)} className="font-mono text-[12px] text-white/50 hover:text-white/70 transition-colors">
                    {c.authorName}
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
                <p className="font-mono text-xs text-white/70 break-words">{c.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <TextInput value={draft} onChange={setDraft} placeholder={t.community.feed.commentPh} maxLength={500} />
        </div>
        <PillButton onClick={handleSend} disabled={!draft.trim() || sending}>
          {t.community.feed.send}
        </PillButton>
      </div>
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
  const parts = content.split(/(#\w+|@\w+|https?:\/\/[^\s]+)/g);
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
      return (
        <button key={i} onClick={() => onMention(part.slice(1))} className="font-mono text-xs transition-colors" style={{ color: '#c084fc' }}>
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
  const { toggleLike, toggleReaction, deletePost, toggleSave, setActiveHashtag } = useCommunityStore();
  const isMrMax = post.authorBadges?.includes('owner');
  const isMod = profile?.isModerator ?? false;
  const isOwn = post.authorId === profile?.id;

  const [showComments, setShowComments] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showModMenu, setShowModMenu] = useState(false);
  const [pollVoting, setPollVoting] = useState(false);
  const { votePoll } = useCommunityStore();

  async function handleVote(optionId: string) {
    setPollVoting(true);
    try { await votePoll(post.id, optionId); } finally { setPollVoting(false); }
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
                <p className="font-mono text-xs text-white/80 truncate">{post.authorName}</p>
              )}
              {post.authorBadges?.length > 0 && <BadgeRow badges={post.authorBadges} />}
            </div>
            <p className="font-mono text-[12px] text-white/30">{timeAgo(post.createdAt)}</p>
          </div>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          {(isMod || isOwn) && (
            <div className="relative">
              <button onClick={() => setShowModMenu(v => !v)} className="font-mono text-[11px] text-white/25 hover:text-white/50 px-1 transition-colors">⋯</button>
              {showModMenu && (
                <div className="absolute right-0 top-full mt-1 z-10 rounded-xl border border-white/10 bg-black/90 backdrop-blur-xl p-2 space-y-1 min-w-[120px]">
                  {isOwn && (
                    <button onClick={() => { deletePost(post.id); setShowModMenu(false); }}
                      className="w-full text-left px-2 py-1 rounded-lg font-mono text-[11px] text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                      {t.community.feed.delete}
                    </button>
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

      {/* Content */}
      <p className="font-mono text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
        {renderContent(post.content, post.hashtags ?? [], tag => { setActiveHashtag(tag); setShowModMenu(false); }, () => {})}
      </p>

      {/* YouTube embed — auto-detected from content or videoUrl */}
      {(() => {
        const ytId = extractYouTubeId(post.content) ?? (post.videoUrl ? extractYouTubeId(post.videoUrl) : null);
        return ytId ? <YouTubeEmbed videoId={ytId} /> : null;
      })()}

      {/* Media */}
      {post.imageUrl && (
        <img src={post.imageUrl} alt="" className="w-full rounded-xl border border-white/10 object-cover max-h-80" />
      )}
      {post.gifUrl && (
        <img src={post.gifUrl} alt="GIF" className="w-full rounded-xl border border-white/10 object-cover max-h-60" />
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
          onClick={() => setShowReport(true)}
          className="ml-auto font-mono text-[11px] text-white/25 hover:text-white/50 uppercase tracking-wider transition-colors"
        >
          {t.community.feed.report}
        </button>
      </div>

      {showComments && <CommentsSection postId={post.id} onOpenProfile={onOpenProfile} myProfileId={profile?.id} />}

      <AnimatePresence>
        {showReport && <ReportModal postId={post.id} onClose={() => setShowReport(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}
