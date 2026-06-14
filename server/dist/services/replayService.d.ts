import type { ReplayEvent, GameReplaySummary, GameReplayFull } from '../types/index.js';
export declare function startReplay(gameId: string, roomName: string, startedAt: number): void;
export declare function recordEvent(gameId: string, event: ReplayEvent): void;
export declare function finishReplay(gameId: string, opts: {
    winner: string;
    endedAt: number;
    playerRoles: Record<string, {
        username: string;
        role: string;
        team: string;
        alive: boolean;
    }>;
}): Promise<void>;
export declare function listReplays(limit: number, offset: number): Promise<GameReplaySummary[]>;
export declare function getReplay(replayId: string): Promise<GameReplayFull | null>;
export declare function getMyReplays(profileId: string): Promise<GameReplaySummary[]>;
//# sourceMappingURL=replayService.d.ts.map