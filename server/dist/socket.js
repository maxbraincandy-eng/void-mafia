import { z } from 'zod';
import { ok, err, } from './types/index.js';
import { createRoom, getRoom, getRoomByCode, deleteRoom, addPlayer, removePlayer, getPlayerBySocket, toPublicRoom, } from './services/roomService.js';
import { startGame, setPhase, advancePhase, submitNightAction, submitVote, buildGameOverResult, allNightActionsSubmitted, getInvestigationResult, resolveVotes, } from './services/gameService.js';
import { createPlayerMessage, createSystemMessage, addMessage, validateChat, } from './services/chatService.js';
import { timerService } from './services/timerService.js';
import { getRole } from './services/roleService.js';
// ── Validation Schemas ────────────────────────────────────────────────
const CreateRoomSchema = z.object({
    name: z.string().min(1).max(24),
    settings: z.object({
        nightDuration: z.number().int().min(15).max(300).optional(),
        dayDuration: z.number().int().min(30).max(600).optional(),
        voteDuration: z.number().int().min(15).max(300).optional(),
        allowDoctorSelfHeal: z.boolean().optional(),
        tieVoteRule: z.enum(['no_elimination', 'random']).optional(),
        minPlayers: z.number().int().min(4).max(16).optional(),
        roles: z.record(z.number()).optional(),
    }).optional(),
});
const JoinRoomSchema = z.object({
    code: z.string().length(6),
    name: z.string().min(1).max(24),
});
const ChatSchema = z.object({
    text: z.string().min(1).max(400),
    channel: z.enum(['room', 'mafia', 'dead']),
});
// ── Helpers ───────────────────────────────────────────────────────────
/** Broadcast updated room state to all players in the room. */
function broadcastRoom(io, room) {
    for (const player of room.players.values()) {
        if (player.socketId) {
            const view = toPublicRoom(room, player.id);
            io.to(player.socketId).emit('room:update', view);
        }
    }
}
/** Start phase timer and auto-advance when it ends. */
function startPhaseTimer(io, room) {
    timerService.stop(room.id);
    if (!room.timer || room.timer <= 0)
        return;
    timerService.start(room.id, room.timer, (remaining) => {
        room.timer = remaining;
        broadcastRoom(io, room);
    }, async () => {
        room.timer = 0;
        advancePhase(room);
        const nextPhase = room.phase;
        if (nextPhase === 'game_over') {
            const result = buildGameOverResult(room);
            for (const player of room.players.values()) {
                if (player.socketId)
                    io.to(player.socketId).emit('game:over', result);
            }
        }
        broadcastRoom(io, room);
        if (room.phase !== 'game_over') {
            startPhaseTimer(io, room);
        }
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
// ── Main ──────────────────────────────────────────────────────────────
export function attachSocketHandlers(io) {
    io.on('connection', (socket) => {
        socket.data.playerId = null;
        socket.data.roomId = null;
        // ── Create Room ─────────────────────────────────────────────────
        socket.on('room:create', (data, cb) => {
            try {
                const parsed = CreateRoomSchema.parse(data);
                const room = createRoom(socket.id, parsed.name, parsed.settings);
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
                const room = getRoomByCode(parsed.code);
                if (!room)
                    throw new Error('Room not found. Check the code and try again.');
                const player = addPlayer(room, socket.id, parsed.name);
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
            if (roomId && playerId) {
                handlePlayerLeave(io, socket, roomId, playerId);
            }
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
                // Send each player their private role
                for (const player of room.players.values()) {
                    if (player.socketId && player.role) {
                        const role = getRole(player.role);
                        io.to(player.socketId).emit('game:role', { role });
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
                // Private result for sheriff
                if (actor.role === 'sheriff') {
                    const result = getInvestigationResult(room, actor);
                    if (result && actor.socketId) {
                        io.to(actor.socketId).emit('game:investigation', result);
                    }
                }
                broadcastRoom(io, room);
                // Auto-advance if all night roles have acted
                if (allNightActionsSubmitted(room)) {
                    timerService.stop(room.id);
                    room.timer = 0;
                    advancePhase(room);
                    const nextPhase = room.phase;
                    announceNightResult(io, room);
                    if (nextPhase === 'game_over') {
                        const result = buildGameOverResult(room);
                        for (const p of room.players.values()) {
                            if (p.socketId)
                                io.to(p.socketId).emit('game:over', result);
                        }
                    }
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
        // ── Skip Phase (host) ───────────────────────────────────────────
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
                if (nextPhase === 'game_over') {
                    const result = buildGameOverResult(room);
                    for (const p of room.players.values()) {
                        if (p.socketId)
                            io.to(p.socketId).emit('game:over', result);
                    }
                }
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
                const validationError = validateChat(room, player, parsed.channel);
                if (validationError)
                    throw new Error(validationError);
                const msg = createPlayerMessage(player, parsed.text, parsed.channel);
                addMessage(room, msg);
                if (parsed.channel === 'mafia') {
                    // Only mafia players get this message
                    for (const p of room.players.values()) {
                        if (p.team === 'mafia' && p.socketId) {
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
        // ── Disconnect ──────────────────────────────────────────────────
        socket.on('disconnect', () => {
            const { roomId, playerId } = socket.data;
            if (roomId && playerId) {
                handlePlayerLeave(io, socket, roomId, playerId);
            }
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
        broadcastSystemMsg(io, room, `${player.name} left the room.`);
        if (room.players.size === 0) {
            timerService.stop(roomId);
            deleteRoom(roomId);
            return;
        }
        broadcastRoom(io, room);
    }
    else {
        // During game: mark disconnected
        player.isConnected = false;
        player.socketId = '';
        broadcastSystemMsg(io, room, `${player.name} disconnected.`);
        broadcastRoom(io, room);
    }
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
function announceNightResult(io, room) {
    const result = {
        killed: room.killedLastNight,
        saved: room.savedLastNight,
    };
    io.to(room.id).emit('game:night_result', result);
    if (room.killedLastNight.length > 0) {
        const names = room.killedLastNight.map(k => k.name).join(', ');
        broadcastSystemMsg(io, room, `Dawn breaks. ${names} was found dead.`);
    }
    else if (room.savedLastNight) {
        broadcastSystemMsg(io, room, 'Dawn breaks. Everyone survived the night — the Doctor saved someone.');
    }
    else {
        broadcastSystemMsg(io, room, 'Dawn breaks. The night passed quietly.');
    }
}
function announceVoteResult(io, room) {
    const eliminated = resolveVotes(room);
    if (eliminated) {
        const target = room.players.get(eliminated);
        if (target) {
            broadcastSystemMsg(io, room, `${target.name} was eliminated by vote.`);
        }
    }
    else {
        broadcastSystemMsg(io, room, 'The vote ended in a tie. No one was eliminated.');
    }
}
//# sourceMappingURL=socket.js.map