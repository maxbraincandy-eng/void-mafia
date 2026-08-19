import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import type {
  CommunityLounge, CommunityLoungeMember, VoidNewsPost, MaxRecommendation, RecommendCategory,
  DailyThought, CommunityPost, CommunityComment, CommunityEvent, CommunityEventCategory,
  CommunityNotification, CommunityProfile, CommunityReport, Res,
  CommunityPostV2, CommunityProfileV2, CommunitySearchResult, FeedCategory, PollResult,
  CommunityLeaderboardEntry,
} from '@/types/index';

function unwrap<T>(res: Res<T>): T {
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

interface CommunityStore {
  lounges: CommunityLounge[];
  news: VoidNewsPost[];
  recommends: MaxRecommendation[];
  thoughts: DailyThought[];
  feedPosts: CommunityPost[];
  feedHasMore: boolean;
  events: CommunityEvent[];
  notifications: CommunityNotification[];
  unreadCount: number;
  reports: CommunityReport[];

  currentLoungeId: string | null;
  loungeMembers: CommunityLoungeMember[];

  fetchLounges: () => Promise<void>;
  createLounge: (name: string, description: string) => Promise<CommunityLounge>;
  deleteLounge: (loungeId: string) => Promise<void>;
  setLoungeLive: (loungeId: string, isLive: boolean, lastTopic?: string) => Promise<void>;
  setCurrentLounge: (loungeId: string | null) => void;
  setLoungeMembers: (members: CommunityLoungeMember[]) => void;

  fetchNews: () => Promise<void>;
  createNews: (title: string, content: string, pinned: boolean) => Promise<void>;
  deleteNews: (id: string) => Promise<void>;

  fetchRecommends: () => Promise<void>;
  createRecommend: (category: RecommendCategory, title: string, review: string, imageUrl: string | null) => Promise<void>;
  deleteRecommend: (id: string) => Promise<void>;

  fetchThoughts: () => Promise<void>;
  createThought: (content: string, pinned: boolean) => Promise<void>;
  deleteThought: (id: string) => Promise<void>;

  fetchFeed: (before?: number) => Promise<void>;
  createPost: (content: string, imageUrl: string | null) => Promise<void>;
  deletePost: (id: string) => Promise<void>;
  toggleLike: (postId: string) => Promise<void>;
  fetchComments: (postId: string) => Promise<CommunityComment[]>;
  addComment: (postId: string, content: string, opts?: { parentId?: string | null; gifUrl?: string | null }) => Promise<CommunityComment>;
  likeComment: (commentId: string) => Promise<{ liked: boolean; likes: number }>;
  reactComment: (commentId: string, emoji: string) => Promise<{ reactions: Record<string, number>; myReaction: string | null }>;
  editPost: (postId: string, content: string) => Promise<void>;
  deleteComment: (postId: string, commentId: string) => Promise<void>;
  reportPost: (postId: string, reason: string) => Promise<void>;

  followUser: (targetId: string) => Promise<void>;
  unfollowUser: (targetId: string) => Promise<void>;
  fetchProfile: (profileId: string) => Promise<CommunityProfile>;

  fetchEvents: () => Promise<void>;
  createEvent: (title: string, description: string, category: CommunityEventCategory, eventAt: number) => Promise<void>;
  joinEvent: (eventId: string) => Promise<void>;
  leaveEvent: (eventId: string) => Promise<void>;

  fetchNotifications: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markNotificationsRead: () => Promise<void>;

  fetchReports: () => Promise<void>;
  resolveReport: (reportId: string, status: string) => Promise<void>;
  banPlayer: (targetProfileId: string, reason: string, duration: number) => Promise<void>;
  unbanPlayer: (targetProfileId: string) => Promise<void>;

  feedCategory: FeedCategory;
  feedV2Posts: CommunityPostV2[];
  feedV2HasMore: boolean;
  savedPosts: CommunityPostV2[];
  onlineMembers: Array<{ playerId: string; username: string; avatar: string; avatarUrl: string | null }>;
  onlineMemberCount: number;
  searchResults: CommunitySearchResult | null;
  searchLoading: boolean;
  activeHashtag: string | null;
  peopleList: CommunityProfileV2[];

  setFeedCategory: (cat: FeedCategory) => void;
  fetchFeedV2: (refresh?: boolean) => Promise<void>;
  createPostV2: (data: any) => Promise<void>;
  votePoll: (postId: string, optionId: string) => Promise<PollResult[]>;
  toggleSave: (postId: string) => Promise<void>;
  fetchSavedPosts: () => Promise<void>;
  setActiveHashtag: (tag: string | null) => void;
  fetchOnlineMembers: () => Promise<void>;
  search: (query: string) => Promise<void>;
  fetchFollowersList: (profileId: string) => Promise<CommunityProfileV2[]>;
  fetchFollowingList: (profileId: string) => Promise<CommunityProfileV2[]>;
  fetchPeopleList: () => Promise<void>;
  updateMyProfile: (data: { bio?: string; coverUrl?: string; favoriteRole?: string }) => Promise<CommunityProfileV2>;

  leaderboard: CommunityLeaderboardEntry[];
  leaderboardLoading: boolean;
  toggleReaction: (postId: string, emoji: string) => Promise<void>;
  fetchLeaderboard: () => Promise<void>;
}

export const useCommunityStore = create<CommunityStore>((set, get) => {
  socket.on('community:lounge_update', (lounge: CommunityLounge) => {
    set(s => {
      const idx = s.lounges.findIndex(l => l.id === lounge.id);
      if (idx === -1) return { lounges: [...s.lounges, lounge] };
      const next = [...s.lounges];
      next[idx] = lounge;
      return { lounges: next };
    });
  });

  socket.on('community:lounge_removed', ({ loungeId }: { loungeId: string }) => {
    set(s => ({ lounges: s.lounges.filter(l => l.id !== loungeId) }));
  });

  socket.on('community:post_new', (post: CommunityPost) => {
    set(s => {
      const alreadyV1 = s.feedPosts.some(p => p.id === post.id);
      const alreadyV2 = s.feedV2Posts.some(p => p.id === post.id);
      return {
        feedPosts: alreadyV1 ? s.feedPosts : [post, ...s.feedPosts],
        feedV2Posts: alreadyV2 ? s.feedV2Posts : [post as any, ...s.feedV2Posts],
      };
    });
  });

  socket.on('community:notification', (n: CommunityNotification) => {
    set(s => ({
      notifications: [n, ...s.notifications],
      unreadCount: s.unreadCount + 1,
    }));
  });

  (socket as any).on('lounge:member_update', ({ loungeId, members }: { loungeId: string; members: CommunityLoungeMember[] }) => {
    if (get().currentLoungeId === loungeId) set({ loungeMembers: members });
  });

  socket.on('community:post_updated', (post: CommunityPostV2) => {
    set(s => ({ feedV2Posts: s.feedV2Posts.map(p => p.id === post.id ? post : p) }));
  });
  socket.on('community:post_pinned', (postId: string) => {
    set(s => ({ feedV2Posts: s.feedV2Posts.map(p => p.id === postId ? { ...p, isPinned: true } : p) }));
  });
  socket.on('community:post_hidden', (postId: string) => {
    set(s => ({ feedV2Posts: s.feedV2Posts.filter(p => p.id !== postId) }));
  });

  // Admin panel deletions
  socket.on('community:post_deleted', ({ postId }: { postId: string }) => {
    set(s => ({
      feedPosts: s.feedPosts.filter(p => p.id !== postId),
      feedV2Posts: s.feedV2Posts.filter(p => p.id !== postId),
    }));
  });
  socket.on('community:comment_deleted', (_payload: { commentId: string }) => {
    // comments are fetched on demand; no cached list to update
  });
  socket.on('community:debate_deleted', (_payload: { debateId: string }) => {
    // debates are managed in debateStore; no action needed here
  });

  return {
    lounges: [],
    news: [],
    recommends: [],
    thoughts: [],
    feedPosts: [],
    feedHasMore: true,
    events: [],
    notifications: [],
    unreadCount: 0,
    reports: [],

    currentLoungeId: null,
    loungeMembers: [],

    feedCategory: 'all',
    feedV2Posts: [],
    feedV2HasMore: true,
    savedPosts: [],
    onlineMembers: [],
    onlineMemberCount: 0,
    searchResults: null,
    searchLoading: false,
    activeHashtag: null,
    peopleList: [],
    leaderboard: [],
    leaderboardLoading: false,

    fetchLounges: async () => {
      const lounges = unwrap(await emitWithAck<undefined, Res<CommunityLounge[]>>('community:lounge_list'));
      set({ lounges });
    },
    createLounge: async (name, description) => {
      const lounge = unwrap(await emitWithAck<any, Res<CommunityLounge>>('community:lounge_create', { name, description }));
      set(s => ({ lounges: [...s.lounges, lounge] }));
      return lounge;
    },
    deleteLounge: async (loungeId) => {
      await emitWithAck<any, Res<null>>('community:lounge_delete', { loungeId });
      set(s => ({ lounges: s.lounges.filter(l => l.id !== loungeId) }));
    },
    setLoungeLive: async (loungeId, isLive, lastTopic) => {
      unwrap(await emitWithAck<any, Res<null>>('community:lounge_set_live', { loungeId, isLive, lastTopic }));
    },
    setCurrentLounge: (loungeId) => set({ currentLoungeId: loungeId, loungeMembers: loungeId ? get().loungeMembers : [] }),
    setLoungeMembers: (members) => set({ loungeMembers: members }),

    fetchNews: async () => {
      const news = unwrap(await emitWithAck<undefined, Res<VoidNewsPost[]>>('community:news_list'));
      set({ news });
    },
    createNews: async (title, content, pinned) => {
      const post = unwrap(await emitWithAck<any, Res<VoidNewsPost>>('community:news_create', { title, content, pinned }));
      set(s => ({ news: [post, ...s.news.filter(n => n.id !== post.id)] }));
    },
    deleteNews: async (id) => {
      unwrap(await emitWithAck<any, Res<null>>('community:news_delete', { id }));
      set(s => ({ news: s.news.filter(n => n.id !== id) }));
    },

    fetchRecommends: async () => {
      const recommends = unwrap(await emitWithAck<undefined, Res<MaxRecommendation[]>>('community:recommend_list'));
      set({ recommends });
    },
    createRecommend: async (category, title, review, imageUrl) => {
      const rec = unwrap(await emitWithAck<any, Res<MaxRecommendation>>('community:recommend_create', { category, title, review, imageUrl }));
      set(s => ({ recommends: [rec, ...s.recommends] }));
    },
    deleteRecommend: async (id) => {
      unwrap(await emitWithAck<any, Res<null>>('community:recommend_delete', { id }));
      set(s => ({ recommends: s.recommends.filter(r => r.id !== id) }));
    },

    fetchThoughts: async () => {
      const thoughts = unwrap(await emitWithAck<undefined, Res<DailyThought[]>>('community:thought_list'));
      set({ thoughts });
    },
    createThought: async (content, pinned) => {
      const thought = unwrap(await emitWithAck<any, Res<DailyThought>>('community:thought_create', { content, pinned }));
      set(s => ({ thoughts: pinned ? [thought, ...s.thoughts.map(t => ({ ...t, pinned: false }))] : [thought, ...s.thoughts] }));
    },
    deleteThought: async (id) => {
      unwrap(await emitWithAck<any, Res<null>>('community:thought_delete', { id }));
      set(s => ({ thoughts: s.thoughts.filter(t => t.id !== id) }));
    },

    fetchFeed: async (before) => {
      const posts = unwrap(await emitWithAck<any, Res<CommunityPost[]>>('community:feed_list', { before }));
      set(s => ({
        feedPosts: before ? [...s.feedPosts, ...posts] : posts,
        feedHasMore: posts.length >= 30,
      }));
    },
    createPost: async (content, imageUrl) => {
      const post = unwrap(await emitWithAck<any, Res<CommunityPost>>('community:post_create', { content, imageUrl }));
      set(s => ({ feedPosts: [post, ...s.feedPosts.filter(p => p.id !== post.id)] }));
    },
    deletePost: async (id) => {
      unwrap(await emitWithAck<any, Res<null>>('community:post_delete', { id }));
      set(s => ({
        feedPosts: s.feedPosts.filter(p => p.id !== id),
        feedV2Posts: s.feedV2Posts.filter(p => p.id !== id),
      }));
    },
    toggleLike: async (postId) => {
      // Optimistic update immediately so the heart flips without waiting for server
      set(s => ({
        feedPosts: s.feedPosts.map(p =>
          p.id === postId ? { ...p, likedByMe: !p.likedByMe, likesCount: p.likedByMe ? Math.max(0, p.likesCount - 1) : p.likesCount + 1 } : p
        ),
        feedV2Posts: s.feedV2Posts.map(p =>
          p.id === postId ? { ...p, likedByMe: !p.likedByMe, likesCount: p.likedByMe ? Math.max(0, p.likesCount - 1) : p.likesCount + 1 } : p
        ),
      }));
      // Sync with server and correct counts
      try {
        const { likesCount, likedByMe } = unwrap(await emitWithAck<any, Res<{ likesCount: number; likedByMe: boolean }>>('community:post_like', { postId }));
        set(s => ({
          feedPosts: s.feedPosts.map(p => p.id === postId ? { ...p, likesCount, likedByMe } : p),
          feedV2Posts: s.feedV2Posts.map(p => p.id === postId ? { ...p, likesCount, likedByMe } : p),
        }));
      } catch {
        // revert optimistic
        set(s => ({
          feedPosts: s.feedPosts.map(p =>
            p.id === postId ? { ...p, likedByMe: !p.likedByMe, likesCount: p.likedByMe ? Math.max(0, p.likesCount - 1) : p.likesCount + 1 } : p
          ),
          feedV2Posts: s.feedV2Posts.map(p =>
            p.id === postId ? { ...p, likedByMe: !p.likedByMe, likesCount: p.likedByMe ? Math.max(0, p.likesCount - 1) : p.likesCount + 1 } : p
          ),
        }));
      }
    },
    fetchComments: async (postId) => {
      return unwrap(await emitWithAck<any, Res<CommunityComment[]>>('community:post_comments', { postId }));
    },
    addComment: async (postId, content, opts) => {
      const comment = unwrap(await emitWithAck<any, Res<CommunityComment>>('community:post_comment', {
        postId, content, parentId: opts?.parentId ?? null, gifUrl: opts?.gifUrl ?? null,
      }));
      set(s => ({
        feedPosts: s.feedPosts.map(p => p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p),
        feedV2Posts: s.feedV2Posts.map(p => p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p),
      }));
      return comment;
    },
    likeComment: async (commentId) => {
      return unwrap(await emitWithAck<any, Res<{ liked: boolean; likes: number }>>('community:comment_like', { commentId }));
    },
    reactComment: async (commentId, emoji) => {
      return unwrap(await emitWithAck<any, Res<{ reactions: Record<string, number>; myReaction: string | null }>>('community:comment_react', { commentId, emoji }));
    },
    editPost: async (postId, content) => {
      const post = unwrap(await emitWithAck<any, Res<CommunityPostV2>>('community:post_edit', { postId, content }));
      set(s => ({
        feedV2Posts: s.feedV2Posts.map(p => p.id === postId ? { ...p, ...post } : p),
        savedPosts: s.savedPosts.map(p => p.id === postId ? { ...p, ...post } : p),
      }));
    },
    deleteComment: async (postId, commentId) => {
      await emitWithAck<any, Res<null>>('community:comment_delete', { commentId });
      set(s => ({
        feedPosts: s.feedPosts.map(p => p.id === postId ? { ...p, commentsCount: Math.max(0, p.commentsCount - 1) } : p),
        feedV2Posts: s.feedV2Posts.map(p => p.id === postId ? { ...p, commentsCount: Math.max(0, p.commentsCount - 1) } : p),
      }));
    },
    reportPost: async (postId, reason) => {
      unwrap(await emitWithAck<any, Res<null>>('community:post_report', { postId, reason }));
    },

    followUser: async (targetId) => {
      unwrap(await emitWithAck<any, Res<null>>('community:follow', { targetId }));
    },
    unfollowUser: async (targetId) => {
      unwrap(await emitWithAck<any, Res<null>>('community:unfollow', { targetId }));
    },
    fetchProfile: async (profileId) => {
      return unwrap(await emitWithAck<any, Res<CommunityProfile>>('community:profile', { profileId }));
    },

    fetchEvents: async () => {
      const events = unwrap(await emitWithAck<undefined, Res<CommunityEvent[]>>('community:event_list'));
      set({ events });
    },
    createEvent: async (title, description, category, eventAt) => {
      const event = unwrap(await emitWithAck<any, Res<CommunityEvent>>('community:event_create', { title, description, category, eventAt }));
      set(s => ({ events: [...s.events, event].sort((a, b) => a.eventAt - b.eventAt) }));
    },
    joinEvent: async (eventId) => {
      unwrap(await emitWithAck<any, Res<null>>('community:event_join', { eventId }));
      set(s => ({
        events: s.events.map(e => e.id === eventId ? { ...e, joinedByMe: true, participantCount: e.participantCount + 1 } : e),
      }));
    },
    leaveEvent: async (eventId) => {
      unwrap(await emitWithAck<any, Res<null>>('community:event_leave', { eventId }));
      set(s => ({
        events: s.events.map(e => e.id === eventId ? { ...e, joinedByMe: false, participantCount: Math.max(0, e.participantCount - 1) } : e),
      }));
    },

    fetchNotifications: async () => {
      const notifications = unwrap(await emitWithAck<undefined, Res<CommunityNotification[]>>('community:notifications'));
      set({ notifications });
    },
    fetchUnreadCount: async () => {
      const unreadCount = unwrap(await emitWithAck<undefined, Res<number>>('community:notifications_unread'));
      set({ unreadCount });
    },
    markNotificationsRead: async () => {
      unwrap(await emitWithAck<undefined, Res<null>>('community:notifications_mark_read'));
      set(s => ({ notifications: s.notifications.map(n => ({ ...n, read: true })), unreadCount: 0 }));
    },

    fetchReports: async () => {
      const reports = unwrap(await emitWithAck<undefined, Res<CommunityReport[]>>('community:report_list'));
      set({ reports });
    },
    resolveReport: async (reportId, status) => {
      unwrap(await emitWithAck<any, Res<null>>('community:report_resolve', { reportId, status }));
      set(s => ({ reports: s.reports.map(r => r.id === reportId ? { ...r, status } : r) }));
    },
    banPlayer: async (targetProfileId, reason, duration) => {
      unwrap(await emitWithAck<any, Res<null>>('community:ban', { targetProfileId, reason, duration }));
    },
    unbanPlayer: async (targetProfileId) => {
      unwrap(await emitWithAck<any, Res<null>>('community:unban', { targetProfileId }));
    },

    setFeedCategory: (cat) => set({ feedCategory: cat, feedV2Posts: [], feedV2HasMore: true }),
    fetchFeedV2: async (refresh = false) => {
      const { feedV2Posts, feedCategory, activeHashtag } = get();
      // What this request is FOR. Tapping between categories leaves two of
      // these in flight, and they do not come back in the order they were sent:
      // the slower one lands last and fills the tab you are looking at with the
      // other tab's posts — or with nothing, if that tab is empty, which reads
      // as "no posts" on a tab that has plenty. Checked again before applying.
      const askedCategory = feedCategory;
      const askedHashtag = activeHashtag;
      // Cursor = the OLDEST loaded NON-PINNED post's timestamp. Pinned posts
      // float to the top of every page (ORDER BY is_pinned DESC) so their old
      // timestamps must NOT anchor the cursor (that would skip everything newer
      // than the pinned post); the chronological stream is the non-pinned posts.
      // Pinned posts re-returned on later pages are deduped out below.
      const nonPinned = feedV2Posts.filter(p => !p.isPinned);
      const before = refresh || nonPinned.length === 0
        ? undefined
        : Math.min(...nonPinned.map(p => p.createdAt));
      const posts = unwrap(await emitWithAck<any, Res<CommunityPostV2[]>>('community:feed_v2', { before, category: feedCategory, hashtag: activeHashtag }));
      set(s => {
        if (s.feedCategory !== askedCategory || s.activeHashtag !== askedHashtag) return {};
        if (refresh) return { feedV2Posts: posts, feedV2HasMore: posts.length >= 20 };
        // Dedupe against what we already have; stop paging once nothing new comes
        // back so infinite scroll terminates cleanly instead of looping.
        const seen = new Set(s.feedV2Posts.map(p => p.id));
        const fresh = posts.filter(p => !seen.has(p.id));
        return {
          feedV2Posts: [...s.feedV2Posts, ...fresh],
          feedV2HasMore: posts.length >= 20 && fresh.length > 0,
        };
      });
    },
    createPostV2: async (data) => {
      const post = unwrap(await emitWithAck<any, Res<CommunityPostV2>>('community:post_create_v2', data));
      // The server broadcasts `community:post_new` to EVERYONE, the author
      // included, so by the time this ack resolves the post is usually already
      // in the list — prepending it unconditionally showed every new post
      // twice until the next refresh. Replace-then-prepend rather than skip:
      // this copy is the authoritative one, and it must end up at the top.
      set(s => ({ feedV2Posts: [post, ...s.feedV2Posts.filter(p => p.id !== post.id)] }));
    },
    votePoll: async (postId, optionId) => {
      const results = unwrap(await emitWithAck<any, Res<PollResult[]>>('community:poll_vote', { postId, optionId }));
      set(s => ({
        feedV2Posts: s.feedV2Posts.map(p => p.id === postId && p.poll ? { ...p, poll: { ...p.poll, results, myVote: optionId } } : p),
      }));
      return results;
    },
    toggleSave: async (postId) => {
      // Server acks { saved } (community:post_save handler).
      const { saved } = unwrap(await emitWithAck<any, Res<{ saved: boolean }>>('community:post_save', { postId }));
      set(s => ({
        feedV2Posts: s.feedV2Posts.map(p => p.id === postId ? { ...p, savedByMe: saved } : p),
      }));
    },
    fetchSavedPosts: async () => {
      const posts = unwrap(await emitWithAck<any, Res<CommunityPostV2[]>>('community:post_saves', {}));
      set({ savedPosts: posts });
    },
    setActiveHashtag: (tag) => set({ activeHashtag: tag, feedV2Posts: [], feedV2HasMore: true }),
    fetchOnlineMembers: async () => {
      try {
        const data = unwrap(await emitWithAck<undefined, Res<{ members: Array<{ playerId: string; username: string; avatar: string; avatarUrl: string | null }>; count: number }>>('community:online_members'));
        set({ onlineMembers: data.members, onlineMemberCount: data.count });
      } catch {}
    },
    search: async (query) => {
      if (!query.trim()) { set({ searchResults: null, searchLoading: false }); return; }
      set({ searchLoading: true });
      try {
        const results = unwrap(await emitWithAck<any, Res<CommunitySearchResult>>('community:search', { query }));
        set({ searchResults: results, searchLoading: false });
      } catch {
        set({ searchLoading: false });
      }
    },
    fetchFollowersList: async (profileId) => {
      return unwrap(await emitWithAck<any, Res<CommunityProfileV2[]>>('community:followers_list', { profileId }));
    },
    fetchFollowingList: async (profileId) => {
      return unwrap(await emitWithAck<any, Res<CommunityProfileV2[]>>('community:following_list', { profileId }));
    },
    fetchPeopleList: async () => {
      try {
        const list = unwrap(await emitWithAck<any, Res<CommunityProfileV2[]>>('community:people_list', {}));
        set({ peopleList: list });
      } catch { set({ peopleList: [] }); }
    },
    updateMyProfile: async (data) => {
      const profile = unwrap(await emitWithAck<any, Res<CommunityProfileV2>>('community:update_profile', data));
      return profile;
    },

    toggleReaction: async (postId, emoji) => {
      const r = await emitWithAck<any, Res<{ reactions: Record<string, number>; myReaction: string | null }>>('community:post_react', { postId, emoji });
      if (r.ok) {
        set(s => ({
          feedV2Posts: s.feedV2Posts.map(p => p.id === postId
            ? { ...p, reactions: r.data.reactions, myReaction: r.data.myReaction, likesCount: Object.values(r.data.reactions).reduce((a, b) => a + b, 0) }
            : p
          ),
        }));
      }
    },
    fetchLeaderboard: async () => {
      set({ leaderboardLoading: true });
      try {
        const r = await emitWithAck<undefined, Res<CommunityLeaderboardEntry[]>>('community:leaderboard');
        if (r.ok) set({ leaderboard: r.data });
      } finally { set({ leaderboardLoading: false }); }
    },
  };
});
