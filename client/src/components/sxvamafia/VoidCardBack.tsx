/**
 * The back of a face-down card: the VOID mark.
 *
 * WHY IT IS DRAWN AND NOT AN IMAGE
 * ────────────────────────────────
 * The artwork this is based on is a 2MB PNG, and ten of these sit on screen at
 * once during the deal, at about sixty pixels each. Shipping two megabytes to
 * render a thumbnail ten times is the kind of thing that makes an app feel slow
 * on the connection most people are actually on.
 *
 * Drawn instead, it is a couple of kilobytes, it is sharp at any size on any
 * screen, and the glow can respond to state — a card you can take looks
 * different from one somebody has already taken, which an image could not do
 * without shipping a second image.
 */

interface Props {
  /** CSS size of the square mark. */
  size?: number | string;
  /** Dimmed: this card is already somebody's. */
  dim?: boolean;
  /** Lit: this card can be taken. */
  live?: boolean;
}

const PURPLE = '#a855f7';
const PURPLE_DEEP = '#7c3aed';

export function VoidCardBack({ size = '62%', dim = false, live = false }: Props) {
  const stroke = dim ? 'rgba(168,85,247,0.35)' : PURPLE;
  const glow = live ? 0.55 : dim ? 0 : 0.3;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block' }} aria-hidden>
      <defs>
        <linearGradient id="vcb-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c99bff" />
          <stop offset="55%" stopColor={PURPLE} />
          <stop offset="100%" stopColor={PURPLE_DEEP} />
        </linearGradient>
        <radialGradient id="vcb-halo" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor={PURPLE} stopOpacity="0" />
          <stop offset="100%" stopColor={PURPLE} stopOpacity={glow} />
        </radialGradient>
      </defs>

      {/* Halo, so a live card reads as live without a second asset. */}
      <circle cx="50" cy="50" r="46" fill="url(#vcb-halo)" />

      {/* The ring. */}
      <circle cx="50" cy="50" r="34" fill="none" stroke={stroke} strokeWidth="3" opacity={dim ? 0.5 : 0.9} />
      <circle cx="50" cy="50" r="39" fill="none" stroke={stroke} strokeWidth="1" opacity={dim ? 0.25 : 0.45} />

      {/* The V — two strokes meeting at a point, with the inner notch that
          makes it read as a mark rather than a letter. */}
      <path
        d="M32 32 L50 72 L68 32 L59 32 L50 54 L41 32 Z"
        fill={dim ? 'rgba(168,85,247,0.4)' : 'url(#vcb-metal)'}
      />

      {/* Corner ticks, borrowed from the frame of the original. */}
      <g stroke={stroke} strokeWidth="2" opacity={dim ? 0.2 : 0.5} strokeLinecap="round">
        <path d="M12 22 v-6 h6" /><path d="M88 22 v-6 h-6" />
        <path d="M12 78 v6 h6" /><path d="M88 78 v6 h-6" />
      </g>
    </svg>
  );
}
