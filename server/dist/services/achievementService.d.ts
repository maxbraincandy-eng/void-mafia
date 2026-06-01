import { Room } from '../types/index.js';
export interface AchievementDef {
    key: string;
    name: string;
    description: string;
    icon: string;
    rarity: string;
}
export interface PlayerAchievement {
    key: string;
    name: string;
    description: string;
    icon: string;
    rarity: string;
    earnedAt: number;
}
export declare function getPlayerAchievements(playerId: string): PlayerAchievement[];
/** Check and award achievements after a game ends. Returns list of newly earned keys. */
export declare function checkAchievements(room: Room, playerId: string): string[];
//# sourceMappingURL=achievementService.d.ts.map