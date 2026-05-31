import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Victim {
  name: string;
  seat: number;
}

interface Props {
  victims: Victim[];
  onDone: () => void;
}

export function EliminationCinematic({ victims, onDone }: Props) {
  useEffect(() => {
    if (victims.length === 0) return;
    const id = setTimeout(onDone, 2800);
    return () => clearTimeout(id);
  }, [victims, onDone]);

  return (
    <AnimatePresence>
      {victims.length > 0 && (
        <motion.div
          key="elim-cinematic"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5 } }}
          className="fixed inset-0 z-[42] flex items-center justify-center pointer-events-none"
        >
          {/* Red flash */}
          <motion.div
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
            className="absolute inset-0 bg-neon-red/15"
          />
          {/* Scanline flicker */}
          <motion.div
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="absolute inset-0"
            style={{
              background:
                'repeating-linear-gradient(0deg,rgba(255,30,60,0.07) 0px,rgba(255,30,60,0.07) 1px,transparent 1px,transparent 4px)',
            }}
          />

          <div className="flex flex-col items-center gap-4">
            {victims.map((v, i) => (
              <motion.div
                key={v.name}
                initial={{ y: -28, opacity: 0, scale: 0.88 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 16, opacity: 0 }}
                transition={{ delay: i * 0.12, duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
                className="glass-card border border-neon-red/40 bg-black/88 backdrop-blur-xl px-10 py-6 text-center rounded-2xl"
                style={{ boxShadow: '0 0 40px rgba(255,30,60,0.22), 0 0 80px rgba(255,30,60,0.07)' }}
              >
                <motion.div
                  animate={{ scale: [1, 1.14, 1] }}
                  transition={{ repeat: 1, duration: 0.5 }}
                  className="text-5xl mb-3"
                >
                  💀
                </motion.div>
                <p
                  className="text-[10px] font-mono uppercase tracking-[0.3em] mb-2"
                  style={{ color: 'rgba(255,30,60,0.6)' }}
                >
                  eliminated
                </p>
                <p
                  className="font-display text-3xl font-bold tracking-wide text-white"
                  style={{ textShadow: '0 0 22px rgba(255,30,60,0.65)' }}
                >
                  {v.name}
                </p>
                <p className="text-white/25 font-mono text-xs mt-1">#{v.seat}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
