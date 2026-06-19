import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { VoteBreakdownEntry } from '@/types/index';

interface Props {
  breakdown: VoteBreakdownEntry[] | null;
  onDismiss: () => void;
}

type Phase = 'intro' | 'votes' | 'final';

export function VoteRevealScreen({ breakdown, onDismiss }: Props) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [visibleCount, setVisibleCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allVotes = breakdown ?? [];

  const runningTally = allVotes.slice(0, visibleCount).reduce<Record<string, { name: string; votes: number }>>(
    (acc, v) => {
      if (!acc[v.targetId]) acc[v.targetId] = { name: v.targetName, votes: 0 };
      acc[v.targetId].votes += v.weight;
      return acc;
    },
    {}
  );
  const tallyEntries = Object.values(runningTally).sort((a, b) => b.votes - a.votes);

  const finalTally = allVotes.reduce<Record<string, { name: string; votes: number }>>(
    (acc, v) => {
      if (!acc[v.targetId]) acc[v.targetId] = { name: v.targetName, votes: 0 };
      acc[v.targetId].votes += v.weight;
      return acc;
    },
    {}
  );
  const eliminated = Object.values(finalTally).sort((a, b) => b.votes - a.votes)[0] ?? null;

  // intro → votes
  useEffect(() => {
    timerRef.current = setTimeout(() => setPhase('votes'), 1600);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // vote-by-vote reveal
  useEffect(() => {
    if (phase !== 'votes') return;

    if (allVotes.length === 0) {
      timerRef.current = setTimeout(() => setPhase('final'), 400);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }

    if (visibleCount >= allVotes.length) {
      timerRef.current = setTimeout(() => setPhase('final'), 1800);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }

    timerRef.current = setTimeout(
      () => setVisibleCount(c => c + 1),
      visibleCount === 0 ? 300 : 900,
    );
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, visibleCount, allVotes.length]);

  if (!breakdown) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-4"
      onClick={phase === 'final' ? onDismiss : undefined}
    >
      <AnimatePresence mode="wait">
        {/* ── Intro ──────────────────────────────────────────── */}
        {phase === 'intro' && (
          <motion.div
            key="intro"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.4 }}
            className="text-center"
          >
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-6xl mb-4"
            >
              🗳️
            </motion.div>
            <h1
              className="font-display text-4xl font-bold text-neon-red tracking-widest uppercase"
              style={{ textShadow: '0 0 30px #ff0040, 0 0 60px #ff004050' }}
            >
              THE VOTES
            </h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-white/30 font-mono text-sm mt-2 tracking-widest uppercase"
            >
              are in
            </motion.p>
          </motion.div>
        )}

        {/* ── Vote-by-vote reveal ────────────────────────────── */}
        {phase === 'votes' && (
          <motion.div
            key="votes"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-sm"
          >
            <h2 className="font-display text-[12px] text-neon-red/50 tracking-widest text-center mb-4 uppercase">
              Vote Reveal
            </h2>

            {/* Vote cards */}
            <div className="space-y-2 mb-4 max-h-56 overflow-hidden">
              <AnimatePresence initial={false}>
                {allVotes.slice(0, visibleCount).slice(-5).map((vote, i, arr) => (
                  <motion.div
                    key={`${vote.voterName}-${vote.targetId}-${i}`}
                    initial={{ x: -30, opacity: 0, scale: 0.95 }}
                    animate={{ x: 0, opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 24 }}
                    className={`flex items-center gap-3 glass-panel border rounded-xl px-4 py-3 ${
                      i === arr.length - 1
                        ? 'border-neon-red/40 bg-neon-red/5'
                        : 'border-white/8'
                    }`}
                  >
                    <span className="font-mono text-sm text-white/60 flex-1 truncate">{vote.voterName}</span>
                    <span className="text-neon-red font-bold text-xs shrink-0">→</span>
                    <span className="font-display text-sm font-bold text-neon-red flex-1 text-right truncate">
                      {vote.targetName}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Running tally */}
            <AnimatePresence>
              {tallyEntries.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-panel border border-white/8 rounded-xl p-3"
                >
                  <p className="text-[12px] font-mono text-white/25 uppercase tracking-widest mb-2">
                    Running Tally
                  </p>
                  {tallyEntries.map((entry, i) => (
                    <motion.div
                      key={entry.name}
                      layout
                      className="flex justify-between items-center py-0.5"
                    >
                      <span className="font-mono text-xs text-white/50">{entry.name}</span>
                      <span
                        className={`font-display font-bold text-base ${
                          i === 0 ? 'text-neon-red' : 'text-white/30'
                        }`}
                      >
                        {entry.votes}
                      </span>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── Final reveal ───────────────────────────────────── */}
        {phase === 'final' && (
          <motion.div
            key="final"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center px-4"
          >
            {eliminated ? (
              <>
                <motion.p
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-white/40 font-mono text-sm uppercase tracking-widest mb-8"
                >
                  And the eliminated player is...
                </motion.p>

                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.9, type: 'spring', stiffness: 180, damping: 14 }}
                >
                  <div className="text-5xl mb-3">☠️</div>
                  <h1
                    className="font-display text-5xl font-bold text-neon-red tracking-widest uppercase"
                    style={{ textShadow: '0 0 40px #ff0040, 0 0 80px #ff004060' }}
                  >
                    {eliminated.name}
                  </h1>
                  <p className="text-white/30 font-mono text-sm mt-3">
                    {eliminated.votes} {eliminated.votes === 1 ? 'vote' : 'votes'}
                  </p>
                </motion.div>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.3 }}
                  transition={{ delay: 2.5 }}
                  className="text-white font-mono text-xs mt-10"
                >
                  tap to continue
                </motion.p>
              </>
            ) : (
              <>
                <div className="text-5xl mb-4">🤷</div>
                <h1 className="font-display text-3xl font-bold text-white/60 tracking-widest">
                  NO VOTES CAST
                </h1>
                <p className="text-white/30 font-mono text-xs mt-3">Nobody was eliminated today.</p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.3 }}
                  transition={{ delay: 1 }}
                  className="text-white font-mono text-xs mt-8"
                >
                  tap to continue
                </motion.p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip */}
      {phase !== 'final' && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          onClick={onDismiss}
          className="absolute bottom-8 right-8 text-white/20 hover:text-white/50 font-mono text-xs transition-colors"
        >
          SKIP
        </motion.button>
      )}
    </motion.div>
  );
}
