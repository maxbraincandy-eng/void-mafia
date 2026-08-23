import { motion } from 'framer-motion';

/**
 * A playing card, from the server's two-character notation ("As", "Td", "7h").
 *
 * Read by shape, not by counting: the pip pattern tells a nine from a seven
 * before the corner index is looked at. Everything upright — a printed card
 * flips its lower half, but a ♥ rotated by half a turn simply reads as a ♠,
 * which is worse than plain.
 */

const SUIT_SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_COLOR: Record<string, string> = { s: '#111827', h: '#c0182a', d: '#c0182a', c: '#111827' };

export function parseCardText(text: string): { rank: string; suit: string } | null {
  if (!text || text.length < 2) return null;
  const suit = text.slice(-1).toLowerCase();
  if (!SUIT_SYMBOL[suit]) return null;
  return { rank: text.slice(0, -1).toUpperCase(), suit };
}

const L = 0.34, R = 0.66, C = 0.5;
const PIPS: Record<string, Array<[number, number]>> = {
  '2':  [[C, 0.2], [C, 0.8]],
  '3':  [[C, 0.2], [C, 0.5], [C, 0.8]],
  '4':  [[L, 0.22], [R, 0.22], [L, 0.78], [R, 0.78]],
  '5':  [[L, 0.22], [R, 0.22], [C, 0.5], [L, 0.78], [R, 0.78]],
  '6':  [[L, 0.22], [R, 0.22], [L, 0.5], [R, 0.5], [L, 0.78], [R, 0.78]],
  '7':  [[L, 0.2], [R, 0.2], [C, 0.35], [L, 0.5], [R, 0.5], [L, 0.8], [R, 0.8]],
  '8':  [[L, 0.2], [R, 0.2], [C, 0.35], [L, 0.5], [R, 0.5], [C, 0.65], [L, 0.8], [R, 0.8]],
  '9':  [[L, 0.18], [R, 0.18], [L, 0.39], [R, 0.39], [C, 0.5], [L, 0.61], [R, 0.61], [L, 0.82], [R, 0.82]],
  '10': [[L, 0.17], [R, 0.17], [C, 0.285], [L, 0.4], [R, 0.4], [L, 0.6], [R, 0.6], [C, 0.715], [L, 0.83], [R, 0.83]],
};

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

const DIMS: Record<CardSize, { w: number; h: number; font: number; suit: number; r: number; p: number }> = {
  xs: { w: 30, h: 44,  font: 9,  suit: 11, r: 4,  p: 2 },
  sm: { w: 42, h: 62,  font: 12, suit: 16, r: 6,  p: 3 },
  md: { w: 56, h: 82,  font: 15, suit: 21, r: 8,  p: 4 },
  lg: { w: 72, h: 104, font: 19, suit: 27, r: 10, p: 5 },
};

interface PokerCardProps {
  /** Server notation, e.g. "As". Null or undefined renders the back. */
  card?: string | null;
  size?: CardSize;
  faceDown?: boolean;
  /** Greyed out — a folded hand, or a card that is not part of the best five. */
  dimmed?: boolean;
  /** Lit — one of the five that made the hand. */
  highlight?: boolean;
  index?: number;
  animate?: boolean;
}

export function PokerCard({
  card, size = 'md', faceDown, dimmed, highlight, index = 0, animate = false,
}: PokerCardProps) {
  const dim = DIMS[size];
  const parsed = card ? parseCardText(card) : null;

  if (faceDown || !parsed) {
    return (
      <div
        style={{
          width: dim.w, height: dim.h, borderRadius: dim.r, flexShrink: 0,
          background: 'linear-gradient(150deg,#1a1a2e 0%,#16213e 45%,#0f1729 100%)',
          border: '1px solid rgba(148,163,184,0.22)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.45)',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute', inset: dim.p + 1, borderRadius: dim.r - 2,
          border: '1px solid rgba(148,163,184,0.14)',
          background: 'repeating-linear-gradient(45deg,transparent 0 3px,rgba(148,163,184,0.07) 3px 6px)',
        }} />
      </div>
    );
  }

  const { rank, suit } = parsed;
  const color = SUIT_COLOR[suit]!;
  const symbol = SUIT_SYMBOL[suit]!;
  const pips = PIPS[rank];
  const isFace = ['J', 'Q', 'K', 'A'].includes(rank);

  const body = (
    <div
      style={{
        width: dim.w, height: dim.h, borderRadius: dim.r, flexShrink: 0, position: 'relative',
        background: 'linear-gradient(160deg,#fdfdfb 0%,#f2f0ea 100%)',
        border: highlight ? '1.5px solid rgba(56,189,248,0.9)' : '1px solid rgba(15,23,42,0.18)',
        boxShadow: highlight
          ? '0 0 0 2px rgba(56,189,248,0.25), 0 4px 14px rgba(0,0,0,0.45)'
          : '0 2px 8px rgba(0,0,0,0.4)',
        opacity: dimmed ? 0.42 : 1,
        filter: dimmed ? 'saturate(0.4)' : undefined,
        transition: 'opacity 160ms ease, filter 160ms ease',
      }}
    >
      {/* Corner index — the only part that has to be readable when cards overlap. */}
      <div style={{
        position: 'absolute', top: dim.p, left: dim.p + 1, lineHeight: 1,
        color, fontWeight: 800, fontSize: dim.font, fontFamily: 'ui-sans-serif,system-ui',
        letterSpacing: rank === '10' ? '-0.06em' : undefined,
      }}>
        {rank}
        <div style={{ fontSize: dim.font * 0.86, marginTop: 1 }}>{symbol}</div>
      </div>

      {isFace ? (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color, fontSize: dim.suit * 1.15, fontWeight: 700,
        }}>
          {symbol}
        </div>
      ) : (
        pips?.map(([x, y], i) => (
          <div key={i} style={{
            position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`,
            transform: 'translate(-50%,-50%)', color, fontSize: dim.suit * 0.62, lineHeight: 1,
          }}>
            {symbol}
          </div>
        ))
      )}
    </div>
  );

  if (!animate) return body;
  return (
    <motion.div
      initial={{ opacity: 0, y: -14, rotateY: 90 }}
      animate={{ opacity: 1, y: 0, rotateY: 0 }}
      transition={{ duration: 0.28, delay: index * 0.07, ease: [0.2, 0.8, 0.2, 1] }}
      style={{ display: 'inline-block' }}
    >
      {body}
    </motion.div>
  );
}
