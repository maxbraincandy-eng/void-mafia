import type { CSSProperties, ReactNode } from 'react';
import { useNameColor } from '@/store/nameColorStore';

/**
 * Renders a player's display name, applying their equipped name color
 * (resolved app-wide via nameColorStore) on top of the given className.
 * When the player has no equipped color, the className's color is used.
 *
 * `enabled={false}` skips coloring (e.g. for special-cased names like Mr Max).
 */
export function PlayerName({
  profileId, name, className, style, enabled = true, children,
}: {
  profileId?: string | null;
  name?: string;
  className?: string;
  style?: CSSProperties;
  enabled?: boolean;
  children?: ReactNode;
}) {
  const color = useNameColor(enabled ? profileId : null);
  return (
    <span className={className} style={{ ...style, ...(enabled && color ? { color } : null) }}>
      {children ?? name}
    </span>
  );
}
