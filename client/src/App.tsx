import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useAuthStore } from '@/store/authStore';
import { LoginPage } from '@/pages/LoginPage';
import { LobbyPage } from '@/pages/LobbyPage';
import { GamePage } from '@/pages/GamePage';
import { RoomsPage } from '@/pages/RoomsPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { ClansPage } from '@/pages/ClansPage';
import { LeaderboardPage } from '@/pages/LeaderboardPage';
import { ModDashboardPage } from '@/pages/ModDashboardPage';
import { BottomNav, NavTab } from '@/components/layout/BottomNav';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

interface Toast {
  id: string;
  text: string;
  type: 'info' | 'success' | 'error';
}

function ToastLayer() {
  const toasts = useGameStore(s => s.toasts);
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
      <AnimatePresence>
        {toasts.map((t: Toast) => (
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

function MainApp() {
  const [page, setPage] = useState<NavTab>('rooms');
  const profile = useAuthStore(s => s.profile);
  const isMod = profile?.isModerator ?? false;

  return (
    <div className="pb-20 min-h-screen">
      <AnimatePresence mode="wait">
        {page === 'rooms'       && <RoomsPage key="rooms" />}
        {page === 'clans'       && <ClansPage key="clans" />}
        {page === 'leaderboard' && <LeaderboardPage key="leaderboard" />}
        {page === 'profile'     && <ProfilePage key="profile" />}
        {page === 'mod' && isMod && <ModDashboardPage key="mod" />}
      </AnimatePresence>
      <BottomNav active={page} isMod={isMod} onChange={setPage} />
    </div>
  );
}

function Screen() {
  const isAuthed = useAuthStore(s => s.isAuthed);
  const room = useGameStore(s => s.room);

  if (!isAuthed) return <LoginPage />;
  if (room) {
    if (room.phase === 'lobby') return <LobbyPage />;
    return <GamePage />;
  }
  return <MainApp />;
}

export default function App() {
  const connect = useGameStore(s => s.connect);

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <>
      {/* Global language switcher — top-right corner */}
      <div className="fixed top-3 right-3 z-[200]">
        <LanguageSwitcher />
      </div>

      <AnimatePresence mode="wait">
        <Screen />
      </AnimatePresence>
      <ToastLayer />
    </>
  );
}
