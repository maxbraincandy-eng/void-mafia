/**
 * ჯაშუში (Spyfall) — social deduction. Each round one random player is the spy;
 * everyone else learns the round's location + a role. Players interrogate each
 * other by voice; when the discussion timer ends (or the host cuts it short)
 * everyone votes on who the spy is. The spy may instead stop the round at any
 * moment by guessing the location.
 *
 * Scoring per round:
 *   spy caught by vote      → every non-spy +1
 *   vote hits a non-spy     → spy +2
 *   vote ties (spy escapes) → spy +2
 *   spy guesses location    → spy +3
 *   spy guesses wrong       → every non-spy +1
 *
 * Pure logic — no socket.io. Follows the Alias/UNO service conventions:
 * in-memory Maps, reconnect-aware join, per-viewer safe state, 3h GC.
 * Discussion timing lives in the socket layer.
 */
import { randomBytes } from 'crypto';
import { SPYFALL_LOCATIONS, SPYFALL_LOCATION_NAMES } from './spyfallLocations.js';
/** How long jurors have to respond to a mid-round accusation before it lapses. */
export const ACCUSE_SECONDS = 30;
const matches = new Map();
const playerMatch = new Map();
function code6() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}
function shuffle(a) { const r = [...a]; for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
} return r; }
export function createMatch(hostId, socketId, nickname, opts) {
    const id = randomBytes(8).toString('hex');
    const m = {
        id, code: code6(), status: 'waiting', hostId,
        maxPlayers: Math.min(10, Math.max(3, Number(opts.maxPlayers ?? 8))),
        players: [{ userId: hostId, socketId, nickname, seat: 0, connected: true, score: 0, isSpy: false, role: null, vote: null, accusationUsed: false }],
        settings: {
            rounds: Math.min(10, Math.max(1, Number(opts.rounds ?? 3))),
            discussSeconds: Math.min(600, Math.max(120, Number(opts.discussSeconds ?? 300))),
        },
        round: 0, locationIdx: null, usedLocationIdxs: [], endsAt: 0, accusation: null, pausedMsLeft: null,
        reveal: null, winnerIds: [], dissolved: false, createdAt: Date.now(),
    };
    matches.set(id, m);
    playerMatch.set(hostId, id);
    setTimeout(() => matches.delete(id), 3 * 60 * 60 * 1000);
    return m;
}
export function getMatch(id) { return matches.get(id) ?? null; }
export function getMatchByCode(code) { for (const m of matches.values())
    if (m.code === code && m.status !== 'finished')
        return m; return null; }
export function getMatchForSocket(socketId) { for (const m of matches.values())
    if (m.players.some(p => p.socketId === socketId))
        return m; return null; }
export function listMatches() {
    return [...matches.values()].filter(m => m.status === 'waiting').map(m => ({
        id: m.id, code: m.code, hostName: m.players.find(p => p.userId === m.hostId)?.nickname ?? '?',
        playerCount: m.players.length, maxPlayers: m.maxPlayers, status: m.status,
    }));
}
export function joinMatch(matchId, userId, socketId, nickname) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    const ex = m.players.find(p => p.userId === userId);
    if (ex) {
        ex.socketId = socketId;
        ex.connected = true;
        playerMatch.set(userId, matchId);
        return { match: m, isNew: false };
    }
    if (m.status !== 'waiting' || m.players.length >= m.maxPlayers)
        return null;
    m.players.push({ userId, socketId, nickname, seat: m.players.length, connected: true, score: 0, isSpy: false, role: null, vote: null, accusationUsed: false });
    playerMatch.set(userId, matchId);
    return { match: m, isNew: true };
}
export function leaveMatch(matchId, userId) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    playerMatch.delete(userId);
    if (m.status === 'waiting' || m.status === 'finished') {
        m.players = m.players.filter(p => p.userId !== userId);
        m.players.forEach((p, i) => { p.seat = i; });
        if (m.players.length === 0) {
            matches.delete(matchId);
            return null;
        }
        if (m.hostId === userId)
            m.hostId = m.players[0].userId;
        return m;
    }
    const p = m.players.find(pl => pl.userId === userId);
    if (p)
        p.connected = false;
    return m;
}
export function disconnectSocket(socketId) {
    const m = getMatchForSocket(socketId);
    if (!m)
        return null;
    const p = m.players.find(pl => pl.socketId === socketId);
    if (m.status === 'waiting' || m.status === 'finished') {
        leaveMatch(m.id, p.userId);
        return m.id;
    }
    p.connected = false;
    // A live accusation may need cleanup: cancel if a principal dropped, else
    // the remaining jurors might now be unanimous.
    if (m.accusation) {
        if (m.accusation.accuserId === p.userId || m.accusation.targetId === p.userId)
            cancelAccusation(m);
        else
            maybeResolveAccusation(m);
    }
    // Mid-vote drop: the rest may now all have voted.
    if (m.status === 'voting')
        maybeTally(m);
    return m.id;
}
/** Explicit leave during active play — end the match for everyone. */
export function dissolveMatch(matchId, leaverId) {
    const m = matches.get(matchId);
    if (!m)
        return null;
    playerMatch.delete(leaverId);
    m.players = m.players.filter(p => p.userId !== leaverId);
    if (m.players.length === 0) {
        matches.delete(matchId);
        return null;
    }
    if (m.hostId === leaverId)
        m.hostId = m.players[0].userId;
    m.status = 'finished';
    m.dissolved = true;
    m.accusation = null;
    m.pausedMsLeft = null;
    m.reveal = null;
    return m;
}
function setupRound(m) {
    // Fresh location, never repeated within the match while options remain.
    let pool = SPYFALL_LOCATIONS.map((_, i) => i).filter(i => !m.usedLocationIdxs.includes(i));
    if (pool.length === 0) {
        m.usedLocationIdxs = [];
        pool = SPYFALL_LOCATIONS.map((_, i) => i);
    }
    const locIdx = pool[Math.floor(Math.random() * pool.length)];
    m.locationIdx = locIdx;
    m.usedLocationIdxs.push(locIdx);
    const active = m.players.filter(p => p.connected);
    const spy = active[Math.floor(Math.random() * active.length)];
    const roles = shuffle(SPYFALL_LOCATIONS[locIdx].roles);
    let r = 0;
    for (const p of m.players) {
        p.vote = null;
        p.accusationUsed = false;
        p.isSpy = p.userId === spy.userId;
        p.role = p.isSpy ? null : roles[r++ % roles.length];
    }
    m.status = 'play';
    m.endsAt = Date.now() + m.settings.discussSeconds * 1000;
    m.accusation = null;
    m.pausedMsLeft = null;
    m.reveal = null;
}
export function startMatch(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.status !== 'waiting')
        return null;
    if (m.players.length < 3)
        return null;
    m.round = 1;
    for (const p of m.players)
        p.score = 0;
    m.winnerIds = [];
    m.usedLocationIdxs = [];
    setupRound(m);
    return m;
}
/** Host cuts discussion short, or the timer fires (byUserId=null). */
export function beginVoting(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'play' || m.accusation)
        return null;
    if (byUserId !== null && m.hostId !== byUserId)
        return null;
    m.status = 'voting';
    for (const p of m.players)
        p.vote = null;
    return m;
}
function finishRound(m, outcome, extra) {
    const spy = m.players.find(p => p.isSpy);
    const loc = SPYFALL_LOCATIONS[m.locationIdx];
    if (outcome === 'spy_caught' || outcome === 'spy_wrong') {
        for (const p of m.players)
            if (!p.isSpy)
                p.score += 1;
    }
    else if (outcome === 'spy_escaped' || outcome === 'wrong_accused') {
        spy.score += 2;
    }
    else if (outcome === 'spy_guessed') {
        spy.score += 3;
    }
    m.reveal = {
        spyId: spy.userId, spyName: spy.nickname,
        location: loc.name, locationEmoji: loc.emoji,
        outcome,
        accusedName: extra.accusedName ?? null,
        guessedLocation: extra.guessedLocation ?? null,
        votes: m.players.filter(p => p.vote).map(p => ({
            nickname: p.nickname,
            targetName: m.players.find(t => t.userId === p.vote)?.nickname ?? '?',
        })),
    };
    m.status = 'reveal';
}
function maybeTally(m) {
    if (m.status !== 'voting')
        return;
    const voters = m.players.filter(p => p.connected);
    if (voters.length === 0 || voters.some(p => !p.vote))
        return;
    const counts = new Map();
    for (const p of m.players)
        if (p.vote)
            counts.set(p.vote, (counts.get(p.vote) ?? 0) + 1);
    let best = null;
    let bestN = 0;
    let tie = false;
    for (const [target, n] of counts) {
        if (n > bestN) {
            best = target;
            bestN = n;
            tie = false;
        }
        else if (n === bestN)
            tie = true;
    }
    if (tie || !best) {
        finishRound(m, 'spy_escaped', {});
        return;
    }
    const accused = m.players.find(p => p.userId === best);
    if (accused.isSpy)
        finishRound(m, 'spy_caught', { accusedName: accused.nickname });
    else
        finishRound(m, 'wrong_accused', { accusedName: accused.nickname });
}
export function castVote(matchId, byUserId, targetId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'voting')
        return null;
    const voter = m.players.find(p => p.userId === byUserId);
    const target = m.players.find(p => p.userId === targetId);
    if (!voter || !target || voter.userId === target.userId)
        return null;
    voter.vote = targetId;
    maybeTally(m);
    return m;
}
/** The spy stops the round and names the location. Allowed during play or voting. */
export function spyGuess(matchId, byUserId, locationName) {
    const m = matches.get(matchId);
    if (!m || (m.status !== 'play' && m.status !== 'voting'))
        return null;
    if (m.accusation)
        return null; // resolve the live accusation first
    const p = m.players.find(pl => pl.userId === byUserId);
    if (!p || !p.isSpy)
        return null;
    const actual = SPYFALL_LOCATIONS[m.locationIdx].name;
    if (locationName === actual)
        finishRound(m, 'spy_guessed', { guessedLocation: locationName });
    else
        finishRound(m, 'spy_wrong', { guessedLocation: locationName });
    return m;
}
// ── Mid-round accusations (classic Spyfall) ────────────────────────────────────
/** Connected players who must weigh in on an accusation (everyone but the two principals). */
function accusationJurors(m) {
    const a = m.accusation;
    return m.players.filter(p => p.connected && p.userId !== a.accuserId && p.userId !== a.targetId).map(p => p.userId);
}
/** Any player (once per round) accuses another of being the spy, pausing the clock. */
export function startAccusation(matchId, byUserId, targetId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'play' || m.accusation)
        return null;
    const accuser = m.players.find(p => p.userId === byUserId);
    const target = m.players.find(p => p.userId === targetId);
    if (!accuser || !target || accuser.userId === target.userId)
        return null;
    if (!accuser.connected || !target.connected)
        return null;
    if (accuser.accusationUsed)
        return null;
    // Need at least one impartial juror, otherwise there is nobody to agree.
    const jurorCount = m.players.filter(p => p.connected && p.userId !== byUserId && p.userId !== targetId).length;
    if (jurorCount < 1)
        return null;
    m.pausedMsLeft = Math.max(0, m.endsAt - Date.now());
    m.accusation = {
        accuserId: accuser.userId, accuserName: accuser.nickname,
        targetId: target.userId, targetName: target.nickname,
        agree: [], disagree: [],
        deadline: Date.now() + ACCUSE_SECONDS * 1000,
    };
    return m;
}
/** A juror agrees to / refuses the pending accusation. Auto-resolves when all have answered. */
export function respondAccusation(matchId, byUserId, agree) {
    const m = matches.get(matchId);
    if (!m || !m.accusation)
        return null;
    const a = m.accusation;
    if (byUserId === a.accuserId || byUserId === a.targetId)
        return null; // principals don't vote
    const p = m.players.find(pl => pl.userId === byUserId);
    if (!p || !p.connected)
        return null;
    a.agree = a.agree.filter(id => id !== byUserId);
    a.disagree = a.disagree.filter(id => id !== byUserId);
    if (agree)
        a.agree.push(byUserId);
    else
        a.disagree.push(byUserId);
    maybeResolveAccusation(m);
    return m;
}
function maybeResolveAccusation(m) {
    const a = m.accusation;
    if (!a)
        return;
    const js = accusationJurors(m);
    const answered = js.filter(id => a.agree.includes(id) || a.disagree.includes(id));
    if (answered.length < js.length)
        return; // still waiting on someone
    resolveAccusation(m);
}
/** Resume discussion, discarding the pending accusation (a "no", a timeout, or a principal leaving). */
function cancelAccusation(m) {
    const accuser = m.accusation ? m.players.find(p => p.userId === m.accusation.accuserId) : null;
    if (accuser)
        accuser.accusationUsed = true;
    m.endsAt = Date.now() + (m.pausedMsLeft ?? 0);
    m.pausedMsLeft = null;
    m.accusation = null;
}
function resolveAccusation(m) {
    const a = m.accusation;
    if (!a)
        return;
    const js = accusationJurors(m);
    const unanimous = js.length > 0 && js.every(id => a.agree.includes(id));
    const accuser = m.players.find(p => p.userId === a.accuserId);
    if (accuser)
        accuser.accusationUsed = true;
    if (!unanimous) {
        cancelAccusation(m);
        return;
    }
    const target = m.players.find(p => p.userId === a.targetId);
    m.accusation = null;
    m.pausedMsLeft = null;
    if (target.isSpy)
        finishRound(m, 'spy_caught', { accusedName: target.nickname });
    else
        finishRound(m, 'wrong_accused', { accusedName: target.nickname });
}
/** Deadline lapsed: any silent juror counts as a refusal, so the accusation fails. */
export function forceResolveAccusation(matchId) {
    const m = matches.get(matchId);
    if (!m || !m.accusation)
        return null;
    const a = m.accusation;
    for (const id of accusationJurors(m)) {
        if (!a.agree.includes(id) && !a.disagree.includes(id))
            a.disagree.push(id);
    }
    resolveAccusation(m);
    return m;
}
/** Host advances from reveal: next round, or final results after the last one. */
export function nextRound(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'reveal' || m.hostId !== byUserId)
        return null;
    if (m.round >= m.settings.rounds || m.players.filter(p => p.connected).length < 3) {
        const top = Math.max(...m.players.map(p => p.score));
        m.winnerIds = m.players.filter(p => p.score === top).map(p => p.userId);
        m.status = 'finished';
        return m;
    }
    m.round++;
    setupRound(m);
    return m;
}
export function rematch(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'finished' || m.hostId !== byUserId)
        return null;
    m.players = m.players.filter(p => p.connected);
    m.players.forEach((p, i) => { p.seat = i; p.score = 0; p.isSpy = false; p.role = null; p.vote = null; p.accusationUsed = false; });
    if (m.players.length === 0) {
        matches.delete(matchId);
        return null;
    }
    if (!m.players.some(p => p.userId === m.hostId))
        m.hostId = m.players[0].userId;
    m.status = 'waiting';
    m.round = 0;
    m.locationIdx = null;
    m.usedLocationIdxs = [];
    m.endsAt = 0;
    m.accusation = null;
    m.pausedMsLeft = null;
    m.reveal = null;
    m.winnerIds = [];
    m.dissolved = false;
    return m;
}
export function getSafeState(m, viewerUserId) {
    const viewer = m.players.find(p => p.userId === viewerUserId) ?? null;
    const inRound = m.status === 'play' || m.status === 'voting';
    const amSpy = !!(viewer && inRound && viewer.isSpy);
    const loc = inRound && m.locationIdx !== null ? SPYFALL_LOCATIONS[m.locationIdx] : null;
    const a = m.accusation;
    const accusationView = a ? {
        accuserId: a.accuserId, accuserName: a.accuserName,
        targetId: a.targetId, targetName: a.targetName,
        agreeIds: [...a.agree], disagreeIds: [...a.disagree],
        jurorCount: m.players.filter(p => p.connected && p.userId !== a.accuserId && p.userId !== a.targetId).length,
        deadline: a.deadline,
    } : null;
    return {
        id: m.id, code: m.code, status: m.status, hostId: m.hostId, maxPlayers: m.maxPlayers,
        players: m.players.map(p => ({ userId: p.userId, socketId: p.socketId, nickname: p.nickname, seat: p.seat, connected: p.connected, score: p.score, hasVoted: p.vote !== null })),
        settings: m.settings,
        round: m.round,
        endsAt: m.endsAt,
        pausedMsLeft: m.pausedMsLeft,
        locations: SPYFALL_LOCATION_NAMES,
        amSpy,
        myLocation: viewer && loc && !viewer.isSpy ? loc.name : null,
        myLocationEmoji: viewer && loc && !viewer.isSpy ? loc.emoji : null,
        myRole: viewer && inRound && !viewer.isSpy ? viewer.role : null,
        myVote: viewer?.vote ?? null,
        accusation: accusationView,
        myAccusationUsed: viewer?.accusationUsed ?? false,
        reveal: (m.status === 'reveal' || m.status === 'finished') ? m.reveal : null,
        winnerIds: m.winnerIds,
        dissolved: m.dissolved,
        myUserId: viewerUserId,
    };
}
//# sourceMappingURL=spyfallService.js.map