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
import { useVoiceChat } from '@/hooks/useVoiceChat';
import { useGameSounds } from '@/hooks/useSoundFX';

type MobileTab = 'action' | 'players' | 'chat';

const PHASE_LABELS: Record<Phase, string> = {
  lobby:        'Lobby',
  role_reveal:  'Role Reveal',
  night:        'Night',
  day:          'Day',
  voting:       'Voting',
  game_over:    'Game Over',
};

const PHASE_COLORS: Record<Phase, string> = {
  lobby:        'text-white',
  role_reveal:  'text-neon-purple',
  night:        'text-neon-cyan',
  day:          'text-yellow-300',
  voting:       'text-neon-red',
  game_over:    'text-white',
};

export function GamePage() {
  const [statsPlayer, setStatsPlayer] = useState<PlayerPublic | null>(null);
  const [reportProfileId, setReportProfileId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('action');
  const [unreadChat, setUnreadChat] = useState(0);

  const {
    room, myPlayer, myRole, amHost, amAlive,
    nightResult, investigationResult, gameOverResult,
    skipPhase, leaveRoom, dismissNightResult, dismissInvestigation, dismissGameOver,
    isLoading,
  } = useGameStore(s => ({
    room: s.room,
    myPlayer: s.myPlayer(),
    myRole: s.myRole,
    amHost: s.amHost(),
    amAlive: s.amAlive(),
    nightResult: s.nightResult,
    investigationResult: s.investigationResult,
    gameOverResult: s.gameOverResult,
    skipPhase: s.skipPhase,
    leaveRoom: s.leaveRoom,
    dismissNightResult: s.dismissNightResult,
    dismissInvestigation: s.dismissInvestigation,
    dismissGameOver: s.dismissGameOver,
    isLoading: s.isLoading,
  }));

  const voice = useVoiceChat();
  useGameSounds();

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

  const handlePlayerSelect = (p: PlayerPublic) => {
    if (p.id !== myPlayer?.id) setStatsPlayer(p);
  };

  // ── Phase center content (shared between desktop main & mobile action tab)
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
            <NightPanel />
          </div>
        )}

        {phase === 'day' && (
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
          </div>
        )}

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

      {/* Game Over */}
      {gameOverResult && <GameOver result={gameOverResult} />}

      {/* Night result overlay */}
      <NightResultOverlay result={nightResult} onDismiss={dismissNightResult} />

      {/* Investigation result overlay */}
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
              {/* Room code (hidden on very small screens) */}
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

              {/* Voice button */}
              <VoiceButton voice={voice} />

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

          {/* Voice error */}
          {voice.micError && (
            <p className="text-neon-red text-xs font-mono text-center mt-1 pb-1">{voice.micError}</p>
          )}
        </header>

        {/* ── DESKTOP layout (md+) ──────────────────────────────────── */}
        <div className="hidden md:flex flex-1 overflow-hidden max-w-7xl w-full mx-auto">
          {/* Players sidebar */}
          <aside className="w-64 lg:w-72 flex-shrink-0 overflow-y-auto p-4 border-r border-white/5">
            <h2 className="text-xs font-display uppercase tracking-widest text-white/40 mb-3">
              Players · {alivePlayers} alive
            </h2>
            <PlayerList
              players={room.players}
              phase={phase}
              showVotes={phase === 'voting'}
              onSelectTarget={handlePlayerSelect}
            />
          </aside>

          {/* Center */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {PhaseContent}
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
          {/* Mobile tab content */}
          <div className="flex-1 overflow-y-auto p-4 pb-2">
            <AnimatePresence mode="wait">
              {mobileTab === 'action' && (
                <motion.div key="action" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                  {PhaseContent}
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

      {/* Voice peers indicator (floating) */}
      <VoicePeersHUD voice={voice} />

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

// ── Voice button in header ────────────────────────────────────────────

function VoiceButton({ voice }: { voice: ReturnType<typeof useVoiceChat> }) {
  const { isInVoice, isMuted, isConnecting, peers, joinVoice, leaveVoice, toggleMute } = voice;

  if (!isInVoice) {
    return (
      <button
        onClick={joinVoice}
        disabled={isConnecting}
        className={clsx(
          'flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] md:text-xs font-mono font-bold transition-all',
          isConnecting
            ? 'border-white/10 text-white/30 cursor-wait'
            : 'border-neon-green/30 text-neon-green/70 hover:bg-neon-green/10 hover:text-neon-green hover:border-neon-green/50',
        )}
      >
        {isConnecting ? '...' : '🎙'}
        <span className="hidden sm:inline">{isConnecting ? 'Connecting' : 'Voice'}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={toggleMute}
        className={clsx(
          'px-2 py-1 rounded-lg border text-[10px] md:text-xs font-mono font-bold transition-all',
          isMuted
            ? 'border-neon-red/40 text-neon-red bg-neon-red/10'
            : 'border-neon-green/40 text-neon-green bg-neon-green/10',
        )}
      >
        {isMuted ? '🔇' : '🎙'}
        {peers.size > 0 && <span className="ml-1 hidden sm:inline">{peers.size + 1}</span>}
      </button>
      <button
        onClick={leaveVoice}
        className="px-1.5 py-1 rounded-lg border border-white/10 text-white/30 hover:text-neon-red text-[10px] font-mono transition-all"
      >
        ✕
      </button>
    </div>
  );
}

// ── Floating voice peers HUD ──────────────────────────────────────────

function VoicePeersHUD({ voice }: { voice: ReturnType<typeof useVoiceChat> }) {
  const { isInVoice, peers, isMuted } = voice;
  if (!isInVoice || peers.size === 0) return null;

  return (
    <div className="fixed top-20 right-3 z-30 flex flex-col gap-1">
      <AnimatePresence>
        {[...peers.entries()].map(([sid, p]) => (
          <motion.div
            key={sid}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="glass-card border border-neon-green/20 px-2 py-1 rounded-lg flex items-center gap-1.5"
          >
            <span className="text-neon-green text-xs">🎙</span>
            <span className="text-xs font-mono text-white/60 max-w-[80px] truncate">{p.name}</span>
          </motion.div>
        ))}
      </AnimatePresence>
      {isMuted && (
        <div className="glass-card border border-neon-red/30 px-2 py-1 rounded-lg text-center">
          <span className="text-neon-red text-xs font-mono">MUTED</span>
        </div>
      )}
    </div>
  );
}
