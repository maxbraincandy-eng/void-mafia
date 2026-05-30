import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { connectSocket } from '@/lib/socket';

export function LoginPage() {
  const [name, setName] = useState('');
  const { login, isLoading, error } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    connectSocket();
    await login(name.trim());
  };

  return (
    <div className="min-h-screen bg-neon-grid-animated scanlines flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon-purple/15 rounded-full blur-[120px] pointer-events-none animate-pulse-glow" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-neon-cyan/10 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <h1 className="font-display text-6xl font-black gradient-text tracking-wider animate-glitch">
            VOID MAFIA
          </h1>
          <p className="text-white/30 font-mono text-xs tracking-widest mt-2">
            CYBERPUNK SOCIAL DEDUCTION
          </p>
          <p className="text-neon-green/50 font-mono text-xs tracking-widest mt-1">
            powered by ბატონი მაქსი
          </p>
        </motion.div>

        {/* Login card */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onSubmit={handleSubmit}
          className="glass-panel border border-neon-cyan/20 rounded-2xl p-6 shadow-glass"
        >
          <h2 className="font-display text-lg font-bold text-neon-cyan tracking-widest uppercase mb-6 text-center">
            Enter Your Name
          </h2>

          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Player name…"
            maxLength={24}
            autoFocus
            className="w-full bg-void-50/80 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 font-mono text-sm focus:outline-none focus:border-neon-cyan/50 focus:shadow-neon-cyan transition-all mb-4"
          />

          {error && (
            <p className="text-neon-red text-xs font-mono mb-3 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!name.trim() || isLoading}
            className="w-full bg-gradient-to-r from-neon-pink via-neon-purple to-neon-cyan text-white font-display font-bold tracking-widest py-3 rounded-xl transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-neon-cyan active:scale-95"
          >
            {isLoading ? 'Connecting…' : 'ENTER THE VOID'}
          </button>
        </motion.form>

        <p className="text-white/15 text-xs font-mono text-center mt-6">
          No account required · Your name is your identity
        </p>
      </div>
    </div>
  );
}
