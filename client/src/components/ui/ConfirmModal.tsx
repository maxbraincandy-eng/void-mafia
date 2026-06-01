import { AnimatePresence, motion } from 'framer-motion';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  dangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', dangerous = false,
  onConfirm, onCancel,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={onCancel}
        >
          <motion.div
            initial={{ y: 60, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 40, scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="w-full max-w-sm rounded-2xl border border-white/12 overflow-hidden"
            style={{ background: 'rgba(10,5,24,0.98)', backdropFilter: 'blur(24px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <h3 className="font-display text-lg font-bold text-white tracking-wide mb-2">{title}</h3>
              <p className="text-sm text-white/60 font-mono leading-relaxed">{message}</p>
            </div>
            <div className="flex gap-2 px-4 pb-5">
              <button
                onClick={onCancel}
                className="flex-1 py-3 rounded-xl text-sm font-display font-bold tracking-wider uppercase text-white/50 border border-white/12 hover:border-white/25 hover:text-white/80 transition-all active:scale-95"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-3 rounded-xl text-sm font-display font-bold tracking-wider uppercase transition-all active:scale-95"
                style={dangerous
                  ? { background: 'rgba(255,45,85,0.15)', border: '1px solid rgba(255,45,85,0.5)', color: '#ff6680' }
                  : { background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.4)', color: '#00e5ff' }}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
