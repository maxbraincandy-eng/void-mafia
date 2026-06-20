import { useSocialStore } from '@/store/socialStore';
import { haptic } from '@/lib/haptics';

export type NavTab = 'rooms' | 'games' | 'community' | 'clans' | 'leaderboard' | 'profile' | 'mod' | 'economy' | 'replays';

interface Props {
  active: NavTab;
  isMod: boolean;
  onChange: (tab: NavTab) => void;
  onMoreClick: () => void;
}

const TABS = [
  { id: 'community' as NavTab, label: 'VoidGram', icon: '🌀', color: '#9b00ff' },
  { id: 'games'     as NavTab, label: 'გართობა', icon: '🎮', color: '#f59e0b' },
  { id: 'profile'   as NavTab, label: 'მე',       icon: '◉',  color: '#00e5ff' },
] as const;

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
      <div
        className="flex items-end max-w-lg mx-auto"
        style={{ height: 64 }}
      >

        {/* VoidGram + გართობა (left 2) */}
        {TABS.slice(0, 2).map(tab => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => go(tab.id)}
              className="flex flex-col items-center justify-end flex-1 pb-3 transition-all duration-150 active:scale-90 relative"
              style={{ color: isActive ? tab.color : 'rgba(255,255,255,0.28)', minHeight: 64 }}
            >
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                  style={{ background: tab.color, boxShadow: `0 0 8px ${tab.color}` }}
                />
              )}
              <span
                className="text-xl leading-none mb-1"
                style={{ filter: isActive ? `drop-shadow(0 0 6px ${tab.color})` : 'none' }}
              >
                {tab.icon}
              </span>
              <span className="font-mono uppercase leading-none text-center" style={{ fontSize: 10, letterSpacing: '0.04em' }}>
                {tab.label}
              </span>
            </button>
          );
        })}

        {/* ── CENTER FAB — Mafia ── */}
        <div className="flex-1 flex justify-center" style={{ position: 'relative', height: 64 }}>
          <button
            onClick={() => go('rooms')}
            className="absolute transition-all duration-200 active:scale-90 flex flex-col items-center justify-center"
            style={{
              width: 62,
              height: 62,
              borderRadius: '50%',
              bottom: 10,
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
            <span style={{ fontSize: 28, lineHeight: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>🎩</span>
            <span className="font-mono uppercase text-white/70 leading-none" style={{ fontSize: 9, letterSpacing: '0.08em', marginTop: 2 }}>
              მაფია
            </span>
          </button>
        </div>

        {/* მე (profile) */}
        {TABS.slice(2).map(tab => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => go(tab.id)}
              className="flex flex-col items-center justify-end flex-1 pb-3 transition-all duration-150 active:scale-90 relative"
              style={{ color: isActive ? tab.color : 'rgba(255,255,255,0.28)', minHeight: 64 }}
            >
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                  style={{ background: tab.color, boxShadow: `0 0 8px ${tab.color}` }}
                />
              )}
              <span
                className="text-xl leading-none mb-1"
                style={{ filter: isActive ? `drop-shadow(0 0 6px ${tab.color})` : 'none' }}
              >
                {tab.icon}
              </span>
              <span className="font-mono uppercase leading-none text-center" style={{ fontSize: 10, letterSpacing: '0.04em' }}>
                {tab.label}
              </span>
            </button>
          );
        })}

        {/* ☰ მეტი */}
        <button
          onClick={goMore}
          className="flex flex-col items-center justify-end flex-1 pb-3 transition-all duration-150 active:scale-90 relative"
          style={{ color: 'rgba(255,255,255,0.28)', minHeight: 64 }}
        >
          <span className="text-xl leading-none mb-1">☰</span>
          <span className="font-mono uppercase leading-none text-center relative" style={{ fontSize: 10, letterSpacing: '0.04em' }}>
            მეტი
            {unreadDmCount > 0 && (
              <span
                className="absolute -top-1 -right-2 min-w-[14px] h-3.5 rounded-full bg-neon-pink text-void text-[9px] font-bold flex items-center justify-center px-0.5 leading-none"
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
