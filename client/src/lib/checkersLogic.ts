/**
 * Russian Checkers client-side logic (mirrors server checkersService rules).
 * Used for UI: computing valid moves, highlighting mandatory captures.
 */
import type { CheckersBoard, CheckersPiece, MoveOption, PieceColor } from '@/types/checkers';

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

const ALL_DIRS: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function getManCaptures(board: CheckersBoard, r: number, c: number): MoveOption[] {
  const piece = board[r][c];
  if (!piece || piece.king) return [];
  const moves: MoveOption[] = [];
  for (const [dr, dc] of ALL_DIRS) {
    const mr = r + dr, mc = c + dc;
    const tr = r + 2 * dr, tc = c + 2 * dc;
    if (!inBounds(mr, mc) || !inBounds(tr, tc)) continue;
    const mid = board[mr][mc];
    if (!mid || mid.color === piece.color) continue;
    if (board[tr][tc] !== null) continue;
    moves.push({ to: { row: tr, col: tc }, capture: { row: mr, col: mc } });
  }
  return moves;
}

function getKingCaptures(board: CheckersBoard, r: number, c: number): MoveOption[] {
  const piece = board[r][c];
  if (!piece || !piece.king) return [];
  const moves: MoveOption[] = [];
  for (const [dr, dc] of ALL_DIRS) {
    let cr = r + dr, cc = c + dc;
    while (inBounds(cr, cc) && board[cr][cc] === null) {
      cr += dr; cc += dc;
    }
    if (inBounds(cr, cc) && (board[cr][cc] as CheckersPiece).color !== piece.color) {
      const captureR = cr, captureC = cc;
      let lr = cr + dr, lc = cc + dc;
      while (inBounds(lr, lc) && board[lr][lc] === null) {
        moves.push({ to: { row: lr, col: lc }, capture: { row: captureR, col: captureC } });
        lr += dr; lc += dc;
      }
    }
  }
  return moves;
}

export function getCaptures(board: CheckersBoard, r: number, c: number): MoveOption[] {
  const piece = board[r][c];
  if (!piece) return [];
  return piece.king ? getKingCaptures(board, r, c) : getManCaptures(board, r, c);
}

function getManSimples(board: CheckersBoard, r: number, c: number): MoveOption[] {
  const piece = board[r][c];
  if (!piece || piece.king) return [];
  const dr = piece.color === 'black' ? 1 : -1;
  const moves: MoveOption[] = [];
  for (const dc of [1, -1]) {
    const tr = r + dr, tc = c + dc;
    if (!inBounds(tr, tc)) continue;
    if (board[tr][tc] !== null) continue;
    moves.push({ to: { row: tr, col: tc }, capture: null });
  }
  return moves;
}

function getKingSimples(board: CheckersBoard, r: number, c: number): MoveOption[] {
  const piece = board[r][c];
  if (!piece || !piece.king) return [];
  const moves: MoveOption[] = [];
  for (const [dr, dc] of ALL_DIRS) {
    let tr = r + dr, tc = c + dc;
    while (inBounds(tr, tc) && board[tr][tc] === null) {
      moves.push({ to: { row: tr, col: tc }, capture: null });
      tr += dr; tc += dc;
    }
  }
  return moves;
}

function getSimples(board: CheckersBoard, r: number, c: number): MoveOption[] {
  const piece = board[r][c];
  if (!piece) return [];
  return piece.king ? getKingSimples(board, r, c) : getManSimples(board, r, c);
}

export function anyCapture(board: CheckersBoard, color: PieceColor): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p?.color === color && getCaptures(board, r, c).length > 0) return true;
    }
  }
  return false;
}

export function getValidMovesForPiece(
  board: CheckersBoard,
  r: number,
  c: number,
  forcedCapture: boolean,
  mustContinueFrom: { row: number; col: number } | null,
): MoveOption[] {
  const piece = board[r][c];
  if (!piece) return [];

  if (mustContinueFrom) {
    if (mustContinueFrom.row !== r || mustContinueFrom.col !== c) return [];
    return getCaptures(board, r, c);
  }

  const captures = getCaptures(board, r, c);
  if (forcedCapture && anyCapture(board, piece.color)) return captures;
  return [...captures, ...getSimples(board, r, c)];
}
