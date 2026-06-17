import type { CheckersBoard, CheckersPiece, MoveOption, PieceColor } from '@/types/checkers';

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function getDirs(piece: CheckersPiece): [number, number][] {
  const dirs: [number, number][] = [];
  if (piece.king || piece.color === 'black') dirs.push([1, -1], [1, 1]);
  if (piece.king || piece.color === 'red')   dirs.push([-1, -1], [-1, 1]);
  return dirs;
}

function getCaptures(board: CheckersBoard, r: number, c: number): MoveOption[] {
  const piece = board[r][c];
  if (!piece) return [];
  const moves: MoveOption[] = [];
  for (const [dr, dc] of getDirs(piece)) {
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

function getSimples(board: CheckersBoard, r: number, c: number): MoveOption[] {
  const piece = board[r][c];
  if (!piece) return [];
  const moves: MoveOption[] = [];
  for (const [dr, dc] of getDirs(piece)) {
    const tr = r + dr, tc = c + dc;
    if (!inBounds(tr, tc)) continue;
    if (board[tr][tc] !== null) continue;
    moves.push({ to: { row: tr, col: tc }, capture: null });
  }
  return moves;
}

function anyCapture(board: CheckersBoard, color: PieceColor): boolean {
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
