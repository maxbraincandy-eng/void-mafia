// Mirror of server types — keep in sync

export type Phase =
  | 'lobby'
  | 'role_reveal'
  | 'night'
  | 'day'
  | 'speech'
  | 'voting'
  | 'game_over';

export type RoleKey =
  | 'mafia'
  | 'citizen'
  | 'sheriff'
  | 'doctor'
  | 'don'
  | 'maniac'
  | 'jester'
  | 'bodyguard'
  | 'spy'
  | 'escort'
  | 'vigilante';

export type Team = 'mafia' | 'town' | 'neutral';
export type TieRule = 'no_elimination' | 'random';
export type ChatChannel = 'room' | 'mafia' | 'dead';
export type ModeratorLevel = 'moderator' | 'senior_moderator' | 'admin' | 'owner';
export type ReportReason =
  | 'harassment'
  | 'hate_speech'
  | 'cheating'
  | 'spamming'
  | 'inappropriate_nickname'
  | 'inappropriate_chat'
  | 'toxic_behavior'
  | 'other';

export interface Role {
  key: RoleKey;
  name: string;
  team: Team;
  description: string;
  ability: string;
  wakeAtNight: boolean;
  color: string;
  glowColor: string;
}

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface PlayerProfilePublic {
  id: string;
  username: string;
  avatar: string;
  stats: PlayerStats;
  isModerator: boolean;
  moderatorLevel: ModeratorLevel | null;
  moderatorBadgeVisible: boolean;
  moderatorPermissions: string[];
  joinedAt: number;
}

export interface PlayerPublic {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  isAlive: boolean;
  isConnected: boolean;
  isReady: boolean;
  isSpectator: boolean;
  role: RoleKey | null;
  team: Team | null;
  voteTarget: string | null;
  hasActed: boolean;
  seat: number;
  profileId: string | null;
  isModerator: boolean;
  moderatorLevel: ModeratorLevel | null;
}

export interface GameSettings {
  nightDuration: number;
  dayDuration: number;
  voteDuration: number;
  roleRevealDuration: number;
  speechDuration: number;
  allowDoctorSelfHeal: boolean;
  tieVoteRule: TieRule;
  minPlayers: number;
  isPrivate: boolean;
  roles: {
    mafia: number;
    don: number;
    sheriff: number;
    doctor: number;
    maniac: number;
    jester: number;
    bodyguard: number;
    spy: number;
    escort: number;
    vigilante: number;
  };
}

export interface ChatMessage {
  id: string;
  senderId: string | 'system';
  senderName: string;
  text: string;
  timestamp: number;
  channel: ChatChannel;
  isSystem: boolean;
  seat?: number;
  isMod?: boolean;
}

export interface RoomPublic {
  id: string;
  code: string;
  phase: Phase;
  day: number;
  timer: number;
  maxTimer: number;
  players: PlayerPublic[];
  chat: ChatMessage[];
  mafiaChat: ChatMessage[];
  killedLastNight: Array<{ id: string; name: string }>;
  savedLastNight: boolean;
  winner: Team | null;
  settings: GameSettings;
  currentSpeakerId: string | null;
  daySkipVoteCount: number;
  spectatorCount: number;
  isPaused: boolean;
}

export interface RoomListItem {
  id: string;
  code: string;
  playerCount: number;
  phase: Phase;
  createdAt: number;
  hostName: string;
  isPrivate: boolean;
}

export interface NightResult {
  killed: Array<{ id: string; name: string }>;
  saved: boolean;
}

export interface InvestigationResult {
  targetId: string;
  targetName: string;
  result: 'suspicious' | 'not_suspicious';
}

export interface GameOverResult {
  winner: Team;
  allRoles: Record<string, { name: string; role: RoleKey; team: Team }>;
}

export interface Report {
  id: string;
  reporterPlayerId: string;
  reporterName: string;
  reportedPlayerId: string;
  reportedName: string;
  roomId: string | null;
  reason: ReportReason;
  details: string;
  createdAt: number;
  status: 'open' | 'reviewing' | 'resolved' | 'rejected';
  assignedModeratorId: string | null;
  moderatorNotes: string;
}

export interface ModLog {
  id: string;
  actionType: string;
  moderatorId: string;
  moderatorName: string;
  targetPlayerId: string;
  targetName: string;
  roomId: string | null;
  reason: string;
  duration: number | null;
  createdAt: number;
}

// Generic response envelope from server
export type Res<T> = { ok: true; data: T } | { ok: false; error: string };
