import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import { useT } from '@/store/langStore';
import { DailyThought } from '@/types/index';
import { Spinner, EmptyState, SectionHeader, PillButton, ModalShell, TextArea, timeAgo } from '@/components/community/shared';

function ThoughtRow({ thought, canManage, onDelete }: {
  thought: DailyThought;
  canManage: boolean;
  onDelete: (id: string) => void;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className="rounded-xl border px-3.5 py-2.5 flex items-start justify-between gap-2"
      style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
    >
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs text-white/60 whitespace-pre-wrap leading-relaxed">{thought.content}</p>
        <p className="font-mono text-[9px] text-white/25 mt-1">{timeAgo(thought.createdAt)}</p>
      </div>
      {canManage && (
        confirming ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => onDelete(thought.id)}
              className="font-mono text-[9px] uppercase tracking-wider px-2 py-1 rounded-lg text-red-400 border border-red-500/30 bg-red-500/10 active:scale-95 transition-all"
            >
              {t.community.thoughts.delete}?
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="font-mono text-[9px] text-white/30 hover:text-white/60"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="flex-shrink-0 font-mono text-[10px] text-white/25 hover:text-red-400/80 transition-colors px-1"
            aria-label={t.community.thoughts.delete}
          >
            🗑
          </button>
        )
      )}
    </div>
  );
}

export function ThoughtsTab(): JSX.Element {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const isOwner = profile?.moderatorLevel === 'owner';
  const { thoughts, fetchThoughts, createThought, deleteThought } = useCommunityStore();

  const [loading, setLoading] = useState(true);
  const [showArchive, setShowArchive] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchThoughts();
      setLoading(false);
    })();
  }, [fetchThoughts]);

  const pinnedThought = thoughts.find(th => th.pinned) ?? null;
  const archived = thoughts.filter(th => !th.pinned).sort((a, b) => b.createdAt - a.createdAt);

  async function handleCreate() {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await createThought(content.trim(), pinned);
      setShowCreate(false);
      setContent('');
      setPinned(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <SectionHeader
        label={t.community.thoughts.title}
        action={isOwner ? (
          <PillButton accent="purple" onClick={() => setShowCreate(true)}>
            <span className="text-base leading-none">+</span> {t.community.thoughts.create}
          </PillButton>
        ) : undefined}
      />

      {loading ? (
        <Spinner color="#9b00ff" />
      ) : thoughts.length === 0 ? (
        <EmptyState text={t.community.thoughts.empty} />
      ) : (
        <div className="space-y-4">
          {pinnedThought && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border px-5 py-5 relative overflow-hidden"
              style={{
                borderColor: 'rgba(155,0,255,0.45)',
                background: 'linear-gradient(135deg, rgba(155,0,255,0.10), rgba(0,245,255,0.06))',
                boxShadow: '0 0 50px rgba(155,0,255,0.18)',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(155,0,255,0.18)', border: '1px solid rgba(155,0,255,0.4)', color: 'rgba(180,80,255,0.95)' }}
                >
                  {t.community.thoughts.todayLabel}
                </span>
                {isOwner && (
                  <button
                    onClick={() => deleteThought(pinnedThought.id)}
                    className="font-mono text-[10px] text-white/25 hover:text-red-400/80 transition-colors"
                    aria-label={t.community.thoughts.delete}
                  >
                    🗑
                  </button>
                )}
              </div>
              <p className="font-display text-white text-lg leading-relaxed whitespace-pre-wrap">{pinnedThought.content}</p>
              <p className="font-mono text-[10px] text-white/30 mt-3">{timeAgo(pinnedThought.createdAt)}</p>
            </motion.div>
          )}

          {archived.length > 0 && (
            <div>
              <button
                onClick={() => setShowArchive(v => !v)}
                className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-white/30 hover:text-white/60 transition-colors mb-3"
              >
                {t.community.thoughts.archive}
                <span className="text-[8px]">{showArchive ? '▲' : '▼'}</span>
              </button>

              <AnimatePresence>
                {showArchive && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2">
                      {archived.map(th => (
                        <ThoughtRow key={th.id} thought={th} canManage={isOwner} onDelete={deleteThought} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {showCreate && (
          <ModalShell accent="purple" onClose={() => setShowCreate(false)}>
            <h3 className="font-display font-bold text-white text-xl mb-4">{t.community.thoughts.create}</h3>
            <div className="space-y-3">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wider text-white/40 block mb-1">{t.community.thoughts.contentLabel}</label>
                <TextArea value={content} onChange={setContent} placeholder={t.community.thoughts.contentPh} maxLength={2000} rows={5} accent="purple" />
              </div>
              <label className="flex items-center gap-2 font-mono text-xs text-white/50 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={e => setPinned(e.target.checked)}
                  className="w-4 h-4 accent-[#9b00ff]"
                />
                {t.community.thoughts.pin}
              </label>
              <button
                onClick={handleCreate}
                disabled={!content.trim() || submitting}
                className="w-full py-3 rounded-xl font-display font-semibold text-sm uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.4), rgba(0,245,255,0.25))', border: '1px solid rgba(155,0,255,0.4)' }}
              >
                {t.community.thoughts.create}
              </button>
            </div>
          </ModalShell>
        )}
      </AnimatePresence>
    </div>
  );
}
