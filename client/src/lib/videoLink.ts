/**
 * Recognising a video link, and knowing how to play it.
 *
 * WHY LINKS AND NOT UPLOADS
 * ─────────────────────────
 * Every other piece of media in the feed is a base64 data URL sitting in a
 * Postgres text column, and every new post is broadcast whole to every
 * connected client. A photo survives that at half a megabyte. A video does not:
 * even fifteen compressed seconds is several megabytes, multiplied by however
 * many people are online at the moment somebody posts. A link costs a hundred
 * bytes and plays from somebody else's CDN.
 *
 * WHAT THIS FILE IS
 * ─────────────────
 * One place that turns a pasted URL into everything the UI needs: which service
 * it is, what to put in the iframe, what shape the player should be, and what
 * to show before anybody presses play. Three screens used to each do their own
 * half of this with their own YouTube regex, which is why a TikTok link showed
 * up in the feed as raw text.
 *
 * NOTHING IS FETCHED
 * ──────────────────
 * Parsing is pure string work — no network, no oEmbed call, no API key. That
 * keeps it usable in a render pass and in the composer's live preview, and it
 * means a link nobody recognises degrades to an honest "open this elsewhere"
 * chip rather than a spinner that never resolves.
 */

export type VideoPlatform =
  | 'youtube' | 'tiktok' | 'instagram' | 'vimeo' | 'facebook' | 'twitch' | 'file' | 'link';

export interface VideoLink {
  platform: VideoPlatform;
  /** The original URL, for the "open there" fallback. */
  url: string;
  /** What goes in the iframe — null when the service cannot be embedded. */
  embedUrl: string | null;
  /** A poster to show before play, when the service exposes one without an API. */
  thumbUrl: string | null;
  /** Player shape. Shorts, Reels and TikToks are filmed the other way up. */
  portrait: boolean;
  /** Service name for the badge. */
  label: string;
  /** Badge colour — each service's own. */
  color: string;
}

const YT = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^&\s]*&)*v=|shorts\/|embed\/|live\/))([a-zA-Z0-9_-]{11})/;
const YT_SHORTS = /youtube\.com\/shorts\//;
const TIKTOK_FULL = /tiktok\.com\/@[^/\s]+\/video\/(\d{6,})/;
const TIKTOK_SHORT = /(?:vm|vt)\.tiktok\.com\/([A-Za-z0-9]+)/;
const INSTAGRAM = /instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;
const VIMEO = /vimeo\.com\/(?:video\/)?(\d{6,})/;
const TWITCH_VOD = /twitch\.tv\/videos\/(\d+)/;
const TWITCH_CLIP = /(?:clips\.twitch\.tv\/|twitch\.tv\/\S+\/clip\/)([A-Za-z0-9_-]+)/;
const FACEBOOK = /(?:facebook\.com|fb\.watch)\/\S*(?:videos?|watch|reel)\S*/;
const FILE = /^https?:\/\/\S+\.(mp4|webm|ogv|mov|m4v)(\?\S*)?$/i;

/** Any http(s) URL in a blob of text. */
const ANY_URL = /https?:\/\/[^\s<>"']+/;

/**
 * The domain Twitch is asked to trust.
 *
 * Twitch refuses to play in an iframe unless `parent` matches the page's actual
 * hostname, so this is read at runtime rather than hardcoded — otherwise the
 * player is blank on localhost and on every preview deploy.
 */
function twitchParent(): string {
  try { return window.location.hostname || 'voidmafia.one'; } catch { return 'voidmafia.one'; }
}

/**
 * Parse a URL — or the first URL inside a piece of text — into a playable link.
 *
 * Returns null when there is no URL at all. A URL that is not a video comes
 * back as `platform: 'link'` with no embed, which is a real answer: the caller
 * shows a chip instead of guessing.
 */
export function parseVideoLink(text: string | null | undefined): VideoLink | null {
  if (!text) return null;
  const raw = text.trim();
  const url = (raw.match(ANY_URL) ?? [])[0] ?? (raw.startsWith('http') ? raw : null);
  if (!url) return null;

  const yt = url.match(YT);
  if (yt) {
    const id = yt[1]!;
    return {
      platform: 'youtube', url,
      embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
      // maxresdefault 404s on a lot of videos and leaves a broken frame;
      // hqdefault exists for every one of them.
      thumbUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      portrait: YT_SHORTS.test(url),
      label: 'YouTube', color: '#ff0033',
    };
  }

  const tt = url.match(TIKTOK_FULL);
  if (tt) {
    return {
      platform: 'tiktok', url,
      embedUrl: `https://www.tiktok.com/embed/v2/${tt[1]!}`,
      thumbUrl: null, portrait: true,
      label: 'TikTok', color: '#25f4ee',
    };
  }
  /*
   * A vm.tiktok.com link hides the video id behind a redirect, and following it
   * needs a server round trip. Rather than fetch, it is shown as a card that
   * opens TikTok — which is what a viewer wants from a share link anyway.
   */
  if (TIKTOK_SHORT.test(url)) {
    return { platform: 'tiktok', url, embedUrl: null, thumbUrl: null, portrait: true, label: 'TikTok', color: '#25f4ee' };
  }

  const ig = url.match(INSTAGRAM);
  if (ig) {
    return {
      platform: 'instagram', url,
      embedUrl: `https://www.instagram.com/p/${ig[1]!}/embed/captioned/`,
      thumbUrl: null, portrait: true,
      label: 'Instagram', color: '#e1306c',
    };
  }

  const vm = url.match(VIMEO);
  if (vm) {
    return {
      platform: 'vimeo', url,
      embedUrl: `https://player.vimeo.com/video/${vm[1]!}?autoplay=1&playsinline=1`,
      thumbUrl: null, portrait: false,
      label: 'Vimeo', color: '#1ab7ea',
    };
  }

  const tv = url.match(TWITCH_VOD);
  if (tv) {
    return {
      platform: 'twitch', url,
      embedUrl: `https://player.twitch.tv/?video=${tv[1]!}&parent=${twitchParent()}&autoplay=true`,
      thumbUrl: null, portrait: false,
      label: 'Twitch', color: '#9146ff',
    };
  }
  const tc = url.match(TWITCH_CLIP);
  if (tc) {
    return {
      platform: 'twitch', url,
      embedUrl: `https://clips.twitch.tv/embed?clip=${tc[1]!}&parent=${twitchParent()}&autoplay=true`,
      thumbUrl: null, portrait: false,
      label: 'Twitch', color: '#9146ff',
    };
  }

  if (FILE.test(url)) {
    return { platform: 'file', url, embedUrl: url, thumbUrl: null, portrait: false, label: 'ვიდეო', color: '#a855f7' };
  }

  if (FACEBOOK.test(url)) {
    return {
      platform: 'facebook', url,
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`,
      thumbUrl: null, portrait: false,
      label: 'Facebook', color: '#1877f2',
    };
  }

  return { platform: 'link', url, embedUrl: null, thumbUrl: null, portrait: false, label: 'ბმული', color: '#8b8b9e' };
}

/** Is this something we can actually play in the feed? */
export function isPlayable(link: VideoLink | null): boolean {
  return Boolean(link && link.embedUrl && link.platform !== 'link');
}

/**
 * The best still we can show for a post without playing it.
 *
 * Only YouTube hands one over without an API call, so everywhere that wants a
 * grid thumbnail asks here and falls back to a branded tile when the answer is
 * null — rather than each screen re-deriving the YouTube URL for itself.
 */
export function videoThumb(text: string | null | undefined): string | null {
  return parseVideoLink(text)?.thumbUrl ?? null;
}

/**
 * Back-compat for the three screens that only ever knew about YouTube.
 *
 * @deprecated Prefer `parseVideoLink`, which recognises the other five.
 */
export function extractYouTubeId(text: string): string | null {
  const m = text?.match(YT);
  return m ? m[1]! : null;
}
