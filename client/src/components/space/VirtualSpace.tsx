import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualSpace, type SpacePlayer, type SpaceMask } from '@/hooks/useVirtualSpace';
import { useSpaceVoice } from '@/hooks/useSpaceVoice';
import { useAuthStore } from '@/store/authStore';

// ── Grid constants ────────────────────────────────────────────────────

const COLS = 10;
const ROWS = 10;
const TW = 48;       // tile width px (logical)
const TH = 24;       // tile height = TW/2
const WALL_H = 80;   // back wall pixel height
const CW = (COLS + ROWS) * (TW / 2);          // 480 logical px
const CH = WALL_H + (COLS + ROWS - 1) * (TH / 2) + 20; // ~320 logical px

// Isometric origin = back-corner tile (col=0, row=0) top point
const OX = ROWS * (TW / 2);  // 240
const OY = WALL_H;            // 80

// ── Isometric math ────────────────────────────────────────────────────

function toIso(col: number, row: number) {
  return {
    sx: OX + (col - row) * (TW / 2),
    sy: OY + (col + row) * (TH / 2),
  };
}

function fromScreen(mx: number, my: number): { col: number; row: number } {
  const dx = mx - OX;
  const dy = my - OY;
  const rawCol = (dx / (TW / 2) + dy / (TH / 2)) / 2;
  const rawRow = (dy / (TH / 2) - dx / (TW / 2)) / 2;
  return {
    col: Math.max(0, Math.min(COLS - 1, Math.round(rawCol))),
    row: Math.max(0, Math.min(ROWS - 1, Math.round(rawRow))),
  };
}

function pctToGridPos(x: number, y: number) {
  return {
    col: (x / 100) * (COLS - 1),
    row: (y / 100) * (ROWS - 1),
  };
}

function gridToPct(col: number, row: number) {
  return {
    x: (col / (COLS - 1)) * 100,
    y: (row / (ROWS - 1)) * 100,
  };
}

// ── Furniture definitions ─────────────────────────────────────────────

interface FurnitureDef {
  id: string;
  col: number; row: number;
  cols: number; rows: number;
  height: number;
  topColor: string;
  leftColor: string;
  rightColor: string;
  label?: string;
  accentColor: string;
}

const FURNITURE: FurnitureDef[] = [
  {
    id: 'dj', col: 4, row: 0, cols: 2, rows: 1, height: 30,
    topColor: 'rgba(255,0,150,0.55)', leftColor: 'rgba(160,0,80,0.75)', rightColor: 'rgba(200,0,100,0.65)',
    accentColor: '#ff0096', label: 'DJ BOOTH',
  },
  {
    id: 'bar', col: 8, row: 1, cols: 1, rows: 3, height: 34,
    topColor: 'rgba(255,140,0,0.55)', leftColor: 'rgba(160,70,0,0.75)', rightColor: 'rgba(200,100,0,0.65)',
    accentColor: '#ff8c00', label: 'BAR',
  },
  {
    id: 'sofa', col: 0, row: 6, cols: 3, rows: 1, height: 18,
    topColor: 'rgba(120,0,255,0.55)', leftColor: 'rgba(70,0,160,0.75)', rightColor: 'rgba(90,0,200,0.65)',
    accentColor: '#7800ff', label: 'LOUNGE',
  },
  {
    id: 'desk', col: 6, row: 7, cols: 2, rows: 1, height: 22,
    topColor: 'rgba(0,150,255,0.55)', leftColor: 'rgba(0,80,180,0.75)', rightColor: 'rgba(0,100,220,0.65)',
    accentColor: '#0096ff', label: 'GAMING',
  },
];

// Blocked cells from furniture
const BLOCKED = new Set<string>();
for (const f of FURNITURE) {
  for (let c = f.col; c < f.col + f.cols; c++) {
    for (let r = f.row; r < f.row + f.rows; r++) {
      BLOCKED.add(`${c},${r}`);
    }
  }
}
function isBlocked(col: number, row: number) {
  return BLOCKED.has(`${col},${row}`);
}

// ── Floor tile zone coloring ──────────────────────────────────────────

function floorTileColor(col: number, row: number): string {
  if (col >= 3 && col <= 6 && row <= 2) return 'rgba(255,0,150,0.09)';
  if (col >= 7 && row >= 0 && row <= 5) return 'rgba(255,140,0,0.07)';
  if (col <= 3 && row >= 5) return 'rgba(120,0,255,0.10)';
  if (col >= 5 && row >= 6) return 'rgba(0,150,255,0.09)';
  if (col >= 3 && col <= 6 && row >= 3 && row <= 6) return 'rgba(255,255,255,0.04)';
  return 'rgba(255,255,255,0.025)';
}

function floorTileStroke(col: number, row: number): string {
  if (col >= 3 && col <= 6 && row <= 2) return 'rgba(255,0,150,0.18)';
  if (col >= 7 && row >= 0 && row <= 5) return 'rgba(255,140,0,0.14)';
  if (col <= 3 && row >= 5) return 'rgba(120,0,255,0.18)';
  if (col >= 5 && row >= 6) return 'rgba(0,150,255,0.15)';
  return 'rgba(155,100,255,0.10)';
}

// ── Canvas room drawing ───────────────────────────────────────────────

function drawRoom(ctx: CanvasRenderingContext2D) {
  // ── Background ────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, '#09031c');
  bg.addColorStop(0.4, '#060218');
  bg.addColorStop(1, '#010008');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CW, CH);

  // Ambient radial zones
  const zones: [number, number, string][] = [
    [0.5, 0.3, 'rgba(155,0,255,0.06)'],
    [0.15, 0.75, 'rgba(120,0,255,0.05)'],
    [0.82, 0.6, 'rgba(0,150,255,0.05)'],
    [0.5, 0.15, 'rgba(255,0,150,0.06)'],
  ];
  for (const [cx, cy, color] of zones) {
    const grad = ctx.createRadialGradient(CW * cx, CH * cy, 0, CW * cx, CH * cy, 200);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CW, CH);
  }

  // ── Left wall panels (row axis: row=0 edge, going left) ───────────
  for (let r = 0; r < ROWS; r++) {
    const p0 = toIso(0, r);
    const p1 = toIso(0, r + 1);
    ctx.beginPath();
    ctx.moveTo(p0.sx, p0.sy);
    ctx.lineTo(p0.sx - TW / 2, p0.sy + TH / 2);
    ctx.lineTo(p1.sx - TW / 2, p1.sy + TH / 2 - WALL_H);
    ctx.lineTo(p0.sx, p0.sy - WALL_H);
    ctx.closePath();
    const t = r / ROWS;
    const wg = ctx.createLinearGradient(p0.sx - TW / 2, 0, p0.sx, 0);
    wg.addColorStop(0, `rgba(80,0,180,${0.22 - t * 0.06})`);
    wg.addColorStop(1, `rgba(100,0,220,${0.12 - t * 0.04})`);
    ctx.fillStyle = wg;
    ctx.fill();
    ctx.strokeStyle = `rgba(120,0,255,${0.28 - t * 0.08})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // ── Right wall panels (col axis: col=0 edge, going right) ─────────
  for (let c = 0; c < COLS; c++) {
    const p0 = toIso(c, 0);
    const p1 = toIso(c + 1, 0);
    ctx.beginPath();
    ctx.moveTo(p0.sx, p0.sy);
    ctx.lineTo(p1.sx, p1.sy);
    ctx.lineTo(p1.sx, p1.sy - WALL_H);
    ctx.lineTo(p0.sx, p0.sy - WALL_H);
    ctx.closePath();
    const t = c / COLS;
    const wg = ctx.createLinearGradient(p0.sx, 0, p1.sx, 0);
    wg.addColorStop(0, `rgba(0,100,200,${0.12 + t * 0.04})`);
    wg.addColorStop(1, `rgba(0,150,255,${0.18 + t * 0.06})`);
    ctx.fillStyle = wg;
    ctx.fill();
    ctx.strokeStyle = `rgba(0,180,255,${0.20 + t * 0.08})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // ── Wall/floor edge neon strip ────────────────────────────────────
  ctx.beginPath();
  const wallL = toIso(0, ROWS - 1);
  const wallO = toIso(0, 0);
  const wallR = toIso(COLS - 1, 0);
  ctx.moveTo(wallL.sx - TW / 2, wallL.sy + TH / 2);
  ctx.lineTo(wallO.sx, wallO.sy);
  ctx.lineTo(wallR.sx + TW / 2, wallR.sy + TH / 2);
  const stripGrad = ctx.createLinearGradient(wallL.sx, 0, wallR.sx, 0);
  stripGrad.addColorStop(0, 'rgba(155,0,255,0.8)');
  stripGrad.addColorStop(0.5, 'rgba(0,229,255,0.9)');
  stripGrad.addColorStop(1, 'rgba(0,229,255,0.7)');
  ctx.strokeStyle = stripGrad;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Neon corner pillars
  ctx.beginPath();
  ctx.moveTo(wallL.sx - TW / 2, wallL.sy + TH / 2);
  ctx.lineTo(wallL.sx - TW / 2, wallL.sy + TH / 2 - WALL_H - 16);
  ctx.strokeStyle = 'rgba(155,0,255,0.7)';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#9b00ff';
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.moveTo(wallR.sx + TW / 2, wallR.sy + TH / 2);
  ctx.lineTo(wallR.sx + TW / 2, wallR.sy + TH / 2 - WALL_H - 16);
  ctx.strokeStyle = 'rgba(0,220,255,0.7)';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#00dcff';
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // ── VOID LOUNGE neon sign ─────────────────────────────────────────
  const signCenter = toIso(4.5, 0);
  ctx.save();
  ctx.font = 'bold 10px "Space Grotesk", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#00e5ff';
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 14;
  ctx.fillText('VOID LOUNGE', signCenter.sx, signCenter.sy - WALL_H + 22);
  ctx.shadowBlur = 0;
  ctx.restore();

  // ── Floor tiles (depth sorted back→front) ─────────────────────────
  const tiles: { col: number; row: number }[] = [];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      tiles.push({ col: c, row: r });
    }
  }
  tiles.sort((a, b) => (a.col + a.row) - (b.col + b.row));

  for (const { col, row } of tiles) {
    const { sx, sy } = toIso(col, row);
    ctx.beginPath();
    ctx.moveTo(sx,          sy);
    ctx.lineTo(sx + TW / 2, sy + TH / 2);
    ctx.lineTo(sx,          sy + TH);
    ctx.lineTo(sx - TW / 2, sy + TH / 2);
    ctx.closePath();
    ctx.fillStyle = floorTileColor(col, row);
    ctx.fill();
    ctx.strokeStyle = floorTileStroke(col, row);
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }

  // ── Furniture (depth sorted) ──────────────────────────────────────
  const sorted = [...FURNITURE].sort((a, b) => (a.col + a.row) - (b.col + b.row));
  for (const f of sorted) {
    drawFurniture(ctx, f);
  }

  // ── Zone label overlays on floor ──────────────────────────────────
  const labels: [number, number, string, string][] = [
    [5,  1.5, 'DJ BOOTH', '#ff0096'],
    [8.5, 3,  'BAR',      '#ff8c00'],
    [1.5, 6.5,'LOUNGE',   '#7800ff'],
    [7,   7.5,'GAMING',   '#0096ff'],
  ];
  ctx.save();
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  for (const [col, row, text, color] of labels) {
    const { sx, sy } = toIso(col, row);
    ctx.fillStyle = color + 'cc';
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    ctx.fillText(text, sx, sy - 4);
  }
  ctx.shadowBlur = 0;
  ctx.restore();

  // ── Ceiling light halos ───────────────────────────────────────────
  for (const f of FURNITURE) {
    const cx = toIso(f.col + f.cols / 2, f.row + f.rows / 2);
    const halo = ctx.createRadialGradient(cx.sx, cx.sy - f.height - 8, 0, cx.sx, cx.sy - f.height - 8, TW * 1.5);
    halo.addColorStop(0, f.accentColor + '28');
    halo.addColorStop(1, 'transparent');
    ctx.fillStyle = halo;
    ctx.fillRect(cx.sx - TW * 1.5, cx.sy - f.height - 8 - TW * 1.5, TW * 3, TW * 3);
  }
}

function drawFurniture(ctx: CanvasRenderingContext2D, f: FurnitureDef) {
  const p00 = toIso(f.col,          f.row);
  const p10 = toIso(f.col + f.cols, f.row);
  const p01 = toIso(f.col,          f.row + f.rows);
  const p11 = toIso(f.col + f.cols, f.row + f.rows);
  const H = f.height;

  // Top face
  ctx.beginPath();
  ctx.moveTo(p00.sx, p00.sy - H);
  ctx.lineTo(p10.sx, p10.sy - H);
  ctx.lineTo(p11.sx, p11.sy - H);
  ctx.lineTo(p01.sx, p01.sy - H);
  ctx.closePath();
  ctx.fillStyle = f.topColor;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  // Left face
  ctx.beginPath();
  ctx.moveTo(p01.sx, p01.sy - H);
  ctx.lineTo(p11.sx, p11.sy - H);
  ctx.lineTo(p11.sx, p11.sy);
  ctx.lineTo(p01.sx, p01.sy);
  ctx.closePath();
  ctx.fillStyle = f.leftColor;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Right face
  ctx.beginPath();
  ctx.moveTo(p10.sx, p10.sy - H);
  ctx.lineTo(p11.sx, p11.sy - H);
  ctx.lineTo(p11.sx, p11.sy);
  ctx.lineTo(p10.sx, p10.sy);
  ctx.closePath();
  ctx.fillStyle = f.rightColor;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Accent top edge glow
  ctx.beginPath();
  ctx.moveTo(p00.sx, p00.sy - H);
  ctx.lineTo(p10.sx, p10.sy - H);
  ctx.lineTo(p11.sx, p11.sy - H);
  ctx.lineTo(p01.sx, p01.sy - H);
  ctx.closePath();
  ctx.strokeStyle = f.accentColor + 'cc';
  ctx.lineWidth = 1.2;
  ctx.shadowColor = f.accentColor;
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// ── CSS keyframes ─────────────────────────────────────────────────────

const SPACE_CSS = `
@keyframes vs-pulse  { 0%,100%{opacity:.7} 50%{opacity:1} }
@keyframes vs-speak  { 0%,100%{transform:scale(1);opacity:.9} 50%{transform:scale(1.28);opacity:.3} }
@keyframes vs-bob    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
@keyframes vs-walk   { 0%,100%{transform:translateY(0) rotate(-1.5deg)} 50%{transform:translateY(-3px) rotate(1.5deg)} }
@keyframes vs-pulse-dot { 0%,100%{transform:scale(1)} 50%{transform:scale(1.4)} }
`;

// ── Avatar palette ────────────────────────────────────────────────────

const BODY_COLORS = ['#9b00ff','#00e5ff','#ff00aa','#00ff88','#ff6600','#3b82f6','#ffcc00','#ff2255'];
const GLOW_COLORS = ['#00e5ff','#9b00ff','#00ff88','#ff00aa','#ffcc00','#ff6600','#ff2255','#c084fc'];
const MASKS: { id: SpaceMask; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'half', label: 'Half' },
  { id: 'full', label: 'Full' }, { id: 'visor', label: 'Visor' },
];
const LS_BODY = 'vs_bodyColor';
const LS_GLOW = 'vs_glowColor';
const LS_MASK = 'vs_mask';

// ── Isometric robot avatar (SVG) ──────────────────────────────────────

function IsoAvatar({ bodyColor, glowColor, mask, size = 1, isMe }: {
  bodyColor: string; glowColor: string; mask: SpaceMask; size?: number; isMe?: boolean;
}) {
  const w = Math.round(28 * size);
  const h = Math.round(46 * size);
  return (
    <svg width={w} height={h} viewBox="0 0 28 46" fill="none"
      style={{ filter: `drop-shadow(0 0 ${isMe ? 7 : 3}px ${bodyColor}bb) drop-shadow(0 2px 4px rgba(0,0,0,0.6))`, overflow: 'visible' }}
    >
      {/* Ground shadow */}
      <ellipse cx="14" cy="44" rx="7" ry="2" fill="rgba(0,0,0,0.45)" />
      {/* Legs */}
      <rect x="7"  y="30" width="5" height="13" rx="2.5" fill={bodyColor + 'cc'} />
      <rect x="16" y="30" width="5" height="13" rx="2.5" fill={bodyColor + 'cc'} />
      {/* Body */}
      <rect x="5" y="17" width="18" height="15" rx="3" fill={bodyColor + 'ee'} />
      {/* Body panel highlight */}
      <rect x="11" y="19" width="6" height="11" rx="2" fill={glowColor} opacity="0.22" />
      {/* Chest badge */}
      <circle cx="14" cy="22" r="2.2" fill={glowColor} opacity="0.55" />
      <circle cx="14" cy="22" r="0.9" fill="white" opacity="0.85" />
      {/* Arms */}
      <rect x="0"  y="18" width="5" height="11" rx="2.5" fill={bodyColor + 'cc'} />
      <rect x="23" y="18" width="5" height="11" rx="2.5" fill={bodyColor + 'cc'} />
      {/* Neck */}
      <rect x="11" y="12" width="6" height="7" rx="2" fill={bodyColor + 'ee'} />
      {/* Head */}
      <circle cx="14" cy="7.5" r="7.5" fill={bodyColor + 'ee'} />
      {/* Head shine */}
      <circle cx="11" cy="5" r="3.5" fill="white" opacity="0.06" />
      {/* Eyes */}
      <circle cx="11" cy="7.5" r="2.2" fill={glowColor} opacity="0.92" />
      <circle cx="17" cy="7.5" r="2.2" fill={glowColor} opacity="0.92" />
      <circle cx="11" cy="7.5" r="0.9" fill="white" opacity="0.95" />
      <circle cx="17" cy="7.5" r="0.9" fill="white" opacity="0.95" />
      {/* Eye glow rings */}
      <circle cx="11" cy="7.5" r="3.2" fill={glowColor} opacity="0.10" />
      <circle cx="17" cy="7.5" r="3.2" fill={glowColor} opacity="0.10" />
      {/* Mask */}
      {mask === 'half' && (
        <rect x="8" y="10" width="12" height="6" rx="3" fill="rgba(0,0,0,0.65)" stroke={glowColor} strokeWidth="0.6" opacity="0.95" />
      )}
      {mask === 'full' && (
        <circle cx="14" cy="7.5" r="7" fill="rgba(0,0,0,0.6)" stroke={glowColor} strokeWidth="0.7" opacity="0.95" />
      )}
      {mask === 'visor' && <>
        <rect x="7" y="4" width="14" height="7" rx="3.5" fill={glowColor} opacity="0.28" />
        <rect x="7" y="4" width="14" height="7" rx="3.5" fill="none" stroke={glowColor} strokeWidth="0.8" opacity="0.9" />
        <line x1="7" y1="7.5" x2="21" y2="7.5" stroke={glowColor} strokeWidth="0.4" opacity="0.5" />
      </>}
      {/* Crown for self */}
      {isMe && (
        <g>
          <polygon points="11,0 14,-1.5 17,0 16,2 14,1.5 12,2" fill={glowColor} opacity="0.9" />
        </g>
      )}
    </svg>
  );
}

// ── Player overlay (positioned over canvas using iso coords) ──────────

function PlayerOverlay({ player, isMe, speaking, screenX, screenY }: {
  player: SpacePlayer;
  isMe: boolean;
  speaking: boolean;
  screenX: number;
  screenY: number;
}) {
  const prevPos = useRef({ x: player.x, y: player.y });
  const [walking, setWalking] = useState(false);
  const walkRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevPos.current.x !== player.x || prevPos.current.y !== player.y) {
      prevPos.current = { x: player.x, y: player.y };
      setWalking(true);
      if (walkRef.current) clearTimeout(walkRef.current);
      walkRef.current = setTimeout(() => setWalking(false), 400);
    }
    return () => { if (walkRef.current) clearTimeout(walkRef.current); };
  }, [player.x, player.y]);

  const depth = Math.round(player.x + player.y);

  return (
    <div
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        transform: 'translate(-50%, -100%)',
        transition: 'left 0.38s cubic-bezier(0.4,0,0.2,1), top 0.38s cubic-bezier(0.4,0,0.2,1)',
        zIndex: depth + (isMe ? 100 : 10),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        pointerEvents: 'none',
      }}
    >
      {/* Chat bubble */}
      <AnimatePresence>
        {player.message && (
          <motion.div
            key={player.message + player.socketId}
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            style={{
              background: 'rgba(6,2,20,0.92)', backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12,
              padding: '5px 10px', maxWidth: 148, textAlign: 'center',
              fontSize: 11, color: 'rgba(255,255,255,0.93)',
              boxShadow: `0 4px 16px rgba(0,0,0,0.55), 0 0 12px ${player.glowColor}28`,
              marginBottom: 3, wordBreak: 'break-word', lineHeight: 1.4,
            }}
          >
            {player.message}
            <div style={{
              position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
              width: 0, height: 0,
              borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
              borderTop: '6px solid rgba(255,255,255,0.09)',
            }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Speaking ring */}
      {speaking && (
        <div style={{
          position: 'absolute', bottom: 12,
          width: 38, height: 38, borderRadius: '50%',
          border: `2px solid ${player.glowColor}`,
          boxShadow: `0 0 12px ${player.glowColor}80`,
          animation: 'vs-speak 0.65s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}

      {/* Avatar */}
      <div style={{
        animation: walking ? 'vs-walk 0.28s ease-in-out infinite' : 'vs-bob 3.2s ease-in-out infinite',
      }}>
        <IsoAvatar bodyColor={player.bodyColor} glowColor={player.glowColor} mask={player.mask} isMe={isMe} />
      </div>

      {/* Name tag */}
      <div style={{
        fontSize: 9, fontFamily: 'monospace',
        color: isMe ? player.glowColor : 'rgba(255,255,255,0.58)',
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        borderRadius: 5, padding: '1px 6px',
        border: isMe ? `1px solid ${player.glowColor}55` : '1px solid rgba(255,255,255,0.07)',
        letterSpacing: '0.04em', maxWidth: 80,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        boxShadow: isMe ? `0 0 6px ${player.glowColor}35` : 'none',
      }}>
        {isMe ? '● ' : ''}{player.name}
      </div>
    </div>
  );
}

// ── Online list sidebar ───────────────────────────────────────────────

function OnlineList({ players, mySocketId, speakingIds }: {
  players: Map<string, SpacePlayer>;
  mySocketId: string;
  speakingIds: Set<string>;
}) {
  const list = [...players.values()];
  if (list.length === 0) return null;
  return (
    <div style={{
      position: 'absolute', top: 8, left: 8, zIndex: 60,
      background: 'rgba(3,0,14,0.82)', backdropFilter: 'blur(12px)',
      borderRadius: 10, border: '1px solid rgba(155,0,255,0.15)',
      padding: '6px 9px', display: 'flex', flexDirection: 'column', gap: 5,
      maxWidth: 128, pointerEvents: 'none',
    }}>
      <span style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 1 }}>
        Online · {list.length}
      </span>
      {list.map(p => {
        const isMe = p.socketId === mySocketId;
        const speaking = isMe ? speakingIds.has('local') : speakingIds.has(p.socketId);
        return (
          <div key={p.socketId} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: speaking ? p.glowColor : p.bodyColor,
              boxShadow: speaking ? `0 0 7px ${p.glowColor}` : 'none',
              flexShrink: 0,
              animation: speaking ? 'vs-pulse-dot 0.65s ease-in-out infinite' : undefined,
            }} />
            <span style={{
              fontFamily: 'monospace', fontSize: 9,
              color: isMe ? p.glowColor : 'rgba(255,255,255,0.5)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {p.name}{isMe ? ' ●' : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Chat drawer ───────────────────────────────────────────────────────

function ChatDrawer({ history, mySocketId, open }: {
  history: { socketId: string; name: string; bodyColor: string; glowColor: string; message: string; ts: number }[];
  mySocketId: string;
  open: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [open, history.length]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: 220,
            background: 'rgba(3,0,14,0.94)', backdropFilter: 'blur(18px)',
            borderLeft: '1px solid rgba(155,0,255,0.15)', zIndex: 70,
            display: 'flex', flexDirection: 'column',
          }}
        >
          <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
            <p style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              ჩატი · {history.length}
            </p>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.length === 0 ? (
              <p style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.14)', textAlign: 'center', paddingTop: 24 }}>
                ჯერ გზავნილები არ არის
              </p>
            ) : history.map((msg, i) => {
              const isOwn = msg.socketId === mySocketId;
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 9, color: isOwn ? msg.glowColor : msg.bodyColor, opacity: 0.8 }}>
                    {isOwn ? 'მე' : msg.name}
                  </span>
                  <div style={{
                    maxWidth: '92%',
                    background: isOwn ? `${msg.glowColor}18` : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${isOwn ? msg.glowColor + '40' : 'rgba(255,255,255,0.07)'}`,
                    borderRadius: isOwn ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    padding: '5px 9px', fontSize: 12, color: 'rgba(255,255,255,0.88)',
                    wordBreak: 'break-word', lineHeight: 1.4,
                  }}>
                    {msg.message}
                  </div>
                  <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.18)' }}>
                    {new Date(msg.ts).toLocaleTimeString('ka', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Avatar customizer ─────────────────────────────────────────────────

function AvatarCustomizer({ playerName, onJoin }: {
  playerName: string;
  onJoin: (b: string, g: string, m: SpaceMask) => void;
}) {
  const [bodyColor, setBodyColor] = useState(() => localStorage.getItem(LS_BODY) ?? BODY_COLORS[0]);
  const [glowColor, setGlowColor] = useState(() => localStorage.getItem(LS_GLOW) ?? GLOW_COLORS[0]);
  const [mask, setMask] = useState<SpaceMask>(() => (localStorage.getItem(LS_MASK) as SpaceMask) ?? 'none');

  function handleJoin() {
    localStorage.setItem(LS_BODY, bodyColor);
    localStorage.setItem(LS_GLOW, glowColor);
    localStorage.setItem(LS_MASK, mask);
    onJoin(bodyColor, glowColor, mask);
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-5 px-5 py-6"
    >
      {/* Preview */}
      <div className="flex flex-col items-center gap-2">
        <div style={{
          width: 88, height: 88,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `radial-gradient(ellipse at 40% 35%, ${glowColor}1a, transparent 70%), rgba(6,2,20,.85)`,
          borderRadius: '50%',
          border: `1.5px solid ${bodyColor}55`,
          boxShadow: `0 0 0 4px ${bodyColor}20, 0 0 32px ${glowColor}30`,
        }}>
          <IsoAvatar bodyColor={bodyColor} glowColor={glowColor} mask={mask} size={1.4} isMe />
        </div>
        <p style={{ fontFamily: 'monospace', fontSize: 11, color: bodyColor, textShadow: `0 0 8px ${bodyColor}80`, letterSpacing: '0.1em' }}>
          {playerName}
        </p>
      </div>

      {/* Body color */}
      <div className="w-full">
        <p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-2">სხეულის ფერი</p>
        <div className="flex gap-2 flex-wrap">
          {BODY_COLORS.map(c => (
            <button key={c} onClick={() => setBodyColor(c)} style={{
              width: 30, height: 30, borderRadius: '50%', background: c, flexShrink: 0,
              border: bodyColor === c ? '2.5px solid white' : '2px solid transparent',
              boxShadow: bodyColor === c ? `0 0 12px ${c}, 0 0 0 2px ${c}40` : 'none',
              transition: 'all .15s',
            }} />
          ))}
        </div>
      </div>

      {/* Glow color */}
      <div className="w-full">
        <p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-2">გლოვის ფერი</p>
        <div className="flex gap-2 flex-wrap">
          {GLOW_COLORS.map(c => (
            <button key={c} onClick={() => setGlowColor(c)} style={{
              width: 30, height: 30, borderRadius: '50%', background: c, flexShrink: 0,
              border: glowColor === c ? '2.5px solid white' : '2px solid transparent',
              boxShadow: glowColor === c ? `0 0 12px ${c}, 0 0 0 2px ${c}40` : 'none',
              transition: 'all .15s',
            }} />
          ))}
        </div>
      </div>

      {/* Mask */}
      <div className="w-full">
        <p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-2">ნიღაბი</p>
        <div className="flex gap-2">
          {MASKS.map(m => (
            <button key={m.id} onClick={() => setMask(m.id)}
              className="flex-1 py-1.5 rounded-xl font-mono text-[11px] uppercase tracking-wider transition-all active:scale-95"
              style={{
                background: mask === m.id ? `${bodyColor}22` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${mask === m.id ? bodyColor + '80' : 'rgba(255,255,255,0.08)'}`,
                color: mask === m.id ? bodyColor : 'rgba(255,255,255,0.3)',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <button onClick={handleJoin}
        className="w-full py-3.5 rounded-2xl font-display font-bold text-sm uppercase tracking-widest transition-all active:scale-95"
        style={{
          background: `linear-gradient(135deg, ${bodyColor}30, ${bodyColor}15)`,
          border: `1.5px solid ${bodyColor}`,
          color: bodyColor,
          boxShadow: `0 0 28px ${bodyColor}40, inset 0 0 20px ${bodyColor}08`,
          letterSpacing: '0.14em',
        }}
      >
        Void Lounge-ში შესვლა →
      </button>

      <p className="font-mono text-[10px] text-white/20 text-center leading-relaxed">
        ხმოვანი ჩატი ავტომატურად ჩაირთება.<br />
        მიკროფონის ნებართვა საჭიროა.
      </p>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────

interface Props { onClose: () => void }

interface RoomLayout { scale: number; offsetY: number }

export function VirtualSpace({ onClose }: Props) {
  useEffect(() => {
    const el = document.getElementById('vs-styles') ?? (() => {
      const s = document.createElement('style'); s.id = 'vs-styles'; document.head.appendChild(s); return s;
    })();
    el.textContent = SPACE_CSS;
    return () => { el.textContent = ''; };
  }, []);

  const profile = useAuthStore(s => s.profile);
  const playerName = profile?.username ?? 'Player';

  const { joined, mySocketId, players, chatHistory, join, leave, moveLocal, sendChat } = useVirtualSpace();
  const { joined: voiceJoined, muted, speakingIds, status: voiceStatus, joinVoice, leaveVoice, toggleMute } = useSpaceVoice();

  const [chat, setChat] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ripples, setRipples] = useState<{ x: number; y: number; k: number }[]>([]);
  const [layout, setLayout] = useState<RoomLayout>({ scale: 1, offsetY: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef  = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => { leaveVoice(); leave(); onClose(); }, [leave, leaveVoice, onClose]);

  async function handleJoin(bodyColor: string, glowColor: string, mask: SpaceMask) {
    const ok = await join(playerName, bodyColor, glowColor, mask);
    if (ok) joinVoice();
  }

  // Canvas resize + redraw
  useEffect(() => {
    if (!joined) return;
    const world = worldRef.current;
    const canvas = canvasRef.current;
    if (!world || !canvas) return;

    function redraw() {
      const { width: W, height: H } = world!.getBoundingClientRect();
      const scale = W / CW;
      const roomH = CH * scale;
      const offsetY = Math.max(0, (H - roomH) * 0.38); // position room slightly above center

      canvas!.width  = Math.round(W);
      canvas!.height = Math.round(H);
      setLayout({ scale, offsetY });

      const ctx = canvas!.getContext('2d');
      if (!ctx) return;

      // Full canvas dark background
      ctx.fillStyle = '#06021a';
      ctx.fillRect(0, 0, W, H);

      // Ambient stars in dead space
      for (let i = 0; i < 60; i++) {
        const px = ((i * 73 + 11) % 97) / 97 * W;
        const py = ((i * 53 + 29) % 97) / 97 * H;
        const r = 0.5 + (i % 3) * 0.3;
        const alpha = 0.08 + (i % 5) * 0.04;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,180,255,${alpha})`;
        ctx.fill();
      }

      // Draw isometric room at offset
      ctx.save();
      ctx.translate(0, offsetY);
      ctx.scale(scale, scale);
      drawRoom(ctx);
      ctx.restore();
    }

    redraw();
    const ro = new ResizeObserver(redraw);
    ro.observe(world);
    return () => ro.disconnect();
  }, [joined]);

  function handleWorldTap(clientX: number, clientY: number) {
    if (!joined || !mySocketId || !worldRef.current) return;
    const rect = worldRef.current.getBoundingClientRect();
    const { scale, offsetY } = layout;

    // Convert to room-local coords
    const mx = (clientX - rect.left) / scale;
    const my = (clientY - rect.top - offsetY) / scale;

    const { col, row } = fromScreen(mx, my);
    if (isBlocked(col, row)) return;

    const { x, y } = gridToPct(col, row);
    moveLocal(mySocketId, x, y);

    // Ripple at iso tile center on screen
    const { sx, sy } = toIso(col, row);
    const screenX = sx * scale;
    const screenY = (sy + TH / 2) * scale + offsetY;
    setRipples(prev => [...prev.slice(-4), { x: screenX, y: screenY, k: Date.now() }]);
  }

  function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    const msg = chat.trim();
    if (!msg) return;
    sendChat(msg);
    setChat('');
  }

  function isSpeaking(player: SpacePlayer) {
    return player.socketId === mySocketId ? speakingIds.has('local') : speakingIds.has(player.socketId);
  }

  // Compute screen position for player overlay (feet anchor at tile bottom-center)
  function playerScreenPos(p: SpacePlayer) {
    const { col, row } = pctToGridPos(p.x, p.y);
    const { sx, sy } = toIso(col, row);
    return {
      screenX: sx * layout.scale,
      screenY: (sy + TH / 2) * layout.scale + layout.offsetY,
    };
  }

  const voiceIcon = voiceJoined ? (muted ? '🔇' : '🎤') : voiceStatus === 'failed' ? '⚠' : '…';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ background: '#06021a' }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        paddingTop: `calc(10px + env(safe-area-inset-top, 0px))`,
        background: 'rgba(3,0,14,.97)',
        borderBottom: '1px solid rgba(155,0,255,.18)',
        backdropFilter: 'blur(16px)',
        flexShrink: 0,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#9b00ff', boxShadow: '0 0 10px #9b00ff', animation: 'vs-pulse 2s ease-in-out infinite' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 14, color: 'white', letterSpacing: '0.05em' }}>
            VOID LOUNGE
          </p>
          <p style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,.25)', letterSpacing: '0.08em' }}>
            {players.size} online
          </p>
        </div>
        {joined && (
          <button
            onClick={toggleMute}
            className="w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-90"
            style={{
              background: muted ? 'rgba(255,45,85,.12)' : 'rgba(0,229,255,.08)',
              border: `1px solid ${muted ? 'rgba(255,45,85,.35)' : 'rgba(0,229,255,.25)'}`,
              fontSize: 14,
            }}
          >
            {voiceIcon}
          </button>
        )}
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-90"
          style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.4)', fontSize: 14 }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      {!joined ? (
        <div className="flex-1 overflow-y-auto" style={{ background: 'rgba(4,0,18,.98)' }}>
          <AvatarCustomizer playerName={playerName} onJoin={handleJoin} />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* World */}
          <div
            ref={worldRef}
            className="flex-1 relative overflow-hidden select-none"
            style={{ cursor: 'crosshair' }}
            onClick={e => handleWorldTap(e.clientX, e.clientY)}
            onTouchStart={e => {
              e.preventDefault();
              handleWorldTap(e.touches[0].clientX, e.touches[0].clientY);
            }}
          >
            {/* Isometric room canvas */}
            <canvas
              ref={canvasRef}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />

            {/* Player overlays */}
            {[...players.values()].map(p => {
              const { screenX, screenY } = playerScreenPos(p);
              return (
                <PlayerOverlay
                  key={p.socketId}
                  player={p}
                  isMe={p.socketId === mySocketId}
                  speaking={isSpeaking(p)}
                  screenX={screenX}
                  screenY={screenY}
                />
              );
            })}

            {/* Online list */}
            <OnlineList players={players} mySocketId={mySocketId} speakingIds={speakingIds} />

            {/* Tap ripples */}
            <AnimatePresence>
              {ripples.map(r => (
                <motion.div
                  key={r.k}
                  initial={{ scale: 0, opacity: 0.85 }}
                  animate={{ scale: 3.5, opacity: 0 }}
                  transition={{ duration: 0.55, ease: 'easeOut' }}
                  onAnimationComplete={() => setRipples(prev => prev.filter(x => x.k !== r.k))}
                  style={{
                    position: 'absolute',
                    left: r.x, top: r.y,
                    width: 22, height: 11,
                    marginLeft: -11, marginTop: -5.5,
                    borderRadius: '50%',
                    border: '1.5px solid rgba(155,0,255,.75)',
                    pointerEvents: 'none',
                  }}
                />
              ))}
            </AnimatePresence>

            {/* Move hint */}
            {players.size <= 1 && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
                <p className="font-mono text-[10px] text-white/20 tracking-wider" style={{ animation: 'vs-pulse 2.5s ease-in-out infinite' }}>
                  დააჭირე ნებისმიერ ადგილს გადასაადგილებლად
                </p>
              </div>
            )}

            {/* Chat drawer */}
            <ChatDrawer history={chatHistory} mySocketId={mySocketId} open={drawerOpen} />
          </div>

          {/* Bottom bar */}
          <form
            onSubmit={handleSendChat}
            style={{
              display: 'flex', gap: 8, padding: '8px 12px',
              paddingBottom: `calc(8px + env(safe-area-inset-bottom, 0px))`,
              background: 'rgba(3,0,14,.97)',
              borderTop: '1px solid rgba(155,0,255,.14)',
              flexShrink: 0,
            }}
          >
            <input
              value={chat}
              onChange={e => setChat(e.target.value)}
              maxLength={140}
              placeholder="გზავნილი…"
              style={{
                flex: 1, background: 'rgba(255,255,255,.04)', fontFamily: 'monospace',
                fontSize: 13, color: 'white', outline: 'none',
                padding: '8px 12px', borderRadius: 12,
                border: '1px solid rgba(255,255,255,.10)',
              }}
              onFocus={e => e.stopPropagation()}
            />
            <button type="submit" disabled={!chat.trim()} style={{
              padding: '8px 14px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13,
              background: 'rgba(155,0,255,.15)', border: '1px solid rgba(155,0,255,.4)', color: '#c084fc',
              transition: 'all .15s', flexShrink: 0,
            }}>→</button>
            <button type="button" onClick={() => setDrawerOpen(o => !o)} style={{
              padding: '8px 10px', borderRadius: 12, fontFamily: 'monospace', fontSize: 13,
              background: drawerOpen ? 'rgba(155,0,255,.18)' : 'rgba(255,255,255,.04)',
              border: `1px solid ${drawerOpen ? 'rgba(155,0,255,.45)' : 'rgba(255,255,255,.1)'}`,
              color: drawerOpen ? '#c084fc' : 'rgba(255,255,255,.4)',
              transition: 'all .15s', flexShrink: 0, position: 'relative',
            }}>
              ☰
              {chatHistory.length > 0 && !drawerOpen && (
                <span style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: '50%', background: '#9b00ff', boxShadow: '0 0 6px #9b00ff' }} />
              )}
            </button>
          </form>
        </div>
      )}
    </motion.div>
  );
}
