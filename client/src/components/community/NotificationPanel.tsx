import { useState, useEffect, useMemo } from 'react';
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

const GROUPABLE_TYPES = new Set([
  'post_reaction', 'comment_reaction', 'story_reaction',
  'comment', 'comment_reply', 'new_follower',
]);

interface GroupedNotif {
  key: string;
  type: string;
  items: CommunityNotification[];
  count: number;
  latestAt: number;
  actors: { id?: string | null; avatarUrl?: string | null }[];
  postId?: string | null;
  read: boolean;
  title: string;
  body: string;
}

function groupKey(n: CommunityNotification): string {
  if (n.type === 'new_follower') return 'new_follower';
  if (GROUPABLE_TYPES.has(n.type) && n.postId) return `${n.type}:${n.postId}`;
  return `single:${n.id}`;
}

function groupTitle(type: string, count: number, firstTitle: string): string {
  if (count === 1) return firstTitle;
  switch (type) {
    case 'post_reaction': return `${count} ადამიანმა მოიწონა თქვენი პოსტი`;
    case 'comment_reaction': return `${count} ადამიანმა მოიწონა თქვენი კომენტარი`;
    case 'story_reaction': return `${count} ადამიანმა მოიწონა თქვენი სტორი`;
    case 'comment': return `${count} ახალი კომენტარი თქვენს პოსტზე`;
    case 'comment_reply': return `${count} პასუხი თქვენს კომენტარზე`;
    case 'new_follower': return `${count} ახალი მიმდევარი`;
    default: return firstTitle;
  }
}

function groupNotifications(notifications: CommunityNotification[]): GroupedNotif[] {
  const map = new Map<string, CommunityNotification[]>();
  for (const n of notifications) {
    const k = groupKey(n);
    const arr = map.get(k);
    if (arr) arr.push(n);
    else map.set(k, [n]);
  }
  const groups: GroupedNotif[] = [];
  for (const [key, items] of map) {
    items.sort((a, b) => b.createdAt - a.createdAt);
    const seen = new Set<string>();
    const actors: { id?: string | null; avatarUrl?: string | null }[] = [];
    for (const item of items) {
      const aid = item.actorId ?? '';
      if (aid && seen.has(aid)) continue;
      if (aid) seen.add(aid);
      actors.push({ id: item.actorId, avatarUrl: item.actorAvatarUrl });
      if (actors.length >= 5) break;
    }
    groups.push({
      key,
      type: items[0].type,
      items,
      count: items.length,
      latestAt: items[0].createdAt,
      actors,
      postId: items[0].postId,
      read: items.every(i => i.read),
      title: groupTitle(items[0].type, items.length, items[0].title),
      body: items.length > 1 ? items.slice(0, 3).map(i => i.title).join(', ') : items[0].body,
    });
  }
  groups.sort((a, b) => b.latestAt - a.latestAt);
  return groups;
}

function getNotifIcon(type: string): string {
  switch (type) {
    case 'post_reaction':
    case 'comment_reaction':
    case 'story_reaction': return '❤️';
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

function StackedAvatars({ actors, icon }: { actors: GroupedNotif['actors']; icon: string }) {
  const show = actors.slice(0, 3);
  const hasReal = show.some(a => !!a.avatarUrl);
  if (!hasReal) {
    return (
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(155,0,255,0.15)', border: '1px solid rgba(155,0,255,0.25)', fontSize: 18 }}
      >
        {icon || '🔔'}
      </div>
    );
  }
  if (show.length === 1) {
    return (
      <div className="w-10 h-10 rounded-full overflow-hidden" style={{ border: '2px solid rgba(155,0,255,0.3)' }}>
        {show[0].avatarUrl
          ? <img src={show[0].avatarUrl} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(155,0,255,0.15)', fontSize: 18 }}>{icon}</div>}
      </div>
    );
  }
  return (
    <div className="relative" style={{ width: 40, height: 40 }}>
      {show.map((a, i) => (
        <div
          key={i}
          className="absolute rounded-full overflow-hidden"
          style={{
            width: show.length === 2 ? 28 : 24,
            height: show.length === 2 ? 28 : 24,
            border: '2px solid #120d24',
            top: i === 0 ? 0 : show.length === 2 ? 12 : i === 1 ? 0 : 16,
            left: i === 0 ? 0 : show.length === 2 ? 12 : i === 1 ? 16 : 8,
            zIndex: show.length - i,
          }}
        >
          {a.avatarUrl
            ? <img src={a.avatarUrl} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,rgba(155,0,255,0.4),rgba(0,200,255,0.3))', fontSize: 11 }}>👤</div>}
        </div>
      ))}
    </div>
  );
}

function GroupedNotifRow({
  g,
  onTapPost,
  onTapProfile,
}: {
  g: GroupedNotif;
  onTapPost?: (postId: string) => void;
  onTapProfile?: (profileId: string) => void;
}) {
  const icon = getNotifIcon(g.type);
  const firstActorId = g.actors[0]?.id;
  const hasPost = !!g.postId && !!onTapPost;
  const hasProfile = !!firstActorId && !!onTapProfile;
  const hasBoth = hasPost && hasProfile;

  const handleTap = () => {
    if (hasBoth) return;
    if (hasPost) onTapPost!(g.postId!);
    else if (hasProfile) onTapProfile!(firstActorId!);
  };

  return (
    <div
      onClick={!hasBoth ? handleTap : undefined}
      className="w-full flex items-start gap-3 px-4 py-3 text-left transition-all"
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: g.read ? 'transparent' : getNotifAccent(g.type),
        cursor: (hasPost || hasProfile) && !hasBoth ? 'pointer' : 'default',
      }}
    >
      <div className="flex-shrink-0 mt-0.5">
        <StackedAvatars actors={g.actors} icon={icon} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-white/90 leading-snug">
              {icon && <span className="mr-1">{icon}</span>}
              <span className="font-semibold">{g.title}</span>
              {g.count > 1 && (
                <span
                  className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold"
                  style={{ background: 'rgba(155,0,255,0.3)', color: '#c084fc' }}
                >
                  {g.count}
                </span>
              )}
            </p>
            <p className="text-[12px] text-white/50 leading-snug mt-0.5 line-clamp-2">{g.body}</p>
          </div>
          {!g.read && (
            <span className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ background: '#9b00ff', boxShadow: '0 0 6px rgba(155,0,255,0.6)' }} />
          )}
        </div>

        {/* Action buttons — show both when post + profile are available */}
        {hasBoth ? (
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => onTapProfile!(firstActorId!)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
              style={{ background: 'rgba(155,0,255,0.15)', border: '1px solid rgba(155,0,255,0.3)', color: '#c084fc' }}
            >
              👤 პროფილი
            </button>
            <button
              onClick={() => onTapPost!(g.postId!)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
              style={{ background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.25)', color: 'rgba(0,200,255,0.8)' }}
            >
              📝 პოსტი
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-white/25 mt-1 font-mono">{timeAgo(g.latestAt)}</p>
        )}
        {hasBoth && (
          <p className="text-[11px] text-white/25 mt-1 font-mono">{timeAgo(g.latestAt)}</p>
        )}
      </div>
    </div>
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

  const sorted = useMemo(() => [...notifications].sort((a, b) => b.createdAt - a.createdAt), [notifications]);

  const filtered = useMemo(() => {
    const allowedTypes = TAB_TYPES[tab];
    return allowedTypes ? sorted.filter(n => allowedTypes.includes(n.type)) : sorted;
  }, [sorted, tab]);

  const grouped = useMemo(() => groupNotifications(filtered), [filtered]);

  const unreadCount = sorted.filter(n => !n.read).length;

  const handleTapPost = (postId: string) => {
    onClose();
    onOpenPost?.(postId);
  };

  const handleTapProfile = (profileId: string) => {
    onClose();
    onOpenProfile?.(profileId);
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'all', label: 'ყველა', icon: '🔔' },
    { id: 'reactions', label: 'რეაქცია', icon: '❤️' },
    { id: 'comments', label: 'კომენტარი', icon: '💬' },
    { id: 'follows', label: 'მიმდევრები', icon: '👤' },
    { id: 'system', label: 'სისტემა', icon: '⚙' },
  ];

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
          ) : grouped.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2">
              <span style={{ fontSize: 32, opacity: 0.3 }}>🔔</span>
              <p className="font-mono text-white/25 text-sm">
                {tab === 'all' ? t.community.notifications.empty : 'ამ კატეგორიაში შეტყობინება არ არის'}
              </p>
            </div>
          ) : (
            grouped.map(g => (
              <GroupedNotifRow
                key={g.key}
                g={g}
                onTapPost={onOpenPost ? handleTapPost : undefined}
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
