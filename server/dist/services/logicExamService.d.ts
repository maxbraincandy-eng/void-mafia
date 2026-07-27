import { type LogicLevel } from '../data/logic/index.js';
/** Paper composition: 25 questions, weighted toward the middle. */
export declare const EXAM_PLAN: Array<[LogicLevel, number]>;
export declare const EXAM_TOTAL: number;
/** One pooled clock for the whole paper. */
export declare const EXAM_MS: number;
export declare const RETAKE_MS: number;
interface ExamQuestion {
    qid: string;
    order: number[];
    correctPos: number;
    chosen?: number;
    correct?: boolean;
}
interface ExamSession {
    id: string;
    userId: string;
    questions: ExamQuestion[];
    idx: number;
    startedAt: number;
    endsAt: number;
    finished: boolean;
}
export interface ExamStatus {
    canSit: boolean;
    /** ms until the next sitting is allowed (0 when it is allowed now) */
    waitMs: number;
    lastAt: number | null;
    lastScore: number | null;
    best: {
        score: number;
        correct: number;
        total: number;
        at: number;
    } | null;
    attempts: number;
    totalQuestions: number;
    examMs: number;
}
export declare function examStatus(userId: string): Promise<ExamStatus>;
export declare function startExam(userId: string): Promise<{
    view: any;
} | {
    error: string;
}>;
export declare function getExam(id: string): ExamSession | null;
export declare function examView(s: ExamSession): {
    examId: string;
    index: number;
    total: number;
    /** the ONLY clock: milliseconds left for the whole paper */
    endsAt: number;
    answered: number;
    question: {
        title: string;
        body: string;
        q: string;
        options: string[];
        level: LogicLevel;
        cat: import("../data/logic/types.js").LogicCategory;
    } | null;
};
/** Record an answer. No feedback comes back — this is an exam. */
export declare function answerExam(examId: string, userId: string, chosen: number): {
    done: boolean;
    next: any;
} | null;
export interface ExamResult {
    score: number;
    correct: number;
    total: number;
    answered: number;
    timedOut: boolean;
    durationMs: number;
    grade: string;
    byLevel: Record<string, {
        correct: number;
        total: number;
    }>;
    best: boolean;
    coins: number;
    nextSittingAt: number;
    review: Array<{
        title: string;
        body: string;
        q: string;
        options: string[];
        correctPos: number;
        chosen: number;
        rule: string;
        why: string;
        trap: string | null;
        level: string;
        cat: string;
    }>;
}
export declare function finishExam(examId: string, userId: string): Promise<ExamResult | null>;
export interface ExamBoardRow {
    rank: number;
    userId: string;
    username: string;
    avatar: string;
    avatarUrl: string | null;
    country: string | null;
    score: number;
    correct: number;
    total: number;
    durationMs: number;
    at: number;
}
export declare function examLeaderboard(scope: 'all' | 'week' | 'country', userId: string, limit?: number): Promise<ExamBoardRow[]>;
export {};
//# sourceMappingURL=logicExamService.d.ts.map