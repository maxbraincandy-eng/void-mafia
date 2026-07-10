import { motion } from 'framer-motion';
import type { UnoCard } from '@/types/uno';
import { tNow } from '@/store/langStore';

const COLOR_BG: Record<string, string> = {
  red:    'linear-gradient(135deg, #ff1a3a 0%, #cc0022 100%)',
  blue:   'linear-gradient(135deg, #0057ff 0%, #0033cc 100%)',
  green:  'linear-gradient(135deg, #00c951 0%, #008b35 100%)',
  yellow: 'linear-gradient(135deg, #ffcc00 0%, #cc9900 100%)',
  wild:   'linear-gradient(135deg, #ff1a3a 0%, #ff7700 30%, #ffcc00 50%, #00c951 70%, #0057ff 100%)',
};

const COLOR_BORDER: Record<string, string> = {
  red:    'rgba(255,26,58,0.8)',
  blue:   'rgba(0,87,255,0.8)',
  green:  'rgba(0,201,81,0.8)',
  yellow: 'rgba(255,204,0,0.8)',
  wild:   'rgba(168,85,247,0.9)',
};

const COLOR_GLOW: Record<string, string> = {
  red:    'rgba(255,26,58,0.5)',
  blue:   'rgba(0,87,255,0.5)',
  green:  'rgba(0,201,81,0.5)',
  yellow: 'rgba(255,204,0,0.5)',
  wild:   'rgba(168,85,247,0.6)',
};

function cardLabel(card: UnoCard): string {
  if (card.type === 'number') return String(card.value ?? 0);
  if (card.type === 'skip') return '⊘';
  if (card.type === 'reverse') return '⇄';
  if (card.type === 'draw2') return '+2';
  if (card.type === 'wild') return '★';
  if (card.type === 'wild4') return '+4';
  return '?';
}

function cardSymbol(card: UnoCard): string {
  if (card.type === 'number') return String(card.value ?? 0);
  if (card.type === 'skip') return '⊘';
  if (card.type === 'reverse') return '⇄';
  if (card.type === 'draw2') return '+2';
  if (card.type === 'wild') return 'W';
  if (card.type === 'wild4') return 'W+4';
  return '?';
}

interface UnoCardProps {
  card: UnoCard;
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  playable?: boolean;
  onClick?: () => void;
  speaking?: boolean;
}

export function UnoCardComponent({ card, size = 'md', selected, playable, onClick, speaking }: UnoCardProps) {
  const bg = COLOR_BG[card.color] ?? COLOR_BG.wild!;
  const border = COLOR_BORDER[card.color] ?? COLOR_BORDER.wild!;
  const glow = COLOR_GLOW[card.color] ?? COLOR_GLOW.wild!;
  const label = cardLabel(card);

  const dims = {
    sm:  { w: 44,  h: 62,  font: 14, corner: 8  },
    md:  { w: 60,  h: 84,  font: 18, corner: 10 },
    lg:  { w: 80,  h: 112, font: 24, corner: 14 },
  }[size];

  const isWild = card.color === 'wild';

  return (
    <motion.button
      onClick={onClick}
      disabled={!onClick}
      whileTap={onClick ? { scale: 0.92 } : undefined}
      animate={selected ? { y: -10, scale: 1.05 } : { y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      style={{
        width: dims.w,
        height: dims.h,
        borderRadius: dims.corner,
        flexShrink: 0,
        background: bg,
        border: `2px solid ${selected ? '#ffffff' : border}`,
        boxShadow: selected
          ? `0 0 0 2px #fff, 0 0 20px ${glow}, 0 4px 16px rgba(0,0,0,0.5)`
          : speaking
            ? `0 0 0 3px #22c55e, 0 0 20px rgba(34,197,94,0.6)`
            : playable
              ? `0 0 12px ${glow}, 0 2px 8px rgba(0,0,0,0.4)`
              : `0 2px 6px rgba(0,0,0,0.3)`,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        opacity: !playable && onClick ? 0.55 : 1,
        touchAction: 'manipulation',
      }}
    >
      {/* Center oval */}
      <div style={{
        position: 'absolute',
        width: '70%', height: '85%',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.25)',
        transform: 'rotate(-30deg)',
      }} />
      {/* Main label */}
      <span style={{
        position: 'relative',
        zIndex: 1,
        fontSize: dims.font,
        fontWeight: 900,
        fontFamily: 'monospace',
        color: isWild ? '#fff' : card.color === 'yellow' ? '#1a0a00' : '#fff',
        textShadow: isWild ? '0 0 12px rgba(255,255,255,0.8)' : '0 1px 3px rgba(0,0,0,0.4)',
        letterSpacing: -0.5,
        userSelect: 'none',
      }}>
        {label}
      </span>
      {/* Corner labels */}
      <span style={{
        position: 'absolute', top: 2, left: 4,
        fontSize: dims.font * 0.45,
        fontWeight: 700, fontFamily: 'monospace',
        color: isWild ? '#fff' : card.color === 'yellow' ? '#1a0a00' : '#fff',
        opacity: 0.85,
        userSelect: 'none',
      }}>
        {label}
      </span>
      <span style={{
        position: 'absolute', bottom: 2, right: 4,
        fontSize: dims.font * 0.45,
        fontWeight: 700, fontFamily: 'monospace',
        color: isWild ? '#fff' : card.color === 'yellow' ? '#1a0a00' : '#fff',
        opacity: 0.85, transform: 'rotate(180deg)',
        userSelect: 'none',
      }}>
        {label}
      </span>
      {/* Playable glow ring */}
      {playable && !selected && (
        <div style={{
          position: 'absolute', inset: -3,
          borderRadius: dims.corner + 2,
          border: `2px solid ${border}`,
          opacity: 0.5,
          pointerEvents: 'none',
        }} />
      )}
    </motion.button>
  );
}

/** Back-face card (hidden hand) */
export function UnoCardBack({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = {
    sm:  { w: 36, h: 50,  corner: 6  },
    md:  { w: 50, h: 70,  corner: 8  },
    lg:  { w: 64, h: 90,  corner: 10 },
  }[size];

  return (
    <div style={{
      width: dims.w, height: dims.h,
      borderRadius: dims.corner,
      background: 'linear-gradient(135deg, #1a0540 0%, #0a0220 100%)',
      border: '2px solid rgba(168,85,247,0.4)',
      boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 4,
        borderRadius: dims.corner - 2,
        background: 'linear-gradient(135deg, #3b0764, #1e0a3a)',
        border: '1px solid rgba(168,85,247,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: dims.w * 0.35, fontWeight: 900, color: '#c084fc', fontFamily: 'monospace' }}>U</span>
      </div>
    </div>
  );
}

/** Color chip for the current color indicator */
export function ColorChip({ color }: { color: string | null }) {
  if (!color) return null;
  const bg = COLOR_BG[color] ?? COLOR_BG.wild!;
  const label = (tNow().misc as unknown as Record<string,string>)[`unoColor_${color}`] ?? '?';
  return (
    <div style={{
      width: 36, height: 36,
      borderRadius: '50%',
      background: bg,
      border: `3px solid rgba(255,255,255,0.3)`,
      boxShadow: `0 0 16px ${COLOR_GLOW[color] ?? 'rgba(168,85,247,0.5)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 13, color: '#fff' }}>{label}</span>
    </div>
  );
}

export { cardLabel, cardSymbol };
