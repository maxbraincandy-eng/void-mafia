import { ok, err, } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, listMatches, joinMatch, leaveMatch, dissolveMatch, startMatch, chooseWord, autoChoose, guess, endTurn, nextTurn, rematch, disconnectSocket, getSafeState, addSeg, clearCanvas, } from './services/drawService.js';
const ROOM = (id) => `draw:${id}`;
function userId(socket) { return socket.data.profileId ?? socket.id; }
function broadcastState(io, matchId) {
    const m = getMatch(matchId);
    if (!m)
        return;
    for (const player of m.players) {
        const s = io.sockets.sockets.get(player.socketId);
        if (s)
            s.emit('draw:state', getSafeState(m, player.userId));
    }
}
function broadcastList(io) { io.emit('draw:list_update', listMatches()); }
const timers = new Map();
function clearT(id) { const t = timers.get(id); if (t) {
    clearTimeout(t);
    timers.delete(id);
} }
/** Schedule the next phase transition off the match's endsAt (token-guarded). */
function schedule(io, matchId) {
    clearT(matchId);
    const m = getMatch(matchId);
    if (!m || (m.status !== 'choosing' && m.status !== 'drawing' && m.status !== 'turnend'))
        return;
    const token = m.endsAt;
    const phase = m.status;
    const t = setTimeout(() => {
        timers.delete(matchId);
        const cur = getMatch(matchId);
        if (!cur || cur.status !== phase || cur.endsAt !== token)
            return; // stale
        if (phase === 'choosing') {
            autoChoose(matchId);
            broadcastState(io, matchId);
            schedule(io, matchId);
        }
        else if (phase === 'drawing') {
            endTurn(matchId);
            broadcastState(io, matchId);
            schedule(io, matchId);
        }
        else if (phase === 'turnend') {
            const nx = nextTurn(matchId);
            broadcastState(io, matchId);
            if (nx && nx.status === 'finished') {
                clearT(matchId);
                broadcastList(io);
            }
            else
                schedule(io, matchId);
        }
    }, Math.max(0, token - Date.now()));
    timers.set(matchId, t);
}
export function registerDrawHandlers(io, socket) {
    const uid = () => userId(socket);
    socket.on('draw:list', (cb) => { try {
        cb(ok(listMatches()));
    }
    catch (e) {
        cb(err(e.message));
    } });
    socket.on('draw:create', (data, cb) => {
        try {
            const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
            const m = createMatch(uid(), socket.id, nickname, { maxPlayers: Number(data?.maxPlayers ?? 8), rounds: Number(data?.rounds ?? 3), drawSeconds: Number(data?.drawSeconds ?? 70) });
            socket.join(ROOM(m.id));
            broadcastList(io);
            cb(ok(getSafeState(m, uid())));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('draw:join', (data, cb) => {
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
            // Send the current canvas so a mid-turn joiner sees the drawing so far.
            if (result.match.status === 'drawing' && result.match.segs.length)
                socket.emit('draw:canvas', result.match.segs);
            cb(ok(getSafeState(result.match, uid())));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('draw:leave', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const cur = getMatch(matchId);
            const active = cur && cur.status !== 'waiting' && cur.status !== 'finished';
            const m = active ? dissolveMatch(matchId, uid()) : leaveMatch(matchId, uid());
            socket.leave(ROOM(matchId));
            clearT(matchId);
            if (m) {
                broadcastState(io, matchId);
                if (!active)
                    schedule(io, matchId);
            }
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('draw:start', (data, cb) => {
        try {
            const m = startMatch(String(data?.matchId), uid());
            if (!m)
                return cb(err('Cannot start — need at least 2 players'));
            broadcastState(io, m.id);
            broadcastList(io);
            schedule(io, m.id);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('draw:choose', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = chooseWord(matchId, uid(), String(data?.word));
            if (!m)
                return cb(err('Cannot choose'));
            broadcastState(io, matchId);
            schedule(io, matchId);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('draw:guess', (data) => {
        try {
            const matchId = String(data?.matchId);
            const r = guess(matchId, uid(), String(data?.text ?? ''));
            if (!r)
                return;
            if (r.kind === 'correct') {
                io.to(ROOM(matchId)).emit('draw:chat', { system: true, nickname: r.nickname, text: 'გამოიცნო! ✓', ts: Date.now() });
                broadcastState(io, matchId); // scores updated; guesser now sees the word
                if (r.allGuessed) {
                    endTurn(matchId);
                    broadcastState(io, matchId);
                    schedule(io, matchId);
                }
            }
            else {
                io.to(ROOM(matchId)).emit('draw:chat', { system: false, nickname: r.nickname, text: r.text, ts: Date.now() });
            }
        }
        catch { /* ignore */ }
    });
    // Live stroke relay — drawer only. Relay to others, accumulate for late join.
    socket.on('draw:seg', (data) => {
        try {
            const matchId = String(data?.matchId);
            const seg = data?.seg;
            if (!seg)
                return;
            if (!addSeg(matchId, uid(), seg))
                return;
            socket.to(ROOM(matchId)).emit('draw:seg', seg);
        }
        catch { /* ignore */ }
    });
    socket.on('draw:clear', (data) => {
        try {
            const matchId = String(data?.matchId);
            if (clearCanvas(matchId, uid()))
                socket.to(ROOM(matchId)).emit('draw:clear', {});
        }
        catch { /* ignore */ }
    });
    socket.on('draw:rematch', (data, cb) => {
        try {
            const m = rematch(String(data?.matchId), uid());
            if (!m)
                return cb(err('Cannot rematch'));
            clearT(m.id);
            broadcastState(io, m.id);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
}
export function handleDrawDisconnect(io, socketId) {
    const matchId = disconnectSocket(socketId);
    if (!matchId)
        return;
    const m = getMatch(matchId);
    if (m) {
        broadcastState(io, matchId);
        schedule(io, matchId);
    }
    broadcastList(io);
}
//# sourceMappingURL=draw.js.map