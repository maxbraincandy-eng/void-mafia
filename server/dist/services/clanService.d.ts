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
}
export interface ClanMember {
    playerId: string;
    username: string;
    avatar: string;
    role: 'owner' | 'officer' | 'member';
    joinedAt: number;
}
export declare function createClan(ownerId: string, name: string, tag: string, description: string): Promise<Clan>;
export declare function getClan(id: string): Promise<Clan | null>;
export declare function getClanByPlayer(playerId: string): Promise<Clan | null>;
export declare function getAllClans(): Promise<Clan[]>;
export declare function getClanMembers(clanId: string): Promise<ClanMember[]>;
export declare function joinClan(playerId: string, clanId: string): Promise<void>;
export declare function leaveClan(playerId: string): Promise<void>;
export declare function updateClanStats(clanId: string, won: boolean): Promise<void>;
//# sourceMappingURL=clanService.d.ts.map