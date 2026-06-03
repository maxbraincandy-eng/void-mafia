import { Room } from '../types/index.js';
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
export declare function getPlayerHistory(playerId: string, limit?: number): Promise<GameHistoryEntry[]>;
//# sourceMappingURL=gameHistoryService.d.ts.map