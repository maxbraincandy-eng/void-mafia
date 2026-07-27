import { type LogicLevel, type LogicCategory } from '../data/logic/index.js';
export type LogicMode = 'practice' | 'ranked' | 'daily' | 'test';
export interface SessionQuestion {
    qid: string;
    /** options[i] is the ORIGINAL option index now shown at position i */
    order: number[];
    /** position in `order` that holds the correct answer */
    correctPos: number;
    answeredAt?: number;
    chosen?: number;
    correct?: boolean;
    ms?: number;
}
export interface LogicSession {
    id: string;
    userId: string;
    mode: LogicMode;
    level: LogicLevel | 'mixed';
    questions: SessionQuestion[];
    idx: number;
    startedAt: number;
    questionShownAt: number;
    score: number;
    combo: number;
    bestCombo: number;
    ratingDelta: number;
    finished: boolean;
}
export interface LogicProfile {
    userId: string;
    rating: number;
    peakRating: number;
    answered: number;
    correct: number;
    totalMs: number;
    tests: number;
    streak: number;
    bestStreak: number;
    dailyStreak: number;
    bestDailyStreak: number;
    lastDaily: string | null;
    hardest: string;
    xp: number;
}
export declare function getProfile(userId: string): Promise<LogicProfile>;
export declare function startSession(userId: string, mode: LogicMode, level: LogicLevel | 'mixed', count?: number): Promise<{
    session: LogicSession;
    view: any;
}>;
export declare function getSession(id: string): LogicSession | null;
export declare function sessionView(s: LogicSession): {
    sessionId: string;
    mode: LogicMode;
    index: number;
    total: number;
    score: number;
    combo: number;
    question: {
        title: string;
        body: string;
        q: string;
        options: string[];
        level: LogicLevel;
        cat: LogicCategory;
        seconds: number;
    } | null;
};
export interface AnswerResult {
    correct: boolean;
    correctPos: number;
    chosen: number;
    gained: number;
    combo: number;
    ratingDelta: number;
    rule: string;
    why: string;
    trap: string | null;
    /** withheld in ranked until the session ends */
    explain: boolean;
    done: boolean;
    next: any;
}
export declare function answer(sessionId: string, userId: string, chosen: number, ms: number): Promise<AnswerResult | null>;
export interface FinishResult {
    score: number;
    correct: number;
    total: number;
    ratingBefore: number;
    ratingAfter: number;
    ratingDelta: number;
    accuracy: number;
    avgMs: number;
    bestCombo: number;
    xp: number;
    coins: number;
    achievements: string[];
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
export declare function finish(sessionId: string, userId: string): Promise<FinishResult | null>;
export interface AchievementDef {
    code: string;
    name: string;
    desc: string;
    icon: string;
    test: (p: LogicProfile) => boolean;
}
export declare const ACHIEVEMENTS: AchievementDef[];
export declare function getAchievements(userId: string): Promise<Array<AchievementDef & {
    earned: boolean;
    at: number | null;
}>>;
export type BoardScope = 'world' | 'country' | 'friends' | 'week' | 'month' | 'all';
export interface BoardRow {
    rank: number;
    userId: string;
    username: string;
    avatar: string;
    country: string | null;
    rating: number;
    accuracy: number;
    tests: number;
    score?: number;
}
export declare function leaderboard(scope: BoardScope, userId: string, limit?: number): Promise<BoardRow[]>;
/** World and national placing for the profile screen. */
export declare function myRanks(userId: string): Promise<{
    world: number | null;
    country: number | null;
    countryCode: string | null;
    totalPlayers: number;
}>;
export declare function setCountry(userId: string, code: string): Promise<void>;
/** Has today's challenge already been completed? */
export declare function dailyStatus(userId: string): Promise<{
    done: boolean;
    date: string;
    streak: number;
}>;
/** Per-category accuracy for the stats screen. */
export declare function categoryBreakdown(userId: string): Promise<Array<{
    cat: LogicCategory;
    seen: number;
}>>;
export declare const BANK_SIZE: number;
//# sourceMappingURL=logicService.d.ts.map