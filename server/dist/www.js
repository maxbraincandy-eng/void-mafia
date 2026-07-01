import { ok, err } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, listMatches, joinMatch, spectateMatch, leaveMatch, assignCaptain, setRole, startMatch, advanceToDiscussion, submitAnswer, judgeAnswer, nextQuestion, sendChat, disconnectUser, toPublic, autoAdvanceToJudging, } from './services/wwwService.js';
import { voiceJoin, voiceLeave, voiceGetMatchId } from './services/wwwVoiceService.js';
import { buildIceConfig } from './lib/iceConfig.js';
const WWW_ROOM = (id) => `www:${id}`;
// Per-viewer broadcast so the isolation protocol holds: each socket receives a
// state filtered for its own user (host sees all answers; a team sees only its
// own until reveal). Single-node Socket.IO → the room's sockets are local.
function broadcast(io, m) {
    const room = io.sockets.adapter.rooms.get(WWW_ROOM(m.id));
    if (!room)
        return;
    for (const sid of room) {
        const s = io.sockets.sockets.get(sid);
        if (!s)
            continue;
        const viewerId = s.data.profileId ?? s.id;
        s.emit('www:state', toPublic(m, viewerId));
    }
}
function broadcastList(io) {
    io.emit('www:list_update', listMatches());
}
// One discussion timer per match. Re-arming clears the previous timer, and the
// callback is guarded by the round's `timerEndsAt` token so a leftover timer
// from an earlier round can never cut a new discussion short (the bug where a
// fresh question auto-skipped, or one team's answer was force-judged without
// waiting for the other).
const discussionTimers = new Map();
function clearDiscussionTimer(matchId) {
    const t = discussionTimers.get(matchId);
    if (t) {
        clearTimeout(t);
        discussionTimers.delete(matchId);
    }
}
function scheduleAutoJudge(io, m) {
    clearDiscussionTimer(m.id);
    const roundToken = m.timerEndsAt; // identifies THIS discussion round
    const t = setTimeout(() => {
        discussionTimers.delete(m.id);
        const cur = getMatch(m.id);
        if (!cur || cur.status !== 'discussion' || cur.timerEndsAt !== roundToken)
            return; // stale / round changed
        const updated = autoAdvanceToJudging(m.id);
        if (updated)
            broadcast(io, updated);
    }, Math.max(0, m.settings.discussionSeconds * 1000));
    discussionTimers.set(m.id, t);
}
export function registerWWWHandlers(io, socket) {
    const userId = () => socket.data.profileId ?? socket.id;
    // ── list ──────────────────────────────────────────────────────────────
    socket.on('www:list', (cb) => {
        try {
            cb(ok(listMatches()));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── create ────────────────────────────────────────────────────────────
    socket.on('www:create', (data, cb) => {
        try {
            const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
            const match = createMatch(userId(), nickname, data?.opts ?? {});
            socket.join(WWW_ROOM(match.id));
            broadcastList(io);
            cb(ok(toPublic(match, userId())));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── join ──────────────────────────────────────────────────────────────
    socket.on('www:join', (data, cb) => {
        try {
            const code = String(data?.code ?? '').trim().toUpperCase();
            const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 24) || 'Player';
            const m = getMatchByCode(code);
            if (!m)
                return cb(err('Match not found'));
            const result = joinMatch(m.id, userId(), nickname);
            if (!result)
                return cb(err('Cannot join — match already started or full'));
            socket.join(WWW_ROOM(m.id));
            if (result.isNew)
                broadcast(io, result.match);
            broadcastList(io);
            cb(ok(toPublic(result.match, userId())));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── spectate ──────────────────────────────────────────────────────────
    socket.on('www:spectate', (data, cb) => {
        try {
            const nickname = String(data?.nickname ?? 'Spectator').trim().slice(0, 24) || 'Spectator';
            const m = spectateMatch(String(data?.matchId), userId(), nickname);
            if (!m)
                return cb(err('Cannot spectate'));
            socket.join(WWW_ROOM(m.id));
            cb(ok(toPublic(m, userId())));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── leave ─────────────────────────────────────────────────────────────
    socket.on('www:leave', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = leaveMatch(matchId, userId());
            socket.leave(WWW_ROOM(matchId));
            if (!m)
                clearDiscussionTimer(matchId); // match gone → drop its timer
            if (m)
                broadcast(io, m);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── assign captain ────────────────────────────────────────────────────
    socket.on('www:assign_captain', (data, cb) => {
        try {
            const m = assignCaptain(String(data?.matchId), userId(), String(data?.teamId), String(data?.targetUserId));
            if (!m)
                return cb(err('Cannot assign captain'));
            broadcast(io, m);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── set role (lobby: pick Team A / Team B / spectator) ────────────────
    socket.on('www:set_role', (data, cb) => {
        try {
            const m = setRole(String(data?.matchId), userId(), data?.role);
            if (!m)
                return cb(err('Cannot change role'));
            broadcast(io, m);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── start ─────────────────────────────────────────────────────────────
    socket.on('www:start', (data, cb) => {
        try {
            const m = startMatch(String(data?.matchId), userId());
            if (!m)
                return cb(err('Cannot start match'));
            broadcast(io, m);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── advance to discussion ─────────────────────────────────────────────
    socket.on('www:advance_discussion', (data, cb) => {
        try {
            const m = advanceToDiscussion(String(data?.matchId), userId());
            if (!m)
                return cb(err('Cannot advance'));
            broadcast(io, m);
            cb(ok(null));
            // Auto-advance to judging when the 60s timer expires (single guarded timer).
            scheduleAutoJudge(io, m);
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── submit answer ─────────────────────────────────────────────────────
    socket.on('www:submit_answer', (data, cb) => {
        try {
            const m = submitAnswer(String(data?.matchId), userId(), String(data?.answerText ?? ''));
            if (!m)
                return cb(err('Cannot submit answer'));
            broadcast(io, m);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── judge answer ──────────────────────────────────────────────────────
    socket.on('www:judge', (data, cb) => {
        try {
            const m = judgeAnswer(String(data?.matchId), userId(), String(data?.teamId), !!data?.isCorrect);
            if (!m)
                return cb(err('Cannot judge'));
            broadcast(io, m);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── next question ─────────────────────────────────────────────────────
    socket.on('www:next_question', (data, cb) => {
        try {
            const m = nextQuestion(String(data?.matchId), userId());
            if (!m)
                return cb(err('Cannot advance'));
            broadcast(io, m);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── chat ──────────────────────────────────────────────────────────────
    socket.on('www:chat', (data, _cb) => {
        try {
            const m = sendChat(String(data?.matchId), userId(), String(data?.nickname ?? 'Player').slice(0, 24), String(data?.text ?? ''));
            if (!m)
                return;
            const msg = m.chat[m.chat.length - 1];
            // Route per viewer for isolation: host gets every message; a team member
            // gets broadcasts + only their own team's channel.
            const room = io.sockets.adapter.rooms.get(WWW_ROOM(m.id));
            if (!room)
                return;
            for (const sid of room) {
                const s = io.sockets.sockets.get(sid);
                if (!s)
                    continue;
                const vid = s.data.profileId ?? s.id;
                const vTeam = m.players[vid]?.teamId;
                if (vid === m.hostId || msg.channel === 'broadcast' || msg.channel === vTeam) {
                    s.emit('www:chat', msg);
                }
            }
        }
        catch { /* ignore */ }
    });
    // ── voice: join ───────────────────────────────────────────────────────
    socket.on('www:voice-join', (data, cb) => {
        try {
            const match = getMatch(String(data?.matchId));
            if (!match)
                return cb(err('Match not found.'));
            if (match.status === 'finished')
                return cb(err('Match has ended.'));
            const player = match.players[userId()];
            if (!player)
                return cb(err('Not in this match.'));
            const existingPeers = voiceJoin(match.id, socket.id, player.nickname);
            // CRITICAL: broadcast to existing peers so they initiate WebRTC
            socket.to(WWW_ROOM(match.id)).emit('www:voice-peer-joined', {
                socketId: socket.id,
                name: player.nickname,
            });
            const iceConfig = buildIceConfig();
            cb(ok({
                peers: existingPeers,
                iceServers: iceConfig.iceServers,
                iceTransportPolicy: iceConfig.iceTransportPolicy,
                canSpeak: !player.isSpectator,
            }));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── voice: leave ──────────────────────────────────────────────────────
    socket.on('www:voice-leave', (_data, cb) => {
        const matchId = voiceLeave(socket.id);
        if (matchId) {
            socket.to(WWW_ROOM(matchId)).emit('www:voice-peer-left', { socketId: socket.id });
        }
        cb?.(ok(null));
    });
    // ── voice: WebRTC signalling relay ────────────────────────────────────
    socket.on('www:voice-offer', (data) => {
        io.to(data.to).emit('www:voice-offer', { from: socket.id, sdp: data.sdp });
    });
    socket.on('www:voice-answer', (data) => {
        io.to(data.to).emit('www:voice-answer', { from: socket.id, sdp: data.sdp });
    });
    socket.on('www:voice-ice', (data) => {
        io.to(data.to).emit('www:voice-ice', { from: socket.id, candidate: data.candidate });
    });
    // ── voice: Push-to-Talk state ─────────────────────────────────────────
    socket.on('www:ptt-start', (data) => {
        const match = getMatch(String(data?.matchId));
        if (!match)
            return;
        const player = match.players[userId()];
        if (!player || player.isSpectator)
            return;
        socket.to(WWW_ROOM(data.matchId)).emit('www:ptt-state', { socketId: socket.id, speaking: true });
    });
    socket.on('www:ptt-stop', (data) => {
        const match = getMatch(String(data?.matchId));
        if (!match)
            return;
        socket.to(WWW_ROOM(data.matchId)).emit('www:ptt-state', { socketId: socket.id, speaking: false });
    });
}
export function handleWWWDisconnect(io, socketId) {
    // Voice cleanup for disconnected socket
    const voiceMatchId = voiceGetMatchId(socketId);
    if (voiceMatchId) {
        voiceLeave(socketId);
        io.to(WWW_ROOM(voiceMatchId)).emit('www:voice-peer-left', { socketId });
        io.to(WWW_ROOM(voiceMatchId)).emit('www:ptt-state', { socketId, speaking: false });
    }
    const matchId = disconnectUser(socketId);
    if (matchId) {
        const m = getMatch(matchId);
        if (m)
            broadcast(io, m);
    }
}
//# sourceMappingURL=www.js.map