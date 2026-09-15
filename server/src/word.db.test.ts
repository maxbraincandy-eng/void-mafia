/**
 * სიტყვა — the day, the streak and the board, against a real database.
 *
 * Three things here are worth testing and the rest is bookkeeping.
 *
 * The first is that the answer does not leak. A daily game is only a game
 * while nobody can read today's word out of a payload, and the leak would be
 * completely invisible from the screen — everything would look right.
 *
 * The second is the streak, which is the number people actually play for. It
 * is wrong only once, days later, for somebody who played every day, and by
 * then there is no way to reconstruct what happened.
 *
 * The third is that a bad guess costs nothing. If a rejected word consumed an
 * attempt, the game would quietly be about knowing the word list.
 *
 *   WORD_TEST_DATABASE_URL=postgres://postgres@localhost:5433/livetest \
 *     npx tsx --test src/word.db.test.ts
 */

import { test, before, after, beforeEach } from 'node:test';
import { strict as assert } from 'assert';

const url = process.env.WORD_TEST_DATABASE_URL;
const skip = url ? false : 'set WORD_TEST_DATABASE_URL to run the სიტყვა tests';
if (url) process.env.DATABASE_URL = url;

type Svc = typeof import('./services/wordService.js');
type Bank = typeof import('./services/wordBank.js');
type Db = typeof import('./db.js');

let S: Svc;
let B: Bank;
let db: Db;

const A = 'wtu_alice';
const C = 'wtu_carol';

/** A moment inside puzzle N, safely away from the Tbilisi midnight boundary. */
const atPuzzle = (n: number) => B.EPOCH_UTC + n * 86400_000 + 10 * 3600_000;

before(async () => {
  if (!url) return;
  db = await import('./db.js');
  await db.initializeDatabase();
  S = await import('./services/wordService.js');
  B = await import('./services/wordBank.js');
});

after(async () => {
  if (!url) return;
  await clean();
  await db.sql.end({ timeout: 1 });
});

beforeEach(async () => {
  if (!url) return;
  await clean();
  for (const [id, name] of [[A, 'Alice'], [C, 'Carol']]) {
    await db.sql`
      INSERT INTO players (id, username, avatar, joined_at, last_seen_at)
      VALUES (${id}, ${name}, '🙂', ${Date.now()}, ${Date.now()})
    `;
  }
});

async function clean(): Promise<void> {
  await db.sql`DELETE FROM word_days WHERE user_id LIKE 'wtu\\_%'`;
  await db.sql`DELETE FROM word_stats WHERE user_id LIKE 'wtu\\_%'`;
  await db.sql`DELETE FROM players WHERE id LIKE 'wtu\\_%'`;
}

/** A word that is certainly not today's. */
function wrongWord(puzzle: number): string {
  const sol = B.solutionFor(puzzle);
  return B.SOLUTIONS.find(w => w !== sol)!;
}

// ── the answer does not leak ────────────────────────────────────────────────

test('the word is not in the state while the day is still open', { skip }, async () => {
  const t = atPuzzle(0);
  let st = await S.getState(A, t);
  assert.equal(st.solution, null, 'the answer was in the opening payload');

  // And it stays hidden through five wrong guesses.
  for (let i = 0; i < 5; i++) {
    const out = await S.submitGuess(A, wrongWord(st.puzzle), t);
    st = out.state;
    assert.equal(st.status, 'playing');
    assert.equal(st.solution, null, `the answer leaked after guess ${i + 1}`);
  }
});

test('the word arrives once the day is decided, and only then', { skip }, async () => {
  const t = atPuzzle(3);
  const sol = B.solutionFor(B.puzzleNumber(t));
  const out = await S.submitGuess(A, sol, t);
  assert.equal(out.state.status, 'won');
  assert.equal(out.state.solution, sol, 'a solved day did not reveal the word');
});

test('a lost day reveals the word too', { skip }, async () => {
  const t = atPuzzle(4);
  const wrong = wrongWord(B.puzzleNumber(t));
  let last: Awaited<ReturnType<Svc['submitGuess']>> | null = null;
  for (let i = 0; i < B.MAX_GUESSES; i++) last = await S.submitGuess(A, wrong, t);
  assert.equal(last!.state.status, 'lost');
  assert.equal(last!.state.solution, B.solutionFor(B.puzzleNumber(t)));
});

test('the board never carries anybody\'s guesses', { skip }, async () => {
  const t = atPuzzle(5);
  await S.submitGuess(A, B.solutionFor(B.puzzleNumber(t)), t);
  const board = await S.getLeaderboard(t);
  const asText = JSON.stringify(board);
  for (const w of B.SOLUTIONS) {
    assert.ok(!asText.includes(w), `the board leaks "${w}"`);
  }
  assert.equal(board[0]!.guesses, 1, 'the board lost the guess count');
});

// ── a rejected guess costs nothing ──────────────────────────────────────────

test('a word that is not in the bank does not use an attempt', { skip }, async () => {
  const t = atPuzzle(6);
  const out = await S.submitGuess(A, 'ააააა', t);
  assert.equal(out.rejected, 'unknown');
  assert.equal(out.state.rows.length, 0, 'a rejected guess was recorded');
  assert.equal((await S.getState(A, t)).rows.length, 0, 'a rejected guess was persisted');
});

test('a guess of the wrong length does not use an attempt', { skip }, async () => {
  const t = atPuzzle(6);
  const out = await S.submitGuess(A, 'სახ', t);
  assert.equal(out.rejected, 'length');
  assert.equal(out.state.rows.length, 0);
});

test('a guess after the day is over changes nothing', { skip }, async () => {
  const t = atPuzzle(7);
  const sol = B.solutionFor(B.puzzleNumber(t));
  await S.submitGuess(A, sol, t);
  const out = await S.submitGuess(A, wrongWord(B.puzzleNumber(t)), t);
  assert.equal(out.rejected, 'finished');
  assert.equal(out.state.rows.length, 1, 'a guess landed after the day was won');
  assert.equal(out.state.stats.wins, 1, 'the win was counted twice');
});

// ── the day survives a reload ───────────────────────────────────────────────

test('guesses come back after a reload, with their marks', { skip }, async () => {
  const t = atPuzzle(8);
  const w = wrongWord(B.puzzleNumber(t));
  await S.submitGuess(A, w, t);
  const st = await S.getState(A, t);
  assert.equal(st.rows.length, 1);
  assert.equal(st.rows[0]!.guess, w);
  assert.deepEqual(st.rows[0]!.marks, B.score(w, B.solutionFor(B.puzzleNumber(t))));
});

test('two players on the same day get the same word', { skip }, async () => {
  const t = atPuzzle(9);
  const sol = B.solutionFor(B.puzzleNumber(t));
  const a = await S.submitGuess(A, sol, t);
  const c = await S.submitGuess(C, sol, t);
  assert.equal(a.state.status, 'won');
  assert.equal(c.state.status, 'won', 'the same word was not the answer for both players');
});

// ── the streak ──────────────────────────────────────────────────────────────

test('the streak counts consecutive days solved', { skip }, async () => {
  for (let d = 0; d < 4; d++) {
    const t = atPuzzle(20 + d);
    const out = await S.submitGuess(A, B.solutionFor(B.puzzleNumber(t)), t);
    assert.equal(out.state.stats.streak, d + 1, `day ${d} gave streak ${out.state.stats.streak}`);
  }
});

test('a missed day resets the streak but not the best', { skip }, async () => {
  for (const d of [30, 31, 32]) {
    const t = atPuzzle(d);
    await S.submitGuess(A, B.solutionFor(B.puzzleNumber(t)), t);
  }
  // Skip 33 entirely, then play 34.
  const t = atPuzzle(34);
  const out = await S.submitGuess(A, B.solutionFor(B.puzzleNumber(t)), t);
  assert.equal(out.state.stats.streak, 1, 'a missed day did not reset the streak');
  assert.equal(out.state.stats.maxStreak, 3, 'the best streak was lost');
});

test('a lost day breaks the streak', { skip }, async () => {
  for (const d of [40, 41]) {
    const t = atPuzzle(d);
    await S.submitGuess(A, B.solutionFor(B.puzzleNumber(t)), t);
  }
  const t = atPuzzle(42);
  const wrong = wrongWord(B.puzzleNumber(t));
  let last: Awaited<ReturnType<Svc['submitGuess']>> | null = null;
  for (let i = 0; i < B.MAX_GUESSES; i++) last = await S.submitGuess(A, wrong, t);
  assert.equal(last!.state.status, 'lost');
  assert.equal(last!.state.stats.streak, 0, 'losing a day kept the streak');
  assert.equal(last!.state.stats.maxStreak, 2);
});

test('the distribution records how many guesses each win took', { skip }, async () => {
  const t1 = atPuzzle(50);
  await S.submitGuess(A, B.solutionFor(B.puzzleNumber(t1)), t1);        // 1 guess

  const t2 = atPuzzle(51);
  const p2 = B.puzzleNumber(t2);
  await S.submitGuess(A, wrongWord(p2), t2);
  const out = await S.submitGuess(A, B.solutionFor(p2), t2);            // 2 guesses

  assert.equal(out.state.stats.distribution[0], 1);
  assert.equal(out.state.stats.distribution[1], 1);
  assert.equal(out.state.stats.played, 2);
  assert.equal(out.state.stats.wins, 2);
});

test('the streak rule itself', { skip }, () => {
  // Pure, so it can be checked directly rather than through eight days of I/O.
  assert.equal(S.nextStreak(0, null, 5), 1, 'a first win should start a streak');
  assert.equal(S.nextStreak(3, 5, 6), 4, 'the day after should extend');
  assert.equal(S.nextStreak(3, 5, 7), 1, 'a gap should reset');
  assert.equal(S.nextStreak(3, 5, 5), 3, 'the same puzzle should not reset');
  assert.equal(S.nextStreak(9, 5, 99), 1, 'a long gap should reset');
});
