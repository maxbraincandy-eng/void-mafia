import type { CSSProperties, ReactNode } from 'react';
import { useNameColor } from '@/store/nameColorStore';
import { useIsVerified } from '@/store/verifiedStore';
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
  const isVerified = useIsVerified(verified ? profileId : null);

  const label = (
    <span className={className} style={{ ...style, ...(enabled && color ? { color } : null), ...(glow ? { textShadow: glow } : null) }}>
      {children ?? name}
    </span>
  );

  if (!isVerified) return label;

  // Wrapped in an inline-flex so the badge never separates from the name on a
  // wrap, and so a truncating parent still ellipsises the text rather than
  // clipping the badge off the end.
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, minWidth: 0, maxWidth: '100%' }}>
      {label}
      <VerifiedBadge size={badgeSize ?? 13} />
    </span>
  );
}
