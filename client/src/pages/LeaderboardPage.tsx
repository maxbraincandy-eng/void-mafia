import { motion } from 'framer-motion';

export function LeaderboardPage() {
  return (
    <div className="min-h-screen bg-neon-grid-animated scanlines pb-20 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-neon-pink/8 rounded-full blur-[100px] pointer-events-none" />
      <div className="relative z-10 max-w-lg mx-auto px-4 pt-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold gradient-text tracking-wide">VOID MAFIA</h1>
          <p className="text-neon-green/50 font-mono text-xs tracking-widest">powered by ბატონი მაქსი</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel border border-neon-pink/20 rounded-2xl p-8 text-center"
        >
          <div className="text-5xl mb-4">◈</div>
          <h2 className="font-display font-bold text-neon-pink tracking-widest uppercase mb-2">
            Leaderboard
          </h2>
          <p className="text-white/30 font-mono text-sm">
            Coming soon — the top players will be ranked here.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
