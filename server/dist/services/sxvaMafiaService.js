/**
 * სხვა მაფია (Other Mafia) — a host-moderated, video-first "table mafia".
 *
 * This is an INDEPENDENT implementation written from scratch. It deliberately
 * shares nothing with the platform's original mafia engine — its own roles,
 * phase machine, turn/timer model, foul system and win logic live entirely
 * here. It follows the same generic match conventions used by the lies/spyfall
 * services (in-memory Maps, reconnect-aware join, per-viewer safe state, 3h GC).
 *
 * Shape of a game:
 *   • one player is the HOST / moderator — they sit in the centre, hold no
 *     secret role, run the phases and hand out fouls.
 *   • the others take numbered SEATS with hidden roles and a webcam tile.
 *   • phases loop: assign → night → day_announce → speech → vote → last_words → …
 *   • during the day each living seat gets its own timed minute to speak; the
 *     active seat's tile is highlighted. Four fouls eliminate a seat.
 *
 * Timers (speech/night/vote/last-words deadlines) are driven from the socket
 * layer, exactly like the other match games.
 */
import { randomBytes } from 'crypto';
export const XM_FOULS_TO_ELIMINATE = 4;
const matches = new Map();
function code6() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}
function shuffle(a) { const r = [...a]; for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
} return r; }
/** Role split for a given number of seated players (host excluded). */
export function roleCounts(n) {
    const mafiaTotal = n <= 6 ? 1 : n <= 8 ? 2 : n <= 11 ? 3 : 4; // includes the don
    const don = mafiaTotal >= 1 ? 1 : 0;
    const mafia = mafiaTotal - don;
    const sheriff = n >= 5 ? 1 : 0;
    const citizen = Math.max(0, n - don - mafia - sheriff);
    return { don, mafia, sheriff, citizen };
}
export function createMatch(hostId, socketId, nickname, opts) {
    const id = randomBytes(8).toString('hex');
    const m = {
        id, code: code6(), phase: 'lobby',
        hostId, hostSocketId: socketId, hostName: nickname, hostConnected: true,
        maxSeats: Math.min(14, Math.max(4, Number(opts.maxSeats ?? 10))),
        seats: [],
        spectators: [],
        settings: { speechSeconds: 60, nightSeconds: 40, voteSeconds: 30, lastWordsSeconds: 40 },
        round: 0,
        speechOrder: [], speechIdx: 0, speechEndsAt: 0, nominations: [], nominatedBy: {},
        night: { mafiaVotes: {}, donCheck: null, donResult: null, sheriffCheck: null, sheriffResult: null },
        announce: null,
        votes: {}, voteEndsAt: 0, voteResult: null,
        lastWordsUserId: null, lastWordsEndsAt: 0,
        winner: null, reveal: null, dissolved: false, createdAt: Date.now(),
    };
    matches.set(id, m);
    setTimeout(() => matches.delete(id), 3 * 60 * 60 * 1000);
    return m;
}
export function getMatch(id) { return matches.get(id) ?? null; }
export function getMatchByCode(code) { for (const m of matches.values())
    if (m.code === code && m.phase !== 'finished')
        return m; return null; }
export function getMatchForSocket(socketId) {
    for (const m of matches.values()) {
        if (m.hostSocketId === socketId)
            return m;
        if (m.seats.some(s => s.socketId === socketId))
            return m;
        if (m.spectators.some(s => s.socketId === socketId))
            return m;
    }
    return null;
}
export function listMatches() {
    return [...matches.values()].filter(m => m.phase !== 'finished').map(m => ({
        id: m.id, code: m.code, hostName: m.hostName, seatCount: m.seats.length, maxSeats: m.maxSeats, phase: m.phase,
    }));
}
function findByUser(m, userId) { return m.seats.find(s => s.userId === userId) ?? null; }
function aliveSeats(m) { return m.seats.filter(s => s.alive); }
function isMafiaRole(r) { return r === 'mafia' || r === 'don'; }
function aliveMafia(m) { return m.seats.filter(s => s.alive && isMafiaRole(s.role)); }
function aliveTown(m) { return m.seats.filter(s => s.alive && !isMafiaRole(s.role)); }
/** Join as a seat (during lobby) or reconnect. Post-start newcomers become spectators. */
export function joinMatch(matchId, userId, socketId, nickname) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    if (m.hostId === userId) {
        m.hostSocketId = socketId;
        m.hostConnected = true;
        m.hostName = nickname;
        return { match: m, isNew: false };
    }
    const seat = findByUser(m, userId);
    if (seat) {
        seat.socketId = socketId;
        seat.connected = true;
        return { match: m, isNew: false };
    }
    const spec = m.spectators.find(s => s.userId === userId);
    if (spec) {
        spec.socketId = socketId;
        spec.connected = true;
        return { match: m, isNew: false };
    }
    if (m.phase === 'lobby' && m.seats.length < m.maxSeats) {
        m.seats.push({ userId, socketId, nickname, seat: m.seats.length + 1, connected: true, role: null, alive: true, fouls: 0, eliminatedRound: null, eliminatedBy: null });
        return { match: m, isNew: true };
    }
    m.spectators.push({ userId, socketId, nickname, connected: true });
    return { match: m, isNew: true };
}
export function leaveMatch(matchId, userId) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    if (m.phase === 'lobby') {
        if (m.hostId === userId)
            return dissolveMatch(matchId, userId); // host leaving in lobby ends it
        m.seats = m.seats.filter(s => s.userId !== userId);
        m.seats.forEach((s, i) => { s.seat = i + 1; });
        m.spectators = m.spectators.filter(s => s.userId !== userId);
        return m;
    }
    // Active game: host leaving dissolves; a player leaving marks them disconnected/eliminated.
    if (m.hostId === userId)
        return dissolveMatch(matchId, userId);
    const seat = findByUser(m, userId);
    if (seat) {
        seat.connected = false;
    }
    m.spectators = m.spectators.filter(s => s.userId !== userId);
    return m;
}
export function disconnectSocket(socketId) {
    const m = getMatchForSocket(socketId);
    if (!m)
        return null;
    if (m.hostSocketId === socketId) {
        m.hostConnected = false;
        return m.id;
    }
    const seat = m.seats.find(s => s.socketId === socketId);
    if (seat) {
        seat.connected = false;
        if (m.phase === 'lobby') {
            m.seats = m.seats.filter(s => s.userId !== seat.userId);
            m.seats.forEach((s, i) => { s.seat = i + 1; });
        }
        return m.id;
    }
    const spec = m.spectators.find(s => s.socketId === socketId);
    if (spec) {
        spec.connected = false;
        if (m.phase === 'lobby')
            m.spectators = m.spectators.filter(s => s.userId !== spec.userId);
    }
    return m.id;
}
export function dissolveMatch(matchId, _byUserId) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    m.phase = 'finished';
    m.dissolved = true;
    m.winner = null;
    return m;
}
// ── Start / role assignment ─────────────────────────────────────────────────────
export function assignRoles(m) {
    const n = m.seats.length;
    const { don, mafia, sheriff } = roleCounts(n);
    const pool = [
        ...Array(don).fill('don'),
        ...Array(mafia).fill('mafia'),
        ...Array(sheriff).fill('sheriff'),
    ];
    while (pool.length < n)
        pool.push('citizen');
    const roles = shuffle(pool);
    m.seats.forEach((s, i) => {
        s.role = roles[i];
        s.alive = true;
        s.fouls = 0;
        s.eliminatedRound = null;
        s.eliminatedBy = null;
    });
}
export function startMatch(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'lobby')
        return null;
    if (m.seats.length < 4)
        return null;
    assignRoles(m);
    m.round = 0;
    m.phase = 'assign';
    m.winner = null;
    m.reveal = null;
    m.announce = null;
    return m;
}
/** Host re-rolls the secret roles while still on the assign screen. */
export function reshuffleRoles(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'assign')
        return null;
    assignRoles(m);
    return m;
}
// ── Phase transitions (host-driven) ─────────────────────────────────────────────
function resetNight(m) {
    m.night = { mafiaVotes: {}, donCheck: null, donResult: null, sheriffCheck: null, sheriffResult: null };
}
/** First night only: the mafia open their eyes and get to know each other. */
export function beginMafiaMeet(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'assign')
        return null;
    resetNight(m);
    m.round = 1;
    m.phase = 'mafia_meet';
    return m;
}
/** Host closes the acquaintance screen; the first night's actions begin. */
export function endMafiaMeet(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'mafia_meet')
        return null;
    resetNight(m);
    m.phase = 'night';
    return m;
}
export function beginNight(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId)
        return null;
    if (m.phase !== 'speech' && m.phase !== 'day_announce')
        return null; // first night goes via mafia_meet
    resetNight(m);
    m.phase = 'night';
    m.round += 1;
    return m;
}
/** Mafia member picks the kill target for tonight. */
export function mafiaVote(matchId, byUserId, targetUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'night')
        return null;
    const actor = findByUser(m, byUserId);
    const target = findByUser(m, targetUserId);
    if (!actor || !actor.alive || !isMafiaRole(actor.role))
        return null;
    if (!target || !target.alive || isMafiaRole(target.role))
        return null; // mafia don't shoot their own
    m.night.mafiaVotes[byUserId] = targetUserId;
    return m;
}
export function donCheck(matchId, byUserId, targetUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'night')
        return null;
    const actor = findByUser(m, byUserId);
    const target = findByUser(m, targetUserId);
    if (!actor || !actor.alive || actor.role !== 'don')
        return null;
    if (!target || !target.alive)
        return null;
    m.night.donCheck = targetUserId;
    m.night.donResult = target.role === 'sheriff';
    return m;
}
export function sheriffCheck(matchId, byUserId, targetUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'night')
        return null;
    const actor = findByUser(m, byUserId);
    const target = findByUser(m, targetUserId);
    if (!actor || !actor.alive || actor.role !== 'sheriff')
        return null;
    if (!target || !target.alive)
        return null;
    m.night.sheriffCheck = targetUserId;
    m.night.sheriffResult = isMafiaRole(target.role);
    return m;
}
function resolveKill(m) {
    const votes = Object.entries(m.night.mafiaVotes).filter(([voter]) => {
        const s = findByUser(m, voter);
        return s && s.alive && isMafiaRole(s.role);
    });
    if (votes.length === 0)
        return null;
    const tally = new Map();
    for (const [, t] of votes)
        tally.set(t, (tally.get(t) ?? 0) + 1);
    let best = null, bestN = -1, tie = false;
    for (const [t, c] of tally) {
        if (c > bestN) {
            best = t;
            bestN = c;
            tie = false;
        }
        else if (c === bestN)
            tie = true;
    }
    // Tie → the don's pick decides; if the don didn't vote, no kill lands.
    if (tie) {
        const donSeat = m.seats.find(s => s.alive && s.role === 'don');
        const donPick = donSeat ? m.night.mafiaVotes[donSeat.userId] : undefined;
        best = donPick ?? null;
    }
    if (!best)
        return null;
    const victim = findByUser(m, best);
    return victim && victim.alive && !isMafiaRole(victim.role) ? victim : null;
}
/** Host closes the night. Resolves the kill and moves to the morning announcement. */
export function endNight(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'night')
        return null;
    const victim = resolveKill(m);
    if (victim) {
        victim.alive = false;
        victim.eliminatedRound = m.round;
        victim.eliminatedBy = 'mafia';
    }
    m.announce = { round: m.round, killedUserId: victim?.userId ?? null, killedName: victim?.nickname ?? null };
    m.phase = 'day_announce';
    if (checkWin(m))
        return m;
    // The freshly killed player gets a farewell; otherwise straight into speeches.
    if (victim)
        startLastWords(m, victim.userId);
    return m;
}
// ── Day speech ───────────────────────────────────────────────────────────────
function buildSpeechOrder(m) {
    const alive = aliveSeats(m).sort((a, b) => a.seat - b.seat);
    if (alive.length === 0) {
        m.speechOrder = [];
        m.speechIdx = 0;
        return;
    }
    // Rotate the starting seat each day so the same person doesn't always open.
    const startPos = (m.round - 1) % alive.length;
    m.speechOrder = [...alive.slice(startPos), ...alive.slice(0, startPos)].map(s => s.userId);
    m.speechIdx = 0;
}
export function beginDay(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'day_announce')
        return null;
    m.nominations = [];
    m.nominatedBy = {};
    buildSpeechOrder(m);
    m.phase = 'speech';
    m.speechEndsAt = Date.now() + m.settings.speechSeconds * 1000;
    return m;
}
export function nextSpeaker(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'speech')
        return null;
    advanceSpeaker(m);
    return m;
}
/** Timer fired for the current speaker (byUserId null) or host skipped. */
export function advanceSpeakerAuto(matchId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'speech')
        return null;
    advanceSpeaker(m);
    return m;
}
function advanceSpeaker(m) {
    if (m.speechIdx + 1 >= m.speechOrder.length) {
        // Everyone spoke. If nobody was put to the vote, go straight to night.
        if (m.nominations.length === 0) {
            m.phase = 'day_announce';
            m.announce = null;
            return;
        }
        startVote(m);
        return;
    }
    m.speechIdx += 1;
    // Skip anyone who died/was fouled out mid-round.
    while (m.speechIdx < m.speechOrder.length) {
        const s = findByUser(m, m.speechOrder[m.speechIdx]);
        if (s && s.alive)
            break;
        m.speechIdx += 1;
    }
    if (m.speechIdx >= m.speechOrder.length) {
        if (m.nominations.length === 0) {
            m.phase = 'day_announce';
            m.announce = null;
        }
        else
            startVote(m);
        return;
    }
    m.speechEndsAt = Date.now() + m.settings.speechSeconds * 1000;
}
export function extendSpeech(matchId, byUserId, seconds) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'speech')
        return null;
    m.speechEndsAt += Math.min(60, Math.max(5, seconds)) * 1000;
    return m;
}
/** The current speaker nominates one living player for the day's vote. */
export function nominate(matchId, byUserId, targetUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'speech')
        return null;
    if (m.speechOrder[m.speechIdx] !== byUserId)
        return null; // only the active speaker
    const target = findByUser(m, targetUserId);
    if (!target || !target.alive)
        return null;
    // one nomination per speaker; changing it is allowed
    const prev = m.nominatedBy[byUserId];
    if (prev && prev !== targetUserId) {
        // remove old if nobody else nominated it
        if (!Object.entries(m.nominatedBy).some(([k, v]) => k !== byUserId && v === prev)) {
            m.nominations = m.nominations.filter(x => x !== prev);
        }
    }
    m.nominatedBy[byUserId] = targetUserId;
    if (!m.nominations.includes(targetUserId))
        m.nominations.push(targetUserId);
    return m;
}
// ── Vote ──────────────────────────────────────────────────────────────────────
function startVote(m) {
    m.votes = {};
    m.voteResult = null;
    m.phase = 'vote';
    m.voteEndsAt = Date.now() + m.settings.voteSeconds * 1000;
}
export function castVote(matchId, byUserId, nomineeUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'vote')
        return null;
    const voter = findByUser(m, byUserId);
    if (!voter || !voter.alive)
        return null;
    if (!m.nominations.includes(nomineeUserId))
        return null;
    m.votes[byUserId] = nomineeUserId;
    // Auto-resolve once every living player has voted.
    const voters = aliveSeats(m);
    if (voters.every(s => m.votes[s.userId]))
        resolveVote(m);
    return m;
}
function resolveVote(m) {
    const tally = {};
    for (const nominee of m.nominations)
        tally[nominee] = 0;
    for (const v of Object.values(m.votes))
        tally[v] = (tally[v] ?? 0) + 1;
    let best = null, bestN = -1, tie = false;
    for (const [nominee, c] of Object.entries(tally)) {
        if (c > bestN) {
            best = nominee;
            bestN = c;
            tie = false;
        }
        else if (c === bestN)
            tie = true;
    }
    const eliminated = tie || bestN <= 0 ? null : best;
    m.voteResult = { eliminatedUserId: eliminated, tally };
    if (eliminated) {
        const s = findByUser(m, eliminated);
        if (s) {
            s.alive = false;
            s.eliminatedRound = m.round;
            s.eliminatedBy = 'vote';
        }
        if (checkWin(m))
            return;
        startLastWords(m, eliminated);
    }
    else {
        // No elimination → night falls.
        m.phase = 'day_announce';
        m.announce = null;
    }
}
/** Host closes the vote early (timer or manual). */
export function endVote(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'vote')
        return null;
    if (byUserId !== null && m.hostId !== byUserId)
        return null;
    resolveVote(m);
    return m;
}
// ── Fouls ──────────────────────────────────────────────────────────────────────
export function giveFoul(matchId, byUserId, targetUserId, delta) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId)
        return null;
    const s = findByUser(m, targetUserId);
    if (!s || !s.alive)
        return null;
    s.fouls = Math.max(0, Math.min(XM_FOULS_TO_ELIMINATE, s.fouls + (delta >= 0 ? 1 : -1)));
    if (s.fouls >= XM_FOULS_TO_ELIMINATE) {
        s.alive = false;
        s.eliminatedRound = m.round;
        s.eliminatedBy = 'fouls';
        // If the fouled-out player was the active speaker, move on.
        if (m.phase === 'speech' && m.speechOrder[m.speechIdx] === targetUserId)
            advanceSpeaker(m);
        checkWin(m);
    }
    return m;
}
// ── Last words ──────────────────────────────────────────────────────────────────
function startLastWords(m, userId) {
    m.lastWordsUserId = userId;
    m.phase = 'last_words';
    m.lastWordsEndsAt = Date.now() + m.settings.lastWordsSeconds * 1000;
}
/** Host (or timer) ends the farewell speech; flow returns to the day/night loop. */
export function endLastWords(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.phase !== 'last_words')
        return null;
    if (byUserId !== null && m.hostId !== byUserId)
        return null;
    m.lastWordsUserId = null;
    if (checkWin(m))
        return m;
    // After a night kill's farewell we open the day; after a vote/foul we drop to night.
    if (m.announce && m.announce.killedUserId) {
        m.phase = 'day_announce';
    }
    else {
        m.phase = 'day_announce';
        m.announce = null;
    }
    return m;
}
// ── Win detection ─────────────────────────────────────────────────────────────
function checkWin(m) {
    const mafia = aliveMafia(m).length;
    const town = aliveTown(m).length;
    let winner = null;
    if (mafia === 0)
        winner = 'town';
    else if (mafia >= town)
        winner = 'mafia';
    if (winner) {
        m.winner = winner;
        m.phase = 'finished';
        m.reveal = m.seats.map(s => ({ userId: s.userId, nickname: s.nickname, seat: s.seat, role: s.role }));
        return true;
    }
    return false;
}
export function rematch(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.phase !== 'finished')
        return null;
    // Keep the host and connected seats; fold spectators into open seats.
    const keep = m.seats.filter(s => s.connected);
    for (const sp of m.spectators.filter(s => s.connected)) {
        if (keep.length >= m.maxSeats)
            break;
        keep.push({ userId: sp.userId, socketId: sp.socketId, nickname: sp.nickname, seat: 0, connected: true, role: null, alive: true, fouls: 0, eliminatedRound: null, eliminatedBy: null });
    }
    m.seats = keep;
    m.seats.forEach((s, i) => { s.seat = i + 1; s.role = null; s.alive = true; s.fouls = 0; s.eliminatedRound = null; s.eliminatedBy = null; });
    m.spectators = [];
    m.phase = 'lobby';
    m.round = 0;
    m.speechOrder = [];
    m.speechIdx = 0;
    m.speechEndsAt = 0;
    m.nominations = [];
    m.nominatedBy = {};
    resetNight(m);
    m.announce = null;
    m.votes = {};
    m.voteEndsAt = 0;
    m.voteResult = null;
    m.lastWordsUserId = null;
    m.lastWordsEndsAt = 0;
    m.winner = null;
    m.reveal = null;
    m.dissolved = false;
    return m;
}
// ── Safe state ─────────────────────────────────────────────────────────────────
export function getSafeState(m, viewerUserId) {
    const amHost = m.hostId === viewerUserId;
    const meSeat = findByUser(m, viewerUserId);
    const amSpectator = !amHost && !meSeat;
    const myRole = meSeat?.role ?? null;
    const iAmMafia = isMafiaRole(myRole);
    const gameOver = m.phase === 'finished';
    // Who may I see the role of?  Host & game-over: everyone. Mafia: fellow mafia. Else: myself only.
    const canSeeRole = (s) => {
        if (amHost || gameOver)
            return true;
        if (s.userId === viewerUserId)
            return true;
        if (iAmMafia && isMafiaRole(s.role))
            return true;
        return false;
    };
    const speakingUserId = m.phase === 'speech' ? (m.speechOrder[m.speechIdx] ?? null) : null;
    const seats = m.seats.map(s => ({
        userId: s.userId, socketId: s.socketId, nickname: s.nickname, seat: s.seat, connected: s.connected,
        alive: s.alive, fouls: s.fouls, eliminatedBy: s.eliminatedBy,
        role: canSeeRole(s) ? s.role : null,
        isSpeaking: s.userId === speakingUserId,
        isNominated: m.nominations.includes(s.userId),
    }));
    const mateIds = iAmMafia && !gameOver
        ? m.seats.filter(s => isMafiaRole(s.role) && s.userId !== viewerUserId).map(s => s.userId)
        : [];
    // Night private info + whether I already acted.
    let iActedTonight = false;
    let nightPrivate = null;
    if (m.phase === 'night' && meSeat && meSeat.alive) {
        if (meSeat.role === 'don') {
            iActedTonight = m.night.donCheck !== null && !!m.night.mafiaVotes[viewerUserId];
            if (m.night.donCheck !== null) {
                const t = findByUser(m, m.night.donCheck);
                nightPrivate = `${t?.nickname ?? '?'}: ${m.night.donResult ? 'შერიფია ✓' : 'შერიფი არ არის'}`;
            }
        }
        else if (isMafiaRole(meSeat.role)) {
            iActedTonight = !!m.night.mafiaVotes[viewerUserId];
        }
        else if (meSeat.role === 'sheriff') {
            iActedTonight = m.night.sheriffCheck !== null;
            if (m.night.sheriffCheck !== null) {
                const t = findByUser(m, m.night.sheriffCheck);
                nightPrivate = `${t?.nickname ?? '?'}: ${m.night.sheriffResult ? 'მაფიაა ✗' : 'მშვიდობიანია ✓'}`;
            }
        }
    }
    const lastWordsSeat = m.lastWordsUserId ? findByUser(m, m.lastWordsUserId) : null;
    return {
        id: m.id, code: m.code, phase: m.phase,
        hostId: m.hostId, hostName: m.hostName, hostSocketId: m.hostSocketId, hostConnected: m.hostConnected,
        maxSeats: m.maxSeats,
        seats,
        spectatorCount: m.spectators.filter(s => s.connected).length,
        settings: m.settings,
        round: m.round,
        amHost, amSpectator,
        mySeat: meSeat?.seat ?? null,
        myRole,
        myAlive: meSeat?.alive ?? false,
        myFouls: meSeat?.fouls ?? 0,
        mateIds,
        speakingUserId,
        speechEndsAt: m.phase === 'speech' ? m.speechEndsAt : 0,
        speechIdx: m.speechIdx,
        speechTotal: m.speechOrder.length,
        nominations: m.nominations.map(uid => { const s = findByUser(m, uid); return { userId: uid, nickname: s?.nickname ?? '?', seat: s?.seat ?? 0 }; }),
        iNominated: !!(meSeat && m.nominatedBy[viewerUserId]),
        nightEndsAt: 0, // night is host-paced; no hard deadline broadcast (kept for client shape)
        iActedTonight,
        nightPrivate,
        announce: (m.phase === 'day_announce' || m.phase === 'last_words') ? m.announce : null,
        voteEndsAt: m.phase === 'vote' ? m.voteEndsAt : 0,
        myVote: m.votes[viewerUserId] ?? null,
        voteTally: (() => { const t = {}; for (const nm of m.nominations)
            t[nm] = 0; for (const v of Object.values(m.votes))
            t[v] = (t[v] ?? 0) + 1; return t; })(),
        voteResult: m.phase === 'vote' ? m.voteResult : null,
        lastWordsUserId: m.lastWordsUserId,
        lastWordsName: lastWordsSeat?.nickname ?? null,
        lastWordsEndsAt: m.phase === 'last_words' ? m.lastWordsEndsAt : 0,
        winner: m.winner,
        reveal: m.reveal,
        dissolved: m.dissolved,
        myUserId: viewerUserId,
    };
}
//# sourceMappingURL=sxvaMafiaService.js.map