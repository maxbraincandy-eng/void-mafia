export type XmRole = 'don' | 'mafia' | 'sheriff' | 'citizen' | 'doctor' | 'maniac' | 'cult';
export type XmPhase =
  | 'lobby' | 'assign' | 'mafia_meet' | 'night' | 'day_announce' | 'speech'
  | 'vote' | 'last_words' | 'finished'
  /* სპორტული მაფია only */
  | 'plan_night'         // the opening night: the mafia agree an order, nobody dies
  | 'tribunal_defense'   // a tied player defends themselves
  | 'tribunal_vote';     // the rest of the town decides: both, or neither
export type XmWinner = 'town' | 'mafia' | 'maniac' | 'cult' | null;

export interface XmSafeSeat {
  userId: string; socketId: string; nickname: string; seat: number; connected: boolean;
  alive: boolean; fouls: number; eliminatedBy: 'vote' | 'mafia' | 'fouls' | null;
  role: XmRole | null;
  isSpeaking: boolean;
  isNominated: boolean;
  hasVoted: boolean;
  cult: boolean;
}

export interface XmAnnounce {
  round: number;
  killed: { userId: string; nickname: string; seat: number }[];
}

export interface XmLogEntry {
  round: number;
  phase: 'night' | 'day' | 'foul' | 'game';
  text: string;
}

export interface XmSafeState {
  id: string;
  code: string;
  phase: XmPhase;
  hostId: string; hostName: string; hostSocketId: string; hostConnected: boolean;
  maxSeats: number;
  seats: XmSafeSeat[];
  spectatorCount: number;
  settings: { speechSeconds: number; nightSeconds: number; voteSeconds: number; lastWordsSeconds: number; floorControl: boolean };
  setup: { don: number; mafia: number; sheriff: number; doctor: number; maniac: number; cult: number; citizen: number };
  roleConfigCustom: boolean;
  round: number;
  amHost: boolean;
  amSpectator: boolean;
  mySeat: number | null;
  myRole: XmRole | null;
  myAlive: boolean;
  myFouls: number;
  myCult: boolean;
  healBlockedId: string | null;
  mateIds: string[];
  cards: { index: number; claimedById: string | null; claimedByName: string | null; claimedBySeat: number | null }[];
  myCardIndex: number | null;
  introRound: boolean;
  speakingUserId: string | null;
  speechEndsAt: number;
  speechIdx: number;
  speechTotal: number;
  nextSpeaker: { nickname: string; seat: number } | null;
  nominations: { userId: string; nickname: string; seat: number }[];
  iNominated: boolean;
  nightEndsAt: number;
  iActedTonight: boolean;
  nightPrivate: string | null;
  iCheckedTonight: boolean;
  nightAllActed: boolean;
  mafiaPicks: { userId: string; nickname: string; targetId: string; targetName: string }[];
  announce: XmAnnounce | null;
  voteEndsAt: number;
  voteRevote: boolean;
  voteCandidate: { userId: string; nickname: string; seat: number } | null;
  voteIdx: number;
  voteTotal: number;
  voteIsLast: boolean;
  myVote: string | null;
  voteTally: Record<string, number>;
  voteResult: { eliminatedUserId: string | null; tally: Record<string, number> } | null;
  lastWordsUserId: string | null;
  lastWordsName: string | null;
  lastWordsEndsAt: number;
  floorGrabUserId: string | null;
  floorGrabUntil: number;
  log: XmLogEntry[];
  winner: XmWinner;
  reveal: { userId: string; nickname: string; seat: number; role: XmRole }[] | null;
  dissolved: boolean;
  myUserId: string;

  // ── სპორტული მაფია ────────────────────────────────────────────────────────
  /** Playing the tournament ruleset: blind shooting, a clean don, tribunals. */
  sport: boolean;
  /** Host asked for it in the lobby; only honoured at ten seats. */
  sportRequested: boolean;
  /** Why it cannot start yet, in Georgian. Null when it can. */
  sportBlockedReason: string | null;
  tribunal: XmTribunal | null;
}

export interface XmTribunal {
  onTrial: { userId: string; nickname: string; seat: number }[];
  defenseIdx: number;
  defenseEndsAt: number;
  speakingUserId: string | null;
  endsAt: number;
  iAmOnTrial: boolean;
  canVote: boolean;
  myVerdict: 'punish' | 'free' | null;
  votesCast: number;
  votesTotal: number;
  verdict: 'punish' | 'free' | null;
  /** Only once it is over — a live count would turn a verdict into arithmetic. */
  tally: { punish: number; free: number } | null;
}

export interface XmListItem {
  id: string; code: string; hostName: string; seatCount: number; maxSeats: number; phase: XmPhase;
}

export type XmTeam = 'mafia' | 'town' | 'maniac' | 'cult';

export const XM_ROLE_META: Record<XmRole, {
  label: string; emoji: string; team: XmTeam; color: string; night: string | null;
}> = {
  don:     { label: 'დონი',        emoji: '🎩', team: 'mafia',  color: '#ff4d5e', night: 'შეამოწმე — შერიფია?' },
  mafia:   { label: 'მაფია',       emoji: '🔫', team: 'mafia',  color: '#ff6b6b', night: 'აირჩიე მსხვერპლი' },
  sheriff: { label: 'შერიფი',      emoji: '🔎', team: 'town',   color: '#4fb8ff', night: 'შეამოწმე — მაფიაა?' },
  citizen: { label: 'მშვიდობიანი', emoji: '🧑', team: 'town',   color: '#7fe0a0', night: null },
  doctor:  { label: 'ექიმი',       emoji: '💉', team: 'town',   color: '#5ee6c0', night: 'ვის გადაარჩენ ამაღამ?' },
  maniac:  { label: 'მანიაკი',     emoji: '🔪', team: 'maniac', color: '#ff9f1c', night: 'აირჩიე მსხვერპლი' },
  cult:    { label: 'კულტის ლიდერი', emoji: '🕯', team: 'cult', color: '#c084fc', night: 'ვის მოიმხრობ?' },
};

/**
 * `of` is the genitive, and it is a separate field on purpose.
 *
 * Georgian does not build it by adding a suffix to the nominative — ქალაქი
 * becomes ქალაქის, მაფია becomes მაფიის — so `label + 'ის'` produces ქალაქიის,
 * which is not a word. Anywhere the team is possessive ("the city's side"),
 * this is the string to use.
 */
export const XM_TEAM_META: Record<XmTeam, { label: string; of: string; emoji: string; color: string }> = {
  town:   { label: 'ქალაქი',   of: 'ქალაქის',  emoji: '🏙', color: '#7fe0a0' },
  mafia:  { label: 'მაფია',    of: 'მაფიის',   emoji: '🔫', color: '#ff4d5e' },
  maniac: { label: 'მანიაკი',  of: 'მანიაკის', emoji: '🔪', color: '#ff9f1c' },
  cult:   { label: 'კულტი',    of: 'კულტის',   emoji: '🕯', color: '#c084fc' },
};
