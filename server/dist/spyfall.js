import { ok, err, } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, listMatches, joinMatch, leaveMatch, dissolveMatch, startMatch, beginVoting, castVote, spyGuess, startAccusation, respondAccusation, forceResolveAccusation, nextRound, rematch, disconnectSocket, getSafeState, resumeForUser, } from './services/spyfallService.js';
import { emitToPlayers } from './lib/liveSocket.js';
import { voiceJoin as spyVoiceJoin, voiceLeave as spyVoiceLeave, voiceGetMatchId as spyVoiceGetMatchId, } from './services/spyfallVoiceService.js';
import { buildIceConfig } from './lib/iceConfig.js';
const ROOM = (id) => `spyfall:${id}`;
function userId(socket) { return socket.data.profileId ?? socket.id; }
function broadcastState(io, matchId) {
    const m = getMatch(matchId);
    if (!m)
        return;
    // Resolved by identity so a reconnected player keeps receiving state — see
    // lib/liveSocket.
    emitToPlayers(io, m.players, 'spy:state', p => getSafeState(m, p.userId), (p, sid) => {
        p.socketId = sid;
        p.connected = true;
    });
}
function broadcastList(io) { io.emit('spy:list_update', listMatches()); }
const discussTimers = new Map();
const accuseTimers = new Map();
function clearDiscussTimer(id) { const t = discussTimers.get(id); if (t) {
    clearTimeout(t);
    discussTimers.delete(id);
} }
function clearAccuseTimer(id) { const t = accuseTimers.get(id); if (t) {
    clearTimeout(t);
    accuseTimers.delete(id);
} }
/** When the discussion clock runs out, the round moves to voting. */
function scheduleDiscussEnd(io, matchId) {
    clearDiscussTimer(matchId);
    const m = getMatch(matchId);
    if (!m || m.status !== 'play' || m.accusation)
        return;
    const token = m.endsAt;
    const t = setTimeout(() => {
        discussTimers.delete(matchId);
        const cur = getMatch(matchId);
        if (!cur || cur.status !== 'play' || cur.accusation || cur.endsAt !== token)
            return; // stale
        beginVoting(matchId, null);
        broadcastState(io, matchId);
    }, Math.max(0, token - Date.now()));
    discussTimers.set(matchId, t);
}
/** A live accusation lapses after its deadline — silent jurors count as refusals. */
function scheduleAccuseTimeout(io, matchId) {
    clearAccuseTimer(matchId);
    const m = getMatch(matchId);
    if (!m || !m.accusation)
        return;
    const token = m.accusation.deadline;
    const t = setTimeout(() => {
        accuseTimers.delete(matchId);
        const cur = getMatch(matchId);
        if (!cur || !cur.accusation || cur.accusation.deadline !== token)
            return; // stale
        forceResolveAccusation(matchId);
        broadcastState(io, matchId);
        syncTimers(io, matchId);
    }, Math.max(0, token - Date.now()));
    accuseTimers.set(matchId, t);
}
/** Keep the discussion / accusation timers in step with the current match state. */
function syncTimers(io, matchId) {
    const m = getMatch(matchId);
    if (!m) {
        clearDiscussTimer(matchId);
        clearAccuseTimer(matchId);
        return;
    }
    if (m.status === 'play' && m.accusation) {
        clearDiscussTimer(matchId);
        scheduleAccuseTimeout(io, matchId);
    }
    else if (m.status === 'play') {
        clearAccuseTimer(matchId);
        scheduleDiscussEnd(io, matchId);
    }
    else {
        clearDiscussTimer(matchId);
        clearAccuseTimer(matchId);
    }
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
    /** Back after a drop or a reload — see lies.ts for the reasoning. */
    socket.on('spy:resume', (cb) => {
        try {
            const m = resumeForUser(uid(), socket.id);
            if (!m)
                return cb(ok(null));
            socket.join(ROOM(m.id));
            broadcastState(io, m.id);
            cb(ok(getSafeState(m, uid())));
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
            if (m)
                broadcastState(io, matchId);
            syncTimers(io, matchId);
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
            syncTimers(io, matchId);
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
            syncTimers(io, matchId);
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
    // ── Mid-round accusation ────────────────────────────────────────────────
    socket.on('spy:accuse', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = startAccusation(matchId, uid(), String(data?.targetId));
            if (!m)
                return cb(err('Cannot accuse right now'));
            broadcastState(io, matchId);
            syncTimers(io, matchId);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('spy:accuse_respond', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = respondAccusation(matchId, uid(), !!data?.agree);
            if (!m)
                return cb(err('Cannot respond'));
            broadcastState(io, matchId);
            syncTimers(io, matchId);
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
            broadcastState(io, matchId);
            syncTimers(io, matchId);
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
            syncTimers(io, matchId);
            if (m.status === 'finished')
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
    syncTimers(io, matchId);
    broadcastList(io);
}
//# sourceMappingURL=spyfall.js.map