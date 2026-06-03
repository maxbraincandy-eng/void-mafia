import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { PlayerPublic, Phase } from '@/types/index';
import { useSocialStore } from '@/store/socialStore';

interface Props {
  open: boolean;
  onClose: () => void;
  players: PlayerPublic[];
  phase: Phase;
  currentSpeakerId?: string | null;
  myPlayerId?: string | null;
  speakingSocketIds?: Set<string>;
}

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').slice(0, 2).join('') || '?';
}

export function InGamePlayersPanel({
  open, onClose, players, phase, currentSpeakerId, myPlayerId, speakingSocketIds
}: Props) {
  const { openProfile } = useSocialStore();

  const activePlayers = players.filter(p => !p.isSpectator);
  const alivePlayers  = activePlayers.filter(p => p.isAlive);
  const deadPlayers   = activePlayers.filter(p => !p.isAlive);

  const handleTap = (player: PlayerPublic) => {
    if (player.profileId) openProfile(player.profileId);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl border-t border-white/10 flex flex-col"
            style={{ background: 'rgba(6,3,20,0.99)', maxHeight: '82vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-9 h-1 rounded-full bg-white/15" />
            </div>

            {/* Header */}
            <div className="px-5 py-3 flex items-center justify-between border-b border-white/[0.07] flex-shrink-0">
              <div>
                <h3 className="font-display font-bold text-base text-white tracking-wide">Players</h3>
                <p className="text-[10px] font-mono text-white/30 mt-0.5 uppercase tracking-wider">
                  {alivePlayers.length} alive · {deadPlayers.length} eliminated
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/8 transition-all text-sm"
              >
                ✕
              </button>
            </div>

            {/* Scrollable list */}
            <div className="overflow-y-auto flex-1 px-4 pb-6">
              {alivePlayers.length > 0 && (
                <div className="pt-3">
                  <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-neon-green/45 mb-2 px-1">
                    ⚔ In Battle · {alivePlayers.length}
                  </p>
                  <div className="space-y-1.5">
                    {alivePlayers.map(p => (
                      <PlayerRow
                        key={p.id}
                        player={p}
                        isMe={p.id === myPlayerId}
                        isSpeaker={p.id === currentSpeakerId}
                        isSpeaking={speakingSocketIds?.has(p.socketId) ?? false}
                        onTap={() => handleTap(p)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {deadPlayers.length > 0 && (
                <div className="pt-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-white/20 mb-2 px-1">
                    💀 Eliminated · {deadPlayers.length}
                  </p>
                  <div className="space-y-1.5 opacity-50">
                    {deadPlayers.map(p => (
                      <PlayerRow
                        key={p.id}
                        player={p}
                        isMe={p.id === myPlayerId}
                        isSpeaker={false}
                        isSpeaking={false}
                        dead
                        onTap={() => handleTap(p)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function PlayerRow({
  player, isMe, isSpeaker, isSpeaking, dead, onTap,
}: {
  player: PlayerPublic;
  isMe: boolean;
  isSpeaker: boolean;
  isSpeaking: boolean;
  dead?: boolean;
  onTap: () => void;
}) {
  const initials = initialsOf(player.name);

  return (
    <button
      onClick={onTap}
      disabled={!player.profileId}
      className={clsx(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all active:scale-[0.98]',
        isSpeaker
          ? 'bg-neon-cyan/8 border border-neon-cyan/25'
          : isMe
            ? 'bg-neon-purple/8 border border-neon-purple/20'
            : 'bg-white/[0.025] border border-white/[0.06] hover:bg-white/[0.05]',
        'disabled:cursor-default',
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div
          className={clsx(
            'w-12 h-12 rounded-full overflow-hidden flex items-center justify-center font-display font-bold text-base',
            dead && 'grayscale',
          )}
          style={{
            background: isMe
              ? 'linear-gradient(135deg, rgba(155,0,255,0.5), rgba(0,229,255,0.25))'
              : 'linear-gradient(135deg, rgba(255,0,128,0.4), rgba(138,43,226,0.4))',
            border: isSpeaker
              ? '2px solid rgba(0,229,255,0.7)'
              : isMe
                ? '2px solid rgba(155,0,255,0.5)'
                : '2px solid rgba(138,43,226,0.3)',
            boxShadow: isSpeaking && !dead ? '0 0 14px rgba(0,255,136,0.45)' : undefined,
          }}
        >
          {player.avatarUrl
            ? <img src={player.avatarUrl} alt={player.name} className="w-full h-full object-cover" />
            : <span style={{ color: isMe ? '#c084fc' : '#00e5ff' }}>{player.avatar || initials}</span>
          }
        </div>

        {/* Speaking pulse ring */}
        {isSpeaking && !dead && (
          <span className="absolute inset-0 rounded-full border-2 border-neon-green animate-ping opacity-40" />
        )}

        {/* Dead overlay skull */}
        {dead && (
          <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50">
            <span className="text-base">💀</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-mono font-bold px-1"
            style={isMe
              ? { background: 'rgba(155,0,255,0.25)', color: 'rgba(205,150,255,0.9)', border: '1px solid rgba(155,0,255,0.4)' }
              : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }
            }
          >
            {player.seat}
          </span>
          <span className={clsx(
            'font-semibold text-sm truncate',
            dead ? 'text-white/35 line-through' : isMe ? 'text-neon-purple/90' : 'text-white',
          )}>
            {player.name}
          </span>
          {isMe && (
            <span className="flex-shrink-0 text-[9px] font-mono text-neon-purple/55 bg-neon-purple/10 px-1.5 py-0.5 rounded-full">
              you
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5">
          {isSpeaker && (
            <span className="text-[9px] font-mono text-neon-cyan font-bold bg-neon-cyan/10 px-1.5 py-0.5 rounded-full">
              🎤 Speaking
            </span>
          )}
          {!isSpeaker && isSpeaking && (
            <span className="text-[9px] font-mono text-neon-green font-bold bg-neon-green/10 px-1.5 py-0.5 rounded-full animate-pulse">
              🔊 Voice on
            </span>
          )}
          {!dead && !isSpeaker && !isSpeaking && player.isConnected && (
            <span className="text-[9px] font-mono text-neon-green/45 tracking-wide">In Battle</span>
          )}
          {!player.isConnected && !dead && (
            <span className="text-[9px] font-mono text-yellow-500/50">reconnecting…</span>
          )}
          {dead && player.deathType === 'night' && (
            <span className="text-[9px] font-mono font-bold text-red-400 bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 rounded-full">
              ☠ KILLED
            </span>
          )}
          {dead && player.deathType === 'vote' && (
            <span className="text-[9px] font-mono font-bold text-orange-400 bg-orange-500/15 border border-orange-500/30 px-1.5 py-0.5 rounded-full">
              ⚖ VOTED OUT
            </span>
          )}
          {dead && !player.deathType && (
            <span className="text-[9px] font-mono text-white/25">eliminated</span>
          )}
        </div>
      </div>

      {/* Chevron — only if profileId exists */}
      {player.profileId && !dead && (
        <span className="flex-shrink-0 text-white/15 text-sm">›</span>
      )}
    </button>
  );
}
