import { motion } from 'framer-motion';
import { confirmMediaPrimer, dismissMediaPrimer } from '@/hooks/useVoiceChat';

export function MediaPermissionPrimer() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[400] flex items-end justify-center pb-6 px-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={dismissMediaPrimer}
    >
      <motion.div
        initial={{ y: 60, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 40, scale: 0.95 }}
        className="w-full max-w-sm rounded-2xl p-5 flex flex-col gap-4"
        style={{
          background: 'rgba(3, 0, 19, 0.99)',
          border: '1px solid rgba(168, 85, 247, 0.3)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex gap-3 items-start">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)' }}
          >
            🎙️
          </div>
          <div>
            <p className="font-display font-bold text-[14px] text-white leading-tight mb-1">
              Microphone Access Needed
            </p>
            <p className="font-mono text-[11px] text-white/50 leading-snug">
              Void Mafia uses your microphone for in-game voice chat. When your browser asks, tap <span className="text-purple-400">Allow</span>.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={confirmMediaPrimer}
            className="flex-1 py-2.5 rounded-xl font-display font-bold text-[12px] tracking-widest uppercase text-white active:scale-95 transition-all"
            style={{ background: 'rgba(168,85,247,0.25)', border: '1px solid rgba(168,85,247,0.4)' }}
          >
            Got it — Allow
          </button>
          <button
            onClick={dismissMediaPrimer}
            className="px-4 py-2.5 rounded-xl font-mono text-[11px] text-white/30 active:scale-95 transition-all"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
