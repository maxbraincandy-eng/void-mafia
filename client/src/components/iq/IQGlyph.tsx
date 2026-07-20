import type { IQCell, IQShape, IQVisual } from '@/types/iq';

/**
 * IQGlyph — renders a single VOID IQ cell (a small abstract figure) from its
 * JSON spec as inline SVG. All figures are original, procedurally drawn — no
 * copyrighted imagery. Coordinate space is a 100×100 box; the caller sizes it.
 */

const DOT_LAYOUT: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[34, 50], [66, 50]],
  3: [[50, 30], [34, 68], [66, 68]],
  4: [[34, 34], [66, 34], [34, 66], [66, 66]],
  5: [[32, 32], [68, 32], [50, 50], [32, 68], [68, 68]],
  6: [[34, 26], [66, 26], [34, 50], [66, 50], [34, 74], [66, 74]],
  7: [[32, 30], [68, 30], [32, 50], [68, 50], [50, 50], [32, 70], [68, 70]],
  8: [[30, 30], [50, 30], [70, 30], [30, 50], [70, 50], [30, 70], [50, 70], [70, 70]],
  9: [[30, 30], [50, 30], [70, 30], [30, 50], [50, 50], [70, 50], [30, 70], [50, 70], [70, 70]],
};

function polyPoints(sides: number, rot: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (-90 + rot + (i * 360) / sides) * (Math.PI / 180);
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

const ARROW_POINTS = '50,12 72,42 58,42 58,86 42,86 42,42 28,42';

function Shape({ s, color, i }: { s: IQShape; color: string; i: number }) {
  const stroke = color;
  const sw = 5;
  const fillCol = s.fill ? color : 'none';

  switch (s.t) {
    case 'poly': {
      const r = 40 * (s.size ?? 0.9);
      return <polygon key={i} points={polyPoints(s.sides ?? 4, s.rot ?? 0, r)} fill={fillCol} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />;
    }
    case 'circle':
      return <circle key={i} cx={50} cy={50} r={40 * (s.size ?? 0.9)} fill={fillCol} stroke={stroke} strokeWidth={sw} />;
    case 'ring':
      return <circle key={i} cx={50} cy={50} r={40 * (s.size ?? 0.9)} fill="none" stroke={stroke} strokeWidth={sw} />;
    case 'dots': {
      const layout = DOT_LAYOUT[Math.max(1, Math.min(9, s.n ?? 1))] ?? DOT_LAYOUT[1]!;
      return <g key={i}>{layout.map(([x, y], k) => <circle key={k} cx={x} cy={y} r={7} fill={s.fill === false ? 'none' : color} stroke={color} strokeWidth={s.fill === false ? 3 : 0} />)}</g>;
    }
    case 'arrow': {
      const t = `translate(50 50) rotate(${s.rot ?? 0}) scale(${s.mirror ? -1 : 1},1) translate(-50 -50)`;
      return <g key={i} transform={t}><polygon points={ARROW_POINTS} fill={fillCol} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" /></g>;
    }
    case 'flag': {
      const t = `translate(50 50) rotate(${s.rot ?? 0}) scale(${s.mirror ? -1 : 1},1) translate(-50 -50)`;
      return (
        <g key={i} transform={t}>
          <line x1={38} y1={18} x2={38} y2={86} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
          <polygon points="38,21 72,32 38,45" fill={color} stroke={stroke} strokeWidth={3} strokeLinejoin="round" />
        </g>
      );
    }
    case 'grid': {
      const cells: JSX.Element[] = [];
      const n = Math.max(0, Math.min(9, s.n ?? 0));
      for (let k = 0; k < 9; k++) {
        const cx = 26 + (k % 3) * 24;
        const cy = 26 + Math.floor(k / 3) * 24;
        cells.push(<rect key={k} x={cx - 9} y={cy - 9} width={18} height={18} rx={2} fill={k < n ? color : 'none'} stroke={color} strokeWidth={2.5} opacity={k < n ? 0.9 : 0.35} />);
      }
      return <g key={i}>{cells}</g>;
    }
    case 'bars': {
      const els: JSX.Element[] = [<rect key="frame" x={26} y={26} width={48} height={48} rx={3} fill="none" stroke={color} strokeWidth={3} opacity={0.4} />];
      const bw = 7;
      if (s.top) els.push(<rect key="t" x={26} y={26} width={48} height={bw} fill={color} />);
      if (s.bottom) els.push(<rect key="b" x={26} y={74 - bw} width={48} height={bw} fill={color} />);
      if (s.left) els.push(<rect key="l" x={26} y={26} width={bw} height={48} fill={color} />);
      if (s.right) els.push(<rect key="r" x={74 - bw} y={26} width={bw} height={48} fill={color} />);
      return <g key={i}>{els}</g>;
    }
    default:
      return null;
  }
}

function CellBox({ cell, size, color }: { cell: IQCell; size: number; color: string }) {
  return (
    <div className="flex items-center justify-center rounded-lg flex-shrink-0"
      style={{ width: size + 14, height: size + 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(120,200,255,0.14)' }}>
      <IQGlyph cell={cell} size={size} color={color} />
    </div>
  );
}

/** Lays out a full visual problem (sequence / matrix / analogy). Group items are
 *  rendered directly as options by the caller, so this returns null for them. */
export function IQStimulus({ visual, cellSize = 62, color = '#8ee9ff' }: { visual: IQVisual; cellSize?: number; color?: string }) {
  if (visual.type === 'sequence') {
    return (
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {visual.cells.map((c, i) => <CellBox key={i} cell={c} size={cellSize} color={color} />)}
      </div>
    );
  }
  if (visual.type === 'matrix') {
    return (
      <div className="inline-grid mx-auto gap-2" style={{ gridTemplateColumns: `repeat(${visual.cols}, min-content)` }}>
        {visual.cells.map((c, i) => <CellBox key={i} cell={c} size={cellSize} color={color} />)}
      </div>
    );
  }
  if (visual.type === 'analogy') {
    return (
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <CellBox cell={visual.a} size={cellSize} color={color} />
        <span className="font-mono text-white/40 text-lg px-0.5">→</span>
        <CellBox cell={visual.b} size={cellSize} color={color} />
        <span className="font-mono text-white/30 text-xl px-1.5">::</span>
        <CellBox cell={visual.c} size={cellSize} color={color} />
        <span className="font-mono text-white/40 text-lg px-0.5">→</span>
        <CellBox cell={{ empty: true }} size={cellSize} color={color} />
      </div>
    );
  }
  return null;
}

export function IQGlyph({ cell, size = 72, color = '#8ee9ff', className }: { cell: IQCell; size?: number; color?: string; className?: string }) {
  if ('empty' in cell) {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={{ display: 'block' }}>
        <rect x={8} y={8} width={84} height={84} rx={10} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.25)" strokeWidth={3} strokeDasharray="7 7" />
        <text x={50} y={50} textAnchor="middle" dominantBaseline="central" fontSize={44} fill="rgba(255,255,255,0.45)" fontWeight="bold">?</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={{ display: 'block' }}>
      {cell.shapes.map((s, i) => <Shape key={i} s={s} color={color} i={i} />)}
    </svg>
  );
}
