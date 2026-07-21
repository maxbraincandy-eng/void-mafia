/**
 * ტყუილების ოსტატი — question bank.
 *
 * Each prompt has one blank marked "＿＿＿" and a true `answer`. Players invent a
 * fake answer to fill the blank; the goal is a bluff plausible enough to be
 * mistaken for the truth. Answers are short so bluffs read as natural options.
 * The `alt` list holds accepted spellings of the truth so a player who happens
 * to type the real answer as their bluff is caught and asked to try again.
 */
export interface LiesQuestion {
    id: string;
    category: string;
    prompt: string;
    answer: string;
    alt?: string[];
}
export declare const LIES_QUESTIONS: LiesQuestion[];
/** Normalize an answer for comparison (bluff-vs-truth, duplicate merging). */
export declare function normalizeAnswer(s: string): string;
//# sourceMappingURL=liesQuestions.d.ts.map