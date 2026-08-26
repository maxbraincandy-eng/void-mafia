import { useRef, useState, useEffect, useCallback } from 'react';
import type { CommunityPostV2 } from '@/types/index';
/**
 * One image, or a swipeable stack of them.
 *
 * Scroll-snap rather than a JS carousel: the browser already knows how to
 * throw a row of full-width panes with momentum, and it does it on the
 * compositor, which a touch handler in React cannot match. The dots read the
 * scroll position instead of driving it, so a flick, a drag and a trackpad all
 * work without three separate code paths.
 *
 * A MOUSE CANNOT SWIPE
 * ────────────────────
 * Which is the whole problem with leaving it at that. On a phone the rail is
 * perfect; on a desktop a wheel scrolls the page vertically, horizontal scroll
 * needs a modifier nobody thinks to press, and the dots were decoration — so a
 * post with four photos showed one photo and no way to reach the other three.
 *
 * So there are arrows for pointers, the dots are buttons, and the arrow keys
 * work when the rail has focus. All three move the same scroll position the
 * swipe does; none of them is a second carousel.
 */
export function ImageStack({ post, maxHeight = 560 }: { post: CommunityPostV2; maxHeight?: number | string }) {
  const urls = post.imageUrls?.length ? post.imageUrls : (post.imageUrl ? [post.imageUrl] : []);
  const [at, setAt] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);

  /**
   * Is there a pointer to aim with?
   *
   * Arrows on a touch screen are clutter over the photo — the swipe is right
   * there. Arrows on a desktop are the only way through. `(hover: hover)` is
   * the question that actually separates the two; a width breakpoint would put
   * arrows on a tablet held in two hands and none on a small laptop.
   */
  const [hasPointer, setHasPointer] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => setHasPointer(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  /** Move to a pane by scrolling the rail — the same thing a swipe does. */
  const goTo = useCallback((i: number) => {
    const el = railRef.current;
    if (!el) return;
    const target = Math.max(0, Math.min(urls.length - 1, i));
    el.scrollTo({ left: target * el.clientWidth, behavior: 'smooth' });
    // Set it here too: the scroll handler will confirm it, but on a rail that
    // is already at the end the browser fires no scroll event at all and the
    // dots would sit one behind.
    setAt(target);
  }, [urls.length]);

  if (urls.length === 0) return null;

  const frame = (src: string, key: number) => (
    <div key={key}
      className="flex-shrink-0 w-full flex items-center justify-center bg-black"
      style={{ scrollSnapAlign: 'center', maxHeight }}>
      <img src={src} alt="" className="select-none" draggable={false}
        style={{ maxWidth: '100%', maxHeight, width: 'auto', height: 'auto', objectFit: 'contain' }} />
    </div>
  );

  if (urls.length === 1) {
    return (
      <div className="w-full rounded-xl border border-white/10 overflow-hidden bg-black flex items-center justify-center" style={{ maxHeight }}>
        {/* object-contain so vertical photos show in full (letterboxed) while
            horizontal photos still fill the width without being cropped. */}
        <img src={urls[0]} alt="" className="select-none" draggable={false}
          style={{ maxWidth: '100%', maxHeight, width: 'auto', height: 'auto', objectFit: 'contain' }} />
      </div>
    );
  }

  const arrow = (dir: -1 | 1) => {
    const hidden = dir === -1 ? at === 0 : at === urls.length - 1;
    return (
      <button
        onClick={e => { e.stopPropagation(); goTo(at + dir); }}
        aria-label={dir === -1 ? 'Previous image' : 'Next image'}
        className="absolute top-1/2 flex items-center justify-center rounded-full transition-opacity"
        style={{
          [dir === -1 ? 'left' : 'right']: 8,
          transform: 'translateY(-50%)',
          width: 34, height: 34,
          background: 'rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,255,255,0.2)',
          backdropFilter: 'blur(6px)',
          color: '#fff',
          // Hidden at the ends rather than removed, so the other arrow does not
          // jump sideways as you reach the first or last photo.
          opacity: hidden ? 0 : 1,
          pointerEvents: hidden ? 'none' : 'auto',
          cursor: 'pointer',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          {dir === -1 ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
        </svg>
      </button>
    );
  };

  return (
    <div className="relative">
      <div
        ref={railRef}
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(at - 1); }
          if (e.key === 'ArrowRight') { e.preventDefault(); goTo(at + 1); }
        }}
        onScroll={e => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== at) setAt(Math.max(0, Math.min(urls.length - 1, i)));
        }}
        className="flex w-full rounded-xl border border-white/10 overflow-x-auto"
        style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', outline: 'none' }}
      >
        {urls.map(frame)}
      </div>

      {/* Count, so you know there is more before you swipe. */}
      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full font-mono pointer-events-none"
        style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10.5 }}>
        {at + 1}/{urls.length}
      </div>

      {hasPointer && <>{arrow(-1)}{arrow(1)}</>}

      {/* Dots are buttons now. They always looked like controls; on a desktop
          they were the only thing that looked like one, and did nothing. */}
      <div className="flex justify-center gap-1.5 mt-1.5">
        {urls.map((_, i) => (
          <button key={i} onClick={e => { e.stopPropagation(); goTo(i); }}
            aria-label={`Image ${i + 1}`}
            className="rounded-full transition-all"
            style={{
              width: i === at ? 14 : 5, height: 5,
              background: i === at ? '#c084fc' : 'rgba(255,255,255,0.22)',
              border: 'none', padding: 0, cursor: 'pointer',
            }} />
        ))}
      </div>
    </div>
  );
}
