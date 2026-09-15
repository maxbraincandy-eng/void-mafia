/**
 * ვინ თქვა? — socket handlers and the two phase clocks.
 *
 * Follows the ჯაშუში module: a room per match, per-viewer state resolved by
 * identity so a reconnected player keeps receiving it, and timers keyed on
 * `endsAt` so a stale one cannot fire into a round that has already moved on.
 *
 * Both clocks are here rather than in the service because the service is pure
 * and testable without them, which is the only reason its rules could be
 * checked at all.
 */
import { ok, err, } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, listMatches, joinMatch, leaveMatch, startMatch, beginVoting, castVote, forceFinishRound, nextRound, rematch, disconnectSocket, resumeForUser, getSafeState, recipients, MIN_PLAYERS, } from './services/whoSaidService.js';
import { READ_SECONDS, VOTE_SECONDS } from './services/whoSaidPhrases.js';
import { emitToPlayers } from './lib/liveSocket.js';
const ROOM = (id) => `whosaid:${id}`;
const uidOf = (s) => String(s.data.profileId ?? s.id);
function broadcastState(io, matchId) {
    const m = getMatch(matchId);
    if (!m)
        return;
    emitToPlayers(io, recipients(m), 'ws:state', p => getSafeState(m, p.userId), (p, sid) => {
        p.socketId = sid;
        p.connected = true;
    });
}
function broadcastList(io) { io.emit('ws:list_update', listMatches()); }
const timers = new Map();
function clearPhase(id) {
    const t = timers.get(id);
    if (t) {
        clearTimeout(t);
        timers.delete(id);
    }
}
/**
 * Run the clock on whichever phase the match is in.
 *
 * `endsAt` doubles as the token: a timer that fires after the phase has
 * already been ended by hand finds a different deadline and does nothing. The
 * alternative — cancelling on every transition — is one missed call away from
 * a round that ends twice.
 */
function schedulePhase(io, matchId) {
    clearPhase(matchId);
    const m = getMatch(matchId);
    if (!m || (m.status !== 'reading' && m.status !== 'voting'))
        return;
    const token = m.endsAt;
    const t = setTimeout(() => {
        timers.delete(matchId);
        const cur = getMatch(matchId);
        if (!cur || cur.endsAt !== token)
            return; // stale
        if (cur.status === 'reading')
            beginVoting(matchId, null);
        else if (cur.status === 'voting')
            forceFinishRound(matchId);
        broadcastState(io, matchId);
        schedulePhase(io, matchId);
    }, Math.max(0, token - Date.now()));
    timers.set(matchId, t);
}
export function registerWhoSaidHandlers(io, socket) {
    const uid = () => uidOf(socket);
    socket.on('ws:list', (payload, cb) => {
        const ack = typeof payload === 'function' ? payload : cb;
        if (typeof ack !== 'function')
            return;
        try {
            ack(ok(listMatches()));
        }
        catch (e) {
            ack(err(e?.message ?? 'ვერ ჩაიტვირთა.'));
        }
    });
    socket.on('ws:create', (data, cb) => {
        if (typeof cb !== 'function')
            return;
        try {
            const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
            const m = createMatch(uid(), socket.id, nickname, {
                maxPlayers: Number(data?.maxPlayers ?? 8),
                rounds: Number(data?.rounds ?? 6),
            });
            socket.join(ROOM(m.id));
            broadcastList(io);
            cb(ok(getSafeState(m, uid())));
        }
        catch (e) {
            cb(err(e?.message ?? 'ვერ შეიქმნა.'));
        }
    });
    socket.on('ws:join', (data, cb) => {
        if (typeof cb !== 'function')
            return;
        try {
            const code = String(data?.code ?? '').trim().toUpperCase();
            const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 24) || 'Player';
            const m = getMatchByCode(code);
            if (!m)
                return cb(err('ოთახი ვერ მოიძებნა'));
            const res = joinMatch(m.id, uid(), socket.id, nickname);
            if (!res)
                return cb(err('ვერ შეხვედი — სავსეა ან უკვე დაიწყო'));
            socket.join(ROOM(m.id));
            if (res.isNew)
                broadcastState(io, m.id);
            broadcastList(io);
            cb(ok(getSafeState(m, uid())));
        }
        catch (e) {
            cb(err(e?.message ?? 'ვერ შეხვედი.'));
        }
    });
    socket.on('ws:resume', (payload, cb) => {
        const ack = typeof payload === 'function' ? payload : cb;
        if (typeof ack !== 'function')
            return;
        try {
            const m = resumeForUser(uid(), socket.id);
            if (!m)
                return ack(ok(null));
            socket.join(ROOM(m.id));
            broadcastState(io, m.id);
            ack(ok(getSafeState(m, uid())));
        }
        catch (e) {
            ack(err(e?.message ?? 'ვერ დაბრუნდი.'));
        }
    });
    socket.on('ws:start', (data, cb) => {
        if (typeof cb !== 'function')
            return;
        try {
            const m = startMatch(String(data?.matchId ?? ''), uid());
            if (!m)
                return cb(err(`საჭიროა მინიმუმ ${MIN_PLAYERS} მოთამაშე`));
            broadcastState(io, m.id);
            broadcastList(io);
            schedulePhase(io, m.id);
            cb(ok(getSafeState(m, uid())));
        }
        catch (e) {
            cb(err(e?.message ?? 'ვერ დაიწყო.'));
        }
    });
    /** The reader has finished, or the host is moving things along. */
    socket.on('ws:done_reading', (data, cb) => {
        if (typeof cb !== 'function')
            return;
        try {
            const m = beginVoting(String(data?.matchId ?? ''), uid());
            if (!m)
                return cb(err('ახლა არა.'));
            broadcastState(io, m.id);
            schedulePhase(io, m.id);
            cb(ok(getSafeState(m, uid())));
        }
        catch (e) {
            cb(err(e?.message ?? 'ვერ მოხერხდა.'));
        }
    });
    socket.on('ws:vote', (data, cb) => {
        if (typeof cb !== 'function')
            return;
        try {
            const m = castVote(String(data?.matchId ?? ''), uid(), String(data?.targetId ?? ''));
            if (!m)
                return cb(err('ხმა ვერ ჩაითვალა.'));
            broadcastState(io, m.id);
            // The round may have closed itself once the last vote landed.
            if (m.status === 'reveal')
                clearPhase(m.id);
            else
                schedulePhase(io, m.id);
            cb(ok(getSafeState(m, uid())));
        }
        catch (e) {
            cb(err(e?.message ?? 'ვერ ჩაითვალა.'));
        }
    });
    socket.on('ws:next', (data, cb) => {
        if (typeof cb !== 'function')
            return;
        try {
            const m = nextRound(String(data?.matchId ?? ''), uid());
            if (!m)
                return cb(err('ახლა არა.'));
            broadcastState(io, m.id);
            broadcastList(io);
            schedulePhase(io, m.id);
            cb(ok(getSafeState(m, uid())));
        }
        catch (e) {
            cb(err(e?.message ?? 'ვერ მოხერხდა.'));
        }
    });
    socket.on('ws:rematch', (data, cb) => {
        if (typeof cb !== 'function')
            return;
        try {
            const m = rematch(String(data?.matchId ?? ''), uid());
            if (!m)
                return cb(err('ახლა არა.'));
            clearPhase(m.id);
            broadcastState(io, m.id);
            broadcastList(io);
            cb(ok(getSafeState(m, uid())));
        }
        catch (e) {
            cb(err(e?.message ?? 'ვერ მოხერხდა.'));
        }
    });
    socket.on('ws:leave', (data, cb) => {
        const ack = typeof cb === 'function' ? cb : () => { };
        try {
            const id = String(data?.matchId ?? '');
            const m = leaveMatch(id, uid());
            socket.leave(ROOM(id));
            if (m) {
                if (m.status === 'finished')
                    clearPhase(id);
                broadcastState(io, id);
            }
            broadcastList(io);
            ack(ok(true));
        }
        catch (e) {
            ack(err(e?.message ?? 'ვერ გახვედი.'));
        }
    });
    socket.on('disconnect', () => {
        const id = disconnectSocket(socket.id);
        if (!id)
            return;
        const m = getMatch(id);
        if (m?.status === 'finished')
            clearPhase(id);
        broadcastState(io, id);
        broadcastList(io);
    });
}
export { READ_SECONDS, VOTE_SECONDS };
//# sourceMappingURL=whoSaid.js.map