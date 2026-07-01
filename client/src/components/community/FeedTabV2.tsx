import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useCommunityStore } from '@/store/communityStore';
import { useAuthStore } from '@/store/authStore';
import type { FeedCategory } from '@/types/index';
import { Spinner, EmptyState } from '@/components/community/shared';
import { PostCardV2 } from '@/components/community/PostCardV2';
import { PostComposerV2 } from '@/components/community/PostComposerV2';
import { FriendsPresenceStrip } from '@/components/community/FriendsPresenceStrip';
import { StoriesStrip } from '@/components/community/Stories';
import { SkeletonPost } from '@/components/ui/Skeleton';

export function FeedTabV2({ onOpenProfile, onOpenMyProfile }: { onOpenProfile: (playerId: string) => void; onOpenMyProfile?: () => void }) {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const { feedV2Posts, feedV2HasMore, feedCategory, activeHashtag, setFeedCategory, fetchFeedV2, setActiveHashtag } = useCommunityStore();

  // Start loading only if there's no cached data to show — avoids skeleton flash on re-navigation
  const [loading, setLoading] = useState(feedV2Posts.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showComposer, setShowComposer] = useState(false);

  // Track cached length without making it a useCallback dep (avoids infinite reload loop)
  const cachedLenRef = useRef(feedV2Posts.length);
  cachedLenRef.current = feedV2Posts.length;

  const CATS: { id: FeedCategory; label: string }[] = [
    { id: 'all',       label: t.community.feedCategories.all },
    { id: 'following', label: t.community.feedCategories.following },
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

  // Infinite scroll. The observer is bound via a CALLBACK REF so it attaches
  // exactly when the sentinel mounts — a plain useEffect ran while the list was
  // still in its loading state (sentinel absent → bottomRef.current null) and,
  // since its deps didn't change when posts rendered, it never re-attached, so
  // load-more never fired. loadMore is read through a ref to avoid stale state.
  // `loadingRef` is a synchronous lock (React state is async, so two observer
  // callbacks in the same tick could both pass a `loadingMore` check).
  const loadingRef = useRef(false);
  // Scroll position captured before a load-more, restored after the new posts
  // render. Posts are appended BELOW the viewport, so scrollTop-from-top must not
  // change — but Android snaps the container to the new bottom, so we pin it.
  const restoreScrollRef = useRef<number | null>(null);
  const loadMore = useCallback(async () => {
    if (!feedV2HasMore || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    const scroller = document.getElementById('root');
    restoreScrollRef.current = scroller ? scroller.scrollTop : null;
    try { await fetchFeedV2(false); } finally { loadingRef.current = false; setLoadingMore(false); }
  }, [feedV2HasMore, fetchFeedV2]);

  // After the appended posts render, correct ONLY the Android "snap to bottom":
  // if the container ended up at the new bottom (which can't be reached by a
  // normal gesture right after inserting a page of tall posts), pin it back to
  // where the load was triggered. Normal iOS momentum (which leaves the user
  // mid-list, not at the very bottom) is left untouched. useLayoutEffect runs
  // before paint (no flash); the rAF catches a late re-jump (e.g. image load).
  useLayoutEffect(() => {
    const top = restoreScrollRef.current;
    if (top == null) return;
    restoreScrollRef.current = null;
    const scroller = document.getElementById('root');
    if (!scroller) return;
    const pin = () => {
      const maxTop = scroller.scrollHeight - scroller.clientHeight;
      if (scroller.scrollTop >= maxTop - 4 && scroller.scrollTop > top + 4) {
        scroller.scrollTop = top;
      }
    };
    pin();
    requestAnimationFrame(pin);
  }, [feedV2Posts.length]);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  // Load at most ONE page per TIME WINDOW. Android fires the observer
  // continuously during momentum scroll (iOS only on settle): a single hard
  // fling makes the sentinel exit and re-enter repeatedly (each appended page
  // pushes it out, momentum brings it back), so a mere enter/exit gate still
  // loads page after page and dumps the user at the oldest post. A fixed
  // re-arm delay after each load caps it to one page per fling regardless of
  // how many times the sentinel is crossed.
  const armedRef = useRef(true);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const bottomRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    if (!node) return;
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && armedRef.current) {
          armedRef.current = false;
          loadMoreRef.current();
          if (armTimer.current) clearTimeout(armTimer.current);
          armTimer.current = setTimeout(() => { armedRef.current = true; }, 900);
        }
      },
      { threshold: 0, rootMargin: '120px' },
    );
    observerRef.current.observe(node);
  }, []);

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
        {/* My Profile pseudo-tab */}
        <button
          onClick={() => onOpenMyProfile?.()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[12px] uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 active:scale-95"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          {profile?.avatar && (
            <span style={{ fontSize: 13, lineHeight: 1 }}>{profile.avatar}</span>
          )}
          ჩემი
        </button>
      </div>

      {/* Stories (24h) */}
      <StoriesStrip onOpenProfile={onOpenProfile} />

      {/* Online friends presence strip */}
      <FriendsPresenceStrip onOpenProfile={onOpenProfile} />

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
        <div className="space-y-3" style={{ overflowAnchor: 'none' }}>
          {feedV2Posts.map(post => (
            <PostCardV2 key={post.id} post={post} onOpenProfile={onOpenProfile} />
          ))}
          <div ref={bottomRef} className="h-4" style={{ overflowAnchor: 'none' }} />
          {loadingMore && <Spinner color="#9b00ff" />}
        </div>
      )}

      <AnimatePresence>
        {showComposer && <PostComposerV2 onClose={() => setShowComposer(false)} />}
      </AnimatePresence>
    </div>
  );
}
