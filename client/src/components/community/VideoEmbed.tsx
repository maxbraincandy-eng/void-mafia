/**
 * The video player in the feed.
 *
 * NOTHING LOADS UNTIL SOMEBODY PRESSES PLAY
 * ─────────────────────────────────────────
 * A feed page holds twenty posts. Twenty live iframes is twenty third-party
 * players booting at once, each with its own scripts, its own cookies and its
 * own opinion about autoplay — on a phone that is a stall before the first post
 * is even readable. So every post renders a facade: a poster where the service
 * gives us one, a branded tile where it does not, and the iframe is mounted
 * only on the tap. One player at a time is also the right behaviour: nobody
 * wants two videos talking over each other.
 *
 * PORTRAIT IS A DIFFERENT SHAPE, NOT A SMALLER ONE
 * ────────────────────────────────────────────────
 * A Short, a Reel and a TikTok are filmed the other way up. Forced into 16:9
 * they sit in a black letterbox with the subject the size of a thumbnail. They
 * get a tall frame instead, capped so a single post cannot take the whole
 * screen and push everything else out of the feed.
 */

import { useState } from 'react';
import { parseVideoLink, type VideoLink } from '@/lib/videoLink';

interface Props {
  /** A URL, or a piece of text with one in it. Give this or `link`. */
  source?: string | null;
  /** Pre-parsed, when the caller already did the work. */
  link?: VideoLink | null;
  /** Portrait players are capped at this height, so one post is not the page. */
  maxPortraitHeight?: number;
}

export function VideoEmbed({ source, link: given, maxPortraitHeight = 520 }: Props) {
  const link = given ?? parseVideoLink(source);
  const [playing, setPlaying] = useState(false);
  if (!link) return null;

  // Not a video — an honest chip that says where it goes, and goes there.
  if (!link.embedUrl) {
    return <VideoLinkChip link={link} />;
  }

  // A direct file needs no third party and no facade: the browser is the player.
  if (link.platform === 'file') {
    return (
      <div className="relative w-full rounded-xl overflow-hidden" style={{ background: '#000' }}>
        <video src={link.url} controls playsInline preload="metadata"
          className="w-full" style={{ maxHeight: maxPortraitHeight, display: 'block' }} />
      </div>
    );
  }

  /*
   * Cap the width, not the height.
   *
   * Capping the height leaves the frame at the full column width, so a 9:16
   * player ends up in a 0.69 box and the video letterboxes inside it with black
   * down both sides — the exact thing the portrait shape was added to avoid.
   * Deriving the width from the height ceiling keeps the frame the shape of the
   * video and centres it in the column.
   */
  const frameStyle = link.portrait
    ? { aspectRatio: '9/16', maxWidth: Math.round(maxPortraitHeight * 9 / 16), margin: '0 auto' }
    : { aspectRatio: '16/9' };

  return (
    <div className="relative w-full rounded-xl overflow-hidden" style={{ background: '#000', ...frameStyle }}>
      {playing ? (
        <iframe
          src={link.embedUrl}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 w-full h-full"
          style={{ border: 'none' }}
        />
      ) : (
        <button onClick={() => setPlaying(true)} className="absolute inset-0 w-full h-full group" aria-label={`Play ${link.label}`}>
          <VideoPoster link={link} showLabel={false} />
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.32)' }} />

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center transition-transform group-active:scale-90"
              style={{ background: link.color, boxShadow: `0 4px 26px ${link.color}80` }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 2 }}><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>

          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded font-mono text-[10px] font-bold text-white"
            style={{ background: `${link.color}d9` }}>
            {link.label}
          </div>
        </button>
      )}
    </div>
  );
}

/**
 * A video as a still, for a grid cell.
 *
 * The profile grids used to put the page URL into a `<video src>` — which is an
 * HTML document, not a video file, so every TikTok and YouTube tile was a black
 * square. This shows the poster where the service publishes one and the
 * service's own colour where it does not, which is at least honest about what
 * is behind the cell.
 */
export function VideoPoster({ source, link: given, showLabel = true }: { source?: string | null; link?: VideoLink | null; showLabel?: boolean }) {
  const link = given ?? parseVideoLink(source);
  /*
   * A poster that 404s falls back to the branded tile.
   *
   * YouTube keeps serving a thumbnail URL for a video that has been deleted or
   * made private, and what comes back is not an image — without this the cell
   * is the browser's broken-image glyph on a black square, which looks like the
   * app is broken rather than like the video is gone.
   */
  const [failed, setFailed] = useState(false);
  if (!link) return null;

  if (link.platform === 'file') {
    return <video src={link.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />;
  }
  if (link.thumbUrl && !failed) {
    return <img src={link.thumbUrl} alt="" className="w-full h-full object-cover" onError={() => setFailed(true)} />;
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center"
      style={{ background: `radial-gradient(ellipse at 50% 45%, ${link.color}30, #08060f 74%)` }}>
      {showLabel && (
        <span className="font-display font-bold text-[9px] tracking-wide" style={{ color: `${link.color}cc` }}>
          {link.label.toUpperCase()}
        </span>
      )}
    </div>
  );
}

/**
 * A link we cannot play.
 *
 * It used to render as the raw URL in mono grey, which on a phone is a wrapped
 * line of query string. A chip says which service it is and that tapping opens
 * it — the two things a reader actually wants to know.
 */
export function VideoLinkChip({ link }: { link: VideoLink }) {
  let host = link.url;
  try { host = new URL(link.url).hostname.replace(/^www\./, ''); } catch { /* keep the raw string */ }
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors"
      style={{ background: `${link.color}14`, border: `1px solid ${link.color}44` }}>
      <span className="text-base">🎬</span>
      <span className="min-w-0 flex-1">
        <span className="block font-display font-bold text-[12px]" style={{ color: link.color }}>{link.label}</span>
        <span className="block font-mono text-[10px] text-white/40 truncate">{host}</span>
      </span>
      <span className="font-mono text-[10px] text-white/35 whitespace-nowrap">გახსნა ↗</span>
    </a>
  );
}
