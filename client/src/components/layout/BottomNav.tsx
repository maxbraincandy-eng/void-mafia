import clsx from 'clsx';
import { useT } from '@/store/langStore';
import { useSocialStore } from '@/store/socialStore';

export type NavTab = 'rooms' | 'clans' | 'leaderboard' | 'profile' | 'mod';

interface Props {
  active: NavTab;
  isMod: boolean;
  onChange: (tab: NavTab) => void;
  onMessagesClick: () => void;
}

export function BottomNav({ active, isMod, onChange, onMessagesClick }: Props) {
  const t = useT();
  const { unreadDmCount, dmPanelOpen } = useSocialStore();

  // Order: ოთახები · კლანები · ტოპი · პროფილი · (mod) — MSG always last
  const TABS: { id: NavTab; label: string; icon: string; modOnly?: boolean }[] = [
    { id: 'rooms',       label: t.nav.rooms,       icon: '⬡' },
    { id: 'clans',       label: t.nav.clans,       icon: '⚔' },
    { id: 'leaderboard', label: t.nav.leaderboard, icon: '◈' },
    { id: 'profile',     label: t.nav.profile,     icon: '◉' },
    { id: 'mod',         label: t.nav.mod,         icon: '⚡', modOnly: true },
  ];

  const visible = TABS.filter(tab => !tab.modOnly || isMod);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-void/95 border-t border-white/5 backdrop-blur-xl">
      <div className="flex items-center justify-around max-w-lg mx-auto relative">
        {visible.map(tab => {
          const isActive = active === tab.id;
          const isModeTab = tab.id === 'mod';
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={clsx(
                'flex flex-col items-center justify-center py-3 px-4 flex-1 transition-all duration-200',
                isActive && !isModeTab && 'text-neon-cyan',
                isActive && isModeTab && 'text-neon-green',
                !isActive && 'text-white/25 hover:text-white/50',
              )}
            >
              <span className={clsx(
                'text-xl leading-none mb-1 transition-all',
                isActive && !isModeTab && 'text-glow-cyan',
                isActive && isModeTab && 'text-glow-green',
              )}>
                {tab.icon}
              </span>
              <span className={clsx(
                'text-[9px] font-mono tracking-wider uppercase',
                isModeTab && isActive && 'text-neon-green font-bold',
              )}>
                {tab.label}
              </span>
              {isActive && (
                <span className={clsx(
                  'absolute bottom-0 w-8 h-0.5 rounded-full',
                  isModeTab ? 'bg-neon-green shadow-neon-green' : 'bg-neon-cyan shadow-neon-cyan',
                )} />
              )}
            </button>
          );
        })}

        {/* Messages — last position */}
        <button
          onClick={onMessagesClick}
          className={clsx(
            'relative flex flex-col items-center justify-center py-3 px-4 flex-1 transition-all duration-200',
            dmPanelOpen ? 'text-neon-pink' : 'text-white/25 hover:text-white/50',
          )}
        >
          <span className={clsx(
            'leading-none mb-1 transition-all flex items-center justify-center',
            dmPanelOpen && 'text-glow-pink',
          )}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <span className="text-[9px] font-mono tracking-wider uppercase">MSG</span>
          {unreadDmCount > 0 && (
            <span className="absolute top-2 right-[18%] bg-neon-pink text-void text-[8px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5 leading-none">
              {unreadDmCount > 9 ? '9+' : unreadDmCount}
            </span>
          )}
          {dmPanelOpen && (
            <span className="absolute bottom-0 w-8 h-0.5 rounded-full bg-neon-pink" />
          )}
        </button>
      </div>
    </nav>
  );
}
