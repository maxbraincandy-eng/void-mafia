import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useCommunityStore } from '@/store/communityStore';
import type { CommunityEvent, CommunityEventCategory } from '@/types/index';
import {
  Spinner, EmptyState, SectionHeader, PillButton, ModalShell, TextInput, TextArea,
} from '@/components/community/shared';

const CATEGORIES: CommunityEventCategory[] = ['movie_night', 'philosophy_night', 'void_radio', 'live_discussion', 'other'];

function EventCard({ event, onJoin, onLeave }: {
  event: CommunityEvent;
  onJoin: (id: string) => void;
  onLeave: (id: string) => void;
}) {
  const t = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border px-4 py-3.5 space-y-2.5"
      style={{
        borderColor: event.joinedByMe ? 'rgba(0,245,255,0.35)' : 'rgba(155,0,255,0.25)',
        background: event.joinedByMe ? 'rgba(0,245,255,0.06)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-bold text-white text-base leading-snug">{event.title}</h3>
          <p className="font-mono text-[10px] text-white/35 mt-0.5">{new Date(event.eventAt).toLocaleString()}</p>
        </div>
        <span
          className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border flex-shrink-0"
          style={{ color: 'rgba(180,80,255,0.95)', borderColor: 'rgba(155,0,255,0.4)', background: 'rgba(155,0,255,0.12)' }}
        >
          {t.community.events.categories[event.category]}
        </span>
      </div>

      <p className="font-mono text-xs text-white/60 whitespace-pre-wrap leading-relaxed">{event.description}</p>

      <div className="flex items-center justify-between pt-1">
        <p className="font-mono text-[10px] text-white/35">
          {event.participantCount} {t.community.events.participants}
        </p>
        {event.joinedByMe ? (
          <PillButton onClick={() => onLeave(event.id)} accent="cyan">
            {t.community.events.joined} · {t.community.events.leave}
          </PillButton>
        ) : (
          <PillButton onClick={() => onJoin(event.id)} accent="purple">
            {t.community.events.join}
          </PillButton>
        )}
      </div>
    </motion.div>
  );
}

function CreateEventModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const createEvent = useCommunityStore(s => s.createEvent);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CommunityEventCategory>('other');
  const [dateValue, setDateValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!title.trim() || !description.trim() || !dateValue || submitting) return;
    const eventAt = new Date(dateValue).getTime();
    if (Number.isNaN(eventAt)) return;
    setSubmitting(true);
    setError('');
    try {
      await createEvent(title.trim(), description.trim(), category, eventAt);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create event.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose} accent="purple">
      <h3 className="font-display font-bold text-white text-xl mb-4">{t.community.events.create}</h3>
      {error && <p className="mb-3 text-xs text-red-400/80 font-mono">{error}</p>}
      <div className="space-y-3">
        <div>
          <label className="font-mono text-[10px] uppercase tracking-wider text-white/40 block mb-1">{t.community.events.titleLabel}</label>
          <TextInput value={title} onChange={setTitle} placeholder={t.community.events.titlePh} maxLength={120} accent="purple" />
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase tracking-wider text-white/40 block mb-1">{t.community.events.descLabel}</label>
          <TextArea value={description} onChange={setDescription} placeholder={t.community.events.descPh} maxLength={2000} rows={4} accent="purple" />
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase tracking-wider text-white/40 block mb-1">{t.community.events.category}</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className="font-mono text-[10px] uppercase tracking-wider px-2.5 py-1.5 rounded-full border transition-all active:scale-95"
                style={category === cat
                  ? { color: 'rgba(180,80,255,0.95)', borderColor: 'rgba(155,0,255,0.5)', background: 'rgba(155,0,255,0.18)' }
                  : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)' }}
              >
                {t.community.events.categories[cat]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase tracking-wider text-white/40 block mb-1">{t.community.events.dateLabel}</label>
          <input
            type="datetime-local"
            value={dateValue}
            onChange={e => setDateValue(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 font-mono text-sm text-white outline-none transition-colors"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || !description.trim() || !dateValue || submitting}
          className="w-full py-3 rounded-xl font-display font-semibold text-sm uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.4), rgba(0,245,255,0.25))', border: '1px solid rgba(155,0,255,0.4)', color: '#fff' }}
        >
          {submitting ? '…' : t.community.events.create}
        </button>
      </div>
    </ModalShell>
  );
}

export function EventsTab(): JSX.Element {
  const t = useT();
  const { events, fetchEvents, joinEvent, leaveEvent } = useCommunityStore();
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchEvents();
      setLoading(false);
    })();
  }, [fetchEvents]);

  const sorted = [...events].sort((a, b) => a.eventAt - b.eventAt);

  return (
    <div>
      <SectionHeader
        label={t.community.events.title}
        action={
          <PillButton onClick={() => setShowCreate(true)} accent="purple">
            <span className="text-base leading-none">+</span> {t.community.events.create}
          </PillButton>
        }
      />

      {loading ? (
        <Spinner color="#9b00ff" />
      ) : sorted.length === 0 ? (
        <EmptyState text={t.community.events.empty} />
      ) : (
        <div className="space-y-3">
          {sorted.map(event => (
            <EventCard key={event.id} event={event} onJoin={joinEvent} onLeave={leaveEvent} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} />}
      </AnimatePresence>
    </div>
  );
}
