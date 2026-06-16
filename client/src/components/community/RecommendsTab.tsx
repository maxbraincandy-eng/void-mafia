import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import { useT } from '@/store/langStore';
import { MaxRecommendation, RecommendCategory } from '@/types/index';
import { Spinner, EmptyState, SectionHeader, PillButton, ModalShell, TextInput, TextArea, timeAgo } from '@/components/community/shared';

const CATEGORIES: RecommendCategory[] = ['movie', 'series', 'book', 'music', 'philosophy'];

const CATEGORY_EMOJI: Record<RecommendCategory, string> = {
  movie: '🎬',
  series: '📺',
  book: '📚',
  music: '🎵',
  philosophy: '🧠',
};

function RecommendCard({ rec, label, canManage, onOpen, onDelete }: {
  rec: MaxRecommendation;
  label: string;
  canManage: boolean;
  onOpen: () => void;
  onDelete: (id: string) => void;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onOpen}
      className="rounded-2xl border overflow-hidden cursor-pointer active:scale-[0.98] transition-all"
      style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
    >
      <div className="w-full aspect-square relative">
        {rec.imageUrl ? (
          <img src={rec.imageUrl} alt={rec.title} className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-4xl"
            style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.25), rgba(0,245,255,0.18))' }}
          >
            {CATEGORY_EMOJI[rec.category]}
          </div>
        )}
        {canManage && (
          <div className="absolute top-1.5 right-1.5" onClick={e => e.stopPropagation()}>
            {confirming ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onDelete(rec.id)}
                  className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-1 rounded-lg text-red-400 border border-red-500/40 bg-black/70 active:scale-95 transition-all"
                >
                  {t.community.recommends.delete}?
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="font-mono text-[9px] text-white/50 hover:text-white/80 bg-black/70 rounded-full w-5 h-5 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] bg-black/60 text-white/60 hover:text-red-400 transition-colors"
                aria-label={t.community.recommends.delete}
              >
                🗑
              </button>
            )}
          </div>
        )}
      </div>
      <div className="p-2.5 space-y-1">
        <span
          className="inline-block font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full"
          style={{ background: 'rgba(155,0,255,0.12)', border: '1px solid rgba(155,0,255,0.3)', color: 'rgba(180,80,255,0.9)' }}
        >
          {label}
        </span>
        <p className="font-display font-bold text-white text-sm leading-snug line-clamp-2">{rec.title}</p>
        <p className="font-mono text-[10px] text-white/40 line-clamp-2 leading-relaxed">{rec.review}</p>
      </div>
    </motion.div>
  );
}

export function RecommendsTab(): JSX.Element {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const isOwner = profile?.moderatorLevel === 'owner';
  const { recommends, fetchRecommends, createRecommend, deleteRecommend } = useCommunityStore();

  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RecommendCategory | 'all'>('all');
  const [detail, setDetail] = useState<MaxRecommendation | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [category, setCategory] = useState<RecommendCategory>('movie');
  const [title, setTitle] = useState('');
  const [review, setReview] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchRecommends();
      setLoading(false);
    })();
  }, [fetchRecommends]);

  const categoryLabel = (c: RecommendCategory) => t.community.recommends.categories[c];

  const filtered = filter === 'all' ? recommends : recommends.filter(r => r.category === filter);

  async function handleCreate() {
    if (!title.trim() || !review.trim()) return;
    setSubmitting(true);
    try {
      await createRecommend(category, title.trim(), review.trim(), imageUrl.trim() || null);
      setShowCreate(false);
      setCategory('movie');
      setTitle('');
      setReview('');
      setImageUrl('');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete(id: string) {
    deleteRecommend(id);
    setDetail(prev => (prev?.id === id ? null : prev));
  }

  return (
    <div>
      <SectionHeader
        label={t.community.recommends.title}
        action={isOwner ? (
          <PillButton accent="purple" onClick={() => setShowCreate(true)}>
            <span className="text-base leading-none">+</span> {t.community.recommends.create}
          </PillButton>
        ) : undefined}
      />

      {/* Category filter pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4 -mx-1 px-1 scrollbar-none">
        <button
          onClick={() => setFilter('all')}
          className="flex-shrink-0 px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
          style={{
            background: filter === 'all' ? 'rgba(155,0,255,0.22)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${filter === 'all' ? 'rgba(155,0,255,0.45)' : 'rgba(255,255,255,0.08)'}`,
            color: filter === 'all' ? '#fff' : 'rgba(255,255,255,0.4)',
          }}
        >
          {t.community.recommends.all}
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-wider whitespace-nowrap transition-all active:scale-95"
            style={{
              background: filter === c ? 'rgba(155,0,255,0.22)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${filter === c ? 'rgba(155,0,255,0.45)' : 'rgba(255,255,255,0.08)'}`,
              color: filter === c ? '#fff' : 'rgba(255,255,255,0.4)',
            }}
          >
            {CATEGORY_EMOJI[c]} {categoryLabel(c)}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner color="#9b00ff" />
      ) : filtered.length === 0 ? (
        <EmptyState text={t.community.recommends.empty} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map(rec => (
            <RecommendCard
              key={rec.id}
              rec={rec}
              label={categoryLabel(rec.category)}
              canManage={isOwner}
              onOpen={() => setDetail(rec)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Detail modal */}
      <AnimatePresence>
        {detail && (
          <ModalShell accent="purple" onClose={() => setDetail(null)}>
            {detail.imageUrl ? (
              <img src={detail.imageUrl} alt={detail.title} className="w-full rounded-xl mb-4 object-cover max-h-56" />
            ) : (
              <div
                className="w-full rounded-xl mb-4 flex items-center justify-center text-5xl py-10"
                style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.25), rgba(0,245,255,0.18))' }}
              >
                {CATEGORY_EMOJI[detail.category]}
              </div>
            )}
            <span
              className="inline-block font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full mb-2"
              style={{ background: 'rgba(155,0,255,0.12)', border: '1px solid rgba(155,0,255,0.3)', color: 'rgba(180,80,255,0.9)' }}
            >
              {categoryLabel(detail.category)}
            </span>
            <h3 className="font-display font-bold text-white text-xl mb-2">{detail.title}</h3>
            <p className="font-mono text-sm text-white/60 whitespace-pre-wrap leading-relaxed mb-3">{detail.review}</p>
            <p className="font-mono text-[10px] text-white/25">{timeAgo(detail.createdAt)}</p>
            {isOwner && (
              <button
                onClick={() => handleDelete(detail.id)}
                className="w-full mt-4 py-2.5 rounded-xl font-mono text-xs uppercase tracking-wider text-red-400 border border-red-500/30 bg-red-500/10 active:scale-95 transition-all"
              >
                {t.community.recommends.delete}
              </button>
            )}
          </ModalShell>
        )}
      </AnimatePresence>

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && (
          <ModalShell accent="purple" onClose={() => setShowCreate(false)}>
            <h3 className="font-display font-bold text-white text-xl mb-4">{t.community.recommends.create}</h3>
            <div className="space-y-3">
              <div className="flex gap-1.5 flex-wrap">
                {CATEGORIES.map(c => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className="px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
                    style={{
                      background: category === c ? 'rgba(155,0,255,0.22)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${category === c ? 'rgba(155,0,255,0.45)' : 'rgba(255,255,255,0.08)'}`,
                      color: category === c ? '#fff' : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {CATEGORY_EMOJI[c]} {categoryLabel(c)}
                  </button>
                ))}
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wider text-white/40 block mb-1">{t.community.recommends.titleLabel}</label>
                <TextInput value={title} onChange={setTitle} placeholder={t.community.recommends.titlePh} maxLength={120} accent="purple" />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wider text-white/40 block mb-1">{t.community.recommends.reviewLabel}</label>
                <TextArea value={review} onChange={setReview} placeholder={t.community.recommends.reviewPh} maxLength={2000} rows={4} accent="purple" />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wider text-white/40 block mb-1">{t.community.recommends.imageLabel}</label>
                <TextInput value={imageUrl} onChange={setImageUrl} placeholder="https://…" accent="purple" />
              </div>
              <button
                onClick={handleCreate}
                disabled={!title.trim() || !review.trim() || submitting}
                className="w-full py-3 rounded-xl font-display font-semibold text-sm uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.4), rgba(0,245,255,0.25))', border: '1px solid rgba(155,0,255,0.4)' }}
              >
                {t.community.recommends.create}
              </button>
            </div>
          </ModalShell>
        )}
      </AnimatePresence>
    </div>
  );
}
