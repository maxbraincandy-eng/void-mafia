/**
 * სიტყვა — a player's day, their streak, and the boards.
 *
 * THE SOLUTION NEVER LEAVES THIS PROCESS UNTIL THE DAY IS OVER FOR THAT PLAYER
 * ──────────────────────────────────────────────────────────────────────────
 * The client sends a guess and gets back five marks. It is never sent the word,
 * not in the state payload and not in the leaderboard, until the player has
 * either solved it or spent all six guesses. A daily game where the answer is
 * in the network tab is a daily game about opening the network tab.
 *
 * ONE ROW PER PLAYER PER PUZZLE, AND IT IS APPEND-ONLY
 * ───────────────────────────────────────────────────
 * Guesses are appended to the same row rather than written as separate ones, so
 * "what has this player done today" is a single read by primary key, which is
 * what the screen asks for on every open.
 */

import { sql } from '../db.js';
import {
  MAX_GUESSES, WORD_LENGTH, isValidGuess, letters, score, solutionFor,
  puzzleNumber, dateKey, nextRollover, keyboardState, type Mark,
} from './wordBank.js';

export interface WordRow { guess: string; marks: Mark[]; }

export interface WordState {
  puzzle: number;
  /** Guesses made so far, with their marks. */
  rows: WordRow[];
  /** 'playing' until the day is decided for this player. */
  status: 'playing' | 'won' | 'lost';
  /** Only ever set once the day is over for this player. */
  solution: string | null;
  /** Best known state of each letter, for the keyboard. */
  keys: Record<string, Mark>;
  /** When the next puzzle opens, ms since the epoch. */
  rollover: number;
  stats: WordStats;
}

export interface WordStats {
  played: number;
  wins: number;
  streak: number;
  maxStreak: number;
  /** How many games were won in 1..MAX_GUESSES guesses. */
  distribution: number[];
}

const EMPTY_STATS: WordStats = {
  played: 0, wins: 0, streak: 0, maxStreak: 0,
  distribution: new Array(MAX_GUESSES).fill(0),
};

/**
 * What a win does to a streak.
 *
 * Pure, and separated out, because this is the rule players care about most
 * and the one that is impossible to check by looking at the screen: it is only
 * wrong once, days later, for somebody who played every day.
 *
 * A streak counts CONSECUTIVE PUZZLES SOLVED. Solving yesterday's puzzle today
 * — which a player can do if the row is still open — does not extend a streak
 * that has already moved on, and solving the same puzzle twice cannot happen
 * because the row is closed on the first win.
 */
export function nextStreak(prev: number, lastSolved: number | null, puzzle: number): number {
  if (lastSolved === null) return 1;
  if (puzzle === lastSolved + 1) return prev + 1;
  if (puzzle === lastSolved) return prev;      // cannot normally happen; not a reset
  return 1;                                     // a day was missed
}

async function readStats(userId: string): Promise<WordStats & { lastSolved: number | null }> {
  const [r] = await sql<{
    played: number; wins: number; streak: number; max_streak: number;
    last_solved: number | null; dist: string;
  }[]>`
    SELECT played, wins, streak, max_streak, last_solved, dist
      FROM word_stats WHERE user_id = ${userId}
  `;
  if (!r) return { ...EMPTY_STATS, distribution: [...EMPTY_STATS.distribution], lastSolved: null };
  let distribution: number[];
  try {
    const parsed = JSON.parse(r.dist);
    distribution = Array.isArray(parsed) && parsed.length === MAX_GUESSES
      ? parsed.map(Number) : [...EMPTY_STATS.distribution];
  } catch { distribution = [...EMPTY_STATS.distribution]; }
  return {
    played: Number(r.played), wins: Number(r.wins),
    streak: Number(r.streak), maxStreak: Number(r.max_streak),
    distribution, lastSolved: r.last_solved === null ? null : Number(r.last_solved),
  };
}

async function readDay(userId: string, puzzle: number): Promise<{ rows: WordRow[]; done: boolean; won: boolean }> {
  const [r] = await sql<{ guesses: string; solved: boolean; finished: boolean }[]>`
    SELECT guesses, solved, finished FROM word_days
     WHERE user_id = ${userId} AND puzzle = ${puzzle}
  `;
  if (!r) return { rows: [], done: false, won: false };
  let guesses: string[] = [];
  try { const p = JSON.parse(r.guesses); if (Array.isArray(p)) guesses = p.map(String); } catch { /* corrupt row: start over */ }
  const solution = solutionFor(puzzle);
  return {
    rows: guesses.map(g => ({ guess: g, marks: score(g, solution) })),
    done: !!r.finished, won: !!r.solved,
  };
}

function stateOf(
  puzzle: number, rows: WordRow[], done: boolean, won: boolean, stats: WordStats,
): WordState {
  const status = won ? 'won' : done ? 'lost' : 'playing';
  return {
    puzzle, rows, status,
    // The one place the word is allowed out, and only once the day is decided.
    solution: status === 'playing' ? null : solutionFor(puzzle),
    keys: keyboardState(rows),
    rollover: nextRollover(),
    stats,
  };
}

/** Where this player stands on today's puzzle. */
export async function getState(userId: string, now: number = Date.now()): Promise<WordState> {
  const puzzle = puzzleNumber(now);
  const [day, stats] = await Promise.all([readDay(userId, puzzle), readStats(userId)]);
  return stateOf(puzzle, day.rows, day.done, day.won, stats);
}

export interface GuessOutcome {
  state: WordState;
  /** Set when the guess was not a word: the state is unchanged. */
  rejected?: 'length' | 'unknown' | 'finished';
}

/**
 * Take a guess.
 *
 * Rejections do not consume an attempt and do not touch the row — typing a
 * non-word must cost nothing, or the game becomes about knowing the word list.
 */
export async function submitGuess(
  userId: string, raw: string, now: number = Date.now(),
): Promise<GuessOutcome> {
  const puzzle = puzzleNumber(now);
  const guess = String(raw ?? '').normalize('NFC').trim();
  const day = await readDay(userId, puzzle);
  const stats = await readStats(userId);

  if (day.done || day.rows.length >= MAX_GUESSES) {
    return { state: stateOf(puzzle, day.rows, true, day.won, stats), rejected: 'finished' };
  }
  if (letters(guess).length !== WORD_LENGTH) {
    return { state: stateOf(puzzle, day.rows, false, false, stats), rejected: 'length' };
  }
  if (!isValidGuess(guess)) {
    return { state: stateOf(puzzle, day.rows, false, false, stats), rejected: 'unknown' };
  }

  const solution = solutionFor(puzzle);
  const rows = [...day.rows, { guess, marks: score(guess, solution) }];
  const won = guess === solution;
  const done = won || rows.length >= MAX_GUESSES;

  await sql`
    INSERT INTO word_days (user_id, puzzle, date_key, guesses, solved, finished, started_at, finished_at)
    VALUES (${userId}, ${puzzle}, ${dateKey(now)}, ${JSON.stringify(rows.map(r => r.guess))},
            ${won}, ${done}, ${now}, ${done ? now : null})
    ON CONFLICT (user_id, puzzle) DO UPDATE
      SET guesses = EXCLUDED.guesses,
          solved = EXCLUDED.solved,
          finished = EXCLUDED.finished,
          finished_at = EXCLUDED.finished_at
  `;

  let next: WordStats & { lastSolved: number | null } = stats;
  if (done) {
    const streak = won ? nextStreak(stats.streak, stats.lastSolved, puzzle) : 0;
    const distribution = [...stats.distribution];
    if (won) distribution[rows.length - 1] = (distribution[rows.length - 1] ?? 0) + 1;
    next = {
      played: stats.played + 1,
      wins: stats.wins + (won ? 1 : 0),
      streak,
      maxStreak: Math.max(stats.maxStreak, streak),
      distribution,
      lastSolved: won ? puzzle : stats.lastSolved,
    };
    await sql`
      INSERT INTO word_stats (user_id, played, wins, streak, max_streak, last_solved, dist)
      VALUES (${userId}, ${next.played}, ${next.wins}, ${next.streak}, ${next.maxStreak},
              ${next.lastSolved}, ${JSON.stringify(next.distribution)})
      ON CONFLICT (user_id) DO UPDATE
        SET played = EXCLUDED.played, wins = EXCLUDED.wins,
            streak = EXCLUDED.streak, max_streak = EXCLUDED.max_streak,
            last_solved = EXCLUDED.last_solved, dist = EXCLUDED.dist
    `;
  }
  return { state: stateOf(puzzle, rows, done, won, next) };
}

export interface WordLeaderRow {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  /** How many guesses it took today. */
  guesses: number;
  streak: number;
}

/**
 * Today's board.
 *
 * Only players who have FINISHED today appear, and only their guess count —
 * never their guesses, because a player's first guess is information about the
 * word and the board is visible to people still playing.
 */
export async function getLeaderboard(now: number = Date.now(), limit = 50): Promise<WordLeaderRow[]> {
  const puzzle = puzzleNumber(now);
  const rows = await sql<{
    user_id: string; username: string | null; avatar_url: string | null;
    guesses: string; streak: number | null; finished_at: string | null;
  }[]>`
    SELECT d.user_id, p.username, p.avatar_url, d.guesses, s.streak, d.finished_at
      FROM word_days d
      LEFT JOIN players p ON p.id = d.user_id
      LEFT JOIN word_stats s ON s.user_id = d.user_id
     WHERE d.puzzle = ${puzzle} AND d.solved = true
     ORDER BY d.finished_at ASC
     LIMIT ${Math.min(400, Math.max(1, limit * 4))}
  `;
  /*
   * Ordered here rather than in SQL.
   *
   * The guess count lives inside a TEXT column holding JSON, and sorting on it
   * in Postgres means a cast on every row of the day. The day's finishers are
   * a few hundred at most, so they come back in finish order — which is the
   * correct tiebreak — and are ranked here.
   */
  const scored = rows.map(r => {
    let n = MAX_GUESSES;
    try { const p = JSON.parse(r.guesses); if (Array.isArray(p)) n = p.length; } catch { /* keep the cap */ }
    return {
      userId: r.user_id,
      username: r.username ?? 'ანონიმი',
      avatarUrl: r.avatar_url,
      guesses: n,
      streak: Number(r.streak ?? 0),
    };
  });
  scored.sort((a, b) => a.guesses - b.guesses);
  return scored.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
}

/** The all-time streak board, which is the one people actually chase. */
export async function getStreakBoard(limit = 50): Promise<WordLeaderRow[]> {
  const rows = await sql<{
    user_id: string; username: string | null; avatar_url: string | null;
    streak: number; max_streak: number;
  }[]>`
    SELECT s.user_id, p.username, p.avatar_url, s.streak, s.max_streak
      FROM word_stats s
      LEFT JOIN players p ON p.id = s.user_id
     WHERE s.max_streak > 0
     ORDER BY s.max_streak DESC, s.streak DESC, s.wins DESC
     LIMIT ${limit}
  `;
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    username: r.username ?? 'ანონიმი',
    avatarUrl: r.avatar_url,
    guesses: Number(r.max_streak),
    streak: Number(r.streak),
  }));
}
