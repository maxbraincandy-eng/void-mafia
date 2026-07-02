import { Router } from 'express';
const V1_DEMO_KEY = 'LIVDSRZULELA';
function v2Key() {
    return process.env.TENOR_API_KEY || null;
}
async function fetchTenor(q, limit) {
    const key = v2Key();
    if (key) {
        const base = q.trim()
            ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q.trim())}`
            : 'https://tenor.googleapis.com/v2/featured?';
        const url = `${base}&key=${key}&limit=${limit}&contentfilter=medium&media_filter=gif,tinygif`;
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`Tenor v2 ${res.status}`);
        const data = await res.json();
        return (data.results ?? []).map((r) => ({
            id: String(r.id),
            url: r.media_formats?.gif?.url ?? '',
            preview: r.media_formats?.tinygif?.url ?? r.media_formats?.gif?.url ?? '',
        })).filter((g) => g.url);
    }
    // v1 demo fallback
    const base = q.trim()
        ? `https://api.tenor.com/v1/search?q=${encodeURIComponent(q.trim())}`
        : 'https://api.tenor.com/v1/trending?';
    const url = `${base}&key=${V1_DEMO_KEY}&limit=${limit}&contentfilter=medium`;
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Tenor v1 ${res.status}`);
    const data = await res.json();
    return (data.results ?? []).map((r) => ({
        id: String(r.id),
        url: r.media?.[0]?.gif?.url ?? '',
        preview: r.media?.[0]?.tinygif?.url ?? r.media?.[0]?.gif?.url ?? '',
    })).filter((g) => g.url);
}
// Tiny in-memory cache so trending + repeat searches don't hammer Tenor.
const cache = new Map();
const CACHE_MS = 5 * 60 * 1000;
export function createGifRouter() {
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
                if (oldest)
                    cache.delete(oldest[0]);
            }
            res.json({ ok: true, gifs });
        }
        catch (e) {
            res.status(502).json({ ok: false, error: e?.message ?? 'GIF search failed' });
        }
    });
    return router;
}
//# sourceMappingURL=gifRoutes.js.map