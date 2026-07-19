// Codenames — client mirrors of server/src/services/codenamesService.ts.
export type CnStatus = 'waiting' | 'play' | 'finished';
export type CnColor = 0 | 1 | 2 | 3; // 0/1 team, 2 neutral, 3 assassin

export interface CnPublicPlayer { userId: string; nickname: string; seat: number; connected: boolean; team: 0 | 1; isSpymaster: boolean }
export interface CnPublicCard { word: string; revealed: boolean; color: CnColor | null }
export interface CnLogEntry { kind: 'clue' | 'guess' | 'pass' | 'end'; team: 0 | 1; text: string }

export interface CnPublicState {
  id: string; code: string; status: CnStatus; hostId: string; maxPlayers: number;
  players: CnPublicPlayer[];
  board: CnPublicCard[];
  startingTeam: 0 | 1;
  turnTeam: 0 | 1;
  clue: { word: string; number: number } | null;
  guessesLeft: number;
  remaining: [number, number];
  winner: 0 | 1 | null;
  assassinFired: boolean;
  dissolved: boolean;
  log: CnLogEntry[];
  myTeam: 0 | 1 | null;
  amSpymaster: boolean;
  myUserId: string;
}
export interface CnListItem { id: string; code: string; hostName: string; playerCount: number; maxPlayers: number; status: CnStatus }
