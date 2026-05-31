import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { PlayerPublic, Phase, RoleKey } from '@/types/index';
import { Avatar } from '@/components/ui/Avatar';
import { ModBadge } from '@/components/ui/ModBadge';
import { useGameStore } from '@/store/gameStore';

interface Props {
  players: PlayerPublic[];
  phase: Phase;
  onSelectTarget?: (player: PlayerPublic) => void;
  selectableIds?: Set<string>;
  selectedId?: string | null;
  showVotes?: boolean;
  currentSpeakerId?: string | null;
}

const ROLE_LABELS: Record<RoleKey, string> = {
  mafia: 'Mafia', citizen: 'Citizen', sheriff: 'Sheriff', doctor: 'Doctor',
  don: 'Don', maniac: 'Maniac', jester: 'Jester', bodyguard: 'Bodyguard',
  spy: 'Spy', escort: 'Escort', vigilante: 'Vigilante',
};

const ROLE_COLORS: Record<RoleKey, string> = {
  mafia: 'text-neon-pink', don: 'text-neon-pink',
  citizen: 'text-neon-cyan', sheriff: 'text-neon-blue',
  doctor: 'text-neon-green', bodyguard: 'text-neon-green',
  spy: 'text-cyan-400', escort: 'text-pink-400', vigilante: 'text-yellow-400',
  maniac: 'text-neon-purple', jester: 'text-neon-purple',
};

export function PlayerList({ players, phase, onSelectTarget, selectableIds, selectedId, showVotes, currentSpeakerId }: Props) {
  const myPlayerId = useGameStore(s => s.myPlayerId);

  return (
    <div className="grid grid-cols-2 gap-2">
      <AnimatePresence>
        {players.map(player => {
          const isMe = player.id === myPlayerId;
          const isSelectable = selectableIds?.has(player.id);
          const isSelected = selectedId === player.id;
          const isSpeaking = currentSpeakerId != null && player.id === currentSpeakerId;
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
                'flex items-center gap-2 p-2 rounded-xl border transition-all duration-200',
                !player.isAlive && 'opacity-40',
                isSelectable && !isSelected && 'cursor-pointer hover:border-neon-cyan/40 hover:bg-neon-cyan/5',
                isSelected && 'border-neon-cyan/60 bg-neon-cyan/10 shadow-neon-cyan',
                isSpeaking && 'border-neon-green ring-2 ring-neon-green/40 shadow-neon-green',
                !isSelectable && !isSelected && !isSpeaking && 'border-white/5 bg-void-50/40',
                isMe && !isSelected && !isSpeaking && 'border-neon-purple/25 bg-neon-purple/5',
              )}
            >
              <Avatar
                name={player.name}
                isAlive={player.isAlive}
                isHost={player.isHost}
                size="sm"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className={clsx(
                    'text-xs font-semibold truncate',
                    !player.isAlive ? 'line-through text-white/40' : 'text-white',
                  )}>
                    #{player.seat} {player.name}
                    {isMe && <span className="text-neon-purple text-[10px] ml-0.5">(you)</span>}
                  </span>
                  {player.isModerator && player.moderatorLevel && (
                    <ModBadge level={player.moderatorLevel} size="xs" />
                  )}
                  {isSpeaking && (
                    <span className="text-[9px] font-mono font-bold text-neon-green bg-neon-green/10 px-1 rounded flex-shrink-0">
                      🎤 SPEAKING
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  {player.role && (
                    <span className={clsx('text-[10px] font-mono', ROLE_COLORS[player.role])}>
                      {ROLE_LABELS[player.role]}
                    </span>
                  )}
                  {!player.isConnected && (
                    <span className="text-[10px] text-white/30">dc</span>
                  )}
                  {phase === 'night' && player.hasActed && player.isAlive && (
                    <span className="text-[10px] text-neon-green">✓</span>
                  )}
                </div>
              </div>

              {/* Vote indicator */}
              {showVotes && voteCount > 0 && (
                <div className="flex-shrink-0 flex items-center gap-0.5">
                  <span className="text-neon-red font-bold font-mono text-xs">{voteCount}</span>
                </div>
              )}

              {/* Selection indicator */}
              {isSelected && (
                <div className="flex-shrink-0 w-4 h-4 rounded-full bg-neon-cyan flex items-center justify-center">
                  <span className="text-void text-[9px] font-bold">✓</span>
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
