import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useCommunityStore } from '@/store/communityStore';
import { Avatar, Spinner, timeAgo } from '@/components/community/shared';
import type { CommunityNotification } from '@/types/index';

type Tab = 'all' | 'reactions' | 'comments' | 'follows' | 'system';

const TAB_TYPES: Record<Tab, string[] | null> = {
  all: null,
  reactions: ['post_reaction', 'comment_reaction', 'story_reaction'],
  comments: ['comment', 'comment_reply', 'mention'],
  follows: ['new_follower'],
  system: ['leaderboard_reward', 'system', 'broadcast'],
};

function getNotifIcon(type: string): string {
  switch (type) {
    case 'post_reaction':
    case 'comment_reaction':
    case 'story_reaction': return '';
    case 'comment':
    case 'comment_reply': return '💬';
    case 'mention': return '@';
    case 'new_follower': return '👤';
    case 'leaderboard_reward': return '🏆';
    default: return '🔔';
  }
}

function getNotifAccent(type: string): string {
  switch (type) {
    case 'post_reaction':
    case 'comment_reaction':
    case 'story_reaction': return 'rgba(255,100,50,0.15)';
    case 'comment':
    case 'comment_reply': return 'rgba(0,200,255,0.12)';
    case 'mention': return 'rgba(0,245,255,0.12)';
    case 'new_follower': return 'rgba(155,0,255,0.12)';
    case 'leaderboard_reward': return 'rgba(255,200,0,0.12)';
    default: return 'rgba(255,255,255,0.04)';
  }
}

function NotifRow({
  n,
  onTapPost,
  onTapProfile,
}: {
  n: CommunityNotification;
  onTapPost?: (postId: string) => void;
  onTapProfile?: (profileId: string) => void;
}) {
  const icon = getNotifIcon(n.type);
  const hasAvatar = !!n.actorAvatarUrl || !!n.actorId;
  const isClickable = !!n.postId || !!n.actorId;

  const handleTap = () => {
    if (n.postId && onTapPost) onTapPost(n.postId);
    else if (n.actorId && onTapProfile) onTapProfile(n.actorId);
  };

  return (
    <button
      onClick={isClickable ? handleTap : undefined}
      disabled={!isClickable}
      className="w-full flex items-start gap-3 px-4 py-3 text-left transition-all active:bg-white/5"
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: n.read ? 'transparent' : getNotifAccent(n.type),
        cursor: isClickable ? 'pointer' : 'default',
      }}
    >
      {/* Avatar or icon */}
      <div className="flex-shrink-0 mt-0.5">
        {hasAvatar && n.actorAvatarUrl ? (
          <div className="w-10 h-10 rounded-full overflow-hidden" style={{ border: '2px solid rgba(155,0,255,0.3)' }}>
            <img src={n.actorAvatarUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(155,0,255,0.15)', border: '1px solid rgba(155,0,255,0.25)', fontSize: 18 }}
          >
            {icon || '🔔'}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-white/90 leading-snug">
              {icon && <span className="mr-1">{icon}</span>}
              <span className="font-semibold">{n.title}</span>
            </p>
            <p className="text-[12px] text-white/50 leading-snug mt-0.5 line-clamp-2">{n.body}</p>
          </div>
          {!n.read && (
            <span className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ background: '#9b00ff', boxShadow: '0 0 6px rgba(155,0,255,0.6)' }} />
          )}
        </div>
        <p className="text-[11px] text-white/25 mt-1 font-mono">{timeAgo(n.createdAt)}</p>
      </div>

      {/* Arrow for clickable */}
      {isClickable && (
        <span className="text-white/15 text-[12px] mt-2 flex-shrink-0">›</span>
      )}
    </button>
  );
}

export function NotificationPanel({
  onClose,
  onOpenPost,
  onOpenProfile,
}: {
  onClose: () => void;
  onOpenPost?: (postId: string) => void;
  onOpenProfile?: (profileId: string) => void;
}): JSX.Element {
  const t = useT();
  const { notifications, fetchNotifications, markNotificationsRead } = useCommunityStore();
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [tab, setTab] = useState<Tab>('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchNotifications();
      setLoading(false);
    })();
  }, [fetchNotifications]);

  async function handleMarkAllRead() {
    setMarking(true);
    try { await markNotificationsRead(); } finally { setMarking(false); }
  }

  const sorted = [...notifications].sort((a, b) => b.createdAt - a.createdAt);
  const allowedTypes = TAB_TYPES[tab];
  const filtered = allowedTypes ? sorted.filter(n => allowedTypes.includes(n.type)) : sorted;
  const unreadCount = sorted.filter(n => !n.read).length;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'all', label: 'ყველა', icon: '🔔' },
    { id: 'reactions', label: 'რეაქცია', icon: '❤️' },
    { id: 'comments', label: 'კომენტარი', icon: '💬' },
    { id: 'follows', label: 'მიმდევრები', icon: '👤' },
    { id: 'system', label: 'სისტემა', icon: '⚙' },
  ];

  const handleTapPost = (postId: string) => {
    onClose();
    onOpenPost?.(postId);
  };

  const handleTapProfile = (profileId: string) => {
    onClose();
    onOpenProfile?.(profileId);
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        className="absolute bottom-0 left-0 right-0 flex flex-col rounded-t-2xl overflow-hidden"
        style={{
          maxHeight: '88vh',
          background: 'linear-gradient(180deg, #120d24 0%, #0a0715 100%)',
          border: '1px solid rgba(155,0,255,0.18)',
          borderBottom: 'none',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-bold text-white text-lg">{t.community.notifications.title}</h3>
            {unreadCount > 0 && (
              <span
                className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center"
                style={{ background: 'rgba(155,0,255,0.35)', color: '#c084fc' }}
              >
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={marking}
                className="px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
                style={{ background: 'rgba(155,0,255,0.12)', border: '1px solid rgba(155,0,255,0.3)', color: '#c084fc' }}
              >
                {marking ? '...' : '✓ წაკითხვა'}
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-opacity active:opacity-60"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>✕</span>
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex px-2 pb-2 gap-1 flex-shrink-0 overflow-x-auto" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {tabs.map(tb => {
            const active = tab === tb.id;
            const count = tb.id === 'all' ? sorted.length : sorted.filter(n => TAB_TYPES[tb.id]!.includes(n.type)).length;
            return (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                className="flex items-center gap-1 px-3 py-2 rounded-lg font-mono transition-all active:scale-95 flex-shrink-0"
                style={{
                  fontSize: 11,
                  background: active ? 'rgba(155,0,255,0.2)' : 'transparent',
                  color: active ? '#c084fc' : 'rgba(255,255,255,0.4)',
                  border: active ? '1px solid rgba(155,0,255,0.3)' : '1px solid transparent',
                }}
              >
                <span style={{ fontSize: 13 }}>{tb.icon}</span>
                <span>{tb.label}</span>
                {count > 0 && (
                  <span className="text-white/20" style={{ fontSize: 10 }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="py-16 flex justify-center"><Spinner color="#9b00ff" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2">
              <span style={{ fontSize: 32, opacity: 0.3 }}>🔔</span>
              <p className="font-mono text-white/25 text-sm">
                {tab === 'all' ? t.community.notifications.empty : 'ამ კატეგორიაში შეტყობინება არ არის'}
              </p>
            </div>
          ) : (
            filtered.map(n => (
              <NotifRow
                key={n.id}
                n={n}
                onTapPost={handleTapPost}
                onTapProfile={handleTapProfile}
              />
            ))
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
