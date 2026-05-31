import { Room, Player, Phase, GameOverResult } from '../types/index.js';
export declare function startGame(room: Room): void;
export declare function setPhase(room: Room, phase: Phase): void;
export declare function advancePhase(room: Room): Phase;
export declare function resolveNight(room: Room): void;
export declare function submitNightAction(room: Room, actor: Player, targetId: string): void;
export declare function getInvestigationResult(room: Room, actor: Player): {
    targetId: string;
    targetName: string;
    result: 'suspicious' | 'not_suspicious';
} | null;
export declare function getTrackResult(room: Room, actor: Player): {
    trackedName: string;
    visitedName: string | null;
} | null;
export declare function submitVote(room: Room, voter: Player, targetId: string | null): void;
export declare function resolveVotes(room: Room): string | null;
export declare function checkWin(room: Room): boolean;
export declare function buildGameOverResult(room: Room): GameOverResult;
export declare function allNightActionsSubmitted(room: Room): boolean;
//# sourceMappingURL=gameService.d.ts.map