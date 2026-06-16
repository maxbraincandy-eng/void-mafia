import { create } from 'zustand';
import { socket, emitWithAck } from '@/lib/socket';
import type {
  CommunityLounge, CommunityLoungeMember, VoidNewsPost, MaxRecommendation, RecommendCategory,
  DailyThought, CommunityPost, CommunityComment, CommunityEvent, CommunityEventCategory,
  CommunityNotification, CommunityProfile, CommunityReport, Res,
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
  addComment: (postId: string, content: string) => Promise<CommunityComment>;
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

  socket.on('community:post_new', (post: CommunityPost) => {
    set(s => {
      if (s.feedPosts.some(p => p.id === post.id)) return {};
      return { feedPosts: [post, ...s.feedPosts] };
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

    fetchLounges: async () => {
      const lounges = unwrap(await emitWithAck<undefined, Res<CommunityLounge[]>>('community:lounge_list'));
      set({ lounges });
    },
    createLounge: async (name, description) => {
      const lounge = unwrap(await emitWithAck<any, Res<CommunityLounge>>('community:lounge_create', { name, description }));
      set(s => ({ lounges: [...s.lounges, lounge] }));
      return lounge;
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
      set(s => ({ feedPosts: s.feedPosts.filter(p => p.id !== id) }));
    },
    toggleLike: async (postId) => {
      const { likesCount, likedByMe } = unwrap(await emitWithAck<any, Res<{ likesCount: number; likedByMe: boolean }>>('community:post_like', { postId }));
      set(s => ({ feedPosts: s.feedPosts.map(p => p.id === postId ? { ...p, likesCount, likedByMe } : p) }));
    },
    fetchComments: async (postId) => {
      return unwrap(await emitWithAck<any, Res<CommunityComment[]>>('community:post_comments', { postId }));
    },
    addComment: async (postId, content) => {
      const comment = unwrap(await emitWithAck<any, Res<CommunityComment>>('community:post_comment', { postId, content }));
      set(s => ({ feedPosts: s.feedPosts.map(p => p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p) }));
      return comment;
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
  };
});
