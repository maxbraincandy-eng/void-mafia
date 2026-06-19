import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import { useT } from '@/store/langStore';
import { VoidNewsPost } from '@/types/index';
import { Spinner, EmptyState, SectionHeader, PillButton, ModalShell, TextInput, TextArea, timeAgo } from '@/components/community/shared';

function NewsCard({ post, canManage, onDelete }: {
  post: VoidNewsPost;
  canManage: boolean;
  onDelete: (id: string) => void;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border px-4 py-3 space-y-2"
      style={{
        borderColor: post.pinned ? 'rgba(155,0,255,0.4)' : 'rgba(255,255,255,0.08)',
        background: post.pinned ? 'rgba(155,0,255,0.06)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {post.pinned && (
            <span
              className="flex-shrink-0 font-mono text-[12px] uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(155,0,255,0.15)', border: '1px solid rgba(155,0,255,0.35)', color: 'rgba(180,80,255,0.95)' }}
            >
              📌 {t.community.news.pinned}
            </span>
          )}
        </div>
        {canManage && (
          confirming ? (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => onDelete(post.id)}
                className="font-mono text-[12px] uppercase tracking-wider px-2 py-1 rounded-lg text-red-400 border border-red-500/30 bg-red-500/10 active:scale-95 transition-all"
              >
                {t.community.news.delete}?
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="font-mono text-[12px] text-white/30 hover:text-white/60"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="flex-shrink-0 font-mono text-[12px] text-white/25 hover:text-red-400/80 transition-colors px-1"
              aria-label={t.community.news.delete}
            >
              🗑
            </button>
          )
        )}
      </div>

      <h3 className="font-display font-bold text-white text-base leading-snug">{post.title}</h3>
      <p className="font-mono text-xs text-white/60 whitespace-pre-wrap leading-relaxed">{post.content}</p>

      <div className="flex items-center gap-2 pt-1">
        <span className="font-mono text-[12px] text-white/35">{post.authorName}</span>
        <span className="text-white/15">·</span>
        <span className="font-mono text-[12px] text-white/25">{timeAgo(post.createdAt)}</span>
      </div>
    </motion.div>
  );
}

export function NewsTab(): JSX.Element {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const isOwner = profile?.moderatorLevel === 'owner';
  const { news, fetchNews, createNews, deleteNews } = useCommunityStore();

  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchNews();
      setLoading(false);
    })();
  }, [fetchNews]);

  const sorted = [...news].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt - a.createdAt;
  });

  async function handleCreate() {
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    try {
      await createNews(title.trim(), content.trim(), pinned);
      setShowCreate(false);
      setTitle('');
      setContent('');
      setPinned(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <SectionHeader
        label={t.community.news.title}
        action={isOwner ? (
          <PillButton accent="purple" onClick={() => setShowCreate(true)}>
            <span className="text-base leading-none">+</span> {t.community.news.create}
          </PillButton>
        ) : undefined}
      />

      {loading ? (
        <Spinner color="#9b00ff" />
      ) : sorted.length === 0 ? (
        <EmptyState text={t.community.news.empty} />
      ) : (
        <div className="space-y-3">
          {sorted.map(post => (
            <NewsCard key={post.id} post={post} canManage={isOwner} onDelete={deleteNews} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreate && (
          <ModalShell accent="purple" onClose={() => setShowCreate(false)}>
            <h3 className="font-display font-bold text-white text-xl mb-4">{t.community.news.create}</h3>
            <div className="space-y-3">
              <div>
                <label className="font-mono text-[12px] uppercase tracking-wider text-white/40 block mb-1">{t.community.news.titleLabel}</label>
                <TextInput value={title} onChange={setTitle} placeholder={t.community.news.titlePh} maxLength={120} accent="purple" />
              </div>
              <div>
                <label className="font-mono text-[12px] uppercase tracking-wider text-white/40 block mb-1">{t.community.news.contentLabel}</label>
                <TextArea value={content} onChange={setContent} placeholder={t.community.news.contentPh} maxLength={4000} rows={5} accent="purple" />
              </div>
              <label className="flex items-center gap-2 font-mono text-xs text-white/50 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={e => setPinned(e.target.checked)}
                  className="w-4 h-4 accent-[#9b00ff]"
                />
                {t.community.news.pin}
              </label>
              <button
                onClick={handleCreate}
                disabled={!title.trim() || !content.trim() || submitting}
                className="w-full py-3 rounded-xl font-display font-semibold text-sm uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.4), rgba(0,245,255,0.25))', border: '1px solid rgba(155,0,255,0.4)' }}
              >
                {t.community.news.create}
              </button>
            </div>
          </ModalShell>
        )}
      </AnimatePresence>
    </div>
  );
}
