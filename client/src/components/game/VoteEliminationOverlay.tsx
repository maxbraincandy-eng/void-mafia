import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VoteEliminationResult, RoleKey } from '@/types/index';

const ROLE_ICONS: Partial<Record<RoleKey, string>> = {
  mafia: '🔫', citizen: '🏙', sheriff: '🔍', doctor: '💉', don: '♛',
  maniac: '🌀', jester: '🃏', bodyguard: '🛡',
  spy: '🕵️', escort: '💃', vigilante: '⚖️',
  cult_leader: '🕯️', cultist: '🔮', veteran: '🎖️',
  tracker: '👁', arsonist: '🔥', mayor: '👑',
};

interface Props {
  result: VoteEliminationResult | null;
  onDismiss: () => void;
}

export function VoteEliminationOverlay({ result, onDismiss }: Props) {
  // Auto-dismiss after 6 seconds
  useEffect(() => {
    if (!result) return;
    const id = setTimeout(onDismiss, 6000);
    return () => clearTimeout(id);
  }, [result, onDismiss]);

  return (
    <AnimatePresence>
      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
          onClick={onDismiss}
        >
          <motion.div
            initial={{ scale: 0.85, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-3xl overflow-hidden text-center"
            style={{
              background: 'rgba(20,5,5,0.95)',
              border: '1px solid rgba(255,45,85,0.35)',
              boxShadow: '0 0 60px rgba(255,45,85,0.2), 0 0 120px rgba(255,45,85,0.08)',
            }}
          >
            {/* Pulsing top bar */}
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="h-1 w-full bg-neon-red"
              style={{ boxShadow: '0 0 12px rgba(255,45,85,0.8)' }}
            />

            <div className="px-6 py-8">
              {/* Gavel icon */}
              <motion.div
                initial={{ rotate: -30, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
                className="text-6xl mb-4"
                style={{ filter: 'drop-shadow(0 0 20px rgba(255,45,85,0.6))' }}
              >
                ⚖️
              </motion.div>

              {/* Label */}
              <motion.p
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="text-[12px] font-mono uppercase tracking-[0.25em] text-neon-red/60 mb-2"
              >
                Condemned by the Town
              </motion.p>

              {/* Name */}
              <motion.h2
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="font-display text-4xl font-bold text-white tracking-wide mb-1"
                style={{ textShadow: '0 0 20px rgba(255,255,255,0.2)' }}
              >
                {result.name}
              </motion.h2>

              {/* Role hidden during game */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="flex items-center justify-center gap-2 mb-4"
              >
                <span className="text-2xl">❓</span>
                <span className="font-display font-bold text-neon-red/50 tracking-widest uppercase text-sm">
                  ???
                </span>
              </motion.div>

              {/* Last Will */}
              {result.lastWill && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                  className="mx-auto max-w-xs rounded-2xl border border-white/10 bg-white/4 px-4 py-3 mb-6"
                >
                  <p className="text-[12px] font-mono uppercase tracking-widest text-white/30 mb-1.5">📜 Last Will</p>
                  <p className="text-sm text-white/70 italic leading-relaxed">"{result.lastWill}"</p>
                </motion.div>
              )}

              {/* Dismiss */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                onClick={onDismiss}
                className="w-full py-2.5 rounded-xl border border-neon-red/20 text-neon-red/50 text-xs font-mono tracking-widest hover:border-neon-red/40 hover:text-neon-red/80 hover:bg-neon-red/5 transition-all"
              >
                Continue
              </motion.button>
            </div>

            {/* Bottom bar */}
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="h-1 w-full bg-neon-red"
              style={{ boxShadow: '0 0 12px rgba(255,45,85,0.8)' }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
