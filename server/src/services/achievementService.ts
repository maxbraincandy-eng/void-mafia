import { db } from '../db.js';
import { Room, Team } from '../types/index.js';

export interface AchievementDef {
  key: string;
  name: string;
  description: string;
  icon: string;
  rarity: string;
}

export interface PlayerAchievement {
  key: string;
  name: string;
  description: string;
  icon: string;
  rarity: string;
  earnedAt: number;
}

export function getPlayerAchievements(playerId: string): PlayerAchievement[] {
  const rows = db.prepare(`
    SELECT a.key, a.name, a.description, a.icon, a.rarity, pa.earned_at
    FROM player_achievements pa
    JOIN achievements a ON a.key = pa.achievement_key
    WHERE pa.player_id = ?
    ORDER BY pa.earned_at DESC
  `).all(playerId) as any[];
  return rows.map(r => ({
    key: r.key, name: r.name, description: r.description,
    icon: r.icon, rarity: r.rarity, earnedAt: r.earned_at,
  }));
}

function award(playerId: string, key: string): boolean {
  const existing = db.prepare(
    'SELECT 1 FROM player_achievements WHERE player_id = ? AND achievement_key = ?'
  ).get(playerId, key);
  if (existing) return false;
  db.prepare(
    'INSERT OR IGNORE INTO player_achievements (player_id, achievement_key, earned_at) VALUES (?, ?, ?)'
  ).run(playerId, key, Date.now());
  return true;
}

/** Check and award achievements after a game ends. Returns list of newly earned keys. */
export function checkAchievements(room: Room, playerId: string): string[] {
  const player = room.players.get(playerId);
  if (!player || !player.profileId) return [];
  const profileId = player.profileId;

  const newAchievements: string[] = [];
  const win = player.team === room.winner;
  const role = player.role;

  // First win
  if (win && award(profileId, 'first_blood')) newAchievements.push('first_blood');

  // Role-specific wins
  if (win && role === 'don' && award(profileId, 'godfather')) newAchievements.push('godfather');
  if (win && role === 'jester' && award(profileId, 'ghost')) newAchievements.push('ghost');
  if (win && role === 'maniac' && award(profileId, 'serial_killer')) newAchievements.push('serial_killer');
  if (win && role === 'arsonist' && award(profileId, 'arsonist_win')) newAchievements.push('arsonist_win');

  // Bodyguard — died protecting
  if (role === 'bodyguard' && !player.isAlive && award(profileId, 'loyal_guard')) newAchievements.push('loyal_guard');

  // Survival
  if (player.isAlive && win && award(profileId, 'survivor')) newAchievements.push('survivor');

  // Games played milestones — check stats from DB
  const row = db.prepare('SELECT games_played FROM players WHERE id = ?').get(profileId) as any;
  const gamesPlayed = (row?.games_played ?? 0) + 1; // +1 because addGameResult runs after this
  if (gamesPlayed >= 10 && award(profileId, 'night_owl')) newAchievements.push('night_owl');
  if (gamesPlayed >= 50) {
    const winsRow = db.prepare('SELECT wins FROM players WHERE id = ?').get(profileId) as any;
    const totalWins = (winsRow?.wins ?? 0) + (win ? 1 : 0);
    if (totalWins >= 50 && award(profileId, 'legend')) newAchievements.push('legend');
  }

  return newAchievements;
}
