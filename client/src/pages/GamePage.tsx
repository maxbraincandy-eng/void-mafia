import { useState } from 'react';
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

  if (!room) return null;

  const phase = room.phase;
  const isNight = phase === 'night';

  return (
    <div className={clsx(
      'min-h-screen relative overflow-hidden transition-all duration-1000',
      isNight
        ? 'bg-gradient-to-b from-[#030010] via-void to-[#040020]'
        : 'bg-neon-grid-animated',
    )}>
      {/* Night atmospheric overlay */}
      {isNight && (
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon-purple/8 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[200px] bg-neon-pink/5 rounded-full blur-[100px]" />
        </div>
      )}

      {/* Day atmospheric overlay */}
      {phase === 'day' && (
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[200px] bg-neon-cyan/5 rounded-full blur-[100px]" />
        </div>
      )}

      {/* Scanlines */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-40"
        style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)' }}
      />

      {/* Game Over screen */}
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

      {/* Main layout */}
      <div className="relative z-10 h-screen flex flex-col">
        {/* Top bar */}
        <header className="flex-shrink-0 glass-panel border-b border-white/6 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            {/* Phase */}
            <div>
              <p className="text-xs font-mono text-white/30 uppercase tracking-widest">Phase</p>
              <h1 className={clsx('font-display text-xl font-bold tracking-widest uppercase', PHASE_COLORS[phase])}>
                {PHASE_LABELS[phase]}
                {phase !== 'role_reveal' && phase !== 'game_over' && ` · Day ${room.day}`}
              </h1>
            </div>

            {/* Timer */}
            <div className="ml-4">
              {room.maxTimer > 0 && (
                <Timer seconds={room.timer} max={room.maxTimer} size="sm" />
              )}
            </div>

            {/* Room code */}
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <p className="text-xs text-white/30 font-mono">Room</p>
                <p className="font-mono text-sm text-neon-cyan font-bold tracking-widest">{room.code}</p>
              </div>

              {/* My role badge */}
              {myRole && (
                <div className="px-3 py-1 rounded-lg border text-xs font-display font-bold tracking-widest uppercase"
                  style={{
                    borderColor: `${myRole.glowColor}40`,
                    color: myRole.glowColor,
                    backgroundColor: `${myRole.glowColor}10`,
                    textShadow: `0 0 10px ${myRole.glowColor}`,
                  }}>
                  {myRole.name}
                </div>
              )}

              {amHost && phase !== 'role_reveal' && phase !== 'game_over' && phase !== 'lobby' && (
                <Button size="sm" variant="ghost" loading={isLoading} onClick={skipPhase}>
                  Skip ⏭
                </Button>
              )}

              <Button size="sm" variant="ghost" onClick={() => leaveRoom()}>
                ✕
              </Button>
            </div>
          </div>
        </header>

        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          <div className="max-w-7xl mx-auto h-full flex gap-0">
            {/* Left: Players */}
            <aside className="w-72 flex-shrink-0 overflow-y-auto p-4 border-r border-white/5 hidden md:block">
              <h2 className="text-xs font-display uppercase tracking-widest text-white/40 mb-3">
                Players · {room.players.filter(p => p.isAlive).length} alive
              </h2>
              <PlayerList
                players={room.players}
                phase={phase}
                showVotes={phase === 'voting'}
                onSelectTarget={p => {
                  if (p.id !== myPlayer?.id) setStatsPlayer(p);
                }}
              />
            </aside>

            {/* Center: Phase content */}
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={phase}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.35 }}
                  className="h-full"
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
                      {/* Night recap */}
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

                      {/* Mobile player list */}
                      <div className="md:hidden">
                        <Card glow="none" padding="sm">
                          <h3 className="text-xs font-display uppercase tracking-widest text-white/40 mb-2">Players</h3>
                          <PlayerList players={room.players} phase={phase} />
                        </Card>
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
                          {room.players.filter(p => p.isAlive).length} players voting.
                        </p>
                      </div>
                      <VotingPanel />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </main>

            {/* Right: Chat */}
            <aside className="w-72 flex-shrink-0 overflow-hidden p-4 border-l border-white/5 hidden lg:flex flex-col">
              <h2 className="text-xs font-display uppercase tracking-widest text-white/40 mb-3 flex-shrink-0">
                Chat
              </h2>
              <div className="flex-1 min-h-0">
                <ChatPanel compact />
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* Player stats modal — click player name to view */}
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
