import type { IQScoreResult } from './iqScoring.js';
export declare const IQ_COOLDOWN_MS: number;
/**
 * One-time reconciliation: earlier builds over-flagged legitimate attempts as
 * unverified (too-strict anti-cheat). Re-evaluate stored unverified attempts
 * against the current lenient time-based rules and rescue the genuine ones so
 * they appear on the leaderboard without a retake. Idempotent — safe every boot.
 * Tab-switch flags can't be recomputed (count isn't stored), so those stay.
 */
export declare function reconcileVerification(): Promise<number>;
export declare function isModerator(userId: string): Promise<boolean>;
export type IQScope = 'all' | 'global' | 'weekly' | 'monthly' | 'friends' | 'clan';
export interface IQLeaderRow {
    rank: number;
    userId: string;
    username: string;
    avatar: string;
    avatarUrl: string | null;
    iq: number;
    percentile: number;
    createdAt: number;
    verified: boolean;
}
export interface IQHistoryEntry {
    id: string;
    iq: number;
    percentile: number;
    band: string;
    correct: number;
    total: number;
    durationMs: number;
    verified: boolean;
    isHighest: boolean;
    createdAt: number;
    domainScores: Record<string, number>;
}
export interface IQMyStatus {
    hasResult: boolean;
    bestIq: number | null;
    bestPercentile: number | null;
    latestIq: number | null;
    latestVerified: boolean;
    latestDate: number | null;
    rank: number | null;
    attempts: number;
    cooldownUntil: number | null;
    history: IQHistoryEntry[];
}
/** How long until this user may retake (0 = available now). Moderators bypass. */
export declare function cooldownRemaining(userId: string, isModerator: boolean): Promise<number>;
/** Persist a scored attempt and maintain the per-user `is_highest` flag. */
export declare function recordAttempt(userId: string, r: IQScoreResult): Promise<{
    id: string;
    isHighest: boolean;
    rank: number | null;
}>;
/** Leaderboard for a scope. `viewerId` is required for friends/clan filters. */
export declare function getLeaderboard(scope: IQScope, viewerId: string | null, limit?: number): Promise<IQLeaderRow[]>;
/** The caller's own full status + private history. */
export declare function getMyStatus(userId: string, isModerator: boolean): Promise<IQMyStatus>;
export interface IQPublicProfile {
    hasResult: boolean;
    bestIq: number | null;
    bestPercentile: number | null;
    band: string | null;
    latestDate: number | null;
    rank: number | null;
    attempts: number;
    history: {
        iq: number;
        verified: boolean;
        createdAt: number;
    }[];
}
/** Public IQ snapshot for another user's profile — no answers exposed. */
export declare function getPublicProfile(userId: string): Promise<IQPublicProfile>;
//# sourceMappingURL=iqService.d.ts.map