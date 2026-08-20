/**
 * Ludo game service — 2-4 players (Red, Blue, Green, Yellow), 4 pieces each.
 * Turn flow: roll dice → pick piece to move → capture → win check.
 * Rolling 6 grants an extra roll (up to 3 consecutive 6s before forfeit).
 */
import { randomBytes } from 'crypto';
export const PLAYER_ORDER = ['red', 'blue', 'green', 'yellow'];
export const COLOR_OFFSETS = { red: 0, blue: 26, green: 13, yellow: 39 };
// ── Board constants ────────────────────────────────────────────────────
const TRACK_LEN = 52;
const HOME_START = 52; // positions 52-56 = home column cells
const HOME_END = 56;
export const WIN_POS = 57; // piece finished
// Absolute track positions that are safe (no capture)
export const SAFE_ABS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
// Track cells: TRACK_CELLS[absIdx] = [row, col] on 15×15 grid
export const TRACK_CELLS = [
    [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
    [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
    [7, 0], [6, 0],
    [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
    [5, 6], [4, 6], [3, 6], [2, 6], [1, 6],
    [0, 6], [0, 7], [0, 8],
    [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
    [6, 8],
    [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
    [7, 14], [8, 14],
    [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
    [9, 8], [10, 8], [11, 8], [12, 8], [13, 8],
    [14, 8], [14, 7],
];
export const RED_HOME_CELLS = [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]];
export const BLUE_HOME_CELLS = [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]];
export const GREEN_HOME_CELLS = [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]];
export const YELLOW_HOME_CELLS = [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]];
export const RED_YARD_CELLS = [[10, 1], [10, 3], [12, 1], [12, 3]];
export const BLUE_YARD_CELLS = [[2, 10], [2, 12], [4, 10], [4, 12]];
export const GREEN_YARD_CELLS = [[10, 10], [10, 12], [12, 10], [12, 12]];
export const YELLOW_YARD_CELLS = [[2, 1], [2, 3], [4, 1], [4, 3]];
export const CENTER_CELL = [7, 7];
// ── In-memory store ────────────────────────────────────────────────────
const matchStore = new Map();
const socketIndex = new Map(); // socketId → matchId
function genCode() {
    return 'LD-' + randomBytes(2).toString('hex').toUpperCase();
}
function genId() {
    return randomBytes(8).toString('hex');
}
function makePieces() {
    return [0, 1, 2, 3].map(id => ({ id, pos: -1 }));
}
// ── Helpers ────────────────────────────────────────────────────────────
function relToAbs(relPos, color) {
    return (relPos + COLOR_OFFSETS[color]) % TRACK_LEN;
}
// Returns new position if move is valid, null if invalid (can't move or overshoot).
function calcNewPos(piece, roll) {
    if (piece.pos === WIN_POS)
        return null;
    if (piece.pos === -1)
        return roll === 6 ? 0 : null;
    const np = piece.pos + roll;
    return np > WIN_POS ? null : np;
}
function getMovablePieceIds(side, roll) {
    return side.pieces.filter(p => calcNewPos(p, roll) !== null).map(p => p.id);
}
function resetDice(match) {
    match.diceRoll = null;
    match.diceRolled = false;
    match.movablePieceIds = [];
}
function nextTurn(match) {
    const order = match.playerOrder;
    const idx = order.indexOf(match.currentTurn);
    match.currentTurn = order[(idx + 1) % order.length];
    match.consecutiveSixes = 0;
    resetDice(match);
}
function buildPlayerOrder(players) {
    return PLAYER_ORDER.filter(c => players[c] !== null);
}
// ── Public API ─────────────────────────────────────────────────────────
export function createMatch(player, maxPlayers = 2) {
    const id = genId();
    const code = genCode();
    const match = {
        id, code,
        status: 'waiting',
        maxPlayers,
        players: {
            red: { name: player.name, profileId: player.profileId, socketId: player.socketId, pieces: makePieces() },
            blue: null,
            green: null,
            yellow: null,
        },
        playerOrder: ['red'],
        currentTurn: 'red',
        diceRoll: null,
        diceRolled: false,
        movablePieceIds: [],
        consecutiveSixes: 0,
        winnerColor: null,
        chat: [],
        spectatorSocketIds: [],
        createdAt: Date.now(),
    };
    matchStore.set(id, match);
    socketIndex.set(player.socketId, id);
    return match;
}
export function getMatch(id) {
    return matchStore.get(id) ?? null;
}
export function getMatchByCode(code) {
    for (const m of matchStore.values())
        if (m.code === code)
            return m;
    return null;
}
export function getMatchForSocket(socketId) {
    const id = socketIndex.get(socketId);
    return id ? (matchStore.get(id) ?? null) : null;
}
export function getOpenMatches() {
    const now = Date.now();
    return [...matchStore.values()]
        .filter(m => m.status !== 'finished' && now - m.createdAt < 3600000)
        .sort((a, b) => b.createdAt - a.createdAt);
}
export function joinMatch(matchId, player) {
    const match = matchStore.get(matchId);
    if (!match)
        throw new Error('Match not found.');
    if (match.status === 'finished')
        throw new Error('Match is finished.');
    // Re-join as existing player
    for (const color of PLAYER_ORDER) {
        const side = match.players[color];
        if (side && side.socketId === player.socketId) {
            return { role: color, match };
        }
    }
    // Join as next available color
    if (match.status === 'waiting') {
        const colorOrder = ['blue', 'green', 'yellow'];
        const currentCount = PLAYER_ORDER.filter(c => match.players[c] !== null).length;
        if (currentCount < match.maxPlayers) {
            const nextColor = colorOrder.find(c => match.players[c] === null);
            if (nextColor) {
                match.players[nextColor] = {
                    name: player.name,
                    profileId: player.profileId,
                    socketId: player.socketId,
                    pieces: makePieces(),
                };
                match.playerOrder = buildPlayerOrder(match.players);
                socketIndex.set(player.socketId, matchId);
                return { role: nextColor, match };
            }
        }
    }
    // Spectator
    if (!match.spectatorSocketIds.includes(player.socketId)) {
        match.spectatorSocketIds.push(player.socketId);
        socketIndex.set(player.socketId, matchId);
    }
    return { role: 'spectator', match };
}
export function startMatch(matchId, socketId) {
    const match = matchStore.get(matchId);
    if (!match)
        throw new Error('Match not found.');
    if (match.status !== 'waiting')
        throw new Error('Match is not in waiting state.');
    if (!match.players.red || match.players.red.socketId !== socketId)
        throw new Error('Only the host (Red) can start the match.');
    const playerCount = PLAYER_ORDER.filter(c => match.players[c] !== null).length;
    if (playerCount < 2)
        throw new Error('Need at least 2 players to start.');
    match.status = 'active';
    match.playerOrder = buildPlayerOrder(match.players);
    return match;
}
export function doRoll(matchId, socketId) {
    const match = matchStore.get(matchId);
    if (!match)
        throw new Error('Match not found.');
    if (match.status !== 'active')
        throw new Error('Game not active.');
    if (match.diceRolled)
        throw new Error('Already rolled this turn.');
    const currentColor = match.currentTurn;
    const side = match.players[currentColor];
    if (!side || side.socketId !== socketId)
        throw new Error('Not your turn.');
    const roll = Math.floor(Math.random() * 6) + 1;
    match.diceRoll = roll;
    match.diceRolled = true;
    if (roll === 6) {
        match.consecutiveSixes++;
        if (match.consecutiveSixes >= 3) {
            nextTurn(match);
            return { roll, movablePieceIds: [], autoEnded: true };
        }
    }
    else {
        match.consecutiveSixes = 0;
    }
    const movable = getMovablePieceIds(side, roll);
    match.movablePieceIds = movable;
    if (movable.length === 0) {
        nextTurn(match);
        return { roll, movablePieceIds: [], autoEnded: true };
    }
    return { roll, movablePieceIds: movable, autoEnded: false };
}
export function doMove(matchId, socketId, pieceId) {
    const match = matchStore.get(matchId);
    if (!match)
        throw new Error('Match not found.');
    if (match.status !== 'active')
        throw new Error('Game not active.');
    if (!match.diceRolled)
        throw new Error('Roll first.');
    const color = match.currentTurn;
    const side = match.players[color];
    if (!side || side.socketId !== socketId)
        throw new Error('Not your turn.');
    if (!match.movablePieceIds.includes(pieceId))
        throw new Error('Piece cannot move with this roll.');
    const piece = side.pieces.find(p => p.id === pieceId);
    if (!piece)
        throw new Error('Piece not found.');
    const roll = match.diceRoll;
    const np = calcNewPos(piece, roll);
    if (np === null)
        throw new Error('Invalid move.');
    piece.pos = np;
    match.movablePieceIds = [];
    // Check capture — only on main track, non-safe squares
    let captured = false;
    let capturedColor = null;
    let capturedPieceId = null;
    if (np >= 0 && np < HOME_START) {
        const myAbs = relToAbs(np, color);
        if (!SAFE_ABS.has(myAbs)) {
            for (const oppColor of PLAYER_ORDER) {
                if (oppColor === color)
                    continue;
                const opp = match.players[oppColor];
                if (!opp)
                    continue;
                for (const oppPiece of opp.pieces) {
                    if (oppPiece.pos >= 0 && oppPiece.pos < HOME_START) {
                        const oppAbs = relToAbs(oppPiece.pos, oppColor);
                        if (oppAbs === myAbs) {
                            oppPiece.pos = -1;
                            captured = true;
                            capturedColor = oppColor;
                            capturedPieceId = oppPiece.id;
                            break;
                        }
                    }
                }
                if (captured)
                    break;
            }
        }
    }
    const reached = np === WIN_POS;
    const allDone = side.pieces.every(p => p.pos === WIN_POS);
    let winnerColor = null;
    if (allDone) {
        match.winnerColor = color;
        match.status = 'finished';
        winnerColor = color;
        resetDice(match);
        return { captured, capturedColor, capturedPieceId, reached, turnEnded: true, winnerColor };
    }
    // Roll 6 and not forfeit: extra turn
    if (roll === 6 && match.consecutiveSixes < 3) {
        resetDice(match);
        return { captured, capturedColor, capturedPieceId, reached, turnEnded: false, winnerColor: null };
    }
    nextTurn(match);
    return { captured, capturedColor, capturedPieceId, reached, turnEnded: true, winnerColor: null };
}
export function doResign(matchId, socketId) {
    const match = matchStore.get(matchId);
    if (!match)
        throw new Error('Match not found.');
    if (match.status !== 'active')
        throw new Error('Game not active.');
    // Find which color this socket is
    const resignColor = PLAYER_ORDER.find(c => match.players[c]?.socketId === socketId);
    if (!resignColor)
        throw new Error('You are not a player.');
    // Remove from player order, if they were current turn advance turn
    match.playerOrder = match.playerOrder.filter(c => c !== resignColor);
    match.players[resignColor] = null;
    // Check if only one player left
    const remaining = match.playerOrder;
    if (remaining.length === 1) {
        match.winnerColor = remaining[0];
        match.status = 'finished';
        resetDice(match);
        return remaining[0];
    }
    // If it was this player's turn, advance
    if (match.currentTurn === resignColor) {
        const idx = PLAYER_ORDER.indexOf(resignColor);
        // find next in remaining
        let next = remaining[0];
        for (const c of PLAYER_ORDER.slice(idx + 1)) {
            if (remaining.includes(c)) {
                next = c;
                break;
            }
        }
        match.currentTurn = next;
        resetDice(match);
    }
    // Return the "winner" as first remaining (for XP purposes, just return first)
    return remaining[0];
}
export function doRematch(matchId, socketId) {
    const old = matchStore.get(matchId);
    if (!old)
        throw new Error('Match not found.');
    if (old.status !== 'finished')
        throw new Error('Match still active.');
    const isPlayer = PLAYER_ORDER.some(c => old.players[c]?.socketId === socketId);
    if (!isPlayer)
        throw new Error('Not a player.');
    // Count actual players
    const activePlayers = PLAYER_ORDER.filter(c => old.players[c] !== null);
    if (activePlayers.length < 2)
        throw new Error('Cannot rematch solo.');
    // For rematch, create fresh match with same maxPlayers. Red stays Red (host).
    const nm = {
        id: genId(),
        code: genCode(),
        status: 'active',
        maxPlayers: old.maxPlayers,
        players: {
            red: old.players.red ? { ...old.players.red, pieces: makePieces() } : null,
            blue: old.players.blue ? { ...old.players.blue, pieces: makePieces() } : null,
            green: old.players.green ? { ...old.players.green, pieces: makePieces() } : null,
            yellow: old.players.yellow ? { ...old.players.yellow, pieces: makePieces() } : null,
        },
        playerOrder: activePlayers,
        currentTurn: 'red',
        diceRoll: null,
        diceRolled: false,
        movablePieceIds: [],
        consecutiveSixes: 0,
        winnerColor: null,
        chat: [],
        spectatorSocketIds: [...old.spectatorSocketIds],
        createdAt: Date.now(),
    };
    matchStore.set(nm.id, nm);
    for (const color of activePlayers) {
        const side = nm.players[color];
        if (side)
            socketIndex.set(side.socketId, nm.id);
    }
    // Clean up old
    for (const color of PLAYER_ORDER) {
        const side = old.players[color];
        if (side)
            socketIndex.delete(side.socketId);
    }
    for (const s of old.spectatorSocketIds)
        socketIndex.set(s, nm.id);
    matchStore.delete(matchId);
    return nm;
}
export function doLeave(socketId) {
    const matchId = socketIndex.get(socketId);
    if (!matchId)
        return { match: null, wasPlayer: false };
    socketIndex.delete(socketId);
    const match = matchStore.get(matchId);
    if (!match)
        return { match: null, wasPlayer: false };
    match.spectatorSocketIds = match.spectatorSocketIds.filter(s => s !== socketId);
    const color = PLAYER_ORDER.find(c => match.players[c]?.socketId === socketId);
    if (color && match.status === 'active') {
        match.playerOrder = match.playerOrder.filter(c => c !== color);
        match.players[color] = null;
        const remaining = match.playerOrder;
        if (remaining.length <= 1) {
            match.winnerColor = remaining[0] ?? null;
            match.status = 'finished';
            resetDice(match);
        }
        else if (match.currentTurn === color) {
            // Advance turn
            const next = remaining[0];
            match.currentTurn = next;
            resetDice(match);
        }
        return { match, wasPlayer: true };
    }
    if (color && match.status === 'waiting') {
        // Red made the room. Their leaving closes it rather than handing it to
        // whoever wandered in — an unhosted lobby only sits in the list. Marked
        // finished rather than deleted, so everyone still sitting in it is told.
        if (color === 'red') {
            match.players.red = null;
            match.playerOrder = [];
            match.status = 'finished';
            match.winnerColor = null;
            return { match, wasPlayer: true };
        }
        match.players[color] = null;
        match.playerOrder = buildPlayerOrder(match.players);
        // If no players remain, delete the match entirely
        if (match.playerOrder.length === 0) {
            matchStore.delete(matchId);
            return { match: null, wasPlayer: true };
        }
        return { match, wasPlayer: true };
    }
    return { match, wasPlayer: false };
}
export function addChat(matchId, socketId, text) {
    const match = matchStore.get(matchId);
    if (!match)
        throw new Error('Match not found.');
    let name = 'Spectator';
    const color = PLAYER_ORDER.find(c => match.players[c]?.socketId === socketId);
    if (color) {
        name = match.players[color].name;
    }
    else if (!match.spectatorSocketIds.includes(socketId)) {
        throw new Error('Not in match.');
    }
    const msg = {
        id: randomBytes(4).toString('hex'),
        name,
        text: text.trim().slice(0, 300),
        t: Date.now(),
    };
    match.chat.push(msg);
    if (match.chat.length > 200)
        match.chat = match.chat.slice(-200);
    return msg;
}
export function cleanupSocket(socketId) {
    return doLeave(socketId).match;
}
//# sourceMappingURL=ludoService.js.map