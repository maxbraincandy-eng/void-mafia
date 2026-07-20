/**
 * IQLogo — VOID IQ mark, hand-built as a self-contained SVG so it stays crisp
 * at any size. Recreation of the reference: purple disc, yellow lightbulb with
 * a white filament and cyan screw base, a pink "IQ" bubble, and a small bar
 * chart. `bg={false}` drops the purple disc when placing on a coloured card.
 */
export function IQLogo({ size = 56, bg = true, className }: { size?: number; bg?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} style={{ display: 'block' }} aria-label="VOID IQ">
      {bg && <circle cx={256} cy={256} r={256} fill="#6C5CB4" />}

      {/* mini bar chart (behind, bottom-right) */}
      <g fill="#8579C7">
        <rect x={356} y={360} width={20} height={40} rx={7} />
        <rect x={388} y={338} width={20} height={62} rx={7} />
        <rect x={420} y={312} width={20} height={88} rx={7} />
      </g>

      {/* lightbulb glass */}
      <path d="M182 300 C150 275 128 246 128 210 C128 143 178 96 235 96 C292 96 342 143 342 210 C342 246 320 275 288 300 Z" fill="#FFE23A" />
      {/* soft highlight */}
      <ellipse cx={192} cy={178} rx={40} ry={58} fill="#FFF07A" opacity={0.75} />

      {/* screw base */}
      <g fill="#5FD2EE">
        <rect x={186} y={300} width={98} height={22} rx={9} />
        <rect x={193} y={328} width={84} height={20} rx={9} />
        <path d="M205 354 h60 a0 0 0 0 1 0 0 v6 a22 22 0 0 1 -22 22 h-16 a22 22 0 0 1 -22 -22 v-6 z" />
      </g>
      {/* base shading lines */}
      <g stroke="#3FB9DC" strokeWidth={4} opacity={0.55} strokeLinecap="round">
        <line x1={190} y1={311} x2={280} y2={311} />
        <line x1={197} y1={338} x2={273} y2={338} />
      </g>

      {/* filament */}
      <path d="M212 300 V210 L224 190 L235 206 L246 190 L258 210 V300" fill="none" stroke="#fff" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />

      {/* IQ bubble */}
      <circle cx={376} cy={150} r={116} fill="#FF57A8" />
      <path d="M376 34 a116 116 0 0 1 0 232 a116 116 0 0 0 0 -232 Z" fill="#FF79BC" opacity={0.5} />
      {/* I */}
      <rect x={318} y={96} width={22} height={108} rx={11} fill="#fff" />
      {/* Q ring + tail */}
      <circle cx={410} cy={150} r={44} fill="none" stroke="#fff" strokeWidth={22} />
      <line x1={432} y1={172} x2={452} y2={198} stroke="#fff" strokeWidth={22} strokeLinecap="round" />
    </svg>
  );
}
