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

export interface CheckersMatchPublic {
  id: string;
  code: string;
  status: MatchStatus;
  red: { name: string; profileId: string | null };
  black: { name: string; profileId: string | null } | null;
  currentTurn: PieceColor;
  board: CheckersBoard;
  capturedByRed: number;
  capturedByBlack: number;
  winnerColor: PieceColor | null;
  settings: { forcedCapture: boolean; allowSpectators: boolean };
  chat: CheckersChatMsg[];
  spectatorCount: number;
  mustContinueFrom: { row: number; col: number } | null;
  myColor: PieceColor | 'spectator' | null;
}

export interface CheckersMatchListItem {
  id: string;
  code: string;
  status: MatchStatus;
  redName: string;
  blackName: string | null;
  currentTurn: PieceColor;
  spectatorCount: number;
  createdAt: number;
}

export interface MoveOption {
  to: { row: number; col: number };
  capture: { row: number; col: number } | null;
}
