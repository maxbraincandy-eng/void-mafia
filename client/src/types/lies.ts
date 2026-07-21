export type LiesStatus = 'waiting' | 'writing' | 'guessing' | 'reveal' | 'finished';

export interface LiesRevealEntry {
  optionId: string;
  text: string;
  isTruth: boolean;
  authorNames: string[];
  pickedBy: { userId: string; nickname: string }[];
}

export interface LiesReveal {
  prompt: string;
  truth: string;
  category: string;
  entries: LiesRevealEntry[];
  deltas: { userId: string; nickname: string; delta: number }[];
}

export interface LiesPublicState {
  id: string;
  code: string;
  status: LiesStatus;
  hostId: string;
  maxPlayers: number;
  players: { userId: string; socketId: string; nickname: string; seat: number; connected: boolean; score: number; done: boolean }[];
  settings: { rounds: number; writeSeconds: number; guessSeconds: number };
  round: number;
  prompt: string | null;
  category: string | null;
  endsAt: number;
  myBluff: string | null;
  bluffRejected: boolean;
  options: { id: string; text: string; mine: boolean }[] | null;
  myGuess: string | null;
  reveal: LiesReveal | null;
  winnerIds: string[];
  dissolved: boolean;
  myUserId: string;
}

export interface LiesListItem {
  id: string; code: string; hostName: string; playerCount: number; maxPlayers: number; status: LiesStatus;
}

export type LiesBluffResult = 'ok' | 'rejected_truth' | 'invalid';
