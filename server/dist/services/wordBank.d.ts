/**
 * სიტყვა — the word bank, the daily draw, and the scoring rule.
 *
 * Pure functions only: no database, no sockets. Everything here can be tested
 * without standing anything up, which matters because two of the three things
 * in this file are easy to get subtly wrong and impossible to notice.
 *
 * ONE WORD A DAY, THE SAME WORD FOR EVERYBODY
 * ───────────────────────────────────────────
 * That is the whole point of the game — the shared result is what makes it
 * worth posting — so the draw cannot be random. It is a fixed shuffle of the
 * solution list, indexed by the day number, which gives every player the same
 * word, gives no repeats until the list is exhausted, and needs nothing stored.
 *
 * THE DAY ROLLS AT TBILISI MIDNIGHT
 * ─────────────────────────────────
 * Not UTC. A player in Tbilisi opening the app at 01:00 must get the new word,
 * and one at 23:00 must still have yesterday's. Georgia is UTC+4 all year — no
 * daylight saving since 2005 — so this is a fixed offset rather than a time
 * zone database.
 */
/** Letters in a solution. */
export declare const WORD_LENGTH = 5;
/** Guesses allowed. */
export declare const MAX_GUESSES = 6;
/**
 * The Mkhedruli alphabet, in order, for the on-screen keyboard.
 *
 * Thirty-three letters and no capitals, which is why the client lays them out
 * in three rows of eleven rather than borrowing a QWERTY shape.
 */
export declare const ALPHABET: string[];
/**
 * The words that can be the answer.
 *
 * Common, everyday nouns and adjectives — things a player will recognise the
 * moment they see them. A solution nobody knows is not a hard puzzle, it is a
 * broken one, so anything obscure belongs in EXTRA_VALID below where it can be
 * guessed but never has to be found.
 */
export declare const SOLUTIONS: string[];
/**
 * Accepted as a guess, never given as the answer.
 *
 * Real words that are fair to try but would be unfair to have to find —
 * rarer, more specialised, or simply less likely to spring to mind. A guess
 * list that is only the solution list turns the game into "is this today's
 * word?" rather than "is this a word?".
 */
export declare const EXTRA_VALID: string[];
/** A word as an array of letters. */
export declare function letters(word: string): string[];
/** Is this a word the game will accept as a guess? */
export declare function isValidGuess(word: string): boolean;
/**
 * Which puzzle number a moment in time falls in.
 *
 * Day 0 is the launch date. Computed by shifting into Tbilisi time and then
 * taking whole days, rather than by constructing a local Date, so it does not
 * depend on the server's own time zone — a server in UTC and a server in
 * Asia/Tbilisi must agree on what today's word is.
 */
export declare const EPOCH_UTC: number;
export declare function puzzleNumber(now?: number): number;
/** `2026-09-15`, in Tbilisi. The key a day's row is stored under. */
export declare function dateKey(now?: number): string;
/** When the current puzzle ends, in ms since the epoch. */
export declare function nextRollover(now?: number): number;
/** Today's word. The same for every player, and never sent to the client. */
export declare function solutionFor(puzzle: number): string;
/** What one letter of a guess turned out to be. */
export type Mark = 'hit' | 'near' | 'miss';
/**
 * Score a guess against the solution.
 *
 * THE RULE THAT IS ALWAYS GOT WRONG
 * ─────────────────────────────────
 * A letter guessed twice when the solution holds it once must come back with
 * ONE mark, not two. The naive version — "is this letter anywhere in the
 * solution?" — marks both, and the player is told there are two ს in a word
 * with one. So this is two passes: exact positions are claimed first, then the
 * remaining letters of the solution are spent left to right on the rest. A
 * letter can only be spent once.
 *
 * Greens must be claimed BEFORE any yellow, which is why it cannot be done in
 * a single pass: a letter in the right place later in the guess has to win
 * over the same letter in the wrong place earlier in it.
 */
export declare function score(guess: string, solution: string): Mark[];
/**
 * The best thing known about each letter so far, for colouring the keyboard.
 *
 * `hit` outranks `near` outranks `miss`: once a letter has been placed, a later
 * guess putting it somewhere wrong must not demote the key back to yellow.
 */
export declare function keyboardState(rows: {
    guess: string;
    marks: Mark[];
}[]): Record<string, Mark>;
/** The emoji grid a player shares. Never contains the word. */
export declare function shareGrid(rows: {
    marks: Mark[];
}[], puzzle: number, solved: boolean): string;
//# sourceMappingURL=wordBank.d.ts.map