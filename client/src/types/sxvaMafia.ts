export type XmRole = 'don' | 'mafia' | 'sheriff' | 'citizen';
export type XmPhase = 'lobby' | 'assign' | 'mafia_meet' | 'night' | 'day_announce' | 'speech' | 'vote' | 'last_words' | 'finished';
export type XmWinner = 'town' | 'mafia' | null;

export interface XmSafeSeat {
  userId: string; socketId: string; nickname: string; seat: number; connected: boolean;
  alive: boolean; fouls: number; eliminatedBy: 'vote' | 'mafia' | 'fouls' | null;
  role: XmRole | null;
  isSpeaking: boolean;
  isNominated: boolean;
}

export interface XmAnnounce {
  round: number;
  killedUserId: string | null;
  killedName: string | null;
}

export interface XmSafeState {
  id: string;
  code: string;
  phase: XmPhase;
  hostId: string; hostName: string; hostSocketId: string; hostConnected: boolean;
  maxSeats: number;
  seats: XmSafeSeat[];
  spectatorCount: number;
  settings: { speechSeconds: number; nightSeconds: number; voteSeconds: number; lastWordsSeconds: number };
  round: number;
  amHost: boolean;
  amSpectator: boolean;
  mySeat: number | null;
  myRole: XmRole | null;
  myAlive: boolean;
  myFouls: number;
  mateIds: string[];
  speakingUserId: string | null;
  speechEndsAt: number;
  speechIdx: number;
  speechTotal: number;
  nominations: { userId: string; nickname: string; seat: number }[];
  iNominated: boolean;
  nightEndsAt: number;
  iActedTonight: boolean;
  nightPrivate: string | null;
  announce: XmAnnounce | null;
  voteEndsAt: number;
  myVote: string | null;
  voteTally: Record<string, number>;
  voteResult: { eliminatedUserId: string | null; tally: Record<string, number> } | null;
  lastWordsUserId: string | null;
  lastWordsName: string | null;
  lastWordsEndsAt: number;
  winner: XmWinner;
  reveal: { userId: string; nickname: string; seat: number; role: XmRole }[] | null;
  dissolved: boolean;
  myUserId: string;
}

export interface XmListItem {
  id: string; code: string; hostName: string; seatCount: number; maxSeats: number; phase: XmPhase;
}

export const XM_ROLE_META: Record<XmRole, { label: string; emoji: string; team: 'mafia' | 'town'; color: string }> = {
  don:     { label: 'დონი',        emoji: '🎩', team: 'mafia', color: '#ff4d5e' },
  mafia:   { label: 'მაფია',       emoji: '🔫', team: 'mafia', color: '#ff6b6b' },
  sheriff: { label: 'შერიფი',      emoji: '🔎', team: 'town',  color: '#4fb8ff' },
  citizen: { label: 'მშვიდობიანი', emoji: '🧑', team: 'town',  color: '#7fe0a0' },
};
