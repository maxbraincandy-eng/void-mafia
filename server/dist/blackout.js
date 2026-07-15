import { ok, err, } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, listMatches, joinMatch, leaveMatch, startMatch, toggleLights, move, kill, report, vote, endMeeting, rematch, sendChat, disconnectSocket, getSafeState, } from './services/blackoutService.js';
const ROOM = (id) => `blackout:${id}`;
function userId(socket) {
    return socket.data.profileId ?? socket.id;
}
function broadcastState(io, matchId) {
    const m = getMatch(matchId);
    if (!m)
        return;
    for (const player of m.players) {
        const s = io.sockets.sockets.get(player.socketId);
        if (s)
            s.emit('blackout:state', getSafeState(m, player.userId));
    }
}
function broadcastList(io) {
    io.emit('blackout:list_update', listMatches());
}
// ── Timers (token-guarded, like www.ts) ──────────────────────────────────
const lightsTimers = new Map();
const meetingTimers = new Map();
function clearTimers(matchId) {
    const lt = lightsTimers.get(matchId);
    if (lt) {
        clearTimeout(lt);
        lightsTimers.delete(matchId);
    }
    const mt = meetingTimers.get(matchId);
    if (mt) {
        clearTimeout(mt);
        meetingTimers.delete(matchId);
    }
}
function scheduleLights(io, matchId) {
    const existing = lightsTimers.get(matchId);
    if (existing)
        clearTimeout(existing);
    const m = getMatch(matchId);
    if (!m || m.status !== 'play')
        return;
    const token = m.lightsChangeAt;
    const t = setTimeout(() => {
        lightsTimers.delete(matchId);
        const cur = getMatch(matchId);
        if (!cur || cur.status !== 'play' || cur.lightsChangeAt !== token)
            return; // stale
        toggleLights(matchId);
        broadcastState(io, matchId);
        scheduleLights(io, matchId);
    }, Math.max(0, token - Date.now()));
    lightsTimers.set(matchId, t);
}
function scheduleMeetingEnd(io, matchId) {
    const existing = meetingTimers.get(matchId);
    if (existing)
        clearTimeout(existing);
    const m = getMatch(matchId);
    if (!m || m.status !== 'meeting' || !m.meeting)
        return;
    const token = m.meeting.endsAt;
    const t = setTimeout(() => {
        meetingTimers.delete(matchId);
        const cur = getMatch(matchId);
        if (!cur || cur.status !== 'meeting' || cur.meeting?.endsAt !== token)
            return; // stale
        finishMeeting(io, matchId);
    }, Math.max(0, token - Date.now()));
    meetingTimers.set(matchId, t);
}
function finishMeeting(io, matchId) {
    const mt = meetingTimers.get(matchId);
    if (mt) {
        clearTimeout(mt);
        meetingTimers.delete(matchId);
    }
    const m = endMeeting(matchId);
    if (!m)
        return;
    broadcastState(io, matchId);
    if (m.status === 'play')
        scheduleLights(io, matchId);
    else if (m.status === 'finished')
        clearTimers(matchId);
}
// ── Handlers ─────────────────────────────────────────────────────────────
export function registerBlackoutHandlers(io, socket) {
    const uid = () => userId(socket);
    socket.on('blackout:list', (cb) => {
        try {
            cb(ok(listMatches()));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('blackout:create', (data, cb) => {
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
    socket.on('blackout:join', (data, cb) => {
        try {
            const code = String(data?.code ?? '').trim().toUpperCase();
            const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 24) || 'Player';
            const m = getMatchByCode(code);
            if (!m)
                return cb(err('Match not found'));
            const result = joinMatch(m.id, uid(), socket.id, nickname);
            if (!result)
                return cb(err('Cannot join — match full or already started'));
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
    socket.on('blackout:leave', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = leaveMatch(matchId, uid());
            socket.leave(ROOM(matchId));
            if (m) {
                broadcastState(io, matchId);
                if (m.status === 'finished')
                    clearTimers(matchId);
            }
            else {
                clearTimers(matchId);
            }
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('blackout:start', (data, cb) => {
        try {
            const m = startMatch(String(data?.matchId), uid());
            if (!m)
                return cb(err('Cannot start — need at least 4 players'));
            broadcastState(io, m.id);
            broadcastList(io);
            scheduleLights(io, m.id);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // Fire-and-forget position relay (~12Hz per client)
    socket.on('blackout:move', (data) => {
        const r = move(socket.id, Number(data?.x), Number(data?.y));
        if (!r)
            return;
        socket.to(ROOM(r.matchId)).emit('blackout:pos', { u: r.userId, x: Math.round(r.x), y: Math.round(r.y) });
    });
    socket.on('blackout:kill', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const result = kill(matchId, uid(), String(data?.targetId));
            if ('error' in result)
                return cb(err(result.error));
            broadcastState(io, matchId);
            if (result.match.status === 'finished') {
                clearTimers(matchId);
                broadcastList(io);
            }
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('blackout:report', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const result = report(matchId, uid());
            if ('error' in result)
                return cb(err(result.error));
            // Freeze the lights cycle during the meeting
            const lt = lightsTimers.get(matchId);
            if (lt) {
                clearTimeout(lt);
                lightsTimers.delete(matchId);
            }
            broadcastState(io, matchId);
            scheduleMeetingEnd(io, matchId);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('blackout:vote', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const result = vote(matchId, uid(), String(data?.targetId));
            if ('error' in result)
                return cb(err(result.error));
            if (result.allVoted)
                finishMeeting(io, matchId);
            else
                broadcastState(io, matchId);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('blackout:rematch', (data, cb) => {
        try {
            const m = rematch(String(data?.matchId), uid());
            if (!m)
                return cb(err('Cannot rematch'));
            broadcastState(io, m.id);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('blackout:chat', (data) => {
        try {
            const result = sendChat(String(data?.matchId), uid(), String(data?.nickname ?? 'Player').slice(0, 24), String(data?.text ?? ''));
            if (!result)
                return;
            io.to(ROOM(result.match.id)).emit('blackout:chat', result.msg);
        }
        catch { /* ignore */ }
    });
}
// ── Disconnect cleanup ───────────────────────────────────────────────────
export function handleBlackoutDisconnect(io, socketId) {
    const matchId = disconnectSocket(socketId);
    if (!matchId)
        return;
    const m = getMatch(matchId);
    if (m) {
        broadcastState(io, matchId);
        if (m.status === 'finished')
            clearTimers(matchId);
    }
    else {
        clearTimers(matchId);
    }
    broadcastList(io);
}
//# sourceMappingURL=blackout.js.map