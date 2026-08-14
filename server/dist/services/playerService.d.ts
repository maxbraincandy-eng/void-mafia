import { PlayerProfile, PlayerProfilePublic, ModeratorLevel, BanRecord, MuteRecord, Warning, PlayerCosmetics } from '../types/index.js';
export declare function getModPermissions(level: ModeratorLevel | null): string[];
export declare function getPlayerByFriendCode(code: string): Promise<PlayerProfile | null>;
export declare function setGrantedModLevel(uid: string, level: ModeratorLevel | null): Promise<void>;
export declare function registerWithEmail(email: string, password: string, username: string): Promise<PlayerProfile>;
export declare function authenticateWithEmail(email: string, password: string): Promise<PlayerProfile>;
export declare function getOrCreatePlayer(uid: string, username: string): Promise<PlayerProfile>;
export declare function getPlayer(uid: string): Promise<PlayerProfile | null>;
export declare function getPlayerByPublicId(publicId: number): Promise<PlayerProfile | null>;
export declare function getAllPlayers(): Promise<PlayerProfile[]>;
export declare function incrementSpaceKnockouts(profileId: string): Promise<void>;
export interface KnockoutLeader {
    id: string;
    username: string;
    avatar: string;
    avatarUrl: string | null;
    publicId: number | null;
    knockouts: number;
}
export declare function getKnockoutLeaderboard(): Promise<KnockoutLeader[]>;
export declare function getWinsLeaderboard(): Promise<KnockoutLeader[]>;
export declare function getLevelLeaderboard(): Promise<KnockoutLeader[]>;
export declare function getLeaderboard(): Promise<PlayerProfilePublic[]>;
export declare function getPlayersFast(): Promise<PlayerProfilePublic[]>;
export declare function toPublicProfile(p: PlayerProfile): PlayerProfilePublic;
export declare function addGameResult(uid: string, won: boolean): Promise<void>;
export declare function getActiveBan(uid: string): Promise<BanRecord | null>;
export declare function setBan(uid: string, record: BanRecord): Promise<void>;
export declare function clearBan(uid: string): Promise<void>;
export declare function getActiveMute(uid: string): Promise<MuteRecord | null>;
export declare function setMute(uid: string, record: MuteRecord): Promise<void>;
export declare function clearMute(uid: string): Promise<void>;
export declare function getWarnings(uid: string): Promise<Warning[]>;
export declare function addWarning(uid: string, warning: Warning): Promise<void>;
export declare function findSocketByProfile(io: import('socket.io').Server, profileId: string): import('socket.io').Socket | null;
export declare const MAX_LEVEL = 100;
export declare const LEVEL_THRESHOLDS: readonly number[];
export declare function getLevel(xp: number): number;
export declare function addXP(profileId: string, amount: number): Promise<{
    newXP: number;
    newLevel: number;
    leveledUp: boolean;
}>;
export declare function getCosmetics(profileId: string): Promise<PlayerCosmetics>;
export declare function getVerifiedIds(): Promise<string[]>;
/** Drop the cache so a just-promoted owner is badged without waiting out the TTL. */
export declare function invalidateVerifiedCache(): void;
export declare function getNameColors(profileIds: string[]): Promise<Record<string, string>>;
export declare function equipCosmetic(profileId: string, type: 'name_color' | 'frame' | 'title' | 'role_skin' | 'wallpaper' | 'border', itemId: string | null): Promise<PlayerCosmetics>;
export declare function grantStarterCosmetics(profileId: string): Promise<void>;
export declare function updateAvatarUrl(uid: string, url: string | null): Promise<void>;
export declare function updateUsername(uid: string, newName: string): Promise<void>;
//# sourceMappingURL=playerService.d.ts.map