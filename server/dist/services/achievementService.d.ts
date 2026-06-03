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
export declare function getPlayerAchievements(playerId: string): Promise<PlayerAchievement[]>;
export declare function checkAchievements(room: Room, playerId: string): Promise<string[]>;
//# sourceMappingURL=achievementService.d.ts.map