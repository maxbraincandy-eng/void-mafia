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

// Player info includes socketId so each client can self-identify its own color.
export interface CheckersPlayerInfo {
  name: string;
  profileId: string | null;
  socketId: string;
}

export interface CheckersMatchPublic {
  id: string;
  code: string;
  status: MatchStatus;
  red: CheckersPlayerInfo;
  black: CheckersPlayerInfo | null;
  currentTurn: PieceColor;
  board: CheckersBoard;
  capturedByRed: number;
  capturedByBlack: number;
  winnerColor: PieceColor | null;
  settings: { forcedCapture: boolean; allowSpectators: boolean };
  chat: CheckersChatMsg[];
  spectatorCount: number;
  mustContinueFrom: { row: number; col: number } | null;
  // myColor is injected client-side (not from server) based on socket.id comparison.
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
