import { ReactNode, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  open: boolean;
  onClose?: () => void;
  title?: string;
  children: ReactNode;
  /** Extra padding at bottom in addition to safe area (default 16) */
  bottomPad?: number;
}

export function BottomSheet({ open, onClose, title, children, bottomPad = 16 }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            className="fixed bottom-0 left-0 right-0 z-[61] flex flex-col max-h-[90dvh]"
            style={{
              background: 'rgba(8,4,22,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '20px 20px 0 0',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
              paddingBottom: `max(${bottomPad}px, env(safe-area-inset-bottom, 0px))`,
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340, mass: 0.8 }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.18)' }} />
            </div>

            {title && (
              <div className="px-5 py-3 flex-shrink-0 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <h2 className="font-display font-bold text-white text-base tracking-wide">{title}</h2>
              </div>
            )}

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
