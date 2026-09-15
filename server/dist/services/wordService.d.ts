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
import { type Mark } from './wordBank.js';
export interface WordRow {
    guess: string;
    marks: Mark[];
}
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
export declare function nextStreak(prev: number, lastSolved: number | null, puzzle: number): number;
/** Where this player stands on today's puzzle. */
export declare function getState(userId: string, now?: number): Promise<WordState>;
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
export declare function submitGuess(userId: string, raw: string, now?: number): Promise<GuessOutcome>;
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
export declare function getLeaderboard(now?: number, limit?: number): Promise<WordLeaderRow[]>;
/** The all-time streak board, which is the one people actually chase. */
export declare function getStreakBoard(limit?: number): Promise<WordLeaderRow[]>;
//# sourceMappingURL=wordService.d.ts.map