import { useRef, useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LudoMatchPublic, LudoPiece, LudoColor } from '@/types/ludo';
import type { DisplayPositions } from './useLudoAnimation';
import { play, sfxStep } from './ludoSounds';

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
export const CENTER_CELL: [number, number] = [7, 7];

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
  if (pos === -1) {
    const [r,c] = color === 'red' ? RED_YARD_CELLS[pieceId] : BLUE_YARD_CELLS[pieceId];
    return { row:r, col:c };
  }
  if (pos === WIN_POS) return { row:7, col:7 };
  if (pos >= HOME_START) {
    const [r,c] = color === 'red' ? RED_HOME_CELLS[pos-HOME_START] : BLUE_HOME_CELLS[pos-HOME_START];
    return { row:r, col:c };
  }
  const [r,c] = TRACK_CELLS[relToAbs(pos, color)];
  return { row:r, col:c };
}

// ── Cyberpunk cell visuals ─────────────────────────────────────────────
type CellVisual = { bg: string; border: string };
const CELL_VISUALS: Record<CellRole, CellVisual> = {
  void:       { bg:'#000',                                              border:'none' },
  track:      { bg:'rgba(0,245,255,0.06)',                              border:'1px solid rgba(0,245,255,0.14)' },
  safe:       { bg:'rgba(255,210,0,0.13)',                              border:'1px solid rgba(255,200,0,0.35)' },
  entry_red:  { bg:'rgba(255,40,80,0.22)',                              border:'2px solid rgba(255,50,80,0.65)' },
  entry_blue: { bg:'rgba(0,150,255,0.22)',                              border:'2px solid rgba(0,180,255,0.65)' },
  home_red:   { bg:'rgba(255,40,80,0.15)',                              border:'1px solid rgba(255,60,90,0.4)' },
  home_blue:  { bg:'rgba(0,150,255,0.15)',                              border:'1px solid rgba(0,160,255,0.4)' },
  yard_red:   { bg:'rgba(255,30,60,0.07)',                              border:'none' },
  yard_blue:  { bg:'rgba(0,120,255,0.07)',                              border:'none' },
  center:     { bg:'linear-gradient(135deg,rgba(255,200,0,0.5),rgba(255,130,0,0.35))', border:'2px solid rgba(255,180,0,0.75)' },
};

interface PieceInfo {
  color: LudoColor;
  id: number;
  pos: number;         // display pos (from animation)
  realPos: number;     // actual server pos
  movable: boolean;
}

interface GhostDot {
  id: string;
  row: number;
  col: number;
  color: LudoColor;
}

interface Props {
  match: LudoMatchPublic;
  onPieceClick?: (color: LudoColor, pieceId: number) => void;
  flashCell?: {row:number;col:number} | null;
  displayPos?: DisplayPositions;
}

export function LudoBoard({ match, onPieceClick, flashCell, displayPos }: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [cellPx, setCellPx] = useState(0);

  // Ghost trail state
  const [ghosts, setGhosts] = useState<GhostDot[]>([]);
  const prevDispRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      setCellPx(w / 15);
    });
    if (boardRef.current) obs.observe(boardRef.current);
    return () => obs.disconnect();
  }, []);

  // Detect position changes → add ghost trail dots + play step sound
  useEffect(() => {
    if (!displayPos || !cellPx) return;
    const newGhosts: GhostDot[] = [];
    for (const [key, pos] of displayPos.entries()) {
      const prev = prevDispRef.current.get(key);
      if (prev !== undefined && prev !== pos && prev >= 0 && prev !== WIN_POS) {
        const [colorStr, idStr] = key.split('-');
        const color = colorStr as LudoColor;
        const id = parseInt(idStr);
        const { row, col } = getPieceGridPos(prev, color, id);
        newGhosts.push({ id: `${key}-${prev}-${Date.now()}`, row, col, color });
      }
    }
    prevDispRef.current = new Map(displayPos);
    if (!newGhosts.length) return;
    play(sfxStep);
    setGhosts(g => [...g.slice(-24), ...newGhosts]);
    const ids = new Set(newGhosts.map(g => g.id));
    const t = setTimeout(() => setGhosts(g => g.filter(x => !ids.has(x.id))), 420);
    return () => clearTimeout(t);
  }, [displayPos, cellPx]);

  const isMyTurn = match.myColor !== 'spectator' && match.myColor !== null && match.currentTurn === match.myColor;
  const canMove  = isMyTurn && match.diceRolled && match.movablePieceIds.length > 0;

  const allPieces = useMemo((): PieceInfo[] => {
    const list: PieceInfo[] = [];
    const getDisp = (color: LudoColor, id: number, realPos: number) =>
      displayPos?.get(`${color}-${id}`) ?? realPos;

    for (const p of match.red.pieces) {
      list.push({ color:'red', id:p.id, realPos:p.pos, pos:getDisp('red', p.id, p.pos),
        movable: match.movablePieceIds.includes(p.id) && match.currentTurn==='red' });
    }
    if (match.blue) {
      for (const p of match.blue.pieces) {
        list.push({ color:'blue', id:p.id, realPos:p.pos, pos:getDisp('blue', p.id, p.pos),
          movable: match.movablePieceIds.includes(p.id) && match.currentTurn==='blue' });
      }
    }
    return list;
  }, [match.red.pieces, match.blue, match.movablePieceIds, match.currentTurn, displayPos]);

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
      style={{
        aspectRatio:'1/1',
        background:'#000810',
        borderRadius:12,
        overflow:'hidden',
        border:'2px solid rgba(0,245,255,0.22)',
        boxShadow:'0 0 40px rgba(0,245,255,0.08), 0 0 80px rgba(0,0,0,0.95), inset 0 0 60px rgba(0,0,0,0.5)',
      }}
    >
      {/* ── Corner accent lines ───────────────────────────────────── */}
      {(['tl','tr','bl','br'] as const).map(c => (
        <div key={c} style={{
          position:'absolute', width:16, height:16, zIndex:30, pointerEvents:'none',
          top: c.startsWith('t') ? 4 : undefined, bottom: c.startsWith('b') ? 4 : undefined,
          left: c.endsWith('l') ? 4 : undefined,  right: c.endsWith('r') ? 4 : undefined,
          borderTop: c.startsWith('t') ? '2px solid rgba(0,245,255,0.7)' : undefined,
          borderBottom: c.startsWith('b') ? '2px solid rgba(0,245,255,0.7)' : undefined,
          borderLeft: c.endsWith('l') ? '2px solid rgba(0,245,255,0.7)' : undefined,
          borderRight: c.endsWith('r') ? '2px solid rgba(0,245,255,0.7)' : undefined,
        }} />
      ))}

      {/* ── Grid cells ────────────────────────────────────────────── */}
      <div className="absolute inset-0" style={{ display:'grid', gridTemplateColumns:'repeat(15,1fr)', gridTemplateRows:'repeat(15,1fr)', gap:1, padding:1 }}>
        {Array.from({length:15}, (_,r) =>
          Array.from({length:15}, (_,c) => {
            const role = CELL_ROLES[r][c];
            const vis  = CELL_VISUALS[role];
            return (
              <div key={`${r},${c}`}
                style={{ background:vis.bg, border:vis.border, borderRadius:role==='center'?6:2,
                         display:'flex', alignItems:'center', justifyContent:'center', position:'relative',
                         overflow:'hidden' }}>
                {/* Yard zone subtle diagonal lines */}
                {(role==='yard_red'||role==='yard_blue') && (
                  <div style={{ position:'absolute',inset:0, opacity:0.07,
                    backgroundImage:`repeating-linear-gradient(45deg,${role==='yard_red'?'#ff3355':'#0090ff'} 0px,${role==='yard_red'?'#ff3355':'#0090ff'} 1px,transparent 1px,transparent 8px)` }} />
                )}
                {role==='safe' && <span style={{fontSize:'52%',opacity:0.6,lineHeight:1,color:'#ffd700',textShadow:'0 0 4px #ffd700'}}>★</span>}
                {role==='entry_red'  && <span style={{fontSize:'44%',opacity:0.8,color:'#ff3355',textShadow:'0 0 6px #ff3355'}}>★</span>}
                {role==='entry_blue' && <span style={{fontSize:'44%',opacity:0.8,color:'#00c3ff',textShadow:'0 0 6px #00c3ff'}}>★</span>}
                {role==='center' && <span style={{fontSize:'58%',lineHeight:1,filter:'drop-shadow(0 0 4px rgba(255,180,0,0.8))'}}>🏠</span>}
              </div>
            );
          })
        )}
      </div>

      {/* ── Yard base rings ───────────────────────────────────────── */}
      {cellPx > 0 && (
        <>
          {RED_YARD_CELLS.map(([r,c],i) => (
            <div key={`ryh-${i}`}
              style={{ position:'absolute', borderRadius:'50%', pointerEvents:'none',
                       width:cellPx*0.76, height:cellPx*0.76,
                       left:c*cellPx+cellPx*0.12, top:r*cellPx+cellPx*0.12,
                       border:'1.5px solid rgba(255,51,85,0.35)',
                       background:'rgba(255,40,70,0.07)',
                       boxShadow:'0 0 8px rgba(255,40,70,0.15)' }} />
          ))}
          {BLUE_YARD_CELLS.map(([r,c],i) => (
            <div key={`byh-${i}`}
              style={{ position:'absolute', borderRadius:'50%', pointerEvents:'none',
                       width:cellPx*0.76, height:cellPx*0.76,
                       left:c*cellPx+cellPx*0.12, top:r*cellPx+cellPx*0.12,
                       border:'1.5px solid rgba(0,150,255,0.35)',
                       background:'rgba(0,120,255,0.07)',
                       boxShadow:'0 0 8px rgba(0,120,255,0.15)' }} />
          ))}
        </>
      )}

      {/* ── Ghost trail dots ──────────────────────────────────────── */}
      <AnimatePresence>
        {cellPx > 0 && ghosts.map(g => {
          const left = g.col * cellPx + cellPx * 0.3;
          const top  = g.row * cellPx + cellPx * 0.3;
          const sz   = cellPx * 0.4;
          const clr  = g.color === 'red' ? 'rgba(255,60,90,0.7)' : 'rgba(0,190,255,0.7)';
          return (
            <motion.div
              key={g.id}
              initial={{ opacity:0.8, scale:0.85 }}
              animate={{ opacity:0, scale:0.3 }}
              exit={{ opacity:0 }}
              transition={{ duration:0.42, ease:'easeOut' }}
              style={{ position:'absolute', left, top, width:sz, height:sz,
                       borderRadius:'50%', background:clr,
                       boxShadow:`0 0 ${sz*0.6}px ${clr}`,
                       pointerEvents:'none', zIndex:4 }}
            />
          );
        })}
      </AnimatePresence>

      {/* ── Pieces ────────────────────────────────────────────────── */}
      {cellPx > 0 && allPieces.map(piece => {
        const {row,col} = getPieceGridPos(piece.pos, piece.color, piece.id);
        const cellKey = `${row},${col}`;
        const group = cellGroups.get(cellKey) ?? [];
        const sorted = [...group].sort((a,b) => (`${a.color}-${a.id}`).localeCompare(`${b.color}-${b.id}`));
        const idx = sorted.findIndex(g => g.color===piece.color && g.id===piece.id);
        const n = sorted.length;

        let subX = 0, subY = 0, sz = cellPx * 0.76;
        if (n > 1) {
          sz = cellPx * 0.44;
          const offsets = [[0.05,0.05],[0.51,0.05],[0.05,0.51],[0.51,0.51]];
          const [ox,oy] = offsets[Math.min(idx,3)];
          subX = cellPx * (ox - 0.05);
          subY = cellPx * (oy - 0.05);
        }

        const left = col * cellPx + cellPx * 0.12 + subX;
        const top  = row * cellPx + cellPx * 0.12 + subY;

        const isRed  = piece.color === 'red';
        const isHome = piece.pos >= HOME_START && piece.pos < WIN_POS;
        const isDone = piece.pos === WIN_POS;
        const isYard = piece.pos === -1;

        const clickable = canMove && piece.movable &&
          ((isRed && match.myColor==='red') || (!isRed && match.myColor==='blue'));

        const baseColor  = isRed ? '#ff2244' : '#0090ff';
        const glowColor  = isRed ? 'rgba(255,34,68,0.8)' : 'rgba(0,144,255,0.8)';
        const borderClr  = isRed ? '#ff7799' : '#66ccff';
        const doneColor  = '#00ff88';

        const pieceGlow = isDone
          ? `0 0 ${sz*0.3}px #00ff88, 0 0 ${sz*0.6}px rgba(0,255,136,0.5)`
          : isHome
            ? `0 0 ${sz*0.25}px ${glowColor}, 0 0 ${sz*0.5}px ${glowColor.replace('0.8','0.35')}`
            : clickable
              ? `0 0 0 2px #fff, 0 0 ${sz*0.5}px ${glowColor}`
              : isYard
                ? 'none'
                : `0 0 ${sz*0.2}px ${glowColor.replace('0.8','0.5')}`;

        return (
          <motion.div
            key={`piece-${piece.color}-${piece.id}`}
            animate={{ left, top, width:sz, height:sz }}
            transition={{ type:'spring', stiffness:480, damping:28, mass:0.6 }}
            style={{
              position:'absolute', borderRadius:'50%',
              cursor: clickable ? 'pointer' : 'default',
              background: isDone
                ? `radial-gradient(circle at 38% 35%, #80ffcc, ${doneColor} 60%)`
                : isHome
                  ? `radial-gradient(circle at 38% 35%, ${isRed?'#ff99aa':'#66ccff'}, ${baseColor} 65%)`
                  : `radial-gradient(circle at 38% 35%, ${isRed?'#ff7799':'#44aaff'}, ${baseColor} 65%)`,
              border: `2px solid ${isDone ? '#80ffcc' : borderClr}`,
              zIndex: isDone ? 2 : clickable ? 12 : isHome ? 8 : 5,
              boxShadow: pieceGlow,
              display:'flex', alignItems:'center', justifyContent:'center',
              opacity: isYard && !clickable && match.status === 'active' ? 0.6 : 1,
            }}
            onClick={() => clickable && onPieceClick?.(piece.color, piece.id)}
            whileTap={clickable ? { scale:0.88 } : {}}
          >
            {/* Pulsing ring for movable pieces */}
            {clickable && (
              <>
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ border:`2.5px solid ${baseColor}`, borderRadius:'50%' }}
                  animate={{ scale:[1, 1.7, 1], opacity:[0.9, 0, 0.9] }}
                  transition={{ repeat:Infinity, duration:1.1, ease:'easeInOut' }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ border:`1.5px solid ${borderClr}`, borderRadius:'50%' }}
                  animate={{ scale:[1, 2.1, 1], opacity:[0.5, 0, 0.5] }}
                  transition={{ repeat:Infinity, duration:1.1, ease:'easeInOut', delay:0.25 }}
                />
              </>
            )}
            {/* Home glow shimmer */}
            {isHome && !clickable && (
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ background:`radial-gradient(circle, ${glowColor.replace('0.8','0.25')}, transparent)`, borderRadius:'50%' }}
                animate={{ opacity:[0.4,0.9,0.4] }}
                transition={{ repeat:Infinity, duration:1.8, ease:'easeInOut' }}
              />
            )}
            {isDone && (
              <motion.span
                animate={{ scale:[1,1.2,1], opacity:[1,0.7,1] }}
                transition={{ repeat:Infinity, duration:1.5 }}
                style={{ fontSize:sz*0.42, lineHeight:1, color:'#fff', fontWeight:'bold', zIndex:1 }}>
                ✓
              </motion.span>
            )}
          </motion.div>
        );
      })}

      {/* ── Capture flash ─────────────────────────────────────────── */}
      <AnimatePresence>
        {flashCell && cellPx > 0 && (
          <>
            {[1, 1.6, 2.2].map((scale, i) => (
              <motion.div
                key={`flash-${flashCell.row}-${flashCell.col}-${i}`}
                initial={{ opacity: 0.9 - i*0.2, scale: 1 }}
                animate={{ opacity: 0, scale }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45 + i*0.1, ease:'easeOut' }}
                style={{ position:'absolute', borderRadius:'50%',
                         left: flashCell.col*cellPx + cellPx*0.05,
                         top:  flashCell.row*cellPx + cellPx*0.05,
                         width: cellPx*0.9, height: cellPx*0.9,
                         background: i===0 ? 'rgba(255,200,0,0.6)' : 'transparent',
                         border: i>0 ? `2px solid rgba(255,150,0,${0.7-i*0.2})` : 'none',
                         pointerEvents:'none', zIndex:20 }}
              />
            ))}
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
