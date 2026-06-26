import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';
import {
  CommunityLounge, VoidNewsPost, MaxRecommendation, RecommendCategory, DailyThought,
  CommunityPost, CommunityComment, CommunityEvent, CommunityEventCategory,
  CommunityNotification, CommunityProfile,
  CommunityPostV2, CommunityProfileV2, CommunityBadge, CommunitySearchResult,
  PollOption, PollResult, PostType, FeedCategory,
} from '../types/index.js';
import { getClanMembershipByPlayer } from './clanService.js';

// ── Player lookup helper (lightweight — avoids a full playerService import cycle) ──
async function getPlayerBasic(id: string): Promise<{ username: string; avatar: string; avatarUrl: string | null; publicId: number | null; level: number; joinedAt: number } | null> {
  const [row] = await sql`
    SELECT username, avatar, avatar_url, public_id, level, joined_at FROM players WHERE id = ${id}
  ` as any[];
  if (!row) return null;
  return {
    username: row.username, avatar: row.avatar,
    avatarUrl: row.avatar_url ?? null,
    publicId: row.public_id != null ? Number(row.public_id) : null,
    level: Number(row.level ?? 1),
    joinedAt: Number(row.joined_at),
  };
}

// ── Void News ────────────────────────────────────────────────────────────
function rowToNews(r: any): VoidNewsPost {
  return {
    id: r.id, title: r.title, content: r.content, pinned: !!r.pinned,
    authorId: r.author_id ?? null, authorName: r.author_name ?? 'Mr. Max',
    createdAt: Number(r.created_at),
  };
}

export async function listNews(): Promise<VoidNewsPost[]> {
  const rows = await sql`
    SELECT n.*, p.username as author_name FROM void_news n
    LEFT JOIN players p ON p.id = n.author_id
    ORDER BY n.pinned DESC, n.created_at DESC LIMIT 100
  ` as any[];
  return rows.map(rowToNews);
}

export async function createNews(authorId: string, title: string, content: string, pinned: boolean): Promise<VoidNewsPost> {
  const id = generateId();
  const now = Date.now();
  const cleanTitle = title.trim().slice(0, 120);
  const cleanContent = content.trim().slice(0, 4000);
  if (!cleanTitle || !cleanContent) throw new Error('Title and content are required.');
  await sql`
    INSERT INTO void_news (id, title, content, pinned, author_id, created_at)
    VALUES (${id}, ${cleanTitle}, ${cleanContent}, ${pinned}, ${authorId}, ${now})
  `;
  const [row] = await sql`
    SELECT n.*, p.username as author_name FROM void_news n LEFT JOIN players p ON p.id = n.author_id WHERE n.id = ${id}
  ` as any[];
  return rowToNews(row);
}

export async function deleteNews(id: string): Promise<void> {
  await sql`DELETE FROM void_news WHERE id = ${id}`;
}

// ── Max Recommends ──────────────────────────────────────────────────────
function rowToRecommend(r: any): MaxRecommendation {
  return {
    id: r.id, category: r.category, title: r.title, review: r.review,
    imageUrl: r.image_url ?? null, createdAt: Number(r.created_at),
  };
}

export async function listRecommends(): Promise<MaxRecommendation[]> {
  const rows = await sql`SELECT * FROM max_recommends ORDER BY created_at DESC LIMIT 200` as any[];
  return rows.map(rowToRecommend);
}

export async function createRecommend(
  category: RecommendCategory, title: string, review: string, imageUrl: string | null,
): Promise<MaxRecommendation> {
  const id = generateId();
  const now = Date.now();
  const cleanTitle = title.trim().slice(0, 120);
  if (!cleanTitle) throw new Error('Title is required.');
  await sql`
    INSERT INTO max_recommends (id, category, title, review, image_url, created_at)
    VALUES (${id}, ${category}, ${cleanTitle}, ${review.trim().slice(0, 2000)}, ${imageUrl}, ${now})
  `;
  const [row] = await sql`SELECT * FROM max_recommends WHERE id = ${id}` as any[];
  return rowToRecommend(row);
}

export async function deleteRecommend(id: string): Promise<void> {
  await sql`DELETE FROM max_recommends WHERE id = ${id}`;
}

// ── Daily Thoughts ───────────────────────────────────────────────────────
function rowToThought(r: any): DailyThought {
  return { id: r.id, content: r.content, pinned: !!r.pinned, createdAt: Number(r.created_at) };
}

export async function listThoughts(): Promise<DailyThought[]> {
  const rows = await sql`SELECT * FROM daily_thoughts ORDER BY pinned DESC, created_at DESC LIMIT 200` as any[];
  return rows.map(rowToThought);
}

export async function createThought(content: string, pinned: boolean): Promise<DailyThought> {
  const id = generateId();
  const now = Date.now();
  const cleanContent = content.trim().slice(0, 600);
  if (!cleanContent) throw new Error('Thought content is required.');
  if (pinned) await sql`UPDATE daily_thoughts SET pinned = false`;
  await sql`
    INSERT INTO daily_thoughts (id, content, pinned, created_at)
    VALUES (${id}, ${cleanContent}, ${pinned}, ${now})
  `;
  const [row] = await sql`SELECT * FROM daily_thoughts WHERE id = ${id}` as any[];
  return rowToThought(row);
}

export async function deleteThought(id: string): Promise<void> {
  await sql`DELETE FROM daily_thoughts WHERE id = ${id}`;
}

// ── Community Feed ───────────────────────────────────────────────────────
async function rowToPost(r: any, viewerId: string | null): Promise<CommunityPost> {
  let likedByMe = false;
  if (viewerId) {
    const [like] = await sql`SELECT 1 FROM community_post_likes WHERE post_id = ${r.id} AND player_id = ${viewerId}` as any[];
    likedByMe = !!like;
  }
  return {
    id: r.id, authorId: r.author_id, authorName: r.author_name ?? 'Unknown',
    authorAvatar: r.author_avatar ?? '🙂', authorAvatarUrl: r.author_avatar_url ?? null,
    content: r.content, imageUrl: r.image_url ?? null,
    likesCount: Number(r.likes_count), commentsCount: Number(r.comments_count),
    likedByMe, createdAt: Number(r.created_at),
  };
}

export async function listFeed(viewerId: string | null, before?: number): Promise<CommunityPost[]> {
  const cutoff = before ?? Date.now() + 1;
  const rows = await sql`
    SELECT cp.*, p.username as author_name, p.avatar as author_avatar, p.avatar_url as author_avatar_url
    FROM community_posts cp
    JOIN players p ON p.id = cp.author_id
    WHERE cp.created_at < ${cutoff}
    ORDER BY cp.created_at DESC LIMIT 30
  ` as any[];
  return Promise.all(rows.map(r => rowToPost(r, viewerId)));
}

export async function createPost(authorId: string, content: string, imageUrl: string | null): Promise<CommunityPost> {
  const cleanContent = content.trim().slice(0, 1000);
  if (!cleanContent && !imageUrl) throw new Error('Post cannot be empty.');
  if (imageUrl && imageUrl.length > 400_000) throw new Error('Image too large.');
  const id = generateId();
  const now = Date.now();
  await sql`
    INSERT INTO community_posts (id, author_id, content, image_url, likes_count, comments_count, created_at)
    VALUES (${id}, ${authorId}, ${cleanContent}, ${imageUrl}, 0, 0, ${now})
  `;
  const [row] = await sql`
    SELECT cp.*, p.username as author_name, p.avatar as author_avatar, p.avatar_url as author_avatar_url
    FROM community_posts cp JOIN players p ON p.id = cp.author_id WHERE cp.id = ${id}
  ` as any[];
  return rowToPost(row, authorId);
}

export async function deletePost(id: string, requesterId: string, requesterIsMod: boolean): Promise<void> {
  const [row] = await sql`SELECT author_id FROM community_posts WHERE id = ${id}` as any[];
  if (!row) throw new Error('Post not found.');
  if (row.author_id !== requesterId && !requesterIsMod) throw new Error('Not authorized.');
  await sql`DELETE FROM community_posts WHERE id = ${id}`;
  await sql`DELETE FROM community_post_likes WHERE post_id = ${id}`;
  await sql`DELETE FROM community_post_comments WHERE post_id = ${id}`;
}

export async function toggleLike(postId: string, playerId: string): Promise<{ likesCount: number; likedByMe: boolean }> {
  const [existing] = await sql`SELECT 1 FROM community_post_likes WHERE post_id = ${postId} AND player_id = ${playerId}` as any[];
  if (existing) {
    await sql`DELETE FROM community_post_likes WHERE post_id = ${postId} AND player_id = ${playerId}`;
    await sql`UPDATE community_posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ${postId}`;
  } else {
    await sql`INSERT INTO community_post_likes (post_id, player_id, created_at) VALUES (${postId}, ${playerId}, ${Date.now()})
      ON CONFLICT DO NOTHING`;
    await sql`UPDATE community_posts SET likes_count = likes_count + 1 WHERE id = ${postId}`;
  }
  const [row] = await sql`SELECT likes_count FROM community_posts WHERE id = ${postId}` as any[];
  if (!row) throw new Error('Post not found.');
  return { likesCount: Number(row.likes_count), likedByMe: !existing };
}

function rowToComment(r: any): CommunityComment {
  return {
    id: r.id, postId: r.post_id, authorId: r.author_id, authorName: r.author_name ?? 'Unknown',
    authorAvatar: r.author_avatar ?? '🙂', authorAvatarUrl: r.author_avatar_url ?? null,
    authorPublicId: r.author_public_id != null ? Number(r.author_public_id) : null,
    content: r.content, createdAt: Number(r.created_at),
  };
}

export async function getComments(postId: string): Promise<CommunityComment[]> {
  const rows = await sql`
    SELECT c.*, p.username as author_name, p.avatar as author_avatar,
           p.avatar_url as author_avatar_url, p.public_id as author_public_id
    FROM community_post_comments c JOIN players p ON p.id = c.author_id
    WHERE c.post_id = ${postId} ORDER BY c.created_at ASC LIMIT 200
  ` as any[];
  return rows.map(rowToComment);
}

export async function addComment(postId: string, authorId: string, content: string): Promise<CommunityComment> {
  const cleanContent = content.trim().slice(0, 500);
  if (!cleanContent) throw new Error('Comment cannot be empty.');
  const [post] = await sql`SELECT id FROM community_posts WHERE id = ${postId}` as any[];
  if (!post) throw new Error('Post not found.');
  const id = generateId();
  const now = Date.now();
  await sql`
    INSERT INTO community_post_comments (id, post_id, author_id, content, created_at)
    VALUES (${id}, ${postId}, ${authorId}, ${cleanContent}, ${now})
  `;
  await sql`UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = ${postId}`;
  const [row] = await sql`
    SELECT c.*, p.username as author_name, p.avatar as author_avatar,
           p.avatar_url as author_avatar_url, p.public_id as author_public_id
    FROM community_post_comments c JOIN players p ON p.id = c.author_id WHERE c.id = ${id}
  ` as any[];
  return rowToComment(row);
}

export async function deleteComment(commentId: string, requesterId: string): Promise<void> {
  const [row] = await sql`SELECT author_id, post_id FROM community_post_comments WHERE id = ${commentId}` as any[];
  if (!row) throw new Error('Comment not found.');
  if (row.author_id !== requesterId) throw new Error('Not authorized.');
  await sql`DELETE FROM community_post_comments WHERE id = ${commentId}`;
  await sql`UPDATE community_posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = ${row.post_id}`;
}

export async function reportPost(postId: string, reporterId: string, reason: string): Promise<void> {
  const [post] = await sql`SELECT id FROM community_posts WHERE id = ${postId}` as any[];
  if (!post) throw new Error('Post not found.');
  await sql`
    INSERT INTO community_reports (id, post_id, reporter_id, reason, status, created_at)
    VALUES (${generateId()}, ${postId}, ${reporterId}, ${reason.trim().slice(0, 300)}, 'pending', ${Date.now()})
  `;
}

export async function listCommunityReports(): Promise<any[]> {
  const rows = await sql`
    SELECT r.*, cp.content as post_content, cp.author_id as post_author_id, rp.username as reporter_name
    FROM community_reports r
    LEFT JOIN community_posts cp ON cp.id = r.post_id
    LEFT JOIN players rp ON rp.id = r.reporter_id
    ORDER BY r.created_at DESC LIMIT 200
  ` as any[];
  return rows.map(r => ({
    id: r.id, postId: r.post_id, postContent: r.post_content ?? null, postAuthorId: r.post_author_id ?? null,
    reporterId: r.reporter_id, reporterName: r.reporter_name ?? 'Unknown',
    reason: r.reason, status: r.status, createdAt: Number(r.created_at),
  }));
}

export async function resolveCommunityReport(reportId: string, status: string): Promise<void> {
  await sql`UPDATE community_reports SET status = ${status} WHERE id = ${reportId}`;
}

// ── Follow System ────────────────────────────────────────────────────────
export async function follow(followerId: string, targetId: string): Promise<void> {
  if (followerId === targetId) throw new Error('You cannot follow yourself.');
  const target = await getPlayerBasic(targetId);
  if (!target) throw new Error('Player not found.');
  await sql`
    INSERT INTO follows (follower_id, following_id, created_at) VALUES (${followerId}, ${targetId}, ${Date.now()})
    ON CONFLICT DO NOTHING
  `;
}

export async function unfollow(followerId: string, targetId: string): Promise<void> {
  await sql`DELETE FROM follows WHERE follower_id = ${followerId} AND following_id = ${targetId}`;
}

export async function isFollowing(followerId: string, targetId: string): Promise<boolean> {
  const [row] = await sql`SELECT 1 FROM follows WHERE follower_id = ${followerId} AND following_id = ${targetId}` as any[];
  return !!row;
}

export async function getFollowerIds(targetId: string): Promise<string[]> {
  const rows = await sql`SELECT follower_id FROM follows WHERE following_id = ${targetId}` as any[];
  return rows.map((r: any) => r.follower_id);
}

export async function getCommunityProfile(targetId: string, viewerId: string | null): Promise<CommunityProfile> {
  const base = await getPlayerBasic(targetId);
  if (!base) throw new Error('Player not found.');
  const [[followers], [following], [posts], clan, followedByMe] = await Promise.all([
    sql`SELECT COUNT(*) as c FROM follows WHERE following_id = ${targetId}` as any,
    sql`SELECT COUNT(*) as c FROM follows WHERE follower_id = ${targetId}` as any,
    sql`SELECT COUNT(*) as c FROM community_posts WHERE author_id = ${targetId} AND hidden = false AND is_anonymous = false` as any,
    getClanMembershipByPlayer(targetId),
    viewerId ? isFollowing(viewerId, targetId) : Promise.resolve(false),
  ]);
  return {
    id: targetId, username: base.username, avatar: base.avatar, avatarUrl: base.avatarUrl,
    publicId: base.publicId, level: base.level,
    clanTag: clan?.tag ?? null, clanName: clan?.name ?? null,
    followersCount: Number(followers.c), followingCount: Number(following.c), postsCount: Number(posts.c),
    joinedAt: base.joinedAt, isFollowedByMe: followedByMe,
  };
}

// ── Community Events ─────────────────────────────────────────────────────
async function rowToEvent(r: any, viewerId: string | null): Promise<CommunityEvent> {
  const [[count], joined] = await Promise.all([
    sql`SELECT COUNT(*) as c FROM community_event_participants WHERE event_id = ${r.id}` as any,
    viewerId
      ? sql`SELECT 1 FROM community_event_participants WHERE event_id = ${r.id} AND player_id = ${viewerId}` as any
      : Promise.resolve([]),
  ]);
  return {
    id: r.id, title: r.title, description: r.description, category: r.category,
    eventAt: Number(r.event_at), createdBy: r.created_by, createdByName: r.created_by_name ?? 'Unknown',
    participantCount: Number(count.c), joinedByMe: Array.isArray(joined) && joined.length > 0,
    createdAt: Number(r.created_at),
  };
}

export async function listEvents(viewerId: string | null): Promise<CommunityEvent[]> {
  const rows = await sql`
    SELECT e.*, p.username as created_by_name FROM community_events e
    JOIN players p ON p.id = e.created_by
    WHERE e.event_at > ${Date.now() - 24 * 60 * 60 * 1000}
    ORDER BY e.event_at ASC LIMIT 100
  ` as any[];
  return Promise.all(rows.map(r => rowToEvent(r, viewerId)));
}

export async function createEvent(
  createdBy: string, title: string, description: string, category: CommunityEventCategory, eventAt: number,
): Promise<CommunityEvent> {
  const cleanTitle = title.trim().slice(0, 120);
  if (!cleanTitle) throw new Error('Title is required.');
  const id = generateId();
  const now = Date.now();
  await sql`
    INSERT INTO community_events (id, title, description, category, event_at, created_by, created_at)
    VALUES (${id}, ${cleanTitle}, ${description.trim().slice(0, 1000)}, ${category}, ${eventAt}, ${createdBy}, ${now})
  `;
  await sql`
    INSERT INTO community_event_participants (event_id, player_id, joined_at) VALUES (${id}, ${createdBy}, ${now})
    ON CONFLICT DO NOTHING
  `;
  const [row] = await sql`
    SELECT e.*, p.username as created_by_name FROM community_events e JOIN players p ON p.id = e.created_by WHERE e.id = ${id}
  ` as any[];
  return rowToEvent(row, createdBy);
}

export async function joinEvent(eventId: string, playerId: string): Promise<void> {
  const [event] = await sql`SELECT id FROM community_events WHERE id = ${eventId}` as any[];
  if (!event) throw new Error('Event not found.');
  await sql`
    INSERT INTO community_event_participants (event_id, player_id, joined_at) VALUES (${eventId}, ${playerId}, ${Date.now()})
    ON CONFLICT DO NOTHING
  `;
}

export async function leaveEvent(eventId: string, playerId: string): Promise<void> {
  await sql`DELETE FROM community_event_participants WHERE event_id = ${eventId} AND player_id = ${playerId}`;
}

// ── Notifications ─────────────────────────────────────────────────────────
function rowToNotification(r: any): CommunityNotification {
  return {
    id: r.id, type: r.type, title: r.title, body: r.body, link: r.link ?? null,
    read: !!r.read, createdAt: Number(r.created_at),
  };
}

export async function createNotification(
  playerId: string, type: string, title: string, body: string, link: string | null,
): Promise<CommunityNotification> {
  const id = generateId();
  const now = Date.now();
  await sql`
    INSERT INTO community_notifications (id, player_id, type, title, body, link, read, created_at)
    VALUES (${id}, ${playerId}, ${type}, ${title}, ${body}, ${link}, false, ${now})
  `;
  return { id, type, title, body, link, read: false, createdAt: now };
}

export async function notifyFollowers(authorId: string, type: string, title: string, body: string, link: string | null): Promise<string[]> {
  const followerIds = await getFollowerIds(authorId);
  for (const fid of followerIds) {
    await createNotification(fid, type, title, body, link);
  }
  return followerIds;
}

export async function notifyAllPlayers(type: string, title: string, body: string, link: string | null): Promise<string[]> {
  const rows = await sql`SELECT id FROM players` as any[];
  for (const r of rows) {
    await createNotification(r.id, type, title, body, link);
  }
  return rows.map((r: any) => r.id);
}

export async function listNotifications(playerId: string): Promise<CommunityNotification[]> {
  const rows = await sql`
    SELECT * FROM community_notifications WHERE player_id = ${playerId} ORDER BY created_at DESC LIMIT 50
  ` as any[];
  return rows.map(rowToNotification);
}

export async function getUnreadNotificationCount(playerId: string): Promise<number> {
  const [row] = await sql`SELECT COUNT(*) as c FROM community_notifications WHERE player_id = ${playerId} AND read = false` as any[];
  return Number(row?.c ?? 0);
}

export async function markNotificationsRead(playerId: string): Promise<void> {
  await sql`UPDATE community_notifications SET read = true WHERE player_id = ${playerId} AND read = false`;
}

// ── Community Lounges ────────────────────────────────────────────────────
function rowToLounge(r: any, listenerCount: number, speakerCount: number): CommunityLounge {
  return {
    id: r.id, name: r.name, description: r.description, ownerId: r.owner_id ?? null,
    kind: r.kind, isLive: !!r.is_live, lastTopic: r.last_topic, createdAt: Number(r.created_at),
    listenerCount, speakerCount,
  };
}

export async function listLoungeRows(): Promise<any[]> {
  return await sql`SELECT * FROM community_lounges ORDER BY (kind = 'max_lounge') DESC, (kind = 'void_radio') DESC, created_at ASC` as any[];
}

export async function getLoungeRow(id: string): Promise<any | null> {
  const [row] = await sql`SELECT * FROM community_lounges WHERE id = ${id}` as any[];
  return row ?? null;
}

export { rowToLounge };

export async function createLounge(ownerId: string, name: string, description: string): Promise<CommunityLounge> {
  const cleanName = name.trim().slice(0, 60);
  if (!cleanName) throw new Error('Lounge name is required.');
  const id = generateId();
  const now = Date.now();
  await sql`
    INSERT INTO community_lounges (id, name, description, owner_id, kind, is_live, last_topic, created_at)
    VALUES (${id}, ${cleanName}, ${description.trim().slice(0, 300)}, ${ownerId}, 'lounge', false, '', ${now})
  `;
  const row = await getLoungeRow(id);
  return rowToLounge(row, 0, 0);
}

export async function deleteLounge(loungeId: string, requesterId: string, isModerator = false): Promise<void> {
  const row = await getLoungeRow(loungeId);
  if (!row) throw new Error('Lounge not found.');
  if (row.kind !== 'lounge') throw new Error('Cannot delete special lounges.');
  if (!isModerator && row.owner_id !== requesterId) throw new Error('Only the lounge owner can delete it.');
  await sql`DELETE FROM community_lounges WHERE id = ${loungeId}`;
}

export async function setLoungeLive(loungeId: string, isLive: boolean, lastTopic: string | null): Promise<CommunityLounge> {
  const row = await getLoungeRow(loungeId);
  if (!row) throw new Error('Lounge not found.');
  if (lastTopic !== null) {
    await sql`UPDATE community_lounges SET is_live = ${isLive}, last_topic = ${lastTopic.trim().slice(0, 200)} WHERE id = ${loungeId}`;
  } else {
    await sql`UPDATE community_lounges SET is_live = ${isLive} WHERE id = ${loungeId}`;
  }
  const updated = await getLoungeRow(loungeId);
  return rowToLounge(updated, 0, 0);
}

// ── Community-scoped moderation (separate from Mafia game bans) ──────────
export interface CommunityBanRecord {
  id: string; reason: string; issuedAt: number; expiresAt: number;
}

export async function communityBanPlayer(targetId: string, bannedBy: string, reason: string, durationSeconds: number): Promise<CommunityBanRecord> {
  await sql`UPDATE community_bans SET active = 0 WHERE player_id = ${targetId}`;
  const id = generateId();
  const now = Date.now();
  const expiresAt = now + durationSeconds * 1000;
  await sql`
    INSERT INTO community_bans (id, player_id, banned_by, reason, issued_at, expires_at, active)
    VALUES (${id}, ${targetId}, ${bannedBy}, ${reason.trim().slice(0, 300)}, ${now}, ${expiresAt}, 1)
  `;
  return { id, reason, issuedAt: now, expiresAt };
}

export async function communityUnbanPlayer(targetId: string): Promise<void> {
  await sql`UPDATE community_bans SET active = 0 WHERE player_id = ${targetId}`;
}

export async function getActiveCommunityBan(targetId: string): Promise<CommunityBanRecord | null> {
  const now = Date.now();
  const [row] = await sql`
    SELECT * FROM community_bans WHERE player_id = ${targetId} AND active = 1 AND expires_at > ${now}
    ORDER BY expires_at DESC LIMIT 1
  ` as any[];
  if (!row) return null;
  return { id: row.id, reason: row.reason, issuedAt: Number(row.issued_at), expiresAt: Number(row.expires_at) };
}

// ── Community Social V2 Extensions ──────────────────────────────────────

// Helper: extract hashtags from text
export function extractHashtags(text: string): string[] {
  const matches = text.match(/#([a-zA-Z0-9_]{1,50})/g) ?? [];
  return [...new Set(matches.map(h => h.slice(1).toLowerCase()))];
}

// Helper: get player badges
export async function getPlayerBadges(playerId: string): Promise<CommunityBadge[]> {
  const rows = await sql<{ badge: string }[]>`SELECT badge FROM community_badges WHERE player_id = ${playerId}`;
  return rows.map(r => r.badge as CommunityBadge);
}

// Get friendship status between two players
async function getFriendshipStatus(viewerId: string, targetId: string): Promise<'none' | 'pending_sent' | 'pending_received' | 'friends'> {
  if (viewerId === targetId) return 'none';
  const row = await sql<{ status: string; from_id: string }[]>`
    SELECT status, from_id FROM friendships
    WHERE (from_id = ${viewerId} AND to_id = ${targetId})
       OR (from_id = ${targetId} AND to_id = ${viewerId})
    LIMIT 1
  `;
  if (!row.length) return 'none';
  const r = row[0];
  if (r.status === 'accepted') return 'friends';
  if (r.status === 'pending') return r.from_id === viewerId ? 'pending_sent' : 'pending_received';
  return 'none';
}

// Privacy settings
export async function getPrivacySettings(playerId: string): Promise<{ hideFollowersList: boolean; allowFriendRequests: boolean; defaultPostVisibility: 'public' | 'friends_only'; profileMode: 'public' | 'secret' }> {
  const rows = await sql<{ hide_followers_list: boolean; allow_friend_requests: boolean; default_post_visibility: string; profile_mode: string }[]>`SELECT hide_followers_list, allow_friend_requests, default_post_visibility, profile_mode FROM community_privacy_settings WHERE player_id = ${playerId}`;
  if (!rows.length) return { hideFollowersList: false, allowFriendRequests: true, defaultPostVisibility: 'public', profileMode: 'public' };
  const r = rows[0];
  return {
    hideFollowersList: Boolean(r.hide_followers_list),
    allowFriendRequests: Boolean(r.allow_friend_requests),
    defaultPostVisibility: (r.default_post_visibility as 'public' | 'friends_only') ?? 'public',
    profileMode: (r.profile_mode === 'secret' ? 'secret' : 'public'),
  };
}

export async function setPrivacySettings(playerId: string, settings: { hideFollowersList?: boolean; allowFriendRequests?: boolean; defaultPostVisibility?: string; profileMode?: string }): Promise<void> {
  const current = await getPrivacySettings(playerId);
  const hideFollowersList = settings.hideFollowersList ?? current.hideFollowersList;
  const allowFriendRequests = settings.allowFriendRequests ?? current.allowFriendRequests;
  const defaultPostVisibility = settings.defaultPostVisibility ?? current.defaultPostVisibility;
  const profileMode = settings.profileMode === 'secret' ? 'secret' : 'public';
  await sql`INSERT INTO community_privacy_settings (player_id, hide_followers_list, allow_friend_requests, default_post_visibility, profile_mode) VALUES (${playerId}, ${hideFollowersList}, ${allowFriendRequests}, ${defaultPostVisibility}, ${profileMode}) ON CONFLICT (player_id) DO UPDATE SET hide_followers_list = EXCLUDED.hide_followers_list, allow_friend_requests = EXCLUDED.allow_friend_requests, default_post_visibility = EXCLUDED.default_post_visibility, profile_mode = EXCLUDED.profile_mode`;
}

// Extended profile V2
export async function getCommunityProfileV2(targetId: string, viewerId: string): Promise<CommunityProfileV2 | null> {
  let base: any;
  try {
    base = await getCommunityProfile(targetId, viewerId);
  } catch {
    return null;
  }
  if (!base) return null;

  const playerRow = await sql<{
    community_bio: string;
    community_cover_url: string | null;
    community_favorite_role: string | null;
    community_reputation: number;
  }[]>`SELECT community_bio, community_cover_url, community_favorite_role, community_reputation FROM players WHERE id = ${targetId}`;

  if (!playerRow.length) return null;
  const pRow = playerRow[0];

  const [badges, showcase, privacy, friendshipStatus, friendsCount] = await Promise.all([
    getPlayerBadges(targetId),
    sql<{ slot: number; achievement_key: string }[]>`SELECT slot, achievement_key FROM community_achievement_showcase WHERE player_id = ${targetId} ORDER BY slot ASC`,
    getPrivacySettings(targetId),
    getFriendshipStatus(viewerId, targetId),
    sql<{ count: string }[]>`SELECT COUNT(*) AS count FROM friendships WHERE (from_id = ${targetId} OR to_id = ${targetId}) AND status = 'accepted'`,
  ]);

  return {
    ...base,
    bio: pRow.community_bio ?? '',
    coverUrl: pRow.community_cover_url ?? null,
    favoriteRole: pRow.community_favorite_role ?? null,
    badges,
    reputation: Number(pRow.community_reputation ?? 0),
    friendsCount: Number(friendsCount[0]?.count ?? 0),
    friendshipStatus,
    showcaseAchievements: showcase.map(s => ({ slot: s.slot, achievementKey: s.achievement_key })),
    privacySettings: privacy,
    isSecret: false,
  };
}

export function generateAnonymousName(playerId: string): string {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = ((hash << 5) - hash) + playerId.charCodeAt(i);
    hash |= 0;
  }
  const adjectives = ['Silent', 'Hollow', 'Phantom', 'Veiled', 'Cryptic', 'Shadow', 'Blank', 'Void', 'Hidden', 'Masked'];
  const nouns = ['Stranger', 'Entity', 'Ghost', 'Cipher', 'Specter', 'Wraith', 'Shade', 'Nomad', 'Drifter', 'Agent'];
  const adj = adjectives[Math.abs(hash) % adjectives.length];
  const noun = nouns[Math.abs(hash >> 4) % nouns.length];
  const num = Math.abs(hash >> 8) % 900 + 100;
  return `${adj} ${noun} #${num}`;
}

// Update community profile fields
export async function updateCommunityProfile(playerId: string, data: { bio?: string; coverUrl?: string; favoriteRole?: string }): Promise<void> {
  const { bio, coverUrl, favoriteRole } = data;
  if (bio !== undefined) {
    await sql`UPDATE players SET community_bio = ${bio.slice(0, 500)} WHERE id = ${playerId}`;
  }
  if (coverUrl !== undefined) {
    await sql`UPDATE players SET community_cover_url = ${coverUrl || null} WHERE id = ${playerId}`;
  }
  if (favoriteRole !== undefined) {
    await sql`UPDATE players SET community_favorite_role = ${favoriteRole || null} WHERE id = ${playerId}`;
  }
}

// Badge management
export async function assignBadge(playerId: string, badge: CommunityBadge, grantedBy: string): Promise<void> {
  const now = Date.now();
  await sql`INSERT INTO community_badges (player_id, badge, granted_by, granted_at) VALUES (${playerId}, ${badge}, ${grantedBy}, ${now}) ON CONFLICT (player_id, badge) DO NOTHING`;
}

export async function revokeBadge(playerId: string, badge: CommunityBadge): Promise<void> {
  await sql`DELETE FROM community_badges WHERE player_id = ${playerId} AND badge = ${badge}`;
}

// Achievement showcase
export async function setShowcaseAchievement(playerId: string, slot: number, achievementKey: string): Promise<void> {
  const now = Date.now();
  await sql`INSERT INTO community_achievement_showcase (player_id, achievement_key, slot, updated_at) VALUES (${playerId}, ${achievementKey}, ${slot}, ${now}) ON CONFLICT (player_id, slot) DO UPDATE SET achievement_key = EXCLUDED.achievement_key, updated_at = EXCLUDED.updated_at`;
}

export async function clearShowcaseSlot(playerId: string, slot: number): Promise<void> {
  await sql`DELETE FROM community_achievement_showcase WHERE player_id = ${playerId} AND slot = ${slot}`;
}

// Mod action log
export async function logCommunityModAction(modId: string, action: string, targetId: string | null, postId: string | null, note: string): Promise<void> {
  const id = `cml_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await sql`INSERT INTO community_mod_logs (id, action, mod_id, target_id, post_id, note, created_at) VALUES (${id}, ${action}, ${modId}, ${targetId}, ${postId}, ${note}, ${Date.now()})`;
}

export async function getCommunityModLogs(limit = 100): Promise<Array<{ id: string; action: string; modId: string; targetId: string | null; postId: string | null; note: string; createdAt: number }>> {
  const rows = await sql<any[]>`SELECT id, action, mod_id, target_id, post_id, note, created_at FROM community_mod_logs ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map(r => ({ id: r.id, action: r.action, modId: r.mod_id, targetId: r.target_id ?? null, postId: r.post_id ?? null, note: r.note, createdAt: Number(r.created_at) }));
}

// Helper: build a CommunityPostV2 from a DB row
async function buildPostV2(row: any, viewerId: string): Promise<CommunityPostV2> {
  const savedRow = viewerId ? await sql<{ player_id: string }[]>`SELECT player_id FROM community_post_saves WHERE post_id = ${row.id} AND player_id = ${viewerId} LIMIT 1` : [];
  const likedRow = viewerId ? await sql<{ player_id: string }[]>`SELECT player_id FROM community_post_likes WHERE post_id = ${row.id} AND player_id = ${viewerId} LIMIT 1` : [];
  const isAnon = Boolean(row.is_anonymous);
  const authorBadges = isAnon ? [] : await getPlayerBadges(row.author_id);

  let hashtags: string[] = [];
  try { hashtags = JSON.parse(row.hashtags ?? '[]'); } catch { hashtags = []; }

  let poll: CommunityPostV2['poll'] = null;
  if (row.post_type === 'poll') {
    const pollRows = await sql<{ question: string; options: string; ends_at: number | null }[]>`SELECT question, options, ends_at FROM community_polls WHERE post_id = ${row.id} LIMIT 1`;
    if (pollRows.length) {
      const pr = pollRows[0];
      let options: PollOption[] = [];
      try { options = JSON.parse(pr.options ?? '[]'); } catch { options = []; }

      const voteRows = await sql<{ option_id: string; count: string }[]>`SELECT option_id, COUNT(*) AS count FROM community_poll_votes WHERE post_id = ${row.id} GROUP BY option_id`;
      const totalVotes = voteRows.reduce((s, r) => s + Number(r.count), 0);
      const results: PollResult[] = options.map(opt => {
        const vr = voteRows.find(v => v.option_id === opt.id);
        const count = Number(vr?.count ?? 0);
        return { option: opt, count, percent: totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0 };
      });

      let myVote: string | null = null;
      if (viewerId) {
        const mv = await sql<{ option_id: string }[]>`SELECT option_id FROM community_poll_votes WHERE post_id = ${row.id} AND player_id = ${viewerId} LIMIT 1`;
        myVote = mv[0]?.option_id ?? null;
      }

      poll = { question: pr.question, options, endsAt: pr.ends_at ?? null, results, myVote };
    }
  }

  return {
    id: row.id,
    authorId: isAnon ? '' : row.author_id,
    authorName: isAnon ? generateAnonymousName(row.author_id) : (row.author_name ?? ''),
    authorAvatar: isAnon ? '' : (row.author_avatar ?? ''),
    authorAvatarUrl: isAnon ? null : (row.author_avatar_url ?? null),
    authorLevel: isAnon ? 1 : Number(row.author_level ?? 1),
    content: row.content ?? '',
    imageUrl: row.image_url ?? null,
    likesCount: Number(row.likes_count ?? 0),
    commentsCount: Number(row.comments_count ?? 0),
    likedByMe: likedRow.length > 0,
    createdAt: Number(row.created_at),
    postType: (row.post_type ?? 'text') as PostType,
    gifUrl: row.gif_url ?? null,
    videoUrl: row.video_url ?? null,
    isPinned: Boolean(row.is_pinned),
    isFeatured: Boolean(row.is_featured),
    recTitle: row.rec_title ?? null,
    recCategory: row.rec_category ?? null,
    hashtags,
    visibility: (row.visibility ?? 'public') as 'public' | 'friends_only',
    savesCount: Number(row.saves_count ?? 0),
    savedByMe: savedRow.length > 0,
    hidden: Boolean(row.hidden),
    poll,
    authorBadges,
    authorBio: isAnon ? '' : (row.author_bio ?? ''),
    authorCoverUrl: isAnon ? null : (row.author_cover_url ?? null),
    audioUrl: row.audio_url ?? null,
  };
}

// Create post V2
export async function createPostV2(authorId: string, data: {
  postType: PostType;
  content: string;
  imageUrl?: string | null;
  gifUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  recTitle?: string | null;
  recCategory?: string | null;
  poll?: { question: string; options: string[]; endsAt?: number | null } | null;
  visibility?: 'public' | 'friends_only';
  isAnonymous?: boolean;
}): Promise<CommunityPostV2> {
  if (data.imageUrl && data.imageUrl.length > 680_000) throw new Error('Image too large — please use a smaller image.');
  if (data.audioUrl && data.audioUrl.length > 5_000_000) throw new Error('Audio too large.');
  const id = `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const hashtags = extractHashtags(data.content);
  const hashtagsJson = JSON.stringify(hashtags);
  const visibility = data.visibility ?? 'public';
  const isAnonymous = Boolean(data.isAnonymous);

  await sql`
    INSERT INTO community_posts (id, author_id, content, image_url, post_type, gif_url, video_url, audio_url, rec_title, rec_category, hashtags, visibility, likes_count, comments_count, saves_count, is_pinned, is_featured, hidden, is_anonymous, created_at)
    VALUES (${id}, ${authorId}, ${data.content}, ${data.imageUrl ?? null}, ${data.postType}, ${data.gifUrl ?? null}, ${data.videoUrl ?? null}, ${data.audioUrl ?? null}, ${data.recTitle ?? null}, ${data.recCategory ?? null}, ${hashtagsJson}, ${visibility}, 0, 0, 0, false, false, false, ${isAnonymous}, ${now})
  `;

  if (data.postType === 'poll' && data.poll) {
    const options = data.poll.options.map((text, i) => ({ id: `opt_${i}`, text: text.slice(0, 100) }));
    await sql`INSERT INTO community_polls (post_id, question, options, ends_at) VALUES (${id}, ${data.poll.question.slice(0, 300)}, ${JSON.stringify(options)}, ${data.poll.endsAt ?? null})`;
  }

  if (hashtags.length > 0) {
    for (const tag of hashtags) {
      await sql`INSERT INTO community_post_hashtags (post_id, hashtag) VALUES (${id}, ${tag}) ON CONFLICT DO NOTHING`;
    }
  }

  const rows = await sql<any[]>`
    SELECT p.*, pl.username AS author_name, pl.avatar AS author_avatar, pl.avatar_url AS author_avatar_url, pl.level AS author_level, pl.community_bio AS author_bio, pl.community_cover_url AS author_cover_url
    FROM community_posts p JOIN players pl ON pl.id = p.author_id
    WHERE p.id = ${id} LIMIT 1
  `;

  return buildPostV2(rows[0], authorId);
}

// List feed V2
export async function listFeedV2(viewerId: string, options: { category: FeedCategory; before?: number; hashtag?: string; limit?: number }): Promise<CommunityPostV2[]> {
  const limit = options.limit ?? 20;
  const before = options.before ?? Date.now() + 1;
  const { category, hashtag } = options;

  let rows: any[];

  if (hashtag) {
    rows = await sql<any[]>`
      SELECT p.*, pl.username AS author_name, pl.avatar AS author_avatar, pl.avatar_url AS author_avatar_url, pl.level AS author_level, pl.community_bio AS author_bio, pl.community_cover_url AS author_cover_url
      FROM community_posts p
      JOIN players pl ON pl.id = p.author_id
      JOIN community_post_hashtags ht ON ht.post_id = p.id AND ht.hashtag = ${hashtag.toLowerCase()}
      WHERE p.hidden = false AND p.deleted_at IS NULL AND p.created_at < ${before}
      ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT ${limit}
    `;
  } else if (category === 'following') {
    rows = await sql<any[]>`
      SELECT p.*, pl.username AS author_name, pl.avatar AS author_avatar, pl.avatar_url AS author_avatar_url, pl.level AS author_level, pl.community_bio AS author_bio, pl.community_cover_url AS author_cover_url
      FROM community_posts p
      JOIN players pl ON pl.id = p.author_id
      JOIN follows f ON f.following_id = p.author_id AND f.follower_id = ${viewerId}
      WHERE p.hidden = false AND p.deleted_at IS NULL AND p.visibility = 'public' AND p.created_at < ${before}
      ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT ${limit}
    `;
  } else if (category === 'friends') {
    rows = await sql<any[]>`
      SELECT p.*, pl.username AS author_name, pl.avatar AS author_avatar, pl.avatar_url AS author_avatar_url, pl.level AS author_level, pl.community_bio AS author_bio, pl.community_cover_url AS author_cover_url
      FROM community_posts p
      JOIN players pl ON pl.id = p.author_id
      WHERE p.hidden = false AND p.deleted_at IS NULL AND p.created_at < ${before}
        AND (p.author_id IN (
          SELECT to_id FROM friendships WHERE from_id = ${viewerId} AND status = 'accepted'
          UNION SELECT from_id FROM friendships WHERE to_id = ${viewerId} AND status = 'accepted'
        ))
      ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT ${limit}
    `;
  } else if (category === 'void_news') {
    rows = await sql<any[]>`
      SELECT p.*, pl.username AS author_name, pl.avatar AS author_avatar, pl.avatar_url AS author_avatar_url, pl.level AS author_level, pl.community_bio AS author_bio, pl.community_cover_url AS author_cover_url
      FROM community_posts p
      JOIN players pl ON pl.id = p.author_id
      WHERE p.hidden = false AND p.deleted_at IS NULL AND p.created_at < ${before} AND pl.moderator_level = 'owner'
      ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT ${limit}
    `;
  } else if (category === 'mr_max') {
    rows = await sql<any[]>`
      SELECT p.*, pl.username AS author_name, pl.avatar AS author_avatar, pl.avatar_url AS author_avatar_url, pl.level AS author_level, pl.community_bio AS author_bio, pl.community_cover_url AS author_cover_url
      FROM community_posts p
      JOIN players pl ON pl.id = p.author_id
      JOIN community_badges b ON b.player_id = p.author_id AND b.badge = 'owner'
      WHERE p.hidden = false AND p.deleted_at IS NULL AND p.created_at < ${before}
      ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT ${limit}
    `;
  } else if (category === 'clans') {
    rows = await sql<any[]>`
      SELECT p.*, pl.username AS author_name, pl.avatar AS author_avatar, pl.avatar_url AS author_avatar_url, pl.level AS author_level, pl.community_bio AS author_bio, pl.community_cover_url AS author_cover_url
      FROM community_posts p
      JOIN players pl ON pl.id = p.author_id
      WHERE p.hidden = false AND p.deleted_at IS NULL AND p.created_at < ${before}
        AND p.author_id IN (
          SELECT cm.player_id FROM clan_members cm
          WHERE cm.clan_id = (SELECT clan_id FROM clan_members WHERE player_id = ${viewerId} LIMIT 1)
        )
      ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT ${limit}
    `;
  } else if (category === 'trending') {
    rows = await sql<any[]>`
      SELECT p.*, pl.username AS author_name, pl.avatar AS author_avatar, pl.avatar_url AS author_avatar_url, pl.level AS author_level, pl.community_bio AS author_bio, pl.community_cover_url AS author_cover_url
      FROM community_posts p
      JOIN players pl ON pl.id = p.author_id
      JOIN community_trending_posts tr ON tr.post_id = p.id
      WHERE p.hidden = false AND p.deleted_at IS NULL AND p.created_at < ${before}
      ORDER BY tr.score DESC LIMIT ${limit}
    `;
  } else {
    rows = await sql<any[]>`
      SELECT p.*, pl.username AS author_name, pl.avatar AS author_avatar, pl.avatar_url AS author_avatar_url, pl.level AS author_level, pl.community_bio AS author_bio, pl.community_cover_url AS author_cover_url
      FROM community_posts p
      JOIN players pl ON pl.id = p.author_id
      WHERE p.hidden = false AND p.deleted_at IS NULL AND p.created_at < ${before}
        AND (
          p.visibility = 'public'
          OR (p.visibility = 'friends_only' AND p.author_id IN (
            SELECT to_id FROM friendships WHERE from_id = ${viewerId} AND status = 'accepted'
            UNION SELECT from_id FROM friendships WHERE to_id = ${viewerId} AND status = 'accepted'
          ))
        )
      ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT ${limit}
    `;
  }

  return Promise.all(rows.map(r => buildPostV2(r, viewerId)));
}

// Fetch posts by a single author (for community profile page)
export async function getUserPosts(
  authorId: string,
  viewerId: string,
  options: { before?: number; limit?: number } = {}
): Promise<CommunityPostV2[]> {
  const limit = Math.min(options.limit ?? 40, 80);
  const before = options.before ?? Date.now() + 1;
  const rows = await sql<any[]>`
    SELECT p.*, pl.username AS author_name, pl.avatar AS author_avatar, pl.avatar_url AS author_avatar_url,
           pl.level AS author_level, pl.community_bio AS author_bio, pl.community_cover_url AS author_cover_url
    FROM community_posts p
    JOIN players pl ON pl.id = p.author_id
    WHERE p.author_id = ${authorId}
      AND p.hidden = false
      AND p.created_at < ${before}
      AND p.is_anonymous = false
    ORDER BY p.created_at DESC LIMIT ${limit}
  `;
  return Promise.all(rows.map(r => buildPostV2(r, viewerId)));
}

// Vote on poll
export async function votePoll(postId: string, playerId: string, optionId: string): Promise<PollResult[]> {
  const existing = await sql<{ option_id: string }[]>`SELECT option_id FROM community_poll_votes WHERE post_id = ${postId} AND player_id = ${playerId} LIMIT 1`;
  if (existing.length) throw new Error('Already voted.');
  await sql`INSERT INTO community_poll_votes (post_id, player_id, option_id, voted_at) VALUES (${postId}, ${playerId}, ${optionId}, ${Date.now()})`;

  const pollRow = await sql<{ options: string }[]>`SELECT options FROM community_polls WHERE post_id = ${postId} LIMIT 1`;
  let options: PollOption[] = [];
  try { options = JSON.parse(pollRow[0]?.options ?? '[]'); } catch {}

  const voteRows = await sql<{ option_id: string; count: string }[]>`SELECT option_id, COUNT(*) AS count FROM community_poll_votes WHERE post_id = ${postId} GROUP BY option_id`;
  const totalVotes = voteRows.reduce((s, r) => s + Number(r.count), 0);
  return options.map(opt => {
    const vr = voteRows.find(v => v.option_id === opt.id);
    const count = Number(vr?.count ?? 0);
    return { option: opt, count, percent: totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0 };
  });
}

// Toggle post save
export async function togglePostSave(postId: string, playerId: string): Promise<boolean> {
  const existing = await sql<{ player_id: string }[]>`SELECT player_id FROM community_post_saves WHERE post_id = ${postId} AND player_id = ${playerId} LIMIT 1`;
  if (existing.length) {
    await sql`DELETE FROM community_post_saves WHERE post_id = ${postId} AND player_id = ${playerId}`;
    await sql`UPDATE community_posts SET saves_count = GREATEST(0, saves_count - 1) WHERE id = ${postId}`;
    return false;
  } else {
    await sql`INSERT INTO community_post_saves (post_id, player_id, saved_at) VALUES (${postId}, ${playerId}, ${Date.now()}) ON CONFLICT DO NOTHING`;
    await sql`UPDATE community_posts SET saves_count = saves_count + 1 WHERE id = ${postId}`;
    return true;
  }
}

// Get saved posts
export async function getSavedPosts(playerId: string, before?: number): Promise<CommunityPostV2[]> {
  const beforeVal = before ?? Date.now() + 1;
  const rows = await sql<any[]>`
    SELECT p.*, pl.username AS author_name, pl.avatar AS author_avatar, pl.avatar_url AS author_avatar_url, pl.level AS author_level, pl.community_bio AS author_bio, pl.community_cover_url AS author_cover_url
    FROM community_post_saves s
    JOIN community_posts p ON p.id = s.post_id
    JOIN players pl ON pl.id = p.author_id
    WHERE s.player_id = ${playerId} AND p.hidden = false AND s.saved_at < ${beforeVal}
    ORDER BY s.saved_at DESC LIMIT 20
  `;
  return Promise.all(rows.map(r => buildPostV2(r, playerId)));
}

// Pin/unpin post (mod/admin)
export async function pinPost(postId: string, pin: boolean, modId: string): Promise<void> {
  await sql`UPDATE community_posts SET is_pinned = ${pin} WHERE id = ${postId}`;
  await logCommunityModAction(modId, pin ? 'pin' : 'unpin', null, postId, '');
}

// Feature/unfeature post
export async function featurePost(postId: string, feature: boolean, modId: string): Promise<void> {
  await sql`UPDATE community_posts SET is_featured = ${feature} WHERE id = ${postId}`;
  await logCommunityModAction(modId, feature ? 'feature' : 'unfeature', null, postId, '');
}

// Hide post (soft delete)
export async function hidePost(postId: string, modId: string): Promise<void> {
  await sql`UPDATE community_posts SET hidden = true WHERE id = ${postId}`;
  await logCommunityModAction(modId, 'hide', null, postId, '');
}

// People directory
export async function listPeopleDirectory(viewerId: string): Promise<CommunityProfileV2[]> {
  // Single batched query instead of N+1 getCommunityProfileV2 calls
  const rows = await sql<{
    id: string; username: string; avatar: string; avatar_url: string | null;
    public_id: number | null; level: number; community_reputation: number;
    followers_count: string; following_count: string; posts_count: string;
    is_followed: boolean; community_bio: string; community_cover_url: string | null;
    community_favorite_role: string | null; joined_at: number;
  }[]>`
    SELECT
      p.id, p.username, p.avatar, p.avatar_url, p.public_id, p.level,
      COALESCE(p.community_reputation, 0) AS community_reputation,
      p.community_bio, p.community_cover_url, p.community_favorite_role, p.joined_at,
      COUNT(DISTINCT f.follower_id) AS followers_count,
      (SELECT COUNT(*) FROM follows fw WHERE fw.follower_id = p.id) AS following_count,
      (SELECT COUNT(*) FROM community_posts cp WHERE cp.author_id = p.id) AS posts_count,
      EXISTS(SELECT 1 FROM follows fv WHERE fv.following_id = p.id AND fv.follower_id = ${viewerId}) AS is_followed
    FROM players p
    LEFT JOIN follows f ON f.following_id = p.id
    GROUP BY p.id
    HAVING COUNT(DISTINCT f.follower_id) > 0
    ORDER BY COUNT(DISTINCT f.follower_id) DESC
    LIMIT 50
  `;

  if (rows.length === 0) return [];

  // Batch-fetch badges for all players in one query
  const playerIds = rows.map(r => r.id);
  const badgeRows = playerIds.length > 0
    ? await sql<{ player_id: string; badge: string }[]>`
        SELECT player_id, badge FROM community_badges WHERE player_id = ANY(${playerIds})
      `
    : [];
  const badgeMap = new Map<string, CommunityBadge[]>();
  for (const b of badgeRows) {
    if (!badgeMap.has(b.player_id)) badgeMap.set(b.player_id, []);
    badgeMap.get(b.player_id)!.push(b.badge as CommunityBadge);
  }

  return rows.map(r => ({
    id: r.id,
    username: r.username,
    avatar: r.avatar,
    avatarUrl: r.avatar_url ?? null,
    publicId: r.public_id != null ? Number(r.public_id) : null,
    level: Number(r.level),
    clanTag: null,
    clanName: null,
    followersCount: Number(r.followers_count),
    followingCount: Number(r.following_count),
    postsCount: Number(r.posts_count),
    joinedAt: Number(r.joined_at),
    isFollowedByMe: Boolean(r.is_followed),
    bio: r.community_bio ?? '',
    coverUrl: r.community_cover_url ?? null,
    favoriteRole: r.community_favorite_role ?? null,
    badges: badgeMap.get(r.id) ?? [],
    reputation: Number(r.community_reputation),
    friendsCount: 0,
    friendshipStatus: 'none' as const,
    showcaseAchievements: [],
    privacySettings: { hideFollowersList: false, allowFriendRequests: true, defaultPostVisibility: 'public' as const, profileMode: 'public' as const },
  }));
}

// Followers / following lists
export async function getFollowersList(playerId: string, viewerId: string): Promise<CommunityProfileV2[]> {
  const rows = await sql<{ follower_id: string }[]>`SELECT follower_id FROM follows WHERE following_id = ${playerId} ORDER BY created_at DESC LIMIT 50`;
  const profiles = await Promise.all(rows.map(r => getCommunityProfileV2(r.follower_id, viewerId)));
  return profiles.filter(Boolean) as CommunityProfileV2[];
}

export async function getFollowingList(playerId: string, viewerId: string): Promise<CommunityProfileV2[]> {
  const rows = await sql<{ following_id: string }[]>`SELECT following_id FROM follows WHERE follower_id = ${playerId} ORDER BY created_at DESC LIMIT 50`;
  const profiles = await Promise.all(rows.map(r => getCommunityProfileV2(r.following_id, viewerId)));
  return profiles.filter(Boolean) as CommunityProfileV2[];
}

// Search
export async function searchCommunity(query: string, viewerId: string): Promise<CommunitySearchResult> {
  const q = `%${query.slice(0, 100)}%`;
  const [postRows, peopleRows, hashtagRows, loungeRows] = await Promise.all([
    sql<any[]>`SELECT p.*, pl.username AS author_name, pl.avatar AS author_avatar, pl.avatar_url AS author_avatar_url, pl.level AS author_level, pl.community_bio AS author_bio, pl.community_cover_url AS author_cover_url FROM community_posts p JOIN players pl ON pl.id = p.author_id WHERE p.hidden = false AND p.content ILIKE ${q} ORDER BY p.created_at DESC LIMIT 20`,
    sql<{ id: string }[]>`SELECT id FROM players WHERE username ILIKE ${q} LIMIT 20`,
    sql<{ hashtag: string; count: number }[]>`SELECT hashtag, COUNT(*) AS count FROM community_post_hashtags WHERE hashtag ILIKE ${q} GROUP BY hashtag ORDER BY count DESC LIMIT 20`,
    sql<any[]>`SELECT * FROM community_lounges WHERE name ILIKE ${q} LIMIT 10`,
  ]);

  const [posts, people] = await Promise.all([
    Promise.all(postRows.map(r => buildPostV2(r, viewerId))),
    Promise.all(peopleRows.map(r => getCommunityProfileV2(r.id, viewerId))),
  ]);

  return {
    posts,
    people: people.filter(Boolean) as CommunityProfileV2[],
    hashtags: hashtagRows.map(r => ({ hashtag: r.hashtag, count: Number(r.count) })),
    lounges: loungeRows,
  };
}

// Online members
export async function upsertOnlineSeen(playerId: string): Promise<void> {
  await sql`INSERT INTO community_online_log (player_id, last_seen) VALUES (${playerId}, ${Date.now()}) ON CONFLICT (player_id) DO UPDATE SET last_seen = EXCLUDED.last_seen`;
}

export async function getOnlineMembers(): Promise<Array<{ playerId: string; username: string; avatar: string; avatarUrl: string | null }>> {
  const threshold = Date.now() - 5 * 60 * 1000;
  const rows = await sql<{ player_id: string; username: string; avatar: string; avatar_url: string | null }[]>`
    SELECT ol.player_id, pl.username, pl.avatar, pl.avatar_url
    FROM community_online_log ol
    JOIN players pl ON pl.id = ol.player_id
    WHERE ol.last_seen > ${threshold}
    ORDER BY ol.last_seen DESC
    LIMIT 100
  `;
  return rows.map(r => ({ playerId: r.player_id, username: r.username, avatar: r.avatar, avatarUrl: r.avatar_url ?? null }));
}

// Trending computation
export async function computeTrending(): Promise<void> {
  const now = Date.now();
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;
  const rows = await sql<{ id: string; likes_count: number; comments_count: number; created_at: number }[]>`
    SELECT id, likes_count, comments_count, created_at FROM community_posts
    WHERE hidden = false AND created_at > ${cutoff}
    ORDER BY (likes_count + comments_count * 2) DESC LIMIT 100
  `;
  for (const r of rows) {
    const ageHours = Math.max(0.1, (now - Number(r.created_at)) / 3_600_000);
    const score = (Number(r.likes_count) + Number(r.comments_count) * 2) / Math.pow(ageHours + 2, 1.5);
    await sql`INSERT INTO community_trending_posts (post_id, score, updated_at) VALUES (${r.id}, ${score}, ${now}) ON CONFLICT (post_id) DO UPDATE SET score = EXCLUDED.score, updated_at = EXCLUDED.updated_at`;
  }
  const tagRows = await sql<{ hashtag: string; count: string }[]>`
    SELECT ht.hashtag, COUNT(*) AS count FROM community_post_hashtags ht
    JOIN community_posts p ON p.id = ht.post_id
    WHERE p.hidden = false AND p.created_at > ${cutoff}
    GROUP BY ht.hashtag ORDER BY count DESC LIMIT 50
  `;
  for (const r of tagRows) {
    await sql`INSERT INTO community_trending_hashtags (hashtag, count, updated_at) VALUES (${r.hashtag}, ${Number(r.count)}, ${now}) ON CONFLICT (hashtag) DO UPDATE SET count = EXCLUDED.count, updated_at = EXCLUDED.updated_at`;
  }
}

// Recalculate player reputation
export async function recalcReputation(playerId: string): Promise<void> {
  const result = await sql<{ total: string }[]>`SELECT COALESCE(SUM(likes_count), 0) AS total FROM community_posts WHERE author_id = ${playerId} AND hidden = false`;
  const rep = Number(result[0]?.total ?? 0);
  await sql`UPDATE players SET community_reputation = ${rep} WHERE id = ${playerId}`;
}

export async function togglePostReaction(postId: string, playerId: string, emoji: string): Promise<{ emoji: string | null; reactions: Record<string, number>; myReaction: string | null }> {
  // Valid emojis
  const VALID = ['🔥','❤️','😂','💀','🤝','👑'];
  if (!VALID.includes(emoji)) throw new Error('Invalid reaction.');

  const [existing] = await sql`SELECT emoji FROM community_post_reactions WHERE post_id = ${postId} AND player_id = ${playerId}` as any[];

  if (existing) {
    if (existing.emoji === emoji) {
      // Same emoji → remove reaction
      await sql`DELETE FROM community_post_reactions WHERE post_id = ${postId} AND player_id = ${playerId}`;
      // Update likes_count based on reactions
      const rows = await sql`SELECT emoji, COUNT(*) as cnt FROM community_post_reactions WHERE post_id = ${postId} GROUP BY emoji` as any[];
      const reactions: Record<string, number> = {};
      let total = 0;
      for (const r of rows) { reactions[r.emoji] = Number(r.cnt); total += Number(r.cnt); }
      await sql`UPDATE community_posts SET likes_count = ${total} WHERE id = ${postId}`;
      return { emoji: null, reactions, myReaction: null };
    } else {
      // Different emoji → update
      await sql`UPDATE community_post_reactions SET emoji = ${emoji}, created_at = ${Date.now()} WHERE post_id = ${postId} AND player_id = ${playerId}`;
    }
  } else {
    // New reaction
    await sql`INSERT INTO community_post_reactions (post_id, player_id, emoji, created_at) VALUES (${postId}, ${playerId}, ${emoji}, ${Date.now()})`;
  }

  const rows = await sql`SELECT emoji, COUNT(*) as cnt FROM community_post_reactions WHERE post_id = ${postId} GROUP BY emoji` as any[];
  const reactions: Record<string, number> = {};
  let total = 0;
  for (const r of rows) { reactions[r.emoji] = Number(r.cnt); total += Number(r.cnt); }
  await sql`UPDATE community_posts SET likes_count = ${total} WHERE id = ${postId}`;
  return { emoji, reactions, myReaction: emoji };
}

export async function getPostReactions(postId: string, playerId?: string): Promise<{ reactions: Record<string, number>; myReaction: string | null }> {
  const rows = await sql`SELECT emoji, COUNT(*) as cnt FROM community_post_reactions WHERE post_id = ${postId} GROUP BY emoji` as any[];
  const reactions: Record<string, number> = {};
  for (const r of rows) { reactions[r.emoji] = Number(r.cnt); }
  let myReaction: string | null = null;
  if (playerId) {
    const [me] = await sql`SELECT emoji FROM community_post_reactions WHERE post_id = ${postId} AND player_id = ${playerId}` as any[];
    myReaction = me?.emoji ?? null;
  }
  return { reactions, myReaction };
}

export async function getWeeklyLeaderboard(): Promise<Array<{ playerId: string; username: string; avatarUrl: string | null; score: number; rank: number }>> {
  const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const rows = await sql`
    SELECT p.id as player_id, p.username, p.avatar_url,
           COALESCE(SUM(cp.likes_count * 2 + cp.comments_count * 3), 0) as score
    FROM profiles p
    JOIN community_posts cp ON cp.author_id = p.id
    WHERE cp.created_at > ${weekStart} AND cp.deleted_at IS NULL
    GROUP BY p.id, p.username, p.avatar_url
    ORDER BY score DESC
    LIMIT 20
  ` as any[];
  return rows.map((r: any, i: number) => ({
    playerId: r.player_id,
    username: r.username,
    avatarUrl: r.avatar_url ?? null,
    score: Number(r.score),
    rank: i + 1,
  }));
}

export async function distributeLeaderboardRewards(sql_: any, recordTransaction_: any): Promise<void> {
  const leaders = await getWeeklyLeaderboard();
  const prizes = [200, 100, 50];
  const weekStart = Date.now();
  for (let i = 0; i < Math.min(3, leaders.length); i++) {
    const leader = leaders[i];
    if (leader.score === 0) continue;
    // Check not already rewarded this week
    const [already] = await sql_`SELECT id FROM community_leaderboard_rewards WHERE player_id = ${leader.playerId} AND week_start > ${weekStart - 7 * 24 * 3600 * 1000}` as any[];
    if (already) continue;
    await recordTransaction_(leader.playerId, 'grant', prizes[i], `Community leaderboard #${i + 1} weekly reward`, {});
    const id = Math.random().toString(36).slice(2);
    await sql_`INSERT INTO community_leaderboard_rewards (id, player_id, week_start, rank, coins, created_at) VALUES (${id}, ${leader.playerId}, ${weekStart}, ${i + 1}, ${prizes[i]}, ${Date.now()})`;
  }
}
