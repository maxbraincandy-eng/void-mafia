import type { DailyChallenge } from '../types/index.js';
interface ChallengeCheck {
    id: string;
    description: string;
    xpReward: number;
    targetCount: number;
    check: (won: boolean, role: string | null, dayReached: number, team: string | null) => boolean;
}
export declare function getTodayChallenge(): Omit<ChallengeCheck, 'check'>;
/**
 * Checks if the player satisfies today's challenge and records a completion if so.
 * Returns true if a new completion was recorded (challenge bonus should be awarded).
 */
export declare function checkAndAwardChallenge(profileId: string, won: boolean, role: string | null, dayReached: number, team: string | null): boolean;
export declare function getDailyChallengeForPlayer(profileId: string): DailyChallenge;
export {};
//# sourceMappingURL=challengeService.d.ts.map