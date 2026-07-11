// Mirror of server types — keep in sync

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
  // ── Don Mode exclusive phases ─────────────────────────────────────────
  | 'planning_night'
  | 'don_check'
  | 'mafia_kill'
  | 'sheriff_check'
  | 'tie_defense'
  | 'revote'
  | 'double_elim_vote';

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
export type ChatChannel = 'room' | 'mafia' | 'yakuza' | 'dead' | 'spectator';
export type ModeratorLevel = 'moderator' | 'senior_moderator' | 'admin' | 'owner';
export type WarnCategory =
  | 'offensive_language'
  | 'voice_abuse'
  | 'spam'
  | 'game_sabotage'
  | 'harassment'
  | 'inappropriate_avatar_name'
  | 'bug_abuse'
  | 'other';
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

export interface PlayerPresence {
  kind: 'game' | 'lounge';
  label: string;
  code: string;
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
  playerStatus?: PlayerStatus;
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
  lastSeenAt?: number;
  xp?: number;
  level?: number;
  cosmetics?: PlayerCosmetics;
  friendCode?: string;
  isOnline?: boolean;
  playerStatus?: PlayerStatus;
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
  isQueuedNextRound: boolean;
  queuePosition: number | null;
  role: RoleKey | null;
  team: Team | null;
  voteTarget: string | null;
  hasVoted?: boolean;
  hasActed: boolean;
  seat: number;
  profileId: string | null;
  isModerator: boolean;
  moderatorLevel: ModeratorLevel | null;
  deathType: 'night' | 'vote' | 'foul' | null;
  foulCount: number;
  isBot?: boolean;
}

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

export const DEFAULT_DYNAMIC_EVENTS: DynamicEventSettings = {
  enabled: false,
  frequency: 'low',
  allowed: {
    blackoutNight: true, silentDay: true, doubleVote: true, noRevealDay: true,
    bloodMoon: true, anonymousVoting: true, sheriffFog: true, doctorPressure: true,
    extendedFinalWords: true,
  },
};

export interface SpectatorQueueSettings {
  enabled: boolean;
  allowSpectatorsToQueue: boolean;
  autoPromoteOnNextRound: boolean;
}


export type RankTier = 'unranked' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master';

export interface PlayerRating {
  elo: number;
  peakElo: number;
  tier: RankTier;
  rankedWins: number;
  rankedLosses: number;
  isPlaced: boolean;
  placementGames: number;
}

export interface DonModeStatePublic {
  tieCandidates: string[];
  defenseQueue: string[];
  currentDefenseIdx: number;
  doubleElimYes: number;
  doubleElimNo: number;
  donCheckDone: boolean;
  sheriffCheckDone: boolean;
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
  mafiaCanSelfKill?: boolean;
  hostSkipPrivilege?: boolean;
  trialDefense?: { enabled: boolean; secondsPerCandidate: number };
  dynamicEvents?: DynamicEventSettings;
  spectatorQueue?: SpectatorQueueSettings;
  ranked?: boolean;
  donMode?: boolean;
  /** Don mode: play with a non-playing game moderator (წამყვანი). */
  donModerator?: boolean;
  /** Night music: YouTube audio for idle citizens during the night phase. */
  nightMusicEnabled?: boolean;
  nightMusicVideoId?: string | null;
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

export interface RoomPublic {
  id: string;
  code: string;
  name: string;
  phase: Phase;
  day: number;
  timer: number;
  maxTimer: number;
  players: PlayerPublic[];
  nextRoundQueue: PlayerPublic[];
  chat: ChatMessage[];
  mafiaChat: ChatMessage[];
  yakuzaChat?: ChatMessage[];
  deadChat: ChatMessage[];
  spectatorChat: ChatMessage[];
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
  deathSpeakerId: string | null;
  finalWordsReason: string | null;
  activeFoul: { playerId: string; endsAt: number } | null;
  trialDefenseState: { candidateIds: string[]; currentCandidateIdx: number } | null;
  clanId: string | null;
  clanRoom: boolean;
  activeEvent: ActiveEvent | null;
  donModeState: DonModeStatePublic | null;
  donModeratorId: string | null;
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
  imageUrl?: string;
}

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

// ── Spectator Theater ─────────────────────────────────────────────────
export interface SpecMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  t: number;
}

export interface ClanModLog {
  id: string;
  clanId: string;
  modId: string;
  modName: string;
  targetId: string;
  targetName: string;
  action: string;
  reason: string;
  roomId: string | null;
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

export interface PlayerRoleStats {
  byTeam: { team: string; games: number; wins: number; survived: number }[];
  byRole: { role: string; games: number; wins: number; survived: number }[];
  totalGames: number;
  totalSurvived: number;
  firstGameAt: number | null;
  lastGameAt: number | null;
}

export interface ClanMembership {
  id: string;
  name: string;
  tag: string;
  memberRole: ClanRole;
  joinedAt: number;
  wins: number;
  losses: number;
  memberCount: number;
}

export interface PublicProfileFull {
  profile: PlayerProfilePublic;
  achievements: AchievementEarned[];
  recentGames?: GameHistoryEntry[];
  clan: ClanMembership | null;
  friendshipStatus: FriendshipStatus;
  isOnline: boolean;
  roleStats?: PlayerRoleStats;
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
  ban: { id: string; reason: string; issuedByName: string; issuedAt: number; expiresAt: number } | null;
  mute: { id: string; reason: string; issuedByName: string; issuedAt: number; expiresAt: number } | null;
  warnings: { id: string; reason: string; issuedByName: string; issuedAt: number }[];
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
  peakOnline?: number;
  newUsersToday?: number;
  avgMatchSeconds?: number;
  voiceUsers?: number;
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

export interface LfgEntry {
  profileId: string;
  username: string;
  avatar: string;
  avatarUrl?: string | null;
  level: number;
  note: string;
  createdAt: number;
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
  type?: 'text' | 'voice' | 'image' | 'sticker' | 'invite';
  audioDuration?: number;
  replyToId?: string | null;
  viewOnce?: boolean;
  viewedAt?: number | null;
  /** reactorId → emoji */
  reactions?: Record<string, string>;
  createdAt: number;
  readAt: number | null;
}

// ── Clan Wars ─────────────────────────────────────────────────────────────
export type ClanWarStatus = 'pending' | 'active' | 'completed' | 'cancelled';

export interface ClanWar {
  id: string;
  challengerClanId: string;
  challengerClanName: string;
  defenderClanId: string;
  defenderClanName: string;
  status: ClanWarStatus;
  challengerWins: number;
  defenderWins: number;
  startedAt: number | null;
  endsAt: number | null;
  createdAt: number;
  winnerClanId: string | null;
}

// ── Economy ───────────────────────────────────────────────────────────────

export type GiftRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type TxType = 'grant' | 'deduct' | 'gift_sent' | 'gift_received' | 'daily_reward' | 'refund';

export interface GiftCatalogItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  imageUrl: string;
  rarity: GiftRarity;
  stars: number;
  price: number;
  active: boolean;
  category: string;
  limitedEdition: boolean;
  seasonalTag: string | null;
  isCurrentSeason?: boolean;
  displayOrder: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface GiftTimelineEntry {
  id: string;
  senderId: string;
  senderPublicId: number | null;
  senderName: string;
  senderAvatar: string;
  senderAvatarUrl: string | null;
  recipientId: string;
  receiverPublicId: number | null;
  receiverName: string;
  receiverAvatar: string;
  receiverAvatarUrl: string | null;
  giftId: string;
  giftName: string;
  giftIcon: string;
  giftImageUrl: string;
  giftRarity: GiftRarity;
  giftStars: number;
  coinCost: number;
  message: string;
  createdAt: number;
}

export interface GiftStats {
  totalReceived: number;
  totalSent: number;
  totalSpent: number;
  uniqueGiftTypesReceived: number;
  uniqueGiftTypesSent: number;
  legendaryReceivedCount: number;
  mostReceivedGiftName: string | null;
  mostSentGiftName: string | null;
}

export interface PinnedGiftEntry {
  giftId: string;
  giftName: string;
  giftIcon: string;
  giftImageUrl: string;
  giftRarity: GiftRarity;
  giftStars: number;
  pinnedAt: number;
}

export interface GiftReceivedNotification {
  giftId: string;
  giftName: string;
  giftIcon: string;
  giftImageUrl?: string;
  giftRarity: GiftRarity;
  senderName: string;
  senderAvatar: string;
  senderAvatarUrl: string | null;
  message: string;
}

export interface PlayerGift {
  id: string;
  recipientId: string;
  receiverPublicId: number | null;
  receiverName: string;
  senderId: string;
  senderPublicId: number | null;
  senderUsername: string;
  senderAvatar: string;
  senderAvatarUrl: string | null;
  giftId: string;
  giftKey: string;
  giftName: string;
  giftIcon: string;
  giftImageUrl: string;
  giftRarity: GiftRarity;
  giftStars: number;
  coinCost: number;
  message: string;
  transactionId: string;
  createdAt: number;
}

export interface GiftDetail extends GiftCatalogItem {
  totalSent: number;
  senders: Array<{
    senderId: string;
    senderUsername: string;
    senderAvatar: string;
    senderAvatarUrl: string | null;
    message: string;
    sentAt: number;
  }>;
}

export interface CoinTransaction {
  id: string;
  playerId: string;
  publicId: number | null;
  type: TxType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  relatedUserId: string | null;
  relatedGiftId: string | null;
  description: string;
  grantedBy: string | null;
  createdAt: number;
}

// ── Replays ───────────────────────────────────────────────────────────
export type ReplayWinner = 'mafia' | 'town' | 'draw';

export interface ReplayEvent {
  t: number;
  type: string;
  data: Record<string, any>;
}

export interface GameReplaySummary {
  id: string;
  roomName: string;
  playerCount: number;
  durationMs: number;
  startedAt: number;
  endedAt: number;
  winner: ReplayWinner;
  createdAt: number;
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

export interface GameReplayFull extends GameReplaySummary {
  events: ReplayEvent[];
  playerRoles: Record<string, { username: string; role: string; team: string; alive: boolean }>;
}

// ── Community Hub ───────────────────────────────────────────────────────
// Completely separate from Mafia game rooms/state.

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
  parentId?: string | null;
  gifUrl?: string | null;
  likes?: number;
  likedByMe?: boolean;
  reactions?: Record<string, number>;
  myReaction?: string | null;
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
  actorId?: string | null;
  actorAvatarUrl?: string | null;
  postId?: string | null;
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

export interface CommunityReport {
  id: string;
  postId: string;
  postContent: string | null;
  postAuthorId: string | null;
  reporterId: string;
  reporterName: string;
  reason: string;
  status: string;
  createdAt: number;
}

export type CommunityBadge = 'verified' | 'owner' | 'moderator' | 'creator' | 'speaker' | 'philosopher' | 'veteran' | 'top_detective' | 'mafia_master';
export type PostType = 'text' | 'image' | 'gif' | 'video' | 'poll' | 'movie_rec' | 'series_rec' | 'book_rec' | 'music_rec' | 'philosophy' | 'voice';
export type FeedCategory = 'all' | 'following' | 'friends' | 'void_news' | 'mr_max' | 'clans' | 'trending';

export interface PollOption { id: string; text: string; }
export interface PollResult { option: PollOption; count: number; percent: number; }

export interface CommunityPostV2 extends CommunityPost {
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
  reactions?: Record<string, number>;  // emoji → count
  myReaction?: string | null;
  audioUrl?: string | null;
  editedAt?: number | null;
}

export interface CommunityLeaderboardEntry {
  playerId: string;
  username: string;
  avatarUrl: string | null;
  score: number;
  rank: number;
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
  };
}

export interface CommunitySearchResult {
  posts: CommunityPostV2[];
  people: CommunityProfileV2[];
  hashtags: Array<{ hashtag: string; count: number }>;
  lounges: CommunityLounge[];
  clans: Array<{ id: string; name: string; tag: string; description: string; memberCount: number; imageUrl: string; wins: number; losses: number }>;
}
