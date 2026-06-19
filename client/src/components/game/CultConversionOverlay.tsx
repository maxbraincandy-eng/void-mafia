import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export function CultConversionOverlay({ visible, onDismiss }: Props) {
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(onDismiss, 7000);
    return () => clearTimeout(id);
  }, [visible, onDismiss]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
          onClick={onDismiss}
        >
          {/* Ambient glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(192,38,211,0.15), transparent)' }}
          />

          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18 }}
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-3xl overflow-hidden text-center"
            style={{
              background: 'rgba(10,0,15,0.96)',
              border: '1px solid rgba(192,38,211,0.4)',
              boxShadow: '0 0 60px rgba(192,38,211,0.25), 0 0 120px rgba(192,38,211,0.1)',
            }}
          >
            {/* Top accent */}
            <motion.div
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="h-1 w-full"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(192,38,211,0.8), transparent)' }}
            />

            <div className="px-6 py-8">
              {/* Candle icon animated */}
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 2.5 }}
                className="text-7xl mb-4"
                style={{ filter: 'drop-shadow(0 0 30px rgba(192,38,211,0.7))' }}
              >
                🕯️
              </motion.div>

              {/* Label */}
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-[12px] font-mono uppercase tracking-[0.3em] text-fuchsia-400/60 mb-2"
              >
                You have been converted
              </motion.p>

              {/* Headline */}
              <motion.h2
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3, type: 'spring', stiffness: 180 }}
                className="font-display text-3xl font-bold tracking-widest uppercase mb-1"
                style={{
                  background: 'linear-gradient(135deg, #c026d3, #e879f9)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  textShadow: 'none',
                }}
              >
                You are now a Cultist
              </motion.h2>

              {/* Description */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-white/40 text-sm font-mono mt-3 mb-6 leading-relaxed"
              >
                Serve the Cult Leader faithfully.<br />
                Win when the Cult outnumbers all.
              </motion.p>

              {/* New role badge */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-fuchsia-400/30 bg-fuchsia-400/8 mb-6"
              >
                <span className="text-xl">🔮</span>
                <span className="font-display font-bold text-fuchsia-300 tracking-widest uppercase text-sm">Cultist</span>
              </motion.div>

              {/* Dismiss */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                onClick={onDismiss}
                className="w-full py-2.5 rounded-xl border border-fuchsia-400/20 text-fuchsia-400/50 text-xs font-mono tracking-widest hover:border-fuchsia-400/40 hover:text-fuchsia-400/80 hover:bg-fuchsia-400/5 transition-all"
              >
                Accept your fate
              </motion.button>
            </div>

            {/* Bottom accent */}
            <motion.div
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="h-1 w-full"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(192,38,211,0.8), transparent)' }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
