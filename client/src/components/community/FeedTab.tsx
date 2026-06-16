import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import type { CommunityPost, CommunityComment } from '@/types/index';
import {
  Spinner, EmptyState, PillButton, ModalShell, Avatar, TextInput, TextArea, timeAgo,
} from '@/components/community/shared';

function CommentsSection({ postId }: { postId: string }) {
  const t = useT();
  const { fetchComments, addComment } = useCommunityStore();
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
    } finally {
      setSending(false);
    }
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
              <Avatar avatar={c.authorAvatar} avatarUrl={null} size={24} />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] text-white/40">{c.authorName} <span className="text-white/20">· {timeAgo(c.createdAt)}</span></p>
                <p className="font-mono text-xs text-white/70 break-words">{c.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <TextInput value={draft} onChange={setDraft} placeholder={t.community.feed.commentPh} maxLength={500} accent="purple" />
        </div>
        <PillButton onClick={handleSend} disabled={!draft.trim() || sending} accent="purple">
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
    try {
      await reportPost(postId, reason.trim());
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose} accent="purple">
      <h3 className="font-display font-bold text-white text-lg mb-4">{t.community.feed.reportTitle}</h3>
      {sent ? (
        <p className="font-mono text-sm text-white/60">{t.community.feed.reportSent}</p>
      ) : (
        <div className="space-y-3">
          <TextArea value={reason} onChange={setReason} placeholder={t.community.feed.reportReasonPh} maxLength={500} rows={4} accent="purple" />
          <button
            onClick={handleSubmit}
            disabled={!reason.trim() || submitting}
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

function PostCard({
  post, canDelete, onOpenProfile, onDelete, onToggleLike,
}: {
  post: CommunityPost;
  canDelete: boolean;
  onOpenProfile: (playerId: string) => void;
  onDelete: (id: string) => void;
  onToggleLike: (id: string) => void;
}) {
  const t = useT();
  const [showComments, setShowComments] = useState(false);
  const [showReport, setShowReport] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border px-4 py-3.5 space-y-3"
      style={{ borderColor: 'rgba(155,0,255,0.25)', background: 'rgba(255,255,255,0.02)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => onOpenProfile(post.authorId)}
          className="flex items-center gap-2 min-w-0 active:scale-95 transition-transform"
        >
          <Avatar avatar={post.authorAvatar} avatarUrl={post.authorAvatarUrl} size={36} />
          <div className="text-left min-w-0">
            <p className="font-mono text-xs text-white/80 truncate">{post.authorName}</p>
            <p className="font-mono text-[10px] text-white/30">{timeAgo(post.createdAt)}</p>
          </div>
        </button>
        {canDelete && (
          <button
            onClick={() => onDelete(post.id)}
            className="flex-shrink-0 font-mono text-[10px] text-white/25 hover:text-red-400/80 transition-colors px-1"
            aria-label={t.community.feed.delete}
          >
            🗑
          </button>
        )}
      </div>

      <p className="font-mono text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{post.content}</p>
      {post.imageUrl && (
        <img src={post.imageUrl} alt="" className="w-full rounded-xl border border-white/10 object-cover max-h-80" />
      )}

      <div className="flex items-center gap-4 pt-1">
        <button
          onClick={() => onToggleLike(post.id)}
          className="flex items-center gap-1.5 font-mono text-[11px] transition-colors active:scale-95"
          style={{ color: post.likedByMe ? '#9b00ff' : 'rgba(255,255,255,0.4)' }}
        >
          <span>{post.likedByMe ? '♥' : '♡'}</span>
          <span>{post.likesCount}</span>
          <span className="uppercase tracking-wider">{post.likedByMe ? t.community.feed.liked : t.community.feed.like}</span>
        </button>
        <button
          onClick={() => setShowComments(v => !v)}
          className="flex items-center gap-1.5 font-mono text-[11px] text-white/40 hover:text-white/70 transition-colors"
        >
          <span>💬</span>
          <span>{post.commentsCount}</span>
          <span className="uppercase tracking-wider">{showComments ? t.community.feed.comments : t.community.feed.comment}</span>
        </button>
        <button
          onClick={() => setShowReport(true)}
          className="ml-auto font-mono text-[11px] text-white/25 hover:text-white/50 uppercase tracking-wider transition-colors"
        >
          {t.community.feed.report}
        </button>
      </div>

      {showComments && <CommentsSection postId={post.id} />}

      <AnimatePresence>
        {showReport && <ReportModal postId={post.id} onClose={() => setShowReport(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}

export function FeedTab({ onOpenProfile }: { onOpenProfile: (playerId: string) => void }): JSX.Element {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const { feedPosts, feedHasMore, fetchFeed, createPost, deletePost, toggleLike } = useCommunityStore();

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showImageInput, setShowImageInput] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchFeed();
      setLoading(false);
    })();
  }, [fetchFeed]);

  async function handlePost() {
    if (!content.trim() || posting) return;
    setPosting(true);
    try {
      await createPost(content.trim(), imageUrl.trim() || null);
      setContent('');
      setImageUrl('');
      setShowImageInput(false);
    } finally {
      setPosting(false);
    }
  }

  async function handleLoadMore() {
    if (feedPosts.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const oldest = feedPosts[feedPosts.length - 1];
      await fetchFeed(oldest.createdAt);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display font-bold text-white text-lg">{t.community.feed.title}</h2>

      <div
        className="rounded-2xl border px-4 py-3.5 space-y-3"
        style={{ borderColor: 'rgba(155,0,255,0.25)', background: 'rgba(255,255,255,0.02)' }}
      >
        <div className="flex items-start gap-2.5">
          <Avatar avatar={profile?.avatar ?? '?'} avatarUrl={profile?.avatarUrl ?? null} size={36} />
          <div className="flex-1 min-w-0">
            <TextArea value={content} onChange={setContent} placeholder={t.community.feed.composerPh} maxLength={2000} rows={3} accent="purple" />
          </div>
        </div>
        {showImageInput && (
          <TextInput value={imageUrl} onChange={setImageUrl} placeholder="https://…" accent="purple" />
        )}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowImageInput(v => !v)}
            className="font-mono text-[11px] text-white/30 hover:text-white/60 transition-colors px-1"
            aria-label={t.community.feed.addImage}
          >
            🖼
          </button>
          <PillButton onClick={handlePost} disabled={!content.trim() || posting} accent="purple">
            {t.community.feed.post}
          </PillButton>
        </div>
      </div>

      {loading ? (
        <Spinner color="#9b00ff" />
      ) : feedPosts.length === 0 ? (
        <EmptyState text={t.community.feed.empty} />
      ) : (
        <div className="space-y-3">
          {feedPosts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              canDelete={post.authorId === profile?.id || !!profile?.isModerator}
              onOpenProfile={onOpenProfile}
              onDelete={deletePost}
              onToggleLike={toggleLike}
            />
          ))}
          {feedHasMore && (
            <div className="flex justify-center pt-2">
              <PillButton onClick={handleLoadMore} disabled={loadingMore} accent="purple">
                {loadingMore ? '…' : t.community.feed.loadMore}
              </PillButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
