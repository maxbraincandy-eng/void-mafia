/**
 * PhilosopherIcon — the Philosophy category mark: a flat-style bald thinker
 * with a cream beard, raised index finger, and an idea bulb. Recreated as a
 * self-contained SVG (per the uploaded reference) so it stays crisp anywhere.
 */
export function PhilosopherIcon({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={{ display: 'block' }} aria-label="ფილოსოფიური ცდები">
      {/* idea bulb + rays */}
      <g stroke="#F2C14E" strokeWidth={3.2} strokeLinecap="round">
        <line x1={61} y1={7} x2={63.6} y2={10.8} />
        <line x1={91} y1={7} x2={88.4} y2={10.8} />
        <line x1={57} y1={18} x2={61.6} y2={19} />
        <line x1={95} y1={18} x2={90.4} y2={19} />
      </g>
      <circle cx={76} cy={16} r={9.6} fill="#F0932B" />
      <path d="M76 6.4 a9.6 9.6 0 0 0 -9.6 9.6 l5.4 0 a4.2 4.2 0 0 1 4.2 -4.2 z" fill="#F2C14E" />
      <rect x={72.8} y={25.2} width={6.4} height={4.2} rx={1.5} fill="#D8CDB8" />
      <rect x={74} y={29.4} width={4} height={2.4} rx={1.1} fill="#C9BCA4" />
      {/* back shoulder */}
      <rect x={2} y={64} width={15} height={36} rx={7.5} fill="#EFE5D3" />
      {/* tunic */}
      <path d="M14 100 C14 78 26 70 41 70 C56 70 66 79 66 100 Z" fill="#F2B01E" />
      {/* neck */}
      <rect x={35} y={58} width={14} height={14} fill="#E8823C" />
      {/* bald head */}
      <path d="M19 42 C19 22 29 12 42 12 C55 12 63 22 63 38 L63 58 L19 58 Z" fill="#F2A466" />
      {/* side hair + ear */}
      <path d="M17 28 h17 v27 a8 8 0 0 1 -8 8 h-9 z" fill="#EFE5D3" />
      <circle cx={30} cy={43} r={8} fill="#E8823C" />
      {/* beard */}
      <path d="M35 32 h25 a4 4 0 0 1 4 4 v16 c0 14 -7 22 -16 22 c-9 0 -13 -8 -13 -16 z" fill="#EFE5D3" />
      {/* eyes */}
      <circle cx={46.5} cy={30.5} r={2.5} fill="#3C3A47" />
      <circle cx={57.5} cy={30.5} r={2.5} fill="#3C3A47" />
      {/* nose */}
      <path d="M52 33.5 c3.4 0 5.4 2.4 5.4 5 c0 2.2 -1.7 3.5 -3.9 3.5 c-2.7 0 -4.4 -1.6 -4.4 -3.9 c0 -2.3 1.1 -4.6 2.9 -4.6 z" fill="#E8823C" />
      {/* mouth */}
      <rect x={46} y={49} width={10} height={3.4} rx={1.7} fill="#E8823C" />
      {/* raised finger + fist + thumb */}
      <rect x={78.5} y={50} width={7} height={24} rx={3.5} fill="#F2A466" />
      <path d="M72 71 h22 v8 a10 10 0 0 1 -10 10 h-2 a10 10 0 0 1 -10 -10 z" fill="#F2A466" />
      <rect x={90.5} y={66} width={7} height={14} rx={3.5} fill="#F2A466" />
    </svg>
  );
}
