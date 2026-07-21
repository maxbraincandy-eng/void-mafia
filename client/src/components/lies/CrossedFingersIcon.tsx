/**
 * CrossedFingersIcon — the ტყუილების ოსტატი mark: a hand with index & middle
 * fingers crossed (the universal "fingers crossed / little white lie" gesture).
 * Stroke line-art recreation of the uploaded flat icon. `color` tints the
 * strokes; `mask` fills the front finger so the crossing reads cleanly (set it
 * to roughly the surface the icon sits on).
 */
export function CrossedFingersIcon({ size = 40, className, color = '#e9d8ff', mask = '#171026' }: { size?: number; className?: string; color?: string; mask?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={{ display: 'block' }}
      fill="none" stroke={color} strokeWidth={4.4} strokeLinecap="round" strokeLinejoin="round"
      aria-label="ტყუილების ოსტატი">
      {/* two folded fingers (knuckles) on the left */}
      <rect x={17} y={36} width={12.5} height={30} rx={6.2} />
      <rect x={31} y={32} width={12.5} height={34} rx={6.2} />

      {/* palm + thumb: the crossed fingers rest on the hand, thumb curls in */}
      <path d="M62 50 q14 -1 16 14 q2 16 -6 27 q-5 7 -14 7 h-17 q-9 0 -9 -9 v-19" />
      <path d="M51 62 h13 q6 0 6 6 q0 6 -6 6 h-7 q-8 0 -8 9 v4" fill={mask} />

      {/* wrist */}
      <path d="M30 84 v11" />
      <path d="M52 89 v6" />

      {/* two crossed fingers — capsules rotated ±16° about (52,34) so they cross */}
      <g>
        <rect x={46} y={8} width={12} height={50} rx={6} transform="rotate(-16 52 34)" fill={mask} />
        <rect x={46} y={8} width={12} height={50} rx={6} transform="rotate(16 52 34)" fill={mask} />
      </g>
    </svg>
  );
}
