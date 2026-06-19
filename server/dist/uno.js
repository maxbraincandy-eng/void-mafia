import { ok, err, } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, listMatches, joinMatch, spectateMatch, leaveMatch, startMatch, playCard, drawCard, callUno, sendChat, disconnectSocket, rematch, getSafeState, } from './services/unoService.js';
import { voiceJoin as unoVoiceJoin, voiceLeave as unoVoiceLeave, voiceGetMatchId as unoVoiceGetMatchId, } from './services/unoVoiceService.js';
import { buildIceConfig } from './lib/iceConfig.js';
const UNO_ROOM = (id) => `uno:${id}`;
function userId(socket) {
    return socket.data.profileId ?? socket.id;
}
function broadcastState(io, matchId) {
    const m = getMatch(matchId);
    if (!m)
        return;
    // Send personalized state to each player
    for (const player of m.players) {
        const playerSockets = [...io.sockets.sockets.values()].filter(s => s.id === player.socketId);
        for (const s of playerSockets) {
            s.emit('uno:state', getSafeState(m, player.userId));
        }
    }
    // Send spectator state (no hand) to spectators
    const spectatorState = getSafeState(m, '');
    for (const specSocketId of m.spectatorIds) {
        io.to(specSocketId).emit('uno:state', spectatorState);
    }
}
function broadcastList(io) {
    io.emit('uno:list_update', listMatches());
}
export function registerUnoHandlers(io, socket) {
    const uid = () => userId(socket);
    // ── list ──────────────────────────────────────────────────────────────
    socket.on('uno:list', (cb) => {
        try {
            cb(ok(listMatches()));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── create ────────────────────────────────────────────────────────────
    socket.on('uno:create', (data, cb) => {
        try {
            const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
            const maxPlayers = Math.min(10, Math.max(2, Number(data?.maxPlayers ?? 4)));
            const m = createMatch(uid(), socket.id, nickname, { maxPlayers });
            socket.join(UNO_ROOM(m.id));
            broadcastList(io);
            cb(ok(getSafeState(m, uid())));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── join ──────────────────────────────────────────────────────────────
    socket.on('uno:join', (data, cb) => {
        try {
            const code = String(data?.code ?? '').trim().toUpperCase();
            const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 24) || 'Player';
            const m = getMatchByCode(code);
            if (!m)
                return cb(err('Match not found'));
            const result = joinMatch(m.id, uid(), socket.id, nickname);
            if (!result)
                return cb(err('Cannot join — match full or already started'));
            socket.join(UNO_ROOM(m.id));
            if (result.isNew)
                broadcastState(io, m.id);
            broadcastList(io);
            cb(ok(getSafeState(result.match, uid())));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── spectate ──────────────────────────────────────────────────────────
    socket.on('uno:spectate', (data, cb) => {
        try {
            const code = String(data?.code ?? '').trim().toUpperCase();
            const m = getMatchByCode(code);
            if (!m)
                return cb(err('Match not found'));
            const result = spectateMatch(m.id, socket.id);
            if (!result)
                return cb(err('Cannot spectate'));
            socket.join(UNO_ROOM(m.id));
            cb(ok(getSafeState(result, '')));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── leave ─────────────────────────────────────────────────────────────
    socket.on('uno:leave', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = leaveMatch(matchId, uid(), socket.id);
            socket.leave(UNO_ROOM(matchId));
            if (m)
                broadcastState(io, matchId);
            broadcastList(io); // always — match may have been deleted
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── start ─────────────────────────────────────────────────────────────
    socket.on('uno:start', (data, cb) => {
        try {
            const m = startMatch(String(data?.matchId), uid());
            if (!m)
                return cb(err('Cannot start'));
            broadcastState(io, m.id);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── play card ─────────────────────────────────────────────────────────
    socket.on('uno:play-card', (data, cb) => {
        try {
            const result = playCard(String(data?.matchId), uid(), String(data?.cardId), data?.chosenColor);
            if (!result)
                return cb(err('Match not found'));
            if (result.error)
                return cb(err(result.error));
            broadcastState(io, result.match.id);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── draw card ─────────────────────────────────────────────────────────
    socket.on('uno:draw-card', (data, cb) => {
        try {
            const result = drawCard(String(data?.matchId), uid());
            if (!result)
                return cb(err('Match not found'));
            if (result.error)
                return cb(err(result.error));
            broadcastState(io, result.match.id);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── call UNO ──────────────────────────────────────────────────────────
    socket.on('uno:call-uno', (data, cb) => {
        try {
            const m = callUno(String(data?.matchId), uid());
            if (!m)
                return cb(err('Cannot call UNO'));
            broadcastState(io, m.id);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── rematch ───────────────────────────────────────────────────────────
    socket.on('uno:rematch', (data, cb) => {
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
    // ── chat ──────────────────────────────────────────────────────────────
    socket.on('uno:chat', (data) => {
        try {
            const result = sendChat(String(data?.matchId), uid(), String(data?.nickname ?? 'Player').slice(0, 24), String(data?.text ?? ''));
            if (!result)
                return;
            io.to(UNO_ROOM(result.match.id)).emit('uno:chat', result.msg);
        }
        catch { /* ignore */ }
    });
    // ── voice: join ───────────────────────────────────────────────────────
    socket.on('uno:voice-join', (data, cb) => {
        try {
            const m = getMatch(String(data?.matchId));
            if (!m)
                return cb(err('Match not found.'));
            if (m.status === 'finished')
                return cb(err('Match has ended.'));
            const player = m.players.find(p => p.socketId === socket.id);
            const isSpectator = m.spectatorIds.includes(socket.id);
            if (!player && !isSpectator)
                return cb(err('Not in this match.'));
            const name = player?.nickname ?? 'Spectator';
            const existingPeers = unoVoiceJoin(m.id, socket.id, name);
            socket.to(UNO_ROOM(m.id)).emit('uno:voice-peer-joined', { socketId: socket.id, name });
            const iceConfig = buildIceConfig();
            cb(ok({
                peers: existingPeers,
                iceServers: iceConfig.iceServers,
                iceTransportPolicy: iceConfig.iceTransportPolicy,
                canSpeak: !!player,
            }));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── voice: leave ──────────────────────────────────────────────────────
    socket.on('uno:voice-leave', (_data, cb) => {
        const matchId = unoVoiceLeave(socket.id);
        if (matchId) {
            socket.to(UNO_ROOM(matchId)).emit('uno:voice-peer-left', { socketId: socket.id });
        }
        cb?.(ok(null));
    });
    // ── voice: WebRTC signalling relay ────────────────────────────────────
    socket.on('uno:voice-offer', (data) => {
        io.to(data.to).emit('uno:voice-offer', { from: socket.id, sdp: data.sdp });
    });
    socket.on('uno:voice-answer', (data) => {
        io.to(data.to).emit('uno:voice-answer', { from: socket.id, sdp: data.sdp });
    });
    socket.on('uno:voice-ice', (data) => {
        io.to(data.to).emit('uno:voice-ice', { from: socket.id, candidate: data.candidate });
    });
    // ── PTT state ─────────────────────────────────────────────────────────
    socket.on('uno:ptt-start', (data) => {
        const m = getMatch(String(data?.matchId));
        if (!m)
            return;
        const player = m.players.find(p => p.socketId === socket.id);
        if (!player)
            return;
        socket.to(UNO_ROOM(data.matchId)).emit('uno:ptt-state', { socketId: socket.id, speaking: true });
    });
    socket.on('uno:ptt-stop', (data) => {
        socket.to(UNO_ROOM(String(data?.matchId))).emit('uno:ptt-state', { socketId: socket.id, speaking: false });
    });
}
// ── Disconnect cleanup ────────────────────────────────────────────────────────
export function handleUnoDisconnect(io, socketId) {
    // Voice cleanup
    const voiceMatchId = unoVoiceGetMatchId(socketId);
    if (voiceMatchId) {
        unoVoiceLeave(socketId);
        io.to(UNO_ROOM(voiceMatchId)).emit('uno:voice-peer-left', { socketId });
        io.to(UNO_ROOM(voiceMatchId)).emit('uno:ptt-state', { socketId, speaking: false });
    }
    const matchId = disconnectSocket(socketId);
    if (matchId) {
        const m = getMatch(matchId);
        if (m)
            broadcastState(io, matchId);
        broadcastList(io); // always — match may have been deleted
    }
}
//# sourceMappingURL=uno.js.map