import { ModeratorLevel } from '@/types/index';

interface Props {
  level: ModeratorLevel | null;
  size?: 'sm' | 'xs';
}

const LABEL: Record<ModeratorLevel, string> = {
  moderator:        'MOD',
  senior_moderator: 'SR.MOD',
  admin:            'ADMIN',
  owner:            'OWNER',
};

export function ModBadge({ level, size = 'xs' }: Props) {
  if (!level) return null;
  const label = LABEL[level];
  const isOwner = level === 'owner';
  const colorClasses = isOwner
    ? 'bg-neon-red/10 border-neon-red/30 text-neon-red text-glow-red'
    : 'bg-neon-green/10 border-neon-green/30 text-neon-green text-glow-green';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-mono font-bold tracking-wider border
      ${colorClasses}
      ${size === 'xs' ? 'text-[12px]' : 'text-xs'}`}
    >
      {label}
    </span>
  );
}
