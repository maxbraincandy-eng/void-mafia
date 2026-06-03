import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RoomListItem } from '@/types/index';
import { useGameStore } from '@/store/gameStore';
import { useAuthStore } from '@/store/authStore';
import { useSocialStore } from '@/store/socialStore';
import { MorePanel } from '@/components/ui/MorePanel';
import { useT } from '@/store/langStore';
import { useAmbientDrone } from '@/hooks/useAudio';
import { Button } from '@/components/ui/Button';
import { LeaderboardModal } from '@/components/ui/LeaderboardModal';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { DailyChallengeCard } from '@/components/ui/DailyChallengeCard';

const SURFACE = 'rounded-2xl border border-white/[0.06]';
const SURFACE_BG = { background: 'rgba(10, 6, 28, 0.92)' } as const;

export function RoomsPage() {
  type Preset = 'quick' | 'classic' | 'hardcore';

  const PRESET_SETTINGS: Record<Preset, { nightDuration: number; dayDuration: number; voteDuration: number; speechDuration: number }> = {
    quick:    { nightDuration: 25, dayDuration: 60,  voteDuration: 25,  speechDuration: 20 },
    classic:  { nightDuration: 45, dayDuration: 90,  voteDuration: 45,  speechDuration: 40 },
    hardcore: { nightDuration: 60, dayDuration: 120, voteDuration: 60,  speechDuration: 60 },
  };

  const [mode, setMode] = useState<'browse' | 'create' | 'join'>('browse');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [preset, setPreset] = useState<Preset>('classic');
  const [isPrivate, setIsPrivate] = useState(false);
  const [code, setCode] = useState('');
  const [joinAsSpectator, setJoinAsSpectator] = useState(false);
  const [joinPassword, setJoinPassword] = useState('');
  const [spectatorModal, setSpectatorModal] = useState<RoomListItem | null>(null);

  const { createRoom, joinRoom, isLoading } = useGameStore(s => ({
    createRoom: s.createRoom,
    joinRoom: s.joinRoom,
    isLoading: s.isLoading,
  }));
  const username = useAuthStore(s => s.username) ?? '';
  const { onlineCount, openMoreMenu } = useSocialStore(s => ({ onlineCount: s.onlineCount, openMoreMenu: s.openMoreMenu }));
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
    await createRoom(username, { ...PRESET_SETTINGS[preset], isPrivate });
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) return;
    await joinRoom(code.toUpperCase(), username, joinAsSpectator, joinPassword);
  };

  const handleQuickJoin = async (room: RoomListItem, isSpectator: boolean) => {
    setSpectatorModal(null);
    await joinRoom(room.code, username, isSpectator);
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
      style={{ background: 'linear-gradient(160deg, #0c0525 0%, #050311 50%)' }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 90% 35% at 50% -5%, rgba(100,0,240,0.08) 0%, transparent 55%)' }}
      />

      <LeaderboardModal open={showLeaderboard} onClose={() => setShowLeaderboard(false)} />

      <MorePanel />

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-7">

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6">
          {/* More / hamburger button */}
          <button
            onClick={openMoreMenu}
            className="flex-shrink-0 w-9 h-9 rounded-xl flex flex-col items-center justify-center gap-[4.5px] transition-all hover:bg-white/5 active:scale-95"
            style={{ border: '1px solid rgba(255,255,255,0.07)' }}
            aria-label="More options"
          >
            <span className="block w-4 h-[1.5px] rounded-full bg-white/40" />
            <span className="block w-4 h-[1.5px] rounded-full bg-white/40" />
            <span className="block w-2.5 h-[1.5px] rounded-full bg-white/25" />
          </button>

          {/* Title — pushed slightly right by the gap */}
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl font-bold gradient-text tracking-wide leading-none">
              VOID MAFIA
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[10px] font-mono text-white/20 tracking-widest">
                SOCIAL DEDUCTION
              </p>
              {onlineCount > 0 && (
                <span className="flex items-center gap-1 font-mono text-[9px] text-neon-green/60">
                  <span className="w-1.5 h-1.5 bg-neon-green rounded-full animate-pulse" />
                  {onlineCount} online
                </span>
              )}
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <LanguageSwitcher />
            <button
              onClick={() => setShowLeaderboard(true)}
              className="px-3 py-1.5 rounded-xl border border-white/[0.07] text-white/25 hover:text-white/55 hover:border-white/14 font-mono text-sm transition-all"
              title={t.game.header.leaderboard}
            >
              ◈
            </button>
          </div>
        </div>

        {/* Daily challenge */}
        <DailyChallengeCard />

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
              <p className="text-center text-white/25 font-mono text-sm py-10">{t.common.loading}</p>
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
                        <span className="font-medium text-sm text-white/70 truncate">{room.hostName}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono tracking-wider uppercase flex-shrink-0 ${
                          isLobby
                            ? 'bg-neon-cyan/[0.08] text-neon-cyan/60 border border-neon-cyan/[0.12]'
                            : 'bg-neon-red/[0.08] text-neon-red/55 border border-neon-red/[0.12]'
                        }`}>
                          {phaseLabel[room.phase] ?? room.phase}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono">
                        <span className="text-neon-cyan/50 font-bold tracking-widest">{room.code}</span>
                        <span className="text-white/12">·</span>
                        <span className="text-white/30">{room.playerCount} {t.rooms.players}</span>
                        <span className="text-white/12">·</span>
                        <span className="text-white/18">{timeSince(room.createdAt)}</span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isLobby ? (
                        <Button
                          size="sm"
                          variant="neon-cyan"
                          loading={isLoading}
                          onClick={() => setSpectatorModal(room)}
                        >
                          {t.rooms.joinCode}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={isLoading}
                          onClick={() => handleQuickJoin(room, true)}
                        >
                          Watch
                        </Button>
                      )}
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

              {/* Public / Private toggle */}
              <p className="text-[10px] font-mono text-white/28 uppercase tracking-widest mb-2">Visibility</p>
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
                    <p className="text-[10px] font-mono text-white/30 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>

              {/* Preset selector */}
              <p className="text-[10px] font-mono text-white/28 uppercase tracking-widest mb-2 mt-1">Game Pace</p>
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
                  <label className="block text-[10px] font-mono text-white/28 uppercase tracking-widest mb-2">
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
                  <label className="block text-[10px] font-mono text-white/28 uppercase tracking-widest mb-2">
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

      {/* Spectator modal */}
      <AnimatePresence>
        {spectatorModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
            onClick={() => setSpectatorModal(null)}
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
              <p className="text-[10px] font-mono text-white/28 uppercase tracking-widest mb-0.5">Join</p>
              <p className="font-mono font-bold text-neon-cyan/75 tracking-[0.25em] text-xl mb-5">
                {spectatorModal.code}
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  fullWidth
                  variant="neon-cyan"
                  loading={isLoading}
                  onClick={() => handleQuickJoin(spectatorModal, false)}
                >
                  Join as Player
                </Button>
                <Button
                  fullWidth
                  variant="ghost"
                  loading={isLoading}
                  onClick={() => handleQuickJoin(spectatorModal, true)}
                >
                  Watch as Spectator
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
