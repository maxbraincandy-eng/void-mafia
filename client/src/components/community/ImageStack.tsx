import { useRef, useState } from 'react';
import type { CommunityPostV2 } from '@/types/index';
/**
 * One image, or a swipeable stack of them.
 *
 * Scroll-snap rather than a JS carousel: the browser already knows how to
 * throw a row of full-width panes with momentum, and it does it on the
 * compositor, which a touch handler in React cannot match. The dots read the
 * scroll position instead of driving it, so a flick, a drag and a trackpad all
 * work without three separate code paths.
 */
export function ImageStack({ post, maxHeight = 560 }: { post: CommunityPostV2; maxHeight?: number | string }) {
  const urls = post.imageUrls?.length ? post.imageUrls : (post.imageUrl ? [post.imageUrl] : []);
  const [at, setAt] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative">
      <div
        ref={railRef}
        onScroll={e => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== at) setAt(Math.max(0, Math.min(urls.length - 1, i)));
        }}
        className="flex w-full rounded-xl border border-white/10 overflow-x-auto"
        style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {urls.map(frame)}
      </div>

      {/* Count, so you know there is more before you swipe. */}
      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full font-mono pointer-events-none"
        style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10.5 }}>
        {at + 1}/{urls.length}
      </div>

      <div className="flex justify-center gap-1.5 mt-1.5">
        {urls.map((_, i) => (
          <span key={i} className="rounded-full transition-all"
            style={{
              width: i === at ? 14 : 5, height: 5,
              background: i === at ? '#c084fc' : 'rgba(255,255,255,0.22)',
            }} />
        ))}
      </div>
    </div>
  );
}

