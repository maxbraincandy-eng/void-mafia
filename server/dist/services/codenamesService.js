/**
 * Codenames — two teams, a 5×5 word grid secretly coloured (9/8 team words,
 * 7 neutral, 1 assassin). Each team's spymaster (who alone sees the key) gives
 * a one-word clue + number; their operatives tap words. Reveal your own colour
 * to keep going, anything else ends the turn; the assassin loses instantly.
 * First team to reveal all its words wins. Untimed. UNO/Blackout conventions.
 */
import { randomBytes } from 'crypto';
import { CODENAMES_WORDS } from './codenamesWords.js';
const matches = new Map();
const playerMatch = new Map();
const code6 = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join(''); };
function shuffle(a) { const r = [...a]; for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
} return r; }
export function createMatch(hostId, socketId, nickname, opts) {
    const id = randomBytes(8).toString('hex');
    const m = {
        id, code: code6(), status: 'waiting', hostId,
        maxPlayers: Math.min(16, Math.max(4, Number(opts.maxPlayers ?? 8))),
        players: [{ userId: hostId, socketId, nickname, seat: 0, connected: true, team: 0, isSpymaster: false }],
        board: [], startingTeam: 0, turnTeam: 0, clue: null, guessesLeft: 0, remaining: [0, 0], winner: null, assassinFired: false, dissolved: false, log: [], createdAt: Date.now(),
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
export function listMatches() { return [...matches.values()].filter(m => m.status === 'waiting').map(m => ({ id: m.id, code: m.code, hostName: m.players.find(p => p.userId === m.hostId)?.nickname ?? '?', playerCount: m.players.length, maxPlayers: m.maxPlayers, status: m.status })); }
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
    const t0 = m.players.filter(p => p.team === 0).length, t1 = m.players.filter(p => p.team === 1).length;
    m.players.push({ userId, socketId, nickname, seat: m.players.length, connected: true, team: t0 <= t1 ? 0 : 1, isSpymaster: false });
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
    p.isSpymaster = false;
    return m;
}
export function setSpymaster(matchId, userId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'waiting')
        return null;
    const p = m.players.find(pl => pl.userId === userId);
    if (!p)
        return null;
    // One spymaster per team — clear teammates', toggle self.
    const wasIt = p.isSpymaster;
    m.players.filter(pl => pl.team === p.team).forEach(pl => { pl.isSpymaster = false; });
    p.isSpymaster = !wasIt;
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
    m.winner = null;
    return m;
}
function buildBoard(startingTeam) {
    const words = shuffle(CODENAMES_WORDS).slice(0, 25);
    const other = startingTeam === 0 ? 1 : 0;
    const colors = [];
    for (let i = 0; i < 9; i++)
        colors.push(startingTeam);
    for (let i = 0; i < 8; i++)
        colors.push(other);
    for (let i = 0; i < 7; i++)
        colors.push(2);
    colors.push(3);
    const shuffled = shuffle(colors);
    const board = words.map((word, i) => ({ word, color: shuffled[i], revealed: false }));
    const remaining = [0, 0];
    remaining[startingTeam] = 9;
    remaining[other] = 8;
    return { board, remaining };
}
export function startMatch(matchId, byUserId) {
    const m = matches.get(matchId);
    if (!m || m.hostId !== byUserId || m.status !== 'waiting')
        return null;
    for (const team of [0, 1]) {
        const tp = m.players.filter(p => p.team === team);
        if (tp.length < 2)
            return null; // need spymaster + ≥1 operative
        if (!tp.some(p => p.isSpymaster))
            return null; // need a spymaster
    }
    m.startingTeam = Math.random() < 0.5 ? 0 : 1;
    const b = buildBoard(m.startingTeam);
    m.board = b.board;
    m.remaining = b.remaining;
    m.turnTeam = m.startingTeam;
    m.clue = null;
    m.guessesLeft = 0;
    m.winner = null;
    m.assassinFired = false;
    m.log = [];
    m.status = 'play';
    return m;
}
export function giveClue(matchId, userId, word, number) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'play' || m.clue)
        return null;
    const p = m.players.find(pl => pl.userId === userId);
    if (!p || p.team !== m.turnTeam || !p.isSpymaster)
        return null;
    const w = String(word ?? '').trim().slice(0, 24);
    if (!w)
        return null;
    const n = Math.min(9, Math.max(1, Math.floor(Number(number) || 1)));
    m.clue = { word: w, number: n };
    m.guessesLeft = n + 1;
    m.log.push({ kind: 'clue', team: m.turnTeam, text: `${w} · ${n}` });
    return m;
}
function endTurn(m) {
    m.turnTeam = m.turnTeam === 0 ? 1 : 0;
    m.clue = null;
    m.guessesLeft = 0;
}
export function guessCard(matchId, userId, index) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'play' || !m.clue || m.guessesLeft <= 0)
        return null;
    const p = m.players.find(pl => pl.userId === userId);
    if (!p || p.team !== m.turnTeam || p.isSpymaster)
        return null; // operatives of the active team only
    const card = m.board[index];
    if (!card || card.revealed)
        return null;
    card.revealed = true;
    m.log.push({ kind: 'guess', team: m.turnTeam, text: card.word });
    if (card.color === 3) { // assassin → active team loses
        m.assassinFired = true;
        m.winner = m.turnTeam === 0 ? 1 : 0;
        m.status = 'finished';
        return m;
    }
    if (card.color === 2) {
        endTurn(m);
        return m;
    } // neutral → turn ends
    // A team card was revealed.
    const owner = card.color;
    m.remaining[owner] = Math.max(0, m.remaining[owner] - 1);
    if (m.remaining[owner] === 0) {
        m.winner = owner;
        m.status = 'finished';
        return m;
    }
    if (owner === m.turnTeam) {
        m.guessesLeft -= 1;
        if (m.guessesLeft <= 0)
            endTurn(m);
    }
    else {
        endTurn(m); // revealed the opponent's word → free reveal, turn ends
    }
    return m;
}
export function passTurn(matchId, userId) {
    const m = matches.get(matchId);
    if (!m || m.status !== 'play' || !m.clue)
        return null;
    const p = m.players.find(pl => pl.userId === userId);
    if (!p || p.team !== m.turnTeam || p.isSpymaster)
        return null;
    m.log.push({ kind: 'pass', team: m.turnTeam, text: 'გადაცემა' });
    endTurn(m);
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
    m.board = [];
    m.clue = null;
    m.guessesLeft = 0;
    m.remaining = [0, 0];
    m.winner = null;
    m.assassinFired = false;
    m.dissolved = false;
    m.log = [];
    return m;
}
export function getSafeState(m, viewerUserId) {
    const viewer = m.players.find(p => p.userId === viewerUserId) ?? null;
    const sees = !!viewer?.isSpymaster || m.status === 'finished';
    return {
        id: m.id, code: m.code, status: m.status, hostId: m.hostId, maxPlayers: m.maxPlayers,
        players: m.players.map(p => ({ userId: p.userId, nickname: p.nickname, seat: p.seat, connected: p.connected, team: p.team, isSpymaster: p.isSpymaster })),
        board: m.board.map(c => ({ word: c.word, revealed: c.revealed, color: (sees || c.revealed) ? c.color : null })),
        startingTeam: m.startingTeam, turnTeam: m.turnTeam, clue: m.clue, guessesLeft: m.guessesLeft, remaining: m.remaining,
        winner: m.winner, assassinFired: m.assassinFired, dissolved: m.dissolved, log: m.log.slice(-30),
        myTeam: viewer?.team ?? null, amSpymaster: !!viewer?.isSpymaster, myUserId: viewerUserId,
    };
}
//# sourceMappingURL=codenamesService.js.map