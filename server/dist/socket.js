import { z } from 'zod';
import { ok, err, } from './types/index.js';
import { createRoom, getRoom, getRoomByCode, deleteRoom, addPlayer, removePlayer, getPlayerBySocket, toPublicRoom, toRoomListItem, getAllRooms, getPlayerByProfile, } from './services/roomService.js';
import { startGame, setPhase, advancePhase, submitNightAction, submitVote, buildGameOverResult, allNightActionsSubmitted, getInvestigationResult, resolveVotes, } from './services/gameService.js';
import { createPlayerMessage, createSystemMessage, addMessage, validateChat, } from './services/chatService.js';
import { timerService } from './services/timerService.js';
import { getRole } from './services/roleService.js';
import { getOrCreatePlayer, getPlayer, toPublicProfile, addGameResult, getActiveBan, getActiveMute, findSocketByProfile, } from './services/playerService.js';
import { canDo, banPlayer, unbanPlayer, mutePlayer, unmutePlayer, warnPlayer, createReport, getReports, resolveReport, getLogs, getModPlayers, } from './services/moderationService.js';
// ── Validation Schemas ────────────────────────────────────────────────
const CreateRoomSchema = z.object({
    name: z.string().min(1).max(24),
    settings: z.record(z.unknown()).optional(),
});
const JoinRoomSchema = z.object({
    code: z.string().length(6),
    name: z.string().min(1).max(24),
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
function startPhaseTimer(io, room) {
    timerService.stop(room.id);
    if (!room.timer || room.timer <= 0)
        return;
    timerService.start(room.id, room.timer, (remaining) => { room.timer = remaining; broadcastRoom(io, room); }, async () => {
        room.timer = 0;
        if (room.phase === 'voting')
            announceVoteResult(io, room);
        if (room.phase === 'night')
            announceNightResult(io, room);
        advancePhase(room);
        const nextPhase = room.phase;
        if (nextPhase === 'game_over')
            emitGameOver(io, room);
        broadcastRoom(io, room);
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
function emitGameOver(io, room) {
    const result = buildGameOverResult(room);
    for (const p of room.players.values()) {
        if (p.socketId)
            io.to(p.socketId).emit('game:over', result);
        // Record stats
        if (p.profileId && room.winner) {
            const won = p.team === room.winner;
            addGameResult(p.profileId, won);
        }
    }
}
function notifyMods(io, type, message, targetName) {
    for (const [, sock] of io.sockets.sockets) {
        const profileId = sock.data.profileId;
        if (!profileId)
            continue;
        const profile = getPlayer(profileId);
        if (profile?.isModerator) {
            sock.emit('mod:notification', { type, message, targetName });
        }
    }
}
function announceNightResult(io, room) {
    const result = { killed: room.killedLastNight, saved: room.savedLastNight };
    io.to(room.id).emit('game:night_result', result);
    if (room.killedLastNight.length > 0) {
        const names = room.killedLastNight.map(k => k.name).join(', ');
        broadcastSystemMsg(io, room, `Dawn breaks. ${names} was found dead.`);
    }
    else if (room.savedLastNight) {
        broadcastSystemMsg(io, room, 'Dawn breaks. Everyone survived the night.');
    }
    else {
        broadcastSystemMsg(io, room, 'Dawn breaks. The night passed quietly.');
    }
}
function announceVoteResult(io, room) {
    const eliminated = resolveVotes(room);
    if (eliminated) {
        const target = room.players.get(eliminated);
        if (target)
            broadcastSystemMsg(io, room, `${target.name} was eliminated by vote.`);
    }
    else {
        broadcastSystemMsg(io, room, 'The vote ended in a tie. No one was eliminated.');
    }
}
// ── Main ──────────────────────────────────────────────────────────────
export function attachSocketHandlers(io) {
    io.on('connection', (socket) => {
        socket.data.playerId = null;
        socket.data.roomId = null;
        socket.data.profileId = null;
        // ── Auth ─────────────────────────────────────────────────────────
        socket.on('player:auth', (data, cb) => {
            try {
                const parsed = AuthSchema.parse(data);
                const profile = getOrCreatePlayer(parsed.uid, parsed.username);
                // Check ban
                const ban = getActiveBan(parsed.uid);
                if (ban) {
                    cb(err(`You are banned until ${new Date(ban.expiresAt).toLocaleString()}. Reason: ${ban.reason}`));
                    return;
                }
                socket.data.profileId = parsed.uid;
                socket.emit('player:profile', toPublicProfile(profile));
                cb(ok(toPublicProfile(profile)));
            }
            catch (e) {
                cb(err(e.message ?? 'Auth failed.'));
            }
        });
        // ── Player Stats ─────────────────────────────────────────────────
        socket.on('player:stats', ({ profileId }, cb) => {
            try {
                const profile = getPlayer(profileId);
                if (!profile)
                    throw new Error('Player not found.');
                cb(ok(toPublicProfile(profile)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Report ───────────────────────────────────────────────────────
        socket.on('player:report', (data, cb) => {
            try {
                const parsed = ReportSchema.parse(data);
                const reporterProfileId = socket.data.profileId;
                if (!reporterProfileId)
                    throw new Error('Not authenticated.');
                const reporter = getPlayer(reporterProfileId);
                const reported = getPlayer(parsed.targetProfileId);
                if (!reporter || !reported)
                    throw new Error('Player not found.');
                const report = createReport(reporterProfileId, reporter.username, parsed.targetProfileId, reported.username, parsed.roomId, parsed.reason, parsed.details);
                notifyMods(io, 'new_report', `New report: ${reported.username} — ${parsed.reason}`, reported.username);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Create Room ─────────────────────────────────────────────────
        socket.on('room:create', (data, cb) => {
            try {
                const parsed = CreateRoomSchema.parse(data);
                const profileId = socket.data.profileId;
                const ban = profileId ? getActiveBan(profileId) : null;
                if (ban)
                    throw new Error(`You are banned. Reason: ${ban.reason}`);
                const username = profileId ? getPlayer(profileId)?.username ?? parsed.name : parsed.name;
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
        socket.on('room:join', (data, cb) => {
            try {
                const parsed = JoinRoomSchema.parse(data);
                const profileId = socket.data.profileId;
                const ban = profileId ? getActiveBan(profileId) : null;
                if (ban)
                    throw new Error(`You are banned until ${new Date(ban.expiresAt).toLocaleString()}. Reason: ${ban.reason}`);
                const room = getRoomByCode(parsed.code);
                if (!room)
                    throw new Error('Room not found. Check the code and try again.');
                const username = profileId ? getPlayer(profileId)?.username ?? parsed.name : parsed.name;
                const player = addPlayer(room, socket.id, username, profileId);
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
                startGame(room);
                setPhase(room, 'role_reveal');
                for (const player of room.players.values()) {
                    if (player.socketId && player.role) {
                        io.to(player.socketId).emit('game:role', { role: getRole(player.role) });
                    }
                }
                broadcastSystemMsg(io, room, 'The game has begun. Roles are being revealed…');
                broadcastRoom(io, room);
                startPhaseTimer(io, room);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Night Action ────────────────────────────────────────────────
        socket.on('game:action', ({ targetId }, cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const actor = getPlayerOrError(socket, room);
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
                    announceNightResult(io, room);
                    advancePhase(room);
                    const nextPhase = room.phase;
                    if (nextPhase === 'game_over')
                        emitGameOver(io, room);
                    broadcastRoom(io, room);
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
                submitVote(room, voter, targetId);
                broadcastRoom(io, room);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Skip Phase ──────────────────────────────────────────────────
        socket.on('game:skip', (cb) => {
            try {
                const room = getRoomFromSocket(socket);
                const host = getPlayerOrError(socket, room);
                if (!host.isHost)
                    throw new Error('Only the host can skip phases.');
                if (room.phase === 'lobby' || room.phase === 'game_over')
                    throw new Error('Cannot skip this phase.');
                timerService.stop(room.id);
                room.timer = 0;
                if (room.phase === 'voting')
                    announceVoteResult(io, room);
                if (room.phase === 'night')
                    announceNightResult(io, room);
                advancePhase(room);
                const nextPhase = room.phase;
                if (nextPhase === 'game_over')
                    emitGameOver(io, room);
                broadcastRoom(io, room);
                if (nextPhase !== 'game_over')
                    startPhaseTimer(io, room);
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
                for (const p of room.players.values()) {
                    p.role = null;
                    p.team = null;
                    p.isAlive = true;
                    p.isReady = false;
                    p.voteTarget = null;
                    p.hasActedThisPhase = false;
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
        socket.on('chat:send', (data, cb) => {
            try {
                const parsed = ChatSchema.parse(data);
                const room = getRoomFromSocket(socket);
                const player = getPlayerOrError(socket, room);
                // Check mute
                const profileId = socket.data.profileId;
                if (profileId) {
                    const mute = getActiveMute(profileId);
                    if (mute)
                        throw new Error(`You are muted until ${new Date(mute.expiresAt).toLocaleString()}. Reason: ${mute.reason}`);
                }
                const validationError = validateChat(room, player, parsed.channel);
                if (validationError)
                    throw new Error(validationError);
                const profile = profileId ? getPlayer(profileId) : null;
                const msg = createPlayerMessage(player, parsed.text, parsed.channel, profile?.isModerator ?? false);
                addMessage(room, msg);
                if (parsed.channel === 'mafia') {
                    for (const p of room.players.values()) {
                        if (p.team === 'mafia' && p.socketId)
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
        socket.on('mod:kick_from_room', ({ targetProfileId, roomId, reason }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = getPlayer(modProfileId);
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
                notifyMods(io, 'mod_kick', `${mod.username} kicked ${target.name} from room`, target.name);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Ban ─────────────────────────────────────────────────────
        socket.on('mod:ban', ({ targetProfileId, reason, duration }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = getPlayer(modProfileId);
                if (!mod || !canDo(mod, 'ban_short'))
                    throw new Error('Insufficient permissions.');
                const ban = banPlayer(modProfileId, mod.username, targetProfileId, reason, duration);
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
                const target = getPlayer(targetProfileId);
                notifyMods(io, 'mod_ban', `${mod.username} banned ${target?.username ?? '?'}`, target?.username);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Unban ───────────────────────────────────────────────────
        socket.on('mod:unban', ({ targetProfileId }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = getPlayer(modProfileId);
                if (!mod || !canDo(mod, 'ban_short'))
                    throw new Error('Insufficient permissions.');
                unbanPlayer(modProfileId, mod.username, targetProfileId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Mute ────────────────────────────────────────────────────
        socket.on('mod:mute', ({ targetProfileId, reason, duration }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = getPlayer(modProfileId);
                if (!mod || !canDo(mod, 'mute'))
                    throw new Error('Insufficient permissions.');
                const mute = mutePlayer(modProfileId, mod.username, targetProfileId, reason, duration);
                const targetSock = findSocketByProfile(io, targetProfileId);
                if (targetSock) {
                    targetSock.emit('mute:received', { reason, expiresAt: mute.expiresAt });
                }
                const target = getPlayer(targetProfileId);
                notifyMods(io, 'mod_mute', `${mod.username} muted ${target?.username ?? '?'}`, target?.username);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Unmute ──────────────────────────────────────────────────
        socket.on('mod:unmute', ({ targetProfileId }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = getPlayer(modProfileId);
                if (!mod || !canDo(mod, 'mute'))
                    throw new Error('Insufficient permissions.');
                unmutePlayer(modProfileId, mod.username, targetProfileId);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Mod: Warn ────────────────────────────────────────────────────
        socket.on('mod:warn', ({ targetProfileId, reason }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = getPlayer(modProfileId);
                if (!mod || !canDo(mod, 'warn'))
                    throw new Error('Insufficient permissions.');
                const warning = warnPlayer(modProfileId, mod.username, targetProfileId, reason);
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
        socket.on('mod:get_reports', (cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'view_reports'))
                    throw new Error('Insufficient permissions.');
                cb(ok(getReports()));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('mod:get_rooms', (cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'view_reports'))
                    throw new Error('Insufficient permissions.');
                cb(ok(getAllRooms().map(toRoomListItem)));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('mod:get_players', (cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'view_reports'))
                    throw new Error('Insufficient permissions.');
                cb(ok(getModPlayers()));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('mod:get_logs', (cb) => {
            try {
                const modProfileId = socket.data.profileId;
                const mod = modProfileId ? getPlayer(modProfileId) : null;
                if (!mod || !canDo(mod, 'view_logs'))
                    throw new Error('Insufficient permissions.');
                cb(ok(getLogs()));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        socket.on('mod:resolve_report', ({ reportId, status, notes }, cb) => {
            try {
                const modProfileId = socket.data.profileId;
                if (!modProfileId)
                    throw new Error('Not authenticated.');
                const mod = getPlayer(modProfileId);
                if (!mod || !canDo(mod, 'resolve_reports'))
                    throw new Error('Insufficient permissions.');
                resolveReport(modProfileId, reportId, status, notes);
                cb(ok(null));
            }
            catch (e) {
                cb(err(e.message));
            }
        });
        // ── Disconnect ──────────────────────────────────────────────────
        socket.on('disconnect', () => {
            const { roomId, playerId } = socket.data;
            if (roomId && playerId)
                handlePlayerLeave(io, socket, roomId, playerId);
        });
    });
}
// ── Leave / Disconnect Logic ──────────────────────────────────────────
function handlePlayerLeave(io, socket, roomId, playerId) {
    const room = getRoom(roomId);
    if (!room)
        return;
    const player = room.players.get(playerId);
    if (!player)
        return;
    socket.leave(roomId);
    socket.data.playerId = null;
    socket.data.roomId = null;
    if (room.phase === 'lobby') {
        removePlayer(room, playerId);
        const wasHost = player.isHost;
        broadcastSystemMsg(io, room, `${player.name} left the room.`);
        if (room.players.size === 0) {
            timerService.stop(roomId);
            deleteRoom(roomId);
            return;
        }
        broadcastRoom(io, room);
    }
    else {
        player.isConnected = false;
        player.socketId = '';
        broadcastSystemMsg(io, room, `${player.name} disconnected.`);
        broadcastRoom(io, room);
    }
}
//# sourceMappingURL=socket.js.map