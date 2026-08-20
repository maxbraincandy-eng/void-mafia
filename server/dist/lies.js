import { ok, err, } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, listMatches, joinMatch, leaveMatch, dissolveMatch, startMatch, submitBluff, clearRejected, submitGuess, forcePhaseEnd, nextRound, rematch, disconnectSocket, getSafeState, resumeForUser, } from './services/liesService.js';
import { emitToPlayers } from './lib/liveSocket.js';
const ROOM = (id) => `lies:${id}`;
function userId(socket) { return socket.data.profileId ?? socket.id; }
function broadcastState(io, matchId) {
    const m = getMatch(matchId);
    if (!m)
        return;
    // By identity, not by the socket id the player joined with: a reconnected
    // phone has a new socket, and emitting into the old one is how a player ends
    // up frozen mid-round while everyone can still hear them.
    emitToPlayers(io, m.players, 'lies:state', p => getSafeState(m, p.userId), (p, sid) => {
        p.socketId = sid;
        p.connected = true;
    });
}
function broadcastList(io) { io.emit('lies:list_update', listMatches()); }
const phaseTimers = new Map();
function clearPhaseTimer(id) { const t = phaseTimers.get(id); if (t) {
    clearTimeout(t);
    phaseTimers.delete(id);
} }
/** Keep the writing/guessing deadline timer in step with the current phase. */
function syncTimer(io, matchId) {
    clearPhaseTimer(matchId);
    const m = getMatch(matchId);
    if (!m || (m.status !== 'writing' && m.status !== 'guessing'))
        return;
    const token = m.endsAt;
    const t = setTimeout(() => {
        phaseTimers.delete(matchId);
        const cur = getMatch(matchId);
        if (!cur || cur.endsAt !== token)
            return; // stale
        forcePhaseEnd(matchId);
        broadcastState(io, matchId);
        syncTimer(io, matchId);
    }, Math.max(0, token - Date.now()));
    phaseTimers.set(matchId, t);
}
export function registerLiesHandlers(io, socket) {
    const uid = () => userId(socket);
    socket.on('lies:list', (cb) => { try {
        cb(ok(listMatches()));
    }
    catch (e) {
        cb(err(e.message));
    } });
    socket.on('lies:create', (data, cb) => {
        try {
            const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
            const m = createMatch(uid(), socket.id, nickname, { maxPlayers: Number(data?.maxPlayers ?? 8), rounds: Number(data?.rounds ?? 5) });
            socket.join(ROOM(m.id));
            broadcastList(io);
            cb(ok(getSafeState(m, uid())));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('lies:join', (data, cb) => {
        try {
            const code = String(data?.code ?? '').trim().toUpperCase();
            const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 24) || 'Player';
            const m = getMatchByCode(code);
            if (!m)
                return cb(err('თამაში ვერ მოიძებნა'));
            const result = joinMatch(m.id, uid(), socket.id, nickname);
            if (!result)
                return cb(err('ვერ შეუერთდი — სავსეა ან უკვე დაწყებულია'));
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
    /**
     * "Am I still in a match, and what is happening in it?"
     *
     * Asked after every (re)authentication, so a dropped connection or a full
     * reload lands the player back in the round instead of on a frozen screen.
     * Returns null when there is nothing to come back to — the client then clears
     * whatever stale match it was still showing.
     */
    socket.on('lies:resume', (cb) => {
        try {
            const m = resumeForUser(uid(), socket.id);
            if (!m)
                return cb(ok(null));
            socket.join(ROOM(m.id));
            broadcastState(io, m.id); // the table sees them present again
            cb(ok(getSafeState(m, uid())));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('lies:leave', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const cur = getMatch(matchId);
            const active = cur && cur.status !== 'waiting' && cur.status !== 'finished';
            const m = active ? dissolveMatch(matchId, uid()) : leaveMatch(matchId, uid());
            socket.leave(ROOM(matchId));
            if (m)
                broadcastState(io, matchId);
            syncTimer(io, matchId);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('lies:start', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = startMatch(matchId, uid());
            if (!m)
                return cb(err('ვერ დაიწყო — საჭიროა მინიმუმ 3 მოთამაშე'));
            broadcastState(io, matchId);
            syncTimer(io, matchId);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('lies:bluff', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const res = submitBluff(matchId, uid(), String(data?.text ?? ''));
            if (!res)
                return cb(err('ვერ გაიგზავნა'));
            broadcastState(io, matchId);
            syncTimer(io, matchId);
            cb(ok({ result: res.result }));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('lies:clear_rejected', (data, cb) => {
        try {
            clearRejected(uid());
            broadcastState(io, String(data?.matchId));
            cb?.(ok(null));
        }
        catch (e) {
            cb?.(err(e.message));
        }
    });
    socket.on('lies:guess', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = submitGuess(matchId, uid(), String(data?.optionId ?? ''));
            if (!m)
                return cb(err('ვერ აირჩია'));
            broadcastState(io, matchId);
            syncTimer(io, matchId);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('lies:next', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = nextRound(matchId, uid());
            if (!m)
                return cb(err('ვერ გაგრძელდა'));
            broadcastState(io, matchId);
            syncTimer(io, matchId);
            if (m.status === 'finished')
                broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('lies:rematch', (data, cb) => {
        try {
            const m = rematch(String(data?.matchId), uid());
            if (!m)
                return cb(err('ვერ დაიწყო ხელახლა'));
            broadcastState(io, m.id);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
}
// ── Disconnect cleanup ────────────────────────────────────────────────────────
export function handleLiesDisconnect(io, socketId) {
    const matchId = disconnectSocket(socketId);
    if (!matchId)
        return;
    const m = getMatch(matchId);
    if (m)
        broadcastState(io, matchId);
    syncTimer(io, matchId);
    broadcastList(io);
}
//# sourceMappingURL=lies.js.map