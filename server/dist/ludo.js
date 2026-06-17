import { ok, err, } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, getMatchForSocket, getOpenMatches, joinMatch, doRoll, doMove, doResign, doRematch, doLeave, addChat, cleanupSocket, } from './services/ludoService.js';
import { addXP } from './services/playerService.js';
const LUDO_ROOM = (id) => `ld:${id}`;
function toPublic(match) {
    return {
        id: match.id,
        code: match.code,
        status: match.status,
        red: {
            name: match.red.name,
            profileId: match.red.profileId,
            socketId: match.red.socketId,
            pieces: match.red.pieces,
        },
        blue: match.blue ? {
            name: match.blue.name,
            profileId: match.blue.profileId,
            socketId: match.blue.socketId,
            pieces: match.blue.pieces,
        } : null,
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
    return {
        id: match.id,
        code: match.code,
        status: match.status,
        redName: match.red.name,
        blueName: match.blue?.name ?? null,
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
            const existing = getMatchForSocket(socket.id);
            if (existing && existing.status !== 'finished') {
                return cb(err('You are already in a Ludo match.'));
            }
            const match = createMatch({ socketId: socket.id, name, profileId: socket.data.profileId ?? null });
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
            if (match.red.socketId === socket.id || match.blue?.socketId === socket.id) {
                socket.join(LUDO_ROOM(match.id));
                return cb(ok(toPublic(match)));
            }
            const existing = getMatchForSocket(socket.id);
            if (existing && existing.id !== match.id && existing.status !== 'finished') {
                return cb(err('You are already in another Ludo match.'));
            }
            const { role } = joinMatch(match.id, { socketId: socket.id, name, profileId: socket.data.profileId ?? null });
            socket.join(LUDO_ROOM(match.id));
            if (role === 'blue') {
                broadcastState(io, match);
                broadcastList(io);
            }
            cb(ok(toPublic(match)));
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
                const winner = result.winnerColor === 'red' ? match.red : match.blue;
                const loser = result.winnerColor === 'red' ? match.blue : match.red;
                if (winner?.profileId)
                    addXP(winner.profileId, 25).catch(() => { });
                if (loser?.profileId)
                    addXP(loser.profileId, 8).catch(() => { });
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
            const winner = winnerColor === 'red' ? match.red : match.blue;
            const loser = winnerColor === 'red' ? match.blue : match.red;
            if (winner?.profileId)
                addXP(winner.profileId, 25).catch(() => { });
            if (loser?.profileId)
                addXP(loser.profileId, 8).catch(() => { });
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
            const redSock = io.sockets.sockets.get(nm.red.socketId);
            const blueSock = nm.blue ? io.sockets.sockets.get(nm.blue.socketId) : null;
            if (redSock) {
                redSock.join(LUDO_ROOM(nm.id));
                redSock.leave(LUDO_ROOM(old.id));
            }
            if (blueSock) {
                blueSock.join(LUDO_ROOM(nm.id));
                blueSock.leave(LUDO_ROOM(old.id));
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
}
function handleLudoLeave(io, socketId, match) {
    const { match: updated, wasPlayer } = doLeave(socketId);
    if (updated && wasPlayer) {
        broadcastState(io, updated);
        broadcastList(io);
    }
}
export function handleLudoDisconnect(io, socketId) {
    const match = cleanupSocket(socketId);
    if (match) {
        broadcastState(io, match);
        broadcastList(io);
    }
}
//# sourceMappingURL=ludo.js.map