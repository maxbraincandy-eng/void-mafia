import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import { useSocialStore } from '@/store/socialStore';
import { useT } from '@/store/langStore';
import { emitWithAck } from '@/lib/socket';
import type { CommunityProfileV2, CommunityPostV2, CommunityComment, Res } from '@/types/index';
import { Avatar, BadgeRow, MrMaxGlow, Spinner, timeAgo } from '@/components/community/shared';

// ── Lightbox ────────────────────────────────────────────────────────────────

function PostLightbox({ post: initialPost, onClose, isLoggedIn }: {
  post: CommunityPostV2;
  onClose: () => void;
  isLoggedIn: boolean;
}) {
  const [post, setPost] = useState(initialPost);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);

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

  const mediaUrl = post.imageUrl ?? post.gifUrl ?? post.videoUrl;
  const isVideo = !!post.videoUrl && !post.imageUrl && !post.gifUrl;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col"
        style={{
          background: '#0d0a1a',
          border: '1px solid rgba(155,0,255,0.2)',
          maxHeight: '92dvh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Media */}
          {mediaUrl && (
            <div className="w-full" style={{ background: '#000' }}>
              {isVideo ? (
                <video src={mediaUrl} controls className="w-full max-h-72 object-contain" />
              ) : (
                <img src={mediaUrl} alt="" className="w-full max-h-80 object-contain" />
              )}
            </div>
          )}

          <div className="px-4 py-3">
            {/* Author row */}
            <div className="flex items-center gap-2 mb-2">
              <Avatar avatar={post.authorAvatar} avatarUrl={post.authorAvatarUrl} size={32} />
              <div>
                <span className="font-mono text-xs text-white/80 font-semibold">{post.authorName}</span>
                <p className="font-mono text-[9px] text-white/30">{timeAgo(post.createdAt)}</p>
              </div>
            </div>

            {/* Content */}
            {post.content && (
              <p className="font-mono text-xs text-white/75 leading-relaxed mb-3 whitespace-pre-wrap">{post.content}</p>
            )}

            {/* Hashtags */}
            {post.hashtags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {post.hashtags.map(h => (
                  <span key={h} className="font-mono text-[9px]" style={{ color: 'rgba(0,245,255,0.6)' }}>#{h}</span>
                ))}
              </div>
            )}

            {/* Like / comment counts */}
            <div className="flex items-center gap-4 py-2 border-b mb-3" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              {isLoggedIn && (
                <button
                  onClick={handleLike}
                  className="flex items-center gap-1.5 transition-all active:scale-90"
                >
                  <span style={{ fontSize: 18 }}>{post.likedByMe ? '❤️' : '🤍'}</span>
                  <span className="font-mono text-[10px]" style={{ color: post.likedByMe ? '#ff4d6d' : 'rgba(255,255,255,0.5)' }}>
                    {post.likesCount}
                  </span>
                </button>
              )}
              <span className="font-mono text-[10px] text-white/35">
                💬 {post.commentsCount}
              </span>
            </div>

            {/* Comments */}
            <div className="space-y-3 mb-3">
              {!commentsLoaded && <Spinner color="#9b00ff" />}
              {commentsLoaded && comments.length === 0 && (
                <p className="font-mono text-[10px] text-white/25 text-center py-2">No comments yet</p>
              )}
              {comments.map(c => (
                <div key={c.id} className="flex gap-2">
                  <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center font-mono text-[8px] font-bold"
                    style={{ background: 'rgba(155,0,255,0.18)', color: '#c084fc', border: '1px solid rgba(155,0,255,0.25)' }}>
                    {(c.authorName ?? '?').charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-[10px] text-white/60 font-semibold mr-1.5">{c.authorName}</span>
                    <span className="font-mono text-[10px] text-white/70 leading-relaxed break-words">{c.content}</span>
                    <p className="font-mono text-[8px] text-white/25 mt-0.5">{timeAgo(c.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Comment input */}
            {isLoggedIn && (
              <div className="flex gap-2 pb-2">
                <input
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment(); } }}
                  placeholder="Add a comment…"
                  className="flex-1 rounded-xl px-3 py-2 text-white text-xs font-mono outline-none border border-white/8 focus:border-white/20 transition-colors placeholder-white/20"
                  style={{ background: '#0a0715' }}
                />
                <button
                  onClick={handleComment}
                  disabled={!commentText.trim() || posting}
                  className="px-3 py-2 rounded-xl font-mono text-[11px] transition-all active:scale-95 disabled:opacity-40"
                  style={{ background: 'rgba(155,0,255,0.2)', border: '1px solid rgba(155,0,255,0.4)', color: '#c084fc' }}
                >
                  {posting ? '…' : '→'}
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Post text card (Posts tab) ──────────────────────────────────────────────

function PostTextCard({ post, onExpand }: { post: CommunityPostV2; onExpand: () => void }) {
  const POST_TYPE_ICONS: Record<string, string> = {
    text: '', poll: '📊', movie_rec: '🎬', series_rec: '📺',
    book_rec: '📚', music_rec: '🎵', philosophy: '💭',
  };
  const icon = POST_TYPE_ICONS[post.postType] ?? '';

  return (
    <div
      onClick={onExpand}
      className="rounded-2xl p-3 cursor-pointer transition-all active:scale-[0.98]"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="flex items-center gap-1 mb-1.5">
        {icon && <span className="text-xs">{icon}</span>}
        {post.recTitle && (
          <span className="font-mono text-[10px] text-white/50 truncate">{post.recTitle}</span>
        )}
        <span className="font-mono text-[9px] text-white/25 ml-auto">{timeAgo(post.createdAt)}</span>
      </div>
      {post.content && (
        <p className="font-mono text-xs text-white/70 leading-relaxed line-clamp-3">{post.content}</p>
      )}
      {post.poll && (
        <p className="font-mono text-[10px] text-white/40 mt-1">📊 {post.poll.question}</p>
      )}
      {post.hashtags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {post.hashtags.slice(0, 4).map(h => (
            <span key={h} className="font-mono text-[9px]" style={{ color: 'rgba(0,245,255,0.5)' }}>#{h}</span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 mt-2">
        <span className="font-mono text-[9px] text-white/30">❤️ {post.likesCount}</span>
        <span className="font-mono text-[9px] text-white/30">💬 {post.commentsCount}</span>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

interface Props {
  profileId: string;
  onBack: () => void;
}

export function CommunityProfilePage({ profileId, onBack }: Props) {
  const t = useT();
  const currentUser = useAuthStore(s => s.profile);
  const { followUser, unfollowUser } = useCommunityStore();
  const openDmWith = useSocialStore(s => s.openDmWith);

  const [profile, setProfile] = useState<CommunityProfileV2 | null>(null);
  const [posts, setPosts] = useState<CommunityPostV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);
  const [tab, setTab] = useState<'photos' | 'posts'>('photos');
  const [lightboxPost, setLightboxPost] = useState<CommunityPostV2 | null>(null);

  const isSelf = currentUser?.id === profileId;
  const isLoggedIn = !!currentUser;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPostsLoading(true);
    setPosts([]);
    setProfile(null);

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

  const isMrMax = profile?.badges?.includes('owner');

  return (
    <div className="relative">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-white/40 font-mono text-[11px] hover:text-white/70 transition-colors mb-4"
      >
        ← {t.community.debates.back ?? 'Back'}
      </button>

      {loading ? (
        <div className="py-20"><Spinner color="#9b00ff" /></div>
      ) : !profile ? (
        <p className="font-mono text-sm text-white/30 text-center py-16">Profile not found.</p>
      ) : (
        <>
          {/* Cover photo */}
          {profile.coverUrl ? (
            <div className="-mx-4 mb-0 h-32 overflow-hidden rounded-2xl relative">
              <img src={profile.coverUrl} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 50%, rgba(3,0,13,0.8))' }} />
            </div>
          ) : (
            <div
              className="-mx-4 h-20 rounded-2xl mb-0"
              style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.12), rgba(0,245,255,0.06))' }}
            />
          )}

          {/* Avatar + info */}
          <div className="flex items-end gap-3 -mt-8 mb-3 px-1">
            <div className={`flex-shrink-0 ${isMrMax ? 'ring-2 ring-yellow-400/60 ring-offset-2 ring-offset-[#03000d]' : ''} rounded-full`}>
              <Avatar avatar={profile.avatar} avatarUrl={profile.avatarUrl} size={72} />
            </div>
            <div className="pb-0.5 min-w-0 flex-1">
              {isMrMax ? (
                <MrMaxGlow>
                  <h2 className="font-display font-bold text-yellow-300 text-lg leading-tight truncate">{profile.username}</h2>
                </MrMaxGlow>
              ) : (
                <h2 className="font-display font-bold text-white text-lg leading-tight truncate">{profile.username}</h2>
              )}
              {profile.publicId && (
                <span className="font-mono text-[9px] text-white/30">#{profile.publicId}</span>
              )}
            </div>
          </div>

          {/* Badges */}
          {profile.badges?.length > 0 && (
            <div className="flex mb-2 px-1">
              <BadgeRow badges={profile.badges} max={8} />
            </div>
          )}

          {/* Bio */}
          {profile.bio && (
            <p className="font-mono text-xs text-white/55 leading-relaxed mb-3 px-1">{profile.bio}</p>
          )}

          {/* Clan */}
          {profile.clanTag && (
            <p className="font-mono text-[10px] text-white/30 mb-3 px-1">[{profile.clanTag}] {profile.clanName}</p>
          )}

          {/* Stats row */}
          <div
            className="flex items-stretch rounded-2xl overflow-hidden mb-3"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {[
              { label: t.community.profile.posts ?? 'Posts', value: profile.postsCount },
              { label: t.community.profile.followers ?? 'Followers', value: profile.followersCount },
              { label: t.community.profile.following ?? 'Following', value: profile.followingCount },
            ].map((s, i) => (
              <div key={s.label} className="flex-1 py-3 text-center" style={{
                borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none',
              }}>
                <p className="font-display font-bold text-white text-lg leading-none">{s.value}</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-white/35 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          {!isSelf && isLoggedIn && (
            <div className="flex gap-2 mb-4">
              <button
                onClick={handleToggleFollow}
                disabled={followBusy}
                className="flex-1 py-2 rounded-xl font-mono text-[10px] uppercase tracking-wider font-bold transition-all active:scale-95 disabled:opacity-50"
                style={profile.isFollowedByMe ? {
                  background: 'rgba(0,245,255,0.1)',
                  border: '1px solid rgba(0,245,255,0.35)',
                  color: '#00f5ff',
                } : {
                  background: 'rgba(155,0,255,0.2)',
                  border: '1px solid rgba(155,0,255,0.45)',
                  color: '#c084fc',
                }}
              >
                {profile.isFollowedByMe
                  ? (t.community.profile.unfollow ?? 'Unfollow')
                  : (t.community.profile.follow ?? 'Follow')}
              </button>
              <button
                onClick={() => openDmWith(profileId)}
                className="flex-1 py-2 rounded-xl font-mono text-[10px] uppercase tracking-wider font-bold transition-all active:scale-95"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                {t.community.profile.message ?? 'Message'}
              </button>
            </div>
          )}

          {/* Tab switcher */}
          <div className="flex gap-1 mb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: '1px' }}>
            {(['photos', 'posts'] as const).map(id => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="flex items-center gap-1.5 px-4 py-2 font-mono text-[10px] uppercase tracking-wider transition-all"
                style={{
                  color: tab === id ? '#c084fc' : 'rgba(255,255,255,0.35)',
                  borderBottom: tab === id ? '2px solid #9b00ff' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                <span>{id === 'photos' ? '◻' : '≡'}</span>
                <span>{id === 'photos' ? 'Photos' : 'Posts'}</span>
                <span className="ml-0.5 font-mono text-[8px] text-white/25">
                  {id === 'photos' ? mediaPosts.length : textPosts.length}
                </span>
              </button>
            ))}
          </div>

          {/* Content */}
          <AnimatePresence mode="wait">
            {postsLoading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Spinner color="#9b00ff" />
              </motion.div>
            ) : tab === 'photos' ? (
              <motion.div
                key="photos"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {mediaPosts.length === 0 ? (
                  <p className="font-mono text-xs text-white/25 text-center py-12">No photos yet</p>
                ) : (
                  <div className="grid grid-cols-3 gap-0.5">
                    {mediaPosts.map(p => {
                      const thumb = p.imageUrl ?? p.gifUrl ?? p.videoUrl!;
                      const isVideo = !!p.videoUrl && !p.imageUrl && !p.gifUrl;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setLightboxPost(p)}
                          className="relative aspect-square overflow-hidden transition-opacity active:opacity-70"
                          style={{ background: '#0d0a1a' }}
                        >
                          {isVideo ? (
                            <video
                              src={thumb}
                              className="w-full h-full object-cover"
                              muted
                              preload="metadata"
                            />
                          ) : (
                            <img src={thumb} alt="" className="w-full h-full object-cover" />
                          )}
                          {(p.likesCount > 0 || p.commentsCount > 0) && (
                            <div
                              className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 hover:opacity-100 transition-opacity"
                              style={{ background: 'rgba(0,0,0,0.45)' }}
                            >
                              <span className="font-mono text-[10px] text-white">❤️ {p.likesCount}</span>
                              <span className="font-mono text-[10px] text-white">💬 {p.commentsCount}</span>
                            </div>
                          )}
                          {isVideo && (
                            <div className="absolute top-1 right-1">
                              <span className="text-[10px]">▶</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="posts"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-2"
              >
                {textPosts.length === 0 ? (
                  <p className="font-mono text-xs text-white/25 text-center py-12">No posts yet</p>
                ) : (
                  textPosts.map(p => (
                    <PostTextCard key={p.id} post={p} onExpand={() => setLightboxPost(p)} />
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Image lightbox */}
      <AnimatePresence>
        {lightboxPost && (
          <PostLightbox
            post={lightboxPost}
            onClose={() => setLightboxPost(null)}
            isLoggedIn={isLoggedIn}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
