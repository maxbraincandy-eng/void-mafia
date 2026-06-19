import { useEffect } from 'react';
import { useActivityStore } from '@/store/activityStore';
import type { ActivityEvent } from '@/store/activityStore';
import { useT } from '@/store/langStore';
import { Spinner, EmptyState } from '@/components/community/shared';

export function ActivityTab({ onOpenProfile }: { onOpenProfile: (id: string) => void }) {
  const t = useT();
  const { events, loading, fetchFeed } = useActivityStore();

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  if (loading) return <Spinner />;

  return (
    <div>
      <h2 className="font-mono text-[11px] uppercase tracking-widest text-white/40 mb-4">{t.community.activity.title}</h2>
      {events.length === 0 && <EmptyState text={t.community.activity.empty} />}
      <div className="flex flex-col gap-2">
        {events.map(ev => (
          <ActivityCard key={ev.id} event={ev} onOpenProfile={onOpenProfile} />
        ))}
      </div>
    </div>
  );
}

function ActivityCard({ event, onOpenProfile }: { event: ActivityEvent; onOpenProfile: (id: string) => void }) {
  const t = useT();

  const timeLabel = formatRelative(event.createdAt);
  const icon = eventIcon(event.eventType);
  const text = buildText(event, t);

  return (
    <div
      className="rounded-xl px-3 py-2.5 flex items-start gap-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <span className="text-base mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <button
          onClick={() => onOpenProfile(event.actorId)}
          className="font-mono text-[11px] text-white/70 hover:text-white/90 transition-colors font-semibold truncate"
        >
          {event.actorUsername ?? '???'}
        </button>
        <span className="font-mono text-[11px] text-white/40"> {text}</span>
        {typeof event.payload?.preview === 'string' && (
          <p className="mt-1 text-[12px] font-mono text-white/30 line-clamp-1 italic">"{event.payload.preview as string}"</p>
        )}
      </div>
      <span className="font-mono text-[12px] text-white/20 flex-shrink-0 mt-0.5">{timeLabel}</span>
    </div>
  );
}

function eventIcon(type: string): string {
  switch (type) {
    case 'posted': return '📝';
    case 'followed': return '👤';
    case 'became_friends': return '🤝';
    case 'joined_debate': return '⚔️';
    case 'debate_argument': return '💬';
    default: return '•';
  }
}

function buildText(event: ActivityEvent, t: ReturnType<typeof useT>): string {
  switch (event.eventType) {
    case 'posted': return t.community.activity.posted;
    case 'followed': return t.community.activity.followed;
    case 'became_friends': return t.community.activity.becameFriends;
    case 'joined_debate': return t.community.activity.joinedDebate;
    case 'debate_argument': return t.community.activity.postedArgument;
    default: return t.community.activity.didSomething;
  }
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '<1m';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

