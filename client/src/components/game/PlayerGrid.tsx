import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { PlayerPublic } from '@/types/index';
import { Phase } from '@/types/index';
import { ModBadge } from '@/components/ui/ModBadge';

interface Props {
  players: PlayerPublic[];
  phase: Phase;
  currentSpeakerId?: string | null;
  myPlayerId?: string | null;
  voteCounts?: Record<string, number>;
  selectedVoteId?: string | null;
  showRoles?: boolean;
  onSelect?: (p: PlayerPublic) => void;
}

// Large avatar that fills the card — initials or photo
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

// ── Speaker hero — shown solo during speech phase ─────────────────────
function SpeakerHero({ player, isMe }: { player: PlayerPublic; isMe: boolean }) {
  return (
    <motion.div
      key={player.id}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col items-center py-6 gap-5"
    >
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
      </div>
    </motion.div>
  );
}

// ── Individual player card ────────────────────────────────────────────
function PlayerCard({
  player,
  isMe,
  isSpeaker,
  voteCount,
  isSelected,
  showRole,
  onClick,
}: {
  player: PlayerPublic;
  isMe: boolean;
  isSpeaker: boolean;
  voteCount: number;
  isSelected: boolean;
  showRole?: boolean;
  onClick: () => void;
}) {
  const dead = !player.isAlive && !player.isSpectator;

  return (
    <motion.button
      layout
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={clsx(
        'relative w-full rounded-2xl border transition-all duration-200 overflow-hidden text-left',
        'flex flex-col items-center pb-3 pt-4 gap-2',
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
      {/* Seat number + name row */}
      <div className="w-full px-3 flex items-center gap-1.5 min-w-0">
        <span className="text-[10px] font-mono text-white/30 flex-shrink-0">({player.seat})</span>
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

      {/* Avatar */}
      <BigAvatar player={player} size={72} />

      {/* Role (spectator view / game over) */}
      {showRole && player.role && (
        <span className="text-[9px] font-mono text-white/40 uppercase tracking-wider px-2 py-0.5 rounded-full border border-white/10 bg-white/5">
          {player.role}
        </span>
      )}

      {/* Vote count badge */}
      {voteCount > 0 && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-neon-red flex items-center justify-center text-[10px] font-bold text-white shadow-[0_0_8px_rgba(255,45,85,0.6)]">
          {voteCount}
        </div>
      )}

      {/* Speaking indicator */}
      {isSpeaker && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
          <span className="text-[9px] font-mono text-neon-cyan/80 animate-pulse">▶ speaking</span>
        </div>
      )}
    </motion.button>
  );
}

// ── Main export ───────────────────────────────────────────────────────
export function PlayerGrid({
  players,
  phase,
  currentSpeakerId,
  myPlayerId,
  voteCounts = {},
  selectedVoteId,
  showRoles,
  onSelect,
}: Props) {
  const isSpeechPhase = phase === 'speech';

  if (isSpeechPhase && currentSpeakerId) {
    const speaker = players.find(p => p.id === currentSpeakerId);
    if (speaker) {
      return (
        <AnimatePresence mode="wait">
          <SpeakerHero
            key={currentSpeakerId}
            player={speaker}
            isMe={speaker.id === myPlayerId}
          />
        </AnimatePresence>
      );
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2 p-1">
      <AnimatePresence>
        {players.map((player, i) => (
          <motion.div
            key={player.id}
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.03, duration: 0.25 }}
          >
            <PlayerCard
              player={player}
              isMe={player.id === myPlayerId}
              isSpeaker={player.id === currentSpeakerId}
              voteCount={voteCounts[player.id] ?? 0}
              isSelected={selectedVoteId === player.id}
              showRole={showRoles}
              onClick={() => onSelect?.(player)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
