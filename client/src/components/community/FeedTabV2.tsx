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
import { LiveStrip, LiveDot } from '@/components/live/LiveStrip';
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
   * Am I live?
   *
   * Read from the same store the strip fills, so going live on a phone shows
   * on a laptop — the one thing a host most needs to be able to check, and it
   * had no answer anywhere in the app.
   */
  const myProfileId = useAuthStore(s => s.profile?.id) ?? '';
  const iAmLive = useLiveStore(s => Boolean(myProfileId && s.live[myProfileId]));

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
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-6">
      <AvatarStatusStyles />

      {/* Main social header: clear hierarchy, with profile kept out of feed filters. */}
      <header className="flex items-center justify-between gap-3 pt-1">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-violet-300/70">VOID SOCIAL</p>
          <h2 className="font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
            {t.community.feed.title}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onOpenMyProfile && (
            <button
              type="button"
              onClick={onOpenMyProfile}
              aria-label={t.commB.myProfile}
              title={t.commB.myProfile}
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.05] transition-colors hover:border-violet-300/50 hover:bg-white/[0.08] active:scale-95"
            >
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : profile?.avatar ? (
                <span className="text-lg leading-none">{profile.avatar}</span>
              ) : (
                <span className="text-sm font-semibold text-white/70">U</span>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowGoLive(true)}
            className="flex h-10 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-all active:scale-95"
            style={{
              background: iAmLive ? 'rgba(255,45,85,0.16)' : 'rgba(255,255,255,0.04)',
              borderColor: iAmLive ? 'rgba(255,75,105,0.55)' : 'rgba(255,255,255,0.10)',
              color: iAmLive ? '#ff7890' : 'rgba(255,255,255,0.78)',
              animation: iAmLive ? 'liveRingPulse 1.8s ease-in-out infinite' : undefined,
            }}
            title={iAmLive ? 'შენ ეთერში ხარ' : 'პირდაპირი ეთერი'}
          >
            <LiveDot size={10} color={iAmLive ? '#ff7890' : '#ff647f'} />
            <span>{iAmLive ? 'LIVE' : 'Live'}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowComposer(true)}
            aria-label="პოსტის შექმნა"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-300/25 bg-violet-400/15 text-xl font-light text-violet-100 transition-all hover:bg-violet-400/25 active:scale-95"
          >
            +
          </button>
        </div>
      </header>

      {/* Live broadcasts stay visible, but no longer compete with the page title. */}
      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3 py-3 sm:px-4">
        <LiveStrip
          onWatch={id => useLiveStore.getState().requestWatch(id)}
          onResume={() => setShowGoLive(true)}
        />
      </section>

      {activeHashtag && (
        <div className="flex items-center gap-2 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-2">
          <span className="text-xs font-semibold text-cyan-200">#{activeHashtag}</span>
          <button
            type="button"
            onClick={() => setActiveHashtag(null)}
            aria-label="Clear hashtag filter"
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>
      )}

      {/* Stories are a primary social action, not another feed filter. */}
      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#151720]/80 px-3 py-3 sm:px-4">
        <StoriesStrip onOpenProfile={onOpenProfile} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3 py-3 sm:px-4">
        <FriendsPresenceStrip onOpenProfile={onOpenProfile} />
      </section>

      {/* Compact feed switcher. Profile is a destination, not a feed category. */}
      <nav
        aria-label="Feed filters"
        className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-[#151720]/90 p-1"
      >
        {([
          { id: 'all' as FeedCategory, label: t.community.feedCategories.all },
          { id: 'following' as FeedCategory, label: t.community.feedCategories.following },
        ]).map(item => {
          const active = feedCategory === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => pickCategory(item.id)}
              aria-pressed={active}
              className="min-h-10 flex-1 rounded-lg px-4 py-2 text-xs font-semibold transition-all active:scale-[0.98]"
              style={{
                color: active ? '#fff' : 'rgba(255,255,255,0.48)',
                background: active ? 'linear-gradient(110deg, rgba(139,92,246,0.25), rgba(99,102,241,0.13))' : 'transparent',
                boxShadow: active ? 'inset 0 0 0 1px rgba(167,139,250,0.22)' : 'none',
              }}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {loading ? (
        <div className="space-y-3 pt-1">
          {Array.from({ length: 3 }, (_, i) => <SkeletonPost key={i} />)}
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] py-12">
          <span className="text-2xl">📡</span>
          <p className="max-w-xs text-center text-xs text-white/50">{loadError}</p>
          <button
            type="button"
            onClick={doLoad}
            className="rounded-xl border border-violet-300/25 bg-violet-400/15 px-4 py-2 text-xs font-semibold text-violet-100 transition-colors hover:bg-violet-400/25 active:scale-95"
          >
            {t.commB.retry}
          </button>
        </div>
      ) : feedV2Posts.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3 py-5">
          <EmptyState text={t.community.feed.empty} />
        </div>
      ) : (
        <div className="space-y-4">
          {feedV2Posts.map(post => (
            <PostCardV2 key={post.id} post={post} onOpenProfile={onOpenProfile} />
          ))}
          <div ref={bottomRef} className="h-4" />
          {loadingMore && <Spinner color="#a78bfa" />}
        </div>
      )}

      <AnimatePresence>
        {showComposer && <PostComposerV2 onClose={() => setShowComposer(false)} />}
        {/* The viewer itself is global in App.tsx; mounting it here would double-join. */}
        {showGoLive && <GoLive onClose={() => setShowGoLive(false)} />}
      </AnimatePresence>
    </div>
  );
}
