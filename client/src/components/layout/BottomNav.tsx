import clsx from 'clsx';
import { useT } from '@/store/langStore';
import { useSocialStore } from '@/store/socialStore';

export type NavTab = 'rooms' | 'games' | 'community' | 'clans' | 'leaderboard' | 'profile' | 'mod' | 'economy' | 'replays';

interface Props {
  active: NavTab;
  isMod: boolean;
  onChange: (tab: NavTab) => void;
  onMessagesClick: () => void;
}

export function BottomNav({ active, isMod, onChange, onMessagesClick }: Props) {
  const t = useT();
  const { unreadDmCount, dmPanelOpen } = useSocialStore();

  const TABS: { id: NavTab; label: string; icon: string; modOnly?: boolean }[] = [
    { id: 'rooms',       label: t.nav.rooms,       icon: '🎩' },
    { id: 'games',       label: t.nav.games,       icon: '🎮' },
    { id: 'community',   label: t.nav.community,   icon: '✦' },
    { id: 'clans',       label: t.nav.clans,       icon: '⚔' },
    { id: 'leaderboard', label: t.nav.leaderboard, icon: '◈' },
    { id: 'profile',     label: t.nav.profile,     icon: '◉' },
    { id: 'mod',         label: t.nav.mod,         icon: '⚡', modOnly: true },
  ];

  const visible = TABS.filter(tab => {
    if (tab.modOnly) return isMod;
    return true;
  });

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-2xl"
      style={{
        background: 'rgba(3,0,13,0.96)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -4px 32px rgba(0,0,0,0.6)',
      }}
    >
      <div className="flex items-stretch justify-around max-w-lg mx-auto relative">
        {visible.map(tab => {
          const isActive = active === tab.id;
          const isModeTab = tab.id === 'mod';
          const isCommunityTab = tab.id === 'community';
          const isGamesTab = tab.id === 'games';
          const activeColor = isModeTab ? '#00ff88' : isCommunityTab ? '#9b00ff' : isGamesTab ? '#f59e0b' : '#00e5ff';
          const inactiveColor = 'rgba(255,255,255,0.28)';
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="flex flex-col items-center justify-center flex-1 transition-all duration-150 active:scale-90"
              style={{
                minHeight: '56px',
                paddingTop: '10px',
                paddingBottom: '8px',
                color: isActive ? activeColor : inactiveColor,
              }}
            >
              {/* Active pill indicator */}
              <span
                className="absolute top-0 w-8 h-0.5 rounded-full transition-all duration-200"
                style={{
                  background: isActive ? activeColor : 'transparent',
                  boxShadow: isActive ? `0 0 10px ${activeColor}` : 'none',
                }}
              />
              <span
                className="text-xl leading-none mb-1.5 transition-all duration-150"
                style={{ filter: isActive ? `drop-shadow(0 0 6px ${activeColor})` : 'none' }}
              >
                {tab.icon}
              </span>
              <span className="text-[8px] font-mono tracking-widest uppercase leading-none">
                {tab.label}
              </span>
            </button>
          );
        })}

        {/* Messages */}
        <button
          onClick={onMessagesClick}
          className="relative flex flex-col items-center justify-center flex-1 transition-all duration-150 active:scale-90"
          style={{
            minHeight: '56px',
            paddingTop: '10px',
            paddingBottom: '8px',
            color: dmPanelOpen ? '#ff00cc' : 'rgba(255,255,255,0.28)',
          }}
        >
          <span
            className="absolute top-0 w-8 h-0.5 rounded-full transition-all"
            style={{
              background: dmPanelOpen ? '#ff00cc' : 'transparent',
              boxShadow: dmPanelOpen ? '0 0 10px #ff00cc' : 'none',
            }}
          />
          <span
            className="leading-none mb-1.5 flex items-center justify-center"
            style={{ filter: dmPanelOpen ? 'drop-shadow(0 0 6px #ff00cc)' : 'none' }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <span className="text-[8px] font-mono tracking-widest uppercase leading-none">MSG</span>
          {unreadDmCount > 0 && (
            <span className="absolute top-1.5 right-[14%] bg-neon-pink text-void text-[8px] font-bold rounded-full min-w-[15px] h-3.5 flex items-center justify-center px-0.5 leading-none"
              style={{ boxShadow: '0 0 8px rgba(255,0,204,0.6)' }}>
              {unreadDmCount > 9 ? '9+' : unreadDmCount}
            </span>
          )}
        </button>
      </div>
    </nav>
  );
}
