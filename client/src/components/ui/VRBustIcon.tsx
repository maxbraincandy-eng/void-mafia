/**
 * VRBustIcon — Virtual Space mark. A stylized SVG bust wearing a VR headset
 * with a blue ponytail, in the same palette as the reference render. Self-
 * contained so it stays crisp at any size.
 */
export function VRBustIcon({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={{ display: 'block' }} aria-label="Virtual Space">
      {/* ponytail */}
      <path d="M58 14 C 80 20, 82 46, 75 68 C 72 78, 64 79, 60 73 C 66 54, 65 33, 54 20 Z" fill="#16345f" />
      {/* shoulders / pedestal */}
      <path d="M20 97 L50 72 L80 97 Z" fill="#b4c3d8" />
      {/* neck */}
      <rect x={42} y={58} width={16} height={22} rx={7} fill="#aebfd4" />
      {/* head */}
      <ellipse cx={49} cy={40} rx={23} ry={27} fill="#b6c6db" />
      {/* crown hair */}
      <path d="M27 35 C 28 15, 47 11, 60 17 C 50 13, 34 17, 33 37 Z" fill="#16345f" />
      {/* side pads */}
      <rect x={22} y={40} width={6} height={13} rx={3} fill="#9fc0cf" />
      <rect x={72} y={40} width={6} height={13} rx={3} fill="#9fc0cf" />
      {/* visor */}
      <rect x={25} y={32} width={50} height={21} rx={10} fill="#1a2740" />
      <rect x={28} y={35} width={44} height={12} rx={6} fill="#243350" />
      {/* screws */}
      <g fill="#cdd6e2">
        <circle cx={31} cy={37.5} r={1.7} /><circle cx={69} cy={37.5} r={1.7} />
        <circle cx={31} cy={49} r={1.7} /><circle cx={69} cy={49} r={1.7} />
      </g>
      {/* nose / lips hint */}
      <path d="M46 56 q3 3 6 0" stroke="#95a7be" strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <path d="M45 62 q4 3 8 0" stroke="#8fa2b9" strokeWidth={1.6} fill="none" strokeLinecap="round" />
      {/* earring */}
      <circle cx={30} cy={55} r={2.6} fill="none" stroke="#d9a24a" strokeWidth={1.5} />
    </svg>
  );
}
