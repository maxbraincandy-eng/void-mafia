export type Phase =
  | 'lobby'
  | 'role_reveal'
  | 'night'
  | 'morning'
  | 'day'
  | 'speech'
  | 'trial_defense'
  | 'voting'
  | 'final_words'
  | 'game_over'
  // ── Don Mode exclusive phases ────────────────────────────────────────
  | 'planning_night'   // mafia meets before Day 0 — no kill, strategy only
  | 'don_check'        // Don checks one player for Sheriff role
  | 'mafia_kill'       // each mafia member votes independently; kill requires unanimity
  | 'tie_defense'      // tied vote candidates each get a defense speech
  | 'revote'           // re-vote between the original tied candidates
  | 'double_elim_vote' // city votes yes/no on eliminating both tied players

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
export type ChatChannel = 'room' | 'mafia' | 'dead' | 'spectator';
export type ModeratorLevel = 'moderator' | 'senior_moderator' | 'admin' | 'owner';
export type ReportReason =
  | 'cheating'
  | 'offensive_language'
  | 'voice_abuse'
  | 'spamming'
  | 'inappropriate_nickname'
  | 'harassment'
  | 'game_sabotage'
  | 'bug_abuse'
  | 'other'
  | 'hate_speech'
  | 'inappropriate_chat'
  | 'toxic_behavior';
export type ModActionType =
  | 'kick'
  | 'ban'
  | 'unban'
  | 'mute'
  | 'unmute'
  | 'warn'
  | 'report_resolve'
  | 'report_reject'
  | 'freeze'
  | 'unfreeze'
  | 'rename'
  | 'note_add'
  | 'force_phase'
  | 'pause_timer'
  | 'resume_timer'
  | 'system_message'
  | 'broadcast'
  | 'terminate_game';

// ── Role Definition ───────────────────────────────────────────────────
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

// ── Cosmetics ─────────────────────────────────────────────────────────
export interface PlayerCosmetics {
  equippedNameColor: string | null;
  equippedFrame: string | null;
  equippedTitle: string | null;
  equippedRoleSkin: string | null;
  equippedWallpaper: string | null;
  equippedBorder: string | null;
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
export type PlayerStatus = 'online' | 'in_game' | 'spectating' | 'in_lounge' | 'offline';

// Where a friend currently is, and how to jump to them.
export interface PlayerPresence {
  kind: 'game' | 'lounge';
  label: string;   // e.g. "Mafia" or the space name
  code: string;    // room code or space code (for Join)
}

export interface Friend {
  profileId: string;
  username: string;
  avatar: string;
  avatarUrl?: string | null;
  publicId?: number | null;
  level: number;
  isOnline: boolean;
  status: 'accepted';
  playerStatus: PlayerStatus;
  presence?: PlayerPresence | null;
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

// ── Player Profile (persistent, app-level) ────────────────────────────
export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface BanRecord {
  id: string;
  reason: string;
  issuedBy: string;
  issuedByName: string;
  issuedAt: number;
  expiresAt: number;
}

export interface MuteRecord {
  id: string;
  reason: string;
  issuedBy: string;
  issuedByName: string;
  issuedAt: number;
  expiresAt: number;
}

export type WarnCategory =
  | 'offensive_language'
  | 'voice_abuse'
  | 'spam'
  | 'game_sabotage'
  | 'harassment'
  | 'inappropriate_avatar_name'
  | 'bug_abuse'
  | 'other';

export interface Warning {
  id: string;
  playerId: string;
  reason: string;
  category: WarnCategory;
  issuedBy: string;
  issuedByName: string;
  issuedAt: number;
}

export interface PlayerProfile {
  id: string;
  username: string;
  avatar: string;
  avatarUrl: string | null;
  avatarUpdatedAt: number | null;
  publicId: number | null;
  stats: PlayerStats;
  isModerator: boolean;
  moderatorLevel: ModeratorLevel | null;
  moderatorBadgeVisible: boolean;
  moderatorPermissions: string[];
  ban: BanRecord | null;
  mute: MuteRecord | null;
  warnings: Warning[];
  joinedAt: number;
  lastSeenAt: number;
  email?: string;
  passwordHash?: string;
  passwordSalt?: string;
  xp: number;
  level: number;
  cosmetics: PlayerCosmetics;
  friendCode: string;
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
  lastSeenAt: number;
  xp: number;
  level: number;
  cosmetics: PlayerCosmetics;
  friendCode: string;
  isOnline: boolean;
  playerStatus: PlayerStatus;
}

// ── Report ────────────────────────────────────────────────────────────
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

// ── Moderation Log ────────────────────────────────────────────────────
export interface ModLog {
  id: string;
  actionType: ModActionType;
  moderatorId: string;
  moderatorName: string;
  targetPlayerId: string;
  targetName: string;
  roomId: string | null;
  reason: string;
  duration: number | null;
  createdAt: number;
  expiresAt?: number;
}

// ── Spectator Queue Settings ──────────────────────────────────────────
export interface SpectatorQueueSettings {
  enabled: boolean;
  allowSpectatorsToQueue: boolean;
  autoPromoteOnNextRound: boolean;
}

// ── Internal Server Types ─────────────────────────────────────────────
export interface Player {
  id: string;
  name: string;
  avatar: string;
  avatarUrl: string | null;
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
  profileId: string | null;
  isSpectator: boolean;
  isQueuedNextRound: boolean;
  queuePosition: number | null;
  lastWill: string | null;
  isModerator: boolean;
  moderatorLevel: ModeratorLevel | null;
  deathType: 'night' | 'vote' | 'foul' | null;
  foulCount: number;
  isBot?: boolean;
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
  isMod?: boolean;
  type?: 'text' | 'voice';
  audioDuration?: number;
}

// ── Dynamic Events ────────────────────────────────────────────────────
export interface DynamicEventAllowed {
  blackoutNight: boolean;
  silentDay: boolean;
  doubleVote: boolean;
  noRevealDay: boolean;
  bloodMoon: boolean;
  anonymousVoting: boolean;
  sheriffFog: boolean;
  doctorPressure: boolean;
  extendedFinalWords: boolean;
}

export interface DynamicEventSettings {
  enabled: boolean;
  frequency: 'low' | 'medium' | 'high';
  allowed: DynamicEventAllowed;
}

export interface ActiveEvent {
  key: string;
  label: string;
  description: string;
  icon: string;
  phase: string;
  day: number;
  expiresAtPhaseEnd: boolean;
}

export interface EventLogEntry {
  day: number;
  phase: string;
  eventKey: string;
  eventLabel: string;
}

export const DEFAULT_DYNAMIC_EVENTS: DynamicEventSettings = {
  enabled: false,
  frequency: 'low',
  allowed: {
    blackoutNight: true, silentDay: true, doubleVote: true, noRevealDay: true,
    bloodMoon: true, anonymousVoting: true, sheriffFog: true, doctorPressure: true,
    extendedFinalWords: true,
  },
};

export interface DonModeState {
  planningNightCompleted: boolean;
  donCheckTargetId: string | null;
  donCheckResult: boolean | null;
  donCheckDone: boolean;
  /** mafiaPlayerId → targetId — kept server-side only, never sent to clients */
  mafiaKillVotes: Record<string, string>;
  tieCandidates: string[];
  defenseQueue: string[];
  currentDefenseIdx: number;
  doubleEliminationVotes: Record<string, boolean>;
  /** Execute-Both winners still awaiting their 1-min final speech (spec). */
  executeQueue: string[];
}

export interface DonModeStatePublic {
  tieCandidates: string[];
  defenseQueue: string[];
  currentDefenseIdx: number;
  doubleElimYes: number;
  doubleElimNo: number;
  donCheckDone: boolean;
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
  rotatingSpeech: boolean;
  mafiaCanSelfKill: boolean;
  /** When true, host can skip any player's individual speech minute. Default: false. */
  hostSkipPrivilege: boolean;
  trialDefense: { enabled: boolean; secondsPerCandidate: number };
  dynamicEvents: DynamicEventSettings;
  spectatorQueue: SpectatorQueueSettings;
  ranked?: boolean;
  /** Don Card mode — classic 10/12-player Don-table rules */
  donMode?: boolean;
  /** Planning night duration in seconds (Don Mode only). Default: 60 */
  planningNightDuration?: number;
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

export interface Room {
  id: string;
  code: string;
  /** Optional custom room title set by the host at creation. Empty string when unset. */
  name: string;
  hostId: string;
  phase: Phase;
  players: Map<string, Player>;
  /** Players waiting to join as active players in the next round */
  nextRoundQueue: Player[];
  day: number;
  timer: number;
  maxTimer: number;
  chat: ChatMessage[];
  mafiaChat: ChatMessage[];
  nightActions: Map<string, NightAction>;
  votes: Map<string, string | null>;
  killedLastNight: Array<{ id: string; name: string; lastWill?: string | null }>;
  savedLastNight: boolean;
  winner: Team | null;
  winnerNames?: string[];
  settings: GameSettings;
  speechOrder: string[];
  currentSpeakerIdx: number;
  daySkipVotes: string[];
  createdAt: number;
  isPaused: boolean;
  dousedPlayers: Set<string>;
  newlyConvertedCultists: string[];
  deadChat: ChatMessage[];
  spectateQueue: string[];
  spectatorChat: ChatMessage[];
  startedAt: number;
  mafiaKillTarget: string | null;
  nominations: Map<string, string>;
  tribunalCandidates: string[];
  deathSpeakerId: string | null;
  finalWordsReason: 'night_kill' | 'vote_elimination' | 'foul_death' | null;
  pendingWinner: Team | null;
  activeFoul: { playerId: string; endsAt: number } | null;
  trialDefenseState: { candidateIds: string[]; currentCandidateIdx: number } | null;
  speechStartSeat: number;
  clanId: string | null;
  clanRoom: boolean;
  activeEvent: ActiveEvent | null;
  eventsLog: EventLogEntry[];
  lastDoctorTarget: string | null;
  gameTimeline: TimelineEvent[];
  /** UUID refreshed on every game start + lobby reset; clients drop stale WebRTC signals if this doesn't match. */
  voiceSessionId: string;
  donModeState: DonModeState | null;
}

// ── Public Types (sent to clients) ────────────────────────────────────
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
  role: RoleKey | null;
  team: Team | null;
  voteTarget: string | null;
  hasActed: boolean;
  seat: number;
  profileId: string | null;
  isModerator: boolean;
  moderatorLevel: ModeratorLevel | null;
  isSpectator: boolean;
  isQueuedNextRound: boolean;
  queuePosition: number | null;
  deathType: 'night' | 'vote' | 'foul' | null;
  foulCount: number;
  isBot?: boolean;
}

export interface RoomPublic {
  id: string;
  code: string;
  name: string;
  phase: Phase;
  day: number;
  timer: number;
  maxTimer: number;
  players: PlayerPublic[];
  /** Spectators who are queued for next round (ordered by position) */
  nextRoundQueue: PlayerPublic[];
  chat: ChatMessage[];
  mafiaChat: ChatMessage[];
  killedLastNight: Array<{ id: string; name: string; lastWill?: string | null }>;
  savedLastNight: boolean;
  winner: Team | null;
  settings: GameSettings;
  activeRoleCounts: Record<string, number>;
  currentSpeakerId: string | null;
  daySkipVoteCount: number;
  spectatorCount: number;
  isPaused: boolean;
  deadChat: ChatMessage[];
  spectatorChat: ChatMessage[];
  /** Mafia-team-only: each alive Mafia member's current kill vote. null when viewer is not Mafia. */
  mafiaVotes: Record<string, { voterName: string; targetName: string }> | null;
  /** nominatorId → nomineeId for current day's speech nominations */
  nominations: Record<string, string>;
  /** deduped list of nominated player IDs eligible for tribunal vote */
  tribunalCandidates: string[];
  deathSpeakerId: string | null;
  finalWordsReason: string | null;
  activeFoul: { playerId: string; endsAt: number } | null;
  trialDefenseState: { candidateIds: string[]; currentCandidateIdx: number } | null;
  clanId: string | null;
  clanRoom: boolean;
  activeEvent: ActiveEvent | null;
  donModeState: DonModeStatePublic | null;
}

export interface RoomListItem {
  id: string;
  code: string;
  name: string;
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

export interface InvestigationResult {
  targetId: string;
  targetName: string;
  result: 'suspicious' | 'not_suspicious';
}

export type TimelineEventType = 'night_kill' | 'vote_eliminate' | 'night_survived' | 'vote_no_elim';

export interface TimelineEvent {
  type: TimelineEventType;
  day: number;
  // For kills/eliminations
  victimName?: string;
  victimRole?: RoleKey;
  victimTeam?: Team;
  // For night kills: by which role type (revealed at game end)
  killerRole?: RoleKey;
  // For vote_eliminate: vote breakdown
  voteBreakdown?: Array<{ voterName: string; targetName: string }>;
  // For night_survived: doctor saved
  doctorSaved?: boolean;
}

export interface GameOverResult {
  winner: Team;
  allRoles: Record<string, { name: string; role: RoleKey; team: Team }>;
  timeline: TimelineEvent[];
}

// ── Voice channel type (kept in sync with client/src/hooks/useVoiceChat) ──
export type VoiceChannel = 'room' | 'mafia' | 'yakuza';

// ── Achievement ───────────────────────────────────────────────────────
export interface AchievementEarned {
  key: string;
  name: string;
  description: string;
  icon: string;
  rarity: string;
}

// ── Lobby Chat ────────────────────────────────────────────────────────
export interface LobbyMessage {
  id: string;
  profileId: string;
  username: string;
  avatar: string;
  avatarUrl?: string | null;
  level: number;
  text: string;
  createdAt: number;
  nameColor?: string | null;
}

// ── LFG (Looking for Game) ────────────────────────────────────────────
export interface LfgEntry {
  profileId: string;
  username: string;
  avatar: string;
  avatarUrl?: string | null;
  level: number;
  note: string;
  createdAt: number;
}

// ── Vote Breakdown ────────────────────────────────────────────────────
export interface VoteBreakdownEntry {
  voterId: string;
  voterName: string;
  targetId: string;
  targetName: string;
  weight: number;
}

// ── Night Summary ─────────────────────────────────────────────────────
export interface NightSummary {
  day: number;
  totalTargeted: number;
  saved: boolean;
  eliminated: Array<{ name: string; role: RoleKey | null }>;
}

// ── Clan (public) ─────────────────────────────────────────────────────
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
  imageUrl: string;
}

// ── Clan Member ───────────────────────────────────────────────────────
export type ClanRole = 'owner' | 'admin' | 'moderator' | 'member';

export interface ClanMember {
  playerId: string;
  username: string;
  avatar: string;
  avatarUrl?: string | null;
  publicId?: number | null;
  role: ClanRole;
  joinedAt: number;
}

// ── Game History (public) ─────────────────────────────────────────────
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

// ── Mod Dashboard ─────────────────────────────────────────────────────
export interface ModNote {
  id: string;
  playerId: string;
  modId: string;
  modName: string;
  note: string;
  createdAt: number;
}

export interface ModPlayerDetail {
  profile: PlayerProfilePublic;
  ban: BanRecord | null;
  mute: MuteRecord | null;
  warnings: Warning[];
  reportCount: number;
  notes: ModNote[];
  accountFrozen: boolean;
}

export interface LiveRoomPlayer {
  id: string;
  name: string;
  seat: number;
  isAlive: boolean;
  isConnected: boolean;
  profileId: string | null;
}

export interface LiveRoomInfo {
  id: string;
  code: string;
  phase: Phase;
  day: number;
  timer: number;
  maxTimer: number;
  playerCount: number;
  hostName: string;
  isPrivate: boolean;
  isPaused: boolean;
  players: LiveRoomPlayer[];
}

export interface DashboardStats {
  onlinePlayers: number;
  spectatingPlayers: number;
  activeRooms: number;
  openReports: number;
  recentBans: number;
  peakOnline: number;
  newUsersToday: number;
  avgMatchSeconds: number;
  voiceUsers: number;
}

export interface BannedPlayerEntry {
  banId: string;
  profileId: string;
  username: string;
  friendCode: string;
  publicId: number | null;
  reason: string;
  expiresAt: number;
  issuedByName: string;
}

// ── Spectator Theater ─────────────────────────────────────────────────
export interface SpecMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  t: number;
}

// ── Socket Event Maps ─────────────────────────────────────────────────
type Cb<T> = (res: Res<T>) => void;

export interface ServerToClientEvents {
  'room:update':        (room: RoomPublic) => void;
  'room:timer':         (remaining: number) => void;
  'room:closed':        (data: { reason: string }) => void;
  'chat:new':           (msg: ChatMessage) => void;
  'game:role':          (data: { role: Role }) => void;
  'game:night_result':  (result: NightResult) => void;
  'game:investigation': (result: InvestigationResult) => void;
  'game:track_result':  (result: { trackedName: string; visitedName: string | null }) => void;
  'game:over':            (result: GameOverResult) => void;
  'game:night_summary':   (summary: NightSummary) => void;
  'game:nomination':      (data: { nominatorId: string; nominatorName: string; nomineeId: string | null; nomineeName: string | null }) => void;
  'achievement:earned':   (data: { achievements: AchievementEarned[] }) => void;
  'game:vote_breakdown':  (entries: VoteBreakdownEntry[]) => void;
  'lobby:autostart':      (data: { secondsLeft: number }) => void;
  'error':              (data: { message: string }) => void;
  'kicked':             (data: { reason: string }) => void;
  'player:profile':     (profile: PlayerProfilePublic) => void;
  'spy:night_report':   (data: { mafiaTarget: string | null; mafiaTargetName: string | null }) => void;
  'game:vote_result':   (data: { name: string; role: string | null; lastWill: string | null; seat: number }) => void;
  'game:roleblocked':   () => void;
  'game:yakuza_ally':   (data: { allyRole: string; allyId: string | null; allyName: string | null }) => void;
  'game:don_check_result': (data: { targetId: string; targetName: string; isSheriff: boolean }) => void;
  'mod:notification':   (data: { type: string; message: string; targetName?: string }) => void;
  'warning:received':   (data: { reason: string; moderatorName: string }) => void;
  'ban:received':       (data: { reason: string; expiresAt: number }) => void;
  'mute:received':      (data: { reason: string; expiresAt: number }) => void;
  // Voice signaling (replaces webrtc:*)
  'voice:peer-joined':   (data: { socketId: string; name: string; channel: VoiceChannel }) => void;
  'voice:peer-left':     (data: { socketId: string; channel: VoiceChannel }) => void;
  'voice:offer':         (data: { from: string; sdp: object }) => void;
  'voice:answer':        (data: { from: string; sdp: object }) => void;
  'voice:ice-candidate': (data: { from: string; candidate: object }) => void;
  'voice:error':         (data: { message: string }) => void;
  'voice:force-leave':      (data: { channel: VoiceChannel; reason: string }) => void;
  'voice:force-mute':       (data: { reason: string }) => void;
  'voice:force-unmute':     () => void;
  'voice:reset':            () => void;
  'voice:disconnect-room':  (data: { reason: string }) => void;
  // XP / levels / cosmetics
  'xp:gained':           (data: XPGain) => void;
  // Spectator prediction result
  'prediction:result':   (data: { correct: boolean; xpGained: number; winningTeam: string }) => void;
  // Spectate queue (legacy)
  'queue:position':      (data: { position: number; roomCode: string }) => void;
  'queue:promoted':      (data: { roomCode: string }) => void;
  // Next-round queue
  'queue:updated':       (data: { nextRoundQueue: PlayerPublic[] }) => void;
  // Friends
  'friend:request_received': (req: FriendRequest) => void;
  // Push notifications
  'game:notification':   (data: { title: string; body: string }) => void;
  // Online count
  'online:count':        (data: { count: number }) => void;
  // Direct messages
  'dm:new_message':      (data: { conversationId: string; message: any }) => void;
  // Lobby chat
  'lobby:message':       (msg: LobbyMessage) => void;
  'lobby:msg_deleted':   (data: { msgId: string }) => void;
  // Clan chat
  'clan:message':        (msg: LobbyMessage & { clanId: string }) => void;
  'clan:msg_deleted':    (data: { msgId: string }) => void;
  // LFG
  'lfg:update':          (list: LfgEntry[]) => void;
  // Maintenance mode
  'maintenance:status':  (data: { enabled: boolean }) => void;
  'system:announce':     (data: { id: string; message: string; style: 'banner' | 'popup' }) => void;
  // Economy
  'coins:updated':       (data: { coins: number }) => void;
  'gift:received':       (data: { gift: any; senderName: string; senderAvatar: string; message: string }) => void;
  // Session security
  'session:replaced':    (data: { reason: string }) => void;
  // Ranked ELO
  'rated:elo_update':    (data: { eloChange: number; newElo: number; tier: string }) => void;
  // Clan Wars notifications
  'clan:war_challenged': (data: { war: any }) => void;
  'clan:war_started':    (data: { war: any }) => void;
  'clan:war_ended':      (data: { war: any }) => void;
  // Spectator Theater
  'spec:message':        (msg: SpecMessage) => void;
  'spec:game_over':      (data: { roleReveals: Record<string, string> }) => void;
  // Community Hub (separate from Mafia game events)
  'community:notification': (n: CommunityNotification) => void;
  'community:lounge_update': (lounge: CommunityLounge) => void;
  'community:post_reacted': (data: { postId: string; reactions: Record<string, number>; myReaction: string | null }) => void;
  'community:story_reacted': (data: { storyId: string; reactions: Record<string, number> }) => void;
  'community:leaderboard_update': (data: any[]) => void;
  'community:lounge_removed': (data: { loungeId: string }) => void;
  'community:post_new':      (post: CommunityPost) => void;
  'community:post_updated': (post: CommunityPostV2) => void;
  'community:post_pinned': (postId: string) => void;
  'community:post_hidden': (postId: string) => void;
  // Lounge voice signaling (separate from room voice:* events)
  'lounge:peer-joined':   (data: { socketId: string; name: string; role: CommunityLoungeRole }) => void;
  'lounge:peer-left':     (data: { socketId: string }) => void;
  'lounge:offer':         (data: { from: string; sdp: object }) => void;
  'lounge:answer':        (data: { from: string; sdp: object }) => void;
  'lounge:ice-candidate': (data: { from: string; candidate: object }) => void;
  'lounge:member_update': (data: { loungeId: string; members: CommunityLoungeMember[] }) => void;
  'lounge:promoted':      () => void;
  'lounge:demoted':       () => void;
  'lounge:kicked':        (data: { reason: string }) => void;
  'lounge:force-leave':   (data: { reason: string }) => void;
  'debate:new':               (data: any) => void;
  'debate:participant_update': (data: any) => void;
  'debate:new_argument':      (data: any) => void;
  'debate:vote_update':       (data: any) => void;
  'debate:closed':            (data: any) => void;
  'debate:phase_update': (data: any) => void;
  'debate:hands_update': (data: any) => void;
  'debate:voice_peer_joined': (data: any) => void;
  'debate:voice_peer_left': (data: any) => void;
  'debate:voice_offer': (data: any) => void;
  'debate:voice_answer': (data: any) => void;
  'debate:voice_ice': (data: any) => void;
  // Admin panel events
  'community:post_deleted':  (data: { postId: string }) => void;
  'community:comment_deleted': (data: { commentId: string }) => void;
  'community:debate_deleted': (data: { debateId: string }) => void;
  'community:debate_updated': (data: { debateId: string; pinned?: boolean; featured?: boolean; locked?: boolean }) => void;
  'community:post_featured':  (data: { postId: string; featured: boolean }) => void;
  'room:invite_received': (data: { inviterName: string; inviterAvatar: string; roomCode: string; playerCount: number; maxPlayers: number }) => void;
  'game:invite_received': (data: { game: string; code: string; fromName: string; fromAvatar: string }) => void;
  'presence:friend_active': (data: { kind: 'game' | 'lounge'; code: string; label: string; fromName: string; fromId: string }) => void;
  // Virtual Space
  'space:player-joined': (player: { socketId: string; name: string; bodyColor: string; glowColor: string; mask: string; hat?: string; pet?: string; form?: string; profileId?: string | null; x: number; y: number; seat?: string | null; hp?: number }) => void;
  'space:meta-update': (patch: { theme?: string }) => void;
  'space:hit': (data: { targetSocketId: string; bySocketId: string; byName: string; hp: number; weapon: string }) => void;
  'space:knockout': (data: { byName: string }) => void;
  'space:duel_invite': (data: { fromSocketId: string; fromName: string }) => void;
  'space:duel_start': (data: { aSocketId: string; aName: string; bSocketId: string; bName: string }) => void;
  'space:duel_end': (data: { winnerName: string; loserName: string }) => void;
  'space:duel_declined': (data: { byName: string }) => void;
  'space:player-moved':  (data: { socketId: string; x: number; y: number }) => void;
  'space:player-left':   (data: { socketId: string }) => void;
  'space:message':       (data: { socketId: string; message: string }) => void;
  'space:player-sat':    (data: { socketId: string; seatId: string; x: number; y: number }) => void;
  'space:player-stood':  (data: { socketId: string }) => void;
  'space:player-reacted':(data: { socketId: string; emoji: string }) => void;
  'space:player-gesture':(data: { socketId: string; gesture: string }) => void;
  'space:player-typing': (data: { socketId: string; typing: boolean }) => void;
  'space:invited':       (data: { spaceId: string; code: string; name: string; icon: string; fromName: string }) => void;
  // Virtual Space Voice
  'space:voice-peer-joined': (data: { socketId: string; name: string }) => void;
  'space:voice-peer-left':   (data: { socketId: string }) => void;
  'space:voice-offer':       (data: { from: string; sdp: object }) => void;
  'space:voice-answer':      (data: { from: string; sdp: object }) => void;
  'space:voice-ice':         (data: { from: string; candidate: object }) => void;
  // DJ
  'space:dj-update':         (state: { videoId: string; startedAt: number; position: number; isPlaying: boolean; djName: string } | null) => void;
  // Cinema TV / Watch Party
  'tv:update':               (state: { videoId: string; title: string; startedAt: number; position: number; isPlaying: boolean; byName: string; queue: { videoId: string; title: string }[]; skipVotes: number; skipNeeded: number } | null) => void;
}

export interface ClientToServerEvents {
  'player:auth':        (data: { uid: string; username: string; referralCode?: string }, cb: Cb<PlayerProfilePublic>) => void;
  'profile:referral_count': (cb: Cb<number>) => void;
  'player:register':    (data: { email: string; password: string; username: string }, cb: Cb<{ uid: string; profile: PlayerProfilePublic }>) => void;
  'player:login_email': (data: { email: string; password: string }, cb: Cb<{ uid: string; profile: PlayerProfilePublic }>) => void;
  'player:stats':       (data: { profileId: string }, cb: Cb<PlayerProfilePublic>) => void;
  'player:report':      (data: { targetProfileId: string; roomId: string | null; reason: ReportReason; details: string }, cb: Cb<null>) => void;
  'room:create':        (data: { name: string; roomName?: string; settings?: Record<string, unknown> }, cb: Cb<RoomPublic>) => void;
  'room:join':          (data: { code: string; name: string }, cb: Cb<RoomPublic>) => void;
  'room:leave':         (cb: Cb<null>) => void;
  'room:ready':         (cb: Cb<null>) => void;
  'room:kick':          (data: { playerId: string }, cb: Cb<null>) => void;
  'room:warn':          (data: { playerId: string }, cb: Cb<null>) => void;
  'room:transfer_host': (data: { playerId: string }, cb: Cb<null>) => void;
  'room:settings':      (data: { settings: Partial<GameSettings> }, cb: Cb<null>) => void;
  'game:start':         (cb: Cb<null>) => void;
  'game:action':        (data: { targetId: string }, cb: Cb<null>) => void;
  'game:vote':          (data: { targetId: string | null }, cb: Cb<null>) => void;
  'game:skip':          (cb: Cb<null>) => void;
  'game:speech_pass':   (cb: Cb<null>) => void;
  'game:nominate':      (data: { nomineeId: string | null }, cb: Cb<null>) => void;
  'game:day_skip_vote': (cb: Cb<null>) => void;
  'game:foul':          (cb: Cb<null>) => void;
  'game:skip-defense':  (cb: Cb<null>) => void;
  'game:restart':       (cb: Cb<null>) => void;
  'game:set_will':      (data: { text: string }, cb: Cb<null>) => void;
  'game:pause':         (cb: Cb<{ isPaused: boolean }>) => void;
  'game:terminate':          (cb: Cb<null>) => void;
  // Dev tools (owner-only)
  'dev:fill_bots':           (data: { count: number }, cb: Cb<null>) => void;
  'dev:clear_bots':          (cb: Cb<null>) => void;
  // Don Mode
  'game:don_check':          (data: { targetId: string | null }, cb: Cb<null>) => void;
  'game:mafia_kill_vote':    (data: { targetId: string }, cb: Cb<null>) => void;
  'game:double_elim_vote':   (data: { yes: boolean }, cb: Cb<null>) => void;
  'leaderboard:get':         (cb: Cb<PlayerProfilePublic[]>) => void;
  'player:profile':     (data: { profileId: string }, cb: Cb<PlayerProfilePublic>) => void;
  'player:achievements': (data: { profileId: string }, cb: Cb<AchievementEarned[]>) => void;
  'player:history':     (data: { profileId: string }, cb: Cb<GameHistoryEntry[]>) => void;
  'room:invite':        (data: { friendProfileId: string }, cb: Cb<null>) => void;
  'lobby:player_roles': (data: { profileIds: string[]; roomCode: string }, cb: Cb<Record<string, { role: string; team: string; won: boolean }>>) => void;
  'clan:list':          (cb: Cb<ClanPublic[]>) => void;
  'clan:get':           (data: { clanId: string }, cb: Cb<{ clan: ClanPublic; members: ClanMember[] }>) => void;
  'clan:create':        (data: { name: string; tag: string; description: string }, cb: Cb<ClanPublic>) => void;
  'clan:join':          (data: { clanId: string }, cb: Cb<null>) => void;
  'clan:leave':         (cb: Cb<null>) => void;
  'clan:update_image':  (data: { clanId: string; imageData: string }, cb: Cb<null>) => void;
  'clan:mine':          (cb: Cb<ClanPublic | null>) => void;
  'chat:send':          (data: { text: string; channel: ChatChannel }, cb: Cb<null>) => void;
  'mod:kick_from_room': (data: { targetProfileId: string; roomId: string; reason: string }, cb: Cb<null>) => void;
  'mod:kick_player':    (data: { targetProfileId: string; reason: string }, cb: Cb<null>) => void;
  'mod:get_active_rooms': (cb: Cb<RoomListItem[]>) => void;
  'mod:set_mod_level':  (data: { targetProfileId: string; level: string | null }, cb: Cb<{ username: string; newLevel: string | null }>) => void;
  'mod:ban':            (data: { targetProfileId: string; reason: string; duration: number }, cb: Cb<null>) => void;
  'mod:mute':           (data: { targetProfileId: string; reason: string; duration: number }, cb: Cb<null>) => void;
  'mod:warn':           (data: { targetProfileId: string; reason: string }, cb: Cb<null>) => void;
  'mod:unban':          (data: { targetProfileId: string }, cb: Cb<null>) => void;
  'mod:unmute':         (data: { targetProfileId: string }, cb: Cb<null>) => void;
  'mod:get_reports':    (cb: Cb<Report[]>) => void;
  'mod:get_rooms':      (cb: Cb<RoomListItem[]>) => void;
  'mod:get_players':         (cb: Cb<PlayerProfilePublic[]>) => void;
  'mod:get_banned_players':  (cb: Cb<BannedPlayerEntry[]>) => void;
  'mod:get_logs':       (cb: Cb<ModLog[]>) => void;
  'mod:resolve_report':  (data: { reportId: string; status: 'resolved' | 'rejected'; notes: string }, cb: Cb<null>) => void;
  'mod:terminate_game':  (data: { roomId: string; reason: string }, cb: Cb<null>) => void;
  'mod:close_room':      (data: { roomId: string; reason: string }, cb: Cb<null>) => void;
  'mod:get_dashboard':      (cb: Cb<DashboardStats>) => void;
  'mod:get_rooms_live':     (cb: Cb<LiveRoomInfo[]>) => void;
  'mod:pause_timer':        (data: { roomId: string }, cb: Cb<null>) => void;
  'mod:resume_timer':       (data: { roomId: string }, cb: Cb<null>) => void;
  'mod:force_phase':        (data: { roomId: string; phase: Phase }, cb: Cb<null>) => void;
  'mod:system_message':     (data: { roomId: string; message: string }, cb: Cb<null>) => void;
  'mod:broadcast':          (data: { message: string }, cb: Cb<null>) => void;
  'mod:toggle_maintenance': (data: { enabled: boolean }, cb: Cb<{ enabled: boolean }>) => void;
  'mod:get_maintenance':    (cb: Cb<{ enabled: boolean }>) => void;
  'mod:get_player_detail':  (data: { targetProfileId: string }, cb: Cb<ModPlayerDetail>) => void;
  'mod:get_player_auth_info': (data: { targetProfileId: string }, cb: Cb<{ accounts: Array<{ provider: string; email: string | null; display_name: string | null; provider_user_id: string; created_at: number }> }>) => void;
  'mod:add_note':           (data: { targetProfileId: string; note: string }, cb: Cb<null>) => void;
  'mod:freeze_account':     (data: { targetProfileId: string; reason: string }, cb: Cb<null>) => void;
  'mod:unfreeze_account':   (data: { targetProfileId: string }, cb: Cb<null>) => void;
  'mod:rename_player':      (data: { targetProfileId: string; newName: string; reason: string }, cb: Cb<null>) => void;
  'mod:voice_mute_room':          (data: { roomId: string; reason: string }, cb: Cb<null>) => void;
  'mod:voice_clear_forced_mute':  (data: { targetProfileId: string }, cb: Cb<null>) => void;
  'mod:voice_force_reconnect':    (data: { targetProfileId: string }, cb: Cb<null>) => void;
  'mod:assign_report':            (data: { reportId: string; modId: string }, cb: Cb<null>) => void;
  // Voice signaling (replaces webrtc:*)
  'voice:join':          (data: { channel: VoiceChannel }, cb: Cb<{ peers: Array<{ socketId: string; name: string }> }>) => void;
  'voice:leave':         () => void;
  'voice:livekit_sync':  () => void;
  'voice:offer':         (data: { to: string; sdp: object }, cb: Cb<null>) => void;
  'voice:answer':        (data: { to: string; sdp: object }, cb: Cb<null>) => void;
  'voice:ice-candidate': (data: { to: string; candidate: object }) => void;
  // Next-round queue
  'queue:join':          (cb: Cb<{ position: number }>) => void;
  'queue:leave':         (cb: Cb<null>) => void;
  // Rematch
  'game:rematch':        (cb: Cb<null>) => void;
  // Friends
  'friend:request':        (data: { toProfileId?: string; friendCode?: string }, cb: Cb<null>) => void;
  'friend:accept':         (data: { fromProfileId: string }, cb: Cb<null>) => void;
  'friend:decline':        (data: { fromProfileId: string }, cb: Cb<null>) => void;
  'friend:remove':         (data: { profileId: string }, cb: Cb<null>) => void;
  'friend:list':           (cb: Cb<Friend[]>) => void;
  'friend:invitable_list': (cb: Cb<Friend[]>) => void;
  'game:invite': (data: { targetProfileId: string; game: string; code: string }, cb: Cb<null>) => void;
  'friend:requests':       (cb: Cb<FriendRequest[]>) => void;
  // Friend code lookup
  'player:find_by_code':   (data: { friendCode: string }, cb: Cb<PlayerProfilePublic>) => void;
  // Mod grant by code (owner only)
  'mod:set_level_by_code': (data: { friendCode: string; level: string | null }, cb: Cb<{ username: string; newLevel: string | null }>) => void;
  // Challenges
  'challenge:today':       (cb: Cb<DailyChallenge[]>) => void;
  // Spectator predictions
  'prediction:submit':     (data: { roomId: string; predicted: string }, cb: Cb<null>) => void;
  // Cosmetics
  'cosmetics:equip':       (data: { type: 'name_color' | 'frame' | 'wallpaper' | 'border'; itemId: string | null }, cb: Cb<PlayerCosmetics>) => void;
  'cosmetics:get':         (data: { profileId: string }, cb: Cb<PlayerCosmetics>) => void;
  'cosmetics:name_colors': (data: { profileIds: string[] }, cb: Cb<Record<string, string>>) => void;
  'cosmetics:buy_item':    (data: { itemId: string }, cb: Cb<{ cosmetics: PlayerCosmetics; newBalance: number }>) => void;
  // Public profile popup
  'player:public_profile': (data: { profileId: string }, cb: Cb<any>) => void;
  // Role stats breakdown
  'player:role_stats':     (data: { profileId: string }, cb: Cb<any>) => void;
  // Clan membership with member role/join date
  'clan:my_membership':    (cb: Cb<any>) => void;
  // Lobby chat
  'lobby:send':            (data: { text: string }, cb: Cb<LobbyMessage>) => void;
  'lobby:history':         (data: Record<string, never>, cb: Cb<LobbyMessage[]>) => void;
  'lobby:delete_msg':      (data: { msgId: string }, cb: Cb<null>) => void;
  // LFG
  'lfg:toggle':            (data: { note?: string }, cb: Cb<{ active: boolean }>) => void;
  'lfg:list':              (data: Record<string, never>, cb: Cb<LfgEntry[]>) => void;
  // Direct messages
  'dm:start':              (data: { profileId: string }, cb: Cb<any>) => void;
  'dm:send':               (data: { conversationId: string; text: string }, cb: Cb<any>) => void;
  'dm:list':               (data: Record<string, never>, cb: Cb<any[]>) => void;
  'dm:messages':           (data: { conversationId: string }, cb: Cb<any[]>) => void;
  'dm:mark_read':          (data: { conversationId: string }, cb: Cb<null>) => void;
  'dm:unread_count':       (data: Record<string, never>, cb: Cb<number>) => void;
  'dm:delete':             (data: { conversationId: string }, cb: Cb<null>) => void;
  'dm:voice':              (data: { conversationId: string; audioData: string; duration: number }, cb: Cb<any>) => void;
  // Avatar
  'player:update_avatar':  (data: { imageData: string }, cb: (res: any) => void) => void;
  'player:remove_avatar':  (cb: (res: any) => void) => void;
  'player:update_name':    (data: { newName: string }, cb: (res: any) => void) => void;
  // Economy — coins & gifts
  'coins:balance':          (cb: Cb<{ coins: number }>) => void;
  'coins:daily_reward':     (cb: Cb<{ coins: number; balance: number; alreadyClaimed: boolean }>) => void;
  'coins:send_gift':        (data: { recipientId: string; giftId: string; message: string }, cb: Cb<{ newBalance: number }>) => void;
  'coins:transactions':     (data: { profileId?: string }, cb: Cb<any[]>) => void;
  'gifts:catalog':          (cb: Cb<any[]>) => void;
  'gifts:leaderboard':      (cb: Cb<any>) => void;
  'gifts:player_gifts':     (data: { profileId: string }, cb: Cb<any[]>) => void;
  'gifts:getSent':          (data: { profileId: string }, cb: Cb<any[]>) => void;
  'gifts:getTimeline':      (data: { profileId: string }, cb: Cb<any[]>) => void;
  'gifts:getStats':         (data: { profileId: string }, cb: Cb<any>) => void;
  'gifts:getPinned':        (data: { profileId: string }, cb: Cb<any[]>) => void;
  'gifts:pin':              (data: { giftId: string }, cb: Cb<{}>) => void;
  'gifts:unpin':            (data: { giftId: string }, cb: Cb<{}>) => void;
  'gifts:detail':           (data: { giftId: string; recipientId: string }, cb: Cb<any>) => void;
  // Ranked ELO
  'rating:get_my':          (cb: Cb<{ elo: number; peakElo: number; tier: string; rankedWins: number; rankedLosses: number; isPlaced: boolean; placementGames: number } | null>) => void;
  'rating:leaderboard':     (cb: Cb<any[]>) => void;
  // Push notifications
  'push:subscribe':         (data: { endpoint: string; p256dh: string; auth: string }, cb: Cb<null>) => void;
  'push:unsubscribe':       (data: { endpoint: string }, cb: Cb<null>) => void;
  // Economy — owner only
  'owner:coins_grant':      (data: { targetProfileId: string; amount: number; description: string }, cb: Cb<{ newBalance: number }>) => void;
  'owner:coins_deduct':     (data: { targetProfileId: string; amount: number; description: string }, cb: Cb<{ newBalance: number }>) => void;
  'owner:coins_refund':     (data: { transactionId: string }, cb: Cb<null>) => void;
  'owner:gift_create':      (data: { name: string; description?: string; icon: string; rarity: string; stars: number; price: number }, cb: Cb<any>) => void;
  'owner:gift_update':      (data: { giftId: string; name?: string; description?: string; icon?: string; rarity?: string; stars?: number; price?: number; active?: boolean }, cb: Cb<any>) => void;
  'owner:gift_catalog_all': (cb: Cb<any[]>) => void;
  'owner:all_transactions': (cb: Cb<any[]>) => void;
  // Clan Wars
  'clan:war_challenge':  (data: { defenderClanId: string }, cb: Cb<any>) => void;
  'clan:war_accept':     (data: { warId: string }, cb: Cb<any>) => void;
  'clan:war_decline':    (data: { warId: string }, cb: Cb<any>) => void;
  'clan:war_status':     (data: { clanId: string }, cb: Cb<any>) => void;
  'clan:war_history':    (data: { clanId: string }, cb: Cb<any[]>) => void;
  // Replays
  'replay:list': (data: { limit?: number; offset?: number }, cb: Cb<GameReplaySummary[]>) => void;
  'replay:get':  (data: { replayId: string }, cb: Cb<GameReplayFull>) => void;
  'replay:my':   (cb: Cb<GameReplaySummary[]>) => void;
  // Season
  'season:current':     (cb: Cb<Season | null>) => void;
  'season:leaderboard': (data: { seasonId: string }, cb: Cb<SeasonLeaderboardEntry[]>) => void;
  'season:my_history':  (cb: Cb<SeasonResult[]>) => void;
  // Spectator Theater
  'spec:chat':              (data: { roomId: string; text: string }, cb: Cb<null>) => void;
  'spec:vote_suspect':      (data: { roomId: string; suspectedPlayerId: string }, cb: Cb<null>) => void;
  'spec:suspicion_results': (data: { gameId: string }, cb: Cb<any[]>) => void;

  // ── Community Hub (completely separate from Mafia game rooms) ─────────
  'community:news_list':        (cb: Cb<VoidNewsPost[]>) => void;
  'community:news_create':      (data: { title: string; content: string; pinned?: boolean }, cb: Cb<VoidNewsPost>) => void;
  'community:news_delete':      (data: { id: string }, cb: Cb<null>) => void;
  'community:recommend_list':   (cb: Cb<MaxRecommendation[]>) => void;
  'community:recommend_create': (data: { category: RecommendCategory; title: string; review: string; imageUrl?: string }, cb: Cb<MaxRecommendation>) => void;
  'community:recommend_delete': (data: { id: string }, cb: Cb<null>) => void;
  'community:thought_list':     (cb: Cb<DailyThought[]>) => void;
  'community:thought_create':   (data: { content: string; pinned?: boolean }, cb: Cb<DailyThought>) => void;
  'community:thought_delete':   (data: { id: string }, cb: Cb<null>) => void;
  'community:feed_list':        (data: { before?: number }, cb: Cb<CommunityPost[]>) => void;
  'community:post_create':      (data: { content: string; imageUrl?: string }, cb: Cb<CommunityPost>) => void;
  'community:post_delete':      (data: { id: string }, cb: Cb<null>) => void;
  'community:post_like':        (data: { postId: string }, cb: Cb<{ likesCount: number; likedByMe: boolean }>) => void;
  'community:post_comment':     (data: { postId: string; content: string }, cb: Cb<CommunityComment>) => void;
  'community:post_comments':    (data: { postId: string }, cb: Cb<CommunityComment[]>) => void;
  'community:comment_delete':   (data: { commentId: string }, cb: Cb<null>) => void;
  'community:post_report':      (data: { postId: string; reason: string }, cb: Cb<null>) => void;
  'community:follow':           (data: { targetId: string }, cb: Cb<null>) => void;
  'community:unfollow':         (data: { targetId: string }, cb: Cb<null>) => void;
  'community:profile':          (data: { profileId: string }, cb: Cb<CommunityProfile>) => void;
  'community:event_list':       (cb: Cb<CommunityEvent[]>) => void;
  'community:event_create':     (data: { title: string; description: string; category: CommunityEventCategory; eventAt: number }, cb: Cb<CommunityEvent>) => void;
  'community:event_join':       (data: { eventId: string }, cb: Cb<null>) => void;
  'community:event_leave':      (data: { eventId: string }, cb: Cb<null>) => void;
  'community:notifications':            (cb: Cb<CommunityNotification[]>) => void;
  'community:notifications_unread':     (cb: Cb<number>) => void;
  'community:notifications_mark_read':  (cb: Cb<null>) => void;
  'community:lounge_list':      (cb: Cb<CommunityLounge[]>) => void;
  'community:lounge_create':    (data: { name: string; description: string }, cb: Cb<CommunityLounge>) => void;
  'community:lounge_delete':    (data: { loungeId: string }, cb: Cb<null>) => void;
  'community:lounge_set_live':  (data: { loungeId: string; isLive: boolean; lastTopic?: string }, cb: Cb<null>) => void;
  'community:report_list':      (cb: Cb<any[]>) => void;
  'community:report_resolve':   (data: { reportId: string; status: string }, cb: Cb<null>) => void;
  'community:ban':               (data: { targetProfileId: string; reason: string; duration: number }, cb: Cb<null>) => void;
  'community:unban':             (data: { targetProfileId: string }, cb: Cb<null>) => void;
  'community:profile_update': (data: { bio?: string; coverUrl?: string; favoriteRole?: string }, cb: (r: Res<CommunityProfileV2>) => void) => void;
  'community:feed_v2': (data: { category: FeedCategory; before?: number; hashtag?: string }, cb: (r: Res<CommunityPostV2[]>) => void) => void;
  'community:user_posts': (data: { authorId: string; before?: number }, cb: (r: Res<CommunityPostV2[]>) => void) => void;
  'community:post_create_v2': (data: {
    postType: PostType;
    content: string;
    imageUrl?: string | null;
    gifUrl?: string | null;
    videoUrl?: string | null;
    recTitle?: string | null;
    recCategory?: string | null;
    poll?: { question: string; options: string[]; endsAt?: number | null } | null;
    visibility?: 'public' | 'friends_only';
  }, cb: (r: Res<CommunityPostV2>) => void) => void;
  'community:post_pin': (data: { postId: string; pin: boolean }, cb: (r: Res<void>) => void) => void;
  'community:post_feature': (data: { postId: string; feature: boolean }, cb: (r: Res<void>) => void) => void;
  'community:post_hide': (data: { postId: string }, cb: (r: Res<void>) => void) => void;
  'community:post_save': (data: { postId: string }, cb: (r: Res<{ saved: boolean }>) => void) => void;
  'community:post_saves': (data: { before?: number }, cb: (r: Res<CommunityPostV2[]>) => void) => void;
  'community:poll_vote': (data: { postId: string; optionId: string }, cb: (r: Res<PollResult[]>) => void) => void;
  'community:showcase_set': (data: { slot: number; achievementKey: string }, cb: (r: Res<void>) => void) => void;
  'community:showcase_clear': (data: { slot: number }, cb: (r: Res<void>) => void) => void;
  'community:people_list': (data: { before?: number }, cb: (r: Res<CommunityProfileV2[]>) => void) => void;
  'community:followers_list': (data: { profileId: string }, cb: (r: Res<CommunityProfileV2[]>) => void) => void;
  'community:following_list': (data: { profileId: string }, cb: (r: Res<CommunityProfileV2[]>) => void) => void;
  'community:search': (data: { query: string }, cb: (r: Res<CommunitySearchResult>) => void) => void;
  'community:online_members': (cb: (r: Res<Array<{ playerId: string; username: string; avatar: string; avatarUrl: string | null }>>) => void) => void;
  'community:badge_assign': (data: { targetId: string; badge: CommunityBadge }, cb: (r: Res<void>) => void) => void;
  'community:badge_revoke': (data: { targetId: string; badge: CommunityBadge }, cb: (r: Res<void>) => void) => void;
  'community:privacy_get': (cb: (r: Res<{ hideFollowersList: boolean; allowFriendRequests: boolean; defaultPostVisibility: string; profileMode: string }>) => void) => void;
  'community:privacy_set': (data: { hideFollowersList?: boolean; allowFriendRequests?: boolean; defaultPostVisibility?: string; profileMode?: string }, cb: (r: Res<void>) => void) => void;
  'community:mod_logs': (cb: (r: Res<Array<{ id: string; action: string; modId: string; targetId: string | null; postId: string | null; note: string; createdAt: number }>>) => void) => void;
  'community:post_react': (data: { postId: string; emoji: string }, cb: Cb<{ reactions: Record<string, number>; myReaction: string | null }>) => void;
  'community:get_reaction_users': (data: { postId: string }, cb: Cb<Array<{ emoji: string; username: string; avatar_url: string | null; player_id: string }>>) => void;
  'community:leaderboard': (cb: Cb<Array<{ playerId: string; username: string; avatarUrl: string | null; score: number; rank: number }>>) => void;
  // Lounge voice signaling
  'lounge:join':           (data: { loungeId: string; asSpeaker: boolean }, cb: Cb<{ peers: Array<{ socketId: string; name: string; role: CommunityLoungeRole }>; role: CommunityLoungeRole; iceServers?: any }>) => void;
  'lounge:leave':          () => void;
  'lounge:offer':          (data: { to: string; sdp: object }, cb: Cb<null>) => void;
  'lounge:answer':         (data: { to: string; sdp: object }, cb: Cb<null>) => void;
  'lounge:ice-candidate':  (data: { to: string; candidate: object }) => void;
  'lounge:raise_hand':     (cb: Cb<null>) => void;
  'lounge:lower_hand':     (cb: Cb<null>) => void;
  'lounge:promote':        (data: { targetPlayerId: string }, cb: Cb<null>) => void;
  'lounge:demote':         (data: { targetPlayerId: string }, cb: Cb<null>) => void;
  'lounge:kick':           (data: { targetPlayerId: string; reason: string }, cb: Cb<null>) => void;
  'lounge:members':        (data: { loungeId: string }, cb: Cb<CommunityLoungeMember[]>) => void;
  'debate:list':           (data: { status?: string }, cb: (r: Res<any[]>) => void) => void;
  'debate:get':            (data: { debateId: string }, cb: (r: Res<any>) => void) => void;
  'debate:create':         (data: { topic: string; description?: string }, cb: (r: Res<any>) => void) => void;
  'debate:join':           (data: { debateId: string; side: string }, cb: (r: Res<any>) => void) => void;
  'debate:argument':       (data: { debateId: string; content: string }, cb: (r: Res<any>) => void) => void;
  'debate:vote':           (data: { debateId: string; side: 'pro' | 'con' }, cb: (r: Res<any>) => void) => void;
  'debate:close':          (data: { debateId: string }, cb: (r: Res<any>) => void) => void;
  'debate:subscribe':      (data: { debateId: string }, cb: (r: Res<null>) => void) => void;
  'debate:unsubscribe':    (data: { debateId: string }, cb: (r: Res<null>) => void) => void;
  'debate:start': (data: { debateId: string }, cb: (r: Res<any>) => void) => void;
  'debate:skip_phase': (data: { debateId: string }, cb: (r: Res<any>) => void) => void;
  'debate:raise_hand': (data: { debateId: string; side: string }, cb: (r: Res<null>) => void) => void;
  'debate:lower_hand': (data: { debateId: string }, cb: (r: Res<null>) => void) => void;
  'debate:promote': (data: { debateId: string; targetPlayerId: string }, cb: (r: Res<any>) => void) => void;
  'debate:voice_join': (data: { debateId: string; side: string }, cb: (r: Res<{ peers: any[]; iceServers: any }>) => void) => void;
  'debate:voice_leave': (data: { debateId: string }, cb?: (r: Res<null>) => void) => void;
  'debate:voice_offer': (data: { debateId: string; to: string; sdp: any }, cb?: (r: Res<null>) => void) => void;
  'debate:voice_answer': (data: { debateId: string; to: string; sdp: any }, cb?: (r: Res<null>) => void) => void;
  'debate:voice_ice': (data: { debateId: string; to: string; candidate: any }, cb?: (r: Res<null>) => void) => void;
  'activity:feed':         (data: Record<string, never>, cb: (r: Res<any[]>) => void) => void;
  // ── Admin Panel Events ────────────────────────────────────────────────
  'admin:user_search':    (data: { query: string }, cb: (r: Res<any[]>) => void) => void;
  'admin:user_profile':   (data: { playerId: string }, cb: (r: Res<any>) => void) => void;
  'admin:user_action':    (data: any, cb: (r: Res<any>) => void) => void;
  'admin:post_list':      (data: Record<string, never>, cb: (r: Res<any[]>) => void) => void;
  'admin:post_action':    (data: { action: string; postId: string }, cb: (r: Res<any>) => void) => void;
  'admin:comment_action': (data: { action: string; commentId: string }, cb: (r: Res<any>) => void) => void;
  'admin:debate_action':  (data: { action: string; debateId: string }, cb: (r: Res<any>) => void) => void;
  'admin:report_list':    (data: Record<string, never>, cb: (r: Res<any[]>) => void) => void;
  'admin:audit_logs':     (data: Record<string, never>, cb: (r: Res<any[]>) => void) => void;
  'admin:deleted_content': (data: { type: 'posts' | 'comments' | 'debates' }, cb: (r: Res<any[]>) => void) => void;
  // Virtual Space
  'space:join':  (data: { spaceId: string; name: string; bodyColor: string; glowColor: string; mask: string; hat?: string; pet?: string; form?: string }, cb: (res: any) => void) => void;
  'space:move':  (data: { x: number; y: number }) => void;
  'space:chat':  (data: { message: string }) => void;
  'space:leave': () => void;
  'space:sit':   (data: { seatId: string; x: number; y: number }) => void;
  'space:stand': () => void;
  'space:react':   (data: { emoji: string }) => void;
  'space:gesture': (data: { gesture: string }) => void;
  'space:typing':  (data: { typing: boolean }) => void;
  'space:create':  (data: { name: string; icon: string; theme: string; layout?: string; maxPlayers: number; isPublic: boolean }, cb: (res: any) => void) => void;
  'space:list':    (cb: (res: any) => void) => void;
  'space:resolve': (data: { code: string }, cb: (res: any) => void) => void;
  'space:invite':  (data: { targetProfileId: string }, cb: (res: any) => void) => void;
  'space:set_theme': (data: { theme: string }, cb: (res: any) => void) => void;
  'space:hit': (data: { targetSocketId: string; weapon?: string }, cb: (res: any) => void) => void;
  'space:ko_leaderboard': (cb: (res: any) => void) => void;
  'space:duel_challenge': (data: { targetSocketId: string }, cb: (res: any) => void) => void;
  'space:duel_respond': (data: { fromSocketId: string; accept: boolean }, cb: (res: any) => void) => void;
  // Virtual Space Voice
  'space:voice-join':   (data: Record<string, never>, cb: (res: any) => void) => void;
  'space:voice-leave':  () => void;
  'space:voice-offer':  (data: { to: string; sdp: object }) => void;
  'space:voice-answer': (data: { to: string; sdp: object }) => void;
  'space:voice-ice':    (data: { to: string; candidate: object }) => void;
  // DJ
  'space:dj-play':  (data: { videoId: string; position?: number }) => void;
  'space:dj-pause': (data: { position: number }) => void;
  'space:dj-stop':  () => void;
  // Cinema TV / Watch Party
  'tv:set':   (data: { videoId: string; title?: string }) => void;
  'tv:enqueue': (data: { videoId: string; title?: string }) => void;
  'tv:next':  () => void;
  'tv:vote_skip': () => void;
  'tv:ended': (data: { videoId: string }) => void;
  'tv:play':  (data: { position: number }) => void;
  'tv:pause': (data: { position: number }) => void;
  'tv:seek':  (data: { position: number }) => void;
  'tv:stop':  () => void;
}

export interface InterServerEvents {}

export interface SocketData {
  playerId: string | null;
  roomId: string | null;
  profileId: string | null;
  loungeId: string | null;
}

// ── Replay Types ──────────────────────────────────────────────────────
export interface ReplayEvent {
  t: number;           // ms since game start
  type: string;        // 'phase_change' | 'death' | 'vote' | 'kill' | 'save' | 'investigate' | 'chat' | 'game_start' | 'game_end'
  data: Record<string, any>;
}

export interface GameReplaySummary {
  id: string;
  roomName: string;
  playerCount: number;
  durationMs: number;
  startedAt: number;
  endedAt: number;
  winner: string;
  createdAt: number;
}

export interface GameReplayFull extends GameReplaySummary {
  events: ReplayEvent[];
  playerRoles: Record<string, { username: string; role: string; team: string; alive: boolean }>;
}

// ── Season ────────────────────────────────────────────────────────────
export interface Season {
  id: string;
  number: number;
  name: string;
  startAt: number;
  endAt: number;
  status: 'active' | 'completed';
}

export interface SeasonLeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  avatarUrl: string | null;
  elo: number;
  tier: string;
}

export interface SeasonResult {
  seasonId: string;
  seasonName: string;
  seasonNumber: number;
  finalRank: number;
  finalElo: number;
  finalTier: string;
  rewardTitle: string | null;
  rewardCoins: number;
}

// ── Result Envelope ───────────────────────────────────────────────────
export type Res<T> = { ok: true; data: T } | { ok: false; error: string };
export function ok<T>(data: T): Res<T> { return { ok: true, data }; }
export function err(message: string): Res<never> { return { ok: false, error: message }; }

// ── Community Hub ───────────────────────────────────────────────────────
// Completely separate from Mafia game rooms/state. Nothing here should ever
// reference Room/Phase/GameSettings — see VOID MAFIA Community Hub spec.

export type CommunityLoungeKind = 'max_lounge' | 'void_radio' | 'lounge';
export type CommunityLoungeRole = 'host' | 'speaker' | 'listener';

export interface CommunityLounge {
  id: string;
  name: string;
  description: string;
  ownerId: string | null;
  kind: CommunityLoungeKind;
  isLive: boolean;
  lastTopic: string;
  createdAt: number;
  listenerCount: number;
  speakerCount: number;
}

export interface CommunityLoungeMember {
  socketId: string;
  playerId: string;
  username: string;
  avatar: string;
  avatarUrl: string | null;
  role: CommunityLoungeRole;
  handRaised: boolean;
  joinedAt: number;
}

export interface VoidNewsPost {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  authorId: string | null;
  authorName: string;
  createdAt: number;
}

export type RecommendCategory = 'movie' | 'series' | 'book' | 'music' | 'philosophy';

export interface MaxRecommendation {
  id: string;
  category: RecommendCategory;
  title: string;
  review: string;
  imageUrl: string | null;
  createdAt: number;
}

export interface DailyThought {
  id: string;
  content: string;
  pinned: boolean;
  createdAt: number;
}

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorAvatarUrl: string | null;
  content: string;
  imageUrl: string | null;
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
  createdAt: number;
}

export interface CommunityComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorAvatarUrl: string | null;
  authorPublicId: number | null;
  content: string;
  createdAt: number;
}

export type CommunityEventCategory = 'movie_night' | 'philosophy_night' | 'void_radio' | 'live_discussion' | 'other';

export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  category: CommunityEventCategory;
  eventAt: number;
  createdBy: string;
  createdByName: string;
  participantCount: number;
  joinedByMe: boolean;
  createdAt: number;
}

export interface CommunityNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: number;
}

export interface CommunityProfile {
  id: string;
  username: string;
  avatar: string;
  avatarUrl: string | null;
  publicId: number | null;
  level: number;
  clanTag: string | null;
  clanName: string | null;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  joinedAt: number;
  isFollowedByMe: boolean;
}

export type CommunityBadge = 'verified' | 'owner' | 'moderator' | 'creator' | 'speaker' | 'philosopher' | 'veteran' | 'top_detective' | 'mafia_master';
export type PostType = 'text' | 'image' | 'gif' | 'video' | 'poll' | 'movie_rec' | 'series_rec' | 'book_rec' | 'music_rec' | 'philosophy' | 'voice';
export type FeedCategory = 'all' | 'following' | 'friends' | 'void_news' | 'mr_max' | 'clans' | 'trending';

export interface PollOption { id: string; text: string; }
export interface PollResult { option: PollOption; count: number; percent: number; }

export interface CommunityPostV2 extends CommunityPost {
  authorLevel: number;
  postType: PostType;
  gifUrl: string | null;
  videoUrl: string | null;
  isPinned: boolean;
  isFeatured: boolean;
  recTitle: string | null;
  recCategory: string | null;
  hashtags: string[];
  visibility: 'public' | 'friends_only';
  savesCount: number;
  savedByMe: boolean;
  hidden: boolean;
  poll: {
    question: string;
    options: PollOption[];
    endsAt: number | null;
    results?: PollResult[];
    myVote: string | null;
  } | null;
  authorBadges: CommunityBadge[];
  authorBio: string;
  authorCoverUrl: string | null;
  audioUrl?: string | null;
  reactions?: Record<string, number>;
  myReaction?: string | null;
}

export interface CommunityProfileV2 extends CommunityProfile {
  bio: string;
  coverUrl: string | null;
  favoriteRole: string | null;
  badges: CommunityBadge[];
  reputation: number;
  friendsCount: number;
  friendshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'friends';
  showcaseAchievements: Array<{ slot: number; achievementKey: string }>;
  privacySettings: {
    hideFollowersList: boolean;
    allowFriendRequests: boolean;
    defaultPostVisibility: 'public' | 'friends_only';
    profileMode: 'public' | 'secret';
  };
  isSecret?: boolean;
  anonymousName?: string;
}

export interface CommunitySearchResult {
  posts: CommunityPostV2[];
  people: CommunityProfileV2[];
  hashtags: Array<{ hashtag: string; count: number }>;
  lounges: CommunityLounge[];
}
