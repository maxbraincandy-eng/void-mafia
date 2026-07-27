/**
 * LogicLogo — ფორმალური ლოგიკის აკადემიის ნიშანი, hand-built as a self-contained
 * SVG so it stays crisp at any size (the reference art is a raster icon).
 *
 * Recreation of the reference: a yellow rounded tile scattered with faint
 * equations, a dark head in profile with the brain drawn as a single winding
 * groove, and a black band across the bottom. `label={false}` drops the band
 * for small placements, where the words would be unreadable anyway.
 */
export function LogicLogo({ size = 56, label = true, className }: { size?: number; label?: boolean; className?: string }) {
  const ink = '#161a20';
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} style={{ display: 'block' }} aria-label="ფორმალური ლოგიკის აკადემია">
      <defs>
        <clipPath id="ll-clip"><rect x={0} y={0} width={512} height={512} rx={104} /></clipPath>
        <linearGradient id="ll-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFD83A" />
          <stop offset="55%" stopColor="#F9C81C" />
          <stop offset="100%" stopColor="#EFB70B" />
        </linearGradient>
        {/* the diagonal sheen the reference has across the lower-right */}
        <linearGradient id="ll-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="48%" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="48.1%" stopColor="#000000" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.06" />
        </linearGradient>
      </defs>

      <g clipPath="url(#ll-clip)">
        <rect x={0} y={0} width={512} height={512} fill="url(#ll-bg)" />

        {/* faint formula wash — decorative, deliberately unreadable at small sizes */}
        <g fill={ink} opacity={0.14} fontFamily="Georgia, 'Times New Roman', serif" fontStyle="italic">
          <text x={18} y={52} fontSize={30}>y = (x−a)(x+a)</text>
          <text x={26} y={104} fontSize={26}>3y² = 0</text>
          <text x={196} y={96} fontSize={26}>log(x/y) = log x − log y</text>
          <text x={14} y={152} fontSize={26}>2x + 3ax² + b</text>
          <text x={358} y={150} fontSize={26}>∫ dx</text>
          <text x={10} y={206} fontSize={26}>√(1 − 9x²)</text>
          <text x={370} y={210} fontSize={26}>p(x) + 2x</text>
          <text x={12} y={262} fontSize={26}>a|a + bi|</text>
          <text x={372} y={266} fontSize={26}>a² = c²</text>
          <text x={16} y={318} fontSize={26}>8/(x−1)</text>
          <text x={368} y={320} fontSize={26}>a(b + c)</text>
          <text x={10} y={368} fontSize={26}>ax² + bx + c</text>
        </g>

        {/* head in profile, facing left — one closed silhouette */}
        <path
          fill={ink}
          d="M300 78
             C232 62 160 96 132 158
             C118 190 120 214 108 238
             C100 254 86 268 82 282
             C78 296 92 302 104 306
             C112 309 114 312 113 322
             C111 340 118 352 136 356
             C146 358 148 362 147 372
             C145 392 152 404 170 408
             C184 411 190 418 190 432
             L190 470
             L330 470
             L330 402
             C330 382 340 368 356 352
             C392 316 410 268 404 216
             C396 148 362 92 300 78 Z"
        />

        {/* brain: one continuous winding groove, cut out of the head */}
        <g fill="none" stroke="url(#ll-bg)" strokeWidth={17} strokeLinecap="round" strokeLinejoin="round">
          <path d="M186 196
                   C186 160 216 136 252 136
                   C292 136 318 160 322 194" />
          <path d="M170 236
                   C160 214 168 190 188 180" />
          <path d="M204 232
                   C196 212 208 194 228 192
                   C246 190 258 202 256 220" />
          <path d="M288 178
                   C310 178 322 194 318 214
                   C314 232 298 240 284 234" />
          <path d="M196 274
                   C182 268 176 252 184 240" />
          <path d="M232 268
                   C216 264 210 248 220 238" />
          <path d="M276 268
                   C296 264 306 248 298 236" />
          <path d="M214 302
                   C206 292 208 280 218 276" />
          <path d="M258 306
                   C250 292 256 280 268 278" />
          {/* the stem running down toward the neck */}
          <path d="M240 320 C240 340 250 352 264 356" />
        </g>

        {/* black band with the wordmark */}
        {label && (
          <>
            <rect x={0} y={340} width={512} height={172} fill="#0E1116" />
            <text x={256} y={402} textAnchor="middle" fill="#ffffff"
              fontFamily="Helvetica, Arial, sans-serif" fontWeight="700" fontSize={62}>Logical</text>
            <text x={256} y={472} textAnchor="middle" fill="#ffffff"
              fontFamily="Helvetica, Arial, sans-serif" fontWeight="700" fontSize={62}>Reasoning</text>
          </>
        )}

        {/* corner sheen last, over everything */}
        <rect x={0} y={0} width={512} height={512} fill="url(#ll-sheen)" />
      </g>
    </svg>
  );
}

export default LogicLogo;
