// დახაზე & გამოიცანი — client mirrors of server/src/services/drawService.ts.
export type DrawStatus = 'waiting' | 'choosing' | 'drawing' | 'turnend' | 'finished';
export interface DrawSeg { x0: number; y0: number; x1: number; y1: number; c: string; w: number }

export interface DrawPublicPlayer { userId: string; nickname: string; seat: number; connected: boolean; score: number; guessedThisTurn: boolean }

export interface DrawPublicState {
  id: string; code: string; status: DrawStatus; hostId: string; maxPlayers: number;
  players: DrawPublicPlayer[];
  settings: { rounds: number; drawSeconds: number };
  round: number; totalRounds: number;
  drawerId: string | null; drawerName: string | null;
  amDrawer: boolean;
  myWord: string | null;
  myChoices: string[] | null;
  wordMask: string | null;
  revealedWord: string | null;
  endsAt: number;
  iGuessed: boolean;
  winnerId: string | null;
  myUserId: string;
}

export interface DrawListItem { id: string; code: string; hostName: string; playerCount: number; maxPlayers: number; status: DrawStatus }
export interface DrawChat { system: boolean; nickname: string; text: string; ts: number }
