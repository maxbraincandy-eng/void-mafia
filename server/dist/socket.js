import { z } from 'zod';
import { ok, err, } from './types/index.js';
import { createRoom, getRoom, getRoomByCode, deleteRoom, addPlayer, addSpectatorPlayer, removePlayer, getPlayerBySocket, toPublicRoom, getHostPlayer, toRoomListItem, getAllRooms, getPlayerByProfile, transferHost, rematchRoom, setPlayerAvatarUrl, enqueueForNextRound, dequeueFromNextRound, promoteQueuedPlayers, } from './services/roomService.js';
import { startGame, setPhase, advancePhase, submitNightAction, submitVote, submitNomination, checkWin, buildGameOverResult, allNightActionsSubmitted, getInvestigationResult, getTrackResult, resolveVotes, } from './services/gameService.js';
import { createPlayerMessage, createSystemMessage, addMessage, validateChat, } from './services/chatService.js';
import { timerService } from './services/timerService.js';
import { getRole } from './services/roleService.js';
import { getOrCreatePlayer, getPlayer, toPublicProfile, addGameResult, getActiveBan, getActiveMute, findSocketByProfile, registerWithEmail, authenticateWithEmail, addXP, getCosmetics, equipCosmetic, grantStarterCosmetics, getLeaderboard, getPlayerByFriendCode, setGrantedModLevel, updateAvatarUrl, updateUsername, } from './services/playerService.js';
import { markOnline, markOffline, sendFriendRequest, acceptFriend, declineFriend, removeFriend, getFriends, getPendingRequests, getOnlineCount, getFriendshipStatus, isOnline, } from './services/friendService.js';
import { checkAndAwardChallenges, getDailyQuestsForPlayer, } from './services/challengeService.js';
import { checkAchievements, getPlayerAchievements } from './services/achievementService.js';
import { recordGame, getPlayerHistory, getPlayerRoleStats } from './services/gameHistoryService.js';
import { createClan, getClan, getClanByPlayer, getClanMembershipByPlayer, getAllClans, getClanMembers, joinClan, leaveClan, setClanMemberRole, addClanModLog, getClanModLogs, } from './services/clanService.js';
import { canDo, banPlayer, unbanPlayer, mutePlayer, unmutePlayer, warnPlayer, createReport, getReports, resolveReport, getLogs, getModPlayers, getBannedPlayers, logKick, addModNote, freezeAccount, unfreezeAccount, renamePlayer, getPlayerDetail, assignReport, getDashboardDbStats, addModLog, } from './services/moderationService.js';
import { canJoin as voiceCanJoin, canTransmitVoice, join as voiceJoin, leave as voiceLeave, getMembers as voiceGetMembers, getSharedChannel as voiceGetSharedChannel, removeFromChannel as voiceRemoveFromChannel, } from './services/voiceService.js';
import { sql } from './db.js';
import bcrypt from 'bcryptjs';
import { sendPushToUser } from './pushService.js';
import { getOrCreateConversation, listConversations, sendMessage, getMessages, markRead, getTotalUnread, } from './services/dmService.js';
import { getCoins, claimDailyReward, grantCoins, deductCoins, refundGift, getTransactions, getAllTransactions, getGiftCatalog, createGift, updateGift, sendGift, getPlayerGifts, getGiftDetail, getGiftsSent, getGiftTimeline, getGiftStats, getPinnedGifts, pinGift, unpinGift, } from './services/coinService.js';
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
        if (room.phase === 'voting')
            announceVoteResult(io, room);
        advancePhase(room);
        const nextPhase = room.phase;
        if (wasNight) {
            announceNightResult(io, room);
            notifySpies(io, room);
            notifyTrackers(io, room);
            notifyCultConversions(io, room);
            notifyRoleblocked(io, room);
        }
        if (wasSpeech && nextPhase !== 'speech')
            announceSpeechEnd(io, room, nextPhase);
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
        // Rate-limit + payload size check on every incoming event
        socket.use(([event, ...args], next) => {
            // 4. Payload size limit — reject anything over 16 KB
            const payload = args[0];
            if (payload !== null && payload !== undefined && typeof payload === 'object') {
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
            const limit = authEvents.has(event) ? 3 : 20;
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
                // ~200KB base64 limit (150KB raw image)
                if (imageData.length > 270000) {
                    cb({ ok: false, error: 'Image is too large (max 200KB).' });
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
                const room = createRoom(socket.id, username, profileId, parsed.settings, clanId);
                const hostInRoom = [...room.players.values()][0];
                if (hostInRoom && playerProfile?.avatarUrl)
                    hostInRoom.avatarUrl = playerProfile.avatarUrl;
                socket.join(room.id);
                socket.data.playerId = room.hostId;
                socket.data.roomId = room.id;
                const hostPlayer = room.players.get(room.hostId);
                broadcastSystemMsg(io, room, `${hostPlayer.name} created the room.`);
                cb(ok(toPublicRoom(room, room.hostId)));
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
                for (const player of room.players.values()) {
                    if (player.socketId && player.role) {
                        io.to(player.socketId).emit('game:role', { role: getRole(player.role) });
                        io.to(player.socketId).emit('game:notification', {
                            title: 'Game Started!',
                            body: `Your role: ${player.role}`,
                        });
                    }
                    else if (player.profileId && player.role) {
                        // Player is disconnected — send push so they know the game started
                        sendPushToUser(player.profileId, {
                            title: '🎮 Game Started!',
                            body: `Your role: ${player.role}. Get back in!`,
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
        socket.on('game:vote', ({ targetId }, cb) => {
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
                setTimeout(() => {
                    if (room.activeFoul?.playerId === presser.id && room.activeFoul.endsAt === foulEndsAt) {
                        room.activeFoul = null;
                        if (room.phase === 'speech') {
                            const member = voiceGetMembers(room.id, 'room').find(m => m.playerId === presser.id);
                            if (member) {
                                io.to(member.socketId).emit('voice:force-mute', { reason: 'Foul window expired.' });
                            }
                            broadcastRoom(io, room);
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
                await logKick(modProfileId, mod.username, roomId, room.code, roomId, `Terminated game: ${reason || 'Rule violation'}`);
                await notifyMods(io, 'mod_kick', `${mod.username} terminated game in room ${room.code}`, room.code);
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
            if (!channel)
                return cb(err('Not in the same voice channel.'));
            io.to(to).emit('voice:offer', { from: socket.id, sdp });
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
          VALUES (${crypto.randomUUID()}, ${parsed.data.roomId}, ${profileId}, ${parsed.data.predicted}, ${Date.now()})
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
                    id: crypto.randomUUID(),
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
        // ── Disconnect ──────────────────────────────────────────────────
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
            handleVoiceLeave(io, socket.id);
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
        player.isConnected = false;
        player.socketId = '';
        broadcastSystemMsg(io, room, `${player.name} disconnected.`);
        broadcastRoom(io, room);
        promoteFromQueue(io, room);
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
            if (player?.team === 'mafia') {
                io.to(member.socketId).emit('voice:force-leave', { channel: 'room', reason: 'Use the Mafia channel during night.' });
                const removed = voiceRemoveFromChannel(member.socketId, 'room');
                if (removed) {
                    for (const peer of removed.remaining) {
                        io.to(peer.socketId).emit('voice:peer-left', { socketId: member.socketId, channel: 'room' });
                    }
                }
            }
            else if (player?.team === 'yakuza') {
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
    // day, lobby, role_reveal, game_over — lift force mutes for alive players only
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