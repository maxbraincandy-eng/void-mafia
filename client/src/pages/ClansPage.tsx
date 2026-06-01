import { motion } from 'framer-motion';
import { PoweredBy } from '@/components/ui/PoweredBy';

export function ClansPage() {
  return (
    <div className="min-h-screen bg-neon-grid-animated scanlines pb-20 relative overflow-hidden">
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-neon-purple/8 rounded-full blur-[100px] pointer-events-none" />
      <div className="relative z-10 max-w-lg mx-auto px-4 pt-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold gradient-text tracking-wide">VOID MAFIA</h1>
          <PoweredBy className="block mt-0.5" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel border border-neon-purple/20 rounded-2xl p-8 text-center"
        >
          <div className="text-5xl mb-4">⚔</div>
          <h2 className="font-display font-bold text-neon-purple tracking-widest uppercase mb-2">
            Clans
          </h2>
          <p className="text-white/30 font-mono text-sm">
            Form alliances, dominate the void. Clan system coming soon.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
