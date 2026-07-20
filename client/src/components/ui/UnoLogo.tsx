/**
 * UnoLogo — stylized red-oval UNO mark (tilted ellipse, yellow italic
 * lettering with a blue outline) as a self-contained SVG for the games hub.
 */
export function UnoLogo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={{ display: 'block' }} aria-label="UNO">
      <g transform="rotate(-14 50 50)">
        <ellipse cx={50} cy={50} rx={46} ry={30} fill="#fff" />
        <ellipse cx={50} cy={50} rx={43} ry={27} fill="#E3243B" />
        <text x={50} y={60} textAnchor="middle" fontFamily="Arial, sans-serif" fontSize={30} fontWeight={900} fontStyle="italic"
          fill="#FFE24A" stroke="#2B3A8F" strokeWidth={1.6} style={{ paintOrder: 'stroke' }}>UNO</text>
      </g>
    </svg>
  );
}
