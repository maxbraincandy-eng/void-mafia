// Mirror of server types — keep in sync

export type Phase =
  | 'lobby'
  | 'role_reveal'
  | 'night'
  | 'morning'
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
  | 'vigilante'
  | 'cult_leader'
  | 'cultist'
  | 'veteran'
  | 'tracker'
  | 'arsonist'
  | 'mayor'
  | 'yakuza'
  | 'shogun';

export type Team = 'mafia' | 'town' | 'neutral' | 'cult' | 'yakuza';
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

// ── Cosmetics ─────────────────────────────────────────────────────────
export interface PlayerCosmetics {
  equippedNameColor: string | null;
  equippedFrame: string | null;
  unlockedItems: string[];
}

// ── XP Gain ───────────────────────────────────────────────────────────
export interface XPGain {
  amount: number;
  newXP: number;
  newLevel: number;
  leveledUp: boolean;
  challengeCompleted: boolean;
  challengeBonus: number;
}

// ── Friend ────────────────────────────────────────────────────────────
export interface Friend {
  profileId: string;
  username: string;
  avatar: string;
  avatarUrl?: string | null;
  publicId?: number | null;
  level: number;
  isOnline: boolean;
  status: 'accepted';
}

export interface FriendRequest {
  id: string;
  fromId: string;
  fromUsername: string;
  fromAvatar: string;
  fromAvatarUrl?: string | null;
  createdAt: number;
}

// ── Daily Challenge ───────────────────────────────────────────────────
export interface DailyChallenge {
  id: string;
  description: string;
  xpReward: number;
  completedToday: boolean;
  progressCount: number;
  targetCount: number;
}

export interface PlayerProfilePublic {
  id: string;
  username: string;
  avatar: string;
  avatarUrl?: string | null;
  publicId?: number | null;
  stats: PlayerStats;
  isModerator: boolean;
  moderatorLevel: ModeratorLevel | null;
  moderatorBadgeVisible: boolean;
  moderatorPermissions: string[];
  joinedAt: number;
  xp?: number;
  level?: number;
  cosmetics?: PlayerCosmetics;
  friendCode?: string;
}

export interface PlayerPublic {
  id: string;
  socketId: string;
  name: string;
  avatar: string;
  avatarUrl: string | null;
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
  password: string;
  startWithNight: boolean;
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
    cult_leader: number;
    veteran: number;
    tracker: number;
    arsonist: number;
    mayor: number;
    yakuza: number;
    shogun: number;
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
  deadChat: ChatMessage[];
  killedLastNight: Array<{ id: string; name: string }>;
  savedLastNight: boolean;
  winner: Team | null;
  settings: GameSettings;
  activeRoleCounts: Record<string, number>;
  currentSpeakerId: string | null;
  daySkipVoteCount: number;
  spectatorCount: number;
  isPaused: boolean;
  /** Mafia-team-only: each alive Mafia member's current kill vote. null when viewer is not Mafia. */
  mafiaVotes: Record<string, { voterName: string; targetName: string }> | null;
  /** nominatorId → nomineeId for current day's speech nominations */
  nominations: Record<string, string>;
  /** deduped list of nominated player IDs eligible for tribunal vote */
  tribunalCandidates: string[];
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
  killed: Array<{ id: string; name: string; lastWill?: string | null }>;
  saved: boolean;
}

export interface VoteEliminationResult {
  name: string;
  role: string | null;
  lastWill: string | null;
  seat: number;
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

// ── Achievement ───────────────────────────────────────────────────────
export interface AchievementEarned {
  key: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  earnedAt: number;
}

// ── Night Summary ─────────────────────────────────────────────────────
export interface NightSummary {
  day: number;
  totalTargeted: number;
  saved: boolean;
  eliminated: Array<{ name: string; role: RoleKey | null }>;
}

// ── Clan ─────────────────────────────────────────────────────────────
export interface ClanPublic {
  id: string;
  name: string;
  tag: string;
  ownerId: string;
  description: string;
  wins: number;
  losses: number;
  createdAt: number;
  memberCount: number;
}

export interface ClanMember {
  playerId: string;
  username: string;
  avatar: string;
  avatarUrl?: string | null;
  publicId?: number | null;
  role: 'owner' | 'officer' | 'member';
  joinedAt: number;
}

// ── Vote Breakdown ────────────────────────────────────────────────────
export interface VoteBreakdownEntry {
  voterId: string;
  voterName: string;
  targetId: string;
  targetName: string;
  weight: number;
}

// ── Game History ─────────────────────────────────────────────────────
export interface GameHistoryEntry {
  id: string;
  roomCode: string;
  startedAt: number;
  endedAt: number;
  winner: string | null;
  dayReached: number;
  playerCount: number;
  myRole: string | null;
  myTeam: string | null;
  won: boolean;
}

// ── Social ────────────────────────────────────────────────────────────
export type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

export interface PublicProfileFull {
  profile: PlayerProfilePublic;
  achievements: AchievementEarned[];
  clan: ClanPublic | null;
  friendshipStatus: FriendshipStatus;
  isOnline: boolean;
}

export interface DmConversation {
  id: string;
  otherUserId: string;
  otherUsername: string;
  otherAvatar: string;
  otherAvatarUrl?: string | null;
  lastMessage: string | null;
  lastMessageAt: number | null;
  unread: boolean;
  createdAt: number;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: number;
  readAt: number | null;
}
