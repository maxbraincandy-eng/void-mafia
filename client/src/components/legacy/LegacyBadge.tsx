/**
 * A player's Legacy level, inline beside their name.
 *
 * This is the feature's smallest and most-rendered piece: it sits in the feed,
 * in every game lobby, in chat and on the leaderboard. Everything about it is
 * shaped by being drawn a hundred times on one screen.
 *
 * IT ASKS FOR ITSELF, AND THE ASKING IS BATCHED
 * ─────────────────────────────────────────────
 * A caller should be able to drop `<LegacyBadge userId={id} />` beside a name
 * and be done — needing to fetch levels first, and thread them down, is how a
 * surface ends up not showing them. So the badge asks the store, and the store
 * turns one screenful of asks into one request. See `legacyStore`.
 *
 * IT SHOWS NOTHING UNTIL IT KNOWS SOMETHING
 * ─────────────────────────────────────────
 * No skeleton, no spinner, no "lvl —". A placeholder beside every name is worse
 * than the information arriving a moment later, and level 1 is not a fact worth
 * a badge — almost everybody is level 1 on their first day, and a badge that
 * everybody has says nothing about anybody.
 */

import { useEffect } from 'react';
import { useLegacyStore } from '@/store/legacyStore';
import { AURA_BY_TIER } from '@/types/legacy';

interface Props {
  userId: string;
  /** Rendered a size down inside dense rows. */
  size?: 'sm' | 'md';
  /** Show it from level 1. Off by default — see the note above. */
  showAtLevelOne?: boolean;
  className?: string;
}

export function LegacyBadge({ userId, size = 'sm', showAtLevelOne = false, className }: Props) {
  const badge = useLegacyStore(s => s.badges[userId]);
  const ensure = useLegacyStore(s => s.ensure);

  useEffect(() => { if (userId) ensure([userId]); }, [userId, ensure]);

  if (!badge) return null;
  if (badge.level <= 1 && !showAtLevelOne) return null;

  const aura = badge.aura ? AURA_BY_TIER[badge.aura] : null;
  const color = aura?.color ?? '#9b8cff';
  const sm = size === 'sm';

  return (
    <span
      className={className}
      // The title is the only place the tier is named, because the badge itself
      // has room for a number and nothing else.
      title={aura ? `დონე ${badge.level} · ${aura.label}` : `დონე ${badge.level}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: sm ? 2 : 3,
        padding: sm ? '1px 5px' : '2px 7px',
        borderRadius: 999,
        background: `${color}1f`,
        border: `1px solid ${color}55`,
        color,
        fontFamily: 'monospace',
        fontSize: sm ? 9.5 : 11,
        fontWeight: 700,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    >
      {/* A dot rather than a word: "LVL" in Latin beside a Georgian name reads
          as a different alphabet arriving for no reason, and the tier colour
          already carries the meaning. */}
      <span aria-hidden style={{ width: sm ? 4 : 5, height: sm ? 4 : 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {badge.level}
    </span>
  );
}

/**
 * Warm the store for a whole list at once.
 *
 * The badges would fetch themselves anyway — this exists so a list that already
 * knows all its ids can hand them over in one go before the rows mount, which
 * turns the first paint from "names, then badges appear" into "names with
 * badges".
 */
export function usePrefetchLegacyBadges(userIds: (string | null | undefined)[]): void {
  const ensure = useLegacyStore(s => s.ensure);
  // Joined into a string so the effect compares by content: a fresh array
  // literal every render would otherwise re-fire this on every keystroke
  // anywhere on the page.
  const key = userIds.filter(Boolean).join(',');
  useEffect(() => {
    if (key) ensure(key.split(','));
  }, [key, ensure]);
}
