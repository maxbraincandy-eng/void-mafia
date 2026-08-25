import { Router } from 'express';

/**
 * GIF search, proxied so the key stays on the server.
 *
 * WHY THIS WAS BROKEN
 * ───────────────────
 * It used to fall back to Tenor v1's public demo key when no key was
 * configured, and that fallback was the only thing running in production.
 * Google retired the v1 API: the demo key now answers 403 to everything, so
 * every search failed and the picker showed "no GIFs found" — which reads as
 * an empty search rather than a dead endpoint, and hid the real cause for as
 * long as it took somebody to complain.
 *
 * There is no keyless GIF search left to fall back to. Checked, all three:
 * Tenor v1's demo key is 403, Tenor v2 without a key is 403, and Giphy's old
 * public beta key answers BANNED. So a fallback is not what this needed — an
 * honest answer about not being configured is.
 *
 * EITHER PROVIDER
 * ───────────────
 * Tenor and Giphy both hand out a free key and both are supported, because the
 * question "which one do I sign up for" should not be a reason for the feed to
 * have no GIFs in it. Whichever key is present is used; Tenor wins if both are.
 */

interface SlimGif { id: string; url: string; preview: string }

type Provider = 'tenor' | 'giphy' | null;

/** Which provider is configured, if any. */
function provider(): Provider {
  if (process.env.TENOR_API_KEY) return 'tenor';
  if (process.env.GIPHY_API_KEY) return 'giphy';
  return null;
}

/** The URL to ask, for a given provider and query. */
function endpoint(p: Exclude<Provider, null>, q: string, limit: number): string {
  const term = q.trim();
  if (p === 'tenor') {
    const key = process.env.TENOR_API_KEY!;
    // Featured, not search, when there is no query — Tenor's search with an
    // empty term is an error, not a trending list.
    const base = term
      ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(term)}`
      : 'https://tenor.googleapis.com/v2/featured?';
    return `${base}&key=${key}&limit=${limit}&contentfilter=medium&media_filter=gif,tinygif`;
  }
  const key = process.env.GIPHY_API_KEY!;
  const base = term
    ? `https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(term)}`
    : 'https://api.giphy.com/v1/gifs/trending?';
  return `${base}&api_key=${key}&limit=${limit}&rating=pg-13`;
}

/**
 * Both providers, one shape.
 *
 * The picker wants a full-size URL to post and a small one to show in the
 * grid — a grid of two dozen full-size GIFs is tens of megabytes of animation
 * on a phone. Each provider names those two things differently, and this is the
 * only place that has to know.
 */
function normalize(p: Exclude<Provider, null>, data: any): SlimGif[] {
  if (p === 'tenor') {
    return (data?.results ?? []).map((r: any): SlimGif => ({
      id: String(r.id),
      url: r.media_formats?.gif?.url ?? '',
      preview: r.media_formats?.tinygif?.url ?? r.media_formats?.gif?.url ?? '',
    })).filter((g: SlimGif) => g.url);
  }
  return (data?.data ?? []).map((r: any): SlimGif => ({
    id: String(r.id),
    url: r.images?.original?.url ?? '',
    preview: r.images?.fixed_width_small?.url ?? r.images?.preview_gif?.url ?? r.images?.original?.url ?? '',
  })).filter((g: SlimGif) => g.url);
}

async function fetchGifs(q: string, limit: number): Promise<SlimGif[]> {
  const p = provider();
  if (!p) throw new Error('NOT_CONFIGURED');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(endpoint(p, q, limit), { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${p} ${res.status}`);
    return normalize(p, await res.json());
  } finally {
    clearTimeout(timer);
  }
}

const CACHE_MS = 5 * 60 * 1000;

export function createGifRouter(): Router {
  const router = Router();
  /*
   * Repeat searches come out of memory rather than off the wire.
   *
   * The picker searches on a debounce as you type, so "cat" is four or five
   * queries with the same answer, and everybody who opens the picker asks for
   * the same trending list.
   *
   * Owned by the router rather than the module: one process has one router, so
   * it behaves identically either way in production — but as a module global it
   * also outlived every test that built a router, which made results leak from
   * one case into the next.
   */
  const cache = new Map<string, { at: number; gifs: SlimGif[] }>();

  /**
   * Is GIF search actually working?
   *
   * `enabled` is what the picker branches on. It used to be hardcoded true,
   * which is how a completely dead endpoint went on presenting itself as a
   * working one.
   */
  router.get('/status', (_req, res) => {
    const p = provider();
    res.json({ ok: true, enabled: p !== null, provider: p });
  });

  router.get('/search', async (req, res) => {
    const q = String(req.query.q ?? '').slice(0, 80);
    const limit = Math.min(30, Math.max(1, Number(req.query.limit ?? 20)));

    if (!provider()) {
      // 200, not 502: nothing failed. The service is switched off, and the
      // picker needs to say that rather than show an empty grid.
      res.json({ ok: false, reason: 'not_configured', gifs: [] });
      return;
    }

    try {
      const cacheKey = `${q}::${limit}`;
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.at < CACHE_MS) {
        res.json({ ok: true, gifs: hit.gifs });
        return;
      }
      const gifs = await fetchGifs(q, limit);
      cache.set(cacheKey, { at: Date.now(), gifs });
      if (cache.size > 200) {
        const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest) cache.delete(oldest[0]);
      }
      res.json({ ok: true, gifs });
    } catch (e: any) {
      res.status(502).json({ ok: false, reason: 'upstream', error: e?.message ?? 'GIF search failed', gifs: [] });
    }
  });

  return router;
}
