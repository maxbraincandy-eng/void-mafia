import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { LandingPage } from '@/pages/LandingPage';
import { LobbyPage } from '@/pages/LobbyPage';
import { GamePage } from '@/pages/GamePage';

function Toast() {
  const toasts = useGameStore(s => s.toasts);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            className={`
              glass-panel border px-5 py-3 rounded-xl text-sm font-display font-semibold tracking-wide
              max-w-sm text-center pointer-events-auto
              ${t.type === 'error' ? 'border-neon-red/40 text-neon-red shadow-neon-red'
                : t.type === 'success' ? 'border-neon-green/40 text-neon-green shadow-neon-green'
                : 'border-neon-cyan/30 text-white shadow-neon-cyan'}
            `}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Screen() {
  const room = useGameStore(s => s.room);
  const phase = room?.phase;

  if (!room) return <LandingPage />;
  if (phase === 'lobby') return <LobbyPage />;
  return <GamePage />;
}

export default function App() {
  const connect = useGameStore(s => s.connect);

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <>
      <AnimatePresence mode="wait">
        <Screen />
      </AnimatePresence>
      <Toast />
    </>
  );
}
