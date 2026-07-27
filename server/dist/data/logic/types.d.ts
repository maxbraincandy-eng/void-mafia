export type LogicLevel = 'beginner' | 'medium' | 'hard' | 'expert';
export type LogicCategory = 'syllogism' | 'conditional' | 'contradiction' | 'necessity' | 'fallacy' | 'pattern' | 'mafia';
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
    /** Expected solve time in seconds; drives the timer and the speed bonus. */
    seconds: number;
}
export declare const LEVEL_LABEL: Record<LogicLevel, string>;
export declare const LEVEL_COLOR: Record<LogicLevel, string>;
export declare const CAT_LABEL: Record<LogicCategory, string>;
/** Rating weight: a harder question moves the Logic Rating further. */
export declare const LEVEL_WEIGHT: Record<LogicLevel, number>;
/** Nominal difficulty of each level on the rating scale (Elo-style). */
export declare const LEVEL_RATING: Record<LogicLevel, number>;
//# sourceMappingURL=types.d.ts.map