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
 */
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
}
/** What the client is allowed to see: the question, minus the answer. */
export interface PublicQuestion {
    id: string;
    text: string;
    options: DumbOption[];
}
export declare const BANK: readonly DumbQuestion[];
/** The bank, minus the answers. */
export declare function publicOf(q: DumbQuestion): PublicQuestion;
export declare function byId(id: string): DumbQuestion | undefined;
export declare const QUESTIONS_PER_TEST = 12;
/**
 * Draw a test.
 *
 * `avoid` holds the questions this player has just seen. They are excluded
 * while there are enough others — sixty in the bank against twelve per test
 * means two runs back to back share nothing, which is the whole reason the bank
 * is this size. When the exclusions would leave too few, the rule is dropped
 * rather than returning a short test: a repeat is a small disappointment and a
 * nine-question test is a bug.
 */
export declare function drawTest(avoid?: readonly string[]): DumbQuestion[];
/** Where a score lands. Playful — the game is a joke about itself. */
export declare function band(correct: number, total: number): {
    title: string;
    note: string;
};
//# sourceMappingURL=dumbBank.d.ts.map