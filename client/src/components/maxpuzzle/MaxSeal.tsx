/**
 * MaxSeal — the aristocratic wax-seal mark of ბატონი მაქსის თავსატეხი:
 * a double gold ring, laurel sprigs, and a serif "M" monogram with a coronet.
 * Self-contained SVG so it stays crisp at any size.
 */
export function MaxSeal({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={{ display: 'block' }} aria-label="ბატონი მაქსის თავსატეხი">
      <defs>
        <linearGradient id="mxseal-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f2d98a" />
          <stop offset="45%" stopColor="#d9b45a" />
          <stop offset="100%" stopColor="#9a7a2e" />
        </linearGradient>
        <radialGradient id="mxseal-bg" cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#2a1f4a" />
          <stop offset="100%" stopColor="#120b22" />
        </radialGradient>
      </defs>

      {/* seal disc + double ring */}
      <circle cx={50} cy={50} r={47} fill="url(#mxseal-bg)" stroke="url(#mxseal-gold)" strokeWidth={3} />
      <circle cx={50} cy={50} r={40} fill="none" stroke="url(#mxseal-gold)" strokeWidth={1.2} opacity={0.85} />

      {/* laurel sprigs */}
      <g stroke="url(#mxseal-gold)" strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.9}>
        <path d="M22 66 q-4 -10 1 -20" />
        <path d="M22 63 q-5 -2 -7 -6 M22 57 q-5 -2 -7 -6 M23 51 q-5 -2 -6 -6" />
        <path d="M78 66 q4 -10 -1 -20" />
        <path d="M78 63 q5 -2 7 -6 M78 57 q5 -2 7 -6 M77 51 q5 -2 6 -6" />
      </g>

      {/* coronet */}
      <g fill="url(#mxseal-gold)">
        <path d="M40 27 l3.5 5 l6.5 -7 l6.5 7 l3.5 -5 l-1.5 8 h-17 z" />
        <circle cx={40} cy={26} r={1.7} /><circle cx={50} cy={23.5} r={1.7} /><circle cx={60} cy={26} r={1.7} />
      </g>

      {/* serif M monogram */}
      <g fill="url(#mxseal-gold)">
        <path d="M33 70 v-3 l3 -1 v-22 l-3 -1 v-3 h9 l8 17 l8 -17 h9 v3 l-3 1 v22 l3 1 v3 h-13 v-3 l3 -1 v-16 l-7 15 h-2.5 l-7 -15 v16 l3 1 v3 z" />
      </g>

      {/* bottom flourish */}
      <path d="M38 78 q12 6 24 0" stroke="url(#mxseal-gold)" strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.9} />
      <circle cx={50} cy={81.5} r={1.5} fill="url(#mxseal-gold)" />
    </svg>
  );
}
