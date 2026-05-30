import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { PlayerPublic, Phase, RoleKey } from '@/types/index';
import { Avatar } from '@/components/ui/Avatar';
import { useGameStore } from '@/store/gameStore';

interface Props {
  players: PlayerPublic[];
  phase: Phase;
  onSelectTarget?: (player: PlayerPublic) => void;
  selectableIds?: Set<string>;
  selectedId?: string | null;
  showVotes?: boolean;
}

const ROLE_LABELS: Record<RoleKey, string> = {
  mafia: 'Mafia',
  citizen: 'Citizen',
  sheriff: 'Sheriff',
  doctor: 'Doctor',
  don: 'Don',
  maniac: 'Maniac',
  jester: 'Jester',
  bodyguard: 'Bodyguard',
};

const ROLE_COLORS: Record<RoleKey, string> = {
  mafia: 'text-neon-pink',
  don: 'text-neon-pink',
  citizen: 'text-neon-cyan',
  sheriff: 'text-neon-blue',
  doctor: 'text-neon-green',
  bodyguard: 'text-neon-green',
  maniac: 'text-neon-purple',
  jester: 'text-neon-purple',
};

export function PlayerList({ players, phase, onSelectTarget, selectableIds, selectedId, showVotes }: Props) {
  const myPlayerId = useGameStore(s => s.myPlayerId);

  return (
    <div className="space-y-2">
      <AnimatePresence>
        {players.map(player => {
          const isMe = player.id === myPlayerId;
          const isSelectable = selectableIds?.has(player.id);
          const isSelected = selectedId === player.id;
          const voteCount = showVotes
            ? players.filter(p => p.voteTarget === player.id).length
            : 0;

          return (
            <motion.div
              key={player.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              onClick={() => isSelectable && onSelectTarget?.(player)}
              className={clsx(
                'flex items-center gap-3 p-3 rounded-xl border transition-all duration-200',
                !player.isAlive && 'opacity-40',
                isSelectable && !isSelected && 'cursor-pointer hover:border-neon-cyan/40 hover:bg-neon-cyan/5',
                isSelected && 'border-neon-cyan/60 bg-neon-cyan/10 shadow-neon-cyan',
                !isSelectable && !isSelected && 'border-white/5 bg-void-50/40',
                isMe && !isSelected && 'border-neon-purple/25 bg-neon-purple/5',
              )}
            >
              <Avatar
                name={player.name}
                isAlive={player.isAlive}
                isHost={player.isHost}
                size="md"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={clsx(
                    'text-sm font-semibold truncate',
                    !player.isAlive ? 'line-through text-white/40' : 'text-white',
                  )}>
                    #{player.seat} {player.name}
                    {isMe && <span className="text-neon-purple text-xs ml-1">(you)</span>}
                  </span>
                  {player.isHost && (
                    <span className="text-xs text-yellow-400 flex-shrink-0">HOST</span>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-0.5">
                  {player.role && (
                    <span className={clsx('text-xs font-mono', ROLE_COLORS[player.role])}>
                      {ROLE_LABELS[player.role]}
                    </span>
                  )}
                  {!player.isConnected && (
                    <span className="text-xs text-white/30">disconnected</span>
                  )}
                  {phase === 'night' && player.hasActed && player.isAlive && (
                    <span className="text-xs text-neon-green">✓ acted</span>
                  )}
                </div>
              </div>

              {/* Vote indicator */}
              {showVotes && voteCount > 0 && (
                <div className="flex-shrink-0 flex items-center gap-1">
                  <span className="text-neon-red font-bold font-mono text-sm">{voteCount}</span>
                  <span className="text-xs text-white/40">vote{voteCount !== 1 ? 's' : ''}</span>
                </div>
              )}

              {/* Selection indicator */}
              {isSelected && (
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-neon-cyan flex items-center justify-center">
                  <span className="text-void text-xs font-bold">✓</span>
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
