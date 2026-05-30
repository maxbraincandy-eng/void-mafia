import { useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useGameStore } from '@/store/gameStore';
import { useT } from '@/store/langStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { PlayerStatsModal } from '@/components/ui/PlayerStatsModal';
import { ReportModal } from '@/components/ui/ReportModal';
import { VoiceControls } from '@/components/game/VoiceControls';
import { VoiceParticipants } from '@/components/game/VoiceParticipants';
import { useVoiceChat } from '@/hooks/useVoiceChat';
import { GameSettings, PlayerPublic } from '@/types/index';

export function LobbyPage() {
  const {
    room, myPlayer, amHost, toggleReady, kickPlayer, startGame,
    updateSettings, leaveRoom, isLoading,
  } = useGameStore(s => ({
    room: s.room,
    myPlayer: s.myPlayer(),
    amHost: s.amHost(),
    toggleReady: s.toggleReady,
    kickPlayer: s.kickPlayer,
    startGame: s.startGame,
    updateSettings: s.updateSettings,
    leaveRoom: s.leaveRoom,
    isLoading: s.isLoading,
  }));

  const [showSettings, setShowSettings] = useState(false);
  const [statsPlayer, setStatsPlayer] = useState<PlayerPublic | null>(null);
  const [reportProfileId, setReportProfileId] = useState<string | null>(null);
  const t = useT();
  const voice = useVoiceChat();

  if (!room) return null;

  const playerCount = room.players.length;
  const minPlayers = room.settings.minPlayers;
  const canStart = amHost && playerCount >= minPlayers;
  const allReady = room.players.filter(p => !p.isHost).every(p => p.isReady);

  return (
    <div className="min-h-screen bg-neon-grid-animated scanlines relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-neon-purple/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-neon-cyan/8 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8 pr-20"
        >
          <div>
            <h1 className="font-display text-4xl font-bold gradient-text tracking-wide">VOID MAFIA</h1>
            <p className="text-neon-green/50 font-mono text-xs tracking-widest">{t.common.poweredBy}</p>
            <p className="text-white/40 text-sm font-mono mt-1">{t.lobby.subtitle}</p>
          </div>

          {/* Room code */}
          <div className="text-right">
            <p className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1">Room Code</p>
            <div className="glass-card border border-neon-cyan/30 px-4 py-2 shadow-neon-cyan">
              <span className="font-mono text-2xl font-bold text-neon-cyan text-glow-cyan tracking-[0.3em]">
                {room.code}
              </span>
            </div>
            {room.settings.isPrivate && (
              <span className="text-xs text-neon-pink/70 font-mono mt-1 block">🔒 PRIVATE</span>
            )}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Players */}
          <div className="lg:col-span-2 space-y-4">
            <Card glow="cyan" padding="md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-neon-cyan tracking-widest uppercase">
                  {t.lobby.players}
                </h2>
                <span className="text-sm font-mono text-white/40">
                  {playerCount}/{minPlayers} {t.lobby.min}
                </span>
              </div>

              <div className="space-y-2">
                {room.players.map((player, i) => (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={clsx(
                      'flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer',
                      player.id === myPlayer?.id
                        ? 'border-neon-purple/30 bg-neon-purple/5'
                        : 'border-white/5 bg-void-50/40 hover:border-neon-cyan/20 hover:bg-neon-cyan/5',
                    )}
                    onClick={() => player.id !== myPlayer?.id && setStatsPlayer(player)}
                  >
                    <Avatar name={player.name} isHost={player.isHost} size="md" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={clsx(
                          'text-sm font-semibold truncate',
                          player.isModerator ? 'text-neon-green' : 'text-white',
                        )}>
                          {player.name}
                        </span>
                        {player.id === myPlayer?.id && (
                          <span className="text-xs text-neon-purple">{t.common.you}</span>
                        )}
                        {!player.isConnected && (
                          <span className="text-xs text-white/30">disconnected</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {player.isHost ? (
                          <span className="text-xs text-yellow-400 font-mono">{t.common.host}</span>
                        ) : (
                          <span className={clsx('text-xs font-mono',
                            player.isReady ? 'text-neon-green' : 'text-white/30',
                          )}>
                            {player.isReady ? '✓ READY' : 'not ready'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Host kick control */}
                    {amHost && player.id !== myPlayer?.id && (
                      <button
                        onClick={e => { e.stopPropagation(); kickPlayer(player.id); }}
                        className="text-white/20 hover:text-neon-red text-xs transition-colors px-2 py-1 rounded"
                      >
                        kick
                      </button>
                    )}

                    <span className="text-xs font-mono text-white/25">#{player.seat}</span>
                  </motion.div>
                ))}
              </div>

              {playerCount < minPlayers && (
                <p className="text-center text-xs text-white/30 font-mono mt-4 pt-4 border-t border-white/5">
                  {minPlayers - playerCount} {minPlayers - playerCount === 1 ? t.lobby.needMore : t.lobby.needMorePlural}
                </p>
              )}
            </Card>

            {/* Actions */}
            <div className="flex gap-3">
              {!amHost && (
                <Button
                  fullWidth
                  variant={myPlayer?.isReady ? 'neon-green' : 'neon-cyan'}
                  loading={isLoading}
                  onClick={() => toggleReady()}
                >
                  {myPlayer?.isReady ? t.lobby.readyDone : t.lobby.ready}
                </Button>
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
                    {t.lobby.startGame} {!canStart ? `(need ${minPlayers})` : ''}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowSettings(!showSettings)}
                  >
                    ⚙
                  </Button>
                </>
              )}
              <Button variant="danger" onClick={() => leaveRoom()} loading={isLoading}>
                {t.lobby.leave}
              </Button>
            </div>

            {showSettings && amHost && (
              <SettingsPanel settings={room.settings} onUpdate={updateSettings} />
            )}

            {/* Voice controls */}
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
              <div className="mt-2 px-1">
                <VoiceParticipants
                  localName={myPlayer?.name ?? 'You'}
                  isLocalSpeaking={voice.isLocalSpeaking}
                  isMuted={voice.isMuted}
                  peers={voice.peers}
                />
              </div>
            )}
          </div>

          {/* Chat */}
          <div className="lg:col-span-1">
            <Card glow="none" padding="md" className="h-full min-h-[400px] flex flex-col">
              <h2 className="font-display font-bold text-white/60 tracking-widest uppercase text-sm mb-4 flex-shrink-0">
                {t.lobby.chat}
              </h2>
              <div className="flex-1 min-h-0">
                <ChatPanel />
              </div>
            </Card>
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

      {/* Report modal */}
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

function SettingsPanel({
  settings,
  onUpdate,
}: {
  settings: GameSettings;
  onUpdate: (s: Partial<GameSettings>) => Promise<void>;
}) {
  const [local, setLocal] = useState(settings);
  const t = useT();

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
      <Card glow="purple" padding="md">
        <h3 className="font-display font-bold text-neon-purple tracking-widest uppercase mb-4">
          {t.lobby.settings}
        </h3>

        {/* Timers */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {(
            [
              ['Night Duration', 'nightDuration', 15, 300],
              ['Day Duration', 'dayDuration', 30, 600],
              ['Vote Duration', 'voteDuration', 15, 300],
              ['Min Players', 'minPlayers', 4, 16],
            ] as [string, keyof GameSettings, number, number][]
          ).map(([label, key, min, max]) => (
            <div key={key}>
              <label className="block text-xs text-white/40 font-mono mb-1">{label}</label>
              <input
                type="number"
                min={min}
                max={max}
                value={local[key] as number}
                onChange={e => setLocal(s => ({ ...s, [key]: Number(e.target.value) }))}
                className="w-full bg-void-50/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-purple/40"
              />
            </div>
          ))}
        </div>

        {/* Auto-role info */}
        <div className="p-3 rounded-xl bg-neon-cyan/5 border border-neon-cyan/15 mb-4">
          <p className="text-xs font-mono text-neon-cyan/70">{t.lobby.autoRoles}</p>
          <p className="text-xs font-mono text-white/25 mt-0.5">Mafia · Sheriff · Doctor</p>
        </div>

        {/* Optional extra roles */}
        <p className="text-xs text-white/40 font-mono mb-2">{t.lobby.optionalRoles}</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(['don', 'maniac', 'jester', 'bodyguard'] as const).map(role => (
            <div key={role} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`role-${role}`}
                checked={local.roles[role] > 0}
                onChange={e => setLocal(s => ({
                  ...s,
                  roles: { ...s.roles, [role]: e.target.checked ? 1 : 0 },
                }))}
                className="w-4 h-4 accent-neon-purple"
              />
              <label htmlFor={`role-${role}`} className="text-sm text-white/70 capitalize">{role}</label>
            </div>
          ))}
        </div>

        {/* Other toggles */}
        <div className="flex items-center gap-3 mb-4">
          <input
            type="checkbox"
            id="doctorSelfHeal"
            checked={local.allowDoctorSelfHeal}
            onChange={e => setLocal(s => ({ ...s, allowDoctorSelfHeal: e.target.checked }))}
            className="w-4 h-4 accent-neon-purple"
          />
          <label htmlFor="doctorSelfHeal" className="text-sm text-white/60">Doctor self-heal</label>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <input
            type="checkbox"
            id="privateRoom"
            checked={local.isPrivate}
            onChange={e => setLocal(s => ({ ...s, isPrivate: e.target.checked }))}
            className="w-4 h-4 accent-neon-pink"
          />
          <label htmlFor="privateRoom" className="text-sm text-white/60">{t.lobby.privateRoom}</label>
        </div>

        <Button fullWidth variant="neon-purple" onClick={() => onUpdate(local)}>
          {t.lobby.saveSettings}
        </Button>
      </Card>
    </motion.div>
  );
}
