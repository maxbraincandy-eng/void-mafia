import { ok, err, } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, listMatches, joinMatch, leaveMatch, dissolveMatch, startMatch, beginVoting, castVote, spyGuess, nextRound, rematch, disconnectSocket, getSafeState, } from './services/spyfallService.js';
import { voiceJoin as spyVoiceJoin, voiceLeave as spyVoiceLeave, voiceGetMatchId as spyVoiceGetMatchId, } from './services/spyfallVoiceService.js';
import { buildIceConfig } from './lib/iceConfig.js';
const ROOM = (id) => `spyfall:${id}`;
function userId(socket) { return socket.data.profileId ?? socket.id; }
function broadcastState(io, matchId) {
    const m = getMatch(matchId);
    if (!m)
        return;
    for (const player of m.players) {
        const s = io.sockets.sockets.get(player.socketId);
        if (s)
            s.emit('spy:state', getSafeState(m, player.userId));
    }
}
function broadcastList(io) { io.emit('spy:list_update', listMatches()); }
const discussTimers = new Map();
function clearDiscussTimer(id) { const t = discussTimers.get(id); if (t) {
    clearTimeout(t);
    discussTimers.delete(id);
} }
/** When the discussion clock runs out, the round moves to voting. */
function scheduleDiscussEnd(io, matchId) {
    clearDiscussTimer(matchId);
    const m = getMatch(matchId);
    if (!m || m.status !== 'play')
        return;
    const token = m.endsAt;
    const t = setTimeout(() => {
        discussTimers.delete(matchId);
        const cur = getMatch(matchId);
        if (!cur || cur.status !== 'play' || cur.endsAt !== token)
            return; // stale
        beginVoting(matchId, null);
        broadcastState(io, matchId);
    }, Math.max(0, token - Date.now()));
    discussTimers.set(matchId, t);
}
export function registerSpyfallHandlers(io, socket) {
    const uid = () => userId(socket);
    socket.on('spy:list', (cb) => { try {
        cb(ok(listMatches()));
    }
    catch (e) {
        cb(err(e.message));
    } });
    socket.on('spy:create', (data, cb) => {
        try {
            const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
            const m = createMatch(uid(), socket.id, nickname, { maxPlayers: Number(data?.maxPlayers ?? 8), rounds: Number(data?.rounds ?? 3), discussSeconds: Number(data?.discussSeconds ?? 300) });
            socket.join(ROOM(m.id));
            broadcastList(io);
            cb(ok(getSafeState(m, uid())));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('spy:join', (data, cb) => {
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
    socket.on('spy:leave', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const cur = getMatch(matchId);
            const active = cur && cur.status !== 'waiting' && cur.status !== 'finished';
            const m = active ? dissolveMatch(matchId, uid()) : leaveMatch(matchId, uid());
            socket.leave(ROOM(matchId));
            if (active)
                clearDiscussTimer(matchId);
            if (m)
                broadcastState(io, matchId);
            else
                clearDiscussTimer(matchId);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('spy:start', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = startMatch(matchId, uid());
            if (!m)
                return cb(err('Cannot start — need at least 3 players'));
            broadcastState(io, matchId);
            scheduleDiscussEnd(io, matchId);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('spy:begin_vote', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = beginVoting(matchId, uid());
            if (!m)
                return cb(err('Cannot start the vote'));
            clearDiscussTimer(matchId);
            broadcastState(io, matchId);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('spy:vote', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = castVote(matchId, uid(), String(data?.targetId));
            if (!m)
                return cb(err('Cannot vote'));
            broadcastState(io, matchId);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('spy:guess', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = spyGuess(matchId, uid(), String(data?.location ?? ''));
            if (!m)
                return cb(err('Cannot guess'));
            clearDiscussTimer(matchId);
            broadcastState(io, matchId);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('spy:next', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = nextRound(matchId, uid());
            if (!m)
                return cb(err('Cannot advance'));
            broadcastState(io, matchId);
            if (m.status === 'play')
                scheduleDiscussEnd(io, matchId);
            else
                broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('spy:rematch', (data, cb) => {
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
    // ── voice: join ───────────────────────────────────────────────────────
    socket.on('spy:voice-join', (data, cb) => {
        try {
            const m = getMatch(String(data?.matchId));
            if (!m)
                return cb(err('Match not found.'));
            if (m.status === 'finished')
                return cb(err('Match has ended.'));
            const player = m.players.find(p => p.userId === uid());
            if (!player)
                return cb(err('Not in this match.'));
            const existingPeers = spyVoiceJoin(m.id, socket.id, player.nickname);
            socket.to(ROOM(m.id)).emit('spy:voice-peer-joined', { socketId: socket.id, name: player.nickname });
            const iceConfig = buildIceConfig();
            cb(ok({
                peers: existingPeers,
                iceServers: iceConfig.iceServers,
                iceTransportPolicy: iceConfig.iceTransportPolicy,
            }));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── voice: leave ──────────────────────────────────────────────────────
    socket.on('spy:voice-leave', (_data, cb) => {
        const matchId = spyVoiceLeave(socket.id);
        if (matchId) {
            socket.to(ROOM(matchId)).emit('spy:voice-peer-left', { socketId: socket.id });
        }
        cb?.(ok(null));
    });
    // ── voice: WebRTC signalling relay ────────────────────────────────────
    socket.on('spy:voice-offer', (data) => {
        io.to(data.to).emit('spy:voice-offer', { from: socket.id, sdp: data.sdp });
    });
    socket.on('spy:voice-answer', (data) => {
        io.to(data.to).emit('spy:voice-answer', { from: socket.id, sdp: data.sdp });
    });
    socket.on('spy:voice-ice', (data) => {
        io.to(data.to).emit('spy:voice-ice', { from: socket.id, candidate: data.candidate });
    });
    // ── PTT state ─────────────────────────────────────────────────────────
    socket.on('spy:ptt-start', (data) => {
        const matchId = String(data?.matchId ?? '');
        if (spyVoiceGetMatchId(socket.id) !== matchId)
            return;
        io.to(ROOM(matchId)).emit('spy:ptt-state', { socketId: socket.id, speaking: true });
    });
    socket.on('spy:ptt-stop', (data) => {
        const matchId = String(data?.matchId ?? '');
        if (spyVoiceGetMatchId(socket.id) !== matchId)
            return;
        io.to(ROOM(matchId)).emit('spy:ptt-state', { socketId: socket.id, speaking: false });
    });
}
// ── Disconnect cleanup ────────────────────────────────────────────────────────
export function handleSpyfallDisconnect(io, socketId) {
    const voiceMatchId = spyVoiceGetMatchId(socketId);
    if (voiceMatchId) {
        spyVoiceLeave(socketId);
        io.to(ROOM(voiceMatchId)).emit('spy:voice-peer-left', { socketId });
        io.to(ROOM(voiceMatchId)).emit('spy:ptt-state', { socketId, speaking: false });
    }
    const matchId = disconnectSocket(socketId);
    if (!matchId)
        return;
    const m = getMatch(matchId);
    if (m)
        broadcastState(io, matchId);
    broadcastList(io);
}
//# sourceMappingURL=spyfall.js.map