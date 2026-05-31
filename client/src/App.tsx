import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import clsx from 'clsx';
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

function ModNoticeOverlay() {
  const { modNotice, dismissModNotice } = useGameStore(s => ({
    modNotice: s.modNotice,
    dismissModNotice: s.dismissModNotice,
  }));

  if (!modNotice) return null;

  const config = {
    ban:  { title: 'YOU HAVE BEEN BANNED',  color: 'text-neon-red',   border: 'border-neon-red/30',   bg: 'bg-neon-red/10',   icon: '🔨' },
    mute: { title: 'YOU HAVE BEEN MUTED',   color: 'text-neon-pink',  border: 'border-neon-pink/30',  bg: 'bg-neon-pink/10',  icon: '🔇' },
    warn: { title: 'WARNING',               color: 'text-yellow-400', border: 'border-yellow-400/30', bg: 'bg-yellow-400/10', icon: '⚠️' },
  } as const;
  const cfg = config[modNotice.type];

  const formatExpiry = (expiresAt?: number) => {
    if (!expiresAt) return null;
    const d = new Date(expiresAt);
    return d.toLocaleString();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
    >
      <motion.div
        initial={{ scale: 0.85, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className={clsx(
          'glass-panel rounded-2xl p-6 w-full max-w-sm border-2',
          cfg.border,
          cfg.bg,
        )}
      >
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">{cfg.icon}</div>
          <h2 className={clsx('font-display font-bold tracking-widest text-lg', cfg.color)}>
            {cfg.title}
          </h2>
        </div>

        <div className="space-y-2 mb-5">
          <div className={clsx('rounded-xl p-3 border', cfg.border)}>
            <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest mb-0.5">Reason</p>
            <p className="text-white text-sm font-mono">{modNotice.reason}</p>
          </div>

          {modNotice.expiresAt && (
            <div className={clsx('rounded-xl p-3 border', cfg.border)}>
              <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest mb-0.5">Expires</p>
              <p className="text-white text-sm font-mono">{formatExpiry(modNotice.expiresAt)}</p>
            </div>
          )}

          {modNotice.moderatorName && (
            <div className={clsx('rounded-xl p-3 border', cfg.border)}>
              <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest mb-0.5">Moderator</p>
              <p className="text-white text-sm font-mono">{modNotice.moderatorName}</p>
            </div>
          )}
        </div>

        {modNotice.type !== 'ban' && (
          <button
            onClick={dismissModNotice}
            className={clsx(
              'w-full py-2.5 rounded-xl font-display font-bold text-sm tracking-widest uppercase border transition-all',
              cfg.border,
              cfg.color,
              'hover:opacity-80',
            )}
          >
            Got it
          </button>
        )}

        {modNotice.type === 'ban' && (
          <p className="text-white/30 text-xs font-mono text-center">
            This action cannot be dismissed. You have been removed from the platform.
          </p>
        )}
      </motion.div>
    </motion.div>
  );
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
      <ToastLayer />
      <AnimatePresence>
        <ModNoticeOverlay />
      </AnimatePresence>
    </>
  );
}
