/**
 * ნუარი — run recording and leaderboard.
 *
 * The story itself runs entirely on the client: it is a single-player branching
 * text adventure with no hidden information to protect and no opponent to cheat,
 * so round-tripping every scene would add latency for nothing.
 *
 * What the server does own is the leaderboard. A submitted score is therefore
 * RECOMPUTED here from the run's own facts (ending, chapter, stats, scenes seen)
 * using the same formula as the client — the client's `total` is ignored. That
 * keeps a modified client from posting an arbitrary number while leaving the
 * gameplay offline-capable.
 */
import { sql } from '../db.js';

export type EndingTone = 'triumph' | 'survival' | 'ruin' | 'death';

/** The subset of a run the server needs to trust nothing else. */
export interface RunSubmission {
  endingId: string;
  tone: EndingTone;
  chapter: number;
  scenesSeen: number;
  stats: { nerve: number; cunning: number; trust: number; heat: number; money: number };
}

const TONE_POINTS: Record<EndingTone, number> = { triumph: 500, survival: 300, ruin: 120, death: 40 };
const VALID_TONES = new Set<string>(['triumph', 'survival', 'ruin', 'death']);

const clamp = (n: any, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.trunc(Number(n) || 0)));

/**
 * Score a run. Mirrors the client's scoreRun, but every input is clamped to the
 * range the engine can actually produce first — stats cap at 10, the story has
 * 4 chapters and 36 scenes — so an inflated payload scores as a normal one.
 */
export function scoreSubmission(sub: RunSubmission): number {
  const tone = VALID_TONES.has(sub.tone) ? sub.tone : 'death';
  const s = sub.stats ?? ({} as RunSubmission['stats']);
  const total =
    TONE_POINTS[tone]
    + clamp(sub.chapter, 0, 4) * 60
    + clamp(s.nerve, 0, 10) * 12
    + clamp(s.cunning, 0, 10) * 12
    + clamp(s.trust, 0, 10) * 18
    + clamp(s.money, 0, 10) * 10
    - clamp(s.heat, 0, 10) * 20
    + clamp(sub.scenesSeen, 0, 36) * 4;
  return Math.max(0, total);
}

export interface SubmitResult {
  score: number;
  best: number;
  isBest: boolean;
  rank: number | null;
}

/**
 * Record a finished run. Every run is kept (the profile shows a history), but
 * the leaderboard reads only each player's best, so grinding weak runs cannot
 * crowd the board.
 */
export async function submitRun(
  userId: string,
  name: string,
  sub: RunSubmission,
): Promise<SubmitResult> {
  const score = scoreSubmission(sub);
  const now = Date.now();

  await sql`
    INSERT INTO noir_runs (user_id, name, ending_id, tone, chapter, scenes_seen, score, created_at)
    VALUES (
      ${userId}, ${String(name ?? '').slice(0, 18)}, ${String(sub.endingId).slice(0, 32)},
      ${VALID_TONES.has(sub.tone) ? sub.tone : 'death'}, ${clamp(sub.chapter, 0, 4)},
      ${clamp(sub.scenesSeen, 0, 36)}, ${score}, ${now}
    )
  `;

  const [bestRow] = await sql`
    SELECT MAX(score) AS best FROM noir_runs WHERE user_id = ${userId}
  ` as any[];
  const best = Number(bestRow?.best ?? score);

  // Rank among each player's best, not among all runs.
  const [rankRow] = await sql`
    SELECT COUNT(*) + 1 AS rank FROM (
      SELECT user_id, MAX(score) AS s FROM noir_runs GROUP BY user_id
    ) t WHERE t.s > ${best}
  ` as any[];

  return { score, best, isBest: score >= best, rank: Number(rankRow?.rank ?? 0) || null };
}

export interface BoardRow {
  rank: number;
  userId: string;
  username: string;
  avatar: string;
  avatarUrl: string | null;
  country: string | null;
  score: number;
  endingId: string;
  tone: EndingTone;
  chapter: number;
}

export async function leaderboard(limit = 50): Promise<BoardRow[]> {
  const lim = Math.max(1, Math.min(100, limit));
  // DISTINCT ON keeps the row that produced each player's best score, so the
  // board can show WHICH ending earned it rather than just the number.
  const rows = await sql`
    SELECT DISTINCT ON (r.user_id)
           r.user_id, r.score, r.ending_id, r.tone, r.chapter,
           p.username, p.avatar, p.avatar_url, p.country
    FROM noir_runs r
    JOIN players p ON p.id = r.user_id
    ORDER BY r.user_id, r.score DESC, r.created_at ASC
  ` as any[];

  return rows
    .sort((a, b) => Number(b.score) - Number(a.score))
    .slice(0, lim)
    .map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      username: r.username ?? '—',
      avatar: r.avatar ?? '',
      avatarUrl: r.avatar_url ?? null,
      country: r.country ?? null,
      score: Number(r.score),
      endingId: r.ending_id,
      tone: r.tone as EndingTone,
      chapter: Number(r.chapter),
    }));
}

/** This player's own best and how many runs they've finished. */
export async function myStats(userId: string): Promise<{ best: number; runs: number; endings: string[] }> {
  const [row] = await sql`
    SELECT COALESCE(MAX(score), 0) AS best, COUNT(*) AS runs
    FROM noir_runs WHERE user_id = ${userId}
  ` as any[];
  const seen = await sql`
    SELECT DISTINCT ending_id FROM noir_runs WHERE user_id = ${userId}
  ` as any[];
  return {
    best: Number(row?.best ?? 0),
    runs: Number(row?.runs ?? 0),
    endings: seen.map((r: any) => r.ending_id),
  };
}
