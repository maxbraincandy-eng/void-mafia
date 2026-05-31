import { useState, useEffect, useRef } from 'react';
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
  const [copied, setCopied] = useState(false);
  const t = useT();
  const voice = useVoiceChat();
  const autoJoined = useRef(false);

  // Auto-join room voice if mic permission was already granted
  useEffect(() => {
    if (!room?.id || autoJoined.current || voice.channel) return;
    autoJoined.current = true;
    navigator.permissions?.query({ name: 'microphone' as PermissionName })
      .then(result => {
        if (result.state === 'granted') voice.joinVoice('room');
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  if (!room) return null;

  const amSpectator = myPlayer?.isSpectator ?? false;
  const activePlayers = room.players.filter(p => !p.isSpectator);
  const playerCount = activePlayers.length;
  const minPlayers = room.settings.minPlayers;
  const canStart = amHost && playerCount >= minPlayers;
  const allReady = activePlayers.filter(p => !p.isHost).every(p => p.isReady);

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
            <div className="flex items-center gap-2 justify-end">
              <div className="glass-card border border-neon-cyan/30 px-4 py-2 shadow-neon-cyan">
                <span className="font-mono text-2xl font-bold text-neon-cyan text-glow-cyan tracking-[0.3em]">
                  {room.code}
                </span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`https://voidmafia.one/join/${room.code}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="text-xs font-mono px-2 py-1 rounded border border-neon-cyan/30 text-neon-cyan/70 hover:text-neon-cyan hover:border-neon-cyan/60 transition-colors bg-void-50/40"
              >
                {copied ? 'Copied!' : 'Copy link'}
              </button>
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
                        ) : player.isSpectator ? (
                          <span className="text-xs text-neon-purple/70 font-mono">👁 watching</span>
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
              {!amHost && !amSpectator && (
                <Button
                  fullWidth
                  variant={myPlayer?.isReady ? 'neon-green' : 'neon-cyan'}
                  loading={isLoading}
                  onClick={() => toggleReady()}
                >
                  {myPlayer?.isReady ? t.lobby.readyDone : t.lobby.ready}
                </Button>
              )}
              {amSpectator && (
                <div className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-neon-purple/20 bg-neon-purple/5 text-neon-purple/70 text-sm font-mono">
                  👁 Watching as spectator
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

        {/* Role configuration */}
        <p className="text-xs text-white/40 font-mono uppercase tracking-widest mb-3">Role Configuration</p>

        {([
          {
            label: 'Mafia', color: 'text-neon-pink', roles: [
              { key: 'mafia',  name: 'Mafia',  max: 6 },
              { key: 'don',    name: 'Don',    max: 1 },
            ],
          },
          {
            label: 'Town', color: 'text-neon-cyan', roles: [
              { key: 'sheriff',   name: 'Sheriff',   max: 2 },
              { key: 'doctor',    name: 'Doctor',    max: 2 },
              { key: 'bodyguard', name: 'Bodyguard', max: 2 },
              { key: 'spy',       name: 'Spy',       max: 2 },
              { key: 'vigilante', name: 'Vigilante', max: 2 },
              { key: 'escort',    name: 'Escort',    max: 2 },
            ],
          },
          {
            label: 'Neutral', color: 'text-neon-purple', roles: [
              { key: 'maniac', name: 'Maniac', max: 2 },
              { key: 'jester', name: 'Jester', max: 2 },
            ],
          },
        ] as const).map(group => (
          <div key={group.label} className="mb-4">
            <p className={`text-xs font-mono font-bold ${group.color} mb-2`}>{group.label}</p>
            <div className="grid grid-cols-2 gap-2">
              {(group.roles as ReadonlyArray<{ key: keyof typeof local.roles; name: string; max: number }>).map(({ key, name, max }) => {
                const count = local.roles[key] ?? 0;
                return (
                  <div key={key} className="flex items-center justify-between bg-white/5 rounded-lg px-2 py-1.5">
                    <span className="text-xs text-white/70 font-mono">{name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setLocal(s => ({ ...s, roles: { ...s.roles, [key]: Math.max(0, count - 1) } }))}
                        disabled={count === 0}
                        className="w-5 h-5 rounded text-white/50 hover:text-white disabled:opacity-20 text-sm font-bold leading-none"
                      >−</button>
                      <span className="w-4 text-center text-xs text-white font-mono">{count}</span>
                      <button
                        type="button"
                        onClick={() => setLocal(s => ({ ...s, roles: { ...s.roles, [key]: Math.min(max, count + 1) } }))}
                        disabled={count >= max}
                        className="w-5 h-5 rounded text-white/50 hover:text-white disabled:opacity-20 text-sm font-bold leading-none"
                      >+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

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
