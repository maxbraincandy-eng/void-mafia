import { generateId } from '../utils/helpers.js';
// ── Match Store ────────────────────────────────────────────────────────
const matches = new Map();
// Cleanup finished matches after 10 minutes
function scheduleCleanup(id) {
    setTimeout(() => { matches.delete(id); }, 10 * 60 * 1000);
}
// ── Board Logic ────────────────────────────────────────────────────────
export function initBoard() {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 !== 1)
                continue;
            if (r < 3)
                board[r][c] = { color: 'black', king: false };
            else if (r > 4)
                board[r][c] = { color: 'red', king: false };
        }
    }
    return board;
}
function inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
}
function getDirs(piece) {
    const dirs = [];
    if (piece.king || piece.color === 'black')
        dirs.push([1, -1], [1, 1]);
    if (piece.king || piece.color === 'red')
        dirs.push([-1, -1], [-1, 1]);
    return dirs;
}
function getCaptures(board, r, c) {
    const piece = board[r][c];
    if (!piece)
        return [];
    const moves = [];
    for (const [dr, dc] of getDirs(piece)) {
        const mr = r + dr, mc = c + dc;
        const tr = r + 2 * dr, tc = c + 2 * dc;
        if (!inBounds(mr, mc) || !inBounds(tr, tc))
            continue;
        const mid = board[mr][mc];
        if (!mid || mid.color === piece.color)
            continue;
        if (board[tr][tc] !== null)
            continue;
        moves.push({ to: { row: tr, col: tc }, capture: { row: mr, col: mc } });
    }
    return moves;
}
function getSimples(board, r, c) {
    const piece = board[r][c];
    if (!piece)
        return [];
    const moves = [];
    for (const [dr, dc] of getDirs(piece)) {
        const tr = r + dr, tc = c + dc;
        if (!inBounds(tr, tc))
            continue;
        if (board[tr][tc] !== null)
            continue;
        moves.push({ to: { row: tr, col: tc }, capture: null });
    }
    return moves;
}
function anyCapture(board, color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p?.color === color && getCaptures(board, r, c).length > 0)
                return true;
        }
    }
    return false;
}
function hasLegalMove(board, color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p || p.color !== color)
                continue;
            if (getCaptures(board, r, c).length > 0)
                return true;
            if (getSimples(board, r, c).length > 0)
                return true;
        }
    }
    return false;
}
export function getValidMovesForPiece(board, r, c, forcedCapture, mustContinueFrom) {
    const piece = board[r][c];
    if (!piece)
        return [];
    if (mustContinueFrom) {
        if (mustContinueFrom.row !== r || mustContinueFrom.col !== c)
            return [];
        return getCaptures(board, r, c);
    }
    const captures = getCaptures(board, r, c);
    if (forcedCapture && anyCapture(board, piece.color))
        return captures;
    return [...captures, ...getSimples(board, r, c)];
}
// ── Move Application ──────────────────────────────────────────────────
export function applyMove(match, fromRow, fromCol, toRow, toCol) {
    const { board, currentTurn: color, settings, mustContinueFrom } = match;
    const piece = board[fromRow][fromCol];
    if (!piece)
        return { ok: false, error: 'No piece at source.' };
    if (piece.color !== color)
        return { ok: false, error: 'Not your piece.' };
    const valid = getValidMovesForPiece(board, fromRow, fromCol, settings.forcedCapture, mustContinueFrom);
    const move = valid.find(m => m.to.row === toRow && m.to.col === toCol);
    if (!move)
        return { ok: false, error: 'Illegal move.' };
    // Deep-copy board
    const nb = board.map(row => row.map(cell => (cell ? { ...cell } : null)));
    nb[toRow][toCol] = { ...piece };
    nb[fromRow][fromCol] = null;
    let captured = null;
    if (move.capture) {
        nb[move.capture.row][move.capture.col] = null;
        captured = move.capture;
    }
    // King promotion
    let promoted = false;
    if (!nb[toRow][toCol].king) {
        if (color === 'red' && toRow === 0) {
            nb[toRow][toCol].king = true;
            promoted = true;
        }
        if (color === 'black' && toRow === 7) {
            nb[toRow][toCol].king = true;
            promoted = true;
        }
    }
    // Multi-jump: allow another capture from the same piece (unless just promoted)
    let nextContinue = null;
    if (captured && !promoted && getCaptures(nb, toRow, toCol).length > 0) {
        nextContinue = { row: toRow, col: toCol };
    }
    // Check for winner after multi-jump completes
    let winnerColor = null;
    if (!nextContinue) {
        const opp = color === 'red' ? 'black' : 'red';
        if (!hasLegalMove(nb, opp))
            winnerColor = color;
    }
    return { ok: true, board: nb, captured, promoted, mustContinueFrom: nextContinue, winnerColor };
}
// ── CRUD ───────────────────────────────────────────────────────────────
export function createMatch(red, settings) {
    let code;
    const usedCodes = new Set([...matches.values()].map(m => m.code));
    do {
        code = `CK-${Math.floor(1000 + Math.random() * 9000)}`;
    } while (usedCodes.has(code));
    const match = {
        id: generateId(),
        code,
        status: 'waiting',
        red,
        black: null,
        currentTurn: 'red',
        board: initBoard(),
        capturedByRed: 0,
        capturedByBlack: 0,
        winnerColor: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        settings,
        chat: [],
        spectatorSocketIds: [],
        mustContinueFrom: null,
    };
    matches.set(match.id, match);
    return match;
}
export function getMatch(id) { return matches.get(id); }
export function getMatchByCode(code) {
    const upper = code.trim().toUpperCase();
    for (const m of matches.values())
        if (m.code === upper)
            return m;
    return undefined;
}
export function deleteMatch(id) { matches.delete(id); }
export function getOpenMatches() {
    return [...matches.values()].filter(m => m.status !== 'finished');
}
export function getMatchForSocket(socketId) {
    for (const m of matches.values()) {
        if (m.red.socketId === socketId)
            return m;
        if (m.black?.socketId === socketId)
            return m;
        if (m.spectatorSocketIds.includes(socketId))
            return m;
    }
    return undefined;
}
export function finishMatch(match, winner) {
    match.status = 'finished';
    match.winnerColor = winner;
    match.updatedAt = Date.now();
    scheduleCleanup(match.id);
}
//# sourceMappingURL=checkersService.js.map