import { db } from '../db.js';
import { generateId } from '../utils/helpers.js';

export interface Clan {
  id: string;
  name: string;
  tag: string;
  ownerId: string;
  description: string;
  wins: number;
  losses: number;
  createdAt: number;
  memberCount: number;
}

export interface ClanMember {
  playerId: string;
  username: string;
  avatar: string;
  role: 'owner' | 'officer' | 'member';
  joinedAt: number;
}

function rowToClan(row: any): Clan {
  const mc = db.prepare('SELECT COUNT(*) as c FROM clan_members WHERE clan_id = ?').get(row.id) as any;
  return {
    id: row.id, name: row.name, tag: row.tag,
    ownerId: row.owner_id, description: row.description,
    wins: row.wins, losses: row.losses, createdAt: row.created_at,
    memberCount: mc?.c ?? 0,
  };
}

export function createClan(ownerId: string, name: string, tag: string, description: string): Clan {
  const existing = db.prepare('SELECT id FROM clans WHERE name = ? OR tag = ?').get(name.trim(), tag.trim().toUpperCase());
  if (existing) throw new Error('A clan with that name or tag already exists.');

  const existing2 = db.prepare('SELECT clan_id FROM clan_members WHERE player_id = ?').get(ownerId);
  if (existing2) throw new Error('You are already in a clan. Leave first.');

  const id  = generateId();
  const now = Date.now();
  const cleanTag = tag.trim().toUpperCase().slice(0, 5);

  db.prepare(`
    INSERT INTO clans (id, name, tag, owner_id, description, wins, losses, created_at)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?)
  `).run(id, name.trim().slice(0, 32), cleanTag, ownerId, description.slice(0, 200), now);

  db.prepare(`
    INSERT INTO clan_members (clan_id, player_id, role, joined_at)
    VALUES (?, ?, 'owner', ?)
  `).run(id, ownerId, now);

  return rowToClan(db.prepare('SELECT * FROM clans WHERE id = ?').get(id) as any);
}

export function getClan(id: string): Clan | null {
  const row = db.prepare('SELECT * FROM clans WHERE id = ?').get(id) as any;
  return row ? rowToClan(row) : null;
}

export function getClanByPlayer(playerId: string): Clan | null {
  const membership = db.prepare('SELECT clan_id FROM clan_members WHERE player_id = ?').get(playerId) as any;
  if (!membership) return null;
  return getClan(membership.clan_id);
}

export function getAllClans(): Clan[] {
  const rows = db.prepare('SELECT * FROM clans ORDER BY wins DESC LIMIT 100').all() as any[];
  return rows.map(rowToClan);
}

export function getClanMembers(clanId: string): ClanMember[] {
  const rows = db.prepare(`
    SELECT cm.player_id, cm.role, cm.joined_at, p.username, p.avatar
    FROM clan_members cm
    JOIN players p ON p.id = cm.player_id
    WHERE cm.clan_id = ?
    ORDER BY cm.role = 'owner' DESC, cm.role = 'officer' DESC, cm.joined_at ASC
  `).all(clanId) as any[];
  return rows.map(r => ({
    playerId: r.player_id, username: r.username, avatar: r.avatar,
    role: r.role, joinedAt: r.joined_at,
  }));
}

export function joinClan(playerId: string, clanId: string): void {
  const existing = db.prepare('SELECT clan_id FROM clan_members WHERE player_id = ?').get(playerId);
  if (existing) throw new Error('You are already in a clan. Leave first.');
  const clan = getClan(clanId);
  if (!clan) throw new Error('Clan not found.');
  db.prepare(`INSERT INTO clan_members (clan_id, player_id, role, joined_at) VALUES (?, ?, 'member', ?)`).run(clanId, playerId, Date.now());
}

export function leaveClan(playerId: string): void {
  const membership = db.prepare('SELECT clan_id, role FROM clan_members WHERE player_id = ?').get(playerId) as any;
  if (!membership) throw new Error('You are not in a clan.');
  if (membership.role === 'owner') {
    // Transfer to oldest officer or member, or delete if solo
    const next = db.prepare(`
      SELECT player_id FROM clan_members
      WHERE clan_id = ? AND player_id != ?
      ORDER BY role = 'officer' DESC, joined_at ASC LIMIT 1
    `).get(membership.clan_id, playerId) as any;
    if (next) {
      db.prepare(`UPDATE clan_members SET role = 'owner' WHERE clan_id = ? AND player_id = ?`).run(membership.clan_id, next.player_id);
      db.prepare(`UPDATE clans SET owner_id = ? WHERE id = ?`).run(next.player_id, membership.clan_id);
    } else {
      db.prepare('DELETE FROM clans WHERE id = ?').run(membership.clan_id);
      db.prepare('DELETE FROM clan_members WHERE clan_id = ?').run(membership.clan_id);
      return;
    }
  }
  db.prepare('DELETE FROM clan_members WHERE clan_id = ? AND player_id = ?').run(membership.clan_id, playerId);
}

export function updateClanStats(clanId: string, won: boolean): void {
  db.prepare(`UPDATE clans SET ${won ? 'wins' : 'losses'} = ${won ? 'wins' : 'losses'} + 1 WHERE id = ?`).run(clanId);
}
