import { ok, err, } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, listMatches, joinMatch, leaveMatch, dissolveMatch, transferHost, startMatch, reshuffleRoles, setRoleConfig, setSettings, pickCard, beginMafiaMeet, endMafiaMeet, beginNight, mafiaVote, donCheck, sheriffCheck, endNight, beginDay, nextSpeaker, advanceSpeakerAuto, extendSpeech, nominate, grabFloor, castVote, endVote, nextCandidate, giveFoul, endLastWords, rematch, disconnectSocket, getSafeState, kickPlayer, recipients, resumeForUser, joinMatchAsBot, } from './services/sxvaMafiaService.js';
import { botName, isBot, isOwner, newBotId } from './services/testBots.js';
import { tick as botTick, hasBots } from './services/xmBotDriver.js';
const ROOM = (id) => `xm:${id}`;
function userId(socket) { return socket.data.profileId ?? socket.id; }
/**
 * Send the state to everyone still in the room.
 *
 * `exceptUserId` is for the person whose own action removed them: a player who
 * leaves, or a host who closes the room. Sending them the result of their own
 * departure puts the room back on their screen, and leaving again repeats it —
 * which is exactly the loop this argument exists to break. Note that leaving
 * the Socket.IO room is not enough on its own, because this broadcast addresses
 * stored socket ids rather than a room.
 */
function broadcastState(io, matchId, exceptUserId) {
    const m = getMatch(matchId);
    if (!m)
        return;
    for (const v of recipients(m)) {
        if (exceptUserId && v.userId === exceptUserId)
            continue;
        const s = io.sockets.sockets.get(v.socketId);
        if (s)
            s.emit('xm:state', getSafeState(m, v.userId));
    }
}
function broadcastList(io) { io.emit('xm:list_update', listMatches()); }
const timers = new Map();
const botTimers = new Map();
/**
 * Give the bots a turn, one move at a time.
 *
 * Paced rather than resolved in a burst: a night that finishes between two
 * frames tells nobody whether the night works, and the whole point of these
 * seats is to make the game watchable by one person. Each move that lands
 * broadcasts and schedules the next look.
 */
function scheduleBots(io, matchId) {
    const existing = botTimers.get(matchId);
    if (existing)
        clearTimeout(existing);
    if (!hasBots(matchId))
        return;
    const t = setTimeout(() => {
        botTimers.delete(matchId);
        let moved = false;
        try {
            moved = botTick(matchId);
        }
        catch (e) {
            console.warn('[xm/bot]', e);
        }
        if (!moved)
            return;
        broadcastState(io, matchId);
        syncTimer(io, matchId);
        scheduleBots(io, matchId);
    }, 1200);
    t.unref();
    botTimers.set(matchId, t);
}
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
    // Night is host-paced (auto-advances when all roles act, or host closes it) — no timer.
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
            (cur.phase === 'last_words' && cur.lastWordsEndsAt === token);
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
    const after = (matchId) => {
        broadcastState(io, matchId);
        syncTimer(io, matchId);
        scheduleBots(io, matchId);
    };
    /*
     * Accepts both `(cb)` and `(payload, cb)`.
     *
     * The handler used to take a callback only, so a caller that passed any
     * payload had its callback land in the second argument and was never
     * answered — the request simply hung until the client's ack timeout. A lobby
     * listing is not worth a ten-second stall over an argument shape.
     */
    socket.on('xm:list', (a, b) => {
        const cb = typeof a === 'function' ? a : typeof b === 'function' ? b : null;
        if (!cb)
            return;
        try {
            cb(ok(listMatches()));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    /**
     * Re-attach after a reconnect.
     *
     * The client asks on every fresh socket; the answer is authoritative state
     * for whatever room this identity is actually in, or null.
     */
    socket.on('xm:resume', (a, b) => {
        const cb = typeof a === 'function' ? a : typeof b === 'function' ? b : null;
        if (!cb)
            return;
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
            const me = uid();
            const m = leaveMatch(matchId, me);
            socket.leave(ROOM(matchId));
            // Everyone except the person who left — see broadcastState.
            if (m)
                broadcastState(io, matchId, me);
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
    // Host: put the next nominee on the floor, or close the vote.
    socket.on('xm:next_candidate', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = nextCandidate(matchId, uid());
            if (!m)
                return cb(err('ვერ გადავიდა'));
            after(matchId);
            if (m.phase === 'finished')
                broadcastList(io);
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
    socket.on('xm:grab_floor', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = grabFloor(matchId, uid());
            if (!m)
                return cb(err('ვერ აიღე სიტყვა'));
            after(matchId);
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
    socket.on('xm:transfer_host', targetAction(transferHost, 'ვერ გადაეცა ჰოსტობა'));
    /**
     * Owner-only: seat a test bot, or clear them out.
     *
     * A moderator alone cannot test a game that needs four players, and "get four
     * friends online at the same time" is not a test plan. Owner-gated against
     * the socket's identity, never against anything in the payload.
     */
    socket.on('xm:add_bot', async (d, cb) => {
        const reply = typeof cb === 'function' ? cb : () => { };
        try {
            if (!(await isOwner(socket.data.profileId)))
                return reply(err('მხოლოდ ოუნერისთვის'));
            const matchId = String(d?.matchId ?? '');
            const m = getMatch(matchId);
            if (!m)
                return reply(err('თამაში ვერ მოიძებნა'));
            if (m.hostId !== uid())
                return reply(err('მხოლოდ ჰოსტს შეუძლია'));
            const name = botName(m.seats.map(s => s.nickname));
            const added = joinMatchAsBot(matchId, newBotId(), name);
            if (!added)
                return reply(err('ადგილი აღარ არის'));
            after(matchId);
            broadcastList(io);
            reply(ok(null));
        }
        catch (e) {
            reply(err(e.message));
        }
    });
    socket.on('xm:clear_bots', async (d, cb) => {
        const reply = typeof cb === 'function' ? cb : () => { };
        try {
            if (!(await isOwner(socket.data.profileId)))
                return reply(err('მხოლოდ ოუნერისთვის'));
            const matchId = String(d?.matchId ?? '');
            const m = getMatch(matchId);
            if (!m)
                return reply(err('თამაში ვერ მოიძებნა'));
            if (m.hostId !== uid())
                return reply(err('მხოლოდ ჰოსტს შეუძლია'));
            for (const seat of m.seats.filter(s => isBot(s.userId))) {
                kickPlayer(matchId, uid(), seat.userId);
            }
            after(matchId);
            broadcastList(io);
            reply(ok(null));
        }
        catch (e) {
            reply(err(e.message));
        }
    });
    /**
     * The host removes a player.
     *
     * The removed player is told directly, once, so their client can close the
     * game rather than sit on a table it is no longer part of — they are not in
     * `recipients` any more, so the state broadcast will not reach them.
     */
    socket.on('xm:kick', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const targetId = String(data?.targetId);
            // Their socket id has to be read BEFORE the kick: in the lobby the seat
            // is removed outright, and a player who is never told has a screen full
            // of a room they are no longer in.
            const before = getMatch(matchId);
            const targetSocketId = before?.seats.find(s => s.userId === targetId)?.socketId
                ?? before?.spectators.find(s => s.userId === targetId)?.socketId
                ?? null;
            const m = kickPlayer(matchId, uid(), targetId);
            if (!m)
                return cb(err('ვერ გაირიცხა'));
            if (targetSocketId) {
                const ts = io.sockets.sockets.get(targetSocketId);
                ts?.emit('xm:kicked', { matchId });
                ts?.leave(ROOM(matchId));
            }
            after(matchId);
            if (m.phase === 'finished')
                broadcastList(io);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('xm:pick_card', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = pickCard(matchId, uid(), Number(data?.cardIndex));
            if (!m)
                return cb(err('ვერ აიღე ბარათი'));
            after(matchId);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
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