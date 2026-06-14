import type { RankTier } from '@/types/index';

const TIER_COLORS: Record<RankTier, string> = {
  unranked:  '#6b7280',
  bronze:    '#cd7f32',
  silver:    '#c0c0c0',
  gold:      '#ffd700',
  platinum:  '#e5e4e2',
  diamond:   '#00f5ff',
  master:    '#9b00ff',
};

const TIER_ICONS: Record<RankTier, string> = {
  unranked:  '◇',
  bronze:    '🥉',
  silver:    '🥈',
  gold:      '🥇',
  platinum:  '💿',
  diamond:   '💎',
  master:    '👑',
};

const TIER_LABELS: Record<RankTier, string> = {
  unranked:  'Unranked',
  bronze:    'Bronze',
  silver:    'Silver',
  gold:      'Gold',
  platinum:  'Platinum',
  diamond:   'Diamond',
  master:    'Master',
};

interface RatingBadgeProps {
  tier: RankTier | string;
  elo?: number;
  size?: 'sm' | 'md';
  showElo?: boolean;
}

export function RatingBadge({ tier, elo, size = 'md', showElo = true }: RatingBadgeProps) {
  const t = (tier as RankTier) in TIER_COLORS ? (tier as RankTier) : 'unranked';
  const color = TIER_COLORS[t];
  const icon = TIER_ICONS[t];
  const label = TIER_LABELS[t];

  if (size === 'sm') {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-mono font-bold"
        style={{
          fontSize: '10px',
          color,
          background: `${color}18`,
          border: `1px solid ${color}35`,
        }}
      >
        <span style={{ fontSize: '11px' }}>{icon}</span>
        <span>{label}</span>
        {showElo && elo != null && (
          <span style={{ color: `${color}bb` }}>{elo}</span>
        )}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono font-bold"
      style={{
        fontSize: '12px',
        color,
        background: `${color}14`,
        border: `1px solid ${color}30`,
        boxShadow: t !== 'unranked' ? `0 0 8px ${color}20` : undefined,
      }}
    >
      <span style={{ fontSize: '14px' }}>{icon}</span>
      <span>{label}</span>
      {showElo && elo != null && (
        <span
          className="px-1 py-0.5 rounded"
          style={{
            fontSize: '11px',
            color: `${color}cc`,
            background: `${color}10`,
          }}
        >
          {elo} ELO
        </span>
      )}
    </span>
  );
}
