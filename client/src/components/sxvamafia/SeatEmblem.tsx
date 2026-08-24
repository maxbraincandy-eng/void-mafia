/**
 * A player's emblem — what stands in for a face when there is no camera.
 *
 * WHY NOT A LETTER
 * ────────────────
 * A single initial is the worst of both worlds at a twelve-seat table: two
 * players share it as often as not, and Georgian names crowd into the same few
 * letters. It also renders as a tofu box for any glyph the font is missing,
 * which is exactly what an uppercased Georgian letter does.
 *
 * So each seat gets an emblem instead: one of twelve mafia-flavoured marks,
 * chosen by hashing the player's id. Same player, same emblem, every game and
 * every device — no state, no assets, nothing to load.
 *
 * They are drawn rather than typed. An emoji would be at the mercy of whatever
 * font the phone happens to ship, and half of them would be a different picture
 * on Android than on iOS.
 */

interface Props {
  /** Stable id — the same player gets the same emblem, always. */
  seed: string;
  /** Square size — a number of pixels, or any CSS length such as '70%'. */
  size: number | string;
  /** The seat's colour; the mark is drawn in a light tint of it. */
  color: string;
}

/** Twelve marks: hat, cigar, revolver, mask, card, dice, glass, rose, watch, key, coin, match. */
const EMBLEMS: ((c: string) => JSX.Element)[] = [
  // Fedora
  c => (<g fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 60 Q50 74 82 60" /><path d="M30 60 Q30 30 50 30 Q70 30 70 60" /><path d="M30 52 Q50 58 70 52" />
  </g>),
  // Cigar
  c => (<g fill="none" stroke={c} strokeWidth="4" strokeLinecap="round">
    <rect x="20" y="46" width="52" height="14" rx="7" /><path d="M72 53 h10" />
    <path d="M26 40 q4 -8 0 -14" /><path d="M36 38 q5 -9 0 -16" />
  </g>),
  // Revolver
  c => (<g fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 44 h44 v12 H36 l-8 18 h-10 z" /><circle cx="40" cy="50" r="7" /><path d="M62 44 h18 v10 h-18" />
  </g>),
  // Domino mask
  c => (<g fill="none" stroke={c} strokeWidth="4" strokeLinejoin="round">
    <path d="M16 42 q34 -10 68 0 v10 q0 16 -18 16 q-12 0 -16 -10 q-4 10 -16 10 q-18 0 -18 -16 z" />
  </g>),
  // Playing card
  c => (<g fill="none" stroke={c} strokeWidth="4" strokeLinejoin="round">
    <rect x="30" y="22" width="40" height="56" rx="6" />
    <path d="M50 40 l10 12 -10 12 -10 -12 z" />
  </g>),
  // Dice
  c => (<g fill="none" stroke={c} strokeWidth="4">
    <rect x="26" y="26" width="48" height="48" rx="9" />
    <circle cx="40" cy="40" r="3.5" fill={c} stroke="none" />
    <circle cx="60" cy="60" r="3.5" fill={c} stroke="none" />
    <circle cx="50" cy="50" r="3.5" fill={c} stroke="none" />
  </g>),
  // Whiskey glass
  c => (<g fill="none" stroke={c} strokeWidth="4" strokeLinejoin="round">
    <path d="M30 32 h40 l-5 44 h-30 z" /><path d="M33 56 h34" />
  </g>),
  // Rose
  c => (<g fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M50 26 q14 6 14 18 q0 14 -14 18 q-14 -4 -14 -18 q0 -12 14 -18 z" />
    <path d="M50 62 v16" /><path d="M50 70 q-12 -2 -14 -10" />
  </g>),
  // Pocket watch
  c => (<g fill="none" stroke={c} strokeWidth="4" strokeLinecap="round">
    <circle cx="50" cy="54" r="22" /><path d="M50 44 v10 l7 5" /><path d="M50 32 v-8" /><path d="M42 24 h16" />
  </g>),
  // Key
  c => (<g fill="none" stroke={c} strokeWidth="4" strokeLinecap="round">
    <circle cx="36" cy="42" r="12" /><path d="M45 51 l24 24" /><path d="M60 66 l8 8" /><path d="M53 59 l8 8" />
  </g>),
  // Coin
  c => (<g fill="none" stroke={c} strokeWidth="4">
    <circle cx="50" cy="50" r="24" /><circle cx="50" cy="50" r="14" />
    <path d="M50 36 v28" strokeLinecap="round" />
  </g>),
  // Match
  c => (<g fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M38 76 l24 -40" /><path d="M62 36 q10 -6 6 -16 q-2 10 -12 6 q-6 6 6 10 z" />
  </g>),
];

/** FNV-1a — small, fast, and stable across every device. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function seatEmblemIndex(seed: string): number {
  return hash(seed) % EMBLEMS.length;
}

export function SeatEmblem({ seed, size, color }: Props) {
  const draw = EMBLEMS[seatEmblemIndex(seed)]!;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block' }} aria-hidden>
      {draw(color)}
    </svg>
  );
}
