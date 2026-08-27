/**
 * The character, composited from its slots.
 *
 * WHY LAYERS AND NOT ONE IMAGE
 * ────────────────────────────
 * A player's look is a base (their photo, or the emoji standing in for one) and
 * then whatever they have earned on top: a frame, an aura, a badge. Baked into
 * one image, every combination is a separate file and unlocking a frame means
 * regenerating every avatar that could wear it. Composited, a new cosmetic is a
 * new layer and nothing that already exists has to change.
 *
 * WHY IT IS DRAWN AND NOT SHIPPED
 * ───────────────────────────────
 * The aura and the frame are CSS and SVG rather than assets. They have to
 * render at 22px beside a name in a lobby and at 96px on a profile, they have
 * to animate at the top tier, and they have to be recoloured per tier — a
 * sprite would need a file per size per tier, and would still be the wrong one
 * on a high-density screen.
 *
 * ONE COMPONENT FOR EVERY SURFACE
 * ───────────────────────────────
 * Profile, feed, lobby, chat and leaderboard all render this. That is the point
 * of the feature: the same character everywhere. A second implementation for
 * "the small one" is how the small one ends up a level behind.
 */

import type { AuraTier, LegacyAvatarConfig } from '@/types/legacy';
import { AURA_BY_TIER } from '@/types/legacy';

interface Props {
  config: LegacyAvatarConfig;
  /** Diameter in pixels. Everything inside scales from this. */
  size?: number;
  /** Draw the aura. Off in a dense list where twenty glows is soup. */
  showAura?: boolean;
  /** The level, printed on a chip at the bottom edge. */
  level?: number;
  className?: string;
}

/**
 * Frame colours by cosmetic id.
 *
 * The ids come from the existing cosmetics blob (`frame_bronze`, `frame_silver`,
 * …), so this reads what players already own rather than inventing a parallel
 * set of frames that would have to be granted all over again.
 */
const FRAME_COLORS: Record<string, string> = {
  frame_bronze: '#cd7f32',
  frame_silver: '#c0c8d8',
  frame_gold: '#ffcc33',
  frame_cyber_don: '#00f5ff',
  frame_legend: '#c084fc',
};

/** An aura is a ring of the tier's colour; the top tier is the only one that moves. */
function auraStyle(tier: AuraTier, size: number): React.CSSProperties {
  const meta = AURA_BY_TIER[tier];
  const spread = Math.max(4, Math.round(size * 0.13));
  return {
    boxShadow: `0 0 ${spread}px ${Math.round(spread / 2)}px ${meta.color}66, 0 0 ${spread * 2}px ${meta.color}33`,
    // Only the legendary tier animates. If every tier pulsed, the top one would
    // not be a reward — and a feed of twenty breathing avatars is a distraction
    // rather than a flourish.
    animation: tier === 'legendary' ? 'legacyAuraPulse 2.6s ease-in-out infinite' : undefined,
  };
}

export function LegacyAvatar({ config, size = 44, showAura = true, level, className }: Props) {
  const aura = showAura ? config.aura : null;
  const frameColor = config.frame ? (FRAME_COLORS[config.frame] ?? '#9b8cff') : null;
  const ring = Math.max(1.5, Math.round(size * 0.045));

  return (
    <div className={className} style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {/* Aura — behind everything, and outside the frame so it reads as a glow
          around the player rather than a thicker border. */}
      {aura && (
        <div aria-hidden style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          ...auraStyle(aura, size),
        }} />
      )}

      {/* Base: the photo, or the emoji standing in for one. */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden',
        background: '#151022',
        border: frameColor ? `${ring}px solid ${frameColor}` : '1px solid rgba(255,255,255,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.5), lineHeight: 1,
      }}>
        {config.base
          ? <img src={config.base} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span>{config.baseEmoji || '👤'}</span>}
      </div>

      {/* Level chip. Below a certain size the digits are unreadable and the chip
          is just a smudge over the face, so it simply is not drawn. */}
      {level !== undefined && size >= 34 && (
        <span style={{
          position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)',
          background: aura ? AURA_BY_TIER[aura].color : '#2a2240',
          color: aura === 'silver' || aura === 'gold' ? '#140f22' : '#fff',
          fontFamily: 'monospace', fontWeight: 700,
          fontSize: Math.max(8, Math.round(size * 0.2)),
          lineHeight: 1, padding: `${Math.round(size * 0.04)}px ${Math.round(size * 0.1)}px`,
          borderRadius: 999, border: '1px solid rgba(0,0,0,0.4)',
          whiteSpace: 'nowrap',
        }}>{level}</span>
      )}

      {/* Badge overlay — a small mark in the corner, above the frame. */}
      {config.badge && (
        <span aria-hidden style={{
          position: 'absolute', top: -1, right: -1,
          width: Math.round(size * 0.3), height: Math.round(size * 0.3),
          borderRadius: '50%', background: '#151022',
          border: '1px solid rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: Math.round(size * 0.18),
        }}>★</span>
      )}
    </div>
  );
}

/**
 * The keyframes the legendary aura uses.
 *
 * Mounted once by whatever renders a Legacy surface, rather than living in the
 * global stylesheet: this is the only thing that needs it, and a rule in
 * globals.css for one component is a rule nobody can find later.
 */
export function LegacyAvatarStyles() {
  return (
    <style>{`
      @keyframes legacyAuraPulse {
        0%, 100% { opacity: 0.65; }
        50%      { opacity: 1; }
      }
    `}</style>
  );
}
