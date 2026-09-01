/**
 * დებილების ტესტი — the question bank.
 *
 * WHY THIS LIVES ON THE SERVER
 * ────────────────────────────
 * The correct answers are here, and here only. A quiz that ships its answer key
 * in the client bundle has a leaderboard anybody can top by opening the network
 * tab, which makes the board worthless and the game pointless. Questions go out
 * without their answers; scoring happens where the answers are.
 *
 * THE JOKE, AND WHAT MAKES ONE WORK
 * ─────────────────────────────────
 * These are not trivia. Nobody knows what a Dutch quail egg weighs, and that is
 * the point — the humour is in the options, not in the knowledge. Three shapes
 * do most of the work:
 *
 *   FAKE ETYMOLOGY   "Who invented the boom barrier?" → "Schlag Baum". The
 *                    answer is a pun that sounds like it might be true.
 *   ABSURD PRECISION  A question demanding an exact figure about something
 *                    nobody has ever measured.
 *   THE HONEST OPTION One choice quietly points out that the question is
 *                    nonsense — and is sometimes right, which keeps people
 *                    from learning to pick it every time.
 *
 * `reveal` is shown after answering and carries most of the laugh. A quiz that
 * only says "correct" or "wrong" wastes the best line.
 *
 * CATEGORIES
 * ──────────
 * Four of them, plus a mixed draw. Each one is its own pool, and each holds at
 * least twice QUESTIONS_PER_TEST — that floor is what makes "you will not get
 * the same twelve twice" true *inside* a category and not only across the whole
 * bank. `bank.test.ts` enforces it, because a category that quietly falls under
 * the floor would still work and just silently start repeating.
 */
export type CategoryId = 'classic' | 'geo' | 'brain' | 'void';
/** What a test can be drawn from: one category, or everything at once. */
export type TestCategory = CategoryId | 'mixed';
export interface DumbOption {
    id: string;
    text: string;
}
export interface DumbQuestion {
    id: string;
    text: string;
    options: DumbOption[];
    /** Index into `options`. Never sent to the client. */
    correct: number;
    /** Shown after answering. The punchline. */
    reveal: string;
    category: CategoryId;
}
/** What the client is allowed to see: the question, minus the answer. */
export interface PublicQuestion {
    id: string;
    text: string;
    options: DumbOption[];
}
export declare const BANK: readonly DumbQuestion[];
export interface CategoryInfo {
    id: TestCategory;
    title: string;
    sub: string;
    emoji: string;
    accent: string;
    /** How many questions the pool holds. `mixed` counts the whole bank. */
    count: number;
}
/** The picker's contents. Counts come from the bank so they cannot drift. */
export declare const CATEGORIES: readonly CategoryInfo[];
/** Narrow whatever the client sent. Anything unrecognised falls back to mixed. */
export declare function asCategory(value: unknown): TestCategory;
/** The bank, minus the answers. */
export declare function publicOf(q: DumbQuestion): PublicQuestion;
export declare function byId(id: string): DumbQuestion | undefined;
export declare const QUESTIONS_PER_TEST = 12;
/**
 * Draw a test from one category, or from everything.
 *
 * `avoid` holds the questions this player has just seen in this same category.
 * They are excluded while enough others remain — every pool holds at least
 * twenty-four against twelve per test, which is why two runs back to back share
 * nothing. When the exclusions would leave too few, the rule is dropped rather
 * than returning a short test: a repeat is a small disappointment and a
 * nine-question test is a bug.
 *
 * The fallback stays inside the chosen category. Widening to the whole bank
 * would be the easy fix and the wrong one — somebody who picked სხვა განზომილება
 * would suddenly be asked about khinkali.
 */
export declare function drawTest(avoid?: readonly string[], category?: TestCategory): DumbQuestion[];
/** Where a score lands. Playful — the game is a joke about itself. */
export declare function band(correct: number, total: number): {
    title: string;
    note: string;
};
/**
 * The category an attempt belongs to, worked out from the questions themselves.
 *
 * This is deliberately not taken from the client. A submission claiming to be
 * from სხვა განზომილება while answering the classic twelve would otherwise land
 * on the wrong board, and the per-category boards would mean nothing. The
 * questions are the evidence; a run whose questions span categories is mixed,
 * which is exactly what a mixed draw looks like.
 */
export declare function categoryOf(questionIds: readonly string[]): TestCategory;
//# sourceMappingURL=dumbBank.d.ts.map