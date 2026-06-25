import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useCommunityStore } from '@/store/communityStore';
import type { FeedCategory } from '@/types/index';
import { Spinner, EmptyState } from '@/components/community/shared';
import { PostCardV2 } from '@/components/community/PostCardV2';
import { PostComposerV2 } from '@/components/community/PostComposerV2';
import { SkeletonPost } from '@/components/ui/Skeleton';

export function FeedTabV2({ onOpenProfile }: { onOpenProfile: (playerId: string) => void }) {
  const t = useT();
  const { feedV2Posts, feedV2HasMore, feedCategory, activeHashtag, setFeedCategory, fetchFeedV2, setActiveHashtag } = useCommunityStore();

  // Start loading only if there's no cached data to show — avoids skeleton flash on re-navigation
  const [loading, setLoading] = useState(feedV2Posts.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Track cached length without making it a useCallback dep (avoids infinite reload loop)
  const cachedLenRef = useRef(feedV2Posts.length);
  cachedLenRef.current = feedV2Posts.length;

  const CATS: { id: FeedCategory; label: string }[] = [
    { id: 'all',       label: t.community.feedCategories.all },
    { id: 'following', label: t.community.feedCategories.following },
    { id: 'friends',   label: t.community.feedCategories.friends },
    { id: 'trending',  label: t.community.feedCategories.trending },
  ];

  const doLoad = useCallback(async () => {
    const hasCache = cachedLenRef.current > 0;
    if (!hasCache) setLoading(true);
    setLoadError(null);
    try {
      await fetchFeedV2(true);
    } catch (e: any) {
      // If we have cached posts, silently swallow the error — stale data > broken UI
      if (!hasCache) setLoadError(e.message ?? 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [fetchFeedV2, feedCategory, activeHashtag]);

  useEffect(() => {
    doLoad();
  }, [doLoad]);

  // Auto-reload after auth restores (fires after every reconnect + auth success)
  useEffect(() => {
    const onAuthReady = () => {
      if (loadError || cachedLenRef.current === 0) doLoad();
    };
    window.addEventListener('vm:auth-ready', onAuthReady);
    return () => window.removeEventListener('vm:auth-ready', onAuthReady);
  }, [loadError, doLoad]);

  // Infinite scroll
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (entry.isIntersecting && feedV2HasMore && !loadingMore) {
        setLoadingMore(true);
        try { await fetchFeedV2(false); } finally { setLoadingMore(false); }
      }
    }, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [feedV2HasMore, loadingMore, fetchFeedV2]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display font-bold text-white text-lg">{t.community.feed.title}</h2>
        <button
          onClick={() => setShowComposer(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-lg transition-all active:scale-90"
          style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.3), rgba(0,245,255,0.2))', border: '1px solid rgba(155,0,255,0.45)' }}
        >
          +
        </button>
      </div>

      {/* Active hashtag */}
      {activeHashtag && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs" style={{ color: '#00f5ff' }}>#{activeHashtag}</span>
          <button onClick={() => setActiveHashtag(null)} className="font-mono text-[12px] text-white/40 hover:text-white/70 transition-colors">✕</button>
        </div>
      )}

      {/* Category bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {CATS.map(cat => {
          const active = feedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setFeedCategory(cat.id)}
              className="px-3 py-1.5 rounded-full font-mono text-[12px] uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 active:scale-95"
              style={{
                background: active ? 'linear-gradient(135deg, rgba(155,0,255,0.28), rgba(0,245,255,0.16))' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${active ? 'rgba(155,0,255,0.45)' : 'rgba(255,255,255,0.08)'}`,
                color: active ? '#fff' : 'rgba(255,255,255,0.4)',
              }}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3 pt-2">
          {Array.from({ length: 3 }, (_, i) => <SkeletonPost key={i} />)}
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <span className="text-2xl">📡</span>
          <p className="font-mono text-[12px] text-white/40 text-center">{loadError}</p>
          <button
            onClick={doLoad}
            className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95"
            style={{ background: 'rgba(155,0,255,0.12)', border: '1px solid rgba(155,0,255,0.35)', color: '#c084fc' }}
          >
            ხელახლა
          </button>
        </div>
      ) : feedV2Posts.length === 0 ? (
        <EmptyState text={t.community.feed.empty} />
      ) : (
        <div className="space-y-3">
          {feedV2Posts.map(post => (
            <PostCardV2 key={post.id} post={post} onOpenProfile={onOpenProfile} />
          ))}
          <div ref={bottomRef} className="h-4" />
          {loadingMore && <Spinner color="#9b00ff" />}
        </div>
      )}

      <AnimatePresence>
        {showComposer && <PostComposerV2 onClose={() => setShowComposer(false)} />}
      </AnimatePresence>
    </div>
  );
}
