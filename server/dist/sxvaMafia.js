import { ok, err, } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, listMatches, joinMatch, leaveMatch, dissolveMatch, startMatch, reshuffleRoles, setRoleConfig, setSettings, beginMafiaMeet, endMafiaMeet, beginNight, mafiaVote, donCheck, sheriffCheck, endNight, advanceNightAuto, beginDay, nextSpeaker, advanceSpeakerAuto, extendSpeech, nominate, castVote, endVote, giveFoul, endLastWords, rematch, disconnectSocket, getSafeState, } from './services/sxvaMafiaService.js';
const ROOM = (id) => `xm:${id}`;
function userId(socket) { return socket.data.profileId ?? socket.id; }
function everyone(m) {
    if (!m)
        return [];
    const out = [{ userId: m.hostId, socketId: m.hostSocketId }];
    for (const s of m.seats)
        out.push({ userId: s.userId, socketId: s.socketId });
    for (const s of m.spectators)
        out.push({ userId: s.userId, socketId: s.socketId });
    return out;
}
function broadcastState(io, matchId) {
    const m = getMatch(matchId);
    if (!m)
        return;
    for (const v of everyone(m)) {
        const s = io.sockets.sockets.get(v.socketId);
        if (s)
            s.emit('xm:state', getSafeState(m, v.userId));
    }
}
function broadcastList(io) { io.emit('xm:list_update', listMatches()); }
const timers = new Map();
function clearT(id) { const t = timers.get(id); if (t) {
    clearTimeout(t);
    timers.delete(id);
} }
/** Schedule the current phase's deadline (speech / vote / last-words). Night is host-paced. */
function syncTimer(io, matchId) {
    clearT(matchId);
    const m = getMatch(matchId);
    if (!m)
        return;
    let deadline = 0;
    let fire = null;
    if (m.phase === 'speech' && m.speechEndsAt) {
        deadline = m.speechEndsAt;
        fire = () => { advanceSpeakerAuto(matchId); };
    }
    else if (m.phase === 'vote' && m.voteEndsAt) {
        deadline = m.voteEndsAt;
        fire = () => { endVote(matchId, null); };
    }
    else if (m.phase === 'last_words' && m.lastWordsEndsAt) {
        deadline = m.lastWordsEndsAt;
        fire = () => { endLastWords(matchId, null); };
    }
    else if (m.phase === 'night' && m.nightEndsAt) {
        deadline = m.nightEndsAt;
        fire = () => { advanceNightAuto(matchId); };
    }
    if (!fire || !deadline)
        return;
    const token = deadline;
    const t = setTimeout(() => {
        timers.delete(matchId);
        const cur = getMatch(matchId);
        if (!cur)
            return;
        // Guard against a stale timer whose deadline was superseded.
        const stillCurrent = (cur.phase === 'speech' && cur.speechEndsAt === token) ||
            (cur.phase === 'vote' && cur.voteEndsAt === token) ||
            (cur.phase === 'last_words' && cur.lastWordsEndsAt === token) ||
            (cur.phase === 'night' && cur.nightEndsAt === token);
        if (!stillCurrent)
            return;
        fire();
        broadcastState(io, matchId);
        syncTimer(io, matchId);
    }, Math.max(0, token - Date.now()));
    timers.set(matchId, t);
}
export function registerSxvaMafiaHandlers(io, socket) {
    const uid = () => userId(socket);
    const after = (matchId) => { broadcastState(io, matchId); syncTimer(io, matchId); };
    socket.on('xm:list', (cb) => { try {
        cb(ok(listMatches()));
    }
    catch (e) {
        cb(err(e.message));
    } });
    socket.on('xm:create', (data, cb) => {
        try {
            const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
            const m = createMatch(uid(), socket.id, nickname, { maxSeats: Number(data?.maxSeats ?? 10) });
            socket.join(ROOM(m.id));
            broadcastList(io);
            cb(ok(getSafeState(m, uid())));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('xm:join', (data, cb) => {
        try {
            const code = String(data?.code ?? '').trim().toUpperCase();
            const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 24) || 'Player';
            const found = getMatchByCode(code);
            if (!found)
                return cb(err('თამაში ვერ მოიძებნა'));
            const res = joinMatch(found.id, uid(), socket.id, nickname);
            if (!res)
                return cb(err('ვერ შეუერთდი'));
            socket.join(ROOM(found.id));
            if (res.isNew)
                broadcastState(io, found.id);
            broadcastList(io);
            cb(ok(getSafeState(res.match, uid())));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('xm:leave', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = leaveMatch(matchId, uid());
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
    // ── Host: start / roles / phases ──────────────────────────────────────────
    const hostAction = (fn, failMsg) => (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = fn(matchId, uid());
            if (!m)
                return cb(err(failMsg));
            after(matchId);
            if (m.phase === 'finished')
                broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    };
    socket.on('xm:start', hostAction(startMatch, 'ვერ დაიწყო — საჭიროა მინიმუმ 4 მოთამაშე'));
    socket.on('xm:reshuffle', hostAction(reshuffleRoles, 'ვერ განახლდა'));
    socket.on('xm:set_roles', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = setRoleConfig(matchId, uid(), data?.config ?? null);
            if (!m)
                return cb(err('ვერ შეიცვალა'));
            after(matchId);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('xm:set_settings', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = setSettings(matchId, uid(), data?.patch ?? {});
            if (!m)
                return cb(err('ვერ შეიცვალა'));
            after(matchId);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('xm:begin_meet', hostAction(beginMafiaMeet, 'ვერ დაიწყო'));
    socket.on('xm:end_meet', hostAction(endMafiaMeet, 'ვერ დასრულდა'));
    socket.on('xm:begin_night', hostAction(beginNight, 'ვერ დაიწყო ღამე'));
    socket.on('xm:end_night', hostAction(endNight, 'ვერ დასრულდა ღამე'));
    socket.on('xm:begin_day', hostAction(beginDay, 'ვერ დაიწყო დღე'));
    socket.on('xm:next_speaker', hostAction(nextSpeaker, 'ვერ გადავიდა'));
    socket.on('xm:extend_speech', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = extendSpeech(matchId, uid(), Number(data?.seconds ?? 30));
            if (!m)
                return cb(err('ვერ გაგრძელდა'));
            after(matchId);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('xm:end_vote', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = endVote(matchId, uid());
            if (!m)
                return cb(err('ვერ დასრულდა კენჭისყრა'));
            after(matchId);
            if (m.phase === 'finished')
                broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('xm:end_last_words', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = endLastWords(matchId, uid());
            if (!m)
                return cb(err('ვერ დასრულდა'));
            after(matchId);
            if (m.phase === 'finished')
                broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('xm:give_foul', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = giveFoul(matchId, uid(), String(data?.targetId), Number(data?.delta ?? 1));
            if (!m)
                return cb(err('ვერ დაფიქსირდა ფაული'));
            after(matchId);
            if (m.phase === 'finished')
                broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // ── Player actions ─────────────────────────────────────────────────────────
    const targetAction = (fn, failMsg) => (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = fn(matchId, uid(), String(data?.targetId));
            if (!m)
                return cb(err(failMsg));
            after(matchId);
            if (m.phase === 'finished')
                broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    };
    socket.on('xm:mafia_vote', targetAction(mafiaVote, 'ვერ აირჩია სამიზნე'));
    socket.on('xm:don_check', targetAction(donCheck, 'ვერ შეამოწმა'));
    socket.on('xm:sheriff_check', targetAction(sheriffCheck, 'ვერ შეამოწმა'));
    socket.on('xm:nominate', targetAction(nominate, 'ვერ დაასახელა'));
    socket.on('xm:cast_vote', targetAction(castVote, 'ვერ მისცა ხმა'));
    socket.on('xm:rematch', (data, cb) => {
        try {
            const m = rematch(String(data?.matchId), uid());
            if (!m)
                return cb(err('ვერ დაიწყო ხელახლა'));
            broadcastState(io, m.id);
            syncTimer(io, m.id);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
}
export function handleSxvaMafiaDisconnect(io, socketId) {
    const matchId = disconnectSocket(socketId);
    if (!matchId)
        return;
    const m = getMatch(matchId);
    if (m)
        broadcastState(io, matchId);
    syncTimer(io, matchId);
    broadcastList(io);
}
export { dissolveMatch };
//# sourceMappingURL=sxvaMafia.js.map