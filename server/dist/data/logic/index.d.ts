import type { LogicQuestion, LogicLevel, LogicCategory } from './types.js';
export * from './types.js';
export declare const ALL_QUESTIONS: LogicQuestion[];
export declare const BY_LEVEL: Record<LogicLevel, LogicQuestion[]>;
export declare function getQuestion(id: string): LogicQuestion | undefined;
export declare function countBy(level?: LogicLevel, cat?: LogicCategory): number;
/**
 * Structural check, run once at import in development. A bank this size is
 * edited by hand, and a duplicate id or an out-of-range answer key would show
 * up as a mysteriously unanswerable question rather than a crash.
 */
export declare function validateBank(): string[];
//# sourceMappingURL=index.d.ts.map