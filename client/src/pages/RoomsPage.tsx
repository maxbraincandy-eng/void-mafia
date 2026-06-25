import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RoomListItem, Season } from '@/types/index';
import { useGameStore } from '@/store/gameStore';
import { useAuthStore } from '@/store/authStore';
import { useSocialStore } from '@/store/socialStore';
import { MorePanel } from '@/components/ui/MorePanel';
import { useT } from '@/store/langStore';
import { useAmbientDrone } from '@/hooks/useAudio';
import { Button } from '@/components/ui/Button';
import { SkeletonRoomCard } from '@/components/ui/Skeleton';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { DailyChallengeCard } from '@/components/ui/DailyChallengeCard';
import { NewsCard } from '@/components/ui/NewsCard';
import { LobbyChatPanel } from '@/components/social/LobbyChatPanel';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';
import { PWAInstallBanner } from '@/components/ui/PWAInstallBanner';

function SeasonBanner() {
  const [season, setSeason] = useState<Season | null>(null);

  useEffect(() => {
    emitWithAck<null, Res<Season | null>>('season:current' as any).then(res => {
      if (res.ok && res.data) setSeason(res.data);
    }).catch(() => {});
  }, []);

  if (!season) return null;

  const now = Date.now();
  const total = season.endAt - season.startAt;
  const elapsed = Math.max(0, Math.min(total, now - season.startAt));
  const pct = total > 0 ? Math.round((elapsed / total) * 100) : 0;
  const daysLeft = Math.max(0, Math.ceil((season.endAt - now) / (1000 * 60 * 60 * 24)));

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-3 rounded-2xl overflow-hidden"
      style={{
        border: '1px solid var(--vm-season-border)',
        background: 'var(--vm-season-bg)',
      }}
    >
      <div className="px-3.5 py-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <p className="font-display font-bold text-xs text-white/80 uppercase tracking-widest truncate pr-2">
            {season.name.toUpperCase()}
          </p>
          <span className="flex-shrink-0 font-mono text-[12px] text-neon-cyan/70 bg-neon-cyan/8 border border-neon-cyan/15 rounded-lg px-2 py-0.5 whitespace-nowrap">
            {daysLeft}d left
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--vm-progress-track)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: 'var(--vm-progress-fill)',
              boxShadow: `0 0 6px var(--vm-progress-glow)`,
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}

const SURFACE = 'rounded-2xl border border-white/[0.06]';
const SURFACE_BG = { background: 'var(--vm-surface-bg)' } as const;

export function RoomsPage() {
  type Preset = 'quick' | 'classic' | 'hardcore';

  const PRESET_SETTINGS: Record<Preset, { nightDuration: number; dayDuration: number; voteDuration: number; speechDuration: number }> = {
    quick:    { nightDuration: 25, dayDuration: 60,  voteDuration: 25,  speechDuration: 20 },
    classic:  { nightDuration: 45, dayDuration: 90,  voteDuration: 45,  speechDuration: 40 },
    hardcore: { nightDuration: 60, dayDuration: 120, voteDuration: 60,  speechDuration: 60 },
  };

  const [mode, setMode] = useState<'browse' | 'create' | 'join'>('browse');
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [preset, setPreset] = useState<Preset>('classic');
  const [isPrivate, setIsPrivate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [code, setCode] = useState('');
  const [joinAsSpectator, setJoinAsSpectator] = useState(false);
  const [joinPassword, setJoinPassword] = useState('');
  const [joinChoice, setJoinChoice] = useState<{ code: string; isLobby: boolean; password?: string } | null>(null);

  const { createRoom, joinRoom, isLoading, joinError, clearJoinError } = useGameStore(s => ({
    createRoom: s.createRoom,
    joinRoom: s.joinRoom,
    isLoading: s.isLoading,
    joinError: s.error,
    clearJoinError: s.clearError,
  }));
  const username = useAuthStore(s => s.username) ?? '';
  const { onlineCount, openMoreMenu, openLobbyChat, lobbyChatUnread, openDmList, unreadDmCount } = useSocialStore(s => ({
    onlineCount: s.onlineCount,
    openMoreMenu: s.openMoreMenu,
    openLobbyChat: s.openLobbyChat,
    lobbyChatUnread: s.lobbyChatUnread,
    openDmList: s.openDmList,
    unreadDmCount: s.unreadDmCount,
  }));
  const t = useT();
  // Music now handled at MainApp level

  const fetchRooms = async () => {
    setLoadingRooms(true);
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      if (data.ok) setRooms(data.data);
    } catch {}
    setLoadingRooms(false);
  };

  useEffect(() => {
    fetchRooms();
    const id = setInterval(fetchRooms, 5000);
    const onFocus = () => fetchRooms();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createRoom(username, { ...PRESET_SETTINGS[preset], isPrivate }, false, roomName);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) return;
    await joinRoom(code.toUpperCase(), username, joinAsSpectator, joinPassword);
  };

  // Server rejects a non-spectator join to a room whose game already started, asking
  // the client to let the player pick a mode — surface that as the same choice modal.
  useEffect(() => {
    if (joinError === 'GAME_ALREADY_STARTED_CHOOSE_MODE') {
      setJoinChoice({ code: code.toUpperCase(), isLobby: false, password: joinPassword });
      clearJoinError();
    }
  }, [joinError]);

  const handleJoinWithMode = async (choice: { code: string; password?: string }, joinMode: 'player' | 'spectator' | 'next_round') => {
    setJoinChoice(null);
    await joinRoom(choice.code, username, joinMode === 'spectator', choice.password ?? '', joinMode);
  };

  const phaseLabel: Record<string, string> = t.rooms.phase;

  const timeSince = (ts: number): string => {
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h`;
  };

  const MODES: { id: typeof mode; label: string }[] = [
    { id: 'browse', label: t.rooms.browse },
    { id: 'create', label: t.rooms.create },
    { id: 'join',   label: t.rooms.joinCode },
  ];

  return (
    <div
      className="min-h-screen relative overflow-hidden pb-24"
      style={{ background: 'var(--vm-page-gradient)' }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'var(--vm-page-radial)' }}
      />

      <PWAInstallBanner />
      <MorePanel />
      <LobbyChatPanel />

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-7">

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-6">
          {/* More / hamburger button */}
          <button
            onClick={openMoreMenu}
            className="flex-shrink-0 w-8 h-8 rounded-xl flex flex-col items-center justify-center gap-[4px] transition-all hover:bg-white/5 active:scale-95"
            style={{ border: '1px solid rgba(255,255,255,0.07)' }}
            aria-label="More options"
          >
            <span className="block w-4 h-[1.5px] rounded-full bg-white/40" />
            <span className="block w-4 h-[1.5px] rounded-full bg-white/40" />
            <span className="block w-2.5 h-[1.5px] rounded-full bg-white/25" />
          </button>

          {/* Title */}
          <div className="flex-1 min-w-0">
            <h1
              className="font-display font-bold gradient-text tracking-wide leading-none truncate"
              style={{ fontSize: 'clamp(18px, 5vw, 24px)' }}
            >
              VOID MAFIA
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
              <p className="text-[12px] font-mono text-white/20 tracking-wider truncate">
                SOCIAL DEDUCTION
              </p>
              {onlineCount > 0 && (
                <span className="flex-shrink-0 flex items-center gap-1 font-mono text-[12px] text-neon-green/60">
                  <span className="w-1.5 h-1.5 bg-neon-green rounded-full animate-pulse" />
                  {onlineCount}
                </span>
              )}
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <LanguageSwitcher />
            <button
              onClick={openDmList}
              className="relative w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{ background: 'var(--vm-btn-icon-bg)', border: '1px solid var(--vm-btn-icon-border)' }}
              title="Direct Messages"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {unreadDmCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[14px] h-3.5 rounded-full bg-neon-pink text-void text-[9px] font-bold flex items-center justify-center px-0.5 leading-none"
                  style={{ boxShadow: '0 0 6px rgba(255,0,204,0.6)' }}
                >
                  {unreadDmCount > 9 ? '9+' : unreadDmCount}
                </span>
              )}
            </button>
            <button
              onClick={openLobbyChat}
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl font-mono text-sm transition-all active:scale-95"
              style={lobbyChatUnread > 0
                ? { border: '1px solid rgba(255,45,85,0.5)', color: 'rgba(255,45,85,0.9)', background: 'rgba(255,45,85,0.08)' }
                : { border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.28)' }}
              title="Lobby Chat"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {lobbyChatUnread > 0 && (
                <span className="font-bold text-[12px]">
                  +{lobbyChatUnread > 99 ? '99' : lobbyChatUnread}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Season Banner */}
        <SeasonBanner />

        {/* Daily challenge */}
        <DailyChallengeCard />

        {/* News */}
        <NewsCard />

        {/* ── Mode tabs — underline style ─────────────────────── */}
        <div className="flex border-b border-white/[0.06] mb-5">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex-1 py-2.5 text-xs font-mono tracking-widest uppercase transition-all relative ${
                mode === m.id ? 'text-white/75' : 'text-white/22 hover:text-white/45'
              }`}
            >
              {m.label}
              <span
                className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-px rounded-full transition-all duration-200 ${
                  mode === m.id ? 'bg-neon-cyan/60' : 'bg-transparent'
                }`}
              />
            </button>
          ))}
        </div>

        {/* ── Browse ──────────────────────────────────────────── */}
        {mode === 'browse' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-mono text-white/28">
                {rooms.length} {rooms.length === 1 ? t.rooms.activeRooms : t.rooms.activeRoomsPlural}
              </span>
              <button
                onClick={fetchRooms}
                className="text-[11px] font-mono text-white/22 hover:text-white/55 transition-colors"
              >
                {t.rooms.refresh}
              </button>
            </div>

            {loadingRooms && rooms.length === 0 && (
              <div className="space-y-2 py-2">
                {Array.from({ length: 4 }, (_, i) => <SkeletonRoomCard key={i} />)}
              </div>
            )}

            {!loadingRooms && rooms.length === 0 && (
              <div className="text-center py-14">
                <p className="text-white/22 font-mono text-sm">{t.rooms.noRooms}</p>
                <p className="text-white/12 font-mono text-xs mt-1.5">{t.rooms.noRoomsHint}</p>
              </div>
            )}

            <div className="space-y-2">
              {rooms.map((room, i) => {
                const isLobby = room.phase === 'lobby';
                return (
                  <motion.div
                    key={room.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`${SURFACE} px-4 py-3.5 flex items-center gap-3`}
                    style={SURFACE_BG}
                  >
                    {/* Status dot */}
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isLobby ? 'bg-neon-cyan/50' : 'bg-neon-red/50'}`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm text-white/70 truncate">
                          {room.name || room.hostName}
                        </span>
                        <span className={`text-[12px] px-1.5 py-0.5 rounded font-mono tracking-wider uppercase flex-shrink-0 ${
                          isLobby
                            ? 'bg-neon-cyan/[0.08] text-neon-cyan/60 border border-neon-cyan/[0.12]'
                            : 'bg-neon-red/[0.08] text-neon-red/55 border border-neon-red/[0.12]'
                        }`}>
                          {phaseLabel[room.phase] ?? room.phase}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono">
                        {room.name && (
                          <>
                            <span className="text-white/30 truncate">{room.hostName}</span>
                            <span className="text-white/12">·</span>
                          </>
                        )}
                        <span className="text-neon-cyan/50 font-bold tracking-widest">{room.code}</span>
                        <span className="text-white/12">·</span>
                        <span className="text-white/30">{room.playerCount} {t.rooms.players}</span>
                        <span className="text-white/12">·</span>
                        <span className="text-white/18">{timeSince(room.createdAt)}</span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <Button
                        size="sm"
                        variant={isLobby ? 'neon-cyan' : 'ghost'}
                        loading={isLoading}
                        onClick={() => setJoinChoice({ code: room.code, isLobby })}
                      >
                        {isLobby ? t.rooms.joinCode : t.rooms.watch}
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── Create ──────────────────────────────────────────── */}
        {mode === 'create' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className={`${SURFACE} p-5`} style={SURFACE_BG}>
              <h3 className="font-display font-bold text-white/70 tracking-widest uppercase text-sm mb-5">
                {t.rooms.createRoom}
              </h3>

              {/* Room name */}
              <label className="block text-[12px] font-mono text-white/28 uppercase tracking-widest mb-2">
                {t.rooms.roomNameLabel}
              </label>
              <input
                type="text"
                value={roomName}
                onChange={e => setRoomName(e.target.value.slice(0, 30))}
                placeholder={t.rooms.roomNamePlaceholder}
                maxLength={30}
                className="w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-2.5 mb-5 text-white/70 placeholder-white/15 font-mono text-sm focus:outline-none focus:border-white/20 transition-colors"
              />

              {/* Public / Private toggle */}
              <p className="text-[12px] font-mono text-white/28 uppercase tracking-widest mb-2">Visibility</p>
              <div className="grid grid-cols-2 gap-2 mb-5">
                {[
                  { val: false, label: t.rooms.publicRoom, desc: 'Visible in browser' },
                  { val: true,  label: t.rooms.privateRoom, desc: 'Share code to invite' },
                ].map(opt => (
                  <button
                    key={String(opt.val)}
                    onClick={() => setIsPrivate(opt.val)}
                    className={`py-3 px-3 rounded-xl border text-left transition-all ${
                      isPrivate === opt.val
                        ? 'border-white/20 bg-white/[0.04] text-white/70'
                        : 'border-white/[0.06] text-white/28 hover:border-white/12 hover:text-white/45'
                    }`}
                  >
                    <p className="text-xs font-mono font-bold">{opt.label}</p>
                    <p className="text-[12px] font-mono text-white/30 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {/* Preset selector */}
              <p className="text-[12px] font-mono text-white/28 uppercase tracking-widest mb-2 mt-1">Game Pace</p>
              <div className="grid grid-cols-3 gap-2 mb-5">
                {(['quick', 'classic', 'hardcore'] as Preset[]).map(id => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPreset(id)}
                    className={`py-3 px-2 rounded-xl border text-center transition-all capitalize ${
                      preset === id
                        ? 'border-white/20 bg-white/[0.04] text-white/70'
                        : 'border-white/[0.06] text-white/28 hover:border-white/12 hover:text-white/45'
                    }`}
                  >
                    <p className="text-xs font-mono font-bold">{id}</p>
                  </button>
                ))}
              </div>

              <form onSubmit={handleCreate}>
                <Button fullWidth variant="primary" loading={isLoading}>
                  {t.rooms.createRoom}
                </Button>
              </form>
            </div>
          </motion.div>
        )}

        {/* ── Join by code ─────────────────────────────────────── */}
        {mode === 'join' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className={`${SURFACE} p-5`} style={SURFACE_BG}>
              <h3 className="font-display font-bold text-white/70 tracking-widest uppercase text-sm mb-5">
                {t.rooms.joinRoom}
              </h3>

              <form onSubmit={handleJoin} className="space-y-3">
                <div>
                  <label className="block text-[12px] font-mono text-white/28 uppercase tracking-widest mb-2">
                    {t.rooms.roomCodeLabel}
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                    placeholder={t.rooms.roomCodePlaceholder}
                    maxLength={6}
                    autoFocus
                    className="w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-3 text-neon-cyan/80 placeholder-white/15 font-mono text-2xl tracking-[0.4em] text-center focus:outline-none focus:border-neon-cyan/28 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-mono text-white/28 uppercase tracking-widest mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={joinPassword}
                    onChange={e => setJoinPassword(e.target.value)}
                    placeholder="Leave blank if none"
                    maxLength={64}
                    className="w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-2.5 text-white/60 placeholder-white/15 font-mono text-sm focus:outline-none focus:border-white/20 transition-colors"
                  />
                </div>

                {/* Spectator toggle */}
                <label className="flex items-center gap-3 cursor-pointer select-none py-1">
                  <button
                    type="button"
                    onClick={() => setJoinAsSpectator(v => !v)}
                    className={`w-9 h-5 rounded-full flex items-center relative transition-colors shrink-0 ${
                      joinAsSpectator ? 'bg-neon-purple/50' : 'bg-white/[0.07]'
                    }`}
                  >
                    <div className={`absolute w-3.5 h-3.5 rounded-full bg-white/80 transition-transform ${
                      joinAsSpectator ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </button>
                  <span className="text-xs font-mono text-white/40">Watch as spectator</span>
                </label>

                <Button fullWidth variant="neon-cyan" loading={isLoading} disabled={code.length < 6}>
                  {t.rooms.joinRoom}
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </div>

      {/* Join mode choice modal */}
      <AnimatePresence>
        {joinChoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
            onClick={() => setJoinChoice(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`${SURFACE} p-5 w-full max-w-xs`}
              style={SURFACE_BG}
              onClick={e => e.stopPropagation()}
            >
              <p className="text-[12px] font-mono text-white/28 uppercase tracking-widest mb-0.5">
                {joinChoice.isLobby ? t.rooms.join : t.rooms.gameInProgress}
              </p>
              <p className="font-mono font-bold text-neon-cyan/75 tracking-[0.25em] text-xl mb-5">
                {joinChoice.code}
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  fullWidth
                  variant="neon-cyan"
                  loading={isLoading}
                  onClick={() => handleJoinWithMode(joinChoice, joinChoice.isLobby ? 'player' : 'next_round')}
                >
                  {joinChoice.isLobby ? t.rooms.joinAsPlayer : t.rooms.joinNextRound}
                </Button>
                {!joinChoice.isLobby && (
                  <p className="text-[12px] font-mono text-white/30 -mt-0.5 mb-1">{t.rooms.joinNextRoundHint}</p>
                )}
                <Button
                  fullWidth
                  variant="ghost"
                  loading={isLoading}
                  onClick={() => handleJoinWithMode(joinChoice, 'spectator')}
                >
                  {t.rooms.watchAsSpectator}
                </Button>
                {!joinChoice.isLobby && (
                  <p className="text-[12px] font-mono text-white/25 -mt-0.5">{t.rooms.watchSpectatorHint}</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
