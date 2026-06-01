import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface Victim {
  name: string;
  seat: number;
}

interface Props {
  victims: Victim[];
  onDone: () => void;
}

export function EliminationCinematic({ victims, onDone }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (victims.length === 0) return;
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 400);
    }, 2800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [victims]);

  return (
    <AnimatePresence>
      {visible && victims.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none"
        >
          <motion.div
            initial={{ scale: 0.7, y: 40 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, y: -30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="text-center space-y-3"
          >
            <div className="text-6xl" style={{ filter: 'drop-shadow(0 0 30px #ff2d55)' }}>💀</div>
            {victims.map(v => (
              <div key={v.seat}>
                <p className="font-display text-3xl font-bold text-neon-red tracking-widest uppercase"
                  style={{ textShadow: '0 0 20px rgba(255,45,85,0.8)' }}>
                  {v.name}
                </p>
                <p className="text-xs font-mono text-white/40 uppercase tracking-widest mt-1">has been eliminated</p>
              </div>
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
