import { ok, err, } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, getMatchForSocket, getOpenMatches, joinMatch, doRoll, doMove, doResign, doRematch, doLeave, addChat, cleanupSocket, startMatch, PLAYER_ORDER, } from './services/ludoService.js';
import { addXP } from './services/playerService.js';
import { voiceJoin as ludoVoiceJoin, voiceLeave as ludoVoiceLeave, voiceGetMatchId as ludoVoiceGetMatchId, } from './services/ludoVoiceService.js';
import { buildIceConfig } from './lib/iceConfig.js';
const LUDO_ROOM = (id) => `ld:${id}`;
function toPublic(match) {
    const mapSide = (s) => s ? {
        name: s.name,
        profileId: s.profileId,
        socketId: s.socketId,
        pieces: s.pieces,
    } : null;
    return {
        id: match.id,
        code: match.code,
        status: match.status,
        maxPlayers: match.maxPlayers,
        players: {
            red: mapSide(match.players.red),
            blue: mapSide(match.players.blue),
            green: mapSide(match.players.green),
            yellow: mapSide(match.players.yellow),
        },
        playerOrder: match.playerOrder,
        currentTurn: match.currentTurn,
        diceRoll: match.diceRoll,
        diceRolled: match.diceRolled,
        movablePieceIds: match.movablePieceIds,
        consecutiveSixes: match.consecutiveSixes,
        winnerColor: match.winnerColor,
        chat: match.chat.slice(-80),
        spectatorCount: match.spectatorSocketIds.length,
    };
}
function toListItem(match) {
    const playerNames = PLAYER_ORDER
        .filter(c => match.players[c] !== null)
        .map(c => match.players[c].name);
    return {
        id: match.id,
        code: match.code,
        status: match.status,
        playerCount: playerNames.length,
        maxPlayers: match.maxPlayers,
        playerNames,
        spectatorCount: match.spectatorSocketIds.length,
        createdAt: match.createdAt,
    };
}
function broadcastState(io, match) {
    io.to(LUDO_ROOM(match.id)).emit('ludo:state', toPublic(match));
}
function broadcastList(io) {
    io.emit('ludo:list_update', getOpenMatches().map(toListItem));
}
// ── Handler Registration ───────────────────────────────────────────────
export function registerLudoHandlers(io, socket) {
    socket.on('ludo:list', (cb) => {
        try {
            cb(ok(getOpenMatches().map(toListItem)));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('ludo:create', (data, cb) => {
        try {
            const name = String(data?.name ?? 'Player').trim().slice(0, 24) || 'Player';
            const maxPlayers = ([2, 3, 4].includes(data?.maxPlayers) ? data.maxPlayers : 2);
            const existing = getMatchForSocket(socket.id);
            if (existing && existing.status !== 'finished') {
                return cb(err('You are already in a Ludo match.'));
            }
            const match = createMatch({ socketId: socket.id, name, profileId: socket.data.profileId ?? null }, maxPlayers);
            socket.join(LUDO_ROOM(match.id));
            broadcastList(io);
            cb(ok(toPublic(match)));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('ludo:join', (data, cb) => {
        try {
            const name = String(data?.name ?? 'Player').trim().slice(0, 24) || 'Player';
            const match = getMatchByCode(data.code ?? '');
            if (!match)
                return cb(err('Match not found.'));
            if (match.status === 'finished')
                return cb(err('This match has ended.'));
            // Re-join own match
            const isInMatch = PLAYER_ORDER.some(c => match.players[c]?.socketId === socket.id);
            if (isInMatch) {
                socket.join(LUDO_ROOM(match.id));
                return cb(ok(toPublic(match)));
            }
            const existing = getMatchForSocket(socket.id);
            if (existing && existing.id !== match.id && existing.status !== 'finished') {
                return cb(err('You are already in another Ludo match.'));
            }
            const { role } = joinMatch(match.id, { socketId: socket.id, name, profileId: socket.data.profileId ?? null });
            socket.join(LUDO_ROOM(match.id));
            if (role !== 'spectator') {
                broadcastState(io, match);
                broadcastList(io);
            }
            cb(ok(toPublic(match)));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('ludo:start', (data, cb) => {
        try {
            const match = startMatch(data.matchId, socket.id);
            broadcastState(io, match);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('ludo:roll', (data, cb) => {
        try {
            const result = doRoll(data.matchId, socket.id);
            const match = getMatch(data.matchId);
            if (!match)
                return cb(err('Match not found.'));
            broadcastState(io, match);
            cb(ok(result));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('ludo:move', (data, cb) => {
        try {
            const result = doMove(data.matchId, socket.id, data.pieceId);
            const match = getMatch(data.matchId);
            if (!match)
                return cb(err('Match not found.'));
            if (result.winnerColor) {
                for (const color of PLAYER_ORDER) {
                    const side = match.players[color];
                    if (!side)
                        continue;
                    if (side.profileId) {
                        addXP(side.profileId, color === result.winnerColor ? 25 : 8).catch(() => { });
                    }
                }
                broadcastList(io);
            }
            broadcastState(io, match);
            cb(ok(result));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('ludo:resign', (data, cb) => {
        try {
            const winnerColor = doResign(data.matchId, socket.id);
            const match = getMatch(data.matchId);
            if (!match)
                return cb(err('Match not found.'));
            if (match.status === 'finished') {
                for (const color of PLAYER_ORDER) {
                    const side = match.players[color];
                    if (side?.profileId) {
                        addXP(side.profileId, color === winnerColor ? 25 : 8).catch(() => { });
                    }
                }
            }
            broadcastState(io, match);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('ludo:rematch', (data, cb) => {
        try {
            const old = getMatch(data.matchId);
            if (!old)
                return cb(err('Match not found.'));
            const nm = doRematch(data.matchId, socket.id);
            for (const color of PLAYER_ORDER) {
                const side = nm.players[color];
                if (side) {
                    const s = io.sockets.sockets.get(side.socketId);
                    if (s) {
                        s.join(LUDO_ROOM(nm.id));
                        s.leave(LUDO_ROOM(old.id));
                    }
                }
            }
            for (const sid of nm.spectatorSocketIds) {
                const s = io.sockets.sockets.get(sid);
                if (s) {
                    s.join(LUDO_ROOM(nm.id));
                    s.leave(LUDO_ROOM(old.id));
                }
            }
            broadcastState(io, nm);
            broadcastList(io);
            cb(ok({ newMatchId: nm.id, newCode: nm.code }));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('ludo:leave', (data, cb) => {
        try {
            const match = getMatch(data?.matchId);
            if (!match)
                return cb(ok(null));
            handleLudoLeave(io, socket.id, match);
            socket.leave(LUDO_ROOM(match.id));
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('ludo:chat', (data, cb) => {
        try {
            const text = String(data.text ?? '').trim().slice(0, 300);
            if (!text)
                return cb(err('Empty message.'));
            const msg = addChat(data.matchId, socket.id, text);
            const match = getMatch(data.matchId);
            if (match)
                io.to(LUDO_ROOM(match.id)).emit('ludo:chat', msg);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Voice (PTT) ──────────────────────────────────────────────────────
    socket.on('ludo:voice-join', (data, cb) => {
        try {
            const match = getMatch(data.matchId);
            if (!match)
                return cb(err('Match not found.'));
            const peers = ludoVoiceJoin(data.matchId, socket.id, data.name ?? 'Player');
            const { iceServers, iceTransportPolicy } = buildIceConfig();
            socket.to(LUDO_ROOM(match.id)).emit('ludo:voice-peer-joined', {
                socketId: socket.id,
                name: data.name ?? 'Player',
            });
            cb(ok({ peers, iceServers, iceTransportPolicy }));
        }
        catch (e) {
            cb(err(e.message ?? 'Failed to join voice.'));
        }
    });
    socket.on('ludo:voice-leave', (_data, cb) => {
        const matchId = ludoVoiceLeave(socket.id);
        if (matchId) {
            socket.to(LUDO_ROOM(matchId)).emit('ludo:voice-peer-left', { socketId: socket.id });
        }
        cb?.(ok(null));
    });
    socket.on('ludo:voice-offer', (data) => {
        io.to(data.to).emit('ludo:voice-offer', { from: socket.id, sdp: data.sdp });
    });
    socket.on('ludo:voice-answer', (data) => {
        io.to(data.to).emit('ludo:voice-answer', { from: socket.id, sdp: data.sdp });
    });
    socket.on('ludo:voice-ice', (data) => {
        io.to(data.to).emit('ludo:voice-ice', { from: socket.id, candidate: data.candidate });
    });
    socket.on('ludo:ptt-start', (data) => {
        const match = getMatch(data.matchId);
        if (!match)
            return;
        socket.to(LUDO_ROOM(data.matchId)).emit('ludo:ptt-state', {
            socketId: socket.id, speaking: true,
        });
    });
    socket.on('ludo:ptt-stop', (data) => {
        const match = getMatch(data.matchId);
        if (!match)
            return;
        socket.to(LUDO_ROOM(data.matchId)).emit('ludo:ptt-state', {
            socketId: socket.id, speaking: false,
        });
    });
}
function handleLudoLeave(io, socketId, match) {
    const { match: updated, wasPlayer } = doLeave(socketId);
    if (updated && wasPlayer) {
        broadcastState(io, updated);
        broadcastList(io);
    }
}
export function handleLudoDisconnect(io, socketId) {
    // Voice cleanup
    const voiceMatchId = ludoVoiceGetMatchId(socketId);
    if (voiceMatchId) {
        ludoVoiceLeave(socketId);
        io.to(LUDO_ROOM(voiceMatchId)).emit('ludo:voice-peer-left', { socketId });
        io.to(LUDO_ROOM(voiceMatchId)).emit('ludo:ptt-state', { socketId, speaking: false });
    }
    const match = cleanupSocket(socketId);
    if (match) {
        broadcastState(io, match);
        broadcastList(io);
    }
}
//# sourceMappingURL=ludo.js.map