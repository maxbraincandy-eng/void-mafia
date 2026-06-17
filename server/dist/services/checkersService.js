/**
 * Russian Checkers (Шашки) engine.
 *
 * Rules implemented:
 * - Men move forward only; capture in all 4 directions (including backward).
 * - Flying kings: move/capture any number of squares diagonally.
 * - King capture: slide until one opponent piece, land any empty square beyond.
 * - Mandatory capture (forced). Violating returns an error, not a game end.
 * - Multi-capture: after a capture, if the same piece can capture again the turn
 *   continues from that piece.
 * - King promotion mid-sequence ends the capture sequence (Russian rule).
 * - Draw: 60 half-moves without any capture.
 * - Win: opponent has no pieces OR no legal moves (checked after full turn).
 */
import { generateId } from '../utils/helpers.js';
// ── Match Store ────────────────────────────────────────────────────────
const matches = new Map();
const DRAW_HALF_MOVE_THRESHOLD = 60;
function scheduleCleanup(id) {
    setTimeout(() => { matches.delete(id); }, 10 * 60 * 1000);
}
// ── Board Setup ────────────────────────────────────────────────────────
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
const ALL_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
// Men capture in all 4 directions (including backward) — Russian rules
function getManCaptures(board, r, c) {
    const piece = board[r][c];
    if (!piece || piece.king)
        return [];
    const moves = [];
    for (const [dr, dc] of ALL_DIRS) {
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
// Flying king: slide past empty squares, jump ONE opponent, land any empty square beyond
function getKingCaptures(board, r, c) {
    const piece = board[r][c];
    if (!piece || !piece.king)
        return [];
    const moves = [];
    for (const [dr, dc] of ALL_DIRS) {
        let cr = r + dr, cc = c + dc;
        // Slide over empty squares toward the first piece in this direction
        while (inBounds(cr, cc) && board[cr][cc] === null) {
            cr += dr;
            cc += dc;
        }
        // If that piece is an opponent, collect all empty landing squares beyond it
        if (inBounds(cr, cc) && board[cr][cc].color !== piece.color) {
            const captureR = cr, captureC = cc;
            let lr = cr + dr, lc = cc + dc;
            while (inBounds(lr, lc) && board[lr][lc] === null) {
                moves.push({ to: { row: lr, col: lc }, capture: { row: captureR, col: captureC } });
                lr += dr;
                lc += dc;
            }
        }
    }
    return moves;
}
export function getCaptures(board, r, c) {
    const piece = board[r][c];
    if (!piece)
        return [];
    return piece.king ? getKingCaptures(board, r, c) : getManCaptures(board, r, c);
}
// Men move forward only
function getManSimples(board, r, c) {
    const piece = board[r][c];
    if (!piece || piece.king)
        return [];
    const dr = piece.color === 'black' ? 1 : -1;
    const moves = [];
    for (const dc of [1, -1]) {
        const tr = r + dr, tc = c + dc;
        if (!inBounds(tr, tc))
            continue;
        if (board[tr][tc] !== null)
            continue;
        moves.push({ to: { row: tr, col: tc }, capture: null });
    }
    return moves;
}
// Flying king simple moves: any number of squares in all 4 directions
function getKingSimples(board, r, c) {
    const piece = board[r][c];
    if (!piece || !piece.king)
        return [];
    const moves = [];
    for (const [dr, dc] of ALL_DIRS) {
        let tr = r + dr, tc = c + dc;
        while (inBounds(tr, tc) && board[tr][tc] === null) {
            moves.push({ to: { row: tr, col: tc }, capture: null });
            tr += dr;
            tc += dc;
        }
    }
    return moves;
}
function getSimples(board, r, c) {
    const piece = board[r][c];
    if (!piece)
        return [];
    return piece.king ? getKingSimples(board, r, c) : getManSimples(board, r, c);
}
export function anyCapture(board, color) {
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
    const { board, currentTurn: color, settings, mustContinueFrom, inactiveHalfMoves } = match;
    const piece = board[fromRow][fromCol];
    if (!piece)
        return { ok: false, error: 'No piece at source.' };
    if (piece.color !== color)
        return { ok: false, error: 'Not your piece.' };
    const valid = getValidMovesForPiece(board, fromRow, fromCol, settings.forcedCapture, mustContinueFrom);
    const move = valid.find(m => m.to.row === toRow && m.to.col === toCol);
    if (!move) {
        if (mustContinueFrom && (fromRow !== mustContinueFrom.row || fromCol !== mustContinueFrom.col)) {
            return { ok: false, error: 'Must continue multi-capture.' };
        }
        if (settings.forcedCapture && !mustContinueFrom && anyCapture(board, color)) {
            return { ok: false, error: 'Capture required.' };
        }
        return { ok: false, error: 'Illegal move.' };
    }
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
    // Multi-capture: continue if same piece can capture again.
    // Promotion ends the sequence (Russian rule).
    let nextContinue = null;
    if (captured && !promoted && getCaptures(nb, toRow, toCol).length > 0) {
        nextContinue = { row: toRow, col: toCol };
    }
    // Win / draw detection — only evaluated when a full turn completes
    const newInactiveHalfMoves = captured ? 0 : inactiveHalfMoves + 1;
    let winnerColor = null;
    let draw = false;
    if (!nextContinue) {
        const opp = color === 'red' ? 'black' : 'red';
        if (!hasLegalMove(nb, opp)) {
            winnerColor = color;
        }
        else if (newInactiveHalfMoves >= DRAW_HALF_MOVE_THRESHOLD) {
            draw = true;
        }
    }
    return { ok: true, board: nb, captured, promoted, mustContinueFrom: nextContinue, winnerColor, draw, newInactiveHalfMoves };
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
        inactiveHalfMoves: 0,
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