import { Router } from 'express';

/**
 * Tenor GIF proxy — keeps the API key server-side and normalizes the
 * response shape for the client picker.
 *
 * With TENOR_API_KEY set (Google Cloud, Tenor API v2) it uses v2; without
 * it, it falls back to Tenor v1's public demo key so GIFs still work.
 */

interface SlimGif { id: string; url: string; preview: string }

const V1_DEMO_KEY = 'LIVDSRZULELA';

function v2Key(): string | null {
  return process.env.TENOR_API_KEY || null;
}

async function fetchTenor(q: string, limit: number): Promise<SlimGif[]> {
  const key = v2Key();
  if (key) {
    const base = q.trim()
      ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q.trim())}`
      : 'https://tenor.googleapis.com/v2/featured?';
    const url = `${base}&key=${key}&limit=${limit}&contentfilter=medium&media_filter=gif,tinygif`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Tenor v2 ${res.status}`);
    const data: any = await res.json();
    return (data.results ?? []).map((r: any) => ({
      id: String(r.id),
      url: r.media_formats?.gif?.url ?? '',
      preview: r.media_formats?.tinygif?.url ?? r.media_formats?.gif?.url ?? '',
    })).filter((g: SlimGif) => g.url);
  }
  // v1 demo fallback
  const base = q.trim()
    ? `https://api.tenor.com/v1/search?q=${encodeURIComponent(q.trim())}`
    : 'https://api.tenor.com/v1/trending?';
  const url = `${base}&key=${V1_DEMO_KEY}&limit=${limit}&contentfilter=medium`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tenor v1 ${res.status}`);
  const data: any = await res.json();
  return (data.results ?? []).map((r: any) => ({
    id: String(r.id),
    url: r.media?.[0]?.gif?.url ?? '',
    preview: r.media?.[0]?.tinygif?.url ?? r.media?.[0]?.gif?.url ?? '',
  })).filter((g: SlimGif) => g.url);
}

// Tiny in-memory cache so trending + repeat searches don't hammer Tenor.
const cache = new Map<string, { at: number; gifs: SlimGif[] }>();
const CACHE_MS = 5 * 60 * 1000;

export function createGifRouter(): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json({ ok: true, enabled: true, v2: v2Key() !== null });
  });

  router.get('/search', async (req, res) => {
    try {
      const q = String(req.query.q ?? '').slice(0, 80);
      const limit = Math.min(30, Math.max(1, Number(req.query.limit ?? 20)));
      const cacheKey = `${q}::${limit}`;
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.at < CACHE_MS) {
        res.json({ ok: true, gifs: hit.gifs });
        return;
      }
      const gifs = await fetchTenor(q, limit);
      cache.set(cacheKey, { at: Date.now(), gifs });
      if (cache.size > 200) {
        const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest) cache.delete(oldest[0]);
      }
      res.json({ ok: true, gifs });
    } catch (e: any) {
      res.status(502).json({ ok: false, error: e?.message ?? 'GIF search failed' });
    }
  });

  return router;
}
