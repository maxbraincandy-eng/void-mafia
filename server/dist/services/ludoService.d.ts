/**
 * Ludo game service — 2-player (Red vs Blue), 4 pieces each.
 * Turn flow: roll dice → pick piece to move → capture → win check.
 * Rolling 6 grants an extra roll (up to 3 consecutive 6s before forfeit).
 */
export type LudoColor = 'red' | 'blue';
export declare const WIN_POS = 57;
export declare const SAFE_ABS: Set<number>;
export declare const TRACK_CELLS: [number, number][];
export declare const RED_HOME_CELLS: [number, number][];
export declare const BLUE_HOME_CELLS: [number, number][];
export declare const RED_YARD_CELLS: [number, number][];
export declare const BLUE_YARD_CELLS: [number, number][];
export declare const CENTER_CELL: [number, number];
export interface LudoPiece {
    id: number;
    pos: number;
}
export interface LudoSide {
    name: string;
    profileId: string | null;
    socketId: string;
    pieces: LudoPiece[];
}
export interface LudoChatMsg {
    id: string;
    name: string;
    text: string;
    t: number;
}
export interface LudoMatch {
    id: string;
    code: string;
    status: 'waiting' | 'active' | 'finished';
    red: LudoSide;
    blue: LudoSide | null;
    currentTurn: LudoColor;
    diceRoll: number | null;
    diceRolled: boolean;
    movablePieceIds: number[];
    consecutiveSixes: number;
    winnerColor: LudoColor | null;
    chat: LudoChatMsg[];
    spectatorSocketIds: string[];
    createdAt: number;
}
export declare function createMatch(player: {
    socketId: string;
    name: string;
    profileId: string | null;
}): LudoMatch;
export declare function getMatch(id: string): LudoMatch | null;
export declare function getMatchByCode(code: string): LudoMatch | null;
export declare function getMatchForSocket(socketId: string): LudoMatch | null;
export declare function getOpenMatches(): LudoMatch[];
export declare function joinMatch(matchId: string, player: {
    socketId: string;
    name: string;
    profileId: string | null;
}): {
    role: 'blue' | 'spectator';
    match: LudoMatch;
};
export interface RollResult {
    roll: number;
    movablePieceIds: number[];
    autoEnded: boolean;
}
export declare function doRoll(matchId: string, socketId: string): RollResult;
export interface MoveResult {
    captured: boolean;
    capturedColor: LudoColor | null;
    capturedPieceId: number | null;
    reached: boolean;
    turnEnded: boolean;
    winnerColor: LudoColor | null;
}
export declare function doMove(matchId: string, socketId: string, pieceId: number): MoveResult;
export declare function doResign(matchId: string, socketId: string): LudoColor;
export declare function doRematch(matchId: string, socketId: string): LudoMatch;
export declare function doLeave(socketId: string): {
    match: LudoMatch | null;
    wasPlayer: boolean;
};
export declare function addChat(matchId: string, socketId: string, text: string): LudoChatMsg;
export declare function cleanupSocket(socketId: string): LudoMatch | null;
//# sourceMappingURL=ludoService.d.ts.map