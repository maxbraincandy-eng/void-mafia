import { useState, useEffect, useRef } from 'react';
import { preparePlayback } from '@/lib/voiceCapture';
import { FX_LABEL, type VoiceFx } from '@/lib/voiceFx';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import { useSocialStore } from '@/store/socialStore';
import { useT } from '@/store/langStore';
import { emitWithAck } from '@/lib/socket';
import { compressImage } from '@/lib/imageUtils';
import type { CommunityProfileV2, CommunityPostV2, CommunityComment, PollResult, Res } from '@/types/index';
import { Avatar, BadgeRow, MrMaxGlow, Spinner, timeAgo } from '@/components/community/shared';
import { YouTubeEmbed, extractYouTubeId } from '@/components/community/YouTubeEmbed';
import { PollDisplay } from '@/components/community/PollDisplay';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { useVerifiedTier } from '@/store/verifiedStore';

// ── Post fullscreen lightbox ────────────────────────────────────────────────

function PostLightbox({
  post: initialPost,
  onClose,
  isLoggedIn,
}: {
  post: CommunityPostV2;
  onClose: () => void;
  isLoggedIn: boolean;
}) {
  const t = useT();
  const [post, setPost] = useState(initialPost);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [pollVoting, setPollVoting] = useState(false);

  const handlePollVote = async (optionId: string) => {
    if (pollVoting || !post.poll || !isLoggedIn) return;
    setPollVoting(true);
    try {
      const r = await emitWithAck<any, Res<PollResult[]>>('community:poll_vote', { postId: post.id, optionId });
      if (r.ok) setPost(p => p.poll ? { ...p, poll: { ...p.poll, results: r.data, myVote: optionId } } : p);
    } finally { setPollVoting(false); }
  };

  useEffect(() => {
    emitWithAck<any, Res<CommunityComment[]>>('community:post_comments', { postId: initialPost.id })
      .then(r => { if (r.ok) { setComments(r.data); setCommentsLoaded(true); } });
  }, [initialPost.id]);

  const handleLike = async () => {
    const r = await emitWithAck<any, Res<{ likesCount: number; likedByMe: boolean }>>('community:post_like', { postId: post.id });
    if (r.ok) setPost(p => ({ ...p, ...r.data }));
  };

  const handleComment = async () => {
    if (!commentText.trim() || posting) return;
    setPosting(true);
    try {
      const r = await emitWithAck<any, Res<CommunityComment>>('community:post_comment', { postId: post.id, content: commentText.trim() });
      if (r.ok) {
        setComments(c => [...c, r.data]);
        setPost(p => ({ ...p, commentsCount: p.commentsCount + 1 }));
        setCommentText('');
      }
    } finally { setPosting(false); }
  };

  const mediaUrl  = post.imageUrl ?? post.gifUrl ?? post.videoUrl;
  const isVideo   = !!post.videoUrl && !post.imageUrl && !post.gifUrl;
  const ytIdMedia = isVideo && post.videoUrl ? extractYouTubeId(post.videoUrl) : null;
  const ytIdText  = !ytIdMedia && post.content ? extractYouTubeId(post.content) : null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="w-full max-w-lg rounded-t-3xl flex flex-col"
        style={{
          background: '#0d0a1a',
          border: '1px solid rgba(155,0,255,0.2)',
          borderBottom: 'none',
          maxHeight: '94dvh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top bar: drag handle + close */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 rounded-full mx-auto" style={{ background: 'rgba(255,255,255,0.15)' }} />
          <button
            onClick={onClose}
            className="absolute right-4 top-3 w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 overscroll-contain">
          {/* Media */}
          {ytIdMedia ? (
            <div className="w-full flex-shrink-0 px-4 pt-2">
              <YouTubeEmbed videoId={ytIdMedia} />
            </div>
          ) : mediaUrl ? (
            <div className="w-full flex-shrink-0" style={{ background: '#000' }}>
              {isVideo ? (
                <video src={mediaUrl} controls className="w-full max-h-80 object-contain" />
              ) : (
                <img src={mediaUrl} alt="" className="w-full object-contain" style={{ maxHeight: '55vw', minHeight: 160 }} />
              )}
            </div>
          ) : null}

          {/* YouTube embed from content text */}
          {ytIdText && (
            <div className="w-full flex-shrink-0 px-4 pt-2">
              <YouTubeEmbed videoId={ytIdText} />
            </div>
          )}

          <div className="px-4 pt-3 pb-2">
            {/* Author */}
            <div className="flex items-center gap-2 mb-3">
              <Avatar avatar={post.authorAvatar} avatarUrl={post.authorAvatarUrl} size={34} />
              <div>
                <p className="text-white/85 font-semibold" style={{ fontSize: 13 }}>{post.authorName}</p>
                <p className="text-white/35 font-mono" style={{ fontSize: 12 }}>{timeAgo(post.createdAt)}</p>
              </div>
            </div>

            {/* Caption */}
            {post.content && (
              <p
                className="text-white/80 leading-relaxed mb-3 whitespace-pre-wrap"
                style={{ fontSize: 15, lineHeight: '1.5' }}
              >
                {post.content}
              </p>
            )}

            {/* Voice post audio player */}
            {post.audioUrl && (
              <div style={{ marginTop: 8, marginBottom: 12, borderRadius: 12, overflow: 'hidden', background: 'rgba(155,0,255,0.06)', padding: '8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14 }}>{post.audioFx ? '🎭' : '🎙'}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(155,0,255,0.8)' }}>
                    {post.audioFx ? `შეცვლილი ხმა · ${FX_LABEL[post.audioFx as VoiceFx] ?? post.audioFx}` : 'VOICE POST'}
                  </span>
                </div>
                <audio src={post.audioUrl} controls onPlay={preparePlayback} style={{ width: '100%', height: 32 }} />
              </div>
            )}

            {/* Poll */}
            {post.poll && (
              <div className="mb-3">
                <PollDisplay post={post} onVote={handlePollVote} voting={pollVoting} />
              </div>
            )}

            {/* Hashtags */}
            {post.hashtags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {post.hashtags.map(h => (
                  <span key={h} style={{ fontSize: 11, color: 'rgba(0,245,255,0.65)', fontFamily: 'monospace' }}>#{h}</span>
                ))}
              </div>
            )}

            {/* Like bar */}
            <div
              className="flex items-center gap-5 py-2.5 mb-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.07)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              {isLoggedIn ? (
                <button
                  onClick={handleLike}
                  className="flex items-center gap-1.5 transition-all active:scale-90"
                >
                  <span style={{ fontSize: 20 }}>{post.likedByMe ? '❤️' : '🤍'}</span>
                  <span style={{ fontSize: 12, color: post.likedByMe ? '#ff4d6d' : 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                    {post.likesCount}
                  </span>
                </button>
              ) : (
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>❤️ {post.likesCount}</span>
              )}
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>💬 {post.commentsCount}</span>
            </div>

            {/* Comments */}
            <div className="space-y-3 mb-3">
              {!commentsLoaded && <div className="py-2"><Spinner color="#9b00ff" /></div>}
              {commentsLoaded && comments.length === 0 && (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', padding: '8px 0', fontFamily: 'monospace' }}>
                  {t.commA.noComments}
                </p>
              )}
              {comments.map(c => (
                <div key={c.id} className="flex gap-2">
                  <div className="flex-shrink-0">
                    <Avatar avatar={c.authorAvatar} avatarUrl={c.authorAvatarUrl} size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 600, marginRight: 6 }}>{c.authorName}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: '1.4', wordBreak: 'break-word' }}>{c.content}</span>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', marginTop: 2, fontFamily: 'monospace' }}>{timeAgo(c.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Comment input */}
            {isLoggedIn && (
              <div className="flex gap-2 pb-3">
                <input
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment(); } }}
                  placeholder={t.commA.addCommentPh}
                  className="flex-1 rounded-xl px-3 py-2.5 text-white outline-none border border-white/8 focus:border-white/20 transition-colors placeholder-white/20"
                  style={{ background: '#0a0715', fontSize: 13 }}
                />
                <button
                  onClick={handleComment}
                  disabled={!commentText.trim() || posting}
                  className="px-4 py-2 rounded-xl font-mono transition-all active:scale-95 disabled:opacity-40"
                  style={{ background: 'rgba(155,0,255,0.2)', border: '1px solid rgba(155,0,255,0.4)', color: '#c084fc', fontSize: 13 }}
                >
                  {posting ? '…' : '→'}
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

// ── Post text card (Posts tab) ──────────────────────────────────────────────

const READ_MORE_THRESHOLD = 180; // chars before showing "read more"

const POST_TYPE_ICONS: Record<string, string> = {
  text: '', poll: '📊', movie_rec: '🎬', series_rec: '📺',
  book_rec: '📚', music_rec: '🎵', philosophy: '💭',
};

function PostTextCard({ post: initialPost, readMoreLabel, onExpand }: {
  post: CommunityPostV2;
  readMoreLabel: string;
  onExpand: () => void;
}) {
  const [post, setPost] = useState(initialPost);
  const [pollVoting, setPollVoting] = useState(false);

  const handleVote = async (optionId: string) => {
    if (pollVoting || !post.poll) return;
    setPollVoting(true);
    try {
      const r = await emitWithAck<any, Res<PollResult[]>>('community:poll_vote', { postId: post.id, optionId });
      if (r.ok) setPost(p => p.poll ? { ...p, poll: { ...p.poll, results: r.data, myVote: optionId } } : p);
    } finally { setPollVoting(false); }
  };

  const icon    = POST_TYPE_ICONS[post.postType] ?? '';
  const isLong  = (post.content?.length ?? 0) > READ_MORE_THRESHOLD;
  const ytId    = extractYouTubeId(post.videoUrl ?? '') ?? extractYouTubeId(post.content ?? '');

  return (
    <div
      className="rounded-2xl cursor-pointer transition-all active:scale-[0.985]"
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.09)' }}
    >
      <div className="p-4" onClick={onExpand}>
        {/* Header row */}
        <div className="flex items-center gap-2 mb-2">
          {icon && <span style={{ fontSize: 15 }}>{icon}</span>}
          {post.recTitle && (
            <span className="font-mono truncate" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{post.recTitle}</span>
          )}
          <span className="font-mono ml-auto flex-shrink-0" style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>{timeAgo(post.createdAt)}</span>
        </div>

        {/* Content */}
        {post.content && (
          <p
            className={isLong ? 'line-clamp-3' : ''}
            style={{ fontSize: 16, lineHeight: '1.45', color: 'rgba(255,255,255,0.82)' }}
          >
            {post.content}
          </p>
        )}

        {/* YouTube thumbnail preview */}
        {ytId && (
          <div className="relative mt-2 rounded-xl overflow-hidden" style={{ aspectRatio: '16/9', background: '#000' }}>
            <img src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.3)' }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,0,0,0.9)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
          </div>
        )}

        {/* Poll — full interactive display */}
        {post.poll && (
          <div onClick={e => e.stopPropagation()} className="mt-2">
            <PollDisplay post={post} onVote={handleVote} voting={pollVoting} />
          </div>
        )}

        {/* Voice post audio player */}
        {post.audioUrl && (
          <div style={{ marginTop: 8, borderRadius: 12, overflow: 'hidden', background: 'rgba(155,0,255,0.06)', padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 14 }}>{post.audioFx ? '🎭' : '🎙'}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(155,0,255,0.8)' }}>
                {post.audioFx ? `შეცვლილი ხმა · ${FX_LABEL[post.audioFx as VoiceFx] ?? post.audioFx}` : 'VOICE POST'}
              </span>
            </div>
            <audio src={post.audioUrl} controls onPlay={preparePlayback} style={{ width: '100%', height: 32 }} />
          </div>
        )}

        {/* Read more */}
        {isLong && (
          <span
            style={{ fontSize: 12, color: 'rgba(0,245,255,0.7)', display: 'inline-block', marginTop: 6, fontFamily: 'monospace' }}
          >
            {readMoreLabel} →
          </span>
        )}

        {/* Hashtags */}
        {post.hashtags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {post.hashtags.slice(0, 5).map(h => (
              <span key={h} style={{ fontSize: 12, color: 'rgba(0,245,255,0.55)', fontFamily: 'monospace' }}>#{h}</span>
            ))}
          </div>
        )}

        {/* Reaction row */}
        <div className="flex items-center gap-4 mt-3">
          {(() => {
            const rxn = post.reactions ?? {};
            const total = Object.values(rxn).reduce((a, b) => a + b, 0) || post.likesCount;
            const top = Object.entries(rxn).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e);
            const hasMyReaction = !!post.myReaction;
            return (
              <span
                style={{
                  fontSize: 11, fontFamily: 'monospace',
                  color: hasMyReaction ? '#c084fc' : 'rgba(255,255,255,0.35)',
                  background: hasMyReaction ? 'rgba(155,0,255,0.12)' : 'transparent',
                  border: hasMyReaction ? '1px solid rgba(155,0,255,0.3)' : '1px solid transparent',
                  borderRadius: 16, padding: '2px 8px',
                }}
              >
                {top.length > 0 ? top.join('') : '❤️'} {total}
              </span>
            );
          })()}
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>💬 {post.commentsCount}</span>
        </div>
      </div>
    </div>
  );
}

// ── Followers / Following sheet ─────────────────────────────────────────────

function FollowListSheet({
  profileId,
  type,
  onClose,
  onOpenProfile,
}: {
  profileId: string;
  type: 'followers' | 'following';
  onClose: () => void;
  onOpenProfile: (id: string) => void;
}) {
  const [list, setList] = useState<CommunityProfileV2[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useT();

  useEffect(() => {
    const event = type === 'followers' ? 'community:followers_list' : 'community:following_list';
    emitWithAck<any, Res<CommunityProfileV2[]>>(event as any, { profileId })
      .then(r => { if (r.ok) setList(r.data); })
      .finally(() => setLoading(false));
  }, [profileId, type]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        className="absolute bottom-0 left-0 right-0 flex flex-col rounded-t-2xl overflow-hidden"
        style={{ maxHeight: '75vh', background: 'rgba(6,0,20,0.98)', border: '1px solid rgba(155,0,255,0.18)', borderBottom: 'none' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
        </div>
        {/* Title */}
        <div className="px-4 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="font-display font-bold text-white text-base">
            {type === 'followers' ? t.community.profile.followers : t.community.profile.following}
          </p>
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto pb-8">
          {loading && (
            <div className="flex justify-center py-10"><Spinner /></div>
          )}
          {!loading && list.length === 0 && (
            <p className="text-center font-mono text-white/25 text-sm py-10">{t.commA.listEmpty}</p>
          )}
          {list.map(person => (
            <button
              key={person.id}
              className="w-full flex items-center gap-3 px-4 py-3 transition-all active:bg-white/5 text-left"
              onClick={() => { onClose(); onOpenProfile(person.id); }}
            >
              <Avatar avatar={person.avatar} avatarUrl={person.avatarUrl ?? null} size={40} />
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-white text-sm truncate">{person.username}</p>
                <p className="font-mono text-white/35 text-xs">
                  {t.community.profile.followers} {person.followersCount}
                </p>
              </div>
              {person.isFollowedByMe && (
                <span className="font-mono text-[10px] text-neon-cyan/60 border border-neon-cyan/20 rounded-lg px-2 py-0.5 flex-shrink-0">
                  {t.community.profile.unfollow.replace(/^un/i, '') || 'following'}
                </span>
              )}
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function parseCoverUrl(url: string): { type: 'gradient' | 'image'; src: string; posY: number } {
  if (url.startsWith('gradient:')) return { type: 'gradient', src: url.slice(9), posY: 50 };
  if (url.startsWith('imagepos:')) {
    const rest = url.slice(9);
    const i = rest.indexOf(':');
    return { type: 'image', src: rest.slice(i + 1), posY: parseInt(rest.slice(0, i), 10) || 50 };
  }
  return { type: 'image', src: url, posY: 50 };
}

// ── Main community profile page ─────────────────────────────────────────────

interface Props {
  profileId: string;
  onBack: () => void;
  onNavigate?: (id: string) => void;
}

export function CommunityProfilePage({ profileId, onBack, onNavigate }: Props) {
  const t = useT();
  const currentUser = useAuthStore(s => s.profile);
  const uploadAvatar = useAuthStore(s => s.uploadAvatar);
  const { followUser, unfollowUser } = useCommunityStore();
  const openDmWith = useSocialStore(s => s.openDmWith);

  const [profile, setProfile]         = useState<CommunityProfileV2 | null>(null);
  const [posts, setPosts]             = useState<CommunityPostV2[]>([]);
  const [loading, setLoading]         = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);
  const [followBusy, setFollowBusy]   = useState(false);
  const [tab, setTab]                 = useState<'photos' | 'posts' | 'saved'>('photos');
  const [saved, setSaved]             = useState<CommunityPostV2[] | null>(null);
  const [lightboxPost, setLightboxPost] = useState<CommunityPostV2 | null>(null);
  const [followSheet, setFollowSheet] = useState<'followers' | 'following' | null>(null);
  const [bannerPicker, setBannerPicker] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerPosY, setBannerPosY] = useState(50);
  const dragRef = useRef<{ startY: number; startPos: number } | null>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const isSelf     = currentUser?.id === profileId;
  const isLoggedIn = !!currentUser;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPostsLoading(true);
    setPosts([]);
    setProfile(null);
    setTab('photos');

    emitWithAck<any, Res<CommunityProfileV2>>('community:profile', { profileId }).then(r => {
      if (!cancelled && r.ok) setProfile(r.data);
      if (!cancelled) setLoading(false);
    });

    emitWithAck<any, Res<CommunityPostV2[]>>('community:user_posts', { authorId: profileId }).then(r => {
      if (!cancelled && r.ok) setPosts(r.data);
      if (!cancelled) setPostsLoading(false);
    });

    return () => { cancelled = true; };
  }, [profileId]);

  const handleToggleFollow = async () => {
    if (!profile || followBusy || isSelf) return;
    setFollowBusy(true);
    const was = profile.isFollowedByMe;
    setProfile(p => p ? {
      ...p,
      isFollowedByMe: !was,
      followersCount: was ? Math.max(0, p.followersCount - 1) : p.followersCount + 1,
    } : p);
    try {
      if (was) await unfollowUser(profileId);
      else await followUser(profileId);
    } catch {
      setProfile(p => p ? {
        ...p,
        isFollowedByMe: was,
        followersCount: was ? p.followersCount + 1 : Math.max(0, p.followersCount - 1),
      } : p);
    } finally { setFollowBusy(false); }
  };

  const mediaPosts = posts.filter(p => p.imageUrl || p.gifUrl || p.videoUrl);
  const textPosts  = posts.filter(p => !p.imageUrl && !p.gifUrl && !p.videoUrl);
  const isMrMax    = profile?.badges?.includes('owner');
  // Verification is resolved from the owner list, not from the local badge
  // array, so it stays true wherever this profile is rendered from.
  const verifiedTier = useVerifiedTier(profile?.id ?? null);
  const coverParsed = profile?.coverUrl ? parseCoverUrl(profile.coverUrl) : null;

  const BANNER_PRESETS = [
    { id: 'none', css: '', label: t.commA.bannerNone },
    { id: 'cyber-purple', css: 'linear-gradient(135deg, #1a0533 0%, #4a0e8f 40%, #9b00ff 100%)', label: '' },
    { id: 'neon-sunset', css: 'linear-gradient(135deg, #0d0221 0%, #6b0f1a 35%, #ff4d6d 70%, #fca311 100%)', label: '' },
    { id: 'ocean-glow', css: 'linear-gradient(135deg, #020024 0%, #003d5b 40%, #00d4ff 90%)', label: '' },
    { id: 'void-matrix', css: 'linear-gradient(135deg, #000 0%, #003300 50%, #00ff41 100%)', label: '' },
    { id: 'aurora', css: 'linear-gradient(135deg, #0d001a 0%, #1b4332 30%, #40916c 55%, #95d5b2 80%, #d8f3dc 100%)', label: '' },
    { id: 'fire-ice', css: 'linear-gradient(135deg, #2d00f7 0%, #6a00f4 25%, #ff0a54 75%, #ff7b00 100%)', label: '' },
    { id: 'midnight', css: 'linear-gradient(135deg, #0a0a23 0%, #1f1147 40%, #4361ee 80%, #7209b7 100%)', label: '' },
    { id: 'blood-moon', css: 'linear-gradient(135deg, #1a0000 0%, #660000 40%, #cc0000 70%, #ff4444 100%)', label: '' },
    { id: 'toxic', css: 'linear-gradient(135deg, #0a0a0a 0%, #1a3a0a 30%, #39ff14 70%, #c8ff00 100%)', label: '' },
    { id: 'galaxy', css: 'linear-gradient(135deg, #0d0221 0%, #150050 25%, #3f0d73 50%, #8e2de2 75%, #e040fb 100%)', label: '' },
    { id: 'gold', css: 'linear-gradient(135deg, #1a1200 0%, #5c4b00 35%, #ffd700 70%, #fff8dc 100%)', label: '' },
    { id: 'arctic', css: 'linear-gradient(135deg, #020b1a 0%, #0e4d92 35%, #00b4d8 65%, #caf0f8 100%)', label: '' },
  ];

  const handleBannerSelect = async (preset: typeof BANNER_PRESETS[0]) => {
    setBannerSaving(true);
    const coverUrl = preset.id === 'none' ? '' : `gradient:${preset.css}`;
    try {
      const r = await emitWithAck<any, Res<CommunityProfileV2>>('community:profile_update', { coverUrl });
      if (r.ok) setProfile(r.data);
    } finally {
      setBannerSaving(false);
      setBannerPicker(false);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file, 1200, 0.75);
      setBannerPreview(dataUrl);
      setBannerPosY(50);
    } catch { /* ignore */ }
  };

  const handleBannerSave = async () => {
    if (!bannerPreview) return;
    setBannerSaving(true);
    try {
      const coverUrl = `imagepos:${Math.round(bannerPosY)}:${bannerPreview}`;
      const r = await emitWithAck<any, Res<CommunityProfileV2>>('community:profile_update', { coverUrl });
      if (r.ok) setProfile(r.data);
      setBannerPreview(null);
      setBannerPicker(false);
    } finally { setBannerSaving(false); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarUploading(true);
    try {
      const resized = await compressImage(file, 200, 0.7);
      const res = await uploadAvatar(resized);
      if (res.ok) {
        const r = await emitWithAck<any, Res<CommunityProfileV2>>('community:profile', { profileId });
        if (r.ok) setProfile(r.data);
      }
    } catch { /* ignore */ }
    finally { setAvatarUploading(false); }
  };

  // Saved posts (own profile only) — fetched lazily when the tab opens.
  useEffect(() => {
    if (tab !== 'saved' || !isSelf || saved !== null) return;
    emitWithAck<any, Res<CommunityPostV2[]>>('community:post_saves', {}).then(r => {
      setSaved(r.ok ? r.data : []);
    }).catch(() => setSaved([]));
  }, [tab, isSelf, saved]);

  return (
    <div className="relative">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors mb-4"
        style={{ fontSize: 12, fontFamily: 'monospace' }}
      >
        ← {t.community.debates?.back ?? 'Back'}
      </button>

      {loading ? (
        <div className="py-20 flex justify-center"><Spinner color="#9b00ff" /></div>
      ) : !profile ? (
        <p className="font-mono text-sm text-white/30 text-center py-16">{t.commA.profileNotFound}</p>
      ) : (
        <>
          {/* Cover */}
          {coverParsed ? (
            <div className="-mx-4 h-36 overflow-hidden rounded-2xl relative mb-0">
              {coverParsed.type === 'gradient' ? (
                <div className="w-full h-full" style={{ background: coverParsed.src }} />
              ) : (
                <img src={coverParsed.src} alt="" className="w-full h-full object-cover" style={{ objectPosition: `center ${coverParsed.posY}%` }} />
              )}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 10%, rgba(3,0,13,0.4) 40%, rgba(3,0,13,0.85) 70%, rgba(3,0,13,1) 100%)' }} />
              {isSelf && (
                <button
                  onClick={() => setBannerPicker(true)}
                  className="absolute top-2 right-2 px-2 py-1 rounded-lg font-mono text-white/60 hover:text-white transition-all active:scale-95"
                  style={{ fontSize: 11, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
                >
                  {t.commA.editBanner}
                </button>
              )}
            </div>
          ) : (
            <div
              className="-mx-4 h-24 rounded-2xl mb-0 relative"
              style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.14), rgba(0,245,255,0.07))' }}
            >
              {isSelf && (
                <button
                  onClick={() => setBannerPicker(true)}
                  className="absolute top-2 right-2 px-2 py-1 rounded-lg font-mono text-white/40 hover:text-white/70 transition-all active:scale-95"
                  style={{ fontSize: 11, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)' }}
                >
                  {t.commA.addBanner}
                </button>
              )}
            </div>
          )}

          {/* Avatar row */}
          <div className="relative z-10 flex items-end gap-3 -mt-9 mb-3 px-1">
            <div
              className={`flex-shrink-0 rounded-full relative ${isMrMax ? 'ring-2 ring-yellow-400/60 ring-offset-2 ring-offset-[#03000d]' : ''}`}
              style={{ background: '#03000d', padding: 3 }}
            >
              <Avatar avatar={profile.avatar} avatarUrl={profile.avatarUrl} size={76} />
              {isSelf && (
                <button
                  onClick={() => avatarFileRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
                  style={{ background: 'rgba(155,0,255,0.9)', border: '2px solid #03000d', fontSize: 13 }}
                >
                  {avatarUploading ? <span className="text-white" style={{ fontSize: 10 }}>…</span> : <span>📷</span>}
                </button>
              )}
              <input ref={avatarFileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
            <div className="pb-1 min-w-0 flex-1">
              {/* The badge sits beside the name at both variants, and outside the
                  truncating h2 so a long name ellipsises instead of pushing the
                  badge off the row. */}
              <div className="flex items-center gap-1.5 min-w-0">
                {isMrMax ? (
                  <MrMaxGlow>
                    <h2 className="font-display font-bold text-yellow-300 leading-tight truncate" style={{ fontSize: 20 }}>{profile.username}</h2>
                  </MrMaxGlow>
                ) : (
                  <h2 className="font-display font-bold text-white leading-tight truncate" style={{ fontSize: 20 }}>{profile.username}</h2>
                )}
                {verifiedTier && <VerifiedBadge size={18} tone={verifiedTier === 'owner' ? 'owner' : 'staff'} />}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className="font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                  style={{ fontSize: 12, background: 'rgba(155,0,255,0.15)', color: '#c084fc', border: '1px solid rgba(155,0,255,0.3)' }}
                >
                  {t.community.profile.level} {profile.level}
                </span>
                {profile.publicId && (
                  <span className="font-mono text-white/25" style={{ fontSize: 12 }}>#{profile.publicId}</span>
                )}
              </div>
            </div>
          </div>

          {/* Badges */}
          {profile.badges?.length > 0 && (
            <div className="flex mb-2 px-1"><BadgeRow badges={profile.badges} max={8} /></div>
          )}

          {/* Bio */}
          {profile.bio && (
            <p className="text-white/58 leading-relaxed mb-3 px-1" style={{ fontSize: 13 }}>{profile.bio}</p>
          )}

          {/* Clan */}
          {profile.clanTag && (
            <p className="font-mono text-white/30 mb-3 px-1" style={{ fontSize: 11 }}>[{profile.clanTag}] {profile.clanName}</p>
          )}

          {/* Stats */}
          <div
            className="flex items-stretch rounded-2xl overflow-hidden mb-3"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {[
              { label: t.community.profile.posts,      value: profile.postsCount,      onClick: undefined },
              { label: t.community.profile.followers,  value: profile.followersCount,  onClick: () => setFollowSheet('followers') },
              { label: t.community.profile.following,  value: profile.followingCount,  onClick: () => setFollowSheet('following') },
            ].map((s, i) => (
              <button
                key={s.label}
                className="flex-1 py-3 text-center transition-all active:bg-white/5"
                style={{ borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.07)' : 'none', cursor: s.onClick ? 'pointer' : 'default' }}
                onClick={s.onClick}
                disabled={!s.onClick}
              >
                <p className="font-display font-bold text-white" style={{ fontSize: 20, lineHeight: 1 }}>{s.value}</p>
                <p className="font-mono uppercase tracking-wider mt-1" style={{ fontSize: 12, color: s.onClick ? 'rgba(180,130,255,0.7)' : 'rgba(255,255,255,0.35)' }}>{s.label}</p>
              </button>
            ))}
          </div>

          {/* Action buttons */}
          {!isSelf && isLoggedIn && (
            <div className="flex gap-2 mb-4">
              <button
                onClick={handleToggleFollow}
                disabled={followBusy}
                className="flex-1 py-2.5 rounded-xl font-mono uppercase tracking-wider font-bold transition-all active:scale-95 disabled:opacity-50"
                style={profile.isFollowedByMe ? {
                  fontSize: 11,
                  background: 'rgba(0,245,255,0.09)',
                  border: '1px solid rgba(0,245,255,0.3)',
                  color: '#00f5ff',
                } : {
                  fontSize: 11,
                  background: 'rgba(155,0,255,0.2)',
                  border: '1px solid rgba(155,0,255,0.45)',
                  color: '#c084fc',
                }}
              >
                {profile.isFollowedByMe ? t.community.profile.unfollow : t.community.profile.follow}
              </button>
              <button
                onClick={() => openDmWith(profileId)}
                className="flex-1 py-2.5 rounded-xl font-mono uppercase tracking-wider font-bold transition-all active:scale-95"
                style={{
                  fontSize: 11,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.11)',
                  color: 'rgba(255,255,255,0.55)',
                }}
              >
                {t.community.profile.message}
              </button>
            </div>
          )}

          {/* Tab bar */}
          <div
            className="flex mb-4"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
          >
            {([
              { id: 'photos' as const, label: t.community.profile.photos, icon: '▦', count: mediaPosts.length },
              { id: 'posts'  as const, label: t.community.profile.posts,                 icon: '≡', count: textPosts.length },
              ...(isSelf ? [{ id: 'saved' as const, label: t.commA.saved, icon: '🔖', count: saved?.length ?? 0 }] : []),
            ]).map(tb => (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                className="flex items-center gap-1.5 px-4 py-2.5 font-mono uppercase tracking-wider transition-all"
                style={{
                  fontSize: 12,
                  color: tab === tb.id ? '#c084fc' : 'rgba(255,255,255,0.35)',
                  borderBottom: tab === tb.id ? '2px solid #9b00ff' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                <span>{tb.icon}</span>
                <span>{tb.label}</span>
                <span className="text-white/25" style={{ fontSize: 12, marginLeft: 2 }}>{tb.count}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <AnimatePresence mode="wait">
            {postsLoading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-12 flex justify-center">
                <Spinner color="#9b00ff" />
              </motion.div>
            ) : tab === 'photos' ? (
              <motion.div key="photos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                {mediaPosts.length === 0 ? (
                  <p className="font-mono text-white/25 text-center py-12" style={{ fontSize: 13 }}>{t.commA.noPhotos}</p>
                ) : (
                  <div className="grid grid-cols-3 lg:grid-cols-5" style={{ gap: 2 }}>
                    {mediaPosts.map(p => {
                      const isVideo = !!p.videoUrl && !p.imageUrl && !p.gifUrl;
                      const ytId    = isVideo && p.videoUrl ? extractYouTubeId(p.videoUrl) : null;
                      const thumb   = ytId
                        ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
                        : (p.imageUrl ?? p.gifUrl ?? p.videoUrl!);
                      return (
                        <button
                          key={p.id}
                          onClick={() => setLightboxPost(p)}
                          className="relative overflow-hidden transition-opacity active:opacity-70"
                          style={{ background: '#0d0a1a', aspectRatio: '1 / 1' }}
                        >
                          {isVideo && !ytId ? (
                            <video src={thumb} className="w-full h-full object-cover" muted preload="metadata" />
                          ) : (
                            <img src={thumb} alt="" className="w-full h-full object-cover" />
                          )}
                          {/* hover overlay (desktop) */}
                          <div
                            className="absolute inset-0 items-center justify-center gap-2 opacity-0 hover:opacity-100 transition-opacity hidden sm:flex"
                            style={{ background: 'rgba(0,0,0,0.5)' }}
                          >
                            <span style={{ fontSize: 11, color: '#fff', fontFamily: 'monospace' }}>❤️ {p.likesCount}</span>
                            <span style={{ fontSize: 11, color: '#fff', fontFamily: 'monospace' }}>💬 {p.commentsCount}</span>
                          </div>
                          {isVideo && (
                            <div className="absolute top-1.5 right-1.5 rounded-full flex items-center justify-center"
                              style={{ background: ytId ? 'rgba(255,0,0,0.85)' : 'rgba(0,0,0,0.55)', width: 20, height: 20 }}>
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : tab === 'saved' ? (
              <motion.div key="saved" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex flex-col gap-2.5">
                {saved === null ? (
                  <div className="py-12 flex justify-center"><Spinner color="#9b00ff" /></div>
                ) : saved.length === 0 ? (
                  <p className="font-mono text-white/25 text-center py-12" style={{ fontSize: 13 }}>{t.commA.noSaved}</p>
                ) : (
                  saved.map(p => (
                    <PostTextCard
                      key={p.id}
                      post={p}
                      readMoreLabel={t.community.profile.readMore}
                      onExpand={() => setLightboxPost(p)}
                    />
                  ))
                )}
              </motion.div>
            ) : (
              <motion.div key="posts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex flex-col gap-2.5">
                {textPosts.length === 0 ? (
                  <p className="font-mono text-white/25 text-center py-12" style={{ fontSize: 13 }}>{t.commA.noPosts}</p>
                ) : (
                  textPosts.map(p => (
                    <PostTextCard
                      key={p.id}
                      post={p}
                      readMoreLabel={t.community.profile.readMore}
                      onExpand={() => setLightboxPost(p)}
                    />
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxPost && (
          <PostLightbox
            post={lightboxPost}
            onClose={() => setLightboxPost(null)}
            isLoggedIn={isLoggedIn}
          />
        )}
      </AnimatePresence>

      {/* Followers / Following sheet */}
      <AnimatePresence>
        {followSheet && (
          <FollowListSheet
            profileId={profileId}
            type={followSheet}
            onClose={() => setFollowSheet(null)}
            onOpenProfile={id => { setFollowSheet(null); onNavigate ? onNavigate(id) : onBack(); }}
          />
        )}
      </AnimatePresence>

      {/* Banner picker modal */}
      {bannerPicker && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => { setBannerPreview(null); setBannerPicker(false); }}
        >
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="w-full max-w-md rounded-t-2xl p-4 pb-8"
            style={{ background: '#0d0a1a', border: '1px solid rgba(155,0,255,0.2)', borderBottom: 'none' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-display font-bold text-white" style={{ fontSize: 16 }}>
                {bannerPreview ? t.commA.pickPosition : t.commA.pickBanner}
              </p>
              <button onClick={() => bannerPreview ? setBannerPreview(null) : setBannerPicker(false)} className="text-white/40 hover:text-white/70 text-lg">✕</button>
            </div>

            {bannerPreview ? (
              <>
                <p className="font-mono text-white/40 text-center mb-2" style={{ fontSize: 11 }}>
                  {t.commA.dragHint}
                </p>
                <div
                  className="w-full h-36 rounded-xl overflow-hidden mb-4 cursor-grab active:cursor-grabbing"
                  style={{ border: '2px solid rgba(155,0,255,0.4)', touchAction: 'none' }}
                  onPointerDown={e => {
                    dragRef.current = { startY: e.clientY, startPos: bannerPosY };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={e => {
                    if (!dragRef.current) return;
                    const delta = e.clientY - dragRef.current.startY;
                    setBannerPosY(Math.max(0, Math.min(100, dragRef.current.startPos - delta * 0.5)));
                  }}
                  onPointerUp={() => { dragRef.current = null; }}
                >
                  <img
                    src={bannerPreview}
                    alt=""
                    className="w-full h-full object-cover pointer-events-none select-none"
                    style={{ objectPosition: `center ${bannerPosY}%` }}
                    draggable={false}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setBannerPreview(null)}
                    className="flex-1 py-2.5 rounded-xl font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' }}
                  >
                    {t.commA.cancel}
                  </button>
                  <button
                    onClick={handleBannerSave}
                    disabled={bannerSaving}
                    className="flex-1 py-2.5 rounded-xl font-mono text-[12px] uppercase tracking-wider font-bold transition-all active:scale-95 disabled:opacity-50"
                    style={{ background: 'rgba(155,0,255,0.25)', border: '1px solid rgba(155,0,255,0.5)', color: '#c084fc' }}
                  >
                    {bannerSaving ? '...' : t.commA.setBanner}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Upload image button */}
                <label
                  className="flex items-center justify-center gap-2 w-full py-3 mb-3 rounded-xl font-mono text-[12px] uppercase tracking-wider cursor-pointer transition-all active:scale-95"
                  style={{ background: 'rgba(155,0,255,0.12)', border: '1px solid rgba(155,0,255,0.35)', color: '#c084fc' }}
                >
                  {bannerSaving ? '…' : t.commA.uploadImage}
                  <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} disabled={bannerSaving} />
                </label>

                <p className="font-mono text-[10px] text-white/25 uppercase tracking-widest mb-2">{t.commA.orGradient}</p>
                <div className="grid grid-cols-3 lg:grid-cols-5 gap-2">
                  {BANNER_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => handleBannerSelect(preset)}
                      disabled={bannerSaving}
                      className="rounded-xl overflow-hidden transition-all active:scale-95 disabled:opacity-50"
                      style={{
                        height: 56,
                        background: preset.id === 'none' ? 'rgba(255,255,255,0.04)' : preset.css,
                        border: (profile?.coverUrl === `gradient:${preset.css}` || (preset.id === 'none' && !profile?.coverUrl))
                          ? '2px solid #9b00ff'
                          : '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      {preset.id === 'none' && <span className="text-white/30 font-mono" style={{ fontSize: 11 }}>{preset.label}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </div>,
        document.body,
      )}
    </div>
  );
}
