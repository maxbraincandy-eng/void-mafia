/**
 * Instagram, with the card cut away.
 *
 * THE PROBLEM
 * ───────────
 * Instagram publishes exactly one embed and it is the whole card: a white
 * header with an avatar and a "View profile" button, then the video, then an
 * action row, a like count, a caption and a comment box. No parameter turns any
 * of that off, the frame is cross-origin so its CSS is out of reach, and the
 * page behind `/reel/…/embed/` is a login wall with no video URL in it — there
 * is nothing to scrape and nothing to ask nicely for.
 *
 * Opening the app instead is not an answer. A video in the feed has to play in
 * the feed.
 *
 * THE CROP
 * ────────
 * So the iframe is pushed up inside a clipping box: the header slides out of
 * sight above, and the box ends where the video does, taking the footer with
 * it. What is left on screen is the video and nothing else.
 *
 * WHERE THE NUMBERS COME FROM
 * ───────────────────────────
 * Measured off a production screenshot of this app on an iPhone, card width 293
 * CSS px: the header ran 54px, and the media sat between it and the footer at
 * the video's own aspect ratio. The header is a fixed-height row — a 32px
 * avatar and two lines of small text — so it does not move with the card width,
 * which is why it is a constant here rather than a fraction.
 *
 * THE HEIGHT IS NOT GUESSED
 * ─────────────────────────
 * Instagram's own embed script sizes these frames by having the frame post its
 * height to the parent, and the frame does that whether or not their script is
 * the one listening. So the total is measured, not assumed, and the video's
 * height falls out of it:
 *
 *     video = total − header − footer
 *
 * `/embed/` rather than `/embed/captioned/` is deliberate: without the caption
 * the footer is a fixed stack of rows, so it can be a constant. With the
 * caption it grows with however much somebody wrote, and nothing here could
 * know that.
 *
 * FAILING THE RIGHT WAY
 * ─────────────────────
 * Two ways this can be wrong, and they are not equally bad. Cropping slightly
 * too much loses a few pixels off the bottom of the video, which nobody sees.
 * Cropping slightly too little shows a white strip in a dark feed, which
 * everybody sees. So the footer constant is deliberately generous, and it
 * errs into the video.
 *
 * And if the height message never arrives — Instagram changes it, a browser
 * blocks it, the frame fails to load — the crop is abandoned and the whole card
 * is shown instead. An ugly card that plays beats a beautiful sliver that does
 * not.
 */

import { useEffect, useRef, useState } from 'react';

/** The embed's header: avatar, username, "View profile". Fixed height. */
const HEADER_PX = 54;

/**
 * Everything below the video in the uncaptioned embed: the "View more on
 * Instagram" bar, the action icons, the like count and the comment row.
 *
 * Rounded up on purpose — see FAILING THE RIGHT WAY. Two or three pixels of
 * video is a cheaper mistake than two or three pixels of white.
 */
const FOOTER_PX = 232;

/**
 * Outside this range the frame measured something that is not a post — a
 * collapsed layout, or a login wall.
 *
 * Note what is NOT a reason to give up: a video simply being taller than the
 * feed wants. That crops to the ceiling and keeps the header off screen, which
 * is the whole point. Treating it as a bad measurement put the white header
 * back on screen for exactly the tall portrait posts this was built for.
 */
const MIN_VIDEO_PX = 120;
const MAX_VIDEO_PX = 4000;

/** If Instagram has not said how tall it is by now, it is not going to. */
const MEASURE_TIMEOUT_MS = 4000;

interface Props {
  /** The post or reel URL. */
  url: string;
  /** Shortcode from the URL — what the embed is addressed by. */
  code: string;
  /** Shown until the frame is asked for, and if it never answers. */
  poster?: React.ReactNode;
  /** Ceiling for the visible video, before the crop maths. */
  maxHeight?: number;
}

type Phase =
  | { at: 'idle' }
  | { at: 'measuring' }
  | { at: 'cropped'; videoPx: number }
  | { at: 'uncropped'; totalPx: number };

export function InstagramPlayer({ url, code, poster, maxHeight = 560 }: Props) {
  const [phase, setPhase] = useState<Phase>({ at: 'idle' });
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => { setPhase({ at: 'idle' }); }, [code]);

  useEffect(() => {
    if (phase.at !== 'measuring') return;

    /*
     * Only listen to the frame we opened.
     *
     * `message` is a page-wide event and any iframe or extension can fire it,
     * so the source window is checked against ours before a number from it is
     * allowed to resize anything. The origin is checked too — this is
     * Instagram's frame or it is nobody's.
     */
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      if (!/^https:\/\/(www\.)?instagram\.com$/.test(e.origin)) return;
      let total: number | null = null;
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        const h = Number(d?.details?.height ?? d?.height);
        if (Number.isFinite(h) && h > 0) total = h;
      } catch { return; }
      if (total === null) return;

      const videoPx = total - HEADER_PX - FOOTER_PX;
      // Implausible means the frame measured something that is not the post.
      // Showing the whole card is then the honest fallback — but a tall video
      // is not implausible, it is just tall, and it crops to the ceiling.
      setPhase(videoPx >= MIN_VIDEO_PX && videoPx <= MAX_VIDEO_PX
        ? { at: 'cropped', videoPx: Math.min(videoPx, maxHeight) }
        : { at: 'uncropped', totalPx: Math.min(total, maxHeight + HEADER_PX + FOOTER_PX) });
    };

    window.addEventListener('message', onMessage);
    const timer = setTimeout(() => {
      // No answer. Show the card whole rather than a crop built on a guess.
      setPhase(p => (p.at === 'measuring' ? { at: 'uncropped', totalPx: maxHeight } : p));
    }, MEASURE_TIMEOUT_MS);

    return () => { window.removeEventListener('message', onMessage); clearTimeout(timer); };
  }, [phase.at, maxHeight]);

  // Before the tap: our own poster, in our own colours.
  if (phase.at === 'idle') {
    return (
      <button onClick={() => setPhase({ at: 'measuring' })} className="relative block w-full" style={{ all: 'unset', display: 'block', width: '100%' }}>
        {poster}
      </button>
    );
  }

  const cropped = phase.at === 'cropped';
  const boxHeight = cropped ? phase.videoPx : phase.at === 'uncropped' ? phase.totalPx : maxHeight;

  return (
    <div className="relative w-full rounded-xl overflow-hidden" style={{ background: '#000', height: boxHeight }}>
      <iframe
        ref={frameRef}
        // No `captioned`: the caption is the one part of the footer whose
        // height nothing here could predict.
        src={`https://www.instagram.com/p/${code}/embed/`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        scrolling="no"
        referrerPolicy="strict-origin-when-cross-origin"
        style={{
          border: 'none',
          width: '100%',
          // Tall enough that the crop never runs off the bottom of the frame
          // and reveals the page behind it.
          height: boxHeight + HEADER_PX + FOOTER_PX,
          // Slide the header out of the top of the clipping box.
          marginTop: cropped ? -HEADER_PX : 0,
          display: 'block',
        }}
      />
      {/* Still measuring: black over the card so the header is never seen, even
          for the frame or two before the height comes back. */}
      {phase.at === 'measuring' && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#000' }}>
          <span className="font-mono text-[11px] text-white/35">იტვირთება…</span>
        </div>
      )}
      {/* One way out to the original, small and in the corner. */}
      <a href={url} target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="absolute bottom-2 right-2 px-2 py-1 rounded-lg font-mono text-[10px] text-white/80"
        style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)' }}
      >Instagram ↗</a>
    </div>
  );
}
