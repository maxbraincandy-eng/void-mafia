import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RoomListItem } from '@/types/index';
import { useGameStore } from '@/store/gameStore';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/store/langStore';
import { useAmbientDrone } from '@/hooks/useAudio';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function RoomsPage() {
  const [mode, setMode] = useState<'browse' | 'create' | 'join'>('browse');
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [code, setCode] = useState('');
  const [joinAsSpectator, setJoinAsSpectator] = useState(false);
  const [spectatorModal, setSpectatorModal] = useState<RoomListItem | null>(null);

  const { createRoom, joinRoom, isLoading } = useGameStore(s => ({
    createRoom: s.createRoom,
    joinRoom: s.joinRoom,
    isLoading: s.isLoading,
  }));
  const username = useAuthStore(s => s.username) ?? '';
  const t = useT();
  useAmbientDrone(0.05);

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
    return () => clearInterval(id);
  }, []);

  // Request mic permission during user gesture so lobby can auto-join voice
  const primeMicPermission = () => {
    navigator.mediaDevices?.getUserMedia?.({ audio: true })
      .then(s => s.getTracks().forEach(t => t.stop()))
      .catch(() => {});
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    primeMicPermission();
    await createRoom(username, isPrivate ? { isPrivate: true } : undefined);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) return;
    primeMicPermission();
    await joinRoom(code.toUpperCase(), username, joinAsSpectator);
  };

  const handleQuickJoin = async (room: RoomListItem, isSpectator: boolean) => {
    primeMicPermission();
    setSpectatorModal(null);
    await joinRoom(room.code, username, isSpectator);
  };

  const phaseLabel: Record<string, string> = t.rooms.phase;

  const roomCount = rooms.length;

  return (
    <div className="min-h-screen bg-neon-grid-animated scanlines pb-20 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-72 h-72 bg-neon-cyan/8 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-8">
        {/* Header */}
        <div className="mb-6 pr-20">
          <h1 className="font-display text-3xl font-bold gradient-text tracking-wide">VOID MAFIA</h1>
          <p className="text-neon-green/50 font-mono text-xs tracking-widest">{t.common.poweredBy}</p>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2 mb-6">
          {(['browse', 'create', 'join'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2 rounded-xl font-display font-bold text-xs tracking-widest uppercase transition-all ${
                mode === m
                  ? 'bg-neon-cyan/15 border border-neon-cyan/40 text-neon-cyan'
                  : 'border border-white/5 text-white/30 hover:text-white/60'
              }`}
            >
              {m === 'browse' ? t.rooms.browse : m === 'create' ? t.rooms.create : t.rooms.joinCode}
            </button>
          ))}
        </div>

        {/* Browse */}
        {mode === 'browse' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-white/40 uppercase tracking-widest">
                {roomCount} {roomCount === 1 ? t.rooms.activeRooms : t.rooms.activeRoomsPlural}
              </span>
              <button onClick={fetchRooms} className="text-xs text-neon-cyan/60 hover:text-neon-cyan font-mono">
                {t.rooms.refresh}
              </button>
            </div>

            {loadingRooms && rooms.length === 0 && (
              <p className="text-center text-white/30 font-mono text-sm py-8">{t.common.loading}</p>
            )}

            {!loadingRooms && rooms.length === 0 && (
              <div className="text-center py-12">
                <p className="text-white/25 font-mono text-sm">{t.rooms.noRooms}</p>
                <p className="text-white/15 font-mono text-xs mt-1">{t.rooms.noRoomsHint}</p>
              </div>
            )}

            <div className="space-y-3">
              {rooms.map((room, i) => (
                <motion.div
                  key={room.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Card glow="none" padding="sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-neon-cyan text-sm font-bold tracking-widest">
                            {room.code}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                            room.phase === 'lobby'
                              ? 'bg-neon-green/10 text-neon-green border border-neon-green/20'
                              : 'bg-neon-red/10 text-neon-red border border-neon-red/20'
                          }`}>
                            {phaseLabel[room.phase] ?? room.phase}
                          </span>
                        </div>
                        <p className="text-white/40 text-xs font-mono">
                          {t.rooms.host}: {room.hostName} · {room.playerCount} {t.rooms.players}
                        </p>
                      </div>

                      {room.phase === 'lobby' && (
                        <Button
                          size="sm"
                          variant="neon-cyan"
                          loading={isLoading}
                          onClick={() => setSpectatorModal(room)}
                        >
                          {t.rooms.joinCode}
                        </Button>
                      )}
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Create */}
        {mode === 'create' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card glow="purple" padding="md">
              <h3 className="font-display font-bold text-neon-purple tracking-widest uppercase mb-4">
                {t.rooms.createRoom}
              </h3>

              {/* Public / Private toggle */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setIsPrivate(false)}
                  className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition-all border ${
                    !isPrivate
                      ? 'bg-neon-cyan/15 border-neon-cyan/40 text-neon-cyan'
                      : 'border-white/10 text-white/30 hover:text-white/60'
                  }`}
                >
                  🌐 {t.rooms.publicRoom}
                </button>
                <button
                  onClick={() => setIsPrivate(true)}
                  className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition-all border ${
                    isPrivate
                      ? 'bg-neon-pink/15 border-neon-pink/40 text-neon-pink'
                      : 'border-white/10 text-white/30 hover:text-white/60'
                  }`}
                >
                  🔒 {t.rooms.privateRoom}
                </button>
              </div>

              <div className="text-xs font-mono text-white/30 mb-4 p-3 rounded-xl bg-void-50/60 border border-white/5">
                {isPrivate
                  ? '🔒 Room will not appear in the public list. Share the code manually.'
                  : '🌐 Room will be visible in the public browser.'}
              </div>

              <form onSubmit={handleCreate}>
                <Button fullWidth variant="primary" loading={isLoading}>
                  {t.rooms.createRoom}
                </Button>
              </form>
            </Card>
          </motion.div>
        )}

        {/* Join by code */}
        {mode === 'join' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card glow="cyan" padding="md">
              <h3 className="font-display font-bold text-neon-cyan tracking-widest uppercase mb-4">
                {t.rooms.joinRoom}
              </h3>
              <label className="block text-xs font-mono text-white/40 mb-1">{t.rooms.roomCodeLabel}</label>
              <form onSubmit={handleJoin}>
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  placeholder={t.rooms.roomCodePlaceholder}
                  maxLength={6}
                  autoFocus
                  className="w-full bg-void-50/80 border border-white/10 rounded-xl px-4 py-3 text-neon-cyan placeholder-white/20 font-mono text-xl tracking-[0.4em] text-center focus:outline-none focus:border-neon-cyan/40 mb-4"
                />
                <label className="flex items-center gap-3 mb-4 cursor-pointer select-none">
                  <div
                    onClick={() => setJoinAsSpectator(v => !v)}
                    className={`w-10 h-6 rounded-full flex items-center transition-colors relative ${joinAsSpectator ? 'bg-neon-purple/60' : 'bg-white/10'}`}
                  >
                    <div className={`absolute w-4 h-4 rounded-full bg-white transition-transform ${joinAsSpectator ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                  <span className="text-xs font-mono text-white/50">
                    👁 Watch as spectator
                  </span>
                </label>
                <Button fullWidth variant="neon-cyan" loading={isLoading} disabled={code.length < 6}>
                  {t.rooms.joinRoom}
                </Button>
              </form>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Spectator choice modal */}
      <AnimatePresence>
        {spectatorModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setSpectatorModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass-panel border border-white/10 rounded-2xl p-6 max-w-xs w-full"
              onClick={e => e.stopPropagation()}
            >
              <p className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1">Join Room</p>
              <p className="font-display font-bold text-neon-cyan tracking-widest text-lg mb-4">
                {spectatorModal.code}
              </p>
              <div className="flex flex-col gap-3">
                <Button
                  fullWidth
                  variant="neon-cyan"
                  loading={isLoading}
                  onClick={() => handleQuickJoin(spectatorModal, false)}
                >
                  🎮 Join as Player
                </Button>
                <Button
                  fullWidth
                  variant="ghost"
                  loading={isLoading}
                  onClick={() => handleQuickJoin(spectatorModal, true)}
                >
                  👁 Watch as Spectator
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
