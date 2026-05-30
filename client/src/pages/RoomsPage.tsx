import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RoomListItem } from '@/types/index';
import { useGameStore } from '@/store/gameStore';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface Props {
  onEnterRoom: () => void;
}

export function RoomsPage({ onEnterRoom }: Props) {
  const [mode, setMode] = useState<'browse' | 'create' | 'join'>('browse');
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const { createRoom, joinRoom, isLoading } = useGameStore(s => ({
    createRoom: s.createRoom,
    joinRoom: s.joinRoom,
    isLoading: s.isLoading,
  }));
  const username = useAuthStore(s => s.username) ?? '';

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createRoom(name || username);
    onEnterRoom();
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    await joinRoom(code.toUpperCase(), username);
    onEnterRoom();
  };

  const handleQuickJoin = async (room: RoomListItem) => {
    await joinRoom(room.code, username);
    onEnterRoom();
  };

  const phaseLabel: Record<string, string> = {
    lobby: 'Waiting',
    role_reveal: 'Starting',
    night: 'Night',
    day: 'Day',
    voting: 'Voting',
    game_over: 'Ended',
  };

  return (
    <div className="min-h-screen bg-neon-grid-animated scanlines pb-20 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-72 h-72 bg-neon-cyan/8 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-display text-3xl font-bold gradient-text tracking-wide">VOID MAFIA</h1>
          <p className="text-neon-green/50 font-mono text-xs tracking-widest">powered by ბატონი მაქსი</p>
        </div>

        {/* Action tabs */}
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
              {m === 'browse' ? 'Browse' : m === 'create' ? 'Create' : 'Join Code'}
            </button>
          ))}
        </div>

        {/* Browse */}
        {mode === 'browse' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-white/40 uppercase tracking-widest">
                {rooms.length} active room{rooms.length !== 1 ? 's' : ''}
              </span>
              <button onClick={fetchRooms} className="text-xs text-neon-cyan/60 hover:text-neon-cyan font-mono">
                ↻ refresh
              </button>
            </div>

            {loadingRooms && rooms.length === 0 && (
              <p className="text-center text-white/30 font-mono text-sm py-8">Loading…</p>
            )}

            {!loadingRooms && rooms.length === 0 && (
              <div className="text-center py-12">
                <p className="text-white/25 font-mono text-sm">No active rooms</p>
                <p className="text-white/15 font-mono text-xs mt-1">Create the first one!</p>
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
                          Host: {room.hostName} · {room.playerCount} player{room.playerCount !== 1 ? 's' : ''}
                        </p>
                      </div>

                      {room.phase === 'lobby' && (
                        <Button
                          size="sm"
                          variant="neon-cyan"
                          loading={isLoading}
                          onClick={() => handleQuickJoin(room)}
                        >
                          Join
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
          <motion.form initial={{ opacity: 0 }} animate={{ opacity: 1 }} onSubmit={handleCreate}>
            <Card glow="purple" padding="md">
              <h3 className="font-display font-bold text-neon-purple tracking-widest uppercase mb-4">
                Create Room
              </h3>
              <label className="block text-xs font-mono text-white/40 mb-1">Your name in room</label>
              <input
                type="text"
                value={name || username}
                onChange={e => setName(e.target.value)}
                placeholder={username}
                maxLength={24}
                className="w-full bg-void-50/80 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 font-mono text-sm focus:outline-none focus:border-neon-purple/40 mb-4"
              />
              <Button fullWidth variant="primary" loading={isLoading} onClick={() => {}}>
                Create Room
              </Button>
            </Card>
          </motion.form>
        )}

        {/* Join by code */}
        {mode === 'join' && (
          <motion.form initial={{ opacity: 0 }} animate={{ opacity: 1 }} onSubmit={handleJoin}>
            <Card glow="cyan" padding="md">
              <h3 className="font-display font-bold text-neon-cyan tracking-widest uppercase mb-4">
                Join by Code
              </h3>
              <label className="block text-xs font-mono text-white/40 mb-1">Room code (6 characters)</label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="XXXXXX"
                maxLength={6}
                className="w-full bg-void-50/80 border border-white/10 rounded-xl px-4 py-3 text-neon-cyan placeholder-white/20 font-mono text-xl tracking-[0.4em] text-center focus:outline-none focus:border-neon-cyan/40 mb-4"
              />
              <Button fullWidth variant="neon-cyan" loading={isLoading} disabled={code.length < 6} onClick={() => {}}>
                Join Room
              </Button>
            </Card>
          </motion.form>
        )}
      </div>
    </div>
  );
}
