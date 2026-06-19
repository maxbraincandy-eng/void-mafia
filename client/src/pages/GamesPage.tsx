import { motion } from 'framer-motion';
import { useT } from '@/store/langStore';
import { GamesTab } from '@/components/community/GamesTab';

export function GamesPage() {
  const t = useT();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.18 }}
      className="min-h-screen"
      style={{ background: '#03000d' }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-4 pt-4 pb-3"
        style={{
          background: 'rgba(3,0,13,0.92)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <span style={{ fontSize: 22 }}>🎮</span>
          <div>
            <h1
              className="font-display font-bold text-lg leading-none"
              style={{ color: '#f59e0b', textShadow: '0 0 18px rgba(245,158,11,0.45)' }}
            >
              {t.nav.games}
            </h1>
            <p className="font-mono text-[12px] uppercase tracking-widest text-white/25 mt-0.5">
              Checkers · Joker · Ludo
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto">
        <GamesTab />
      </div>
    </motion.div>
  );
}
