import clsx from 'clsx';

export type NavTab = 'rooms' | 'clans' | 'leaderboard' | 'profile' | 'mod';

interface Props {
  active: NavTab;
  isMod: boolean;
  onChange: (tab: NavTab) => void;
}

const TABS: { id: NavTab; label: string; icon: string; modOnly?: boolean }[] = [
  { id: 'rooms',       label: 'Rooms',       icon: '⬡' },
  { id: 'clans',       label: 'Clans',       icon: '⚔' },
  { id: 'leaderboard', label: 'Top',         icon: '◈' },
  { id: 'profile',     label: 'Profile',     icon: '◉' },
  { id: 'mod',         label: 'MOD',         icon: '⚡', modOnly: true },
];

export function BottomNav({ active, isMod, onChange }: Props) {
  const visible = TABS.filter(t => !t.modOnly || isMod);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-void/95 border-t border-white/5 backdrop-blur-xl">
      <div className="flex items-center justify-around max-w-lg mx-auto">
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
      </div>
    </nav>
  );
}
