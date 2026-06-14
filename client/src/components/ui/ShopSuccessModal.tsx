import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShopSuccessModal({ open, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="shop-success-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[600] flex items-center justify-center p-4"
          style={{ background: 'rgba(3,0,13,0.92)', backdropFilter: 'blur(8px)' }}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 12 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="relative w-full max-w-sm rounded-2xl p-8 flex flex-col items-center gap-5 text-center"
            style={{
              background: 'rgba(8,4,20,0.98)',
              border: '1px solid rgba(57,255,20,0.35)',
              boxShadow: '0 0 60px rgba(57,255,20,0.12), 0 0 120px rgba(57,255,20,0.05), inset 0 0 30px rgba(57,255,20,0.04)',
            }}
          >
            {/* Ambient glow */}
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(57,255,20,0.08) 0%, transparent 70%)',
              }}
            />

            {/* Coin icon */}
            <motion.div
              initial={{ scale: 0.5, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}
              className="text-6xl leading-none select-none"
            >
              🪙
            </motion.div>

            {/* Heading */}
            <div className="space-y-1">
              <h2
                className="font-display font-bold text-2xl tracking-[0.15em] uppercase"
                style={{
                  color: '#39ff14',
                  textShadow: '0 0 20px rgba(57,255,20,0.6), 0 0 40px rgba(57,255,20,0.3)',
                }}
              >
                PAYMENT SUCCESSFUL
              </h2>
              <div
                className="h-px w-20 mx-auto rounded-full"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(57,255,20,0.5), transparent)' }}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <p className="font-mono text-sm text-white/80">
                Coins have been added to your wallet
              </p>
              <p className="font-mono text-xs text-white/35">
                It may take a few seconds to reflect in your balance
              </p>
            </div>

            {/* CTA */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onClose}
              className="w-full py-3 rounded-xl font-display font-bold text-sm tracking-widest uppercase transition-all"
              style={{
                background: 'rgba(57,255,20,0.12)',
                border: '1px solid rgba(57,255,20,0.4)',
                color: '#39ff14',
                boxShadow: '0 0 20px rgba(57,255,20,0.1)',
              }}
            >
              Back to Game
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
