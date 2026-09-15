/**
 * ვინ თქვა? — one player reads an absurd line aloud, everybody else guesses
 * who it was.
 *
 * WHY THIS IS A GAME AND NOT A QUIZ
 * ─────────────────────────────────
 * The room is already on voice for every other game here, and voice is used
 * only to talk. This makes the voice itself the thing being played: the reader
 * has to sound like somebody else for fifteen seconds to people who know
 * exactly what they sound like, and everybody else has to listen harder than
 * they ever do on a call.
 *
 * NOTHING IS RECORDED
 * ───────────────────
 * The line is read live and heard live. No audio is captured, uploaded or
 * stored anywhere — the server holds a phrase index and a set of votes, and
 * both are gone when the match ends.
 *
 * THE ONE SECRET
 * ──────────────
 * Who is reading. It is sent to the reader and to nobody else, per viewer, in
 * `getSafeState` — the same shape ჯაშუში uses for the spy. A client that could
 * see the reader would end the game, and it would look completely normal from
 * the outside.
 *
 * Pure logic — no socket.io. In-memory Maps, reconnect-aware join, per-viewer
 * safe state, three-hour sweep, as the Alias/UNO/Spyfall services do.
 */
import { randomBytes } from 'crypto';
import { PHRASES, READ_SECONDS, VOTE_SECONDS, pickPhrase, pickReader, scoreRound, } from './whoSaidPhrases.js';
export const MIN_PLAYERS = 3;
const SWEEP_AFTER_MS = 3 * 60 * 60 * 1000;
const matches = new Map();
/** A room is only open while somebody is still in it. */
function hasSomeoneIn(players) {
    return players.some(p => p.connected);
}
function newCode() {
    let c = '';
    do {
        c = randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
    } while ([...matches.values()].some(m => m.code === c && m.status !== 'finished'));
    return c;
}
function touch(m) { m.updatedAt = Date.now(); }
/** Drop matches nobody has touched in three hours. */
function sweep() {
    const cut = Date.now() - SWEEP_AFTER_MS;
    for (const [id, m] of matches)
        if (m.updatedAt < cut)
            matches.delete(id);
}
export function createMatch(hostId, socketId, nickname, opts = {}) {
    sweep();
    const id = randomBytes(8).toString('hex');
    const m = {
        id,
        code: newCode(),
        hostId,
        status: 'waiting',
        players: [{
                userId: hostId, socketId, nickname, seat: 0,
                connected: true, score: 0, timesRead: 0, vote: null, left: false,
            }],
        maxPlayers: Math.min(10, Math.max(MIN_PLAYERS, opts.maxPlayers ?? 8)),
        rounds: Math.min(20, Math.max(3, opts.rounds ?? 6)),
        round: 0,
        readerId: null,
        phraseIndex: null,
        usedPhrases: [],
        endsAt: 0,
        reveal: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    matches.set(id, m);
    return m;
}
export function getMatch(id) { return matches.get(id) ?? null; }
export function getMatchByCode(code) {
    for (const m of matches.values())
        if (m.code === code && m.status !== 'finished')
            return m;
    return null;
}
export function getMatchForSocket(socketId) {
    for (const m of matches.values())
        if (m.players.some(p => p.socketId === socketId))
            return m;
    return null;
}
export function listMatches() {
    sweep();
    return [...matches.values()]
        .filter(m => m.status !== 'finished' && hasSomeoneIn(m.players))
        .map(m => ({
        id: m.id, code: m.code,
        hostName: m.players.find(p => p.userId === m.hostId)?.nickname ?? '—',
        players: m.players.filter(p => p.connected).length,
        maxPlayers: m.maxPlayers,
        status: m.status,
    }));
}
export function joinMatch(matchId, userId, socketId, nickname) {
    const m = matches.get(matchId);
    if (!m || m.status === 'finished')
        return null;
    // Reconnect: the same person coming back keeps their seat and their score.
    const existing = m.players.find(p => p.userId === userId);
    if (existing) {
        existing.socketId = socketId;
        existing.connected = true;
        existing.left = false; // they chose to come back
        existing.nickname = nickname;
        touch(m);
        return { match: m, isNew: false };
    }
    if (m.status !== 'waiting')
        return null; // no joining mid-match
    if (m.players.filter(p => p.connected).length >= m.maxPlayers)
        return null;
    m.players.push({
        userId, socketId, nickname,
        seat: m.players.length,
        connected: true, score: 0, timesRead: 0, vote: null, left: false,
    });
    touch(m);
    return { match: m, isNew: true };
}
export function leaveMatch(matchId, userId) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    const i = m.players.findIndex(p => p.userId === userId);
    if (i < 0)
        return m;
    if (m.status === 'waiting')
        m.players.splice(i, 1);
    else {
        m.players[i].connected = false;
        m.players[i].left = true;
    }
    if (!hasSomeoneIn(m.players)) {
        m.status = 'finished';
        touch(m);
        return m;
    }
    if (m.hostId === userId) {
        const next = m.players.find(p => p.connected);
        if (next)
            m.hostId = next.userId;
    }
    touch(m);
    return m;
}
export function disconnectSocket(socketId) {
    for (const m of matches.values()) {
        const p = m.players.find(x => x.socketId === socketId);
        if (!p)
            continue;
        p.connected = false;
        if (!hasSomeoneIn(m.players))
            m.status = 'finished';
        touch(m);
        return m.id;
    }
    return null;
}
export function resumeForUser(userId, socketId) {
    for (const m of matches.values()) {
        if (m.status === 'finished')
            continue;
        const p = m.players.find(x => x.userId === userId);
        if (!p)
            continue;
        p.socketId = socketId;
        p.connected = true;
        p.left = false;
        touch(m);
        return m;
    }
    return null;
}
/** Deal a round: choose the reader, choose the line, open the reading window. */
function beginRound(m) {
    const reader = pickReader(m.players, m.readerId);
    if (!reader) {
        m.status = 'finished';
        return;
    }
    const idx = pickPhrase(m.usedPhrases);
    m.readerId = reader;
    m.phraseIndex = idx;
    m.usedPhrases.push(idx);
    m.players.find(p => p.userId === reader).timesRead++;
    for (const p of m.players)
        p.vote = null;
    m.reveal = null;
    m.round++;
    m.status = 'reading';
    m.endsAt = Date.now() + READ_SECONDS * 1000;
    touch(m);
}
export function startMatch(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.status !== 'waiting')
        return null;
    if (m.players.filter(p => p.connected).length < MIN_PLAYERS)
        return null;
    beginRound(m);
    return m;
}
/** Reading is over: open the vote. The host may cut it short. */
export function beginVoting(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'reading')
        return null;
    // A caller of null is the timer; a person has to be the host or the reader.
    if (byUserId !== null && byUserId !== m.hostId && byUserId !== m.readerId)
        return null;
    m.status = 'voting';
    m.endsAt = Date.now() + VOTE_SECONDS * 1000;
    touch(m);
    return m;
}
/**
 * Accuse somebody.
 *
 * The reader cannot vote, nobody can vote for themselves, and a vote for a
 * player who is not in the match is dropped rather than stored — a vote that
 * cannot be scored would silently turn into a point for the reader.
 */
export function castVote(matchId, byUserId, targetId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'voting')
        return null;
    const voter = m.players.find(p => p.userId === byUserId);
    if (!voter || voter.userId === m.readerId)
        return null;
    if (targetId === byUserId)
        return null;
    if (!m.players.some(p => p.userId === targetId))
        return null;
    voter.vote = targetId;
    touch(m);
    // Everybody who can vote has voted: no reason to hold the room on a clock.
    const voters = m.players.filter(p => p.connected && p.userId !== m.readerId);
    if (voters.length > 0 && voters.every(p => p.vote !== null))
        finishRound(m);
    return m;
}
/** Close the round, score it, and show who it was. */
export function finishRound(m) {
    if (m.status !== 'voting' && m.status !== 'reading')
        return;
    const readerId = m.readerId;
    if (!readerId) {
        m.status = 'finished';
        return;
    }
    const votes = {};
    for (const p of m.players)
        if (p.vote && p.userId !== readerId)
            votes[p.userId] = p.vote;
    const { correct, fooled, points } = scoreRound(readerId, votes);
    for (const p of m.players)
        p.score += points[p.userId] ?? 0;
    m.reveal = {
        readerId,
        readerName: m.players.find(p => p.userId === readerId)?.nickname ?? '—',
        phrase: PHRASES[m.phraseIndex ?? 0] ?? '',
        correct, fooled, points,
    };
    m.status = 'reveal';
    m.endsAt = 0;
    touch(m);
}
/** Called by the socket layer when the vote clock runs out. */
export function forceFinishRound(matchId) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    finishRound(m);
    return m;
}
export function nextRound(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.status !== 'reveal')
        return null;
    if (m.round >= m.rounds) {
        m.status = 'finished';
        touch(m);
        return m;
    }
    beginRound(m);
    return m;
}
export function rematch(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId)
        return null;
    m.status = 'waiting';
    m.round = 0;
    m.readerId = null;
    m.phraseIndex = null;
    m.usedPhrases = [];
    m.reveal = null;
    m.endsAt = 0;
    for (const p of m.players) {
        p.score = 0;
        p.timesRead = 0;
        p.vote = null;
    }
    touch(m);
    return m;
}
/**
 * What this viewer may see.
 *
 * The phrase goes to the reader alone, and only while they are reading — once
 * voting starts even they do not need it, and leaving it in the payload would
 * mean the one client that has it is also the one that could be screenshotted
 * over somebody's shoulder.
 *
 * Nobody's vote is visible until the reveal. A board showing live votes turns
 * the round into "wait and follow whoever is confident".
 */
export function getSafeState(m, viewerUserId) {
    const isReader = m.readerId === viewerUserId;
    const me = m.players.find(p => p.userId === viewerUserId);
    return {
        id: m.id,
        code: m.code,
        hostId: m.hostId,
        status: m.status,
        round: m.round,
        rounds: m.rounds,
        endsAt: m.endsAt,
        players: m.players.map(p => ({
            userId: p.userId, nickname: p.nickname, seat: p.seat,
            connected: p.connected, score: p.score,
            // Whether somebody has voted is public; whom they voted for is not.
            hasVoted: p.vote !== null,
        })),
        youAreReading: isReader,
        phrase: isReader && m.status === 'reading' && m.phraseIndex !== null
            ? PHRASES[m.phraseIndex] ?? null
            : null,
        yourVote: me?.vote ?? null,
        reveal: m.reveal,
        maxPlayers: m.maxPlayers,
    };
}
/**
 * Who a state broadcast should go to.
 *
 * Everybody still in the match, whether or not they are currently connected —
 * a player whose phone slept must get the round back the moment they return —
 * but never somebody who pressed leave.
 */
export function recipients(m) {
    return m.players.filter(p => !p.left);
}
/** For tests: forget every match. */
export function __reset() { matches.clear(); }
//# sourceMappingURL=whoSaidService.js.map