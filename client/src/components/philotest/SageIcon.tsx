/**
 * SageIcon — the Philosophical Personality Test mark: a classical bearded
 * philosopher in a toga holding a scroll. Self-contained SVG recreation of the
 * uploaded flat icon so it stays crisp at any size.
 */
export function SageIcon({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={{ display: 'block' }} aria-label="ფილოსოფიური პიროვნების ტესტი">
      {/* scroll */}
      <rect x={72} y={30} width={21} height={50} rx={3} fill="#F2E6CF" />
      <g stroke="#4A4A52" strokeWidth={2.3} strokeLinecap="round">
        <line x1={77} y1={42} x2={88} y2={42} /><line x1={77} y1={50} x2={88} y2={50} /><line x1={77} y1={58} x2={88} y2={58} />
      </g>
      <rect x={68} y={26} width={10} height={13} rx={5} fill="#DCC59A" />
      <path d="M72 76 q3 10 13 10 q10 0 10 -8 q0 -6 -8 -6 q6 2 6 6 q0 4 -6 4 q-8 0 -11 -8 z" fill="#DCC59A" />

      {/* toga + brown drape */}
      <path d="M18 100 C18 76 30 66 44 66 C58 66 66 76 66 100 Z" fill="#F3CFA9" />
      <path d="M20 82 C34 90 52 92 63 86 L66 94 C52 100 30 98 18 88 Z" fill="#6E4B3A" />
      <path d="M26 68 C34 74 44 76 52 74 L48 82 C40 82 32 78 26 72 Z" fill="#7A5442" />

      {/* neck */}
      <rect x={37} y={56} width={14} height={14} fill="#E8B98C" />

      {/* curly hair + beard */}
      <g fill="#9CA2AA">
        <circle cx={30} cy={30} r={8} /><circle cx={26} cy={40} r={7.5} /><circle cx={28} cy={49} r={7} />
        <circle cx={34} cy={22} r={7.5} /><circle cx={44} cy={19} r={8} /><circle cx={54} cy={22} r={7.5} />
        <circle cx={60} cy={30} r={8} /><circle cx={63} cy={40} r={7.5} /><circle cx={60} cy={49} r={7} />
        <circle cx={34} cy={50} r={6.5} /><circle cx={40} cy={55} r={7} /><circle cx={48} cy={55} r={7} /><circle cx={54} cy={50} r={6.5} /><circle cx={44} cy={58} r={6.5} />
      </g>

      {/* face */}
      <path d="M32 28 C32 21 37 17 44 17 C51 17 56 21 56 28 L56 39 C56 45 51 49 44 49 C37 49 32 45 32 39 Z" fill="#F3CFA9" />
      <path d="M37 40 q7 4 14 0 q-3 4.5 -7 4.5 q-4 0 -7 -4.5 z" fill="#8A9099" />
      <circle cx={40} cy={32} r={2.1} fill="#3A3A42" />
      <circle cx={49} cy={32} r={2.1} fill="#3A3A42" />
      <g stroke="#8A9099" strokeWidth={2} strokeLinecap="round"><line x1={37} y1={28} x2={42} y2={29} /><line x1={47} y1={29} x2={52} y2={28} /></g>
      <path d="M45 33 c2.3 0 3.7 1.8 3.7 3.5 c0 1.5 -1.2 2.4 -2.7 2.4 c-2 0 -3.2 -1.2 -3.2 -2.8 c0 -1.6 0.8 -3.1 2.2 -3.1 z" fill="#E8B98C" />
    </svg>
  );
}
