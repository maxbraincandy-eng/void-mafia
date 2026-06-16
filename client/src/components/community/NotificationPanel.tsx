import { useState, useEffect } from 'react';
import { useT } from '@/store/langStore';
import { useCommunityStore } from '@/store/communityStore';
import { Spinner, EmptyState, PillButton, ModalShell, timeAgo } from '@/components/community/shared';

export function NotificationPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const t = useT();
  const { notifications, fetchNotifications, markNotificationsRead } = useCommunityStore();
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchNotifications();
      setLoading(false);
    })();
  }, [fetchNotifications]);

  async function handleMarkAllRead() {
    setMarking(true);
    try {
      await markNotificationsRead();
    } finally {
      setMarking(false);
    }
  }

  const sorted = [...notifications].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <ModalShell onClose={onClose} accent="purple" maxWidthClass="max-w-md">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h3 className="font-display font-bold text-white text-xl">{t.community.notifications.title}</h3>
        <div className="flex items-center gap-2">
          <PillButton onClick={handleMarkAllRead} disabled={marking} accent="purple">
            {t.community.notifications.markAllRead}
          </PillButton>
          <button
            onClick={onClose}
            className="font-mono text-sm text-white/40 hover:text-white/80 transition-colors px-1"
            aria-label={t.common.close}
          >
            ✕
          </button>
        </div>
      </div>

      {loading ? (
        <Spinner color="#9b00ff" />
      ) : sorted.length === 0 ? (
        <EmptyState text={t.community.notifications.empty} />
      ) : (
        <div className="space-y-2">
          {sorted.map(n => (
            <div
              key={n.id}
              className="rounded-xl border px-3.5 py-2.5 flex items-start gap-2.5"
              style={{
                borderColor: n.read ? 'rgba(255,255,255,0.08)' : 'rgba(155,0,255,0.35)',
                background: n.read ? 'rgba(255,255,255,0.02)' : 'rgba(155,0,255,0.08)',
              }}
            >
              {!n.read && (
                <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#9b00ff' }} />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-white/85 font-semibold">{n.title}</p>
                <p className="font-mono text-xs text-white/55 mt-0.5">{n.body}</p>
                <p className="font-mono text-[10px] text-white/25 mt-1">{timeAgo(n.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}
