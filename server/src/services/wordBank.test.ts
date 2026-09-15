/**
 * სიტყვა — the bank, the daily draw, and the scoring rule.
 *
 * All three are pure, and all three fail silently when they are wrong: a
 * four-letter word in the list shows up as a puzzle nobody can enter, a draw
 * that depends on the server's clock gives two players different words on the
 * same day and neither can tell, and a scoring bug tells a player there are
 * two of a letter in a word that has one.
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import {
  SOLUTIONS, EXTRA_VALID, ALPHABET, WORD_LENGTH, MAX_GUESSES,
  letters, isValidGuess, score, keyboardState, shareGrid,
  puzzleNumber, dateKey, nextRollover, solutionFor, EPOCH_UTC,
  type Mark,
} from './wordBank.js';

test('every word is exactly five letters', () => {
  for (const w of [...SOLUTIONS, ...EXTRA_VALID]) {
    assert.equal(letters(w).length, WORD_LENGTH, `"${w}" has ${letters(w).length} letters`);
  }
});

test('every word is written in Mkhedruli and nothing else', () => {
  for (const w of [...SOLUTIONS, ...EXTRA_VALID]) {
    for (const ch of letters(w)) {
      assert.ok(ALPHABET.includes(ch),
        `"${w}" contains ${ch} (U+${ch.codePointAt(0)!.toString(16)}), which is not a letter on the keyboard`);
    }
  }
});

test('no word appears twice', () => {
  const all = [...SOLUTIONS, ...EXTRA_VALID];
  assert.equal(new Set(all).size, all.length, 'the bank has a duplicate');
});

test('a solution is never also in the guess-only list', () => {
  for (const w of EXTRA_VALID) {
    assert.ok(!SOLUTIONS.includes(w), `"${w}" is in both lists`);
  }
});

test('the bank is big enough that a word does not come round again soon', () => {
  // Under about two months and a regular player sees a repeat, which for a
  // once-a-day game is the moment they stop playing.
  assert.ok(SOLUTIONS.length >= 60, `only ${SOLUTIONS.length} solutions`);
});

test('a guess is accepted only if it is a word', () => {
  assert.equal(isValidGuess(SOLUTIONS[0]!), true);
  assert.equal(isValidGuess(EXTRA_VALID[0]!), true);
  assert.equal(isValidGuess('ააააა'), false);
  assert.equal(isValidGuess('hello'), false);
});

// ── the scoring rule ────────────────────────────────────────────────────────

const m = (s: string): Mark[] =>
  Array.from(s).map(c => (c === 'h' ? 'hit' : c === 'n' ? 'near' : 'miss'));

test('the right word is all hits', () => {
  assert.deepEqual(score('სახლი', 'სახლი'), m('hhhhh'));
});

test('a letter in the wrong place is a near, in the right place a hit', () => {
  // სკამი against სახლი: ს and ი sit in place, and the ა at index 2 of the
  // guess is the ა at index 1 of the word — present, moved.
  assert.deepEqual(score('სკამი', 'სახლი'), m('hmnmh'));
});

test('a letter the word does not have is a miss', () => {
  const marks = score('ჭვავი', 'სახლი');
  assert.equal(marks[0], 'miss');
  assert.equal(marks[4], 'hit');       // ი in place
});

test('a letter guessed twice in a word that holds it once is marked once', () => {
  /*
   * THE RULE THAT IS ALWAYS GOT WRONG.
   *
   * ბამბა holds two ბ and two ა. Guessing it against ბანკი — one ბ, one ა —
   * must mark the first ბ (in place) and the first ა (in place) and leave the
   * SECOND ბ and the second ა as misses. The naive "is this letter in the
   * word" test marks all four and tells the player there are two ბ.
   */
  assert.deepEqual(score('ბამბა', 'ბანკი'), m('hhmmm'));
});

test('a hit later in the guess beats a near earlier in it', () => {
  /*
   * This is why the greens have to be claimed in a first pass. Against ვაშლი,
   * the guess ლობიო has ლ out of place at 0 and ო twice; but take a cleaner
   * case: ა appears once in ვაშლი, at index 1. A guess with ა at some other
   * index AND at index 1 must colour index 1, not the other one.
   */
  assert.deepEqual(score('აამბა', 'ვაშლი'), m('mhmmm'));
});

test('two of a letter are both marked when the word has two', () => {
  // ბამბა against itself: both ბ and both ა are hits.
  assert.deepEqual(score('ბამბა', 'ბამბა'), m('hhhhh'));
});

test('two guessed, two present, one in place: one hit and one near', () => {
  /*
   * ა at 1 and 4 in ბამბა. A guess holding ა at 1 and at 2 should hit the
   * first and near the second, because there is a second ა left to spend.
   */
  const marks = score('ბაამბ'.slice(0, 5), 'ბამბა');
  assert.equal(marks[1], 'hit');
  assert.equal(marks[2], 'near');
});

test('scoring never invents or loses a letter', () => {
  // Over the whole bank: the count of non-miss marks for a letter can never
  // exceed how many of that letter the solution actually has.
  for (const sol of SOLUTIONS) {
    const have = new Map<string, number>();
    for (const c of letters(sol)) have.set(c, (have.get(c) ?? 0) + 1);
    for (const guess of SOLUTIONS) {
      const marks = score(guess, sol);
      const marked = new Map<string, number>();
      letters(guess).forEach((c, i) => {
        if (marks[i] !== 'miss') marked.set(c, (marked.get(c) ?? 0) + 1);
      });
      for (const [c, n] of marked) {
        assert.ok(n <= (have.get(c) ?? 0),
          `"${guess}" vs "${sol}": ${n} of ${c} marked, the word has ${have.get(c) ?? 0}`);
      }
    }
  }
});

// ── the keyboard ────────────────────────────────────────────────────────────

test('a placed letter is not demoted by a later wrong guess', () => {
  const rows = [
    { guess: 'სახლი', marks: score('სახლი', 'სახლი') },
    { guess: 'სკამი', marks: score('სკამი', 'სახლი') },
  ];
  const kb = keyboardState(rows);
  assert.equal(kb['ხ'], 'hit', 'ხ was placed and then dropped back');
  assert.equal(kb['ლ'], 'hit');
});

test('a near is not demoted to a miss', () => {
  const kb = keyboardState([
    { guess: 'სკამი', marks: m('nmmmm') },
    { guess: 'ბანკი', marks: m('mmmmm') },
  ]);
  assert.equal(kb['ს'], 'near');
});

// ── the daily draw ──────────────────────────────────────────────────────────

test('the puzzle number does not depend on the server time zone', () => {
  /*
   * The whole promise of the game is that everybody has the same word. If the
   * draw went through a local Date, a server in UTC and one in Asia/Tbilisi
   * would disagree for four hours every day and no player could tell which of
   * them was wrong.
   */
  const noon = EPOCH_UTC + 12 * 3600_000;
  assert.equal(puzzleNumber(noon), 0);
  assert.equal(puzzleNumber(noon + 86400_000), 1);
  assert.equal(puzzleNumber(noon + 30 * 86400_000), 30);
});

test('the day turns over at Tbilisi midnight, not UTC midnight', () => {
  // 20:30 UTC is 00:30 the next day in Tbilisi: a new puzzle.
  const before = Date.UTC(2026, 8, 20, 19, 59);
  const after = Date.UTC(2026, 8, 20, 20, 1);
  assert.equal(puzzleNumber(after), puzzleNumber(before) + 1,
    'the puzzle did not roll at 00:00 Tbilisi');
  assert.equal(dateKey(before), '2026-09-20');
  assert.equal(dateKey(after), '2026-09-21');
});

test('the rollover is the start of the next Tbilisi day', () => {
  const t = Date.UTC(2026, 8, 20, 10, 0);
  const next = nextRollover(t);
  assert.ok(next > t, 'the rollover is in the past');
  assert.ok(next - t <= 86400_000, 'the rollover is more than a day away');
  assert.equal(dateKey(next), dateKey(t + 86400_000), 'the rollover lands on the wrong day');
  assert.notEqual(dateKey(next - 1), dateKey(next), 'the rollover is not on a boundary');
});

test('every player gets the same word, and it never changes for that day', () => {
  for (let p = 0; p < 200; p++) {
    assert.equal(solutionFor(p), solutionFor(p), 'the draw is not stable');
    assert.ok(SOLUTIONS.includes(solutionFor(p)), `puzzle ${p} drew something not in the bank`);
  }
});

test('no word repeats until the whole bank has been used', () => {
  const seen = new Set<string>();
  for (let p = 0; p < SOLUTIONS.length; p++) seen.add(solutionFor(p));
  assert.equal(seen.size, SOLUTIONS.length, 'the rotation repeats a word inside one cycle');
  // And it does come round again after that, rather than running out.
  assert.equal(solutionFor(SOLUTIONS.length), solutionFor(0));
});

test('consecutive days are not the list in the order it was typed', () => {
  // The bank is grouped by theme, so playing it unshuffled would give a week
  // of animals and then a week of adjectives.
  let inOrder = 0;
  for (let p = 0; p + 1 < SOLUTIONS.length; p++) {
    if (SOLUTIONS.indexOf(solutionFor(p + 1)) === SOLUTIONS.indexOf(solutionFor(p)) + 1) inOrder++;
  }
  assert.ok(inOrder < SOLUTIONS.length * 0.1, `${inOrder} consecutive days run in list order`);
});

// ── sharing ─────────────────────────────────────────────────────────────────

test('the shared grid never contains the word', () => {
  const rows = [
    { guess: 'სკამი', marks: score('სკამი', 'სახლი') },
    { guess: 'სახლი', marks: score('სახლი', 'სახლი') },
  ];
  const grid = shareGrid(rows, 7, true);
  for (const w of SOLUTIONS) assert.ok(!grid.includes(w), `the grid leaks "${w}"`);
  assert.ok(grid.includes(`#7`), 'the grid does not say which puzzle it is');
  assert.ok(grid.includes(`2/${MAX_GUESSES}`), 'the grid does not say how many guesses it took');
});

test('a failed day is shared as X, not as six', () => {
  const rows = Array.from({ length: MAX_GUESSES }, () => ({ marks: m('mmmmm') }));
  assert.ok(shareGrid(rows, 9, false).includes(`X/${MAX_GUESSES}`));
});
