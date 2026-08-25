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
  /** Player shape, before oEmbed tells us the real one. */
  portrait: boolean;
  /**
   * Does this service give us the video and nothing else?
   *
   * The difference that matters in a dark feed. YouTube, Vimeo and a bare file
   * hand over a player that is all video. Instagram hands over its whole card —
   * white background, avatar, follow button, like row, comment box — and there
   * is no parameter that turns any of it off. Dropping that into the feed looks
   * like a bug, so a service that cannot be stripped is not played inline at
   * all; it gets our own tile and opens in its own app.
   */
  bare: boolean;
  /** Can we start it muted on scroll and drive it afterwards? */
  autoplayable: boolean;
  /** Service name for the badge. */
  label: string;
  /** Badge colour — each service's own. */
  color: string;
}

/**
 * The iframe source for a given moment.
 *
 * Autoplay is a parameter rather than baked into `embedUrl` because the same
 * link is a still in the grid, a muted player scrolling past in the feed, and a
 * player with sound once somebody taps it — and each of those is a different
 * query string on the same video.
 */
export function embedSrc(link: VideoLink, opts: { autoplay?: boolean; muted?: boolean } = {}): string | null {
  if (!link.embedUrl) return null;
  const { autoplay = false, muted = true } = opts;
  switch (link.platform) {
    case 'youtube': {
      // enablejsapi lets the feed pause a player that scrolls away without
      // tearing the iframe down and re-buffering it on the way back.
      const q = `autoplay=${autoplay ? 1 : 0}&mute=${muted ? 1 : 0}&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&enablejsapi=1`;
      return `${link.embedUrl}?${q}`;
    }
    case 'vimeo':
      return `${link.embedUrl}?autoplay=${autoplay ? 1 : 0}&muted=${muted ? 1 : 0}&playsinline=1&title=0&byline=0&portrait=0`;
    case 'twitch':
      return `${link.embedUrl}&autoplay=${autoplay ? 'true' : 'false'}&muted=${muted ? 'true' : 'false'}`;
    default:
      return link.embedUrl;
  }
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
      embedUrl: `https://www.youtube.com/embed/${id}`,
      bare: true, autoplayable: true,
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
      // TikTok's embed carries a username and a caption, but it is dark and the
      // video is most of it — worth playing inline, not worth autoplaying,
      // since there is no way to drive it from outside the frame.
      bare: false, autoplayable: false,
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
    return { platform: 'tiktok', url, embedUrl: null, bare: false, autoplayable: false, thumbUrl: null, portrait: true, label: 'TikTok', color: '#25f4ee' };
  }

  const ig = url.match(INSTAGRAM);
  if (ig) {
    return {
      platform: 'instagram', url,
      /*
       * Deliberately not embedded.
       *
       * Instagram's only embed is the full card — white, with a header, a
       * follow button, a like row and a comment box — and none of it can be
       * turned off. In a dark feed it reads as a page from another site pasted
       * into the middle of a post. Its own tile, opening in Instagram, is the
       * better of the two bad options until a Facebook app token lets us at
       * least fetch the poster.
       */
      embedUrl: null, bare: false, autoplayable: false,
      thumbUrl: null, portrait: true,
      label: 'Instagram', color: '#e1306c',
    };
  }

  const vm = url.match(VIMEO);
  if (vm) {
    return {
      platform: 'vimeo', url,
      embedUrl: `https://player.vimeo.com/video/${vm[1]!}`,
      bare: true, autoplayable: true,
      thumbUrl: null, portrait: false,
      label: 'Vimeo', color: '#1ab7ea',
    };
  }

  const tv = url.match(TWITCH_VOD);
  if (tv) {
    return {
      platform: 'twitch', url,
      embedUrl: `https://player.twitch.tv/?video=${tv[1]!}&parent=${twitchParent()}`,
      bare: true, autoplayable: true,
      thumbUrl: null, portrait: false,
      label: 'Twitch', color: '#9146ff',
    };
  }
  const tc = url.match(TWITCH_CLIP);
  if (tc) {
    return {
      platform: 'twitch', url,
      embedUrl: `https://clips.twitch.tv/embed?clip=${tc[1]!}&parent=${twitchParent()}`,
      bare: true, autoplayable: true,
      thumbUrl: null, portrait: false,
      label: 'Twitch', color: '#9146ff',
    };
  }

  if (FILE.test(url)) {
    return { platform: 'file', url, embedUrl: url, bare: true, autoplayable: true, thumbUrl: null, portrait: false, label: 'ვიდეო', color: '#a855f7' };
  }

  if (FACEBOOK.test(url)) {
    return {
      platform: 'facebook', url,
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`,
      bare: false, autoplayable: false,
      thumbUrl: null, portrait: false,
      label: 'Facebook', color: '#1877f2',
    };
  }

  return { platform: 'link', url, embedUrl: null, bare: false, autoplayable: false, thumbUrl: null, portrait: false, label: 'ბმული', color: '#8b8b9e' };
}

/** Can we mount a player for this, here, in the page? */
export function isPlayable(link: VideoLink | null): boolean {
  return Boolean(link && link.embedUrl && link.platform !== 'link');
}

/**
 * Is this a video at all?
 *
 * Separate from `isPlayable` because Instagram is both: a real video from a
 * real service, and one we will not embed. A post carrying one still deserves a
 * player-shaped card rather than being treated as an ordinary link — while an
 * ordinary link pasted into a caption deserves nothing at all, which is the
 * other half of what this decides.
 */
export function isVideo(link: VideoLink | null): boolean {
  return Boolean(link && link.platform !== 'link');
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
