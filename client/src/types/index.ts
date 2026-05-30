// Mirror of server types — keep in sync

export type Phase =
  | 'lobby'
  | 'role_reveal'
  | 'night'
  | 'day'
  | 'voting'
  | 'game_over';

export type RoleKey =
  | 'mafia'
  | 'citizen'
  | 'sheriff'
  | 'doctor'
  | 'don'
  | 'maniac'
  | 'jester';

export type Team = 'mafia' | 'town' | 'neutral';
export type TieRule = 'no_elimination' | 'random';
export type ChatChannel = 'room' | 'mafia' | 'dead';

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

export interface PlayerPublic {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  isAlive: boolean;
  isConnected: boolean;
  isReady: boolean;
  role: RoleKey | null;
  team: Team | null;
  voteTarget: string | null;
  hasActed: boolean;
  seat: number;
}

export interface GameSettings {
  nightDuration: number;
  dayDuration: number;
  voteDuration: number;
  roleRevealDuration: number;
  allowDoctorSelfHeal: boolean;
  tieVoteRule: TieRule;
  minPlayers: number;
  roles: {
    mafia: number;
    don: number;
    sheriff: number;
    doctor: number;
    maniac: number;
    jester: number;
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

// Generic response envelope from server
export type Res<T> = { ok: true; data: T } | { ok: false; error: string };
