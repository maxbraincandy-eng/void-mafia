export type LudoColor = 'red' | 'blue' | 'green' | 'yellow';
export type LudoStatus = 'waiting' | 'active' | 'finished';

export interface LudoPiece {
  id: number;   // 0-3
  pos: number;  // -1=yard, 0-51=track(relative), 52-56=home col, 57=WIN
}

export interface LudoPlayerInfo {
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

export interface LudoMatchPublic {
  id: string;
  code: string;
  status: LudoStatus;
  maxPlayers: 2 | 3 | 4;
  players: {
    red: LudoPlayerInfo;
    blue: LudoPlayerInfo | null;
    green: LudoPlayerInfo | null;
    yellow: LudoPlayerInfo | null;
  };
  playerOrder: LudoColor[];
  currentTurn: LudoColor;
  diceRoll: number | null;
  diceRolled: boolean;
  movablePieceIds: number[];
  consecutiveSixes: number;
  winnerColor: LudoColor | null;
  chat: LudoChatMsg[];
  spectatorCount: number;
  // Injected client-side:
  myColor: LudoColor | 'spectator' | null;
}

export interface LudoMatchListItem {
  id: string;
  code: string;
  status: LudoStatus;
  playerCount: number;
  maxPlayers: 2 | 3 | 4;
  playerNames: string[];
  spectatorCount: number;
  createdAt: number;
}
