import { useSocialStore } from '@/store/socialStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useT, useLangStore } from '@/store/langStore';
// Imported rather than referenced by path: Vite stamps a content hash into the
// filename, so the URL changes whenever the picture does. Served from public/
// the names were stable, and the server marks static files immutable for a
// year — which froze the old artwork in every browser that had already seen it.
import communityMark from '@/assets/nav/community.webp';
import communityIdle from '@/assets/nav/community-idle.webp';
import gamesMark from '@/assets/nav/games.webp';
import gamesIdle from '@/assets/nav/games-idle.webp';
import mafiaMark from '@/assets/nav/mafia.webp';
import mafiaIdle from '@/assets/nav/mafia-idle.webp';
import worldsMark from '@/assets/nav/worlds.webp';
import worldsIdle from '@/assets/nav/worlds-idle.webp';
import profileMark from '@/assets/nav/profile.webp';
import profileIdle from '@/assets/nav/profile-idle.webp';
import moreIdle from '@/assets/nav/more-idle.webp';
import { haptic } from '@/lib/haptics';

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
  /** `src` is the lit state, `idle` the grey one — the set ships both. */
  | { kind: 'art'; src: string; idle: string }
  | { kind: 'svg'; renderIcon: (active: boolean, color: string) => React.ReactElement }
);

// ქომუნითი · თამაშები · მაფია · 3D სივრცე · პროფილი · მეტი
//
// One size for all six, and one weight.
//
// Two earlier arrangements are worth not repeating. Drawing mafia and the 3D
// spaces at 52px against the others' 28 turned the row into a staircase: with
// every label on a shared baseline a taller mark can only grow upward, so the
// big pair sat 22px above their neighbours. And plated artwork — each glyph on
// its own filled square — made six competing tiles out of what should read as
// one line of marks.
//
// This set solves both by being what a bar actually wants: bare glyphs on
// transparency, drawn at one size, shipped in two states. The lit lavender is
// "you are here" and the grey is everything else, so the state lives in the
// artwork rather than in an opacity this file invents.
const LEFT_TABS: TabDef[] = [
  { id: 'community', kind: 'art', src: communityMark, idle: communityIdle, label: 'კომუნითი' },
  { id: 'games',     kind: 'art', src: gamesMark,     idle: gamesIdle,     label: 'თამაშები' },
  { id: 'rooms',     kind: 'art', src: mafiaMark,     idle: mafiaIdle,     label: 'მაფია' },
  { id: 'worlds',    kind: 'art', src: worldsMark,    idle: worldsIdle,    label: '3D სივრცე' },
];

const RIGHT_TABS: TabDef[] = [
  { id: 'profile', kind: 'art', src: profileMark, idle: profileIdle, label: 'პროფილი' },
];

// Each flagship's glow is taken from its own artwork — the mafia plate's gold
// leaf, the hexagon's violet.
const NEON_TAB_COLORS: Record<string, string> = {
  community: '#9b00ff', games: '#f59e0b', rooms: '#e0b64a', worlds: '#a78bfa', profile: '#00e5ff',
};
const GLASS_TAB_COLORS: Record<string, string> = {
  community: '#8b5cf6', games: '#fbbf24', rooms: '#e8c76b', worlds: '#c4b5fd', profile: '#67e8f9',
};
const GRAPHITE_TAB_COLORS: Record<string, string> = {
  community: '#7c93ff', games: '#d0a95a', rooms: '#c8a95e', worlds: '#a89ad0', profile: '#6bc4c4',
};

/** One size for every mark in the bar — see the note on the tab lists. */
const ICON = 32;

// ── NavItem ─────────────────────────────────────────────────────────────────
// Georgian glyphs are wider than Latin/Cyrillic, so long labels
// (კომუნითი / თამაშები / პროფილი) need a touch less size and no
// letter-spacing; keep the roomier style for en/ru.
function labelStyle(ka: boolean): React.CSSProperties {
  return ka
    ? { fontSize: 'clamp(8px, 2.35vw, 9.5px)', fontWeight: 600, letterSpacing: 0, display: 'block', paddingInline: 3 }
    : { fontSize: 'clamp(8.5px, 2.6vw, 10.5px)', fontWeight: 600, letterSpacing: '0.02em', display: 'block', paddingInline: 3 };
}

function NavItem({ tab, active, color, onPress, label, ka }: { tab: TabDef; active: boolean; color: string; onPress: (id: NavTab) => void; label: string; ka: boolean }) {
  return (
    <button
      onClick={() => onPress(tab.id)}
      className="flex flex-col items-center justify-end flex-1 min-w-0 transition-all duration-150 active:scale-90 relative"
      style={{ color: active ? color : 'rgba(255,255,255,0.34)', height: 84, paddingBottom: 15, gap: 3 }}
    >
      {active && (
        <span
          className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-0.5 rounded-full"
          style={{ background: color, boxShadow: `0 0 6px ${color}` }}
        />
      )}

      <span className="flex items-center justify-center" style={{ height: ICON }}>
        {tab.kind === 'svg' ? tab.renderIcon(active, color)
          : tab.kind === 'art' ? (
            <img
              src={active ? tab.src : tab.idle}
              alt=""
              width={ICON}
              height={ICON}
              style={{
                width: ICON, height: ICON, display: 'block',
                // drop-shadow, not box-shadow: the glow has to follow the
                // glyph's alpha rather than square off around it.
                filter: active ? `drop-shadow(0 0 8px ${color}80)` : 'none',
                transition: 'filter 160ms ease',
              }}
            />
          ) : (
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

        {/* Right tabs */}
        {RIGHT_TABS.map(tab => (
          <NavItem key={tab.id} tab={tab} ka={ka} label={navLabel(tab.id)} active={active === tab.id} color={TAB_COLORS[tab.id] ?? '#ffffff'} onPress={go} />
        ))}

        {/* მეტი — the last text glyph in the bar, now a mark like the rest */}
        <button
          onClick={goMore}
          className="flex flex-col items-center justify-end flex-1 min-w-0 transition-all duration-150 active:scale-90 relative"
          style={{ color: 'rgba(255,255,255,0.34)', height: 84, paddingBottom: 15, gap: 3 }}
        >
          <span className="flex items-center justify-center" style={{ height: ICON }}>
            <img
              // The menu is never "the page you are on", so it wears the idle
              // face always.
              src={moreIdle}
              alt=""
              width={ICON}
              height={ICON}
              style={{ width: ICON, height: ICON, display: 'block' }}
            />
          </span>
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
