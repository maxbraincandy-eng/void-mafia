import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useGameStore } from '@/store/gameStore';
import { Phase, PlayerPublic } from '@/types/index';
import { Timer } from '@/components/ui/Timer';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { PlayerList } from '@/components/game/PlayerList';
import { RoleReveal } from '@/components/game/RoleReveal';
import { NightPanel } from '@/components/game/NightPanel';
import { VotingPanel } from '@/components/game/VotingPanel';
import { GameOver } from '@/components/game/GameOver';
import { NightResultOverlay } from '@/components/game/NightResultOverlay';
import { PlayerStatsModal } from '@/components/ui/PlayerStatsModal';
import { ReportModal } from '@/components/ui/ReportModal';
import { LeaderboardModal } from '@/components/ui/LeaderboardModal';
import { VoiceControls } from '@/components/game/VoiceControls';
import { VoiceParticipants } from '@/components/game/VoiceParticipants';
import { useVoiceChat, VoiceChannel } from '@/hooks/useVoiceChat';
import { useGameSounds } from '@/hooks/useSoundFX';

type MobileTab = 'action' | 'players' | 'chat';

const PHASE_LABELS: Record<Phase, string> = {
  lobby:        'Lobby',
  role_reveal:  'Role Reveal',
  night:        'Night',
  day:          'Day',
  speech:       'Floor Time',
  voting:       'Voting',
  game_over:    'Game Over',
};

const PHASE_COLORS: Record<Phase, string> = {
  lobby:        'text-white',
  role_reveal:  'text-neon-purple',
  night:        'text-neon-cyan',
  day:          'text-yellow-300',
  speech:       'text-neon-green',
  voting:       'text-neon-red',
  game_over:    'text-white',
};

export function GamePage() {
  const [statsPlayer, setStatsPlayer] = useState<PlayerPublic | null>(null);
  const [reportProfileId, setReportProfileId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('action');
  const [unreadChat, setUnreadChat] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [willText, setWillText] = useState('');
  const [willSaved, setWillSaved] = useState(false);

  const {
    room, myPlayer, myRole, amHost, amAlive,
    nightResult, investigationResult, spyReport, gameOverResult,
    skipPhase, daySkipVote, leaveRoom, dismissNightResult, dismissInvestigation, dismissSpyReport, dismissGameOver,
    setWill, pauseTimer,
    isLoading,
  } = useGameStore(s => ({
    room: s.room,
    myPlayer: s.myPlayer(),
    myRole: s.myRole,
    amHost: s.amHost(),
    amAlive: s.amAlive(),
    nightResult: s.nightResult,
    investigationResult: s.investigationResult,
    spyReport: s.spyReport,
    gameOverResult: s.gameOverResult,
    skipPhase: s.skipPhase,
    daySkipVote: s.daySkipVote,
    leaveRoom: s.leaveRoom,
    dismissNightResult: s.dismissNightResult,
    dismissInvestigation: s.dismissInvestigation,
    dismissSpyReport: s.dismissSpyReport,
    dismissGameOver: s.dismissGameOver,
    setWill: s.setWill,
    pauseTimer: s.pauseTimer,
    isLoading: s.isLoading,
  }));

  const voice = useVoiceChat();
  useGameSounds();

  const isInVoice = voice.channel !== null;

  // Determine appropriate voice channel for this player/phase
  const isMafiaPlayer = myRole?.key === 'mafia' || myRole?.key === 'don';
  const voiceChannel: VoiceChannel =
    isMafiaPlayer && room?.phase === 'night' ? 'mafia' : 'room';
  const voiceChannelLabel =
    voiceChannel === 'mafia' ? '🔴 Mafia Voice' : '🎙 Room Voice';

  // During speech phase, mute local mic when it's not my turn
  useEffect(() => {
    if (!voice.channel || room?.phase !== 'speech') return;
    const isMyTurn = room.currentSpeakerId === myPlayer?.id;
    if (!isMyTurn && !voice.isMuted) voice.toggleMute();
    if (isMyTurn && voice.isMuted) voice.toggleMute();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.phase, room?.currentSpeakerId, myPlayer?.id, voice.channel]);

  // Auto-join voice if mic permission was already granted
  const autoJoined = useRef(false);
  useEffect(() => {
    if (!room?.id || autoJoined.current || voice.channel) return;
    autoJoined.current = true;
    navigator.permissions?.query({ name: 'microphone' as PermissionName })
      .then(result => {
        if (result.state === 'granted') voice.joinVoice(voiceChannel);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  // Track unread chat messages
  const chatLen = room?.chat.length ?? 0;
  const prevChatLen = useRef(chatLen);
  useEffect(() => {
    if (mobileTab !== 'chat' && chatLen > prevChatLen.current) {
      setUnreadChat(u => u + chatLen - prevChatLen.current);
    }
    prevChatLen.current = chatLen;
  }, [chatLen, mobileTab]);

  useEffect(() => {
    if (mobileTab === 'chat') setUnreadChat(0);
  }, [mobileTab]);

  if (!room) return null;

  const phase = room.phase;
  const isNight = phase === 'night';
  const alivePlayers = room.players.filter(p => p.isAlive).length;

  // Mic is locked when another player has the floor
  const micLocked = phase === 'speech' && room.currentSpeakerId !== myPlayer?.id && room.currentSpeakerId !== null;

  const handlePlayerSelect = (p: PlayerPublic) => {
    if (p.id !== myPlayer?.id) setStatsPlayer(p);
  };

  const handleSaveWill = async () => {
    await setWill(willText.slice(0, 200));
    setWillSaved(true);
    setTimeout(() => setWillSaved(false), 2000);
  };

  // Voice panel — shown in sidebar (desktop) and action tab (mobile)
  const VoicePanel = (
    <div className="mt-4">
      <VoiceControls
        channel={voice.channel}
        status={voice.status}
        isMuted={voice.isMuted}
        cameraOn={voice.cameraOn}
        isLocalSpeaking={voice.isLocalSpeaking}
        peerCount={voice.peers.length}
        error={voice.error}
        muteLocked={micLocked}
        defaultChannel={voiceChannel}
        channelLabel={voiceChannelLabel}
        onJoin={(ch, withCam) => voice.joinVoice(ch, withCam)}
        onLeave={voice.leaveVoice}
        onToggleMute={voice.toggleMute}
        onToggleCamera={voice.toggleCamera}
      />
      {isInVoice && voice.peers.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-display uppercase tracking-widest text-white/30 mb-2">
            In Voice ({voice.peers.length + 1})
          </p>
          <VoiceParticipants
            localName={myPlayer?.name ?? 'You'}
            isLocalSpeaking={voice.isLocalSpeaking}
            isMuted={voice.isMuted}
            peers={voice.peers}
          />
        </div>
      )}
    </div>
  );

  // Last will panel — shown in action area for alive players during active phases
  const showWill = amAlive && phase !== 'lobby' && phase !== 'role_reveal' && phase !== 'game_over';
  const LastWillPanel = showWill ? (
    <div className="mt-4 rounded-2xl border border-white/8 bg-void-50/40 p-3 space-y-2">
      <p className="text-xs font-display uppercase tracking-widest text-white/30">📜 Last Will</p>
      <textarea
        value={willText}
        onChange={e => { setWillText(e.target.value.slice(0, 200)); setWillSaved(false); }}
        placeholder="Write your last will… revealed when eliminated."
        rows={2}
        maxLength={200}
        className="w-full bg-void-50/60 border border-white/8 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-white/20 focus:outline-none focus:border-neon-cyan/30 resize-none transition-all"
      />
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-white/20 font-mono flex-1">{willText.length}/200</span>
        <button
          onClick={handleSaveWill}
          disabled={isLoading}
          className={clsx(
            'px-3 py-1 rounded-lg text-[10px] font-display font-bold tracking-wider uppercase transition-all',
            willSaved
              ? 'text-neon-green border border-neon-green/40 bg-neon-green/10'
              : 'text-white/50 border border-white/15 hover:text-white hover:border-white/30',
            'disabled:opacity-40',
          )}
        >
          {willSaved ? '✓ Saved' : 'Save'}
        </button>
      </div>
    </div>
  ) : null;

  // ── Phase center content (shared)
  const PhaseContent = (
    <AnimatePresence mode="wait">
      <motion.div
        key={phase}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.35 }}
      >
        {phase === 'role_reveal' && (
          <RoleReveal role={myRole} />
        )}

        {phase === 'night' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="text-4xl mb-2" style={{ filter: 'drop-shadow(0 0 20px #9b00ff)' }}>🌙</div>
              <h2 className="font-display text-2xl font-bold text-neon-purple tracking-widest uppercase">
                Night Falls
              </h2>
              <p className="text-white/40 text-sm mt-1 font-mono">
                {amAlive ? 'Complete your night action.' : 'You have been eliminated.'}
              </p>
            </div>
            {/* Mafia voice panel in action area during night */}
            {isMafiaPlayer && amAlive && (
              <Card glow="none" padding="sm">
                <p className="text-xs font-display uppercase tracking-widest text-neon-red/60 mb-2">Mafia Voice Channel</p>
                <VoiceControls
                  channel={voice.channel}
                  status={voice.status}
                  isMuted={voice.isMuted}
                  cameraOn={voice.cameraOn}
                  isLocalSpeaking={voice.isLocalSpeaking}
                  peerCount={voice.peers.length}
                  error={voice.error}
                  defaultChannel="mafia"
                  channelLabel="🔴 Mafia Voice"
                  onJoin={(ch, wc) => voice.joinVoice(ch, wc)}
                  onLeave={voice.leaveVoice}
                  onToggleMute={voice.toggleMute}
                  onToggleCamera={voice.toggleCamera}
                />
              </Card>
            )}
            <NightPanel />
          </div>
        )}

        {phase === 'day' && (() => {
          const activePlayers = room.players.filter(p => p.isAlive && !p.isSpectator);
          const skipNeeded = Math.floor(activePlayers.length / 2) + 1;
          const alreadyVoted = room.daySkipVoteCount ?? 0;
          return (
            <div className="space-y-4">
              {room.killedLastNight.length > 0 && (
                <Card glow="red" padding="md">
                  <p className="text-xs font-mono text-white/40 uppercase tracking-widest mb-2">Night Report</p>
                  {room.killedLastNight.map(k => (
                    <p key={k.id} className="text-white font-semibold">
                      <span className="text-neon-red">💀</span> {k.name} was eliminated during the night.
                    </p>
                  ))}
                </Card>
              )}
              {room.savedLastNight && room.killedLastNight.length === 0 && (
                <Card glow="green" padding="md">
                  <p className="text-neon-green text-sm">
                    💊 The Doctor saved someone. No one was killed last night.
                  </p>
                </Card>
              )}
              <div className="text-center py-4">
                <div className="text-4xl mb-2">☀️</div>
                <h2 className="font-display text-2xl font-bold text-yellow-300 tracking-widest uppercase">
                  Day {room.day}
                </h2>
                <p className="text-white/40 text-sm mt-1 font-mono">Discuss and find the Mafia.</p>
              </div>
              {amAlive && (
                <div className="text-center">
                  <button
                    onClick={() => daySkipVote()}
                    disabled={isLoading}
                    className="px-6 py-2 border border-white/15 text-white/40 text-xs font-mono rounded-xl hover:border-neon-cyan/40 hover:text-neon-cyan transition-all disabled:opacity-40"
                  >
                    ⏭ Skip discussion ({alreadyVoted}/{skipNeeded} votes)
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {phase === 'speech' && (() => {
          const speaker = room.players.find(p => p.id === room.currentSpeakerId);
          const speakerIdx = room.players.filter(p => p.isAlive && !p.isSpectator)
            .findIndex(p => p.id === room.currentSpeakerId);
          const totalSpeakers = room.players.filter(p => p.isAlive && !p.isSpectator).length;
          return (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="text-4xl mb-2">🎤</div>
                <h2 className="font-display text-2xl font-bold text-neon-green tracking-widest uppercase">
                  Floor Time
                </h2>
                {speaker ? (
                  <>
                    <p className="text-neon-green font-bold text-lg mt-2">{speaker.name}</p>
                    <p className="text-white/40 text-xs font-mono mt-1">
                      Speaker {speakerIdx + 1} of {totalSpeakers}
                    </p>
                  </>
                ) : (
                  <p className="text-white/40 text-sm font-mono mt-1">Loading…</p>
                )}
              </div>
            </div>
          );
        })()}

        {phase === 'voting' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="text-4xl mb-2">⚖️</div>
              <h2 className="font-display text-2xl font-bold text-neon-red tracking-widest uppercase">
                Town Vote
              </h2>
              <p className="text-white/40 text-sm mt-1 font-mono">
                {alivePlayers} players voting.
              </p>
            </div>
            <VotingPanel />
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );

  // Wrap PhaseContent with Last Will below it
  const PhaseContentWithWill = (
    <>
      {PhaseContent}
      {LastWillPanel}
    </>
  );

  return (
    <div className={clsx(
      'min-h-screen relative overflow-hidden transition-all duration-1000',
      isNight
        ? 'bg-gradient-to-b from-[#030010] via-void to-[#040020]'
        : 'bg-neon-grid-animated',
    )}>
      {/* Atmospheric overlays */}
      {isNight && (
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon-purple/8 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[200px] bg-neon-pink/5 rounded-full blur-[100px]" />
        </div>
      )}
      {phase === 'day' && (
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[200px] bg-neon-cyan/5 rounded-full blur-[100px]" />
        </div>
      )}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-40"
        style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)' }}
      />

      {/* Leaderboard */}
      <LeaderboardModal open={showLeaderboard} onClose={() => setShowLeaderboard(false)} />

      {/* Game Over */}
      {gameOverResult && <GameOver result={gameOverResult} />}

      {/* Night result */}
      <NightResultOverlay result={nightResult} onDismiss={dismissNightResult} />

      {/* Investigation result */}
      <AnimatePresence>
        {investigationResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={dismissInvestigation}
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 20 }}
              className={clsx(
                'glass-card border p-8 text-center max-w-sm w-full',
                investigationResult.result === 'suspicious'
                  ? 'border-neon-pink/30 shadow-neon-pink'
                  : 'border-neon-green/30 shadow-neon-green',
              )}
              onClick={e => e.stopPropagation()}
            >
              <p className="text-xs font-mono uppercase tracking-widest text-white/40 mb-4">Investigation Result</p>
              <div className="text-5xl mb-4">
                {investigationResult.result === 'suspicious' ? '🔴' : '🟢'}
              </div>
              <h2 className={clsx(
                'font-display text-3xl font-bold tracking-widest uppercase mb-2',
                investigationResult.result === 'suspicious' ? 'text-neon-pink' : 'text-neon-green',
              )}>
                {investigationResult.result === 'suspicious' ? 'Suspicious' : 'Clear'}
              </h2>
              <p className="text-white/70 text-sm">
                <strong>{investigationResult.targetName}</strong> appears to be{' '}
                {investigationResult.result === 'suspicious' ? 'Mafia.' : 'an innocent citizen.'}
              </p>
              <Button variant="secondary" className="mt-6" onClick={dismissInvestigation} fullWidth>
                Got it
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spy night report */}
      <AnimatePresence>
        {spyReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={dismissSpyReport}
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 20 }}
              className="glass-card border border-neon-cyan/30 shadow-neon-cyan p-8 text-center max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <p className="text-xs font-mono uppercase tracking-widest text-white/40 mb-4">Spy Report</p>
              <div className="text-5xl mb-4">🕵️</div>
              <h2 className="font-display text-3xl font-bold tracking-widest uppercase mb-2 text-neon-cyan">
                Intel
              </h2>
              <p className="text-white/70 text-sm">
                {spyReport.mafiaTargetName
                  ? <>Last night, mafia targeted <strong className="text-white">{spyReport.mafiaTargetName}</strong>.</>
                  : 'Last night, mafia made no move.'}
              </p>
              <Button variant="secondary" className="mt-6" onClick={dismissSpyReport} fullWidth>
                Got it
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main layout ─────────────────────────────────────────────── */}
      <div className="relative z-10 h-screen flex flex-col">

        {/* Top bar */}
        <header className="flex-shrink-0 glass-panel border-b border-white/6 px-3 py-2 md:px-4 md:py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-2 md:gap-4">
            {/* Phase */}
            <div className="min-w-0">
              <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest hidden sm:block">Phase</p>
              <h1 className={clsx('font-display text-base md:text-xl font-bold tracking-widest uppercase truncate', PHASE_COLORS[phase])}>
                {PHASE_LABELS[phase]}
                {phase !== 'role_reveal' && phase !== 'game_over' && (
                  <span className="text-white/40"> · D{room.day}</span>
                )}
              </h1>
            </div>

            {/* Timer */}
            {room.maxTimer > 0 && (
              <div className="ml-1 md:ml-4 flex-shrink-0">
                <Timer seconds={room.timer} max={room.maxTimer} size="sm" />
              </div>
            )}

            <div className="ml-auto flex items-center gap-1.5 md:gap-3">
              {/* Room code */}
              <div className="hidden sm:block text-right">
                <p className="text-[10px] text-white/30 font-mono">Room</p>
                <p className="font-mono text-xs md:text-sm text-neon-cyan font-bold tracking-widest">{room.code}</p>
              </div>

              {/* Role badge */}
              {myRole && (
                <div className="px-2 py-1 rounded-lg border text-[10px] md:text-xs font-display font-bold tracking-wider uppercase"
                  style={{
                    borderColor: `${myRole.glowColor}40`,
                    color: myRole.glowColor,
                    backgroundColor: `${myRole.glowColor}10`,
                    textShadow: `0 0 10px ${myRole.glowColor}`,
                  }}>
                  {myRole.name}
                </div>
              )}

              {/* Spectator count eye icon */}
              {(room.spectatorCount ?? 0) > 0 && (
                <div className="hidden sm:flex items-center gap-1 text-white/30 text-xs font-mono" title="Spectators watching">
                  <span>👁</span>
                  <span>{room.spectatorCount}</span>
                </div>
              )}

              {/* Compact voice status in header */}
              {isInVoice && (
                <VoiceParticipants
                  localName={myPlayer?.name ?? 'You'}
                  isLocalSpeaking={voice.isLocalSpeaking}
                  isMuted={voice.isMuted}
                  peers={voice.peers}
                  compact
                />
              )}

              {/* Leaderboard button */}
              <button
                onClick={() => setShowLeaderboard(true)}
                className="hidden sm:flex items-center px-2 py-1 rounded-lg text-white/30 hover:text-neon-cyan transition-colors text-sm"
                title="Leaderboard"
              >
                🏆
              </button>

              {/* Pause button (host only, during active phases) */}
              {amHost && phase !== 'role_reveal' && phase !== 'game_over' && phase !== 'lobby' && (
                <button
                  onClick={() => pauseTimer()}
                  disabled={isLoading}
                  title={room.isPaused ? 'Resume timer' : 'Pause timer'}
                  className={clsx(
                    'px-2 py-1 rounded-lg text-sm transition-all',
                    room.isPaused
                      ? 'text-yellow-400 border border-yellow-400/40 bg-yellow-400/10 animate-pulse'
                      : 'text-white/30 hover:text-white/60',
                  )}
                >
                  {room.isPaused ? '▶' : '⏸'}
                </button>
              )}

              {/* PAUSED indicator for all players */}
              {room.isPaused && (
                <span className="text-xs font-display font-bold text-yellow-400 tracking-widest uppercase animate-pulse">
                  PAUSED
                </span>
              )}

              {amHost && phase !== 'role_reveal' && phase !== 'game_over' && phase !== 'lobby' && (
                <Button size="sm" variant="ghost" loading={isLoading} onClick={skipPhase}>
                  <span className="hidden sm:inline">Skip </span>⏭
                </Button>
              )}

              <Button size="sm" variant="ghost" onClick={() => leaveRoom()}>
                ✕
              </Button>
            </div>
          </div>
        </header>

        {/* ── DESKTOP layout (md+) ──────────────────────────────────── */}
        <div className="hidden md:flex flex-1 overflow-hidden max-w-7xl w-full mx-auto">
          {/* Players + Voice sidebar */}
          <aside className="w-64 lg:w-72 flex-shrink-0 overflow-y-auto p-4 border-r border-white/5 flex flex-col">
            <div className="flex-shrink-0">
              <h2 className="text-xs font-display uppercase tracking-widest text-white/40 mb-3">
                Players · {alivePlayers} alive
              </h2>
              <PlayerList
                players={room.players}
                phase={phase}
                showVotes={phase === 'voting'}
                currentSpeakerId={phase === 'speech' ? room.currentSpeakerId : null}
                onSelectTarget={handlePlayerSelect}
              />
            </div>
            {/* Voice panel in sidebar — only for non-mafia-night or non-mafia players */}
            {phase !== 'night' || !isMafiaPlayer ? (
              <div className="mt-auto pt-4">
                {VoicePanel}
              </div>
            ) : null}
          </aside>

          {/* Center: Phase content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {PhaseContentWithWill}
          </main>

          {/* Chat sidebar */}
          <aside className="w-64 lg:w-72 flex-shrink-0 overflow-hidden p-4 border-l border-white/5 hidden lg:flex flex-col">
            <h2 className="text-xs font-display uppercase tracking-widest text-white/40 mb-3 flex-shrink-0">
              Chat
            </h2>
            <div className="flex-1 min-h-0">
              <ChatPanel compact />
            </div>
          </aside>
        </div>

        {/* ── MOBILE layout (<md) ───────────────────────────────────── */}
        <div className="md:hidden flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 pb-2">
            <AnimatePresence mode="wait">
              {mobileTab === 'action' && (
                <motion.div key="action" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                  {PhaseContentWithWill}
                  {/* Voice panel in action tab on mobile */}
                  {phase !== 'night' || !isMafiaPlayer ? VoicePanel : null}
                </motion.div>
              )}
              {mobileTab === 'players' && (
                <motion.div key="players" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                  <h2 className="text-xs font-display uppercase tracking-widest text-white/40 mb-3">
                    Players · {alivePlayers} alive
                  </h2>
                  <PlayerList
                    players={room.players}
                    phase={phase}
                    showVotes={phase === 'voting'}
                    currentSpeakerId={phase === 'speech' ? room.currentSpeakerId : null}
                    onSelectTarget={handlePlayerSelect}
                  />
                </motion.div>
              )}
              {mobileTab === 'chat' && (
                <motion.div key="chat" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="h-full">
                  <h2 className="text-xs font-display uppercase tracking-widest text-white/40 mb-3">Chat</h2>
                  <div className="h-[calc(100%-2rem)]">
                    <ChatPanel />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mobile bottom tab bar */}
          <div className="flex-shrink-0 glass-panel border-t border-white/10 flex">
            {(
              [
                { id: 'action',  label: '⚡ Action'  },
                { id: 'players', label: '👥 Players' },
                { id: 'chat',    label: '💬 Chat'    },
              ] as { id: MobileTab; label: string }[]
            ).map(tab => (
              <button
                key={tab.id}
                onClick={() => setMobileTab(tab.id)}
                className={clsx(
                  'flex-1 py-3 text-xs font-display font-bold tracking-widest uppercase transition-all relative',
                  mobileTab === tab.id
                    ? 'text-neon-cyan bg-neon-cyan/10 border-t-2 border-neon-cyan -mt-[2px]'
                    : 'text-white/40 hover:text-white/70',
                )}
              >
                {tab.label}
                {tab.id === 'chat' && unreadChat > 0 && (
                  <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-neon-red text-white text-[9px] flex items-center justify-center font-bold">
                    {unreadChat > 9 ? '9+' : unreadChat}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Player stats modal */}
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
    </div>
  );
}
