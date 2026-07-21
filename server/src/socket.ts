import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData,
  RoomPublic, ChatMessage, ok, err, Room, Player, Phase, GameSettings,
  ReportReason, NightSummary, LiveRoomInfo, LiveRoomPlayer,
} from './types/index.js';
import {
  createRoom, getRoom, getRoomByCode, deleteRoom, addPlayer, addSpectatorPlayer, removePlayer, reseatForDonModerator,
  getPlayerBySocket, toPublicRoom, getAlivePlayers, getHostPlayer,
  toRoomListItem, getAllRooms, getPlayerByProfile, transferHost, rematchRoom,
  setPlayerAvatarUrl, enqueueForNextRound, dequeueFromNextRound, promoteQueuedPlayers,
  becomeSpectator, becomePlayer,
} from './services/roomService.js';
import {
  startGame, setPhase, advancePhase, submitNightAction, submitVote, submitNomination,
  checkWin, buildGameOverResult, allNightActionsSubmitted, getInvestigationResult,
  getTrackResult, resolveVotes,
  submitDonCheck, submitSheriffCheck, submitMafiaKillVote, submitDoubleEliminationVote,
  allMafiaKillVotesSubmitted, allDoubleElimVotesSubmitted,
} from './services/gameService.js';
import {
  createPlayerMessage, createSystemMessage, addMessage, validateChat,
} from './services/chatService.js';
import { registerCheckersHandlers, handleCheckersDisconnect } from './checkers.js';
import { registerJokerHandlers, handleJokerDisconnect } from './joker.js';
import { registerLudoHandlers, handleLudoDisconnect } from './ludo.js';
import { registerWWWHandlers, handleWWWDisconnect } from './www.js';
import { registerUnoHandlers, handleUnoDisconnect } from './uno.js';
import { registerBlackoutHandlers, handleBlackoutDisconnect } from './blackout.js';
import { registerAliasHandlers, handleAliasDisconnect } from './alias.js';
import { registerDrawHandlers, handleDrawDisconnect } from './draw.js';
import { registerCodenamesHandlers, handleCodenamesDisconnect } from './codenames.js';
import { registerSpyfallHandlers, handleSpyfallDisconnect } from './spyfall.js';
import { registerLiesHandlers, handleLiesDisconnect } from './lies.js';
import { registerIQHandlers } from './iq.js';
import { registerMaxPuzzleHandlers } from './maxpuzzle.js';
import { addCrown as ganabAddCrown, listCrowned as ganabListCrowned } from './services/ganabService.js';
import { timerService } from './services/timerService.js';
import { getRole } from './services/roleService.js';
import {
  getOrCreatePlayer, getPlayer, getAllPlayers, toPublicProfile, addGameResult,
  getActiveBan, getActiveMute, findSocketByProfile,
  registerWithEmail, authenticateWithEmail,
  addXP, getCosmetics, equipCosmetic, getNameColors, grantStarterCosmetics,
  incrementSpaceKnockouts, getKnockoutLeaderboard, getWinsLeaderboard, getLevelLeaderboard,
  getLeaderboard, getPlayersFast,
  getPlayerByFriendCode, setGrantedModLevel,
  updateAvatarUrl, updateUsername,
} from './services/playerService.js';
import {
  markOnline, markOffline, sendFriendRequest, acceptFriend, declineFriend,
  removeFriend, getFriends, getInvitablePeople, getPendingRequests, getOnlineCount, getFriendshipStatus, isOnline, getSpectatingCount,
  setLoungePresence, clearLoungePresence, getFriendIds, getPlayerStatus,
  setInvisible, isInvisible, setGhost, isGhost, getPeakOnline, getOnlineCountRaw,
  getFriendSuggestions,
} from './services/friendService.js';
import {
  checkAndAwardChallenges, getDailyQuestsForPlayer,
} from './services/challengeService.js';
import { checkAchievements, getPlayerAchievements } from './services/achievementService.js';
import { recordGame, getPlayerHistory, getPlayerRoleStats, getPlayersLastRolesInRoom } from './services/gameHistoryService.js';
import {
  createClan, getClan, getClanByPlayer, getClanMembershipByPlayer, getAllClans, getClanMembers, joinClan, leaveClan,
  setClanMemberRole, addClanModLog, getClanModLogs, setClanImage,
} from './services/clanService.js';
import {
  challengeClan, acceptWar, declineWar, recordWarGame, getActiveWar, getWarHistory,
} from './services/clanWarService.js';
import {
  canDo, banPlayer, unbanPlayer, mutePlayer, unmutePlayer,
  warnPlayer, createReport, getReports, resolveReport, getLogs, getModPlayers, getBannedPlayers, logKick,
  addModNote, freezeAccount, unfreezeAccount, renamePlayer,
  getPlayerDetail, assignReport, getDashboardDbStats, addModLog,
} from './services/moderationService.js';
import {
  canJoin as voiceCanJoin,
  canTransmitVoice,
  join as voiceJoin,
  leave as voiceLeave,
  getMembers as voiceGetMembers,
  getSharedChannel as voiceGetSharedChannel,
  removeFromChannel as voiceRemoveFromChannel,
  VoiceChannel,
} from './services/voiceService.js';
import { sql } from './db.js';
import bcrypt from 'bcryptjs';
import { sendPushToUser } from './pushService.js';
import {
  getOrCreateConversation, listConversations, sendMessage, sendVoiceDm, sendImageDm, getMessages, markRead, getTotalUnread,
  toggleDmReaction, markViewOnceViewed, deleteConversationForUser, sendCallLog,
} from './services/dmService.js';
import {
  getCoins, claimDailyReward, grantCoins, deductCoins, refundGift,
  getTransactions, getAllTransactions,
  getGiftCatalog, createGift, updateGift,
  sendGift, getPlayerGifts, getGiftDetail,
  getGiftsSent, getGiftTimeline, getGiftStats,
  getPinnedGifts, pinGift, unpinGift, hideGift, unhideGift, getHiddenGifts,
  purchaseCosmeticItem, checkProfileCompletionBonus,
} from './services/coinService.js';
import { applyReferral, getReferralCount } from './services/referralService.js';
import { updateRatingsAfterGame, getPlayerRating, getRankedLeaderboard, getRankTier } from './services/ratingService.js';
import { getActiveSeason, getSeasonLeaderboard, getMySeasonHistory } from './services/seasonService.js';
import {
  startReplay, recordEvent, finishReplay, listReplays, getReplay, getMyReplays,
} from './services/replayService.js';
import {
  listNews, createNews, deleteNews,
  listRecommends, createRecommend, deleteRecommend,
  listThoughts, createThought, deleteThought,
  listFeed, createPost, deletePost, toggleLike, getComments, addComment, deleteComment, reportPost,
  toggleCommentLike, toggleCommentReaction, editPost, notifyMentions,
  listCommunityReports, resolveCommunityReport,
  follow, unfollow, getCommunityProfile,
  listEvents, createEvent, joinEvent, leaveEvent,
  createNotification, notifyFollowers, notifyAllPlayers,
  listNotifications, getUnreadNotificationCount, markNotificationsRead,
  listLoungeRows, getLoungeRow, rowToLounge, createLounge, deleteLounge, setLoungeLive,
  communityBanPlayer, communityUnbanPlayer, getActiveCommunityBan,
  updateCommunityProfile, getCommunityProfileV2, getPlayerBadges,
  assignBadge, revokeBadge, setShowcaseAchievement, clearShowcaseSlot,
  getPrivacySettings, setPrivacySettings,
  createPostV2, listFeedV2, getUserPosts, votePoll, togglePostSave, getSavedPosts,
  createStory, listActiveStories, deleteStory, recordStoryView, getStoryViewers,
  toggleStoryReaction, getStoryReactions,
  getUnreadStoryReactionCount, markStoryReactionNotificationsRead,
  pinPost, featurePost, hidePost, logCommunityModAction, getCommunityModLogs,
  listPeopleDirectory, getFollowersList, getFollowingList,
  searchCommunity, upsertOnlineSeen, getOnlineMembers, computeTrending, recalcReputation,
  extractHashtags, generateAnonymousName,
  togglePostReaction, getPostReactions, getWeeklyLeaderboard, getPostById,
} from './services/communityService.js';
import {
  listDebates, getDebateFull, createDebate, joinDebate, postArgument, voteDebate, closeDebate,
  startDebate, advancePhase as advanceDebatePhase, skipPhase, raiseHand, lowerHand, getRaisedHands, promoteSpeaker,
  PHASE_DURATION_SECONDS, getActiveSide as getDebateActiveSide,
} from './services/debateService.js';
import { voiceJoin as debateVoiceJoin, voiceLeave as debateVoiceLeave, getVoicePeers as debateGetVoicePeers } from './services/debateVoiceService.js';
import { recordActivity, getFriendActivityFeed } from './services/activityService.js';
import { getPetData, addPetXp } from './services/petService.js';
import { createTournament, joinTournament, leaveTournament, startTournament, deleteTournament, listOpenTournaments, getTournament } from './services/tournamentService.js';
import {
  adminSearchUser, adminGetUserProfile, issueWarning, suspendUser, liftSuspension,
  muteUser, unmuteUser, setProfileControls,
  adminDeletePost, adminRestorePost, adminDeleteComment, adminRestoreComment,
  adminDeleteDebate, adminRestoreDebate, adminSetDebateFlags,
  listAllReports, listDeletedContent, getAdminAuditLogs,
} from './services/adminService.js';
import {
  join as loungeJoin, leave as loungeLeave, getMembers as loungeGetMembers,
  getMemberByPlayerId as loungeGetMemberByPlayerId,
  setRole as loungeSetRole, setHandRaised as loungeSetHandRaised,
  removeMember as loungeRemoveMember, getCounts as loungeGetCounts,
} from './services/loungeVoiceService.js';
import type { CommunityLoungeMember, CommunityLoungeRole } from './types/index.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// ── TURN / ICE server config ──────────────────────────────────────────
// Centralised in server/src/lib/iceConfig.ts.  Reads Railway env vars:
// TURN_URL, TURN_USERNAME, TURN_CREDENTIAL, FORCE_TURN_RELAY, STUN_URL.
import { buildIceConfig } from './lib/iceConfig.js';

// ── Rate limiting ─────────────────────────────────────────────────────
const rateLimits = new Map<string, { count: number; resetAt: number }>();
function rateOk(socketId: string, limit = 15): boolean {
  const now = Date.now();
  const r = rateLimits.get(socketId);
  if (!r || now > r.resetAt) { rateLimits.set(socketId, { count: 1, resetAt: now + 1000 }); return true; }
  if (r.count >= limit) return false;
  r.count++; return true;
}

// ── Chat spam / flood protection ──────────────────────────────────────
const chatCooldowns = new Map<string, number>();   // key → lastMessageAt
const chatWindows   = new Map<string, number[]>(); // key → recent timestamps
const lastChatMsg   = new Map<string, string>();   // key → last message text
const CHAT_COOLDOWN_MS = 1200;
const CHAT_FLOOD_WINDOW_MS = 4000;
const CHAT_FLOOD_LIMIT = 5;

function chatRateOk(key: string, text: string): { ok: boolean; error?: string } {
  const now = Date.now();
  const last = chatCooldowns.get(key);
  if (last && now - last < CHAT_COOLDOWN_MS) return { ok: false, error: 'ძალიან სწრაფად აგზავნი შეტყობინებებს.' };
  if (lastChatMsg.get(key) === text.trim()) return { ok: false, error: 'არ გაიმეორო ერთი და იგივე შეტყობინება.' };
  const window = (chatWindows.get(key) ?? []).filter(t => now - t < CHAT_FLOOD_WINDOW_MS);
  if (window.length >= CHAT_FLOOD_LIMIT) return { ok: false, error: 'ზედმეტი შეტყობინება. ცოტა გაჩერდი.' };
  window.push(now);
  chatCooldowns.set(key, now);
  chatWindows.set(key, window);
  lastChatMsg.set(key, text.trim());
  return { ok: true };
}

// ── Session concurrency (one active socket per profile) ───────────────
const activeSessions = new Map<string, string>(); // profileId → socketId

// Pending incoming 1:1 calls, keyed by the callee's profileId. Lets a phone
// that briefly dropped its socket (iOS backgrounding) get the ring re-delivered
// the instant it reconnects/re-auths, within the ring window.
interface PendingCall {
  callerId: string; conversationId: string; roomId: string; video: boolean;
  fromUsername: string; fromAvatar: string; fromAvatarUrl: string | null; at: number;
}
const pendingCalls = new Map<string, PendingCall>();
const PENDING_CALL_TTL = 40000;
function deliverPendingCall(socket: import('socket.io').Socket, profileId: string): void {
  const pc = pendingCalls.get(profileId);
  if (!pc) return;
  if (Date.now() - pc.at > PENDING_CALL_TTL) { pendingCalls.delete(profileId); return; }
  socket.emit('dm:call_ring' as any, {
    roomId: pc.roomId, conversationId: pc.conversationId, video: pc.video,
    fromProfileId: pc.callerId, fromUsername: pc.fromUsername,
    fromAvatar: pc.fromAvatar, fromAvatarUrl: pc.fromAvatarUrl,
  });
}

function enforceSessionUniqueness(io: AppServer, profileId: string, newSocketId: string): void {
  const existing = activeSessions.get(profileId);
  if (existing && existing !== newSocketId) {
    const oldSock = io.sockets.sockets.get(existing);
    if (oldSock?.connected) {
      oldSock.emit('session:replaced', { reason: 'სხვა მოწყობილობიდან შესვლა დაფიქსირდა. ეს სესია დაიხურა.' });
      setTimeout(() => oldSock.disconnect(true), 300);
    }
  }
  activeSessions.set(profileId, newSocketId);
}

// ── Report rate limiting ──────────────────────────────────────────────
// key: reporterId+targetId+reason → lastReportAt (ms)
const reportCooldowns = new Map<string, number>();
// key: reporterId → timestamps of last 10min reports
const reportWindows = new Map<string, number[]>();

function reportRateOk(reporterId: string, targetId: string, reason: string): { ok: boolean; error?: string } {
  const now = Date.now();
  const cooldownKey = `${reporterId}:${targetId}:${reason}`;
  const lastReport = reportCooldowns.get(cooldownKey);
  if (lastReport && now - lastReport < 60_000) {
    return { ok: false, error: 'Please wait before reporting the same player for the same reason.' };
  }
  const windowKey = reporterId;
  const window = (reportWindows.get(windowKey) ?? []).filter(t => now - t < 600_000);
  if (window.length >= 5) {
    return { ok: false, error: 'You are reporting too frequently. Please wait a few minutes.' };
  }
  reportCooldowns.set(cooldownKey, now);
  window.push(now);
  reportWindows.set(windowKey, window);
  return { ok: true };
}

// ── Debate phase timers ───────────────────────────────────────────────
const debatePhaseTimers = new Map<string, NodeJS.Timeout>();

function scheduleDebatePhaseAdvance(io: AppServer, debateId: string, durationSeconds: number) {
  const existing = debatePhaseTimers.get(debateId);
  if (existing) clearTimeout(existing);
  if (durationSeconds <= 0) return;
  const t = setTimeout(async () => {
    debatePhaseTimers.delete(debateId);
    try {
      const updated = await advanceDebatePhase(debateId);
      io.to(`debate:${debateId}`).emit('debate:phase_update', updated as any);
      const nextDur = (PHASE_DURATION_SECONDS as any)[updated.phase] ?? 0;
      if (nextDur > 0) scheduleDebatePhaseAdvance(io, debateId, nextDur);
    } catch {}
  }, durationSeconds * 1000);
  debatePhaseTimers.set(debateId, t);
}

// ── Maintenance mode ─────────────────────────────────────────────────
let maintenanceMode = false;

// ── Lobby auto-start timers ───────────────────────────────────────────
const autoStartTimers = new Map<string, NodeJS.Timeout>();

function cancelAutoStart(roomId: string): void {
  const t = autoStartTimers.get(roomId);
  if (t) { clearTimeout(t); autoStartTimers.delete(roomId); }
}

// ── Spectate queues (roomId → socketIds waiting) ──────────────────────
const spectateQueues = new Map<string, string[]>();

// ── Host disconnect grace period (roomId → reconnect data) ────────────
const HOST_GRACE_MS = 30_000; // extended to 30s to cover slower reconnects
interface HostGraceEntry { timer: ReturnType<typeof setTimeout>; profileId: string | null; hostName: string; }
const hostGraceTimers = new Map<string, HostGraceEntry>();

// ── Lobby disconnect grace period (playerId → cleanup timer) ──────────
// Non-host players who disconnect in the lobby get 60s to reconnect before
// their slot is freed. This is the same pattern used during active games.
const LOBBY_GRACE_MS = 60_000;
interface LobbyGraceEntry { timer: ReturnType<typeof setTimeout>; roomId: string; playerName: string; }
const lobbyGraceTimers = new Map<string, LobbyGraceEntry>();

// ── Global Lobby Chat (in-memory, ephemeral) ──────────────────────────
interface LobbyMsg {
  id: string; profileId: string; username: string;
  avatar: string; avatarUrl: string | null;
  text: string; level: number; nameColor: string | null; createdAt: number;
}
const _lobbyChat: LobbyMsg[] = [];
const MAX_LOBBY_CHAT = 200;

// ── Per-clan chat (in-memory, ephemeral) ──────────────────────────────
interface ClanChatMsg extends LobbyMsg { clanId: string; }
const _clanChat = new Map<string, ClanChatMsg[]>(); // clanId → messages
const MAX_CLAN_CHAT = 200;

// ── Virtual Space state ───────────────────────────────────────────────
interface SpacePlayer { socketId: string; name: string; bodyColor: string; glowColor: string; mask: string; hat: string; pet: string; form: string; profileId: string | null; x: number; y: number; seat?: string | null; hp: number; }
const SPACE_MAX_HP = 10;
const _spaceHitAt = new Map<string, number>(); // attackerSocketId → last hit ms (cooldown)
const _duelOpponent = new Map<string, string>();          // socketId → opponent socketId (active 1v1 duel)
const _duelPending  = new Map<string, string>();          // targetSocketId → challengerSocketId (unanswered invite)
const _duelPendingTimer = new Map<string, NodeJS.Timeout>(); // targetSocketId → auto-expire timer
const DUEL_HP = 36;                                       // fresh HP for both fighters when a duel starts
function _clearDuel(socketId: string) {
  const opp = _duelOpponent.get(socketId);
  if (opp) _duelOpponent.delete(opp);
  _duelOpponent.delete(socketId);
  // Drop any pending invite involving this socket (as target or challenger).
  const t1 = _duelPendingTimer.get(socketId); if (t1) { clearTimeout(t1); _duelPendingTimer.delete(socketId); }
  _duelPending.delete(socketId);
  for (const [target, challenger] of _duelPending) {
    if (challenger === socketId) {
      const t = _duelPendingTimer.get(target); if (t) { clearTimeout(t); _duelPendingTimer.delete(target); }
      _duelPending.delete(target);
    }
  }
}
// ── Rock-Paper-Scissors ("ჯეირანი") ─────────────────────────────────
type RpsChoice = 'rock' | 'paper' | 'scissors';
interface RpsGame { aSocketId: string; aName: string; bSocketId: string; bName: string; aPick?: RpsChoice; bPick?: RpsChoice; round: number; aWins: number; bWins: number; }
const _rpsPending      = new Map<string, string>();          // targetSocketId → challengerSocketId
const _rpsPendingTimer = new Map<string, NodeJS.Timeout>();
const _rpsGames        = new Map<string, RpsGame>();         // key = `${a}:${b}` (sorted)
function _rpsKey(a: string, b: string) { return a < b ? `${a}:${b}` : `${b}:${a}`; }
function _clearRps(socketId: string) {
  const t1 = _rpsPendingTimer.get(socketId); if (t1) { clearTimeout(t1); _rpsPendingTimer.delete(socketId); }
  _rpsPending.delete(socketId);
  for (const [target, challenger] of _rpsPending) {
    if (challenger === socketId) {
      const t = _rpsPendingTimer.get(target); if (t) { clearTimeout(t); _rpsPendingTimer.delete(target); }
      _rpsPending.delete(target);
    }
  }
  for (const [key, g] of _rpsGames) {
    if (g.aSocketId === socketId || g.bSocketId === socketId) _rpsGames.delete(key);
  }
}
function _rpsWinner(a: RpsChoice, b: RpsChoice): 'a' | 'b' | 'draw' {
  if (a === b) return 'draw';
  if ((a === 'rock' && b === 'scissors') || (a === 'paper' && b === 'rock') || (a === 'scissors' && b === 'paper')) return 'a';
  return 'b';
}

// ── Truth or Dare ("სიმართლე თუ მოქმედება") ─────────────────────────
const _todPending      = new Map<string, string>();
const _todPendingTimer = new Map<string, NodeJS.Timeout>();
function _clearTod(socketId: string) {
  const t1 = _todPendingTimer.get(socketId); if (t1) { clearTimeout(t1); _todPendingTimer.delete(socketId); }
  _todPending.delete(socketId);
  for (const [target, challenger] of _todPending) {
    if (challenger === socketId) { const t = _todPendingTimer.get(target); if (t) { clearTimeout(t); _todPendingTimer.delete(target); } _todPending.delete(target); }
  }
}
const TOD_TRUTHS = [
  'რომელია შენი ყველაზე სარცხვინო მომენტი?',
  'ვის ეტყოდი "მიყვარხარ" ახლა?',
  'რა არის შენი საიდუმლო ნიჭი?',
  'რომელი მოთამაშე მოგწონს აქ ყველაზე მეტად?',
  'რა გიკეთებია რაც არავის უთქვამს?',
  'რომელია შენი ყველაზე უცნაური ჩვევა?',
  'ბოლოს როდის იტირე და რატომ?',
  'რა გეზარება ცხოვრებაში ყველაზე მეტად?',
  'ვის დაურეკავდი ახლა თუ ერთი ზარის უფლება გექნებოდა?',
  'რომელია შენი ყველაზე დიდი შიში?',
  'რა ოცნება გაქვს რომელიც არავისთვის გითქვამს?',
  'რომელი სუპერძალა გინდა რომ გქონდეს?',
  'ვისზე გაგიწყრია ბოლო 1 კვირაში?',
  'რა გააკეთებდი მილიონი ლარი რომ გქონდეს?',
  'რომელია შენი ყველაზე სასაცილო ჩავარდნა?',
  'რამდენჯერ გატყუებულა ვინმეს?',
  'რა არის შენი guilty pleasure?',
  'რა არის ყველაზე საშიში რამ რაც გაგიკეთებია?',
  'ვისგან გინდა ბოდიშის მოხდა?',
  'რა იქნებოდა შენი ბოლო სიტყვები?',
];
const TOD_DARES = [
  'დაწერე ჩატში "მიყვარხარ" 3-ჯერ ზედიზედ! ❤️',
  'გაუკეთე კომპლიმენტი ყველას ჩატში! 💐',
  'დაწერე ჩატში სასაცილო ხუმრობა 30 წამში! 😂',
  'დაწერე ჩატში შენი საყვარელი სიმღერის სტრიქონი! 🎵',
  'დაწერე ჩატში 5 ემოჯი რომელიც შენს დღეს აღწერს! 🎭',
  'გამოიცანი რომელიმე მოთამაშის ასაკი ჩატში! 🔮',
  'დაწერე ჩატში რამე უცხო ენაზე! 🌍',
  'გაგზავნე 10 ემოჯი ზედიზედ ჩატში! 🚀',
  'დაწერე ჩატში პატარა ლექსი 4 სტრიქონზე! ✍️',
  'გადაუხადე პატივი ყველას ჩატში სათითაოდ! 🫡',
  'დაწერე ჩატში რატომ ხარ კარგი ადამიანი! 😇',
  'დაწერე ჩატში 3 რამ რისიც გეშინია! 👻',
  'მოიგონე გმირის სახელი საკუთარი თავისთვის! 🦸',
  'გაგზავნე ხმოვანი შეტყობინება სიმღერით! 🎤',
  'დაწერე ჩატში "sorry" 5 ენაზე! 🗣️',
  'მოთამაშეებს უთხარი რა მოგწონთ თითოეულში! 💫',
  'დაწერე ჩატში შენი ყველაზე უცნაური ფაქტი! 🤯',
  'ითამაშე "მე არასდროს" — დაწერე 3 რამ! 🙈',
  'დაწერე ჩატში რას აკეთებდი 1 საათის წინ! ⏰',
  'გაგზავნე ჩატში შენი საყვარელი საჭმლის სახელი 5-ჯერ! 🍕',
];

// ── Reaction Test (⚡ რეაქციის ტესტი) ────────────────────────────────
interface ReactionGame {
  spaceId: string;
  phase: 'joining' | 'countdown' | 'waiting' | 'go' | 'done';
  starterSocketId: string;
  players: Map<string, string>; // socketId → name
  goTime?: number; // Date.now() when GO signal was sent
  results: { socketId: string; name: string; ms: number }[];
  timers: NodeJS.Timeout[];
}
const _reactionGames = new Map<string, ReactionGame>(); // spaceId → game
const _reactionLeaderboard = new Map<string, Map<string, { name: string; wins: number }>>();  // spaceId → (socketId → {name, wins})
function _clearReactionGame(spaceId: string) {
  const g = _reactionGames.get(spaceId);
  if (g) { for (const t of g.timers) clearTimeout(t); }
  _reactionGames.delete(spaceId);
}

function _finishReaction(spaceId: string, io: any) {
  const g = _reactionGames.get(spaceId);
  if (!g) return;
  g.phase = 'done';
  g.results.sort((a, b) => a.ms - b.ms);
  // Update leaderboard — winner gets +1
  if (g.results.length > 0) {
    let lb = _reactionLeaderboard.get(spaceId);
    if (!lb) { lb = new Map(); _reactionLeaderboard.set(spaceId, lb); }
    const winner = g.results[0];
    const entry = lb.get(winner.socketId) || { name: winner.name, wins: 0 };
    entry.wins++;
    entry.name = winner.name;
    lb.set(winner.socketId, entry);
  }
  const lb = _reactionLeaderboard.get(spaceId);
  const leaderboard = lb ? [...lb.values()].sort((a, b) => b.wins - a.wins).slice(0, 10) : [];
  io.to(`space:${spaceId}`).emit('space:reaction_result' as any, { results: g.results, leaderboard });
  _clearReactionGame(spaceId);
}

interface SpaceDJState { videoId: string; startedAt: number; position: number; isPlaying: boolean; djName: string; volume: number; }
interface SpaceMeta {
  id: string; name: string; icon: string; theme: string; layout: string;
  maxPlayers: number; isPublic: boolean;
  ownerId: string | null; ownerName: string; code: string; createdAt: number;
  persistent: boolean; // seeded lounges survive being empty; user-created ones don't
}
// Shared cinema TV (watch party) — one synced video stream per space.
interface SpaceTVState { videoId: string; title: string; startedAt: number; position: number; isPlaying: boolean; byName: string; queue: { videoId: string; title: string }[]; skipVoters: Set<string>; }
const _spaces   = new Map<string, Map<string, SpacePlayer>>();
const _spaceDJ  = new Map<string, SpaceDJState>();
const _spaceTV  = new Map<string, SpaceTVState>();
const _spaceVoice = new Map<string, Map<string, string>>(); // spaceId → Map<socketId, playerName>
const _spaceMeta = new Map<string, SpaceMeta>();

// Seed the always-on public lounge.
_spaceMeta.set('main', {
  id: 'main', name: 'Void Lounge', icon: '🌌', theme: 'void', layout: 'penthouse',
  maxPlayers: 50, isPublic: true, ownerId: null, ownerName: 'Void Mafia',
  code: 'VOIDLOUNGE', createdAt: Date.now(), persistent: true,
});
_spaceMeta.set('beach', {
  id: 'beach', name: 'Wavefire Camp', icon: '🔥', theme: 'void', layout: 'beach',
  maxPlayers: 30, isPublic: true, ownerId: null, ownerName: 'Void Mafia',
  code: 'WAVEFIRE', createdAt: Date.now(), persistent: true,
});

// ── Premium Worlds (flagship 3D social spaces) ────────────────────────
// One shared instance per world id (beach_camp, …). Presence + seats + wave,
// spatial voice via its own world:voice-* mesh channel. Separate from both the
// classic 2D Virtual Spaces and the Backrooms.
interface WorldPlayer {
  socketId: string; name: string; profileId: string | null;
  bodyColor: string; glowColor: string; spec: any;
  x: number; z: number; ry: number; seatId: string | null;
}
interface WorldTV { videoId: string; title: string; startedAt: number; position: number; isPlaying: boolean; byName: string; }
const _worlds = new Map<string, Map<string, WorldPlayer>>();          // worldId → players
const _worldVoice = new Map<string, Map<string, string>>();           // worldId → Map<socketId, name>
const _worldTV = new Map<string, WorldTV>();                          // worldId → shared cinema
const WORLD_MAX = 40;
const WORLD_IDS = new Set(['beach_camp']);
const _hex6 = (v: any, fallback: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) ? v : fallback;

function _leaveWorldVoice(sid: string, io: AppServer): void {
  for (const [worldId, voices] of _worldVoice) {
    if (voices.has(sid)) {
      voices.delete(sid);
      io.to(`world:${worldId}`).emit('world:voice-peer-left' as any, { socketId: sid });
      if (voices.size === 0) _worldVoice.delete(worldId);
      return;
    }
  }
}
function _leaveWorld(sid: string, io: AppServer): void {
  _leaveWorldVoice(sid, io);
  for (const [worldId, room] of _worlds) {
    if (room.has(sid)) {
      room.delete(sid);
      io.to(`world:${worldId}`).emit('world:player-left' as any, { socketId: sid });
      if (room.size === 0) { _worlds.delete(worldId); _worldTV.delete(worldId); }
      return;
    }
  }
}

// ── Backrooms (3D horror mode) ────────────────────────────────────────
// Phase 2: multiplayer presence. Each instance is a shared procedural world
// keyed by a numeric `seed` so every player in it sees the same maze. State
// is ephemeral (in-memory) — the world itself is regenerated client-side.
interface BackroomsPlayer {
  socketId: string; name: string; profileId: string | null;
  x: number; y: number; z: number; ry: number; fl: boolean;
  skin: number; shirt: number;
}
interface BackroomsInstance { id: string; name: string; seed: number; maxPlayers: number; }
const _backrooms = new Map<string, Map<string, BackroomsPlayer>>();  // instanceId → players
const _backroomsMeta = new Map<string, BackroomsInstance>();
const _backroomsVoice = new Map<string, Map<string, string>>();       // instanceId → Map<socketId, name>
const _backroomsEventTimers = new Map<string, NodeJS.Timeout>();       // instanceId → next-event timer
const _backroomsVoidTimers = new Map<string, NodeJS.Timeout>();        // instanceId → next VOID timer
const _backroomsVoidSeq = new Map<string, NodeJS.Timeout[]>();         // instanceId → in-flight VOID stage timers

// The Void Mimic — a fake "player" wearing a real player's name and avatar.
// It walks the actual maze (grid pathing via the shared world hash), never
// joins voice (the tell), and strikes anyone who lets it get close.
interface BackroomsMimic {
  id: string; victimId: string;
  x: number; z: number;       // continuous position
  wx: number; wz: number;     // current waypoint (cell centre)
  bornAt: number;
  tick: NodeJS.Timeout;
}
const _backroomsMimics = new Map<string, BackroomsMimic>();            // instanceId → active mimic
const _backroomsMimicTimers = new Map<string, NodeJS.Timeout>();       // instanceId → next-mimic timer
const BACKROOMS_MAX = 16;
const BACKROOMS_CELL = 6; // must match the client engine's lattice spacing
const BACKROOMS_WALL_DENSITY = 0.3; // must match the client engine

// Mirror of the client engine's deterministic world hash — lets the server
// reason about the maze layout (e.g. don't drop a Void shelter in a sealed cell).
function _brHash3(x: number, z: number, s: number): number {
  let h = (x | 0) * 374761393 + (z | 0) * 668265263 + s * 2147483647;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}
function _brCellSealed(cx: number, cz: number, seed: number): boolean {
  return _brHash3(cx, cz, 11 + seed) < BACKROOMS_WALL_DENSITY
    && _brHash3(cx, cz + 1, 11 + seed) < BACKROOMS_WALL_DENSITY
    && _brHash3(cx, cz, 23 + seed) < BACKROOMS_WALL_DENSITY
    && _brHash3(cx + 1, cz, 23 + seed) < BACKROOMS_WALL_DENSITY;
}
const BACKROOMS_AMBIENT_SOUNDS = ['footstep', 'footstep', 'whisper', 'whisper', 'buzz', 'scrape', 'scream', 'vent', 'rumble'];
// Seed a few always-on public instances so players can regroup on the same map.
[
  { id: 'level0',  name: 'LEVEL 0 · THE HUB',   seed: 1337 },
  { id: 'level0n', name: 'LEVEL 0 · NIGHTSHIFT', seed: 90210 },
  { id: 'level0d', name: 'LEVEL 0 · DEEP',       seed: 44921 },
].forEach(i => _backroomsMeta.set(i.id, { ...i, maxPlayers: BACKROOMS_MAX }));

function _leaveBackroomsVoice(sid: string, io: AppServer): void {
  for (const [instanceId, voices] of _backroomsVoice) {
    if (voices.has(sid)) {
      voices.delete(sid);
      io.to(`backrooms:${instanceId}`).emit('backrooms:voice-peer-left' as any, { socketId: sid });
      if (voices.size === 0) _backroomsVoice.delete(instanceId);
      return;
    }
  }
}

function _leaveBackrooms(sid: string, io: AppServer): void {
  _leaveBackroomsVoice(sid, io);
  for (const [instanceId, room] of _backrooms) {
    if (room.has(sid)) {
      room.delete(sid);
      io.to(`backrooms:${instanceId}`).emit('backrooms:player-left' as any, { socketId: sid });
      if (room.size === 0) {
        _backrooms.delete(instanceId);
        const t = _backroomsEventTimers.get(instanceId);
        if (t) { clearTimeout(t); _backroomsEventTimers.delete(instanceId); }
        const vt = _backroomsVoidTimers.get(instanceId);
        if (vt) { clearTimeout(vt); _backroomsVoidTimers.delete(instanceId); }
        const seq = _backroomsVoidSeq.get(instanceId);
        if (seq) { seq.forEach(clearTimeout); _backroomsVoidSeq.delete(instanceId); }
        const mt = _backroomsMimicTimers.get(instanceId);
        if (mt) { clearTimeout(mt); _backroomsMimicTimers.delete(instanceId); }
        const mm = _backroomsMimics.get(instanceId);
        if (mm) { clearInterval(mm.tick); _backroomsMimics.delete(instanceId); }
      }
      return;
    }
  }
}

// ── Backrooms dynamic-event scheduler (synced per instance) ────────────
// Every ~20–45s an instance gets a random event that every client runs in
// sync: mostly a positional "strange sound" near a random player, sometimes a
// light flicker, rarely a full blackout. Psychological, not cheap jumpscares.
function _ensureBackroomsEvents(instanceId: string, io: AppServer): void {
  if (_backroomsEventTimers.has(instanceId)) return;
  _scheduleBackroomsEvent(instanceId, io);
}
function _scheduleBackroomsEvent(instanceId: string, io: AppServer): void {
  const delay = 20000 + Math.floor(Math.random() * 25000);
  const timer = setTimeout(() => {
    const room = _backrooms.get(instanceId);
    if (!room || room.size === 0) { _backroomsEventTimers.delete(instanceId); return; }
    const r = Math.random();
    if (r < 0.08) {
      io.to(`backrooms:${instanceId}`).emit('backrooms:event' as any, { kind: 'blackout', duration: 11000 + Math.floor(Math.random() * 5000) });
    } else if (r < 0.30) {
      io.to(`backrooms:${instanceId}`).emit('backrooms:event' as any, { kind: 'flicker', duration: 4500 + Math.floor(Math.random() * 4000) });
    } else {
      // Positional sound anchored near a random player (so "was that another
      // player… or something else?"). World coords are shared across the instance.
      const players = [...room.values()];
      const anchor = players[Math.floor(Math.random() * players.length)];
      const ang = Math.random() * Math.PI * 2;
      const d = 6 + Math.random() * 16;
      const sound = BACKROOMS_AMBIENT_SOUNDS[Math.floor(Math.random() * BACKROOMS_AMBIENT_SOUNDS.length)];
      io.to(`backrooms:${instanceId}`).emit('backrooms:event' as any, {
        kind: 'ambient', sound,
        x: anchor.x + Math.cos(ang) * d, z: anchor.z + Math.sin(ang) * d,
      });
    }
    _backroomsEventTimers.delete(instanceId);
    _scheduleBackroomsEvent(instanceId, io); // reschedule
  }, delay);
  _backroomsEventTimers.set(instanceId, timer);
}

// ── The VOID IS COMING event (staged, synced across the instance) ──────
// A cinematic warning builds tension for ~20s, then a black fog sweeps the
// corridors and every player is scattered to a random distant spot. Groups
// get separated; nobody knows where anyone ended up.
function _ensureBackroomsVoid(instanceId: string, io: AppServer): void {
  if (_backroomsVoidTimers.has(instanceId)) return;
  _scheduleBackroomsVoid(instanceId, io, true);
}
function _scheduleBackroomsVoid(instanceId: string, io: AppServer, first: boolean): void {
  const delay = first ? (70000 + Math.floor(Math.random() * 50000)) : (150000 + Math.floor(Math.random() * 120000));
  const timer = setTimeout(() => {
    _backroomsVoidTimers.delete(instanceId);
    const room = _backrooms.get(instanceId);
    if (!room || room.size === 0) return;
    _runVoidEvent(instanceId, io);
    _scheduleBackroomsVoid(instanceId, io, false); // reschedule
  }, delay);
  _backroomsVoidTimers.set(instanceId, timer);
}
function _runVoidEvent(instanceId: string, io: AppServer): void {
  const room = _backrooms.get(instanceId);
  if (!room || room.size === 0) return;
  // Track the staged timers so an empty→refill can't fire a stale stage.
  const prev = _backroomsVoidSeq.get(instanceId);
  if (prev) prev.forEach(clearTimeout);
  const seq: NodeJS.Timeout[] = [];
  _backroomsVoidSeq.set(instanceId, seq);

  // Escape mechanic: pick 2–3 green-light shelters near random players; anyone
  // standing inside one when the Void sweeps is spared. Skip sealed maze
  // pockets so a shelter is always reachable.
  const seed = _backroomsMeta.get(instanceId)?.seed ?? 0;
  const playersArr = [...room.values()];
  const shelters: { x: number; z: number }[] = [];
  const want = Math.min(3, Math.max(2, Math.ceil(playersArr.length / 4)));
  let guard = 0;
  while (shelters.length < want && guard++ < 24) {
    const p = playersArr[Math.floor(Math.random() * playersArr.length)];
    const ang = Math.random() * Math.PI * 2;
    const cells = 2 + Math.floor(Math.random() * 4); // ~12–30m away: reachable in 20s
    const scx = Math.round(p.x / BACKROOMS_CELL) + Math.round(Math.cos(ang) * cells);
    const scz = Math.round(p.z / BACKROOMS_CELL) + Math.round(Math.sin(ang) * cells);
    if (_brCellSealed(scx, scz, seed)) continue;
    shelters.push({ x: scx * BACKROOMS_CELL + BACKROOMS_CELL / 2, z: scz * BACKROOMS_CELL + BACKROOMS_CELL / 2 });
  }

  io.to(`backrooms:${instanceId}`).emit('backrooms:event' as any, { kind: 'void_warning', shelters });
  // Tension builds for ~20s, then the fog sweeps in.
  seq.push(setTimeout(() => {
    const r2 = _backrooms.get(instanceId);
    if (!r2 || r2.size === 0) return;
    io.to(`backrooms:${instanceId}`).emit('backrooms:event' as any, { kind: 'void_sweep' });
    // Scatter everyone shortly after the sweep peaks.
    seq.push(setTimeout(() => {
      const r3 = _backrooms.get(instanceId);
      if (!r3 || r3.size === 0) return;
      const SHELTER_R2 = 5.5 * 5.5;
      for (const p of r3.values()) {
        // Standing in a shelter → spared: no teleport, just the survival cue.
        if (shelters.some(s => (p.x - s.x) * (p.x - s.x) + (p.z - s.z) * (p.z - s.z) < SHELTER_R2)) {
          io.to(p.socketId).emit('backrooms:event' as any, { kind: 'void_spared' });
          continue;
        }
        const baseCx = Math.round(p.x / BACKROOMS_CELL), baseCz = Math.round(p.z / BACKROOMS_CELL);
        const ang = Math.random() * Math.PI * 2;
        const cells = 20 + Math.floor(Math.random() * 30);
        const nx = (baseCx + Math.round(Math.cos(ang) * cells)) * BACKROOMS_CELL + BACKROOMS_CELL / 2;
        const nz = (baseCz + Math.round(Math.sin(ang) * cells)) * BACKROOMS_CELL + BACKROOMS_CELL / 2;
        p.x = nx; p.z = nz;
        io.to(p.socketId).emit('backrooms:event' as any, { kind: 'void_teleport', x: nx, z: nz });
      }
      // Restore normality a few seconds after the scatter.
      seq.push(setTimeout(() => {
        _backroomsVoidSeq.delete(instanceId);
        if (_backrooms.get(instanceId)?.size) io.to(`backrooms:${instanceId}`).emit('backrooms:event' as any, { kind: 'void_end' });
      }, 4200));
    }, 3200));
  }, 20000));
}

// ── The Void Mimic ──────────────────────────────────────────────────────
function _ensureBackroomsMimic(instanceId: string, io: AppServer): void {
  if (_backroomsMimicTimers.has(instanceId)) return;
  _scheduleBackroomsMimic(instanceId, io);
}
function _scheduleBackroomsMimic(instanceId: string, io: AppServer): void {
  const delay = 90000 + Math.floor(Math.random() * 90000);
  const timer = setTimeout(() => {
    _backroomsMimicTimers.delete(instanceId);
    const room = _backrooms.get(instanceId);
    if (!room || room.size === 0) return;
    // Needs ≥2 players — the mimic wears someone ELSE's face.
    if (room.size >= 2 && !_backroomsMimics.has(instanceId)) _spawnBackroomsMimic(instanceId, io);
    _scheduleBackroomsMimic(instanceId, io);
  }, delay);
  _backroomsMimicTimers.set(instanceId, timer);
}
function _despawnBackroomsMimic(instanceId: string, io: AppServer): void {
  const m = _backroomsMimics.get(instanceId);
  if (!m) return;
  clearInterval(m.tick);
  _backroomsMimics.delete(instanceId);
  io.to(`backrooms:${instanceId}`).emit('backrooms:player-left' as any, { socketId: m.id });
}
function _spawnBackroomsMimic(instanceId: string, io: AppServer): void {
  const room = _backrooms.get(instanceId);
  if (!room || room.size < 2) return;
  const seed = _backroomsMeta.get(instanceId)?.seed ?? 0;
  const players = [...room.values()];
  const victim = players[Math.floor(Math.random() * players.length)];
  const others = players.filter(p => p.socketId !== victim.socketId);
  const identity = others[Math.floor(Math.random() * others.length)] ?? victim;
  // spawn 5–7 cells from the victim in an unsealed cell
  let sx = victim.x + 30, sz = victim.z;
  for (let i = 0; i < 20; i++) {
    const ang = Math.random() * Math.PI * 2;
    const cells = 5 + Math.floor(Math.random() * 3);
    const cx = Math.floor(victim.x / BACKROOMS_CELL) + Math.round(Math.cos(ang) * cells);
    const cz = Math.floor(victim.z / BACKROOMS_CELL) + Math.round(Math.sin(ang) * cells);
    if (_brCellSealed(cx, cz, seed)) continue;
    sx = cx * BACKROOMS_CELL + BACKROOMS_CELL / 2;
    sz = cz * BACKROOMS_CELL + BACKROOMS_CELL / 2;
    break;
  }
  const id = `mimic-${Math.random().toString(36).slice(2, 9)}`;
  io.to(`backrooms:${instanceId}`).emit('backrooms:player-joined' as any, {
    socketId: id, name: identity.name, profileId: null, x: sx, y: 1.6, z: sz, ry: 0, fl: false,
    skin: identity.skin, shirt: identity.shirt,
  });
  const SPEED = 1.8, TICK = 0.4;
  const m: BackroomsMimic = {
    id, victimId: victim.socketId, x: sx, z: sz, wx: sx, wz: sz, bornAt: Date.now(),
    tick: setInterval(() => {
      const r = _backrooms.get(instanceId);
      if (!r || r.size === 0) { _despawnBackroomsMimic(instanceId, io); return; }
      let victimP = r.get(m.victimId);
      if (!victimP) {
        // victim left → hunt whoever is nearest
        let best: BackroomsPlayer | null = null; let bd = Infinity;
        for (const p of r.values()) {
          const d = (p.x - m.x) * (p.x - m.x) + (p.z - m.z) * (p.z - m.z);
          if (d < bd) { bd = d; best = p; }
        }
        if (!best) { _despawnBackroomsMimic(instanceId, io); return; }
        m.victimId = best.socketId;
        victimP = best;
      }
      if (Date.now() - m.bornAt > 100_000) { _despawnBackroomsMimic(instanceId, io); return; }
      // Grid navigation: walk cell-to-cell through actual maze openings so it
      // looks like a real player moving, never phasing through walls.
      const dwx = m.wx - m.x, dwz = m.wz - m.z;
      const dw = Math.hypot(dwx, dwz);
      if (dw < 0.25) {
        const a = Math.floor(m.x / BACKROOMS_CELL), b = Math.floor(m.z / BACKROOMS_CELL);
        const D = BACKROOMS_WALL_DENSITY;
        const opts: { x: number; z: number; d: number }[] = [];
        const consider = (na: number, nb: number, blocked: boolean) => {
          if (blocked) return;
          const nx = na * BACKROOMS_CELL + BACKROOMS_CELL / 2, nz = nb * BACKROOMS_CELL + BACKROOMS_CELL / 2;
          opts.push({ x: nx, z: nz, d: (victimP!.x - nx) ** 2 + (victimP!.z - nz) ** 2 + Math.random() * 8 });
        };
        consider(a + 1, b, _brHash3(a + 1, b, 23 + seed) < D);
        consider(a - 1, b, _brHash3(a, b, 23 + seed) < D);
        consider(a, b + 1, _brHash3(a, b + 1, 11 + seed) < D);
        consider(a, b - 1, _brHash3(a, b, 11 + seed) < D);
        if (opts.length) {
          opts.sort((q, w) => q.d - w.d);
          m.wx = opts[0].x; m.wz = opts[0].z;
        }
      } else {
        const step = Math.min(dw, SPEED * TICK);
        m.x += dwx / dw * step;
        m.z += dwz / dw * step;
      }
      const ry = Math.atan2(-(victimP.x - m.x), -(victimP.z - m.z));
      io.to(`backrooms:${instanceId}`).emit('backrooms:player-moved' as any, { socketId: m.id, x: m.x, y: 1.6, z: m.z, ry, fl: false });
      // Strike anyone who lets it get close (after a 6s grace so it can't
      // spawn-kill), then reveal and vanish.
      if (Date.now() - m.bornAt > 6000) {
        for (const p of r.values()) {
          const d2 = (p.x - m.x) * (p.x - m.x) + (p.z - m.z) * (p.z - m.z);
          if (d2 >= 1.6 * 1.6) continue;
          const bx = Math.round(p.x / BACKROOMS_CELL), bz = Math.round(p.z / BACKROOMS_CELL);
          const ang = Math.random() * Math.PI * 2;
          const cells = 20 + Math.floor(Math.random() * 30);
          const nx = (bx + Math.round(Math.cos(ang) * cells)) * BACKROOMS_CELL + BACKROOMS_CELL / 2;
          const nz = (bz + Math.round(Math.sin(ang) * cells)) * BACKROOMS_CELL + BACKROOMS_CELL / 2;
          p.x = nx; p.z = nz;
          io.to(p.socketId).emit('backrooms:event' as any, { kind: 'mimic_kill', x: nx, z: nz });
          io.to(`backrooms:${instanceId}`).emit('backrooms:event' as any, { kind: 'mimic_reveal', x: m.x, z: m.z });
          _despawnBackroomsMimic(instanceId, io);
          return;
        }
      }
    }, TICK * 1000),
  };
  _backroomsMimics.set(instanceId, m);
}

// ── Space furniture (owner-built lounges) ─────────────────────────────
interface SpaceFurnitureItem { id: string; kind: string; x: number; y: number; scale: number; flip: boolean }
const SPACE_FURNITURE_KINDS = new Set([
  'sofa', 'chair', 'plant', 'lamp', 'bar', 'billiard', 'arcade', 'speaker',
  'piano', 'disco', 'art', 'candle', 'chess', 'fountain', 'statue', 'rug',
  'jukebox', 'neon_heart',
]);
const SPACE_FURNITURE_MAX = 40;
const _spaceFurniture = new Map<string, SpaceFurnitureItem[]>();        // spaceId → items (cache)
const _spaceFurnitureLoaded = new Set<string>();                        // spaceIds already loaded from DB
const _spaceFurnitureSaveTimer = new Map<string, NodeJS.Timeout>();     // debounced persistence

async function _loadSpaceFurniture(spaceId: string): Promise<SpaceFurnitureItem[]> {
  if (_spaceFurnitureLoaded.has(spaceId)) return _spaceFurniture.get(spaceId) ?? [];
  _spaceFurnitureLoaded.add(spaceId);
  try {
    const [row] = await sql`SELECT items FROM space_furniture WHERE space_id = ${spaceId}` as any[];
    const items: SpaceFurnitureItem[] = row?.items ? JSON.parse(row.items) : [];
    _spaceFurniture.set(spaceId, Array.isArray(items) ? items.slice(0, SPACE_FURNITURE_MAX) : []);
  } catch { _spaceFurniture.set(spaceId, []); }
  return _spaceFurniture.get(spaceId) ?? [];
}

function _saveSpaceFurniture(spaceId: string): void {
  const t = _spaceFurnitureSaveTimer.get(spaceId);
  if (t) clearTimeout(t);
  _spaceFurnitureSaveTimer.set(spaceId, setTimeout(() => {
    _spaceFurnitureSaveTimer.delete(spaceId);
    const items = JSON.stringify(_spaceFurniture.get(spaceId) ?? []);
    sql`
      INSERT INTO space_furniture (space_id, items, updated_at)
      VALUES (${spaceId}, ${items}, ${Date.now()})
      ON CONFLICT (space_id) DO UPDATE SET items = ${items}, updated_at = ${Date.now()}
    `.catch(() => {});
  }, 800));
}

/** Editing rights: owned spaces → the owner; ownerless lounges (main/clan) → staff. */
function _canEditSpace(meta: SpaceMeta, profileId: string | null, isStaff: boolean): boolean {
  if (meta.ownerId) return meta.ownerId === profileId;
  return isStaff;
}

const SPACE_THEMES = ['void', 'neon', 'cyber', 'sunset', 'mono', 'blood', 'gold'];
const SPACE_LAYOUTS = ['lounge', 'home', 'penthouse', 'beach'];
const SPACE_ICONS  = ['🌌','🎮','🎬','🎧','🔥','💎','🛸','🌃','⚡','🃏','👾','🎲'];

function _genSpaceCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  const pick = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  let code = '';
  do { code = `${pick(4)}-${pick(4)}`; } while ([..._spaceMeta.values()].some(m => m.code === code));
  return code;
}
function _findSpaceByCode(code: string): SpaceMeta | null {
  const norm = code.trim().toUpperCase().replace(/\s/g, '');
  for (const m of _spaceMeta.values()) {
    if (m.code.toUpperCase() === norm || m.id.toUpperCase() === norm) return m;
  }
  return null;
}
function _spaceOnlineCount(spaceId: string): number {
  return _spaces.get(spaceId)?.size ?? 0;
}
function _spaceOfSocket(socketId: string): string | null {
  for (const [spaceId, room] of _spaces) if (room.has(socketId)) return spaceId;
  return null;
}
function _canControlTv(spaceId: string, profileId: string | null): boolean {
  const meta = _spaceMeta.get(spaceId);
  if (!meta) return false;
  // Owned spaces: only the owner. Ownerless public lounges (main): anyone present.
  return !meta.ownerId || meta.ownerId === profileId;
}
function _publicSpaceMeta(m: SpaceMeta, online: number) {
  return {
    id: m.id, name: m.name, icon: m.icon, theme: m.theme, layout: m.layout,
    maxPlayers: m.maxPlayers, isPublic: m.isPublic,
    ownerName: m.ownerName, code: m.code, online, persistent: m.persistent,
  };
}
// Lazily seed a persistent, members-only lounge space for a clan.
function _ensureClanSpace(clanId: string, clanName: string): SpaceMeta {
  const id = `clan_${clanId}`;
  let meta = _spaceMeta.get(id);
  if (!meta) {
    meta = {
      id, name: `${clanName} Lounge`, icon: '⚔', theme: 'void', layout: 'penthouse',
      maxPlayers: 30, isPublic: false, ownerId: null, ownerName: clanName,
      code: _genSpaceCode(), createdAt: Date.now(), persistent: true,
    };
    _spaceMeta.set(id, meta);
  }
  return meta;
}

// Does this player own a given purchasable space theme? ('void' is always free.)
async function _ownsSpaceTheme(profileId: string | null, theme: string): Promise<boolean> {
  if (theme === 'void') return true;
  if (!profileId) return false;
  try {
    const c = await getCosmetics(profileId);
    return c.unlockedItems.includes(`sp_theme_${theme}`);
  } catch { return false; }
}

function _leaveSpace(sid: string, io: AppServer): void {
  for (const [spaceId, room] of _spaces) {
    if (room.has(sid)) {
      const pid = room.get(sid)?.profileId;
      if (pid) clearLoungePresence(pid);
      // Mid-duel exit → the opponent wins by forfeit.
      const opp = _duelOpponent.get(sid);
      if (opp) {
        const oppP = room.get(opp);
        const meP = room.get(sid);
        if (oppP) { oppP.hp = SPACE_MAX_HP; io.to(`space:${spaceId}`).emit('space:duel_end', { winnerName: oppP.name, loserName: meP?.name ?? '?', forfeit: true }); }
      }
      _clearDuel(sid);
      _clearRps(sid);
      _clearTod(sid);
      room.delete(sid);
      io.to(`space:${spaceId}`).emit('space:player-left', { socketId: sid });
      if (room.size === 0) {
        _spaces.delete(spaceId);
        _spaceDJ.delete(spaceId);
        _spaceTV.delete(spaceId);
        // Tear down user-created spaces when empty; keep seeded lounges alive.
        const meta = _spaceMeta.get(spaceId);
        if (meta && !meta.persistent) _spaceMeta.delete(spaceId);
      }
      return;
    }
  }
}
function _leaveSpaceVoice(sid: string, io: AppServer): void {
  for (const [spaceId, voices] of _spaceVoice) {
    if (voices.has(sid)) {
      voices.delete(sid);
      io.to(`space:${spaceId}`).emit('space:voice-peer-left', { socketId: sid });
      if (voices.size === 0) _spaceVoice.delete(spaceId);
      return;
    }
  }
}

function clearLobbyGrace(playerId: string): void {
  const entry = lobbyGraceTimers.get(playerId);
  if (entry) { clearTimeout(entry.timer); lobbyGraceTimers.delete(playerId); }
}

// ── Role-specific death messages ──────────────────────────────────────
const NIGHT_DEATH: Partial<Record<string, string>> = {
  sheriff:    'The badge falls silent. The town lost its protector.',
  doctor:     'The healer is gone. No one is safe tonight.',
  bodyguard:  'The guardian fell in the line of duty.',
  don:        'The Don has fallen — but who will take the throne?',
  cult_leader:'The Cult Leader is dead. The cult crumbles.',
  veteran:    'The Veteran fought to the last.',
  mayor:      'The Mayor is gone. The town is leaderless.',
  vigilante:  'The Vigilante fires no more.',
  spy:        "The Spy's final report goes unread.",
  escort:     'The Escort danced her last.',
  tracker:    "The Tracker's trail goes cold.",
  arsonist:   'The Arsonist burns out.',
  yakuza:     'The Yakuza enforcer falls. The clan is weakened.',
  shogun:     'A hidden blade is revealed too late.',
};
const VOTE_DEATH: Partial<Record<string, string>> = {
  jester:     '🃏 The Jester laughs from beyond the grave.',
  sheriff:    '⚖️ The town voted out one of their own. The badge was real.',
  doctor:     '⚖️ The healer is exiled. The town will regret this.',
  mafia:      '⚖️ Justice is served. A killer leaves the shadows.',
  don:        '⚖️ The Godfather is dethroned by his own people.',
  cult_leader:'⚖️ The Cult Leader is exposed and cast out.',
  maniac:     '⚖️ The Maniac smiles. You voted out a madman.',
  arsonist:   '⚖️ The Arsonist is extinguished.',
  yakuza:     '⚖️ The Yakuza enforcer is unmasked and cast out.',
  shogun:     '⚖️ A hidden ally is exposed. The Yakuza loses its shadow.',
};

function nightDeathMsg(name: string, role: string | null, lastWill: string | null | undefined): string {
  const flavour = role ? NIGHT_DEATH[role] : null;
  let msg = flavour
    ? `Dawn breaks. ${name} was found dead.\n${flavour}`
    : `Dawn breaks. ${name} was found dead.`;
  if (lastWill) msg += `\n📜 Last Will: "${lastWill}"`;
  return msg;
}

function voteDeathMsg(name: string, role: string | null, lastWill: string | null | undefined): string {
  const flavour = role ? VOTE_DEATH[role] : null;
  let msg = flavour
    ? `${name} was eliminated by vote.\n${flavour}`
    : `${name} was eliminated by vote.`;
  if (lastWill) msg += `\n📜 Last Will: "${lastWill}"`;
  return msg;
}

// ── Validation Schemas ────────────────────────────────────────────────
const CreateRoomSchema = z.object({
  name: z.string().min(1).max(24),
  roomName: z.string().max(30).optional().default(''),
  settings: z.record(z.unknown()).optional(),
  clanRoom: z.boolean().optional().default(false),
});

const JoinRoomSchema = z.object({
  code: z.string().length(6),
  name: z.string().min(1).max(24),
  isSpectator: z.boolean().optional().default(false),
  joinMode: z.enum(['player', 'spectator', 'next_round']).optional(),
  password: z.string().max(64).optional().default(''),
});

const ChatSchema = z.object({
  text: z.string().min(1).max(400),
  channel: z.enum(['room', 'mafia', 'yakuza', 'dead', 'spectator']),
});

const AuthSchema = z.object({
  uid: z.string().min(1).max(64),
  username: z.string().min(1).max(24),
  referralCode: z.string().max(8).optional(),
});

const ReportSchema = z.object({
  targetProfileId: z.string().min(1),
  roomId: z.string().nullable(),
  reason: z.enum([
    'cheating','offensive_language','voice_abuse','spamming',
    'inappropriate_nickname','harassment','game_sabotage','bug_abuse','other',
    'hate_speech','inappropriate_chat','toxic_behavior',
  ]),
  details: z.string().max(500).default(''),
});

// ── Smart presence notifications ──────────────────────────────────────
// Tell a player's friends when they start something worth joining (created a
// Mafia room, entered a Lounge). Online friends get a real-time toast; offline
// friends get a push. Rate-limited per actor so it can't spam.
const _activeNotifyAt = new Map<string, number>();
async function notifyFriendsActive(
  io: AppServer,
  actorId: string,
  payload: { kind: 'game' | 'lounge'; code: string; label: string; fromName: string },
): Promise<void> {
  try {
    if (isInvisible(actorId)) return; // invisible owners never ping friends
    const now = Date.now();
    if (now - (_activeNotifyAt.get(actorId) ?? 0) < 5 * 60_000) return; // ≤1 ping / 5 min
    _activeNotifyAt.set(actorId, now);
    const friendIds = await getFriendIds(actorId);
    if (!friendIds.length) return;
    const title = payload.kind === 'lounge' ? '🎬 Lounge' : '🎮 Mafia';
    const body = payload.kind === 'lounge'
      ? `${payload.fromName} ახლა ${payload.label}-შია`
      : `${payload.fromName}-მა შექმნა ოთახი`;
    for (const fid of friendIds) {
      const sock = findSocketByProfile(io as any, fid);
      if (sock) sock.emit('presence:friend_active', { ...payload, fromId: actorId });
      else sendPushToUser(fid, { title, body }).catch(() => {});
    }
  } catch { /* best-effort */ }
}

// ── Helpers ───────────────────────────────────────────────────────────
function broadcastRoom(io: AppServer, room: Room): void {
  for (const player of room.players.values()) {
    if (player.socketId) {
      io.to(player.socketId).emit('room:update', toPublicRoom(room, player.id));
    }
  }
  // Also update queued players
  for (const player of room.nextRoundQueue) {
    if (player.socketId) {
      io.to(player.socketId).emit('room:update', toPublicRoom(room, player.id));
    }
  }
}

function broadcastQueueUpdated(io: AppServer, room: Room): void {
  const nextRoundQueue = room.nextRoundQueue.map(p => ({
    id: p.id,
    socketId: p.socketId,
    name: p.name,
    avatar: p.avatar,
    avatarUrl: p.avatarUrl,
    isHost: false,
    isAlive: false,
    isConnected: p.isConnected,
    isReady: false,
    role: null,
    team: null,
    voteTarget: null,
    hasActed: false,
    seat: 0,
    profileId: p.profileId,
    isModerator: p.isModerator,
    moderatorLevel: p.moderatorLevel,
    isSpectator: true,
    isQueuedNextRound: true,
    queuePosition: p.queuePosition,
    deathType: null as any,
    foulCount: 0,
  }));
  io.to(room.id).emit('queue:updated', { nextRoundQueue });
  // Also to queued players
  for (const p of room.nextRoundQueue) {
    if (p.socketId) io.to(p.socketId).emit('queue:updated', { nextRoundQueue });
  }
}

function broadcastOnlineCount(io: AppServer): void {
  io.emit('online:count', { count: getOnlineCount() });
}

// ── Community Hub helpers (separate from Mafia game logic) ─────────────
async function requireOwnerLevel(profileId: string | null): Promise<void> {
  if (!profileId) throw new Error('Not authenticated.');
  const requester = await getPlayer(profileId);
  if (!requester || requester.moderatorLevel !== 'owner') throw new Error('Owner only.');
}

async function requireNotCommunityBanned(profileId: string): Promise<void> {
  const ban = await getActiveCommunityBan(profileId);
  if (ban) throw new Error(`You are banned from the Community Hub: ${ban.reason}`);
}

async function broadcastLoungeState(io: AppServer, loungeId: string): Promise<void> {
  const row = await getLoungeRow(loungeId);
  if (!row) return;
  const { listenerCount, speakerCount } = loungeGetCounts(loungeId);
  io.emit('community:lounge_update', rowToLounge(row, listenerCount, speakerCount));
}

function handleLoungeLeave(io: AppServer, socket: AppSocket): void {
  const loungeId = socket.data.loungeId;
  if (!loungeId) return;
  socket.data.loungeId = null;
  socket.leave(`lounge:${loungeId}`);
  const removed = loungeLeave(socket.id);
  for (const { loungeId: lid, remaining } of removed) {
    for (const peer of remaining) {
      io.to(peer.socketId).emit('lounge:peer-left', { socketId: socket.id });
    }
    const { listenerCount, speakerCount } = loungeGetCounts(lid);
    getLoungeRow(lid).then(async row => {
      if (!row) return;
      // Auto-delete user-created lounges when the owner leaves
      if (row.kind === 'lounge' && row.owner_id === socket.data.profileId) {
        for (const m of remaining) {
          io.to(m.socketId).emit('lounge:kicked' as any);
        }
        try { await sql`DELETE FROM community_lounges WHERE id = ${lid}`; } catch {}
        io.emit('community:lounge_removed' as any, { loungeId: lid });
      } else {
        io.emit('community:lounge_update', rowToLounge(row, listenerCount, speakerCount));
      }
    });
  }
}

function startPhaseTimer(io: AppServer, room: Room): void {
  timerService.stop(room.id);
  if (!room.timer || room.timer <= 0) return;

  timerService.start(
    room.id, room.timer,
    (remaining) => {
      room.timer = remaining;
      io.to(room.id).emit('room:timer', remaining);
    },
    async () => {
      room.timer = 0;
      const wasNight = room.phase === 'night';
      const wasSpeech = room.phase === 'speech';
      const wasMafiaKill = room.phase === 'mafia_kill';
      const wasSheriffCheck = room.phase === 'sheriff_check';
      const wasDonCheck = room.phase === 'don_check';
      const wasDoubleElimVote = room.phase === 'double_elim_vote';
      if (room.phase === 'voting' || room.phase === 'revote') announceVoteResult(io, room);
      advancePhase(room); const nextPhase = room.phase as Phase;
      // ── Replay: record phase change ──────────────────────────────────
      if (nextPhase !== 'game_over') {
        recordEvent(room.id, { t: Date.now() - room.startedAt, type: 'phase_change', data: { phase: nextPhase, round: room.day } });
      }
      // Don-mode night resolves after the Sheriff's check (or after mafia_kill when
      // there is no living Sheriff to skip through). Only announce once resolved.
      const resolvedDonNight = wasSheriffCheck || (wasMafiaKill && nextPhase !== 'sheriff_check');
      if (wasNight || resolvedDonNight) { announceNightResult(io, room); notifySpies(io, room); notifyTrackers(io, room); notifyCultConversions(io, room); notifyRoleblocked(io, room); }
      if (wasSpeech && nextPhase !== 'speech') announceSpeechEnd(io, room, nextPhase);
      if (wasDonCheck) broadcastSystemMsg(io, room, 'Don has completed the night check. Mafia selecting target...');
      if (wasDoubleElimVote) {
        const dm = room.donModeState;
        if (dm) {
          const yes = Object.values(dm.doubleEliminationVotes).filter(v => v).length;
          const no = Object.values(dm.doubleEliminationVotes).filter(v => !v).length;
          if (yes > no) broadcastSystemMsg(io, room, '⚖️ გადაწყვეტილება: ორივე მოთამაშე გაძევებულია.');
          else broadcastSystemMsg(io, room, '⚖️ გადაწყვეტილება: ორივე მოთამაშე რჩება.');
        }
      }
      if (nextPhase === 'don_check') {
        // Send private notification to Don only
        for (const p of room.players.values()) {
          if (p.role === 'don' && p.socketId && p.isAlive) {
            io.to(p.socketId).emit('game:notification', { title: '🌙 Don Check', body: 'Choose a player to check for Sheriff role.' });
          }
        }
      }
      if (nextPhase === 'mafia_kill') {
        for (const p of room.players.values()) {
          if (p.team === 'mafia' && p.socketId && p.isAlive) {
            io.to(p.socketId).emit('game:notification', { title: '🔫 Mafia Selection', body: 'All mafia must choose the same target to kill.' });
          }
        }
      }
      if (nextPhase === 'sheriff_check') {
        for (const p of room.players.values()) {
          if (p.role === 'sheriff' && p.socketId && p.isAlive) {
            io.to(p.socketId).emit('game:notification', { title: '🔎 Sheriff Check', body: 'Choose a player to investigate.' });
          }
        }
      }
      if (nextPhase === 'night') {
        io.to(room.id).emit('game:notification', { title: 'Night Falls', body: 'Perform your night action.' });
        // Push offline players
        for (const p of room.players.values()) {
          if (!p.socketId && p.profileId && p.isAlive && !p.isSpectator) {
            sendPushToUser(p.profileId, { title: '🌙 Night Falls', body: 'Return to the game — night action awaits.' }).catch(() => {});
          }
        }
      }
      if (nextPhase === 'voting') {
        // Push offline players
        for (const p of room.players.values()) {
          if (!p.socketId && p.profileId && p.isAlive && !p.isSpectator) {
            sendPushToUser(p.profileId, { title: '⚖️ Voting Has Begun', body: 'Cast your vote now!' }).catch(() => {});
          }
        }
      }
      // Notify the next speaker if they're offline
      if (nextPhase === 'speech' && room.speechOrder) {
        const speakerId = room.speechOrder[room.currentSpeakerIdx ?? 0];
        const speaker = speakerId ? room.players.get(speakerId) : null;
        if (speaker && !speaker.socketId && speaker.profileId) {
          sendPushToUser(speaker.profileId, { title: '🎙️ Your Turn to Speak', body: 'Come back — it is your turn!' }).catch(() => {});
        }
      }
      announceActiveEvent(io, room);
      if (nextPhase === 'game_over') await emitGameOver(io, room);
      broadcastRoom(io, room);
      enforceVoicePhaseRules(io, room);
      if (room.phase !== 'game_over') startPhaseTimer(io, room);
    },
  );
}

function broadcastSystemMsg(io: AppServer, room: Room, text: string): void {
  const msg = createSystemMessage(text);
  addMessage(room, msg);
  io.to(room.id).emit('chat:new', msg);
}

function announceActiveEvent(io: AppServer, room: Room): void {
  if (!room.activeEvent) return;
  const { icon, label, description } = room.activeEvent;
  broadcastSystemMsg(io, room, `${icon} ${label} — ${description}`);
  io.to(room.id).emit('game:notification', { title: label, body: description });
}

function getPlayerOrError(socket: AppSocket, room: Room): Player {
  const player = getPlayerBySocket(room, socket.id);
  if (!player) throw new Error('Player not found in room.');
  return player;
}

function getRoomFromSocket(socket: AppSocket): Room {
  const roomId = socket.data.roomId;
  if (!roomId) throw new Error('You are not in a room.');
  const room = getRoom(roomId);
  if (!room) throw new Error('Room not found.');
  return room;
}

async function emitGameOver(io: AppServer, room: Room): Promise<void> {
  const result = buildGameOverResult(room);

  // Record persistent game history
  try { await recordGame(room); } catch { /* non-fatal */ }

  // Release all voice mutes and reset voice state so players can freely talk after the game
  io.to(room.id).emit('voice:force-unmute');
  io.to(room.id).emit('voice:reset');

  // Emit spec:game_over with role reveals to spectators (safe — game is over)
  const roleReveals: Record<string, string> = {};
  for (const [pid, info] of Object.entries(result.allRoles)) {
    roleReveals[pid] = info.role;
  }
  io.to(`spec:${room.id}`).emit('spec:game_over', { roleReveals });

  // Send game:notification push event
  io.to(room.id).emit('game:notification', {
    title: 'Game Over',
    body: room.winner ? `${room.winner.charAt(0).toUpperCase() + room.winner.slice(1)} wins!` : 'Game ended.',
  });

  for (const p of room.players.values()) {
    if (p.socketId) io.to(p.socketId).emit('game:over', result);
    else if (p.profileId && !p.isSpectator) {
      const won = room.winner && p.team === room.winner;
      sendPushToUser(p.profileId, {
        title: won ? '🏆 You Won!' : '💀 Game Over',
        body: room.winner ? `${room.winner.charAt(0).toUpperCase() + room.winner.slice(1)} wins the game!` : 'The game has ended.',
      }).catch(() => {});
    }
    // Only participants who actually played (got a role) earn stats/XP —
    // spectators and players promoted from the queue at game over must not
    // receive a win/loss record for a game they never played.
    if (p.profileId && room.winner && p.role) {
      const won = p.team === room.winner;
      await addGameResult(p.profileId, won);

      // Award XP
      try {
        const roundsAlive = Math.min(room.day, 10);
        let xpAmount = won ? 150 : 50;
        xpAmount += Math.min(roundsAlive * 5, 50);

        // Check daily quests (3 simultaneous)
        const { totalBonus, anyCompleted } = await checkAndAwardChallenges(p.profileId, won, p.role, room.day, p.team);
        const challengeCompleted = anyCompleted;
        const challengeBonus = totalBonus;
        xpAmount += challengeBonus;

        const xpResult = await addXP(p.profileId, xpAmount);

        if (p.socketId) {
          io.to(p.socketId).emit('xp:gained', {
            amount: xpAmount,
            newXP: xpResult.newXP,
            newLevel: xpResult.newLevel,
            leveledUp: xpResult.leveledUp,
            challengeCompleted,
            challengeBonus,
          });
        }

        // Pet XP from game completion
        try {
          const petXpAmount = won ? 15 : 5;
          const petResult = await addPetXp(p.profileId, petXpAmount);
          if (p.socketId) {
            io.to(p.socketId).emit('pet:xp_gained', { amount: petXpAmount, ...petResult.data, leveled: petResult.leveled });
          }
        } catch { /* non-fatal */ }
      } catch { /* non-fatal */ }

      // Check and award achievements
      try {
        const newKeys = await checkAchievements(room, p.id);
        if (newKeys.length > 0 && p.socketId) {
          const allAchs = await getPlayerAchievements(p.profileId);
          const earned = allAchs.filter(a => newKeys.includes(a.key));
          io.to(p.socketId).emit('achievement:earned', { achievements: earned });
        }
      } catch { /* non-fatal */ }
    }
  }

  // Ranked ELO update
  if (room.settings.ranked && room.winner) {
    try {
      const winnerPlayers = [...room.players.values()].filter(p => !p.isSpectator && p.role && p.team === room.winner && p.profileId);
      const loserPlayers  = [...room.players.values()].filter(p => !p.isSpectator && p.role && p.team !== room.winner && p.profileId);
      const winnerIds = winnerPlayers.map(p => p.profileId as string);
      const loserIds  = loserPlayers.map(p => p.profileId as string);
      const roleMap: Record<string, string> = {};
      for (const p of room.players.values()) {
        if (p.profileId && p.role) roleMap[p.profileId] = p.role;
      }
      const eloResults = await updateRatingsAfterGame(winnerIds, loserIds, room.id, room.winner, roleMap);
      for (const [profileId, res] of eloResults) {
        const ratingRow = await getPlayerRating(profileId);
        const tier = ratingRow ? getRankTier(ratingRow.elo, ratingRow.isPlaced) : 'unranked';
        const playerSock = findSocketByProfile(io as any, profileId);
        if (playerSock) {
          (playerSock as any).emit('rated:elo_update', { eloChange: res.change, newElo: res.after, tier });
        }
      }
    } catch { /* non-fatal */ }
  }

  // ── Clan War game recording ───────────────────────────────────────────
  // If this room belongs to a clan and there's a winner, try to record the result
  // in any active war between the hosting clan and the opponent clan.
  if (room.clanId && room.winner) {
    try {
      // Collect profile IDs of players on the winning team
      const winningProfileIds = [...room.players.values()]
        .filter(p => !p.isSpectator && p.team === room.winner && p.profileId)
        .map(p => p.profileId as string);

      // Find which clans those winners belong to (including the room's own clan)
      const winnerClanIds = new Set<string>();
      for (const pid of winningProfileIds) {
        const membership = await getClanMembershipByPlayer(pid).catch(() => null);
        if (membership) winnerClanIds.add(membership.id);
      }

      // Only count the win if ALL winners are from one distinct clan
      if (winnerClanIds.size === 1) {
        const winnerClanId = [...winnerClanIds][0];

        // Find the other clan: gather all loser profile IDs
        const loserProfileIds = [...room.players.values()]
          .filter(p => !p.isSpectator && p.team !== room.winner && p.profileId)
          .map(p => p.profileId as string);

        const loserClanIds = new Set<string>();
        for (const pid of loserProfileIds) {
          const membership = await getClanMembershipByPlayer(pid).catch(() => null);
          if (membership) loserClanIds.add(membership.id);
        }

        if (loserClanIds.size === 1) {
          const loserClanId = [...loserClanIds][0];
          const updatedWar = await recordWarGame(room.id, winnerClanId, loserClanId).catch(() => null);
          if (updatedWar) {
            // Notify members of both clans
            const eventName = updatedWar.status === 'completed' ? 'clan:war_ended' : 'clan:war_started';
            for (const [, sock] of io.sockets.sockets) {
              const sid = (sock.data as SocketData).profileId;
              if (!sid) continue;
              const m = await getClanMembershipByPlayer(sid).catch(() => null);
              if (m && (m.id === updatedWar.challengerClanId || m.id === updatedWar.defenderClanId)) {
                sock.emit(eventName as any, { war: updatedWar });
              }
            }
          }
        }
      }
    } catch { /* non-fatal — war recording never breaks game flow */ }
  }

  // Resolve spectator predictions
  if (room.winner) {
    try {
      const preds = await sql`
        SELECT id, player_id, predicted FROM spectator_predictions
        WHERE room_id = ${room.id} AND correct IS NULL
      ` as any[];
      for (const pred of preds) {
        const correct = pred.predicted === room.winner ? 1 : 0;
        const xpEarned = correct ? 50 : 0;
        await sql`
          UPDATE spectator_predictions SET correct = ${correct}, xp_earned = ${xpEarned}
          WHERE id = ${pred.id}
        `;
        if (correct && pred.player_id) {
          try { await addXP(pred.player_id, xpEarned); } catch { /* non-fatal */ }
        }
        const spectator = [...room.players.values()].find(p => p.profileId === pred.player_id);
        if (spectator?.socketId) {
          io.to(spectator.socketId).emit('prediction:result', { correct: correct === 1, xpGained: xpEarned, winningTeam: room.winner! });
        }
      }
    } catch { /* non-fatal */ }
  }

  // ── Replay: save to DB ──────────────────────────────────────────────
  try {
    const endedAt = Date.now();
    recordEvent(room.id, { t: endedAt - room.startedAt, type: 'game_end', data: { winner: room.winner ?? 'draw' } });
    const playerRoles: Record<string, { username: string; role: string; team: string; alive: boolean }> = {};
    for (const p of room.players.values()) {
      if (!p.isSpectator && p.profileId) {
        playerRoles[p.profileId] = {
          username: p.name,
          role: p.role ?? 'unknown',
          team: p.team ?? 'unknown',
          alive: p.isAlive,
        };
      }
    }
    await finishReplay(room.id, { winner: room.winner ?? 'draw', endedAt, playerRoles });
  } catch { /* non-fatal */ }

  // ── Queue payout ────────────────────────────────────────────────────
  // The game is fully recorded — NOW queued spectators drop into the player
  // pool (next free seat each), so by the time the room returns to the lobby
  // they are seated players, not stuck in the spectator list. Runs after all
  // stats/history above so they never inherit a result for a game they
  // didn't play.
  try {
    const promoted = promoteQueuedPlayers(room);
    if (promoted.length > 0) {
      broadcastSystemMsg(io, room, `${promoted.map(p => `${p.name} (seat ${p.seat})`).join(', ')} joined the players for the next game.`);
      broadcastQueueUpdated(io, room);
      broadcastRoom(io, room);
    }
  } catch { /* non-fatal */ }
}

async function notifyMods(io: AppServer, type: string, message: string, targetName?: string): Promise<void> {
  const socketsWithProfile: Array<{ sock: import('socket.io').Socket; profileId: string }> = [];
  for (const [, sock] of io.sockets.sockets) {
    const profileId = (sock.data as SocketData).profileId;
    if (profileId) socketsWithProfile.push({ sock, profileId });
  }
  await Promise.all(socketsWithProfile.map(async ({ sock, profileId }) => {
    try {
      const profile = await getPlayer(profileId);
      if (profile?.isModerator) sock.emit('mod:notification', { type, message, targetName });
    } catch { /* ignore per-socket errors */ }
  }));
}

function announceSpeechEnd(io: AppServer, room: Room, nextPhase: Phase): void {
  if (nextPhase === 'voting') {
    const names = room.tribunalCandidates
      .map(id => room.players.get(id)?.name ?? '?')
      .join(', ');
    broadcastSystemMsg(io, room, `⚖️ Tribunal begins — nominated: ${names}.`);
  } else if (nextPhase === 'night') {
    broadcastSystemMsg(io, room, 'No one was nominated. Night begins.');
  }
}

function announceNightResult(io: AppServer, room: Room): void {
  const result = { killed: room.killedLastNight, saved: room.savedLastNight };
  io.to(room.id).emit('game:night_result', result);

  // Notify Mafia privately if they had votes but couldn't reach consensus
  const mafiaVoteCount = [...room.nightActions.values()]
    .filter(a => a.role === 'mafia' || a.role === 'don').length;
  if (mafiaVoteCount > 0 && room.mafiaKillTarget === null) {
    const msg = createSystemMessage("Your team couldn't agree on a target. No kill happened.", 'mafia');
    addMessage(room, msg);
  }

  // Night summary card (aggregate stats for all players)
  const summary: NightSummary = {
    day: room.day,
    totalTargeted: room.nightActions.size,
    saved: room.savedLastNight,
    eliminated: room.killedLastNight.map(k => {
      const p = room.players.get(k.id);
      return { name: k.name, role: p?.role ?? null };
    }),
  };
  io.to(room.id).emit('game:night_summary', summary);

  if (room.killedLastNight.length > 0) {
    for (const killed of room.killedLastNight) {
      const p = room.players.get(killed.id);
      broadcastSystemMsg(io, room, nightDeathMsg(killed.name, p?.role ?? null, killed.lastWill));
      if (p?.socketId && killed.id !== room.deathSpeakerId) {
        io.to(p.socketId).emit('voice:force-mute', { reason: 'You were eliminated.' });
      }
      if (!p?.socketId && p?.profileId) {
        sendPushToUser(p.profileId, { title: '💀 You Were Eliminated', body: 'Come back to watch the rest of the game.' }).catch(() => {});
      }
      // ── Replay: record death ─────────────────────────────────────────
      recordEvent(room.id, {
        t: Date.now() - room.startedAt,
        type: 'death',
        data: { playerId: killed.id, username: killed.name, role: p?.role ?? null, team: p?.team ?? null, cause: 'night_kill', round: room.day },
      });
    }
  } else if (room.savedLastNight) {
    broadcastSystemMsg(io, room, 'Dawn breaks. Everyone survived the night.');
  } else {
    broadcastSystemMsg(io, room, 'Dawn breaks. The night passed quietly.');
  }
}

function notifyTrackers(io: AppServer, room: Room): void {
  for (const p of room.players.values()) {
    if (p.role === 'tracker' && p.isAlive && p.socketId) {
      const result = getTrackResult(room, p);
      if (result) io.to(p.socketId).emit('game:track_result', result);
    }
  }
}

function notifyCultConversions(io: AppServer, room: Room): void {
  for (const cultistId of room.newlyConvertedCultists) {
    const cultist = room.players.get(cultistId);
    if (cultist && cultist.socketId) {
      io.to(cultist.socketId).emit('game:role', { role: getRole('cultist') });
    }
  }
}

function notifyYakuzaAllies(io: AppServer, room: Room): void {
  const yakuzaPlayer = [...room.players.values()].find(p => p.role === 'yakuza');
  const shogunPlayer = [...room.players.values()].find(p => p.role === 'shogun');

  if (yakuzaPlayer?.socketId) {
    io.to(yakuzaPlayer.socketId).emit('game:yakuza_ally', {
      allyRole: 'shogun',
      allyId: shogunPlayer?.id ?? null,
      allyName: shogunPlayer?.name ?? null,
    });
  }
  if (shogunPlayer?.socketId) {
    io.to(shogunPlayer.socketId).emit('game:yakuza_ally', {
      allyRole: 'yakuza',
      allyId: yakuzaPlayer?.id ?? null,
      allyName: yakuzaPlayer?.name ?? null,
    });
  }
}

function notifySpies(io: AppServer, room: Room): void {
  // Use the resolved consensus kill target (even if Doctor saved the victim)
  const targetId = room.mafiaKillTarget;
  const targetName = targetId ? (room.players.get(targetId)?.name ?? null) : null;

  for (const p of room.players.values()) {
    if (p.role === 'spy' && p.isAlive && p.socketId) {
      io.to(p.socketId).emit('spy:night_report', {
        mafiaTarget: targetId,
        mafiaTargetName: targetName,
      });
    }
  }
}

function announceVoteResult(io: AppServer, room: Room): void {
  const isAnonymous  = room.activeEvent?.key === 'anonymous_voting';
  const isNoReveal   = room.activeEvent?.key === 'no_reveal_day';

  // Emit vote breakdown (hidden for anonymous voting)
  if (!isAnonymous) {
    const eventMultiplier = room.activeEvent?.key === 'double_vote' ? 2 : 1;
    const breakdown = [...room.votes.entries()]
      .filter(([, tid]) => tid !== null)
      .map(([vid, tid]) => {
        const voter  = room.players.get(vid);
        const target = room.players.get(tid!);
        return {
          voterId: vid, voterName: voter?.name ?? '?',
          targetId: tid!, targetName: target?.name ?? '?',
          weight: (voter?.role === 'mayor' ? 2 : 1) * eventMultiplier,
        };
      });
    io.to(room.id).emit('game:vote_breakdown', breakdown);
    // Journal: the who-voted-for-whom record becomes public only NOW, after
    // the tribunal has ended (votes stay secret while voting is live).
    for (const b of breakdown) {
      broadcastSystemMsg(io, room, `🗳 ${b.voterName} → ${b.targetName}${b.weight > 1 ? ` ×${b.weight}` : ''}`);
    }
  }

  const eliminated = resolveVotes(room);
  if (eliminated) {
    const target = room.players.get(eliminated);
    if (target) {
      io.to(room.id).emit('game:vote_result', {
        name: target.name,
        role: isNoReveal ? null : (target.role ?? null),
        lastWill: target.lastWill ?? null,
        seat: target.seat,
      });
      const revealedRole = isNoReveal ? null : (target.role ?? null);
      broadcastSystemMsg(io, room, voteDeathMsg(target.name, revealedRole, target.lastWill));
      if (isNoReveal) {
        broadcastSystemMsg(io, room, `${target.name}'s role remains hidden. (No Reveal Day)`);
      }
      if (target.socketId) {
        io.to(target.socketId).emit('voice:force-mute', { reason: 'You were eliminated.' });
      }
      // ── Replay: record vote death ──────────────────────────────────
      recordEvent(room.id, {
        t: Date.now() - room.startedAt,
        type: 'death',
        data: { playerId: eliminated, username: target.name, role: target.role ?? null, team: target.team ?? null, cause: 'vote', round: room.day },
      });
    }
  } else {
    broadcastSystemMsg(io, room, 'The vote ended in a tie. No one was eliminated.');
  }
}

function notifyRoleblocked(io: AppServer, room: Room): void {
  const escortActions = [...room.nightActions.values()].filter(a => a.role === 'escort');
  for (const action of escortActions) {
    const blocked = room.players.get(action.targetId);
    if (blocked?.isAlive && blocked.socketId) {
      io.to(blocked.socketId).emit('game:roleblocked');
    }
  }
}

// ── DB-ready gate ─────────────────────────────────────────────────────
let _dbReady = false;
export function setDbReady(v: boolean) { _dbReady = v; }

// ── DM constants ──────────────────────────────────────────────────────
// Void-themed sticker pack (keys must match the client's DM_STICKERS).
const DM_STICKER_KEYS = new Set([
  'don', 'gun', 'night', 'eye', 'skull', 'joker',
  'rose', 'whiskey', 'smoke', 'shades', 'chess', 'heart',
]);
const DM_REACTION_EMOJIS = new Set(['❤️', '🔥', '😂', '👍', '😮', '😢']);

// ── Main ──────────────────────────────────────────────────────────────
export function attachSocketHandlers(io: AppServer): void {

  io.on('connection', (socket: AppSocket) => {
    socket.data.playerId = null;
    socket.data.roomId = null;
    socket.data.profileId = null;
    socket.data.loungeId = null;

    // Rate-limit + payload size check on every incoming event
    socket.use(([event, ...args], next) => {
      // Image upload events are exempt — they have their own size checks in their handlers
      const largePayloadEvents = new Set(['player:update_avatar', 'community:post_create_v2', 'community:profile_update', 'clan:update_image', 'community:story_create', 'dm:voice', 'dm:image', 'owner:gift_create', 'owner:gift_update']);
      // 4. Payload size limit — reject anything over 16 KB
      const payload = args[0];
      if (!largePayloadEvents.has(event) && payload !== null && payload !== undefined && typeof payload === 'object') {
        try {
          if (JSON.stringify(payload).length > 16384) {
            const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] as Function : null;
            if (ack) ack(err('Payload too large.'));
            return;
          }
        } catch { /* non-serialisable — let Zod reject it */ }
      }

      const authEvents = new Set(['player:auth', 'player:register', 'player:login_email']);
      const limit = authEvents.has(event) ? 3 : 40;
      if (!rateOk(socket.id, limit)) {
        socket.emit('error', { message: 'Too many requests. Slow down.' });
        const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] as Function : null;
        if (ack) ack(err('Too many requests. Slow down.'));
        return;
      }
      next();
    });

    // ── Auth ─────────────────────────────────────────────────────────
    socket.on('player:auth', async (data, cb) => {
      if (!_dbReady) { cb(err('Server is starting up — please wait a few seconds and try again.')); return; }
      try {
        const parsed = AuthSchema.parse(data);
        const profile = await getOrCreatePlayer(parsed.uid, parsed.username);

        // Check ban
        const ban = await getActiveBan(parsed.uid);
        if (ban) {
          cb(err(`You are banned until ${new Date(ban.expiresAt).toLocaleString()}. Reason: ${ban.reason}`));
          return;
        }

        socket.data.profileId = parsed.uid;
        enforceSessionUniqueness(io, parsed.uid, socket.id);
        markOnline(parsed.uid);
        deliverPendingCall(socket, parsed.uid);
        broadcastOnlineCount(io);
        if (maintenanceMode) socket.emit('maintenance:status', { enabled: true }); // surface banner to fresh connections
        await grantStarterCosmetics(parsed.uid);
        if (parsed.referralCode) {
          applyReferral(parsed.uid, parsed.referralCode).catch(() => {});
        }
        const freshProfile = await getOrCreatePlayer(parsed.uid, parsed.username);
        socket.emit('player:profile', toPublicProfile(freshProfile));
        cb(ok(toPublicProfile(freshProfile)));

        // Check profile completion bonus on login
        checkProfileCompletionBonus(parsed.uid).then(r => {
          if (r.awarded) socket.emit('coin:bonus' as any, { type: 'profile_complete', coins: 300, newBalance: r.newBalance });
        }).catch(() => {});
      } catch (e: any) {
        cb(err(e.message ?? 'Auth failed.'));
      }
    });

    // ── Email Register ───────────────────────────────────────────────
    socket.on('player:register', async (data, cb) => {
      try {
        const { email, password, username } = z.object({
          email:    z.string().email().max(200),
          password: z.string().min(6).max(128),
          username: z.string().min(2).max(24),
        }).parse(data);

        const profile = await registerWithEmail(email, password, username);
        socket.data.profileId = profile.id;
        enforceSessionUniqueness(io, profile.id, socket.id);
        markOnline(profile.id);
        deliverPendingCall(socket, profile.id);
        broadcastOnlineCount(io);
        socket.emit('player:profile', toPublicProfile(profile));
        cb(ok({ uid: profile.id, profile: toPublicProfile(profile) }));
      } catch (e: any) {
        cb(err(e.message ?? 'Registration failed.'));
      }
    });

    // ── Email Login ──────────────────────────────────────────────────
    socket.on('player:login_email', async (data, cb) => {
      try {
        const { email, password } = z.object({
          email:    z.string().email(),
          password: z.string().min(1),
        }).parse(data);

        const profile = await authenticateWithEmail(email, password);
        const ban = await getActiveBan(profile.id);
        if (ban) {
          cb(err(`You are banned until ${new Date(ban.expiresAt).toLocaleString()}. Reason: ${ban.reason}`));
          return;
        }
        socket.data.profileId = profile.id;
        enforceSessionUniqueness(io, profile.id, socket.id);
        markOnline(profile.id);
        deliverPendingCall(socket, profile.id);
        broadcastOnlineCount(io);
        socket.emit('player:profile', toPublicProfile(profile));
        cb(ok({ uid: profile.id, profile: toPublicProfile(profile) }));

        // Check profile completion bonus on login
        checkProfileCompletionBonus(profile.id).then(r => {
          if (r.awarded) socket.emit('coin:bonus' as any, { type: 'profile_complete', coins: 300, newBalance: r.newBalance });
        }).catch(() => {});
      } catch (e: any) {
        cb(err(e.message ?? 'Login failed.'));
      }
    });

    // ── Change Password ──────────────────────────────────────────────
    socket.on('player:change_password' as any, async (data: any, cb: any) => {
      try {
        const { uid, currentPassword, newPassword } = z.object({
          uid:             z.string().min(1),
          currentPassword: z.string().min(1),
          newPassword:     z.string().min(6),
        }).parse(data);

        const rows = await sql`SELECT password_hash, email FROM players WHERE id = ${uid} LIMIT 1` as any[];
        if (!rows[0]) { cb({ ok: false, error: 'Player not found.' }); return; }
        if (!rows[0].password_hash) { cb({ ok: false, error: 'No password set on this account.' }); return; }

        const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
        if (!match) { cb({ ok: false, error: 'Current password is incorrect.' }); return; }

        const newHash = await bcrypt.hash(newPassword, 10);
        await sql`UPDATE players SET password_hash = ${newHash} WHERE id = ${uid}`;
        cb({ ok: true });
      } catch (e: any) {
        cb({ ok: false, error: e.message ?? 'Failed to change password.' });
      }
    });

    // ── Player Stats ─────────────────────────────────────────────────
    socket.on('player:stats', async ({ profileId }, cb) => {
      try {
        const profile = await getPlayer(profileId);
        if (!profile) throw new Error('Player not found.');
        cb(ok(toPublicProfile(profile)));
      } catch (e: any) {
        cb(err(e.message));
      }
    });

    // ── Avatar Upload ────────────────────────────────────────────────
    socket.on('player:update_avatar', async (data: { imageData: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb({ ok: false, error: 'Not authenticated.' }); return; }

        const { imageData } = data;
        if (!imageData || typeof imageData !== 'string') { cb({ ok: false, error: 'Invalid image data.' }); return; }
        if (!imageData.startsWith('data:image/')) { cb({ ok: false, error: 'Unsupported image type.' }); return; }

        // ~6MB base64 limit (profile avatar)
        if (imageData.length > 8_000_000) { cb({ ok: false, error: 'Image is too large.' }); return; }

        await updateAvatarUrl(profileId, imageData);

        // Update all rooms this player is in
        const profile = await getPlayer(profileId);
        for (const room of getAllRooms()) {
          setPlayerAvatarUrl(room, profileId, imageData);
          broadcastRoom(io, room);
        }

        cb({ ok: true, data: toPublicProfile(profile!) });

        // Check profile completion bonus (avatar + banner = 300 coins)
        checkProfileCompletionBonus(profileId).then(r => {
          if (r.awarded) socket.emit('coin:bonus' as any, { type: 'profile_complete', coins: 300, newBalance: r.newBalance });
        }).catch(() => {});
      } catch (e: any) {
        cb({ ok: false, error: e.message ?? 'Upload failed.' });
      }
    });

    socket.on('player:remove_avatar', async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb({ ok: false, error: 'Not authenticated.' }); return; }

        await updateAvatarUrl(profileId, null);

        const profile = await getPlayer(profileId);
        for (const room of getAllRooms()) {
          setPlayerAvatarUrl(room, profileId, null);
          broadcastRoom(io, room);
        }

        cb({ ok: true, data: toPublicProfile(profile!) });
      } catch (e: any) {
        cb({ ok: false, error: e.message ?? 'Remove failed.' });
      }
    });

    socket.on('player:update_name', async (data: { newName: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb({ ok: false, error: 'Not authenticated.' }); return; }
        const { newName } = data;
        if (!newName || typeof newName !== 'string') { cb({ ok: false, error: 'Invalid name.' }); return; }
        const trimmed = newName.trim();
        if (trimmed.length < 2 || trimmed.length > 20) { cb({ ok: false, error: 'Name must be 2–20 characters.' }); return; }
        if (!/^[a-zA-Z0-9ა-ჿ _-]+$/.test(trimmed)) { cb({ ok: false, error: 'Name contains invalid characters.' }); return; }

        await updateUsername(profileId, trimmed);
        const profile = await getPlayer(profileId);
        if (!profile) { cb({ ok: false, error: 'Profile not found.' }); return; }

        // Update in-room player names
        for (const room of getAllRooms()) {
          const player = getPlayerByProfile(room, profileId);
          if (player) {
            player.name = trimmed;
            broadcastRoom(io, room);
          }
        }

        socket.emit('player:profile', toPublicProfile(profile));
        cb({ ok: true, data: toPublicProfile(profile) });
      } catch (e: any) {
        cb({ ok: false, error: e.message ?? 'Name change failed.' });
      }
    });

    // ── Report ───────────────────────────────────────────────────────
    socket.on('player:report', async (data, cb) => {
      try {
        const parsed = ReportSchema.parse(data);
        const reporterProfileId = socket.data.profileId;
        if (!reporterProfileId) throw new Error('Not authenticated.');
        if (parsed.targetProfileId === reporterProfileId) throw new Error('You cannot report yourself.');

        const rateCheck = reportRateOk(reporterProfileId, parsed.targetProfileId, parsed.reason);
        if (!rateCheck.ok) throw new Error(rateCheck.error);

        const reporter = await getPlayer(reporterProfileId);
        const reported = await getPlayer(parsed.targetProfileId);
        if (!reporter || !reported) throw new Error('Player not found.');

        const report = await createReport(
          reporterProfileId, reporter.username,
          parsed.targetProfileId, reported.username,
          parsed.roomId, parsed.reason as ReportReason, parsed.details,
        );

        await notifyMods(io, 'new_report', `New report: ${reported.username} — ${parsed.reason}`, reported.username);

        // Auto-flag: if reported player has 3+ open reports in last 24h, alert mods
        const since24h = Date.now() - 86_400_000;
        const [countRow] = await sql`
          SELECT COUNT(*) as cnt FROM reports
          WHERE reported_id = ${parsed.targetProfileId} AND status = 'open' AND created_at > ${since24h}
        ` as any[];
        const recentCount = Number(countRow?.cnt ?? 0);
        if (recentCount >= 3) {
          await notifyMods(io, 'auto_flag', `⚠️ AUTO-FLAG: ${reported.username} has ${recentCount} open reports in 24h`, reported.username);
        }

        cb(ok(null));
      } catch (e: any) {
        cb(err(e.message));
      }
    });

    // ── Create Room ─────────────────────────────────────────────────
    socket.on('room:create', async (data, cb) => {
      try {
        const parsed = CreateRoomSchema.parse(data);
        const profileId = socket.data.profileId;

        const ban = profileId ? await getActiveBan(profileId) : null;
        if (ban) throw new Error(`You are banned. Reason: ${ban.reason}`);

        const playerProfile = profileId ? await getPlayer(profileId) : null;
        if (maintenanceMode && !playerProfile?.isModerator) throw new Error('Server is under maintenance. Please try again later.');

        const username = playerProfile?.username ?? parsed.name;

        // If creating a clan room, validate clan membership and get clanId
        let clanId: string | null = null;
        if (parsed.clanRoom && profileId) {
          const clanMembership = await getClanMembershipByPlayer(profileId);
          if (clanMembership) clanId = clanMembership.id;
        }

        // Sports (donMode) is temporarily locked while under repair — force
        // every new table to classic regardless of what the client requests.
        // (Flip this back to `if (reqSettings.donMode) reqSettings.minPlayers = 10`
        // to re-enable Sports; the whole engine is intact behind donMode.)
        const reqSettings = { ...(parsed.settings as Partial<GameSettings> | undefined), donMode: false };
        const room = createRoom(socket.id, username, profileId, reqSettings, clanId, parsed.roomName);

        const hostInRoom = [...room.players.values()][0];
        if (hostInRoom && playerProfile?.avatarUrl) hostInRoom.avatarUrl = playerProfile.avatarUrl;

        socket.join(room.id);
        socket.data.playerId = room.hostId;
        socket.data.roomId = room.id;

        const hostPlayer = room.players.get(room.hostId)!;
        broadcastSystemMsg(io, room, `${hostPlayer.name} created the room.`);
        cb(ok(toPublicRoom(room, room.hostId)));
        // Ping friends that a joinable room is up (public rooms only).
        if (profileId && !room.settings.isPrivate) {
          notifyFriendsActive(io, profileId, { kind: 'game', code: room.code, label: 'Mafia', fromName: hostPlayer.name });
        }
      } catch (e: any) {
        cb(err(e.message ?? 'Failed to create room.'));
      }
    });

    // ── Join Room ───────────────────────────────────────────────────
    socket.on('room:join', async (data, cb) => {
      try {
        const parsed = JoinRoomSchema.parse(data);
        const profileId = socket.data.profileId;

        const ban = profileId ? await getActiveBan(profileId) : null;
        if (ban) throw new Error(`You are banned until ${new Date(ban.expiresAt).toLocaleString()}. Reason: ${ban.reason}`);

        if (maintenanceMode) {
          const joiner = profileId ? await getPlayer(profileId) : null;
          if (!joiner?.isModerator) throw new Error('Server is under maintenance. Please try again later.');
        }

        const room = getRoomByCode(parsed.code);
        if (!room) throw new Error('Room not found. Check the code and try again.');

        // Password check
        if (room.settings.password) {
          const existing = room.players ? [...room.players.values()].find(p => p.profileId === profileId && p.isConnected) : null;
          if (!existing && parsed.password !== room.settings.password) {
            throw new Error('Wrong room password.');
          }
        }

        // Check if this is a re-join attempt (existing player reconnecting)
        const isRejoinActive = profileId
          ? [...room.players.values()].some(p => p.profileId === profileId)
          : [...room.players.values()].some(p => p.name === parsed.name.trim());
        const isRejoinQueued = profileId
          ? room.nextRoundQueue.some(p => p.profileId === profileId)
          : room.nextRoundQueue.some(p => p.name === parsed.name.trim());
        const isRejoin = isRejoinActive || isRejoinQueued;

        // If game is active and this is a new joiner (not a rejoin), route by joinMode
        if (!isRejoin && room.phase !== 'lobby') {
          if (!parsed.joinMode) {
            // Signal client to show mode selection
            cb(err('GAME_ALREADY_STARTED_CHOOSE_MODE'));
            return;
          }

          const playerProfile = profileId ? await getPlayer(profileId) : null;
          const username = playerProfile?.username ?? parsed.name;

          if (parsed.joinMode === 'next_round' || parsed.joinMode === 'player') {
            // "Join as player" while a game is running = spectate now, auto-seat
            // when this game ends. Join as spectator first, then enqueue.
            const player = addSpectatorPlayer(room, socket.id, username, profileId);
            if (playerProfile?.avatarUrl) player.avatarUrl = playerProfile.avatarUrl;
            if (playerProfile?.isModerator) {
              player.isModerator = playerProfile.isModerator;
              player.moderatorLevel = playerProfile.moderatorLevel;
            }
            socket.join(room.id);
            socket.join(`spec:${room.id}`);
            socket.data.playerId = player.id;
            socket.data.roomId = room.id;

            // Auto-enqueue if settings allow
            try {
              const position = enqueueForNextRound(room, player.id);
              broadcastSystemMsg(io, room, `${player.name} joined the queue for next round (#${position}).`);
              broadcastQueueUpdated(io, room);
            } catch {
              broadcastSystemMsg(io, room, `${player.name} joined as spectator.`);
            }


            broadcastRoom(io, room);
            cb(ok(toPublicRoom(room, player.id)));
            return;
          } else {
            // spectator mode
            const player = addSpectatorPlayer(room, socket.id, username, profileId);
            if (playerProfile?.avatarUrl) player.avatarUrl = playerProfile.avatarUrl;
            if (playerProfile?.isModerator) {
              player.isModerator = playerProfile.isModerator;
              player.moderatorLevel = playerProfile.moderatorLevel;
            }
            socket.join(room.id);
            socket.join(`spec:${room.id}`);
            socket.data.playerId = player.id;
            socket.data.roomId = room.id;
            broadcastSystemMsg(io, room, `${player.name} joined as spectator.`);
            broadcastRoom(io, room);
            cb(ok(toPublicRoom(room, player.id)));
            return;
          }
        }

        // Re-join: if queued player reconnects, find them in the queue
        if (isRejoinQueued) {
          const queuedPlayer = profileId
            ? room.nextRoundQueue.find(p => p.profileId === profileId)
            : room.nextRoundQueue.find(p => p.name === parsed.name.trim());
          if (queuedPlayer) {
            queuedPlayer.socketId = socket.id;
            queuedPlayer.isConnected = true;
            socket.join(room.id);
            socket.data.playerId = queuedPlayer.id;
            socket.data.roomId = room.id;
            broadcastRoom(io, room);
            cb(ok(toPublicRoom(room, queuedPlayer.id)));
            return;
          }
        }

        // Spectate queue (legacy): if room is full during active game and not a re-join
        const activePlayers = [...room.players.values()].filter(p => !p.isSpectator);
        if (!isRejoin && room.phase !== 'lobby' && activePlayers.length >= 16) {
          const queue = spectateQueues.get(room.id) ?? [];
          if (!queue.includes(socket.id)) {
            queue.push(socket.id);
            spectateQueues.set(room.id, queue);
          }
          const position = queue.indexOf(socket.id) + 1;
          socket.emit('queue:position', { position, roomCode: room.code });
          cb(err(`Room is full. You are #${position} in queue.`));
          return;
        }

        const playerProfile = profileId ? await getPlayer(profileId) : null;
        const username = playerProfile?.username ?? parsed.name;
        const player = addPlayer(room, socket.id, username, profileId);
        if (playerProfile?.avatarUrl) player.avatarUrl = playerProfile.avatarUrl;
        if ((parsed.isSpectator || parsed.joinMode === 'spectator') && !player.isSpectator) {
          // Normalize a lobby spectator: no seat number, not "alive" — otherwise
          // the seat stays occupied and blocks the next joining player.
          player.isSpectator = true;
          player.isAlive = false;
          player.seat = 0;
        }
        if (playerProfile?.isModerator) {
          player.isModerator = playerProfile.isModerator;
          player.moderatorLevel = playerProfile.moderatorLevel;
        }

        socket.join(room.id);
        if (player.isSpectator) socket.join(`spec:${room.id}`);
        socket.data.playerId = player.id;
        socket.data.roomId = room.id;

        // Cancel lobby disconnect grace (player reconnected in time)
        clearLobbyGrace(player.id);

        // Cancel host grace period if this is the host reconnecting
        const grace = hostGraceTimers.get(room.id);
        if (grace && player.isHost && (profileId === grace.profileId || (!profileId && player.name === grace.hostName))) {
          clearTimeout(grace.timer);
          hostGraceTimers.delete(room.id);
          broadcastSystemMsg(io, room, `${player.name} (host) reconnected.`);
        } else if (isRejoin) {
          // Silent reconnect — avoid "X joined" spam on refresh.
          // Re-push the phase voice rules: force-mute/unmute events sent while
          // this player was away went to their OLD socket id, so without this a
          // reconnected player can be stuck muted until the next phase change.
          broadcastRoom(io, room);
          enforceVoicePhaseRules(io, room);
          cb(ok(toPublicRoom(room, player.id)));
          return;
        } else {
          broadcastSystemMsg(io, room, `${player.name} joined the room.`);
        }

        broadcastRoom(io, room);
        cb(ok(toPublicRoom(room, player.id)));
      } catch (e: any) {
        cb(err(e.message ?? 'Failed to join room.'));
      }
    });

    // ── Leave Room ──────────────────────────────────────────────────
    socket.on('room:leave', (cb) => {
      const { roomId, playerId } = socket.data;
      if (roomId && playerId) handlePlayerLeave(io, socket, roomId, playerId, true);
      cb(ok(null));
    });

    // ── Ready ───────────────────────────────────────────────────────
    socket.on('room:ready', (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const player = getPlayerOrError(socket, room);
        player.isReady = !player.isReady;
        broadcastRoom(io, room);

        // Auto-start: if all non-spectator players are ready and >= minPlayers
        const activePlayers = [...room.players.values()].filter(p => !p.isSpectator);
        const allReady = activePlayers.length >= room.settings.minPlayers
          && activePlayers.every(p => p.isReady);

        if (allReady) {
          let countdown = 10;
          io.to(room.id).emit('lobby:autostart', { secondsLeft: countdown });
          const tick = setInterval(() => {
            countdown--;
            if (countdown <= 0) {
              clearInterval(tick);
              autoStartTimers.delete(room.id);
              // Only auto-start if still in lobby and all still ready
              const still = [...room.players.values()].filter(p => !p.isSpectator);
              if (room.phase === 'lobby' && still.length >= room.settings.minPlayers && still.every(p => p.isReady)) {
                startGame(room);
                room.startedAt = Date.now();
                setPhase(room, 'role_reveal');
                // ── Replay: start recording ────────────────────────────
                startReplay(room.id, room.code, room.startedAt);
                recordEvent(room.id, { t: 0, type: 'game_start', data: { playerCount: still.length } });
                for (const p of room.players.values()) {
                  if (p.socketId && p.role) {
                    io.to(p.socketId).emit('game:role', { role: getRole(p.role) });
                    io.to(p.socketId).emit('game:notification', { title: 'Game Started!', body: `Your role: ${p.role}` });
                  }
                }
                broadcastSystemMsg(io, room, 'The game has begun. Roles are being revealed…');
                notifyYakuzaAllies(io, room);
                broadcastRoom(io, room);
                startPhaseTimer(io, room);
              }
            } else {
              io.to(room.id).emit('lobby:autostart', { secondsLeft: countdown });
            }
          }, 1000);
          cancelAutoStart(room.id);
          autoStartTimers.set(room.id, tick as unknown as NodeJS.Timeout);
        } else {
          // Cancel auto-start if someone unreadied
          if (autoStartTimers.has(room.id)) {
            cancelAutoStart(room.id);
            io.to(room.id).emit('lobby:autostart', { secondsLeft: -1 }); // cancel signal
          }
        }

        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Kick Player ─────────────────────────────────────────────────
    socket.on('room:kick', async ({ playerId }, cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const actor = getPlayerOrError(socket, room);
        // Moderators (mod/admin/owner) may kick anyone, at any time — even
        // mid-game. The plain host is still limited to the lobby.
        const pid = socket.data.profileId;
        const modProfile = pid ? await getPlayer(pid) : null;
        const isMod = !!modProfile && canDo(modProfile, 'kick');
        if (!actor.isHost && !isMod) throw new Error('Only the host or a moderator can kick players.');
        if (room.phase !== 'lobby' && !isMod) throw new Error('Cannot kick during an active game.');

        const target = room.players.get(playerId);
        if (!target) throw new Error('Player not found.');
        if (target.id === actor.id) throw new Error('Cannot kick yourself.');

        const byMod = isMod && !actor.isHost;
        const label = byMod ? 'a moderator' : 'the host';
        const targetSock = target.socketId ? io.sockets.sockets.get(target.socketId) : null;
        targetSock?.emit('kicked', { reason: `You were removed by ${label}.` });

        if (room.phase !== 'lobby' && targetSock) {
          // Mid-game: route through the same safe teardown mods already use.
          handleVoiceLeave(io, target.socketId);
          handlePlayerLeave(io, targetSock as any, room.id, target.id);
        } else {
          removePlayer(room, playerId);
        }
        broadcastSystemMsg(io, room, `${target.name} was removed by ${label}.`);
        broadcastRoom(io, room);
        if (byMod && modProfile) {
          logKick(pid!, modProfile.username, target.profileId ?? '', target.name, room.id, 'In-game moderator kick').catch(() => {});
        }
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Warn Player (host OR moderator, announced to the whole room) ──
    socket.on('room:warn', async ({ playerId }, cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const actor = getPlayerOrError(socket, room);
        const pid = socket.data.profileId;
        const modProfile = pid ? await getPlayer(pid) : null;
        const isMod = !!modProfile && canDo(modProfile, 'warn');
        if (!actor.isHost && !isMod) throw new Error('Only the host or a moderator can warn players.');

        const target = room.players.get(playerId);
        if (!target) throw new Error('Player not found.');
        if (target.id === actor.id) throw new Error('Cannot warn yourself.');

        const who = (isMod && !actor.isHost) ? (modProfile?.username ?? actor.name) : actor.name;
        broadcastSystemMsg(io, room, `⚠️ ${who} sent a warning to ${target.name}.`);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Transfer Host ───────────────────────────────────────────────
    socket.on('room:transfer_host', ({ playerId }, cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const host = getPlayerOrError(socket, room);
        if (!host.isHost) throw new Error('Only the host can transfer host status.');
        if (playerId === host.id) throw new Error('You are already the host.');

        const newHost = room.players.get(playerId);
        if (!newHost) throw new Error('Player not found.');

        transferHost(room, playerId);
        broadcastSystemMsg(io, room, `👑 ${host.name} transferred host to ${newHost.name}.`);
        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Update Settings ─────────────────────────────────────────────
    socket.on('room:settings', ({ settings }, cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const host = getPlayerOrError(socket, room);
        if (!host.isHost) throw new Error('Only the host can change settings.');
        if (room.phase !== 'lobby') throw new Error('Settings cannot be changed after game starts.');

        room.settings = {
          ...room.settings,
          ...settings,
          // The game style (Sports/classic) is fixed at creation — never let a
          // settings save flip donMode or shrink a Sports table below 10.
          donMode: room.settings.donMode,
          ...(room.settings.donMode ? { minPlayers: 10 } : {}),
          roles: { ...room.settings.roles, ...(settings.roles ?? {}) },
          dynamicEvents: settings.dynamicEvents
            ? {
                ...room.settings.dynamicEvents,
                ...settings.dynamicEvents,
                allowed: { ...room.settings.dynamicEvents.allowed, ...(settings.dynamicEvents.allowed ?? {}) },
              }
            : room.settings.dynamicEvents,
        };
        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Start Game ──────────────────────────────────────────────────
    socket.on('game:start', (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const host = getPlayerOrError(socket, room);
        if (!host.isHost) throw new Error('Only the host can start the game.');
        if (room.phase !== 'lobby') throw new Error('Game is already in progress.');

        startGame(room);
        room.startedAt = Date.now();
        setPhase(room, 'role_reveal');

        // ── Replay: start recording ──────────────────────────────────
        startReplay(room.id, room.code, room.startedAt);
        const activePlayers = [...room.players.values()].filter(p => !p.isSpectator);
        recordEvent(room.id, { t: 0, type: 'game_start', data: { playerCount: activePlayers.length } });

        for (const player of room.players.values()) {
          if (player.socketId && player.role) {
            io.to(player.socketId).emit('game:role', { role: getRole(player.role) });
            io.to(player.socketId).emit('game:notification', {
              title: 'Game Started!',
              body: `Your role: ${player.role}`,
            });
          }
          // Push to everyone with a profile (catches background/lock-screen players)
          if (player.profileId && player.role) {
            sendPushToUser(player.profileId, {
              title: '🎮 Game Started!',
              body: player.socketId
                ? `Your role: ${player.role}. The game is on!`
                : `Your role: ${player.role}. Get back in!`,
            }).catch(() => {});
          }
        }

        broadcastSystemMsg(io, room, 'The game has begun. Roles are being revealed…');
        notifyYakuzaAllies(io, room);
        broadcastRoom(io, room);
        enforceVoicePhaseRules(io, room);
        startPhaseTimer(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Queue: Join Next Round ───────────────────────────────────────
    socket.on('queue:join' as any, (cb: any) => {
      try {
        const room = getRoomFromSocket(socket);
        const player = getPlayerOrError(socket, room);
        if (!player.isSpectator) throw new Error('Only spectators can join the next-round queue.');
        if (player.isQueuedNextRound) throw new Error('Already in queue.');

        const position = enqueueForNextRound(room, player.id);
        broadcastSystemMsg(io, room, `${player.name} joined the queue for next round (#${position}).`);
        broadcastQueueUpdated(io, room);
        broadcastRoom(io, room);
        cb(ok({ position }));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Queue: Leave Next Round ──────────────────────────────────────
    socket.on('queue:leave' as any, (cb: any) => {
      try {
        const room = getRoomFromSocket(socket);
        const player = getPlayerOrError(socket, room);
        if (!player.isQueuedNextRound) throw new Error('You are not in the queue.');

        dequeueFromNextRound(room, player.id);
        broadcastSystemMsg(io, room, `${player.name} left the next-round queue.`);
        broadcastQueueUpdated(io, room);
        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Switch: active player → spectator (lobby only) ──────────────
    socket.on('room:to-spectator' as any, (cb: any) => {
      try {
        const room = getRoomFromSocket(socket);
        const player = getPlayerOrError(socket, room);
        if (room.phase !== 'lobby' && room.phase !== 'game_over') throw new Error('You can switch to spectator only in the lobby.');
        if (player.isSpectator) throw new Error('Already a spectator.');
        becomeSpectator(room, player.id);
        socket.join(`spec:${room.id}`);
        broadcastSystemMsg(io, room, `${player.name} switched to spectators.`);
        broadcastRoom(io, room);
        cb?.(ok(null));
      } catch (e: any) { cb?.(err(e.message)); }
    });

    // ── Switch: spectator → active player ───────────────────────────
    // In the lobby: takes the next free seat immediately.
    // Mid-game: joins the next-round queue (auto-seated when the game ends).
    socket.on('room:to-player' as any, (cb: any) => {
      try {
        const room = getRoomFromSocket(socket);
        const player = getPlayerOrError(socket, room);
        if (!player.isSpectator) throw new Error('Already a player.');

        if (room.phase !== 'lobby' && room.phase !== 'game_over') {
          if (player.isQueuedNextRound) throw new Error('Already in the next-round queue.');
          const position = enqueueForNextRound(room, player.id);
          broadcastSystemMsg(io, room, `${player.name} joined the queue for next round (#${position}).`);
          broadcastQueueUpdated(io, room);
          broadcastRoom(io, room);
          cb?.(ok({ queued: true, position }));
          return;
        }

        becomePlayer(room, player.id);
        socket.leave(`spec:${room.id}`);
        broadcastSystemMsg(io, room, `${player.name} joined the game (seat ${player.seat}).`);
        broadcastRoom(io, room);
        cb?.(ok({ queued: false, seat: player.seat }));
      } catch (e: any) { cb?.(err(e.message)); }
    });

    // ── Night Action ────────────────────────────────────────────────
    socket.on('game:action', async ({ targetId }, cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const actor = getPlayerOrError(socket, room);
        if (actor.isSpectator) throw new Error('Spectators cannot perform night actions.');
        if (actor.isQueuedNextRound) throw new Error('Not an active player.');
        submitNightAction(room, actor, targetId);

        if (actor.role === 'sheriff') {
          const result = getInvestigationResult(room, actor);
          if (result && actor.socketId) {
            io.to(actor.socketId).emit('game:investigation', result);
          }
        }

        // Broadcast Mafia/Don kill choice to private Mafia chat so teammates see it
        if ((actor.role === 'mafia' || actor.role === 'don') && room.phase === 'night') {
          const targetName = room.players.get(targetId)?.name ?? '?';
          const label = actor.role === 'don' ? 'Don' : 'Mafia';
          const choiceMsg = createSystemMessage(
            `[${label}] ${actor.name} → ${targetName}`, 'mafia',
          );
          addMessage(room, choiceMsg);
        }

        broadcastRoom(io, room);

        if (allNightActionsSubmitted(room)) {
          timerService.stop(room.id);
          room.timer = 0;
          advancePhase(room); const nextPhase = room.phase as Phase;
          announceNightResult(io, room);
          notifySpies(io, room);
          notifyTrackers(io, room);
          notifyCultConversions(io, room);
          notifyRoleblocked(io, room);
          announceActiveEvent(io, room);
          if (nextPhase === 'game_over') await emitGameOver(io, room);
          broadcastRoom(io, room);
          enforceVoicePhaseRules(io, room);
          if (room.phase !== 'game_over') startPhaseTimer(io, room);
        }

        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Vote ────────────────────────────────────────────────────────
    socket.on('game:vote', async ({ targetId }, cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const voter = getPlayerOrError(socket, room);
        if (voter.isSpectator) throw new Error('Spectators cannot vote.');
        if (voter.isQueuedNextRound) throw new Error('Not an active player.');
        submitVote(room, voter, targetId);

        // Votes are SECRET while the tribunal runs — never announce who voted
        // for whom live. The full breakdown is revealed by announceVoteResult
        // (game:vote_breakdown + journal messages) once voting ends.

        // Auto-advance when every eligible player has voted (no need to wait for timer)
        const eligible = [...room.players.values()].filter(
          p => p.isAlive && !p.isSpectator && !p.isQueuedNextRound,
        );
        const allVoted = eligible.length > 0 && eligible.every(p => room.votes.has(p.id));

        if (allVoted) {
          timerService.stop(room.id);
          room.timer = 0;
          announceVoteResult(io, room);
          advancePhase(room); const nextPhase = room.phase as Phase;
          announceActiveEvent(io, room);
          if (nextPhase === 'game_over') await emitGameOver(io, room);
          broadcastRoom(io, room);
          enforceVoicePhaseRules(io, room);
          if (nextPhase !== 'game_over') startPhaseTimer(io, room);
          cb(ok(null));
          return;
        }

        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Nominate ────────────────────────────────────────────────────
    socket.on('game:nominate', ({ nomineeId }, cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const actor = getPlayerOrError(socket, room);
        if (actor.isSpectator || actor.isQueuedNextRound) throw new Error('Not an active player.');
        submitNomination(room, actor, nomineeId);

        const nominee = nomineeId ? room.players.get(nomineeId) : null;
        io.to(room.id).emit('game:nomination', {
          nominatorId: actor.id,
          nominatorName: actor.name,
          nomineeId: nomineeId ?? null,
          nomineeName: nominee?.name ?? null,
        });

        if (nomineeId) {
          broadcastSystemMsg(io, room, `⚖️ ${actor.name} nominated ${nominee?.name ?? '?'}`);
        } else {
          broadcastSystemMsg(io, room, `${actor.name} withdrew their nomination.`);
        }

        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Don Check (Don Mode) ────────────────────────────────────────
    socket.on('game:don_check', async ({ targetId }: { targetId: string | null }, cb: any) => {
      try {
        const room = getRoomFromSocket(socket);
        const actor = getPlayerOrError(socket, room);
        submitDonCheck(room, actor, targetId ?? null);

        // Send result privately to Don
        if (targetId && room.donModeState?.donCheckResult !== null) {
          const isSheriff = room.donModeState!.donCheckResult!;
          const targetName = room.players.get(targetId)?.name ?? '?';
          io.to(socket.id).emit('game:don_check_result', { targetId, targetName, isSheriff });
          broadcastSystemMsg(io, room, `🔍 Don has investigated a player.`);
        } else {
          broadcastSystemMsg(io, room, `🔍 Don skipped the investigation.`);
        }

        // Advance to mafia_kill
        timerService.stop(room.id);
        room.timer = 0;
        advancePhase(room);
        broadcastRoom(io, room);
        enforceVoicePhaseRules(io, room);
        if (room.phase !== 'game_over') startPhaseTimer(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Don Mode: claim / release the წამყვანი (moderator) seat ──────
    socket.on('room:don_moderator', ({ claim }: { claim: boolean }, cb: any) => {
      try {
        const room = getRoomFromSocket(socket);
        const player = getPlayerOrError(socket, room);
        if (!room.settings.donMode) throw new Error('Don რეჟიმი არ არის ჩართული.');
        if (!room.settings.donModerator) throw new Error('წამყვანით თამაში გამორთულია.');
        if (room.phase !== 'lobby') throw new Error('წამყვანის არჩევა მხოლოდ ლობიშია შესაძლებელი.');

        if (claim) {
          if (room.donModeratorId && room.donModeratorId !== player.id) {
            throw new Error('წამყვანის ადგილი უკვე დაკავებულია.');
          }
          room.donModeratorId = player.id;
          broadcastSystemMsg(io, room, `♛ ${player.name} გახდა თამაშის წამყვანი.`);
        } else {
          // The moderator themselves or the host can vacate the seat.
          if (room.donModeratorId !== player.id && !player.isHost) {
            throw new Error('მხოლოდ წამყვანს ან ჰოსტს შეუძლია ადგილის გათავისუფლება.');
          }
          if (room.donModeratorId) {
            const prev = room.players.get(room.donModeratorId);
            broadcastSystemMsg(io, room, `♛ წამყვანის ადგილი გათავისუფლდა${prev ? ` (${prev.name})` : ''}.`);
          }
          room.donModeratorId = null;
        }
        // Keep the playing seats numbered 1..N with the moderator last.
        reseatForDonModerator(room);
        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mafia Kill Vote (Don Mode) ──────────────────────────────────
    socket.on('game:mafia_kill_vote', async ({ targetId }: { targetId: string }, cb: any) => {
      try {
        const room = getRoomFromSocket(socket);
        const actor = getPlayerOrError(socket, room);
        submitMafiaKillVote(room, actor, targetId);

        if (allMafiaKillVotesSubmitted(room)) {
          timerService.stop(room.id);
          room.timer = 0;
          advancePhase(room);
          // The kill isn't resolved until after the Sheriff's check. Only announce
          // the night result once we've actually resolved (i.e. skipped past sheriff_check).
          if (room.phase !== ('sheriff_check' as Phase)) announceNightResult(io, room);
          if (room.phase !== 'game_over') {
            broadcastRoom(io, room);
            enforceVoicePhaseRules(io, room);
            startPhaseTimer(io, room);
          } else {
            await emitGameOver(io, room);
            broadcastRoom(io, room);
          }
        } else {
          broadcastRoom(io, room);
        }
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Sheriff Check (Don Mode night) ──────────────────────────────
    socket.on('game:sheriff_check', async ({ targetId }: { targetId: string | null }, cb: any) => {
      try {
        const room = getRoomFromSocket(socket);
        const actor = getPlayerOrError(socket, room);
        submitSheriffCheck(room, actor, targetId ?? null);

        // Send the investigation result privately to the Sheriff.
        if (targetId && room.donModeState?.sheriffCheckResult !== null) {
          const suspicious = room.donModeState!.sheriffCheckResult!;
          const targetName = room.players.get(targetId)?.name ?? '?';
          io.to(socket.id).emit('game:sheriff_check_result', { targetId, targetName, suspicious });
          broadcastSystemMsg(io, room, '🔎 შერიფმა შეამოწმა მოთამაშე.');
        } else {
          broadcastSystemMsg(io, room, '🔎 შერიფმა გამოტოვა შემოწმება.');
        }

        // Sheriff acted — resolve the night now.
        timerService.stop(room.id);
        room.timer = 0;
        advancePhase(room);
        announceNightResult(io, room);
        if (room.phase !== 'game_over') {
          broadcastRoom(io, room);
          enforceVoicePhaseRules(io, room);
          startPhaseTimer(io, room);
        } else {
          await emitGameOver(io, room);
          broadcastRoom(io, room);
        }
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Double Elimination Vote (Don Mode) ─────────────────────────
    socket.on('game:double_elim_vote', async ({ yes }: { yes: boolean }, cb: any) => {
      try {
        const room = getRoomFromSocket(socket);
        const voter = getPlayerOrError(socket, room);
        if (voter.isSpectator || voter.isQueuedNextRound) throw new Error('Not an active player.');
        submitDoubleEliminationVote(room, voter, yes);

        if (allDoubleElimVotesSubmitted(room)) {
          timerService.stop(room.id);
          room.timer = 0;
          const dm = room.donModeState;
          const votes = dm ? Object.values(dm.doubleEliminationVotes) : [];
          const yesCount = votes.filter(v => v).length;
          const noCount = votes.filter(v => !v).length;
          if (yesCount > noCount) broadcastSystemMsg(io, room, '⚖️ გადაწყვეტილება: ორივე მოთამაშე გაძევებულია.');
          else broadcastSystemMsg(io, room, '⚖️ გადაწყვეტილება: ორივე მოთამაშე რჩება.');
          advancePhase(room);
          if (room.phase === 'game_over') {
            await emitGameOver(io, room);
          }
          broadcastRoom(io, room);
          enforceVoicePhaseRules(io, room);
          if (room.phase !== 'game_over') startPhaseTimer(io, room);
        } else {
          broadcastRoom(io, room);
        }
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Dev: Fill Bots (owner-only, lobby phase only) ───────────────
    socket.on('dev:fill_bots', async ({ count }: { count: number }, cb: any) => {
      try {
        const room = getRoomFromSocket(socket);
        const actor = getPlayerOrError(socket, room);
        const profile = socket.data.profileId ? await getPlayer(socket.data.profileId) : null;
        if (profile?.moderatorLevel !== 'owner') throw new Error('Owner only.');
        if (room.phase !== 'lobby') throw new Error('Can only fill bots in lobby.');
        const existing = [...room.players.values()].filter(p => !p.isSpectator).length;
        const toAdd = Math.min(count, 20 - existing);
        if (toAdd <= 0) throw new Error('Room already has enough players.');
        const botNames = ['Beka', 'Nino', 'Gio', 'Maka', 'Dato', 'Lika', 'Zura', 'Ana', 'Sandro', 'Tama',
                          'Keti', 'Nika', 'Mari', 'Irakli', 'Salome', 'Giorgi', 'Levan', 'Nana', 'Lasha', 'Elene'];
        const taken = new Set([...room.players.values()].map(p => p.name));
        let seatNum = Math.max(...[...room.players.values()].map(p => p.seat), 0);
        for (let i = 0; i < toAdd; i++) {
          const name = botNames.find(n => !taken.has(n)) ?? `Bot${i + 1}`;
          taken.add(name);
          seatNum++;
          const botId = `bot_${randomUUID()}`;
          const bot: import('./types/index.js').Player = {
            id: botId, name, avatar: '🤖', avatarUrl: null, socketId: `bot_socket_${botId}`,
            isHost: false, isAlive: true, isConnected: true, isReady: true,
            role: null, team: null, voteTarget: null, hasActedThisPhase: false,
            seat: seatNum, joinedAt: Date.now(), profileId: null,
            isSpectator: false, isQueuedNextRound: false, queuePosition: null,
            lastWill: null, isModerator: false, moderatorLevel: null,
            deathType: null, foulCount: 0, isBot: true,
          };
          room.players.set(botId, bot);
        }
        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Dev: Remove Bots (owner-only) ────────────────────────────────
    socket.on('dev:clear_bots', async (cb: any) => {
      try {
        const room = getRoomFromSocket(socket);
        const profile = socket.data.profileId ? await getPlayer(socket.data.profileId) : null;
        if (profile?.moderatorLevel !== 'owner') throw new Error('Owner only.');
        if (room.phase !== 'lobby') throw new Error('Can only clear bots in lobby.');
        for (const [id, p] of room.players) {
          if (p.isBot) room.players.delete(id);
        }
        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Skip Phase ──────────────────────────────────────────────────
    socket.on('game:skip', async (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const host = getPlayerOrError(socket, room);
        const isDonModerator = room.settings.donMode && room.donModeratorId === host.id;
        if (!host.isHost && !isDonModerator) throw new Error('Only the host can skip phases.');
        if (room.phase === 'lobby' || room.phase === 'game_over') throw new Error('Cannot skip this phase.');

        // During speech phase: host can only skip another player's turn if hostSkipPrivilege is enabled.
        // Don mode: the host and the წამყვანი moderate every turn by design.
        if (room.phase === 'speech' && !isDonModerator && !room.settings.donMode) {
          const currentSpeakerId = room.speechOrder[room.currentSpeakerIdx ?? 0] ?? null;
          const isOwnTurn = host.id === currentSpeakerId;
          if (!isOwnTurn && !room.settings.hostSkipPrivilege) {
            throw new Error('Host skip privilege is not enabled for this room.');
          }
        }

        timerService.stop(room.id);
        room.timer = 0;

        const wasNightSkip = room.phase === 'night';
        const wasSpeechSkip = room.phase === 'speech';
        if (room.phase === 'voting') announceVoteResult(io, room);

        advancePhase(room); const nextPhase = room.phase as Phase;
        if (wasNightSkip) { announceNightResult(io, room); notifySpies(io, room); notifyTrackers(io, room); notifyCultConversions(io, room); notifyRoleblocked(io, room); }
        if (wasSpeechSkip && nextPhase !== 'speech') announceSpeechEnd(io, room, nextPhase);
        announceActiveEvent(io, room);
        if (nextPhase === 'game_over') await emitGameOver(io, room);
        broadcastRoom(io, room);
        enforceVoicePhaseRules(io, room);
        if (nextPhase !== 'game_over') startPhaseTimer(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Speech Pass (current speaker skips own turn) ─────────────────
    socket.on('game:speech_pass', async (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const player = getPlayerOrError(socket, room);
        if (room.phase !== 'speech') throw new Error('Can only pass during speech phase.');
        if (!player.isAlive || player.isSpectator) throw new Error('Only alive players can pass.');
        const currentSpeakerId = room.speechOrder?.[room.currentSpeakerIdx ?? 0];
        if (player.id !== currentSpeakerId) throw new Error('Only the current speaker can pass.');

        timerService.stop(room.id);
        room.timer = 0;

        advancePhase(room); const nextPhase = room.phase as Phase;
        if (nextPhase !== 'speech') announceSpeechEnd(io, room, nextPhase);
        announceActiveEvent(io, room);
        if (nextPhase === 'game_over') await emitGameOver(io, room);
        broadcastRoom(io, room);
        enforceVoicePhaseRules(io, room);
        if (nextPhase !== 'game_over') startPhaseTimer(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Day Skip Vote ───────────────────────────────────────────────
    socket.on('game:day_skip_vote', (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const player = getPlayerOrError(socket, room);
        if (room.phase !== 'day') throw new Error('Can only skip during day phase.');
        if (!player.isAlive || player.isSpectator) throw new Error('Cannot vote to skip.');
        if (room.daySkipVotes.includes(player.id)) throw new Error('Already voted to skip.');

        room.daySkipVotes.push(player.id);
        const alivePlayers = [...room.players.values()].filter(p => p.isAlive && !p.isSpectator);
        const skipNeeded = Math.min(3, alivePlayers.length);

        if (room.daySkipVotes.length >= skipNeeded) {
          timerService.stop(room.id);
          room.timer = 0;
          const nextPhase = advancePhase(room);
          announceActiveEvent(io, room);
          broadcastRoom(io, room);
          enforceVoicePhaseRules(io, room);
          if (nextPhase !== 'game_over') startPhaseTimer(io, room);
        } else {
          broadcastRoom(io, room);
        }
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Skip Defense (current defense candidate skips own turn) ─────────
    socket.on('game:skip-defense', async (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const player = getPlayerOrError(socket, room);
        if (room.phase !== 'trial_defense') throw new Error('Not in trial defense phase.');
        if (!player.isAlive || player.isSpectator) throw new Error('Only alive players can skip defense.');
        const tds = room.trialDefenseState;
        if (!tds) throw new Error('No trial defense in progress.');
        const currentCandidateId = tds.candidateIds[tds.currentCandidateIdx];
        const isHost = player.isHost;
        if (player.id !== currentCandidateId && !isHost) {
          throw new Error('Only the current defense candidate (or host) can skip.');
        }

        timerService.stop(room.id);
        room.timer = 0;

        const nextPhase = advancePhase(room);
        announceActiveEvent(io, room);
        if (nextPhase === 'game_over') await emitGameOver(io, room);
        broadcastRoom(io, room);
        enforceVoicePhaseRules(io, room);
        if (nextPhase !== 'game_over') startPhaseTimer(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Issue Foul (presser interrupts current speaker for 6 seconds) ───
    socket.on('game:foul', async (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const presser = getPlayerOrError(socket, room);
        if (room.phase !== 'speech') throw new Error('Fouls can only be issued during speech phase.');
        if (!presser.isAlive || presser.isSpectator) throw new Error('Only alive players can issue fouls.');
        const currentSpeakerId = room.speechOrder[room.currentSpeakerIdx];
        if (presser.id === currentSpeakerId) throw new Error('The current speaker cannot foul themselves.');

        // Only one active foul at a time
        if (room.activeFoul && Date.now() < room.activeFoul.endsAt) {
          throw new Error('A foul is already active. Wait for it to expire.');
        }

        const speaker = room.players.get(currentSpeakerId ?? '');
        if (!speaker) throw new Error('No active speaker found.');

        // Track fouls on the PRESSER (the player who pressed the foul button)
        presser.foulCount = (presser.foulCount ?? 0) + 1;

        if (presser.foulCount >= 4) {
          // 4th foul: the player gets the SAME 6-second word window as fouls
          // 1-3 — say your piece — and is eliminated when it expires. (An
          // instant drop made pressing the 4th foul pointless: you'd die
          // before saying anything.)
          const fatalEndsAt = Date.now() + 6000;
          room.activeFoul = { playerId: presser.id, endsAt: fatalEndsAt };

          broadcastSystemMsg(io, room, `⚠️ ${presser.name}: ფოლი #4 — ბოლო სიტყვა (6 წმ), შემდეგ გარიცხვა`);

          // Open the presser's mic for the fatal word (mesh + LiveKit).
          enforceVoicePhaseRules(io, room);
          broadcastRoom(io, room);

          const fatalRoomId = room.id;
          setTimeout(async () => {
            const liveRoom = getRoom(fatalRoomId);
            if (!liveRoom) return;
            // Only act if this exact fatal window is still the active one.
            if (liveRoom.activeFoul?.playerId !== presser.id || liveRoom.activeFoul.endsAt !== fatalEndsAt) return;
            liveRoom.activeFoul = null;
            const dying = liveRoom.players.get(presser.id);
            if (!dying || !dying.isAlive || liveRoom.phase === 'game_over') {
              enforceVoicePhaseRules(io, liveRoom);
              broadcastRoom(io, liveRoom);
              return;
            }
            dying.isAlive = false;
            dying.deathType = 'foul';
            broadcastSystemMsg(io, liveRoom, `⚠️ ${dying.name}: ფოლი #4 — გარიცხულია!`);
            if (checkWin(liveRoom)) {
              timerService.stop(liveRoom.id);
              setPhase(liveRoom, 'game_over');
              await emitGameOver(io, liveRoom);
            }
            broadcastRoom(io, liveRoom);
            enforceVoicePhaseRules(io, liveRoom);
          }, 6000);

          cb(ok(null));
          return;
        }

        // Activate the foul window: presser gets 6 seconds to speak
        const foulEndsAt = Date.now() + 6000;
        room.activeFoul = { playerId: presser.id, endsAt: foulEndsAt };

        broadcastSystemMsg(io, room, `⚠️ ${presser.name}: ფოლი #${presser.foulCount}/3`);

        // Give the presser voice access for the foul window. enforceVoicePhaseRules
        // re-applies the speech rules for BOTH mesh and LiveKit users, and its
        // foul check unmutes the presser (activeFoul is set above).
        enforceVoicePhaseRules(io, room);

        // Expire the foul after 6 seconds and re-mute presser
        const foulRoomId = room.id;
        setTimeout(() => {
          const liveRoom = getRoom(foulRoomId);
          if (!liveRoom) return;
          if (liveRoom.activeFoul?.playerId === presser.id && liveRoom.activeFoul.endsAt === foulEndsAt) {
            liveRoom.activeFoul = null;
            if (liveRoom.phase === 'speech') {
              // Foul window over — re-mute the presser (mesh + LiveKit).
              enforceVoicePhaseRules(io, liveRoom);
              broadcastRoom(io, liveRoom);
            }
          }
        }, 6000);

        broadcastRoom(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Set Last Will ────────────────────────────────────────────────────
    socket.on('game:set_will', ({ text }, cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const player = getPlayerOrError(socket, room);
        if (!player.isAlive) throw new Error('Eliminated players cannot change their last will.');
        player.lastWill = text.slice(0, 200);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Pause / Resume Timer ─────────────────────────────────────────────
    socket.on('game:pause', (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const host = getPlayerOrError(socket, room);
        const isDonModerator = room.settings.donMode && room.donModeratorId === host.id;
        if (!host.isHost && !isDonModerator) throw new Error('Only the host can pause.');
        if (room.phase === 'lobby' || room.phase === 'game_over') throw new Error('Cannot pause now.');

        if (room.isPaused) {
          room.isPaused = false;
          timerService.resume(room.id);
          broadcastSystemMsg(io, room, '▶ Game resumed.');
        } else {
          room.isPaused = true;
          timerService.pause(room.id);
          broadcastSystemMsg(io, room, '⏸ Game paused by host.');
        }
        broadcastRoom(io, room);
        cb(ok({ isPaused: room.isPaused }));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Leaderboard ──────────────────────────────────────────────────────
    socket.on('leaderboard:get', async (cb) => {
      try { cb(ok(await getLeaderboard())); }
      catch (e: any) { cb(err(e.message)); }
    });

    // ── Terminate Game (host-only, resets to lobby) ─────────────────
    socket.on('game:terminate', (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const host = getPlayerOrError(socket, room);
        if (!host.isHost) throw new Error('Only the host can terminate the game.');
        if (room.phase === 'lobby') throw new Error('No active game to terminate.');

        timerService.stop(room.id);
        room.phase = 'lobby';
        room.winner = null;
        room.day = 0;
        room.timer = 0;
        room.maxTimer = 0;
        room.nightActions = new Map();
        room.votes = new Map();
        room.killedLastNight = [];
        room.savedLastNight = false;
        room.daySkipVotes = [];
        room.speechOrder = [];
        room.currentSpeakerIdx = 0;
        room.isPaused = false;
        room.nominations = new Map();
        room.tribunalCandidates = [];

        // Queued spectators were promised a seat next round — honour it even on
        // terminate: promote them into the player pool (next free seats).
        const promotedOnTerminate = promoteQueuedPlayers(room);

        for (const p of room.players.values()) {
          p.role = null;
          p.team = null;
          p.isAlive = !p.isSpectator;
          p.isReady = false;
          p.voteTarget = null;
          p.hasActedThisPhase = false;
          p.deathType = null;
        }

        if (promotedOnTerminate.length > 0) {
          broadcastSystemMsg(io, room, `${promotedOnTerminate.map(p => p.name).join(', ')} joined from the queue.`);
          broadcastQueueUpdated(io, room);
        }

        broadcastSystemMsg(io, room, 'The host terminated the game. Returning to lobby.');
        broadcastRoom(io, room);
        // Clear all phase-based force mutes so lobby voice works normally
        io.to(room.id).emit('voice:reset');
        enforceVoicePhaseRules(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Restart ─────────────────────────────────────────────────────
    socket.on('game:restart', (cb) => {
      try {
        const room = getRoomFromSocket(socket);
        const host = getPlayerOrError(socket, room);
        if (!host.isHost) throw new Error('Only the host can restart.');

        // Stop any running timers immediately so stale onComplete callbacks cannot fire
        timerService.stop(room.id);

        // Full game-state wipe — only room-level fields persist (id, code, players, settings)
        room.phase = 'lobby';
        room.winner = null;
        room.day = 0;
        room.timer = 0;
        room.maxTimer = 0;
        room.isPaused = false;
        room.nightActions = new Map();
        room.votes = new Map();
        room.killedLastNight = [];
        room.savedLastNight = false;
        room.daySkipVotes = [];
        room.speechOrder = [];
        room.currentSpeakerIdx = 0;

        // Promote queued players into lobby seats before resetting state
        const promoted = promoteQueuedPlayers(room);

        for (const p of room.players.values()) {
          p.role = null;
          p.team = null;
          p.isAlive = !p.isSpectator;
          p.isReady = false;
          p.voteTarget = null;
          p.hasActedThisPhase = false;
          p.deathType = null;
          p.lastWill = null;
        }

        if (promoted.length > 0) {
          const names = promoted.map(p => p.name).join(', ');
          broadcastSystemMsg(io, room, `${names} joined from the queue and will play next round!`);
          broadcastQueueUpdated(io, room);
        }

        broadcastSystemMsg(io, room, 'The host has restarted the room. Prepare for a new game.');
        broadcastRoom(io, room);
        // Clear all phase-based force mutes so lobby voice works normally
        io.to(room.id).emit('voice:reset');
        enforceVoicePhaseRules(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Chat ────────────────────────────────────────────────────────
    socket.on('chat:send', async (data, cb) => {
      try {
        const parsed = ChatSchema.parse(data);
        const room = getRoomFromSocket(socket);
        const player = getPlayerOrError(socket, room);

        // Check mute
        const profileId = socket.data.profileId;
        if (profileId) {
          const mute = await getActiveMute(profileId);
          if (mute) throw new Error(`You are muted until ${new Date(mute.expiresAt).toLocaleString()}. Reason: ${mute.reason}`);
        }

        const validationError = validateChat(room, player, parsed.channel);
        if (validationError) throw new Error(validationError);

        const chatKey = socket.data.profileId ?? socket.id;
        const chatCheck = chatRateOk(chatKey, parsed.text);
        if (!chatCheck.ok) throw new Error(chatCheck.error);

        const profile = profileId ? await getPlayer(profileId) : null;
        const msg = createPlayerMessage(player, parsed.text, parsed.channel, profile?.isModerator ?? false);
        addMessage(room, msg);

        if (parsed.channel === 'mafia') {
          for (const p of room.players.values()) {
            if (p.team === 'mafia' && p.socketId) io.to(p.socketId).emit('chat:new', msg);
          }
        } else if (parsed.channel === 'yakuza') {
          for (const p of room.players.values()) {
            if (p.team === 'yakuza' && p.socketId) io.to(p.socketId).emit('chat:new', msg);
          }
        } else if (parsed.channel === 'dead') {
          for (const p of room.players.values()) {
            if (!p.isAlive && !p.isSpectator && p.socketId) {
              io.to(p.socketId).emit('chat:new', msg);
            }
          }
        } else if (parsed.channel === 'spectator') {
          for (const p of room.players.values()) {
            if (p.isSpectator && p.socketId) io.to(p.socketId).emit('chat:new', msg);
          }
        } else {
          io.to(room.id).emit('chat:new', msg);
        }

        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Kick from room ──────────────────────────────────────────
    socket.on('mod:kick_from_room', async ({ targetProfileId, roomId, reason }, cb) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'kick')) throw new Error('Insufficient permissions.');

        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');

        const target = getPlayerByProfile(room, targetProfileId);
        if (!target) throw new Error('Player not found in room.');

        if (target.socketId) {
          const targetSock = io.sockets.sockets.get(target.socketId);
          if (targetSock) {
            targetSock.emit('kicked', { reason: `Removed by moderator. Reason: ${reason}` });
            handleVoiceLeave(io, target.socketId);
            handlePlayerLeave(io, targetSock as any, roomId, target.id);
          } else {
            removePlayer(room, target.id);
            if (room.players.size > 0) {
              broadcastSystemMsg(io, room, `${target.name} was removed by a moderator.`);
              broadcastRoom(io, room);
            }
          }
        } else {
          removePlayer(room, target.id);
          if (room.players.size > 0) {
            broadcastSystemMsg(io, room, `${target.name} was removed by a moderator.`);
            broadcastRoom(io, room);
          }
        }

        await logKick(modProfileId, mod.username, target.profileId ?? targetProfileId, target.name, roomId, reason);
        cb(ok(null));
        notifyMods(io, 'mod_kick', `${mod.username} kicked ${target.name} from room`, target.name).catch(() => {});
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Kick player (any room) ──────────────────────────────────
    socket.on('mod:kick_player', async ({ targetProfileId, reason }, cb) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'kick')) throw new Error('Insufficient permissions.');

        const targetProfile = await getPlayer(targetProfileId);
        if (targetProfile && targetProfile.moderatorLevel) {
          const targetRank = ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(targetProfile.moderatorLevel);
          const modRank = mod.moderatorLevel ? ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(mod.moderatorLevel) : -1;
          if (targetRank >= modRank) throw new Error('Cannot kick a moderator of equal or higher rank.');
        }

        // Scan all rooms to find the target
        let foundRoom: import('./types/index.js').Room | null = null;
        let foundTarget: import('./types/index.js').Player | null = null;
        for (const room of getAllRooms()) {
          const player = getPlayerByProfile(room, targetProfileId);
          if (player) {
            foundRoom = room;
            foundTarget = player;
            break;
          }
        }

        if (!foundRoom || !foundTarget) throw new Error('Player is not currently in any room.');

        if (foundTarget.socketId) {
          const targetSock = io.sockets.sockets.get(foundTarget.socketId);
          if (targetSock) {
            targetSock.emit('kicked', { reason: `Removed by moderator. Reason: ${reason}` });
            handleVoiceLeave(io, foundTarget.socketId);
            handlePlayerLeave(io, targetSock as any, foundRoom.id, foundTarget.id);
          } else {
            removePlayer(foundRoom, foundTarget.id);
            if (foundRoom.players.size > 0) {
              broadcastSystemMsg(io, foundRoom, `${foundTarget.name} was removed by a moderator.`);
              broadcastRoom(io, foundRoom);
            }
          }
        } else {
          removePlayer(foundRoom, foundTarget.id);
          if (foundRoom.players.size > 0) {
            broadcastSystemMsg(io, foundRoom, `${foundTarget.name} was removed by a moderator.`);
            broadcastRoom(io, foundRoom);
          }
        }

        await logKick(modProfileId, mod.username, foundTarget.profileId ?? targetProfileId, foundTarget.name, foundRoom.id, reason);
        cb(ok(null));
        notifyMods(io, 'mod_kick', `${mod.username} kicked ${foundTarget.name} from room`, foundTarget.name).catch(() => {});
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Get active rooms ────────────────────────────────────────
    socket.on('mod:get_active_rooms', async (cb) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        cb(ok(getAllRooms().map(toRoomListItem)));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Ban ─────────────────────────────────────────────────────
    socket.on('mod:ban', async ({ targetProfileId, reason, duration }, cb) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'ban_short')) throw new Error('Insufficient permissions.');

        const targetForRankCheck = await getPlayer(targetProfileId);
        if (targetForRankCheck && targetForRankCheck.moderatorLevel) {
          const targetRank = ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(targetForRankCheck.moderatorLevel);
          const modRank = mod.moderatorLevel ? ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(mod.moderatorLevel) : -1;
          if (targetRank >= modRank) throw new Error('Cannot ban a moderator of equal or higher rank.');
        }

        const ban = await banPlayer(modProfileId, mod.username, targetProfileId, reason, duration);

        // Disconnect target from all rooms
        const targetSock = findSocketByProfile(io as any, targetProfileId);
        if (targetSock) {
          targetSock.emit('ban:received', { reason, expiresAt: ban.expiresAt });
          const { roomId: targetRoomId, playerId: targetPlayerId } = targetSock.data as SocketData;
          if (targetRoomId && targetPlayerId) {
            handlePlayerLeave(io, targetSock as any, targetRoomId, targetPlayerId);
          }
          targetSock.disconnect(true);
        }

        cb(ok(null));
        // Notify mods in background — don't block the ack
        getPlayer(targetProfileId).then(target => {
          notifyMods(io, 'mod_ban', `${mod.username} banned ${target?.username ?? '?'}`, target?.username).catch(() => {});
        }).catch(() => {});
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Unban ───────────────────────────────────────────────────
    socket.on('mod:unban', async ({ targetProfileId }, cb) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'ban_short')) throw new Error('Insufficient permissions.');
        await unbanPlayer(modProfileId, mod.username, targetProfileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Mute ────────────────────────────────────────────────────
    socket.on('mod:mute', async ({ targetProfileId, reason, duration }, cb) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'mute')) throw new Error('Insufficient permissions.');

        const mute = await mutePlayer(modProfileId, mod.username, targetProfileId, reason, duration);

        const targetSock = findSocketByProfile(io as any, targetProfileId);
        if (targetSock) {
          targetSock.emit('mute:received', { reason, expiresAt: mute.expiresAt });
        }

        cb(ok(null));
        getPlayer(targetProfileId).then(target => {
          notifyMods(io, 'mod_mute', `${mod.username} muted ${target?.username ?? '?'}`, target?.username).catch(() => {});
        }).catch(() => {});
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Unmute ──────────────────────────────────────────────────
    socket.on('mod:unmute', async ({ targetProfileId }, cb) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'mute')) throw new Error('Insufficient permissions.');
        await unmutePlayer(modProfileId, mod.username, targetProfileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Warn ────────────────────────────────────────────────────
    socket.on('mod:warn', async ({ targetProfileId, reason, category }: { targetProfileId: string; reason: string; category?: string }, cb) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'warn')) throw new Error('Insufficient permissions.');

        const target = await getPlayer(targetProfileId);
        if (target && target.moderatorLevel) {
          const targetRank = ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(target.moderatorLevel);
          const modRank = mod.moderatorLevel ? ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(mod.moderatorLevel) : -1;
          if (targetRank >= modRank) throw new Error('Cannot warn a moderator of equal or higher rank.');
        }

        const warnCat = (category ?? 'other') as import('./types/index.js').WarnCategory;
        const warning = await warnPlayer(modProfileId, mod.username, targetProfileId, reason, warnCat);

        const targetSock = findSocketByProfile(io as any, targetProfileId);
        if (targetSock) {
          targetSock.emit('warning:received', { reason, category: warnCat, moderatorName: mod.username });
        }

        cb(ok(null));
        notifyMods(io, 'mod_warn', `${mod.username} warned ${target?.username ?? '?'}`, target?.username).catch(() => {});
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Get data ────────────────────────────────────────────────
    socket.on('mod:get_reports', async (cb) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        cb(ok(await getReports()));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:get_rooms', async (cb) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        cb(ok(getAllRooms().map(toRoomListItem)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:get_players', async (cb) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        cb(ok(await getModPlayers()));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:get_banned_players', async (cb) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        cb(ok(await getBannedPlayers()));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:get_logs', async (cb) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_logs')) throw new Error('Insufficient permissions.');
        cb(ok(await getLogs()));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:resolve_report', async ({ reportId, status, notes }, cb) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'resolve_reports')) throw new Error('Insufficient permissions.');
        await resolveReport(modProfileId, reportId, status, notes);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Terminate any room's game ───────────────────────────────
    socket.on('mod:terminate_game', async ({ roomId, reason }: { roomId: string; reason: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'ban_long')) throw new Error('Insufficient permissions.');

        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');
        if (room.phase === 'lobby') throw new Error('No active game to terminate.');

        timerService.stop(room.id);
        room.phase = 'lobby';
        room.winner = null;
        room.day = 0;
        room.timer = 0;
        room.maxTimer = 0;
        room.nightActions = new Map();
        room.votes = new Map();
        room.killedLastNight = [];
        room.savedLastNight = false;
        room.daySkipVotes = [];
        room.speechOrder = [];
        room.currentSpeakerIdx = 0;
        room.isPaused = false;

        for (const p of room.players.values()) {
          p.role = null;
          p.team = null;
          p.isAlive = true;
          p.isReady = false;
          p.voteTarget = null;
          p.hasActedThisPhase = false;
          p.deathType = null;
        }

        broadcastSystemMsg(io, room, `A moderator terminated the game. Reason: ${reason || 'Rule violation'}`);
        broadcastRoom(io, room);
        io.to(room.id).emit('voice:reset');
        enforceVoicePhaseRules(io, room);
        await logKick(modProfileId, mod.username, roomId, room.code, roomId, `Terminated game: ${reason || 'Rule violation'}`);
        await notifyMods(io, 'mod_kick', `${mod.username} terminated game in room ${room.code}`, room.code);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Close Room (permanently removes room, kicks all players) ─
    socket.on('mod:close_room', async ({ roomId, reason }: { roomId: string; reason: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        if (!modProfileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(modProfileId);
        if (!mod || !canDo(mod, 'ban_long')) throw new Error('Insufficient permissions. Admin+ required.');

        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');

        const code = room.code;
        const playerNames = [...room.players.values()].map(p => p.name).join(', ');
        closeRoom(io, room, reason || 'Closed by moderator');
        await logKick(modProfileId, mod.username, roomId, code, roomId, `Closed room: ${reason || 'No reason given'}`);
        await notifyMods(io, 'mod_kick', `${mod.username} closed room ${code} (${playerNames})`, code);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Dashboard Stats ──────────────────────────────────────────
    socket.on('mod:get_dashboard', async (cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        const { openReports, recentBans, newUsersToday, avgMatchSeconds } = await getDashboardDbStats();
        const rooms = getAllRooms();
        let voiceUsers = 0;
        for (const [, voices] of _spaceVoice) voiceUsers += voices.size;
        cb(ok({
          onlinePlayers: getOnlineCountRaw(), // mod dashboard shows true online (incl. invisible owners)
          spectatingPlayers: getSpectatingCount(),
          activeRooms: rooms.length,
          openReports,
          recentBans,
          peakOnline: getPeakOnline(),
          newUsersToday,
          avgMatchSeconds,
          voiceUsers,
        }));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Live Rooms (NO roles/teams) ─────────────────────────────
    socket.on('mod:get_rooms_live', async (cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        const rooms = getAllRooms();
        const result: LiveRoomInfo[] = rooms.map(room => {
          const hostPlayer = getHostPlayer(room);
          const players: LiveRoomPlayer[] = Array.from(room.players.values())
            .filter(p => !p.isSpectator)
            .map(p => ({
              id: p.id,
              name: p.name,
              seat: p.seat,
              isAlive: p.isAlive,
              isConnected: p.isConnected,
              profileId: p.profileId ?? null,
              // role and team intentionally omitted — never expose before game_over
            }));
          return {
            id: room.id,
            code: room.code,
            phase: room.phase,
            day: room.day,
            timer: room.timer,
            maxTimer: room.maxTimer,
            playerCount: players.length,
            hostName: hostPlayer?.name ?? '?',
            isPrivate: room.settings.isPrivate,
            isPaused: room.isPaused,
            players,
          };
        });
        cb(ok(result));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Pause Timer ──────────────────────────────────────────────
    socket.on('mod:pause_timer', async ({ roomId }: { roomId: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'kick')) throw new Error('Insufficient permissions.');
        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');
        if (room.phase === 'lobby' || room.phase === 'game_over') throw new Error('No active game timer.');
        timerService.pause(room.id);
        room.isPaused = true;
        broadcastSystemMsg(io, room, `⏸ A moderator paused the timer.`);
        broadcastRoom(io, room);
        await addModLog('pause_timer', modProfileId!, mod.username, roomId, room.code, roomId, 'Mod pause');
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Resume Timer ─────────────────────────────────────────────
    socket.on('mod:resume_timer', async ({ roomId }: { roomId: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'kick')) throw new Error('Insufficient permissions.');
        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');
        timerService.resume(room.id);
        room.isPaused = false;
        broadcastSystemMsg(io, room, `▶ A moderator resumed the timer.`);
        broadcastRoom(io, room);
        await addModLog('resume_timer', modProfileId!, mod.username, roomId, room.code, roomId, 'Mod resume');
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Force Phase ──────────────────────────────────────────────
    socket.on('mod:force_phase', async ({ roomId, phase }: { roomId: string; phase: Phase }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'ban_long')) throw new Error('Insufficient permissions.');
        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');
        if (phase === 'game_over') throw new Error('Use terminate to end a game.');
        const allowed: Phase[] = ['night', 'morning', 'day', 'speech', 'voting'];
        if (!allowed.includes(phase)) throw new Error('Invalid phase.');
        timerService.stop(room.id);
        setPhase(room, phase);
        broadcastSystemMsg(io, room, `⚡ A moderator forced phase: ${phase}.`);
        broadcastRoom(io, room);
        await addModLog('force_phase', modProfileId!, mod.username, roomId, room.code, roomId, `Force phase: ${phase}`);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: System Message to Room ───────────────────────────────────
    socket.on('mod:system_message', async ({ roomId, message }: { roomId: string; message: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'kick')) throw new Error('Insufficient permissions.');
        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');
        const text = message.trim().slice(0, 300);
        if (!text) throw new Error('Message cannot be empty.');
        broadcastSystemMsg(io, room, `[MOD] ${text}`);
        await addModLog('system_message', modProfileId!, mod.username, roomId, room.code, roomId, text);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Broadcast to All Rooms ───────────────────────────────────
    socket.on('mod:broadcast', async ({ message }: { message: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'ban_short')) throw new Error('Insufficient permissions.');
        const text = message.trim().slice(0, 300);
        if (!text) throw new Error('Message cannot be empty.');
        for (const room of getAllRooms()) {
          broadcastSystemMsg(io, room, `[BROADCAST] ${text}`);
        }
        io.emit('mod:notification' as any, { type: 'broadcast', message: `[BROADCAST] ${text}` });
        await addModLog('broadcast', modProfileId!, mod.username, 'all', 'all', null, text);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Global Announcement (banner / popup to EVERY connected user) ──
    socket.on('mod:announce' as any, async ({ message, style }: { message: string; style: 'banner' | 'popup' }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'ban_short')) throw new Error('Insufficient permissions.');
        const text = message.trim().slice(0, 300);
        if (!text) throw new Error('Message cannot be empty.');
        const safeStyle = style === 'popup' ? 'popup' : 'banner';
        io.emit('system:announce', { id: randomUUID(), message: text, style: safeStyle });
        await addModLog('broadcast', modProfileId!, mod.username, 'all', 'all', null, `Announce (${safeStyle}): ${text}`);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Toggle Maintenance Mode ──────────────────────────────────
    socket.on('mod:toggle_maintenance', async ({ enabled }: { enabled: boolean }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'ban_long')) throw new Error('Insufficient permissions.');
        maintenanceMode = enabled;
        io.emit('maintenance:status', { enabled });
        await addModLog('broadcast', modProfileId!, mod.username, 'system', 'system', null, `Maintenance mode: ${enabled}`);
        cb(ok({ enabled }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:get_maintenance', async (cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        cb(ok({ enabled: maintenanceMode }));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Owner stealth: Invisible Mode ─────────────────────────────────
    socket.on('mod:set_invisible' as any, async ({ enabled }: { enabled: boolean }, cb: any) => {
      try {
        const pid = socket.data.profileId;
        const mod = pid ? await getPlayer(pid) : null;
        if (!mod || mod.moderatorLevel !== 'owner') throw new Error('Owner only.');
        setInvisible(pid!, !!enabled);
        broadcastOnlineCount(io); // others' online count drops/rises accordingly
        await addModLog('broadcast', pid!, mod.username, 'system', 'system', null, `Invisible Mode: ${enabled ? 'ON' : 'OFF'}`);
        cb(ok({ enabled: !!enabled }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:get_invisible' as any, async (cb: any) => {
      try {
        const pid = socket.data.profileId;
        const mod = pid ? await getPlayer(pid) : null;
        if (!mod || mod.moderatorLevel !== 'owner') throw new Error('Owner only.');
        cb(ok({ enabled: isInvisible(pid!) }));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Owner stealth: Ghost Mode (extends Invisible) ─────────────────
    socket.on('mod:set_ghost' as any, async ({ enabled }: { enabled: boolean }, cb: any) => {
      try {
        const pid = socket.data.profileId;
        const mod = pid ? await getPlayer(pid) : null;
        if (!mod || mod.moderatorLevel !== 'owner') throw new Error('Owner only.');
        setGhost(pid!, !!enabled);            // enabling also forces invisible on
        broadcastOnlineCount(io);
        await addModLog('broadcast', pid!, mod.username, 'system', 'system', null, `Ghost Mode: ${enabled ? 'ON' : 'OFF'}`);
        cb(ok({ ghost: isGhost(pid!), invisible: isInvisible(pid!) }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:get_ghost' as any, async (cb: any) => {
      try {
        const pid = socket.data.profileId;
        const mod = pid ? await getPlayer(pid) : null;
        if (!mod || mod.moderatorLevel !== 'owner') throw new Error('Owner only.');
        cb(ok({ ghost: isGhost(pid!), invisible: isInvisible(pid!) }));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Player Detail ────────────────────────────────────────────
    socket.on('mod:get_player_detail', async ({ targetProfileId }: { targetProfileId: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        const detail = await getPlayerDetail(targetProfileId);
        cb(ok(detail));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Get Player Auth Info (owner only) ─────────────────────────
    socket.on('mod:get_player_auth_info', async ({ targetProfileId }: { targetProfileId: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || mod.moderatorLevel !== 'owner') throw new Error('Owner only.');
        const accounts = await sql<{ provider: string; email: string | null; display_name: string | null; provider_user_id: string; created_at: number }[]>`
          SELECT provider, email, display_name, provider_user_id, created_at
          FROM auth_accounts WHERE user_id = ${targetProfileId}
          ORDER BY created_at ASC
        `;
        cb(ok({ accounts }));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Add Note ─────────────────────────────────────────────────
    socket.on('mod:add_note', async ({ targetProfileId, note }: { targetProfileId: string; note: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        await addModNote(modProfileId!, mod.username, targetProfileId, note);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Freeze / Unfreeze Account ────────────────────────────────
    socket.on('mod:freeze_account', async ({ targetProfileId, reason }: { targetProfileId: string; reason: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'ban_short')) throw new Error('Insufficient permissions.');
        await freezeAccount(modProfileId!, mod.username, targetProfileId, reason);
        await notifyMods(io, 'mod_freeze', `${mod.username} froze account of ${targetProfileId}`, targetProfileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:unfreeze_account', async ({ targetProfileId }: { targetProfileId: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'ban_short')) throw new Error('Insufficient permissions.');
        await unfreezeAccount(modProfileId!, mod.username, targetProfileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Rename Player ────────────────────────────────────────────
    socket.on('mod:rename_player', async ({ targetProfileId, newName, reason }: { targetProfileId: string; newName: string; reason: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'ban_short')) throw new Error('Insufficient permissions.');
        await renamePlayer(modProfileId!, mod.username, targetProfileId, newName, reason);
        await notifyMods(io, 'mod_rename', `${mod.username} renamed player`, targetProfileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Voice Mute Room ──────────────────────────────────────────
    socket.on('mod:voice_mute_room', async ({ roomId, reason }: { roomId: string; reason: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'kick')) throw new Error('Insufficient permissions.');
        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');
        io.to(room.id).emit('voice:force-mute', { reason: reason || 'Muted by moderator' });
        broadcastSystemMsg(io, room, `🔇 A moderator muted all voice in this room.`);
        await addModLog('kick', modProfileId!, mod.username, roomId, room.code, roomId, `Voice mute: ${reason}`);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Voice tools per player ──────────────────────────────────
    socket.on('mod:voice_clear_forced_mute', async ({ targetProfileId }: { targetProfileId: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'kick')) throw new Error('Insufficient permissions.');
        const target = await getPlayer(targetProfileId);
        if (!target) throw new Error('Player not found.');
        const targetSock = findSocketByProfile(io as any, targetProfileId);
        if (targetSock) targetSock.emit('voice:force-unmute');
        await addModLog('kick', modProfileId!, mod.username, targetProfileId, target.username, null, 'Voice: cleared forced mute');
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:voice_force_reconnect', async ({ targetProfileId }: { targetProfileId: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'kick')) throw new Error('Insufficient permissions.');
        const target = await getPlayer(targetProfileId);
        if (!target) throw new Error('Player not found.');
        const targetSock = findSocketByProfile(io as any, targetProfileId);
        if (targetSock) targetSock.emit('voice:force-leave', { channel: 'room', reason: 'Force reconnect by moderator' });
        await addModLog('kick', modProfileId!, mod.username, targetProfileId, target.username, null, 'Voice: force reconnect');
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Assign Report ────────────────────────────────────────────
    socket.on('mod:assign_report', async ({ reportId, modId }: { reportId: string; modId: string }, cb: any) => {
      try {
        const modProfileId = socket.data.profileId;
        const mod = modProfileId ? await getPlayer(modProfileId) : null;
        if (!mod || !canDo(mod, 'view_reports')) throw new Error('Insufficient permissions.');
        await assignReport(reportId, modId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Player Profile (by profileId) ─────────────────────────────────
    socket.on('player:profile', async ({ profileId }, cb) => {
      try {
        const profile = await getPlayer(profileId);
        if (!profile) throw new Error('Profile not found.');
        cb(ok(toPublicProfile(profile)));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Achievements ─────────────────────────────────────────────────
    socket.on('player:achievements', async ({ profileId }, cb) => {
      try {
        const achs = await getPlayerAchievements(profileId);
        cb(ok(achs));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Game History ──────────────────────────────────────────────────
    socket.on('player:history', async ({ profileId }, cb) => {
      try {
        const history = await getPlayerHistory(profileId, 20);
        cb(ok(history));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('lobby:player_roles', async ({ profileIds, roomCode }, cb) => {
      try {
        if (!Array.isArray(profileIds) || !profileIds.length || !roomCode) { cb(ok({})); return; }
        cb(ok(await getPlayersLastRolesInRoom(profileIds.slice(0, 20), roomCode)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('room:invite', async ({ friendProfileId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const room = getAllRooms().find(r => getPlayerByProfile(r, profileId));
        if (!room) throw new Error('Not in a room.');
        const me = getPlayerByProfile(room, profileId);
        if (!me) throw new Error('Not in a room.');
        const friendSock = findSocketByProfile(io as any, friendProfileId);
        if (friendSock) {
          const playerCount = [...room.players.values()].filter(p => !p.isSpectator).length;
          friendSock.emit('room:invite_received', {
            inviterName: me.name,
            inviterAvatar: me.avatarUrl ?? me.name[0] ?? '?',
            roomCode: room.code,
            playerCount,
            maxPlayers: room.settings.minPlayers,
          });
        }
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Public Profile (for profile popups) ──────────────────────────
    socket.on('player:public_profile', async ({ profileId }: { profileId: string }, cb: any) => {
      try {
        const profile = await getPlayer(profileId);
        if (!profile) throw new Error('Player not found.');

        const [achievements, history, clanMembership, roleStats] = await Promise.all([
          getPlayerAchievements(profileId),
          getPlayerHistory(profileId, 10),
          getClanMembershipByPlayer(profileId),
          getPlayerRoleStats(profileId),
        ]);

        let friendshipStatus: string = 'none';
        const myProfileId = socket.data.profileId;
        if (myProfileId && myProfileId !== profileId) {
          friendshipStatus = await getFriendshipStatus(myProfileId, profileId);
        }

        cb(ok({
          profile: toPublicProfile(profile),
          achievements,
          recentGames: history,
          clan: clanMembership,
          friendshipStatus,
          isOnline: isOnline(profileId),
          roleStats,
        }));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Role Stats (role/team breakdown for any player) ───────────────
    socket.on('player:role_stats', async ({ profileId }: { profileId: string }, cb: any) => {
      try {
        const stats = await getPlayerRoleStats(profileId);
        cb(ok(stats));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Clans ─────────────────────────────────────────────────────────
    socket.on('clan:list', async (cb) => {
      try { cb(ok(await getAllClans())); } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:get', async ({ clanId }, cb) => {
      try {
        const clan = await getClan(clanId);
        if (!clan) throw new Error('Clan not found.');
        const members = await getClanMembers(clanId);
        cb(ok({ clan, members }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:mine', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) return cb(ok(null));
        cb(ok(await getClanByPlayer(profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    // Enter (or lazily create) the caller's clan lounge — returns its join code.
    socket.on('clan:lounge_enter' as any, async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const membership = await getClanMembershipByPlayer(profileId);
        if (!membership) throw new Error('You are not in a clan.');
        const meta = _ensureClanSpace(membership.id, membership.name);
        cb(ok({ code: meta.code }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:my_membership', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) return cb(ok(null));
        cb(ok(await getClanMembershipByPlayer(profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:create', async ({ name, tag, description }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const clan = await createClan(profileId, name, tag, description);
        cb(ok(clan));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:join', async ({ clanId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await joinClan(profileId, clanId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:leave', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await leaveClan(profileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    (socket as any).on('clan:update_image', async ({ clanId, imageData }: { clanId: string; imageData: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        if (!imageData || typeof imageData !== 'string') throw new Error('Invalid image data.');
        if (!imageData.startsWith('data:image/')) throw new Error('Invalid image format.');
        await setClanImage(clanId, profileId, imageData);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    (socket as any).on('clan:set_role', async ({ targetPlayerId, newRole }: { targetPlayerId: string; newRole: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const validRoles = ['admin', 'moderator', 'member'];
        if (!validRoles.includes(newRole)) throw new Error('Invalid role.');
        await setClanMemberRole(profileId, targetPlayerId, newRole as any);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    (socket as any).on('clan:get_mod_logs', async ({ clanId }: { clanId: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const membership = await getClanMembershipByPlayer(profileId);
        if (!membership || membership.id !== clanId) throw new Error('Not authorized.');
        const validRoles = ['owner', 'admin'];
        if (!validRoles.includes(membership.memberRole)) throw new Error('Only clan owner/admin can view mod logs.');
        const logs = await getClanModLogs(clanId);
        cb(ok(logs));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Clan Wars ─────────────────────────────────────────────────────

    socket.on('clan:war_challenge', async ({ defenderClanId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');

        const membership = await getClanMembershipByPlayer(profileId);
        if (!membership) throw new Error('You are not in a clan.');
        if (membership.memberRole !== 'owner' && membership.memberRole !== 'admin') {
          throw new Error('Only clan owner or admin can issue war challenges.');
        }

        const war = await challengeClan(membership.id, defenderClanId);

        // Notify all members of the defender clan
        for (const [, sock] of io.sockets.sockets) {
          const sid = (sock.data as SocketData).profileId;
          if (!sid) continue;
          const m = await getClanMembershipByPlayer(sid).catch(() => null);
          if (m && m.id === defenderClanId) {
            sock.emit('clan:war_challenged', { war });
          }
        }

        cb(ok(war));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:war_accept', async ({ warId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');

        const membership = await getClanMembershipByPlayer(profileId);
        if (!membership) throw new Error('You are not in a clan.');
        if (membership.memberRole !== 'owner' && membership.memberRole !== 'admin') {
          throw new Error('Only clan owner or admin can accept war challenges.');
        }

        const war = await acceptWar(warId, membership.id);

        // Notify all members of both clans
        for (const [, sock] of io.sockets.sockets) {
          const sid = (sock.data as SocketData).profileId;
          if (!sid) continue;
          const m = await getClanMembershipByPlayer(sid).catch(() => null);
          if (m && (m.id === war.challengerClanId || m.id === war.defenderClanId)) {
            sock.emit('clan:war_started', { war });
          }
        }

        cb(ok(war));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:war_decline', async ({ warId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');

        const membership = await getClanMembershipByPlayer(profileId);
        if (!membership) throw new Error('You are not in a clan.');
        if (membership.memberRole !== 'owner' && membership.memberRole !== 'admin') {
          throw new Error('Only clan owner or admin can decline war challenges.');
        }

        const war = await declineWar(warId, membership.id);
        cb(ok(war));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:war_status', async ({ clanId }, cb) => {
      try {
        const war = await getActiveWar(clanId);
        cb(ok(war));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:war_history', async ({ clanId }, cb) => {
      try {
        const history = await getWarHistory(clanId, 10);
        cb(ok(history));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Clan Room Moderation ────────────────────────────────────────
    (socket as any).on('clanRoom:warn', async ({ targetPlayerId, reason }: { targetPlayerId: string; reason: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        const roomId = socket.data.roomId;
        if (!profileId) throw new Error('Not authenticated.');
        if (!roomId) throw new Error('Not in a room.');

        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');
        if (!room.clanId) throw new Error('This is not a clan room.');

        // Check actor's clan membership
        const actorMembership = await getClanMembershipByPlayer(profileId);
        if (!actorMembership || actorMembership.id !== room.clanId) {
          throw new Error('You are not a member of this clan.');
        }
        const actorRole = actorMembership.memberRole;
        if (actorRole !== 'owner' && actorRole !== 'admin' && actorRole !== 'moderator') {
          throw new Error('You do not have clan moderation permissions.');
        }

        // Find target player in room
        const targetPlayer = [...room.players.values()].find(p => p.profileId === targetPlayerId);
        if (!targetPlayer) throw new Error('Target player not in this room.');

        // Rank protection: cannot warn owner/admin unless you are owner
        if (targetPlayerId !== profileId) {
          const targetMembership = await getClanMembershipByPlayer(targetPlayerId);
          if (targetMembership && targetMembership.id === room.clanId) {
            const targetRole = targetMembership.memberRole;
            if (targetRole === 'owner') throw new Error('Cannot warn the clan owner.');
            if (targetRole === 'admin' && actorRole !== 'owner') throw new Error('Cannot warn a clan admin.');
          }
        }

        // Check target is not a global moderator/admin
        const targetProfile = await getPlayer(targetPlayerId);
        if (targetProfile?.isModerator) throw new Error('Cannot use clan actions on global moderators.');

        // Send warning notification to target
        const actorProfile = await getPlayer(profileId);
        const actorName = actorProfile?.username ?? 'Clan Moderator';
        io.to(targetPlayer.socketId).emit('clanRoom:warningReceived' as any, {
          clanName: actorMembership.name,
          clanTag: actorMembership.tag,
          moderatorName: actorName,
          moderatorRole: actorRole,
          reason: reason.slice(0, 300),
        });

        await addClanModLog(room.clanId, profileId, actorName, targetPlayerId, targetPlayer.name, 'clan_warning', reason.slice(0, 300), room.id);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    (socket as any).on('clanRoom:kick', async ({ targetPlayerId, reason }: { targetPlayerId: string; reason: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        const roomId = socket.data.roomId;
        if (!profileId) throw new Error('Not authenticated.');
        if (!roomId) throw new Error('Not in a room.');

        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');
        if (!room.clanId) throw new Error('This is not a clan room.');

        // Check actor's clan membership
        const actorMembership = await getClanMembershipByPlayer(profileId);
        if (!actorMembership || actorMembership.id !== room.clanId) {
          throw new Error('You are not a member of this clan.');
        }
        const actorRole = actorMembership.memberRole;
        if (actorRole !== 'owner' && actorRole !== 'admin' && actorRole !== 'moderator') {
          throw new Error('You do not have clan moderation permissions.');
        }

        // Find target player in room
        const targetPlayer = [...room.players.values()].find(p => p.profileId === targetPlayerId);
        if (!targetPlayer) throw new Error('Target player not in this room.');

        // Rank protection
        if (targetPlayerId !== profileId) {
          const targetMembership = await getClanMembershipByPlayer(targetPlayerId);
          if (targetMembership && targetMembership.id === room.clanId) {
            const targetRole = targetMembership.memberRole;
            if (targetRole === 'owner') throw new Error('Cannot kick the clan owner.');
            if (targetRole === 'admin' && actorRole !== 'owner') throw new Error('Cannot kick a clan admin.');
          }
        }

        // Check target is not a global moderator/admin
        const targetProfile = await getPlayer(targetPlayerId);
        if (targetProfile?.isModerator) throw new Error('Cannot use clan actions on global moderators.');

        const actorProfile = await getPlayer(profileId);
        const actorName = actorProfile?.username ?? 'Clan Moderator';

        // Notify target they are being kicked
        io.to(targetPlayer.socketId).emit('clanRoom:kicked' as any, {
          clanName: actorMembership.name,
          reason: reason.slice(0, 300),
        });

        // Broadcast to room
        broadcastSystemMsg(io, room, `${targetPlayer.name} was removed by clan moderation.`);

        await addClanModLog(room.clanId, profileId, actorName, targetPlayerId, targetPlayer.name, 'clan_kick', reason.slice(0, 300), room.id);

        // Remove player from room
        removePlayer(room, targetPlayer.id);
        socket.to(roomId).emit('room:update', toPublicRoom(room, targetPlayer.id));
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Voice: Join Channel ─────────────────────────────────────────
    socket.on('voice:join', ({ channel }, cb) => {
      try {
        const { roomId, playerId } = socket.data;
        if (!roomId || !playerId) return cb(err('Not in a room.'));
        const room = getRoom(roomId);
        if (!room) return cb(err('Room not found.'));

        const validChannel: VoiceChannel = (channel === 'room' || channel === 'mafia' || channel === 'yakuza') ? channel : 'room';
        const authError = voiceCanJoin(room, playerId, validChannel);
        if (authError) return cb(err(authError));

        const player = room.players.get(playerId)!;
        const existing = voiceJoin(roomId, validChannel, {
          socketId: socket.id,
          playerId,
          name: player.name,
        });

        // Notify existing peers a new participant joined
        for (const peer of existing) {
          io.to(peer.socketId).emit('voice:peer-joined', {
            socketId: socket.id,
            name: player.name,
            channel: validChannel,
          });
        }

        const transmitAllowed = !canTransmitVoice(room, playerId, validChannel);
        const iceConfig = buildIceConfig();
        cb(ok({
          peers: existing.map(p => ({ socketId: p.socketId, name: p.name })),
          transmitAllowed,
          iceServers: iceConfig.iceServers,
          iceTransportPolicy: iceConfig.iceTransportPolicy,
        }));
      } catch (e: any) {
        cb(err(e.message ?? 'Failed to join voice.'));
      }
    });

    // ── Voice: Leave Channel ────────────────────────────────────────
    socket.on('voice:leave', () => {
      handleVoiceLeave(io, socket.id);
    });

    // ── Voice: LiveKit rule sync ────────────────────────────────────────
    // LiveKit clients emit this after connecting (and on reconnect) to pull the
    // current phase voice permission, since they aren't mesh members and only
    // get pushed updates on phase transitions.
    socket.on('voice:livekit_sync', () => {
      try {
        const room = getRoomFromSocket(socket);
        const player = socket.data.playerId ? room.players.get(socket.data.playerId) : null;
        if (!player) return;
        const d = liveKitMainDecision(room, player);
        if (d.transmit) socket.emit('voice:force-unmute');
        else socket.emit('voice:force-mute', { reason: d.reason ?? 'Listen only.' });
      } catch { /* not in a room */ }
    });

    // ── Voice: Relay Offer ──────────────────────────────────────────
    socket.on('voice:offer', ({ to, sdp }, cb) => {
      const channel = voiceGetSharedChannel(socket.id, to);
      if (!channel) {
        // Log but still relay — peers may have a valid existing PC while voice
        // state is transiently out of sync (phase transitions, reconnects).
        // Blocking here silently kills camera renegotiation.
        console.warn(`[voice:offer] No shared channel ${socket.id}→${to}, relaying anyway`);
      }
      io.to(to).emit('voice:offer', { from: socket.id, sdp });
      if (typeof cb === 'function') cb(ok(null));
    });

    // ── Voice: Relay Answer ─────────────────────────────────────────
    socket.on('voice:answer', ({ to, sdp }, cb) => {
      io.to(to).emit('voice:answer', { from: socket.id, sdp });
      cb(ok(null));
    });

    // ── Voice: Relay ICE Candidate ──────────────────────────────────
    socket.on('voice:ice-candidate', ({ to, candidate }) => {
      io.to(to).emit('voice:ice-candidate', { from: socket.id, candidate });
    });

    // ── Voice: Camera state signal ──────────────────────────────────
    // Explicit on/off broadcast so remote UIs learn a peer's camera state
    // directly instead of inferring it from fragile track mute/unmute timing.
    socket.on('voice:camera' as any, (payload: any) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      socket.to(roomId).emit('voice:camera' as any, { socketId: socket.id, on: !!payload?.on });
    });

    // ── Rematch ─────────────────────────────────────────────────────
    socket.on('game:rematch', (cb) => {
      try {
        const { roomId } = socket.data;
        if (!roomId) throw new Error('Not in a room.');
        const room = getRoom(roomId);
        if (!room) throw new Error('Room not found.');
        if (room.phase !== 'game_over') throw new Error('Game is not over yet.');
        const player = getPlayerBySocket(room, socket.id);
        if (!player?.isHost) throw new Error('Only the host can start a rematch.');
        cancelAutoStart(roomId);
        timerService.stop(roomId);
        rematchRoom(room);
        broadcastSystemMsg(io, room, 'The host started a rematch. Prepare for a new game!');
        broadcastRoom(io, room);
        // Clear all phase-based force mutes so lobby voice works normally
        io.to(room.id).emit('voice:reset');
        enforceVoicePhaseRules(io, room);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Friends ──────────────────────────────────────────────────────
    socket.on('friend:request', async ({ toProfileId, friendCode }: { toProfileId?: string; friendCode?: string }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');

        let targetId = toProfileId;
        if (!targetId && friendCode) {
          const target = await getPlayerByFriendCode(friendCode);
          if (!target) throw new Error('No player found with that code.');
          targetId = target.id;
        }
        if (!targetId) throw new Error('Provide a friend code.');
        if (targetId === profileId) throw new Error('Cannot add yourself.');

        await sendFriendRequest(profileId, targetId);
        const targetSock = findSocketByProfile(io as any, targetId);
        if (targetSock) {
          const reqs = await getPendingRequests(targetId);
          const thisReq = reqs.find(r => r.fromId === profileId);
          if (thisReq) targetSock.emit('friend:request_received', thisReq);
        }
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Generic game invite (Checkers / Ludo / UNO / Joker / WWW) ──────────
    socket.on('game:invite', async ({ targetProfileId, game, code }: { targetProfileId: string; game: string; code: string }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        if (!['checkers', 'ludo', 'uno', 'joker', 'www'].includes(game) || !code) throw new Error('Invalid invite.');
        const targetSock = findSocketByProfile(io as any, String(targetProfileId));
        if (!targetSock) throw new Error('მოთამაშე ოფლაინია.');
        const me = await getPlayer(profileId);
        targetSock.emit('game:invite_received', {
          game, code: String(code).toUpperCase().slice(0, 12),
          fromName: me?.username ?? 'Someone', fromAvatar: me?.avatar ?? '🎮',
        });
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('player:find_by_code', async ({ friendCode }: { friendCode: string }, cb) => {
      try {
        const player = await getPlayerByFriendCode(friendCode);
        if (!player) return cb(err('No player found with that code.'));
        cb(ok(toPublicProfile(player)));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Mod: Set mod level by profile ID (owner only) ───────────────
    socket.on('mod:set_mod_level', async ({ targetProfileId, level }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(profileId);
        if (!mod || mod.moderatorLevel !== 'owner') throw new Error('Owner only.');
        const target = await getPlayer(targetProfileId);
        if (!target) throw new Error('Player not found.');
        const validLevels = ['moderator', 'senior_moderator', 'admin', 'owner', null];
        if (!validLevels.includes(level as any)) throw new Error('Invalid level.');
        await setGrantedModLevel(target.id, level as any);
        const updated = await getPlayer(target.id);
        if (!updated) throw new Error('Player not found after update.');
        const targetSock = findSocketByProfile(io as any, target.id);
        if (targetSock) targetSock.emit('player:profile', toPublicProfile(updated));
        cb(ok({ username: target.username, newLevel: level }));
        notifyMods(io, 'mod_grant', `${mod.username} set ${target.username} → ${level ?? 'none'}`, target.username).catch(() => {});
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('mod:set_level_by_code', async ({ friendCode, level }: { friendCode: string; level: string | null }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const mod = await getPlayer(profileId);
        if (!mod || mod.moderatorLevel !== 'owner') throw new Error('Owner only.');
        const target = await getPlayerByFriendCode(friendCode);
        if (!target) throw new Error('No player found with that code.');
        const validLevels = ['moderator', 'senior_moderator', 'admin', 'owner', null];
        if (!validLevels.includes(level as any)) throw new Error('Invalid level.');
        await setGrantedModLevel(target.id, level as any);
        const updated = await getPlayer(target.id);
        if (!updated) throw new Error('Player not found after update.');
        const targetSock = findSocketByProfile(io as any, target.id);
        if (targetSock) targetSock.emit('player:profile', toPublicProfile(updated));
        cb(ok({ username: target.username, newLevel: level }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('friend:accept', async ({ fromProfileId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await acceptFriend(fromProfileId, profileId);
        recordActivity(profileId, 'became_friends', fromProfileId, {}).catch(() => {});
        recordActivity(fromProfileId, 'became_friends', profileId, {}).catch(() => {});
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('friend:decline', async ({ fromProfileId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await declineFriend(fromProfileId, profileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('friend:remove', async ({ profileId: friendId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await removeFriend(profileId, friendId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('friend:list', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        cb(ok(await getFriends(profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    // Invitable pool = friends + community follows (following + followers).
    socket.on('friend:invitable_list', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        cb(ok(await getInvitablePeople(profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('friend:requests', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        cb(ok(await getPendingRequests(profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('friend:suggestions', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        cb(ok(await getFriendSuggestions(profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('pet:data', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        cb(ok(await getPetData(profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Tournaments ─────────────────────────────────────────────────────
    socket.on('tournament:list', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        cb(ok(await listOpenTournaments()));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('tournament:create', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const name = (data?.name ?? 'Tournament').slice(0, 50);
        const maxPlayers = Math.min(Math.max(Number(data?.maxPlayers ?? 8), 2), 16);
        const t = await createTournament(profileId, name, maxPlayers, 0);
        cb(ok(t));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('tournament:join', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await joinTournament(data.tournamentId, profileId);
        const t = await getTournament(data.tournamentId);
        cb(ok(t));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('tournament:leave', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await leaveTournament(data.tournamentId, profileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('tournament:start', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await startTournament(data.tournamentId, profileId);
        const t = await getTournament(data.tournamentId);
        cb(ok(t));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('tournament:delete', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await deleteTournament(data.tournamentId, profileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Daily Quests ─────────────────────────────────────────────────
    socket.on('challenge:today', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        cb(ok(await getDailyQuestsForPlayer(profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Spectator Predictions ────────────────────────────────────────
    socket.on('prediction:submit', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const parsed = z.object({ roomId: z.string(), predicted: z.enum(['mafia', 'town', 'neutral', 'cult', 'yakuza']) }).safeParse(data);
        if (!parsed.success) throw new Error('Invalid prediction.');
        const room = getRoom(parsed.data.roomId);
        if (!room) throw new Error('Room not found.');
        const player = [...room.players.values()].find(p => p.profileId === profileId);
        if (!player?.isSpectator) throw new Error('Only spectators can predict.');
        if (room.phase === 'lobby' || room.phase === 'game_over') throw new Error('Game not active.');
        await sql`
          INSERT INTO spectator_predictions (id, room_id, player_id, predicted, created_at)
          VALUES (${randomUUID()}, ${parsed.data.roomId}, ${profileId}, ${parsed.data.predicted}, ${Date.now()})
          ON CONFLICT (room_id, player_id) DO UPDATE SET predicted = ${parsed.data.predicted}, created_at = ${Date.now()}
        `;
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Cosmetics ────────────────────────────────────────────────────
    socket.on('cosmetics:equip', async ({ type, itemId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const cosmetics = await equipCosmetic(profileId, type, itemId);
        cb(ok(cosmetics));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('cosmetics:get', async ({ profileId }, cb) => {
      try {
        cb(ok(await getCosmetics(profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    // Batch-resolve equipped name colors for a list of profiles (for app-wide name coloring)
    socket.on('cosmetics:name_colors', async ({ profileIds }, cb) => {
      try {
        cb(ok(await getNameColors(profileIds ?? [])));
      } catch (e: any) { cb(err(e.message)); }
    });

    // Buy a purchasable cosmetic item with coins, then unlock it
    socket.on('cosmetics:buy_item', async ({ itemId }: { itemId: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        // Check not already owned
        const cosmetics = await getCosmetics(profileId);
        if (cosmetics.unlockedItems.includes(itemId)) throw new Error('Item already owned.');
        // Deduct coins
        const { newBalance } = await purchaseCosmeticItem(profileId, itemId);
        // Unlock the item
        cosmetics.unlockedItems.push(itemId);
        await sql`UPDATE players SET cosmetics = ${JSON.stringify(cosmetics)} WHERE id = ${profileId}`;
        socket.emit('coins:updated', { coins: newBalance });
        cb(ok({ cosmetics, newBalance }));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Direct Messages ────────────────────────────────────────────────
    socket.on('dm:start', async ({ profileId: targetProfileId }: { profileId: string }, cb: any) => {
      try {
        const myProfileId = socket.data.profileId;
        if (!myProfileId) throw new Error('Not authenticated.');
        if (myProfileId === targetProfileId) throw new Error('Cannot message yourself.');
        const conv = await getOrCreateConversation(myProfileId, targetProfileId);
        const messages = await getMessages(conv.id, myProfileId);
        await markRead(conv.id, myProfileId);
        const otherProfile = await getPlayer(targetProfileId);
        cb(ok({
          id: conv.id,
          conversation: conv,
          messages,
          otherUsername: otherProfile?.username ?? 'Unknown',
          otherAvatar: otherProfile?.avatar ?? '?',
          otherAvatarUrl: otherProfile?.avatarUrl ?? null,
        }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('dm:send', async ({ conversationId, text, type, replyToId }: { conversationId: string; text: string; type?: 'text' | 'sticker' | 'invite'; replyToId?: string | null }, cb: any) => {
      try {
        const senderId = socket.data.profileId;
        if (!senderId) throw new Error('Not authenticated.');
        if (!text?.trim()) throw new Error('Message cannot be empty.');
        const msgType = type === 'sticker' || type === 'invite' ? type : 'text';
        if (msgType === 'sticker' && !DM_STICKER_KEYS.has(text.trim())) throw new Error('Unknown sticker.');
        if (msgType === 'invite' && !/^[A-F0-9]{6}$/i.test(text.trim())) throw new Error('Invalid room code.');
        const [conv] = await sql`SELECT * FROM conversations WHERE id = ${conversationId}` as any[];
        if (!conv) throw new Error('Conversation not found.');
        const receiverId = conv.participant1 === senderId ? conv.participant2 : conv.participant1;
        if (conv.participant1 !== senderId && conv.participant2 !== senderId) throw new Error('Not a participant.');
        const msg = await sendMessage(conversationId, senderId, text.trim(), receiverId, { type: msgType, replyToId: replyToId ?? null });
        // Notify recipient in real time with sender info for toast
        const recipientSocket = findSocketByProfile(io, receiverId);
        const senderProfile = await getPlayer(senderId);
        if (recipientSocket) {
          recipientSocket.emit('dm:new_message', {
            conversationId,
            message: msg,
            senderUsername: senderProfile?.username ?? 'Unknown',
            senderAvatar: senderProfile?.avatar ?? '?',
          });
        } else {
          // Recipient is offline — send push notification
          sendPushToUser(receiverId, {
            title: `💬 ${senderProfile?.username ?? 'Someone'}`,
            body: text.trim().slice(0, 100),
          }).catch(() => {});
        }
        cb(ok(msg));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── 1:1 calls (audio / video) — signaling only; media rides LiveKit ──
    // Both participants join a deterministic LiveKit room `dmcall_<sorted ids>`.
    async function callPeerOf(conversationId: string, selfId: string): Promise<string> {
      const [conv] = await sql`SELECT * FROM conversations WHERE id = ${conversationId}` as any[];
      if (!conv) throw new Error('Conversation not found.');
      if (conv.participant1 !== selfId && conv.participant2 !== selfId) throw new Error('Not a participant.');
      return conv.participant1 === selfId ? conv.participant2 : conv.participant1;
    }

    socket.on('dm:call_invite' as any, async ({ conversationId, video }: { conversationId: string; video?: boolean }, cb: any) => {
      try {
        const selfId = socket.data.profileId;
        if (!selfId) throw new Error('Not authenticated.');
        const peerId = await callPeerOf(conversationId, selfId);
        const roomId = `dmcall_${[selfId, peerId].sort().join('_')}`;
        const me = await getPlayer(selfId);
        // Ring EVERY socket the peer has open (a phone may hold a stale + live
        // socket; the first match could be the dead one).
        let delivered = 0;
        for (const [, s] of io.sockets.sockets) {
          if ((s.data as any).profileId === peerId) {
            s.emit('dm:call_ring' as any, {
              roomId,
              conversationId,
              video: !!video,
              fromProfileId: selfId,
              fromUsername: me?.username ?? 'Unknown',
              fromAvatar: me?.avatar ?? '?',
              fromAvatarUrl: me?.avatarUrl ?? null,
            });
            delivered++;
          }
        }
        // Remember the ring so a phone that reconnects mid-ring gets it re-sent.
        pendingCalls.set(peerId, {
          callerId: selfId, conversationId, roomId, video: !!video,
          fromUsername: me?.username ?? 'Unknown', fromAvatar: me?.avatar ?? '?',
          fromAvatarUrl: me?.avatarUrl ?? null, at: Date.now(),
        });
        // Always push too — iOS Safari suspends the socket when the screen locks
        // or the tab backgrounds, so the in-app ring alone is unreliable there.
        sendPushToUser(peerId, {
          title: `📞 ${me?.username ?? 'Someone'}`,
          body: video ? 'Video call' : 'Audio call',
          tag: 'vm-call',
          requireInteraction: true,
          vibrate: [400, 200, 400, 200, 400],
        }).catch(() => {});
        // Even if no live socket received the ring (peer backgrounded on iOS),
        // keep the call "ringing": the push wakes them and deliverPendingCall
        // re-sends the ring the moment they reconnect. The caller still gets a
        // roomId so an answer that arrives later can connect.
        cb(ok({ roomId, delivered }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('dm:call_answer' as any, async ({ conversationId, roomId, accept }: { conversationId: string; roomId: string; accept: boolean }) => {
      try {
        const selfId = socket.data.profileId;
        if (!selfId) return;
        pendingCalls.delete(selfId); // callee responded — stop re-ringing
        const peerId = await callPeerOf(conversationId, selfId);
        findSocketByProfile(io, peerId)?.emit('dm:call_answered', { roomId, accept: !!accept });
      } catch { /* ignore */ }
    });

    socket.on('dm:call_close' as any, async ({ conversationId, roomId }: { conversationId: string; roomId: string }) => {
      try {
        const selfId = socket.data.profileId;
        if (!selfId) return;
        const peerId = await callPeerOf(conversationId, selfId);
        pendingCalls.delete(peerId); // caller hung up / cancelled — clear the ring
        pendingCalls.delete(selfId);
        findSocketByProfile(io, peerId)?.emit('dm:call_closed', { roomId });
      } catch { /* ignore */ }
    });

    // Persist a finished call as a DM (the caller reports the outcome).
    socket.on('dm:call_log' as any, async (
      { conversationId, kind, status, duration }:
      { conversationId: string; kind: 'audio' | 'video'; status: 'completed' | 'missed' | 'declined'; duration: number },
      cb?: any,
    ) => {
      try {
        const selfId = socket.data.profileId;
        if (!selfId) return;
        const peerId = await callPeerOf(conversationId, selfId);
        const k = kind === 'video' ? 'video' : 'audio';
        const s = status === 'missed' || status === 'declined' ? status : 'completed';
        const msg = await sendCallLog(conversationId, selfId, { kind: k, status: s, duration });
        const me = await getPlayer(selfId);
        // Caller gets a silent echo so their open chat updates without a toast.
        socket.emit('dm:call_logged' as any, { conversationId, message: msg });
        const peerSock = findSocketByProfile(io, peerId);
        if (s === 'completed') {
          // Both were present — silent update, no toast/unread nag.
          peerSock?.emit('dm:call_logged', { conversationId, message: msg });
        } else {
          // Missed / declined — a real notification for the peer.
          peerSock?.emit('dm:new_message', {
            conversationId, message: msg,
            senderUsername: me?.username ?? 'Unknown', senderAvatar: me?.avatar ?? '?',
          });
        }
        cb?.(ok(msg));
      } catch (e: any) { cb?.(err(e.message)); }
    });

    // Presence for the DM header: online / in-game / last-seen.
    socket.on('presence:get' as any, async ({ profileId }: { profileId: string }, cb: any) => {
      try {
        if (!profileId) throw new Error('Missing profileId.');
        const status = getPlayerStatus(profileId);
        let lastSeenAt: number | null = null;
        if (status === 'offline') {
          const p = await getPlayer(profileId);
          lastSeenAt = p?.lastSeenAt ?? null;
        }
        cb(ok({ status, lastSeenAt }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('dm:voice', async (data: { conversationId: string; audioData: string; duration: number }, cb: any) => {
      try {
        const senderId = socket.data.profileId;
        if (!senderId) throw new Error('Not authenticated.');
        if (!data.audioData?.startsWith('data:audio')) throw new Error('Invalid audio data.');
        if (data.audioData.length > 2_500_000) throw new Error('Voice message too large.');
        const [conv] = await sql`SELECT * FROM conversations WHERE id = ${data.conversationId}` as any[];
        if (!conv) throw new Error('Conversation not found.');
        if (conv.participant1 !== senderId && conv.participant2 !== senderId) throw new Error('Not a participant.');
        const receiverId = conv.participant1 === senderId ? conv.participant2 : conv.participant1;
        const msg = await sendVoiceDm(data.conversationId, senderId, data.audioData, data.duration, receiverId);
        const recipientSocket = findSocketByProfile(io, receiverId);
        const senderProfile = await getPlayer(senderId);
        if (recipientSocket) {
          recipientSocket.emit('dm:new_message', {
            conversationId: data.conversationId,
            message: msg,
            senderUsername: senderProfile?.username ?? 'Unknown',
            senderAvatar: senderProfile?.avatar ?? '?',
          });
        } else {
          sendPushToUser(receiverId, {
            title: `🎙 ${senderProfile?.username ?? 'Someone'}`,
            body: 'Sent you a voice message',
          }).catch(() => {});
        }
        cb(ok(msg));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('dm:image', async (data: { conversationId: string; imageData: string; viewOnce?: boolean }, cb: any) => {
      try {
        const senderId = socket.data.profileId;
        if (!senderId) throw new Error('Not authenticated.');
        const isTenor = (() => {
          try {
            const u = new URL(data.imageData ?? '');
            return u.protocol === 'https:' && (u.hostname === 'tenor.com' || u.hostname.endsWith('.tenor.com'));
          } catch { return false; }
        })();
        if (!data.imageData?.startsWith('data:image/') && !isTenor) throw new Error('Invalid image data.');
        if (data.imageData.length > 950_000) throw new Error('სურათი ძალიან დიდია — სცადე პატარა.');
        const [conv] = await sql`SELECT * FROM conversations WHERE id = ${data.conversationId}` as any[];
        if (!conv) throw new Error('Conversation not found.');
        if (conv.participant1 !== senderId && conv.participant2 !== senderId) throw new Error('Not a participant.');
        const receiverId = conv.participant1 === senderId ? conv.participant2 : conv.participant1;
        const msg = await sendImageDm(data.conversationId, senderId, data.imageData, data.viewOnce === true);
        const recipientSocket = findSocketByProfile(io, receiverId);
        const senderProfile = await getPlayer(senderId);
        if (recipientSocket) {
          recipientSocket.emit('dm:new_message', {
            conversationId: data.conversationId,
            message: msg,
            senderUsername: senderProfile?.username ?? 'Unknown',
            senderAvatar: senderProfile?.avatar ?? '?',
          });
        } else {
          sendPushToUser(receiverId, {
            title: `🖼 ${senderProfile?.username ?? 'Someone'}`,
            body: 'Sent you a photo',
          }).catch(() => {});
        }
        cb(ok(msg));
      } catch (e: any) { cb(err(e.message)); }
    });

    // Lightweight typing relay — no persistence, only to the online peer.
    socket.on('dm:typing', async ({ conversationId }: { conversationId: string }) => {
      try {
        const senderId = socket.data.profileId;
        if (!senderId) return;
        const [conv] = await sql`SELECT participant1, participant2 FROM conversations WHERE id = ${conversationId}` as any[];
        if (!conv) return;
        if (conv.participant1 !== senderId && conv.participant2 !== senderId) return;
        const receiverId = conv.participant1 === senderId ? conv.participant2 : conv.participant1;
        const recipientSocket = findSocketByProfile(io, receiverId);
        if (recipientSocket) recipientSocket.emit('dm:typing', { conversationId, fromUserId: senderId });
      } catch { /* best effort */ }
    });

    socket.on('dm:list', async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const conversations = await listConversations(profileId);
        cb(ok(conversations));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('dm:messages', async ({ conversationId }: { conversationId: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const [conv] = await sql`SELECT * FROM conversations WHERE id = ${conversationId}` as any[];
        if (!conv || (conv.participant1 !== profileId && conv.participant2 !== profileId)) {
          throw new Error('Not a participant.');
        }
        const messages = await getMessages(conversationId, profileId);
        const peerId = await markRead(conversationId, profileId);
        if (peerId) {
          const peerSocket = findSocketByProfile(io, peerId);
          if (peerSocket) peerSocket.emit('dm:read', { conversationId, readerId: profileId });
        }
        cb(ok(messages));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('dm:mark_read', async ({ conversationId }: { conversationId: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const peerId = await markRead(conversationId, profileId);
        // Live seen-receipt (✓✓) for the peer's open chat.
        if (peerId) {
          const peerSocket = findSocketByProfile(io, peerId);
          if (peerSocket) peerSocket.emit('dm:read', { conversationId, readerId: profileId });
        }
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── DM reactions (❤️🔥😂👍😮😢 — one per user per message) ─────────
    socket.on('dm:react', async ({ messageId, emoji }: { messageId: string; emoji: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        if (!DM_REACTION_EMOJIS.has(emoji)) throw new Error('Invalid reaction.');
        const { conversationId, emoji: finalEmoji } = await toggleDmReaction(messageId, profileId, emoji);
        // Notify both participants for live chip updates.
        const [conv] = await sql`SELECT participant1, participant2 FROM conversations WHERE id = ${conversationId}` as any[];
        for (const pid of [conv.participant1, conv.participant2]) {
          const s = findSocketByProfile(io, pid);
          if (s) s.emit('dm:reaction', { conversationId, messageId, reactorId: profileId, emoji: finalEmoji });
        }
        cb(ok({ emoji: finalEmoji }));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── View-once photo opened — burn it ──────────────────────────────
    socket.on('dm:viewonce_open', async ({ messageId }: { messageId: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const burned = await markViewOnceViewed(messageId, profileId);
        cb(ok({ burned }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('dm:unread_count', async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(ok(0)); return; }
        const count = await getTotalUnread(profileId);
        cb(ok(count));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('dm:delete', async ({ conversationId }: { conversationId: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await deleteConversationForUser(conversationId, profileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Lobby Chat ────────────────────────────────────────────────────
    socket.on('lobby:history', async (_data: any, cb: any) => {
      try {
        if (!socket.data.profileId) throw new Error('Not authenticated.');
        cb(ok(_lobbyChat.slice(-50)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('lobby:send', async ({ text }: { text: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const trimmed = (text ?? '').trim().slice(0, 200);
        if (!trimmed) throw new Error('Empty message.');
        const [ban, mute, player] = await Promise.all([
          getActiveBan(profileId),
          getActiveMute(profileId),
          getPlayer(profileId),
        ]);
        if (ban) throw new Error('You are banned.');
        if (mute) throw new Error('You are muted.');
        if (!player) throw new Error('Player not found.');
        const msg: LobbyMsg = {
          id: randomUUID(),
          profileId,
          username: player.username,
          avatar: player.avatar,
          avatarUrl: player.avatarUrl ?? null,
          text: trimmed,
          level: player.level,
          nameColor: player.cosmetics?.equippedNameColor ?? null,
          createdAt: Date.now(),
        };
        _lobbyChat.push(msg);
        if (_lobbyChat.length > MAX_LOBBY_CHAT) _lobbyChat.shift();
        io.emit('lobby:message', msg);
        cb(ok(msg));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('lobby:delete_msg', async ({ msgId }: { msgId: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const player = await getPlayer(profileId);
        if (!player?.isModerator) throw new Error('Moderator only.');
        const idx = _lobbyChat.findIndex(m => m.id === msgId);
        if (idx !== -1) _lobbyChat.splice(idx, 1);
        io.emit('lobby:msg_deleted', { msgId });
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Clan Chat ─────────────────────────────────────────────────────
    // Members join their clan's chat room to receive live messages; history
    // is returned on join. The clan is always derived from the sender's own
    // membership, so a player can only ever read/write their own clan's chat.
    socket.on('clan:chat_join' as any, async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const membership = await getClanMembershipByPlayer(profileId);
        if (!membership) throw new Error('You are not in a clan.');
        socket.join(`clanchat:${membership.id}`);
        cb(ok((_clanChat.get(membership.id) ?? []).slice(-50)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:chat_leave' as any, async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        const membership = profileId ? await getClanMembershipByPlayer(profileId) : null;
        if (membership) socket.leave(`clanchat:${membership.id}`);
        cb?.(ok(null));
      } catch (e: any) { cb?.(err(e.message)); }
    });

    socket.on('clan:chat_send' as any, async ({ text }: { text: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const trimmed = (text ?? '').trim().slice(0, 300);
        if (!trimmed) throw new Error('Empty message.');
        const [ban, mute, player, membership] = await Promise.all([
          getActiveBan(profileId),
          getActiveMute(profileId),
          getPlayer(profileId),
          getClanMembershipByPlayer(profileId),
        ]);
        if (ban) throw new Error('You are banned.');
        if (mute) throw new Error('You are muted.');
        if (!player) throw new Error('Player not found.');
        if (!membership) throw new Error('You are not in a clan.');
        const msg: ClanChatMsg = {
          id: randomUUID(), clanId: membership.id, profileId,
          username: player.username, avatar: player.avatar, avatarUrl: player.avatarUrl ?? null,
          text: trimmed, level: player.level,
          nameColor: player.cosmetics?.equippedNameColor ?? null, createdAt: Date.now(),
        };
        const arr = _clanChat.get(membership.id) ?? [];
        arr.push(msg);
        if (arr.length > MAX_CLAN_CHAT) arr.shift();
        _clanChat.set(membership.id, arr);
        // Ensure the sender is subscribed even if they didn't explicitly join.
        socket.join(`clanchat:${membership.id}`);
        io.to(`clanchat:${membership.id}`).emit('clan:message', msg);
        cb(ok(msg));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('clan:chat_delete' as any, async ({ msgId }: { msgId: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const [player, membership] = await Promise.all([
          getPlayer(profileId), getClanMembershipByPlayer(profileId),
        ]);
        if (!membership) throw new Error('You are not in a clan.');
        const arr = _clanChat.get(membership.id) ?? [];
        const idx = arr.findIndex(m => m.id === msgId);
        if (idx === -1) { cb(ok(null)); return; }
        const target = arr[idx];
        const isLeader = membership.memberRole === 'owner' || membership.memberRole === 'admin';
        const canDelete = target.profileId === profileId || isLeader || !!player?.isModerator;
        if (!canDelete) throw new Error('Not allowed.');
        arr.splice(idx, 1);
        io.to(`clanchat:${membership.id}`).emit('clan:msg_deleted', { msgId });
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Referral count ───────────────────────────────────────────────
    socket.on('profile:referral_count', async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const count = await getReferralCount(profileId);
        cb(ok(count));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Economy — Coins & Gifts ─────────────────────────────────────

    socket.on('coins:balance', async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(ok({ coins: 0 })); return; }
        const coins = await getCoins(profileId);
        cb(ok({ coins }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('coins:daily_reward', async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const result = await claimDailyReward(profileId);
        if (!result.alreadyClaimed) {
          socket.emit('coins:updated', { coins: result.balance });
        }
        cb(ok(result));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('coins:send_gift', async ({ recipientId, giftId, message }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const { newSenderBalance, giftEntry } = await sendGift(profileId, recipientId, giftId, message ?? '');
        socket.emit('coins:updated', { coins: newSenderBalance });
        // Notify recipient in real-time if connected
        const recipientSock = findSocketByProfile(io as any, recipientId);
        if (recipientSock) {
          recipientSock.emit('gifts:received' as any, {
            giftId: giftEntry.giftId,
            giftName: giftEntry.giftName,
            giftIcon: giftEntry.giftIcon,
            giftImageUrl: giftEntry.giftImageUrl,
            giftRarity: giftEntry.giftRarity,
            senderName: giftEntry.senderUsername,
            senderAvatar: giftEntry.senderAvatar,
            senderAvatarUrl: giftEntry.senderAvatarUrl,
            message: giftEntry.message,
          });
        }
        socket.emit('gifts:sent' as any, { giftId: giftEntry.giftId });
        cb(ok({ newBalance: newSenderBalance }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('coins:transactions', async ({ profileId: targetId }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        // A player can view their own transactions; owner can view anyone's
        const requester = await getPlayer(profileId);
        const resolvedId = targetId && requester?.moderatorLevel === 'owner' ? targetId : profileId;
        const txs = await getTransactions(resolvedId);
        cb(ok(txs));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:catalog', async (cb: any) => {
      try {
        const catalog = await getGiftCatalog(false);
        cb(ok(catalog));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:player_gifts', async ({ profileId: targetId }: any, cb: any) => {
      try {
        if (!targetId) throw new Error('profileId required.');
        const gifts = await getPlayerGifts(targetId);
        cb(ok(gifts));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:detail', async ({ giftId, recipientId }: any, cb: any) => {
      try {
        if (!giftId || !recipientId) throw new Error('giftId and recipientId required.');
        const detail = await getGiftDetail(giftId, recipientId);
        if (!detail) throw new Error('Gift not found.');
        cb(ok(detail));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Gift Leaderboard ─────────────────────────────────────────────
    socket.on('gifts:leaderboard' as any, async (cb: any) => {
      try {
        const topGifters = await sql`
          SELECT p.id AS "profileId", p.username, p.avatar,
                 p.avatar_url AS "avatarUrl",
                 COUNT(pg.id)::int AS "giftCount",
                 COALESCE(SUM(pg.coin_cost), 0)::int AS "totalSpent"
          FROM player_gifts pg
          JOIN players p ON p.id = pg.sender_id
          GROUP BY p.id, p.username, p.avatar, p.avatar_url
          ORDER BY "totalSpent" DESC, "giftCount" DESC
          LIMIT 10
        ` as any[];
        const topRecipients = await sql`
          SELECT p.id AS "profileId", p.username, p.avatar,
                 p.avatar_url AS "avatarUrl",
                 COUNT(pg.id)::int AS "giftCount",
                 COALESCE(SUM(pg.coin_cost), 0)::int AS "totalReceived"
          FROM player_gifts pg
          JOIN players p ON p.id = pg.recipient_id
          GROUP BY p.id, p.username, p.avatar, p.avatar_url
          ORDER BY "totalReceived" DESC, "giftCount" DESC
          LIMIT 10
        ` as any[];
        cb(ok({ topGifters, topRecipients }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:getSent' as any, async ({ profileId: targetId }: any, cb: any) => {
      try {
        if (!targetId) throw new Error('profileId required.');
        const gifts = await getGiftsSent(targetId);
        cb(ok(gifts));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:getTimeline' as any, async ({ profileId: targetId }: any, cb: any) => {
      try {
        if (!targetId) throw new Error('profileId required.');
        const timeline = await getGiftTimeline(targetId);
        cb(ok(timeline));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:getStats' as any, async ({ profileId: targetId }: any, cb: any) => {
      try {
        if (!targetId) throw new Error('profileId required.');
        const stats = await getGiftStats(targetId);
        cb(ok(stats));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:getPinned' as any, async ({ profileId: targetId }: any, cb: any) => {
      try {
        if (!targetId) throw new Error('profileId required.');
        const pinned = await getPinnedGifts(targetId);
        cb(ok(pinned));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:pin' as any, async ({ giftId }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        if (!giftId) throw new Error('giftId required.');
        await pinGift(profileId, giftId);
        cb(ok({}));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:unpin' as any, async ({ giftId }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        if (!giftId) throw new Error('giftId required.');
        await unpinGift(profileId, giftId);
        cb(ok({}));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:hide' as any, async ({ giftId }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        if (!giftId) throw new Error('giftId required.');
        await hideGift(profileId, giftId);
        cb(ok({}));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:unhide' as any, async ({ giftId }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        if (!giftId) throw new Error('giftId required.');
        await unhideGift(profileId, giftId);
        cb(ok({}));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('gifts:getHidden' as any, async (_: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const gifts = await getHiddenGifts(profileId);
        cb(ok(gifts));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Economy — Owner only ────────────────────────────────────────

    socket.on('owner:coins_grant', async ({ targetProfileId, amount, description }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (requester?.moderatorLevel !== 'owner') throw new Error('Owner only.');
        const target = await getPlayer(targetProfileId);
        if (!target) throw new Error('Player not found.');
        const result = await grantCoins(profileId, targetProfileId, Number(amount), description ?? '');
        // Notify target if online
        const targetSock = findSocketByProfile(io as any, targetProfileId);
        if (targetSock) targetSock.emit('coins:updated', { coins: result.newBalance });
        cb(ok(result));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('owner:coins_deduct', async ({ targetProfileId, amount, description }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (requester?.moderatorLevel !== 'owner') throw new Error('Owner only.');
        const target = await getPlayer(targetProfileId);
        if (!target) throw new Error('Player not found.');
        const result = await deductCoins(profileId, targetProfileId, Number(amount), description ?? '');
        const targetSock = findSocketByProfile(io as any, targetProfileId);
        if (targetSock) targetSock.emit('coins:updated', { coins: result.newBalance });
        cb(ok(result));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('owner:coins_refund', async ({ transactionId }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (requester?.moderatorLevel !== 'owner') throw new Error('Owner only.');
        await refundGift(transactionId, profileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('owner:gift_create', async (data: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (requester?.moderatorLevel !== 'owner') throw new Error('Owner only.');
        const gift = await createGift(profileId, data);
        cb(ok(gift));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('owner:gift_update', async ({ giftId, ...data }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (requester?.moderatorLevel !== 'owner') throw new Error('Owner only.');
        if (!giftId) throw new Error('giftId required.');
        const gift = await updateGift(giftId, data);
        cb(ok(gift));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('owner:gift_catalog_all', async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (requester?.moderatorLevel !== 'owner') throw new Error('Owner only.');
        const catalog = await getGiftCatalog(true);
        cb(ok(catalog));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('owner:all_transactions', async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (requester?.moderatorLevel !== 'owner') throw new Error('Owner only.');
        const txs = await getAllTransactions(500);
        cb(ok(txs));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Ranked ELO ──────────────────────────────────────────────────
    socket.on('rating:get_my', async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const rating = await getPlayerRating(profileId);
        cb(ok(rating ? {
          elo: rating.elo,
          peakElo: rating.peakElo,
          tier: rating.tier,
          rankedWins: rating.rankedWins,
          rankedLosses: rating.rankedLosses,
          isPlaced: rating.isPlaced,
          placementGames: rating.placementGames,
        } : null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('rating:leaderboard', async (cb: any) => {
      try {
        const data = await getRankedLeaderboard(50);
        cb(ok(data));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Season ──────────────────────────────────────────────────────
    socket.on('season:current', async (cb: any) => {
      try {
        const season = await getActiveSeason();
        cb(ok(season));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('season:leaderboard', async (data: any, cb: any) => {
      try {
        const entries = await getSeasonLeaderboard(data?.seasonId ?? '');
        cb(ok(entries));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('season:my_history', async (cb: any) => {
      try {
        if (!socket.data.profileId) { cb(err('Not authenticated')); return; }
        const history = await getMySeasonHistory(socket.data.profileId);
        cb(ok(history));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Replays ─────────────────────────────────────────────────────
    socket.on('replay:list', async (data: any, cb: any) => {
      try {
        const { limit = 20, offset = 0 } = data ?? {};
        const replays = await listReplays(limit, offset);
        cb(ok(replays));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('replay:get', async (data: any, cb: any) => {
      try {
        const replay = await getReplay(data.replayId);
        if (!replay) { cb(err('Not found')); return; }
        cb(ok(replay));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('replay:my', async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated')); return; }
        const replays = await getMyReplays(profileId);
        cb(ok(replays));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Push Notifications ───────────────────────────────────────────
    socket.on('push:subscribe', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const { endpoint, p256dh, auth } = data as any;
        if (!endpoint || !p256dh || !auth) throw new Error('Invalid subscription data.');
        await sql`
          INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
          VALUES (${profileId}, ${endpoint}, ${p256dh}, ${auth})
          ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
        `;
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('push:unsubscribe', async (data, cb) => {
      try {
        const { endpoint } = data as any;
        if (endpoint) await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Spectator Theater: Spec Chat ──────────────────────────────────────
    socket.on('spec:chat', async (data: { roomId: string; text: string }, cb: any) => {
      try {
        if (!rateOk(socket.id, 10)) { cb(err('Rate limit.')); return; }
        const room = getRoom(data.roomId);
        if (!room) { cb(err('Room not found.')); return; }
        const player = getPlayerBySocket(room, socket.id);
        if (!player?.isSpectator) { cb(err('Only spectators can use spec chat.')); return; }
        const text = (data.text ?? '').trim().slice(0, 200);
        if (!text) { cb(err('Message is empty.')); return; }
        const msg = {
          id: randomUUID(),
          senderId: player.profileId ?? player.id,
          senderName: player.name,
          text,
          t: Date.now(),
        };
        io.to(`spec:${data.roomId}`).emit('spec:message', msg);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message ?? 'Error')); }
    });

    // ── Spectator Theater: Cast Suspicion Vote ─────────────────────────────
    socket.on('spec:vote_suspect', async (data: { roomId: string; suspectedPlayerId: string }, cb: any) => {
      try {
        const room = getRoom(data.roomId);
        if (!room) { cb(err('Room not found.')); return; }
        const player = getPlayerBySocket(room, socket.id);
        if (!player?.isSpectator) { cb(err('Only spectators can vote.')); return; }
        if (room.phase === 'lobby' || room.phase === 'game_over') { cb(err('No active game.')); return; }
        const suspect = room.players.get(data.suspectedPlayerId);
        if (!suspect || suspect.isSpectator) { cb(err('Invalid suspect.')); return; }
        const voterId = player.profileId ?? player.id;
        const gameId = room.startedAt ? `${room.id}_${room.startedAt}` : room.id;
        await sql`
          INSERT INTO spectator_suspicion_votes (id, game_id, voter_id, suspected_player_id, created_at)
          VALUES (${randomUUID()}, ${gameId}, ${voterId}, ${data.suspectedPlayerId}, ${Date.now()})
          ON CONFLICT (game_id, voter_id) DO UPDATE SET suspected_player_id = EXCLUDED.suspected_player_id, created_at = EXCLUDED.created_at
        `;
        cb(ok(null));
      } catch (e: any) { cb(err(e.message ?? 'Error')); }
    });

    // ── Spectator Theater: Get Suspicion Results ───────────────────────────
    socket.on('spec:suspicion_results', async (data: { gameId: string }, cb: any) => {
      try {
        const votes = await sql`
          SELECT voter_id, suspected_player_id FROM spectator_suspicion_votes
          WHERE game_id = ${data.gameId}
        `;
        cb(ok(votes));
      } catch (e: any) { cb(err(e.message ?? 'Error')); }
    });

    // ════════════════════════════════════════════════════════════════
    // Community Hub — completely separate from Mafia game rooms/state.
    // ════════════════════════════════════════════════════════════════

    // ── Void News ─────────────────────────────────────────────────
    socket.on('community:news_list', async (cb) => {
      try { cb(ok(await listNews())); } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:news_create', async ({ title, content, pinned }, cb) => {
      try {
        const profileId = socket.data.profileId;
        await requireOwnerLevel(profileId);
        const post = await createNews(profileId!, title, content, !!pinned);
        await notifyAllPlayers('void_news', 'Void News', post.title, null);
        cb(ok(post));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:news_delete', async ({ id }, cb) => {
      try {
        await requireOwnerLevel(socket.data.profileId);
        await deleteNews(id);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Max Recommends ───────────────────────────────────────────
    socket.on('community:recommend_list', async (cb) => {
      try { cb(ok(await listRecommends())); } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:recommend_create', async ({ category, title, review, imageUrl }, cb) => {
      try {
        await requireOwnerLevel(socket.data.profileId);
        cb(ok(await createRecommend(category, title, review, imageUrl ?? null)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:recommend_delete', async ({ id }, cb) => {
      try {
        await requireOwnerLevel(socket.data.profileId);
        await deleteRecommend(id);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Daily Thoughts ───────────────────────────────────────────
    socket.on('community:thought_list', async (cb) => {
      try { cb(ok(await listThoughts())); } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:thought_create', async ({ content, pinned }, cb) => {
      try {
        await requireOwnerLevel(socket.data.profileId);
        cb(ok(await createThought(content, !!pinned)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:thought_delete', async ({ id }, cb) => {
      try {
        await requireOwnerLevel(socket.data.profileId);
        await deleteThought(id);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Community Feed ───────────────────────────────────────────
    socket.on('community:feed_list', async ({ before }, cb) => {
      try { cb(ok(await listFeed(socket.data.profileId, before))); } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:post_create', async ({ content, imageUrl }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await requireNotCommunityBanned(profileId);
        const post = await createPost(profileId, content, imageUrl ?? null);
        io.emit('community:post_new', post);
        cb(ok(post));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:post_delete', async ({ id }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        const isMod = !!requester && canDo(requester, 'kick');
        await deletePost(id, profileId, isMod);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:post_like', async ({ postId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        cb(ok(await toggleLike(postId, profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:post_react', async ({ postId, emoji }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const result = await togglePostReaction(postId, profileId, emoji);
        cb(ok(result));
        io.emit('community:post_reacted', { postId, reactions: result.reactions, myReaction: result.myReaction });
        if (result.added && result.authorId && result.authorId !== profileId) {
          (async () => {
            try {
              const reactor = await getPlayer(profileId);
              const notif = await createNotification(
                result.authorId, 'post_reaction', `${emoji} რეაქცია`,
                `${reactor?.username ?? 'ვიღაცამ'} დაარეაქთა ${emoji} შენს პოსტზე`, null,
                { actorId: profileId, actorAvatarUrl: reactor?.avatarUrl ?? null, postId: postId },
              );
              const ownerSock = findSocketByProfile(io, result.authorId);
              if (ownerSock) ownerSock.emit('community:notification' as any, notif);
            } catch {}
          })();
        }
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:get_reaction_users', async ({ postId }: { postId: string }, cb: any) => {
      try {
        const rows = await sql<{ emoji: string; username: string; avatar_url: string | null; player_id: string }[]>`
          SELECT r.emoji, p.username, p.avatar_url, r.player_id
          FROM community_post_reactions r
          JOIN players p ON p.id = r.player_id
          WHERE r.post_id = ${postId}
          ORDER BY r.created_at ASC
        `;
        cb(ok(rows));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:leaderboard', async (cb) => {
      try {
        const leaders = await getWeeklyLeaderboard();
        cb(ok(leaders));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:post_comment', async ({ postId, content, parentId, gifUrl }: any, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await requireNotCommunityBanned(profileId);
        const comment = await addComment(postId, profileId, content ?? '', { parentId: parentId ?? null, gifUrl: gifUrl ?? null });

        // Notifications: post author, replied-to comment author, @mentions.
        (async () => {
          try {
            const me = await getPlayer(profileId);
            const myName = me?.username ?? 'ვიღაც';
            const preview = (content ?? '').trim().slice(0, 80) || '🎞 GIF';
            const notifiedIds = new Set<string>([profileId]);
            const pushLive = (targetId: string, notif: any) => {
              const s = findSocketByProfile(io, targetId);
              if (s) s.emit('community:notification', notif);
            };
            if (parentId) {
              const [parent] = await sql`SELECT author_id FROM community_post_comments WHERE id = ${parentId}` as any[];
              if (parent && !notifiedIds.has(parent.author_id)) {
                notifiedIds.add(parent.author_id);
                const n = await createNotification(parent.author_id, 'comment_reply', `💬 ${myName} გიპასუხა`, preview, null, { actorId: profileId, actorAvatarUrl: me?.avatarUrl ?? null, postId });
                pushLive(parent.author_id, n);
              }
            }
            const [post] = await sql`SELECT author_id, is_anonymous FROM community_posts WHERE id = ${postId}` as any[];
            if (post && !post.is_anonymous && !notifiedIds.has(post.author_id)) {
              notifiedIds.add(post.author_id);
              const n = await createNotification(post.author_id, 'comment', `💬 ${myName}-მა დააკომენტარა შენს პოსტს`, preview, null, { actorId: profileId, actorAvatarUrl: me?.avatarUrl ?? null, postId });
              pushLive(post.author_id, n);
            }
            const mentioned = await notifyMentions(content ?? '', profileId, myName, 'comment');
            for (const mid of mentioned) {
              if (!notifiedIds.has(mid)) {
                const s = findSocketByProfile(io, mid);
                if (s) s.emit('community:notifications_refresh' as any, {});
              }
            }
          } catch { /* notifications are best-effort */ }
        })();

        cb(ok(comment));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:post_comments', async ({ postId }, cb) => {
      try { cb(ok(await getComments(postId, socket.data.profileId ?? undefined))); } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:comment_like', async ({ commentId }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        cb(ok(await toggleCommentLike(commentId, profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:comment_react', async ({ commentId, emoji }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const result = await toggleCommentReaction(commentId, profileId, emoji);
        cb(ok(result));
        if (result.added && result.authorId && result.authorId !== profileId) {
          (async () => {
            try {
              const reactor = await getPlayer(profileId);
              const notif = await createNotification(
                result.authorId, 'comment_reaction', `${emoji} რეაქცია`,
                `${reactor?.username ?? 'ვიღაცამ'} დაარეაქთა ${emoji} შენს კომენტარზე`, null,
                { actorId: profileId, actorAvatarUrl: reactor?.avatarUrl ?? null },
              );
              const ownerSock = findSocketByProfile(io, result.authorId);
              if (ownerSock) ownerSock.emit('community:notification' as any, notif);
            } catch {}
          })();
        }
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:get_comment_reaction_users', async ({ commentId }: { commentId: string }, cb: any) => {
      try {
        const rows = await sql<{ emoji: string; username: string; avatar_url: string | null; player_id: string }[]>`
          SELECT r.emoji, p.username, p.avatar_url, r.player_id
          FROM community_comment_reactions r
          JOIN players p ON p.id = r.player_id
          WHERE r.comment_id = ${commentId}
          ORDER BY r.created_at ASC
        `;
        cb(ok(rows));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:post_edit', async ({ postId, content }: any, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await requireNotCommunityBanned(profileId);
        const post = await editPost(postId, profileId, content);
        io.emit('community:post_updated' as any, post);
        // Mentions added in the edit also notify.
        const me = await getPlayer(profileId);
        notifyMentions(content ?? '', profileId, me?.username ?? 'ვიღაც', 'post').catch(() => {});
        cb(ok(post));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:comment_delete', async ({ commentId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await deleteComment(commentId, profileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:post_report', async ({ postId, reason }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await reportPost(postId, profileId, reason);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Follow System ─────────────────────────────────────────────
    socket.on('community:follow', async ({ targetId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await follow(profileId, targetId);
        const follower = await getPlayer(profileId);
        const notif = await createNotification(
          targetId, 'new_follower', '👤 ახალი მიმდევარი',
          `${follower?.username ?? 'ვიღაცამ'} დაგიწყო გამოწერა`, null,
          { actorId: profileId, actorAvatarUrl: follower?.avatarUrl ?? null },
        );
        const targetSock = findSocketByProfile(io as any, targetId);
        if (targetSock) targetSock.emit('community:notification', notif);
        recordActivity(profileId, 'followed', targetId, { targetUsername: follower?.username }).catch(() => {});
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:unfollow', async ({ targetId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await unfollow(profileId, targetId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:profile', async ({ profileId: targetId }, cb) => {
      try {
        const viewerId = socket.data.profileId ?? '';
        const profile = await getCommunityProfileV2(targetId, viewerId);
        if (!profile) { cb(err('Player not found.')); return; }
        cb(ok(profile as any));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Community Events ──────────────────────────────────────────
    socket.on('community:event_list', async (cb) => {
      try { cb(ok(await listEvents(socket.data.profileId))); } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:event_create', async ({ title, description, category, eventAt }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        cb(ok(await createEvent(profileId, title, description, category, eventAt)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:event_join', async ({ eventId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await joinEvent(eventId, profileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:event_leave', async ({ eventId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await leaveEvent(eventId, profileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Notifications ─────────────────────────────────────────────
    socket.on('community:notifications', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        cb(ok(await listNotifications(profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:notifications_unread', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        cb(ok(await getUnreadNotificationCount(profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:notifications_mark_read', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await markNotificationsRead(profileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Community Lounges ─────────────────────────────────────────
    socket.on('community:lounge_list', async (cb) => {
      try {
        const rows = await listLoungeRows();
        const lounges = rows.map((row: any) => {
          const { listenerCount, speakerCount } = loungeGetCounts(row.id);
          return rowToLounge(row, listenerCount, speakerCount);
        });
        cb(ok(lounges));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:lounge_create', async ({ name, description }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await requireNotCommunityBanned(profileId);
        cb(ok(await createLounge(profileId, name, description)));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:lounge_delete', async ({ loungeId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        const isMod = !!requester?.moderatorLevel;
        // Force-remove all members from in-memory state
        const members = loungeGetMembers(loungeId);
        for (const m of members) {
          loungeRemoveMember(loungeId, m.socketId);
          io.to(m.socketId).emit('lounge:kicked' as any);
        }
        await deleteLounge(loungeId, profileId, isMod);
        io.emit('community:lounge_removed' as any, { loungeId });
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:lounge_set_live', async ({ loungeId, isLive, lastTopic }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const row = await getLoungeRow(loungeId);
        if (!row) throw new Error('Lounge not found.');
        const requester = await getPlayer(profileId);
        const isOwnerLevel = requester?.moderatorLevel === 'owner';
        const isLoungeOwner = row.owner_id === profileId;
        if (!isOwnerLevel && !isLoungeOwner) throw new Error('Not authorized.');
        await setLoungeLive(loungeId, isLive, lastTopic ?? null);
        await broadcastLoungeState(io, loungeId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Community Moderation (separate from Mafia mod tools) ───────
    socket.on('community:report_list', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (!requester || !canDo(requester, 'view_reports')) throw new Error('Insufficient permissions.');
        cb(ok(await listCommunityReports()));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:report_resolve', async ({ reportId, status }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (!requester || !canDo(requester, 'resolve_reports')) throw new Error('Insufficient permissions.');
        await resolveCommunityReport(reportId, status);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:ban', async ({ targetProfileId, reason, duration }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (!requester || !canDo(requester, 'ban_short')) throw new Error('Insufficient permissions.');
        const ban = await communityBanPlayer(targetProfileId, profileId, reason, duration);
        const targetSock = findSocketByProfile(io as any, targetProfileId);
        if (targetSock) targetSock.emit('community:notification', {
          id: ban.id, type: 'community_ban', title: 'Community Hub access restricted',
          body: reason, link: null, read: false, createdAt: ban.issuedAt,
        });
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:unban', async ({ targetProfileId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const requester = await getPlayer(profileId);
        if (!requester || !canDo(requester, 'ban_short')) throw new Error('Insufficient permissions.');
        await communityUnbanPlayer(targetProfileId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Community V2 Extensions ─────────────────────────────────────────────

    socket.on('community:profile_update', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        await updateCommunityProfile(profileId, data);
        const profile = await getCommunityProfileV2(profileId, profileId);
        cb(ok(profile!));

        // Check profile completion bonus (avatar + banner = 300 coins)
        if (data.coverUrl) {
          checkProfileCompletionBonus(profileId).then(r => {
            if (r.awarded) socket.emit('coin:bonus' as any, { type: 'profile_complete', coins: 300, newBalance: r.newBalance });
          }).catch(() => {});
        }
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:feed_v2', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const posts = await listFeedV2(profileId, { category: data.category ?? 'all', before: data.before, hashtag: data.hashtag });
        cb(ok(posts));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:user_posts', async ({ authorId, before }, cb) => {
      try {
        const viewerId = socket.data.profileId ?? '';
        const posts = await getUserPosts(authorId, viewerId, { before });
        cb(ok(posts));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:post_get' as any, async (data: any, cb: any) => {
      try {
        const viewerId = socket.data.profileId ?? '';
        const post = await getPostById(data.postId, viewerId);
        if (!post) { cb(err('Post not found.')); return; }
        cb(ok(post));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Stories (24h ephemeral) ───────────────────────────────────────
    socket.on('community:stories_list' as any, async (cb: any) => {
      try { cb(ok(await listActiveStories(socket.data.profileId ?? undefined))); } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:story_view' as any, async ({ storyId }: { storyId: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb?.(ok(null)); return; }
        await recordStoryView(storyId, profileId);
        cb?.(ok(null));
      } catch (e: any) { cb?.(err(e.message)); }
    });

    socket.on('community:story_viewers' as any, async ({ storyId }: { storyId: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        cb(ok(await getStoryViewers(storyId, profileId)));
      } catch (e: any) { cb(err(e.message)); }
    });

    // Toggle a reaction (one per user per story) and broadcast fresh counts.
    socket.on('community:story_react' as any, async ({ storyId, reaction }: { storyId: string; reaction: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const result = await toggleStoryReaction(storyId, profileId, reaction);
        cb?.(ok(result)); // caller gets counts + their own reaction
        // Real-time: push updated counts to everyone (socket.io broadcast).
        io.emit('community:story_reacted', { storyId, reactions: result.reactions });

        // New reaction on someone else's story → notify the owner (unread) + live red dot.
        if (result.added && result.authorId && result.authorId !== profileId) {
          const reactor = await getPlayer(profileId);
          const notif = await createNotification(
            result.authorId, 'story_reaction', `${reaction} სტორის რეაქცია`,
            `${reactor?.username ?? 'ვიღაცამ'} დაარეაქთა ${reaction} შენს სტორიზე`, `story:${storyId}`,
            { actorId: profileId, actorAvatarUrl: reactor?.avatarUrl ?? null },
          );
          const ownerSock = findSocketByProfile(io as any, result.authorId);
          if (ownerSock) {
            ownerSock.emit('community:notification', notif);
            ownerSock.emit('community:story_notif', { storyId }); // drives the story-icon red dot live
          }
        }
      } catch (e: any) { cb?.(err(e.message)); }
    });

    socket.on('community:story_reactions' as any, async ({ storyId }: { storyId: string }, cb: any) => {
      try {
        cb(ok(await getStoryReactions(storyId, socket.data.profileId ?? undefined)));
      } catch (e: any) { cb(err(e.message)); }
    });

    // Red-dot state for the owner's own story icon (story-reaction notifications).
    socket.on('community:story_notif_unread' as any, async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        cb(ok(profileId ? await getUnreadStoryReactionCount(profileId) : 0));
      } catch (e: any) { cb(err(e.message)); }
    });

    // Mark read when the owner opens their story / the reaction list → red dot disappears.
    socket.on('community:story_notif_read' as any, async (cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (profileId) await markStoryReactionNotificationsRead(profileId);
        cb?.(ok(null));
      } catch (e: any) { cb?.(err(e.message)); }
    });

    socket.on('community:story_create' as any, async ({ imageUrl, caption, tags, musicVideoId, musicTitle }: { imageUrl: string; caption?: string; tags?: { id: string; username: string }[]; musicVideoId?: string; musicTitle?: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const ban = await getActiveBan(profileId);
        if (ban) throw new Error('You are banned.');
        const story = await createStory(profileId, imageUrl, caption ?? '', tags, musicVideoId, musicTitle);
        cb(ok(story));
        if (tags && tags.length > 0) {
          const me = await getPlayer(profileId);
          const myName = me?.username ?? 'ვიღაცამ';
          for (const t of tags) {
            if (t.id === profileId) continue;
            createNotification(t.id, 'story_tag', '📸 სთორიზე დაგთეგეს', `${myName}-მა სთორიზე დაგთეგა`, null, { actorId: profileId, actorAvatarUrl: me?.avatarUrl ?? null }).then(notif => {
              const sock = findSocketByProfile(io as any, t.id);
              if (sock) sock.emit('community:notification', notif);
              sendPushToUser(t.id, { title: '📸 სთორიზე დაგთეგეს', body: `${myName}-მა სთორიზე დაგთეგა` }).catch(() => {});
            }).catch(() => {});
          }
        }
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:story_delete' as any, async ({ id }: { id: string }, cb: any) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        const player = await getPlayer(profileId);
        await deleteStory(id, profileId, !!player?.isModerator);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:post_create_v2', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        if (!data.content?.trim() && data.postType === 'text') { cb(err('Content required.')); return; }
        const post = await createPostV2(profileId, data);
        io.emit('community:post_new', post as any);
        recordActivity(profileId, 'posted', post.id, { postType: data.postType, preview: data.content?.slice(0, 80) ?? '' }).catch(() => {});
        // @mention notifications (skip for anonymous posts — don't leak the author).
        if (!(data as any).isAnonymous) {
          getPlayer(profileId).then(me =>
            notifyMentions(data.content ?? '', profileId, me?.username ?? 'ვიღაც', 'post')
          ).catch(() => {});
        }
        cb(ok(post));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:post_pin', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const profile = await getPlayer(profileId);
        if (!profile?.isModerator && profile?.moderatorLevel !== 'owner') { cb(err('Unauthorized.')); return; }
        await pinPost(data.postId, data.pin, profileId);
        io.emit('community:post_pinned', data.postId);
        cb(ok(undefined));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:post_feature', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const profile = await getPlayer(profileId);
        if (!profile?.isModerator && profile?.moderatorLevel !== 'owner') { cb(err('Unauthorized.')); return; }
        await featurePost(data.postId, data.feature, profileId);
        cb(ok(undefined));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:post_hide', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const profile = await getPlayer(profileId);
        if (!profile?.isModerator && profile?.moderatorLevel !== 'owner') { cb(err('Unauthorized.')); return; }
        await hidePost(data.postId, profileId);
        io.emit('community:post_hidden', data.postId);
        cb(ok(undefined));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:post_save', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const saved = await togglePostSave(data.postId, profileId);
        cb(ok({ saved }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:post_saves', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const posts = await getSavedPosts(profileId, data.before);
        cb(ok(posts));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:poll_vote', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const results = await votePoll(data.postId, profileId, data.optionId);
        cb(ok(results));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:showcase_set', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        await setShowcaseAchievement(profileId, data.slot, data.achievementKey);
        cb(ok(undefined));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:showcase_clear', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        await clearShowcaseSlot(profileId, data.slot);
        cb(ok(undefined));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:people_list', async (dataOrCb, maybeCb) => {
      const cb   = typeof dataOrCb === 'function' ? dataOrCb : maybeCb;
      const data = typeof dataOrCb === 'function' ? {} : (dataOrCb ?? {});
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const people = await listPeopleDirectory(profileId);
        cb(ok(people));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:followers_list', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const list = await getFollowersList(data.profileId, profileId);
        cb(ok(list));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:following_list', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const list = await getFollowingList(data.profileId, profileId);
        cb(ok(list));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:search', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        if (!data.query?.trim()) { cb(ok({ posts: [], people: [], hashtags: [], lounges: [], clans: [] })); return; }
        const results = await searchCommunity(data.query, profileId);
        cb(ok(results));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:online_members', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        await upsertOnlineSeen(profileId);
        const members = await getOnlineMembers();
        cb(ok({ members, count: members.length }) as any);
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:badge_assign', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const profile = await getPlayer(profileId);
        if (profile?.moderatorLevel !== 'owner' && !profile?.isModerator) { cb(err('Unauthorized.')); return; }
        await assignBadge(data.targetId, data.badge, profileId);
        cb(ok(undefined));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:badge_revoke', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const profile = await getPlayer(profileId);
        if (profile?.moderatorLevel !== 'owner' && !profile?.isModerator) { cb(err('Unauthorized.')); return; }
        await revokeBadge(data.targetId, data.badge);
        cb(ok(undefined));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Debate Rooms ──────────────────────────────────────────────────────
    socket.on('debate:list', async ({ status } = {} as any, cb) => {
      try {
        const safeStatus = (status === 'all' || status === 'open' || status === 'finished') ? status : 'open';
        const debates = await listDebates(safeStatus);
        cb(ok(debates));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('debate:get', async ({ debateId }, cb) => {
      try {
        const profileId = socket.data.profileId ?? '';
        const debate = await getDebateFull(debateId, profileId);
        if (!debate) { cb(err('Debate not found.')); return; }
        cb(ok(debate));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('debate:create', async ({ topic, description }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const debate = await createDebate(profileId, topic, description ?? '');
        io.emit('debate:new', debate as any);
        cb(ok(debate));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('debate:join', async ({ debateId, side }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const safeSide = (side === 'pro' || side === 'con' || side === 'spectator') ? side : 'spectator';
        const participant = await joinDebate(debateId, profileId, safeSide);
        io.to(`debate:${debateId}`).emit('debate:participant_update', participant as any);
        socket.join(`debate:${debateId}`);
        // Emit current debate state so the joining socket gets phase info
        const debateFull = await getDebateFull(debateId, profileId);
        if (debateFull) {
          socket.emit('debate:phase_update', debateFull as any);
        }
        recordActivity(profileId, 'joined_debate', debateId, { side }).catch(() => {});
        cb(ok(participant));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('debate:argument', async ({ debateId, content }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const arg = await postArgument(debateId, profileId, content);
        io.to(`debate:${debateId}`).emit('debate:new_argument', arg as any);
        recordActivity(profileId, 'debate_argument', debateId, { preview: content.slice(0, 80) }).catch(() => {});
        cb(ok(arg));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('debate:vote', async ({ debateId, side }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const counts = await voteDebate(debateId, profileId, side);
        io.to(`debate:${debateId}`).emit('debate:vote_update', { debateId, counts } as any);
        cb(ok(counts));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('debate:close', async ({ debateId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const debate = await closeDebate(debateId, profileId);
        io.emit('debate:closed', debate as any);
        cb(ok(debate));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('debate:subscribe', async ({ debateId }, cb) => {
      socket.join(`debate:${debateId}`);
      cb(ok(null));
    });

    socket.on('debate:unsubscribe', async ({ debateId }, cb) => {
      socket.leave(`debate:${debateId}`);
      cb(ok(null));
    });

    socket.on('debate:start', async ({ debateId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const debate = await startDebate(debateId, profileId);
        io.to(`debate:${debateId}`).emit('debate:phase_update', debate as any);
        const dur = (PHASE_DURATION_SECONDS as any)[debate.phase] ?? 0;
        if (dur > 0) scheduleDebatePhaseAdvance(io, debateId, dur);
        cb(ok(debate));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('debate:skip_phase', async ({ debateId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const existing = debatePhaseTimers.get(debateId);
        if (existing) { clearTimeout(existing); debatePhaseTimers.delete(debateId); }
        const debate = await skipPhase(debateId, profileId);
        io.to(`debate:${debateId}`).emit('debate:phase_update', debate as any);
        const dur = (PHASE_DURATION_SECONDS as any)[debate.phase] ?? 0;
        if (dur > 0) scheduleDebatePhaseAdvance(io, debateId, dur);
        cb(ok(debate));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('debate:raise_hand', async ({ debateId, side }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const safeSide = side === 'pro' ? 'pro' : 'con';
        await raiseHand(debateId, profileId, safeSide);
        const hands = await getRaisedHands(debateId);
        io.to(`debate:${debateId}`).emit('debate:hands_update', { debateId, hands } as any);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('debate:lower_hand', async ({ debateId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        await lowerHand(debateId, profileId);
        const hands = await getRaisedHands(debateId);
        io.to(`debate:${debateId}`).emit('debate:hands_update', { debateId, hands } as any);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('debate:promote', async ({ debateId, targetPlayerId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const participant = await promoteSpeaker(debateId, targetPlayerId, profileId);
        const hands = await getRaisedHands(debateId);
        io.to(`debate:${debateId}`).emit('debate:participant_update', participant as any);
        io.to(`debate:${debateId}`).emit('debate:hands_update', { debateId, hands } as any);
        cb(ok(participant));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('debate:voice_join', async ({ debateId, side }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const player = await getPlayer(profileId);
        const safeSide = (side === 'pro' || side === 'con' || side === 'spectator') ? side : 'spectator';
        const peers = debateVoiceJoin(debateId, profileId, socket.id, safeSide as any, player?.username ?? '???');
        const iceServers = buildIceConfig();
        socket.join(`debate:voice:${debateId}`);
        socket.to(`debate:voice:${debateId}`).emit('debate:voice_peer_joined', {
          socketId: socket.id, playerId: profileId, username: player?.username ?? '???', side: safeSide
        } as any);
        cb(ok({ peers: peers.map(p => ({ socketId: p.socketId, playerId: p.playerId, username: p.username, side: p.side })), iceServers }));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('debate:voice_leave', ({ debateId }, cb) => {
      const profileId = socket.data.profileId;
      if (profileId) {
        debateVoiceLeave(debateId, profileId);
        socket.leave(`debate:voice:${debateId}`);
        socket.to(`debate:voice:${debateId}`).emit('debate:voice_peer_left', { socketId: socket.id } as any);
      }
      if (typeof cb === 'function') cb(ok(null));
    });

    socket.on('debate:voice_offer', ({ debateId, to, sdp }, cb) => {
      io.to(to).emit('debate:voice_offer', { from: socket.id, sdp } as any);
      if (typeof cb === 'function') cb(ok(null));
    });

    socket.on('debate:voice_answer', ({ debateId, to, sdp }, cb) => {
      io.to(to).emit('debate:voice_answer', { from: socket.id, sdp } as any);
      if (typeof cb === 'function') cb(ok(null));
    });

    socket.on('debate:voice_ice', ({ debateId, to, candidate }, cb) => {
      io.to(to).emit('debate:voice_ice', { from: socket.id, candidate } as any);
      if (typeof cb === 'function') cb(ok(null));
    });

    // ── Activity Feed ─────────────────────────────────────────────────────
    socket.on('activity:feed', async (_data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const events = await getFriendActivityFeed(profileId);
        cb(ok(events));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:privacy_get', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const settings = await getPrivacySettings(profileId);
        cb(ok(settings));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:privacy_set', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        await setPrivacySettings(profileId, data);
        cb(ok(undefined));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('community:mod_logs', async (cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const profile = await getPlayer(profileId);
        if (!profile?.isModerator && profile?.moderatorLevel !== 'owner') { cb(err('Unauthorized.')); return; }
        const logs = await getCommunityModLogs(100);
        cb(ok(logs));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ── Admin Panel Events ────────────────────────────────────────────────

    socket.on('admin:user_search', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const requester = await getPlayer(profileId);
        if (!requester || !['moderator', 'senior_moderator', 'admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
          cb(err('Unauthorized.')); return;
        }
        const { query } = data as { query: string };
        if (!query || query.trim().length < 2) { cb(err('Query too short.')); return; }
        const users = await adminSearchUser(query.trim());
        cb(ok(users));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('admin:user_profile', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const requester = await getPlayer(profileId);
        if (!requester || !['moderator', 'senior_moderator', 'admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
          cb(err('Unauthorized.')); return;
        }
        const { playerId } = data as { playerId: string };
        const profile = await adminGetUserProfile(playerId);
        if (!profile) { cb(err('User not found.')); return; }
        cb(ok(profile));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('admin:user_action', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const requester = await getPlayer(profileId);
        if (!requester || !['moderator', 'senior_moderator', 'admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
          cb(err('Unauthorized.')); return;
        }
        const { action, playerId, reason, duration } = data as {
          action: string; playerId: string; reason?: string; duration?: number;
          profileLocked?: boolean; secretModeDisabled?: boolean; forcePublic?: boolean;
        };
        if (action === 'warn') {
          await issueWarning(playerId, requester.id, reason ?? '');
          await logCommunityModAction(requester.id, 'warn', playerId, null, reason ?? '');
        } else if (action === 'mute') {
          await muteUser(playerId, requester.id, reason ?? '', duration ?? 3600);
          await logCommunityModAction(requester.id, 'mute', playerId, null, reason ?? '');
        } else if (action === 'unmute') {
          await unmuteUser(playerId);
          await logCommunityModAction(requester.id, 'unmute', playerId, null, '');
        } else if (action === 'suspend') {
          await suspendUser(playerId, requester.id, reason ?? '', duration ?? 86400);
          await logCommunityModAction(requester.id, 'suspend', playerId, null, reason ?? '');
        } else if (action === 'unsuspend') {
          await liftSuspension(playerId);
          await logCommunityModAction(requester.id, 'unsuspend', playerId, null, '');
        } else if (action === 'ban') {
          await communityBanPlayer(playerId, requester.id, reason ?? '', 0);
          await logCommunityModAction(requester.id, 'ban', playerId, null, reason ?? '');
        } else if (action === 'unban') {
          await communityUnbanPlayer(playerId);
          await logCommunityModAction(requester.id, 'unban', playerId, null, '');
        } else if (action === 'profile_controls') {
          if (requester.moderatorLevel !== 'owner' && requester.moderatorLevel !== 'admin') {
            cb(err('Unauthorized.')); return;
          }
          const { profileLocked, secretModeDisabled, forcePublic } = data as any;
          await setProfileControls(playerId, { profileLocked, secretModeDisabled, forcePublic });
          await logCommunityModAction(requester.id, 'profile_controls', playerId, null, JSON.stringify({ profileLocked, secretModeDisabled, forcePublic }));
        } else {
          cb(err('Unknown action.')); return;
        }
        cb(ok({}));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('admin:post_action', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const requester = await getPlayer(profileId);
        if (!requester || !['moderator', 'senior_moderator', 'admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
          cb(err('Unauthorized.')); return;
        }
        const { action, postId } = data as { action: string; postId: string };
        if (action === 'delete') {
          if (requester.moderatorLevel !== 'owner') { cb(err('Only owner can delete posts.')); return; }
          await adminDeletePost(postId, requester.id);
          await logCommunityModAction(requester.id, 'delete_post', null, postId, '');
          io.emit('community:post_deleted', { postId });
        } else if (action === 'restore') {
          if (requester.moderatorLevel !== 'owner') { cb(err('Only owner can restore.')); return; }
          await adminRestorePost(postId);
          await logCommunityModAction(requester.id, 'restore_post', null, postId, '');
        } else if (action === 'pin') {
          await pinPost(postId, true, requester.id);
          io.emit('community:post_pinned', postId);
        } else if (action === 'unpin') {
          await pinPost(postId, false, requester.id);
          io.emit('community:post_pinned', postId);
        } else if (action === 'feature') {
          await featurePost(postId, true, requester.id);
          io.emit('community:post_featured', { postId, featured: true });
        } else if (action === 'unfeature') {
          await featurePost(postId, false, requester.id);
          io.emit('community:post_featured', { postId, featured: false });
        } else if (action === 'hide') {
          await hidePost(postId, requester.id);
          io.emit('community:post_hidden', postId);
        } else {
          cb(err('Unknown action.')); return;
        }
        cb(ok({}));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('admin:post_list', async (_data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const requester = await getPlayer(profileId);
        if (!requester || !['moderator', 'senior_moderator', 'admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
          cb(err('Unauthorized.')); return;
        }
        const isOwner = requester.moderatorLevel === 'owner';
        const rows = await sql<any[]>`
          SELECT p.id, p.author_id, p.content, p.post_type, p.created_at, p.is_pinned, p.is_featured,
                 p.hidden, p.likes_count, p.comments_count, p.is_anonymous,
                 pl.username AS author_name
          FROM community_posts p
          JOIN players pl ON pl.id = p.author_id
          WHERE p.deleted_at IS NULL
          ORDER BY p.created_at DESC
          LIMIT 50
        `;
        const posts = rows.map(r => {
          const isAnon = Boolean(r.is_anonymous);
          const anonName = generateAnonymousName(r.author_id);
          return {
            id: r.id,
            authorId: r.author_id,
            isAnonymous: isAnon,
            authorName: isAnon ? anonName : r.author_name,
            realAuthorName: isOwner && isAnon ? r.author_name : null,
            content: r.content ?? '',
            postType: r.post_type ?? 'text',
            createdAt: Number(r.created_at),
            isPinned: Boolean(r.is_pinned),
            isFeatured: Boolean(r.is_featured),
            hidden: Boolean(r.hidden),
            likesCount: Number(r.likes_count ?? 0),
            commentsCount: Number(r.comments_count ?? 0),
          };
        });
        cb(ok(posts));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('admin:comment_action', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const requester = await getPlayer(profileId);
        if (!requester || !['moderator', 'senior_moderator', 'admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
          cb(err('Unauthorized.')); return;
        }
        const { action, commentId } = data as { action: string; commentId: string };
        if (action === 'delete') {
          await adminDeleteComment(commentId, requester.id);
          await logCommunityModAction(requester.id, 'delete_comment', null, null, commentId);
          io.emit('community:comment_deleted', { commentId });
        } else if (action === 'restore') {
          if (requester.moderatorLevel !== 'owner') { cb(err('Only owner can restore.')); return; }
          await adminRestoreComment(commentId);
          await logCommunityModAction(requester.id, 'restore_comment', null, null, commentId);
        } else {
          cb(err('Unknown action.')); return;
        }
        cb(ok({}));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('admin:debate_action', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const requester = await getPlayer(profileId);
        if (!requester || !['moderator', 'senior_moderator', 'admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
          cb(err('Unauthorized.')); return;
        }
        const { action, debateId } = data as { action: string; debateId: string };
        if (action === 'delete') {
          await adminDeleteDebate(debateId, requester.id);
          await logCommunityModAction(requester.id, 'delete_debate', null, debateId, '');
          io.emit('community:debate_deleted', { debateId });
        } else if (action === 'restore') {
          if (requester.moderatorLevel !== 'owner') { cb(err('Only owner can restore.')); return; }
          await adminRestoreDebate(debateId);
        } else if (action === 'pin') {
          await adminSetDebateFlags(debateId, { pinned: true });
          await logCommunityModAction(requester.id, 'pin_debate', null, debateId, '');
          io.emit('community:debate_updated', { debateId, pinned: true });
        } else if (action === 'unpin') {
          await adminSetDebateFlags(debateId, { pinned: false });
          io.emit('community:debate_updated', { debateId, pinned: false });
        } else if (action === 'feature') {
          await adminSetDebateFlags(debateId, { featured: true });
          await logCommunityModAction(requester.id, 'feature_debate', null, debateId, '');
          io.emit('community:debate_updated', { debateId, featured: true });
        } else if (action === 'unfeature') {
          await adminSetDebateFlags(debateId, { featured: false });
          io.emit('community:debate_updated', { debateId, featured: false });
        } else if (action === 'lock') {
          await adminSetDebateFlags(debateId, { locked: true });
          await logCommunityModAction(requester.id, 'lock_debate', null, debateId, '');
          io.emit('community:debate_updated', { debateId, locked: true });
        } else if (action === 'unlock') {
          await adminSetDebateFlags(debateId, { locked: false });
          io.emit('community:debate_updated', { debateId, locked: false });
        } else {
          cb(err('Unknown action.')); return;
        }
        cb(ok({}));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('admin:report_list', async (_data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const requester = await getPlayer(profileId);
        if (!requester || !['moderator', 'senior_moderator', 'admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
          cb(err('Unauthorized.')); return;
        }
        const reports = await listAllReports();
        cb(ok(reports));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('admin:audit_logs', async (_data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const requester = await getPlayer(profileId);
        if (!requester || !['admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
          cb(err('Unauthorized.')); return;
        }
        const logs = await getAdminAuditLogs();
        cb(ok(logs));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('admin:deleted_content', async (data, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) { cb(err('Not authenticated.')); return; }
        const requester = await getPlayer(profileId);
        if (!requester || requester.moderatorLevel !== 'owner') {
          cb(err('Unauthorized.')); return;
        }
        const { type } = data as { type: 'posts' | 'comments' | 'debates' };
        const content = await listDeletedContent(type);
        cb(ok(content));
      } catch (e: any) { cb(err(e.message)); }
    });

    // ════════════════════════════════════════════════════════════════
    // Lounge Voice — independent P2P mesh signaling for Community
    // lounges. Mirrors voice:* above but with zero Room/Phase coupling.
    // ════════════════════════════════════════════════════════════════

    socket.on('lounge:join', async ({ loungeId, asSpeaker }, cb) => {
      try {
        const profileId = socket.data.profileId;
        if (!profileId) throw new Error('Not authenticated.');
        await requireNotCommunityBanned(profileId);
        const row = await getLoungeRow(loungeId);
        if (!row) throw new Error('Lounge not found.');

        const player = await getPlayer(profileId);
        if (!player) throw new Error('Player not found.');

        if (socket.data.loungeId && socket.data.loungeId !== loungeId) {
          handleLoungeLeave(io, socket);
        }

        const isOwnerLevel = player.moderatorLevel === 'owner';
        const isLoungeOwner = row.owner_id === profileId;
        let role: CommunityLoungeRole = 'listener';
        if (isOwnerLevel || isLoungeOwner) role = 'host';
        else if (asSpeaker) role = 'speaker';

        const member: CommunityLoungeMember = {
          socketId: socket.id, playerId: profileId,
          username: player.username, avatar: player.avatar,
          avatarUrl: player.avatarUrl ?? null,
          role, handRaised: false, joinedAt: Date.now(),
        };

        const existing = loungeJoin(loungeId, member);
        socket.data.loungeId = loungeId;
        socket.join(`lounge:${loungeId}`);

        for (const peer of existing) {
          io.to(peer.socketId).emit('lounge:peer-joined', { socketId: socket.id, name: member.username, role });
        }

        const iceConfig = buildIceConfig();
        cb(ok({
          peers: existing.map(p => ({ socketId: p.socketId, name: p.username, role: p.role })),
          role,
          iceServers: iceConfig.iceServers,
        }));

        await broadcastLoungeState(io, loungeId);
        io.to(`lounge:${loungeId}`).emit('lounge:member_update', { loungeId, members: loungeGetMembers(loungeId) });
      } catch (e: any) { cb(err(e.message ?? 'Failed to join lounge.')); }
    });

    socket.on('lounge:leave', () => {
      const loungeId = socket.data.loungeId;
      handleLoungeLeave(io, socket);
      if (loungeId) io.to(`lounge:${loungeId}`).emit('lounge:member_update', { loungeId, members: loungeGetMembers(loungeId) });
    });

    socket.on('lounge:offer', ({ to, sdp }, cb) => {
      io.to(to).emit('lounge:offer', { from: socket.id, sdp });
      cb(ok(null));
    });

    socket.on('lounge:answer', ({ to, sdp }, cb) => {
      io.to(to).emit('lounge:answer', { from: socket.id, sdp });
      cb(ok(null));
    });

    socket.on('lounge:ice-candidate', ({ to, candidate }) => {
      io.to(to).emit('lounge:ice-candidate', { from: socket.id, candidate });
    });

    socket.on('lounge:raise_hand', (cb) => {
      try {
        const loungeId = socket.data.loungeId;
        if (!loungeId) throw new Error('Not in a lounge.');
        const member = loungeSetHandRaised(loungeId, socket.id, true);
        if (!member) throw new Error('Not in this lounge.');
        io.to(`lounge:${loungeId}`).emit('lounge:member_update', { loungeId, members: loungeGetMembers(loungeId) });
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('lounge:lower_hand', (cb) => {
      try {
        const loungeId = socket.data.loungeId;
        if (!loungeId) throw new Error('Not in a lounge.');
        const member = loungeSetHandRaised(loungeId, socket.id, false);
        if (!member) throw new Error('Not in this lounge.');
        io.to(`lounge:${loungeId}`).emit('lounge:member_update', { loungeId, members: loungeGetMembers(loungeId) });
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('lounge:promote', async ({ targetPlayerId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        const loungeId = socket.data.loungeId;
        if (!profileId || !loungeId) throw new Error('Not in a lounge.');
        const self = loungeGetMemberByPlayerId(loungeId, profileId);
        if (!self || self.role !== 'host') throw new Error('Only the host can promote.');
        const target = loungeGetMemberByPlayerId(loungeId, targetPlayerId);
        if (!target) throw new Error('Member not found.');
        loungeSetRole(loungeId, target.socketId, 'speaker');
        io.to(target.socketId).emit('lounge:promoted');
        io.to(`lounge:${loungeId}`).emit('lounge:member_update', { loungeId, members: loungeGetMembers(loungeId) });
        await broadcastLoungeState(io, loungeId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('lounge:demote', async ({ targetPlayerId }, cb) => {
      try {
        const profileId = socket.data.profileId;
        const loungeId = socket.data.loungeId;
        if (!profileId || !loungeId) throw new Error('Not in a lounge.');
        const self = loungeGetMemberByPlayerId(loungeId, profileId);
        if (!self || self.role !== 'host') throw new Error('Only the host can demote.');
        const target = loungeGetMemberByPlayerId(loungeId, targetPlayerId);
        if (!target) throw new Error('Member not found.');
        loungeSetRole(loungeId, target.socketId, 'listener');
        io.to(target.socketId).emit('lounge:demoted');
        io.to(`lounge:${loungeId}`).emit('lounge:member_update', { loungeId, members: loungeGetMembers(loungeId) });
        await broadcastLoungeState(io, loungeId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('lounge:kick', async ({ targetPlayerId, reason }, cb) => {
      try {
        const profileId = socket.data.profileId;
        const loungeId = socket.data.loungeId;
        if (!profileId || !loungeId) throw new Error('Not in a lounge.');
        const self = loungeGetMemberByPlayerId(loungeId, profileId);
        if (!self || self.role !== 'host') throw new Error('Only the host can kick.');
        const target = loungeGetMemberByPlayerId(loungeId, targetPlayerId);
        if (!target) throw new Error('Member not found.');
        loungeRemoveMember(loungeId, target.socketId);
        io.to(target.socketId).emit('lounge:kicked', { reason: reason || 'Removed by host.' });
        const targetSocket = io.sockets.sockets.get(target.socketId);
        if (targetSocket) {
          targetSocket.leave(`lounge:${loungeId}`);
          targetSocket.data.loungeId = null;
        }
        io.to(`lounge:${loungeId}`).emit('lounge:member_update', { loungeId, members: loungeGetMembers(loungeId) });
        await broadcastLoungeState(io, loungeId);
        cb(ok(null));
      } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('lounge:members', (data, cb) => {
      try { cb(ok(loungeGetMembers(data.loungeId))); } catch (e: any) { cb(err(e.message)); }
    });

    // ── Checkers mini-game ──────────────────────────────────────────
    registerCheckersHandlers(io, socket);

    // ── Joker card game ─────────────────────────────────────────────
    registerJokerHandlers(io, socket);

    // ── Ludo board game ──────────────────────────────────────────────
    registerLudoHandlers(io, socket);

    // ── What? Where? When? quiz game ──────────────────────────────────
    registerWWWHandlers(io, socket);

    // ── UNO card game ────────────────────────────────────────────────
    registerUnoHandlers(io, socket);

    // ── Blackout social-deduction game ───────────────────────────────
    registerBlackoutHandlers(io, socket);

    // ── Alias word game ──────────────────────────────────────────────
    registerAliasHandlers(io, socket);

    // ── Draw & Guess ─────────────────────────────────────────────────
    registerDrawHandlers(io, socket);

    // ── Codenames ────────────────────────────────────────────────────
    registerCodenamesHandlers(io, socket);

    // ── ჯაშუში (Spyfall) ─────────────────────────────────────────────
    registerSpyfallHandlers(io, socket);

    // ── ტყუილების ოსტატი (Master of Lies) ────────────────────────────
    registerLiesHandlers(io, socket);

    // ── VOID IQ ──────────────────────────────────────────────────────
    registerIQHandlers(io, socket);

    // ── ბატონი მაქსის თავსატეხი ──────────────────────────────────────
    registerMaxPuzzleHandlers(io, socket);

    // ── Ganab Simulator — global coronation hall of fame ─────────────
    socket.on('ganab:crown' as any, async (data: { nickname?: string }, cb?: (r: any) => void) => {
      try {
        const pid = socket.data.profileId ?? socket.id;
        await ganabAddCrown(pid, String(data?.nickname ?? ''));
        const list = await ganabListCrowned();
        io.emit('ganab:crowned_update' as any, list);
        cb?.({ ok: true, data: list });
      } catch (e: any) { cb?.({ ok: false, error: e.message }); }
    });
    socket.on('ganab:crowned' as any, async (cb: (r: any) => void) => {
      try { cb({ ok: true, data: await ganabListCrowned() }); }
      catch (e: any) { cb({ ok: false, error: e.message }); }
    });

    // ── Disconnect ──────────────────────────────────────────────────
    // ── Virtual Space ─────────────────────────────────────────────────

    socket.on('space:join', async ({ spaceId = 'main', name, bodyColor, glowColor, mask, hat, pet, form }: any, cb: Function) => {
      try {
        if (!name || !bodyColor) return cb?.({ ok: false, error: 'Missing fields' });
        const safeName  = String(name).slice(0, 24);
        const safeBody  = /^#[0-9a-fA-F]{6}$/.test(bodyColor) ? bodyColor : '#9b00ff';
        const safeGlow  = /^#[0-9a-fA-F]{6}$/.test(glowColor ?? '') ? glowColor : '#00e5ff';
        const safeMask  = ['none','half','full','visor'].includes(mask) ? mask : 'none';
        const safeHat   = ['none','cap','crown','halo','party','cat','beanie','star','star2'].includes(hat) ? hat : 'none';
        const safePet   = ['none','cat','bot','ghost','star','starduo','fish','fish2','egg','chick','moon','car'].includes(pet) ? pet : 'none';
        const safeForm  = ['human','car'].includes(form) ? form : 'human';
        const safeSpace = String(spaceId).slice(0, 48).replace(/[^a-zA-Z0-9_-]/g, '') || 'main'; // 48: fits clan_<uuid>
        const meta = _spaceMeta.get(safeSpace);
        // Only 'main' may be joined without pre-existing metadata; everything
        // else must have been created (so private codes/capacity are enforced).
        if (!meta) return cb?.({ ok: false, error: 'ეს Space აღარ არსებობს.' });
        // Clan lounges are members-only.
        if (safeSpace.startsWith('clan_')) {
          const clanId = safeSpace.slice(5);
          const membership = socket.data.profileId ? await getClanMembershipByPlayer(socket.data.profileId) : null;
          if (!membership || membership.id !== clanId) {
            return cb?.({ ok: false, error: 'Clan members only.' });
          }
        }
        const room = _spaces.get(safeSpace) ?? new Map<string, SpacePlayer>();
        if (!_spaces.has(safeSpace)) _spaces.set(safeSpace, room);
        if (!room.has(socket.id) && room.size >= meta.maxPlayers) {
          return cb?.({ ok: false, error: 'Space სავსეა.' });
        }
        const x = 15 + Math.random() * 70;
        const y = 20 + Math.random() * 60;
        const player: SpacePlayer = { socketId: socket.id, name: safeName, bodyColor: safeBody, glowColor: safeGlow, mask: safeMask, hat: safeHat, pet: safePet, form: safeForm, profileId: socket.data.profileId ?? null, x, y, seat: null, hp: SPACE_MAX_HP };
        room.set(socket.id, player);
        socket.join(`space:${safeSpace}`);
        if (socket.data.profileId) {
          // Only public spaces are exposed to friends (presence strip + push).
          // Private and clan lounges stay hidden — no visibility, no join code.
          if (meta.isPublic) {
            setLoungePresence(socket.data.profileId, { spaceId: safeSpace, name: meta.name, code: meta.code });
            notifyFriendsActive(io, socket.data.profileId, { kind: 'lounge', code: meta.code, label: meta.name, fromName: safeName });
          } else {
            clearLoungePresence(socket.data.profileId);
          }
        }
        socket.to(`space:${safeSpace}`).emit('space:player-joined', player);
        const existingDJ = _spaceDJ.get(safeSpace) ?? null;
        const existingTV = _tvPublic(safeSpace);
        // Furniture + per-viewer edit rights (owner of owned spaces; staff for main/clan).
        const furniture = await _loadSpaceFurniture(safeSpace);
        let canEdit = false;
        if (socket.data.profileId) {
          if (meta.ownerId) canEdit = meta.ownerId === socket.data.profileId;
          else {
            const prof = await getPlayer(socket.data.profileId).catch(() => null);
            canEdit = !!prof?.isModerator;
          }
        }
        (socket.data as any).spaceCanEdit = canEdit;
        const spacePublic = { ..._publicSpaceMeta(meta, room.size), canControlTv: _canControlTv(safeSpace, socket.data.profileId ?? null), canEdit };
        cb?.({ ok: true, data: { players: [...room.values()], mySocketId: socket.id, djState: existingDJ, tvState: existingTV, space: spacePublic, furniture } });
        if (existingDJ) socket.emit('space:dj-update', existingDJ);
        if (existingTV) socket.emit('tv:update', existingTV);
      } catch { cb?.({ ok: false, error: 'Internal error' }); }
    });

    // Ghost observe a Virtual Space: receive its state + live updates without
    // spawning an avatar, joining the participant map, touching presence, or
    // notifying anyone. Owner + ghost mode only.
    socket.on('space:ghost_join' as any, async ({ spaceId = 'main' }: any, cb: Function) => {
      try {
        const pid = socket.data.profileId;
        const mod = pid ? await getPlayer(pid) : null;
        if (!mod || mod.moderatorLevel !== 'owner' || !isGhost(pid!)) return cb?.({ ok: false, error: 'Ghost mode (owner) only.' });
        const safeSpace = String(spaceId).slice(0, 48).replace(/[^a-zA-Z0-9_-]/g, '') || 'main';
        const meta = _spaceMeta.get(safeSpace);
        if (!meta) return cb?.({ ok: false, error: 'Space not found.' });
        socket.join(`space:${safeSpace}`); // receive broadcasts only — not a member
        const room = _spaces.get(safeSpace);
        const players = room ? [...room.values()] : [];
        const existingDJ = _spaceDJ.get(safeSpace) ?? null;
        const existingTV = _tvPublic(safeSpace);
        cb?.({ ok: true, data: { players, mySocketId: socket.id, djState: existingDJ, tvState: existingTV,
          space: { ..._publicSpaceMeta(meta, room?.size ?? 0), canControlTv: _canControlTv(safeSpace, pid ?? null) } } });
        if (existingDJ) socket.emit('space:dj-update', existingDJ);
        if (existingTV) socket.emit('tv:update', existingTV);
      } catch { cb?.({ ok: false, error: 'Internal error' }); }
    });

    socket.on('space:ghost_leave' as any, () => {
      for (const r of socket.rooms) if (typeof r === 'string' && r.startsWith('space:')) socket.leave(r);
    });

    socket.on('space:create', async ({ name, icon, theme, layout, maxPlayers, isPublic }: any, cb: Function) => {
      try {
        const safeName = String(name ?? '').trim().slice(0, 28) || 'Void Space';
        const safeIcon = SPACE_ICONS.includes(icon) ? icon : '🌌';
        let safeTheme = SPACE_THEMES.includes(theme) ? theme : 'void';
        // Premium themes require the matching unlock; fall back to void otherwise.
        if (safeTheme !== 'void' && !(await _ownsSpaceTheme(socket.data.profileId ?? null, safeTheme))) {
          safeTheme = 'void';
        }
        const safeLayout = SPACE_LAYOUTS.includes(layout) ? layout : 'lounge';
        const cap = Math.max(2, Math.min(50, Number(maxPlayers) || 12));
        const id = 'sp_' + _genSpaceCode().replace('-', '').toLowerCase();
        const meta: SpaceMeta = {
          id, name: safeName, icon: safeIcon, theme: safeTheme, layout: safeLayout,
          maxPlayers: cap, isPublic: isPublic !== false,
          ownerId: socket.data.profileId ?? null,
          ownerName: String(name && socket.data.profileId ? '' : '') || 'You',
          code: _genSpaceCode(), createdAt: Date.now(), persistent: false,
        };
        // Resolve a friendly owner name from the connected profile if available.
        if (socket.data.profileId) {
          getPlayer(socket.data.profileId).then(p => { if (p) meta.ownerName = p.username; }).catch(() => {});
        }
        _spaceMeta.set(id, meta);
        cb?.({ ok: true, data: { space: _publicSpaceMeta(meta, 0) } });
      } catch { cb?.({ ok: false, error: 'Internal error' }); }
    });

    // Change the visual theme of the space the caller is in (owner, or anyone
    // in the ownerless main lounge — same rule as TV control). Premium themes
    // require the changer to own the matching unlock.
    socket.on('space:set_theme', async ({ theme }: any, cb: Function) => {
      try {
        const spaceId = _spaceOfSocket(socket.id);
        if (!spaceId) return cb?.({ ok: false, error: 'Not in a space.' });
        const meta = _spaceMeta.get(spaceId);
        if (!meta) return cb?.({ ok: false, error: 'Space not found.' });
        if (!_canControlTv(spaceId, socket.data.profileId ?? null)) {
          return cb?.({ ok: false, error: 'Only the owner can change the theme.' });
        }
        if (!SPACE_THEMES.includes(theme)) return cb?.({ ok: false, error: 'Unknown theme.' });
        if (!(await _ownsSpaceTheme(socket.data.profileId ?? null, theme))) {
          return cb?.({ ok: false, error: 'You don\'t own this theme yet.' });
        }
        meta.theme = theme;
        io.to(`space:${spaceId}`).emit('space:meta-update', { theme });
        cb?.({ ok: true, data: { theme } });
      } catch { cb?.({ ok: false, error: 'Internal error' }); }
    });

    // Playful combat: hit another player in the same space. 10 hits knocks
    // them out of the space (they must re-enter). HP resets on re-join.
    socket.on('space:hit', ({ targetSocketId, weapon }: any, cb: Function) => {
      try {
        const spaceId = _spaceOfSocket(socket.id);
        if (!spaceId) return cb?.({ ok: false });
        if (targetSocketId === socket.id) return cb?.({ ok: false });
        const room = _spaces.get(spaceId);
        const attacker = room?.get(socket.id);
        const target = room?.get(targetSocketId);
        if (!room || !attacker || !target) return cb?.({ ok: false });
        // Light cooldown so each punch is a discrete tap, not a scripted insta-KO.
        const now = Date.now();
        if (now - (_spaceHitAt.get(socket.id) ?? 0) < 250) return cb?.({ ok: false });
        _spaceHitAt.set(socket.id, now);

        const safeWeapon = ['fist', 'tomato', 'snowball'].includes(weapon) ? weapon : 'fist';
        const inDuel = _duelOpponent.get(socket.id) === targetSocketId;

        target.hp = Math.max(0, (target.hp ?? SPACE_MAX_HP) - 1);
        io.to(`space:${spaceId}`).emit('space:hit', { targetSocketId, bySocketId: socket.id, byName: attacker.name, hp: target.hp, weapon: safeWeapon });

        if (target.hp <= 0) {
          if (inDuel) {
            // Friendly duel: nobody is kicked. Winner announced, HP restored.
            attacker.hp = SPACE_MAX_HP;
            target.hp = SPACE_MAX_HP;
            if (attacker.profileId) incrementSpaceKnockouts(attacker.profileId).catch(() => {});
            io.to(`space:${spaceId}`).emit('space:duel_end', { winnerName: attacker.name, loserName: target.name, forfeit: false });
            _clearDuel(socket.id);
            // Push the restored HP to everyone so bars reset.
            io.to(`space:${spaceId}`).emit('space:hit', { targetSocketId, bySocketId: socket.id, byName: attacker.name, hp: target.hp, weapon: safeWeapon, silent: true });
          } else {
            // Non-duel KO: knock the target out of the space (must re-enter).
            room.delete(targetSocketId);
            if (target.profileId) clearLoungePresence(target.profileId);
            if (attacker.profileId) incrementSpaceKnockouts(attacker.profileId).catch(() => {});
            _clearDuel(targetSocketId);
            const vsock = io.sockets.sockets.get(targetSocketId);
            if (vsock) vsock.leave(`space:${spaceId}`);
            io.to(targetSocketId).emit('space:knockout', { byName: attacker.name });
            io.to(`space:${spaceId}`).emit('space:player-left', { socketId: targetSocketId });
          }
        }
        cb?.({ ok: true });
      } catch { cb?.({ ok: false }); }
    });

    // KO leaderboard (bragging rights only — no coins/wagering).
    socket.on('space:ko_leaderboard' as any, async (cb: any) => {
      try { cb(ok(await getKnockoutLeaderboard())); } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('space:wins_leaderboard' as any, async (cb: any) => {
      try { cb(ok(await getWinsLeaderboard())); } catch (e: any) { cb(err(e.message)); }
    });

    socket.on('space:level_leaderboard' as any, async (cb: any) => {
      try { cb(ok(await getLevelLeaderboard())); } catch (e: any) { cb(err(e.message)); }
    });

    // ── Space furniture editor (owner-built lounges) ───────────────────
    const furnitureGuard = (): { spaceId: string; items: SpaceFurnitureItem[] } | null => {
      const spaceId = _spaceOfSocket(socket.id);
      if (!spaceId) return null;
      const meta = _spaceMeta.get(spaceId);
      if (!meta) return null;
      if (!(socket.data as any).spaceCanEdit) return null;
      return { spaceId, items: _spaceFurniture.get(spaceId) ?? [] };
    };
    const furnitureBroadcast = (spaceId: string) => {
      io.to(`space:${spaceId}`).emit('space:furniture' as any, { items: _spaceFurniture.get(spaceId) ?? [] });
      _saveSpaceFurniture(spaceId);
    };

    socket.on('space:furniture_add' as any, ({ kind, x, y }: any, cb: Function) => {
      try {
        const ctx = furnitureGuard();
        if (!ctx) return cb?.({ ok: false, error: 'რედაქტირების უფლება არ გაქვს.' });
        if (!SPACE_FURNITURE_KINDS.has(String(kind))) return cb?.({ ok: false, error: 'Unknown item.' });
        if (ctx.items.length >= SPACE_FURNITURE_MAX) return cb?.({ ok: false, error: `მაქს. ${SPACE_FURNITURE_MAX} ნივთი.` });
        const item: SpaceFurnitureItem = {
          id: 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          kind: String(kind),
          x: Math.max(2, Math.min(98, Number(x) || 50)),
          y: Math.max(2, Math.min(95, Number(y) || 55)),
          scale: 1, flip: false,
        };
        _spaceFurniture.set(ctx.spaceId, [...ctx.items, item]);
        furnitureBroadcast(ctx.spaceId);
        cb?.({ ok: true, data: item });
      } catch { cb?.({ ok: false }); }
    });

    socket.on('space:furniture_update' as any, ({ id, x, y, scale, flip }: any, cb: Function) => {
      try {
        const ctx = furnitureGuard();
        if (!ctx) return cb?.({ ok: false });
        const item = ctx.items.find(f => f.id === id);
        if (!item) return cb?.({ ok: false });
        if (x !== undefined) item.x = Math.max(2, Math.min(98, Number(x) || item.x));
        if (y !== undefined) item.y = Math.max(2, Math.min(95, Number(y) || item.y));
        if (scale !== undefined) item.scale = Math.max(0.5, Math.min(2.4, Number(scale) || 1));
        if (flip !== undefined) item.flip = !!flip;
        furnitureBroadcast(ctx.spaceId);
        cb?.({ ok: true });
      } catch { cb?.({ ok: false }); }
    });

    socket.on('space:furniture_remove' as any, ({ id }: any, cb: Function) => {
      try {
        const ctx = furnitureGuard();
        if (!ctx) return cb?.({ ok: false });
        _spaceFurniture.set(ctx.spaceId, ctx.items.filter(f => f.id !== id));
        furnitureBroadcast(ctx.spaceId);
        cb?.({ ok: true });
      } catch { cb?.({ ok: false }); }
    });

    // ── Duels (friendly 1v1 — first to 0 HP loses, nobody is kicked) ────
    socket.on('space:duel_challenge' as any, ({ targetSocketId }: any, cb: Function) => {
      try {
        const spaceId = _spaceOfSocket(socket.id);
        if (!spaceId || targetSocketId === socket.id) return cb?.({ ok: false, error: 'Invalid target.' });
        const room = _spaces.get(spaceId);
        const me = room?.get(socket.id);
        const target = room?.get(targetSocketId);
        if (!me || !target) return cb?.({ ok: false, error: 'Player not here.' });
        if (_duelOpponent.has(socket.id) || _duelOpponent.has(targetSocketId)) {
          return cb?.({ ok: false, error: 'Already in a duel.' });
        }
        if (_duelPending.has(targetSocketId)) return cb?.({ ok: false, error: 'Invite already pending.' });

        _duelPending.set(targetSocketId, socket.id);
        const timer = setTimeout(() => {
          if (_duelPending.get(targetSocketId) === socket.id) {
            _duelPending.delete(targetSocketId);
            _duelPendingTimer.delete(targetSocketId);
            io.to(socket.id).emit('space:duel_declined', { byName: target.name, expired: true });
          }
        }, 20_000);
        _duelPendingTimer.set(targetSocketId, timer);

        io.to(targetSocketId).emit('space:duel_invite', { fromSocketId: socket.id, fromName: me.name });
        cb?.({ ok: true });
      } catch { cb?.({ ok: false }); }
    });

    socket.on('space:duel_respond' as any, ({ fromSocketId, accept }: any, cb: Function) => {
      try {
        const spaceId = _spaceOfSocket(socket.id);
        if (!spaceId) return cb?.({ ok: false });
        const room = _spaces.get(spaceId);
        const me = room?.get(socket.id);
        const challenger = room?.get(fromSocketId);

        // Clear the pending invite + its expiry timer regardless of outcome.
        const t = _duelPendingTimer.get(socket.id);
        if (t) { clearTimeout(t); _duelPendingTimer.delete(socket.id); }
        const wasPending = _duelPending.get(socket.id) === fromSocketId;
        _duelPending.delete(socket.id);

        if (!me || !challenger || !wasPending) return cb?.({ ok: false, error: 'Invite expired.' });
        if (!accept) {
          io.to(fromSocketId).emit('space:duel_declined', { byName: me.name });
          return cb?.({ ok: true });
        }
        if (_duelOpponent.has(socket.id) || _duelOpponent.has(fromSocketId)) return cb?.({ ok: false, error: 'Already in a duel.' });

        _duelOpponent.set(socket.id, fromSocketId);
        _duelOpponent.set(fromSocketId, socket.id);
        // Fresh HP for both fighters.
        me.hp = DUEL_HP;
        challenger.hp = DUEL_HP;
        io.to(`space:${spaceId}`).emit('space:duel_start', {
          aSocketId: fromSocketId, aName: challenger.name, aHp: DUEL_HP,
          bSocketId: socket.id, bName: me.name, bHp: DUEL_HP, maxHp: DUEL_HP,
        });
        cb?.({ ok: true });
      } catch { cb?.({ ok: false }); }
    });

    // ── Rock-Paper-Scissors ("ჯეირანი") ────────────────────────────────
    socket.on('space:rps_challenge' as any, ({ targetSocketId }: any, cb: Function) => {
      try {
        const spaceId = _spaceOfSocket(socket.id);
        if (!spaceId) return cb?.({ ok: false });
        const room = _spaces.get(spaceId);
        const me = room?.get(socket.id);
        const target = room?.get(targetSocketId);
        if (!me || !target || socket.id === targetSocketId) return cb?.({ ok: false });
        if (_rpsPending.has(targetSocketId)) return cb?.({ ok: false, error: 'Invite already pending.' });
        const key = _rpsKey(socket.id, targetSocketId);
        if (_rpsGames.has(key)) return cb?.({ ok: false, error: 'Already playing.' });

        _rpsPending.set(targetSocketId, socket.id);
        const timer = setTimeout(() => {
          if (_rpsPending.get(targetSocketId) === socket.id) {
            _rpsPending.delete(targetSocketId);
            _rpsPendingTimer.delete(targetSocketId);
          }
        }, 20_000);
        _rpsPendingTimer.set(targetSocketId, timer);
        io.to(targetSocketId).emit('space:rps_invite', { fromSocketId: socket.id, fromName: me.name });
        cb?.({ ok: true });
      } catch { cb?.({ ok: false }); }
    });

    socket.on('space:rps_respond' as any, ({ fromSocketId, accept }: any, cb: Function) => {
      try {
        const spaceId = _spaceOfSocket(socket.id);
        if (!spaceId) return cb?.({ ok: false });
        const room = _spaces.get(spaceId);
        const me = room?.get(socket.id);
        const challenger = room?.get(fromSocketId);

        const t = _rpsPendingTimer.get(socket.id);
        if (t) { clearTimeout(t); _rpsPendingTimer.delete(socket.id); }
        const wasPending = _rpsPending.get(socket.id) === fromSocketId;
        _rpsPending.delete(socket.id);

        if (!me || !challenger || !wasPending) return cb?.({ ok: false, error: 'Invite expired.' });
        if (!accept) {
          io.to(fromSocketId).emit('space:rps_declined', { byName: me.name });
          return cb?.({ ok: true });
        }
        const key = _rpsKey(socket.id, fromSocketId);
        const game: RpsGame = { aSocketId: fromSocketId, aName: challenger.name, bSocketId: socket.id, bName: me.name, round: 1, aWins: 0, bWins: 0 };
        _rpsGames.set(key, game);
        io.to(fromSocketId).emit('space:rps_start', { opponent: me.name, opponentSocketId: socket.id, round: 1 });
        io.to(socket.id).emit('space:rps_start', { opponent: challenger.name, opponentSocketId: fromSocketId, round: 1 });
        cb?.({ ok: true });
      } catch { cb?.({ ok: false }); }
    });

    socket.on('space:rps_pick' as any, ({ choice }: { choice: RpsChoice }, cb: Function) => {
      try {
        if (!['rock', 'paper', 'scissors'].includes(choice)) return cb?.({ ok: false });
        const spaceId = _spaceOfSocket(socket.id);
        if (!spaceId) return cb?.({ ok: false });
        let myGame: RpsGame | undefined;
        let myKey = '';
        for (const [key, g] of _rpsGames) {
          if (g.aSocketId === socket.id || g.bSocketId === socket.id) { myGame = g; myKey = key; break; }
        }
        if (!myGame) return cb?.({ ok: false, error: 'No active game.' });

        if (socket.id === myGame.aSocketId) myGame.aPick = choice;
        else myGame.bPick = choice;

        cb?.({ ok: true });

        // Both picked — resolve the round
        if (myGame.aPick && myGame.bPick) {
          const result = _rpsWinner(myGame.aPick, myGame.bPick);
          if (result === 'a') myGame.aWins++;
          else if (result === 'b') myGame.bWins++;

          const roundData = { round: myGame.round, aPick: myGame.aPick, bPick: myGame.bPick, result, aWins: myGame.aWins, bWins: myGame.bWins };

          // Best of 3: first to 2 wins
          if (myGame.aWins >= 2 || myGame.bWins >= 2) {
            const winnerName = myGame.aWins >= 2 ? myGame.aName : myGame.bName;
            const loserName = myGame.aWins >= 2 ? myGame.bName : myGame.aName;
            io.to(myGame.aSocketId).emit('space:rps_round', { ...roundData, finished: true, winnerName, loserName });
            io.to(myGame.bSocketId).emit('space:rps_round', { ...roundData, finished: true, winnerName, loserName });
            // Chat announcement
            _rpsGames.delete(myKey);
          } else {
            myGame.round++;
            myGame.aPick = undefined;
            myGame.bPick = undefined;
            io.to(myGame.aSocketId).emit('space:rps_round', { ...roundData, finished: false, nextRound: myGame.round });
            io.to(myGame.bSocketId).emit('space:rps_round', { ...roundData, finished: false, nextRound: myGame.round });
          }
        }
      } catch { cb?.({ ok: false }); }
    });

    // ── Truth or Dare ("სიმართლე თუ მოქმედება") ───────────────────────
    socket.on('space:tod_challenge' as any, ({ targetSocketId }: any, cb: Function) => {
      try {
        const spaceId = _spaceOfSocket(socket.id);
        if (!spaceId) return cb?.({ ok: false });
        const room = _spaces.get(spaceId);
        const me = room?.get(socket.id);
        const target = room?.get(targetSocketId);
        if (!me || !target || socket.id === targetSocketId) return cb?.({ ok: false });
        if (_todPending.has(targetSocketId)) return cb?.({ ok: false, error: 'Invite already pending.' });
        _todPending.set(targetSocketId, socket.id);
        const timer = setTimeout(() => { if (_todPending.get(targetSocketId) === socket.id) { _todPending.delete(targetSocketId); _todPendingTimer.delete(targetSocketId); } }, 20_000);
        _todPendingTimer.set(targetSocketId, timer);
        io.to(targetSocketId).emit('space:tod_invite' as any, { fromSocketId: socket.id, fromName: me.name });
        cb?.({ ok: true });
      } catch { cb?.({ ok: false }); }
    });

    socket.on('space:tod_respond' as any, ({ fromSocketId, accept }: any, cb: Function) => {
      try {
        const spaceId = _spaceOfSocket(socket.id);
        if (!spaceId) return cb?.({ ok: false });
        const room = _spaces.get(spaceId);
        const me = room?.get(socket.id);
        const challenger = room?.get(fromSocketId);
        const t = _todPendingTimer.get(socket.id);
        if (t) { clearTimeout(t); _todPendingTimer.delete(socket.id); }
        const wasPending = _todPending.get(socket.id) === fromSocketId;
        _todPending.delete(socket.id);
        if (!me || !challenger || !wasPending) return cb?.({ ok: false, error: 'Invite expired.' });
        if (!accept) {
          io.to(fromSocketId).emit('space:tod_declined' as any, { byName: me.name });
          return cb?.({ ok: true });
        }
        io.to(fromSocketId).emit('space:tod_start' as any, { opponent: me.name, opponentSocketId: socket.id });
        io.to(socket.id).emit('space:tod_start' as any, { opponent: challenger.name, opponentSocketId: fromSocketId });
        cb?.({ ok: true });
      } catch { cb?.({ ok: false }); }
    });

    socket.on('space:tod_pick' as any, ({ choice }: { choice: 'truth' | 'dare' }, cb: Function) => {
      try {
        if (choice !== 'truth' && choice !== 'dare') return cb?.({ ok: false });
        const spaceId = _spaceOfSocket(socket.id);
        if (!spaceId) return cb?.({ ok: false });
        const room = _spaces.get(spaceId);
        const me = room?.get(socket.id);
        if (!me) return cb?.({ ok: false });
        const bank = choice === 'truth' ? TOD_TRUTHS : TOD_DARES;
        const question = bank[Math.floor(Math.random() * bank.length)];
        const label = choice === 'truth' ? 'სიმართლე' : 'მოქმედება';
        // Send to everyone in space so it shows in chat
        io.to(`space:${spaceId}`).emit('space:tod_question' as any, { playerName: me.name, choice, label, question });
        cb?.({ ok: true });
      } catch { cb?.({ ok: false }); }
    });

    // ── Reaction Test (⚡ რეაქციის ტესტი) ────────────────────────────
    socket.on('space:reaction_start' as any, (_: any, cb: Function) => {
      try {
        const spaceId = _spaceOfSocket(socket.id);
        if (!spaceId) return cb?.({ ok: false });
        if (_reactionGames.has(spaceId)) return cb?.({ ok: false, error: 'Already running.' });
        const room = _spaces.get(spaceId);
        const me = room?.get(socket.id);
        if (!me) return cb?.({ ok: false });

        const players = new Map<string, string>();
        players.set(socket.id, me.name);
        const game: ReactionGame = { spaceId, phase: 'joining', starterSocketId: socket.id, players, results: [], timers: [] };
        _reactionGames.set(spaceId, game);

        // Broadcast invite to everyone in the space
        io.to(`space:${spaceId}`).emit('space:reaction_invite' as any, { starterName: me.name });

        // Auto-start after 8 seconds
        const startTimer = setTimeout(() => {
          const g = _reactionGames.get(spaceId);
          if (!g || g.phase !== 'joining') return;
          if (g.players.size < 2) {
            io.to(`space:${spaceId}`).emit('space:reaction_cancelled' as any, {});
            _clearReactionGame(spaceId);
            return;
          }
          g.phase = 'countdown';
          io.to(`space:${spaceId}`).emit('space:reaction_countdown' as any, { count: 3, players: [...g.players.entries()].map(([sid, name]) => ({ socketId: sid, name })) });

          const t2 = setTimeout(() => io.to(`space:${spaceId}`).emit('space:reaction_countdown' as any, { count: 2 }), 1000);
          const t3 = setTimeout(() => io.to(`space:${spaceId}`).emit('space:reaction_countdown' as any, { count: 1 }), 2000);
          const randomDelay = 3000 + Math.floor(Math.random() * 3000); // 3-6s after countdown starts (1-4s after "1")
          const tGo = setTimeout(() => {
            const gg = _reactionGames.get(spaceId);
            if (!gg) return;
            gg.phase = 'go';
            gg.goTime = Date.now();
            io.to(`space:${spaceId}`).emit('space:reaction_go' as any, {});
            // Auto-end after 5 seconds if not everyone tapped
            const tEnd = setTimeout(() => {
              const ggg = _reactionGames.get(spaceId);
              if (!ggg || ggg.phase !== 'go') return;
              _finishReaction(spaceId, io);
            }, 5000);
            gg.timers.push(tEnd);
          }, randomDelay);
          g.timers.push(t2, t3, tGo);
        }, 8000);
        game.timers.push(startTimer);

        cb?.({ ok: true });
      } catch { cb?.({ ok: false }); }
    });

    socket.on('space:reaction_join' as any, (_: any, cb: Function) => {
      try {
        const spaceId = _spaceOfSocket(socket.id);
        if (!spaceId) return cb?.({ ok: false });
        const g = _reactionGames.get(spaceId);
        if (!g || g.phase !== 'joining') return cb?.({ ok: false });
        const room = _spaces.get(spaceId);
        const me = room?.get(socket.id);
        if (!me) return cb?.({ ok: false });
        g.players.set(socket.id, me.name);
        io.to(`space:${spaceId}`).emit('space:reaction_player_joined' as any, { name: me.name, count: g.players.size });
        cb?.({ ok: true });
      } catch { cb?.({ ok: false }); }
    });

    socket.on('space:reaction_tap' as any, (_: any, cb: Function) => {
      try {
        const spaceId = _spaceOfSocket(socket.id);
        if (!spaceId) return cb?.({ ok: false });
        const g = _reactionGames.get(spaceId);
        if (!g || g.phase !== 'go' || !g.goTime) return cb?.({ ok: false });
        if (!g.players.has(socket.id)) return cb?.({ ok: false });
        if (g.results.some(r => r.socketId === socket.id)) return cb?.({ ok: false }); // already tapped
        const ms = Date.now() - g.goTime;
        g.results.push({ socketId: socket.id, name: g.players.get(socket.id)!, ms });
        cb?.({ ok: true, ms });
        // If everyone tapped, finish early
        if (g.results.length >= g.players.size) _finishReaction(spaceId, io);
      } catch { cb?.({ ok: false }); }
    });

    socket.on('space:reaction_leaderboard' as any, (_: any, cb: Function) => {
      try {
        const spaceId = _spaceOfSocket(socket.id);
        if (!spaceId) return cb?.({ ok: false });
        const lb = _reactionLeaderboard.get(spaceId);
        const entries = lb ? [...lb.values()].sort((a, b) => b.wins - a.wins).slice(0, 10) : [];
        cb?.({ ok: true, data: entries });
      } catch { cb?.({ ok: false }); }
    });

    socket.on('space:list', (cb: Function) => {
      try {
        const list = [..._spaceMeta.values()]
          .filter(m => m.isPublic)
          .map(m => _publicSpaceMeta(m, _spaceOnlineCount(m.id)))
          .sort((a, b) => (b.persistent ? 1 : 0) - (a.persistent ? 1 : 0) || b.online - a.online);
        cb?.({ ok: true, data: list });
      } catch { cb?.({ ok: false, error: 'Internal error' }); }
    });

    socket.on('space:resolve', ({ code }: any, cb: Function) => {
      try {
        const meta = _findSpaceByCode(String(code ?? ''));
        if (!meta) return cb?.({ ok: false, error: 'კოდი ვერ მოიძებნა.' });
        cb?.({ ok: true, data: { space: _publicSpaceMeta(meta, _spaceOnlineCount(meta.id)) } });
      } catch { cb?.({ ok: false, error: 'Internal error' }); }
    });

    socket.on('space:invite', ({ targetProfileId }: any, cb: Function) => {
      try {
        // Locate the space the inviter is currently in.
        let mySpaceId: string | null = null;
        for (const [sid, room] of _spaces) { if (room.has(socket.id)) { mySpaceId = sid; break; } }
        if (!mySpaceId) return cb?.({ ok: false, error: 'You are not in a space.' });
        const meta = _spaceMeta.get(mySpaceId);
        if (!meta) return cb?.({ ok: false, error: 'Space not found.' });
        const targetSock = findSocketByProfile(io as any, String(targetProfileId));
        if (!targetSock) return cb?.({ ok: false, error: 'მოთამაშე ოფლაინია.' });
        const fromName = _spaces.get(mySpaceId)?.get(socket.id)?.name ?? 'Someone';
        targetSock.emit('space:invited', { spaceId: meta.id, code: meta.code, name: meta.name, icon: meta.icon, fromName });
        cb?.({ ok: true });
      } catch { cb?.({ ok: false, error: 'Internal error' }); }
    });

    socket.on('space:move', ({ x, y }: any) => {
      if (typeof x !== 'number' || typeof y !== 'number') return;
      const cx = Math.max(2, Math.min(98, x));
      const cy = Math.max(2, Math.min(96, y));
      for (const [spaceId, room] of _spaces) {
        const player = room.get(socket.id);
        if (player) {
          player.x = cx; player.y = cy;
          // Walking off a seat stands you up.
          if (player.seat) { player.seat = null; io.to(`space:${spaceId}`).emit('space:player-stood', { socketId: socket.id }); }
          socket.to(`space:${spaceId}`).emit('space:player-moved', { socketId: socket.id, x: cx, y: cy });
          return;
        }
      }
    });

    // ── Cinema seating ─────────────────────────────────────────────────
    socket.on('space:sit', ({ seatId, x, y }: any) => {
      const sid = String(seatId ?? '').slice(0, 24);
      if (!sid) return;
      for (const [spaceId, room] of _spaces) {
        const player = room.get(socket.id);
        if (player) {
          // Reject if the seat is already taken by someone else.
          for (const other of room.values()) {
            if (other.socketId !== socket.id && other.seat === sid) return;
          }
          player.seat = sid;
          if (typeof x === 'number') player.x = Math.max(2, Math.min(98, x));
          if (typeof y === 'number') player.y = Math.max(2, Math.min(96, y));
          io.to(`space:${spaceId}`).emit('space:player-sat', { socketId: socket.id, seatId: sid, x: player.x, y: player.y });
          return;
        }
      }
    });
    socket.on('space:stand', () => {
      for (const [spaceId, room] of _spaces) {
        const player = room.get(socket.id);
        if (player && player.seat) {
          player.seat = null;
          io.to(`space:${spaceId}`).emit('space:player-stood', { socketId: socket.id });
          return;
        }
      }
    });

    // ── Expressions: reactions, gestures, typing (broadcast to the whole space) ──
    socket.on('space:react', ({ emoji }: any) => {
      const e = String(emoji ?? '').slice(0, 8);
      if (!e) return;
      const spaceId = _spaceOfSocket(socket.id);
      if (spaceId) io.to(`space:${spaceId}`).emit('space:player-reacted', { socketId: socket.id, emoji: e });
    });
    socket.on('space:gesture', ({ gesture }: any) => {
      const g = String(gesture ?? '');
      if (!['wave', 'clap', 'point', 'dance', 'bow', 'flex', 'spin', 'sleep', 'heart', 'dab'].includes(g)) return;
      const spaceId = _spaceOfSocket(socket.id);
      if (spaceId) io.to(`space:${spaceId}`).emit('space:player-gesture', { socketId: socket.id, gesture: g });
    });
    socket.on('space:typing', ({ typing }: any) => {
      const spaceId = _spaceOfSocket(socket.id);
      if (spaceId) socket.to(`space:${spaceId}`).emit('space:player-typing', { socketId: socket.id, typing: !!typing });
    });

    socket.on('space:chat', ({ message }: any) => {
      if (typeof message !== 'string') return;
      const msg = message.trim().slice(0, 200);
      if (!msg) return;
      for (const [spaceId, room] of _spaces) {
        if (room.has(socket.id)) {
          io.to(`space:${spaceId}`).emit('space:message', { socketId: socket.id, message: msg });
          return;
        }
      }
    });

    socket.on('space:leave', () => { _leaveSpace(socket.id, io); });

    // ── Backrooms (3D horror mode) — Phase 2 multiplayer presence ──────
    socket.on('backrooms:list' as any, (cb: Function) => {
      const list = [...
        _backroomsMeta.values()].map(m => ({
          id: m.id, name: m.name, seed: m.seed, maxPlayers: m.maxPlayers,
          count: _backrooms.get(m.id)?.size ?? 0,
        }));
      cb?.({ ok: true, data: list });
    });

    socket.on('backrooms:join' as any, ({ instanceId, name, skin, shirt }: any, cb: Function) => {
      try {
        const id = String(instanceId ?? '').slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '');
        const meta = _backroomsMeta.get(id);
        if (!meta) return cb?.({ ok: false, error: 'ეს ინსტანსი აღარ არსებობს.' });
        const safeName = String(name ?? 'Lost').slice(0, 24) || 'Lost';
        // Leave any other instance first (single presence).
        _leaveBackrooms(socket.id, io);
        const room = _backrooms.get(id) ?? new Map<string, BackroomsPlayer>();
        if (!_backrooms.has(id)) _backrooms.set(id, room);
        if (!room.has(socket.id) && room.size >= meta.maxPlayers) {
          return cb?.({ ok: false, error: 'ინსტანსი სავსეა.' });
        }
        const player: BackroomsPlayer = {
          socketId: socket.id, name: safeName, profileId: socket.data.profileId ?? null,
          x: 0, y: 1.6, z: 0, ry: 0, fl: true,
          skin: Number.isFinite(+skin) ? (+skin & 0xffffff) : 0xf2c9a0,
          shirt: Number.isFinite(+shirt) ? (+shirt & 0xffffff) : 0x7c3aed,
        };
        room.set(socket.id, player);
        socket.join(`backrooms:${id}`);
        _ensureBackroomsEvents(id, io);
        _ensureBackroomsVoid(id, io);
        _ensureBackroomsMimic(id, io);
        socket.to(`backrooms:${id}`).emit('backrooms:player-joined' as any, player);
        cb?.({ ok: true, data: {
          seed: meta.seed, name: meta.name, mySocketId: socket.id,
          players: [...room.values()],
        } });
      } catch { cb?.({ ok: false, error: 'Internal error' }); }
    });

    // High-frequency position update (client throttles to ~10Hz).
    socket.on('backrooms:move' as any, ({ x, y, z, ry, fl }: any) => {
      if (typeof x !== 'number' || typeof z !== 'number') return;
      for (const [instanceId, room] of _backrooms) {
        const p = room.get(socket.id);
        if (!p) continue;
        p.x = x; p.y = typeof y === 'number' ? y : p.y; p.z = z;
        p.ry = typeof ry === 'number' ? ry : p.ry;
        p.fl = !!fl;
        socket.to(`backrooms:${instanceId}`).emit('backrooms:player-moved' as any, {
          socketId: socket.id, x: p.x, y: p.y, z: p.z, ry: p.ry, fl: p.fl,
        });
        return;
      }
    });

    socket.on('backrooms:leave' as any, () => { _leaveBackrooms(socket.id, io); });

    // Social gesture (wave / point / flashlight signal) → relay to the instance.
    socket.on('backrooms:gesture' as any, ({ kind }: any) => {
      const k = String(kind ?? '');
      if (!['wave', 'point', 'signal'].includes(k)) return;
      for (const [instanceId, room] of _backrooms) {
        if (room.has(socket.id)) {
          socket.to(`backrooms:${instanceId}`).emit('backrooms:gesture' as any, { socketId: socket.id, kind: k });
          return;
        }
      }
    });

    // ── Premium Worlds — presence, seats, wave, spatial voice ──────────
    socket.on('world:list' as any, (cb: Function) => {
      const list = [...WORLD_IDS].map(id => ({ id, count: _worlds.get(id)?.size ?? 0 }));
      cb?.({ ok: true, data: list });
    });

    socket.on('world:join' as any, ({ worldId, name, bodyColor, glowColor, spec }: any, cb: Function) => {
      try {
        const id = String(worldId ?? '');
        if (!WORLD_IDS.has(id)) return cb?.({ ok: false, error: 'ეს სამყარო არ არსებობს.' });
        _leaveWorld(socket.id, io);
        const room = _worlds.get(id) ?? new Map<string, WorldPlayer>();
        if (!_worlds.has(id)) _worlds.set(id, room);
        if (!room.has(socket.id) && room.size >= WORLD_MAX) return cb?.({ ok: false, error: 'სამყარო სავსეა.' });
        // Accept the character spec but bound it (opaque appearance blob, ~2KB cap).
        let safeSpec: any = null;
        try { if (spec && typeof spec === 'object' && JSON.stringify(spec).length < 2048) safeSpec = spec; } catch { /* ignore */ }
        const p: WorldPlayer = {
          socketId: socket.id, name: String(name ?? 'Guest').slice(0, 24) || 'Guest',
          profileId: socket.data.profileId ?? null,
          bodyColor: _hex6(bodyColor, '#9b00ff'), glowColor: _hex6(glowColor, '#00e5ff'), spec: safeSpec,
          x: 0, z: 8.5, ry: 0, seatId: null,
        };
        room.set(socket.id, p);
        socket.join(`world:${id}`);
        socket.to(`world:${id}`).emit('world:player-joined' as any, p);
        cb?.({ ok: true, data: { mySocketId: socket.id, players: [...room.values()], tv: _worldTV.get(id) ?? null } });
      } catch { cb?.({ ok: false, error: 'Internal error' }); }
    });

    socket.on('world:move' as any, ({ x, z, ry, seatId }: any) => {
      if (typeof x !== 'number' || typeof z !== 'number') return;
      for (const [worldId, room] of _worlds) {
        const p = room.get(socket.id);
        if (!p) continue;
        p.x = x; p.z = z; p.ry = typeof ry === 'number' ? ry : p.ry;
        // seat claim: only take a free seat; keep own; clear on stand
        const sid = (seatId === null || typeof seatId === 'string') ? seatId : p.seatId;
        if (sid && sid !== p.seatId) {
          const taken = [...room.values()].some(o => o.socketId !== socket.id && o.seatId === sid);
          p.seatId = taken ? null : sid;
        } else if (sid === null) { p.seatId = null; }
        socket.to(`world:${worldId}`).emit('world:player-moved' as any, { socketId: socket.id, x: p.x, z: p.z, ry: p.ry, seatId: p.seatId });
        return;
      }
    });

    socket.on('world:wave' as any, () => {
      for (const [worldId, room] of _worlds) {
        if (room.has(socket.id)) { socket.to(`world:${worldId}`).emit('world:wave' as any, { socketId: socket.id }); return; }
      }
    });

    socket.on('world:emote' as any, ({ kind }: any) => {
      const k = String(kind ?? '');
      if (!['wave', 'dance', 'clap', 'heart', 'laugh', 'disco', 'spin'].includes(k)) return;
      for (const [worldId, room] of _worlds) {
        if (room.has(socket.id)) { socket.to(`world:${worldId}`).emit('world:emote' as any, { socketId: socket.id, kind: k }); return; }
      }
    });

    socket.on('world:interact' as any, ({ id }: any) => {
      const oid = String(id ?? '').slice(0, 32);
      if (!oid) return;
      for (const [worldId, room] of _worlds) {
        if (room.has(socket.id)) { socket.to(`world:${worldId}`).emit('world:interact' as any, { id: oid }); return; }
      }
    });

    socket.on('world:chat' as any, ({ text }: any) => {
      const msg = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!msg) return;
      for (const [worldId, room] of _worlds) {
        if (room.has(socket.id)) {
          const name = room.get(socket.id)?.name ?? 'Guest';
          io.to(`world:${worldId}`).emit('world:chat' as any, { socketId: socket.id, name, text: msg, at: Date.now() });
          return;
        }
      }
    });

    socket.on('world:leave' as any, () => { _leaveWorld(socket.id, io); });

    socket.on('world:update-spec' as any, ({ spec, bodyColor, glowColor }: any) => {
      for (const [worldId, room] of _worlds) {
        const p = room.get(socket.id);
        if (!p) continue;
        let safeSpec: any = null;
        try { if (spec && typeof spec === 'object' && JSON.stringify(spec).length < 2048) safeSpec = spec; } catch {}
        p.spec = safeSpec;
        p.bodyColor = _hex6(bodyColor, p.bodyColor);
        p.glowColor = _hex6(glowColor, p.glowColor);
        socket.to(`world:${worldId}`).emit('world:player-spec' as any, { socketId: socket.id, spec: safeSpec, bodyColor: p.bodyColor, glowColor: p.glowColor });
        return;
      }
    });

    // ── World cinema (shared YouTube) ──────────────────────────────────
    const _worldOf = () => { for (const [wid, room] of _worlds) if (room.has(socket.id)) return wid; return null; };
    socket.on('world:tv-set' as any, ({ videoId, title }: any) => {
      const wid = _worldOf(); if (!wid) return;
      const vid = String(videoId ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
      if (!vid) return;
      const tv: WorldTV = { videoId: vid, title: String(title ?? '').slice(0, 120), startedAt: Date.now(), position: 0, isPlaying: true, byName: _worlds.get(wid)!.get(socket.id)?.name ?? '' };
      _worldTV.set(wid, tv);
      io.to(`world:${wid}`).emit('world:tv' as any, tv);
    });
    socket.on('world:tv-toggle' as any, () => {
      const wid = _worldOf(); if (!wid) return;
      const tv = _worldTV.get(wid); if (!tv) return;
      if (tv.isPlaying) { tv.position = (Date.now() - tv.startedAt) / 1000; tv.isPlaying = false; }
      else { tv.startedAt = Date.now() - tv.position * 1000; tv.isPlaying = true; }
      io.to(`world:${wid}`).emit('world:tv' as any, tv);
    });
    socket.on('world:tv-stop' as any, () => {
      const wid = _worldOf(); if (!wid) return;
      _worldTV.delete(wid);
      io.to(`world:${wid}`).emit('world:tv' as any, null);
    });

    // Invite a friend into the world you're in.
    socket.on('world:invite' as any, ({ targetProfileId }: any, cb: Function) => {
      try {
        const wid = _worldOf(); if (!wid) return cb?.({ ok: false, error: 'You are not in a world.' });
        const targetSock = findSocketByProfile(io as any, String(targetProfileId));
        if (!targetSock) return cb?.({ ok: false, error: 'მოთამაშე ოფლაინია.' });
        const fromName = _worlds.get(wid)?.get(socket.id)?.name ?? 'Someone';
        targetSock.emit('world:invited', { worldId: wid, fromName });
        cb?.({ ok: true });
      } catch { cb?.({ ok: false, error: 'Internal error' }); }
    });

    // spatial voice mesh (own channel)
    socket.on('world:voice-join' as any, (_: any, cb: Function) => {
      for (const [worldId, room] of _worlds) {
        if (room.has(socket.id)) {
          if (!_worldVoice.has(worldId)) _worldVoice.set(worldId, new Map());
          const voices = _worldVoice.get(worldId)!;
          const peers = [...voices.entries()].map(([s, n]) => ({ socketId: s, name: n }));
          voices.set(socket.id, room.get(socket.id)!.name);
          socket.to(`world:${worldId}`).emit('world:voice-peer-joined' as any, { socketId: socket.id, name: room.get(socket.id)!.name });
          const ice = buildIceConfig();
          cb?.({ ok: true, data: { peers, iceServers: ice.iceServers, iceTransportPolicy: ice.iceTransportPolicy } });
          return;
        }
      }
      cb?.({ ok: false, error: 'Not in a world' });
    });
    socket.on('world:voice-leave' as any, () => { _leaveWorldVoice(socket.id, io); });
    socket.on('world:voice-offer' as any, ({ to, sdp }: any) => { if (typeof to === 'string' && sdp) io.to(to).emit('world:voice-offer' as any, { from: socket.id, sdp }); });
    socket.on('world:voice-answer' as any, ({ to, sdp }: any) => { if (typeof to === 'string' && sdp) io.to(to).emit('world:voice-answer' as any, { from: socket.id, sdp }); });
    socket.on('world:voice-ice' as any, ({ to, candidate }: any) => { if (typeof to === 'string' && candidate) io.to(to).emit('world:voice-ice' as any, { from: socket.id, candidate }); });

    // ── Backrooms spatial voice (Phase 3) — mesh signaling per instance ─
    socket.on('backrooms:voice-join' as any, (_: any, cb: Function) => {
      for (const [instanceId, room] of _backrooms) {
        if (room.has(socket.id)) {
          if (!_backroomsVoice.has(instanceId)) _backroomsVoice.set(instanceId, new Map());
          const voices = _backroomsVoice.get(instanceId)!;
          const peers = [...voices.entries()].map(([sid, nm]) => ({ socketId: sid, name: nm }));
          const player = room.get(socket.id)!;
          voices.set(socket.id, player.name);
          socket.to(`backrooms:${instanceId}`).emit('backrooms:voice-peer-joined' as any, { socketId: socket.id, name: player.name });
          const iceConfig = buildIceConfig();
          cb?.({ ok: true, data: { peers, iceServers: iceConfig.iceServers, iceTransportPolicy: iceConfig.iceTransportPolicy } });
          return;
        }
      }
      cb?.({ ok: false, error: 'Not in a Backrooms instance' });
    });
    socket.on('backrooms:voice-leave' as any, () => { _leaveBackroomsVoice(socket.id, io); });
    socket.on('backrooms:voice-offer' as any, ({ to, sdp }: any) => {
      if (typeof to !== 'string' || !sdp) return;
      io.to(to).emit('backrooms:voice-offer' as any, { from: socket.id, sdp });
    });
    socket.on('backrooms:voice-answer' as any, ({ to, sdp }: any) => {
      if (typeof to !== 'string' || !sdp) return;
      io.to(to).emit('backrooms:voice-answer' as any, { from: socket.id, sdp });
    });
    socket.on('backrooms:voice-ice' as any, ({ to, candidate }: any) => {
      if (typeof to !== 'string' || !candidate) return;
      io.to(to).emit('backrooms:voice-ice' as any, { from: socket.id, candidate });
    });

    // ── Virtual Space DJ ──────────────────────────────────────────────
    socket.on('space:dj-play', ({ videoId, position = 0 }: any) => {
      const vid = String(videoId ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
      if (!vid) return;
      for (const [spaceId, room] of _spaces) {
        if (room.has(socket.id)) {
          const prevVol = _spaceDJ.get(spaceId)?.volume ?? 70;
          const state: SpaceDJState = {
            videoId: vid,
            startedAt: Date.now() - Math.round((Number(position) || 0) * 1000),
            position: Number(position) || 0,
            isPlaying: true,
            djName: room.get(socket.id)!.name,
            volume: prevVol,
          };
          _spaceDJ.set(spaceId, state);
          io.to(`space:${spaceId}`).emit('space:dj-update', state);
          return;
        }
      }
    });

    socket.on('space:dj-pause', ({ position }: any) => {
      for (const [spaceId, room] of _spaces) {
        if (room.has(socket.id)) {
          const state = _spaceDJ.get(spaceId);
          if (!state) return;
          state.isPlaying = false;
          state.position  = Number(position) || 0;
          io.to(`space:${spaceId}`).emit('space:dj-update', { ...state });
          return;
        }
      }
    });

    socket.on('space:dj-stop', () => {
      for (const [spaceId, room] of _spaces) {
        if (room.has(socket.id)) {
          _spaceDJ.delete(spaceId);
          io.to(`space:${spaceId}`).emit('space:dj-update', null);
          return;
        }
      }
    });

    socket.on('space:dj-volume', ({ volume }: any) => {
      const v = Math.max(0, Math.min(100, Math.round(Number(volume) || 0)));
      for (const [spaceId, room] of _spaces) {
        if (room.has(socket.id)) {
          const state = _spaceDJ.get(spaceId);
          if (!state) return;
          state.volume = v;
          io.to(`space:${spaceId}`).emit('space:dj-update', { ...state });
          return;
        }
      }
    });

    socket.on('space:yt-search', async ({ query }: any, cb: any) => {
      if (!query || typeof query !== 'string' || query.length > 120) return cb?.(err('Bad query'));
      try {
        const res = await fetch('https://www.youtube.com/youtubei/v1/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query.trim(), context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' } } }),
        });
        if (!res.ok) throw new Error('search failed');
        const data = await res.json() as any;
        const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? [];
        const items: { videoId: string; title: string; author: string; duration: number }[] = [];
        for (const s of sections) {
          for (const item of (s?.itemSectionRenderer?.contents ?? [])) {
            const v = item?.videoRenderer;
            if (!v?.videoId) continue;
            const durText = v?.lengthText?.simpleText ?? '';
            const parts = durText.split(':').map(Number);
            const dur = parts.length === 3 ? parts[0]*3600+parts[1]*60+parts[2] : parts.length === 2 ? parts[0]*60+parts[1] : 0;
            items.push({
              videoId: v.videoId,
              title: String(v?.title?.runs?.[0]?.text ?? '').slice(0, 120),
              author: String(v?.ownerText?.runs?.[0]?.text ?? '').slice(0, 60),
              duration: dur,
            });
            if (items.length >= 8) break;
          }
          if (items.length >= 8) break;
        }
        cb?.(ok(items));
      } catch { cb?.(err('Search unavailable')); }
    });

    // ── Cinema TV / Watch Party ────────────────────────────────────────
    function _skipNeeded(spaceId: string): number {
      return Math.max(1, Math.floor(_spaceOnlineCount(spaceId) / 2) + 1);
    }
    function _tvPublic(spaceId: string): any {
      const s = _spaceTV.get(spaceId);
      if (!s) return null;
      return {
        videoId: s.videoId, title: s.title, startedAt: s.startedAt, position: s.position,
        isPlaying: s.isPlaying, byName: s.byName,
        queue: s.queue.map(q => ({ videoId: q.videoId, title: q.title })),
        skipVotes: s.skipVoters.size, skipNeeded: _skipNeeded(spaceId),
      };
    }
    function _tvBroadcast(spaceId: string) {
      io.to(`space:${spaceId}`).emit('tv:update', _tvPublic(spaceId));
    }
    // Auto-pause the DJ music when the TV takes over the room's audio.
    function _pauseDj(spaceId: string) {
      const dj = _spaceDJ.get(spaceId);
      if (dj && dj.isPlaying) {
        dj.isPlaying = false;
        io.to(`space:${spaceId}`).emit('space:dj-update', { ...dj });
      }
    }
    function _startVideo(spaceId: string, vid: string, title: string, byName: string) {
      const prev = _spaceTV.get(spaceId);
      _spaceTV.set(spaceId, {
        videoId: vid, title: String(title ?? '').slice(0, 120),
        startedAt: Date.now(), position: 0, isPlaying: true, byName,
        queue: prev ? prev.queue : [], skipVoters: new Set(),
      });
      _pauseDj(spaceId);
      _tvBroadcast(spaceId);
    }
    function _tvAdvance(spaceId: string) {
      const s = _spaceTV.get(spaceId);
      if (!s) return;
      const next = s.queue.shift();
      if (next) _startVideo(spaceId, next.videoId, next.title, 'Up Next');
      else { _spaceTV.delete(spaceId); _tvBroadcast(spaceId); }
    }
    const sanitizeVid = (v: any) => String(v ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);

    socket.on('tv:set', ({ videoId, title }: any) => {
      const spaceId = _spaceOfSocket(socket.id);
      if (!spaceId || !_canControlTv(spaceId, socket.data.profileId ?? null)) return;
      const vid = sanitizeVid(videoId);
      if (!vid) return;
      const byName = _spaces.get(spaceId)?.get(socket.id)?.name ?? 'Someone';
      _startVideo(spaceId, vid, title, byName);
    });
    // Anyone present may add to the shared queue (collaborative playlist).
    socket.on('tv:enqueue', ({ videoId, title }: any) => {
      const spaceId = _spaceOfSocket(socket.id);
      if (!spaceId) return;
      const vid = sanitizeVid(videoId);
      if (!vid) return;
      const cur = _spaceTV.get(spaceId);
      if (!cur) {
        const byName = _spaces.get(spaceId)?.get(socket.id)?.name ?? 'Someone';
        _startVideo(spaceId, vid, title, byName);
      } else {
        if (cur.queue.length < 30) cur.queue.push({ videoId: vid, title: String(title ?? '').slice(0, 120) });
        _tvBroadcast(spaceId);
      }
    });
    socket.on('tv:next', () => {
      const spaceId = _spaceOfSocket(socket.id);
      if (!spaceId || !_canControlTv(spaceId, socket.data.profileId ?? null)) return;
      _tvAdvance(spaceId);
    });
    socket.on('tv:vote_skip', () => {
      const spaceId = _spaceOfSocket(socket.id);
      if (!spaceId) return;
      const s = _spaceTV.get(spaceId); if (!s) return;
      s.skipVoters.add(socket.id);
      if (s.skipVoters.size >= _skipNeeded(spaceId)) _tvAdvance(spaceId);
      else _tvBroadcast(spaceId);
    });
    // A client whose player reached the end reports it; first valid report advances.
    socket.on('tv:ended', ({ videoId }: any) => {
      const spaceId = _spaceOfSocket(socket.id);
      if (!spaceId) return;
      const s = _spaceTV.get(spaceId);
      if (s && s.videoId === sanitizeVid(videoId)) _tvAdvance(spaceId);
    });
    socket.on('tv:play', ({ position }: any) => {
      const spaceId = _spaceOfSocket(socket.id);
      if (!spaceId || !_canControlTv(spaceId, socket.data.profileId ?? null)) return;
      const state = _spaceTV.get(spaceId); if (!state) return;
      const pos = Math.max(0, Number(position) || 0);
      state.isPlaying = true;
      state.position = pos;
      state.startedAt = Date.now() - Math.round(pos * 1000);
      _pauseDj(spaceId);
      _tvBroadcast(spaceId);
    });
    socket.on('tv:pause', ({ position }: any) => {
      const spaceId = _spaceOfSocket(socket.id);
      if (!spaceId || !_canControlTv(spaceId, socket.data.profileId ?? null)) return;
      const state = _spaceTV.get(spaceId); if (!state) return;
      state.isPlaying = false;
      state.position = Math.max(0, Number(position) || 0);
      _tvBroadcast(spaceId);
    });
    socket.on('tv:seek', ({ position }: any) => {
      const spaceId = _spaceOfSocket(socket.id);
      if (!spaceId || !_canControlTv(spaceId, socket.data.profileId ?? null)) return;
      const state = _spaceTV.get(spaceId); if (!state) return;
      const pos = Math.max(0, Number(position) || 0);
      state.position = pos;
      if (state.isPlaying) state.startedAt = Date.now() - Math.round(pos * 1000);
      _tvBroadcast(spaceId);
    });
    socket.on('tv:stop', () => {
      const spaceId = _spaceOfSocket(socket.id);
      if (!spaceId || !_canControlTv(spaceId, socket.data.profileId ?? null)) return;
      _spaceTV.delete(spaceId);
      _tvBroadcast(spaceId);
    });

    // ── Virtual Space Voice ────────────────────────────────────────────
    socket.on('space:voice-join', (_: any, cb: Function) => {
      for (const [spaceId, room] of _spaces) {
        if (room.has(socket.id)) {
          if (!_spaceVoice.has(spaceId)) _spaceVoice.set(spaceId, new Map());
          const voices = _spaceVoice.get(spaceId)!;
          const peers = [...voices.entries()].map(([sid, nm]) => ({ socketId: sid, name: nm }));
          const player = room.get(socket.id)!;
          voices.set(socket.id, player.name);
          socket.to(`space:${spaceId}`).emit('space:voice-peer-joined', { socketId: socket.id, name: player.name });
          const iceConfig = buildIceConfig();
          cb?.({ ok: true, data: { peers, iceServers: iceConfig.iceServers, iceTransportPolicy: iceConfig.iceTransportPolicy } });
          return;
        }
      }
      cb?.({ ok: false, error: 'Not in a space' });
    });

    // Ghost listen-only voice: owner receives others' audio without being
    // added to the voice roster (hidden, no count) and never transmits.
    socket.on('space:voice-ghost_join' as any, async (cb: Function) => {
      try {
        const pid = socket.data.profileId;
        const mod = pid ? await getPlayer(pid) : null;
        if (!mod || mod.moderatorLevel !== 'owner' || !isGhost(pid!)) return cb?.({ ok: false, error: 'Ghost mode (owner) only.' });
        let spaceId: string | null = null;
        for (const r of socket.rooms) if (typeof r === 'string' && r.startsWith('space:')) { spaceId = r.slice(6); break; }
        if (!spaceId) return cb?.({ ok: false, error: 'Not observing a space.' });
        const voices = _spaceVoice.get(spaceId);
        const peers = voices ? [...voices.entries()].map(([sid, nm]) => ({ socketId: sid, name: nm })) : [];
        const iceConfig = buildIceConfig();
        // Intentionally NOT added to _spaceVoice and no peer-joined broadcast —
        // the ghost just offers to current peers (and to future joiners via the
        // space-room peer-joined broadcast it already receives).
        cb?.({ ok: true, data: { peers, iceServers: iceConfig.iceServers, iceTransportPolicy: iceConfig.iceTransportPolicy } });
      } catch { cb?.({ ok: false, error: 'Internal error' }); }
    });

    socket.on('space:voice-leave', () => { _leaveSpaceVoice(socket.id, io); });

    socket.on('space:voice-offer', ({ to, sdp }: any) => {
      if (typeof to !== 'string' || !sdp) return;
      io.to(to).emit('space:voice-offer', { from: socket.id, sdp });
    });

    socket.on('space:voice-answer', ({ to, sdp }: any) => {
      if (typeof to !== 'string' || !sdp) return;
      io.to(to).emit('space:voice-answer', { from: socket.id, sdp });
    });

    socket.on('space:voice-ice', ({ to, candidate }: any) => {
      if (typeof to !== 'string' || !candidate) return;
      io.to(to).emit('space:voice-ice', { from: socket.id, candidate });
    });

    socket.on('disconnect', () => {
      rateLimits.delete(socket.id);
      const { roomId, playerId, profileId } = socket.data;
      if (profileId) {
        markOffline(profileId);
        // Stamp last-seen so the DM header can show "last seen …" accurately.
        sql`UPDATE players SET last_seen_at = ${Date.now()} WHERE id = ${profileId}`.catch(() => {});
        broadcastOnlineCount(io);
        if (activeSessions.get(profileId) === socket.id) activeSessions.delete(profileId);
        chatCooldowns.delete(profileId);
        chatWindows.delete(profileId);
        lastChatMsg.delete(profileId);
      } else {
        chatCooldowns.delete(socket.id);
        chatWindows.delete(socket.id);
        lastChatMsg.delete(socket.id);
      }
      if (roomId && playerId) handlePlayerLeave(io, socket, roomId, playerId);
      _leaveSpace(socket.id, io);
      _leaveSpaceVoice(socket.id, io);
      _leaveBackrooms(socket.id, io);
      _leaveWorld(socket.id, io);
      handleVoiceLeave(io, socket.id);
      handleLoungeLeave(io, socket);
      handleCheckersDisconnect(io, socket.id);
      handleJokerDisconnect(io, socket.id);
      handleLudoDisconnect(io, socket.id);
      handleWWWDisconnect(io, socket.id);
      handleUnoDisconnect(io, socket.id);
      handleBlackoutDisconnect(io, socket.id);
      handleAliasDisconnect(io, socket.id);
      handleDrawDisconnect(io, socket.id);
      handleCodenamesDisconnect(io, socket.id);
      handleSpyfallDisconnect(io, socket.id);
      handleLiesDisconnect(io, socket.id);
      // Remove from any spectate queues
      for (const [qRoomId, queue] of spectateQueues) {
        const idx = queue.indexOf(socket.id);
        if (idx !== -1) {
          queue.splice(idx, 1);
          if (queue.length === 0) spectateQueues.delete(qRoomId);
        }
      }
    });
  });
}

// ── Leave / Disconnect Logic ──────────────────────────────────────────

function startHostGrace(io: AppServer, room: Room, hostName: string, profileId: string | null): void {
  const roomId = room.id;
  // Cancel any existing grace timer for this room
  const existing = hostGraceTimers.get(roomId);
  if (existing) clearTimeout(existing.timer);

  broadcastSystemMsg(io, room, `${hostName} (host) disconnected. Room closes in 20s if they don't return.`);
  broadcastRoom(io, room);

  const timer = setTimeout(() => {
    hostGraceTimers.delete(roomId);
    const currentRoom = getRoom(roomId);
    if (currentRoom) {
      closeRoom(io, currentRoom, `${hostName} (host) did not return. Room closed.`);
      spectateQueues.delete(roomId);
    }
  }, HOST_GRACE_MS);

  hostGraceTimers.set(roomId, { timer, profileId, hostName });
}

function closeRoom(io: AppServer, room: Room, reason: string): void {
  timerService.stop(room.id);
  // Cancel all pending lobby grace timers for this room's players
  for (const p of room.players.values()) {
    clearLobbyGrace(p.id);
    if (p.socketId) {
      io.to(p.socketId).emit('room:closed', { reason });
    }
  }
  io.socketsLeave(room.id);
  deleteRoom(room.id);
}

function promoteFromQueue(io: AppServer, room: Room): void {
  const queue = spectateQueues.get(room.id);
  if (!queue || queue.length === 0) return;
  const nextSocketId = queue.shift()!;
  if (queue.length === 0) spectateQueues.delete(room.id);
  else spectateQueues.set(room.id, queue);
  io.to(nextSocketId).emit('queue:promoted', { roomCode: room.code });
}

function handlePlayerLeave(io: AppServer, socket: AppSocket, roomId: string, playerId: string, explicit = false): void {
  const room = getRoom(roomId);
  if (!room) return;

  const player = room.players.get(playerId);
  if (!player) return;

  const wasHost = player.isHost;
  const profileId = socket.data.profileId ?? null;

  socket.leave(roomId);
  socket.data.playerId = null;
  socket.data.roomId = null;

  if (room.phase === 'lobby') {
    if (explicit) {
      // ── Explicit leave (room:leave event) — remove immediately ──────
      clearLobbyGrace(playerId);
      removePlayer(room, playerId);

      if (room.players.size === 0) {
        timerService.stop(roomId);
        const grace = hostGraceTimers.get(roomId);
        if (grace) { clearTimeout(grace.timer); hostGraceTimers.delete(roomId); }
        deleteRoom(roomId);
        spectateQueues.delete(roomId);
        return;
      }

      if (wasHost) {
        const grace = hostGraceTimers.get(roomId);
        if (grace) { clearTimeout(grace.timer); hostGraceTimers.delete(roomId); }
        closeRoom(io, room, `${player.name} (host) left. The room has been closed.`);
        spectateQueues.delete(roomId);
        return;
      }

      broadcastSystemMsg(io, room, `${player.name} left the room.`);
      broadcastRoom(io, room);
      promoteFromQueue(io, room);
    } else {
      // ── Disconnect (browser refresh / network drop) — grace period ──
      // Keep the player slot so they can seamlessly rejoin.
      // addPlayer() in roomService recognises them by profileId/name.
      clearLobbyGrace(playerId); // cancel any previous timer
      player.isConnected = false;
      player.socketId = '';

      if (wasHost) {
        // Existing host-grace logic closes the room if host doesn't return
        startHostGrace(io, room, player.name, profileId);
        spectateQueues.delete(roomId);
      } else {
        broadcastSystemMsg(io, room, `${player.name} disconnected.`);
        broadcastRoom(io, room);
      }

      // After LOBBY_GRACE_MS, if still offline, finalize the removal
      const timer = setTimeout(() => {
        lobbyGraceTimers.delete(playerId);
        const currentRoom = getRoom(roomId);
        if (!currentRoom) return;
        const stillPlayer = currentRoom.players.get(playerId);
        if (stillPlayer && !stillPlayer.isConnected) {
          const wasStillHost = stillPlayer.isHost;
          removePlayer(currentRoom, playerId);
          if (currentRoom.players.size === 0) {
            timerService.stop(roomId);
            const hg = hostGraceTimers.get(roomId);
            if (hg) { clearTimeout(hg.timer); hostGraceTimers.delete(roomId); }
            deleteRoom(roomId);
            spectateQueues.delete(roomId);
            return;
          }
          if (!wasStillHost) {
            broadcastSystemMsg(io, currentRoom, `${stillPlayer.name} left the room.`);
            broadcastRoom(io, currentRoom);
            promoteFromQueue(io, currentRoom);
          }
        }
      }, LOBBY_GRACE_MS);

      lobbyGraceTimers.set(playerId, { timer, roomId, playerName: player.name });
    }
  } else {
    if (wasHost) {
      if (explicit) {
        const grace = hostGraceTimers.get(roomId);
        if (grace) { clearTimeout(grace.timer); hostGraceTimers.delete(roomId); }
        closeRoom(io, room, `${player.name} (host) left. The room has been closed.`);
        spectateQueues.delete(roomId);
      } else {
        // During active game — keep player slot, start grace
        player.isConnected = false;
        player.socketId = '';
        startHostGrace(io, room, player.name, profileId);
        spectateQueues.delete(roomId);
      }
      return;
    }

    if (explicit && room.phase === 'game_over') {
      // Game is fully over — explicit leave means "I'm done", remove the player cleanly.
      // This prevents orphaned player slots when host later restarts the room.
      removePlayer(room, playerId);
      if (room.players.size === 0) {
        timerService.stop(roomId);
        deleteRoom(roomId);
        spectateQueues.delete(roomId);
        return;
      }
      broadcastSystemMsg(io, room, `${player.name} left.`);
      broadcastRoom(io, room);
      promoteFromQueue(io, room);
    } else {
      // Mid-game disconnect or non-game_over explicit leave — keep slot for reconnect.
      player.isConnected = false;
      player.socketId = '';
      broadcastSystemMsg(io, room, `${player.name} disconnected.`);
      broadcastRoom(io, room);
      promoteFromQueue(io, room);
    }
  }
}

function handleVoiceLeave(io: AppServer, socketId: string): void {
  const removed = voiceLeave(socketId);
  for (const { channel, remaining } of removed) {
    for (const peer of remaining) {
      io.to(peer.socketId).emit('voice:peer-left', { socketId, channel });
    }
  }
}

function forceLeaveVoiceChannel(io: AppServer, roomId: string, channel: VoiceChannel, reason: string): void {
  const members = [...voiceGetMembers(roomId, channel)];
  for (const member of members) {
    io.to(member.socketId).emit('voice:force-leave', { channel, reason });
    const removed = voiceRemoveFromChannel(member.socketId, channel);
    if (removed) {
      for (const peer of removed.remaining) {
        io.to(peer.socketId).emit('voice:peer-left', { socketId: member.socketId, channel });
      }
    }
  }
}

// Per-player transmit permission for the LiveKit MAIN room, mirroring the
// mesh phase rules below. LiveKit uses one room per game, so night faction
// voice isn't available there — everyone is muted at night (mafia use team chat).
function liveKitMainDecision(room: Room, player: Player): { transmit: boolean; reason?: string } {
  if (!player.isAlive || player.isSpectator) return { transmit: false, reason: 'Listen only.' };
  const phase = room.phase;
  const silentDay = room.activeEvent?.key === 'silent_day';
  switch (phase) {
    case 'night':
      // Mafia and Yakuza teams coordinate at night in their PRIVATE LiveKit
      // sub-rooms (roomId::mafia / roomId::yakuza — the client switches rooms),
      // so unmuting them here is only heard by their teammates.
      if (player.team === 'mafia' || player.team === 'yakuza') return { transmit: true };
      return { transmit: false, reason: 'Voice muted during night phase.' };
    case 'role_reveal':
      return { transmit: false, reason: 'Voice disabled during role reveal.' };
    case 'voting':
      return { transmit: false, reason: 'Silent during voting.' };
    case 'mafia_kill':
      // Don-mode kill step: the mafia team talks in its private sub-room.
      if (player.team === 'mafia') return { transmit: true };
      return { transmit: false, reason: 'Silent phase.' };
    case 'don_check':
    case 'sheriff_check':
    case 'revote':
    case 'double_elim_vote':
      return { transmit: false, reason: 'Silent phase.' };
    case 'speech': {
      if (silentDay) return { transmit: false, reason: 'Silent Day — voice is disabled today.' };
      const speakerId = room.speechOrder[room.currentSpeakerIdx] ?? null;
      const foulPlayerId = (room.activeFoul && Date.now() < room.activeFoul.endsAt) ? room.activeFoul.playerId : null;
      if (player.id === speakerId || player.id === foulPlayerId) return { transmit: true };
      return { transmit: false, reason: 'Only the current speaker may transmit.' };
    }
    case 'trial_defense': {
      const tds = room.trialDefenseState;
      const candidateId = tds ? tds.candidateIds[tds.currentCandidateIdx] : null;
      if (player.id === candidateId) return { transmit: true };
      return { transmit: false, reason: 'Only the defense candidate may speak.' };
    }
    case 'planning_night':
      if (player.team === 'mafia') return { transmit: true };
      return { transmit: false, reason: 'Planning Night — Mafia team is planning.' };
    case 'tie_defense': {
      const dms = room.donModeState;
      const speakerId = dms ? dms.defenseQueue[dms.currentDefenseIdx] : null;
      if (player.id === speakerId) return { transmit: true };
      return { transmit: false, reason: 'Only the defending player may speak.' };
    }
    case 'final_words':
      if (player.id === room.deathSpeakerId) return { transmit: true };
      return { transmit: false, reason: 'Final words — only the eliminated player may speak.' };
    case 'day':
      if (silentDay) return { transmit: false, reason: 'Silent Day — voice is disabled today.' };
      return { transmit: true };
    default:
      return { transmit: true }; // lobby / game_over / other → alive may talk
  }
}

// Broadcast the same phase voice rules to LiveKit users. They aren't tracked as
// mesh voice members, so the mesh loop below never reaches them; this pushes the
// per-player force-mute/unmute to every room player NOT on the legacy mesh.
function enforceLiveKitVoiceRules(io: AppServer, room: Room): void {
  const meshPlayerIds = new Set<string>();
  for (const ch of ['room', 'mafia', 'yakuza'] as VoiceChannel[]) {
    for (const m of voiceGetMembers(room.id, ch)) meshPlayerIds.add(m.playerId);
  }
  for (const player of room.players.values()) {
    if (!player.socketId || meshPlayerIds.has(player.id)) continue;
    const d = liveKitMainDecision(room, player);
    if (d.transmit) io.to(player.socketId).emit('voice:force-unmute');
    else io.to(player.socketId).emit('voice:force-mute', { reason: d.reason ?? 'Listen only.' });
  }
}

function enforceVoicePhaseRules(io: AppServer, room: Room): void {
  enforceLiveKitVoiceRules(io, room);
  const { id: roomId, phase } = room;

  if (phase === 'night') {
    // Faction players leave the room channel to join their private faction channel.
    // All other players stay in room channel but are muted until day resumes.
    const roomMembers = [...voiceGetMembers(roomId, 'room')];
    for (const member of roomMembers) {
      const player = room.players.get(member.playerId);
      // Only ALIVE faction players move to their private channel. Dead faction
      // players (and spectators) stay in the room channel as listen-only so
      // they keep hearing — they never join the faction channel, so moving
      // them would strand them with no voice for the rest of the match.
      const isActiveFaction = player?.isAlive && !player?.isSpectator;
      if (isActiveFaction && player?.team === 'mafia') {
        io.to(member.socketId).emit('voice:force-leave', { channel: 'room', reason: 'Use the Mafia channel during night.' });
        const removed = voiceRemoveFromChannel(member.socketId, 'room');
        if (removed) {
          for (const peer of removed.remaining) {
            io.to(peer.socketId).emit('voice:peer-left', { socketId: member.socketId, channel: 'room' });
          }
        }
      } else if (isActiveFaction && player?.team === 'yakuza') {
        io.to(member.socketId).emit('voice:force-leave', { channel: 'room', reason: 'Use the Yakuza channel during night.' });
        const removed = voiceRemoveFromChannel(member.socketId, 'room');
        if (removed) {
          for (const peer of removed.remaining) {
            io.to(peer.socketId).emit('voice:peer-left', { socketId: member.socketId, channel: 'room' });
          }
        }
      } else {
        io.to(member.socketId).emit('voice:force-mute', { reason: 'Voice muted during night phase.' });
      }
    }
    return;
  }

  // Leaving night — clean up any stale private faction channel connections
  forceLeaveVoiceChannel(io, roomId, 'mafia',  'Mafia voice is only available during night.');
  forceLeaveVoiceChannel(io, roomId, 'yakuza', 'Yakuza voice is only available during night.');

  // Silent Day event — mute all active players during day & speech phases
  if ((phase === 'day' || phase === 'speech') && room.activeEvent?.key === 'silent_day') {
    for (const member of voiceGetMembers(roomId, 'room')) {
      const player = room.players.get(member.playerId);
      if (player?.isAlive && !player?.isSpectator) {
        io.to(member.socketId).emit('voice:force-mute', { reason: 'Silent Day — voice is disabled today.' });
      } else {
        io.to(member.socketId).emit('voice:force-mute', { reason: 'Listen only.' });
      }
    }
    return;
  }

  if (phase === 'speech') {
    const speakerId = room.speechOrder[room.currentSpeakerIdx] ?? null;
    const foulPlayerId = (room.activeFoul && Date.now() < room.activeFoul.endsAt)
      ? room.activeFoul.playerId
      : null;
    for (const member of voiceGetMembers(roomId, 'room')) {
      const player = room.players.get(member.playerId);
      if (!player?.isAlive || player?.isSpectator) {
        io.to(member.socketId).emit('voice:force-mute', { reason: 'Listen only.' });
      } else if (member.playerId === speakerId || member.playerId === foulPlayerId) {
        io.to(member.socketId).emit('voice:force-unmute');
      } else {
        io.to(member.socketId).emit('voice:force-mute', { reason: 'Only the current speaker may transmit.' });
      }
    }
    return;
  }

  if (phase === 'trial_defense') {
    const tds = room.trialDefenseState;
    const candidateId = tds ? tds.candidateIds[tds.currentCandidateIdx] : null;
    for (const member of voiceGetMembers(roomId, 'room')) {
      const player = room.players.get(member.playerId);
      if (!player?.isAlive || player?.isSpectator) {
        io.to(member.socketId).emit('voice:force-mute', { reason: 'Listen only.' });
      } else if (member.playerId === candidateId) {
        io.to(member.socketId).emit('voice:force-unmute');
      } else {
        io.to(member.socketId).emit('voice:force-mute', { reason: 'Only the defense candidate may speak.' });
      }
    }
    return;
  }

  if (phase === 'voting') {
    // All players silent during voting — no voice chat allowed
    for (const member of voiceGetMembers(roomId, 'room')) {
      io.to(member.socketId).emit('voice:force-mute', { reason: 'Silent during voting.' });
    }
    return;
  }

  // ── Don Mode exclusive phases ──────────────────────────────────────
  if (phase === 'planning_night') {
    for (const member of voiceGetMembers(roomId, 'room')) {
      const player = room.players.get(member.playerId);
      if (player?.team === 'mafia') {
        io.to(member.socketId).emit('voice:force-unmute');
      } else {
        io.to(member.socketId).emit('voice:force-mute', { reason: 'Planning Night — Mafia team is planning.' });
      }
    }
    return;
  }

  if (phase === 'tie_defense') {
    const dms = room.donModeState;
    const speakerId = dms ? dms.defenseQueue[dms.currentDefenseIdx] : null;
    for (const member of voiceGetMembers(roomId, 'room')) {
      if (member.playerId === speakerId) {
        io.to(member.socketId).emit('voice:force-unmute');
      } else {
        io.to(member.socketId).emit('voice:force-mute', { reason: 'Only the defending player may speak.' });
      }
    }
    return;
  }

  if (phase === 'don_check' || phase === 'mafia_kill' || phase === 'sheriff_check' || phase === 'revote' || phase === 'double_elim_vote') {
    for (const member of voiceGetMembers(roomId, 'room')) {
      io.to(member.socketId).emit('voice:force-mute', { reason: 'Silent phase.' });
    }
    return;
  }

  if (phase === 'final_words') {
    const speakerId = room.deathSpeakerId;
    for (const member of voiceGetMembers(roomId, 'room')) {
      if (member.playerId === speakerId) {
        io.to(member.socketId).emit('voice:force-unmute');
      } else {
        io.to(member.socketId).emit('voice:force-mute', { reason: 'Final words — only the eliminated player may speak.' });
      }
    }
    return;
  }

  // role_reveal — mute everyone while roles are being shown
  if (phase === 'role_reveal') {
    for (const member of voiceGetMembers(roomId, 'room')) {
      io.to(member.socketId).emit('voice:force-mute', { reason: 'Voice disabled during role reveal.' });
    }
    return;
  }

  // day, lobby, game_over — lift force mutes for alive players only
  for (const member of voiceGetMembers(roomId, 'room')) {
    const player = room.players.get(member.playerId);
    if (player?.isAlive && !player?.isSpectator) {
      io.to(member.socketId).emit('voice:force-unmute');
    } else {
      // Dead players and spectators remain listen-only
      io.to(member.socketId).emit('voice:force-mute', { reason: 'Listen only.' });
    }
  }
}
