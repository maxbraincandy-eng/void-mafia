/**
 * VOID IQ — persistence + leaderboard + profile queries.
 *
 * Rules:
 *  - 7-day cooldown between attempts (moderators exempt for testing/ops).
 *  - Every attempt is stored (full private history).
 *  - Only VERIFIED attempts are leaderboard-eligible.
 *  - `is_highest` marks each user's best verified attempt; the All-Time /
 *    Global board reads those. Weekly/Monthly read the best verified attempt
 *    inside the time window. A suspicious result never overwrites a verified one.
 */
import { randomBytes } from 'crypto';
import { sql } from '../db.js';
import { getFriendIds } from './friendService.js';
import { getClanMembers, getClanMembershipByPlayer } from './clanService.js';
import type { IQScoreResult } from './iqScoring.js';

export const IQ_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export async function isModerator(userId: string): Promise<boolean> {
  const [r] = await sql`SELECT is_moderator, moderator_level FROM players WHERE id = ${userId}` as any[];
  if (!r) return false;
  const lvl = r.moderator_level;
  return Number(r.is_moderator) === 1 || (lvl != null && String(lvl).trim() !== '');
}

export type IQScope = 'all' | 'global' | 'weekly' | 'monthly' | 'friends' | 'clan';

export interface IQLeaderRow {
  rank: number;
  userId: string;
  username: string;
  avatar: string;
  avatarUrl: string | null;
  iq: number;
  percentile: number;
  createdAt: number;
  verified: boolean;
}

export interface IQHistoryEntry {
  id: string; iq: number; percentile: number; band: string;
  correct: number; total: number; durationMs: number;
  verified: boolean; isHighest: boolean; createdAt: number;
  domainScores: Record<string, number>;
}

export interface IQMyStatus {
  hasResult: boolean;
  bestIq: number | null;
  bestPercentile: number | null;
  latestIq: number | null;
  latestVerified: boolean;
  latestDate: number | null;
  rank: number | null;
  attempts: number;
  cooldownUntil: number | null; // epoch ms when a retake becomes available
  history: IQHistoryEntry[];
}

/** How long until this user may retake (0 = available now). Moderators bypass. */
export async function cooldownRemaining(userId: string, isModerator: boolean): Promise<number> {
  if (isModerator) return 0;
  const [row] = await sql`
    SELECT created_at FROM iq_attempts WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 1
  ` as any[];
  if (!row) return 0;
  const elapsed = Date.now() - Number(row.created_at);
  return Math.max(0, IQ_COOLDOWN_MS - elapsed);
}

/** Persist a scored attempt and maintain the per-user `is_highest` flag. */
export async function recordAttempt(userId: string, r: IQScoreResult): Promise<{ id: string; isHighest: boolean; rank: number | null }> {
  const id = 'iq_' + randomBytes(9).toString('hex');
  const now = Date.now();

  // Current best verified IQ for this user (pre-insert).
  const [best] = await sql`
    SELECT iq FROM iq_attempts WHERE user_id = ${userId} AND verified = true ORDER BY iq DESC LIMIT 1
  ` as any[];
  const prevBest = best ? Number(best.iq) : -1;
  const isHighest = r.verified && r.iq > prevBest;

  if (isHighest) {
    // Demote any previous highest — only one row per user carries the flag.
    await sql`UPDATE iq_attempts SET is_highest = false WHERE user_id = ${userId} AND is_highest = true`;
  }

  await sql`
    INSERT INTO iq_attempts (
      id, user_id, iq, percentile, band, raw_score, max_score, correct, total,
      domain_scores, duration_ms, verified, flags, is_highest, created_at
    ) VALUES (
      ${id}, ${userId}, ${r.iq}, ${r.percentile}, ${r.band}, ${r.rawScore}, ${r.maxScore},
      ${r.correct}, ${r.total}, ${JSON.stringify(r.domainScores)}, ${r.durationMs},
      ${r.verified}, ${JSON.stringify(r.flags)}, ${isHighest}, ${now}
    )
  `;

  const rank = r.verified ? await rankForIq(r.iq) : null;
  return { id, isHighest, rank };
}

/** 1-based rank on the All-Time board for a given IQ (ties broken by "at least as good"). */
async function rankForIq(iq: number): Promise<number> {
  const [row] = await sql`
    SELECT COUNT(*) AS c FROM iq_attempts WHERE verified = true AND is_highest = true AND iq > ${iq}
  ` as any[];
  return Number(row?.c ?? 0) + 1;
}

async function userRank(userId: string): Promise<number | null> {
  const [me] = await sql`
    SELECT iq FROM iq_attempts WHERE user_id = ${userId} AND verified = true AND is_highest = true LIMIT 1
  ` as any[];
  if (!me) return null;
  return rankForIq(Number(me.iq));
}

function mapRows(rows: any[]): IQLeaderRow[] {
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    username: r.username ?? '?',
    avatar: r.avatar ?? '',
    avatarUrl: r.avatar_url ?? null,
    iq: Number(r.iq),
    percentile: Number(r.percentile),
    createdAt: Number(r.created_at),
    verified: !!r.verified,
  }));
}

/** Leaderboard for a scope. `viewerId` is required for friends/clan filters. */
export async function getLeaderboard(scope: IQScope, viewerId: string | null, limit = 100): Promise<IQLeaderRow[]> {
  const now = Date.now();

  if (scope === 'weekly' || scope === 'monthly') {
    const since = now - (scope === 'weekly' ? 7 : 30) * 24 * 60 * 60 * 1000;
    const rows = await sql`
      SELECT DISTINCT ON (a.user_id) a.user_id, a.iq, a.percentile, a.created_at, a.verified,
             p.username, p.avatar, p.avatar_url
      FROM iq_attempts a JOIN players p ON p.id = a.user_id
      WHERE a.verified = true AND a.created_at >= ${since}
      ORDER BY a.user_id, a.iq DESC
    ` as any[];
    rows.sort((x, y) => Number(y.iq) - Number(x.iq) || Number(y.created_at) - Number(x.created_at));
    return mapRows(rows.slice(0, limit));
  }

  // all / global / friends / clan → highest verified per user
  let idFilter: string[] | null = null;
  if (scope === 'friends') {
    if (!viewerId) return [];
    const friends = await getFriendIds(viewerId);
    idFilter = [...friends, viewerId];
  } else if (scope === 'clan') {
    if (!viewerId) return [];
    const membership = await getClanMembershipByPlayer(viewerId);
    if (!membership) return [];
    const members = await getClanMembers(membership.id);
    idFilter = members.map(m => m.playerId);
  }

  const rows = idFilter
    ? await sql`
        SELECT a.user_id, a.iq, a.percentile, a.created_at, a.verified, p.username, p.avatar, p.avatar_url
        FROM iq_attempts a JOIN players p ON p.id = a.user_id
        WHERE a.verified = true AND a.is_highest = true AND a.user_id = ANY(${idFilter})
        ORDER BY a.iq DESC, a.created_at ASC
        LIMIT ${limit}
      ` as any[]
    : await sql`
        SELECT a.user_id, a.iq, a.percentile, a.created_at, a.verified, p.username, p.avatar, p.avatar_url
        FROM iq_attempts a JOIN players p ON p.id = a.user_id
        WHERE a.verified = true AND a.is_highest = true
        ORDER BY a.iq DESC, a.created_at ASC
        LIMIT ${limit}
      ` as any[];
  return mapRows(rows);
}

function mapHistory(rows: any[]): IQHistoryEntry[] {
  return rows.map(r => ({
    id: r.id,
    iq: Number(r.iq),
    percentile: Number(r.percentile),
    band: r.band ?? '',
    correct: Number(r.correct),
    total: Number(r.total),
    durationMs: Number(r.duration_ms),
    verified: !!r.verified,
    isHighest: !!r.is_highest,
    createdAt: Number(r.created_at),
    domainScores: safeJson(r.domain_scores),
  }));
}
function safeJson(s: any): Record<string, number> { try { return JSON.parse(s ?? '{}'); } catch { return {}; } }

/** The caller's own full status + private history. */
export async function getMyStatus(userId: string, isModerator: boolean): Promise<IQMyStatus> {
  const rows = await sql`
    SELECT * FROM iq_attempts WHERE user_id = ${userId} ORDER BY created_at DESC
  ` as any[];
  const history = mapHistory(rows);
  if (history.length === 0) {
    return { hasResult: false, bestIq: null, bestPercentile: null, latestIq: null, latestVerified: false, latestDate: null, rank: null, attempts: 0, cooldownUntil: null, history: [] };
  }
  const verified = history.filter(h => h.verified);
  const best = verified.slice().sort((a, b) => b.iq - a.iq)[0] ?? null;
  const latest = history[0]!;
  const remaining = await cooldownRemaining(userId, isModerator);
  return {
    hasResult: verified.length > 0,
    bestIq: best?.iq ?? null,
    bestPercentile: best?.percentile ?? null,
    latestIq: latest.iq,
    latestVerified: latest.verified,
    latestDate: latest.createdAt,
    rank: best ? await userRank(userId) : null,
    attempts: history.length,
    cooldownUntil: remaining > 0 ? Date.now() + remaining : null,
    history,
  };
}

export interface IQPublicProfile {
  hasResult: boolean;
  bestIq: number | null;
  bestPercentile: number | null;
  band: string | null;
  latestDate: number | null;
  rank: number | null;
  attempts: number;
  history: { iq: number; verified: boolean; createdAt: number }[];
}

/** Public IQ snapshot for another user's profile — no answers exposed. */
export async function getPublicProfile(userId: string): Promise<IQPublicProfile> {
  const rows = await sql`
    SELECT iq, percentile, band, verified, is_highest, created_at
    FROM iq_attempts WHERE user_id = ${userId} ORDER BY created_at DESC
  ` as any[];
  if (rows.length === 0) {
    return { hasResult: false, bestIq: null, bestPercentile: null, band: null, latestDate: null, rank: null, attempts: 0, history: [] };
  }
  const best = rows.filter(r => r.verified).sort((a, b) => Number(b.iq) - Number(a.iq))[0] ?? null;
  return {
    hasResult: !!best,
    bestIq: best ? Number(best.iq) : null,
    bestPercentile: best ? Number(best.percentile) : null,
    band: best ? best.band : null,
    latestDate: Number(rows[0].created_at),
    rank: best ? await rankForIq(Number(best.iq)) : null,
    attempts: rows.length,
    history: rows.slice(0, 10).map(r => ({ iq: Number(r.iq), verified: !!r.verified, createdAt: Number(r.created_at) })),
  };
}
