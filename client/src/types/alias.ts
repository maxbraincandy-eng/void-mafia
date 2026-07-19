// ალიასი — client mirrors of server/src/services/aliasService.ts.
export type AliasStatus = 'waiting' | 'play' | 'finished';

export interface AliasPublicPlayer { userId: string; nickname: string; seat: number; connected: boolean; team: 0 | 1 }

export interface AliasPublicState {
  id: string;
  code: string;
  status: AliasStatus;
  hostId: string;
  maxPlayers: number;
  players: AliasPublicPlayer[];
  settings: { targetScore: number; roundSeconds: number };
  scores: [number, number];
  activeTeam: 0 | 1;
  turn: { team: 0 | 1; describerId: string; describerName: string; endsAt: number; correct: number; skipped: number } | null;
  nextDescriberId: string | null;
  lastTurnLog: { word: string; got: boolean }[] | null;
  myWord: string | null;
  amDescriber: boolean;
  myTeam: 0 | 1 | null;
  winner: 0 | 1 | null;
  dissolved: boolean;
  myUserId: string;
  round: number;
}

export interface AliasListItem { id: string; code: string; hostName: string; playerCount: number; maxPlayers: number; status: AliasStatus }
export interface AliasGuess { nickname: string; team: 0 | 1; text: string; ts: number }
