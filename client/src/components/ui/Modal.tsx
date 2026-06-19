import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  title?: string;
}

export function Modal({ open, onClose, children, title }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel — slides from bottom on mobile, scales in on desktop */}
          <motion.div
            className="relative z-10 w-full sm:max-w-md glass-card border border-neon-cyan/20 shadow-neon-cyan p-6 sm:rounded-2xl"
            style={{
              borderRadius: '20px 20px 0 0',
              paddingBottom: 'max(24px, env(safe-area-inset-bottom, 0px))',
            }}
            initial={{ y: '100%', opacity: 1 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 32, stiffness: 340, mass: 0.8 }}
          >
            {/* Drag handle (mobile only) */}
            <div className="flex justify-center -mt-2 mb-4 sm:hidden">
              <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.18)' }} />
            </div>

            {title && (
              <h2 className="font-display text-xl font-bold text-neon-cyan text-glow-cyan tracking-widest uppercase mb-4">
                {title}
              </h2>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
