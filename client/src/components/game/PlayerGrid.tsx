import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { PlayerPublic, Phase, RoleKey } from '@/types/index';
import { ModBadge } from '@/components/ui/ModBadge';

const ROLE_ICONS: Partial<Record<RoleKey, string>> = {
  citizen: '🏙', sheriff: '🔍', doctor: '💉', bodyguard: '🛡',
  vigilante: '⚖️', escort: '💃', mayor: '👑', tracker: '👁',
  veteran: '🎖️', spy: '🕵️', mafia: '🔫', don: '♛',
  arsonist: '🔥', maniac: '🌀', jester: '🃏', cult_leader: '🕯️', cultist: '🔮',
};

interface Props {
  players: PlayerPublic[];
  phase: Phase;
  currentSpeakerId?: string | null;
  myPlayerId?: string | null;
  voteCounts?: Record<string, number>;
  selectedVoteId?: string | null;
  showRoles?: boolean;
  fillHeight?: boolean;
  onSelect?: (p: PlayerPublic) => void;
}

function BigAvatar({ player, size = 80 }: { player: PlayerPublic; size?: number }) {
  const initials = player.name
    .trim()
    .split(/\s+/)
    .map(w => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('') || '?';

  const dim = `${size}px`;

  if (!player.isAlive && !player.isSpectator) {
    return (
      <div
        className="rounded-full flex items-center justify-center font-display font-bold text-2xl bg-white/5 border border-white/10 text-white/20 grayscale"
        style={{ width: dim, height: dim }}
      >
        💀
      </div>
    );
  }

  return (
    <div
      className="rounded-full flex items-center justify-center font-display font-bold overflow-hidden"
      style={{
        width: dim,
        height: dim,
        fontSize: `${Math.round(size * 0.35)}px`,
        background: 'linear-gradient(135deg, rgba(155,0,255,0.3) 0%, rgba(0,229,255,0.2) 100%)',
        border: '2px solid rgba(0,229,255,0.25)',
        color: '#00e5ff',
        boxShadow: 'inset 0 0 20px rgba(0,229,255,0.08)',
      }}
    >
      {initials}
    </div>
  );
}

function SpeakerHero({ player, isMe, speakerIndex, totalSpeakers }: {
  player: PlayerPublic;
  isMe: boolean;
  speakerIndex: number;
  totalSpeakers: number;
}) {
  return (
    <motion.div
      key={player.id}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col items-center py-6 gap-5"
    >
      {/* Progress indicator */}
      <div className="flex items-center gap-1.5">
        {Array.from({ length: totalSpeakers }).map((_, i) => (
          <div
            key={i}
            className={clsx(
              'rounded-full transition-all duration-300',
              i < speakerIndex
                ? 'w-1.5 h-1.5 bg-white/20'
                : i === speakerIndex
                  ? 'w-3 h-1.5 bg-neon-cyan shadow-[0_0_6px_rgba(0,229,255,0.8)]'
                  : 'w-1.5 h-1.5 bg-white/10',
            )}
          />
        ))}
      </div>

      {/* Pulsing ring behind avatar */}
      <div className="relative flex items-center justify-center">
        <motion.div
          animate={{ scale: [1, 1.18, 1], opacity: [0.4, 0.8, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
          className="absolute rounded-full"
          style={{
            width: '140px',
            height: '140px',
            background: 'radial-gradient(circle, rgba(0,229,255,0.35) 0%, transparent 70%)',
            filter: 'blur(8px)',
          }}
        />
        {/* Seat badge on avatar */}
        <div className="absolute -top-1 -left-1 z-10 w-6 h-6 rounded-full bg-void border border-neon-cyan/50 flex items-center justify-center shadow-[0_0_8px_rgba(0,229,255,0.4)]">
          <span className="text-[10px] font-mono font-bold text-neon-cyan/80">{player.seat}</span>
        </div>
        <div className="relative z-10">
          <BigAvatar player={player} size={110} />
        </div>
      </div>

      <div className="text-center space-y-1">
        <p className="text-xs font-mono text-neon-cyan/60 uppercase tracking-widest">
          🎤 Speaking
        </p>
        <p className="font-display text-2xl font-bold text-white tracking-wide">
          {player.name}
        </p>
        {isMe && (
          <p className="text-xs text-neon-purple font-mono">it's your turn</p>
        )}
        {player.isModerator && player.moderatorLevel && (
          <div className="flex justify-center">
            <ModBadge level={player.moderatorLevel} size="sm" />
          </div>
        )}
        <p className="text-[10px] font-mono text-white/25">
          {speakerIndex + 1} / {totalSpeakers}
        </p>
      </div>
    </motion.div>
  );
}

function PlayerCard({
  player,
  isMe,
  isSpeaker,
  voteCount,
  isSelected,
  showRole,
  phase,
  totalAlive,
  fillHeight,
  onClick,
}: {
  player: PlayerPublic;
  isMe: boolean;
  isSpeaker: boolean;
  voteCount: number;
  isSelected: boolean;
  showRole?: boolean;
  phase?: Phase;
  totalAlive?: number;
  fillHeight?: boolean;
  onClick: () => void;
}) {
  const dead = !player.isAlive && !player.isSpectator;
  const isVoting = phase === 'voting';
  const majorityVotes = totalAlive ? Math.ceil(totalAlive / 2) : 1;
  const voteBarPct = isVoting && voteCount > 0
    ? Math.min(100, (voteCount / majorityVotes) * 100)
    : 0;

  return (
    <motion.button
      layout
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={clsx(
        'relative w-full rounded-2xl border transition-all duration-200 overflow-hidden text-left',
        fillHeight ? 'flex flex-col items-center justify-center pb-2 pt-2 gap-2 h-full' : 'flex flex-col items-center pb-3 pt-4 gap-2',
        dead
          ? 'border-white/8 bg-black/60 opacity-45 grayscale pointer-events-none'
          : isSelected
            ? 'border-neon-red/70 bg-neon-red/10 shadow-[0_0_18px_rgba(255,45,85,0.25)]'
            : isSpeaker
              ? 'border-neon-cyan/70 bg-neon-cyan/8 shadow-[0_0_18px_rgba(0,229,255,0.2)]'
              : isMe
                ? 'border-neon-purple/50 bg-neon-purple/8'
                : 'border-neon-green/30 bg-black/80 hover:border-neon-green/60 hover:bg-black/90',
      )}
    >
      {/* Seat badge — absolute top-left */}
      <div className={clsx(
        'absolute top-1.5 left-1.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1',
        dead
          ? 'bg-white/5 border border-white/8'
          : isMe
            ? 'bg-neon-purple/20 border border-neon-purple/40'
            : 'bg-white/8 border border-white/15',
      )}>
        <span className={clsx(
          'text-[9px] font-mono font-bold',
          dead ? 'text-white/20' : isMe ? 'text-neon-purple/70' : 'text-white/45',
        )}>
          {player.seat}
        </span>
      </div>

      {/* Vote badge — top-right */}
      {voteCount > 0 && (
        <div className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] rounded-full bg-neon-red flex items-center justify-center px-1 shadow-[0_0_8px_rgba(255,45,85,0.6)]">
          <span className="text-[9px] font-bold text-white">{voteCount}</span>
        </div>
      )}

      {/* Name row */}
      <div className="w-full px-5 flex items-center gap-1.5 min-w-0">
        <span className={clsx(
          'text-xs font-semibold truncate',
          dead ? 'text-white/30' : isMe ? 'text-neon-purple' : 'text-white/90',
        )}>
          {player.name}
        </span>
        {player.isModerator && player.moderatorLevel && (
          <ModBadge level={player.moderatorLevel} size="xs" />
        )}
        {player.isSpectator && (
          <span className="text-[9px] text-neon-purple/60 font-mono flex-shrink-0">👁</span>
        )}
      </div>

      {/* Role badge — own card only, always shown */}
      {isMe && player.role && (
        <div
          className="flex items-center gap-1 px-2.5 py-0.5 rounded-full -mt-1"
          style={{ background: 'rgba(155,0,255,0.15)', border: '1px solid rgba(155,0,255,0.4)' }}
        >
          <span className="text-sm leading-none">{ROLE_ICONS[player.role] ?? '?'}</span>
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider" style={{ color: 'rgba(200,130,255,0.95)' }}>
            {player.role.replace(/_/g, ' ')}
          </span>
        </div>
      )}

      {/* Avatar */}
      <BigAvatar player={player} size={72} />

      {/* Role (spectator/game over view) */}
      {showRole && player.role && (
        <span className="text-[9px] font-mono text-white/40 uppercase tracking-wider px-2 py-0.5 rounded-full border border-white/10 bg-white/5">
          {player.role}
        </span>
      )}

      {/* Speaking indicator */}
      {isSpeaker && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
          <span className="text-[9px] font-mono text-neon-cyan/80 animate-pulse">▶ speaking</span>
        </div>
      )}

      {/* Vote progress bar at bottom */}
      {isVoting && voteBarPct > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${voteBarPct}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className={clsx(
              'h-full',
              voteBarPct >= 100
                ? 'bg-neon-red shadow-[0_0_8px_rgba(255,45,85,0.9)]'
                : 'bg-neon-red/60',
            )}
          />
        </div>
      )}
    </motion.button>
  );
}

export function PlayerGrid({
  players,
  phase,
  currentSpeakerId,
  myPlayerId,
  voteCounts = {},
  selectedVoteId,
  showRoles,
  fillHeight,
  onSelect,
}: Props) {
  const isSpeechPhase = phase === 'speech';
  const alivePlayers = players.filter(p => p.isAlive && !p.isSpectator);
  const totalAlive = alivePlayers.length;
  const numRows = Math.ceil(players.length / 2);

  if (isSpeechPhase && currentSpeakerId) {
    const speaker = players.find(p => p.id === currentSpeakerId);
    if (speaker) {
      const speakerIndex = alivePlayers.findIndex(p => p.id === currentSpeakerId);
      return (
        <AnimatePresence mode="wait">
          <SpeakerHero
            key={currentSpeakerId}
            player={speaker}
            isMe={speaker.id === myPlayerId}
            speakerIndex={speakerIndex >= 0 ? speakerIndex : 0}
            totalSpeakers={totalAlive}
          />
        </AnimatePresence>
      );
    }
  }

  return (
    <div
      className={clsx('grid grid-cols-2 gap-2 p-1', fillHeight && 'h-full')}
      style={fillHeight ? { gridTemplateRows: `repeat(${numRows}, 1fr)` } : undefined}
    >
      <AnimatePresence>
        {players.map((player, i) => (
          <motion.div
            key={player.id}
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.03, duration: 0.25 }}
            className={fillHeight ? 'h-full' : undefined}
          >
            <PlayerCard
              player={player}
              isMe={player.id === myPlayerId}
              isSpeaker={player.id === currentSpeakerId}
              voteCount={voteCounts[player.id] ?? 0}
              isSelected={selectedVoteId === player.id}
              showRole={showRoles}
              phase={phase}
              totalAlive={totalAlive}
              fillHeight={fillHeight}
              onClick={() => onSelect?.(player)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
