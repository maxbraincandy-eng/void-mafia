// ── ფორმალური ლოგიკის აკადემია — კითხვის მოდელი ───────────────────────
// Questions live ONLY on the server. A session sends the text with its options
// already shuffled and the key withheld, so the answer never reaches the client
// before it is submitted — that is the whole anti-cheat story.

export type LogicLevel = 'beginner' | 'medium' | 'hard' | 'expert';
export type LogicCategory =
  | 'syllogism'      // სილოგიზმები
  | 'conditional'    // პირობითი მსჯელობა
  | 'contradiction'  // წინააღმდეგობის აღმოჩენა
  | 'necessity'      // აუცილებელი და საკმარისი პირობები
  | 'fallacy'        // ლოგიკური შეცდომები
  | 'pattern'        // კანონზომიერებები
  | 'mafia';         // მაფიის ლოგიკა

export interface LogicQuestion {
  id: string;
  level: LogicLevel;
  cat: LogicCategory;
  /** Short label shown above the question. */
  title: string;
  /** The premises / setup. Newlines are rendered as separate lines. */
  body: string;
  /** What is actually being asked. */
  q: string;
  /** Exactly four. Stored in their authored order; shuffled per session. */
  options: [string, string, string, string];
  /** Index into `options` before shuffling. */
  answer: 0 | 1 | 2 | 3;
  /** The formal rule at play, named in Georgian — this is what we teach. */
  rule: string;
  /** Why the correct answer follows. */
  why: string;
  /** Why the most tempting wrong option fails, keyed by its index. */
  trap?: Partial<Record<0 | 1 | 2 | 3, string>>;
  /**
   * Authored difficulty hint in seconds. This is NOT the timer — see `timeFor`.
   * Read it as "how long this one deserves relative to the others".
   */
  seconds: number;
}

// The authored hints were sized for solving, not for READING: 35 s is not
// enough to take in three premises and four full-sentence options, let alone
// think. The real clock stretches them into a comfortable 90–120 s band, so the
// timer creates mild pressure instead of racing the reader.
export const MIN_SECONDS = 90;
export const MAX_SECONDS = 120;
export function timeFor(q: { seconds: number }): number {
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(q.seconds * 1.8)));
}

export const LEVEL_LABEL: Record<LogicLevel, string> = {
  beginner: 'დამწყები',
  medium: 'საშუალო',
  hard: 'რთული',
  expert: 'ექსპერტი',
};
export const LEVEL_COLOR: Record<LogicLevel, string> = {
  beginner: '#3fb950', medium: '#4d9fff', hard: '#a371f7', expert: '#ff4d5e',
};
export const CAT_LABEL: Record<LogicCategory, string> = {
  syllogism: 'სილოგიზმები',
  conditional: 'პირობითი მსჯელობა',
  contradiction: 'წინააღმდეგობა',
  necessity: 'აუცილებელი და საკმარისი',
  fallacy: 'ლოგიკური შეცდომები',
  pattern: 'კანონზომიერებები',
  mafia: 'მაფიის ლოგიკა',
};

/** Rating weight: a harder question moves the Logic Rating further. */
export const LEVEL_WEIGHT: Record<LogicLevel, number> = {
  beginner: 1, medium: 1.35, hard: 1.8, expert: 2.4,
};
/** Nominal difficulty of each level on the rating scale (Elo-style). */
export const LEVEL_RATING: Record<LogicLevel, number> = {
  beginner: 1100, medium: 1450, hard: 1800, expert: 2150,
};
