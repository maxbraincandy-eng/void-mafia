import { useRef, useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LudoMatchPublic, LudoPiece, LudoColor } from '@/types/ludo';

// ── Board constants ────────────────────────────────────────────────────
export const TRACK_CELLS: [number, number][] = [
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

export const RED_HOME_CELLS:  [number, number][] = [[13,7],[12,7],[11,7],[10,7],[9,7]];
export const BLUE_HOME_CELLS: [number, number][] = [[1,7],[2,7],[3,7],[4,7],[5,7]];
export const RED_YARD_CELLS:  [number, number][] = [[10,1],[10,3],[12,1],[12,3]];
export const BLUE_YARD_CELLS: [number, number][] = [[2,10],[2,12],[4,10],[4,12]];

const SAFE_ABS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const TRACK_LEN = 52;
const BLUE_OFFSET = 26;
const HOME_START = 52;
export const WIN_POS = 57;

type CellRole = 'void'|'track'|'safe'|'entry_red'|'entry_blue'|'home_red'|'home_blue'|'yard_red'|'yard_blue'|'center';

const CELL_ROLES: CellRole[][] = Array.from({length:15}, () => Array(15).fill('void') as CellRole[]);
TRACK_CELLS.forEach(([r,c], i) => {
  if (i === 0) CELL_ROLES[r][c] = 'entry_red';
  else if (i === 26) CELL_ROLES[r][c] = 'entry_blue';
  else if (SAFE_ABS.has(i)) CELL_ROLES[r][c] = 'safe';
  else CELL_ROLES[r][c] = 'track';
});
RED_HOME_CELLS.forEach(([r,c])  => { CELL_ROLES[r][c] = 'home_red'; });
BLUE_HOME_CELLS.forEach(([r,c]) => { CELL_ROLES[r][c] = 'home_blue'; });
for (let r=9; r<=14; r++) for (let c=0; c<=5; c++)  { if (CELL_ROLES[r][c]==='void') CELL_ROLES[r][c]='yard_red'; }
for (let r=0; r<=5;  r++) for (let c=9; c<=14; c++) { if (CELL_ROLES[r][c]==='void') CELL_ROLES[r][c]='yard_blue'; }
CELL_ROLES[7][7] = 'center';

function relToAbs(relPos: number, color: LudoColor): number {
  return color === 'red' ? relPos : (relPos + BLUE_OFFSET) % TRACK_LEN;
}

export function getPieceGridPos(pos: number, color: LudoColor, pieceId: number): {row:number;col:number} {
  if (pos === -1)     { const [r,c] = color==='red' ? RED_YARD_CELLS[pieceId] : BLUE_YARD_CELLS[pieceId]; return {row:r,col:c}; }
  if (pos === WIN_POS) return {row:7,col:7};
  if (pos >= HOME_START) { const [r,c] = color==='red' ? RED_HOME_CELLS[pos-HOME_START] : BLUE_HOME_CELLS[pos-HOME_START]; return {row:r,col:c}; }
  const [r,c] = TRACK_CELLS[relToAbs(pos, color)];
  return {row:r,col:c};
}

// Cell visual config
type CellVisual = { bg: string; border: string; opacity?: number };
const CELL_VISUALS: Record<CellRole, CellVisual> = {
  void:       { bg:'transparent',         border:'none' },
  track:      { bg:'rgba(255,255,255,0.9)', border:'1px solid rgba(180,180,200,0.5)' },
  safe:       { bg:'rgba(255,210,50,0.25)', border:'1px solid rgba(255,180,0,0.5)' },
  entry_red:  { bg:'rgba(239,68,68,0.25)', border:'2px solid rgba(239,68,68,0.6)' },
  entry_blue: { bg:'rgba(59,130,246,0.25)', border:'2px solid rgba(59,130,246,0.6)' },
  home_red:   { bg:'rgba(239,68,68,0.18)', border:'1px solid rgba(239,68,68,0.35)' },
  home_blue:  { bg:'rgba(59,130,246,0.18)', border:'1px solid rgba(59,130,246,0.35)' },
  yard_red:   { bg:'rgba(239,68,68,0.08)', border:'none' },
  yard_blue:  { bg:'rgba(59,130,246,0.08)', border:'none' },
  center:     { bg:'linear-gradient(135deg,rgba(255,215,0,0.6),rgba(255,140,0,0.4))', border:'2px solid rgba(255,180,0,0.8)' },
};

interface PieceInfo {
  color: LudoColor;
  id: number;
  pos: number;
  movable: boolean;
}

interface Props {
  match: LudoMatchPublic;
  onPieceClick?: (color: LudoColor, pieceId: number) => void;
  flashCell?: {row:number;col:number} | null;  // for capture effect
}

export function LudoBoard({ match, onPieceClick, flashCell }: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [cellPx, setCellPx] = useState(0);

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      setCellPx(w / 15);
    });
    if (boardRef.current) obs.observe(boardRef.current);
    return () => obs.disconnect();
  }, []);

  const isMyTurn = match.myColor !== 'spectator' && match.myColor !== null && match.currentTurn === match.myColor;
  const canMove  = isMyTurn && match.diceRolled && match.movablePieceIds.length > 0;

  // Collect all pieces and group by grid position (for multi-piece offsets)
  const allPieces = useMemo(() => {
    const list: PieceInfo[] = [];
    for (const p of match.red.pieces) {
      list.push({ color:'red', id:p.id, pos:p.pos,
        movable: match.movablePieceIds.includes(p.id) && match.currentTurn==='red' });
    }
    if (match.blue) {
      for (const p of match.blue.pieces) {
        list.push({ color:'blue', id:p.id, pos:p.pos,
          movable: match.movablePieceIds.includes(p.id) && match.currentTurn==='blue' });
      }
    }
    return list;
  }, [match.red.pieces, match.blue, match.movablePieceIds, match.currentTurn]);

  // Group by grid position
  const cellGroups = useMemo(() => {
    const map = new Map<string, PieceInfo[]>();
    for (const p of allPieces) {
      const {row,col} = getPieceGridPos(p.pos, p.color, p.id);
      const key = `${row},${col}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [allPieces]);

  return (
    <div
      ref={boardRef}
      className="relative w-full select-none"
      style={{ aspectRatio:'1/1', background:'rgba(8,4,20,0.95)', borderRadius:10, overflow:'hidden',
               border:'1.5px solid rgba(255,255,255,0.08)', boxShadow:'0 8px 40px rgba(0,0,0,0.7)' }}
    >
      {/* ── Grid background layer ─────────────────────────────────── */}
      <div className="absolute inset-0" style={{ display:'grid', gridTemplateColumns:'repeat(15,1fr)', gridTemplateRows:'repeat(15,1fr)', gap:1, padding:1 }}>
        {Array.from({length:15}, (_,r) =>
          Array.from({length:15}, (_,c) => {
            const role = CELL_ROLES[r][c];
            const vis  = CELL_VISUALS[role];
            return (
              <div key={`${r},${c}`}
                style={{ background:vis.bg, border:vis.border, borderRadius:role==='center'?4:2,
                         display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
                {role==='safe' && <span style={{fontSize:'50%',opacity:0.5,lineHeight:1}}>★</span>}
                {role==='entry_red'  && <span style={{fontSize:'44%',opacity:0.55,color:'#ef4444'}}>★</span>}
                {role==='entry_blue' && <span style={{fontSize:'44%',opacity:0.55,color:'#3b82f6'}}>★</span>}
                {role==='center'     && <span style={{fontSize:'60%',opacity:0.9,color:'rgba(180,100,0,1)'}}>🏠</span>}
              </div>
            );
          })
        )}
      </div>

      {/* ── Yard base circles (homes for pieces) ─────────────────── */}
      {cellPx > 0 && (
        <>
          {RED_YARD_CELLS.map(([r,c],i) => (
            <div key={`ryh-${i}`} className="absolute rounded-full pointer-events-none"
              style={{ width:cellPx*0.72, height:cellPx*0.72, borderRadius:'50%',
                       left:c*cellPx+cellPx*0.14, top:r*cellPx+cellPx*0.14,
                       border:'2px solid rgba(239,68,68,0.4)', background:'rgba(239,68,68,0.08)' }} />
          ))}
          {BLUE_YARD_CELLS.map(([r,c],i) => (
            <div key={`byh-${i}`} className="absolute rounded-full pointer-events-none"
              style={{ width:cellPx*0.72, height:cellPx*0.72, borderRadius:'50%',
                       left:c*cellPx+cellPx*0.14, top:r*cellPx+cellPx*0.14,
                       border:'2px solid rgba(59,130,246,0.4)', background:'rgba(59,130,246,0.08)' }} />
          ))}
        </>
      )}

      {/* ── Piece layer (animated) ────────────────────────────────── */}
      {cellPx > 0 && allPieces.map(piece => {
        const {row,col} = getPieceGridPos(piece.pos, piece.color, piece.id);
        const cellKey = `${row},${col}`;
        const group = cellGroups.get(cellKey) ?? [];
        const sortedGroup = [...group].sort((a,b)=>(`${a.color}-${a.id}`).localeCompare(`${b.color}-${b.id}`));
        const idx  = sortedGroup.findIndex(g=>g.color===piece.color&&g.id===piece.id);
        const n    = sortedGroup.length;

        // Sub-cell offsets when multiple pieces share a cell
        let subX = 0, subY = 0, sz = cellPx * 0.74;
        if (n > 1) {
          sz = cellPx * 0.44;
          const offsets = [[0.06,0.06],[0.5,0.06],[0.06,0.5],[0.5,0.5]];
          const [ox,oy] = offsets[Math.min(idx,3)];
          subX = cellPx * (ox - 0.06);
          subY = cellPx * (oy - 0.06);
        }

        const left = col*cellPx + cellPx*0.13 + subX;
        const top  = row*cellPx + cellPx*0.13 + subY;

        const isRed = piece.color === 'red';
        const clickable = canMove && piece.movable && (
          (isRed && match.myColor==='red') || (!isRed && match.myColor==='blue')
        );

        const pieceColor    = isRed ? '#ef4444' : '#3b82f6';
        const pieceBorder   = isRed ? '#fca5a5' : '#93c5fd';
        const pieceGlow     = isRed ? '0 0 0 2px #fff,0 0 10px #ef4444' : '0 0 0 2px #fff,0 0 10px #3b82f6';
        const finishedColor = '#22c55e';

        return (
          <motion.div
            key={`piece-${piece.color}-${piece.id}`}
            animate={{ left, top, width:sz, height:sz }}
            transition={{ type:'spring', stiffness:260, damping:22, mass:0.8 }}
            style={{ position:'absolute', borderRadius:'50%', cursor:clickable?'pointer':'default',
                     background: piece.pos===WIN_POS ? finishedColor : pieceColor,
                     border: `2px solid ${piece.pos===WIN_POS ? '#86efac' : pieceBorder}`,
                     zIndex: piece.pos===WIN_POS ? 1 : clickable ? 10 : 5,
                     boxShadow: clickable ? pieceGlow : piece.pos===WIN_POS ? '0 0 6px #22c55e' : '0 1px 4px rgba(0,0,0,0.6)',
                     display:'flex', alignItems:'center', justifyContent:'center',
                   }}
            onClick={() => clickable && onPieceClick?.(piece.color, piece.id)}
          >
            {/* Pulse ring for movable pieces */}
            {clickable && (
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ border:`2px solid ${pieceColor}`, borderRadius:'50%' }}
                animate={{ scale:[1,1.5,1], opacity:[0.8,0,0.8] }}
                transition={{ repeat:Infinity, duration:1.2, ease:'easeInOut' }}
              />
            )}
            {piece.pos===WIN_POS && (
              <span style={{fontSize:sz*0.45, lineHeight:1, color:'#fff', fontWeight:'bold'}}>✓</span>
            )}
          </motion.div>
        );
      })}

      {/* ── Capture flash effect ──────────────────────────────────── */}
      <AnimatePresence>
        {flashCell && cellPx > 0 && (
          <motion.div
            key={`flash-${flashCell.row}-${flashCell.col}`}
            initial={{ opacity:0.9, scale:1 }}
            animate={{ opacity:0, scale:2 }}
            exit={{ opacity:0 }}
            transition={{ duration:0.5, ease:'easeOut' }}
            style={{ position:'absolute', borderRadius:'50%',
                     left:flashCell.col*cellPx, top:flashCell.row*cellPx,
                     width:cellPx, height:cellPx,
                     background:'rgba(255,255,0,0.5)',
                     pointerEvents:'none', zIndex:20 }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
