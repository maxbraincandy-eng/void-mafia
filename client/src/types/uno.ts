export type UnoColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';
export type UnoCardType = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';
export type UnoStatus = 'waiting' | 'active' | 'color_choice' | 'finished';
export type GameColor = 'red' | 'blue' | 'green' | 'yellow';

export interface UnoCard {
  id: string;
  color: UnoColor;
  type: UnoCardType;
  value?: number;
}

export interface UnoSettings {
  maxPlayers: number;
  spectatorsAllowed: boolean;
  stackingEnabled: boolean;
  unoPenaltyEnabled: boolean;
}

export interface UnoPlayerPublic {
  userId: string;
  nickname: string;
  socketId: string;
  seat: number;
  connected: boolean;
  calledUno: boolean;
  cardCount: number;
}

export interface UnoChatMsg {
  userId: string;
  nickname: string;
  text: string;
  ts: number;
}

export interface UnoPublicState {
  id: string;
  code: string;
  status: UnoStatus;
  hostId: string;
  players: UnoPlayerPublic[];
  spectatorCount: number;
  settings: UnoSettings;
  topDiscard: UnoCard | null;
  currentColor: GameColor | null;
  currentPlayerId: string | null;
  direction: 1 | -1;
  pendingDrawCount: number;
  deckSize: number;
  winnerId: string | null;
  voiceSessionId: string;
  chat: UnoChatMsg[];
  myHand: UnoCard[];
  myUserId: string;
}

export interface UnoListItem {
  id: string;
  code: string;
  status: UnoStatus;
  playerCount: number;
  maxPlayers: number;
  playerNicknames: string[];
}
