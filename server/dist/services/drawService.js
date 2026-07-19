/**
 * დახაზე & გამოიცანი (Draw & Guess / Skribbl) — one player draws a secret
 * word while others guess in chat; faster correct guesses score more. Rotates
 * the drawer; most points after N rounds wins. Stroke relay + turn timers live
 * in the socket layer (draw.ts). Pure logic here; UNO/Blackout conventions.
 */
import { randomBytes } from 'crypto';
import { DRAW_WORDS } from './drawWords.js';
const matches = new Map();
const playerMatch = new Map();
const code6 = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join(''); };
function shuffle(a) { const r = [...a]; for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
} return r; }
const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, '');
export function createMatch(hostId, socketId, nickname, opts) {
    const id = randomBytes(8).toString('hex');
    const m = {
        id, code: code6(), status: 'waiting', hostId,
        maxPlayers: Math.min(12, Math.max(2, Number(opts.maxPlayers ?? 8))),
        players: [{ userId: hostId, socketId, nickname, seat: 0, connected: true, score: 0, guessedThisTurn: false, roundScore: 0 }],
        settings: { rounds: Math.min(8, Math.max(1, Number(opts.rounds ?? 3))), drawSeconds: Math.min(120, Math.max(30, Number(opts.drawSeconds ?? 70))) },
        deck: shuffle(DRAW_WORDS), deckPos: 0,
        turnOrder: [], turnIdx: 0, round: 1,
        drawerId: null, word: null, wordChoices: [], endsAt: 0, correctThisTurn: 0, segs: [], lastWord: null, winner: null, dissolved: false, createdAt: Date.now(),
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
    return [...matches.values()].filter(m => m.status === 'waiting').map(m => ({ id: m.id, code: m.code, hostName: m.players.find(p => p.userId === m.hostId)?.nickname ?? '?', playerCount: m.players.length, maxPlayers: m.maxPlayers, status: m.status }));
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
    m.players.push({ userId, socketId, nickname, seat: m.players.length, connected: true, score: 0, guessedThisTurn: false, roundScore: 0 });
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
    if (m.drawerId === userId)
        m.endsAt = Date.now(); // drawer bailed → end turn
    return m;
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
    m.winner = null;
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
    if (m.drawerId === p.userId)
        m.endsAt = Date.now();
    return m.id;
}
function threeWords(m) {
    const out = [];
    for (let i = 0; i < 3; i++) {
        if (m.deckPos >= m.deck.length) {
            m.deck = shuffle(DRAW_WORDS);
            m.deckPos = 0;
        }
        out.push(m.deck[m.deckPos++]);
    }
    return out;
}
export function startMatch(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.status !== 'waiting' || m.players.length < 2)
        return null;
    m.turnOrder = shuffle(m.players.map(p => p.userId));
    m.turnIdx = 0;
    m.round = 1;
    m.players.forEach(p => { p.score = 0; });
    beginChoosing(m);
    return m;
}
/** Enter the word-choice phase for the current turn's drawer. */
export function beginChoosing(m) {
    // Skip disconnected drawers.
    let guard = 0;
    while (guard++ < m.turnOrder.length) {
        const uid = m.turnOrder[m.turnIdx % m.turnOrder.length];
        const p = m.players.find(pl => pl.userId === uid);
        if (p && p.connected)
            break;
        m.turnIdx++;
    }
    m.drawerId = m.turnOrder[m.turnIdx % m.turnOrder.length];
    m.status = 'choosing';
    m.word = null;
    m.wordChoices = threeWords(m);
    m.segs = [];
    m.correctThisTurn = 0;
    m.players.forEach(p => { p.guessedThisTurn = false; });
    m.endsAt = Date.now() + 15000; // auto-pick fallback
}
export function chooseWord(matchId, byUserId, word) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'choosing' || m.drawerId !== byUserId)
        return null;
    const w = m.wordChoices.includes(word) ? word : m.wordChoices[0];
    m.word = w;
    m.wordChoices = [];
    m.status = 'drawing';
    m.endsAt = Date.now() + m.settings.drawSeconds * 1000;
    return m;
}
/** Auto-pick the first choice if the drawer dawdles. */
export function autoChoose(matchId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'choosing')
        return null;
    return chooseWord(matchId, m.drawerId, m.wordChoices[0]);
}
export function guess(matchId, userId, text) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'drawing')
        return null;
    const p = m.players.find(pl => pl.userId === userId);
    if (!p)
        return null;
    const clean = String(text ?? '').trim().slice(0, 60);
    if (!clean)
        return null;
    // Drawer / already-guessed players just chat (relayed, not scored).
    if (userId === m.drawerId || p.guessedThisTurn)
        return { kind: 'chat', nickname: p.nickname, text: clean };
    if (m.word && norm(clean) === norm(m.word)) {
        p.guessedThisTurn = true;
        const frac = Math.max(0, (m.endsAt - Date.now()) / (m.settings.drawSeconds * 1000));
        p.score += 60 + Math.round(frac * 90) + Math.max(0, 30 - m.correctThisTurn * 8); // speed + order bonus
        m.correctThisTurn++;
        const drawer = m.players.find(pl => pl.userId === m.drawerId);
        if (drawer)
            drawer.score += 35; // drawer rewarded per correct guess
        const guessers = m.players.filter(pl => pl.connected && pl.userId !== m.drawerId).length;
        return { kind: 'correct', nickname: p.nickname, allGuessed: m.correctThisTurn >= guessers };
    }
    return { kind: 'chat', nickname: p.nickname, text: clean };
}
/** Time up or everyone guessed → reveal, brief scoreboard, then advance. */
export function endTurn(matchId) {
    const m = matches.get(matchId);
    if (!m || (m.status !== 'drawing' && m.status !== 'choosing'))
        return null;
    m.lastWord = m.word ?? (m.wordChoices[0] ?? null);
    m.status = 'turnend';
    m.word = null;
    m.endsAt = Date.now() + 6000;
    return m;
}
export function nextTurn(matchId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'turnend')
        return null;
    m.turnIdx++;
    // A full cycle through turnOrder = one round.
    if (m.turnIdx % m.turnOrder.length === 0)
        m.round++;
    if (m.round > m.settings.rounds) {
        m.status = 'finished';
        let best = null;
        for (const p of m.players)
            if (!best || p.score > best.score)
                best = p;
        m.winner = best?.userId ?? null;
        m.drawerId = null;
        return m;
    }
    beginChoosing(m);
    return m;
}
export function rematch(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'finished' || m.hostId !== byUserId)
        return null;
    m.status = 'waiting';
    m.players = m.players.filter(p => p.connected);
    m.players.forEach((p, i) => { p.seat = i; p.score = 0; p.guessedThisTurn = false; });
    if (m.players.length === 0) {
        matches.delete(matchId);
        return null;
    }
    if (!m.players.some(p => p.userId === m.hostId))
        m.hostId = m.players[0].userId;
    m.turnOrder = [];
    m.turnIdx = 0;
    m.round = 1;
    m.drawerId = null;
    m.word = null;
    m.wordChoices = [];
    m.segs = [];
    m.lastWord = null;
    m.winner = null;
    m.dissolved = false;
    return m;
}
// Drawing ops (relayed by socket layer; accumulated for late joiners).
export function addSeg(matchId, byUserId, seg) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'drawing' || m.drawerId !== byUserId)
        return false;
    if (m.segs.length < 6000)
        m.segs.push(seg);
    return true;
}
export function clearCanvas(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'drawing' || m.drawerId !== byUserId)
        return false;
    m.segs = [];
    return true;
}
function maskFor(word) {
    if (!word)
        return null;
    return word.split('').map(ch => (ch === ' ' ? '  ' : '_')).join(' ') + ` (${word.replace(/\s/g, '').length})`;
}
export function getSafeState(m, viewerUserId) {
    const viewer = m.players.find(p => p.userId === viewerUserId) ?? null;
    const amDrawer = m.drawerId === viewerUserId;
    const drawer = m.drawerId ? m.players.find(p => p.userId === m.drawerId) : null;
    // Players who already guessed correctly may see the word too.
    const canSeeWord = amDrawer || (viewer?.guessedThisTurn ?? false);
    return {
        id: m.id, code: m.code, status: m.status, hostId: m.hostId, maxPlayers: m.maxPlayers,
        players: m.players.map(p => ({ userId: p.userId, nickname: p.nickname, seat: p.seat, connected: p.connected, score: p.score, guessedThisTurn: p.guessedThisTurn })),
        settings: m.settings, round: m.round, totalRounds: m.settings.rounds,
        drawerId: m.drawerId, drawerName: drawer?.nickname ?? null, amDrawer,
        myWord: canSeeWord ? m.word : null,
        myChoices: amDrawer && m.status === 'choosing' ? m.wordChoices : null,
        wordMask: m.status === 'drawing' ? maskFor(m.word) : null,
        revealedWord: m.status === 'turnend' ? m.lastWord : null,
        endsAt: m.endsAt,
        iGuessed: viewer?.guessedThisTurn ?? false,
        winnerId: m.winner,
        dissolved: m.dissolved,
        myUserId: viewerUserId,
    };
}
//# sourceMappingURL=drawService.js.map