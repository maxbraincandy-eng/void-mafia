import { useMemo } from 'react';
import type { LudoMatchPublic, LudoPiece, LudoColor } from '@/types/ludo';

// ── Board constants (mirror of ludoService.ts) ─────────────────────────
const TRACK_CELLS: [number, number][] = [
  [13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],[6,0],
  [6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],
  [0,6],[0,7],[0,8],
  [1,8],[2,8],[3,8],[4,8],[5,8],
  [6,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],[8,14],
  [8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],
  [14,8],[14,7],
];

const RED_HOME_CELLS:  [number, number][] = [[13,7],[12,7],[11,7],[10,7],[9,7]];
const BLUE_HOME_CELLS: [number, number][] = [[1,7],[2,7],[3,7],[4,7],[5,7]];
const RED_YARD_CELLS:  [number, number][] = [[10,1],[10,3],[12,1],[12,3]];
const BLUE_YARD_CELLS: [number, number][] = [[2,10],[2,12],[4,10],[4,12]];

const SAFE_ABS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const TRACK_LEN = 52;
const BLUE_OFFSET = 26;
const HOME_START = 52;
const WIN_POS = 57;

type CellRole =
  | 'void' | 'track' | 'safe'
  | 'entry_red' | 'entry_blue'
  | 'home_red' | 'home_blue'
  | 'yard_red'  | 'yard_blue'
  | 'center';

// Precomputed 15×15 cell roles
const CELL_ROLES: CellRole[][] = Array.from({ length: 15 }, () =>
  Array(15).fill('void') as CellRole[],
);
TRACK_CELLS.forEach(([r, c], absIdx) => {
  if (absIdx === 0)  CELL_ROLES[r][c] = 'entry_red';
  else if (absIdx === 26) CELL_ROLES[r][c] = 'entry_blue';
  else if (SAFE_ABS.has(absIdx)) CELL_ROLES[r][c] = 'safe';
  else CELL_ROLES[r][c] = 'track';
});
RED_HOME_CELLS.forEach(([r, c])  => { CELL_ROLES[r][c] = 'home_red'; });
BLUE_HOME_CELLS.forEach(([r, c]) => { CELL_ROLES[r][c] = 'home_blue'; });
for (let r = 9; r <= 14; r++) for (let c = 0; c <= 5; c++) {
  if (CELL_ROLES[r][c] === 'void') CELL_ROLES[r][c] = 'yard_red';
}
for (let r = 0; r <= 5; r++) for (let c = 9; c <= 14; c++) {
  if (CELL_ROLES[r][c] === 'void') CELL_ROLES[r][c] = 'yard_blue';
}
CELL_ROLES[7][7] = 'center';

function relToAbs(relPos: number, color: LudoColor): number {
  return color === 'red' ? relPos : (relPos + BLUE_OFFSET) % TRACK_LEN;
}

function getPieceCell(pos: number, color: LudoColor, pieceId: number): [number, number] {
  if (pos === -1) {
    return color === 'red' ? RED_YARD_CELLS[pieceId] : BLUE_YARD_CELLS[pieceId];
  }
  if (pos === WIN_POS) return [7, 7];
  if (pos >= HOME_START) {
    return color === 'red' ? RED_HOME_CELLS[pos - HOME_START] : BLUE_HOME_CELLS[pos - HOME_START];
  }
  return TRACK_CELLS[relToAbs(pos, color)];
}

// Cell background styles
const CELL_STYLE: Record<CellRole, string> = {
  void:       'bg-transparent',
  track:      'bg-white/90',
  safe:       'bg-amber-100',
  entry_red:  'bg-red-200',
  entry_blue: 'bg-blue-200',
  home_red:   'bg-red-100',
  home_blue:  'bg-blue-100',
  yard_red:   'bg-red-50/60',
  yard_blue:  'bg-blue-50/60',
  center:     'bg-gradient-to-br from-amber-200 to-amber-400',
};

const CELL_BORDER: Record<CellRole, string> = {
  void:       '',
  track:      'border border-gray-200',
  safe:       'border border-amber-300',
  entry_red:  'border-2 border-red-400',
  entry_blue: 'border-2 border-blue-400',
  home_red:   'border border-red-200',
  home_blue:  'border border-blue-200',
  yard_red:   '',
  yard_blue:  '',
  center:     'border-2 border-amber-500',
};

interface PieceOnCell {
  color: LudoColor;
  id: number;
  pos: number;
  movable: boolean;
}

interface Props {
  match: LudoMatchPublic;
  onPieceClick?: (color: LudoColor, pieceId: number) => void;
}

export function LudoBoard({ match, onPieceClick }: Props) {
  // Build a map: "row,col" → list of pieces on that cell
  const pieceMap = useMemo(() => {
    const map = new Map<string, PieceOnCell[]>();

    const addPieces = (pieces: LudoPiece[], color: LudoColor) => {
      for (const p of pieces) {
        const [r, c] = getPieceCell(p.pos, color, p.id);
        const key = `${r},${c}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({
          color, id: p.id, pos: p.pos,
          movable: match.movablePieceIds.includes(p.id) && match.currentTurn === color,
        });
      }
    };

    addPieces(match.red.pieces, 'red');
    if (match.blue) addPieces(match.blue.pieces, 'blue');
    return map;
  }, [match.red.pieces, match.blue, match.movablePieceIds, match.currentTurn]);

  const isMyTurn = match.myColor !== 'spectator' && match.myColor !== null && match.currentTurn === match.myColor;
  const canClick = isMyTurn && match.diceRolled && match.movablePieceIds.length > 0;

  return (
    <div className="relative w-full" style={{ maxWidth: 420 }}>
      <div
        className="grid w-full"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(15, 1fr)',
          gridTemplateRows: 'repeat(15, 1fr)',
          aspectRatio: '1/1',
          borderRadius: 8,
          overflow: 'hidden',
          border: '2px solid rgba(255,255,255,0.1)',
          background: 'rgba(10,6,28,0.85)',
          gap: 1,
        }}
      >
        {Array.from({ length: 15 }, (_, r) =>
          Array.from({ length: 15 }, (_, c) => {
            const role = CELL_ROLES[r][c];
            const key = `${r},${c}`;
            const pieces = pieceMap.get(key) ?? [];

            return (
              <BoardCell
                key={key}
                role={role}
                row={r}
                col={c}
                pieces={pieces}
                canClick={canClick}
                onPieceClick={onPieceClick}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function BoardCell({
  role, row, col, pieces, canClick, onPieceClick,
}: {
  role: CellRole;
  row: number;
  col: number;
  pieces: PieceOnCell[];
  canClick: boolean;
  onPieceClick?: (color: LudoColor, pieceId: number) => void;
}) {
  const cellBase = CELL_STYLE[role];
  const cellBorder = CELL_BORDER[role];

  // Special content for certain cells
  let cellContent: React.ReactNode = null;

  if (role === 'center') {
    cellContent = <span className="text-amber-700 font-bold text-[6px] leading-none">★</span>;
  } else if (role === 'safe' || role === 'entry_red' || role === 'entry_blue') {
    cellContent = <span className="text-[5px] leading-none opacity-60">★</span>;
  }

  if (pieces.length === 0) {
    return (
      <div
        className={`relative flex items-center justify-center ${cellBase} ${cellBorder}`}
        style={{ minHeight: 0 }}
      >
        {cellContent}
      </div>
    );
  }

  // Render pieces (up to 4)
  const shown = pieces.slice(0, 4);
  const multi = shown.length > 1;

  return (
    <div
      className={`relative flex items-center justify-center ${cellBase} ${cellBorder}`}
      style={{ minHeight: 0 }}
    >
      {multi ? (
        <div className="grid grid-cols-2 gap-[1px] w-full h-full p-[1px]">
          {shown.map((p) => (
            <Piece key={`${p.color}-${p.id}`} piece={p} small canClick={canClick} onPieceClick={onPieceClick} />
          ))}
        </div>
      ) : (
        <Piece key={`${shown[0].color}-${shown[0].id}`} piece={shown[0]} canClick={canClick} onPieceClick={onPieceClick} />
      )}
    </div>
  );
}

function Piece({
  piece, small, canClick, onPieceClick,
}: {
  piece: PieceOnCell;
  small?: boolean;
  canClick: boolean;
  onPieceClick?: (color: LudoColor, pieceId: number) => void;
}) {
  const isRed = piece.color === 'red';
  const clickable = canClick && piece.movable;

  const baseColor = isRed
    ? 'bg-red-500 border-red-300'
    : 'bg-blue-500 border-blue-300';

  const glowStyle = clickable
    ? { boxShadow: `0 0 0 1px #fff, 0 0 6px ${isRed ? '#ff4444' : '#4488ff'}` }
    : {};

  return (
    <div
      className={`
        rounded-full border-2 ${baseColor}
        flex items-center justify-center
        transition-all duration-150
        ${clickable ? 'cursor-pointer scale-110 animate-pulse' : ''}
        ${small ? 'w-full h-full' : 'w-3/4 h-3/4'}
      `}
      style={{
        ...glowStyle,
        ...(small ? { minWidth: 0, minHeight: 0 } : {}),
      }}
      onClick={() => clickable && onPieceClick?.(piece.color, piece.id)}
    >
      {piece.pos === WIN_POS && <span className="text-white text-[4px]">✓</span>}
    </div>
  );
}
