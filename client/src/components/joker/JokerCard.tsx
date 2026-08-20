import { motion } from 'framer-motion';
import type { Card, Suit } from '@/types/joker';

const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣', J: '🃏' };
const SUIT_COLOR:  Record<Suit, string> = { S: '#111827', H: '#c0182a', D: '#c0182a', C: '#111827', J: '#92400e' };

export function rankLabel(rank: number): string {
  if (rank === 0)  return 'JK';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank);
}

interface JokerCardProps {
  card: Card;
  selected?: boolean;
  playable?: boolean;
  disabled?: boolean;
  faceDown?: boolean;
  /** Of the ხიშტი suit — worth seeing at a glance while you plan the hand. */
  trump?: boolean;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
  onClick?: () => void;
}

/**
 * Pip layout — where the suit marks sit on a number card.
 *
 * Read by SHAPE rather than by counting: a nine and a seven are told apart by
 * the pattern long before the corner index is looked at. Two columns down the
 * middle of the face, so they never run into the indices sitting in the
 * corners, and everything upright — a printed card flips its lower half, but a
 * ♥ rotated by half a turn simply reads as a ♠, which is worse than plain.
 */
const L = 0.34, R = 0.66, C = 0.5;
const PIPS: Record<number, Array<[x: number, y: number]>> = {
  6:  [[L, 0.22], [R, 0.22], [L, 0.5], [R, 0.5], [L, 0.78], [R, 0.78]],
  7:  [[L, 0.2], [R, 0.2], [C, 0.35], [L, 0.5], [R, 0.5], [L, 0.8], [R, 0.8]],
  8:  [[L, 0.2], [R, 0.2], [C, 0.35], [L, 0.5], [R, 0.5], [C, 0.65], [L, 0.8], [R, 0.8]],
  9:  [[L, 0.18], [R, 0.18], [L, 0.39], [R, 0.39], [C, 0.5], [L, 0.61], [R, 0.61], [L, 0.82], [R, 0.82]],
  10: [[L, 0.17], [R, 0.17], [C, 0.285], [L, 0.4], [R, 0.4], [L, 0.6], [R, 0.6], [C, 0.715], [L, 0.83], [R, 0.83]],
};

export function JokerCard({
  card, selected, playable, disabled, faceDown, trump, size = 'md', animate = false, onClick,
}: JokerCardProps) {
  const dim = size === 'sm' ? { w: 44,  h: 66,  font: 11, suit: 16, r: 6,  p: 3 }
            : size === 'md' ? { w: 58,  h: 87,  font: 14, suit: 22, r: 9,  p: 4 }
            :                 { w: 72,  h: 108, font: 17, suit: 28, r: 11, p: 5 };

  if (faceDown) {
    return (
      <div style={{
        width: dim.w, height: dim.h, borderRadius: dim.r, flexShrink: 0,
        background: 'repeating-linear-gradient(135deg,#1e1b4b 0,#1e1b4b 5px,#26236a 5px,#26236a 10px)',
        border: '1.5px solid rgba(120,80,255,0.35)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: dim.w * 0.52, height: dim.h * 0.52,
          borderRadius: dim.r - 2,
          border: '1px solid rgba(155,0,255,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(155,0,255,0.07)',
        }}>
          <span style={{ fontSize: dim.suit * 0.55, color: 'rgba(192,132,252,0.45)' }}>♦</span>
        </div>
      </div>
    );
  }

  const col = SUIT_COLOR[card.suit];
  const isJoker = card.suit === 'J';
  const label = rankLabel(card.rank);
  const isFace = card.rank >= 11 && card.rank <= 13;

  // One shared shell so a joker and a nine sit at the same height in a fan and
  // light up the same way when they can be played.
  const shell: React.CSSProperties = {
    width: dim.w, height: dim.h, borderRadius: dim.r, flexShrink: 0,
    background: isJoker
      ? 'linear-gradient(158deg,#fffdf5 0%,#fdf2d0 55%,#f8e5b0 100%)'
      : 'linear-gradient(158deg,#ffffff 0%,#fbf9f3 58%,#f0ece0 100%)',
    border: selected ? `2.5px solid ${col}`
      : trump ? '1.5px solid rgba(251,191,36,0.85)'
      : playable ? '1.5px solid rgba(0,245,255,0.5)'
      : '1.5px solid rgba(160,140,110,0.4)',
    boxShadow: selected
      ? `0 0 0 3px ${isJoker ? 'rgba(217,119,6,0.3)' : col === '#111827' ? 'rgba(30,64,175,0.26)' : 'rgba(192,24,42,0.26)'}, 0 12px 26px rgba(0,0,0,0.6)`
      : trump ? '0 0 0 2px rgba(251,191,36,0.22), 0 6px 16px rgba(0,0,0,0.5)'
      : playable ? '0 0 0 2px rgba(0,245,255,0.15), 0 5px 16px rgba(0,0,0,0.45)'
      : '0 4px 12px rgba(0,0,0,0.5)',
    opacity: disabled ? 0.28 : 1,
    cursor: onClick && !disabled ? 'pointer' : 'default',
    transform: selected ? `translateY(-${dim.h * 0.13}px)` : 'none',
    transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
    position: 'relative',
    overflow: 'hidden',
    userSelect: 'none',
  };

  const corner = (flip: boolean) => (
    <div style={{
      position: 'absolute',
      ...(flip ? { bottom: dim.p, right: dim.p } : { top: dim.p, left: dim.p }),
      transform: flip ? 'rotate(180deg)' : 'none',
      lineHeight: 1, textAlign: 'center',
    }}>
      <div style={{ fontSize: dim.font, fontWeight: 800, color: col, fontFamily: 'Georgia,serif', lineHeight: 1 }}>
        {label}
      </div>
      {!isJoker && (
        <div style={{ fontSize: dim.font * 0.85, color: col, lineHeight: 1, marginTop: 1 }}>
          {SUIT_SYMBOL[card.suit]}
        </div>
      )}
    </div>
  );

  const inner = (
    <div onClick={onClick} style={shell}>
      {/* Hairline inside the edge — what makes a rectangle read as a card. */}
      <div style={{
        position: 'absolute', inset: 2.5, borderRadius: dim.r - 3,
        border: `0.5px solid ${isJoker ? 'rgba(146,64,14,0.22)' : 'rgba(120,100,70,0.18)'}`,
        pointerEvents: 'none',
      }} />

      {corner(false)}
      {corner(true)}

      {isJoker ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: dim.suit * 1.05, filter: 'drop-shadow(0 1px 2px rgba(146,64,14,0.35))' }}>🃏</span>
        </div>
      ) : isFace || card.rank === 14 ? (
        // A court card, and the ace: one large mark, with the letter behind it.
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isFace && (
            <span style={{
              position: 'absolute', fontSize: dim.suit * 1.5, fontFamily: 'Georgia,serif',
              fontWeight: 700, color: col, opacity: 0.1, lineHeight: 1,
            }}>{label}</span>
          )}
          <span style={{ fontSize: card.rank === 14 ? dim.suit * 1.35 : dim.suit * 1.05, color: col, lineHeight: 1 }}>
            {SUIT_SYMBOL[card.suit]}
          </span>
        </div>
      ) : (
        // Number cards: the pip pattern, down the middle of the face.
        <div style={{ position: 'absolute', inset: 0 }}>
          {(PIPS[card.rank] ?? []).map(([x, y], i) => (
            <span key={i} style={{
              position: 'absolute',
              left: `${x * 100}%`, top: `${y * 100}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: dim.suit * (card.rank >= 9 ? 0.5 : 0.6), color: col, lineHeight: 1,
            }}>
              {SUIT_SYMBOL[card.suit]}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  if (animate) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.65, y: -12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}>
        {inner}
      </motion.div>
    );
  }
  return inner;
}
