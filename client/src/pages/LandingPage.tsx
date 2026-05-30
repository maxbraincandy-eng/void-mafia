import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

type Mode = 'home' | 'create' | 'join';

const FEATURES = [
  { icon: '🔴', title: 'Private Rooms', desc: 'Create or join rooms with a 6-character code. Up to 16 players.' },
  { icon: '🎭', title: 'Secret Roles', desc: 'Mafia, Sheriff, Doctor, Don, Maniac & more. Roles randomized each game.' },
  { icon: '🌙', title: 'Day & Night', desc: 'Discuss by day. Mafia eliminate, Sheriff investigates, Doctor protects by night.' },
  { icon: '⚖️', title: 'Town Vote', desc: 'Vote to eliminate suspects. Live vote counts. Change your mind until time runs out.' },
  { icon: '💬', title: 'Live Chat', desc: 'Room chat, private Mafia channel, and a dead players channel.' },
  { icon: '🏆', title: 'Win Conditions', desc: 'Town: eliminate all Mafia. Mafia: outnumber the town. Neutrals have their own agenda.' },
];

export function LandingPage() {
  const [mode, setMode] = useState<Mode>('home');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [nameError, setNameError] = useState('');
  const [codeError, setCodeError] = useState('');

  const { createRoom, joinRoom, isLoading, isConnected } = useGameStore(s => ({
    createRoom: s.createRoom,
    joinRoom: s.joinRoom,
    isLoading: s.isLoading,
    isConnected: s.isConnected,
  }));

  const validateName = () => {
    if (!name.trim()) { setNameError('Name is required.'); return false; }
    if (name.trim().length < 2) { setNameError('Name must be at least 2 characters.'); return false; }
    setNameError('');
    return true;
  };

  const handleCreate = async () => {
    if (!validateName()) return;
    await createRoom(name.trim());
  };

  const handleJoin = async () => {
    if (!validateName()) return;
    if (!code.trim() || code.trim().length !== 6) { setCodeError('Enter a 6-character room code.'); return; }
    setCodeError('');
    await joinRoom(code.trim().toUpperCase(), name.trim());
  };

  return (
    <div className="min-h-screen bg-neon-grid-animated scanlines relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-neon-purple/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-20 right-1/4 w-64 h-64 bg-neon-cyan/8 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-48 bg-neon-pink/8 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-16">
        {/* Hero */}
        <div className="text-center mb-20">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-block mb-4"
          >
            <span className="text-6xl md:text-8xl animate-float inline-block"
              style={{ filter: 'drop-shadow(0 0 40px #00f5ff) drop-shadow(0 0 80px #ff00cc60)' }}>
              ◆
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6 }}
            className="font-display text-7xl md:text-9xl font-bold tracking-tight mb-4"
          >
            <span className="gradient-text animate-glitch" data-text="VOID">VOID</span>
            <br />
            <span className="gradient-text">MAFIA</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-white/50 text-lg md:text-xl font-light max-w-xl mx-auto leading-relaxed"
          >
            A cyberpunk social deduction game of lies, loyalty, and betrayal.
          </motion.p>

          {/* Connection status */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex items-center justify-center gap-2 mt-4"
          >
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-neon-green animate-pulse' : 'bg-neon-red'}`} />
            <span className="text-xs font-mono text-white/30">
              {isConnected ? 'Connected' : 'Connecting…'}
            </span>
          </motion.div>
        </div>

        {/* CTA */}
        <AnimatePresence mode="wait">
          {mode === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col sm:flex-row gap-4 justify-center mb-24"
            >
              <Button
                size="lg"
                variant="primary"
                onClick={() => setMode('create')}
                className="min-w-[200px]"
              >
                ＋ Create Room
              </Button>
              <Button
                size="lg"
                variant="neon-cyan"
                onClick={() => setMode('join')}
                className="min-w-[200px]"
              >
                → Join Room
              </Button>
            </motion.div>
          )}

          {mode === 'create' && (
            <motion.div
              key="create"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-md mx-auto mb-24"
            >
              <Card glow="pink" padding="lg">
                <h2 className="font-display text-2xl font-bold text-neon-pink text-glow-pink tracking-widest uppercase mb-6">
                  Create Room
                </h2>
                <div className="space-y-4">
                  <Input
                    label="Your Name"
                    placeholder="Enter your name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    error={nameError}
                    maxLength={24}
                    autoFocus
                  />
                  <Button
                    fullWidth
                    size="lg"
                    variant="primary"
                    loading={isLoading}
                    onClick={handleCreate}
                  >
                    Create & Enter
                  </Button>
                  <Button
                    fullWidth
                    variant="ghost"
                    onClick={() => setMode('home')}
                  >
                    ← Back
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {mode === 'join' && (
            <motion.div
              key="join"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-md mx-auto mb-24"
            >
              <Card glow="cyan" padding="lg">
                <h2 className="font-display text-2xl font-bold text-neon-cyan text-glow-cyan tracking-widest uppercase mb-6">
                  Join Room
                </h2>
                <div className="space-y-4">
                  <Input
                    label="Your Name"
                    placeholder="Enter your name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    error={nameError}
                    maxLength={24}
                    autoFocus
                  />
                  <Input
                    label="Room Code"
                    placeholder="6-character code"
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                    error={codeError}
                    className="font-mono text-center text-2xl tracking-[0.3em] uppercase"
                    maxLength={6}
                  />
                  <Button
                    fullWidth
                    size="lg"
                    variant="neon-cyan"
                    loading={isLoading}
                    onClick={handleJoin}
                  >
                    Enter Room
                  </Button>
                  <Button
                    fullWidth
                    variant="ghost"
                    onClick={() => setMode('home')}
                  >
                    ← Back
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Features grid */}
        {mode === 'home' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + i * 0.07 }}
              >
                <Card glow="none" padding="md"
                  className="group hover:border-neon-cyan/20 hover:bg-neon-cyan/3 transition-all duration-300 h-full"
                >
                  <div className="text-3xl mb-3">{f.icon}</div>
                  <h3 className="font-display font-bold text-white tracking-wide mb-2">{f.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center py-6 text-white/20 text-xs font-mono">
        VOID MAFIA · Real-time social deduction
      </div>
    </div>
  );
}
