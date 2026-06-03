import { z } from 'zod';
import { ok, err, } from './types/index.js';
import { createRoom, getRoom, getRoomByCode, deleteRoom, addPlayer, removePlayer, getPlayerBySocket, toPublicRoom, toRoomListItem, getAllRooms, getPlayerByProfile, transferHost, rematchRoom, } from './services/roomService.js';
import { startGame, setPhase, advancePhase, submitNightAction, submitVote, buildGameOverResult, allNightActionsSubmitted, getInvestigationResult, getTrackResult, resolveVotes, } from './services/gameService.js';
import { createPlayerMessage, createSystemMessage, addMessage, validateChat, } from './services/chatService.js';
import { timerService } from './services/timerService.js';
import { getRole } from './services/roleService.js';
import { getOrCreatePlayer, getPlayer, getAllPlayers, toPublicProfile, addGameResult, getActiveBan, getActiveMute, findSocketByProfile, registerWithEmail, authenticateWithEmail, addXP, getCosmetics, equipCosmetic, getPlayerByFriendCode, setGrantedModLevel, } from './services/playerService.js';
import { markOnline, markOffline, sendFriendRequest, acceptFriend, declineFriend, removeFriend, getFriends, getPendingRequests, getOnlineCount, getFriendshipStatus, isOnline, } from './services/friendService.js';
import { checkAndAwardChallenge, getTodayChallenge, getDailyChallengeForPlayer, } from './services/challengeService.js';
import { checkAchievements, getPlayerAchievements } from './services/achievementService.js';
import { recordGame, getPlayerHistory } from './services/gameHistoryService.js';
import { createClan, getClan, getClanByPlayer, getAllClans, getClanMembers, joinClan, leaveClan, } from './services/clanService.js';
import { canDo, banPlayer, unbanPlayer, mutePlayer, unmutePlayer, warnPlayer, createReport, getReports, resolveReport, getLogs, getModPlayers, logKick, } from './services/moderationService.js';
import { canJoin as voiceCanJoin, canTransmitVoice, join as voiceJoin, leave as voiceLeave, getMembers as voiceGetMembers, getSharedChannel as voiceGetSharedChannel, removeFromChannel as voiceRemoveFromChannel, } from './services/voiceService.js';
import { sql } from './db.js';
import { getOrCreateConversation, listConversations, sendMessage, getMessages, markRead, getTotalUnread, } from './services/dmService.js';
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
});
const JoinRoomSchema = z.object({
    code: z.string().length(6),
    name: z.string().min(1).max(24),
    isSpectator: z.boolean().optional().default(false),
    password: z.string().max(64).optional().default(''),
});
const ChatSchema = z.object({
    text: z.string().min(1).max(400),
    channel: z.enum(['room', 'mafia', 'dead']),
});
const AuthSchema = z.object({
    uid: z.string().min(1).max(64),
    username: z.string().min(1).max(24),
});
const ReportSchema = z.object({
    targetProfileId: z.string().min(1),
    roomId: z.string().nullable(),
    reason: z.enum(['harassment', 'hate_speech', 'cheating', 'spamming', 'inappropriate_nickname', 'inappropriate_chat', 'toxic_behavior', 'other']),
    details: z.string().max(500).default(''),
});
// ── Helpers ───────────────────────────────────────────────────────────
function broadcastRoom(io, room) {
    for (const player of room.players.values()) {
        if (player.socketId) {
            io.to(player.socketId).emit('room:update', toPublicRoom(room, player.id));
        }
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
        if (nextPhase === 'night') {
            io.to(room.id).emit('game:notification', { title: 'Night Falls', body: 'Perform your night action.' });
        }
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
    // Send game:notification push event
    io.to(room.id).emit('game:notification', {
        title: 'Game Over',
        body: room.winner ? `${room.winner.charAt(0).toUpperCase() + room.winner.slice(1)} wins!` : 'Game ended.',
    });
    for (const p of room.players.values()) {
        if (p.socketId)
            io.to(p.socketId).emit('game:over', result);
        if (p.profileId && room.winner) {
            const won = p.team === room.winner;
            await addGameResult(p.profileId, won);
            // Award XP
            try {
                const roundsAlive = Math.min(room.day, 10);
                let xpAmount = won ? 150 : 50;
                xpAmount += Math.min(roundsAlive * 5, 50);
                // Check daily challenge
                const challengeCompleted = await checkAndAwardChallenge(p.profileId, won, p.role, room.day, p.team);
                const todayChallenge = getTodayChallenge();
                const challengeBonus = challengeCompleted ? todayChallenge.xpReward : 0;
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
}
async function notifyMods(io, type, message, targetName) {
    for (const [, sock] of io.sockets.sockets) {
        const profileId = sock.data.profileId;
        if (!profileId)
            continue;
        const profile = await getPlayer(profileId);
        if (profile?.isModerator) {
            sock.emit('mod:notification', { type, message, targetName });
        }
    }
}
function announceNightResult(io, room) {
    const result = { killed: room.killedLastNight, saved: room.savedLastNight };
    io.to(room.id).emit('game:night_result', result);
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
            // Force-mute the eliminated player in any voice channel they're in
            if (p?.socketId) {
                io.to(p.socketId).emit('voice:force-mute', { reason: 'You were eliminated.' });
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
function notifySpies(io, room) {
    const mafiaAction = [...room.nightActions.values()]
        .find(a => a.role === 'mafia' || a.role === 'don');
    const targetId = mafiaAction?.targetId ?? null;
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
    // Emit vote breakdown before resolving
    const breakdown = [...room.votes.entries()]
        .filter(([, tid]) => tid !== null)
        .map(([vid, tid]) => {
        const voter = room.players.get(vid);
        const target = room.players.get(tid);
        return {
            voterId: vid, voterName: voter?.name ?? '?',
            targetId: tid, targetName: target?.name ?? '?',
            weight: voter?.role === 'mayor' ? 2 : 1,
        };
    });
    io.to(room.id).emit('game:vote_breakdown', breakdown);
    const eliminated = resolveVotes(room);
    if (eliminated) {
        const target = room.players.get(eliminated);
        if (target) {
            io.to(room.id).emit('game:vote_result', {
                name: target.name,
                role: target.role ?? null,
                lastWill: target.lastWill ?? null,
                seat: target.seat,
            });
            broadcastSystemMsg(io, room, voteDeathMsg(target.name, target.role ?? null, target.lastWill));
            // Force-mute the eliminated player
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
        // Rate-limit every incoming event
        socket.use(([event], next) => {
            const authEvents = new Set(['player:auth', 'player:register', 'player:login_email']);
            const limit = authEvents.has(event) ? 3 : 20;
            if (!rateOk(socket.id, limit)) {
                socket.emit('error', { message: 'Too many requests. Slow down.' });
                return;
            }
            next();
        });
        socket.on('disconnect', () => {
            rateLimits.delete(socket.id);
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
                markOnline(parsed.uid);
                broadcastOnlineCount(io);
                socket.emit('player:profile', toPublicProfile(profile));
                cb(ok(toPublicProfile(profile)));
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
                markOnline(profile.id);
                broadcastOnlineCount(io);
                socket.emit('player:profile', toPublicProfile(profile));
                cb(ok({ uid: profile.id, profile: toPublicProfile(profile) }));
            }
            catch (e) {
                cb(err(e.message ?? 'Login failed.'));
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
        // ── Report ───────────────────────────────────────────────────────
        socket.on('player:report', async (data, cb) => {
            try {
                const parsed = ReportSchema.parse(data);
                const reporterProfileId = socket.data.profileId;
                if (!reporterProfileId)
                    throw new Error('Not authenticated.');
                const reporter = await getPlayer(reporterProfileId);
                const reported = await getPlayer(parsed.targetProfileId);
                if (!reporter || !reported)
                    throw new Error('Player not found.');
                const report = await createReport(reporterProfileId, reporter.username, parsed.targetProfileId, reported.username, parsed.roomId, parsed.reason, parsed.details);
                await notifyMods(io, 'new_report', `New report: ${reported.username} — ${parsed.reason}`, reported.username);
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
                const username = playerProfile?.username ?? parsed.name;
                const room = createRoom(socket.id, username, profileId, parsed.settings);
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
                const isRejoin = profileId
                    ? [...room.players.values()].some(p => p.profileId === profileId)
                    : [...room.players.values()].some(p => p.name === parsed.name.trim());
                // Spectate queue: if room is full during active game and not a re-join
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
                if (parsed.isSpectator)
                    player.isSpectator = true;
                socket.join(room.id);
                socket.data.playerId = player.id;
                socket.data.roomId = room.id;
                broadcastSystemMsg(io, room, `${player.name} joined the room.`);
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
                handlePlayerLeave(io, socket, roomId, playerId);
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
                }
                broadcastSystemMsg(io, room, 'The game has begun. Roles are being revealed…');
                broadcastRoom(io, room);
                enforceVoicePhaseRules(io, room);
                startPhaseTimer(io, room);
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
                submitNightAction(room, actor, targetId);
                if (actor.role === 'sheriff') {
                    const result = getInvestigationResult(room, actor);
                    if (result && actor.socketId) {
                        io.to(actor.socketId).emit('game:investigation', result);
                    }
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
                submitVote(room, voter, targetId);
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
                timerService.stop(room.id);
                room.timer = 0;
                const wasNightSkip = room.phase === 'night';
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
                const majority = Math.floor(alivePlayers.length / 2) + 1;
                if (room.daySkipVotes.length >= majority) {
                    timerService.stop(room.id);
                    room.timer = 0;
                    const nextPhase = advancePhase(room);
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
                const players = (await getAllPlayers())
                    .filter(p => p.stats.gamesPlayed >= 3)
                    .sort((a, b) => b.stats.winRate - a.stats.winRate || b.stats.gamesPlayed - a.stats.gamesPlayed)
                    .slice(0, 20)
                    .map(toPublicProfile);
                cb(ok(players));
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
                for (const p of room.players.values()) {
                    p.role = null;
                    p.team = null;
                    p.isAlive = true;
                    p.isReady = false;
                    p.voteTarget = null;
                    p.hasActedThisPhase = false;
                }
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
                for (const p of room.players.values()) {
                    p.role = null;
                    p.team = null;
                    p.isAlive = true;
                    p.isReady = false;
                    p.voteTarget = null;
                    p.hasActedThisPhase = false;
                    p.lastWill = null;
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
                const profile = profileId ? await getPlayer(profileId) : null;
                const msg = createPlayerMessage(player, parsed.text, parsed.channel, profile?.isModerator ?? false);
                addMessage(room, msg);
                if (parsed.channel === 'mafia') {
                    for (const p of room.players.values()) {
                        if (p.team === 'mafia' && p.socketId)
                            io.to(p.socketId).emit('chat:new', msg);
                    }
                }
                else if (msg.channel === 'dead') {
                    for (const p of room.players.values()) {
                        if ((!p.isAlive || p.isSpectator) && p.socketId) {
                            io.to(p.socketId).emit('chat:new', msg);
                        }
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
                    targetSock?.emit('kicked', { reason: `Removed by moderator. Reason: ${reason}` });
                    targetSock?.leave(roomId);
                }
                removePlayer(room, target.id);
                broadcastSystemMsg(io, room, `${target.name} was removed by a moderator.`);
                broadcastRoom(io, room);
                await logKick(modProfileId, mod.username, target.profileId ?? targetProfileId, target.name, roomId, reason);
                await notifyMods(io, 'mod_kick', `${mod.username} kicked ${target.name} from room`, target.name);
                cb(ok(null));
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
                    targetSock?.emit('kicked', { reason: `Removed by moderator. Reason: ${reason}` });
                    targetSock?.leave(foundRoom.id);
                }
                removePlayer(foundRoom, foundTarget.id);
                broadcastSystemMsg(io, foundRoom, `${foundTarget.name} was removed by a moderator.`);
                broadcastRoom(io, foundRoom);
                await logKick(modProfileId, mod.username, foundTarget.profileId ?? targetProfileId, foundTarget.name, foundRoom.id, reason);
                await notifyMods(io, 'mod_kick', `${mod.username} kicked ${foundTarget.name} from room`, foundTarget.name);
                cb(ok(null));
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
                const target = await getPlayer(targetProfileId);
                await notifyMods(io, 'mod_ban', `${mod.username} banned ${target?.username ?? '?'}`, target?.username);
                cb(ok(null));
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
                const target = await getPlayer(targetProfileId);
                await notifyMods(io, 'mod_mute', `${mod.username} muted ${target?.username ?? '?'}`, target?.username);
                cb(ok(null));
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
        socket.on('mod:warn', async ({ targetProfileId, reason }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = await getPlayer(modProfileId);
                if (!mod || !canDo(mod, 'warn'))
                    throw new Error('Insufficient permissions.');
                const warning = await warnPlayer(modProfileId, mod.username, targetProfileId, reason);
                const targetSock = findSocketByProfile(io, targetProfileId);
                if (targetSock) {
                    targetSock.emit('warning:received', { reason, moderatorName: mod.username });
                }
                cb(ok(null));
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
                const achievements = await getPlayerAchievements(profileId);
                const history = await getPlayerHistory(profileId, 10);
                const clan = await getClanByPlayer(profileId);
                let friendshipStatus = 'none';
                const myProfileId = socket.data.profileId;
                if (myProfileId && myProfileId !== profileId) {
                    friendshipStatus = await getFriendshipStatus(myProfileId, profileId);
                }
                cb(ok({
                    profile: toPublicProfile(profile),
                    achievements,
                    recentGames: history,
                    clan: clan ? { id: clan.id, name: clan.name, tag: clan.tag } : null,
                    friendshipStatus,
                    isOnline: isOnline(profileId),
                }));
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
                cb(ok({ peers: existing.map(p => ({ socketId: p.socketId, name: p.name })), transmitAllowed }));
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
        // ── Daily Challenge ──────────────────────────────────────────────
        socket.on('challenge:today', async (cb) => {
            try {
                const profileId = socket.data.profileId;
                if (!profileId)
                    throw new Error('Not authenticated.');
                cb(ok(await getDailyChallengeForPlayer(profileId)));
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
                if (recipientSocket) {
                    const senderProfile = await getPlayer(senderId);
                    recipientSocket.emit('dm:new_message', {
                        conversationId,
                        message: msg,
                        senderUsername: senderProfile?.username ?? 'Unknown',
                        senderAvatar: senderProfile?.avatar ?? '?',
                    });
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
        // ── Disconnect ──────────────────────────────────────────────────
        socket.on('disconnect', () => {
            const { roomId, playerId, profileId } = socket.data;
            if (profileId) {
                markOffline(profileId);
                broadcastOnlineCount(io);
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
function closeRoom(io, room, reason) {
    timerService.stop(room.id);
    for (const p of room.players.values()) {
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
function handlePlayerLeave(io, socket, roomId, playerId) {
    const room = getRoom(roomId);
    if (!room)
        return;
    const player = room.players.get(playerId);
    if (!player)
        return;
    const wasHost = player.isHost;
    socket.leave(roomId);
    socket.data.playerId = null;
    socket.data.roomId = null;
    if (room.phase === 'lobby') {
        removePlayer(room, playerId);
        if (room.players.size === 0) {
            timerService.stop(roomId);
            deleteRoom(roomId);
            spectateQueues.delete(roomId);
            return;
        }
        // Host left lobby — close the room for everyone
        if (wasHost) {
            closeRoom(io, room, `${player.name} (host) left. The room has been closed.`);
            spectateQueues.delete(roomId);
            return;
        }
        broadcastSystemMsg(io, room, `${player.name} left the room.`);
        broadcastRoom(io, room);
        promoteFromQueue(io, room);
    }
    else {
        // Host left during active game — close the entire room
        if (wasHost) {
            closeRoom(io, room, `${player.name} (host) left. The room has been closed.`);
            spectateQueues.delete(roomId);
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
        // Mafia players leave the room channel (so they can join the mafia channel).
        // Non-mafia players stay in the room channel but are muted until day resumes.
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
            else {
                io.to(member.socketId).emit('voice:force-mute', { reason: 'Voice muted during night phase.' });
            }
        }
        return;
    }
    // Leaving night — clean up any stale mafia channel connections
    forceLeaveVoiceChannel(io, roomId, 'mafia', 'Mafia voice is only available during night.');
    if (phase === 'speech') {
        const speakerId = room.speechOrder[room.currentSpeakerIdx] ?? null;
        for (const member of voiceGetMembers(roomId, 'room')) {
            const player = room.players.get(member.playerId);
            if (!player?.isAlive || player?.isSpectator) {
                io.to(member.socketId).emit('voice:force-mute', { reason: 'Listen only.' });
            }
            else if (member.playerId === speakerId) {
                io.to(member.socketId).emit('voice:force-unmute');
            }
            else {
                io.to(member.socketId).emit('voice:force-mute', { reason: 'Only the current speaker may transmit.' });
            }
        }
        return;
    }
    // day, voting, lobby, role_reveal, game_over — lift force mutes for alive players only
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