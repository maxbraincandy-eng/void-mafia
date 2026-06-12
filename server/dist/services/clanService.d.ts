export interface Clan {
    id: string;
    name: string;
    tag: string;
    ownerId: string;
    description: string;
    wins: number;
    losses: number;
    createdAt: number;
    memberCount: number;
    imageUrl: string;
}
export type ClanRole = 'owner' | 'admin' | 'moderator' | 'member';
export interface ClanMember {
    playerId: string;
    username: string;
    avatar: string;
    role: ClanRole;
    joinedAt: number;
}
export declare function setClanImage(clanId: string, requesterId: string, imageData: string): Promise<void>;
export declare function createClan(ownerId: string, name: string, tag: string, description: string): Promise<Clan>;
export declare function getClan(id: string): Promise<Clan | null>;
export declare function getClanByPlayer(playerId: string): Promise<Clan | null>;
export interface ClanMembership {
    id: string;
    name: string;
    tag: string;
    memberRole: ClanRole;
    joinedAt: number;
    wins: number;
    losses: number;
    memberCount: number;
}
export declare function getClanMembershipByPlayer(playerId: string): Promise<ClanMembership | null>;
export declare function getAllClans(): Promise<Clan[]>;
export declare function getClanMembers(clanId: string): Promise<ClanMember[]>;
export declare function joinClan(playerId: string, clanId: string): Promise<void>;
export declare function leaveClan(playerId: string): Promise<void>;
export declare function setClanMemberRole(actorId: string, targetId: string, newRole: ClanRole): Promise<void>;
export interface ClanModLog {
    id: string;
    clanId: string;
    modId: string;
    modName: string;
    targetId: string;
    targetName: string;
    action: string;
    reason: string;
    roomId: string | null;
    createdAt: number;
}
export declare function addClanModLog(clanId: string, modId: string, modName: string, targetId: string, targetName: string, action: string, reason: string, roomId: string | null): Promise<void>;
export declare function getClanModLogs(clanId: string, limit?: number): Promise<ClanModLog[]>;
export declare function updateClanStats(clanId: string, won: boolean): Promise<void>;
//# sourceMappingURL=clanService.d.ts.map