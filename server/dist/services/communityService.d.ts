import { CommunityLounge, VoidNewsPost, MaxRecommendation, RecommendCategory, DailyThought, CommunityPost, CommunityComment, CommunityEvent, CommunityEventCategory, CommunityNotification, CommunityProfile, CommunityPostV2, CommunityProfileV2, CommunityBadge, CommunitySearchResult, PollResult, PostType, FeedCategory } from '../types/index.js';
export declare function listNews(): Promise<VoidNewsPost[]>;
export declare function createNews(authorId: string, title: string, content: string, pinned: boolean): Promise<VoidNewsPost>;
export declare function deleteNews(id: string): Promise<void>;
export declare function listRecommends(): Promise<MaxRecommendation[]>;
export declare function createRecommend(category: RecommendCategory, title: string, review: string, imageUrl: string | null): Promise<MaxRecommendation>;
export declare function deleteRecommend(id: string): Promise<void>;
export declare function listThoughts(): Promise<DailyThought[]>;
export declare function createThought(content: string, pinned: boolean): Promise<DailyThought>;
export declare function deleteThought(id: string): Promise<void>;
export declare function listFeed(viewerId: string | null, before?: number): Promise<CommunityPost[]>;
export declare function createPost(authorId: string, content: string, imageUrl: string | null): Promise<CommunityPost>;
export declare function deletePost(id: string, requesterId: string, requesterIsMod: boolean): Promise<void>;
export declare function toggleLike(postId: string, playerId: string): Promise<{
    likesCount: number;
    likedByMe: boolean;
}>;
export declare function getComments(postId: string): Promise<CommunityComment[]>;
export declare function addComment(postId: string, authorId: string, content: string): Promise<CommunityComment>;
export declare function deleteComment(commentId: string, requesterId: string): Promise<void>;
export declare function reportPost(postId: string, reporterId: string, reason: string): Promise<void>;
export declare function listCommunityReports(): Promise<any[]>;
export declare function resolveCommunityReport(reportId: string, status: string): Promise<void>;
export declare function follow(followerId: string, targetId: string): Promise<void>;
export declare function unfollow(followerId: string, targetId: string): Promise<void>;
export declare function isFollowing(followerId: string, targetId: string): Promise<boolean>;
export declare function getFollowerIds(targetId: string): Promise<string[]>;
export declare function getCommunityProfile(targetId: string, viewerId: string | null): Promise<CommunityProfile>;
export declare function listEvents(viewerId: string | null): Promise<CommunityEvent[]>;
export declare function createEvent(createdBy: string, title: string, description: string, category: CommunityEventCategory, eventAt: number): Promise<CommunityEvent>;
export declare function joinEvent(eventId: string, playerId: string): Promise<void>;
export declare function leaveEvent(eventId: string, playerId: string): Promise<void>;
export declare function createNotification(playerId: string, type: string, title: string, body: string, link: string | null): Promise<CommunityNotification>;
export declare function notifyFollowers(authorId: string, type: string, title: string, body: string, link: string | null): Promise<string[]>;
export declare function notifyAllPlayers(type: string, title: string, body: string, link: string | null): Promise<string[]>;
export declare function listNotifications(playerId: string): Promise<CommunityNotification[]>;
export declare function getUnreadNotificationCount(playerId: string): Promise<number>;
export declare function markNotificationsRead(playerId: string): Promise<void>;
declare function rowToLounge(r: any, listenerCount: number, speakerCount: number): CommunityLounge;
export declare function listLoungeRows(): Promise<any[]>;
export declare function getLoungeRow(id: string): Promise<any | null>;
export { rowToLounge };
export declare function createLounge(ownerId: string, name: string, description: string): Promise<CommunityLounge>;
export declare function deleteLounge(loungeId: string, requesterId: string, isModerator?: boolean): Promise<void>;
export declare function setLoungeLive(loungeId: string, isLive: boolean, lastTopic: string | null): Promise<CommunityLounge>;
export interface CommunityBanRecord {
    id: string;
    reason: string;
    issuedAt: number;
    expiresAt: number;
}
export declare function communityBanPlayer(targetId: string, bannedBy: string, reason: string, durationSeconds: number): Promise<CommunityBanRecord>;
export declare function communityUnbanPlayer(targetId: string): Promise<void>;
export declare function getActiveCommunityBan(targetId: string): Promise<CommunityBanRecord | null>;
export declare function extractHashtags(text: string): string[];
export declare function getPlayerBadges(playerId: string): Promise<CommunityBadge[]>;
export declare function getPrivacySettings(playerId: string): Promise<{
    hideFollowersList: boolean;
    allowFriendRequests: boolean;
    defaultPostVisibility: 'public' | 'friends_only';
}>;
export declare function setPrivacySettings(playerId: string, settings: {
    hideFollowersList?: boolean;
    allowFriendRequests?: boolean;
    defaultPostVisibility?: string;
}): Promise<void>;
export declare function getCommunityProfileV2(targetId: string, viewerId: string): Promise<CommunityProfileV2 | null>;
export declare function updateCommunityProfile(playerId: string, data: {
    bio?: string;
    coverUrl?: string;
    favoriteRole?: string;
}): Promise<void>;
export declare function assignBadge(playerId: string, badge: CommunityBadge, grantedBy: string): Promise<void>;
export declare function revokeBadge(playerId: string, badge: CommunityBadge): Promise<void>;
export declare function setShowcaseAchievement(playerId: string, slot: number, achievementKey: string): Promise<void>;
export declare function clearShowcaseSlot(playerId: string, slot: number): Promise<void>;
export declare function logCommunityModAction(modId: string, action: string, targetId: string | null, postId: string | null, note: string): Promise<void>;
export declare function getCommunityModLogs(limit?: number): Promise<Array<{
    id: string;
    action: string;
    modId: string;
    targetId: string | null;
    postId: string | null;
    note: string;
    createdAt: number;
}>>;
export declare function createPostV2(authorId: string, data: {
    postType: PostType;
    content: string;
    imageUrl?: string | null;
    gifUrl?: string | null;
    videoUrl?: string | null;
    recTitle?: string | null;
    recCategory?: string | null;
    poll?: {
        question: string;
        options: string[];
        endsAt?: number | null;
    } | null;
    visibility?: 'public' | 'friends_only';
}): Promise<CommunityPostV2>;
export declare function listFeedV2(viewerId: string, options: {
    category: FeedCategory;
    before?: number;
    hashtag?: string;
    limit?: number;
}): Promise<CommunityPostV2[]>;
export declare function votePoll(postId: string, playerId: string, optionId: string): Promise<PollResult[]>;
export declare function togglePostSave(postId: string, playerId: string): Promise<boolean>;
export declare function getSavedPosts(playerId: string, before?: number): Promise<CommunityPostV2[]>;
export declare function pinPost(postId: string, pin: boolean, modId: string): Promise<void>;
export declare function featurePost(postId: string, feature: boolean, modId: string): Promise<void>;
export declare function hidePost(postId: string, modId: string): Promise<void>;
export declare function listPeopleDirectory(viewerId: string, before?: number): Promise<CommunityProfileV2[]>;
export declare function getFollowersList(playerId: string, viewerId: string): Promise<CommunityProfileV2[]>;
export declare function getFollowingList(playerId: string, viewerId: string): Promise<CommunityProfileV2[]>;
export declare function searchCommunity(query: string, viewerId: string): Promise<CommunitySearchResult>;
export declare function upsertOnlineSeen(playerId: string): Promise<void>;
export declare function getOnlineMembers(): Promise<Array<{
    playerId: string;
    username: string;
    avatar: string;
    avatarUrl: string | null;
}>>;
export declare function computeTrending(): Promise<void>;
export declare function recalcReputation(playerId: string): Promise<void>;
//# sourceMappingURL=communityService.d.ts.map