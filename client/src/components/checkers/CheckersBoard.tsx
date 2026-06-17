import { useMemo } from 'react';
import type { CheckersBoard as Board, PieceColor, MoveOption } from '@/types/checkers';
import { getValidMovesForPiece } from '@/lib/checkersLogic';

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
  red:   { base: '#c0392b', king: '#e74c3c', glow: 'rgba(231,76,60,0.7)' },
  black: { base: '#2c3e50', king: '#8e44ad', glow: 'rgba(142,68,173,0.7)' },
};

export function CheckersBoard({
  board, myColor, currentTurn, selectedCell, mustContinueFrom, forcedCapture,
  onSelectCell, onMove,
}: Props) {
  const isMyTurn = myColor && myColor !== 'spectator' && currentTurn === myColor;

  const validMoves: MoveOption[] = useMemo(() => {
    if (!selectedCell) return [];
    return getValidMovesForPiece(
      board,
      selectedCell.row,
      selectedCell.col,
      forcedCapture,
      mustContinueFrom,
    );
  }, [board, selectedCell, forcedCapture, mustContinueFrom]);

  const validMoveSet = useMemo(
    () => new Set(validMoves.map(m => `${m.to.row},${m.to.col}`)),
    [validMoves],
  );

  function handleCellClick(row: number, col: number) {
    if (myColor === 'spectator' || !isMyTurn) return;

    const key = `${row},${col}`;

    // Already a valid destination?
    if (selectedCell && validMoveSet.has(key)) {
      onMove(selectedCell, { row, col });
      return;
    }

    const piece = board[row][col];
    if (piece && piece.color === myColor) {
      if (selectedCell?.row === row && selectedCell?.col === col) {
        onSelectCell(null); // deselect
      } else {
        onSelectCell({ row, col });
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
      {Array.from({ length: 8 }, (_, row) =>
        Array.from({ length: 8 }, (_, col) => {
          const isDark = (row + col) % 2 === 1;
          const piece = board[row][col];
          const isSelected = selectedCell?.row === row && selectedCell?.col === col;
          const isValidTarget = validMoveSet.has(`${row},${col}`);
          const isMustContinue = mustContinueFrom?.row === row && mustContinueFrom?.col === col;

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
              key={`${row},${col}`}
              onClick={() => isDark && handleCellClick(row, col)}
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
              {/* Valid move dot */}
              {isDark && isValidTarget && !piece && (
                <div
                  style={{
                    width: '28%',
                    height: '28%',
                    borderRadius: '50%',
                    background: 'rgba(0,245,255,0.55)',
                    boxShadow: '0 0 8px rgba(0,245,255,0.5)',
                  }}
                />
              )}

              {/* Piece */}
              {piece && pc && (
                <div
                  style={{
                    width: '76%',
                    height: '76%',
                    borderRadius: '50%',
                    background: `radial-gradient(circle at 35% 35%, ${pc.king}, ${pc.base})`,
                    boxShadow: isSelected || isMustContinue
                      ? `0 0 0 3px #00f5ff, 0 0 16px ${pc.glow}`
                      : isValidTarget
                        ? `0 0 0 2px rgba(0,245,255,0.5), 0 0 10px ${pc.glow}`
                        : `0 2px 6px rgba(0,0,0,0.5), 0 0 10px ${pc.glow}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'box-shadow 0.15s',
                  }}
                >
                  {piece.king && (
                    <span style={{ color: '#fff', fontSize: '55%', fontWeight: 'bold', lineHeight: 1 }}>♛</span>
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
