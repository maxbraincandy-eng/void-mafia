import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';

export interface Clan {
  id: string; name: string; tag: string; ownerId: string;
  description: string; wins: number; losses: number; createdAt: number; memberCount: number;
  imageUrl: string;
}

export type ClanRole = 'owner' | 'admin' | 'moderator' | 'member';

export interface ClanMember {
  playerId: string; username: string; avatar: string;
  role: ClanRole; joinedAt: number;
}

async function rowToClan(row: any): Promise<Clan> {
  const [mc] = await sql`SELECT COUNT(*) as c FROM clan_members WHERE clan_id = ${row.id}` as any[];
  return {
    id: row.id, name: row.name, tag: row.tag,
    ownerId: row.owner_id, description: row.description,
    wins: Number(row.wins), losses: Number(row.losses), createdAt: Number(row.created_at),
    memberCount: Number(mc?.c ?? 0),
    imageUrl: row.image_url ?? '',
  };
}

export async function setClanImage(clanId: string, requesterId: string, imageData: string): Promise<void> {
  const [row] = await sql`SELECT owner_id FROM clans WHERE id = ${clanId}` as any[];
  if (!row) throw new Error('Clan not found.');
  if (row.owner_id !== requesterId) throw new Error('Only the clan owner can change the clan image.');
  if (!imageData.startsWith('data:image/')) throw new Error('Invalid image format.');
  if (imageData.length > 2_700_000) throw new Error('Image too large. Max ~2MB.');
  await sql`UPDATE clans SET image_url = ${imageData} WHERE id = ${clanId}`;
}

export async function createClan(ownerId: string, name: string, tag: string, description: string): Promise<Clan> {
  const [existing] = await sql`
    SELECT id FROM clans WHERE name = ${name.trim()} OR tag = ${tag.trim().toUpperCase()}
  ` as any[];
  if (existing) throw new Error('A clan with that name or tag already exists.');

  const [existing2] = await sql`SELECT clan_id FROM clan_members WHERE player_id = ${ownerId}` as any[];
  if (existing2) throw new Error('You are already in a clan. Leave first.');

  const id = generateId();
  const now = Date.now();
  const cleanTag = tag.trim().toUpperCase().slice(0, 5);
  const cleanName = name.trim().slice(0, 32);
  const cleanDesc = description.slice(0, 200);

  await sql`
    INSERT INTO clans (id, name, tag, owner_id, description, wins, losses, created_at)
    VALUES (${id}, ${cleanName}, ${cleanTag}, ${ownerId}, ${cleanDesc}, 0, 0, ${now})
  `;
  await sql`
    INSERT INTO clan_members (clan_id, player_id, role, joined_at)
    VALUES (${id}, ${ownerId}, 'owner', ${now})
  `;

  const [row] = await sql`SELECT * FROM clans WHERE id = ${id}` as any[];
  return rowToClan(row);
}

export async function getClan(id: string): Promise<Clan | null> {
  const [row] = await sql`SELECT * FROM clans WHERE id = ${id}` as any[];
  return row ? rowToClan(row) : null;
}

export async function getClanByPlayer(playerId: string): Promise<Clan | null> {
  const [membership] = await sql`SELECT clan_id FROM clan_members WHERE player_id = ${playerId}` as any[];
  if (!membership) return null;
  return getClan(membership.clan_id);
}

export interface ClanMembership {
  id: string;
  name: string;
  tag: string;
  memberRole: ClanRole;
  joinedAt: number;
  wins: number;
  losses: number;
  memberCount: number;
}

export async function getClanMembershipByPlayer(playerId: string): Promise<ClanMembership | null> {
  const rows = await sql`
    SELECT c.id, c.name, c.tag, c.wins, c.losses,
           cm.role as member_role, cm.joined_at as member_joined_at,
           (SELECT COUNT(*) FROM clan_members WHERE clan_id = c.id) as member_count
    FROM clan_members cm
    JOIN clans c ON c.id = cm.clan_id
    WHERE cm.player_id = ${playerId}
    LIMIT 1
  ` as any[];
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id, name: r.name, tag: r.tag,
    memberRole: r.member_role as ClanRole,
    joinedAt: Number(r.member_joined_at),
    wins: Number(r.wins), losses: Number(r.losses),
    memberCount: Number(r.member_count),
  };
}

export async function getAllClans(): Promise<Clan[]> {
  const rows = await sql`SELECT * FROM clans ORDER BY wins DESC LIMIT 100` as any[];
  return Promise.all(rows.map(rowToClan));
}

export async function getClanMembers(clanId: string): Promise<ClanMember[]> {
  const rows = await sql`
    SELECT cm.player_id, cm.role, cm.joined_at, p.username, p.avatar, p.avatar_url, p.public_id
    FROM clan_members cm
    JOIN players p ON p.id = cm.player_id
    WHERE cm.clan_id = ${clanId}
    ORDER BY
      CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END ASC,
      cm.joined_at ASC
  ` as any[];
  return rows.map((r: any) => ({
    playerId: r.player_id, username: r.username, avatar: r.avatar,
    avatarUrl: r.avatar_url ?? null,
    publicId: r.public_id != null ? Number(r.public_id) : null,
    role: r.role, joinedAt: Number(r.joined_at),
  }));
}

export async function joinClan(playerId: string, clanId: string): Promise<void> {
  const [existing] = await sql`SELECT clan_id FROM clan_members WHERE player_id = ${playerId}` as any[];
  if (existing) throw new Error('You are already in a clan. Leave first.');
  const clan = await getClan(clanId);
  if (!clan) throw new Error('Clan not found.');
  await sql`
    INSERT INTO clan_members (clan_id, player_id, role, joined_at)
    VALUES (${clanId}, ${playerId}, 'member', ${Date.now()})
  `;
}

export async function leaveClan(playerId: string): Promise<void> {
  const [membership] = await sql`
    SELECT clan_id, role FROM clan_members WHERE player_id = ${playerId}
  ` as any[];
  if (!membership) throw new Error('You are not in a clan.');

  if (membership.role === 'owner') {
    const [next] = await sql`
      SELECT player_id FROM clan_members
      WHERE clan_id = ${membership.clan_id} AND player_id != ${playerId}
      ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END ASC, joined_at ASC
      LIMIT 1
    ` as any[];
    if (next) {
      await sql`
        UPDATE clan_members SET role = 'owner'
        WHERE clan_id = ${membership.clan_id} AND player_id = ${next.player_id}
      `;
      await sql`UPDATE clans SET owner_id = ${next.player_id} WHERE id = ${membership.clan_id}`;
    } else {
      await sql`DELETE FROM clans WHERE id = ${membership.clan_id}`;
      await sql`DELETE FROM clan_members WHERE clan_id = ${membership.clan_id}`;
      return;
    }
  }
  await sql`DELETE FROM clan_members WHERE clan_id = ${membership.clan_id} AND player_id = ${playerId}`;
}

export async function setClanMemberRole(
  actorId: string,
  targetId: string,
  newRole: ClanRole,
): Promise<void> {
  const [actorMem] = await sql`
    SELECT clan_id, role FROM clan_members WHERE player_id = ${actorId}
  ` as any[];
  if (!actorMem) throw new Error('You are not in a clan.');

  const [targetMem] = await sql`
    SELECT clan_id, role FROM clan_members WHERE player_id = ${targetId} AND clan_id = ${actorMem.clan_id}
  ` as any[];
  if (!targetMem) throw new Error('Target is not in your clan.');

  const actorRole: ClanRole = actorMem.role;

  // Only owner can assign admin. Owner/admin can assign moderator.
  if (newRole === 'owner') throw new Error('Cannot assign owner role directly. Use transfer ownership.');
  if (newRole === 'admin' && actorRole !== 'owner') throw new Error('Only the clan owner can assign admin roles.');
  if (newRole === 'moderator' && actorRole !== 'owner' && actorRole !== 'admin') {
    throw new Error('Only owner or admin can assign moderator roles.');
  }

  // Cannot demote someone higher than you
  const rolePriority: Record<ClanRole, number> = { owner: 3, admin: 2, moderator: 1, member: 0 };
  if (rolePriority[targetMem.role as ClanRole] >= rolePriority[actorRole]) {
    throw new Error('Cannot modify the role of someone with equal or higher rank.');
  }

  const now = Date.now();
  await sql`
    UPDATE clan_members SET role = ${newRole}, role_assigned_at = ${now}, role_assigned_by = ${actorId}
    WHERE clan_id = ${actorMem.clan_id} AND player_id = ${targetId}
  `;
}

export interface ClanModLog {
  id: string;
  clanId: string;
  modId: string;
  modName: string;
  targetId: string;
  targetName: string;
  action: string;
  reason: string;
  roomId: string | null;
  createdAt: number;
}

export async function addClanModLog(
  clanId: string,
  modId: string,
  modName: string,
  targetId: string,
  targetName: string,
  action: string,
  reason: string,
  roomId: string | null,
): Promise<void> {
  await sql`
    INSERT INTO clan_mod_logs (id, clan_id, mod_id, mod_name, target_id, target_name, action, reason, room_id, created_at)
    VALUES (${generateId()}, ${clanId}, ${modId}, ${modName}, ${targetId}, ${targetName}, ${action}, ${reason}, ${roomId}, ${Date.now()})
  `;
}

export async function getClanModLogs(clanId: string, limit = 50): Promise<ClanModLog[]> {
  const rows = await sql`
    SELECT * FROM clan_mod_logs
    WHERE clan_id = ${clanId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  ` as any[];
  return rows.map((r: any) => ({
    id: r.id,
    clanId: r.clan_id,
    modId: r.mod_id,
    modName: r.mod_name,
    targetId: r.target_id,
    targetName: r.target_name,
    action: r.action,
    reason: r.reason,
    roomId: r.room_id ?? null,
    createdAt: Number(r.created_at),
  }));
}

export async function updateClanStats(clanId: string, won: boolean): Promise<void> {
  if (won) {
    await sql`UPDATE clans SET wins = wins + 1 WHERE id = ${clanId}`;
  } else {
    await sql`UPDATE clans SET losses = losses + 1 WHERE id = ${clanId}`;
  }
}
