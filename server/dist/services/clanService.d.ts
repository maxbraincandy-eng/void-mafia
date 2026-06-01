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
export declare function createClan(ownerId: string, name: string, tag: string, description: string): Clan;
export declare function getClan(id: string): Clan | null;
export declare function getClanByPlayer(playerId: string): Clan | null;
export declare function getAllClans(): Clan[];
export declare function getClanMembers(clanId: string): ClanMember[];
export declare function joinClan(playerId: string, clanId: string): void;
export declare function leaveClan(playerId: string): void;
export declare function updateClanStats(clanId: string, won: boolean): void;
//# sourceMappingURL=clanService.d.ts.map