import type { ClanRole } from '@/types/index';

interface Props {
  role: ClanRole;
  clanTag?: string;
  size?: 'xs' | 'sm';
}

const ROLE_CONFIG: Record<ClanRole, { icon: string; label: string; color: string; border: string; bg: string } | null> = {
  owner:     { icon: '👑', label: 'Clan Leader',    color: '#facc15', border: 'rgba(250,204,21,0.5)',  bg: 'rgba(250,204,21,0.12)' },
  admin:     { icon: '🛡',  label: 'Clan Admin',     color: '#c084fc', border: 'rgba(192,132,252,0.5)', bg: 'rgba(155,0,255,0.12)' },
  moderator: { icon: '🔵', label: 'Clan Moderator', color: '#22d3ee', border: 'rgba(34,211,238,0.5)',  bg: 'rgba(0,229,255,0.1)'  },
  member:    null,
};

export function ClanRoleBadge({ role, clanTag, size = 'xs' }: Props) {
  const cfg = ROLE_CONFIG[role];
  if (!cfg) return null;

  const textSize = size === 'sm' ? 'text-[12px]' : 'text-[12px]';
  const px = size === 'sm' ? 'px-1.5 py-0.5' : 'px-1 py-0.5';
  const iconSize = size === 'sm' ? 'text-xs' : 'text-[12px]';

  return (
    <span
      title={cfg.label}
      className={`inline-flex items-center gap-0.5 rounded font-mono uppercase tracking-wider font-bold ${textSize} ${px} flex-shrink-0`}
      style={{ color: cfg.color, border: `1px solid ${cfg.border}`, background: cfg.bg }}
    >
      <span className={iconSize}>{cfg.icon}</span>
      {clanTag ? clanTag : cfg.label}
    </span>
  );
}
