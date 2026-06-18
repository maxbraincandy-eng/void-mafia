import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import { LoungesTab } from '@/components/community/LoungesTab';
import { FeedTabV2 } from '@/components/community/FeedTabV2';
import { RecommendsTab } from '@/components/community/RecommendsTab';
import { ThoughtsTab } from '@/components/community/ThoughtsTab';
import { PeopleTab } from '@/components/community/PeopleTab';
import { GamesTab } from '@/components/community/GamesTab';
import { DebatesTab } from '@/components/community/DebatesTab';
import { ActivityTab } from '@/components/community/ActivityTab';
import { NotificationPanel } from '@/components/community/NotificationPanel';
import { ModerationPanel } from '@/components/community/ModerationPanel';
import AdminPanel from '@/components/community/AdminPanel';
import { ProfileModalV2 } from '@/components/community/ProfileModalV2';
import { CommunitySearchPanel } from '@/components/community/CommunitySearchPanel';

type CommunityTab = 'feed' | 'voice' | 'people' | 'games' | 'debates' | 'activity';

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
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);
  const unreadCount = useCommunityStore(s => s.unreadCount);
  const fetchUnreadCount = useCommunityStore(s => s.fetchUnreadCount);

  useEffect(() => {
    if (profile) fetchUnreadCount();
  }, [profile, fetchUnreadCount]);

  const TABS: { id: CommunityTab; label: string; icon: string }[] = [
    { id: 'feed',     label: t.community.tabs.feed,     icon: '🌌' },
    { id: 'voice',    label: t.community.tabs.voice,    icon: '🎤' },
    { id: 'debates',  label: t.community.tabs.debates,  icon: '⚔️' },
    { id: 'games',    label: t.community.tabs.games,    icon: '♟' },
    { id: 'people',   label: t.community.tabs.people,   icon: '👥' },
    { id: 'activity', label: t.community.tabs.activity, icon: '🔥' },
  ];

  return (
    <div className="min-h-screen pb-20 relative overflow-hidden" style={{ background: '#03000d' }}>
      <div className="absolute top-0 right-0 w-80 h-80 rounded-full blur-[120px] pointer-events-none" style={{ background: 'rgba(155,0,255,0.10)' }} />
      <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full blur-[100px] pointer-events-none" style={{ background: 'rgba(0,245,255,0.08)' }} />

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-8">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1
              className="font-display text-2xl font-bold tracking-wide"
              style={{
                background: 'linear-gradient(135deg, #c084fc, #00f5ff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {t.community.header}
            </h1>
            <p className="font-mono text-[10px] text-white/35 mt-0.5">{t.community.tagline}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowSearch(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-base transition-all active:scale-90"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              🔍
            </button>
            {isMod && (
              <button
                onClick={() => setShowModeration(true)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-base transition-all active:scale-90"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                🛡
              </button>
            )}
            {isAdminOrAbove && (
              <button
                onClick={() => setShowAdminPanel(true)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-base transition-all active:scale-90"
                style={{ background: 'rgba(255,200,0,0.1)', border: '1px solid rgba(255,200,0,0.3)' }}
                title="Admin Panel"
              >
                ⚙
              </button>
            )}
            <button
              onClick={() => setShowNotifications(true)}
              className="relative w-9 h-9 rounded-full flex items-center justify-center text-base transition-all active:scale-90"
              style={{ background: 'rgba(155,0,255,0.1)', border: '1px solid rgba(155,0,255,0.3)' }}
            >
              🔔
              {unreadCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-neon-pink text-[8px] font-bold text-white flex items-center justify-center"
                  style={{ boxShadow: '0 0 8px rgba(255,0,204,0.6)' }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-5 -mx-1 px-1 scrollbar-none">
          {TABS.map(tb => {
            const active = tab === tb.id;
            return (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full font-mono text-[10px] uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 active:scale-95"
                style={{
                  background: active ? 'linear-gradient(135deg, rgba(155,0,255,0.28), rgba(0,245,255,0.16))' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${active ? 'rgba(155,0,255,0.45)' : 'rgba(255,255,255,0.08)'}`,
                  color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                }}
              >
                <span>{tb.icon}</span>{tb.label}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {tab === 'feed'     && <FeedTabV2 onOpenProfile={setViewProfileId} />}
            {tab === 'voice'    && <LoungesTab onOpenProfile={setViewProfileId} />}
            {tab === 'people'   && <PeopleTab onOpenProfile={setViewProfileId} />}
            {tab === 'games'    && <GamesTab />}
            {tab === 'debates'  && <DebatesTab />}
            {tab === 'activity' && <ActivityTab onOpenProfile={setViewProfileId} />}
          </motion.div>
        </AnimatePresence>
      </div>

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
        {viewProfileId && <ProfileModalV2 profileId={viewProfileId} onClose={() => setViewProfileId(null)} />}
      </AnimatePresence>
    </div>
  );
}
