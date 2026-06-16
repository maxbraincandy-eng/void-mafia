import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';
import { getClanMembershipByPlayer } from './clanService.js';
// ── Player lookup helper (lightweight — avoids a full playerService import cycle) ──
async function getPlayerBasic(id) {
    const [row] = await sql `
    SELECT username, avatar, avatar_url, public_id, level, joined_at FROM players WHERE id = ${id}
  `;
    if (!row)
        return null;
    return {
        username: row.username, avatar: row.avatar,
        avatarUrl: row.avatar_url ?? null,
        publicId: row.public_id != null ? Number(row.public_id) : null,
        level: Number(row.level ?? 1),
        joinedAt: Number(row.joined_at),
    };
}
// ── Void News ────────────────────────────────────────────────────────────
function rowToNews(r) {
    return {
        id: r.id, title: r.title, content: r.content, pinned: !!r.pinned,
        authorId: r.author_id ?? null, authorName: r.author_name ?? 'Mr. Max',
        createdAt: Number(r.created_at),
    };
}
export async function listNews() {
    const rows = await sql `
    SELECT n.*, p.username as author_name FROM void_news n
    LEFT JOIN players p ON p.id = n.author_id
    ORDER BY n.pinned DESC, n.created_at DESC LIMIT 100
  `;
    return rows.map(rowToNews);
}
export async function createNews(authorId, title, content, pinned) {
    const id = generateId();
    const now = Date.now();
    const cleanTitle = title.trim().slice(0, 120);
    const cleanContent = content.trim().slice(0, 4000);
    if (!cleanTitle || !cleanContent)
        throw new Error('Title and content are required.');
    await sql `
    INSERT INTO void_news (id, title, content, pinned, author_id, created_at)
    VALUES (${id}, ${cleanTitle}, ${cleanContent}, ${pinned}, ${authorId}, ${now})
  `;
    const [row] = await sql `
    SELECT n.*, p.username as author_name FROM void_news n LEFT JOIN players p ON p.id = n.author_id WHERE n.id = ${id}
  `;
    return rowToNews(row);
}
export async function deleteNews(id) {
    await sql `DELETE FROM void_news WHERE id = ${id}`;
}
// ── Max Recommends ──────────────────────────────────────────────────────
function rowToRecommend(r) {
    return {
        id: r.id, category: r.category, title: r.title, review: r.review,
        imageUrl: r.image_url ?? null, createdAt: Number(r.created_at),
    };
}
export async function listRecommends() {
    const rows = await sql `SELECT * FROM max_recommends ORDER BY created_at DESC LIMIT 200`;
    return rows.map(rowToRecommend);
}
export async function createRecommend(category, title, review, imageUrl) {
    const id = generateId();
    const now = Date.now();
    const cleanTitle = title.trim().slice(0, 120);
    if (!cleanTitle)
        throw new Error('Title is required.');
    await sql `
    INSERT INTO max_recommends (id, category, title, review, image_url, created_at)
    VALUES (${id}, ${category}, ${cleanTitle}, ${review.trim().slice(0, 2000)}, ${imageUrl}, ${now})
  `;
    const [row] = await sql `SELECT * FROM max_recommends WHERE id = ${id}`;
    return rowToRecommend(row);
}
export async function deleteRecommend(id) {
    await sql `DELETE FROM max_recommends WHERE id = ${id}`;
}
// ── Daily Thoughts ───────────────────────────────────────────────────────
function rowToThought(r) {
    return { id: r.id, content: r.content, pinned: !!r.pinned, createdAt: Number(r.created_at) };
}
export async function listThoughts() {
    const rows = await sql `SELECT * FROM daily_thoughts ORDER BY pinned DESC, created_at DESC LIMIT 200`;
    return rows.map(rowToThought);
}
export async function createThought(content, pinned) {
    const id = generateId();
    const now = Date.now();
    const cleanContent = content.trim().slice(0, 600);
    if (!cleanContent)
        throw new Error('Thought content is required.');
    if (pinned)
        await sql `UPDATE daily_thoughts SET pinned = false`;
    await sql `
    INSERT INTO daily_thoughts (id, content, pinned, created_at)
    VALUES (${id}, ${cleanContent}, ${pinned}, ${now})
  `;
    const [row] = await sql `SELECT * FROM daily_thoughts WHERE id = ${id}`;
    return rowToThought(row);
}
export async function deleteThought(id) {
    await sql `DELETE FROM daily_thoughts WHERE id = ${id}`;
}
// ── Community Feed ───────────────────────────────────────────────────────
async function rowToPost(r, viewerId) {
    let likedByMe = false;
    if (viewerId) {
        const [like] = await sql `SELECT 1 FROM community_post_likes WHERE post_id = ${r.id} AND player_id = ${viewerId}`;
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
export async function listFeed(viewerId, before) {
    const cutoff = before ?? Date.now() + 1;
    const rows = await sql `
    SELECT cp.*, p.username as author_name, p.avatar as author_avatar, p.avatar_url as author_avatar_url
    FROM community_posts cp
    JOIN players p ON p.id = cp.author_id
    WHERE cp.created_at < ${cutoff}
    ORDER BY cp.created_at DESC LIMIT 30
  `;
    return Promise.all(rows.map(r => rowToPost(r, viewerId)));
}
export async function createPost(authorId, content, imageUrl) {
    const cleanContent = content.trim().slice(0, 1000);
    if (!cleanContent && !imageUrl)
        throw new Error('Post cannot be empty.');
    if (imageUrl && imageUrl.length > 400000)
        throw new Error('Image too large.');
    const id = generateId();
    const now = Date.now();
    await sql `
    INSERT INTO community_posts (id, author_id, content, image_url, likes_count, comments_count, created_at)
    VALUES (${id}, ${authorId}, ${cleanContent}, ${imageUrl}, 0, 0, ${now})
  `;
    const [row] = await sql `
    SELECT cp.*, p.username as author_name, p.avatar as author_avatar, p.avatar_url as author_avatar_url
    FROM community_posts cp JOIN players p ON p.id = cp.author_id WHERE cp.id = ${id}
  `;
    return rowToPost(row, authorId);
}
export async function deletePost(id, requesterId, requesterIsMod) {
    const [row] = await sql `SELECT author_id FROM community_posts WHERE id = ${id}`;
    if (!row)
        throw new Error('Post not found.');
    if (row.author_id !== requesterId && !requesterIsMod)
        throw new Error('Not authorized.');
    await sql `DELETE FROM community_posts WHERE id = ${id}`;
    await sql `DELETE FROM community_post_likes WHERE post_id = ${id}`;
    await sql `DELETE FROM community_post_comments WHERE post_id = ${id}`;
}
export async function toggleLike(postId, playerId) {
    const [existing] = await sql `SELECT 1 FROM community_post_likes WHERE post_id = ${postId} AND player_id = ${playerId}`;
    if (existing) {
        await sql `DELETE FROM community_post_likes WHERE post_id = ${postId} AND player_id = ${playerId}`;
        await sql `UPDATE community_posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ${postId}`;
    }
    else {
        await sql `INSERT INTO community_post_likes (post_id, player_id, created_at) VALUES (${postId}, ${playerId}, ${Date.now()})
      ON CONFLICT DO NOTHING`;
        await sql `UPDATE community_posts SET likes_count = likes_count + 1 WHERE id = ${postId}`;
    }
    const [row] = await sql `SELECT likes_count FROM community_posts WHERE id = ${postId}`;
    if (!row)
        throw new Error('Post not found.');
    return { likesCount: Number(row.likes_count), likedByMe: !existing };
}
function rowToComment(r) {
    return {
        id: r.id, postId: r.post_id, authorId: r.author_id, authorName: r.author_name ?? 'Unknown',
        authorAvatar: r.author_avatar ?? '🙂', content: r.content, createdAt: Number(r.created_at),
    };
}
export async function getComments(postId) {
    const rows = await sql `
    SELECT c.*, p.username as author_name, p.avatar as author_avatar
    FROM community_post_comments c JOIN players p ON p.id = c.author_id
    WHERE c.post_id = ${postId} ORDER BY c.created_at ASC LIMIT 200
  `;
    return rows.map(rowToComment);
}
export async function addComment(postId, authorId, content) {
    const cleanContent = content.trim().slice(0, 500);
    if (!cleanContent)
        throw new Error('Comment cannot be empty.');
    const [post] = await sql `SELECT id FROM community_posts WHERE id = ${postId}`;
    if (!post)
        throw new Error('Post not found.');
    const id = generateId();
    const now = Date.now();
    await sql `
    INSERT INTO community_post_comments (id, post_id, author_id, content, created_at)
    VALUES (${id}, ${postId}, ${authorId}, ${cleanContent}, ${now})
  `;
    await sql `UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = ${postId}`;
    const [row] = await sql `
    SELECT c.*, p.username as author_name, p.avatar as author_avatar
    FROM community_post_comments c JOIN players p ON p.id = c.author_id WHERE c.id = ${id}
  `;
    return rowToComment(row);
}
export async function reportPost(postId, reporterId, reason) {
    const [post] = await sql `SELECT id FROM community_posts WHERE id = ${postId}`;
    if (!post)
        throw new Error('Post not found.');
    await sql `
    INSERT INTO community_reports (id, post_id, reporter_id, reason, status, created_at)
    VALUES (${generateId()}, ${postId}, ${reporterId}, ${reason.trim().slice(0, 300)}, 'pending', ${Date.now()})
  `;
}
export async function listCommunityReports() {
    const rows = await sql `
    SELECT r.*, cp.content as post_content, cp.author_id as post_author_id, rp.username as reporter_name
    FROM community_reports r
    LEFT JOIN community_posts cp ON cp.id = r.post_id
    LEFT JOIN players rp ON rp.id = r.reporter_id
    ORDER BY r.created_at DESC LIMIT 200
  `;
    return rows.map(r => ({
        id: r.id, postId: r.post_id, postContent: r.post_content ?? null, postAuthorId: r.post_author_id ?? null,
        reporterId: r.reporter_id, reporterName: r.reporter_name ?? 'Unknown',
        reason: r.reason, status: r.status, createdAt: Number(r.created_at),
    }));
}
export async function resolveCommunityReport(reportId, status) {
    await sql `UPDATE community_reports SET status = ${status} WHERE id = ${reportId}`;
}
// ── Follow System ────────────────────────────────────────────────────────
export async function follow(followerId, targetId) {
    if (followerId === targetId)
        throw new Error('You cannot follow yourself.');
    const target = await getPlayerBasic(targetId);
    if (!target)
        throw new Error('Player not found.');
    await sql `
    INSERT INTO follows (follower_id, following_id, created_at) VALUES (${followerId}, ${targetId}, ${Date.now()})
    ON CONFLICT DO NOTHING
  `;
}
export async function unfollow(followerId, targetId) {
    await sql `DELETE FROM follows WHERE follower_id = ${followerId} AND following_id = ${targetId}`;
}
export async function isFollowing(followerId, targetId) {
    const [row] = await sql `SELECT 1 FROM follows WHERE follower_id = ${followerId} AND following_id = ${targetId}`;
    return !!row;
}
export async function getFollowerIds(targetId) {
    const rows = await sql `SELECT follower_id FROM follows WHERE following_id = ${targetId}`;
    return rows.map((r) => r.follower_id);
}
export async function getCommunityProfile(targetId, viewerId) {
    const base = await getPlayerBasic(targetId);
    if (!base)
        throw new Error('Player not found.');
    const [[followers], [following], [posts], clan, followedByMe] = await Promise.all([
        sql `SELECT COUNT(*) as c FROM follows WHERE following_id = ${targetId}`,
        sql `SELECT COUNT(*) as c FROM follows WHERE follower_id = ${targetId}`,
        sql `SELECT COUNT(*) as c FROM community_posts WHERE author_id = ${targetId}`,
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
async function rowToEvent(r, viewerId) {
    const [[count], joined] = await Promise.all([
        sql `SELECT COUNT(*) as c FROM community_event_participants WHERE event_id = ${r.id}`,
        viewerId
            ? sql `SELECT 1 FROM community_event_participants WHERE event_id = ${r.id} AND player_id = ${viewerId}`
            : Promise.resolve([]),
    ]);
    return {
        id: r.id, title: r.title, description: r.description, category: r.category,
        eventAt: Number(r.event_at), createdBy: r.created_by, createdByName: r.created_by_name ?? 'Unknown',
        participantCount: Number(count.c), joinedByMe: Array.isArray(joined) && joined.length > 0,
        createdAt: Number(r.created_at),
    };
}
export async function listEvents(viewerId) {
    const rows = await sql `
    SELECT e.*, p.username as created_by_name FROM community_events e
    JOIN players p ON p.id = e.created_by
    WHERE e.event_at > ${Date.now() - 24 * 60 * 60 * 1000}
    ORDER BY e.event_at ASC LIMIT 100
  `;
    return Promise.all(rows.map(r => rowToEvent(r, viewerId)));
}
export async function createEvent(createdBy, title, description, category, eventAt) {
    const cleanTitle = title.trim().slice(0, 120);
    if (!cleanTitle)
        throw new Error('Title is required.');
    const id = generateId();
    const now = Date.now();
    await sql `
    INSERT INTO community_events (id, title, description, category, event_at, created_by, created_at)
    VALUES (${id}, ${cleanTitle}, ${description.trim().slice(0, 1000)}, ${category}, ${eventAt}, ${createdBy}, ${now})
  `;
    await sql `
    INSERT INTO community_event_participants (event_id, player_id, joined_at) VALUES (${id}, ${createdBy}, ${now})
    ON CONFLICT DO NOTHING
  `;
    const [row] = await sql `
    SELECT e.*, p.username as created_by_name FROM community_events e JOIN players p ON p.id = e.created_by WHERE e.id = ${id}
  `;
    return rowToEvent(row, createdBy);
}
export async function joinEvent(eventId, playerId) {
    const [event] = await sql `SELECT id FROM community_events WHERE id = ${eventId}`;
    if (!event)
        throw new Error('Event not found.');
    await sql `
    INSERT INTO community_event_participants (event_id, player_id, joined_at) VALUES (${eventId}, ${playerId}, ${Date.now()})
    ON CONFLICT DO NOTHING
  `;
}
export async function leaveEvent(eventId, playerId) {
    await sql `DELETE FROM community_event_participants WHERE event_id = ${eventId} AND player_id = ${playerId}`;
}
// ── Notifications ─────────────────────────────────────────────────────────
function rowToNotification(r) {
    return {
        id: r.id, type: r.type, title: r.title, body: r.body, link: r.link ?? null,
        read: !!r.read, createdAt: Number(r.created_at),
    };
}
export async function createNotification(playerId, type, title, body, link) {
    const id = generateId();
    const now = Date.now();
    await sql `
    INSERT INTO community_notifications (id, player_id, type, title, body, link, read, created_at)
    VALUES (${id}, ${playerId}, ${type}, ${title}, ${body}, ${link}, false, ${now})
  `;
    return { id, type, title, body, link, read: false, createdAt: now };
}
export async function notifyFollowers(authorId, type, title, body, link) {
    const followerIds = await getFollowerIds(authorId);
    for (const fid of followerIds) {
        await createNotification(fid, type, title, body, link);
    }
    return followerIds;
}
export async function notifyAllPlayers(type, title, body, link) {
    const rows = await sql `SELECT id FROM players`;
    for (const r of rows) {
        await createNotification(r.id, type, title, body, link);
    }
    return rows.map((r) => r.id);
}
export async function listNotifications(playerId) {
    const rows = await sql `
    SELECT * FROM community_notifications WHERE player_id = ${playerId} ORDER BY created_at DESC LIMIT 50
  `;
    return rows.map(rowToNotification);
}
export async function getUnreadNotificationCount(playerId) {
    const [row] = await sql `SELECT COUNT(*) as c FROM community_notifications WHERE player_id = ${playerId} AND read = false`;
    return Number(row?.c ?? 0);
}
export async function markNotificationsRead(playerId) {
    await sql `UPDATE community_notifications SET read = true WHERE player_id = ${playerId} AND read = false`;
}
// ── Community Lounges ────────────────────────────────────────────────────
function rowToLounge(r, listenerCount, speakerCount) {
    return {
        id: r.id, name: r.name, description: r.description, ownerId: r.owner_id ?? null,
        kind: r.kind, isLive: !!r.is_live, lastTopic: r.last_topic, createdAt: Number(r.created_at),
        listenerCount, speakerCount,
    };
}
export async function listLoungeRows() {
    return await sql `SELECT * FROM community_lounges ORDER BY (kind = 'max_lounge') DESC, (kind = 'void_radio') DESC, created_at ASC`;
}
export async function getLoungeRow(id) {
    const [row] = await sql `SELECT * FROM community_lounges WHERE id = ${id}`;
    return row ?? null;
}
export { rowToLounge };
export async function createLounge(ownerId, name, description) {
    const cleanName = name.trim().slice(0, 60);
    if (!cleanName)
        throw new Error('Lounge name is required.');
    const id = generateId();
    const now = Date.now();
    await sql `
    INSERT INTO community_lounges (id, name, description, owner_id, kind, is_live, last_topic, created_at)
    VALUES (${id}, ${cleanName}, ${description.trim().slice(0, 300)}, ${ownerId}, 'lounge', false, '', ${now})
  `;
    const row = await getLoungeRow(id);
    return rowToLounge(row, 0, 0);
}
export async function setLoungeLive(loungeId, isLive, lastTopic) {
    const row = await getLoungeRow(loungeId);
    if (!row)
        throw new Error('Lounge not found.');
    if (lastTopic !== null) {
        await sql `UPDATE community_lounges SET is_live = ${isLive}, last_topic = ${lastTopic.trim().slice(0, 200)} WHERE id = ${loungeId}`;
    }
    else {
        await sql `UPDATE community_lounges SET is_live = ${isLive} WHERE id = ${loungeId}`;
    }
    const updated = await getLoungeRow(loungeId);
    return rowToLounge(updated, 0, 0);
}
export async function communityBanPlayer(targetId, bannedBy, reason, durationSeconds) {
    await sql `UPDATE community_bans SET active = 0 WHERE player_id = ${targetId}`;
    const id = generateId();
    const now = Date.now();
    const expiresAt = now + durationSeconds * 1000;
    await sql `
    INSERT INTO community_bans (id, player_id, banned_by, reason, issued_at, expires_at, active)
    VALUES (${id}, ${targetId}, ${bannedBy}, ${reason.trim().slice(0, 300)}, ${now}, ${expiresAt}, 1)
  `;
    return { id, reason, issuedAt: now, expiresAt };
}
export async function communityUnbanPlayer(targetId) {
    await sql `UPDATE community_bans SET active = 0 WHERE player_id = ${targetId}`;
}
export async function getActiveCommunityBan(targetId) {
    const now = Date.now();
    const [row] = await sql `
    SELECT * FROM community_bans WHERE player_id = ${targetId} AND active = 1 AND expires_at > ${now}
    ORDER BY expires_at DESC LIMIT 1
  `;
    if (!row)
        return null;
    return { id: row.id, reason: row.reason, issuedAt: Number(row.issued_at), expiresAt: Number(row.expires_at) };
}
//# sourceMappingURL=communityService.js.map