import { PlayerProfile, PlayerProfilePublic, BanRecord, MuteRecord, Warning } from '../types/index.js';
export declare function getOrCreatePlayer(uid: string, username: string): PlayerProfile;
export declare function getPlayer(uid: string): PlayerProfile | null;
export declare function getAllPlayers(): PlayerProfile[];
export declare function toPublicProfile(p: PlayerProfile): PlayerProfilePublic;
export declare function addGameResult(uid: string, won: boolean): void;
export declare function getActiveBan(uid: string): BanRecord | null;
export declare function getActiveMute(uid: string): MuteRecord | null;
export declare function setBan(uid: string, record: BanRecord): void;
export declare function clearBan(uid: string): void;
export declare function setMute(uid: string, record: MuteRecord): void;
export declare function clearMute(uid: string): void;
export declare function addWarning(uid: string, warning: Warning): void;
export declare function findSocketByProfile(io: import('socket.io').Server, profileId: string): import('socket.io').Socket | null;
//# sourceMappingURL=playerService.d.ts.map