/**
 * ალიასი (Alias / Taboo) — team word-guessing game. Two teams; on each turn a
 * describer from the active team explains words (out loud, via voice/chat)
 * while teammates guess. Describer marks ✓ (correct, +1) or → (skip, −1).
 * First team to the target score wins. Turn timing lives in the socket layer.
 *
 * Pure logic — no socket.io. Follows the UNO/Blackout service conventions:
 * in-memory Maps, reconnect-aware join, per-viewer safe state, 3h GC.
 */
import { randomBytes } from 'crypto';
import { ALIAS_WORDS } from './aliasWords.js';
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
        maxPlayers: Math.min(12, Math.max(2, Number(opts.maxPlayers ?? 8))),
        players: [{ userId: hostId, socketId, nickname, seat: 0, connected: true, team: 0 }],
        settings: {
            targetScore: Math.min(100, Math.max(10, Number(opts.targetScore ?? 30))),
            roundSeconds: Math.min(120, Math.max(30, Number(opts.roundSeconds ?? 60))),
        },
        scores: [0, 0], deck: shuffle(ALIAS_WORDS), deckPos: 0,
        describerIdx: [0, 0], activeTeam: 0, turn: null, currentWord: null, winner: null, dissolved: false, round: 0, createdAt: Date.now(),
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
    // Auto-balance onto the smaller team.
    const t0 = m.players.filter(p => p.team === 0).length, t1 = m.players.filter(p => p.team === 1).length;
    m.players.push({ userId, socketId, nickname, seat: m.players.length, connected: true, team: t0 <= t1 ? 0 : 1 });
    playerMatch.set(userId, matchId);
    return { match: m, isNew: true };
}
export function switchTeam(matchId, userId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'waiting')
        return null;
    const p = m.players.find(pl => pl.userId === userId);
    if (!p)
        return null;
    p.team = p.team === 0 ? 1 : 0;
    return m;
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
    // If the describer left, end the turn early.
    if (m.turn && m.turn.describerId === userId)
        m.turn.endsAt = Date.now();
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
    m.turn = null;
    m.currentWord = null;
    return m;
}
function drawWord(m) {
    if (m.deckPos >= m.deck.length) {
        m.deck = shuffle(ALIAS_WORDS);
        m.deckPos = 0;
    }
    return m.deck[m.deckPos++];
}
export function startMatch(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.status !== 'waiting')
        return null;
    if (m.players.filter(p => p.team === 0).length < 1 || m.players.filter(p => p.team === 1).length < 1)
        return null;
    if (m.players.length < 2)
        return null;
    m.status = 'play';
    m.scores = [0, 0];
    m.round = 1;
    m.activeTeam = 0;
    m.describerIdx = [0, 0];
    m.turn = null;
    m.currentWord = null;
    m.winner = null;
    return m;
}
/** The next describer of the active team starts their timed turn. */
export function startTurn(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'play' || m.turn)
        return null;
    const team = m.activeTeam;
    const teamPlayers = m.players.filter(p => p.team === team && p.connected);
    if (teamPlayers.length === 0)
        return null;
    const describer = teamPlayers[m.describerIdx[team] % teamPlayers.length];
    // Only the designated describer may start.
    if (describer.userId !== byUserId)
        return null;
    m.turn = { team, describerId: describer.userId, endsAt: Date.now() + m.settings.roundSeconds * 1000, correct: 0, skipped: 0, log: [] };
    m.currentWord = drawWord(m);
    return m;
}
/** Describer marks the current word. got=true → +1, got=false → skip (−1, min 0). */
export function markWord(matchId, byUserId, got) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'play' || !m.turn || m.turn.describerId !== byUserId)
        return null;
    if (m.turn.endsAt <= Date.now())
        return null;
    const word = m.currentWord ?? '';
    m.turn.log.push({ word, got });
    if (got) {
        m.turn.correct++;
        m.scores[m.turn.team]++;
    }
    else {
        m.turn.skipped++;
        m.scores[m.turn.team] = Math.max(0, m.scores[m.turn.team] - 1);
    }
    if (m.scores[m.turn.team] >= m.settings.targetScore) {
        m.winner = m.turn.team;
        m.status = 'finished';
        m.currentWord = null;
        return m;
    }
    m.currentWord = drawWord(m);
    return m;
}
/** Called by the turn timer when time is up. Advances to the other team. */
export function endTurn(matchId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'play' || !m.turn)
        return null;
    m.describerIdx[m.turn.team]++;
    m._lastTurnLog = m.turn.log;
    m.turn = null;
    m.currentWord = null;
    m.activeTeam = m.activeTeam === 0 ? 1 : 0;
    m.round++;
    return m;
}
export function rematch(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'finished' || m.hostId !== byUserId)
        return null;
    m.status = 'waiting';
    m.players = m.players.filter(p => p.connected);
    m.players.forEach((p, i) => { p.seat = i; });
    if (m.players.length === 0) {
        matches.delete(matchId);
        return null;
    }
    if (!m.players.some(p => p.userId === m.hostId))
        m.hostId = m.players[0].userId;
    m.scores = [0, 0];
    m.deck = shuffle(ALIAS_WORDS);
    m.deckPos = 0;
    m.describerIdx = [0, 0];
    m.activeTeam = 0;
    m.turn = null;
    m.currentWord = null;
    m.winner = null;
    m.dissolved = false;
    m.round = 0;
    m._lastTurnLog = null;
    return m;
}
export function getSafeState(m, viewerUserId) {
    const viewer = m.players.find(p => p.userId === viewerUserId) ?? null;
    const amDescriber = !!(m.turn && m.turn.describerId === viewerUserId);
    const describerName = m.turn ? (m.players.find(p => p.userId === m.turn.describerId)?.nickname ?? '?') : '';
    let nextDescriberId = null;
    if (m.status === 'play' && !m.turn) {
        const tp = m.players.filter(p => p.team === m.activeTeam && p.connected);
        if (tp.length)
            nextDescriberId = tp[m.describerIdx[m.activeTeam] % tp.length].userId;
    }
    return {
        id: m.id, code: m.code, status: m.status, hostId: m.hostId, maxPlayers: m.maxPlayers,
        players: m.players.map(p => ({ userId: p.userId, nickname: p.nickname, seat: p.seat, connected: p.connected, team: p.team })),
        settings: m.settings, scores: m.scores, activeTeam: m.activeTeam,
        turn: m.turn ? { team: m.turn.team, describerId: m.turn.describerId, describerName, endsAt: m.turn.endsAt, correct: m.turn.correct, skipped: m.turn.skipped } : null,
        nextDescriberId,
        lastTurnLog: m._lastTurnLog ?? null,
        myWord: amDescriber ? m.currentWord : null,
        amDescriber,
        myTeam: viewer?.team ?? null,
        winner: m.winner,
        dissolved: m.dissolved,
        myUserId: viewerUserId,
        round: m.round,
    };
}
//# sourceMappingURL=aliasService.js.map