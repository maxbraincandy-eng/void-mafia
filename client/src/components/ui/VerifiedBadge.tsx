// ── Verified badge ────────────────────────────────────────────────────
// Hand-built SVG, not an emoji: ✓ and ☑️ render differently on every platform
// and none of them look like a verification mark. This is the scalloped disc
// everyone recognises, drawn once and scaled by font size.
//
// The scallop is generated rather than hand-plotted, so the point count can be
// changed without redrawing the path by hand.
import { memo, useMemo } from 'react';

/** Points of a scalloped (cog-like) circle — the badge's silhouette. */
function scallopPath(points = 11, outer = 15.5, inner = 12.6): string {
  const step = Math.PI / points;   // half-step: alternate outer/inner
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = i * step - Math.PI / 2;
    const x = 16 + Math.cos(a) * r;
    const y = 16 + Math.sin(a) * r;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return d + 'Z';
}

let uid = 0;

export type VerifiedTone = 'owner' | 'staff';

export const VerifiedBadge = memo(function VerifiedBadge({
  size = 14, tone = 'owner', title = 'ვერიფიცირებული',
}: { size?: number; tone?: VerifiedTone; title?: string }) {
  const id = useMemo(() => `vb${++uid}`, []);
  const d = useMemo(() => scallopPath(), []);
  // Owners get the app's gold; staff a cooler blue, so the two never read as
  // the same authority.
  const [c1, c2] = tone === 'owner' ? ['#ffd45a', '#e0a020'] : ['#5ab0ff', '#2f7fe0'];

  return (
    <svg
      viewBox="0 0 32 32" width={size} height={size}
      style={{ display: 'inline-block', verticalAlign: '-0.14em', flexShrink: 0 }}
      role="img" aria-label={title}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <path d={d} fill={`url(#${id})`} />
      {/* The tick is a stroked polyline, so it stays crisp at 12px where a
          filled glyph turns to mush. */}
      <path
        d="M10.4 16.3 L14.3 20.2 L21.8 12.4"
        fill="none" stroke="#0f0a02" strokeWidth="3.1"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
});
