import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';

// ── User search ──────────────────────────────────────────────────────────
export async function adminSearchUser(query: string): Promise<any[]> {
  const q = `%${query}%`;
  const rows = await sql`
    SELECT id, username, friend_code, moderator_level, avatar_url,
           profile_locked, secret_mode_disabled, force_public,
           joined_at, last_seen_at, is_online
    FROM players
    WHERE username ILIKE ${q} OR friend_code ILIKE ${q} OR id ILIKE ${q}
    LIMIT 20
  `;
  return rows as any[];
}

// ── Admin view of user profile (bypasses secret mode) ───────────────────
export async function adminGetUserProfile(playerId: string): Promise<any | null> {
  const [player] = await sql`
    SELECT p.id, p.username, p.friend_code, p.moderator_level, p.avatar_url,
           p.profile_locked, p.secret_mode_disabled, p.force_public,
           p.joined_at, p.last_seen_at, p.is_online,
           (SELECT COUNT(*) FROM community_posts WHERE author_id = p.id AND deleted_at IS NULL) as post_count,
           (SELECT COUNT(*) FROM community_post_comments WHERE author_id = p.id AND deleted_at IS NULL) as comment_count,
           (SELECT COUNT(*) FROM community_debates WHERE created_by = p.id AND deleted_at IS NULL) as debate_count
    FROM players p
    WHERE p.id = ${playerId}
  ` as any[];
  if (!player) return null;

  // Active suspension
  const [suspension] = await sql`
    SELECT * FROM community_suspensions
    WHERE player_id = ${playerId} AND active = 1 AND expires_at > ${Date.now()}
    ORDER BY issued_at DESC LIMIT 1
  ` as any[];

  // Active mute
  const [mute] = await sql`
    SELECT * FROM community_mutes
    WHERE player_id = ${playerId} AND active = 1 AND expires_at > ${Date.now()}
    ORDER BY issued_at DESC LIMIT 1
  ` as any[];

  // Warnings
  const warnings = await sql`
    SELECT w.*, p.username as issued_by_name FROM community_warnings w
    LEFT JOIN players p ON p.id = w.issued_by
    WHERE w.player_id = ${playerId}
    ORDER BY w.issued_at DESC LIMIT 20
  ` as any[];

  // Active ban
  const [ban] = await sql`
    SELECT * FROM community_bans
    WHERE player_id = ${playerId} AND active = 1 AND expires_at > ${Date.now()}
    ORDER BY issued_at DESC LIMIT 1
  ` as any[];

  // Badges
  const badges = await sql`
    SELECT badge, visibility FROM community_badges WHERE player_id = ${playerId}
  ` as any[];

  return { ...player, suspension: suspension ?? null, mute: mute ?? null, ban: ban ?? null, warnings, badges };
}

// ── Issue a warning ──────────────────────────────────────────────────────
export async function issueWarning(playerId: string, issuedBy: string, reason: string): Promise<void> {
  const id = `warn_${Date.now()}_${generateId().slice(0, 6)}`;
  await sql`
    INSERT INTO community_warnings (id, player_id, issued_by, reason, issued_at)
    VALUES (${id}, ${playerId}, ${issuedBy}, ${reason}, ${Date.now()})
  `;
}

// ── Suspend a user ───────────────────────────────────────────────────────
export async function suspendUser(
  playerId: string,
  suspendedBy: string,
  reason: string,
  durationSeconds: number,
): Promise<void> {
  await sql`UPDATE community_suspensions SET active = 0 WHERE player_id = ${playerId}`;
  const id = `sus_${Date.now()}_${generateId().slice(0, 6)}`;
  const expiresAt = durationSeconds === 0 ? 9_999_999_999_999 : Date.now() + durationSeconds * 1000;
  await sql`
    INSERT INTO community_suspensions (id, player_id, suspended_by, reason, issued_at, expires_at, active)
    VALUES (${id}, ${playerId}, ${suspendedBy}, ${reason}, ${Date.now()}, ${expiresAt}, 1)
  `;
}

// ── Lift suspension ──────────────────────────────────────────────────────
export async function liftSuspension(playerId: string): Promise<void> {
  await sql`UPDATE community_suspensions SET active = 0 WHERE player_id = ${playerId}`;
}

// ── Mute a user ──────────────────────────────────────────────────────────
export async function muteUser(
  playerId: string,
  mutedBy: string,
  reason: string,
  durationSeconds: number,
): Promise<void> {
  await sql`UPDATE community_mutes SET active = 0 WHERE player_id = ${playerId}`;
  const id = `mute_${Date.now()}_${generateId().slice(0, 6)}`;
  const expiresAt = durationSeconds === 0 ? 9_999_999_999_999 : Date.now() + durationSeconds * 1000;
  await sql`
    INSERT INTO community_mutes (id, player_id, muted_by, reason, issued_at, expires_at, active)
    VALUES (${id}, ${playerId}, ${mutedBy}, ${reason}, ${Date.now()}, ${expiresAt}, 1)
  `;
}

// ── Unmute ───────────────────────────────────────────────────────────────
export async function unmuteUser(playerId: string): Promise<void> {
  await sql`UPDATE community_mutes SET active = 0 WHERE player_id = ${playerId}`;
}

// ── Check if user is suspended ───────────────────────────────────────────
export async function isUserSuspended(playerId: string): Promise<boolean> {
  const [row] = await sql`
    SELECT id FROM community_suspensions
    WHERE player_id = ${playerId} AND active = 1 AND expires_at > ${Date.now()}
    LIMIT 1
  ` as any[];
  return !!row;
}

// ── Check if user is community-muted ────────────────────────────────────
export async function isUserCommunityMuted(playerId: string): Promise<boolean> {
  const [row] = await sql`
    SELECT id FROM community_mutes
    WHERE player_id = ${playerId} AND active = 1 AND expires_at > ${Date.now()}
    LIMIT 1
  ` as any[];
  return !!row;
}

// ── Profile controls ─────────────────────────────────────────────────────
export async function setProfileControls(
  playerId: string,
  controls: { profileLocked?: boolean; secretModeDisabled?: boolean; forcePublic?: boolean },
): Promise<void> {
  if (controls.profileLocked !== undefined) {
    await sql`UPDATE players SET profile_locked = ${controls.profileLocked ? 1 : 0} WHERE id = ${playerId}`;
  }
  if (controls.secretModeDisabled !== undefined) {
    const v = controls.secretModeDisabled ? 1 : 0;
    // When disabling secret mode, also turn off the flag itself
    await sql`UPDATE players SET secret_mode_disabled = ${v} WHERE id = ${playerId}`;
  }
  if (controls.forcePublic !== undefined) {
    await sql`UPDATE players SET force_public = ${controls.forcePublic ? 1 : 0} WHERE id = ${playerId}`;
  }
}

// ── Soft-delete a post ───────────────────────────────────────────────────
export async function adminDeletePost(postId: string, deletedBy: string): Promise<void> {
  await sql`UPDATE community_posts SET deleted_at = ${Date.now()}, deleted_by = ${deletedBy} WHERE id = ${postId}`;
}

// ── Restore a post ───────────────────────────────────────────────────────
export async function adminRestorePost(postId: string): Promise<void> {
  await sql`UPDATE community_posts SET deleted_at = NULL, deleted_by = NULL WHERE id = ${postId}`;
}

// ── Soft-delete a comment ────────────────────────────────────────────────
export async function adminDeleteComment(commentId: string, deletedBy: string): Promise<void> {
  await sql`UPDATE community_post_comments SET deleted_at = ${Date.now()}, deleted_by = ${deletedBy} WHERE id = ${commentId}`;
}

// ── Restore a comment ────────────────────────────────────────────────────
export async function adminRestoreComment(commentId: string): Promise<void> {
  await sql`UPDATE community_post_comments SET deleted_at = NULL, deleted_by = NULL WHERE id = ${commentId}`;
}

// ── Soft-delete a debate ─────────────────────────────────────────────────
export async function adminDeleteDebate(debateId: string, deletedBy: string): Promise<void> {
  await sql`UPDATE community_debates SET deleted_at = ${Date.now()}, deleted_by = ${deletedBy} WHERE id = ${debateId}`;
}

// ── Restore a debate ─────────────────────────────────────────────────────
export async function adminRestoreDebate(debateId: string): Promise<void> {
  await sql`UPDATE community_debates SET deleted_at = NULL, deleted_by = NULL WHERE id = ${debateId}`;
}

// ── Debate flags (pin / feature / lock) ─────────────────────────────────
export async function adminSetDebateFlags(
  debateId: string,
  flags: { pinned?: boolean; featured?: boolean; locked?: boolean },
): Promise<void> {
  if (flags.pinned !== undefined) {
    await sql`UPDATE community_debates SET pinned = ${flags.pinned ? 1 : 0} WHERE id = ${debateId}`;
  }
  if (flags.featured !== undefined) {
    await sql`UPDATE community_debates SET featured = ${flags.featured ? 1 : 0} WHERE id = ${debateId}`;
  }
  if (flags.locked !== undefined) {
    await sql`UPDATE community_debates SET locked = ${flags.locked ? 1 : 0} WHERE id = ${debateId}`;
  }
}

// ── List all reports (extended) ──────────────────────────────────────────
export async function listAllReports(limit = 100): Promise<any[]> {
  return await sql`
    SELECT r.*,
      p.content      as post_content,
      p.author_id    as post_author_id,
      rep.username   as reporter_name,
      author.username as target_name
    FROM community_reports r
    LEFT JOIN community_posts p   ON p.id = r.post_id
    LEFT JOIN players rep         ON rep.id = r.reporter_id
    LEFT JOIN players author      ON author.id = COALESCE(r.target_player_id, p.author_id)
    ORDER BY r.created_at DESC
    LIMIT ${limit}
  ` as any[];
}

// ── Deleted content for recovery ─────────────────────────────────────────
export async function listDeletedContent(
  type: 'posts' | 'comments' | 'debates',
  limit = 50,
): Promise<any[]> {
  if (type === 'posts') {
    return await sql`
      SELECT cp.*, pl.username as author_name, d.username as deleted_by_name
      FROM community_posts cp
      LEFT JOIN players pl ON pl.id = cp.author_id
      LEFT JOIN players d  ON d.id  = cp.deleted_by
      WHERE cp.deleted_at IS NOT NULL
      ORDER BY cp.deleted_at DESC LIMIT ${limit}
    ` as any[];
  } else if (type === 'comments') {
    return await sql`
      SELECT c.*, pl.username as author_name, d.username as deleted_by_name
      FROM community_post_comments c
      LEFT JOIN players pl ON pl.id = c.author_id
      LEFT JOIN players d  ON d.id  = c.deleted_by
      WHERE c.deleted_at IS NOT NULL
      ORDER BY c.deleted_at DESC LIMIT ${limit}
    ` as any[];
  } else {
    return await sql`
      SELECT db.*, pl.username as creator_name, d.username as deleted_by_name
      FROM community_debates db
      LEFT JOIN players pl ON pl.id = db.created_by
      LEFT JOIN players d  ON d.id  = db.deleted_by
      WHERE db.deleted_at IS NOT NULL
      ORDER BY db.deleted_at DESC LIMIT ${limit}
    ` as any[];
  }
}

// ── Audit logs ───────────────────────────────────────────────────────────
export async function getAdminAuditLogs(limit = 100): Promise<any[]> {
  return await sql`
    SELECT l.*, p.username as mod_name, t.username as target_name
    FROM community_mod_logs l
    LEFT JOIN players p ON p.id = l.mod_id
    LEFT JOIN players t ON t.id = l.target_id
    ORDER BY l.created_at DESC
    LIMIT ${limit}
  ` as any[];
}
