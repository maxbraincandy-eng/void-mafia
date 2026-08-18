import { useSocialStore } from '@/store/socialStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useT, useLangStore } from '@/store/langStore';
import { haptic } from '@/lib/haptics';
import { VoidCommunityIcon } from '@/components/ui/VoidCommunityIcon';
import { VoidGamesIcon } from '@/components/ui/VoidGamesIcon';
import { VoidProfileIcon } from '@/components/ui/VoidProfileIcon';

// 'worlds' is not a page — it opens the 3D spaces over whatever is behind it.
// It is in this union because the nav addresses it like any other destination.
export type NavTab = 'rooms' | 'games' | 'community' | 'clans' | 'leaderboard' | 'profile' | 'worlds' | 'mod' | 'economy' | 'replays';

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

// ქომუნითი · თამაშები · მაფია — [3D სივრცე] — პროფილი · მეტი
// Mafia used to be the raised centre button. The 3D spaces are the thing worth
// pointing at now, so they take the pedestal and mafia sits back among the
// ordinary tabs, where its label finally reads at the same size as the rest.
const LEFT_TABS: TabDef[] = [
  {
    id: 'community', kind: 'svg', label: 'კომუნითი',
    renderIcon: (a, c) => <VoidCommunityIcon size={22} active={a} color={c} />,
  },
  {
    id: 'games', kind: 'svg', label: 'თამაშები',
    renderIcon: (a, c) => <VoidGamesIcon size={22} active={a} color={c} />,
  },
  { id: 'rooms', kind: 'emoji', icon: '🎩', label: 'მაფია' },
];

const RIGHT_TABS: TabDef[] = [
  {
    id: 'profile', kind: 'svg', label: 'პროფილი',
    renderIcon: (a, c) => <VoidProfileIcon size={22} active={a} color={c} />,
  },
];

const NEON_TAB_COLORS: Record<string, string> = {
  community: '#9b00ff', games: '#f59e0b', rooms: '#c084fc', profile: '#00e5ff',
};
const GLASS_TAB_COLORS: Record<string, string> = {
  community: '#8b5cf6', games: '#fbbf24', rooms: '#c4b5fd', profile: '#67e8f9',
};
const GRAPHITE_TAB_COLORS: Record<string, string> = {
  community: '#7c93ff', games: '#d0a95a', rooms: '#a89ad0', profile: '#6bc4c4',
};

// ── NavItem ─────────────────────────────────────────────────────────────────
// Georgian glyphs are wider than Latin/Cyrillic, so long labels
// (კომუნითი / თამაშები / პროფილი) need a touch less size and no
// letter-spacing; keep the roomier style for en/ru.
function labelStyle(ka: boolean): React.CSSProperties {
  return ka
    ? { fontSize: 'clamp(9px, 2.7vw, 10.5px)', fontWeight: 600, letterSpacing: 0, display: 'block' }
    : { fontSize: 'clamp(9.5px, 2.9vw, 11.5px)', fontWeight: 600, letterSpacing: '0.02em', display: 'block' };
}

function NavItem({ tab, active, color, onPress, label, ka }: { tab: TabDef; active: boolean; color: string; onPress: (id: NavTab) => void; label: string; ka: boolean }) {
  return (
    <button
      onClick={() => onPress(tab.id)}
      className="flex flex-col items-center justify-end flex-1 transition-all duration-150 active:scale-90 relative"
      style={{ color: active ? color : 'rgba(255,255,255,0.34)', height: 84, paddingBottom: 15, gap: 3 }}
    >
      {active && (
        <span
          className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-0.5 rounded-full"
          style={{ background: color, boxShadow: `0 0 6px ${color}` }}
        />
      )}

      <span className="flex items-center justify-center" style={{ height: 24 }}>
        {tab.kind === 'svg'
          ? tab.renderIcon(active, color)
          : (
            <span
              className="leading-none"
              style={{ fontSize: 21, filter: active ? `drop-shadow(0 0 5px ${color})` : 'none' }}
            >
              {tab.icon}
            </span>
          )
        }
      </span>

      <span
        className="font-mono leading-none text-center w-full overflow-hidden whitespace-nowrap"
        style={{ ...labelStyle(ka), textOverflow: 'ellipsis' }}
      >
        {label}
      </span>
    </button>
  );
}

// ── BottomNav ───────────────────────────────────────────────────────────────
export function BottomNav({ active, onChange, onMoreClick }: Props) {
  const { unreadDmCount } = useSocialStore();
  const themeMode = useSettingsStore(s => s.themeMode) ?? 'void-neon';
  const TAB_COLORS = themeMode === 'minimal-glass' ? GLASS_TAB_COLORS : themeMode === 'graphite' ? GRAPHITE_TAB_COLORS : NEON_TAB_COLORS;
  const isWorlds = active === 'worlds';
  const t = useT();
  const ka = useLangStore(s => s.lang) === 'ka';
  const navLabel = (id: NavTab) => (t.nav as Record<string, string>)[id] ?? id;

  function go(tab: NavTab) { haptic('selection'); onChange(tab); }
  function goMore() { haptic('tap'); onMoreClick(); }

  return (
    <nav
      /* Position comes from .vm-bottom-nav, which floats it above the page. */
      className="vm-bottom-nav fixed z-50"
      style={{
        backgroundColor: 'var(--vm-nav-bg)',
        border: '1px solid var(--vm-nav-border)',
        borderRadius: 24,
        // A shadow that falls DOWNWARD, because the bar is now above the page
        // rather than attached to its edge.
        boxShadow: '0 10px 34px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.05) inset',
        transition: 'background-color 180ms ease, border-color 180ms ease',
      }}
    >
      <div className="flex items-end max-w-lg mx-auto px-2" style={{ height: 84 }}>

        {/* Left tabs */}
        {LEFT_TABS.map(tab => (
          <NavItem key={tab.id} tab={tab} ka={ka} label={navLabel(tab.id)} active={active === tab.id} color={TAB_COLORS[tab.id] ?? '#ffffff'} onPress={go} />
        ))}

        {/* CENTER FAB — 3D სივრცე */}
        <div className="flex-1 flex justify-center" style={{ position: 'relative', height: 84 }}>
          <button
            onClick={() => go('worlds')}
            className="absolute transition-all duration-200 active:scale-90 flex flex-col items-center justify-center"
            style={{
              // Larger and lifted higher than the pedestal mafia sat on, and in
              // its own warm colour rather than the app-wide purple, because the
              // point of moving it here was to make it the thing you notice.
              width: 66, height: 66, borderRadius: '50%', bottom: 14,
              background: isWorlds
                ? 'linear-gradient(150deg, #ffb45c, #ff6a2b 45%, #a855f7)'
                : 'linear-gradient(150deg, #ff9a3c, #e8551f 55%, #7c3aed)',
              boxShadow: isWorlds
                ? '0 0 0 2px rgba(255,154,60,0.55), 0 0 30px rgba(255,106,43,0.7), 0 6px 18px rgba(0,0,0,0.6)'
                : '0 0 0 1.5px rgba(255,154,60,0.4), 0 0 20px rgba(232,85,31,0.45), 0 6px 18px rgba(0,0,0,0.5)',
              zIndex: 2,
            }}
            aria-label="3D Space"
          >
            <span style={{ fontSize: 27, lineHeight: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>🔥</span>
            {/* "3D სივრცე" is wider than "მაფია" was; without the tighter
                tracking it wraps inside a 62px circle. */}
            <span className="font-mono uppercase text-white/85 leading-none whitespace-nowrap"
              style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.02em', marginTop: 3 }}>
              {t.nav.worlds}
            </span>
          </button>
        </div>

        {/* Right tabs */}
        {RIGHT_TABS.map(tab => (
          <NavItem key={tab.id} tab={tab} ka={ka} label={navLabel(tab.id)} active={active === tab.id} color={TAB_COLORS[tab.id] ?? '#ffffff'} onPress={go} />
        ))}

        {/* ☰ მეტი */}
        <button
          onClick={goMore}
          className="flex flex-col items-center justify-end flex-1 transition-all duration-150 active:scale-90 relative"
          style={{ color: 'rgba(255,255,255,0.34)', height: 84, paddingBottom: 15, gap: 3 }}
        >
          <span className="leading-none flex items-center justify-center" style={{ fontSize: 20, height: 24 }}>☰</span>
          <span className="font-mono uppercase leading-none text-center relative" style={labelStyle(ka)}>
            {t.nav.more}
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
