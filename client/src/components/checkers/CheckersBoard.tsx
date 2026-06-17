import { useMemo } from 'react';
import type { CheckersBoard as Board, PieceColor, MoveOption } from '@/types/checkers';
import { getValidMovesForPiece, getCaptures } from '@/lib/checkersLogic';

interface Props {
  board: Board;
  myColor: PieceColor | 'spectator' | null;
  currentTurn: PieceColor;
  selectedCell: { row: number; col: number } | null;
  mustContinueFrom: { row: number; col: number } | null;
  forcedCapture: boolean;
  onSelectCell: (cell: { row: number; col: number } | null) => void;
  onMove: (from: { row: number; col: number }, to: { row: number; col: number }) => void;
}

const PIECE_COLORS = {
  red:   { fill: 'radial-gradient(circle at 35% 35%, #e74c3c, #c0392b)', glow: 'rgba(231,76,60,0.7)' },
  black: { fill: 'radial-gradient(circle at 35% 35%, #f5d76e, #b8860b)',  glow: 'rgba(245,215,110,0.7)' },
};

export function CheckersBoard({
  board, myColor, currentTurn, selectedCell, mustContinueFrom, forcedCapture,
  onSelectCell, onMove,
}: Props) {
  const isMyTurn = myColor && myColor !== 'spectator' && currentTurn === myColor;

  // Black player sees the board flipped so their pieces are always at the bottom.
  const flip = myColor === 'black';

  // Convert display coordinates to board data coordinates.
  function toData(dr: number, dc: number): [number, number] {
    return flip ? [7 - dr, 7 - dc] : [dr, dc];
  }

  // Pieces that must capture this turn (shown with orange ring when none selected)
  const mandatoryCaptureCells = useMemo(() => {
    if (!isMyTurn || !forcedCapture || mustContinueFrom) return new Set<string>();
    const s = new Set<string>();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p?.color === (myColor as PieceColor) && getCaptures(board, r, c).length > 0) {
          s.add(`${r},${c}`);
        }
      }
    }
    return s;
  }, [board, isMyTurn, forcedCapture, mustContinueFrom, myColor]);

  // Valid moves are in data space; convert destinations to display space for hit-testing.
  const validMoves: MoveOption[] = useMemo(() => {
    if (!selectedCell) return [];
    return getValidMovesForPiece(board, selectedCell.row, selectedCell.col, forcedCapture, mustContinueFrom);
  }, [board, selectedCell, forcedCapture, mustContinueFrom]);

  const validDestSet = useMemo(() => {
    return new Set(validMoves.map(m => {
      const [dr, dc] = flip ? [7 - m.to.row, 7 - m.to.col] : [m.to.row, m.to.col];
      return `${dr},${dc}`;
    }));
  }, [validMoves, flip]);

  function handleCellClick(displayRow: number, displayCol: number) {
    if (!isMyTurn) return;

    const [dataRow, dataCol] = toData(displayRow, displayCol);

    // Clicking a valid destination executes the move.
    if (selectedCell && validDestSet.has(`${displayRow},${displayCol}`)) {
      onMove(selectedCell, { row: dataRow, col: dataCol });
      return;
    }

    const piece = board[dataRow][dataCol];
    if (piece && piece.color === myColor) {
      if (selectedCell?.row === dataRow && selectedCell?.col === dataCol) {
        onSelectCell(null);
      } else {
        onSelectCell({ row: dataRow, col: dataCol });
      }
    } else {
      onSelectCell(null);
    }
  }

  return (
    <div
      className="select-none"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        aspectRatio: '1 / 1',
        width: '100%',
        maxWidth: 400,
        margin: '0 auto',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 0 40px rgba(155,0,255,0.18)',
        border: '1px solid rgba(155,0,255,0.25)',
      }}
    >
      {Array.from({ length: 8 }, (_, displayRow) =>
        Array.from({ length: 8 }, (_, displayCol) => {
          const [dataRow, dataCol] = toData(displayRow, displayCol);
          const isDark = (dataRow + dataCol) % 2 === 1;
          const piece = board[dataRow][dataCol];
          const isSelected = selectedCell?.row === dataRow && selectedCell?.col === dataCol;
          const isValidTarget = validDestSet.has(`${displayRow},${displayCol}`);
          const isMustContinue = mustContinueFrom?.row === dataRow && mustContinueFrom?.col === dataCol;
          const isMandatoryCapture = !selectedCell && mandatoryCaptureCells.has(`${dataRow},${dataCol}`);

          const cellBg = isDark
            ? isSelected
              ? 'rgba(0,245,255,0.22)'
              : isValidTarget
                ? 'rgba(0,245,255,0.10)'
                : 'rgba(10,6,28,0.9)'
            : 'rgba(40,30,60,0.4)';

          const pc = piece ? PIECE_COLORS[piece.color] : null;

          return (
            <div
              key={`${displayRow},${displayCol}`}
              onClick={() => isDark && handleCellClick(displayRow, displayCol)}
              style={{
                background: cellBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isDark && isMyTurn ? 'pointer' : 'default',
                position: 'relative',
                transition: 'background 0.15s',
              }}
            >
              {isDark && isValidTarget && !piece && (
                <div style={{
                  width: '28%', height: '28%', borderRadius: '50%',
                  background: 'rgba(0,245,255,0.55)',
                  boxShadow: '0 0 8px rgba(0,245,255,0.5)',
                }} />
              )}

              {piece && pc && (
                <div style={{
                  width: '76%', height: '76%', borderRadius: '50%',
                  background: pc.fill,
                  boxShadow: isSelected || isMustContinue
                    ? `0 0 0 3px #00f5ff, 0 0 16px ${pc.glow}`
                    : isMandatoryCapture
                      ? `0 0 0 2px #ff6622, 0 0 14px rgba(255,102,34,0.65), 0 0 8px ${pc.glow}`
                      : isValidTarget
                        ? `0 0 0 2px rgba(0,245,255,0.5), 0 0 10px ${pc.glow}`
                        : `0 2px 6px rgba(0,0,0,0.5), 0 0 10px ${pc.glow}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'box-shadow 0.15s',
                }}>
                  {piece.king && (
                    <span style={{ color: 'rgba(0,0,0,0.7)', fontSize: '55%', fontWeight: 'bold', lineHeight: 1 }}>♛</span>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
