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

const SURFACE = 'rounded-2xl border border-white/[0.06]';
const SURFACE_BG = { background: 'rgba(10, 6, 28, 0.92)' } as const;

export function LobbyPage() {
  const {
    room, myPlayer, amHost, toggleReady, kickPlayer, startGame,
    updateSettings, leaveRoom, transferHost, isLoading, autoStartCountdown,
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
    autoStartCountdown: s.autoStartCountdown,
  }));

  const [showSettings, setShowSettings] = useState(false);
  const [showRoleGuide, setShowRoleGuide] = useState(false);
  const [statsPlayer, setStatsPlayer] = useState<PlayerPublic | null>(null);
  const [reportProfileId, setReportProfileId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
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

  const handleShare = async () => {
    const url = `https://voidmafia.one/join/${room.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Void Mafia', text: `Join my game — code: ${room.code}`, url });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch {}
    } else {
      navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden pb-24"
      style={{ background: 'linear-gradient(160deg, #0c0525 0%, #050311 50%)' }}
    >
      {/* Ambient — single top glow only */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 90% 35% at 50% -5%, rgba(100,0,240,0.08) 0%, transparent 55%)' }}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-5">

        {/* ── Header ──────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between mb-6 gap-4"
        >
          <div>
            <h1 className="font-display text-2xl font-bold gradient-text tracking-wide mb-2 leading-none">
              VOID MAFIA
            </h1>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className={clsx(
                  'w-1.5 h-1.5 rounded-full shrink-0 transition-colors',
                  allReady && canStart ? 'bg-neon-green animate-pulse' : 'bg-white/[0.18]',
                )} />
                <span className="text-[11px] font-mono text-white/35">
                  {allReady && canStart
                    ? 'All players ready'
                    : `${playerCount} / ${minPlayers} joined`}
                </span>
              </div>
              <span className="text-white/10 select-none">·</span>
              <button
                onClick={() => setShowRoleGuide(true)}
                className="text-[11px] font-mono text-white/22 hover:text-white/50 transition-colors"
              >
                Role Guide ↗
              </button>
            </div>
          </div>

          {/* Room code */}
          <div className="text-right shrink-0">
            <p className="text-[9px] font-mono text-white/18 uppercase tracking-[0.18em] mb-1">Room</p>
            <div className="flex items-center justify-end gap-2">
              <span className="font-mono text-xl font-bold text-neon-cyan/80 tracking-[0.22em]">
                {room.code}
              </span>
              <button onClick={handleCopy} className={clsx(
                'text-[10px] px-2 py-0.5 rounded border font-mono transition-all',
                copied
                  ? 'border-neon-green/35 bg-neon-green/[0.07] text-neon-green/80'
                  : 'border-white/[0.08] text-white/22 hover:border-white/18 hover:text-white/45',
              )}>
                {copied ? '✓' : 'Copy'}
              </button>
              <button onClick={handleShare} className={clsx(
                'text-[10px] px-2 py-0.5 rounded border font-mono transition-all',
                shared
                  ? 'border-neon-cyan/35 bg-neon-cyan/[0.07] text-neon-cyan/80'
                  : 'border-white/[0.08] text-white/22 hover:border-white/18 hover:text-white/45',
              )}>
                {shared ? '✓' : 'Share'}
              </button>
            </div>
            {room.settings.isPrivate && (
              <p className="text-[10px] text-white/22 font-mono mt-1">Private room</p>
            )}
          </div>
        </motion.div>

        {/* ── Main grid ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Left column — players + actions */}
          <div className="lg:col-span-2 space-y-3">

            {/* ── Player list ─────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 }}
              className={SURFACE}
              style={SURFACE_BG}
            >
              {/* Card header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
                <span className="text-[11px] font-mono text-white/35">
                  {t.lobby.players}
                  <span className="ml-2 text-white/50">{playerCount}</span>
                </span>
                {nonHostCount > 0 && (
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] font-mono text-white/22">
                      {readyCount}/{nonHostCount} ready
                    </span>
                    <div className="w-16 h-0.5 bg-white/[0.07] rounded-full overflow-hidden">
                      <motion.div
                        className={clsx('h-full rounded-full', allReady ? 'bg-neon-green' : 'bg-neon-cyan/50')}
                        animate={{ width: `${readyPct}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Rows */}
              <div className="px-2 py-2">
                {room.players.map((player, i) => {
                  const isMe = player.id === myPlayer?.id;
                  return (
                    <motion.div
                      key={player.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.06 + i * 0.03 }}
                      onClick={() => !isMe && setStatsPlayer(player)}
                      className={clsx(
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors',
                        isMe
                          ? 'bg-white/[0.03]'
                          : !player.isSpectator
                          ? 'hover:bg-white/[0.025] cursor-pointer'
                          : 'opacity-45',
                      )}
                    >
                      <Avatar name={player.name} isHost={player.isHost} size="sm" />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={clsx(
                            'text-sm font-medium truncate',
                            player.isModerator ? 'text-neon-green/75'
                            : player.isHost ? 'text-yellow-400/75'
                            : isMe ? 'text-white/90'
                            : 'text-white/60',
                          )}>
                            {player.name}
                          </span>
                          {isMe && (
                            <span className="text-[9px] font-mono text-white/18 border border-white/[0.08] rounded px-1 py-px">
                              you
                            </span>
                          )}
                          {player.isModerator && (
                            <span className="text-[9px] font-mono text-neon-green/50 border border-neon-green/15 rounded px-1 py-px">
                              mod
                            </span>
                          )}
                          {!player.isConnected && (
                            <span className="text-[9px] font-mono text-white/18 border border-white/[0.07] rounded px-1 py-px">
                              reconnecting
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status */}
                      <div className="shrink-0 text-right">
                        {player.isHost ? (
                          <span className="text-[10px] font-mono text-yellow-400/50">Host</span>
                        ) : player.isSpectator ? (
                          <span className="text-[10px] font-mono text-neon-purple/35">Spectator</span>
                        ) : player.isReady ? (
                          <span className="flex items-center gap-1.5 text-[10px] font-mono text-neon-green/60">
                            <span className="w-1 h-1 rounded-full bg-neon-green/60" />
                            Ready
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-white/18">—</span>
                        )}
                      </div>

                      {/* Host controls */}
                      {amHost && !isMe && (
                        <div className="flex items-center gap-1 ml-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                          {confirmTransferId === player.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] text-white/22 font-mono">make host?</span>
                              <button
                                onClick={() => { transferHost(player.id); setConfirmTransferId(null); }}
                                disabled={isLoading}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-yellow-400/25 text-yellow-400/60 hover:bg-yellow-400/8 transition-colors"
                              >✓</button>
                              <button
                                onClick={() => setConfirmTransferId(null)}
                                className="text-[10px] px-1 text-white/18 hover:text-white/45 transition-colors"
                              >✕</button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => setConfirmTransferId(player.id)}
                                title="Transfer host"
                                className="w-6 h-6 flex items-center justify-center rounded text-white/12 hover:text-yellow-400/60 transition-colors text-[13px]"
                              >
                                ♛
                              </button>
                              <button
                                onClick={() => kickPlayer(player.id)}
                                className="w-6 h-6 flex items-center justify-center rounded text-white/10 hover:text-neon-red/60 transition-colors text-xs font-mono font-bold"
                                title="Kick"
                              >
                                ✕
                              </button>
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
                <div className="mx-4 mb-3 pt-2.5 border-t border-white/[0.04] flex items-center gap-2.5">
                  <div className="flex gap-0.5">
                    {Array.from({ length: minPlayers }).map((_, i) => (
                      <div key={i} className={clsx(
                        'w-1 h-1 rounded-full transition-colors',
                        i < playerCount ? 'bg-neon-cyan/40' : 'bg-white/[0.07]',
                      )} />
                    ))}
                  </div>
                  <span className="text-[10px] font-mono text-white/22">
                    {minPlayers - playerCount} more player{minPlayers - playerCount !== 1 ? 's' : ''} needed
                  </span>
                </div>
              )}
            </motion.div>

            {/* ── Action bar ─────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="flex gap-2"
            >
              {!amHost && !amSpectator && (
                <Button
                  fullWidth
                  variant={myPlayer?.isReady ? 'neon-green' : 'neon-cyan'}
                  loading={isLoading}
                  onClick={() => {
                    toggleReady();
                    if (!voice.channel) voice.joinVoice('room').catch(() => {});
                  }}
                >
                  {myPlayer?.isReady ? '✓ Ready' : t.lobby.ready}
                </Button>
              )}

              {amSpectator && (
                <div className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/[0.07] text-white/28 text-sm font-mono">
                  Watching as spectator
                </div>
              )}

              {amHost && (
                <>
                  <Button
                    fullWidth
                    variant="primary"
                    loading={isLoading}
                    disabled={!canStart}
                    onClick={() => startGame()}
                  >
                    {canStart ? t.lobby.startGame : `Need ${minPlayers - playerCount} more`}
                  </Button>
                  <button
                    onClick={() => setShowSettings(s => !s)}
                    className={clsx(
                      'px-4 py-2 rounded-xl border text-[11px] font-mono whitespace-nowrap transition-all',
                      showSettings
                        ? 'border-white/18 bg-white/[0.04] text-white/55'
                        : 'border-white/[0.07] bg-white/[0.02] text-white/28 hover:border-white/14 hover:text-white/50',
                    )}
                  >
                    Settings
                  </button>
                </>
              )}

              {/* Leave */}
              <AnimatePresence mode="wait">
                {showLeaveConfirm ? (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-neon-red/18 bg-neon-red/[0.03] shrink-0"
                  >
                    <span className="text-[10px] text-white/35 font-mono leading-tight whitespace-nowrap">
                      {playerCount > 1 ? 'Leave?' : 'Close room?'}
                    </span>
                    <button
                      onClick={() => leaveRoom()}
                      disabled={isLoading}
                      className="text-[10px] px-2.5 py-1 rounded-lg bg-neon-red/70 text-white font-mono font-bold hover:bg-neon-red/90 transition-colors disabled:opacity-40 whitespace-nowrap"
                    >
                      Leave
                    </button>
                    <button
                      onClick={() => setShowLeaveConfirm(false)}
                      className="text-white/18 hover:text-white/50 text-xs shrink-0"
                    >✕</button>
                  </motion.div>
                ) : (
                  <motion.button
                    key="leave"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => amHost ? setShowLeaveConfirm(true) : leaveRoom()}
                    disabled={isLoading}
                    className="px-3 py-2 rounded-xl text-[11px] font-mono text-white/20 hover:text-neon-red/55 transition-colors disabled:opacity-30 whitespace-nowrap"
                  >
                    Leave
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>

            {/* ── Auto-start countdown ────────────────────────── */}
            <AnimatePresence>
              {autoStartCountdown !== null && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-neon-green/18 bg-neon-green/[0.035]"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-neon-green/80 animate-ping" />
                  <span className="font-mono text-sm text-neon-green/75">
                    Starting in <span className="font-bold text-neon-green">{autoStartCountdown}s</span>
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Settings panel ──────────────────────────────── */}
            <AnimatePresence>
              {showSettings && amHost && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-1 space-y-3">
                    <div className={`${SURFACE} p-4`} style={SURFACE_BG}>
                      <label className="block text-[10px] font-mono text-white/28 uppercase tracking-widest mb-2.5">
                        Room Password
                      </label>
                      <input
                        type="text"
                        maxLength={64}
                        placeholder="Leave blank for open room"
                        value={room.settings.password ?? ''}
                        onChange={e => updateSettings({ password: e.target.value })}
                        className="w-full bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2 text-sm font-mono text-white/65 placeholder-white/15 focus:outline-none focus:border-neon-cyan/28 transition-colors"
                      />
                      {room.settings.password && (
                        <p className="text-[10px] font-mono text-white/28 mt-2">
                          Players will need this password to join.
                        </p>
                      )}
                    </div>
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

            {/* ── Voice ───────────────────────────────────────── */}
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

          {/* ── Chat column ─────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`lg:col-span-1 ${SURFACE} p-0 min-h-[360px] flex flex-col overflow-hidden`}
            style={SURFACE_BG}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04] flex-shrink-0">
              <span className="text-[11px] font-mono text-white/35">Chat</span>
              <span className="text-[10px] font-mono text-white/15">lobby</span>
            </div>
            <div className="flex-1 min-h-0 p-3">
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
