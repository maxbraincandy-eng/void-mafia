/**
 * NinjaEmblem — Codenames mark: a dark shield with a cyan aura, silver-haired
 * masked ninja with glowing eyes, crossed katana hilts, and a banner.
 * Stylized SVG recreation of the uploaded emblem so it stays crisp anywhere.
 */
export function NinjaEmblem({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={{ display: 'block' }} aria-label="Codenames">
      {/* cyan aura */}
      <path d="M50 2 C60 10 68 8 72 16 C80 14 84 22 82 30 L86 34 L80 40 L84 48 L76 52 L78 62 L50 96 L22 62 L24 52 L16 48 L20 40 L14 34 L18 30 C16 22 20 14 28 16 C32 8 40 10 50 2 Z" fill="#25C8F2" />
      {/* dark shield */}
      <path d="M50 8 C58 14 66 13 70 19 C76 19 80 26 78 33 L81 37 L76 42 L79 50 L72 54 L73 62 L50 90 L27 62 L28 54 L21 50 L24 42 L19 37 L22 33 C20 26 24 19 30 19 C34 13 42 14 50 8 Z" fill="#171B26" />
      {/* crossed katana hilts */}
      <g stroke="#8892A6" strokeWidth={6} strokeLinecap="round">
        <line x1={24} y1={26} x2={34} y2={38} />
        <line x1={76} y1={26} x2={66} y2={38} />
      </g>
      <g stroke="#39404F" strokeWidth={3} strokeLinecap="round">
        <line x1={24} y1={26} x2={34} y2={38} />
        <line x1={76} y1={26} x2={66} y2={38} />
      </g>
      {/* silver spiky hair */}
      <path d="M32 34 L38 22 L44 30 L50 18 L56 30 L62 22 L68 34 L64 40 L36 40 Z" fill="#DDE3EC" />
      {/* face band */}
      <rect x={36} y={37} width={28} height={12} rx={4} fill="#C9885A" />
      {/* glowing eyes */}
      <path d="M39 41 l8 2 l-1 4 l-7 -2 z" fill="#4FE3FF" />
      <path d="M61 41 l-8 2 l1 4 l7 -2 z" fill="#4FE3FF" />
      {/* mask */}
      <path d="M35 48 h30 l-4 14 c-3 5 -8 8 -11 8 c-3 0 -8 -3 -11 -8 z" fill="#232936" />
      <path d="M40 52 h20 M39 57 h17" stroke="#3A4354" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      {/* banner */}
      <path d="M26 66 L74 66 L70 76 L50 84 L30 76 Z" fill="#2A3040" />
      <path d="M26 66 L74 66 L70 76 L50 84 L30 76 Z" fill="none" stroke="#25C8F2" strokeWidth={1.6} />
      <circle cx={50} cy={73} r={3.4} fill="#4FE3FF" />
    </svg>
  );
}
