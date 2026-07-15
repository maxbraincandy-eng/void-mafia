import { motion } from 'framer-motion';
import { useHermesStore } from '@/store/hermesStore';
import { useAuthStore } from '@/store/authStore';
import { useGameStore } from '@/store/gameStore';
import { HermesGlyph } from './HermesGlyph';

export function HermesToggle() {
  const isAuthed = useAuthStore(s => s.isAuthed);
  const inRoom = useGameStore(s => !!s.room);
  const { isOpen, open } = useHermesStore();

  // Only in the main menu: hide when logged out, when the panel is already
  // open, or while inside a room (mafia lobby/game).
  if (!isAuthed || isOpen || inRoom) return null;

  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 1.2, type: 'spring', stiffness: 280, damping: 22 }}
      onClick={() => open()}
      aria-label="Open Hermes AI"
      className="vm-frame-anchor-right fixed bottom-[5.5rem] right-4 z-[60] w-12 h-12 rounded-full flex flex-col items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, rgba(0,245,255,0.12), rgba(155,0,255,0.12))',
        border: '1px solid rgba(0,245,255,0.35)',
        boxShadow: '0 0 18px rgba(0,245,255,0.18), 0 4px 16px rgba(0,0,0,0.55)',
      }}
    >
      <HermesGlyph size={24} />
    </motion.button>
  );
}
