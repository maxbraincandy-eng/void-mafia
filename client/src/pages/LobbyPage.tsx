import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useGameStore } from '@/store/gameStore';
import { useT } from '@/store/langStore';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { PlayerStatsModal } from '@/components/ui/PlayerStatsModal';
import { ReportModal } from '@/components/ui/ReportModal';
import { VoiceControls } from '@/components/game/VoiceControls';
import { VoiceParticipants } from '@/components/game/VoiceParticipants';
import { RolePickerPanel } from '@/components/lobby/RolePickerPanel';
import { RoleInfoModal } from '@/components/ui/RoleInfoModal';
import { useVoiceChat } from '@/hooks/useVoiceChat';
import { PlayerPublic } from '@/types/index';

export function LobbyPage() {
  const {
    room, myPlayer, amHost, toggleReady, kickPlayer, startGame,
    updateSettings, leaveRoom, transferHost, isLoading,
  } = useGameStore(s => ({
    room: s.room,
    myPlayer: s.myPlayer(),
    amHost: s.amHost(),
    toggleReady: s.toggleReady,
    kickPlayer: s.kickPlayer,
    startGame: s.startGame,
    updateSettings: s.updateSettings,
    leaveRoom: s.leaveRoom,
    transferHost: s.transferHost,
    isLoading: s.isLoading,
  }));

  const [showSettings, setShowSettings] = useState(false);
  const [showRoleGuide, setShowRoleGuide] = useState(false);
  const [statsPlayer, setStatsPlayer] = useState<PlayerPublic | null>(null);
  const [reportProfileId, setReportProfileId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmTransferId, setConfirmTransferId] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const t = useT();
  const voice = useVoiceChat();
  const autoJoined = useRef(false);

  useEffect(() => {
    if (!room?.id || autoJoined.current || voice.channel) return;
    autoJoined.current = true;
    navigator.permissions?.query({ name: 'microphone' as PermissionName })
      .then(result => { if (result.state === 'granted') voice.joinVoice('room'); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  if (!room) return null;

  const amSpectator = myPlayer?.isSpectator ?? false;
  const activePlayers = room.players.filter(p => !p.isSpectator);
  const playerCount = activePlayers.length;
  const minPlayers = room.settings.minPlayers;
  const canStart = amHost && playerCount >= minPlayers;
  const readyCount = activePlayers.filter(p => !p.isHost && p.isReady).length;
  const nonHostCount = activePlayers.filter(p => !p.isHost).length;
  const allReady = nonHostCount > 0 && readyCount === nonHostCount;
  const readyPct = nonHostCount > 0 ? (readyCount / nonHostCount) * 100 : 0;

  const handleCopy = () => {
    navigator.clipboard.writeText(`https://voidmafia.one/join/${room.code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-neon-grid-animated scanlines relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-neon-purple/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-56 h-56 bg-neon-cyan/6 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-6">

        {/* ── Top bar ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between mb-6 gap-4"
        >
          {/* Left: Title + status */}
          <div>
            <h1 className="font-display text-3xl font-bold gradient-text tracking-wide leading-none mb-1">
              VOID MAFIA
            </h1>
            <p className="text-neon-green/50 font-mono text-[10px] tracking-widest mb-2">
              {t.common?.poweredBy ?? 'powered by ბატონი მაქსი'}
            </p>
            {/* Status chip + role guide */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className={clsx(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono uppercase tracking-widest',
                allReady && canStart
                  ? 'border-neon-green/40 bg-neon-green/8 text-neon-green'
                  : 'border-white/10 bg-white/4 text-white/40',
              )}>
                <span className={clsx(
                  'w-1.5 h-1.5 rounded-full',
                  allReady && canStart ? 'bg-neon-green animate-pulse' : 'bg-white/30',
                )} />
                {allReady && canStart ? 'All ready — start game' : `Waiting for players · ${playerCount}/${minPlayers}`}
              </div>
              <button
                onClick={() => setShowRoleGuide(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-neon-purple/30 bg-neon-purple/8 text-neon-purple/70 hover:border-neon-purple/60 hover:text-neon-purple hover:bg-neon-purple/15 text-[10px] font-mono uppercase tracking-widest transition-all"
              >
                📖 Roles
              </button>
            </div>
          </div>

          {/* Right: Room code */}
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest mb-1.5">Room Code</p>
            <button
              onClick={handleCopy}
              className="group flex items-center gap-2 justify-end"
              title="Click to copy invite link"
            >
              <div
                className="glass-card border border-neon-cyan/30 px-4 py-2 group-hover:border-neon-cyan/60 transition-all"
                style={{ boxShadow: '0 0 16px rgba(0,245,255,0.08)' }}
              >
                <span className="font-mono text-2xl font-bold text-neon-cyan tracking-[0.3em]"
                  style={{ textShadow: '0 0 16px rgba(0,245,255,0.5)' }}>
                  {room.code}
                </span>
              </div>
              <span className={clsx(
                'text-[10px] font-mono px-2.5 py-1.5 rounded-lg border transition-all',
                copied
                  ? 'border-neon-green/40 bg-neon-green/10 text-neon-green'
                  : 'border-white/10 bg-white/4 text-white/40 group-hover:border-neon-cyan/30 group-hover:text-neon-cyan/70',
              )}>
                {copied ? '✓ Copied' : '⎘ Copy'}
              </span>
            </button>
            {room.settings.isPrivate && (
              <p className="text-[10px] text-neon-pink/60 font-mono mt-1.5 tracking-widest">🔒 PRIVATE</p>
            )}
          </div>
        </motion.div>

        {/* ── Main grid ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Players column */}
          <div className="lg:col-span-2 space-y-4">

            {/* Player list card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="glass-panel border border-white/8 rounded-2xl p-4"
            >
              {/* Card header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-display font-bold text-white/50 tracking-widest uppercase">
                    {t.lobby.players}
                  </h2>
                  <span className="text-[10px] font-mono text-white/25">{playerCount} joined</span>
                </div>
                {/* Readiness bar */}
                {nonHostCount > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-white/30">{readyCount}/{nonHostCount} ready</span>
                    <div className="w-20 h-1.5 bg-white/8 rounded-full overflow-hidden">
                      <motion.div
                        className={clsx('h-full rounded-full', allReady ? 'bg-neon-green' : 'bg-neon-cyan/60')}
                        animate={{ width: `${readyPct}%` }}
                        transition={{ duration: 0.4 }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Player rows */}
              <div className="space-y-1.5">
                {room.players.map((player, i) => {
                  const isMe = player.id === myPlayer?.id;
                  return (
                    <motion.div
                      key={player.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.06 + i * 0.04 }}
                      onClick={() => !isMe && setStatsPlayer(player)}
                      className={clsx(
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all',
                        isMe
                          ? 'border-neon-purple/25 bg-neon-purple/6'
                          : !player.isSpectator
                            ? 'border-white/6 bg-white/2 hover:border-neon-cyan/20 hover:bg-neon-cyan/3 cursor-pointer'
                            : 'border-white/4 bg-white/1 opacity-60',
                      )}
                    >
                      {/* Seat badge */}
                      <div className="w-6 h-6 rounded-full bg-white/6 border border-white/10 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-mono text-white/30 font-bold">{player.seat}</span>
                      </div>

                      <Avatar name={player.name} isHost={player.isHost} size="sm" />

                      {/* Name + tags */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={clsx(
                            'text-sm font-semibold truncate',
                            player.isModerator ? 'text-neon-green'
                            : player.isHost ? 'text-yellow-400'
                            : isMe ? 'text-neon-purple/90'
                            : 'text-white/80',
                          )}>
                            {player.name}
                          </span>
                          {isMe && (
                            <span className="text-[9px] font-mono text-neon-purple/60 border border-neon-purple/20 rounded px-1">
                              you
                            </span>
                          )}
                          {!player.isConnected && (
                            <span className="text-[9px] font-mono text-white/20 border border-white/10 rounded px-1">
                              reconnecting
                            </span>
                          )}
                          {player.isModerator && (
                            <span className="text-[9px] font-mono text-neon-green border border-neon-green/20 rounded px-1">
                              MOD
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status pill */}
                      <div className="shrink-0">
                        {player.isHost ? (
                          <span className="text-[10px] font-mono text-yellow-400/80 flex items-center gap-1">
                            <span>👑</span> Host
                          </span>
                        ) : player.isSpectator ? (
                          <span className="text-[10px] font-mono text-neon-purple/50">👁 Spectating</span>
                        ) : player.isReady ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-neon-green"
                            style={{ textShadow: '0 0 8px rgba(0,255,136,0.5)' }}>
                            <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
                            READY
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-white/20">waiting…</span>
                        )}
                      </div>

                      {/* Host controls */}
                      {amHost && !isMe && (
                        <div className="flex items-center gap-1 ml-1 shrink-0" onClick={e => e.stopPropagation()}>
                          {confirmTransferId === player.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] text-white/30 font-mono">make host?</span>
                              <button
                                onClick={() => { transferHost(player.id); setConfirmTransferId(null); }}
                                disabled={isLoading}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-yellow-400/40 text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                              >✓</button>
                              <button
                                onClick={() => setConfirmTransferId(null)}
                                className="text-[10px] px-1 text-white/25 hover:text-white/50 transition-colors"
                              >✕</button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => setConfirmTransferId(player.id)}
                                title="Transfer host"
                                className="w-6 h-6 flex items-center justify-center rounded text-white/15 hover:text-yellow-400 transition-colors text-sm"
                              >👑</button>
                              <button
                                onClick={() => kickPlayer(player.id)}
                                className="w-6 h-6 flex items-center justify-center rounded text-white/15 hover:text-neon-red transition-colors text-xs font-mono"
                                title="Kick"
                              >✕</button>
                            </>
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {/* Need more players */}
              {playerCount < minPlayers && (
                <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-center gap-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: minPlayers }).map((_, i) => (
                      <div key={i} className={clsx(
                        'w-1.5 h-1.5 rounded-full',
                        i < playerCount ? 'bg-neon-cyan/70' : 'bg-white/10',
                      )} />
                    ))}
                  </div>
                  <span className="text-[10px] font-mono text-white/30">
                    Need {minPlayers - playerCount} more player{minPlayers - playerCount !== 1 ? 's' : ''} to start
                  </span>
                </div>
              )}
            </motion.div>

            {/* ── Action bar ─────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex gap-2.5"
            >
              {/* Non-host ready toggle */}
              {!amHost && !amSpectator && (
                <Button
                  fullWidth
                  variant={myPlayer?.isReady ? 'neon-green' : 'neon-cyan'}
                  loading={isLoading}
                  onClick={() => toggleReady()}
                >
                  {myPlayer?.isReady ? '✓ Ready!' : 'Mark Ready'}
                </Button>
              )}

              {/* Spectator badge */}
              {amSpectator && (
                <div className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-neon-purple/20 bg-neon-purple/5 text-neon-purple/60 text-sm font-mono">
                  👁 Watching as spectator
                </div>
              )}

              {/* Host: start + settings */}
              {amHost && (
                <>
                  <Button
                    fullWidth
                    variant="primary"
                    loading={isLoading}
                    disabled={!canStart}
                    onClick={() => startGame()}
                    className={canStart ? 'ring-1 ring-neon-green/20' : ''}
                  >
                    {canStart ? '▶ Start Game' : `▶ Start  (need ${minPlayers - playerCount} more)`}
                  </Button>
                  <button
                    onClick={() => setShowSettings(s => !s)}
                    className={clsx(
                      'px-3.5 py-2 rounded-xl border text-sm transition-all',
                      showSettings
                        ? 'border-neon-purple/40 bg-neon-purple/10 text-neon-purple'
                        : 'border-white/10 bg-white/4 text-white/40 hover:border-neon-purple/30 hover:text-neon-purple/70',
                    )}
                    title="Game Settings"
                  >
                    ⚙
                  </button>
                </>
              )}

              {/* Leave */}
              {showLeaveConfirm ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-neon-red/25 bg-neon-red/5 flex-1">
                  <span className="text-[10px] text-white/50 font-mono flex-1 leading-tight">
                    {playerCount > 1 ? 'Leave? Host reassigned automatically.' : 'Leave and close the room?'}
                  </span>
                  <button
                    onClick={() => leaveRoom()}
                    disabled={isLoading}
                    className="text-[10px] px-2.5 py-1.5 rounded-lg bg-neon-red/80 text-white font-display font-bold uppercase tracking-wider hover:bg-neon-red transition-colors disabled:opacity-40 shrink-0"
                  >
                    Leave
                  </button>
                  <button onClick={() => setShowLeaveConfirm(false)} className="text-white/25 hover:text-white/60 text-xs shrink-0">✕</button>
                </div>
              ) : (
                <button
                  onClick={() => amHost ? setShowLeaveConfirm(true) : leaveRoom()}
                  disabled={isLoading}
                  className="px-3.5 py-2 rounded-xl border border-neon-red/20 text-neon-red/50 text-xs font-mono hover:border-neon-red/40 hover:text-neon-red/80 hover:bg-neon-red/5 transition-all disabled:opacity-30"
                  title="Leave room"
                >
                  Leave
                </button>
              )}
            </motion.div>

            {/* ── Settings panel ─────────────────────────────────── */}
            <AnimatePresence>
              {showSettings && amHost && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-1">
                    <RolePickerPanel
                      settings={room.settings}
                      playerCount={playerCount}
                      onUpdate={updateSettings}
                      isLoading={isLoading}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Voice ──────────────────────────────────────────── */}
            <VoiceControls
              channel={voice.channel}
              status={voice.status}
              isMuted={voice.isMuted}
              cameraOn={voice.cameraOn}
              isLocalSpeaking={voice.isLocalSpeaking}
              peerCount={voice.peers.length}
              error={voice.error}
              defaultChannel="room"
              onJoin={(ch, wc) => voice.joinVoice(ch, wc)}
              onLeave={voice.leaveVoice}
              onToggleMute={voice.toggleMute}
              onToggleCamera={voice.toggleCamera}
            />
            {voice.channel && voice.peers.length > 0 && (
              <div className="px-1">
                <VoiceParticipants
                  localName={myPlayer?.name ?? 'You'}
                  isLocalSpeaking={voice.isLocalSpeaking}
                  isMuted={voice.isMuted}
                  peers={voice.peers}
                />
              </div>
            )}
          </div>

          {/* ── Chat column ───────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="lg:col-span-1 glass-panel border border-white/8 rounded-2xl p-4 min-h-[360px] flex flex-col"
          >
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <h2 className="text-xs font-display font-bold text-white/50 tracking-widest uppercase">
                Chat
              </h2>
              <span className="text-[10px] font-mono text-white/20">lobby channel</span>
            </div>
            <div className="flex-1 min-h-0">
              <ChatPanel />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Modals */}
      {statsPlayer && (
        <PlayerStatsModal
          profileId={statsPlayer.profileId ?? null}
          playerName={statsPlayer.name}
          onClose={() => setStatsPlayer(null)}
          onReport={pid => { setReportProfileId(pid); setStatsPlayer(null); }}
        />
      )}
      {reportProfileId && (
        <ReportModal
          targetProfileId={reportProfileId}
          targetName={room.players.find(p => p.profileId === reportProfileId)?.name ?? ''}
          roomId={room.id}
          onClose={() => setReportProfileId(null)}
          onSuccess={() => setReportProfileId(null)}
        />
      )}
      <RoleInfoModal open={showRoleGuide} onClose={() => setShowRoleGuide(false)} />
    </div>
  );
}
