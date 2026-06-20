import { useSocialStore } from '@/store/socialStore';
import { haptic } from '@/lib/haptics';

export type NavTab = 'rooms' | 'games' | 'community' | 'clans' | 'leaderboard' | 'profile' | 'mod' | 'economy' | 'replays';

interface Props {
  active: NavTab;
  isMod: boolean;
  onChange: (tab: NavTab) => void;
  onMoreClick: () => void;
}

const LEFT_TABS = [
  { id: 'community'   as NavTab, label: 'VoidGram', icon: '🌀', color: '#9b00ff' },
  { id: 'games'       as NavTab, label: 'გართობა',  icon: '🎮', color: '#f59e0b' },
  { id: 'clans'       as NavTab, label: 'კლანები',  icon: '⚔️', color: '#ef4444' },
] as const;

const RIGHT_TABS = [
  { id: 'leaderboard' as NavTab, label: 'ლიდ.',     icon: '🏅', color: '#facc15' },
  { id: 'profile'     as NavTab, label: 'მე',        icon: '◉',  color: '#00e5ff' },
] as const;

function NavItem({ tab, active, onPress }: {
  tab: { id: NavTab; label: string; icon: string; color: string };
  active: boolean;
  onPress: (id: NavTab) => void;
}) {
  return (
    <button
      onClick={() => onPress(tab.id)}
      className="flex flex-col items-center justify-end flex-1 pb-2.5 transition-all duration-150 active:scale-90 relative"
      style={{ color: active ? tab.color : 'rgba(255,255,255,0.28)', minHeight: 64 }}
    >
      {active && (
        <span
          className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
          style={{ background: tab.color, boxShadow: `0 0 6px ${tab.color}` }}
        />
      )}
      <span
        className="text-base leading-none mb-1"
        style={{ filter: active ? `drop-shadow(0 0 5px ${tab.color})` : 'none' }}
      >
        {tab.icon}
      </span>
      <span className="font-mono uppercase leading-none text-center" style={{ fontSize: 9, letterSpacing: '0.03em' }}>
        {tab.label}
      </span>
    </button>
  );
}

export function BottomNav({ active, onChange, onMoreClick }: Props) {
  const { unreadDmCount } = useSocialStore();

  const isRooms = active === 'rooms';

  function go(tab: NavTab) {
    haptic('selection');
    onChange(tab);
  }

  function goMore() {
    haptic('tap');
    onMoreClick();
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: 'rgba(3,0,13,0.97)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -4px 32px rgba(0,0,0,0.65)',
      }}
    >
      <div className="flex items-end max-w-lg mx-auto" style={{ height: 64 }}>

        {/* Left 3 tabs: VoidGram, Games, Clans */}
        {LEFT_TABS.map(tab => (
          <NavItem key={tab.id} tab={tab} active={active === tab.id} onPress={go} />
        ))}

        {/* CENTER FAB — Mafia */}
        <div className="flex-1 flex justify-center" style={{ position: 'relative', height: 64 }}>
          <button
            onClick={() => go('rooms')}
            className="absolute transition-all duration-200 active:scale-90 flex flex-col items-center justify-center"
            style={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              bottom: 8,
              background: isRooms
                ? 'linear-gradient(145deg, #c026d3, #7c3aed, #0ea5e9)'
                : 'linear-gradient(145deg, #7c3aed, #4f46e5)',
              boxShadow: isRooms
                ? '0 0 0 2px rgba(192,38,211,0.5), 0 0 28px rgba(124,58,237,0.7), 0 4px 16px rgba(0,0,0,0.6)'
                : '0 0 0 1.5px rgba(124,58,237,0.4), 0 0 18px rgba(79,70,229,0.45), 0 4px 16px rgba(0,0,0,0.5)',
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

        {/* Right 2 tabs: Leaderboard, Profile */}
        {RIGHT_TABS.map(tab => (
          <NavItem key={tab.id} tab={tab} active={active === tab.id} onPress={go} />
        ))}

        {/* ☰ მეტი */}
        <button
          onClick={goMore}
          className="flex flex-col items-center justify-end flex-1 pb-2.5 transition-all duration-150 active:scale-90 relative"
          style={{ color: 'rgba(255,255,255,0.28)', minHeight: 64 }}
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
