import type { Card, Suit } from '@/types/joker';

const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣', J: '🃏' };
const SUIT_COLOR:  Record<Suit, string> = { S: '#e2e8f0', H: '#f87171', D: '#f87171', C: '#e2e8f0', J: '#fbbf24' };

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
  onClick?: () => void;
}

export function JokerCard({
  card, selected, playable, disabled, faceDown, size = 'md', onClick,
}: JokerCardProps) {
  const dim = size === 'sm' ? { w: 36, h: 54, font: 10, suit: 14 }
            : size === 'lg' ? { w: 64, h: 96, font: 16, suit: 22 }
            :                 { w: 48, h: 72, font: 12, suit: 18 };

  if (faceDown) {
    return (
      <div style={{
        width: dim.w, height: dim.h, borderRadius: 6, flexShrink: 0,
        background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
        border: '1px solid rgba(155,0,255,0.4)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: dim.suit, opacity: 0.3 }}>🂠</span>
      </div>
    );
  }

  // Special joker card rendering
  if (card.suit === 'J') {
    return (
      <div
        onClick={onClick}
        style={{
          width: dim.w, height: dim.h, borderRadius: 6, flexShrink: 0,
          background: selected
            ? 'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(155,0,255,0.15))'
            : 'linear-gradient(135deg, #2a1a00, #1a0d28)',
          border: selected
            ? '2px solid #fbbf24'
            : playable
              ? '1px solid rgba(251,191,36,0.55)'
              : '1px solid rgba(251,191,36,0.25)',
          boxShadow: selected
            ? '0 0 18px rgba(251,191,36,0.55), 0 4px 12px rgba(0,0,0,0.5)'
            : playable
              ? '0 0 10px rgba(251,191,36,0.2), 0 2px 6px rgba(0,0,0,0.4)'
              : '0 2px 6px rgba(0,0,0,0.4)',
          opacity: disabled ? 0.35 : 1,
          cursor: onClick && !disabled ? 'pointer' : 'default',
          transform: selected ? 'translateY(-8px)' : 'none',
          transition: 'all 0.15s ease',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          userSelect: 'none',
        }}
      >
        <div style={{ fontSize: dim.suit, lineHeight: 1 }}>🃏</div>
        <div style={{ fontSize: dim.font - 2, fontWeight: 'bold', color: '#fbbf24', fontFamily: 'monospace', marginTop: 2 }}>
          JK
        </div>
      </div>
    );
  }

  const suitColor = SUIT_COLOR[card.suit];

  return (
    <div
      onClick={onClick}
      style={{
        width: dim.w, height: dim.h, borderRadius: 6, flexShrink: 0,
        background: selected
          ? 'linear-gradient(135deg, rgba(0,245,255,0.15), rgba(155,0,255,0.1))'
          : 'linear-gradient(135deg, #1a1035, #120d2a)',
        border: selected
          ? '2px solid #00f5ff'
          : playable
            ? '1px solid rgba(0,245,255,0.4)'
            : '1px solid rgba(255,255,255,0.12)',
        boxShadow: selected
          ? '0 0 16px rgba(0,245,255,0.4), 0 4px 12px rgba(0,0,0,0.5)'
          : playable
            ? '0 0 8px rgba(0,245,255,0.15), 0 2px 6px rgba(0,0,0,0.4)'
            : '0 2px 6px rgba(0,0,0,0.4)',
        opacity: disabled ? 0.35 : 1,
        cursor: onClick && !disabled ? 'pointer' : 'default',
        transform: selected ? 'translateY(-8px)' : 'none',
        transition: 'all 0.15s ease',
        position: 'relative',
        display: 'flex', flexDirection: 'column',
        padding: 4, userSelect: 'none',
      }}
    >
      {/* Top-left label */}
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontSize: dim.font, fontWeight: 'bold', color: suitColor, fontFamily: 'monospace' }}>
          {rankLabel(card.rank)}
        </div>
        <div style={{ fontSize: dim.font - 2, color: suitColor }}>{SUIT_SYMBOL[card.suit]}</div>
      </div>

      {/* Center suit */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: dim.suit, color: suitColor,
      }}>
        {SUIT_SYMBOL[card.suit]}
      </div>

      {/* Bottom-right label (rotated) */}
      <div style={{ lineHeight: 1, alignSelf: 'flex-end', transform: 'rotate(180deg)' }}>
        <div style={{ fontSize: dim.font, fontWeight: 'bold', color: suitColor, fontFamily: 'monospace' }}>
          {rankLabel(card.rank)}
        </div>
        <div style={{ fontSize: dim.font - 2, color: suitColor }}>{SUIT_SYMBOL[card.suit]}</div>
      </div>
    </div>
  );
}
