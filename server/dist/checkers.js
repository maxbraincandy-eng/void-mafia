import { ok, err, } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, getMatchForSocket, getOpenMatches, applyMove, finishMatch, } from './services/checkersService.js';
import { addXP } from './services/playerService.js';
const CHECKERS_ROOM = (id) => `ck:${id}`;
// ── Public state sent to all clients in the room ───────────────────────
// myColor is NOT computed here — the client determines it from its own socket.id
// vs the redSocketId / blackSocketId fields.
function toPublic(match) {
    return {
        id: match.id,
        code: match.code,
        status: match.status,
        // Include socket IDs so each client can self-identify their color.
        red: {
            name: match.red.name,
            profileId: match.red.profileId,
            socketId: match.red.socketId,
        },
        black: match.black ? {
            name: match.black.name,
            profileId: match.black.profileId,
            socketId: match.black.socketId,
        } : null,
        currentTurn: match.currentTurn,
        board: match.board,
        capturedByRed: match.capturedByRed,
        capturedByBlack: match.capturedByBlack,
        winnerColor: match.winnerColor,
        settings: match.settings,
        chat: match.chat.slice(-80),
        spectatorCount: match.spectatorSocketIds.length,
        mustContinueFrom: match.mustContinueFrom,
    };
}
function toListItem(match) {
    return {
        id: match.id,
        code: match.code,
        status: match.status,
        redName: match.red.name,
        blackName: match.black?.name ?? null,
        currentTurn: match.currentTurn,
        spectatorCount: match.spectatorSocketIds.length,
        createdAt: match.createdAt,
    };
}
// Single broadcast to the room — everyone gets the same state.
// Each client self-identifies via its own socket.id.
function broadcastState(io, match) {
    io.to(CHECKERS_ROOM(match.id)).emit('checkers:state', toPublic(match));
}
// ── Handler Registration ───────────────────────────────────────────────
export function registerCheckersHandlers(io, socket) {
    // ── List open matches ──────────────────────────────────────────────
    socket.on('checkers:list', (cb) => {
        try {
            const open = getOpenMatches().map(toListItem);
            cb(ok(open));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Create match ──────────────────────────────────────────────────
    socket.on('checkers:create', (data, cb) => {
        try {
            const name = String(data?.name ?? 'Player').trim().slice(0, 24) || 'Player';
            const existing = getMatchForSocket(socket.id);
            if (existing && existing.status !== 'finished') {
                return cb(err('You are already in a checkers match.'));
            }
            const match = createMatch({ socketId: socket.id, name, profileId: socket.data.profileId ?? null }, { forcedCapture: true, allowSpectators: true });
            socket.join(CHECKERS_ROOM(match.id));
            cb(ok(toPublic(match)));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Join match ────────────────────────────────────────────────────
    socket.on('checkers:join', (data, cb) => {
        try {
            const name = String(data?.name ?? 'Player').trim().slice(0, 24) || 'Player';
            const match = getMatchByCode(data.code ?? '');
            if (!match)
                return cb(err('Match not found.'));
            if (match.status === 'finished')
                return cb(err('This match has ended.'));
            // Already in this match as red or black — just re-join the room.
            if (match.red.socketId === socket.id || match.black?.socketId === socket.id) {
                socket.join(CHECKERS_ROOM(match.id));
                return cb(ok(toPublic(match)));
            }
            // Check if already in a different active match.
            const existing = getMatchForSocket(socket.id);
            if (existing && existing.id !== match.id && existing.status !== 'finished') {
                return cb(err('You are already in another checkers match.'));
            }
            if (match.status === 'waiting' && !match.black) {
                // Join as the black player.
                match.black = { socketId: socket.id, name, profileId: socket.data.profileId ?? null };
                match.status = 'active';
                match.updatedAt = Date.now();
                socket.join(CHECKERS_ROOM(match.id));
                broadcastState(io, match);
                io.emit('checkers:list_update', getOpenMatches().map(toListItem));
                cb(ok(toPublic(match)));
            }
            else if (match.settings.allowSpectators && !match.spectatorSocketIds.includes(socket.id)) {
                // Join as spectator.
                match.spectatorSocketIds.push(socket.id);
                socket.join(CHECKERS_ROOM(match.id));
                cb(ok(toPublic(match)));
            }
            else {
                cb(err('Cannot join this match.'));
            }
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Make move ─────────────────────────────────────────────────────
    socket.on('checkers:move', (data, cb) => {
        try {
            const match = getMatch(data.matchId);
            if (!match)
                return cb(err('Match not found.'));
            if (match.status !== 'active')
                return cb(err('Match is not active.'));
            let myColor = null;
            if (match.red.socketId === socket.id)
                myColor = 'red';
            else if (match.black?.socketId === socket.id)
                myColor = 'black';
            if (!myColor)
                return cb(err('You are not a player in this match.'));
            if (match.currentTurn !== myColor)
                return cb(err('Not your turn.'));
            const result = applyMove(match, data.from.row, data.from.col, data.to.row, data.to.col);
            if (!result.ok)
                return cb(err(result.error));
            match.board = result.board;
            match.mustContinueFrom = result.mustContinueFrom;
            match.inactiveHalfMoves = result.newInactiveHalfMoves;
            if (result.captured) {
                if (myColor === 'red')
                    match.capturedByRed++;
                else
                    match.capturedByBlack++;
            }
            if (result.winnerColor) {
                finishMatch(match, result.winnerColor);
                const winner = result.winnerColor === 'red' ? match.red : match.black;
                const loser = result.winnerColor === 'red' ? match.black : match.red;
                if (winner?.profileId)
                    addXP(winner.profileId, 20).catch(() => { });
                if (loser?.profileId)
                    addXP(loser.profileId, 5).catch(() => { });
            }
            else if (result.draw) {
                finishMatch(match, null);
            }
            else if (!result.mustContinueFrom) {
                match.currentTurn = myColor === 'red' ? 'black' : 'red';
            }
            match.updatedAt = Date.now();
            broadcastState(io, match);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Resign ────────────────────────────────────────────────────────
    socket.on('checkers:resign', (data, cb) => {
        try {
            const match = getMatch(data.matchId);
            if (!match)
                return cb(err('Match not found.'));
            if (match.status !== 'active')
                return cb(err('Match is not active.'));
            let winner = null;
            if (match.red.socketId === socket.id)
                winner = 'black';
            else if (match.black?.socketId === socket.id)
                winner = 'red';
            else
                return cb(err('You are not a player.'));
            finishMatch(match, winner);
            const loserColor = winner === 'red' ? 'black' : 'red';
            const winnerPart = winner === 'red' ? match.red : match.black;
            const loserPart = loserColor === 'red' ? match.red : match.black;
            if (winnerPart?.profileId)
                addXP(winnerPart.profileId, 20).catch(() => { });
            if (loserPart?.profileId)
                addXP(loserPart.profileId, 5).catch(() => { });
            broadcastState(io, match);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Rematch ───────────────────────────────────────────────────────
    socket.on('checkers:rematch', (data, cb) => {
        try {
            const old = getMatch(data.matchId);
            if (!old)
                return cb(err('Match not found.'));
            if (old.status !== 'finished')
                return cb(err('Match is still active.'));
            const isRed = old.red.socketId === socket.id;
            const isBlack = old.black?.socketId === socket.id;
            if (!isRed && !isBlack)
                return cb(err('You are not a player.'));
            // Swap colors for rematch.
            const newRed = isRed ? old.black : old.red;
            const newBlack = isRed ? old.red : old.black;
            const nm = createMatch({ ...newRed }, old.settings);
            nm.black = { ...newBlack };
            nm.status = 'active';
            nm.updatedAt = Date.now();
            // Move both sockets to the new room.
            const redSock = io.sockets.sockets.get(newRed.socketId);
            const blackSock = io.sockets.sockets.get(newBlack.socketId);
            if (redSock) {
                redSock.join(CHECKERS_ROOM(nm.id));
                redSock.leave(CHECKERS_ROOM(old.id));
            }
            if (blackSock) {
                blackSock.join(CHECKERS_ROOM(nm.id));
                blackSock.leave(CHECKERS_ROOM(old.id));
            }
            broadcastState(io, nm);
            cb(ok({ newMatchId: nm.id, newCode: nm.code }));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Leave ─────────────────────────────────────────────────────────
    socket.on('checkers:leave', (data, cb) => {
        try {
            const match = getMatch(data?.matchId);
            if (!match)
                return cb(ok(null));
            handleCheckersLeave(io, socket.id, match);
            socket.leave(CHECKERS_ROOM(match.id));
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Chat ──────────────────────────────────────────────────────────
    socket.on('checkers:chat', (data, cb) => {
        try {
            const match = getMatch(data.matchId);
            if (!match)
                return cb(err('Match not found.'));
            const isParticipant = match.red.socketId === socket.id ||
                match.black?.socketId === socket.id ||
                (match.settings.allowSpectators && match.spectatorSocketIds.includes(socket.id));
            if (!isParticipant)
                return cb(err('Not in this match.'));
            const text = String(data.text ?? '').trim().slice(0, 300);
            if (!text)
                return cb(err('Empty message.'));
            let senderName = 'Spectator';
            if (match.red.socketId === socket.id)
                senderName = match.red.name;
            else if (match.black?.socketId === socket.id)
                senderName = match.black.name;
            const msg = {
                senderId: socket.data.profileId ?? socket.id,
                senderName,
                text,
                ts: Date.now(),
            };
            match.chat.push(msg);
            if (match.chat.length > 200)
                match.chat = match.chat.slice(-200);
            io.to(CHECKERS_ROOM(match.id)).emit('checkers:chat', msg);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
}
// ── Disconnect cleanup ─────────────────────────────────────────────────
export function handleCheckersDisconnect(io, socketId) {
    const match = getMatchForSocket(socketId);
    if (!match)
        return;
    handleCheckersLeave(io, socketId, match);
}
function handleCheckersLeave(io, socketId, match) {
    // Remove from spectators silently.
    const specIdx = match.spectatorSocketIds.indexOf(socketId);
    if (specIdx !== -1) {
        match.spectatorSocketIds.splice(specIdx, 1);
        broadcastState(io, match);
        return;
    }
    // Player leaving while game is active — opponent wins.
    if (match.status === 'active') {
        let winnerColor = null;
        if (match.red.socketId === socketId)
            winnerColor = 'black';
        else if (match.black?.socketId === socketId)
            winnerColor = 'red';
        if (winnerColor) {
            finishMatch(match, winnerColor);
            broadcastState(io, match);
        }
    }
    else if (match.status === 'waiting' && match.red.socketId === socketId) {
        // Creator left before anyone joined — remove the match.
        const rk = CHECKERS_ROOM(match.id);
        io.in(rk).socketsLeave(rk);
        finishMatch(match, null);
        io.emit('checkers:list_update', getOpenMatches().map(m => ({
            id: m.id, code: m.code, status: m.status,
            redName: m.red.name, blackName: m.black?.name ?? null,
            currentTurn: m.currentTurn, spectatorCount: m.spectatorSocketIds.length, createdAt: m.createdAt,
        })));
    }
}
//# sourceMappingURL=checkers.js.map