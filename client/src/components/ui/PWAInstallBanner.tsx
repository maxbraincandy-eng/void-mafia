import { motion, AnimatePresence } from 'framer-motion';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export function PWAInstallBanner() {
  const { canInstall, install, dismiss } = usePWAInstall();

  return (
    <AnimatePresence>
      {canInstall && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="mx-4 mb-3 rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(0,229,255,0.06)',
            border: '1px solid rgba(0,229,255,0.18)',
          }}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.2)' }}
            >
              🎮
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-sm text-white leading-tight">Install Void Mafia</p>
              <p className="font-mono text-[10px] text-white/40 mt-0.5 leading-tight">
                Play like an app from your home screen
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={install}
                className="px-3 py-1.5 rounded-lg font-display font-bold text-xs tracking-widest uppercase transition-all border border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan hover:bg-neon-cyan/20 active:scale-95"
              >
                Install
              </button>
              <button
                onClick={dismiss}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/25 hover:text-white/50 transition-colors text-sm"
              >
                ✕
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
