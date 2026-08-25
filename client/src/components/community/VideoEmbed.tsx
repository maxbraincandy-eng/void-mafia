/**
 * The video player in the feed.
 *
 * THE VIDEO, AT THE SHAPE IT WAS FILMED
 * ─────────────────────────────────────
 * A player that guesses 16:9 puts a vertical video in a black letterbox with
 * the subject the size of a stamp. So the shape comes from the service itself:
 * `/api/oembed` returns the poster's real pixel dimensions, and the frame is
 * built from those. Only until that answers does the platform's usual
 * orientation stand in — and when it arrives the frame settles to the truth.
 *
 * IT STARTS WHEN YOU SCROLL TO IT
 * ───────────────────────────────
 * A feed video that needs a tap is a feed video nobody watches. So the player
 * that is most centred in the viewport plays, muted, and stops the moment
 * something else takes its place — one at a time, decided in `videoAutoplay`,
 * because no player can see the others. Muted is not a choice: it is the only
 * autoplay a browser will allow without a gesture. A tap on the speaker turns
 * the sound on, and that tap is the gesture.
 *
 * WHAT DOES NOT AUTOPLAY, AND WHY
 * ───────────────────────────────
 * YouTube, Vimeo, Twitch and a bare file hand over a player that is all video
 * and answers to us. TikTok's embed plays inline but cannot be driven from
 * outside its frame, so it waits for a tap. Instagram publishes nothing but its
 * whole card — white, with a follow button and a comment box — so it is not
 * embedded at all; it gets our own tile and opens in Instagram.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { parseVideoLink, embedSrc, type VideoLink } from '@/lib/videoLink';
import { registerAutoplay, claimPlayback } from '@/lib/videoAutoplay';

interface Props {
  /** A URL, or a piece of text with one in it. Give this or `link`. */
  source?: string | null;
  /** Pre-parsed, when the caller already did the work. */
  link?: VideoLink | null;
  /** Portrait players are capped at this height, so one post is not the page. */
  maxPortraitHeight?: number;
  /** Off in the composer preview and the profile lightbox — one video, no feed. */
  autoplay?: boolean;
}

/** What `/api/oembed` tells us about a link. */
interface Meta { thumbnail: string | null; width: number | null; height: number | null }

/**
 * Ask the server what this video looks like — once per URL, per session.
 *
 * The same post scrolls in and out of view a dozen times, and each of those is
 * the same answer. The cache is module-level so a post seen in the feed and
 * again in a profile does not ask twice, and in-flight requests are shared so a
 * grid of six does not fire six identical fetches on mount.
 */
const metaCache = new Map<string, Meta>();
const inFlight = new Map<string, Promise<Meta>>();

function fetchMeta(url: string): Promise<Meta> {
  const hit = metaCache.get(url);
  if (hit) return Promise.resolve(hit);
  const running = inFlight.get(url);
  if (running) return running;

  const p = fetch(`/api/oembed?url=${encodeURIComponent(url)}`)
    .then(r => r.json())
    .then((d: any) => ({
      thumbnail: typeof d?.thumbnail === 'string' ? d.thumbnail : null,
      width: typeof d?.width === 'number' ? d.width : null,
      height: typeof d?.height === 'number' ? d.height : null,
    }))
    .catch(() => ({ thumbnail: null, width: null, height: null }))
    .then(m => { metaCache.set(url, m); inFlight.delete(url); return m; });

  inFlight.set(url, p);
  return p;
}

function useMeta(link: VideoLink | null): Meta | null {
  const [meta, setMeta] = useState<Meta | null>(() => (link ? metaCache.get(link.url) ?? null : null));
  useEffect(() => {
    if (!link) return;
    // A direct file and an unrecognised link have nothing to look up.
    if (link.platform === 'file' || link.platform === 'link') return;
    let live = true;
    fetchMeta(link.url).then(m => { if (live) setMeta(m); });
    return () => { live = false; };
  }, [link?.url, link?.platform]);
  return meta;
}

/**
 * The frame's aspect ratio.
 *
 * From the service when it has told us, from the platform's habit until then.
 * Clamped because a 21:9 trailer and a 9:21 screen recording both exist, and
 * neither should be allowed to become the whole page or a slit.
 */
function aspectOf(link: VideoLink, meta: Meta | null): number {
  const w = meta?.width, h = meta?.height;
  if (w && h) return Math.min(1.85, Math.max(0.5, w / h));
  return link.portrait ? 9 / 16 : 16 / 9;
}

export function VideoEmbed({ source, link: given, maxPortraitHeight = 560, autoplay = true }: Props) {
  const link = given ?? parseVideoLink(source);
  const meta = useMeta(link);

  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  /** Mounted: the player exists. Active: it should be running. */
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const [muted, setMuted] = useState(true);

  const canAuto = autoplay && Boolean(link?.autoplayable);

  /**
   * Tell a YouTube or Vimeo iframe what to do.
   *
   * Both accept commands by postMessage without loading their JS library, which
   * is the whole reason the iframe can stay mounted while it is off screen: a
   * paused player costs nothing, and tearing it down means re-buffering the
   * whole video on the way back up the feed.
   */
  const command = useCallback((action: 'play' | 'pause' | 'mute' | 'unmute') => {
    const win = frameRef.current?.contentWindow;
    if (!win || !link) return;
    try {
      if (link.platform === 'youtube') {
        const func = action === 'play' ? 'playVideo' : action === 'pause' ? 'pauseVideo' : action === 'mute' ? 'mute' : 'unMute';
        win.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
      } else if (link.platform === 'vimeo') {
        const method = action === 'play' ? 'play' : action === 'pause' ? 'pause' : 'setVolume';
        const value = action === 'mute' ? 0 : action === 'unmute' ? 1 : undefined;
        win.postMessage(JSON.stringify(value === undefined ? { method } : { method, value }), '*');
      }
    } catch { /* a cross-origin frame that is not ready yet; the next call lands */ }
  }, [link?.platform]);

  // ── Autoplay: the manager decides, this just obeys ────────────────────────
  useEffect(() => {
    if (!canAuto || !boxRef.current) return;
    return registerAutoplay(
      boxRef.current,
      () => { setMounted(true); setActive(true); },
      () => { setActive(false); },
    );
  }, [canAuto]);

  // Drive whatever is actually in the frame.
  useEffect(() => {
    if (!mounted) return;
    const v = videoRef.current;
    if (v) {
      if (active) v.play().catch(() => { /* the browser refused; the poster stays */ });
      else v.pause();
      return;
    }
    command(active ? 'play' : 'pause');
  }, [active, mounted, command]);

  // Sound follows the button, on both kinds of player.
  useEffect(() => {
    if (!mounted) return;
    if (videoRef.current) { videoRef.current.muted = muted; return; }
    command(muted ? 'mute' : 'unmute');
  }, [muted, mounted, command]);

  if (!link) return null;

  // Not playable here — an honest card that opens where it lives.
  if (!link.embedUrl) return <VideoLinkChip link={link} />;

  const aspect = aspectOf(link, meta);
  const portrait = aspect < 1;
  /*
   * Cap the width, not the height.
   *
   * Capping the height leaves the frame at the full column width, so a 9:16
   * player ends up in a 0.69 box and the video letterboxes inside it with black
   * down both sides — the exact thing the true aspect ratio was fetched to
   * avoid. Deriving the width from the height ceiling keeps the frame the shape
   * of the video and centres it in the column.
   */
  const frameStyle: React.CSSProperties = portrait
    ? { aspectRatio: String(aspect), maxWidth: Math.round(maxPortraitHeight * aspect), margin: '0 auto' }
    : { aspectRatio: String(aspect) };

  const startByHand = () => {
    if (boxRef.current) claimPlayback(boxRef.current);
    setMounted(true);
    setActive(true);
    setMuted(false);          // a deliberate tap wants sound
  };

  return (
    <div ref={boxRef} className="relative w-full rounded-xl overflow-hidden" style={{ background: '#000', ...frameStyle }}>
      {mounted ? (
        link.platform === 'file' ? (
          <video
            ref={videoRef}
            src={link.url}
            className="absolute inset-0 w-full h-full object-contain"
            playsInline loop muted={muted} controls={!canAuto}
            preload="metadata"
          />
        ) : (
          <iframe
            ref={frameRef}
            src={embedSrc(link, { autoplay: true, muted })!}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 w-full h-full"
            style={{ border: 'none' }}
          />
        )
      ) : (
        <button onClick={startByHand} className="absolute inset-0 w-full h-full group" aria-label={`Play ${link.label}`}>
          <VideoPoster link={link} meta={meta} showLabel={false} />
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.3)' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center transition-transform group-active:scale-90"
              style={{ background: link.color, boxShadow: `0 4px 26px ${link.color}80` }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 2 }}><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        </button>
      )}

      {/*
        Sound.
        Autoplay is muted because that is the only autoplay a browser permits, so
        without this the feed is silent and there is nothing on screen that says
        it does not have to be. It sits over the player rather than under it —
        the control belongs to the video, not to the post.
      */}
      {mounted && canAuto && (
        <button
          onClick={e => { e.stopPropagation(); setMuted(m => !m); }}
          className="absolute top-2 left-2 w-9 h-9 rounded-full flex items-center justify-center text-[15px] transition-transform active:scale-90"
          style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)' }}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >{muted ? '🔇' : '🔊'}</button>
      )}

      {!mounted && (
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded font-mono text-[10px] font-bold text-white pointer-events-none"
          style={{ background: `${link.color}d9` }}>{link.label}</div>
      )}
    </div>
  );
}

/**
 * A video as a still, for a grid cell or behind a play button.
 *
 * The profile grids used to put the page URL into a `<video src>` — which is an
 * HTML document, not a video file, so every TikTok and YouTube tile was a black
 * square. This prefers the poster the service publishes, falls back to its own
 * colour, and never shows the browser's broken-image glyph.
 */
export function VideoPoster({ source, link: given, meta, showLabel = true }: {
  source?: string | null; link?: VideoLink | null; meta?: Meta | null; showLabel?: boolean;
}) {
  const link = given ?? parseVideoLink(source);
  const own = useMeta(meta === undefined ? link : null);
  const resolved = meta ?? own;
  /*
   * A poster that 404s falls back to the branded tile.
   *
   * YouTube keeps serving a thumbnail URL for a video that has been deleted or
   * made private, and what comes back is not an image — without this the cell is
   * the browser's broken-image glyph on black, which looks like the app is
   * broken rather than like the video is gone. TikTok's poster URLs are signed
   * and do expire, so this is a matter of when, not if.
   */
  const [failed, setFailed] = useState(false);
  const src = (resolved?.thumbnail ?? link?.thumbUrl) || null;
  useEffect(() => { setFailed(false); }, [src]);
  if (!link) return null;

  if (link.platform === 'file') {
    return <video src={link.url} className="absolute inset-0 w-full h-full object-cover" muted playsInline preload="metadata" />;
  }
  if (src && !failed) {
    return <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setFailed(true)} />;
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
 * A video that lives somewhere we cannot play it.
 *
 * Instagram is the reason this is not a last resort but a real design: its only
 * embed is a white card with a follow button and a comment box, which in a dark
 * feed reads as a broken page. A poster in the video's own shape, with the
 * service's mark and one obvious way in, is better than that — and honest about
 * where the video actually is.
 */
export function VideoLinkChip({ link }: { link: VideoLink }) {
  const meta = useMeta(link);
  const aspect = aspectOf(link, meta);
  const portrait = aspect < 1;

  let host = link.url;
  try { host = new URL(link.url).hostname.replace(/^www\./, ''); } catch { /* keep the raw string */ }

  // Nothing to show a picture of — the compact row is the right size for it.
  if (link.platform === 'link') {
    return (
      <a href={link.url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors"
        style={{ background: `${link.color}14`, border: `1px solid ${link.color}44` }}>
        <span className="text-base">🔗</span>
        <span className="min-w-0 flex-1">
          <span className="block font-display font-bold text-[12px]" style={{ color: link.color }}>{link.label}</span>
          <span className="block font-mono text-[10px] text-white/40 truncate">{host}</span>
        </span>
        <span className="font-mono text-[10px] text-white/35 whitespace-nowrap">გახსნა ↗</span>
      </a>
    );
  }

  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer"
      className="relative block w-full rounded-xl overflow-hidden group"
      style={{
        background: '#000',
        aspectRatio: String(aspect),
        ...(portrait ? { maxWidth: Math.round(560 * aspect), margin: '0 auto' } : {}),
      }}>
      <VideoPoster link={link} meta={meta} showLabel={false} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.62))' }} />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center transition-transform group-active:scale-90"
          style={{ background: link.color, boxShadow: `0 4px 26px ${link.color}80` }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 2 }}><path d="M8 5v14l11-7z" /></svg>
        </div>
      </div>
      <div className="absolute bottom-0 inset-x-0 flex items-center justify-between gap-2 px-3 py-2">
        <span className="font-display font-bold text-[11px]" style={{ color: link.color }}>{link.label}</span>
        <span className="font-mono text-[10px] text-white/70">გახსნა ↗</span>
      </div>
    </a>
  );
}
