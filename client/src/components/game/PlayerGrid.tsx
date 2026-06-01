import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { PlayerPublic, Phase, RoleKey } from '@/types/index';
import { ModBadge } from '@/components/ui/ModBadge';

const ROLE_ICONS: Partial<Record<RoleKey, string>> = {
  citizen: '🏙', sheriff: '🔍', doctor: '💉', bodyguard: '🛡',
  vigilante: '⚖️', escort: '💃', spy: '🕵️', tracker: '👁',
  veteran: '🎖️',
  mafia: '🔫', don: '♛', arsonist: '🔥',
  maniac: '🌀', jester: '🃏',
  cult_leader: '🕯️', cultist: '🔮',
};

/** Voice state for the local player's tile (camera/mic). */
export interface TileVoice {
  /** socketId of every peer that is currently speaking */
  speakingSocketIds: Set<string>;
  /** local player socketId */
  localSocketId: string | null;
  inVoice: boolean;
  isMuted: boolean;
  cameraOn: boolean;
  isLocalSpeaking: boolean;
  localStream: MediaStream | null;
  /** remote video streams keyed by peer socketId */
  remoteStreams: Record<string, MediaStream>;
  micLocked?: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onJoin: (withCamera?: boolean) => void;
}

interface Props {
  players: PlayerPublic[];
  phase: Phase;
  currentSpeakerId?: string | null;
  myPlayerId?: string | null;
  voteCounts?: Record<string, number>;
  selectedVoteId?: string | null;
  showRoles?: boolean;
  fillHeight?: boolean;
  voice?: TileVoice;
  onSelect?: (p: PlayerPublic) => void;
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map(w => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('') || '?';
}

/** Live <video> element bound to the local MediaStream. */
function LocalVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      className="absolute inset-0 w-full h-full object-cover"
      style={{ transform: 'scaleX(-1)' }} // mirror own camera
    />
  );
}

/** Live <video> element bound to a remote peer's MediaStream. */
function RemoteVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  // Only render if the stream actually has an active video track
  const hasVideo = stream.getVideoTracks().some(t => t.readyState === 'live');
  if (!hasVideo) return null;

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      className="absolute inset-0 w-full h-full object-cover"
    />
  );
}

function SpeakerHero({ player, isMe, speakerIndex, totalSpeakers, voice }: {
  player: PlayerPublic;
  isMe: boolean;
  speakerIndex: number;
  totalSpeakers: number;
  voice?: TileVoice;
}) {
  const initials = initialsOf(player.name);
  const isSpeaking = isMe
    ? (voice?.isLocalSpeaking && !voice?.isMuted)
    : (voice?.speakingSocketIds.has(player.socketId) ?? false);
  const showLocalVideo = isMe && voice?.inVoice && voice.cameraOn && !!voice.localStream;
  const remoteStream = !isMe ? (voice?.remoteStreams?.[player.socketId] ?? null) : null;
  const hasRemoteVideo = !!remoteStream && remoteStream.getVideoTracks().some(t => t.readyState === 'live');

  return (
    <motion.div
      key={player.id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col items-center py-4 gap-4 px-3 w-full"
    >
      {/* Progress dots */}
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

      {/* Speaker card */}
      <motion.div
        className="relative w-full rounded-2xl overflow-hidden"
        style={{
          maxWidth: '360px',
          aspectRatio: '4/3',
          border: isSpeaking
            ? '2px solid rgba(0,255,136,0.7)'
            : '2px solid rgba(0,229,255,0.35)',
          boxShadow: isSpeaking
            ? '0 0 28px rgba(0,255,136,0.25), 0 8px 32px rgba(0,0,0,0.6)'
            : '0 0 24px rgba(0,229,255,0.12), 0 8px 32px rgba(0,0,0,0.6)',
          background: 'rgba(4,2,16,0.97)',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
      >
        {/* Video or avatar fill */}
        <div className="absolute inset-0">
          {showLocalVideo ? (
            <LocalVideo stream={voice!.localStream!} />
          ) : (remoteStream && hasRemoteVideo) ? (
            <RemoteVideo stream={remoteStream} />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                background: isMe
                  ? 'linear-gradient(150deg, rgba(40,0,70,0.55) 0%, rgba(5,2,20,0.95) 70%)'
                  : 'linear-gradient(150deg, rgba(0,30,50,0.45) 0%, rgba(2,5,16,0.95) 70%)',
              }}
            >
              <motion.div
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                className="rounded-full flex items-center justify-center font-display font-bold"
                style={{
                  width: 88, height: 88, fontSize: 34,
                  background: 'linear-gradient(135deg, rgba(155,0,255,0.4) 0%, rgba(0,229,255,0.25) 100%)',
                  border: '2px solid rgba(0,229,255,0.3)',
                  color: '#00e5ff',
                  boxShadow: '0 0 30px rgba(0,229,255,0.18)',
                }}
              >
                {initials}
              </motion.div>
            </div>
          )}
        </div>

        {/* Speaking pulse overlay */}
        {isSpeaking && (
          <motion.div
            className="absolute inset-0 pointer-events-none rounded-2xl"
            animate={{ opacity: [0.05, 0.13, 0.05] }}
            transition={{ repeat: Infinity, duration: 0.75, ease: 'easeInOut' }}
            style={{ background: 'rgba(0,255,136,0.35)' }}
          />
        )}

        {/* Top gradient: seat + name + "you" badge */}
        <div
          className="absolute top-0 left-0 right-0 px-3 pt-2.5 pb-10 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.78) 0%, transparent 100%)' }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="flex-shrink-0 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-mono font-bold"
              style={{ background: 'rgba(0,229,255,0.22)', color: '#00e5ff' }}
            >
              {player.seat}
            </span>
            <span className="font-display font-bold text-white text-sm leading-tight truncate flex-1">
              {player.name}
            </span>
            {isMe && (
              <span
                className="flex-shrink-0 text-[9px] font-display font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(155,0,255,0.3)', border: '1px solid rgba(155,0,255,0.5)', color: '#c084fc' }}
              >
                you
              </span>
            )}
          </div>
        </div>

        {/* Bottom gradient: controls (me) or status (remote) */}
        <div
          className="absolute bottom-0 left-0 right-0 px-3 pb-2.5 pt-10"
          style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.82) 0%, transparent 100%)' }}
          onClick={e => e.stopPropagation()}
        >
          {isMe && voice?.inVoice ? (
            <div className="flex items-center gap-2">
              <button
                onClick={voice.onToggleMute}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-mono font-bold active:scale-90 transition-all"
                style={voice.isMuted
                  ? { background: 'rgba(255,45,85,0.22)', border: '1px solid rgba(255,45,85,0.55)', color: '#ff6677' }
                  : { background: 'rgba(0,255,136,0.16)', border: '1px solid rgba(0,255,136,0.5)', color: '#00ff88' }}
              >
                <span>{voice.isMuted ? '🔇' : '🎙'}</span>
                <span>{voice.isMuted ? 'muted' : 'mic on'}</span>
              </button>
              <button
                onClick={voice.onToggleCamera}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-mono font-bold active:scale-90 transition-all"
                style={voice.cameraOn
                  ? { background: 'rgba(0,229,255,0.16)', border: '1px solid rgba(0,229,255,0.5)', color: '#00e5ff' }
                  : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.5)' }}
              >
                <span>{voice.cameraOn ? '📹' : '📷'}</span>
                <span>{voice.cameraOn ? 'cam on' : 'camera'}</span>
              </button>
            </div>
          ) : isMe && !voice?.inVoice ? (
            <button
              onClick={() => voice?.onJoin()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-mono font-bold active:scale-90 transition-all"
              style={{ background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.38)', color: '#00e5ff' }}
            >
              <span>🎙</span><span>Join Voice</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono"
                style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <span>{hasRemoteVideo ? '📹' : '📷'}</span>
                <span style={{ color: hasRemoteVideo ? '#00e5ff' : 'rgba(255,255,255,0.3)' }}>
                  {hasRemoteVideo ? 'cam on' : 'cam off'}
                </span>
              </div>
              {isSpeaking && (
                <div
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono animate-pulse"
                  style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.4)', color: '#00ff88' }}
                >
                  🔊
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Label below card */}
      <div className="text-center space-y-0.5">
        <p className="text-xs font-mono uppercase tracking-widest" style={{ color: isMe ? '#a78bfa' : '#00e5ff', opacity: 0.75 }}>
          {isMe ? '🎤 your turn to speak' : '🎤 speaking now'}
        </p>
        <p className="text-[10px] font-mono text-white/25">{speakerIndex + 1} / {totalSpeakers}</p>
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
  voice,
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
  voice?: TileVoice;
  onClick: () => void;
}) {
  const dead = !player.isAlive && !player.isSpectator;
  const isVoting = phase === 'voting';
  const majorityVotes = totalAlive ? Math.ceil(totalAlive / 2) : 1;
  const voteBarPct = isVoting && voteCount > 0 ? Math.min(100, (voteCount / majorityVotes) * 100) : 0;

  // Voice state for this specific tile
  const peerSpeaking = voice?.speakingSocketIds.has(player.socketId) ?? false;
  const isVoiceSpeaking = isMe ? (voice?.isLocalSpeaking && !voice?.isMuted) : peerSpeaking;
  const showLocalVideo = isMe && voice?.inVoice && voice.cameraOn && voice.localStream;
  // The local player can control their own mic/cam once they're in voice
  const showLocalControls = isMe && !dead;
  const initials = initialsOf(player.name);

  // Role to display inside the tile (own role always; others only when revealed)
  const tileRole = (isMe || showRole) ? player.role : null;

  return (
    <motion.button
      layout
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      className={clsx(
        'relative w-full rounded-2xl border overflow-hidden text-left transition-all duration-200',
        fillHeight ? 'h-full' : 'aspect-[3/4]',
        dead
          ? 'border-white/8 opacity-50 grayscale pointer-events-none'
          : isSelected
            ? 'border-neon-red/70 shadow-[0_0_18px_rgba(255,45,85,0.3)]'
            : isVoiceSpeaking
              ? 'border-neon-green/70 shadow-[0_0_16px_rgba(0,255,136,0.35)]'
              : isSpeaker
                ? 'border-neon-cyan/70 shadow-[0_0_18px_rgba(0,229,255,0.25)]'
                : isMe
                  ? 'border-neon-purple/50'
                  : 'border-neon-green/25 hover:border-neon-green/50',
      )}
    >
      {/* ── Main area: live video, or avatar/initials placeholder ── */}
      <div className="absolute inset-0">
        {showLocalVideo ? (
          <LocalVideo stream={voice!.localStream!} />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background: dead
                ? 'rgba(0,0,0,0.6)'
                : isMe
                  ? 'linear-gradient(150deg, rgba(40,0,70,0.55) 0%, rgba(5,2,20,0.9) 70%)'
                  : 'linear-gradient(150deg, rgba(0,30,40,0.4) 0%, rgba(2,5,12,0.92) 70%)',
            }}
          >
            {dead ? (
              <span className="text-4xl opacity-40">💀</span>
            ) : (
              <div
                className="rounded-full flex items-center justify-center font-display font-bold"
                style={{
                  width: 'clamp(44px, 28%, 72px)',
                  aspectRatio: '1',
                  fontSize: 'clamp(16px, 8vw, 26px)',
                  background: 'linear-gradient(135deg, rgba(155,0,255,0.35) 0%, rgba(0,229,255,0.22) 100%)',
                  border: '2px solid rgba(0,229,255,0.25)',
                  color: '#00e5ff',
                }}
              >
                {initials}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Top scrim + name/role row ── */}
      <div
        className="absolute top-0 left-0 right-0 px-2 pt-1.5 pb-3 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)' }}
      >
        <div className="flex items-center gap-1 min-w-0">
          {/* Seat */}
          <span
            className="flex-shrink-0 min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center text-[9px] font-mono font-bold"
            style={isMe
              ? { background: 'rgba(155,0,255,0.3)', color: 'rgba(205,150,255,0.98)' }
              : { background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}
          >
            {player.seat}
          </span>
          {/* Name */}
          <span className={clsx(
            'text-[11px] font-semibold truncate flex-1',
            isMe ? '' : 'text-white',
          )} style={isMe ? { color: 'rgba(210,150,255,0.98)' } : undefined}>
            {player.name}
          </span>
          {player.isModerator && player.moderatorLevel && (
            <ModBadge level={player.moderatorLevel} size="xs" />
          )}
          {player.isSpectator && <span className="text-[9px] flex-shrink-0">👁</span>}
        </div>

        {/* Role chip (own tile, or revealed) */}
        {tileRole && (
          <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md"
            style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(155,0,255,0.4)' }}>
            <span className="text-[11px] leading-none">{ROLE_ICONS[tileRole] ?? '?'}</span>
            <span className="text-[8px] font-mono font-bold uppercase tracking-wider"
              style={{ color: 'rgba(205,150,255,0.95)' }}>
              {tileRole.replace(/_/g, ' ')}
            </span>
          </div>
        )}
      </div>

      {/* ── Vote count badge — top-right ── */}
      {voteCount > 0 && (
        <div className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] rounded-full bg-neon-red flex items-center justify-center px-1 shadow-[0_0_8px_rgba(255,45,85,0.6)] z-10">
          <span className="text-[9px] font-bold text-white">{voteCount}</span>
        </div>
      )}

      {/* ── Voice controls bar — own tile ── */}
      {showLocalControls && (
        <div className="absolute bottom-0 left-0 right-0 z-10"
          onClick={e => e.stopPropagation()}>
          {voice?.inVoice ? (
            /* In voice: mic + camera toggles */
            <div
              className="flex items-center justify-center gap-2 px-2 py-1.5"
              style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 0%, transparent 100%)' }}
            >
              <button
                onClick={e => { e.stopPropagation(); if (!voice.micLocked) voice.onToggleMute(); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold active:scale-90 transition-all"
                style={voice.micLocked
                  ? { background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }
                  : voice.isMuted
                    ? { background: 'rgba(255,45,85,0.2)', border: '1px solid rgba(255,45,85,0.55)', color: '#ff6677' }
                    : { background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.45)', color: '#00ff88' }}
              >
                <span>{voice.micLocked ? '🔒' : voice.isMuted ? '🔇' : '🎙'}</span>
                <span className="hidden xs:inline">{voice.isMuted ? 'muted' : 'mic'}</span>
              </button>
              <button
                onClick={e => { e.stopPropagation(); voice.onToggleCamera(); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold active:scale-90 transition-all"
                style={voice.cameraOn
                  ? { background: 'rgba(0,229,255,0.15)', border: '1px solid rgba(0,229,255,0.45)', color: '#00e5ff' }
                  : { background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.55)' }}
              >
                <span>{voice.cameraOn ? '📹' : '📷'}</span>
                <span className="hidden xs:inline">{voice.cameraOn ? 'cam on' : 'camera'}</span>
              </button>
            </div>
          ) : (
            /* Not in voice: join options */
            <div
              className="flex items-center justify-center gap-1.5 px-2 py-1.5"
              style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 0%, transparent 100%)' }}
            >
              <button
                onClick={e => { e.stopPropagation(); voice?.onJoin(); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold active:scale-90 transition-all"
                style={{ background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.4)', color: '#00e5ff' }}
                title="Join voice"
              >
                <span>🎙</span>
                <span>Join</span>
              </button>
              <button
                onClick={e => { e.stopPropagation(); voice?.onJoin(true); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold active:scale-90 transition-all"
                style={{ background: 'rgba(155,0,255,0.12)', border: '1px solid rgba(155,0,255,0.35)', color: 'rgba(205,150,255,0.9)' }}
                title="Join with camera"
              >
                <span>📷</span>
                <span>+cam</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Remote speaking indicator ── */}
      {!showLocalControls && isVoiceSpeaking && (
        <div className="absolute bottom-1.5 right-1.5 z-10">
          <span className="flex items-center justify-center w-6 h-6 rounded-full text-[11px]"
            style={{ background: 'rgba(0,255,136,0.2)', border: '1px solid rgba(0,255,136,0.55)', boxShadow: '0 0 8px rgba(0,255,136,0.4)' }}>
            🔊
          </span>
        </div>
      )}

      {/* ── Speaking indicator (tribunal) ── */}
      {isSpeaker && (
        <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/55 z-10">
          <span className="text-[9px] font-mono text-neon-cyan animate-pulse">▶ floor</span>
        </div>
      )}

      {/* ── Vote progress bar at very bottom ── */}
      {isVoting && voteBarPct > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/5 z-10">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${voteBarPct}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className={clsx('h-full', voteBarPct >= 100 ? 'bg-neon-red shadow-[0_0_8px_rgba(255,45,85,0.9)]' : 'bg-neon-red/60')}
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
  voice,
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
            voice={voice}
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
              voice={voice}
              onClick={() => onSelect?.(player)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
