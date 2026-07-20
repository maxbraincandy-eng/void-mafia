// ჯაშუში (Spyfall) — client mirrors of server/src/services/spyfallService.ts.
export type SpyfallStatus = 'waiting' | 'play' | 'voting' | 'reveal' | 'finished';
export type SpyfallOutcome = 'spy_caught' | 'spy_escaped' | 'wrong_accused' | 'spy_guessed' | 'spy_wrong';

export interface SpyfallPublicPlayer {
  userId: string; socketId: string; nickname: string; seat: number; connected: boolean; score: number; hasVoted: boolean;
}

export interface SpyfallReveal {
  spyId: string;
  spyName: string;
  location: string;
  locationEmoji: string;
  outcome: SpyfallOutcome;
  accusedName: string | null;
  guessedLocation: string | null;
  votes: { nickname: string; targetName: string }[];
}

export interface SpyfallPublicState {
  id: string; code: string; status: SpyfallStatus; hostId: string; maxPlayers: number;
  players: SpyfallPublicPlayer[];
  settings: { rounds: number; discussSeconds: number };
  round: number;
  endsAt: number;
  locations: { name: string; emoji: string }[];
  amSpy: boolean;
  myLocation: string | null;
  myLocationEmoji: string | null;
  myRole: string | null;
  myVote: string | null;
  reveal: SpyfallReveal | null;
  winnerIds: string[];
  dissolved: boolean;
  myUserId: string;
}

export interface SpyfallListItem { id: string; code: string; hostName: string; playerCount: number; maxPlayers: number; status: SpyfallStatus }
