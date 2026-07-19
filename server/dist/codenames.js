import { ok, err, } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, listMatches, joinMatch, switchTeam, setSpymaster, leaveMatch, startMatch, giveClue, guessCard, passTurn, rematch, disconnectSocket, getSafeState, } from './services/codenamesService.js';
const ROOM = (id) => `cn:${id}`;
function userId(socket) { return socket.data.profileId ?? socket.id; }
function broadcastState(io, matchId) {
    const m = getMatch(matchId);
    if (!m)
        return;
    for (const player of m.players) {
        const s = io.sockets.sockets.get(player.socketId);
        if (s)
            s.emit('cn:state', getSafeState(m, player.userId));
    }
}
function broadcastList(io) { io.emit('cn:list_update', listMatches()); }
export function registerCodenamesHandlers(io, socket) {
    const uid = () => userId(socket);
    socket.on('cn:list', (cb) => { try {
        cb(ok(listMatches()));
    }
    catch (e) {
        cb(err(e.message));
    } });
    socket.on('cn:create', (data, cb) => {
        try {
            const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
            const m = createMatch(uid(), socket.id, nickname, { maxPlayers: Number(data?.maxPlayers ?? 8) });
            socket.join(ROOM(m.id));
            broadcastList(io);
            cb(ok(getSafeState(m, uid())));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('cn:join', (data, cb) => {
        try {
            const code = String(data?.code ?? '').trim().toUpperCase();
            const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 24) || 'Player';
            const m = getMatchByCode(code);
            if (!m)
                return cb(err('Match not found'));
            const result = joinMatch(m.id, uid(), socket.id, nickname);
            if (!result)
                return cb(err('Cannot join — full or already started'));
            socket.join(ROOM(m.id));
            if (result.isNew)
                broadcastState(io, m.id);
            broadcastList(io);
            cb(ok(getSafeState(result.match, uid())));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    const simple = (event, fn, failMsg) => socket.on(event, (data, cb) => {
        try {
            const m = fn(String(data?.matchId), uid());
            if (!m)
                return cb(err(failMsg));
            broadcastState(io, m.id);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    simple('cn:switch_team', switchTeam, 'Cannot switch');
    simple('cn:spymaster', setSpymaster, 'Cannot set spymaster');
    simple('cn:start', startMatch, 'Cannot start — each team needs a spymaster + operative');
    simple('cn:pass', passTurn, 'Cannot pass');
    simple('cn:rematch', rematch, 'Cannot rematch');
    socket.on('cn:leave', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = leaveMatch(matchId, uid());
            socket.leave(ROOM(matchId));
            if (m)
                broadcastState(io, matchId);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('cn:clue', (data, cb) => {
        try {
            const m = giveClue(String(data?.matchId), uid(), String(data?.word), Number(data?.number));
            if (!m)
                return cb(err('Cannot give clue'));
            broadcastState(io, m.id);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('cn:guess', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = guessCard(matchId, uid(), Number(data?.index));
            if (!m)
                return cb(err('Cannot guess'));
            broadcastState(io, matchId);
            if (m.status === 'finished')
                broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
}
export function handleCodenamesDisconnect(io, socketId) {
    const matchId = disconnectSocket(socketId);
    if (!matchId)
        return;
    const m = getMatch(matchId);
    if (m)
        broadcastState(io, matchId);
    broadcastList(io);
}
//# sourceMappingURL=codenames.js.map