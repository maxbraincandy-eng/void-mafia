import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';
async function rowToClan(row) {
    const [mc] = await sql `SELECT COUNT(*) as c FROM clan_members WHERE clan_id = ${row.id}`;
    return {
        id: row.id, name: row.name, tag: row.tag,
        ownerId: row.owner_id, description: row.description,
        wins: Number(row.wins), losses: Number(row.losses), createdAt: Number(row.created_at),
        memberCount: Number(mc?.c ?? 0),
    };
}
export async function createClan(ownerId, name, tag, description) {
    const [existing] = await sql `
    SELECT id FROM clans WHERE name = ${name.trim()} OR tag = ${tag.trim().toUpperCase()}
  `;
    if (existing)
        throw new Error('A clan with that name or tag already exists.');
    const [existing2] = await sql `SELECT clan_id FROM clan_members WHERE player_id = ${ownerId}`;
    if (existing2)
        throw new Error('You are already in a clan. Leave first.');
    const id = generateId();
    const now = Date.now();
    const cleanTag = tag.trim().toUpperCase().slice(0, 5);
    const cleanName = name.trim().slice(0, 32);
    const cleanDesc = description.slice(0, 200);
    await sql `
    INSERT INTO clans (id, name, tag, owner_id, description, wins, losses, created_at)
    VALUES (${id}, ${cleanName}, ${cleanTag}, ${ownerId}, ${cleanDesc}, 0, 0, ${now})
  `;
    await sql `
    INSERT INTO clan_members (clan_id, player_id, role, joined_at)
    VALUES (${id}, ${ownerId}, 'owner', ${now})
  `;
    const [row] = await sql `SELECT * FROM clans WHERE id = ${id}`;
    return rowToClan(row);
}
export async function getClan(id) {
    const [row] = await sql `SELECT * FROM clans WHERE id = ${id}`;
    return row ? rowToClan(row) : null;
}
export async function getClanByPlayer(playerId) {
    const [membership] = await sql `SELECT clan_id FROM clan_members WHERE player_id = ${playerId}`;
    if (!membership)
        return null;
    return getClan(membership.clan_id);
}
export async function getClanMembershipByPlayer(playerId) {
    const rows = await sql `
    SELECT c.id, c.name, c.tag, c.wins, c.losses,
           cm.role as member_role, cm.joined_at as member_joined_at,
           (SELECT COUNT(*) FROM clan_members WHERE clan_id = c.id) as member_count
    FROM clan_members cm
    JOIN clans c ON c.id = cm.clan_id
    WHERE cm.player_id = ${playerId}
    LIMIT 1
  `;
    if (!rows.length)
        return null;
    const r = rows[0];
    return {
        id: r.id, name: r.name, tag: r.tag,
        memberRole: r.member_role,
        joinedAt: Number(r.member_joined_at),
        wins: Number(r.wins), losses: Number(r.losses),
        memberCount: Number(r.member_count),
    };
}
export async function getAllClans() {
    const rows = await sql `SELECT * FROM clans ORDER BY wins DESC LIMIT 100`;
    return Promise.all(rows.map(rowToClan));
}
export async function getClanMembers(clanId) {
    const rows = await sql `
    SELECT cm.player_id, cm.role, cm.joined_at, p.username, p.avatar, p.avatar_url, p.public_id
    FROM clan_members cm
    JOIN players p ON p.id = cm.player_id
    WHERE cm.clan_id = ${clanId}
    ORDER BY
      CASE cm.role WHEN 'owner' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END ASC,
      cm.joined_at ASC
  `;
    return rows.map((r) => ({
        playerId: r.player_id, username: r.username, avatar: r.avatar,
        avatarUrl: r.avatar_url ?? null,
        publicId: r.public_id != null ? Number(r.public_id) : null,
        role: r.role, joinedAt: Number(r.joined_at),
    }));
}
export async function joinClan(playerId, clanId) {
    const [existing] = await sql `SELECT clan_id FROM clan_members WHERE player_id = ${playerId}`;
    if (existing)
        throw new Error('You are already in a clan. Leave first.');
    const clan = await getClan(clanId);
    if (!clan)
        throw new Error('Clan not found.');
    await sql `
    INSERT INTO clan_members (clan_id, player_id, role, joined_at)
    VALUES (${clanId}, ${playerId}, 'member', ${Date.now()})
  `;
}
export async function leaveClan(playerId) {
    const [membership] = await sql `
    SELECT clan_id, role FROM clan_members WHERE player_id = ${playerId}
  `;
    if (!membership)
        throw new Error('You are not in a clan.');
    if (membership.role === 'owner') {
        const [next] = await sql `
      SELECT player_id FROM clan_members
      WHERE clan_id = ${membership.clan_id} AND player_id != ${playerId}
      ORDER BY CASE role WHEN 'officer' THEN 0 ELSE 1 END ASC, joined_at ASC
      LIMIT 1
    `;
        if (next) {
            await sql `
        UPDATE clan_members SET role = 'owner'
        WHERE clan_id = ${membership.clan_id} AND player_id = ${next.player_id}
      `;
            await sql `UPDATE clans SET owner_id = ${next.player_id} WHERE id = ${membership.clan_id}`;
        }
        else {
            await sql `DELETE FROM clans WHERE id = ${membership.clan_id}`;
            await sql `DELETE FROM clan_members WHERE clan_id = ${membership.clan_id}`;
            return;
        }
    }
    await sql `DELETE FROM clan_members WHERE clan_id = ${membership.clan_id} AND player_id = ${playerId}`;
}
export async function updateClanStats(clanId, won) {
    if (won) {
        await sql `UPDATE clans SET wins = wins + 1 WHERE id = ${clanId}`;
    }
    else {
        await sql `UPDATE clans SET losses = losses + 1 WHERE id = ${clanId}`;
    }
}
//# sourceMappingURL=clanService.js.map