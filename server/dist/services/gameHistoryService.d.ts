import { Room } from '../types/index.js';
export interface PlayerRoleStats {
    byTeam: {
        team: string;
        games: number;
        wins: number;
        survived: number;
    }[];
    byRole: {
        role: string;
        games: number;
        wins: number;
        survived: number;
    }[];
    totalGames: number;
    totalSurvived: number;
    firstGameAt: number | null;
    lastGameAt: number | null;
}
export declare function getPlayerRoleStats(playerId: string): Promise<PlayerRoleStats>;
export declare function recordGame(room: Room): Promise<string>;
export interface GameHistoryEntry {
    id: string;
    roomCode: string;
    startedAt: number;
    endedAt: number;
    winner: string | null;
    dayReached: number;
    playerCount: number;
    myRole: string | null;
    myTeam: string | null;
    won: boolean;
}
export declare function getPlayersLastRoles(profileIds: string[], limit?: number): Promise<Record<string, Array<{
    role: string;
    team: string;
    won: boolean;
}>>>;
export declare function getPlayerHistory(playerId: string, limit?: number): Promise<GameHistoryEntry[]>;
//# sourceMappingURL=gameHistoryService.d.ts.map