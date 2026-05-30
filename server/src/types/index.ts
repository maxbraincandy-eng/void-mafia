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

// ── Role Definition ───────────────────────────────────────────────────
export interface Role {
  key: RoleKey;
  name: string;
  team: Team;
  description: string;
  ability: string;
  wakeAtNight: boolean;
  color: string;        // tailwind class prefix for neon color
  glowColor: string;   // hex for glow effects
}

// ── Internal Server Types ─────────────────────────────────────────────
export interface Player {
  id: string;
  name: string;
  avatar: string;
  socketId: string;
  isHost: boolean;
  isAlive: boolean;
  isConnected: boolean;
  isReady: boolean;
  role: RoleKey | null;
  team: Team | null;
  voteTarget: string | null;
  hasActedThisPhase: boolean;
  seat: number;
  joinedAt: number;
}

export interface NightAction {
  actorId: string;
  targetId: string;
  role: RoleKey;
  submittedAt: number;
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

export interface Room {
  id: string;
  code: string;
  hostId: string;
  phase: Phase;
  players: Map<string, Player>;
  day: number;
  timer: number;
  maxTimer: number;
  chat: ChatMessage[];
  mafiaChat: ChatMessage[];
  nightActions: Map<string, NightAction>;
  votes: Map<string, string | null>;
  killedLastNight: Array<{ id: string; name: string }>;
  savedLastNight: boolean;
  winner: Team | null;
  winnerNames?: string[];
  settings: GameSettings;
  createdAt: number;
}

// ── Public Types (sent to clients) ────────────────────────────────────
export interface PlayerPublic {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  isAlive: boolean;
  isConnected: boolean;
  isReady: boolean;
  role: RoleKey | null;     // null unless viewerIsThis OR game_over
  team: Team | null;
  voteTarget: string | null;
  hasActed: boolean;
  seat: number;
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

// ── Socket Event Maps ─────────────────────────────────────────────────
export interface ServerToClientEvents {
  'room:update': (room: RoomPublic) => void;
  'chat:new': (msg: ChatMessage) => void;
  'game:role': (data: { role: Role }) => void;
  'game:night_result': (result: NightResult) => void;
  'game:investigation': (result: InvestigationResult) => void;
  'game:over': (result: GameOverResult) => void;
  'error': (data: { message: string }) => void;
  'kicked': (data: { reason: string }) => void;
}

export interface ClientToServerEvents {
  'room:create': (data: { name: string; settings?: Partial<GameSettings> }, cb: (res: Res<RoomPublic>) => void) => void;
  'room:join': (data: { code: string; name: string }, cb: (res: Res<RoomPublic>) => void) => void;
  'room:leave': (cb: (res: Res<null>) => void) => void;
  'room:ready': (cb: (res: Res<null>) => void) => void;
  'room:kick': (data: { playerId: string }, cb: (res: Res<null>) => void) => void;
  'room:settings': (data: { settings: Partial<GameSettings> }, cb: (res: Res<null>) => void) => void;
  'game:start': (cb: (res: Res<null>) => void) => void;
  'game:action': (data: { targetId: string }, cb: (res: Res<null>) => void) => void;
  'game:vote': (data: { targetId: string | null }, cb: (res: Res<null>) => void) => void;
  'game:skip': (cb: (res: Res<null>) => void) => void;
  'game:restart': (cb: (res: Res<null>) => void) => void;
  'chat:send': (data: { text: string; channel: ChatChannel }, cb: (res: Res<null>) => void) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  playerId: string | null;
  roomId: string | null;
}

// Generic response envelope
export type Res<T> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): Res<T> { return { ok: true, data }; }
export function err(message: string): Res<never> { return { ok: false, error: message }; }
