import { useSocialStore } from '@/store/socialStore';
import { useSettingsStore } from '@/store/settingsStore';
import { haptic } from '@/lib/haptics';
import { VoidCommunityIcon } from '@/components/ui/VoidCommunityIcon';
import { VoidGamesIcon } from '@/components/ui/VoidGamesIcon';
import { VoidClansIcon } from '@/components/ui/VoidClansIcon';
import { VoidStatsIcon } from '@/components/ui/VoidStatsIcon';
import { VoidProfileIcon } from '@/components/ui/VoidProfileIcon';

export type NavTab = 'rooms' | 'games' | 'community' | 'clans' | 'leaderboard' | 'profile' | 'mod' | 'economy' | 'replays';

interface Props {
  active: NavTab;
  isMod: boolean;
  onChange: (tab: NavTab) => void;
  onMoreClick: () => void;
}

// ── Void Mafia logo SVG ────────────────────────────────────────────────────
// Hexagonal double frame + bold V + node — cyberpunk neon aesthetic
function VoidMafiaIcon({ size = 18, active = false, color = 'currentColor' }: { size?: number; active?: boolean; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: 'block',
        filter: active ? `drop-shadow(0 0 4px ${color}) drop-shadow(0 0 8px ${color})` : 'none',
        transition: 'filter 0.2s ease',
      }}
    >
      {/* Outer hexagon */}
      <path
        d="M10 1.5L17.3 5.75V14.25L10 18.5L2.7 14.25V5.75L10 1.5Z"
        stroke={color}
        strokeWidth="1.1"
        strokeLinejoin="round"
        opacity={active ? 1 : 0.6}
      />
      {/* Inner hexagon ring — depth effect */}
      <path
        d="M10 4.5L14.9 7.25V12.75L10 15.5L5.1 12.75V7.25L10 4.5Z"
        stroke={color}
        strokeWidth="0.55"
        strokeLinejoin="round"
        opacity={active ? 0.45 : 0.22}
      />
      {/* Corner accent marks — cyberpunk tick marks */}
      <path d="M10 1.5V3.2" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity={active ? 0.9 : 0.35} />
      <path d="M10 16.8V18.5" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity={active ? 0.9 : 0.35} />
      {/* Bold V — Void */}
      <path
        d="M7 7.5L10 12.8L13 7.5"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Node at V apex — targeting reticle */}
      <circle cx="10" cy="12.8" r="1.1" fill={color} opacity={active ? 1 : 0.7} />
      {/* Flanking dots for active state */}
      {active && (
        <>
          <circle cx="10" cy="3.7" r="0.6" fill={color} opacity="0.8" />
          <circle cx="10" cy="16.3" r="0.6" fill={color} opacity="0.8" />
        </>
      )}
    </svg>
  );
}

// ── Tab definitions ─────────────────────────────────────────────────────────
type TabDef = { id: NavTab; label: string } & (
  | { kind: 'emoji'; icon: string }
  | { kind: 'svg'; renderIcon: (active: boolean, color: string) => React.ReactElement }
);

const LEFT_TABS: TabDef[] = [
  {
    id: 'community', kind: 'svg', label: 'კომუნითი',
    renderIcon: (a, c) => <VoidCommunityIcon size={18} active={a} color={c} />,
  },
  {
    id: 'games', kind: 'svg', label: 'თამაშები',
    renderIcon: (a, c) => <VoidGamesIcon size={18} active={a} color={c} />,
  },
  {
    id: 'clans', kind: 'svg', label: 'კლანები',
    renderIcon: (a, c) => <VoidClansIcon size={18} active={a} color={c} />,
  },
];

const RIGHT_TABS: TabDef[] = [
  {
    id: 'leaderboard', kind: 'svg', label: 'ტოპი',
    renderIcon: (a, c) => <VoidStatsIcon size={18} active={a} color={c} />,
  },
  {
    id: 'profile', kind: 'svg', label: 'პროფილი',
    renderIcon: (a, c) => <VoidProfileIcon size={18} active={a} color={c} />,
  },
];

const NEON_TAB_COLORS: Record<string, string> = {
  community: '#9b00ff', games: '#f59e0b', clans: '#ef4444',
  leaderboard: '#facc15', profile: '#00e5ff',
};
const GLASS_TAB_COLORS: Record<string, string> = {
  community: '#8b5cf6', games: '#fbbf24', clans: '#f87171',
  leaderboard: '#fde68a', profile: '#67e8f9',
};

// ── NavItem ─────────────────────────────────────────────────────────────────
function NavItem({ tab, active, color, onPress }: { tab: TabDef; active: boolean; color: string; onPress: (id: NavTab) => void }) {
  return (
    <button
      onClick={() => onPress(tab.id)}
      className="flex flex-col items-center justify-end flex-1 transition-all duration-150 active:scale-90 relative"
      style={{ color: active ? color : 'rgba(255,255,255,0.28)', height: 76, paddingBottom: 14 }}
    >
      {active && (
        <span
          className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
          style={{ background: color, boxShadow: `0 0 6px ${color}` }}
        />
      )}

      <span className="flex items-center justify-center mb-1" style={{ height: 18 }}>
        {tab.kind === 'svg'
          ? tab.renderIcon(active, color)
          : (
            <span
              className="text-base leading-none"
              style={{ filter: active ? `drop-shadow(0 0 5px ${color})` : 'none' }}
            >
              {tab.icon}
            </span>
          )
        }
      </span>

      <span
        className="font-mono leading-none text-center w-full overflow-hidden"
        style={{ fontSize: 'clamp(7px, 2vw, 9px)', letterSpacing: '0.01em', display: 'block' }}
      >
        {tab.label}
      </span>
    </button>
  );
}

// ── BottomNav ───────────────────────────────────────────────────────────────
export function BottomNav({ active, onChange, onMoreClick }: Props) {
  const { unreadDmCount } = useSocialStore();
  const themeMode = useSettingsStore(s => s.themeMode) ?? 'void-neon';
  const TAB_COLORS = themeMode === 'minimal-glass' ? GLASS_TAB_COLORS : NEON_TAB_COLORS;
  const isRooms = active === 'rooms';

  function go(tab: NavTab) { haptic('selection'); onChange(tab); }
  function goMore() { haptic('tap'); onMoreClick(); }

  return (
    <nav
      className="vm-bottom-nav fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: 'var(--vm-nav-bg)',
        borderTop: '1px solid var(--vm-nav-border)',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -4px 32px rgba(0,0,0,0.65)',
        transition: 'background 180ms ease, border-color 180ms ease',
      }}
    >
      <div className="flex items-end max-w-lg mx-auto px-2" style={{ height: 76 }}>

        {/* Left 3 tabs */}
        {LEFT_TABS.map(tab => (
          <NavItem key={tab.id} tab={tab} active={active === tab.id} color={TAB_COLORS[tab.id] ?? '#ffffff'} onPress={go} />
        ))}

        {/* CENTER FAB — Mafia */}
        <div className="flex-1 flex justify-center" style={{ position: 'relative', height: 76 }}>
          <button
            onClick={() => go('rooms')}
            className="absolute transition-all duration-200 active:scale-90 flex flex-col items-center justify-center"
            style={{
              width: 58, height: 58, borderRadius: '50%', bottom: 8,
              background: isRooms ? 'var(--vm-fab-on)' : 'var(--vm-fab-off)',
              boxShadow: isRooms ? 'var(--vm-fab-shadow-on)' : 'var(--vm-fab-shadow-off)',
              zIndex: 2,
            }}
            aria-label="Mafia"
          >
            <span style={{ fontSize: 26, lineHeight: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>🎩</span>
            <span className="font-mono uppercase text-white/70 leading-none" style={{ fontSize: 8, letterSpacing: '0.08em', marginTop: 2 }}>
              მაფია
            </span>
          </button>
        </div>

        {/* Right 2 tabs */}
        {RIGHT_TABS.map(tab => (
          <NavItem key={tab.id} tab={tab} active={active === tab.id} color={TAB_COLORS[tab.id] ?? '#ffffff'} onPress={go} />
        ))}

        {/* ☰ მეტი */}
        <button
          onClick={goMore}
          className="flex flex-col items-center justify-end flex-1 transition-all duration-150 active:scale-90 relative"
          style={{ color: 'rgba(255,255,255,0.28)', height: 76, paddingBottom: 14 }}
        >
          <span className="text-base leading-none mb-1">☰</span>
          <span className="font-mono uppercase leading-none text-center relative" style={{ fontSize: 9, letterSpacing: '0.03em' }}>
            მეტი
            {unreadDmCount > 0 && (
              <span
                className="absolute -top-1 -right-2 min-w-[13px] h-3 rounded-full bg-neon-pink text-void text-[8px] font-bold flex items-center justify-center px-0.5 leading-none"
                style={{ boxShadow: '0 0 6px rgba(255,0,204,0.6)' }}
              >
                {unreadDmCount > 9 ? '9+' : unreadDmCount}
              </span>
            )}
          </span>
        </button>

      </div>
    </nav>
  );
}
