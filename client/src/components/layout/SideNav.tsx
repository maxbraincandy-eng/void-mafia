import { useSocialStore } from '@/store/socialStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useT } from '@/store/langStore';
import { haptic } from '@/lib/haptics';
import { VoidCommunityIcon } from '@/components/ui/VoidCommunityIcon';
import { VoidGamesIcon } from '@/components/ui/VoidGamesIcon';
import { VoidClansIcon } from '@/components/ui/VoidClansIcon';
import { VoidStatsIcon } from '@/components/ui/VoidStatsIcon';
import { VoidProfileIcon } from '@/components/ui/VoidProfileIcon';
import type { NavTab } from './BottomNav';

interface Props {
  active: NavTab;
  isMod: boolean;
  onChange: (tab: NavTab) => void;
  onMoreClick: () => void;
}

type Item = { id: NavTab; label: string; color: string } & (
  | { kind: 'emoji'; icon: string }
  | { kind: 'svg'; renderIcon: (active: boolean, color: string) => React.ReactElement }
);

const NEON_COLORS: Record<string, string> = {
  rooms: '#9b00ff', community: '#9b00ff', games: '#f59e0b',
  clans: '#ef4444', leaderboard: '#facc15', profile: '#00e5ff',
};
const GLASS_COLORS: Record<string, string> = {
  rooms: '#8b5cf6', community: '#8b5cf6', games: '#fbbf24',
  clans: '#f87171', leaderboard: '#fde68a', profile: '#67e8f9',
};

function items(colors: Record<string, string>): Item[] {
  return [
    { id: 'rooms', kind: 'emoji', icon: '🎩', label: 'rooms', color: colors.rooms },
    { id: 'community', kind: 'svg', label: 'community', color: colors.community,
      renderIcon: (a, c) => <VoidCommunityIcon size={22} active={a} color={c} /> },
    { id: 'games', kind: 'svg', label: 'games', color: colors.games,
      renderIcon: (a, c) => <VoidGamesIcon size={22} active={a} color={c} /> },
    { id: 'clans', kind: 'svg', label: 'clans', color: colors.clans,
      renderIcon: (a, c) => <VoidClansIcon size={22} active={a} color={c} /> },
    { id: 'leaderboard', kind: 'svg', label: 'leaderboard', color: colors.leaderboard,
      renderIcon: (a, c) => <VoidStatsIcon size={22} active={a} color={c} /> },
    { id: 'profile', kind: 'svg', label: 'profile', color: colors.profile,
      renderIcon: (a, c) => <VoidProfileIcon size={22} active={a} color={c} /> },
  ];
}

// Desktop-only left navigation rail. On mobile the BottomNav is used instead;
// this component is hidden below the lg breakpoint by its wrapper in App.
export function SideNav({ active, onChange, onMoreClick }: Props) {
  const { unreadDmCount } = useSocialStore();
  const themeMode = useSettingsStore(s => s.themeMode) ?? 'void-neon';
  const colors = themeMode === 'minimal-glass' ? GLASS_COLORS : NEON_COLORS;
  const t = useT();
  const navLabel = (id: NavTab) => (t.nav as Record<string, string>)[id] ?? id;

  function go(tab: NavTab) { haptic('selection'); onChange(tab); }
  function goMore() { haptic('tap'); onMoreClick(); }

  return (
    <nav
      className="hidden lg:flex fixed top-0 left-0 bottom-0 z-40 flex-col"
      style={{
        width: 248,
        background: 'var(--vm-nav-bg)',
        borderRight: '1px solid var(--vm-nav-border)',
        boxShadow: '4px 0 32px rgba(0,0,0,0.45)',
      }}
    >
      {/* Brand */}
      <button
        onClick={() => go('rooms')}
        className="flex items-center gap-3 px-5 h-[72px] flex-shrink-0 transition-opacity hover:opacity-90"
      >
        <span style={{ fontSize: 30, lineHeight: 1, filter: 'drop-shadow(0 2px 6px rgba(155,0,255,0.5))' }}>🎩</span>
        <span
          className="font-display font-bold tracking-widest text-left leading-tight"
          style={{ fontSize: 15, background: 'linear-gradient(120deg,#c084fc,#00e5ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
        >
          VOID<br />MAFIA
        </span>
      </button>

      <div className="h-px mx-4 flex-shrink-0" style={{ background: 'var(--vm-nav-border)' }} />

      {/* Nav items */}
      <div className="flex-1 overflow-y-auto py-3 px-3 flex flex-col gap-1">
        {items(colors).map(item => {
          const isActive = active === item.id;
          const color = item.color ?? '#ffffff';
          return (
            <button
              key={item.id}
              onClick={() => go(item.id)}
              className="group relative flex items-center gap-3.5 rounded-xl px-3.5 py-3 transition-all active:scale-[0.98]"
              style={{
                background: isActive ? `${color}14` : 'transparent',
                border: isActive ? `1px solid ${color}40` : '1px solid transparent',
                color: isActive ? color : 'rgba(255,255,255,0.55)',
              }}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-full"
                  style={{ background: color, boxShadow: `0 0 8px ${color}` }}
                />
              )}
              <span className="flex items-center justify-center flex-shrink-0" style={{ width: 24, height: 24 }}>
                {item.kind === 'svg'
                  ? item.renderIcon(isActive, color)
                  : <span style={{ fontSize: 21, lineHeight: 1, filter: isActive ? `drop-shadow(0 0 5px ${color})` : 'none' }}>{item.icon}</span>}
              </span>
              <span
                className="font-display font-semibold tracking-wide truncate"
                style={{ fontSize: 14.5 }}
              >
                {navLabel(item.id)}
              </span>
            </button>
          );
        })}
      </div>

      {/* More */}
      <div className="flex-shrink-0 p-3 border-t" style={{ borderColor: 'var(--vm-nav-border)' }}>
        <button
          onClick={goMore}
          className="relative flex items-center gap-3.5 rounded-xl px-3.5 py-3 w-full transition-all active:scale-[0.98] hover:bg-white/[0.04]"
          style={{ color: 'rgba(255,255,255,0.55)' }}
        >
          <span className="flex items-center justify-center flex-shrink-0" style={{ width: 24, height: 24, fontSize: 20 }}>☰</span>
          <span className="font-display font-semibold tracking-wide" style={{ fontSize: 14.5 }}>{t.nav.more}</span>
          {unreadDmCount > 0 && (
            <span
              className="ml-auto min-w-[18px] h-[18px] rounded-full bg-neon-pink text-void text-[10px] font-bold flex items-center justify-center px-1 leading-none"
              style={{ boxShadow: '0 0 6px rgba(255,0,204,0.6)' }}
            >
              {unreadDmCount > 9 ? '9+' : unreadDmCount}
            </span>
          )}
        </button>
      </div>
    </nav>
  );
}
