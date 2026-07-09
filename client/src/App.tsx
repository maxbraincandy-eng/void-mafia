import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useGameStore, hasPendingSession } from '@/store/gameStore';
import clsx from 'clsx';
import { useAuthStore } from '@/store/authStore';
import { useNameColorStore } from '@/store/nameColorStore';
import { useSocialStore } from '@/store/socialStore';
import type { DmToast as DmToastData } from '@/store/socialStore';
import { LoginPage } from '@/pages/LoginPage';
import { LobbyPage } from '@/pages/LobbyPage';
import { GamePage } from '@/pages/GamePage';
import { RoomsPage } from '@/pages/RoomsPage';
import { CommunityPage } from '@/pages/CommunityPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { ClansPage } from '@/pages/ClansPage';
import { LeaderboardPage } from '@/pages/LeaderboardPage';
import { ModPanel } from '@/pages/ModDashboardPage';
import { EconomyAdminPage } from '@/pages/EconomyAdminPage';
import { ReplaysPage } from '@/pages/ReplaysPage';
import { PublicProfilePage } from '@/pages/PublicProfilePage';
import { BottomNav, NavTab } from '@/components/layout/BottomNav';
import { useCheckersStore } from '@/store/checkersStore';
import { useLudoStore } from '@/store/ludoStore';
import { useJokerStore } from '@/store/jokerStore';
import { useWWWStore } from '@/store/wwwStore';
import { useUnoStore } from '@/store/unoStore';
import { GamesPage } from '@/pages/GamesPage';
import { MorePanel } from '@/components/ui/MorePanel';
import { PlayerProfileModal } from '@/components/ui/PlayerProfileModal';
import { DmPanel } from '@/components/social/DmPanel';
import { FriendRequestOverlay } from '@/components/social/FriendRequestOverlay';
import { GameInviteOverlay } from '@/components/social/GameInviteOverlay';
import { SystemAnnounce } from '@/components/ui/SystemAnnounce';
import { FriendActiveToast } from '@/components/social/FriendActiveToast';
import { GiftReceivedAnimation } from '@/components/ui/GiftReceivedAnimation';
import { CoinShopModal } from '@/components/ui/CoinShopModal';
import { ShopSuccessModal } from '@/components/ui/ShopSuccessModal';
import { ModAlertPanel } from '@/components/ui/ModAlertPanel';
import { HermesToggle } from '@/components/hermes/HermesToggle';
import { HermesPanel } from '@/components/hermes/HermesPanel';
import { CheckersGame } from '@/components/checkers/CheckersGame';
import { JokerGame } from '@/components/joker/JokerGame';
import { LudoGame } from '@/components/ludo/LudoGame';
import { WWWGame } from '@/components/www/WWWGame';
import { UnoGame } from '@/components/uno/UnoGame';
import { VirtualSpace } from '@/components/space/VirtualSpace';
// Backrooms (3D horror mode) is lazy-loaded so Three.js stays out of the main bundle.
const Backrooms = lazy(() => import('@/components/backrooms/Backrooms'));
// Premium Worlds (flagship 3D social spaces) — also lazy-loaded.
const PremiumWorlds = lazy(() => import('@/components/worlds/PremiumWorlds'));
// Character Creator (3D avatar) — lazy-loaded.
// Premium world display names (kept here so the invite prompt doesn't pull the
// lazy worlds chunk into the main bundle).
const PREMIUM_WORLD_NAMES: Record<string, string> = { beach_camp: 'Beach Camp 3D' };
import { attachGlobalClickSounds, onSettingsChange } from '@/lib/audioEngine';
import { useSettingsStore } from '@/store/settingsStore';
import { socket } from '@/lib/socket';
import type { GiftReceivedNotification } from '@/types/index';
import { CLIENT_VERSION } from './version';
import { haptic } from '@/lib/haptics';
import { YourTurnToast } from '@/components/ui/YourTurnToast';
import { NotificationPrompt } from '@/components/ui/NotificationPrompt';
import { MediaPermissionPrimer } from '@/components/ui/MediaPermissionPrimer';
import { useVoiceChat } from '@/hooks/useVoiceChat';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import { PWAInstallBanner } from '@/components/ui/PWAInstallBanner';

// Version check: reload if server has newer build. Uses localStorage with 10-min TTL
// so iOS PWA app-restore-from-memory still re-checks (sessionStorage would persist there).
const _verCheckedAt = parseInt(localStorage.getItem('_vm_v_checked_at') ?? '0', 10);
if (Date.now() - _verCheckedAt > 10 * 60 * 1000) {
  fetch('/api/version')
    .then(r => r.json())
    .then((d: { build?: string }) => {
      localStorage.setItem('_vm_v_checked_at', String(Date.now()));
      if (d.build && d.build !== CLIENT_VERSION) {
        window.location.replace(window.location.href.split('?')[0] + '?v=' + d.build);
      }
    })
    .catch(() => { localStorage.setItem('_vm_v_checked_at', String(Date.now())); });
}

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
    <div className="fixed left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none" style={{ bottom: 'calc(108px + env(safe-area-inset-bottom, 0px))' }}>
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

const TOAST_MS = 5000;

function DmToastNotification() {
  const { dmToast, clearDmToast, openDmWith } = useSocialStore();
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!dmToast) { setProgress(100); return; }
    setProgress(100);
    const start = Date.now();
    const tick = setInterval(() => {
      const pct = Math.max(0, 100 - ((Date.now() - start) / TOAST_MS) * 100);
      setProgress(pct);
    }, 50);
    const id = setTimeout(() => { clearDmToast(); clearInterval(tick); }, TOAST_MS);
    return () => { clearTimeout(id); clearInterval(tick); };
  }, [dmToast, clearDmToast]);

  return (
    <AnimatePresence>
      {dmToast && (
        <motion.div
          key="dm-toast"
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="fixed top-4 left-3 right-3 z-[200] cursor-pointer"
          style={{ maxWidth: '360px', margin: '0 auto' }}
          onClick={() => { openDmWith((dmToast as DmToastData).senderUserId); clearDmToast(); }}
        >
          <div
            className="rounded-2xl overflow-hidden backdrop-blur-2xl"
            style={{
              background: 'rgba(8,4,22,0.97)',
              border: '1px solid rgba(168,85,247,0.4)',
              boxShadow: '0 0 32px rgba(168,85,247,0.15), 0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <div className="flex items-center gap-3 px-3 py-3">
              {/* Avatar */}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #ff0080, #8a2be2)' }}
              >
                {(dmToast as DmToastData).senderAvatar}
              </div>
              {/* Text */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1.5 mb-0.5">
                  <span className="text-[12px] font-mono uppercase tracking-widest" style={{ color: 'rgba(192,132,252,0.55)' }}>
                    💬 ახალი მესიჯი
                  </span>
                  <span className="text-[10px] font-mono" style={{ color: 'rgba(0,229,255,0.5)' }}>
                    გახსნა →
                  </span>
                </div>
                <p className="font-display text-sm font-bold text-white/90 truncate leading-tight">
                  {(dmToast as DmToastData).senderUsername}
                </p>
                <p className="font-mono text-[11px] truncate mt-0.5 leading-snug" style={{ color: 'rgba(255,255,255,0.40)' }}>
                  {(dmToast as DmToastData).preview}
                </p>
              </div>
              {/* Close */}
              <button
                onClick={e => { e.stopPropagation(); clearDmToast(); }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-white/20 hover:text-white/60 hover:bg-white/8 transition-all flex-shrink-0"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            {/* Progress bar */}
            <div className="h-0.5 w-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <motion.div
                className="h-full"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #a855f7, #ec4899)',
                  transition: 'width 50ms linear',
                }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RoomInviteToast() {
  const { inviteToast, clearInviteToast } = useSocialStore();
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!inviteToast) { setProgress(100); return; }
    setProgress(100);
    const start = Date.now();
    const tick = setInterval(() => {
      const pct = Math.max(0, 100 - ((Date.now() - start) / TOAST_MS) * 100);
      setProgress(pct);
    }, 50);
    const id = setTimeout(() => { clearInviteToast(); clearInterval(tick); }, TOAST_MS);
    return () => { clearTimeout(id); clearInterval(tick); };
  }, [inviteToast, clearInviteToast]);

  const handleJoin = () => {
    if (!inviteToast) return;
    const code = inviteToast.roomCode;
    const name = useAuthStore.getState().profile?.username ?? 'Player';
    clearInviteToast();
    // Use the store's joinRoom so the room state is actually set (entering the room).
    useGameStore.getState().joinRoom(code, name).catch(() => {});
  };

  return (
    <AnimatePresence>
      {inviteToast && (
        <motion.div
          key="invite-toast"
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="fixed top-4 left-3 right-3 z-[201]"
          style={{ maxWidth: '360px', margin: '0 auto' }}
        >
          <div
            className="rounded-2xl overflow-hidden backdrop-blur-2xl"
            style={{
              background: 'rgba(8,4,22,0.97)',
              border: '1px solid rgba(250,204,21,0.35)',
              boxShadow: '0 0 32px rgba(250,204,21,0.12), 0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <div className="flex items-center gap-3 px-3 py-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #78350f)' }}
              >
                {inviteToast.inviterAvatar.length > 2 ? '♛' : inviteToast.inviterAvatar}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="text-[11px] font-mono uppercase tracking-widest" style={{ color: 'rgba(250,204,21,0.5)' }}>
                    Room Invite
                  </span>
                </div>
                <p className="font-display text-sm font-bold text-white/90 truncate leading-tight">
                  {inviteToast.inviterName}
                </p>
                <p className="font-mono text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.40)' }}>
                  {inviteToast.playerCount}/{inviteToast.maxPlayers} players · {inviteToast.roomCode}
                </p>
              </div>
              <button
                onClick={handleJoin}
                className="px-3 py-1.5 rounded-lg text-[12px] font-mono font-bold shrink-0 transition-all active:scale-95"
                style={{ background: 'rgba(250,204,21,0.15)', border: '1px solid rgba(250,204,21,0.35)', color: 'rgba(250,204,21,0.9)' }}
              >
                Join
              </button>
              <button
                onClick={e => { e.stopPropagation(); clearInviteToast(); }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-white/20 hover:text-white/60 hover:bg-white/8 transition-all flex-shrink-0"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="h-0.5 w-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <motion.div
                className="h-full"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                  transition: 'width 50ms linear',
                }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const NAV_ORDER: NavTab[] = ['community', 'games', 'clans', 'rooms', 'leaderboard', 'profile'];

function PageTransition({ children, direction }: { children: React.ReactNode; direction: 1 | -1 }) {
  return (
    <motion.div
      initial={{ x: direction * 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: direction * -40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 36, mass: 0.7 }}
      style={{ willChange: 'transform, opacity' }}
    >
      {children}
    </motion.div>
  );
}

function MainApp({ onOpenShop }: { onOpenShop: () => void }) {
  const [page, setPage] = useState<NavTab>('community');
  const [direction, setDirection] = useState<1 | -1>(1);
  const [initialReplayId, setInitialReplayId] = useState<string | undefined>(undefined);
  const profile = useAuthStore(s => s.profile);
  const isMod   = profile?.isModerator ?? false;
  const isOwner = profile?.moderatorLevel === 'owner';
  const { openDmList, openMoreMenu } = useSocialStore();
  const checkersMatch = useCheckersStore(s => s.match);
  const ludoMatch     = useLudoStore(s => s.match);
  const jokerMatch    = useJokerStore(s => s.match);
  const wwwMatch      = useWWWStore(s => s.match);
  const unoMatch      = useUnoStore(s => s.match);
  const inGame = !!(checkersMatch || ludoMatch || jokerMatch || wwwMatch || unoMatch);
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [spaceCode, setSpaceCode] = useState<string | null>(null);
  const [backroomsOpen, setBackroomsOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [premiumWorldId, setPremiumWorldId] = useState<string | null>(null);
  const [worldInvite, setWorldInvite] = useState<{ worldId: string; fromName: string } | null>(null);
  const [spaceInvite, setSpaceInvite] = useState<{ spaceId: string; code: string; name: string; icon: string; fromName: string } | null>(null);
  const [modOpen, setModOpen] = useState(false);

  // Deep link: voidmafia.one/lounge/CODE → open that space directly.
  useEffect(() => {
    const m = window.location.pathname.match(/^\/lounge\/([A-Za-z0-9-]+)/);
    if (m) {
      setSpaceCode(m[1].toUpperCase());
      setSpaceOpen(true);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // Seed my own equipped name color into the app-wide resolver so it shows
  // everywhere immediately (no fetch flash) and updates when I re-equip.
  useEffect(() => {
    if (profile?.id) useNameColorStore.getState().setLocal(profile.id, profile.cosmetics?.equippedNameColor ?? null);
  }, [profile?.id, profile?.cosmetics?.equippedNameColor]);


  // Incoming space invite → strict centered overlay (Accept / Reject).
  useEffect(() => {
    const onInvited = (data: { spaceId: string; code: string; name: string; icon: string; fromName: string }) => {
      setSpaceInvite(data);
    };
    (socket as any).on('space:invited', onInvited);
    const onWorldInvited = (data: { worldId: string; fromName: string }) => setWorldInvite(data);
    (socket as any).on('world:invited', onWorldInvited);
    return () => { (socket as any).off('space:invited', onInvited); (socket as any).off('world:invited', onWorldInvited); };
  }, []);

  // Presence "Join" → open the requested lounge by code from anywhere.
  const loungeJoinCode = useSocialStore(s => s.loungeJoinCode);
  const clearLoungeJoin = useSocialStore(s => s.clearLoungeJoin);
  useEffect(() => {
    if (!loungeJoinCode) return;
    setSpaceCode(loungeJoinCode.toUpperCase());
    setSpaceOpen(true);
    clearLoungeJoin();
  }, [loungeJoinCode, clearLoungeJoin]);

  // @virtual-space mention → open VS lobby from anywhere.
  const openSpaceRequested = useSocialStore(s => s.openSpaceRequested);
  const clearOpenSpace = useSocialStore(s => s.clearOpenSpace);
  useEffect(() => {
    if (!openSpaceRequested) return;
    setSpaceOpen(true);
    clearOpenSpace();
  }, [openSpaceRequested, clearOpenSpace]);

  // Auto-dismiss the invite after 15 seconds if unanswered.
  useEffect(() => {
    if (!spaceInvite) return;
    const t = setTimeout(() => setSpaceInvite(null), 15000);
    return () => clearTimeout(t);
  }, [spaceInvite]);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swipeLocked = useRef(false);

  const navigate = useCallback((tab: NavTab) => {
    const from = NAV_ORDER.indexOf(page);
    const to   = NAV_ORDER.indexOf(tab);
    setDirection(to >= from ? 1 : -1);
    if (tab !== 'replays') setInitialReplayId(undefined);
    setPage(tab);
  }, [page]);

  function navigateToReplay(gameId: string) {
    setInitialReplayId(gameId);
    setDirection(1);
    setPage('replays');
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swipeLocked.current = false;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (swipeLocked.current || inGame || page === 'community' || page === 'economy') return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.7) return;
    const idx = NAV_ORDER.indexOf(page);
    if (dx < 0 && idx < NAV_ORDER.length - 1) {
      haptic('selection');
      navigate(NAV_ORDER[idx + 1]!);
    } else if (dx > 0 && idx > 0) {
      haptic('selection');
      navigate(NAV_ORDER[idx - 1]!);
    }
  }

  return (
    <div
      className="min-h-screen vm-main-pb"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Install banner — rooms tab only, outside AnimatePresence so it vanishes instantly on tab change */}
      {page === 'rooms' && <PWAInstallBanner />}
      <AnimatePresence mode="wait">
        {page === 'rooms'       && <PageTransition key="rooms"        direction={direction}><RoomsPage /></PageTransition>}
        {page === 'games'       && <PageTransition key="games"        direction={direction}><GamesPage onOpenSpace={() => setSpaceOpen(true)} onOpenBackrooms={() => setBackroomsOpen(true)} onOpenPremium={() => setPremiumOpen(true)} /></PageTransition>}
        {page === 'community'   && <PageTransition key="community"    direction={direction}><CommunityPage /></PageTransition>}
        {page === 'clans'       && <PageTransition key="clans"        direction={direction}><ClansPage /></PageTransition>}
        {page === 'replays'     && <PageTransition key={`replays-${initialReplayId ?? ''}`} direction={direction}><ReplaysPage initialReplayId={initialReplayId} /></PageTransition>}
        {page === 'leaderboard' && <PageTransition key="leaderboard"  direction={direction}><LeaderboardPage onBack={() => navigate('rooms')} /></PageTransition>}
        {page === 'profile'     && <PageTransition key="profile"      direction={direction}><ProfilePage onViewReplay={navigateToReplay} /></PageTransition>}
{page === 'economy' && isOwner && <PageTransition key="economy" direction={direction}><EconomyAdminPage /></PageTransition>}
      </AnimatePresence>
      {!inGame && <BottomNav active={page} isMod={isMod} onChange={tab => navigate(tab)} onMoreClick={openMoreMenu} />}

      {/* Game overlays — rendered outside PageTransition so fixed inset-0 works correctly */}
      <AnimatePresence>{checkersMatch && <CheckersGame />}</AnimatePresence>
      <AnimatePresence>{jokerMatch    && <JokerGame />}</AnimatePresence>
      <AnimatePresence>{ludoMatch     && <LudoGame />}</AnimatePresence>
      <AnimatePresence>{wwwMatch      && <WWWGame />}</AnimatePresence>
      <AnimatePresence>{unoMatch      && <UnoGame />}</AnimatePresence>
      <AnimatePresence>{spaceOpen    && <VirtualSpace initialSpaceCode={spaceCode} onClose={() => { setSpaceOpen(false); setSpaceCode(null); }} />}</AnimatePresence>
      {backroomsOpen && (
        <Suspense fallback={<div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,245,210,0.6)', fontFamily: 'monospace', letterSpacing: 3, fontSize: 13 }}>ჩატვირთვა…</div>}>
          <Backrooms onClose={() => setBackroomsOpen(false)} />
        </Suspense>
      )}
      {premiumOpen && (
        <Suspense fallback={<div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#05060d', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(233,213,255,0.6)', fontFamily: 'monospace', letterSpacing: 3, fontSize: 13 }}>ჩატვირთვა…</div>}>
          <PremiumWorlds initialWorldId={premiumWorldId} onClose={() => { setPremiumOpen(false); setPremiumWorldId(null); }} />
        </Suspense>
      )}
      {worldInvite && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 2900, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 'min(320px,86vw)', borderRadius: 20, padding: '24px 20px', background: 'rgba(14,10,26,0.98)', border: '1px solid rgba(192,132,252,0.35)', textAlign: 'center', boxShadow: '0 16px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: 40, marginBottom: 6 }}>✨</div>
            <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 15, color: '#fff', marginBottom: 4 }}><b style={{ color: '#c084fc' }}>{worldInvite.fromName}</b> გიწვევს</p>
            <p style={{ fontFamily: 'monospace', fontSize: 13, color: '#c084fc', marginBottom: 20 }}>{PREMIUM_WORLD_NAMES[worldInvite.worldId] ?? 'Premium World'}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { const inv = worldInvite; setWorldInvite(null); setPremiumWorldId(inv.worldId); setPremiumOpen(true); }}
                style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#fff', background: 'linear-gradient(135deg,#7c3aed,#c026d3)' }}>შესვლა</button>
              <button onClick={() => setWorldInvite(null)}
                style={{ flex: 1, padding: '11px 0', borderRadius: 12, fontFamily: 'monospace', fontWeight: 700, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}>არა</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Space invite — strict centered overlay (auto-dismiss after 15s) */}
      {spaceInvite && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 2900, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 26 }}
            style={{ width: 'min(340px, 100%)', background: 'rgba(10,4,26,0.99)', border: '1px solid rgba(155,0,255,0.4)', borderRadius: 22, padding: '24px 20px', textAlign: 'center', boxShadow: '0 24px 70px rgba(0,0,0,0.7), 0 0 40px rgba(155,0,255,0.15)', overflow: 'hidden', position: 'relative' }}
          >
            {/* 15s countdown bar */}
            <motion.div initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: 15, ease: 'linear' }}
              style={{ position: 'absolute', top: 0, left: 0, height: 3, background: 'linear-gradient(90deg,#9b00ff,#00e5ff)' }} />
            <div style={{ fontSize: 40, marginBottom: 6 }}>{spaceInvite.icon}</div>
            <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>✦ Space Invite</p>
            <p style={{ fontFamily: '"Space Grotesk",sans-serif', fontWeight: 700, fontSize: 16, color: 'white', lineHeight: 1.3 }}>
              <b>{spaceInvite.fromName}</b> გიწვევს
            </p>
            <p style={{ fontFamily: 'monospace', fontSize: 13, color: '#c084fc', marginBottom: 20 }}>{spaceInvite.name}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setSpaceInvite(null)}
                style={{ flex: 1, padding: '13px', borderRadius: 14, fontFamily: 'monospace', fontSize: 14, background: 'rgba(255,45,85,0.12)', border: '1px solid rgba(255,45,85,0.4)', color: '#ff2d55', cursor: 'pointer' }}>✕ Reject</button>
              <button onClick={() => { const inv = spaceInvite; setSpaceInvite(null); setSpaceCode(inv.code); setSpaceOpen(true); }}
                style={{ flex: 1, padding: '13px', borderRadius: 14, fontFamily: 'monospace', fontSize: 14, fontWeight: 700, background: 'rgba(0,255,136,0.16)', border: '1px solid rgba(0,255,136,0.45)', color: '#00ff88', cursor: 'pointer' }}>✓ Accept</button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
      <MorePanel
        isOwner={isOwner}
        isMod={isMod}
        onEconomyClick={() => { setDirection(1); setPage('economy'); }}
        onShopClick={onOpenShop}
        onReplaysClick={() => { setInitialReplayId(undefined); setDirection(1); setPage('replays'); }}
        onClansClick={() => navigate('clans')}
        onLeaderboardClick={() => navigate('leaderboard')}
        onMessagesClick={openDmList}
        onModClick={() => setModOpen(true)}
      />
      {isMod && <ModPanel open={modOpen} onClose={() => setModOpen(false)} />}
      <YourTurnToast />
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
        <p className="font-mono text-[12px] text-white/25">Your session is being restored</p>
      </div>
    </motion.div>
  );
}

function ResumingSplash({ subtitle }: { subtitle?: string }) {
  return (
    <div
      className="fixed inset-0 z-[500] flex flex-col items-center justify-center gap-5"
      style={{ background: '#03000d' }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 45% at 50% 50%, rgba(0,229,255,0.07) 0%, transparent 65%)' }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative flex flex-col items-center gap-4"
      >
        {/* Logo icon */}
        <motion.div
          animate={{ boxShadow: ['0 0 28px rgba(0,229,255,0.10)', '0 0 52px rgba(0,229,255,0.22)', '0 0 28px rgba(0,229,255,0.10)'] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl"
          style={{
            background: 'linear-gradient(135deg, rgba(0,229,255,0.10), rgba(155,0,255,0.08))',
            border: '1px solid rgba(0,229,255,0.22)',
          }}
        >
          🎭
        </motion.div>

        {/* Title */}
        <p
          className="font-display text-2xl font-black tracking-[0.25em] uppercase"
          style={{ color: 'rgba(255,255,255,0.92)', textShadow: '0 0 24px rgba(0,229,255,0.35)' }}
        >
          VOID MAFIA
        </p>

        {/* Subtitle / spinner */}
        <div className="flex items-center gap-2.5 mt-1">
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            className="w-1 h-1 rounded-full bg-neon-cyan/70"
          />
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
            className="w-1 h-1 rounded-full bg-neon-cyan/70"
          />
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
            className="w-1 h-1 rounded-full bg-neon-cyan/70"
          />
          {subtitle && (
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/30 ml-1">
              {subtitle}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function Screen({ publicProfileId, onClearPublicProfile, onOpenShop }: { publicProfileId: number | null; onClearPublicProfile: () => void; onOpenShop: () => void }) {
  const isAuthed = useAuthStore(s => s.isAuthed);
  const uid      = useAuthStore(s => s.uid);
  const isReconnecting = useGameStore(s => s.isReconnecting);
  const room = useGameStore(s => s.room);

  // If uid is saved but auth hasn't completed yet (socket still connecting),
  // show the logo splash instead of rendering LoginPage — this prevents
  // the iOS/Android autofill sheet from appearing on every app open.
  const [authTimedOut, setAuthTimedOut] = useState(false);
  useEffect(() => {
    if (isAuthed || !uid || authTimedOut) return;
    const t = setTimeout(() => setAuthTimedOut(true), 9000);
    return () => clearTimeout(t);
  }, [isAuthed, uid, authTimedOut]);

  if (publicProfileId) {
    return <PublicProfilePage publicId={publicProfileId} onEnterApp={onClearPublicProfile} />;
  }

  // Returning to an in-progress game
  if (!room && isReconnecting && hasPendingSession()) {
    return <ResumingSplash subtitle="თამაშს უბრუნდები…" />;
  }

  // Saved session exists — wait for socket auth before showing login
  if (!isAuthed && uid && !authTimedOut) {
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
              <p className="text-white/40 text-[12px] font-mono uppercase tracking-widest mb-0.5">Category</p>
              <p className="text-white text-sm font-mono capitalize">{modNotice.category.replace(/_/g, ' ')}</p>
            </div>
          )}
          <div className={clsx('rounded-xl p-3 border', cfg.border)}>
            <p className="text-white/40 text-[12px] font-mono uppercase tracking-widest mb-0.5">Reason</p>
            <p className="text-white text-sm font-mono">{modNotice.reason || '—'}</p>
          </div>

          {modNotice.expiresAt && (
            <div className={clsx('rounded-xl p-3 border', cfg.border)}>
              <p className="text-white/40 text-[12px] font-mono uppercase tracking-widest mb-0.5">Expires</p>
              <p className="text-white text-sm font-mono">{formatExpiry(modNotice.expiresAt)}</p>
            </div>
          )}

          {modNotice.moderatorName && (
            <div className={clsx('rounded-xl p-3 border', cfg.border)}>
              <p className="text-white/40 text-[12px] font-mono uppercase tracking-widest mb-0.5">Moderator</p>
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
  const { awaitingMediaPrimer } = useVoiceChat();
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

    const unsubText = useSettingsStore.subscribe((s) => {
      document.documentElement.classList.toggle('large-text', s.largeText);
    });
    document.documentElement.classList.toggle('large-text', useSettingsStore.getState().largeText);

    return () => {
      unsub();
      unsubText();
    };
  }, [connect]);

  useEffect(() => {
    const handler = (data: GiftReceivedNotification) => setGiftNotif(data);
    socket.on('gifts:received' as any, handler);
    return () => { socket.off('gifts:received' as any, handler); };
  }, []);

  useEffect(() => {
    const handler = (data: { type: string; coins: number }) => {
      if (data.type === 'profile_complete') {
        useGameStore.getState().addToast(`🎉 +${data.coins} ქოინი! პროფილის სრულად შევსების ბონუსი`, 'success');
      }
    };
    socket.on('coin:bonus' as any, handler);
    return () => { socket.off('coin:bonus' as any, handler); };
  }, []);

  return (
    <>
      <ThemeProvider />
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
      <FriendRequestOverlay />
      <GameInviteOverlay />
      <SystemAnnounce />
      <FriendActiveToast />
      <DmToastNotification />
      <RoomInviteToast />
      <ModAlertPanel />
      <GiftReceivedAnimation notification={giftNotif} onDismiss={() => setGiftNotif(null)} />
      <CoinShopModal open={shopOpen} onClose={() => setShopOpen(false)} profileId={profile?.id ?? ''} />
      <ShopSuccessModal open={shopSuccess} onClose={() => setShopSuccess(false)} />
      {/* Hermes AI assistant — temporarily hidden until provider is stable */}
      {/* <HermesToggle /> */}
      {/* <HermesPanel /> */}
      <NotificationPrompt />
      <AnimatePresence>
        {awaitingMediaPrimer && <MediaPermissionPrimer />}
      </AnimatePresence>
    </>
  );
}
