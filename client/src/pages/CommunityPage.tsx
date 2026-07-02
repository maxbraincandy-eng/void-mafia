import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import { LoungesTab } from '@/components/community/LoungesTab';
import { FeedTabV2 } from '@/components/community/FeedTabV2';
import { RecommendsTab } from '@/components/community/RecommendsTab';
import { ThoughtsTab } from '@/components/community/ThoughtsTab';
import { PeopleTab } from '@/components/community/PeopleTab';
import { DebatesTab } from '@/components/community/DebatesTab';
import { ActivityTab } from '@/components/community/ActivityTab';
import { EventsTab } from '@/components/community/EventsTab';
import { CommunityLeaderboard } from '@/components/community/CommunityLeaderboard';
import { NotificationPanel } from '@/components/community/NotificationPanel';
import { ModerationPanel } from '@/components/community/ModerationPanel';
import AdminPanel from '@/components/community/AdminPanel';
import { CommunityProfilePage } from '@/components/community/CommunityProfilePage';
import { ProfileModalV2 } from '@/components/community/ProfileModalV2';
import { CommunitySearchPanel } from '@/components/community/CommunitySearchPanel';
import { useSocialStore } from '@/store/socialStore';

type CommunityTab = 'feed' | 'voice' | 'people' | 'games' | 'debates' | 'activity' | 'events' | 'leaderboard';

export function CommunityPage() {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const isMod = profile?.isModerator ?? false;
  const myModLevel = (profile as any)?.moderatorLevel ?? '';
  const isAdminOrAbove = ['moderator', 'senior_moderator', 'admin', 'owner'].includes(myModLevel);
  const [tab, setTab] = useState<CommunityTab>('feed');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showModeration, setShowModeration] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);  // quick popup
  const [fullProfileId, setFullProfileId] = useState<string | null>(null); // full-page profile
  const unreadCount = useCommunityStore(s => s.unreadCount);
  const fetchUnreadCount = useCommunityStore(s => s.fetchUnreadCount);
  const { openDmList, unreadDmCount } = useSocialStore(s => ({ openDmList: s.openDmList, unreadDmCount: s.unreadDmCount }));

  useEffect(() => {
    if (profile) fetchUnreadCount();
  }, [profile, fetchUnreadCount]);

  // Reveal a compact floating nav once the header/tabs scroll out of view, so
  // profile + tabs stay reachable without scrolling all the way back up.
  // The scroll container is #root (html/body are locked for iOS bounce), so an
  // IntersectionObserver on a sentinel is used instead of window scroll.
  const [scrolled, setScrolled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const scrollTop = () => {
    const root = document.getElementById('root');
    (root ?? window).scrollTo({ top: 0, behavior: 'smooth' });
  };
  const selectTab = (id: CommunityTab) => { setTab(id); scrollTop(); };

  const TABS: { id: CommunityTab; label: string; icon: string }[] = [
    { id: 'feed',        label: t.community.tabs.feed,     icon: '🌌' },
    { id: 'people',      label: t.community.tabs.people,   icon: '👥' },
    { id: 'events',      label: 'ივენთები',               icon: '📅' },
    { id: 'leaderboard', label: 'ლიდერი',                 icon: '🏆' },
    { id: 'voice',       label: t.community.tabs.voice,    icon: '🎤' },
    { id: 'debates',     label: t.community.tabs.debates,  icon: '⚔️' },
    { id: 'activity',    label: t.community.tabs.activity, icon: '🔥' },
  ];

  const renderTabs = (compact: boolean) => (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none" style={{ overflowX: 'auto' }}>
      {TABS.map(tb => {
        const active = tab === tb.id;
        return (
          <button
            key={tb.id}
            onClick={() => selectTab(tb.id)}
            className={`flex items-center gap-1.5 rounded-full font-mono uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 active:scale-95 ${compact ? 'px-3 py-1.5 text-[11px]' : 'px-3.5 py-2 text-[12px]'}`}
            style={{
              background: active ? 'var(--vm-tab-active-bg)' : 'var(--vm-tab-inactive-bg)',
              border: `1px solid ${active ? 'var(--vm-tab-active-border)' : 'var(--vm-tab-inactive-border)'}`,
              color: active ? 'var(--vm-tab-active-color)' : 'var(--vm-tab-inactive-color)',
            }}
          >
            <span>{tb.icon}</span>{tb.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen pb-20 relative overflow-hidden" style={{ background: 'var(--bg-main)' }}>
      <div className="absolute top-0 right-0 w-80 h-80 rounded-full blur-[120px] pointer-events-none" style={{ background: 'var(--vm-orb-1)' }} />
      <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full blur-[100px] pointer-events-none" style={{ background: 'var(--vm-orb-2)' }} />

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-8">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1
              className="font-display font-bold tracking-wide truncate"
              style={{
                fontSize: 'clamp(18px, 5vw, 24px)',
                background: 'var(--vm-community-gradient)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {t.community.header}
            </h1>
            <p className="font-mono text-[12px] text-white/35 mt-0.5 truncate">{t.community.tagline}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => setShowSearch(true)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all active:scale-90"
              style={{ background: 'var(--vm-btn-icon-bg)', border: '1px solid var(--vm-btn-icon-border)' }}
            >
              🔍
            </button>
            <button
              onClick={openDmList}
              className="relative w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{
                background: unreadDmCount > 0
                  ? 'linear-gradient(135deg, rgba(155,0,255,0.28), rgba(0,229,255,0.18))'
                  : 'linear-gradient(135deg, rgba(155,0,255,0.14), rgba(0,229,255,0.08))',
                border: unreadDmCount > 0 ? '1px solid rgba(200,130,255,0.55)' : '1px solid rgba(155,0,255,0.3)',
                boxShadow: unreadDmCount > 0 ? '0 0 14px rgba(155,0,255,0.35)' : '0 0 8px rgba(155,0,255,0.12)',
              }}
              title="Direct Messages"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ color: unreadDmCount > 0 ? 'rgba(230,200,255,0.95)' : 'rgba(210,170,255,0.75)' }}>
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                <circle cx="8.5" cy="11.5" r="0.5" fill="currentColor" />
                <circle cx="12" cy="11.5" r="0.5" fill="currentColor" />
                <circle cx="15.5" cy="11.5" r="0.5" fill="currentColor" />
              </svg>
              {unreadDmCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[17px] h-[17px] rounded-full bg-neon-pink text-[11px] font-bold text-white flex items-center justify-center px-1 leading-none animate-pulse"
                  style={{ boxShadow: '0 0 10px rgba(255,0,204,0.8)', border: '1.5px solid rgba(8,4,22,0.9)' }}
                >
                  {unreadDmCount > 9 ? '9+' : unreadDmCount}
                </span>
              )}
            </button>
            {isMod && (
              <button
                onClick={() => setShowModeration(true)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all active:scale-90"
                style={{ background: 'var(--vm-btn-icon-bg)', border: '1px solid var(--vm-btn-icon-border)' }}
              >
                🛡
              </button>
            )}
            {isAdminOrAbove && (
              <button
                onClick={() => setShowAdminPanel(true)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all active:scale-90"
                style={{ background: 'rgba(255,200,0,0.1)', border: '1px solid rgba(255,200,0,0.3)' }}
                title="Admin Panel"
              >
                ⚙
              </button>
            )}
            <button
              onClick={() => setShowNotifications(true)}
              className="relative w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all active:scale-90"
              style={{ background: 'var(--vm-notif-bg)', border: '1px solid var(--vm-notif-border)' }}
            >
              🔔
              {unreadCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-neon-pink text-[12px] font-bold text-white flex items-center justify-center"
                  style={{ boxShadow: '0 0 8px rgba(255,0,204,0.6)' }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="pb-1 mb-5 -mx-1 px-1">
          {renderTabs(false)}
        </div>

        {/* Sentinel: when it scrolls out of view, the floating nav appears. */}
        <div ref={sentinelRef} style={{ height: 1 }} />

        <AnimatePresence mode="wait">
          {fullProfileId ? (
            <motion.div
              key={`profile-${fullProfileId}`}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.18 }}
            >
              <CommunityProfilePage
                profileId={fullProfileId}
                onBack={() => setFullProfileId(null)}
                onNavigate={id => setFullProfileId(id)}
              />
            </motion.div>
          ) : (
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              {tab === 'feed'     && <FeedTabV2 onOpenProfile={setViewProfileId} onOpenMyProfile={() => profile && setFullProfileId(profile.id)} />}
              {tab === 'voice'    && <LoungesTab onOpenProfile={setViewProfileId} />}
              {tab === 'people'   && <PeopleTab onOpenProfile={setViewProfileId} />}
              {tab === 'debates'  && <DebatesTab />}
              {tab === 'activity' && <ActivityTab onOpenProfile={setViewProfileId} />}
              {tab === 'events' && <EventsTab />}
              {tab === 'leaderboard' && <CommunityLeaderboard />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating compact nav — slides in when the header scrolls away so the
          profile + tabs stay reachable. Portaled to <body> so it stays fixed to
          the viewport regardless of the page-transition transform. */}
      {createPortal(
        <AnimatePresence>
          {scrolled && !fullProfileId && (
            <motion.div
              initial={{ y: -64, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -64, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed top-0 left-0 right-0 z-40"
              style={{ background: 'rgba(8,4,22,0.82)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(155,0,255,0.18)', paddingTop: 'env(safe-area-inset-top)' }}
            >
              <div className="max-w-lg mx-auto px-3 flex items-center gap-2" style={{ height: 52 }}>
                <button
                  onClick={() => profile && setFullProfileId(profile.id)}
                  className="flex-shrink-0 active:scale-90 transition-transform"
                  title={t.community.tabs.feed}
                >
                  {profile?.avatarUrl
                    ? <img src={profile.avatarUrl} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.15)' }} />
                    : <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, background: 'linear-gradient(135deg,rgba(255,0,128,.5),rgba(138,43,226,.5))' }}>{profile?.avatar ?? '👤'}</div>}
                </button>
                <div className="flex-1 min-w-0">{renderTabs(true)}</div>
                <button
                  onClick={scrollTop}
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-all"
                  style={{ background: 'var(--vm-btn-icon-bg)', border: '1px solid var(--vm-btn-icon-border)', color: 'rgba(255,255,255,0.6)' }}
                  title="Up"
                >
                  ↑
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <AnimatePresence>
        {showNotifications && <NotificationPanel onClose={() => setShowNotifications(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showModeration && <ModerationPanel onClose={() => setShowModeration(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showAdminPanel && (
          <AdminPanel
            onClose={() => setShowAdminPanel(false)}
            myModLevel={myModLevel}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showSearch && (
          <CommunitySearchPanel
            onClose={() => setShowSearch(false)}
            onOpenProfile={id => { setViewProfileId(id); setShowSearch(false); }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {viewProfileId && !fullProfileId && (
          <ProfileModalV2
            profileId={viewProfileId}
            onClose={() => setViewProfileId(null)}
            onOpenFullProfile={() => {
              const id = viewProfileId;
              setViewProfileId(null);
              setFullProfileId(id);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
