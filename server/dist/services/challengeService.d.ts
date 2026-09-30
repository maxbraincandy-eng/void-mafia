import type { DailyChallenge } from '../types/index.js';
interface ChallengeCheck {
    id: string;
    description: string;
    xpReward: number;
    targetCount: number;
    check: (won: boolean, role: string | null, dayReached: number, team: string | null) => boolean;
}
export declare const VOLUME_QUEST: ChallengeCheck;
export declare function todayKey(): string;
export declare function getTodayChallenge(): Omit<ChallengeCheck, 'check'>;
export declare const stepId: (id: string, n: number) => string;
/** Escaped for LIKE, so `play_3` matches only itself and its steps. */
export declare const stepPattern: (id: string) => string;
export declare function getDailyQuestsForPlayer(profileId: string): Promise<DailyChallenge[]>;
export declare function checkAndAwardChallenges(profileId: string, won: boolean, role: string | null, dayReached: number, team: string | null): Promise<{
    totalBonus: number;
    anyCompleted: boolean;
}>;
export declare function checkAndAwardChallenge(profileId: string, won: boolean, role: string | null, dayReached: number, team: string | null): Promise<boolean>;
export declare function getDailyChallengeForPlayer(profileId: string): Promise<DailyChallenge>;
export {};
//# sourceMappingURL=challengeService.d.ts.map