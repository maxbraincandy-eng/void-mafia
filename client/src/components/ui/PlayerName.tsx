import type { CSSProperties, ReactNode } from 'react';
import { useNameColor } from '@/store/nameColorStore';
import { useVerifiedTier } from '@/store/verifiedStore';
import { nameColorGlow } from '@/constants/cosmetics';
import { VerifiedBadge } from './VerifiedBadge';

/**
 * Renders a player's display name, applying their equipped name color
 * (resolved app-wide via nameColorStore) on top of the given className.
 * When the player has no equipped color, the className's color is used.
 *
 * It also carries the verification badge, because this is the one component
 * every surface already uses to draw a name — feed, comments, chat, lounge,
 * leaderboards. Putting the badge anywhere else would mean adding it in a
 * dozen places and missing some.
 *
 * `enabled={false}` skips coloring (e.g. for special-cased names like Mr Max).
 * `verified={false}` suppresses the badge where it would be noise (a name
 * inside a dense one-line list, say).
 */
export function PlayerName({
  profileId, name, className, style, enabled = true, verified = true, badgeSize, children,
}: {
  profileId?: string | null;
  name?: string;
  className?: string;
  style?: CSSProperties;
  enabled?: boolean;
  verified?: boolean;
  badgeSize?: number;
  children?: ReactNode;
}) {
  const color = useNameColor(enabled ? profileId : null);
  const glow = enabled && color ? nameColorGlow(color) : undefined;
  const tier = useVerifiedTier(verified ? profileId : null);

  // `vm-select` because a name is very often the thing someone wants to copy —
  // to search for it, to paste it into a message — and names are drawn inside
  // buttons, which are unselectable by default so that dragging a control does
  // not highlight its label.
  // A verified name shimmers. The sheen is built AROUND the equipped colour
  // rather than replacing it — someone who bought a name colour and then bought
  // a badge should end up with both, not with the second overwriting the first.
  // Falls back to the badge's own palette when no colour is equipped.
  const shimmer = tier
    ? (() => {
        const base = (enabled && color) || (tier === 'owner' ? '#f5c451' : '#a78bfa');
        return {
          backgroundImage: `linear-gradient(100deg, ${base} 0%, ${base} 38%, #ffffff 50%, ${base} 62%, ${base} 100%)`,
          backgroundSize: '260% 100%',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
          animation: 'vmNameShine 4.2s linear infinite',
        } as CSSProperties;
      })()
    : null;

  const label = (
    <span
      className={`vm-select${className ? ` ${className}` : ''}`}
      // The glow is dropped while shimmering: a text-shadow still paints under
      // transparent-filled text, so it would read as a blurred duplicate name.
      style={{ ...style, ...(enabled && color ? { color } : null), ...(glow && !shimmer ? { textShadow: glow } : null), ...shimmer }}
    >
      {children ?? name}
    </span>
  );

  if (!tier) return label;

  // Wrapped in an inline-flex so the badge never separates from the name on a
  // wrap, and so a truncating parent still ellipsises the text rather than
  // clipping the badge off the end.
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, minWidth: 0, maxWidth: '100%' }}>
      {label}
      <VerifiedBadge size={badgeSize ?? 13} tone={tier === 'owner' ? 'owner' : 'staff'} />
    </span>
  );
}
