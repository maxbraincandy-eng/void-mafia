import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore, hasPendingSession } from '@/store/gameStore';
import clsx from 'clsx';
import { useAuthStore } from '@/store/authStore';
import { useSocialStore } from '@/store/socialStore';
import type { DmToast as DmToastData } from '@/store/socialStore';
import { LoginPage } from '@/pages/LoginPage';
import { LobbyPage } from '@/pages/LobbyPage';
import { GamePage } from '@/pages/GamePage';
import { RoomsPage } from '@/pages/RoomsPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { ClansPage } from '@/pages/ClansPage';
import { LeaderboardPage } from '@/pages/LeaderboardPage';
import { ModDashboardPage } from '@/pages/ModDashboardPage';
import { EconomyAdminPage } from '@/pages/EconomyAdminPage';
import { ReplaysPage } from '@/pages/ReplaysPage';
import { PublicProfilePage } from '@/pages/PublicProfilePage';
import { BottomNav, NavTab } from '@/components/layout/BottomNav';
import { MorePanel } from '@/components/ui/MorePanel';
import { PlayerProfileModal } from '@/components/ui/PlayerProfileModal';
import { DmPanel } from '@/components/social/DmPanel';
import { GiftReceivedAnimation } from '@/components/ui/GiftReceivedAnimation';
import { CoinShopModal } from '@/components/ui/CoinShopModal';
import { ShopSuccessModal } from '@/components/ui/ShopSuccessModal';
import { ModAlertPanel } from '@/components/ui/ModAlertPanel';
import { attachGlobalClickSounds, onSettingsChange } from '@/lib/audioEngine';
import { useSettingsStore } from '@/store/settingsStore';
import { socket } from '@/lib/socket';
import type { GiftReceivedNotification } from '@/types/index';

// Detect /u/:publicId deep link on initial load
const _initialPathMatch = window.location.pathname.match(/^\/u\/(\d+)$/);
const INITIAL_PUBLIC_ID: number | null = _initialPathMatch ? parseInt(_initialPathMatch[1]!, 10) : null;

// Detect referral code from URL
const _refMatch = new URLSearchParams(window.location.search).get('ref');
if (_refMatch && !localStorage.getItem('vm_pending_ref')) {
  localStorage.setItem('vm_pending_ref', _refMatch);
}

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

function DmToastNotification() {
  const { dmToast, clearDmToast, openDmWith } = useSocialStore();

  useEffect(() => {
    if (!dmToast) return;
    const id = setTimeout(clearDmToast, 4500);
    return () => clearTimeout(id);
  }, [dmToast, clearDmToast]);

  return (
    <AnimatePresence>
      {dmToast && (
        <motion.div
          key="dm-toast"
          initial={{ opacity: 0, x: 80 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 80 }}
          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          className="fixed bottom-24 right-3 z-[90] cursor-pointer"
          style={{ maxWidth: '280px' }}
          onClick={() => {
            openDmWith((dmToast as DmToastData).senderUserId);
            clearDmToast();
          }}
        >
          <div
            className="rounded-2xl backdrop-blur-2xl px-3 py-2.5 flex items-center gap-3"
            style={{
              background: 'rgba(8,4,20,0.97)',
              border: '1px solid rgba(138,43,226,0.45)',
              boxShadow: '0 0 28px rgba(138,43,226,0.18), 0 4px 24px rgba(0,0,0,0.5)',
            }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #ff0080, #8a2be2)' }}
            >
              {(dmToast as DmToastData).senderAvatar}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[9px] uppercase tracking-[0.15em]"
                 style={{ color: 'rgba(192,132,252,0.6)' }}>
                New message
              </p>
              <p className="font-display text-xs font-bold text-white truncate">
                {(dmToast as DmToastData).senderUsername}
              </p>
              <p className="font-mono text-[10px] truncate mt-0.5 leading-snug"
                 style={{ color: 'rgba(255,255,255,0.38)' }}>
                {(dmToast as DmToastData).preview}
              </p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); clearDmToast(); }}
              className="text-white/20 hover:text-white/50 text-sm flex-shrink-0 transition-colors ml-1"
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MainApp({ onOpenShop }: { onOpenShop: () => void }) {
  const [page, setPage] = useState<NavTab>('rooms');
  const [initialReplayId, setInitialReplayId] = useState<string | undefined>(undefined);
  const profile = useAuthStore(s => s.profile);
  const isMod   = profile?.isModerator ?? false;
  const isOwner = profile?.moderatorLevel === 'owner';
  const { openDmList } = useSocialStore();

  function navigateToReplay(gameId: string) {
    setInitialReplayId(gameId);
    setPage('replays');
  }

  return (
    <div className="pb-20 min-h-screen">
      <AnimatePresence mode="wait">
        {page === 'rooms'                   && <RoomsPage key="rooms" />}
        {page === 'clans'                   && <ClansPage key="clans" />}
        {page === 'replays'                 && <ReplaysPage key={`replays-${initialReplayId ?? ''}`} initialReplayId={initialReplayId} />}
        {page === 'leaderboard'             && <LeaderboardPage key="leaderboard" onBack={() => setPage('rooms')} />}
        {page === 'profile'                 && <ProfilePage key="profile" onViewReplay={navigateToReplay} />}
        {page === 'mod' && isMod            && <ModDashboardPage key="mod" />}
        {page === 'economy' && isOwner      && <EconomyAdminPage key="economy" />}
      </AnimatePresence>
      <BottomNav active={page} isMod={isMod} onChange={tab => { if (tab !== 'replays') setInitialReplayId(undefined); setPage(tab); }} onMessagesClick={openDmList} />
      <MorePanel isOwner={isOwner} onEconomyClick={() => setPage('economy')} onShopClick={onOpenShop} onReplaysClick={() => { setInitialReplayId(undefined); setPage('replays'); }} />
    </div>
  );
}

function ReconnectingOverlay() {
  const isReconnecting = useGameStore(s => s.isReconnecting);
  const isConnected = useGameStore(s => s.isConnected);
  const room = useGameStore(s => s.room);

  if (!room || !isReconnecting || isConnected) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[400] flex items-center justify-center pointer-events-none"
      style={{ background: 'rgba(3,0,13,0.72)', backdropFilter: 'blur(4px)' }}
    >
      <div className="flex flex-col items-center gap-3 px-6 py-6 rounded-2xl border border-neon-cyan/15 bg-void/80">
        <div className="w-8 h-8 border-2 border-neon-cyan/40 border-t-neon-cyan rounded-full animate-spin" />
        <p className="font-mono text-sm text-neon-cyan/80 tracking-widest uppercase">Reconnecting…</p>
        <p className="font-mono text-[10px] text-white/25">Your session is being restored</p>
      </div>
    </motion.div>
  );
}

function ResumingSplash() {
  return (
    <div
      className="fixed inset-0 z-[500] flex flex-col items-center justify-center gap-5"
      style={{ background: '#03000d' }}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 45% at 50% 50%, rgba(0,229,255,0.07) 0%, transparent 65%)' }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative flex flex-col items-center gap-4"
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
          style={{
            background: 'rgba(0,229,255,0.08)',
            border: '1px solid rgba(0,229,255,0.2)',
            boxShadow: '0 0 40px rgba(0,229,255,0.12)',
          }}
        >
          ⬡
        </div>
        <p
          className="font-display text-xl font-bold tracking-[0.2em] uppercase"
          style={{ color: 'rgba(0,229,255,0.85)', textShadow: '0 0 20px rgba(0,229,255,0.4)' }}
        >
          VOID MAFIA
        </p>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan/60 animate-ping" />
          <p className="font-mono text-xs tracking-[0.22em] uppercase text-white/35">
            თამაშს უბრუნდები…
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function Screen({ publicProfileId, onClearPublicProfile, onOpenShop }: { publicProfileId: number | null; onClearPublicProfile: () => void; onOpenShop: () => void }) {
  const isAuthed = useAuthStore(s => s.isAuthed);
  const isReconnecting = useGameStore(s => s.isReconnecting);
  const room = useGameStore(s => s.room);

  if (publicProfileId) {
    return <PublicProfilePage publicId={publicProfileId} onEnterApp={onClearPublicProfile} />;
  }

  // Show a full-screen splash if we know there's a saved session and haven't restored it yet.
  // This prevents flashing the login/rooms page during the reconnect handshake.
  if (!room && isReconnecting && hasPendingSession()) {
    return <ResumingSplash />;
  }

  if (!isAuthed) return <LoginPage />;
  if (room) {
    if (room.phase === 'lobby') return <LobbyPage />;
    return <GamePage />;
  }
  return <MainApp onOpenShop={onOpenShop} />;
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
          {modNotice.type === 'warn' && modNotice.category && modNotice.category !== 'other' && (
            <div className={clsx('rounded-xl p-3 border', cfg.border)}>
              <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest mb-0.5">Category</p>
              <p className="text-white text-sm font-mono capitalize">{modNotice.category.replace(/_/g, ' ')}</p>
            </div>
          )}
          <div className={clsx('rounded-xl p-3 border', cfg.border)}>
            <p className="text-white/40 text-[10px] font-mono uppercase tracking-widest mb-0.5">Reason</p>
            <p className="text-white text-sm font-mono">{modNotice.reason || '—'}</p>
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
  const { profilePopupId, closeProfile } = useSocialStore();
  const profile = useAuthStore(s => s.profile);
  const [giftNotif, setGiftNotif] = useState<GiftReceivedNotification | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [publicProfileId, setPublicProfileId] = useState<number | null>(INITIAL_PUBLIC_ID);
  const [shopSuccess, setShopSuccess] = useState(() => window.location.pathname === '/shop/success');

  useEffect(() => {
    connect();
    attachGlobalClickSounds();
    const unsub = useSettingsStore.subscribe(onSettingsChange);
    if (window.location.pathname === '/shop/success') {
      window.history.replaceState({}, '', '/');
    }
    return unsub;
  }, [connect]);

  useEffect(() => {
    const handler = (data: GiftReceivedNotification) => setGiftNotif(data);
    socket.on('gifts:received' as any, handler);
    return () => { socket.off('gifts:received' as any, handler); };
  }, []);

  return (
    <>
      <AnimatePresence mode="wait">
        <Screen publicProfileId={publicProfileId} onClearPublicProfile={() => setPublicProfileId(null)} onOpenShop={() => setShopOpen(true)} />
      </AnimatePresence>
      <ToastLayer />
      <AnimatePresence>
        <ReconnectingOverlay />
      </AnimatePresence>
      <AnimatePresence>
        <ModNoticeOverlay />
      </AnimatePresence>
      {/* Global social overlays — rendered outside Screen so they work from any page/game view */}
      <PlayerProfileModal playerId={profilePopupId} onClose={closeProfile} />
      <DmPanel />
      <DmToastNotification />
      <ModAlertPanel />
      <GiftReceivedAnimation notification={giftNotif} onDismiss={() => setGiftNotif(null)} />
      <CoinShopModal open={shopOpen} onClose={() => setShopOpen(false)} profileId={profile?.id ?? ''} />
      <ShopSuccessModal open={shopSuccess} onClose={() => setShopSuccess(false)} />
    </>
  );
}
