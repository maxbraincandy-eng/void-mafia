import { z } from 'zod';
import { randomUUID } from 'crypto';
import { ok, err, } from './types/index.js';
import { createRoom, getRoom, getRoomByCode, deleteRoom, addPlayer, addSpectatorPlayer, removePlayer, getPlayerBySocket, toPublicRoom, getHostPlayer, toRoomListItem, getAllRooms, getPlayerByProfile, transferHost, rematchRoom, setPlayerAvatarUrl, enqueueForNextRound, dequeueFromNextRound, promoteQueuedPlayers, } from './services/roomService.js';
import { startGame, setPhase, advancePhase, submitNightAction, submitVote, submitNomination, checkWin, buildGameOverResult, allNightActionsSubmitted, getInvestigationResult, getTrackResult, resolveVotes, submitDonCheck, submitMafiaKillVote, submitDoubleEliminationVote, allMafiaKillVotesSubmitted, allDoubleElimVotesSubmitted, } from './services/gameService.js';
import { createPlayerMessage, createSystemMessage, addMessage, validateChat, } from './services/chatService.js';
import { registerCheckersHandlers, handleCheckersDisconnect } from './checkers.js';
import { registerJokerHandlers, handleJokerDisconnect } from './joker.js';
import { registerLudoHandlers, handleLudoDisconnect } from './ludo.js';
import { registerWWWHandlers, handleWWWDisconnect } from './www.js';
import { registerUnoHandlers, handleUnoDisconnect } from './uno.js';
import { timerService } from './services/timerService.js';
import { getRole } from './services/roleService.js';
import { getOrCreatePlayer, getPlayer, toPublicProfile, addGameResult, getActiveBan, getActiveMute, findSocketByProfile, registerWithEmail, authenticateWithEmail, addXP, getCosmetics, equipCosmetic, getNameColors, grantStarterCosmetics, getLeaderboard, getPlayerByFriendCode, setGrantedModLevel, updateAvatarUrl, updateUsername, } from './services/playerService.js';
import { markOnline, markOffline, sendFriendRequest, acceptFriend, declineFriend, removeFriend, getFriends, getInvitablePeople, getPendingRequests, getOnlineCount, getFriendshipStatus, isOnline, getSpectatingCount, setLoungePresence, clearLoungePresence, getFriendIds, } from './services/friendService.js';
import { checkAndAwardChallenges, getDailyQuestsForPlayer, } from './services/challengeService.js';
import { checkAchievements, getPlayerAchievements } from './services/achievementService.js';
import { recordGame, getPlayerHistory, getPlayerRoleStats, getPlayersLastRolesInRoom } from './services/gameHistoryService.js';
import { createClan, getClan, getClanByPlayer, getClanMembershipByPlayer, getAllClans, getClanMembers, joinClan, leaveClan, setClanMemberRole, addClanModLog, getClanModLogs, setClanImage, } from './services/clanService.js';
import { challengeClan, acceptWar, declineWar, recordWarGame, getActiveWar, getWarHistory, } from './services/clanWarService.js';
import { canDo, banPlayer, unbanPlayer, mutePlayer, unmutePlayer, warnPlayer, createReport, getReports, resolveReport, getLogs, getModPlayers, getBannedPlayers, logKick, addModNote, freezeAccount, unfreezeAccount, renamePlayer, getPlayerDetail, assignReport, getDashboardDbStats, addModLog, } from './services/moderationService.js';
import { canJoin as voiceCanJoin, canTransmitVoice, join as voiceJoin, leave as voiceLeave, getMembers as voiceGetMembers, getSharedChannel as voiceGetSharedChannel, removeFromChannel as voiceRemoveFromChannel, } from './services/voiceService.js';
import { sql } from './db.js';
import bcrypt from 'bcryptjs';
import { sendPushToUser } from './pushService.js';
import { getOrCreateConversation, listConversations, sendMessage, sendVoiceDm, getMessages, markRead, getTotalUnread, } from './services/dmService.js';
import { getCoins, claimDailyReward, grantCoins, deductCoins, refundGift, getTransactions, getAllTransactions, getGiftCatalog, createGift, updateGift, sendGift, getPlayerGifts, getGiftDetail, getGiftsSent, getGiftTimeline, getGiftStats, getPinnedGifts, pinGift, unpinGift, hideGift, unhideGift, getHiddenGifts, purchaseCosmeticItem, } from './services/coinService.js';
import { applyReferral, getReferralCount } from './services/referralService.js';
import { updateRatingsAfterGame, getPlayerRating, getRankedLeaderboard, getRankTier } from './services/ratingService.js';
import { getActiveSeason, getSeasonLeaderboard, getMySeasonHistory } from './services/seasonService.js';
import { startReplay, recordEvent, finishReplay, listReplays, getReplay, getMyReplays, } from './services/replayService.js';
import { listNews, createNews, deleteNews, listRecommends, createRecommend, deleteRecommend, listThoughts, createThought, deleteThought, listFeed, createPost, deletePost, toggleLike, getComments, addComment, deleteComment, reportPost, listCommunityReports, resolveCommunityReport, follow, unfollow, listEvents, createEvent, joinEvent, leaveEvent, createNotification, notifyAllPlayers, listNotifications, getUnreadNotificationCount, markNotificationsRead, listLoungeRows, getLoungeRow, rowToLounge, createLounge, deleteLounge, setLoungeLive, communityBanPlayer, communityUnbanPlayer, getActiveCommunityBan, updateCommunityProfile, getCommunityProfileV2, assignBadge, revokeBadge, setShowcaseAchievement, clearShowcaseSlot, getPrivacySettings, setPrivacySettings, createPostV2, listFeedV2, getUserPosts, votePoll, togglePostSave, getSavedPosts, pinPost, featurePost, hidePost, logCommunityModAction, getCommunityModLogs, listPeopleDirectory, getFollowersList, getFollowingList, searchCommunity, upsertOnlineSeen, getOnlineMembers, generateAnonymousName, togglePostReaction, getWeeklyLeaderboard, } from './services/communityService.js';
import { listDebates, getDebateFull, createDebate, joinDebate, postArgument, voteDebate, closeDebate, startDebate, advancePhase as advanceDebatePhase, skipPhase, raiseHand, lowerHand, getRaisedHands, promoteSpeaker, PHASE_DURATION_SECONDS, } from './services/debateService.js';
import { voiceJoin as debateVoiceJoin, voiceLeave as debateVoiceLeave } from './services/debateVoiceService.js';
import { recordActivity, getFriendActivityFeed } from './services/activityService.js';
import { adminSearchUser, adminGetUserProfile, issueWarning, suspendUser, liftSuspension, muteUser, unmuteUser, setProfileControls, adminDeletePost, adminRestorePost, adminDeleteComment, adminRestoreComment, adminDeleteDebate, adminRestoreDebate, adminSetDebateFlags, listAllReports, listDeletedContent, getAdminAuditLogs, } from './services/adminService.js';
import { join as loungeJoin, leave as loungeLeave, getMembers as loungeGetMembers, getMemberByPlayerId as loungeGetMemberByPlayerId, setRole as loungeSetRole, setHandRaised as loungeSetHandRaised, removeMember as loungeRemoveMember, getCounts as loungeGetCounts, } from './services/loungeVoiceService.js';
// ── TURN / ICE server config ──────────────────────────────────────────
// Centralised in server/src/lib/iceConfig.ts.  Reads Railway env vars:
// TURN_URL, TURN_USERNAME, TURN_CREDENTIAL, FORCE_TURN_RELAY, STUN_URL.
import { buildIceConfig } from './lib/iceConfig.js';
// ── Rate limiting ─────────────────────────────────────────────────────
const rateLimits = new Map();
function rateOk(socketId, limit = 15) {
    const now = Date.now();
    const r = rateLimits.get(socketId);
    if (!r || now > r.resetAt) {
        rateLimits.set(socketId, { count: 1, resetAt: now + 1000 });
        return true;
    }
    if (r.count >= limit)
        return false;
    r.count++;
    return true;
}
// ── Chat spam / flood protection ──────────────────────────────────────
const chatCooldowns = new Map(); // key → lastMessageAt
const chatWindows = new Map(); // key → recent timestamps
const lastChatMsg = new Map(); // key → last message text
const CHAT_COOLDOWN_MS = 1200;
const CHAT_FLOOD_WINDOW_MS = 4000;
const CHAT_FLOOD_LIMIT = 5;
function chatRateOk(key, text) {
    const now = Date.now();
    const last = chatCooldowns.get(key);
    if (last && now - last < CHAT_COOLDOWN_MS)
        return { ok: false, error: 'ძალიან სწრაფად აგზავნი შეტყობინებებს.' };
    if (lastChatMsg.get(key) === text.trim())
        return { ok: false, error: 'არ გაიმეორო ერთი და იგივე შეტყობინება.' };
    const window = (chatWindows.get(key) ?? []).filter(t => now - t < CHAT_FLOOD_WINDOW_MS);
    if (window.length >= CHAT_FLOOD_LIMIT)
        return { ok: false, error: 'ზედმეტი შეტყობინება. ცოტა გაჩერდი.' };
    window.push(now);
    chatCooldowns.set(key, now);
    chatWindows.set(key, window);
    lastChatMsg.set(key, text.trim());
    return { ok: true };
}
// ── Session concurrency (one active socket per profile) ───────────────
const activeSessions = new Map(); // profileId → socketId
function enforceSessionUniqueness(io, profileId, newSocketId) {
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
const reportCooldowns = new Map();
// key: reporterId → timestamps of last 10min reports
const reportWindows = new Map();
function reportRateOk(reporterId, targetId, reason) {
    const now = Date.now();
    const cooldownKey = `${reporterId}:${targetId}:${reason}`;
    const lastReport = reportCooldowns.get(cooldownKey);
    if (lastReport && now - lastReport < 60000) {
        return { ok: false, error: 'Please wait before reporting the same player for the same reason.' };
    }
    const windowKey = reporterId;
    const window = (reportWindows.get(windowKey) ?? []).filter(t => now - t < 600000);
    if (window.length >= 5) {
        return { ok: false, error: 'You are reporting too frequently. Please wait a few minutes.' };
    }
    reportCooldowns.set(cooldownKey, now);
    window.push(now);
    reportWindows.set(windowKey, window);
    return { ok: true };
}
// ── Debate phase timers ───────────────────────────────────────────────
const debatePhaseTimers = new Map();
function scheduleDebatePhaseAdvance(io, debateId, durationSeconds) {
    const existing = debatePhaseTimers.get(debateId);
    if (existing)
        clearTimeout(existing);
    if (durationSeconds <= 0)
        return;
    const t = setTimeout(async () => {
        debatePhaseTimers.delete(debateId);
        try {
            const updated = await advanceDebatePhase(debateId);
            io.to(`debate:${debateId}`).emit('debate:phase_update', updated);
            const nextDur = PHASE_DURATION_SECONDS[updated.phase] ?? 0;
            if (nextDur > 0)
                scheduleDebatePhaseAdvance(io, debateId, nextDur);
        }
        catch { }
    }, durationSeconds * 1000);
    debatePhaseTimers.set(debateId, t);
}
// ── Maintenance mode ─────────────────────────────────────────────────
let maintenanceMode = false;
// ── Lobby auto-start timers ───────────────────────────────────────────
const autoStartTimers = new Map();
function cancelAutoStart(roomId) {
    const t = autoStartTimers.get(roomId);
    if (t) {
        clearTimeout(t);
        autoStartTimers.delete(roomId);
    }
}
// ── Spectate queues (roomId → socketIds waiting) ──────────────────────
const spectateQueues = new Map();
// ── Host disconnect grace period (roomId → reconnect data) ────────────
const HOST_GRACE_MS = 30000; // extended to 30s to cover slower reconnects
const hostGraceTimers = new Map();
// ── Lobby disconnect grace period (playerId → cleanup timer) ──────────
// Non-host players who disconnect in the lobby get 60s to reconnect before
// their slot is freed. This is the same pattern used during active games.
const LOBBY_GRACE_MS = 60000;
const lobbyGraceTimers = new Map();
const _lobbyChat = [];
const MAX_LOBBY_CHAT = 200;
const _clanChat = new Map(); // clanId → messages
const MAX_CLAN_CHAT = 200;
const SPACE_MAX_HP = 10;
const _spaceHitAt = new Map(); // attackerSocketId → last hit ms (cooldown)
const _spaces = new Map();
const _spaceDJ = new Map();
const _spaceTV = new Map();
const _spaceVoice = new Map(); // spaceId → Map<socketId, playerName>
const _spaceMeta = new Map();
// Seed the always-on public lounge.
_spaceMeta.set('main', {
    id: 'main', name: 'Void Lounge', icon: '🌌', theme: 'void', layout: 'penthouse',
    maxPlayers: 50, isPublic: true, ownerId: null, ownerName: 'Void Mafia',
    code: 'VOIDLOUNGE', createdAt: Date.now(), persistent: true,
});
const SPACE_THEMES = ['void', 'neon', 'cyber', 'sunset', 'mono', 'blood', 'gold'];
const SPACE_LAYOUTS = ['lounge', 'home', 'penthouse'];
const SPACE_ICONS = ['🌌', '🎮', '🎬', '🎧', '🔥', '💎', '🛸', '🌃', '⚡', '🃏', '👾', '🎲'];
function _genSpaceCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
    const pick = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    let code = '';
    do {
        code = `${pick(4)}-${pick(4)}`;
    } while ([..._spaceMeta.values()].some(m => m.code === code));
    return code;
}
function _findSpaceByCode(code) {
    const norm = code.trim().toUpperCase().replace(/\s/g, '');
    for (const m of _spaceMeta.values()) {
        if (m.code.toUpperCase() === norm || m.id.toUpperCase() === norm)
            return m;
    }
    return null;
}
function _spaceOnlineCount(spaceId) {
    return _spaces.get(spaceId)?.size ?? 0;
}
function _spaceOfSocket(socketId) {
    for (const [spaceId, room] of _spaces)
        if (room.has(socketId))
            return spaceId;
    return null;
}
function _canControlTv(spaceId, profileId) {
    const meta = _spaceMeta.get(spaceId);
    if (!meta)
        return false;
    // Owned spaces: only the owner. Ownerless public lounges (main): anyone present.
    return !meta.ownerId || meta.ownerId === profileId;
}
function _publicSpaceMeta(m, online) {
    return {
        id: m.id, name: m.name, icon: m.icon, theme: m.theme, layout: m.layout,
        maxPlayers: m.maxPlayers, isPublic: m.isPublic,
        ownerName: m.ownerName, code: m.code, online, persistent: m.persistent,
    };
}
// Lazily seed a persistent, members-only lounge space for a clan.
function _ensureClanSpace(clanId, clanName) {
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
async function _ownsSpaceTheme(profileId, theme) {
    if (theme === 'void')
        return true;
    if (!profileId)
        return false;
    try {
        const c = await getCosmetics(profileId);
        return c.unlockedItems.includes(`sp_theme_${theme}`);
    }
    catch {
        return false;
    }
}
function _leaveSpace(sid, io) {
    for (const [spaceId, room] of _spaces) {
        if (room.has(sid)) {
            const pid = room.get(sid)?.profileId;
            if (pid)
                clearLoungePresence(pid);
            room.delete(sid);
            io.to(`space:${spaceId}`).emit('space:player-left', { socketId: sid });
            if (room.size === 0) {
                _spaces.delete(spaceId);
                _spaceDJ.delete(spaceId);
                _spaceTV.delete(spaceId);
                // Tear down user-created spaces when empty; keep seeded lounges alive.
                const meta = _spaceMeta.get(spaceId);
                if (meta && !meta.persistent)
                    _spaceMeta.delete(spaceId);
            }
            return;
        }
    }
}
function _leaveSpaceVoice(sid, io) {
    for (const [spaceId, voices] of _spaceVoice) {
        if (voices.has(sid)) {
            voices.delete(sid);
            io.to(`space:${spaceId}`).emit('space:voice-peer-left', { socketId: sid });
            if (voices.size === 0)
                _spaceVoice.delete(spaceId);
            return;
        }
    }
}
function clearLobbyGrace(playerId) {
    const entry = lobbyGraceTimers.get(playerId);
    if (entry) {
        clearTimeout(entry.timer);
        lobbyGraceTimers.delete(playerId);
    }
}
// ── Role-specific death messages ──────────────────────────────────────
const NIGHT_DEATH = {
    sheriff: 'The badge falls silent. The town lost its protector.',
    doctor: 'The healer is gone. No one is safe tonight.',
    bodyguard: 'The guardian fell in the line of duty.',
    don: 'The Don has fallen — but who will take the throne?',
    cult_leader: 'The Cult Leader is dead. The cult crumbles.',
    veteran: 'The Veteran fought to the last.',
    mayor: 'The Mayor is gone. The town is leaderless.',
    vigilante: 'The Vigilante fires no more.',
    spy: "The Spy's final report goes unread.",
    escort: 'The Escort danced her last.',
    tracker: "The Tracker's trail goes cold.",
    arsonist: 'The Arsonist burns out.',
    yakuza: 'The Yakuza enforcer falls. The clan is weakened.',
    shogun: 'A hidden blade is revealed too late.',
};
const VOTE_DEATH = {
    jester: '🃏 The Jester laughs from beyond the grave.',
    sheriff: '⚖️ The town voted out one of their own. The badge was real.',
    doctor: '⚖️ The healer is exiled. The town will regret this.',
    mafia: '⚖️ Justice is served. A killer leaves the shadows.',
    don: '⚖️ The Godfather is dethroned by his own people.',
    cult_leader: '⚖️ The Cult Leader is exposed and cast out.',
    maniac: '⚖️ The Maniac smiles. You voted out a madman.',
    arsonist: '⚖️ The Arsonist is extinguished.',
    yakuza: '⚖️ The Yakuza enforcer is unmasked and cast out.',
    shogun: '⚖️ A hidden ally is exposed. The Yakuza loses its shadow.',
};
function nightDeathMsg(name, role, lastWill) {
    const flavour = role ? NIGHT_DEATH[role] : null;
    let msg = flavour
        ? `Dawn breaks. ${name} was found dead.\n${flavour}`
        : `Dawn breaks. ${name} was found dead.`;
    if (lastWill)
        msg += `\n📜 Last Will: "${lastWill}"`;
    return msg;
}
function voteDeathMsg(name, role, lastWill) {
    const flavour = role ? VOTE_DEATH[role] : null;
    let msg = flavour
        ? `${name} was eliminated by vote.\n${flavour}`
        : `${name} was eliminated by vote.`;
    if (lastWill)
        msg += `\n📜 Last Will: "${lastWill}"`;
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
    channel: z.enum(['room', 'mafia', 'dead', 'spectator']),
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
        'cheating', 'offensive_language', 'voice_abuse', 'spamming',
        'inappropriate_nickname', 'harassment', 'game_sabotage', 'bug_abuse', 'other',
        'hate_speech', 'inappropriate_chat', 'toxic_behavior',
    ]),
    details: z.string().max(500).default(''),
});
// ── Smart presence notifications ──────────────────────────────────────
// Tell a player's friends when they start something worth joining (created a
// Mafia room, entered a Lounge). Online friends get a real-time toast; offline
// friends get a push. Rate-limited per actor so it can't spam.
const _activeNotifyAt = new Map();
async function notifyFriendsActive(io, actorId, payload) {
    try {
        const now = Date.now();
        if (now - (_activeNotifyAt.get(actorId) ?? 0) < 5 * 60000)
            return; // ≤1 ping / 5 min
        _activeNotifyAt.set(actorId, now);
        const friendIds = await getFriendIds(actorId);
        if (!friendIds.length)
            return;
        const title = payload.kind === 'lounge' ? '🎬 Lounge' : '🎮 Mafia';
        const body = payload.kind === 'lounge'
            ? `${payload.fromName} ახლა ${payload.label}-შია`
            : `${payload.fromName}-მა შექმნა ოთახი`;
        for (const fid of friendIds) {
            const sock = findSocketByProfile(io, fid);
            if (sock)
                sock.emit('presence:friend_active', { ...payload, fromId: actorId });
            else
                sendPushToUser(fid, { title, body }).catch(() => { });
        }
    }
    catch { /* best-effort */ }
}
// ── Helpers ───────────────────────────────────────────────────────────
function broadcastRoom(io, room) {
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
function broadcastQueueUpdated(io, room) {
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
        deathType: null,
        foulCount: 0,
    }));
    io.to(room.id).emit('queue:updated', { nextRoundQueue });
    // Also to queued players
    for (const p of room.nextRoundQueue) {
        if (p.socketId)
            io.to(p.socketId).emit('queue:updated', { nextRoundQueue });
    }
}
function broadcastOnlineCount(io) {
    io.emit('online:count', { count: getOnlineCount() });
}
// ── Community Hub helpers (separate from Mafia game logic) ─────────────
async function requireOwnerLevel(profileId) {
    if (!profileId)
        throw new Error('Not authenticated.');
    const requester = await getPlayer(profileId);
    if (!requester || requester.moderatorLevel !== 'owner')
        throw new Error('Owner only.');
}
async function requireNotCommunityBanned(profileId) {
    const ban = await getActiveCommunityBan(profileId);
    if (ban)
        throw new Error(`You are banned from the Community Hub: ${ban.reason}`);
}
async function broadcastLoungeState(io, loungeId) {
    const row = await getLoungeRow(loungeId);
    if (!row)
        return;
    const { listenerCount, speakerCount } = loungeGetCounts(loungeId);
    io.emit('community:lounge_update', rowToLounge(row, listenerCount, speakerCount));
}
function handleLoungeLeave(io, socket) {
    const loungeId = socket.data.loungeId;
    if (!loungeId)
        return;
    socket.data.loungeId = null;
    socket.leave(`lounge:${loungeId}`);
    const removed = loungeLeave(socket.id);
    for (const { loungeId: lid, remaining } of removed) {
        for (const peer of remaining) {
            io.to(peer.socketId).emit('lounge:peer-left', { socketId: socket.id });
        }
        const { listenerCount, speakerCount } = loungeGetCounts(lid);
        getLoungeRow(lid).then(async (row) => {
            if (!row)
                return;
            // Auto-delete user-created lounges when the owner leaves
            if (row.kind === 'lounge' && row.owner_id === socket.data.profileId) {
                for (const m of remaining) {
                    io.to(m.socketId).emit('lounge:kicked');
                }
                try {
                    await sql `DELETE FROM community_lounges WHERE id = ${lid}`;
                }
                catch { }
                io.emit('community:lounge_removed', { loungeId: lid });
            }
            else {
                io.emit('community:lounge_update', rowToLounge(row, listenerCount, speakerCount));
            }
        });
    }
}
function startPhaseTimer(io, room) {
    timerService.stop(room.id);
    if (!room.timer || room.timer <= 0)
        return;
    timerService.start(room.id, room.timer, (remaining) => {
        room.timer = remaining;
        io.to(room.id).emit('room:timer', remaining);
    }, async () => {
        room.timer = 0;
        const wasNight = room.phase === 'night';
        const wasSpeech = room.phase === 'speech';
        const wasMafiaKill = room.phase === 'mafia_kill';
        const wasDonCheck = room.phase === 'don_check';
        const wasDoubleElimVote = room.phase === 'double_elim_vote';
        if (room.phase === 'voting' || room.phase === 'revote')
            announceVoteResult(io, room);
        advancePhase(room);
        const nextPhase = room.phase;
        // ── Replay: record phase change ──────────────────────────────────
        if (nextPhase !== 'game_over') {
            recordEvent(room.id, { t: Date.now() - room.startedAt, type: 'phase_change', data: { phase: nextPhase, round: room.day } });
        }
        if (wasNight || wasMafiaKill) {
            announceNightResult(io, room);
            notifySpies(io, room);
            notifyTrackers(io, room);
            notifyCultConversions(io, room);
            notifyRoleblocked(io, room);
        }
        if (wasSpeech && nextPhase !== 'speech')
            announceSpeechEnd(io, room, nextPhase);
        if (wasDonCheck)
            broadcastSystemMsg(io, room, 'Don has completed the night check. Mafia selecting target...');
        if (wasDoubleElimVote) {
            const dm = room.donModeState;
            if (dm) {
                const yes = Object.values(dm.doubleEliminationVotes).filter(v => v).length;
                const no = Object.values(dm.doubleEliminationVotes).filter(v => !v).length;
                if (yes > no)
                    broadcastSystemMsg(io, room, '⚖️ გადაწყვეტილება: ორივე მოთამაშე გაძევებულია.');
                else
                    broadcastSystemMsg(io, room, '⚖️ გადაწყვეტილება: ორივე მოთამაშე რჩება.');
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
        if (nextPhase === 'night') {
            io.to(room.id).emit('game:notification', { title: 'Night Falls', body: 'Perform your night action.' });
            // Push offline players
            for (const p of room.players.values()) {
                if (!p.socketId && p.profileId && p.isAlive && !p.isSpectator) {
                    sendPushToUser(p.profileId, { title: '🌙 Night Falls', body: 'Return to the game — night action awaits.' }).catch(() => { });
                }
            }
        }
        if (nextPhase === 'voting') {
            // Push offline players
            for (const p of room.players.values()) {
                if (!p.socketId && p.profileId && p.isAlive && !p.isSpectator) {
                    sendPushToUser(p.profileId, { title: '⚖️ Voting Has Begun', body: 'Cast your vote now!' }).catch(() => { });
                }
            }
        }
        // Notify the next speaker if they're offline
        if (nextPhase === 'speech' && room.speechOrder) {
            const speakerId = room.speechOrder[room.currentSpeakerIdx ?? 0];
            const speaker = speakerId ? room.players.get(speakerId) : null;
            if (speaker && !speaker.socketId && speaker.profileId) {
                sendPushToUser(speaker.profileId, { title: '🎙️ Your Turn to Speak', body: 'Come back — it is your turn!' }).catch(() => { });
            }
        }
        announceActiveEvent(io, room);
        if (nextPhase === 'game_over')
            await emitGameOver(io, room);
        broadcastRoom(io, room);
        enforceVoicePhaseRules(io, room);
        if (room.phase !== 'game_over')
            startPhaseTimer(io, room);
    });
}
function broadcastSystemMsg(io, room, text) {
    const msg = createSystemMessage(text);
    addMessage(room, msg);
    io.to(room.id).emit('chat:new', msg);
}
function announceActiveEvent(io, room) {
    if (!room.activeEvent)
        return;
    const { icon, label, description } = room.activeEvent;
    broadcastSystemMsg(io, room, `${icon} ${label} — ${description}`);
    io.to(room.id).emit('game:notification', { title: label, body: description });
}
function getPlayerOrError(socket, room) {
    const player = getPlayerBySocket(room, socket.id);
    if (!player)
        throw new Error('Player not found in room.');
    return player;
}
function getRoomFromSocket(socket) {
    const roomId = socket.data.roomId;
    if (!roomId)
        throw new Error('You are not in a room.');
    const room = getRoom(roomId);
    if (!room)
        throw new Error('Room not found.');
    return room;
}
async function emitGameOver(io, room) {
    const result = buildGameOverResult(room);
    // Record persistent game history
    try {
        await recordGame(room);
    }
    catch { /* non-fatal */ }
    // Release all voice mutes and reset voice state so players can freely talk after the game
    io.to(room.id).emit('voice:force-unmute');
    io.to(room.id).emit('voice:reset');
    // Emit spec:game_over with role reveals to spectators (safe — game is over)
    const roleReveals = {};
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
        if (p.socketId)
            io.to(p.socketId).emit('game:over', result);
        else if (p.profileId && !p.isSpectator) {
            const won = room.winner && p.team === room.winner;
            sendPushToUser(p.profileId, {
                title: won ? '🏆 You Won!' : '💀 Game Over',
                body: room.winner ? `${room.winner.charAt(0).toUpperCase() + room.winner.slice(1)} wins the game!` : 'The game has ended.',
            }).catch(() => { });
        }
        if (p.profileId && room.winner) {
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
            }
            catch { /* non-fatal */ }
            // Check and award achievements
            try {
                const newKeys = await checkAchievements(room, p.id);
                if (newKeys.length > 0 && p.socketId) {
                    const allAchs = await getPlayerAchievements(p.profileId);
                    const earned = allAchs.filter(a => newKeys.includes(a.key));
                    io.to(p.socketId).emit('achievement:earned', { achievements: earned });
                }
            }
            catch { /* non-fatal */ }
        }
    }
    // Ranked ELO update
    if (room.settings.ranked && room.winner) {
        try {
            const winnerPlayers = [...room.players.values()].filter(p => !p.isSpectator && p.team === room.winner && p.profileId);
            const loserPlayers = [...room.players.values()].filter(p => !p.isSpectator && p.team !== room.winner && p.profileId);
            const winnerIds = winnerPlayers.map(p => p.profileId);
            const loserIds = loserPlayers.map(p => p.profileId);
            const roleMap = {};
            for (const p of room.players.values()) {
                if (p.profileId && p.role)
                    roleMap[p.profileId] = p.role;
            }
            const eloResults = await updateRatingsAfterGame(winnerIds, loserIds, room.id, room.winner, roleMap);
            for (const [profileId, res] of eloResults) {
                const ratingRow = await getPlayerRating(profileId);
                const tier = ratingRow ? getRankTier(ratingRow.elo, ratingRow.isPlaced) : 'unranked';
                const playerSock = findSocketByProfile(io, profileId);
                if (playerSock) {
                    playerSock.emit('rated:elo_update', { eloChange: res.change, newElo: res.after, tier });
                }
            }
        }
        catch { /* non-fatal */ }
    }
    // ── Clan War game recording ───────────────────────────────────────────
    // If this room belongs to a clan and there's a winner, try to record the result
    // in any active war between the hosting clan and the opponent clan.
    if (room.clanId && room.winner) {
        try {
            // Collect profile IDs of players on the winning team
            const winningProfileIds = [...room.players.values()]
                .filter(p => !p.isSpectator && p.team === room.winner && p.profileId)
                .map(p => p.profileId);
            // Find which clans those winners belong to (including the room's own clan)
            const winnerClanIds = new Set();
            for (const pid of winningProfileIds) {
                const membership = await getClanMembershipByPlayer(pid).catch(() => null);
                if (membership)
                    winnerClanIds.add(membership.id);
            }
            // Only count the win if ALL winners are from one distinct clan
            if (winnerClanIds.size === 1) {
                const winnerClanId = [...winnerClanIds][0];
                // Find the other clan: gather all loser profile IDs
                const loserProfileIds = [...room.players.values()]
                    .filter(p => !p.isSpectator && p.team !== room.winner && p.profileId)
                    .map(p => p.profileId);
                const loserClanIds = new Set();
                for (const pid of loserProfileIds) {
                    const membership = await getClanMembershipByPlayer(pid).catch(() => null);
                    if (membership)
                        loserClanIds.add(membership.id);
                }
                if (loserClanIds.size === 1) {
                    const loserClanId = [...loserClanIds][0];
                    const updatedWar = await recordWarGame(room.id, winnerClanId, loserClanId).catch(() => null);
                    if (updatedWar) {
                        // Notify members of both clans
                        const eventName = updatedWar.status === 'completed' ? 'clan:war_ended' : 'clan:war_started';
                        for (const [, sock] of io.sockets.sockets) {
                            const sid = sock.data.profileId;
                            if (!sid)
                                continue;
                            const m = await getClanMembershipByPlayer(sid).catch(() => null);
                            if (m && (m.id === updatedWar.challengerClanId || m.id === updatedWar.defenderClanId)) {
                                sock.emit(eventName, { war: updatedWar });
                            }
                        }
                    }
                }
            }
        }
        catch { /* non-fatal — war recording never breaks game flow */ }
    }
    // Resolve spectator predictions
    if (room.winner) {
        try {
            const preds = await sql `
        SELECT id, player_id, predicted FROM spectator_predictions
        WHERE room_id = ${room.id} AND correct IS NULL
      `;
            for (const pred of preds) {
                const correct = pred.predicted === room.winner ? 1 : 0;
                const xpEarned = correct ? 50 : 0;
                await sql `
          UPDATE spectator_predictions SET correct = ${correct}, xp_earned = ${xpEarned}
          WHERE id = ${pred.id}
        `;
                if (correct && pred.player_id) {
                    try {
                        await addXP(pred.player_id, xpEarned);
                    }
                    catch { /* non-fatal */ }
                }
                const spectator = [...room.players.values()].find(p => p.profileId === pred.player_id);
                if (spectator?.socketId) {
                    io.to(spectator.socketId).emit('prediction:result', { correct: correct === 1, xpGained: xpEarned, winningTeam: room.winner });
                }
            }
        }
        catch { /* non-fatal */ }
    }
    // ── Replay: save to DB ──────────────────────────────────────────────
    try {
        const endedAt = Date.now();
        recordEvent(room.id, { t: endedAt - room.startedAt, type: 'game_end', data: { winner: room.winner ?? 'draw' } });
        const playerRoles = {};
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
    }
    catch { /* non-fatal */ }
}
async function notifyMods(io, type, message, targetName) {
    const socketsWithProfile = [];
    for (const [, sock] of io.sockets.sockets) {
        const profileId = sock.data.profileId;
        if (profileId)
            socketsWithProfile.push({ sock, profileId });
    }
    await Promise.all(socketsWithProfile.map(async ({ sock, profileId }) => {
        try {
            const profile = await getPlayer(profileId);
            if (profile?.isModerator)
                sock.emit('mod:notification', { type, message, targetName });
        }
        catch { /* ignore per-socket errors */ }
    }));
}
function announceSpeechEnd(io, room, nextPhase) {
    if (nextPhase === 'voting') {
        const names = room.tribunalCandidates
            .map(id => room.players.get(id)?.name ?? '?')
            .join(', ');
        broadcastSystemMsg(io, room, `⚖️ Tribunal begins — nominated: ${names}.`);
    }
    else if (nextPhase === 'night') {
        broadcastSystemMsg(io, room, 'No one was nominated. Night begins.');
    }
}
function announceNightResult(io, room) {
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
    const summary = {
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
                sendPushToUser(p.profileId, { title: '💀 You Were Eliminated', body: 'Come back to watch the rest of the game.' }).catch(() => { });
            }
            // ── Replay: record death ─────────────────────────────────────────
            recordEvent(room.id, {
                t: Date.now() - room.startedAt,
                type: 'death',
                data: { playerId: killed.id, username: killed.name, role: p?.role ?? null, team: p?.team ?? null, cause: 'night_kill', round: room.day },
            });
        }
    }
    else if (room.savedLastNight) {
        broadcastSystemMsg(io, room, 'Dawn breaks. Everyone survived the night.');
    }
    else {
        broadcastSystemMsg(io, room, 'Dawn breaks. The night passed quietly.');
    }
}
function notifyTrackers(io, room) {
    for (const p of room.players.values()) {
        if (p.role === 'tracker' && p.isAlive && p.socketId) {
            const result = getTrackResult(room, p);
            if (result)
                io.to(p.socketId).emit('game:track_result', result);
        }
    }
}
function notifyCultConversions(io, room) {
    for (const cultistId of room.newlyConvertedCultists) {
        const cultist = room.players.get(cultistId);
        if (cultist && cultist.socketId) {
            io.to(cultist.socketId).emit('game:role', { role: getRole('cultist') });
        }
    }
}
function notifyYakuzaAllies(io, room) {
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
function notifySpies(io, room) {
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
function announceVoteResult(io, room) {
    const isAnonymous = room.activeEvent?.key === 'anonymous_voting';
    const isNoReveal = room.activeEvent?.key === 'no_reveal_day';
    // Emit vote breakdown (hidden for anonymous voting)
    if (!isAnonymous) {
        const eventMultiplier = room.activeEvent?.key === 'double_vote' ? 2 : 1;
        const breakdown = [...room.votes.entries()]
            .filter(([, tid]) => tid !== null)
            .map(([vid, tid]) => {
            const voter = room.players.get(vid);
            const target = room.players.get(tid);
            return {
                voterId: vid, voterName: voter?.name ?? '?',
                targetId: tid, targetName: target?.name ?? '?',
                weight: (voter?.role === 'mayor' ? 2 : 1) * eventMultiplier,
            };
        });
        io.to(room.id).emit('game:vote_breakdown', breakdown);
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
    }
    else {
        broadcastSystemMsg(io, room, 'The vote ended in a tie. No one was eliminated.');
    }
}
function notifyRoleblocked(io, room) {
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
export function setDbReady(v) { _dbReady = v; }
// ── Main ──────────────────────────────────────────────────────────────
export function attachSocketHandlers(io) {
    io.on('connection', (socket) => {
        socket.data.playerId = null;
        socket.data.roomId = null;
        socket.data.profileId = null;
        socket.data.loungeId = null;
        // Rate-limit + payload size check on every incoming event
        socket.use(([event, ...args], next) => {
            // Image upload events are exempt — they have their own size checks in their handlers
            const largePayloadEvents = new Set(['player:update_avatar', 'community:post_create_v2', 'community:profile_update', 'clan:update_image']);
            // 4. Payload size limit — reject anything over 16 KB
            const payload = args[0];
            if (!largePayloadEvents.has(event) && payload !== null && payload !== undefined && typeof payload === 'object') {
                try {
                    if (JSON.stringify(payload).length > 16384) {
                        const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
                        if (ack)
                            ack(err('Payload too large.'));
                        return;
                    }
                }
                catch { /* non-serialisable — let Zod reject it */ }
            }
            const authEvents = new Set(['player:auth', 'player:register', 'player:login_email']);
            const limit = authEvents.has(event) ? 3 : 40;
            if (!rateOk(socket.id, limit)) {
                socket.emit('error', { message: 'Too many requests. Slow down.' });
                const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
                if (ack)
                    ack(err('Too many requests. Slow down.'));
                return;
            }
            next();
        });
        // ── Auth ─────────────────────────────────────────────────────────
        socket.on('player:auth', async (data, cb) => {
            if (!_dbReady) {
                cb(err('Server is starting up — please wait a few seconds and try again.'));
                return;
            }
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
                broadcastOnlineCount(io);
                await grantStarterCosmetics(parsed.uid);
                if (parsed.referralCode) {
                    applyReferral(parsed.uid, parsed.referralCode).catch(() => { });
                }
                const freshProfile = await getOrCreatePlayer(parsed.uid, parsed.username);
                socket.emit('player:profile', toPublicProfile(freshProfile));
                cb(ok(toPublicProfile(freshProfile)));
            }
            catch (e) {
                cb(err(e.message ?? 'Auth failed.'));
            }
        });
        // ── Email Register ───────────────────────────────────────────────
        socket.on('player:register', async (data, cb) => {
            try {
                const { email, password, username } = z.object({
                    email: z.string().email().max(200),
                    password: z.string().min(6).max(128),
                    username: z.string().min(2).max(24),
                }).parse(data);
                const profile = await registerWithEmail(email, password, username);
                socket.data.profileId = profile.id;
                enforceSessionUniqueness(io, profile.id, socket.id);
                markOnline(profile.id);
                broadcastOnlineCount(io);
                socket.emit('player:profile', toPublicProfile(profile));
                cb(ok({ uid: profile.id, profile: toPublicProfile(profile) }));
            }
            catch (e) {
                cb(err(e.message ?? 'Registration failed.'));
            }
        });
        // ── Email Login ──────────────────────────────────────────────────
        socket.on('player:login_email', async (data, cb) => {
            try {
                const { email, password } = z.object({
                    email: z.string().email(),
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
                broadcastOnlineCount(io);
                socket.emit('player:profile', toPublicProfile(profile));
                cb(ok({ uid: profile.id, profile: toPublicProfile(profile) }));
            }
            catch (e) {
                cb(err(e.message ?? 'Login failed.'));
            }
        });
        // ── Change Password ──────────────────────────────────────────────
        socket.on('player:change_password', async (data, cb) => {
            try {
                const { uid, currentPassword, newPassword } = z.object({
                    uid: z.string().min(1),
                    currentPassword: z.string().min(1),
                    newPassword: z.string().min(6),
                }).parse(data);
                const rows = await sql `SELECT password_hash, email FROM players WHERE id = ${uid} LIMIT 1`;
                if (!rows[0]) {
                    cb({ ok: false, error: 'Player not found.' });
                    return;
                }
                if (!rows[0].password_hash) {
                    cb({ ok: false, error: 'No password set on this account.' });
                    return;
                }
                const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
                if (!match) {
                    cb({ ok: false, error: 'Current password is incorrect.' });
                    return;
                }
                const newHash = await bcrypt.hash(newPassword, 10);
                await sql `UPDATE players SET password_hash = ${newHash} WHERE id = ${uid}`;
                cb({ ok: true });
            }
            catch (e) {
                cb({ ok: false, error: e.message ?? 'Failed to change password.' });
            }
        });
        // ── Player Stats ─────────────────────────────────────────────────
        socket.on('player:stats', async ({ profileId }, cb) => {
            try {
                const profile = await getPlayer(profileId);
                if (!profile)
                    throw new Error('Player not found.');
                cb(ok(toPublicProfile(profile)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Avatar Upload ────────────────────────────────────────────────
        socket.on('player:update_avatar', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb({ ok: false, error: 'Not authenticated.' });
                    return;
                }
                const { imageData } = data;
                if (!imageData || typeof imageData !== 'string') {
                    cb({ ok: false, error: 'Invalid image data.' });
                    return;
                }
                if (!imageData.startsWith('data:image/')) {
                    cb({ ok: false, error: 'Unsupported image type.' });
                    return;
                }
                // ~6MB base64 limit (profile avatar)
                if (imageData.length > 8000000) {
                    cb({ ok: false, error: 'Image is too large.' });
                    return;
                }
                await updateAvatarUrl(profileId, imageData);
                // Update all rooms this player is in
                const profile = await getPlayer(profileId);
                for (const room of getAllRooms()) {
                    setPlayerAvatarUrl(room, profileId, imageData);
                    broadcastRoom(io, room);
                }
                cb({ ok: true, data: toPublicProfile(profile) });
            }
            catch (e) {
                cb({ ok: false, error: e.message ?? 'Upload failed.' });
            }
        });
        socket.on('player:remove_avatar', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb({ ok: false, error: 'Not authenticated.' });
                    return;
                }
                await updateAvatarUrl(profileId, null);
                const profile = await getPlayer(profileId);
                for (const room of getAllRooms()) {
                    setPlayerAvatarUrl(room, profileId, null);
                    broadcastRoom(io, room);
                }
                cb({ ok: true, data: toPublicProfile(profile) });
            }
            catch (e) {
                cb({ ok: false, error: e.message ?? 'Remove failed.' });
            }
        });
        socket.on('player:update_name', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb({ ok: false, error: 'Not authenticated.' });
                    return;
                }
                const { newName } = data;
                if (!newName || typeof newName !== 'string') {
                    cb({ ok: false, error: 'Invalid name.' });
                    return;
                }
                const trimmed = newName.trim();
                if (trimmed.length < 2 || trimmed.length > 20) {
                    cb({ ok: false, error: 'Name must be 2–20 characters.' });
                    return;
                }
                if (!/^[a-zA-Z0-9ა-ჿ _-]+$/.test(trimmed)) {
                    cb({ ok: false, error: 'Name contains invalid characters.' });
                    return;
                }
                await updateUsername(profileId, trimmed);
                const profile = await getPlayer(profileId);
                if (!profile) {
                    cb({ ok: false, error: 'Profile not found.' });
                    return;
                }
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
            }
            catch (e) {
                cb({ ok: false, error: e.message ?? 'Name change failed.' });
            }
        });
        // ── Report ───────────────────────────────────────────────────────
        socket.on('player:report', async (data, cb) => {
            try {
                const parsed = ReportSchema.parse(data);
                const reporterProfileId = socket.data.profileId;
                if (!reporterProfileId)
                    throw new Error('Not authenticated.');
                if (parsed.targetProfileId === reporterProfileId)
                    throw new Error('You cannot report yourself.');
                const rateCheck = reportRateOk(reporterProfileId, parsed.targetProfileId, parsed.reason);
                if (!rateCheck.ok)
                    throw new Error(rateCheck.error);
                const reporter = await getPlayer(reporterProfileId);
                const reported = await getPlayer(parsed.targetProfileId);
                if (!reporter || !reported)
                    throw new Error('Player not found.');
                const report = await createReport(reporterProfileId, reporter.username, parsed.targetProfileId, reported.username, parsed.roomId, parsed.reason, parsed.details);
                await notifyMods(io, 'new_report', `New report: ${reported.username} — ${parsed.reason}`, reported.username);
                // Auto-flag: if reported player has 3+ open reports in last 24h, alert mods
                const since24h = Date.now() - 86400000;
                const [countRow] = await sql `
          SELECT COUNT(*) as cnt FROM reports
          WHERE reported_id = ${parsed.targetProfileId} AND status = 'open' AND created_at > ${since24h}
        `;
                const recentCount = Number(countRow?.cnt ?? 0);
                if (recentCount >= 3) {
                    await notifyMods(io, 'auto_flag', `⚠️ AUTO-FLAG: ${reported.username} has ${recentCount} open reports in 24h`, reported.username);
                }
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Create Room ─────────────────────────────────────────────────
        socket.on('room:create', async (data, cb) => {
            try {
                const parsed = CreateRoomSchema.parse(data);
                const profileId = socket.data.profileId;
                const ban = profileId ? await getActiveBan(profileId) : null;
                if (ban)
                    throw new Error(`You are banned. Reason: ${ban.reason}`);
                const playerProfile = profileId ? await getPlayer(profileId) : null;
                if (maintenanceMode && !playerProfile?.isModerator)
                    throw new Error('Server is under maintenance. Please try again later.');
                const username = playerProfile?.username ?? parsed.name;
                // If creating a clan room, validate clan membership and get clanId
                let clanId = null;
                if (parsed.clanRoom && profileId) {
                    const clanMembership = await getClanMembershipByPlayer(profileId);
                    if (clanMembership)
                        clanId = clanMembership.id;
                }
                const room = createRoom(socket.id, username, profileId, parsed.settings, clanId, parsed.roomName);
                const hostInRoom = [...room.players.values()][0];
                if (hostInRoom && playerProfile?.avatarUrl)
                    hostInRoom.avatarUrl = playerProfile.avatarUrl;
                socket.join(room.id);
                socket.data.playerId = room.hostId;
                socket.data.roomId = room.id;
                const hostPlayer = room.players.get(room.hostId);
                broadcastSystemMsg(io, room, `${hostPlayer.name} created the room.`);
                cb(ok(toPublicRoom(room, room.hostId)));
                // Ping friends that a joinable room is up (public rooms only).
                if (profileId && !room.settings.isPrivate) {
                    notifyFriendsActive(io, profileId, { kind: 'game', code: room.code, label: 'Mafia', fromName: hostPlayer.name });
                }
            }
            catch (e) {
                cb(err(e.message ?? 'Failed to create room.'));
            }
        });
        // ── Join Room ───────────────────────────────────────────────────
        socket.on('room:join', async (data, cb) => {
            try {
                const parsed = JoinRoomSchema.parse(data);
                const profileId = socket.data.profileId;
                const ban = profileId ? await getActiveBan(profileId) : null;
                if (ban)
                    throw new Error(`You are banned until ${new Date(ban.expiresAt).toLocaleString()}. Reason: ${ban.reason}`);
                if (maintenanceMode) {
                    const joiner = profileId ? await getPlayer(profileId) : null;
                    if (!joiner?.isModerator)
                        throw new Error('Server is under maintenance. Please try again later.');
                }
                const room = getRoomByCode(parsed.code);
                if (!room)
                    throw new Error('Room not found. Check the code and try again.');
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
                    if (parsed.joinMode === 'next_round') {
                        // Join as spectator first, then enqueue
                        const player = addSpectatorPlayer(room, socket.id, username, profileId);
                        if (playerProfile?.avatarUrl)
                            player.avatarUrl = playerProfile.avatarUrl;
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
                        }
                        catch {
                            broadcastSystemMsg(io, room, `${player.name} joined as spectator.`);
                        }
                        broadcastRoom(io, room);
                        cb(ok(toPublicRoom(room, player.id)));
                        return;
                    }
                    else {
                        // spectator mode
                        const player = addSpectatorPlayer(room, socket.id, username, profileId);
                        if (playerProfile?.avatarUrl)
                            player.avatarUrl = playerProfile.avatarUrl;
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
                if (playerProfile?.avatarUrl)
                    player.avatarUrl = playerProfile.avatarUrl;
                if (parsed.isSpectator || parsed.joinMode === 'spectator')
                    player.isSpectator = true;
                if (playerProfile?.isModerator) {
                    player.isModerator = playerProfile.isModerator;
                    player.moderatorLevel = playerProfile.moderatorLevel;
                }
                socket.join(room.id);
                if (player.isSpectator)
                    socket.join(`spec:${room.id}`);
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
                }
                else if (isRejoin) {
                    // Silent reconnect — avoid "X joined" spam on refresh
                    broadcastRoom(io, room);
                    cb(ok(toPublicRoom(room, player.id)));
                    return;
                }
                else {
                    broadcastSystemMsg(io, room, `${player.name} joined the room.`);
                }
                broadcastRoom(io, room);
                cb(ok(toPublicRoom(room, player.id)));
            }
            catch (e) {
                cb(err(e.message ?? 'Failed to join room.'));
            }
        });
        // ── Leave Room ──────────────────────────────────────────────────
        socket.on('room:leave', (cb) => {
            const { roomId, playerId } = socket.data;
            if (roomId && playerId)
                handlePlayerLeave(io, socket, roomId, playerId, true);
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
                        }
                        else {
                            io.to(room.id).emit('lobby:autostart', { secondsLeft: countdown });
                        }
                    }, 1000);
                    cancelAutoStart(room.id);
                    autoStartTimers.set(room.id, tick);
                }
                else {
                    // Cancel auto-start if someone unreadied
                    if (autoStartTimers.has(room.id)) {
                        cancelAutoStart(room.id);
                        io.to(room.id).emit('lobby:autostart', { secondsLeft: -1 }); // cancel signal
                    }
                }
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Kick Player ─────────────────────────────────────────────────
        socket.on('room:kick', ({ playerId }, cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const host = getPlayerOrError(socket, room);
                if (!host.isHost)
                    throw new Error('Only the host can kick players.');
                if (room.phase !== 'lobby')
                    throw new Error('Cannot kick during an active game.');
                const target = room.players.get(playerId);
                if (!target)
                    throw new Error('Player not found.');
                if (target.id === host.id)
                    throw new Error('Cannot kick yourself.');
                if (target.socketId)
                    io.to(target.socketId).emit('kicked', { reason: 'You were removed by the host.' });
                removePlayer(room, playerId);
                broadcastSystemMsg(io, room, `${target.name} was removed from the room.`);
                broadcastRoom(io, room);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Warn Player (host only, announced to room) ───────────────────
        socket.on('room:warn', ({ playerId }, cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const host = getPlayerOrError(socket, room);
                if (!host.isHost)
                    throw new Error('Only the host can warn players.');
                const target = room.players.get(playerId);
                if (!target)
                    throw new Error('Player not found.');
                if (target.id === host.id)
                    throw new Error('Cannot warn yourself.');
                broadcastSystemMsg(io, room, `⚠️ ${host.name} sent a warning to ${target.name}.`);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Transfer Host ───────────────────────────────────────────────
        socket.on('room:transfer_host', ({ playerId }, cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const host = getPlayerOrError(socket, room);
                if (!host.isHost)
                    throw new Error('Only the host can transfer host status.');
                if (playerId === host.id)
                    throw new Error('You are already the host.');
                const newHost = room.players.get(playerId);
                if (!newHost)
                    throw new Error('Player not found.');
                transferHost(room, playerId);
                broadcastSystemMsg(io, room, `👑 ${host.name} transferred host to ${newHost.name}.`);
                broadcastRoom(io, room);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Update Settings ─────────────────────────────────────────────
        socket.on('room:settings', ({ settings }, cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const host = getPlayerOrError(socket, room);
                if (!host.isHost)
                    throw new Error('Only the host can change settings.');
                if (room.phase !== 'lobby')
                    throw new Error('Settings cannot be changed after game starts.');
                room.settings = {
                    ...room.settings,
                    ...settings,
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
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Start Game ──────────────────────────────────────────────────
        socket.on('game:start', (cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const host = getPlayerOrError(socket, room);
                if (!host.isHost)
                    throw new Error('Only the host can start the game.');
                if (room.phase !== 'lobby')
                    throw new Error('Game is already in progress.');
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
                        }).catch(() => { });
                    }
                }
                broadcastSystemMsg(io, room, 'The game has begun. Roles are being revealed…');
                notifyYakuzaAllies(io, room);
                broadcastRoom(io, room);
                enforceVoicePhaseRules(io, room);
                startPhaseTimer(io, room);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Queue: Join Next Round ───────────────────────────────────────
        socket.on('queue:join', (cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const player = getPlayerOrError(socket, room);
                if (!player.isSpectator)
                    throw new Error('Only spectators can join the next-round queue.');
                if (player.isQueuedNextRound)
                    throw new Error('Already in queue.');
                const position = enqueueForNextRound(room, player.id);
                broadcastSystemMsg(io, room, `${player.name} joined the queue for next round (#${position}).`);
                broadcastQueueUpdated(io, room);
                broadcastRoom(io, room);
                cb(ok({ position }));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Queue: Leave Next Round ──────────────────────────────────────
        socket.on('queue:leave', (cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const player = getPlayerOrError(socket, room);
                if (!player.isQueuedNextRound)
                    throw new Error('You are not in the queue.');
                dequeueFromNextRound(room, player.id);
                broadcastSystemMsg(io, room, `${player.name} left the next-round queue.`);
                broadcastQueueUpdated(io, room);
                broadcastRoom(io, room);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Night Action ────────────────────────────────────────────────
        socket.on('game:action', async ({ targetId }, cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const actor = getPlayerOrError(socket, room);
                if (actor.isSpectator)
                    throw new Error('Spectators cannot perform night actions.');
                if (actor.isQueuedNextRound)
                    throw new Error('Not an active player.');
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
                    const choiceMsg = createSystemMessage(`[${label}] ${actor.name} → ${targetName}`, 'mafia');
                    addMessage(room, choiceMsg);
                }
                broadcastRoom(io, room);
                if (allNightActionsSubmitted(room)) {
                    timerService.stop(room.id);
                    room.timer = 0;
                    advancePhase(room);
                    const nextPhase = room.phase;
                    announceNightResult(io, room);
                    notifySpies(io, room);
                    notifyTrackers(io, room);
                    notifyCultConversions(io, room);
                    notifyRoleblocked(io, room);
                    announceActiveEvent(io, room);
                    if (nextPhase === 'game_over')
                        await emitGameOver(io, room);
                    broadcastRoom(io, room);
                    enforceVoicePhaseRules(io, room);
                    if (room.phase !== 'game_over')
                        startPhaseTimer(io, room);
                }
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Vote ────────────────────────────────────────────────────────
        socket.on('game:vote', async ({ targetId }, cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const voter = getPlayerOrError(socket, room);
                if (voter.isSpectator)
                    throw new Error('Spectators cannot vote.');
                if (voter.isQueuedNextRound)
                    throw new Error('Not an active player.');
                submitVote(room, voter, targetId);
                const target = targetId ? room.players.get(targetId) : null;
                if (target) {
                    broadcastSystemMsg(io, room, `🗳 ${voter.name} → ${target.name}`);
                }
                // Auto-advance when every eligible player has voted (no need to wait for timer)
                const eligible = [...room.players.values()].filter(p => p.isAlive && !p.isSpectator && !p.isQueuedNextRound);
                const allVoted = eligible.length > 0 && eligible.every(p => room.votes.has(p.id));
                if (allVoted) {
                    timerService.stop(room.id);
                    room.timer = 0;
                    announceVoteResult(io, room);
                    advancePhase(room);
                    const nextPhase = room.phase;
                    announceActiveEvent(io, room);
                    if (nextPhase === 'game_over')
                        await emitGameOver(io, room);
                    broadcastRoom(io, room);
                    enforceVoicePhaseRules(io, room);
                    if (nextPhase !== 'game_over')
                        startPhaseTimer(io, room);
                    cb(ok(null));
                    return;
                }
                broadcastRoom(io, room);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Nominate ────────────────────────────────────────────────────
        socket.on('game:nominate', ({ nomineeId }, cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const actor = getPlayerOrError(socket, room);
                if (actor.isSpectator || actor.isQueuedNextRound)
                    throw new Error('Not an active player.');
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
                }
                else {
                    broadcastSystemMsg(io, room, `${actor.name} withdrew their nomination.`);
                }
                broadcastRoom(io, room);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Don Check (Don Mode) ────────────────────────────────────────
        socket.on('game:don_check', async ({ targetId }, cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const actor = getPlayerOrError(socket, room);
                submitDonCheck(room, actor, targetId ?? null);
                // Send result privately to Don
                if (targetId && room.donModeState?.donCheckResult !== null) {
                    const isSheriff = room.donModeState.donCheckResult;
                    const targetName = room.players.get(targetId)?.name ?? '?';
                    io.to(socket.id).emit('game:don_check_result', { targetId, targetName, isSheriff });
                    broadcastSystemMsg(io, room, `🔍 Don has investigated a player.`);
                }
                else {
                    broadcastSystemMsg(io, room, `🔍 Don skipped the investigation.`);
                }
                // Advance to mafia_kill
                timerService.stop(room.id);
                room.timer = 0;
                advancePhase(room);
                broadcastRoom(io, room);
                enforceVoicePhaseRules(io, room);
                if (room.phase !== 'game_over')
                    startPhaseTimer(io, room);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mafia Kill Vote (Don Mode) ──────────────────────────────────
        socket.on('game:mafia_kill_vote', async ({ targetId }, cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const actor = getPlayerOrError(socket, room);
                submitMafiaKillVote(room, actor, targetId);
                if (allMafiaKillVotesSubmitted(room)) {
                    timerService.stop(room.id);
                    room.timer = 0;
                    advancePhase(room);
                    announceNightResult(io, room);
                    if (room.phase !== 'game_over') {
                        broadcastRoom(io, room);
                        enforceVoicePhaseRules(io, room);
                        startPhaseTimer(io, room);
                    }
                    else {
                        await emitGameOver(io, room);
                        broadcastRoom(io, room);
                    }
                }
                else {
                    broadcastRoom(io, room);
                }
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Double Elimination Vote (Don Mode) ─────────────────────────
        socket.on('game:double_elim_vote', async ({ yes }, cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const voter = getPlayerOrError(socket, room);
                if (voter.isSpectator || voter.isQueuedNextRound)
                    throw new Error('Not an active player.');
                submitDoubleEliminationVote(room, voter, yes);
                if (allDoubleElimVotesSubmitted(room)) {
                    timerService.stop(room.id);
                    room.timer = 0;
                    const dm = room.donModeState;
                    const votes = dm ? Object.values(dm.doubleEliminationVotes) : [];
                    const yesCount = votes.filter(v => v).length;
                    const noCount = votes.filter(v => !v).length;
                    if (yesCount > noCount)
                        broadcastSystemMsg(io, room, '⚖️ გადაწყვეტილება: ორივე მოთამაშე გაძევებულია.');
                    else
                        broadcastSystemMsg(io, room, '⚖️ გადაწყვეტილება: ორივე მოთამაშე რჩება.');
                    advancePhase(room);
                    if (room.phase === 'game_over') {
                        await emitGameOver(io, room);
                    }
                    broadcastRoom(io, room);
                    enforceVoicePhaseRules(io, room);
                    if (room.phase !== 'game_over')
                        startPhaseTimer(io, room);
                }
                else {
                    broadcastRoom(io, room);
                }
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Dev: Fill Bots (owner-only, lobby phase only) ───────────────
        socket.on('dev:fill_bots', async ({ count }, cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const actor = getPlayerOrError(socket, room);
                const profile = socket.data.profileId ? await getPlayer(socket.data.profileId) : null;
                if (profile?.moderatorLevel !== 'owner')
                    throw new Error('Owner only.');
                if (room.phase !== 'lobby')
                    throw new Error('Can only fill bots in lobby.');
                const existing = [...room.players.values()].filter(p => !p.isSpectator).length;
                const toAdd = Math.min(count, 20 - existing);
                if (toAdd <= 0)
                    throw new Error('Room already has enough players.');
                const botNames = ['Beka', 'Nino', 'Gio', 'Maka', 'Dato', 'Lika', 'Zura', 'Ana', 'Sandro', 'Tama',
                    'Keti', 'Nika', 'Mari', 'Irakli', 'Salome', 'Giorgi', 'Levan', 'Nana', 'Lasha', 'Elene'];
                const taken = new Set([...room.players.values()].map(p => p.name));
                let seatNum = Math.max(...[...room.players.values()].map(p => p.seat), 0);
                for (let i = 0; i < toAdd; i++) {
                    const name = botNames.find(n => !taken.has(n)) ?? `Bot${i + 1}`;
                    taken.add(name);
                    seatNum++;
                    const botId = `bot_${randomUUID()}`;
                    const bot = {
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
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Dev: Remove Bots (owner-only) ────────────────────────────────
        socket.on('dev:clear_bots', async (cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const profile = socket.data.profileId ? await getPlayer(socket.data.profileId) : null;
                if (profile?.moderatorLevel !== 'owner')
                    throw new Error('Owner only.');
                if (room.phase !== 'lobby')
                    throw new Error('Can only clear bots in lobby.');
                for (const [id, p] of room.players) {
                    if (p.isBot)
                        room.players.delete(id);
                }
                broadcastRoom(io, room);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Skip Phase ──────────────────────────────────────────────────
        socket.on('game:skip', async (cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const host = getPlayerOrError(socket, room);
                if (!host.isHost)
                    throw new Error('Only the host can skip phases.');
                if (room.phase === 'lobby' || room.phase === 'game_over')
                    throw new Error('Cannot skip this phase.');
                // During speech phase: host can only skip another player's turn if hostSkipPrivilege is enabled.
                if (room.phase === 'speech') {
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
                if (room.phase === 'voting')
                    announceVoteResult(io, room);
                advancePhase(room);
                const nextPhase = room.phase;
                if (wasNightSkip) {
                    announceNightResult(io, room);
                    notifySpies(io, room);
                    notifyTrackers(io, room);
                    notifyCultConversions(io, room);
                    notifyRoleblocked(io, room);
                }
                if (wasSpeechSkip && nextPhase !== 'speech')
                    announceSpeechEnd(io, room, nextPhase);
                announceActiveEvent(io, room);
                if (nextPhase === 'game_over')
                    await emitGameOver(io, room);
                broadcastRoom(io, room);
                enforceVoicePhaseRules(io, room);
                if (nextPhase !== 'game_over')
                    startPhaseTimer(io, room);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Speech Pass (current speaker skips own turn) ─────────────────
        socket.on('game:speech_pass', async (cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const player = getPlayerOrError(socket, room);
                if (room.phase !== 'speech')
                    throw new Error('Can only pass during speech phase.');
                if (!player.isAlive || player.isSpectator)
                    throw new Error('Only alive players can pass.');
                const currentSpeakerId = room.speechOrder?.[room.currentSpeakerIdx ?? 0];
                if (player.id !== currentSpeakerId)
                    throw new Error('Only the current speaker can pass.');
                timerService.stop(room.id);
                room.timer = 0;
                advancePhase(room);
                const nextPhase = room.phase;
                if (nextPhase !== 'speech')
                    announceSpeechEnd(io, room, nextPhase);
                announceActiveEvent(io, room);
                if (nextPhase === 'game_over')
                    await emitGameOver(io, room);
                broadcastRoom(io, room);
                enforceVoicePhaseRules(io, room);
                if (nextPhase !== 'game_over')
                    startPhaseTimer(io, room);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Day Skip Vote ───────────────────────────────────────────────
        socket.on('game:day_skip_vote', (cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const player = getPlayerOrError(socket, room);
                if (room.phase !== 'day')
                    throw new Error('Can only skip during day phase.');
                if (!player.isAlive || player.isSpectator)
                    throw new Error('Cannot vote to skip.');
                if (room.daySkipVotes.includes(player.id))
                    throw new Error('Already voted to skip.');
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
                    if (nextPhase !== 'game_over')
                        startPhaseTimer(io, room);
                }
                else {
                    broadcastRoom(io, room);
                }
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Skip Defense (current defense candidate skips own turn) ─────────
        socket.on('game:skip-defense', async (cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const player = getPlayerOrError(socket, room);
                if (room.phase !== 'trial_defense')
                    throw new Error('Not in trial defense phase.');
                if (!player.isAlive || player.isSpectator)
                    throw new Error('Only alive players can skip defense.');
                const tds = room.trialDefenseState;
                if (!tds)
                    throw new Error('No trial defense in progress.');
                const currentCandidateId = tds.candidateIds[tds.currentCandidateIdx];
                const isHost = player.isHost;
                if (player.id !== currentCandidateId && !isHost) {
                    throw new Error('Only the current defense candidate (or host) can skip.');
                }
                timerService.stop(room.id);
                room.timer = 0;
                const nextPhase = advancePhase(room);
                announceActiveEvent(io, room);
                if (nextPhase === 'game_over')
                    await emitGameOver(io, room);
                broadcastRoom(io, room);
                enforceVoicePhaseRules(io, room);
                if (nextPhase !== 'game_over')
                    startPhaseTimer(io, room);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Issue Foul (presser interrupts current speaker for 6 seconds) ───
        socket.on('game:foul', async (cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const presser = getPlayerOrError(socket, room);
                if (room.phase !== 'speech')
                    throw new Error('Fouls can only be issued during speech phase.');
                if (!presser.isAlive || presser.isSpectator)
                    throw new Error('Only alive players can issue fouls.');
                const currentSpeakerId = room.speechOrder[room.currentSpeakerIdx];
                if (presser.id === currentSpeakerId)
                    throw new Error('The current speaker cannot foul themselves.');
                // Only one active foul at a time
                if (room.activeFoul && Date.now() < room.activeFoul.endsAt) {
                    throw new Error('A foul is already active. Wait for it to expire.');
                }
                const speaker = room.players.get(currentSpeakerId ?? '');
                if (!speaker)
                    throw new Error('No active speaker found.');
                // Track fouls on the PRESSER (the player who pressed the foul button)
                presser.foulCount = (presser.foulCount ?? 0) + 1;
                if (presser.foulCount >= 4) {
                    // 4th foul: immediate silent elimination — no final_words, game resumes in current phase
                    presser.isAlive = false;
                    presser.deathType = 'foul';
                    room.activeFoul = null;
                    broadcastSystemMsg(io, room, `⚠️ ${presser.name}: ფოლი #4 — გარიცხულია!`);
                    if (checkWin(room)) {
                        timerService.stop(room.id);
                        setPhase(room, 'game_over');
                        await emitGameOver(io, room);
                    }
                    broadcastRoom(io, room);
                    enforceVoicePhaseRules(io, room);
                    cb(ok(null));
                    return;
                }
                // Activate the foul window: presser gets 6 seconds to speak
                const foulEndsAt = Date.now() + 6000;
                room.activeFoul = { playerId: presser.id, endsAt: foulEndsAt };
                broadcastSystemMsg(io, room, `⚠️ ${presser.name}: ფოლი #${presser.foulCount}/3`);
                // Give presser voice access for 6 seconds
                const presserMember = voiceGetMembers(room.id, 'room').find(m => m.playerId === presser.id);
                if (presserMember) {
                    io.to(presserMember.socketId).emit('voice:force-unmute');
                }
                // Expire the foul after 6 seconds and re-mute presser
                const foulRoomId = room.id;
                setTimeout(() => {
                    const liveRoom = getRoom(foulRoomId);
                    if (!liveRoom)
                        return;
                    if (liveRoom.activeFoul?.playerId === presser.id && liveRoom.activeFoul.endsAt === foulEndsAt) {
                        liveRoom.activeFoul = null;
                        if (liveRoom.phase === 'speech') {
                            const member = voiceGetMembers(liveRoom.id, 'room').find(m => m.playerId === presser.id);
                            if (member) {
                                io.to(member.socketId).emit('voice:force-mute', { reason: 'Foul window expired.' });
                            }
                            broadcastRoom(io, liveRoom);
                        }
                    }
                }, 6000);
                broadcastRoom(io, room);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Set Last Will ────────────────────────────────────────────────────
        socket.on('game:set_will', ({ text }, cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const player = getPlayerOrError(socket, room);
                if (!player.isAlive)
                    throw new Error('Eliminated players cannot change their last will.');
                player.lastWill = text.slice(0, 200);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Pause / Resume Timer ─────────────────────────────────────────────
        socket.on('game:pause', (cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const host = getPlayerOrError(socket, room);
                if (!host.isHost)
                    throw new Error('Only the host can pause.');
                if (room.phase === 'lobby' || room.phase === 'game_over')
                    throw new Error('Cannot pause now.');
                if (room.isPaused) {
                    room.isPaused = false;
                    timerService.resume(room.id);
                    broadcastSystemMsg(io, room, '▶ Game resumed.');
                }
                else {
                    room.isPaused = true;
                    timerService.pause(room.id);
                    broadcastSystemMsg(io, room, '⏸ Game paused by host.');
                }
                broadcastRoom(io, room);
                cb(ok({ isPaused: room.isPaused }));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Leaderboard ──────────────────────────────────────────────────────
        socket.on('leaderboard:get', async (cb) => {
            try {
                cb(ok(await getLeaderboard()));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Terminate Game (host-only, resets to lobby) ─────────────────
        socket.on('game:terminate', (cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const host = getPlayerOrError(socket, room);
                if (!host.isHost)
                    throw new Error('Only the host can terminate the game.');
                if (room.phase === 'lobby')
                    throw new Error('No active game to terminate.');
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
                for (const p of room.players.values()) {
                    p.role = null;
                    p.team = null;
                    p.isAlive = true;
                    p.isReady = false;
                    p.voteTarget = null;
                    p.hasActedThisPhase = false;
                    p.deathType = null;
                }
                // Clear the next-round queue — queued spectators stay as watch-only spectators
                for (const p of room.nextRoundQueue) {
                    p.isQueuedNextRound = false;
                    p.queuePosition = null;
                }
                room.nextRoundQueue = [];
                broadcastSystemMsg(io, room, 'The host terminated the game. Returning to lobby.');
                broadcastRoom(io, room);
                // Clear all phase-based force mutes so lobby voice works normally
                io.to(room.id).emit('voice:reset');
                enforceVoicePhaseRules(io, room);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Restart ─────────────────────────────────────────────────────
        socket.on('game:restart', (cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const host = getPlayerOrError(socket, room);
                if (!host.isHost)
                    throw new Error('Only the host can restart.');
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
                    p.isAlive = true;
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
            }
            catch (e) {
                cb(err(e.message));
            }
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
                    if (mute)
                        throw new Error(`You are muted until ${new Date(mute.expiresAt).toLocaleString()}. Reason: ${mute.reason}`);
                }
                const validationError = validateChat(room, player, parsed.channel);
                if (validationError)
                    throw new Error(validationError);
                const chatKey = socket.data.profileId ?? socket.id;
                const chatCheck = chatRateOk(chatKey, parsed.text);
                if (!chatCheck.ok)
                    throw new Error(chatCheck.error);
                const profile = profileId ? await getPlayer(profileId) : null;
                const msg = createPlayerMessage(player, parsed.text, parsed.channel, profile?.isModerator ?? false);
                addMessage(room, msg);
                if (parsed.channel === 'mafia') {
                    for (const p of room.players.values()) {
                        if (p.team === 'mafia' && p.socketId)
                            io.to(p.socketId).emit('chat:new', msg);
                    }
                }
                else if (parsed.channel === 'dead') {
                    for (const p of room.players.values()) {
                        if (!p.isAlive && !p.isSpectator && p.socketId) {
                            io.to(p.socketId).emit('chat:new', msg);
                        }
                    }
                }
                else if (parsed.channel === 'spectator') {
                    for (const p of room.players.values()) {
                        if (p.isSpectator && p.socketId)
                            io.to(p.socketId).emit('chat:new', msg);
                    }
                }
                else {
                    io.to(room.id).emit('chat:new', msg);
                }
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Kick from room ──────────────────────────────────────────
        socket.on('mod:kick_from_room', async ({ targetProfileId, roomId, reason }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = await getPlayer(modProfileId);
                if (!mod || !canDo(mod, 'kick'))
                    throw new Error('Insufficient permissions.');
                const room = getRoom(roomId);
                if (!room)
                    throw new Error('Room not found.');
                const target = getPlayerByProfile(room, targetProfileId);
                if (!target)
                    throw new Error('Player not found in room.');
                if (target.socketId) {
                    const targetSock = io.sockets.sockets.get(target.socketId);
                    if (targetSock) {
                        targetSock.emit('kicked', { reason: `Removed by moderator. Reason: ${reason}` });
                        handleVoiceLeave(io, target.socketId);
                        handlePlayerLeave(io, targetSock, roomId, target.id);
                    }
                    else {
                        removePlayer(room, target.id);
                        if (room.players.size > 0) {
                            broadcastSystemMsg(io, room, `${target.name} was removed by a moderator.`);
                            broadcastRoom(io, room);
                        }
                    }
                }
                else {
                    removePlayer(room, target.id);
                    if (room.players.size > 0) {
                        broadcastSystemMsg(io, room, `${target.name} was removed by a moderator.`);
                        broadcastRoom(io, room);
                    }
                }
                await logKick(modProfileId, mod.username, target.profileId ?? targetProfileId, target.name, roomId, reason);
                cb(ok(null));
                notifyMods(io, 'mod_kick', `${mod.username} kicked ${target.name} from room`, target.name).catch(() => { });
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Kick player (any room) ──────────────────────────────────
        socket.on('mod:kick_player', async ({ targetProfileId, reason }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = await getPlayer(modProfileId);
                if (!mod || !canDo(mod, 'kick'))
                    throw new Error('Insufficient permissions.');
                const targetProfile = await getPlayer(targetProfileId);
                if (targetProfile && targetProfile.moderatorLevel) {
                    const targetRank = ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(targetProfile.moderatorLevel);
                    const modRank = mod.moderatorLevel ? ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(mod.moderatorLevel) : -1;
                    if (targetRank >= modRank)
                        throw new Error('Cannot kick a moderator of equal or higher rank.');
                }
                // Scan all rooms to find the target
                let foundRoom = null;
                let foundTarget = null;
                for (const room of getAllRooms()) {
                    const player = getPlayerByProfile(room, targetProfileId);
                    if (player) {
                        foundRoom = room;
                        foundTarget = player;
                        break;
                    }
                }
                if (!foundRoom || !foundTarget)
                    throw new Error('Player is not currently in any room.');
                if (foundTarget.socketId) {
                    const targetSock = io.sockets.sockets.get(foundTarget.socketId);
                    if (targetSock) {
                        targetSock.emit('kicked', { reason: `Removed by moderator. Reason: ${reason}` });
                        handleVoiceLeave(io, foundTarget.socketId);
                        handlePlayerLeave(io, targetSock, foundRoom.id, foundTarget.id);
                    }
                    else {
                        removePlayer(foundRoom, foundTarget.id);
                        if (foundRoom.players.size > 0) {
                            broadcastSystemMsg(io, foundRoom, `${foundTarget.name} was removed by a moderator.`);
                            broadcastRoom(io, foundRoom);
                        }
                    }
                }
                else {
                    removePlayer(foundRoom, foundTarget.id);
                    if (foundRoom.players.size > 0) {
                        broadcastSystemMsg(io, foundRoom, `${foundTarget.name} was removed by a moderator.`);
                        broadcastRoom(io, foundRoom);
                    }
                }
                await logKick(modProfileId, mod.username, foundTarget.profileId ?? targetProfileId, foundTarget.name, foundRoom.id, reason);
                cb(ok(null));
                notifyMods(io, 'mod_kick', `${mod.username} kicked ${foundTarget.name} from room`, foundTarget.name).catch(() => { });
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Get active rooms ────────────────────────────────────────
        socket.on('mod:get_active_rooms', async (cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'view_reports'))
                    throw new Error('Insufficient permissions.');
                cb(ok(getAllRooms().map(toRoomListItem)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Ban ─────────────────────────────────────────────────────
        socket.on('mod:ban', async ({ targetProfileId, reason, duration }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = await getPlayer(modProfileId);
                if (!mod || !canDo(mod, 'ban_short'))
                    throw new Error('Insufficient permissions.');
                const targetForRankCheck = await getPlayer(targetProfileId);
                if (targetForRankCheck && targetForRankCheck.moderatorLevel) {
                    const targetRank = ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(targetForRankCheck.moderatorLevel);
                    const modRank = mod.moderatorLevel ? ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(mod.moderatorLevel) : -1;
                    if (targetRank >= modRank)
                        throw new Error('Cannot ban a moderator of equal or higher rank.');
                }
                const ban = await banPlayer(modProfileId, mod.username, targetProfileId, reason, duration);
                // Disconnect target from all rooms
                const targetSock = findSocketByProfile(io, targetProfileId);
                if (targetSock) {
                    targetSock.emit('ban:received', { reason, expiresAt: ban.expiresAt });
                    const { roomId: targetRoomId, playerId: targetPlayerId } = targetSock.data;
                    if (targetRoomId && targetPlayerId) {
                        handlePlayerLeave(io, targetSock, targetRoomId, targetPlayerId);
                    }
                    targetSock.disconnect(true);
                }
                cb(ok(null));
                // Notify mods in background — don't block the ack
                getPlayer(targetProfileId).then(target => {
                    notifyMods(io, 'mod_ban', `${mod.username} banned ${target?.username ?? '?'}`, target?.username).catch(() => { });
                }).catch(() => { });
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Unban ───────────────────────────────────────────────────
        socket.on('mod:unban', async ({ targetProfileId }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = await getPlayer(modProfileId);
                if (!mod || !canDo(mod, 'ban_short'))
                    throw new Error('Insufficient permissions.');
                await unbanPlayer(modProfileId, mod.username, targetProfileId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Mute ────────────────────────────────────────────────────
        socket.on('mod:mute', async ({ targetProfileId, reason, duration }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = await getPlayer(modProfileId);
                if (!mod || !canDo(mod, 'mute'))
                    throw new Error('Insufficient permissions.');
                const mute = await mutePlayer(modProfileId, mod.username, targetProfileId, reason, duration);
                const targetSock = findSocketByProfile(io, targetProfileId);
                if (targetSock) {
                    targetSock.emit('mute:received', { reason, expiresAt: mute.expiresAt });
                }
                cb(ok(null));
                getPlayer(targetProfileId).then(target => {
                    notifyMods(io, 'mod_mute', `${mod.username} muted ${target?.username ?? '?'}`, target?.username).catch(() => { });
                }).catch(() => { });
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Unmute ──────────────────────────────────────────────────
        socket.on('mod:unmute', async ({ targetProfileId }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = await getPlayer(modProfileId);
                if (!mod || !canDo(mod, 'mute'))
                    throw new Error('Insufficient permissions.');
                await unmutePlayer(modProfileId, mod.username, targetProfileId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Warn ────────────────────────────────────────────────────
        socket.on('mod:warn', async ({ targetProfileId, reason, category }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = await getPlayer(modProfileId);
                if (!mod || !canDo(mod, 'warn'))
                    throw new Error('Insufficient permissions.');
                const target = await getPlayer(targetProfileId);
                if (target && target.moderatorLevel) {
                    const targetRank = ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(target.moderatorLevel);
                    const modRank = mod.moderatorLevel ? ['moderator', 'senior_moderator', 'admin', 'owner'].indexOf(mod.moderatorLevel) : -1;
                    if (targetRank >= modRank)
                        throw new Error('Cannot warn a moderator of equal or higher rank.');
                }
                const warnCat = (category ?? 'other');
                const warning = await warnPlayer(modProfileId, mod.username, targetProfileId, reason, warnCat);
                const targetSock = findSocketByProfile(io, targetProfileId);
                if (targetSock) {
                    targetSock.emit('warning:received', { reason, category: warnCat, moderatorName: mod.username });
                }
                cb(ok(null));
                notifyMods(io, 'mod_warn', `${mod.username} warned ${target?.username ?? '?'}`, target?.username).catch(() => { });
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Get data ────────────────────────────────────────────────
        socket.on('mod:get_reports', async (cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'view_reports'))
                    throw new Error('Insufficient permissions.');
                cb(ok(await getReports()));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('mod:get_rooms', async (cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'view_reports'))
                    throw new Error('Insufficient permissions.');
                cb(ok(getAllRooms().map(toRoomListItem)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('mod:get_players', async (cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'view_reports'))
                    throw new Error('Insufficient permissions.');
                cb(ok(await getModPlayers()));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('mod:get_banned_players', async (cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'view_reports'))
                    throw new Error('Insufficient permissions.');
                cb(ok(await getBannedPlayers()));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('mod:get_logs', async (cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'view_logs'))
                    throw new Error('Insufficient permissions.');
                cb(ok(await getLogs()));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('mod:resolve_report', async ({ reportId, status, notes }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = await getPlayer(modProfileId);
                if (!mod || !canDo(mod, 'resolve_reports'))
                    throw new Error('Insufficient permissions.');
                await resolveReport(modProfileId, reportId, status, notes);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Terminate any room's game ───────────────────────────────
        socket.on('mod:terminate_game', async ({ roomId, reason }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = await getPlayer(modProfileId);
                if (!mod || !canDo(mod, 'ban_long'))
                    throw new Error('Insufficient permissions.');
                const room = getRoom(roomId);
                if (!room)
                    throw new Error('Room not found.');
                if (room.phase === 'lobby')
                    throw new Error('No active game to terminate.');
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
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Close Room (permanently removes room, kicks all players) ─
        socket.on('mod:close_room', async ({ roomId, reason }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = await getPlayer(modProfileId);
                if (!mod || !canDo(mod, 'ban_long'))
                    throw new Error('Insufficient permissions. Admin+ required.');
                const room = getRoom(roomId);
                if (!room)
                    throw new Error('Room not found.');
                const code = room.code;
                const playerNames = [...room.players.values()].map(p => p.name).join(', ');
                closeRoom(io, room, reason || 'Closed by moderator');
                await logKick(modProfileId, mod.username, roomId, code, roomId, `Closed room: ${reason || 'No reason given'}`);
                await notifyMods(io, 'mod_kick', `${mod.username} closed room ${code} (${playerNames})`, code);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Dashboard Stats ──────────────────────────────────────────
        socket.on('mod:get_dashboard', async (cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'view_reports'))
                    throw new Error('Insufficient permissions.');
                const { openReports, recentBans } = await getDashboardDbStats();
                const rooms = getAllRooms();
                cb(ok({
                    onlinePlayers: getOnlineCount(),
                    spectatingPlayers: getSpectatingCount(),
                    activeRooms: rooms.length,
                    openReports,
                    recentBans,
                }));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Live Rooms (NO roles/teams) ─────────────────────────────
        socket.on('mod:get_rooms_live', async (cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'view_reports'))
                    throw new Error('Insufficient permissions.');
                const rooms = getAllRooms();
                const result = rooms.map(room => {
                    const hostPlayer = getHostPlayer(room);
                    const players = Array.from(room.players.values())
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
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Pause Timer ──────────────────────────────────────────────
        socket.on('mod:pause_timer', async ({ roomId }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'kick'))
                    throw new Error('Insufficient permissions.');
                const room = getRoom(roomId);
                if (!room)
                    throw new Error('Room not found.');
                if (room.phase === 'lobby' || room.phase === 'game_over')
                    throw new Error('No active game timer.');
                timerService.pause(room.id);
                room.isPaused = true;
                broadcastSystemMsg(io, room, `⏸ A moderator paused the timer.`);
                broadcastRoom(io, room);
                await addModLog('pause_timer', modProfileId, mod.username, roomId, room.code, roomId, 'Mod pause');
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Resume Timer ─────────────────────────────────────────────
        socket.on('mod:resume_timer', async ({ roomId }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'kick'))
                    throw new Error('Insufficient permissions.');
                const room = getRoom(roomId);
                if (!room)
                    throw new Error('Room not found.');
                timerService.resume(room.id);
                room.isPaused = false;
                broadcastSystemMsg(io, room, `▶ A moderator resumed the timer.`);
                broadcastRoom(io, room);
                await addModLog('resume_timer', modProfileId, mod.username, roomId, room.code, roomId, 'Mod resume');
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Force Phase ──────────────────────────────────────────────
        socket.on('mod:force_phase', async ({ roomId, phase }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'ban_long'))
                    throw new Error('Insufficient permissions.');
                const room = getRoom(roomId);
                if (!room)
                    throw new Error('Room not found.');
                if (phase === 'game_over')
                    throw new Error('Use terminate to end a game.');
                const allowed = ['night', 'morning', 'day', 'speech', 'voting'];
                if (!allowed.includes(phase))
                    throw new Error('Invalid phase.');
                timerService.stop(room.id);
                setPhase(room, phase);
                broadcastSystemMsg(io, room, `⚡ A moderator forced phase: ${phase}.`);
                broadcastRoom(io, room);
                await addModLog('force_phase', modProfileId, mod.username, roomId, room.code, roomId, `Force phase: ${phase}`);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: System Message to Room ───────────────────────────────────
        socket.on('mod:system_message', async ({ roomId, message }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'kick'))
                    throw new Error('Insufficient permissions.');
                const room = getRoom(roomId);
                if (!room)
                    throw new Error('Room not found.');
                const text = message.trim().slice(0, 300);
                if (!text)
                    throw new Error('Message cannot be empty.');
                broadcastSystemMsg(io, room, `[MOD] ${text}`);
                await addModLog('system_message', modProfileId, mod.username, roomId, room.code, roomId, text);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Broadcast to All Rooms ───────────────────────────────────
        socket.on('mod:broadcast', async ({ message }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'ban_short'))
                    throw new Error('Insufficient permissions.');
                const text = message.trim().slice(0, 300);
                if (!text)
                    throw new Error('Message cannot be empty.');
                for (const room of getAllRooms()) {
                    broadcastSystemMsg(io, room, `[BROADCAST] ${text}`);
                }
                io.emit('mod:notification', { type: 'broadcast', message: `[BROADCAST] ${text}` });
                await addModLog('broadcast', modProfileId, mod.username, 'all', 'all', null, text);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Toggle Maintenance Mode ──────────────────────────────────
        socket.on('mod:toggle_maintenance', async ({ enabled }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'ban_long'))
                    throw new Error('Insufficient permissions.');
                maintenanceMode = enabled;
                io.emit('maintenance:status', { enabled });
                await addModLog('broadcast', modProfileId, mod.username, 'system', 'system', null, `Maintenance mode: ${enabled}`);
                cb(ok({ enabled }));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('mod:get_maintenance', async (cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'view_reports'))
                    throw new Error('Insufficient permissions.');
                cb(ok({ enabled: maintenanceMode }));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Player Detail ────────────────────────────────────────────
        socket.on('mod:get_player_detail', async ({ targetProfileId }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'view_reports'))
                    throw new Error('Insufficient permissions.');
                const detail = await getPlayerDetail(targetProfileId);
                cb(ok(detail));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Get Player Auth Info (owner only) ─────────────────────────
        socket.on('mod:get_player_auth_info', async ({ targetProfileId }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || mod.moderatorLevel !== 'owner')
                    throw new Error('Owner only.');
                const accounts = await sql `
          SELECT provider, email, display_name, provider_user_id, created_at
          FROM auth_accounts WHERE user_id = ${targetProfileId}
          ORDER BY created_at ASC
        `;
                cb(ok({ accounts }));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Add Note ─────────────────────────────────────────────────
        socket.on('mod:add_note', async ({ targetProfileId, note }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'view_reports'))
                    throw new Error('Insufficient permissions.');
                await addModNote(modProfileId, mod.username, targetProfileId, note);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Freeze / Unfreeze Account ────────────────────────────────
        socket.on('mod:freeze_account', async ({ targetProfileId, reason }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'ban_short'))
                    throw new Error('Insufficient permissions.');
                await freezeAccount(modProfileId, mod.username, targetProfileId, reason);
                await notifyMods(io, 'mod_freeze', `${mod.username} froze account of ${targetProfileId}`, targetProfileId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('mod:unfreeze_account', async ({ targetProfileId }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'ban_short'))
                    throw new Error('Insufficient permissions.');
                await unfreezeAccount(modProfileId, mod.username, targetProfileId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Rename Player ────────────────────────────────────────────
        socket.on('mod:rename_player', async ({ targetProfileId, newName, reason }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'ban_short'))
                    throw new Error('Insufficient permissions.');
                await renamePlayer(modProfileId, mod.username, targetProfileId, newName, reason);
                await notifyMods(io, 'mod_rename', `${mod.username} renamed player`, targetProfileId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Voice Mute Room ──────────────────────────────────────────
        socket.on('mod:voice_mute_room', async ({ roomId, reason }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'kick'))
                    throw new Error('Insufficient permissions.');
                const room = getRoom(roomId);
                if (!room)
                    throw new Error('Room not found.');
                io.to(room.id).emit('voice:force-mute', { reason: reason || 'Muted by moderator' });
                broadcastSystemMsg(io, room, `🔇 A moderator muted all voice in this room.`);
                await addModLog('kick', modProfileId, mod.username, roomId, room.code, roomId, `Voice mute: ${reason}`);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Voice tools per player ──────────────────────────────────
        socket.on('mod:voice_clear_forced_mute', async ({ targetProfileId }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'kick'))
                    throw new Error('Insufficient permissions.');
                const target = await getPlayer(targetProfileId);
                if (!target)
                    throw new Error('Player not found.');
                const targetSock = findSocketByProfile(io, targetProfileId);
                if (targetSock)
                    targetSock.emit('voice:force-unmute');
                await addModLog('kick', modProfileId, mod.username, targetProfileId, target.username, null, 'Voice: cleared forced mute');
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('mod:voice_force_reconnect', async ({ targetProfileId }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'kick'))
                    throw new Error('Insufficient permissions.');
                const target = await getPlayer(targetProfileId);
                if (!target)
                    throw new Error('Player not found.');
                const targetSock = findSocketByProfile(io, targetProfileId);
                if (targetSock)
                    targetSock.emit('voice:force-leave', { channel: 'room', reason: 'Force reconnect by moderator' });
                await addModLog('kick', modProfileId, mod.username, targetProfileId, target.username, null, 'Voice: force reconnect');
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Assign Report ────────────────────────────────────────────
        socket.on('mod:assign_report', async ({ reportId, modId }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? await getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'view_reports'))
                    throw new Error('Insufficient permissions.');
                await assignReport(reportId, modId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Player Profile (by profileId) ─────────────────────────────────
        socket.on('player:profile', async ({ profileId }, cb) => {
            try {
                const profile = await getPlayer(profileId);
                if (!profile)
                    throw new Error('Profile not found.');
                cb(ok(toPublicProfile(profile)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Achievements ─────────────────────────────────────────────────
        socket.on('player:achievements', async ({ profileId }, cb) => {
            try {
                const achs = await getPlayerAchievements(profileId);
                cb(ok(achs));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Game History ──────────────────────────────────────────────────
        socket.on('player:history', async ({ profileId }, cb) => {
            try {
                const history = await getPlayerHistory(profileId, 20);
                cb(ok(history));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('lobby:player_roles', async ({ profileIds, roomCode }, cb) => {
            try {
                if (!Array.isArray(profileIds) || !profileIds.length || !roomCode) {
                    cb(ok({}));
                    return;
                }
                cb(ok(await getPlayersLastRolesInRoom(profileIds.slice(0, 20), roomCode)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('room:invite', async ({ friendProfileId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const room = getAllRooms().find(r => getPlayerByProfile(r, profileId));
                if (!room)
                    throw new Error('Not in a room.');
                const me = getPlayerByProfile(room, profileId);
                if (!me)
                    throw new Error('Not in a room.');
                const friendSock = findSocketByProfile(io, friendProfileId);
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
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Public Profile (for profile popups) ──────────────────────────
        socket.on('player:public_profile', async ({ profileId }, cb) => {
            try {
                const profile = await getPlayer(profileId);
                if (!profile)
                    throw new Error('Player not found.');
                const [achievements, history, clanMembership, roleStats] = await Promise.all([
                    getPlayerAchievements(profileId),
                    getPlayerHistory(profileId, 10),
                    getClanMembershipByPlayer(profileId),
                    getPlayerRoleStats(profileId),
                ]);
                let friendshipStatus = 'none';
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
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Role Stats (role/team breakdown for any player) ───────────────
        socket.on('player:role_stats', async ({ profileId }, cb) => {
            try {
                const stats = await getPlayerRoleStats(profileId);
                cb(ok(stats));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Clans ─────────────────────────────────────────────────────────
        socket.on('clan:list', async (cb) => {
            try {
                cb(ok(await getAllClans()));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('clan:get', async ({ clanId }, cb) => {
            try {
                const clan = await getClan(clanId);
                if (!clan)
                    throw new Error('Clan not found.');
                const members = await getClanMembers(clanId);
                cb(ok({ clan, members }));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('clan:mine', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    return cb(ok(null));
                cb(ok(await getClanByPlayer(profileId)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // Enter (or lazily create) the caller's clan lounge — returns its join code.
        socket.on('clan:lounge_enter', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const membership = await getClanMembershipByPlayer(profileId);
                if (!membership)
                    throw new Error('You are not in a clan.');
                const meta = _ensureClanSpace(membership.id, membership.name);
                cb(ok({ code: meta.code }));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('clan:my_membership', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    return cb(ok(null));
                cb(ok(await getClanMembershipByPlayer(profileId)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('clan:create', async ({ name, tag, description }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const clan = await createClan(profileId, name, tag, description);
                cb(ok(clan));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('clan:join', async ({ clanId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                await joinClan(profileId, clanId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('clan:leave', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                await leaveClan(profileId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('clan:update_image', async ({ clanId, imageData }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                if (!imageData || typeof imageData !== 'string')
                    throw new Error('Invalid image data.');
                if (!imageData.startsWith('data:image/'))
                    throw new Error('Invalid image format.');
                await setClanImage(clanId, profileId, imageData);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('clan:set_role', async ({ targetPlayerId, newRole }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const validRoles = ['admin', 'moderator', 'member'];
                if (!validRoles.includes(newRole))
                    throw new Error('Invalid role.');
                await setClanMemberRole(profileId, targetPlayerId, newRole);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('clan:get_mod_logs', async ({ clanId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const membership = await getClanMembershipByPlayer(profileId);
                if (!membership || membership.id !== clanId)
                    throw new Error('Not authorized.');
                const validRoles = ['owner', 'admin'];
                if (!validRoles.includes(membership.memberRole))
                    throw new Error('Only clan owner/admin can view mod logs.');
                const logs = await getClanModLogs(clanId);
                cb(ok(logs));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Clan Wars ─────────────────────────────────────────────────────
        socket.on('clan:war_challenge', async ({ defenderClanId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const membership = await getClanMembershipByPlayer(profileId);
                if (!membership)
                    throw new Error('You are not in a clan.');
                if (membership.memberRole !== 'owner' && membership.memberRole !== 'admin') {
                    throw new Error('Only clan owner or admin can issue war challenges.');
                }
                const war = await challengeClan(membership.id, defenderClanId);
                // Notify all members of the defender clan
                for (const [, sock] of io.sockets.sockets) {
                    const sid = sock.data.profileId;
                    if (!sid)
                        continue;
                    const m = await getClanMembershipByPlayer(sid).catch(() => null);
                    if (m && m.id === defenderClanId) {
                        sock.emit('clan:war_challenged', { war });
                    }
                }
                cb(ok(war));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('clan:war_accept', async ({ warId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const membership = await getClanMembershipByPlayer(profileId);
                if (!membership)
                    throw new Error('You are not in a clan.');
                if (membership.memberRole !== 'owner' && membership.memberRole !== 'admin') {
                    throw new Error('Only clan owner or admin can accept war challenges.');
                }
                const war = await acceptWar(warId, membership.id);
                // Notify all members of both clans
                for (const [, sock] of io.sockets.sockets) {
                    const sid = sock.data.profileId;
                    if (!sid)
                        continue;
                    const m = await getClanMembershipByPlayer(sid).catch(() => null);
                    if (m && (m.id === war.challengerClanId || m.id === war.defenderClanId)) {
                        sock.emit('clan:war_started', { war });
                    }
                }
                cb(ok(war));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('clan:war_decline', async ({ warId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const membership = await getClanMembershipByPlayer(profileId);
                if (!membership)
                    throw new Error('You are not in a clan.');
                if (membership.memberRole !== 'owner' && membership.memberRole !== 'admin') {
                    throw new Error('Only clan owner or admin can decline war challenges.');
                }
                const war = await declineWar(warId, membership.id);
                cb(ok(war));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('clan:war_status', async ({ clanId }, cb) => {
            try {
                const war = await getActiveWar(clanId);
                cb(ok(war));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('clan:war_history', async ({ clanId }, cb) => {
            try {
                const history = await getWarHistory(clanId, 10);
                cb(ok(history));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Clan Room Moderation ────────────────────────────────────────
        socket.on('clanRoom:warn', async ({ targetPlayerId, reason }, cb) => {
            try {
                const profileId = socket.data.profileId;
                const roomId = socket.data.roomId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                if (!roomId)
                    throw new Error('Not in a room.');
                const room = getRoom(roomId);
                if (!room)
                    throw new Error('Room not found.');
                if (!room.clanId)
                    throw new Error('This is not a clan room.');
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
                if (!targetPlayer)
                    throw new Error('Target player not in this room.');
                // Rank protection: cannot warn owner/admin unless you are owner
                if (targetPlayerId !== profileId) {
                    const targetMembership = await getClanMembershipByPlayer(targetPlayerId);
                    if (targetMembership && targetMembership.id === room.clanId) {
                        const targetRole = targetMembership.memberRole;
                        if (targetRole === 'owner')
                            throw new Error('Cannot warn the clan owner.');
                        if (targetRole === 'admin' && actorRole !== 'owner')
                            throw new Error('Cannot warn a clan admin.');
                    }
                }
                // Check target is not a global moderator/admin
                const targetProfile = await getPlayer(targetPlayerId);
                if (targetProfile?.isModerator)
                    throw new Error('Cannot use clan actions on global moderators.');
                // Send warning notification to target
                const actorProfile = await getPlayer(profileId);
                const actorName = actorProfile?.username ?? 'Clan Moderator';
                io.to(targetPlayer.socketId).emit('clanRoom:warningReceived', {
                    clanName: actorMembership.name,
                    clanTag: actorMembership.tag,
                    moderatorName: actorName,
                    moderatorRole: actorRole,
                    reason: reason.slice(0, 300),
                });
                await addClanModLog(room.clanId, profileId, actorName, targetPlayerId, targetPlayer.name, 'clan_warning', reason.slice(0, 300), room.id);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('clanRoom:kick', async ({ targetPlayerId, reason }, cb) => {
            try {
                const profileId = socket.data.profileId;
                const roomId = socket.data.roomId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                if (!roomId)
                    throw new Error('Not in a room.');
                const room = getRoom(roomId);
                if (!room)
                    throw new Error('Room not found.');
                if (!room.clanId)
                    throw new Error('This is not a clan room.');
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
                if (!targetPlayer)
                    throw new Error('Target player not in this room.');
                // Rank protection
                if (targetPlayerId !== profileId) {
                    const targetMembership = await getClanMembershipByPlayer(targetPlayerId);
                    if (targetMembership && targetMembership.id === room.clanId) {
                        const targetRole = targetMembership.memberRole;
                        if (targetRole === 'owner')
                            throw new Error('Cannot kick the clan owner.');
                        if (targetRole === 'admin' && actorRole !== 'owner')
                            throw new Error('Cannot kick a clan admin.');
                    }
                }
                // Check target is not a global moderator/admin
                const targetProfile = await getPlayer(targetPlayerId);
                if (targetProfile?.isModerator)
                    throw new Error('Cannot use clan actions on global moderators.');
                const actorProfile = await getPlayer(profileId);
                const actorName = actorProfile?.username ?? 'Clan Moderator';
                // Notify target they are being kicked
                io.to(targetPlayer.socketId).emit('clanRoom:kicked', {
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
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Voice: Join Channel ─────────────────────────────────────────
        socket.on('voice:join', ({ channel }, cb) => {
            try {
                const { roomId, playerId } = socket.data;
                if (!roomId || !playerId)
                    return cb(err('Not in a room.'));
                const room = getRoom(roomId);
                if (!room)
                    return cb(err('Room not found.'));
                const validChannel = (channel === 'room' || channel === 'mafia') ? channel : 'room';
                const authError = voiceCanJoin(room, playerId, validChannel);
                if (authError)
                    return cb(err(authError));
                const player = room.players.get(playerId);
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
            }
            catch (e) {
                cb(err(e.message ?? 'Failed to join voice.'));
            }
        });
        // ── Voice: Leave Channel ────────────────────────────────────────
        socket.on('voice:leave', () => {
            handleVoiceLeave(io, socket.id);
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
            if (typeof cb === 'function')
                cb(ok(null));
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
        // ── Rematch ─────────────────────────────────────────────────────
        socket.on('game:rematch', (cb) => {
            try {
                const { roomId } = socket.data;
                if (!roomId)
                    throw new Error('Not in a room.');
                const room = getRoom(roomId);
                if (!room)
                    throw new Error('Room not found.');
                if (room.phase !== 'game_over')
                    throw new Error('Game is not over yet.');
                const player = getPlayerBySocket(room, socket.id);
                if (!player?.isHost)
                    throw new Error('Only the host can start a rematch.');
                cancelAutoStart(roomId);
                timerService.stop(roomId);
                rematchRoom(room);
                broadcastSystemMsg(io, room, 'The host started a rematch. Prepare for a new game!');
                broadcastRoom(io, room);
                // Clear all phase-based force mutes so lobby voice works normally
                io.to(room.id).emit('voice:reset');
                enforceVoicePhaseRules(io, room);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Friends ──────────────────────────────────────────────────────
        socket.on('friend:request', async ({ toProfileId, friendCode }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                let targetId = toProfileId;
                if (!targetId && friendCode) {
                    const target = await getPlayerByFriendCode(friendCode);
                    if (!target)
                        throw new Error('No player found with that code.');
                    targetId = target.id;
                }
                if (!targetId)
                    throw new Error('Provide a friend code.');
                if (targetId === profileId)
                    throw new Error('Cannot add yourself.');
                await sendFriendRequest(profileId, targetId);
                const targetSock = findSocketByProfile(io, targetId);
                if (targetSock) {
                    const reqs = await getPendingRequests(targetId);
                    const thisReq = reqs.find(r => r.fromId === profileId);
                    if (thisReq)
                        targetSock.emit('friend:request_received', thisReq);
                }
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Generic game invite (Checkers / Ludo / UNO / Joker / WWW) ──────────
        socket.on('game:invite', async ({ targetProfileId, game, code }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                if (!['checkers', 'ludo', 'uno', 'joker', 'www'].includes(game) || !code)
                    throw new Error('Invalid invite.');
                const targetSock = findSocketByProfile(io, String(targetProfileId));
                if (!targetSock)
                    throw new Error('მოთამაშე ოფლაინია.');
                const me = await getPlayer(profileId);
                targetSock.emit('game:invite_received', {
                    game, code: String(code).toUpperCase().slice(0, 12),
                    fromName: me?.username ?? 'Someone', fromAvatar: me?.avatar ?? '🎮',
                });
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('player:find_by_code', async ({ friendCode }, cb) => {
            try {
                const player = await getPlayerByFriendCode(friendCode);
                if (!player)
                    return cb(err('No player found with that code.'));
                cb(ok(toPublicProfile(player)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Set mod level by profile ID (owner only) ───────────────
        socket.on('mod:set_mod_level', async ({ targetProfileId, level }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const mod = await getPlayer(profileId);
                if (!mod || mod.moderatorLevel !== 'owner')
                    throw new Error('Owner only.');
                const target = await getPlayer(targetProfileId);
                if (!target)
                    throw new Error('Player not found.');
                const validLevels = ['moderator', 'senior_moderator', 'admin', 'owner', null];
                if (!validLevels.includes(level))
                    throw new Error('Invalid level.');
                await setGrantedModLevel(target.id, level);
                const updated = await getPlayer(target.id);
                if (!updated)
                    throw new Error('Player not found after update.');
                const targetSock = findSocketByProfile(io, target.id);
                if (targetSock)
                    targetSock.emit('player:profile', toPublicProfile(updated));
                cb(ok({ username: target.username, newLevel: level }));
                notifyMods(io, 'mod_grant', `${mod.username} set ${target.username} → ${level ?? 'none'}`, target.username).catch(() => { });
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('mod:set_level_by_code', async ({ friendCode, level }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const mod = await getPlayer(profileId);
                if (!mod || mod.moderatorLevel !== 'owner')
                    throw new Error('Owner only.');
                const target = await getPlayerByFriendCode(friendCode);
                if (!target)
                    throw new Error('No player found with that code.');
                const validLevels = ['moderator', 'senior_moderator', 'admin', 'owner', null];
                if (!validLevels.includes(level))
                    throw new Error('Invalid level.');
                await setGrantedModLevel(target.id, level);
                const updated = await getPlayer(target.id);
                if (!updated)
                    throw new Error('Player not found after update.');
                const targetSock = findSocketByProfile(io, target.id);
                if (targetSock)
                    targetSock.emit('player:profile', toPublicProfile(updated));
                cb(ok({ username: target.username, newLevel: level }));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('friend:accept', async ({ fromProfileId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                await acceptFriend(fromProfileId, profileId);
                recordActivity(profileId, 'became_friends', fromProfileId, {}).catch(() => { });
                recordActivity(fromProfileId, 'became_friends', profileId, {}).catch(() => { });
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('friend:decline', async ({ fromProfileId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                await declineFriend(fromProfileId, profileId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('friend:remove', async ({ profileId: friendId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                await removeFriend(profileId, friendId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('friend:list', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                cb(ok(await getFriends(profileId)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // Invitable pool = friends + community follows (following + followers).
        socket.on('friend:invitable_list', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                cb(ok(await getInvitablePeople(profileId)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('friend:requests', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                cb(ok(await getPendingRequests(profileId)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Daily Quests ─────────────────────────────────────────────────
        socket.on('challenge:today', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                cb(ok(await getDailyQuestsForPlayer(profileId)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Spectator Predictions ────────────────────────────────────────
        socket.on('prediction:submit', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const parsed = z.object({ roomId: z.string(), predicted: z.enum(['mafia', 'town', 'neutral', 'cult', 'yakuza']) }).safeParse(data);
                if (!parsed.success)
                    throw new Error('Invalid prediction.');
                const room = getRoom(parsed.data.roomId);
                if (!room)
                    throw new Error('Room not found.');
                const player = [...room.players.values()].find(p => p.profileId === profileId);
                if (!player?.isSpectator)
                    throw new Error('Only spectators can predict.');
                if (room.phase === 'lobby' || room.phase === 'game_over')
                    throw new Error('Game not active.');
                await sql `
          INSERT INTO spectator_predictions (id, room_id, player_id, predicted, created_at)
          VALUES (${randomUUID()}, ${parsed.data.roomId}, ${profileId}, ${parsed.data.predicted}, ${Date.now()})
          ON CONFLICT (room_id, player_id) DO UPDATE SET predicted = ${parsed.data.predicted}, created_at = ${Date.now()}
        `;
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Cosmetics ────────────────────────────────────────────────────
        socket.on('cosmetics:equip', async ({ type, itemId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const cosmetics = await equipCosmetic(profileId, type, itemId);
                cb(ok(cosmetics));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('cosmetics:get', async ({ profileId }, cb) => {
            try {
                cb(ok(await getCosmetics(profileId)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // Batch-resolve equipped name colors for a list of profiles (for app-wide name coloring)
        socket.on('cosmetics:name_colors', async ({ profileIds }, cb) => {
            try {
                cb(ok(await getNameColors(profileIds ?? [])));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // Buy a purchasable cosmetic item with coins, then unlock it
        socket.on('cosmetics:buy_item', async ({ itemId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                // Check not already owned
                const cosmetics = await getCosmetics(profileId);
                if (cosmetics.unlockedItems.includes(itemId))
                    throw new Error('Item already owned.');
                // Deduct coins
                const { newBalance } = await purchaseCosmeticItem(profileId, itemId);
                // Unlock the item
                cosmetics.unlockedItems.push(itemId);
                await sql `UPDATE players SET cosmetics = ${JSON.stringify(cosmetics)} WHERE id = ${profileId}`;
                socket.emit('coins:updated', { coins: newBalance });
                cb(ok({ cosmetics, newBalance }));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Direct Messages ────────────────────────────────────────────────
        socket.on('dm:start', async ({ profileId: targetProfileId }, cb) => {
            try {
                const myProfileId = socket.data.profileId;
                if (!myProfileId)
                    throw new Error('Not authenticated.');
                if (myProfileId === targetProfileId)
                    throw new Error('Cannot message yourself.');
                const conv = await getOrCreateConversation(myProfileId, targetProfileId);
                const messages = await getMessages(conv.id);
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
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('dm:send', async ({ conversationId, text }, cb) => {
            try {
                const senderId = socket.data.profileId;
                if (!senderId)
                    throw new Error('Not authenticated.');
                if (!text?.trim())
                    throw new Error('Message cannot be empty.');
                const [conv] = await sql `SELECT * FROM conversations WHERE id = ${conversationId}`;
                if (!conv)
                    throw new Error('Conversation not found.');
                const receiverId = conv.participant1 === senderId ? conv.participant2 : conv.participant1;
                if (conv.participant1 !== senderId && conv.participant2 !== senderId)
                    throw new Error('Not a participant.');
                const msg = await sendMessage(conversationId, senderId, text.trim(), receiverId);
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
                }
                else {
                    // Recipient is offline — send push notification
                    sendPushToUser(receiverId, {
                        title: `💬 ${senderProfile?.username ?? 'Someone'}`,
                        body: text.trim().slice(0, 100),
                    }).catch(() => { });
                }
                cb(ok(msg));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('dm:voice', async (data, cb) => {
            try {
                const senderId = socket.data.profileId;
                if (!senderId)
                    throw new Error('Not authenticated.');
                if (!data.audioData?.startsWith('data:audio'))
                    throw new Error('Invalid audio data.');
                if (data.audioData.length > 2500000)
                    throw new Error('Voice message too large.');
                const [conv] = await sql `SELECT * FROM conversations WHERE id = ${data.conversationId}`;
                if (!conv)
                    throw new Error('Conversation not found.');
                if (conv.participant1 !== senderId && conv.participant2 !== senderId)
                    throw new Error('Not a participant.');
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
                }
                else {
                    sendPushToUser(receiverId, {
                        title: `🎙 ${senderProfile?.username ?? 'Someone'}`,
                        body: 'Sent you a voice message',
                    }).catch(() => { });
                }
                cb(ok(msg));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('dm:list', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const conversations = await listConversations(profileId);
                cb(ok(conversations));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('dm:messages', async ({ conversationId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const [conv] = await sql `SELECT * FROM conversations WHERE id = ${conversationId}`;
                if (!conv || (conv.participant1 !== profileId && conv.participant2 !== profileId)) {
                    throw new Error('Not a participant.');
                }
                const messages = await getMessages(conversationId);
                await markRead(conversationId, profileId);
                cb(ok(messages));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('dm:mark_read', async ({ conversationId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                await markRead(conversationId, profileId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('dm:unread_count', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(ok(0));
                    return;
                }
                const count = await getTotalUnread(profileId);
                cb(ok(count));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Lobby Chat ────────────────────────────────────────────────────
        socket.on('lobby:history', async (_data, cb) => {
            try {
                if (!socket.data.profileId)
                    throw new Error('Not authenticated.');
                cb(ok(_lobbyChat.slice(-50)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('lobby:send', async ({ text }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const trimmed = (text ?? '').trim().slice(0, 200);
                if (!trimmed)
                    throw new Error('Empty message.');
                const [ban, mute, player] = await Promise.all([
                    getActiveBan(profileId),
                    getActiveMute(profileId),
                    getPlayer(profileId),
                ]);
                if (ban)
                    throw new Error('You are banned.');
                if (mute)
                    throw new Error('You are muted.');
                if (!player)
                    throw new Error('Player not found.');
                const msg = {
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
                if (_lobbyChat.length > MAX_LOBBY_CHAT)
                    _lobbyChat.shift();
                io.emit('lobby:message', msg);
                cb(ok(msg));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('lobby:delete_msg', async ({ msgId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const player = await getPlayer(profileId);
                if (!player?.isModerator)
                    throw new Error('Moderator only.');
                const idx = _lobbyChat.findIndex(m => m.id === msgId);
                if (idx !== -1)
                    _lobbyChat.splice(idx, 1);
                io.emit('lobby:msg_deleted', { msgId });
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Clan Chat ─────────────────────────────────────────────────────
        // Members join their clan's chat room to receive live messages; history
        // is returned on join. The clan is always derived from the sender's own
        // membership, so a player can only ever read/write their own clan's chat.
        socket.on('clan:chat_join', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const membership = await getClanMembershipByPlayer(profileId);
                if (!membership)
                    throw new Error('You are not in a clan.');
                socket.join(`clanchat:${membership.id}`);
                cb(ok((_clanChat.get(membership.id) ?? []).slice(-50)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('clan:chat_leave', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                const membership = profileId ? await getClanMembershipByPlayer(profileId) : null;
                if (membership)
                    socket.leave(`clanchat:${membership.id}`);
                cb?.(ok(null));
            }
            catch (e) {
                cb?.(err(e.message));
            }
        });
        socket.on('clan:chat_send', async ({ text }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const trimmed = (text ?? '').trim().slice(0, 300);
                if (!trimmed)
                    throw new Error('Empty message.');
                const [ban, mute, player, membership] = await Promise.all([
                    getActiveBan(profileId),
                    getActiveMute(profileId),
                    getPlayer(profileId),
                    getClanMembershipByPlayer(profileId),
                ]);
                if (ban)
                    throw new Error('You are banned.');
                if (mute)
                    throw new Error('You are muted.');
                if (!player)
                    throw new Error('Player not found.');
                if (!membership)
                    throw new Error('You are not in a clan.');
                const msg = {
                    id: randomUUID(), clanId: membership.id, profileId,
                    username: player.username, avatar: player.avatar, avatarUrl: player.avatarUrl ?? null,
                    text: trimmed, level: player.level,
                    nameColor: player.cosmetics?.equippedNameColor ?? null, createdAt: Date.now(),
                };
                const arr = _clanChat.get(membership.id) ?? [];
                arr.push(msg);
                if (arr.length > MAX_CLAN_CHAT)
                    arr.shift();
                _clanChat.set(membership.id, arr);
                // Ensure the sender is subscribed even if they didn't explicitly join.
                socket.join(`clanchat:${membership.id}`);
                io.to(`clanchat:${membership.id}`).emit('clan:message', msg);
                cb(ok(msg));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('clan:chat_delete', async ({ msgId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const [player, membership] = await Promise.all([
                    getPlayer(profileId), getClanMembershipByPlayer(profileId),
                ]);
                if (!membership)
                    throw new Error('You are not in a clan.');
                const arr = _clanChat.get(membership.id) ?? [];
                const idx = arr.findIndex(m => m.id === msgId);
                if (idx === -1) {
                    cb(ok(null));
                    return;
                }
                const target = arr[idx];
                const isLeader = membership.memberRole === 'owner' || membership.memberRole === 'admin';
                const canDelete = target.profileId === profileId || isLeader || !!player?.isModerator;
                if (!canDelete)
                    throw new Error('Not allowed.');
                arr.splice(idx, 1);
                io.to(`clanchat:${membership.id}`).emit('clan:msg_deleted', { msgId });
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Referral count ───────────────────────────────────────────────
        socket.on('profile:referral_count', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const count = await getReferralCount(profileId);
                cb(ok(count));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Economy — Coins & Gifts ─────────────────────────────────────
        socket.on('coins:balance', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(ok({ coins: 0 }));
                    return;
                }
                const coins = await getCoins(profileId);
                cb(ok({ coins }));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('coins:daily_reward', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const result = await claimDailyReward(profileId);
                if (!result.alreadyClaimed) {
                    socket.emit('coins:updated', { coins: result.balance });
                }
                cb(ok(result));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('coins:send_gift', async ({ recipientId, giftId, message }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const { newSenderBalance, giftEntry } = await sendGift(profileId, recipientId, giftId, message ?? '');
                socket.emit('coins:updated', { coins: newSenderBalance });
                // Notify recipient in real-time if connected
                const recipientSock = findSocketByProfile(io, recipientId);
                if (recipientSock) {
                    recipientSock.emit('gifts:received', {
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
                socket.emit('gifts:sent', { giftId: giftEntry.giftId });
                cb(ok({ newBalance: newSenderBalance }));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('coins:transactions', async ({ profileId: targetId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                // A player can view their own transactions; owner can view anyone's
                const requester = await getPlayer(profileId);
                const resolvedId = targetId && requester?.moderatorLevel === 'owner' ? targetId : profileId;
                const txs = await getTransactions(resolvedId);
                cb(ok(txs));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('gifts:catalog', async (cb) => {
            try {
                const catalog = await getGiftCatalog(false);
                cb(ok(catalog));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('gifts:player_gifts', async ({ profileId: targetId }, cb) => {
            try {
                if (!targetId)
                    throw new Error('profileId required.');
                const gifts = await getPlayerGifts(targetId);
                cb(ok(gifts));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('gifts:detail', async ({ giftId, recipientId }, cb) => {
            try {
                if (!giftId || !recipientId)
                    throw new Error('giftId and recipientId required.');
                const detail = await getGiftDetail(giftId, recipientId);
                if (!detail)
                    throw new Error('Gift not found.');
                cb(ok(detail));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Gift Leaderboard ─────────────────────────────────────────────
        socket.on('gifts:leaderboard', async (cb) => {
            try {
                const topGifters = await sql `
          SELECT p.id AS "profileId", p.username, p.avatar,
                 p.avatar_url AS "avatarUrl",
                 COUNT(pg.id)::int AS "giftCount",
                 COALESCE(SUM(pg.coin_cost), 0)::int AS "totalSpent"
          FROM player_gifts pg
          JOIN players p ON p.id = pg.sender_id
          GROUP BY p.id, p.username, p.avatar, p.avatar_url
          ORDER BY "totalSpent" DESC, "giftCount" DESC
          LIMIT 10
        `;
                const topRecipients = await sql `
          SELECT p.id AS "profileId", p.username, p.avatar,
                 p.avatar_url AS "avatarUrl",
                 COUNT(pg.id)::int AS "giftCount",
                 COALESCE(SUM(pg.coin_cost), 0)::int AS "totalReceived"
          FROM player_gifts pg
          JOIN players p ON p.id = pg.recipient_id
          GROUP BY p.id, p.username, p.avatar, p.avatar_url
          ORDER BY "totalReceived" DESC, "giftCount" DESC
          LIMIT 10
        `;
                cb(ok({ topGifters, topRecipients }));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('gifts:getSent', async ({ profileId: targetId }, cb) => {
            try {
                if (!targetId)
                    throw new Error('profileId required.');
                const gifts = await getGiftsSent(targetId);
                cb(ok(gifts));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('gifts:getTimeline', async ({ profileId: targetId }, cb) => {
            try {
                if (!targetId)
                    throw new Error('profileId required.');
                const timeline = await getGiftTimeline(targetId);
                cb(ok(timeline));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('gifts:getStats', async ({ profileId: targetId }, cb) => {
            try {
                if (!targetId)
                    throw new Error('profileId required.');
                const stats = await getGiftStats(targetId);
                cb(ok(stats));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('gifts:getPinned', async ({ profileId: targetId }, cb) => {
            try {
                if (!targetId)
                    throw new Error('profileId required.');
                const pinned = await getPinnedGifts(targetId);
                cb(ok(pinned));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('gifts:pin', async ({ giftId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                if (!giftId)
                    throw new Error('giftId required.');
                await pinGift(profileId, giftId);
                cb(ok({}));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('gifts:unpin', async ({ giftId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                if (!giftId)
                    throw new Error('giftId required.');
                await unpinGift(profileId, giftId);
                cb(ok({}));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('gifts:hide', async ({ giftId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                if (!giftId)
                    throw new Error('giftId required.');
                await hideGift(profileId, giftId);
                cb(ok({}));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('gifts:unhide', async ({ giftId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                if (!giftId)
                    throw new Error('giftId required.');
                await unhideGift(profileId, giftId);
                cb(ok({}));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('gifts:getHidden', async (_, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const gifts = await getHiddenGifts(profileId);
                cb(ok(gifts));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Economy — Owner only ────────────────────────────────────────
        socket.on('owner:coins_grant', async ({ targetProfileId, amount, description }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const requester = await getPlayer(profileId);
                if (requester?.moderatorLevel !== 'owner')
                    throw new Error('Owner only.');
                const target = await getPlayer(targetProfileId);
                if (!target)
                    throw new Error('Player not found.');
                const result = await grantCoins(profileId, targetProfileId, Number(amount), description ?? '');
                // Notify target if online
                const targetSock = findSocketByProfile(io, targetProfileId);
                if (targetSock)
                    targetSock.emit('coins:updated', { coins: result.newBalance });
                cb(ok(result));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('owner:coins_deduct', async ({ targetProfileId, amount, description }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const requester = await getPlayer(profileId);
                if (requester?.moderatorLevel !== 'owner')
                    throw new Error('Owner only.');
                const target = await getPlayer(targetProfileId);
                if (!target)
                    throw new Error('Player not found.');
                const result = await deductCoins(profileId, targetProfileId, Number(amount), description ?? '');
                const targetSock = findSocketByProfile(io, targetProfileId);
                if (targetSock)
                    targetSock.emit('coins:updated', { coins: result.newBalance });
                cb(ok(result));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('owner:coins_refund', async ({ transactionId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const requester = await getPlayer(profileId);
                if (requester?.moderatorLevel !== 'owner')
                    throw new Error('Owner only.');
                await refundGift(transactionId, profileId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('owner:gift_create', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const requester = await getPlayer(profileId);
                if (requester?.moderatorLevel !== 'owner')
                    throw new Error('Owner only.');
                const gift = await createGift(profileId, data);
                cb(ok(gift));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('owner:gift_update', async ({ giftId, ...data }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const requester = await getPlayer(profileId);
                if (requester?.moderatorLevel !== 'owner')
                    throw new Error('Owner only.');
                if (!giftId)
                    throw new Error('giftId required.');
                const gift = await updateGift(giftId, data);
                cb(ok(gift));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('owner:gift_catalog_all', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const requester = await getPlayer(profileId);
                if (requester?.moderatorLevel !== 'owner')
                    throw new Error('Owner only.');
                const catalog = await getGiftCatalog(true);
                cb(ok(catalog));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('owner:all_transactions', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const requester = await getPlayer(profileId);
                if (requester?.moderatorLevel !== 'owner')
                    throw new Error('Owner only.');
                const txs = await getAllTransactions(500);
                cb(ok(txs));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Ranked ELO ──────────────────────────────────────────────────
        socket.on('rating:get_my', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
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
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('rating:leaderboard', async (cb) => {
            try {
                const data = await getRankedLeaderboard(50);
                cb(ok(data));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Season ──────────────────────────────────────────────────────
        socket.on('season:current', async (cb) => {
            try {
                const season = await getActiveSeason();
                cb(ok(season));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('season:leaderboard', async (data, cb) => {
            try {
                const entries = await getSeasonLeaderboard(data?.seasonId ?? '');
                cb(ok(entries));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('season:my_history', async (cb) => {
            try {
                if (!socket.data.profileId) {
                    cb(err('Not authenticated'));
                    return;
                }
                const history = await getMySeasonHistory(socket.data.profileId);
                cb(ok(history));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Replays ─────────────────────────────────────────────────────
        socket.on('replay:list', async (data, cb) => {
            try {
                const { limit = 20, offset = 0 } = data ?? {};
                const replays = await listReplays(limit, offset);
                cb(ok(replays));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('replay:get', async (data, cb) => {
            try {
                const replay = await getReplay(data.replayId);
                if (!replay) {
                    cb(err('Not found'));
                    return;
                }
                cb(ok(replay));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('replay:my', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated'));
                    return;
                }
                const replays = await getMyReplays(profileId);
                cb(ok(replays));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Push Notifications ───────────────────────────────────────────
        socket.on('push:subscribe', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const { endpoint, p256dh, auth } = data;
                if (!endpoint || !p256dh || !auth)
                    throw new Error('Invalid subscription data.');
                await sql `
          INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
          VALUES (${profileId}, ${endpoint}, ${p256dh}, ${auth})
          ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
        `;
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('push:unsubscribe', async (data, cb) => {
            try {
                const { endpoint } = data;
                if (endpoint)
                    await sql `DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Spectator Theater: Spec Chat ──────────────────────────────────────
        socket.on('spec:chat', async (data, cb) => {
            try {
                if (!rateOk(socket.id, 10)) {
                    cb(err('Rate limit.'));
                    return;
                }
                const room = getRoom(data.roomId);
                if (!room) {
                    cb(err('Room not found.'));
                    return;
                }
                const player = getPlayerBySocket(room, socket.id);
                if (!player?.isSpectator) {
                    cb(err('Only spectators can use spec chat.'));
                    return;
                }
                const text = (data.text ?? '').trim().slice(0, 200);
                if (!text) {
                    cb(err('Message is empty.'));
                    return;
                }
                const msg = {
                    id: randomUUID(),
                    senderId: player.profileId ?? player.id,
                    senderName: player.name,
                    text,
                    t: Date.now(),
                };
                io.to(`spec:${data.roomId}`).emit('spec:message', msg);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message ?? 'Error'));
            }
        });
        // ── Spectator Theater: Cast Suspicion Vote ─────────────────────────────
        socket.on('spec:vote_suspect', async (data, cb) => {
            try {
                const room = getRoom(data.roomId);
                if (!room) {
                    cb(err('Room not found.'));
                    return;
                }
                const player = getPlayerBySocket(room, socket.id);
                if (!player?.isSpectator) {
                    cb(err('Only spectators can vote.'));
                    return;
                }
                if (room.phase === 'lobby' || room.phase === 'game_over') {
                    cb(err('No active game.'));
                    return;
                }
                const suspect = room.players.get(data.suspectedPlayerId);
                if (!suspect || suspect.isSpectator) {
                    cb(err('Invalid suspect.'));
                    return;
                }
                const voterId = player.profileId ?? player.id;
                const gameId = room.startedAt ? `${room.id}_${room.startedAt}` : room.id;
                await sql `
          INSERT INTO spectator_suspicion_votes (id, game_id, voter_id, suspected_player_id, created_at)
          VALUES (${randomUUID()}, ${gameId}, ${voterId}, ${data.suspectedPlayerId}, ${Date.now()})
          ON CONFLICT (game_id, voter_id) DO UPDATE SET suspected_player_id = EXCLUDED.suspected_player_id, created_at = EXCLUDED.created_at
        `;
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message ?? 'Error'));
            }
        });
        // ── Spectator Theater: Get Suspicion Results ───────────────────────────
        socket.on('spec:suspicion_results', async (data, cb) => {
            try {
                const votes = await sql `
          SELECT voter_id, suspected_player_id FROM spectator_suspicion_votes
          WHERE game_id = ${data.gameId}
        `;
                cb(ok(votes));
            }
            catch (e) {
                cb(err(e.message ?? 'Error'));
            }
        });
        // ════════════════════════════════════════════════════════════════
        // Community Hub — completely separate from Mafia game rooms/state.
        // ════════════════════════════════════════════════════════════════
        // ── Void News ─────────────────────────────────────────────────
        socket.on('community:news_list', async (cb) => {
            try {
                cb(ok(await listNews()));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:news_create', async ({ title, content, pinned }, cb) => {
            try {
                const profileId = socket.data.profileId;
                await requireOwnerLevel(profileId);
                const post = await createNews(profileId, title, content, !!pinned);
                await notifyAllPlayers('void_news', 'Void News', post.title, null);
                cb(ok(post));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:news_delete', async ({ id }, cb) => {
            try {
                await requireOwnerLevel(socket.data.profileId);
                await deleteNews(id);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Max Recommends ───────────────────────────────────────────
        socket.on('community:recommend_list', async (cb) => {
            try {
                cb(ok(await listRecommends()));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:recommend_create', async ({ category, title, review, imageUrl }, cb) => {
            try {
                await requireOwnerLevel(socket.data.profileId);
                cb(ok(await createRecommend(category, title, review, imageUrl ?? null)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:recommend_delete', async ({ id }, cb) => {
            try {
                await requireOwnerLevel(socket.data.profileId);
                await deleteRecommend(id);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Daily Thoughts ───────────────────────────────────────────
        socket.on('community:thought_list', async (cb) => {
            try {
                cb(ok(await listThoughts()));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:thought_create', async ({ content, pinned }, cb) => {
            try {
                await requireOwnerLevel(socket.data.profileId);
                cb(ok(await createThought(content, !!pinned)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:thought_delete', async ({ id }, cb) => {
            try {
                await requireOwnerLevel(socket.data.profileId);
                await deleteThought(id);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Community Feed ───────────────────────────────────────────
        socket.on('community:feed_list', async ({ before }, cb) => {
            try {
                cb(ok(await listFeed(socket.data.profileId, before)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:post_create', async ({ content, imageUrl }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                await requireNotCommunityBanned(profileId);
                const post = await createPost(profileId, content, imageUrl ?? null);
                io.emit('community:post_new', post);
                cb(ok(post));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:post_delete', async ({ id }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const requester = await getPlayer(profileId);
                const isMod = !!requester && canDo(requester, 'kick');
                await deletePost(id, profileId, isMod);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:post_like', async ({ postId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                cb(ok(await toggleLike(postId, profileId)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:post_react', async ({ postId, emoji }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const result = await togglePostReaction(postId, profileId, emoji);
                cb(ok(result));
                // Broadcast to others
                io.emit('community:post_reacted', { postId, reactions: result.reactions, myReaction: result.myReaction });
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:get_reaction_users', async ({ postId }, cb) => {
            try {
                const rows = await sql `
          SELECT r.emoji, p.username, p.avatar_url, r.player_id
          FROM community_post_reactions r
          JOIN players p ON p.id = r.player_id
          WHERE r.post_id = ${postId}
          ORDER BY r.created_at ASC
        `;
                cb(ok(rows));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:leaderboard', async (cb) => {
            try {
                const leaders = await getWeeklyLeaderboard();
                cb(ok(leaders));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:post_comment', async ({ postId, content }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                await requireNotCommunityBanned(profileId);
                cb(ok(await addComment(postId, profileId, content)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:post_comments', async ({ postId }, cb) => {
            try {
                cb(ok(await getComments(postId)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:comment_delete', async ({ commentId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                await deleteComment(commentId, profileId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:post_report', async ({ postId, reason }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                await reportPost(postId, profileId, reason);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Follow System ─────────────────────────────────────────────
        socket.on('community:follow', async ({ targetId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                await follow(profileId, targetId);
                const follower = await getPlayer(profileId);
                const notif = await createNotification(targetId, 'new_follower', 'New follower', `${follower?.username ?? 'Someone'} started following you.`, null);
                const targetSock = findSocketByProfile(io, targetId);
                if (targetSock)
                    targetSock.emit('community:notification', notif);
                recordActivity(profileId, 'followed', targetId, { targetUsername: follower?.username }).catch(() => { });
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:unfollow', async ({ targetId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                await unfollow(profileId, targetId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:profile', async ({ profileId: targetId }, cb) => {
            try {
                const viewerId = socket.data.profileId ?? '';
                const profile = await getCommunityProfileV2(targetId, viewerId);
                if (!profile) {
                    cb(err('Player not found.'));
                    return;
                }
                cb(ok(profile));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Community Events ──────────────────────────────────────────
        socket.on('community:event_list', async (cb) => {
            try {
                cb(ok(await listEvents(socket.data.profileId)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:event_create', async ({ title, description, category, eventAt }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                cb(ok(await createEvent(profileId, title, description, category, eventAt)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:event_join', async ({ eventId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                await joinEvent(eventId, profileId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:event_leave', async ({ eventId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                await leaveEvent(eventId, profileId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Notifications ─────────────────────────────────────────────
        socket.on('community:notifications', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                cb(ok(await listNotifications(profileId)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:notifications_unread', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                cb(ok(await getUnreadNotificationCount(profileId)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:notifications_mark_read', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                await markNotificationsRead(profileId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Community Lounges ─────────────────────────────────────────
        socket.on('community:lounge_list', async (cb) => {
            try {
                const rows = await listLoungeRows();
                const lounges = rows.map((row) => {
                    const { listenerCount, speakerCount } = loungeGetCounts(row.id);
                    return rowToLounge(row, listenerCount, speakerCount);
                });
                cb(ok(lounges));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:lounge_create', async ({ name, description }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                await requireNotCommunityBanned(profileId);
                cb(ok(await createLounge(profileId, name, description)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:lounge_delete', async ({ loungeId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const requester = await getPlayer(profileId);
                const isMod = !!requester?.moderatorLevel;
                // Force-remove all members from in-memory state
                const members = loungeGetMembers(loungeId);
                for (const m of members) {
                    loungeRemoveMember(loungeId, m.socketId);
                    io.to(m.socketId).emit('lounge:kicked');
                }
                await deleteLounge(loungeId, profileId, isMod);
                io.emit('community:lounge_removed', { loungeId });
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:lounge_set_live', async ({ loungeId, isLive, lastTopic }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const row = await getLoungeRow(loungeId);
                if (!row)
                    throw new Error('Lounge not found.');
                const requester = await getPlayer(profileId);
                const isOwnerLevel = requester?.moderatorLevel === 'owner';
                const isLoungeOwner = row.owner_id === profileId;
                if (!isOwnerLevel && !isLoungeOwner)
                    throw new Error('Not authorized.');
                await setLoungeLive(loungeId, isLive, lastTopic ?? null);
                await broadcastLoungeState(io, loungeId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Community Moderation (separate from Mafia mod tools) ───────
        socket.on('community:report_list', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const requester = await getPlayer(profileId);
                if (!requester || !canDo(requester, 'view_reports'))
                    throw new Error('Insufficient permissions.');
                cb(ok(await listCommunityReports()));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:report_resolve', async ({ reportId, status }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const requester = await getPlayer(profileId);
                if (!requester || !canDo(requester, 'resolve_reports'))
                    throw new Error('Insufficient permissions.');
                await resolveCommunityReport(reportId, status);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:ban', async ({ targetProfileId, reason, duration }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const requester = await getPlayer(profileId);
                if (!requester || !canDo(requester, 'ban_short'))
                    throw new Error('Insufficient permissions.');
                const ban = await communityBanPlayer(targetProfileId, profileId, reason, duration);
                const targetSock = findSocketByProfile(io, targetProfileId);
                if (targetSock)
                    targetSock.emit('community:notification', {
                        id: ban.id, type: 'community_ban', title: 'Community Hub access restricted',
                        body: reason, link: null, read: false, createdAt: ban.issuedAt,
                    });
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:unban', async ({ targetProfileId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                const requester = await getPlayer(profileId);
                if (!requester || !canDo(requester, 'ban_short'))
                    throw new Error('Insufficient permissions.');
                await communityUnbanPlayer(targetProfileId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Community V2 Extensions ─────────────────────────────────────────────
        socket.on('community:profile_update', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                await updateCommunityProfile(profileId, data);
                const profile = await getCommunityProfileV2(profileId, profileId);
                cb(ok(profile));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:feed_v2', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const posts = await listFeedV2(profileId, { category: data.category ?? 'all', before: data.before, hashtag: data.hashtag });
                cb(ok(posts));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:user_posts', async ({ authorId, before }, cb) => {
            try {
                const viewerId = socket.data.profileId ?? '';
                const posts = await getUserPosts(authorId, viewerId, { before });
                cb(ok(posts));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:post_create_v2', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                if (!data.content?.trim() && data.postType === 'text') {
                    cb(err('Content required.'));
                    return;
                }
                const post = await createPostV2(profileId, data);
                io.emit('community:post_new', post);
                recordActivity(profileId, 'posted', post.id, { postType: data.postType, preview: data.content?.slice(0, 80) ?? '' }).catch(() => { });
                cb(ok(post));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:post_pin', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const profile = await getPlayer(profileId);
                if (!profile?.isModerator && profile?.moderatorLevel !== 'owner') {
                    cb(err('Unauthorized.'));
                    return;
                }
                await pinPost(data.postId, data.pin, profileId);
                io.emit('community:post_pinned', data.postId);
                cb(ok(undefined));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:post_feature', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const profile = await getPlayer(profileId);
                if (!profile?.isModerator && profile?.moderatorLevel !== 'owner') {
                    cb(err('Unauthorized.'));
                    return;
                }
                await featurePost(data.postId, data.feature, profileId);
                cb(ok(undefined));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:post_hide', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const profile = await getPlayer(profileId);
                if (!profile?.isModerator && profile?.moderatorLevel !== 'owner') {
                    cb(err('Unauthorized.'));
                    return;
                }
                await hidePost(data.postId, profileId);
                io.emit('community:post_hidden', data.postId);
                cb(ok(undefined));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:post_save', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const saved = await togglePostSave(data.postId, profileId);
                cb(ok({ saved }));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:post_saves', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const posts = await getSavedPosts(profileId, data.before);
                cb(ok(posts));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:poll_vote', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const results = await votePoll(data.postId, profileId, data.optionId);
                cb(ok(results));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:showcase_set', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                await setShowcaseAchievement(profileId, data.slot, data.achievementKey);
                cb(ok(undefined));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:showcase_clear', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                await clearShowcaseSlot(profileId, data.slot);
                cb(ok(undefined));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:people_list', async (dataOrCb, maybeCb) => {
            const cb = typeof dataOrCb === 'function' ? dataOrCb : maybeCb;
            const data = typeof dataOrCb === 'function' ? {} : (dataOrCb ?? {});
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const people = await listPeopleDirectory(profileId);
                cb(ok(people));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:followers_list', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const list = await getFollowersList(data.profileId, profileId);
                cb(ok(list));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:following_list', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const list = await getFollowingList(data.profileId, profileId);
                cb(ok(list));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:search', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                if (!data.query?.trim()) {
                    cb(ok({ posts: [], people: [], hashtags: [], lounges: [] }));
                    return;
                }
                const results = await searchCommunity(data.query, profileId);
                cb(ok(results));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:online_members', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                await upsertOnlineSeen(profileId);
                const members = await getOnlineMembers();
                cb(ok({ members, count: members.length }));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:badge_assign', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const profile = await getPlayer(profileId);
                if (profile?.moderatorLevel !== 'owner' && !profile?.isModerator) {
                    cb(err('Unauthorized.'));
                    return;
                }
                await assignBadge(data.targetId, data.badge, profileId);
                cb(ok(undefined));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:badge_revoke', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const profile = await getPlayer(profileId);
                if (profile?.moderatorLevel !== 'owner' && !profile?.isModerator) {
                    cb(err('Unauthorized.'));
                    return;
                }
                await revokeBadge(data.targetId, data.badge);
                cb(ok(undefined));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Debate Rooms ──────────────────────────────────────────────────────
        socket.on('debate:list', async ({ status } = {}, cb) => {
            try {
                const safeStatus = (status === 'all' || status === 'open' || status === 'finished') ? status : 'open';
                const debates = await listDebates(safeStatus);
                cb(ok(debates));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('debate:get', async ({ debateId }, cb) => {
            try {
                const profileId = socket.data.profileId ?? '';
                const debate = await getDebateFull(debateId, profileId);
                if (!debate) {
                    cb(err('Debate not found.'));
                    return;
                }
                cb(ok(debate));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('debate:create', async ({ topic, description }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const debate = await createDebate(profileId, topic, description ?? '');
                io.emit('debate:new', debate);
                cb(ok(debate));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('debate:join', async ({ debateId, side }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const safeSide = (side === 'pro' || side === 'con' || side === 'spectator') ? side : 'spectator';
                const participant = await joinDebate(debateId, profileId, safeSide);
                io.to(`debate:${debateId}`).emit('debate:participant_update', participant);
                socket.join(`debate:${debateId}`);
                // Emit current debate state so the joining socket gets phase info
                const debateFull = await getDebateFull(debateId, profileId);
                if (debateFull) {
                    socket.emit('debate:phase_update', debateFull);
                }
                recordActivity(profileId, 'joined_debate', debateId, { side }).catch(() => { });
                cb(ok(participant));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('debate:argument', async ({ debateId, content }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const arg = await postArgument(debateId, profileId, content);
                io.to(`debate:${debateId}`).emit('debate:new_argument', arg);
                recordActivity(profileId, 'debate_argument', debateId, { preview: content.slice(0, 80) }).catch(() => { });
                cb(ok(arg));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('debate:vote', async ({ debateId, side }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const counts = await voteDebate(debateId, profileId, side);
                io.to(`debate:${debateId}`).emit('debate:vote_update', { debateId, counts });
                cb(ok(counts));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('debate:close', async ({ debateId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const debate = await closeDebate(debateId, profileId);
                io.emit('debate:closed', debate);
                cb(ok(debate));
            }
            catch (e) {
                cb(err(e.message));
            }
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
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const debate = await startDebate(debateId, profileId);
                io.to(`debate:${debateId}`).emit('debate:phase_update', debate);
                const dur = PHASE_DURATION_SECONDS[debate.phase] ?? 0;
                if (dur > 0)
                    scheduleDebatePhaseAdvance(io, debateId, dur);
                cb(ok(debate));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('debate:skip_phase', async ({ debateId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const existing = debatePhaseTimers.get(debateId);
                if (existing) {
                    clearTimeout(existing);
                    debatePhaseTimers.delete(debateId);
                }
                const debate = await skipPhase(debateId, profileId);
                io.to(`debate:${debateId}`).emit('debate:phase_update', debate);
                const dur = PHASE_DURATION_SECONDS[debate.phase] ?? 0;
                if (dur > 0)
                    scheduleDebatePhaseAdvance(io, debateId, dur);
                cb(ok(debate));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('debate:raise_hand', async ({ debateId, side }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const safeSide = side === 'pro' ? 'pro' : 'con';
                await raiseHand(debateId, profileId, safeSide);
                const hands = await getRaisedHands(debateId);
                io.to(`debate:${debateId}`).emit('debate:hands_update', { debateId, hands });
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('debate:lower_hand', async ({ debateId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                await lowerHand(debateId, profileId);
                const hands = await getRaisedHands(debateId);
                io.to(`debate:${debateId}`).emit('debate:hands_update', { debateId, hands });
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('debate:promote', async ({ debateId, targetPlayerId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const participant = await promoteSpeaker(debateId, targetPlayerId, profileId);
                const hands = await getRaisedHands(debateId);
                io.to(`debate:${debateId}`).emit('debate:participant_update', participant);
                io.to(`debate:${debateId}`).emit('debate:hands_update', { debateId, hands });
                cb(ok(participant));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('debate:voice_join', async ({ debateId, side }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const player = await getPlayer(profileId);
                const safeSide = (side === 'pro' || side === 'con' || side === 'spectator') ? side : 'spectator';
                const peers = debateVoiceJoin(debateId, profileId, socket.id, safeSide, player?.username ?? '???');
                const iceServers = buildIceConfig();
                socket.join(`debate:voice:${debateId}`);
                socket.to(`debate:voice:${debateId}`).emit('debate:voice_peer_joined', {
                    socketId: socket.id, playerId: profileId, username: player?.username ?? '???', side: safeSide
                });
                cb(ok({ peers: peers.map(p => ({ socketId: p.socketId, playerId: p.playerId, username: p.username, side: p.side })), iceServers }));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('debate:voice_leave', ({ debateId }, cb) => {
            const profileId = socket.data.profileId;
            if (profileId) {
                debateVoiceLeave(debateId, profileId);
                socket.leave(`debate:voice:${debateId}`);
                socket.to(`debate:voice:${debateId}`).emit('debate:voice_peer_left', { socketId: socket.id });
            }
            if (typeof cb === 'function')
                cb(ok(null));
        });
        socket.on('debate:voice_offer', ({ debateId, to, sdp }, cb) => {
            io.to(to).emit('debate:voice_offer', { from: socket.id, sdp });
            if (typeof cb === 'function')
                cb(ok(null));
        });
        socket.on('debate:voice_answer', ({ debateId, to, sdp }, cb) => {
            io.to(to).emit('debate:voice_answer', { from: socket.id, sdp });
            if (typeof cb === 'function')
                cb(ok(null));
        });
        socket.on('debate:voice_ice', ({ debateId, to, candidate }, cb) => {
            io.to(to).emit('debate:voice_ice', { from: socket.id, candidate });
            if (typeof cb === 'function')
                cb(ok(null));
        });
        // ── Activity Feed ─────────────────────────────────────────────────────
        socket.on('activity:feed', async (_data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const events = await getFriendActivityFeed(profileId);
                cb(ok(events));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:privacy_get', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const settings = await getPrivacySettings(profileId);
                cb(ok(settings));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:privacy_set', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                await setPrivacySettings(profileId, data);
                cb(ok(undefined));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('community:mod_logs', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const profile = await getPlayer(profileId);
                if (!profile?.isModerator && profile?.moderatorLevel !== 'owner') {
                    cb(err('Unauthorized.'));
                    return;
                }
                const logs = await getCommunityModLogs(100);
                cb(ok(logs));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Admin Panel Events ────────────────────────────────────────────────
        socket.on('admin:user_search', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const requester = await getPlayer(profileId);
                if (!requester || !['moderator', 'senior_moderator', 'admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
                    cb(err('Unauthorized.'));
                    return;
                }
                const { query } = data;
                if (!query || query.trim().length < 2) {
                    cb(err('Query too short.'));
                    return;
                }
                const users = await adminSearchUser(query.trim());
                cb(ok(users));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('admin:user_profile', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const requester = await getPlayer(profileId);
                if (!requester || !['moderator', 'senior_moderator', 'admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
                    cb(err('Unauthorized.'));
                    return;
                }
                const { playerId } = data;
                const profile = await adminGetUserProfile(playerId);
                if (!profile) {
                    cb(err('User not found.'));
                    return;
                }
                cb(ok(profile));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('admin:user_action', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const requester = await getPlayer(profileId);
                if (!requester || !['moderator', 'senior_moderator', 'admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
                    cb(err('Unauthorized.'));
                    return;
                }
                const { action, playerId, reason, duration } = data;
                if (action === 'warn') {
                    await issueWarning(playerId, requester.id, reason ?? '');
                    await logCommunityModAction(requester.id, 'warn', playerId, null, reason ?? '');
                }
                else if (action === 'mute') {
                    await muteUser(playerId, requester.id, reason ?? '', duration ?? 3600);
                    await logCommunityModAction(requester.id, 'mute', playerId, null, reason ?? '');
                }
                else if (action === 'unmute') {
                    await unmuteUser(playerId);
                    await logCommunityModAction(requester.id, 'unmute', playerId, null, '');
                }
                else if (action === 'suspend') {
                    await suspendUser(playerId, requester.id, reason ?? '', duration ?? 86400);
                    await logCommunityModAction(requester.id, 'suspend', playerId, null, reason ?? '');
                }
                else if (action === 'unsuspend') {
                    await liftSuspension(playerId);
                    await logCommunityModAction(requester.id, 'unsuspend', playerId, null, '');
                }
                else if (action === 'ban') {
                    await communityBanPlayer(playerId, requester.id, reason ?? '', 0);
                    await logCommunityModAction(requester.id, 'ban', playerId, null, reason ?? '');
                }
                else if (action === 'unban') {
                    await communityUnbanPlayer(playerId);
                    await logCommunityModAction(requester.id, 'unban', playerId, null, '');
                }
                else if (action === 'profile_controls') {
                    if (requester.moderatorLevel !== 'owner' && requester.moderatorLevel !== 'admin') {
                        cb(err('Unauthorized.'));
                        return;
                    }
                    const { profileLocked, secretModeDisabled, forcePublic } = data;
                    await setProfileControls(playerId, { profileLocked, secretModeDisabled, forcePublic });
                    await logCommunityModAction(requester.id, 'profile_controls', playerId, null, JSON.stringify({ profileLocked, secretModeDisabled, forcePublic }));
                }
                else {
                    cb(err('Unknown action.'));
                    return;
                }
                cb(ok({}));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('admin:post_action', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const requester = await getPlayer(profileId);
                if (!requester || !['moderator', 'senior_moderator', 'admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
                    cb(err('Unauthorized.'));
                    return;
                }
                const { action, postId } = data;
                if (action === 'delete') {
                    if (requester.moderatorLevel !== 'owner') {
                        cb(err('Only owner can delete posts.'));
                        return;
                    }
                    await adminDeletePost(postId, requester.id);
                    await logCommunityModAction(requester.id, 'delete_post', null, postId, '');
                    io.emit('community:post_deleted', { postId });
                }
                else if (action === 'restore') {
                    if (requester.moderatorLevel !== 'owner') {
                        cb(err('Only owner can restore.'));
                        return;
                    }
                    await adminRestorePost(postId);
                    await logCommunityModAction(requester.id, 'restore_post', null, postId, '');
                }
                else if (action === 'pin') {
                    await pinPost(postId, true, requester.id);
                    io.emit('community:post_pinned', postId);
                }
                else if (action === 'unpin') {
                    await pinPost(postId, false, requester.id);
                    io.emit('community:post_pinned', postId);
                }
                else if (action === 'feature') {
                    await featurePost(postId, true, requester.id);
                    io.emit('community:post_featured', { postId, featured: true });
                }
                else if (action === 'unfeature') {
                    await featurePost(postId, false, requester.id);
                    io.emit('community:post_featured', { postId, featured: false });
                }
                else if (action === 'hide') {
                    await hidePost(postId, requester.id);
                    io.emit('community:post_hidden', postId);
                }
                else {
                    cb(err('Unknown action.'));
                    return;
                }
                cb(ok({}));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('admin:post_list', async (_data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const requester = await getPlayer(profileId);
                if (!requester || !['moderator', 'senior_moderator', 'admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
                    cb(err('Unauthorized.'));
                    return;
                }
                const isOwner = requester.moderatorLevel === 'owner';
                const rows = await sql `
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
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('admin:comment_action', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const requester = await getPlayer(profileId);
                if (!requester || !['moderator', 'senior_moderator', 'admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
                    cb(err('Unauthorized.'));
                    return;
                }
                const { action, commentId } = data;
                if (action === 'delete') {
                    await adminDeleteComment(commentId, requester.id);
                    await logCommunityModAction(requester.id, 'delete_comment', null, null, commentId);
                    io.emit('community:comment_deleted', { commentId });
                }
                else if (action === 'restore') {
                    if (requester.moderatorLevel !== 'owner') {
                        cb(err('Only owner can restore.'));
                        return;
                    }
                    await adminRestoreComment(commentId);
                    await logCommunityModAction(requester.id, 'restore_comment', null, null, commentId);
                }
                else {
                    cb(err('Unknown action.'));
                    return;
                }
                cb(ok({}));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('admin:debate_action', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const requester = await getPlayer(profileId);
                if (!requester || !['moderator', 'senior_moderator', 'admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
                    cb(err('Unauthorized.'));
                    return;
                }
                const { action, debateId } = data;
                if (action === 'delete') {
                    await adminDeleteDebate(debateId, requester.id);
                    await logCommunityModAction(requester.id, 'delete_debate', null, debateId, '');
                    io.emit('community:debate_deleted', { debateId });
                }
                else if (action === 'restore') {
                    if (requester.moderatorLevel !== 'owner') {
                        cb(err('Only owner can restore.'));
                        return;
                    }
                    await adminRestoreDebate(debateId);
                }
                else if (action === 'pin') {
                    await adminSetDebateFlags(debateId, { pinned: true });
                    await logCommunityModAction(requester.id, 'pin_debate', null, debateId, '');
                    io.emit('community:debate_updated', { debateId, pinned: true });
                }
                else if (action === 'unpin') {
                    await adminSetDebateFlags(debateId, { pinned: false });
                    io.emit('community:debate_updated', { debateId, pinned: false });
                }
                else if (action === 'feature') {
                    await adminSetDebateFlags(debateId, { featured: true });
                    await logCommunityModAction(requester.id, 'feature_debate', null, debateId, '');
                    io.emit('community:debate_updated', { debateId, featured: true });
                }
                else if (action === 'unfeature') {
                    await adminSetDebateFlags(debateId, { featured: false });
                    io.emit('community:debate_updated', { debateId, featured: false });
                }
                else if (action === 'lock') {
                    await adminSetDebateFlags(debateId, { locked: true });
                    await logCommunityModAction(requester.id, 'lock_debate', null, debateId, '');
                    io.emit('community:debate_updated', { debateId, locked: true });
                }
                else if (action === 'unlock') {
                    await adminSetDebateFlags(debateId, { locked: false });
                    io.emit('community:debate_updated', { debateId, locked: false });
                }
                else {
                    cb(err('Unknown action.'));
                    return;
                }
                cb(ok({}));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('admin:report_list', async (_data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const requester = await getPlayer(profileId);
                if (!requester || !['moderator', 'senior_moderator', 'admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
                    cb(err('Unauthorized.'));
                    return;
                }
                const reports = await listAllReports();
                cb(ok(reports));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('admin:audit_logs', async (_data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const requester = await getPlayer(profileId);
                if (!requester || !['admin', 'owner'].includes(requester.moderatorLevel ?? '')) {
                    cb(err('Unauthorized.'));
                    return;
                }
                const logs = await getAdminAuditLogs();
                cb(ok(logs));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('admin:deleted_content', async (data, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId) {
                    cb(err('Not authenticated.'));
                    return;
                }
                const requester = await getPlayer(profileId);
                if (!requester || requester.moderatorLevel !== 'owner') {
                    cb(err('Unauthorized.'));
                    return;
                }
                const { type } = data;
                const content = await listDeletedContent(type);
                cb(ok(content));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ════════════════════════════════════════════════════════════════
        // Lounge Voice — independent P2P mesh signaling for Community
        // lounges. Mirrors voice:* above but with zero Room/Phase coupling.
        // ════════════════════════════════════════════════════════════════
        socket.on('lounge:join', async ({ loungeId, asSpeaker }, cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                await requireNotCommunityBanned(profileId);
                const row = await getLoungeRow(loungeId);
                if (!row)
                    throw new Error('Lounge not found.');
                const player = await getPlayer(profileId);
                if (!player)
                    throw new Error('Player not found.');
                if (socket.data.loungeId && socket.data.loungeId !== loungeId) {
                    handleLoungeLeave(io, socket);
                }
                const isOwnerLevel = player.moderatorLevel === 'owner';
                const isLoungeOwner = row.owner_id === profileId;
                let role = 'listener';
                if (isOwnerLevel || isLoungeOwner)
                    role = 'host';
                else if (asSpeaker)
                    role = 'speaker';
                const member = {
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
            }
            catch (e) {
                cb(err(e.message ?? 'Failed to join lounge.'));
            }
        });
        socket.on('lounge:leave', () => {
            const loungeId = socket.data.loungeId;
            handleLoungeLeave(io, socket);
            if (loungeId)
                io.to(`lounge:${loungeId}`).emit('lounge:member_update', { loungeId, members: loungeGetMembers(loungeId) });
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
                if (!loungeId)
                    throw new Error('Not in a lounge.');
                const member = loungeSetHandRaised(loungeId, socket.id, true);
                if (!member)
                    throw new Error('Not in this lounge.');
                io.to(`lounge:${loungeId}`).emit('lounge:member_update', { loungeId, members: loungeGetMembers(loungeId) });
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('lounge:lower_hand', (cb) => {
            try {
                const loungeId = socket.data.loungeId;
                if (!loungeId)
                    throw new Error('Not in a lounge.');
                const member = loungeSetHandRaised(loungeId, socket.id, false);
                if (!member)
                    throw new Error('Not in this lounge.');
                io.to(`lounge:${loungeId}`).emit('lounge:member_update', { loungeId, members: loungeGetMembers(loungeId) });
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('lounge:promote', async ({ targetPlayerId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                const loungeId = socket.data.loungeId;
                if (!profileId || !loungeId)
                    throw new Error('Not in a lounge.');
                const self = loungeGetMemberByPlayerId(loungeId, profileId);
                if (!self || self.role !== 'host')
                    throw new Error('Only the host can promote.');
                const target = loungeGetMemberByPlayerId(loungeId, targetPlayerId);
                if (!target)
                    throw new Error('Member not found.');
                loungeSetRole(loungeId, target.socketId, 'speaker');
                io.to(target.socketId).emit('lounge:promoted');
                io.to(`lounge:${loungeId}`).emit('lounge:member_update', { loungeId, members: loungeGetMembers(loungeId) });
                await broadcastLoungeState(io, loungeId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('lounge:demote', async ({ targetPlayerId }, cb) => {
            try {
                const profileId = socket.data.profileId;
                const loungeId = socket.data.loungeId;
                if (!profileId || !loungeId)
                    throw new Error('Not in a lounge.');
                const self = loungeGetMemberByPlayerId(loungeId, profileId);
                if (!self || self.role !== 'host')
                    throw new Error('Only the host can demote.');
                const target = loungeGetMemberByPlayerId(loungeId, targetPlayerId);
                if (!target)
                    throw new Error('Member not found.');
                loungeSetRole(loungeId, target.socketId, 'listener');
                io.to(target.socketId).emit('lounge:demoted');
                io.to(`lounge:${loungeId}`).emit('lounge:member_update', { loungeId, members: loungeGetMembers(loungeId) });
                await broadcastLoungeState(io, loungeId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('lounge:kick', async ({ targetPlayerId, reason }, cb) => {
            try {
                const profileId = socket.data.profileId;
                const loungeId = socket.data.loungeId;
                if (!profileId || !loungeId)
                    throw new Error('Not in a lounge.');
                const self = loungeGetMemberByPlayerId(loungeId, profileId);
                if (!self || self.role !== 'host')
                    throw new Error('Only the host can kick.');
                const target = loungeGetMemberByPlayerId(loungeId, targetPlayerId);
                if (!target)
                    throw new Error('Member not found.');
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
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('lounge:members', (data, cb) => {
            try {
                cb(ok(loungeGetMembers(data.loungeId)));
            }
            catch (e) {
                cb(err(e.message));
            }
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
        // ── Disconnect ──────────────────────────────────────────────────
        // ── Virtual Space ─────────────────────────────────────────────────
        socket.on('space:join', async ({ spaceId = 'main', name, bodyColor, glowColor, mask, hat, pet, form }, cb) => {
            try {
                if (!name || !bodyColor)
                    return cb?.({ ok: false, error: 'Missing fields' });
                const safeName = String(name).slice(0, 24);
                const safeBody = /^#[0-9a-fA-F]{6}$/.test(bodyColor) ? bodyColor : '#9b00ff';
                const safeGlow = /^#[0-9a-fA-F]{6}$/.test(glowColor ?? '') ? glowColor : '#00e5ff';
                const safeMask = ['none', 'half', 'full', 'visor'].includes(mask) ? mask : 'none';
                const safeHat = ['none', 'cap', 'crown', 'halo', 'party', 'cat', 'beanie'].includes(hat) ? hat : 'none';
                const safePet = ['none', 'cat', 'bot', 'ghost', 'star', 'fish', 'fish2', 'egg', 'chick', 'moon', 'car'].includes(pet) ? pet : 'none';
                const safeForm = ['human', 'car'].includes(form) ? form : 'human';
                const safeSpace = String(spaceId).slice(0, 48).replace(/[^a-zA-Z0-9_-]/g, '') || 'main'; // 48: fits clan_<uuid>
                const meta = _spaceMeta.get(safeSpace);
                // Only 'main' may be joined without pre-existing metadata; everything
                // else must have been created (so private codes/capacity are enforced).
                if (!meta)
                    return cb?.({ ok: false, error: 'ეს Space აღარ არსებობს.' });
                // Clan lounges are members-only.
                if (safeSpace.startsWith('clan_')) {
                    const clanId = safeSpace.slice(5);
                    const membership = socket.data.profileId ? await getClanMembershipByPlayer(socket.data.profileId) : null;
                    if (!membership || membership.id !== clanId) {
                        return cb?.({ ok: false, error: 'Clan members only.' });
                    }
                }
                const room = _spaces.get(safeSpace) ?? new Map();
                if (!_spaces.has(safeSpace))
                    _spaces.set(safeSpace, room);
                if (!room.has(socket.id) && room.size >= meta.maxPlayers) {
                    return cb?.({ ok: false, error: 'Space სავსეა.' });
                }
                const x = 15 + Math.random() * 70;
                const y = 20 + Math.random() * 60;
                const player = { socketId: socket.id, name: safeName, bodyColor: safeBody, glowColor: safeGlow, mask: safeMask, hat: safeHat, pet: safePet, form: safeForm, profileId: socket.data.profileId ?? null, x, y, seat: null, hp: SPACE_MAX_HP };
                room.set(socket.id, player);
                socket.join(`space:${safeSpace}`);
                if (socket.data.profileId) {
                    // Only public spaces are exposed to friends (presence strip + push).
                    // Private and clan lounges stay hidden — no visibility, no join code.
                    if (meta.isPublic) {
                        setLoungePresence(socket.data.profileId, { spaceId: safeSpace, name: meta.name, code: meta.code });
                        notifyFriendsActive(io, socket.data.profileId, { kind: 'lounge', code: meta.code, label: meta.name, fromName: safeName });
                    }
                    else {
                        clearLoungePresence(socket.data.profileId);
                    }
                }
                socket.to(`space:${safeSpace}`).emit('space:player-joined', player);
                const existingDJ = _spaceDJ.get(safeSpace) ?? null;
                const existingTV = _tvPublic(safeSpace);
                const spacePublic = { ..._publicSpaceMeta(meta, room.size), canControlTv: _canControlTv(safeSpace, socket.data.profileId ?? null) };
                cb?.({ ok: true, data: { players: [...room.values()], mySocketId: socket.id, djState: existingDJ, tvState: existingTV, space: spacePublic } });
                if (existingDJ)
                    socket.emit('space:dj-update', existingDJ);
                if (existingTV)
                    socket.emit('tv:update', existingTV);
            }
            catch {
                cb?.({ ok: false, error: 'Internal error' });
            }
        });
        socket.on('space:create', async ({ name, icon, theme, layout, maxPlayers, isPublic }, cb) => {
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
                const meta = {
                    id, name: safeName, icon: safeIcon, theme: safeTheme, layout: safeLayout,
                    maxPlayers: cap, isPublic: isPublic !== false,
                    ownerId: socket.data.profileId ?? null,
                    ownerName: String(name && socket.data.profileId ? '' : '') || 'You',
                    code: _genSpaceCode(), createdAt: Date.now(), persistent: false,
                };
                // Resolve a friendly owner name from the connected profile if available.
                if (socket.data.profileId) {
                    getPlayer(socket.data.profileId).then(p => { if (p)
                        meta.ownerName = p.username; }).catch(() => { });
                }
                _spaceMeta.set(id, meta);
                cb?.({ ok: true, data: { space: _publicSpaceMeta(meta, 0) } });
            }
            catch {
                cb?.({ ok: false, error: 'Internal error' });
            }
        });
        // Change the visual theme of the space the caller is in (owner, or anyone
        // in the ownerless main lounge — same rule as TV control). Premium themes
        // require the changer to own the matching unlock.
        socket.on('space:set_theme', async ({ theme }, cb) => {
            try {
                const spaceId = _spaceOfSocket(socket.id);
                if (!spaceId)
                    return cb?.({ ok: false, error: 'Not in a space.' });
                const meta = _spaceMeta.get(spaceId);
                if (!meta)
                    return cb?.({ ok: false, error: 'Space not found.' });
                if (!_canControlTv(spaceId, socket.data.profileId ?? null)) {
                    return cb?.({ ok: false, error: 'Only the owner can change the theme.' });
                }
                if (!SPACE_THEMES.includes(theme))
                    return cb?.({ ok: false, error: 'Unknown theme.' });
                if (!(await _ownsSpaceTheme(socket.data.profileId ?? null, theme))) {
                    return cb?.({ ok: false, error: 'You don\'t own this theme yet.' });
                }
                meta.theme = theme;
                io.to(`space:${spaceId}`).emit('space:meta-update', { theme });
                cb?.({ ok: true, data: { theme } });
            }
            catch {
                cb?.({ ok: false, error: 'Internal error' });
            }
        });
        // Playful combat: hit another player in the same space. 10 hits knocks
        // them out of the space (they must re-enter). HP resets on re-join.
        socket.on('space:hit', ({ targetSocketId }, cb) => {
            try {
                const spaceId = _spaceOfSocket(socket.id);
                if (!spaceId)
                    return cb?.({ ok: false });
                if (targetSocketId === socket.id)
                    return cb?.({ ok: false });
                const room = _spaces.get(spaceId);
                const attacker = room?.get(socket.id);
                const target = room?.get(targetSocketId);
                if (!room || !attacker || !target)
                    return cb?.({ ok: false });
                // Light cooldown so each punch is a discrete tap, not a scripted insta-KO.
                const now = Date.now();
                if (now - (_spaceHitAt.get(socket.id) ?? 0) < 250)
                    return cb?.({ ok: false });
                _spaceHitAt.set(socket.id, now);
                target.hp = Math.max(0, (target.hp ?? SPACE_MAX_HP) - 1);
                io.to(`space:${spaceId}`).emit('space:hit', { targetSocketId, byName: attacker.name, hp: target.hp });
                if (target.hp <= 0) {
                    room.delete(targetSocketId);
                    if (target.profileId)
                        clearLoungePresence(target.profileId);
                    const vsock = io.sockets.sockets.get(targetSocketId);
                    if (vsock)
                        vsock.leave(`space:${spaceId}`);
                    io.to(targetSocketId).emit('space:knockout', { byName: attacker.name });
                    // Notify everyone still in the room (incl. the attacker) so the
                    // knocked-out avatar disappears for all of them.
                    io.to(`space:${spaceId}`).emit('space:player-left', { socketId: targetSocketId });
                }
                cb?.({ ok: true });
            }
            catch {
                cb?.({ ok: false });
            }
        });
        socket.on('space:list', (cb) => {
            try {
                const list = [..._spaceMeta.values()]
                    .filter(m => m.isPublic)
                    .map(m => _publicSpaceMeta(m, _spaceOnlineCount(m.id)))
                    .sort((a, b) => (b.persistent ? 1 : 0) - (a.persistent ? 1 : 0) || b.online - a.online);
                cb?.({ ok: true, data: list });
            }
            catch {
                cb?.({ ok: false, error: 'Internal error' });
            }
        });
        socket.on('space:resolve', ({ code }, cb) => {
            try {
                const meta = _findSpaceByCode(String(code ?? ''));
                if (!meta)
                    return cb?.({ ok: false, error: 'კოდი ვერ მოიძებნა.' });
                cb?.({ ok: true, data: { space: _publicSpaceMeta(meta, _spaceOnlineCount(meta.id)) } });
            }
            catch {
                cb?.({ ok: false, error: 'Internal error' });
            }
        });
        socket.on('space:invite', ({ targetProfileId }, cb) => {
            try {
                // Locate the space the inviter is currently in.
                let mySpaceId = null;
                for (const [sid, room] of _spaces) {
                    if (room.has(socket.id)) {
                        mySpaceId = sid;
                        break;
                    }
                }
                if (!mySpaceId)
                    return cb?.({ ok: false, error: 'You are not in a space.' });
                const meta = _spaceMeta.get(mySpaceId);
                if (!meta)
                    return cb?.({ ok: false, error: 'Space not found.' });
                const targetSock = findSocketByProfile(io, String(targetProfileId));
                if (!targetSock)
                    return cb?.({ ok: false, error: 'მოთამაშე ოფლაინია.' });
                const fromName = _spaces.get(mySpaceId)?.get(socket.id)?.name ?? 'Someone';
                targetSock.emit('space:invited', { spaceId: meta.id, code: meta.code, name: meta.name, icon: meta.icon, fromName });
                cb?.({ ok: true });
            }
            catch {
                cb?.({ ok: false, error: 'Internal error' });
            }
        });
        socket.on('space:move', ({ x, y }) => {
            if (typeof x !== 'number' || typeof y !== 'number')
                return;
            const cx = Math.max(2, Math.min(98, x));
            const cy = Math.max(2, Math.min(96, y));
            for (const [spaceId, room] of _spaces) {
                const player = room.get(socket.id);
                if (player) {
                    player.x = cx;
                    player.y = cy;
                    // Walking off a seat stands you up.
                    if (player.seat) {
                        player.seat = null;
                        io.to(`space:${spaceId}`).emit('space:player-stood', { socketId: socket.id });
                    }
                    socket.to(`space:${spaceId}`).emit('space:player-moved', { socketId: socket.id, x: cx, y: cy });
                    return;
                }
            }
        });
        // ── Cinema seating ─────────────────────────────────────────────────
        socket.on('space:sit', ({ seatId, x, y }) => {
            const sid = String(seatId ?? '').slice(0, 24);
            if (!sid)
                return;
            for (const [spaceId, room] of _spaces) {
                const player = room.get(socket.id);
                if (player) {
                    // Reject if the seat is already taken by someone else.
                    for (const other of room.values()) {
                        if (other.socketId !== socket.id && other.seat === sid)
                            return;
                    }
                    player.seat = sid;
                    if (typeof x === 'number')
                        player.x = Math.max(2, Math.min(98, x));
                    if (typeof y === 'number')
                        player.y = Math.max(2, Math.min(96, y));
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
        socket.on('space:react', ({ emoji }) => {
            const e = String(emoji ?? '').slice(0, 8);
            if (!e)
                return;
            const spaceId = _spaceOfSocket(socket.id);
            if (spaceId)
                io.to(`space:${spaceId}`).emit('space:player-reacted', { socketId: socket.id, emoji: e });
        });
        socket.on('space:gesture', ({ gesture }) => {
            const g = String(gesture ?? '');
            if (!['wave', 'clap', 'point', 'dance'].includes(g))
                return;
            const spaceId = _spaceOfSocket(socket.id);
            if (spaceId)
                io.to(`space:${spaceId}`).emit('space:player-gesture', { socketId: socket.id, gesture: g });
        });
        socket.on('space:typing', ({ typing }) => {
            const spaceId = _spaceOfSocket(socket.id);
            if (spaceId)
                socket.to(`space:${spaceId}`).emit('space:player-typing', { socketId: socket.id, typing: !!typing });
        });
        socket.on('space:chat', ({ message }) => {
            if (typeof message !== 'string')
                return;
            const msg = message.trim().slice(0, 200);
            if (!msg)
                return;
            for (const [spaceId, room] of _spaces) {
                if (room.has(socket.id)) {
                    io.to(`space:${spaceId}`).emit('space:message', { socketId: socket.id, message: msg });
                    return;
                }
            }
        });
        socket.on('space:leave', () => { _leaveSpace(socket.id, io); });
        // ── Virtual Space DJ ──────────────────────────────────────────────
        socket.on('space:dj-play', ({ videoId, position = 0 }) => {
            const vid = String(videoId ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
            if (!vid)
                return;
            for (const [spaceId, room] of _spaces) {
                if (room.has(socket.id)) {
                    const state = {
                        videoId: vid,
                        startedAt: Date.now() - Math.round((Number(position) || 0) * 1000),
                        position: Number(position) || 0,
                        isPlaying: true,
                        djName: room.get(socket.id).name,
                    };
                    _spaceDJ.set(spaceId, state);
                    io.to(`space:${spaceId}`).emit('space:dj-update', state);
                    return;
                }
            }
        });
        socket.on('space:dj-pause', ({ position }) => {
            for (const [spaceId, room] of _spaces) {
                if (room.has(socket.id)) {
                    const state = _spaceDJ.get(spaceId);
                    if (!state)
                        return;
                    state.isPlaying = false;
                    state.position = Number(position) || 0;
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
        // ── Cinema TV / Watch Party ────────────────────────────────────────
        function _skipNeeded(spaceId) {
            return Math.max(1, Math.floor(_spaceOnlineCount(spaceId) / 2) + 1);
        }
        function _tvPublic(spaceId) {
            const s = _spaceTV.get(spaceId);
            if (!s)
                return null;
            return {
                videoId: s.videoId, title: s.title, startedAt: s.startedAt, position: s.position,
                isPlaying: s.isPlaying, byName: s.byName,
                queue: s.queue.map(q => ({ videoId: q.videoId, title: q.title })),
                skipVotes: s.skipVoters.size, skipNeeded: _skipNeeded(spaceId),
            };
        }
        function _tvBroadcast(spaceId) {
            io.to(`space:${spaceId}`).emit('tv:update', _tvPublic(spaceId));
        }
        // Auto-pause the DJ music when the TV takes over the room's audio.
        function _pauseDj(spaceId) {
            const dj = _spaceDJ.get(spaceId);
            if (dj && dj.isPlaying) {
                dj.isPlaying = false;
                io.to(`space:${spaceId}`).emit('space:dj-update', { ...dj });
            }
        }
        function _startVideo(spaceId, vid, title, byName) {
            const prev = _spaceTV.get(spaceId);
            _spaceTV.set(spaceId, {
                videoId: vid, title: String(title ?? '').slice(0, 120),
                startedAt: Date.now(), position: 0, isPlaying: true, byName,
                queue: prev ? prev.queue : [], skipVoters: new Set(),
            });
            _pauseDj(spaceId);
            _tvBroadcast(spaceId);
        }
        function _tvAdvance(spaceId) {
            const s = _spaceTV.get(spaceId);
            if (!s)
                return;
            const next = s.queue.shift();
            if (next)
                _startVideo(spaceId, next.videoId, next.title, 'Up Next');
            else {
                _spaceTV.delete(spaceId);
                _tvBroadcast(spaceId);
            }
        }
        const sanitizeVid = (v) => String(v ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
        socket.on('tv:set', ({ videoId, title }) => {
            const spaceId = _spaceOfSocket(socket.id);
            if (!spaceId || !_canControlTv(spaceId, socket.data.profileId ?? null))
                return;
            const vid = sanitizeVid(videoId);
            if (!vid)
                return;
            const byName = _spaces.get(spaceId)?.get(socket.id)?.name ?? 'Someone';
            _startVideo(spaceId, vid, title, byName);
        });
        // Anyone present may add to the shared queue (collaborative playlist).
        socket.on('tv:enqueue', ({ videoId, title }) => {
            const spaceId = _spaceOfSocket(socket.id);
            if (!spaceId)
                return;
            const vid = sanitizeVid(videoId);
            if (!vid)
                return;
            const cur = _spaceTV.get(spaceId);
            if (!cur) {
                const byName = _spaces.get(spaceId)?.get(socket.id)?.name ?? 'Someone';
                _startVideo(spaceId, vid, title, byName);
            }
            else {
                if (cur.queue.length < 30)
                    cur.queue.push({ videoId: vid, title: String(title ?? '').slice(0, 120) });
                _tvBroadcast(spaceId);
            }
        });
        socket.on('tv:next', () => {
            const spaceId = _spaceOfSocket(socket.id);
            if (!spaceId || !_canControlTv(spaceId, socket.data.profileId ?? null))
                return;
            _tvAdvance(spaceId);
        });
        socket.on('tv:vote_skip', () => {
            const spaceId = _spaceOfSocket(socket.id);
            if (!spaceId)
                return;
            const s = _spaceTV.get(spaceId);
            if (!s)
                return;
            s.skipVoters.add(socket.id);
            if (s.skipVoters.size >= _skipNeeded(spaceId))
                _tvAdvance(spaceId);
            else
                _tvBroadcast(spaceId);
        });
        // A client whose player reached the end reports it; first valid report advances.
        socket.on('tv:ended', ({ videoId }) => {
            const spaceId = _spaceOfSocket(socket.id);
            if (!spaceId)
                return;
            const s = _spaceTV.get(spaceId);
            if (s && s.videoId === sanitizeVid(videoId))
                _tvAdvance(spaceId);
        });
        socket.on('tv:play', ({ position }) => {
            const spaceId = _spaceOfSocket(socket.id);
            if (!spaceId || !_canControlTv(spaceId, socket.data.profileId ?? null))
                return;
            const state = _spaceTV.get(spaceId);
            if (!state)
                return;
            const pos = Math.max(0, Number(position) || 0);
            state.isPlaying = true;
            state.position = pos;
            state.startedAt = Date.now() - Math.round(pos * 1000);
            _pauseDj(spaceId);
            _tvBroadcast(spaceId);
        });
        socket.on('tv:pause', ({ position }) => {
            const spaceId = _spaceOfSocket(socket.id);
            if (!spaceId || !_canControlTv(spaceId, socket.data.profileId ?? null))
                return;
            const state = _spaceTV.get(spaceId);
            if (!state)
                return;
            state.isPlaying = false;
            state.position = Math.max(0, Number(position) || 0);
            _tvBroadcast(spaceId);
        });
        socket.on('tv:seek', ({ position }) => {
            const spaceId = _spaceOfSocket(socket.id);
            if (!spaceId || !_canControlTv(spaceId, socket.data.profileId ?? null))
                return;
            const state = _spaceTV.get(spaceId);
            if (!state)
                return;
            const pos = Math.max(0, Number(position) || 0);
            state.position = pos;
            if (state.isPlaying)
                state.startedAt = Date.now() - Math.round(pos * 1000);
            _tvBroadcast(spaceId);
        });
        socket.on('tv:stop', () => {
            const spaceId = _spaceOfSocket(socket.id);
            if (!spaceId || !_canControlTv(spaceId, socket.data.profileId ?? null))
                return;
            _spaceTV.delete(spaceId);
            _tvBroadcast(spaceId);
        });
        // ── Virtual Space Voice ────────────────────────────────────────────
        socket.on('space:voice-join', (_, cb) => {
            for (const [spaceId, room] of _spaces) {
                if (room.has(socket.id)) {
                    if (!_spaceVoice.has(spaceId))
                        _spaceVoice.set(spaceId, new Map());
                    const voices = _spaceVoice.get(spaceId);
                    const peers = [...voices.entries()].map(([sid, nm]) => ({ socketId: sid, name: nm }));
                    const player = room.get(socket.id);
                    voices.set(socket.id, player.name);
                    socket.to(`space:${spaceId}`).emit('space:voice-peer-joined', { socketId: socket.id, name: player.name });
                    const iceConfig = buildIceConfig();
                    cb?.({ ok: true, data: { peers, iceServers: iceConfig.iceServers, iceTransportPolicy: iceConfig.iceTransportPolicy } });
                    return;
                }
            }
            cb?.({ ok: false, error: 'Not in a space' });
        });
        socket.on('space:voice-leave', () => { _leaveSpaceVoice(socket.id, io); });
        socket.on('space:voice-offer', ({ to, sdp }) => {
            if (typeof to !== 'string' || !sdp)
                return;
            io.to(to).emit('space:voice-offer', { from: socket.id, sdp });
        });
        socket.on('space:voice-answer', ({ to, sdp }) => {
            if (typeof to !== 'string' || !sdp)
                return;
            io.to(to).emit('space:voice-answer', { from: socket.id, sdp });
        });
        socket.on('space:voice-ice', ({ to, candidate }) => {
            if (typeof to !== 'string' || !candidate)
                return;
            io.to(to).emit('space:voice-ice', { from: socket.id, candidate });
        });
        socket.on('disconnect', () => {
            rateLimits.delete(socket.id);
            const { roomId, playerId, profileId } = socket.data;
            if (profileId) {
                markOffline(profileId);
                broadcastOnlineCount(io);
                if (activeSessions.get(profileId) === socket.id)
                    activeSessions.delete(profileId);
                chatCooldowns.delete(profileId);
                chatWindows.delete(profileId);
                lastChatMsg.delete(profileId);
            }
            else {
                chatCooldowns.delete(socket.id);
                chatWindows.delete(socket.id);
                lastChatMsg.delete(socket.id);
            }
            if (roomId && playerId)
                handlePlayerLeave(io, socket, roomId, playerId);
            _leaveSpace(socket.id, io);
            _leaveSpaceVoice(socket.id, io);
            handleVoiceLeave(io, socket.id);
            handleLoungeLeave(io, socket);
            handleCheckersDisconnect(io, socket.id);
            handleJokerDisconnect(io, socket.id);
            handleLudoDisconnect(io, socket.id);
            handleWWWDisconnect(io, socket.id);
            handleUnoDisconnect(io, socket.id);
            // Remove from any spectate queues
            for (const [qRoomId, queue] of spectateQueues) {
                const idx = queue.indexOf(socket.id);
                if (idx !== -1) {
                    queue.splice(idx, 1);
                    if (queue.length === 0)
                        spectateQueues.delete(qRoomId);
                }
            }
        });
    });
}
// ── Leave / Disconnect Logic ──────────────────────────────────────────
function startHostGrace(io, room, hostName, profileId) {
    const roomId = room.id;
    // Cancel any existing grace timer for this room
    const existing = hostGraceTimers.get(roomId);
    if (existing)
        clearTimeout(existing.timer);
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
function closeRoom(io, room, reason) {
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
function promoteFromQueue(io, room) {
    const queue = spectateQueues.get(room.id);
    if (!queue || queue.length === 0)
        return;
    const nextSocketId = queue.shift();
    if (queue.length === 0)
        spectateQueues.delete(room.id);
    else
        spectateQueues.set(room.id, queue);
    io.to(nextSocketId).emit('queue:promoted', { roomCode: room.code });
}
function handlePlayerLeave(io, socket, roomId, playerId, explicit = false) {
    const room = getRoom(roomId);
    if (!room)
        return;
    const player = room.players.get(playerId);
    if (!player)
        return;
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
                if (grace) {
                    clearTimeout(grace.timer);
                    hostGraceTimers.delete(roomId);
                }
                deleteRoom(roomId);
                spectateQueues.delete(roomId);
                return;
            }
            if (wasHost) {
                const grace = hostGraceTimers.get(roomId);
                if (grace) {
                    clearTimeout(grace.timer);
                    hostGraceTimers.delete(roomId);
                }
                closeRoom(io, room, `${player.name} (host) left. The room has been closed.`);
                spectateQueues.delete(roomId);
                return;
            }
            broadcastSystemMsg(io, room, `${player.name} left the room.`);
            broadcastRoom(io, room);
            promoteFromQueue(io, room);
        }
        else {
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
            }
            else {
                broadcastSystemMsg(io, room, `${player.name} disconnected.`);
                broadcastRoom(io, room);
            }
            // After LOBBY_GRACE_MS, if still offline, finalize the removal
            const timer = setTimeout(() => {
                lobbyGraceTimers.delete(playerId);
                const currentRoom = getRoom(roomId);
                if (!currentRoom)
                    return;
                const stillPlayer = currentRoom.players.get(playerId);
                if (stillPlayer && !stillPlayer.isConnected) {
                    const wasStillHost = stillPlayer.isHost;
                    removePlayer(currentRoom, playerId);
                    if (currentRoom.players.size === 0) {
                        timerService.stop(roomId);
                        const hg = hostGraceTimers.get(roomId);
                        if (hg) {
                            clearTimeout(hg.timer);
                            hostGraceTimers.delete(roomId);
                        }
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
    }
    else {
        if (wasHost) {
            if (explicit) {
                const grace = hostGraceTimers.get(roomId);
                if (grace) {
                    clearTimeout(grace.timer);
                    hostGraceTimers.delete(roomId);
                }
                closeRoom(io, room, `${player.name} (host) left. The room has been closed.`);
                spectateQueues.delete(roomId);
            }
            else {
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
        }
        else {
            // Mid-game disconnect or non-game_over explicit leave — keep slot for reconnect.
            player.isConnected = false;
            player.socketId = '';
            broadcastSystemMsg(io, room, `${player.name} disconnected.`);
            broadcastRoom(io, room);
            promoteFromQueue(io, room);
        }
    }
}
function handleVoiceLeave(io, socketId) {
    const removed = voiceLeave(socketId);
    for (const { channel, remaining } of removed) {
        for (const peer of remaining) {
            io.to(peer.socketId).emit('voice:peer-left', { socketId, channel });
        }
    }
}
function forceLeaveVoiceChannel(io, roomId, channel, reason) {
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
function enforceVoicePhaseRules(io, room) {
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
            }
            else if (isActiveFaction && player?.team === 'yakuza') {
                io.to(member.socketId).emit('voice:force-leave', { channel: 'room', reason: 'Use the Yakuza channel during night.' });
                const removed = voiceRemoveFromChannel(member.socketId, 'room');
                if (removed) {
                    for (const peer of removed.remaining) {
                        io.to(peer.socketId).emit('voice:peer-left', { socketId: member.socketId, channel: 'room' });
                    }
                }
            }
            else {
                io.to(member.socketId).emit('voice:force-mute', { reason: 'Voice muted during night phase.' });
            }
        }
        return;
    }
    // Leaving night — clean up any stale private faction channel connections
    forceLeaveVoiceChannel(io, roomId, 'mafia', 'Mafia voice is only available during night.');
    forceLeaveVoiceChannel(io, roomId, 'yakuza', 'Yakuza voice is only available during night.');
    // Silent Day event — mute all active players during day & speech phases
    if ((phase === 'day' || phase === 'speech') && room.activeEvent?.key === 'silent_day') {
        for (const member of voiceGetMembers(roomId, 'room')) {
            const player = room.players.get(member.playerId);
            if (player?.isAlive && !player?.isSpectator) {
                io.to(member.socketId).emit('voice:force-mute', { reason: 'Silent Day — voice is disabled today.' });
            }
            else {
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
            }
            else if (member.playerId === speakerId || member.playerId === foulPlayerId) {
                io.to(member.socketId).emit('voice:force-unmute');
            }
            else {
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
            }
            else if (member.playerId === candidateId) {
                io.to(member.socketId).emit('voice:force-unmute');
            }
            else {
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
            }
            else {
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
            }
            else {
                io.to(member.socketId).emit('voice:force-mute', { reason: 'Only the defending player may speak.' });
            }
        }
        return;
    }
    if (phase === 'don_check' || phase === 'mafia_kill' || phase === 'revote' || phase === 'double_elim_vote') {
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
            }
            else {
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
        }
        else {
            // Dead players and spectators remain listen-only
            io.to(member.socketId).emit('voice:force-mute', { reason: 'Listen only.' });
        }
    }
}
//# sourceMappingURL=socket.js.map