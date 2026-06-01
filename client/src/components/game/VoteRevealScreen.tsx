import { AnimatePresence, motion } from 'framer-motion';
import { VoteBreakdownEntry } from '@/types/index';

interface Props {
  breakdown: VoteBreakdownEntry[] | null;
  onDismiss: () => void;
}

export function VoteRevealScreen({ breakdown, onDismiss }: Props) {
  if (!breakdown) return null;

  const totals = breakdown.reduce<Record<string, { name: string; votes: number; voters: string[] }>>(
    (acc, v) => {
      if (!acc[v.targetId]) acc[v.targetId] = { name: v.targetName, votes: 0, voters: [] };
      acc[v.targetId].votes += v.weight;
      acc[v.targetId].voters.push(v.voterName);
      return acc;
    },
    {}
  );

  const sorted = Object.values(totals).sort((a, b) => b.votes - a.votes);
  const maxVotes = sorted[0]?.votes ?? 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onDismiss}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="w-full max-w-sm glass-panel border border-neon-red/30 rounded-2xl p-5"
          onClick={e => e.stopPropagation()}
        >
          <h2 className="font-display text-lg font-bold text-neon-red tracking-widest text-center mb-4">
            VOTE BREAKDOWN
          </h2>

          <div className="space-y-3">
            {sorted.map((target, i) => (
              <motion.div
                key={target.name}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.08 }}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-mono text-sm text-white/80">{target.name}</span>
                  <span className="font-display font-bold text-neon-red text-sm">{target.votes}</span>
                </div>
                <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(target.votes / maxVotes) * 100}%` }}
                    transition={{ delay: i * 0.08 + 0.1, duration: 0.4 }}
                    className="h-full bg-gradient-to-r from-neon-red to-neon-pink rounded-full"
                  />
                </div>
                <p className="font-mono text-[9px] text-white/25 mt-0.5">
                  {target.voters.join(', ')}
                </p>
              </motion.div>
            ))}
          </div>

          {breakdown.length === 0 && (
            <p className="text-center text-white/30 font-mono text-sm py-4">No votes were cast.</p>
          )}

          <button
            onClick={onDismiss}
            className="mt-4 w-full py-2.5 rounded-xl border border-white/10 text-white/40 hover:text-white/70 font-mono text-xs transition-colors"
          >
            DISMISS
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
