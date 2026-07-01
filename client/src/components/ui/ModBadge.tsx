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
  const sizeCls = size === 'xs' ? 'text-[12px]' : 'text-xs';
  const base = `inline-flex items-center px-1.5 py-0.5 rounded font-mono font-bold tracking-wider ${sizeCls}`;

  // Senior Mod — a warm "onyx-gold" black: reads as black but the warm gold rim,
  // glow and text keep it clearly visible on the dark UI.
  if (level === 'senior_moderator') {
    return (
      <span className={base} style={{
        background: 'linear-gradient(135deg, rgba(34,29,23,0.96), rgba(12,10,8,0.98))',
        border: '1px solid rgba(196,154,92,0.5)',
        color: '#ecd4a0',
        boxShadow: '0 0 10px rgba(150,110,50,0.30), inset 0 0 8px rgba(0,0,0,0.55)',
        textShadow: '0 0 6px rgba(210,160,80,0.5)',
      }}>
        {label}
      </span>
    );
  }

  const isOwner = level === 'owner';
  const colorClasses = isOwner
    ? 'bg-neon-red/10 border-neon-red/30 text-neon-red text-glow-red'
    : 'bg-neon-green/10 border-neon-green/30 text-neon-green text-glow-green';
  return (
    <span className={`${base} border ${colorClasses}`}>
      {label}
    </span>
  );
}
