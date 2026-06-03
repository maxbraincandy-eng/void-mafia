import type { DailyChallenge } from '../types/index.js';
interface ChallengeCheck {
    id: string;
    description: string;
    xpReward: number;
    targetCount: number;
    check: (won: boolean, role: string | null, dayReached: number, team: string | null) => boolean;
}
export declare function getTodayChallenge(): Omit<ChallengeCheck, 'check'>;
export declare function checkAndAwardChallenge(profileId: string, won: boolean, role: string | null, dayReached: number, team: string | null): Promise<boolean>;
export declare function getDailyChallengeForPlayer(profileId: string): Promise<DailyChallenge>;
export {};
//# sourceMappingURL=challengeService.d.ts.map