export type PieceColor = 'red' | 'black';
export type MatchStatus = 'waiting' | 'active' | 'finished';
export interface CheckersPiece {
    color: PieceColor;
    king: boolean;
}
export type CheckersBoard = (CheckersPiece | null)[][];
export interface CheckersChatMsg {
    senderId: string;
    senderName: string;
    text: string;
    ts: number;
}
export interface CheckersParticipant {
    socketId: string;
    name: string;
    profileId: string | null;
}
export interface CheckersMatch {
    id: string;
    code: string;
    status: MatchStatus;
    red: CheckersParticipant;
    black: CheckersParticipant | null;
    currentTurn: PieceColor;
    board: CheckersBoard;
    capturedByRed: number;
    capturedByBlack: number;
    winnerColor: PieceColor | null;
    createdAt: number;
    updatedAt: number;
    settings: {
        forcedCapture: boolean;
        allowSpectators: boolean;
    };
    chat: CheckersChatMsg[];
    spectatorSocketIds: string[];
    mustContinueFrom: {
        row: number;
        col: number;
    } | null;
}
export interface MoveOption {
    to: {
        row: number;
        col: number;
    };
    capture: {
        row: number;
        col: number;
    } | null;
}
export type MoveResult = {
    ok: true;
    board: CheckersBoard;
    captured: {
        row: number;
        col: number;
    } | null;
    promoted: boolean;
    mustContinueFrom: {
        row: number;
        col: number;
    } | null;
    winnerColor: PieceColor | null;
} | {
    ok: false;
    error: string;
};
export declare function initBoard(): CheckersBoard;
export declare function getValidMovesForPiece(board: CheckersBoard, r: number, c: number, forcedCapture: boolean, mustContinueFrom: {
    row: number;
    col: number;
} | null): MoveOption[];
export declare function applyMove(match: CheckersMatch, fromRow: number, fromCol: number, toRow: number, toCol: number): MoveResult;
export declare function createMatch(red: CheckersParticipant, settings: {
    forcedCapture: boolean;
    allowSpectators: boolean;
}): CheckersMatch;
export declare function getMatch(id: string): CheckersMatch | undefined;
export declare function getMatchByCode(code: string): CheckersMatch | undefined;
export declare function deleteMatch(id: string): void;
export declare function getOpenMatches(): CheckersMatch[];
export declare function getMatchForSocket(socketId: string): CheckersMatch | undefined;
export declare function finishMatch(match: CheckersMatch, winner: PieceColor | null): void;
//# sourceMappingURL=checkersService.d.ts.map