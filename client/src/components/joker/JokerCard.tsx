import { motion } from 'framer-motion';
import type { Card, Suit } from '@/types/joker';

const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣', J: '🃏' };
const SUIT_COLOR:  Record<Suit, string> = { S: '#0e0926', H: '#c0182a', D: '#c0182a', C: '#0e0926', J: '#92400e' };

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
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
  onClick?: () => void;
}

export function JokerCard({
  card, selected, playable, disabled, faceDown, size = 'md', animate = false, onClick,
}: JokerCardProps) {
  const dim = size === 'sm' ? { w: 44,  h: 66,  font: 11, suit: 16, r: 6, p: 3 }
            : size === 'md' ? { w: 58,  h: 87,  font: 14, suit: 22, r: 8, p: 4 }
            :                 { w: 72,  h: 108, font: 17, suit: 28, r: 9, p: 5 };

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

  if (card.suit === 'J') {
    const inner = (
      <div
        onClick={onClick}
        style={{
          width: dim.w, height: dim.h, borderRadius: dim.r, flexShrink: 0,
          background: selected
            ? 'linear-gradient(155deg,#fde68a,#fbbf24)'
            : 'linear-gradient(155deg,#fffbeb,#fef3c7)',
          border: selected ? '2.5px solid #d97706' : playable ? '1.5px solid rgba(245,158,11,0.55)' : '1.5px solid rgba(210,165,60,0.35)',
          boxShadow: selected
            ? '0 0 0 3px rgba(217,119,6,0.3), 0 10px 24px rgba(0,0,0,0.55)'
            : playable ? '0 0 0 2px rgba(245,158,11,0.2), 0 5px 16px rgba(0,0,0,0.45)' : '0 4px 12px rgba(0,0,0,0.5)',
          opacity: disabled ? 0.28 : 1,
          cursor: onClick && !disabled ? 'pointer' : 'default',
          transform: selected ? `translateY(-${dim.h * 0.13}px)` : 'none',
          transition: 'transform 0.18s ease, box-shadow 0.18s ease',
          position: 'relative',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          userSelect: 'none',
        }}
      >
        <div style={{ position: 'absolute', top: dim.p, left: dim.p, lineHeight: 1 }}>
          <div style={{ fontSize: dim.font - 1, fontWeight: 800, color: '#92400e', fontFamily: 'Georgia,serif', lineHeight: 1 }}>JK</div>
        </div>
        <div style={{ fontSize: dim.suit, lineHeight: 1 }}>🃏</div>
        <div style={{ position: 'absolute', bottom: dim.p, right: dim.p, transform: 'rotate(180deg)', lineHeight: 1 }}>
          <div style={{ fontSize: dim.font - 1, fontWeight: 800, color: '#92400e', fontFamily: 'Georgia,serif', lineHeight: 1 }}>JK</div>
        </div>
      </div>
    );
    if (animate) {
      return <motion.div initial={{ opacity: 0, scale: 0.65, y: -12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }}>{inner}</motion.div>;
    }
    return inner;
  }

  const col = SUIT_COLOR[card.suit];

  const inner = (
    <div
      onClick={onClick}
      style={{
        width: dim.w, height: dim.h, borderRadius: dim.r, flexShrink: 0,
        background: 'linear-gradient(155deg,#fefcf8,#f4f0e6)',
        border: selected
          ? `2.5px solid ${col}`
          : playable ? '1.5px solid rgba(0,245,255,0.5)' : '1.5px solid rgba(180,160,130,0.4)',
        boxShadow: selected
          ? `0 0 0 3px ${col === '#0e0926' ? 'rgba(30,64,175,0.28)' : 'rgba(192,24,42,0.28)'}, 0 10px 24px rgba(0,0,0,0.55)`
          : playable ? '0 0 0 2px rgba(0,245,255,0.15), 0 5px 16px rgba(0,0,0,0.45)' : '0 4px 12px rgba(0,0,0,0.5)',
        opacity: disabled ? 0.28 : 1,
        cursor: onClick && !disabled ? 'pointer' : 'default',
        transform: selected ? `translateY(-${dim.h * 0.13}px)` : 'none',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        position: 'relative',
        display: 'flex', flexDirection: 'column',
        padding: dim.p, userSelect: 'none',
      }}
    >
      {/* Top-left */}
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontSize: dim.font, fontWeight: 800, color: col, fontFamily: 'Georgia,serif', lineHeight: 1 }}>
          {rankLabel(card.rank)}
        </div>
        <div style={{ fontSize: dim.font * 0.9, color: col, lineHeight: 1, marginTop: 1 }}>
          {SUIT_SYMBOL[card.suit]}
        </div>
      </div>

      {/* Center */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: dim.suit, color: col }}>
        {SUIT_SYMBOL[card.suit]}
      </div>

      {/* Bottom-right (flipped) */}
      <div style={{ lineHeight: 1, alignSelf: 'flex-end', transform: 'rotate(180deg)' }}>
        <div style={{ fontSize: dim.font, fontWeight: 800, color: col, fontFamily: 'Georgia,serif', lineHeight: 1 }}>
          {rankLabel(card.rank)}
        </div>
        <div style={{ fontSize: dim.font * 0.9, color: col, lineHeight: 1, marginTop: 1 }}>
          {SUIT_SYMBOL[card.suit]}
        </div>
      </div>
    </div>
  );

  if (animate) {
    return <motion.div initial={{ opacity: 0, scale: 0.65, y: -12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }}>{inner}</motion.div>;
  }
  return inner;
}
