import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useCommunityStore } from '@/store/communityStore';
import { useAuthStore } from '@/store/authStore';
import type { FeedCategory } from '@/types/index';
import { Spinner, EmptyState } from '@/components/community/shared';
import { PostCardV2 } from '@/components/community/PostCardV2';
import { PostComposerV2 } from '@/components/community/PostComposerV2';
import { GoLive } from '@/components/live/GoLive';
import { LiveViewer } from '@/components/live/LiveViewer';
import { AvatarStatusStyles } from '@/components/community/shared';
import { useLiveStore } from '@/store/liveStore';
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
  const [showGoLive, setShowGoLive] = useState(false);
  /*
   * A session id when watching somebody.
   *
   * Set by tapping any live avatar anywhere in the feed — the avatar asks the
   * store rather than being handed a callback through every card and comment
   * row that renders one.
   */
  const watchingLive = useLiveStore(s => s.watchRequest);
  const clearWatchRequest = useLiveStore(s => s.clearWatchRequest);

  // Track cached length without making it a useCallback dep (avoids infinite reload loop)
  const cachedLenRef = useRef(feedV2Posts.length);
  cachedLenRef.current = feedV2Posts.length;

  const CATS: { id: FeedCategory; label: string }[] = [
    { id: 'all',       label: t.community.feedCategories.all },
    { id: 'following', label: t.community.feedCategories.following },
  ];

  // Which load is the current one. Switching categories quickly starts several,
  // and only the newest may touch the spinner or the error — an older one
  // finishing afterwards used to clear the spinner while its own results were
  // being discarded, leaving an empty list that reads as "no posts".
  const loadTokenRef = useRef(0);

  /**
   * A category chip.
   *
   * Tapping the one you are already on reloads the feed rather than doing
   * nothing — it is the obvious gesture for "give me the newest", and it used
   * to blank the page instead.
   */
  const pickCategory = useCallback((cat: FeedCategory) => {
    if (feedCategory === cat) void doLoadRef.current?.();
    else setFeedCategory(cat);
  }, [feedCategory, setFeedCategory]);

  const doLoad = useCallback(async () => {
    const token = ++loadTokenRef.current;
    const hasCache = cachedLenRef.current > 0;
    if (!hasCache) setLoading(true);
    setLoadError(null);
    try {
      await fetchFeedV2(true);
    } catch (e: any) {
      // With posts already on screen, stale data beats a broken page. With
      // NOTHING on screen the error has to be said, or the empty state claims
      // there is nothing to show when the truth is that the load failed.
      if (token === loadTokenRef.current && cachedLenRef.current === 0) {
        setLoadError(e.message ?? 'Failed to load.');
      }
    } finally {
      if (token === loadTokenRef.current) setLoading(false);
    }
  }, [fetchFeedV2, feedCategory, activeHashtag]);

  // `pickCategory` needs the newest doLoad without listing it as a dependency,
  // which would rebuild the callback on every load.
  const doLoadRef = useRef<null | (() => Promise<void>)>(null);
  doLoadRef.current = doLoad;

  useEffect(() => {
    doLoad();
  }, [doLoad]);

  /*
   * Last resort: an empty feed that nobody is loading is always wrong.
   *
   * Two separate bugs have now left the list empty with nothing on its way —
   * a stale response discarded after clearing, and a no-op category change that
   * wiped it. Both are fixed at the source, but the failure they produce is the
   * worst kind: a page that says "there is nothing here" when there is plenty,
   * and stays that way until it is remounted. This notices and reloads.
   */
  useEffect(() => {
    if (feedV2Posts.length === 0 && !loading && !loadError) {
      const t = setTimeout(() => {
        if (useCommunityStore.getState().feedV2Posts.length === 0) doLoadRef.current?.();
      }, 400);
      return () => clearTimeout(t);
    }
  }, [feedV2Posts.length, loading, loadError]);

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
  // Continuously record the user's real scroll position on #root. When posts are
  // appended, Android snaps the container to the new bottom (posts insert BELOW
  // the viewport, so scrollTop should NOT change). We restore to the LAST real
  // position — recorded live, so it stays correct during a SLOW scroll (a value
  // captured at fetch-start would already be stale by the time posts render).
  // Scroll events fire async, so at useLayoutEffect time (right after the DOM
  // mutation) this ref still holds the pre-jump value.
  const lastScrollTopRef = useRef(0);
  const pinPendingRef = useRef(false);
  useEffect(() => {
    const scroller = document.getElementById('root');
    if (!scroller) return;
    const onScroll = () => { lastScrollTopRef.current = scroller.scrollTop; };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);

  const loadMore = useCallback(async () => {
    if (!feedV2HasMore || loadingRef.current) return;
    loadingRef.current = true;
    pinPendingRef.current = true;
    setLoadingMore(true);
    try { await fetchFeedV2(false); } finally { loadingRef.current = false; setLoadingMore(false); }
  }, [feedV2HasMore, fetchFeedV2]);

  // Once the appended posts render, undo any scroll jump by restoring the last
  // real position. useLayoutEffect runs after the DOM mutation but before paint
  // (no visible flash); the rAF catches a late re-jump (e.g. an image loading).
  // If nothing jumped (iOS), the values match within tolerance → no-op.
  useLayoutEffect(() => {
    if (!pinPendingRef.current) return;
    pinPendingRef.current = false;
    const scroller = document.getElementById('root');
    if (!scroller) return;
    const want = lastScrollTopRef.current;
    const pin = () => { if (Math.abs(scroller.scrollTop - want) > 24) scroller.scrollTop = want; };
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
      {/* The keyframes the live ring uses, mounted once for the whole feed. */}
      <AvatarStatusStyles />
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display font-bold text-white text-lg">{t.community.feed.title}</h2>
        {/*
          Going live sits beside posting, not inside it.

          The spec offers either a Post/Story/Live selector inside the composer
          or a button of its own. Its own, because the other two open a form and
          this opens a camera — burying "the camera turns on now" one level
          inside a sheet that otherwise writes text is how somebody goes live by
          accident.
        */}
        <button
          onClick={() => setShowGoLive(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-[15px] transition-all active:scale-90 mr-2"
          style={{ background: 'rgba(255,45,85,0.16)', border: '1px solid rgba(255,45,85,0.5)' }}
          title="პირდაპირი ეთერი"
        >📡</button>
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

      {/* Category bar: ყველა → ჩემი პროფილი → გამოწერილი */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {/* ყველა */}
        <button
          onClick={() => pickCategory('all')}
          className="px-3 py-1.5 rounded-full font-mono text-[12px] uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 active:scale-95"
          style={{
            background: feedCategory === 'all' ? 'linear-gradient(135deg, rgba(155,0,255,0.28), rgba(0,245,255,0.16))' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${feedCategory === 'all' ? 'rgba(155,0,255,0.45)' : 'rgba(255,255,255,0.08)'}`,
            color: feedCategory === 'all' ? '#fff' : 'rgba(255,255,255,0.4)',
          }}
        >
          {t.community.feedCategories.all}
        </button>

        {/* ჩემი პროფილი — neon glow */}
        <button
          onClick={() => onOpenMyProfile?.()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[12px] uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, rgba(0,245,255,0.12), rgba(155,0,255,0.12))',
            border: '1px solid rgba(0,245,255,0.35)',
            color: '#00f5ff',
            textShadow: '0 0 8px rgba(0,245,255,0.6), 0 0 16px rgba(0,245,255,0.3)',
            boxShadow: '0 0 10px rgba(0,245,255,0.15), inset 0 0 8px rgba(0,245,255,0.05)',
          }}
        >
          {profile?.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(0,245,255,0.4)' }} />
          ) : profile?.avatar ? (
            <span style={{ fontSize: 13, lineHeight: 1 }}>{profile.avatar}</span>
          ) : null}
          {t.commB.myProfile}
        </button>

        {/* გამოწერილი */}
        <button
          onClick={() => pickCategory('following')}
          className="px-3 py-1.5 rounded-full font-mono text-[12px] uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 active:scale-95"
          style={{
            background: feedCategory === 'following' ? 'linear-gradient(135deg, rgba(155,0,255,0.28), rgba(0,245,255,0.16))' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${feedCategory === 'following' ? 'rgba(155,0,255,0.45)' : 'rgba(255,255,255,0.08)'}`,
            color: feedCategory === 'following' ? '#fff' : 'rgba(255,255,255,0.4)',
          }}
        >
          {t.community.feedCategories.following}
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
            {t.commB.retry}
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
        {showGoLive && <GoLive onClose={() => setShowGoLive(false)} />}
        {watchingLive && <LiveViewer sessionId={watchingLive} onClose={clearWatchRequest} />}
      </AnimatePresence>
    </div>
  );
}
