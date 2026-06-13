import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useGameStore } from '@/store/gameStore';
import { useSocialStore } from '@/store/socialStore';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/store/langStore';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { VoiceControls } from '@/components/game/VoiceControls';
import { VoiceParticipants } from '@/components/game/VoiceParticipants';
import { RolePickerPanel } from '@/components/lobby/RolePickerPanel';
import { RoleInfoModal } from '@/components/ui/RoleInfoModal';
import { RoomMoreMenu } from '@/components/ui/RoomMoreMenu';
import { ModDashboardPage } from '@/pages/ModDashboardPage';
import { useVoiceChat, registerVoiceGestureRetry } from '@/hooks/useVoiceChat';

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

  const { openProfile, openDmList, unreadDmCount } = useSocialStore();
  const isMod = useAuthStore(s => s.profile?.isModerator ?? false);

  const handleLeave = () => { voice.leaveVoice(); leaveRoom(); };
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRoleGuide, setShowRoleGuide] = useState(false);
  const [showModPanel, setShowModPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [confirmTransferId, setConfirmTransferId] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showSpectators, setShowSpectators] = useState(false);
  const t = useT();
  const voice = useVoiceChat();
  const autoJoined = useRef(false);

  const amSpectator = myPlayer?.isSpectator ?? false;

  useEffect(() => {
    if (!room?.id || autoJoined.current || voice.channel) return;
    autoJoined.current = true;
    if (amSpectator) {
      voice.joinVoiceListenOnly('room');
    } else {
      // Try immediately (works on Android / pre-granted). If it fails silently
      // (iOS Safari, no pre-granted permission), wait for the first tap.
      voice.joinVoice('room', false, true).catch(() => {});
      registerVoiceGestureRetry(() => voice.joinVoice('room', false, false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, amSpectator]);

  if (!room) return null;
  const activePlayers = room.players.filter(p => !p.isSpectator);
  const spectators = room.players.filter(p => p.isSpectator);
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
          <div className="flex items-start gap-2.5">
            {/* Leave room — top-left shortcut */}
            <button
              onClick={() => amHost ? setShowLeaveConfirm(true) : handleLeave()}
              disabled={isLoading}
              title={playerCount > 1 ? 'Leave room' : 'Close room'}
              className="mt-0.5 p-1.5 rounded-xl transition-all active:scale-90 disabled:opacity-30 shrink-0"
              style={{ border: '1px solid rgba(255,60,60,0.18)', color: 'rgba(255,80,80,0.45)', background: 'rgba(255,40,40,0.04)' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,60,60,0.45)';
                (e.currentTarget as HTMLElement).style.color = 'rgba(255,80,80,0.85)';
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,40,40,0.10)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,60,60,0.18)';
                (e.currentTarget as HTMLElement).style.color = 'rgba(255,80,80,0.45)';
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,40,40,0.04)';
              }}
            >
              {/* door-exit icon */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>

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
                      ? t.lobby.allReady
                      : t.lobby.joinedOf.replace('{n}', String(playerCount)).replace('{m}', String(minPlayers))}
                  </span>
                </div>
                <span className="text-white/10 select-none">·</span>
                <button
                  onClick={() => setShowRoleGuide(true)}
                  className="text-[11px] font-mono text-white/22 hover:text-white/50 transition-colors"
                >
                  {t.lobby.roleGuideLink}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start mt-0.5 flex-shrink-0">
          {/* More menu button */}
          <button
            onClick={() => setShowMoreMenu(true)}
            className="p-2 rounded-xl transition-all hover:bg-white/5 active:scale-95"
            style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}
            title="More options"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" />
            </svg>
          </button>
          {/* Mod button */}
          {isMod && (
            <button
              onClick={() => setShowModPanel(true)}
              className="p-2 rounded-xl transition-colors"
              style={{ border: '1px solid rgba(0,229,255,0.25)', color: 'rgba(0,229,255,0.7)', background: 'rgba(0,229,255,0.06)' }}
              title="Mod Panel"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </button>
          )}
          {/* Messages button */}
          <button
            onClick={openDmList}
            className="relative p-2 rounded-xl transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.28)' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(138,43,226,0.3)';
              (e.currentTarget as HTMLElement).style.color = 'rgba(192,132,252,0.7)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
              (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.28)';
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {unreadDmCount > 0 && (
              <span
                className="absolute -top-1 -right-1 text-void text-[7px] font-bold rounded-full min-w-[13px] h-3.5 flex items-center justify-center px-0.5 leading-none"
                style={{ background: '#ff0080' }}
              >
                {unreadDmCount > 9 ? '9+' : unreadDmCount}
              </span>
            )}
          </button>
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
                <div className="flex items-center gap-3">
                  {spectators.length > 0 && (
                    <button
                      onClick={() => setShowSpectators(s => !s)}
                      className="flex items-center gap-1 text-[10px] font-mono text-white/30 hover:text-white/55 transition-colors"
                      title="Spectators"
                    >
                      <span>👁</span>
                      <span>{spectators.length}</span>
                    </button>
                  )}
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
              </div>

              {/* Rows */}
              <div className="px-2 py-2">
                {activePlayers.map((player, i) => {
                  const isMe = player.id === myPlayer?.id;
                  return (
                    <motion.div
                      key={player.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.06 + i * 0.03 }}
                      onClick={() => player.profileId && openProfile(player.profileId)}
                      className={clsx(
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer',
                        isMe
                          ? 'bg-white/[0.03] hover:bg-white/[0.05]'
                          : 'hover:bg-white/[0.025]',
                      )}
                    >
                      <Avatar name={player.name} isHost={player.isHost} size="sm" src={player.avatarUrl ?? undefined} />

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

              {/* Spectator list (collapsible) */}
              {showSpectators && spectators.length > 0 && (
                <div className="px-4 pb-3 border-t border-white/[0.04]">
                  <p className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em] pt-2 mb-1.5">Watching</p>
                  <div className="space-y-0.5">
                    {spectators.map(s => (
                      <div key={s.id} className="flex items-center gap-2 px-1 py-1">
                        <span className="text-[10px] text-white/25">👁</span>
                        <span className="text-[11px] font-mono text-white/40">{s.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                  {t.lobby.watchingSpectator}
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
                      onClick={handleLeave}
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
                    onClick={() => amHost ? setShowLeaveConfirm(true) : handleLeave()}
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
                        {t.lobby.passwordSection}
                      </label>
                      <input
                        type="text"
                        maxLength={64}
                        placeholder={t.lobby.passwordOpen}
                        value={room.settings.password ?? ''}
                        onChange={e => updateSettings({ password: e.target.value })}
                        className="w-full bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2 text-sm font-mono text-white/65 placeholder-white/15 focus:outline-none focus:border-neon-cyan/28 transition-colors"
                      />
                      {room.settings.password && (
                        <p className="text-[10px] font-mono text-white/28 mt-2">
                          {t.lobby.passwordHint}
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
              forceMuted={voice.forceMuted}
              cameraOn={voice.cameraOn}
              isLocalSpeaking={voice.isLocalSpeaking}
              peerCount={voice.peers.length}
              error={voice.error}
              listenOnly={voice.listenOnly || amSpectator}
              defaultChannel="room"
              hideCamera
              isRefreshing={voice.isRefreshing}
              onJoin={amSpectator
                ? () => voice.joinVoiceListenOnly('room')
                : (ch, wc) => voice.joinVoice(ch, wc)}
              onLeave={voice.leaveVoice}
              onToggleMute={voice.toggleMute}
              onToggleCamera={voice.toggleCamera}
              onReset={voice.resetConnection}
            />
            {voice.channel && voice.peers.length > 0 && (
              <div className="px-1">
                <VoiceParticipants
                  localName={myPlayer?.name ?? 'You'}
                  isLocalSpeaking={voice.isLocalSpeaking}
                  isMuted={voice.isMuted}
                  peers={voice.peers}
                  spectatorSocketIds={new Set(room.players.filter(p => p.isSpectator).map(p => p.socketId))}
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

      <RoleInfoModal open={showRoleGuide} onClose={() => setShowRoleGuide(false)} />

      <RoomMoreMenu
        open={showMoreMenu}
        onClose={() => setShowMoreMenu(false)}
        phase="lobby"
        roomCode={room.code}
        players={room.players}
        amHost={amHost}
        isMod={isMod}
        isSpectator={amSpectator}
        activeRoleCounts={room.activeRoleCounts}
        clanId={room.clanId}
        clanRoom={room.clanRoom}
        viewerClanId={useAuthStore.getState().myClanId}
        viewerClanRole={useAuthStore.getState().myClanRole}
        voice={{
          channel: voice.channel,
          status: voice.status,
          isMuted: voice.isMuted,
          cameraOn: voice.cameraOn,
          listenOnly: amSpectator,
          peerCount: voice.peers.length,
          forceMuted: voice.forceMuted,
          error: voice.error,
          defaultChannel: 'room',
          onJoin: (ch, withCamera) => {
            if (amSpectator) { voice.joinVoiceListenOnly(ch ?? 'room'); return; }
            voice.joinVoice(ch ?? 'room', withCamera);
          },
          onLeave: () => voice.leaveVoice(),
          onToggleMute: voice.toggleMute,
          onToggleCamera: voice.toggleCamera,
          onReset: voice.channel ? () => {
            const hadCamera = voice.cameraOn;
            voice.leaveVoice();
            setTimeout(() => voice.joinVoice('room', hadCamera), 800);
          } : undefined,
        }}
        onLeaveRoom={handleLeave}
        onShowRoleGuide={() => setShowRoleGuide(true)}
        onKickPlayer={amHost ? kickPlayer : undefined}
      />

      {/* Mod panel overlay */}
      <AnimatePresence>
        {showModPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] overflow-y-auto"
            style={{ background: 'rgba(6,3,18,0.97)' }}
          >
            <div className="relative">
              <button
                onClick={() => setShowModPanel(false)}
                className="fixed top-4 right-4 z-[401] w-9 h-9 rounded-full flex items-center justify-center font-mono text-white/50 hover:text-white/90 transition-colors"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                ✕
              </button>
              <ModDashboardPage />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
