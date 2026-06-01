import { db } from '../db.js';
import type { DailyChallenge } from '../types/index.js';

// ── Challenge definitions ─────────────────────────────────────────────
interface ChallengeCheck {
  id: string;
  description: string;
  xpReward: number;
  targetCount: number;
  check: (won: boolean, role: string | null, dayReached: number, team: string | null) => boolean;
}

const CHALLENGES: ChallengeCheck[] = [
  {
    id: 'win_any',
    description: 'Win any game today',
    xpReward: 100,
    targetCount: 1,
    check: (won) => won,
  },
  {
    id: 'win_mafia',
    description: 'Win as Mafia or Don',
    xpReward: 150,
    targetCount: 1,
    check: (won, role) => won && (role === 'mafia' || role === 'don'),
  },
  {
    id: 'survive_5',
    description: 'Survive to Day 5 or later',
    xpReward: 120,
    targetCount: 1,
    check: (_won, _role, dayReached) => dayReached >= 5,
  },
  {
    id: 'win_town',
    description: 'Win as any Town role',
    xpReward: 100,
    targetCount: 1,
    check: (won, _role, _day, team) => won && team === 'town',
  },
  {
    id: 'win_neutral',
    description: 'Win as a Neutral role',
    xpReward: 150,
    targetCount: 1,
    check: (won, _role, _day, team) => won && team === 'neutral',
  },
  {
    id: 'play_3',
    description: 'Play 3 games today',
    xpReward: 100,
    targetCount: 3,
    check: () => true,
  },
  {
    id: 'win_cult',
    description: 'Win as Cult Leader',
    xpReward: 200,
    targetCount: 1,
    check: (won, role) => won && role === 'cult_leader',
  },
];

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getTodayChallenge(): Omit<ChallengeCheck, 'check'> {
  const day = new Date().getDay();
  const ch = CHALLENGES[day % CHALLENGES.length];
  return { id: ch.id, description: ch.description, xpReward: ch.xpReward, targetCount: ch.targetCount };
}

/**
 * Checks if the player satisfies today's challenge and records a completion if so.
 * Returns true if a new completion was recorded (challenge bonus should be awarded).
 */
export function checkAndAwardChallenge(
  profileId: string,
  won: boolean,
  role: string | null,
  dayReached: number,
  team: string | null,
): boolean {
  const ch = getTodayChallenge();
  const dateKey = todayKey();

  const existing = (db.prepare(
    'SELECT COUNT(*) as c FROM daily_completions WHERE player_id=? AND challenge_id=? AND date_key=?',
  ).get(profileId, ch.id, dateKey) as { c: number }).c;

  if (existing >= ch.targetCount) return false;

  const full = CHALLENGES.find(c => c.id === ch.id)!;
  if (!full.check(won, role, dayReached, team)) return false;

  db.prepare(
    'INSERT OR IGNORE INTO daily_completions (player_id, challenge_id, date_key, completed_at) VALUES (?,?,?,?)',
  ).run(profileId, ch.id, dateKey, Date.now());

  const newCount = (db.prepare(
    'SELECT COUNT(*) as c FROM daily_completions WHERE player_id=? AND challenge_id=? AND date_key=?',
  ).get(profileId, ch.id, dateKey) as { c: number }).c;

  return newCount >= ch.targetCount;
}

export function getDailyChallengeForPlayer(profileId: string): DailyChallenge {
  const ch = getTodayChallenge();
  const dateKey = todayKey();
  const progress = (db.prepare(
    'SELECT COUNT(*) as c FROM daily_completions WHERE player_id=? AND challenge_id=? AND date_key=?',
  ).get(profileId, ch.id, dateKey) as { c: number }).c;

  return {
    id: ch.id,
    description: ch.description,
    xpReward: ch.xpReward,
    completedToday: progress >= ch.targetCount,
    progressCount: progress,
    targetCount: ch.targetCount,
  };
}
