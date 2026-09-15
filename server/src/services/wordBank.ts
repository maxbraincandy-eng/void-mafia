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

/** Georgia is UTC+4, year round. */
const TBILISI_OFFSET_MS = 4 * 60 * 60 * 1000;

/** Letters in a solution. */
export const WORD_LENGTH = 5;
/** Guesses allowed. */
export const MAX_GUESSES = 6;

/**
 * The Mkhedruli alphabet, in order, for the on-screen keyboard.
 *
 * Thirty-three letters and no capitals, which is why the client lays them out
 * in three rows of eleven rather than borrowing a QWERTY shape.
 */
export const ALPHABET = [
  'ა', 'ბ', 'გ', 'დ', 'ე', 'ვ', 'ზ', 'თ', 'ი', 'კ', 'ლ',
  'მ', 'ნ', 'ო', 'პ', 'ჟ', 'რ', 'ს', 'ტ', 'უ', 'ფ', 'ქ',
  'ღ', 'ყ', 'შ', 'ჩ', 'ც', 'ძ', 'წ', 'ჭ', 'ხ', 'ჯ', 'ჰ',
];

/**
 * The words that can be the answer.
 *
 * Common, everyday nouns and adjectives — things a player will recognise the
 * moment they see them. A solution nobody knows is not a hard puzzle, it is a
 * broken one, so anything obscure belongs in EXTRA_VALID below where it can be
 * guessed but never has to be found.
 */
export const SOLUTIONS = [
  // სახლი და ყოფა
  'სახლი', 'ოთახი', 'სკამი', 'ჩანთა', 'წინდა', 'საათი', 'ბანკი', 'სკოლა',
  'წიგნი', 'ლექსი', 'ფილმი', 'ოფისი', 'სუფრა',
  // ბუნება
  'წყალი', 'ჰაერი', 'წვიმა', 'თოვლი', 'ღვინო', 'ქვიშა', 'ტალღა', 'თესლი',
  'მთები', 'ვარდი',
  // ცხოველები
  'ცხენი', 'ძაღლი', 'თევზი', 'მგელი', 'დათვი', 'ძროხა', 'თაგვი', 'ირემი',
  'სპილო', 'გველი', 'ობობა', 'მწერი',
  // საჭმელი
  'ყველი', 'ხორცი', 'ვაშლი', 'ატამი', 'კიტრი', 'ხახვი', 'ნიორი', 'ლეღვი',
  'თაფლი',
  // სხეული
  'თვალი', 'კბილი', 'მუხლი', 'ზურგი', 'ძვალი', 'წვერი', 'ტვინი',
  // ხალხი და გრძნობა
  'ხალხი', 'ძმები', 'მტერი', 'ცოდნა', 'ცეკვა',
  // თვისება
  'კარგი', 'ახალი', 'ძველი', 'თეთრი', 'ლურჯი', 'ცხელი', 'მოკლე', 'სუსტი',
  'მძიმე', 'რბილი', 'სველი', 'სუფთა', 'მწარე', 'მჟავე', 'სავსე', 'მთელი',
  'ბევრი',
  // ნივთები
  'სარკე', 'ფარდა', 'ქვაბი', 'კოვზი', 'თეფში', 'ნემსი', 'აგური', 'რკინა',
  'ტყავი', 'ბამბა',
  // სხვა
  'კვირა', 'ბურთი', 'რაგბი', 'ექიმი', 'ქიმია', 'ზემოთ', 'გარეთ', 'ახლოს',
  'სადმე', 'ყველა', 'რაღაც', 'ნისლი', 'სიცხე', 'მზერა', 'ფრენა',
];

/**
 * Accepted as a guess, never given as the answer.
 *
 * Real words that are fair to try but would be unfair to have to find —
 * rarer, more specialised, or simply less likely to spring to mind. A guess
 * list that is only the solution list turns the game into "is this today's
 * word?" rather than "is this a word?".
 */
export const EXTRA_VALID = [
  'ლენტი', 'ურემი', 'კრავი', 'ბუჩქი', 'ეკალი', 'ლობიო', 'შვრია', 'ჭვავი',
];

/** A word as an array of letters. */
export function letters(word: string): string[] {
  return Array.from(word.normalize('NFC'));
}

const VALID = new Set<string>([...SOLUTIONS, ...EXTRA_VALID]);

/** Is this a word the game will accept as a guess? */
export function isValidGuess(word: string): boolean {
  return VALID.has(word.normalize('NFC'));
}

/**
 * Which puzzle number a moment in time falls in.
 *
 * Day 0 is the launch date. Computed by shifting into Tbilisi time and then
 * taking whole days, rather than by constructing a local Date, so it does not
 * depend on the server's own time zone — a server in UTC and a server in
 * Asia/Tbilisi must agree on what today's word is.
 */
export const EPOCH_UTC = Date.UTC(2026, 8, 15);   // 15 September 2026

export function puzzleNumber(now: number = Date.now()): number {
  const tbilisiDay = Math.floor((now + TBILISI_OFFSET_MS) / 86400000);
  const epochDay = Math.floor((EPOCH_UTC + TBILISI_OFFSET_MS) / 86400000);
  return Math.max(0, tbilisiDay - epochDay);
}

/** `2026-09-15`, in Tbilisi. The key a day's row is stored under. */
export function dateKey(now: number = Date.now()): string {
  return new Date(now + TBILISI_OFFSET_MS).toISOString().slice(0, 10);
}

/** When the current puzzle ends, in ms since the epoch. */
export function nextRollover(now: number = Date.now()): number {
  const shifted = now + TBILISI_OFFSET_MS;
  const startOfDay = Math.floor(shifted / 86400000) * 86400000;
  return startOfDay + 86400000 - TBILISI_OFFSET_MS;
}

/**
 * The solution order.
 *
 * A fixed shuffle rather than the list as written, so consecutive days are not
 * all animals, and a deterministic one so it survives a restart and a redeploy.
 * Seeded Fisher–Yates with a constant — the shuffle must never depend on
 * anything that varies between two servers running the same build.
 */
const ORDER = (() => {
  const idx = SOLUTIONS.map((_, i) => i);
  let s = 0x5177a;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return idx;
})();

/** Today's word. The same for every player, and never sent to the client. */
export function solutionFor(puzzle: number): string {
  return SOLUTIONS[ORDER[puzzle % ORDER.length]!]!;
}

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
export function score(guess: string, solution: string): Mark[] {
  const g = letters(guess), s = letters(solution);
  const marks: Mark[] = new Array(g.length).fill('miss');
  const left = new Map<string, number>();

  for (let i = 0; i < g.length; i++) {
    if (g[i] === s[i]) marks[i] = 'hit';
    else left.set(s[i]!, (left.get(s[i]!) ?? 0) + 1);
  }
  for (let i = 0; i < g.length; i++) {
    if (marks[i] === 'hit') continue;
    const have = left.get(g[i]!) ?? 0;
    if (have > 0) { marks[i] = 'near'; left.set(g[i]!, have - 1); }
  }
  return marks;
}

/**
 * The best thing known about each letter so far, for colouring the keyboard.
 *
 * `hit` outranks `near` outranks `miss`: once a letter has been placed, a later
 * guess putting it somewhere wrong must not demote the key back to yellow.
 */
export function keyboardState(
  rows: { guess: string; marks: Mark[] }[],
): Record<string, Mark> {
  const rank: Record<Mark, number> = { miss: 0, near: 1, hit: 2 };
  const out: Record<string, Mark> = {};
  for (const r of rows) {
    const g = letters(r.guess);
    for (let i = 0; i < g.length; i++) {
      const k = g[i]!, m = r.marks[i]!;
      if (!out[k] || rank[m] > rank[out[k]!]) out[k] = m;
    }
  }
  return out;
}

/** The emoji grid a player shares. Never contains the word. */
export function shareGrid(rows: { marks: Mark[] }[], puzzle: number, solved: boolean): string {
  const box: Record<Mark, string> = { hit: '🟩', near: '🟨', miss: '⬛' };
  const head = `სიტყვა #${puzzle} ${solved ? `${rows.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`}`;
  return [head, ...rows.map(r => r.marks.map(m => box[m]).join(''))].join('\n');
}
