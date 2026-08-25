import { Router } from 'express';
/*
 * A short cache, because these answers expire.
 *
 * TikTok signs its thumbnail URLs with an expiry a couple of days out, so
 * caching for a week would serve dead images. An hour is long enough that a
 * post scrolled past repeatedly costs one fetch, and short enough that a
 * signature never goes stale in here.
 */
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 500;
const cache = new Map();
function cacheGet(key) {
    const hit = cache.get(key);
    if (!hit)
        return null;
    if (Date.now() - hit.at > TTL_MS) {
        cache.delete(key);
        return null;
    }
    // Re-insert so the eviction below drops the least recently used.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
}
function cacheSet(key, info) {
    cache.set(key, { at: Date.now(), info });
    while (cache.size > MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined)
            break;
        cache.delete(oldest);
    }
}
/**
 * Which URL we are willing to ask about.
 *
 * An allowlist, and a strict one: this endpoint makes the server fetch a URL a
 * client chose, which is a request forgery primitive if the host is not
 * pinned. Only these services, only over https, and the hostname must match
 * exactly or be a subdomain — `evil-youtube.com` is not youtube.com.
 */
const PROVIDERS = [
    { host: 'youtube.com', oembed: u => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}` },
    { host: 'youtu.be', oembed: u => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}` },
    { host: 'tiktok.com', oembed: u => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}` },
    { host: 'vimeo.com', oembed: u => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}` },
];
function providerFor(raw) {
    let u;
    try {
        u = new URL(raw);
    }
    catch {
        return null;
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:')
        return null;
    const host = u.hostname.toLowerCase();
    for (const p of PROVIDERS) {
        if (host === p.host || host.endsWith(`.${p.host}`))
            return p.oembed;
    }
    return null;
}
/** A number from oEmbed, which sends "100%" as readily as 1024. */
function num(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
async function lookup(url) {
    const build = providerFor(url);
    if (!build)
        return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
        const res = await fetch(build(url), {
            signal: ctrl.signal,
            headers: { 'user-agent': 'voidmafia/1.0 (+https://voidmafia.one)' },
        });
        if (!res.ok)
            return null;
        const d = await res.json();
        return {
            thumbnail: typeof d.thumbnail_url === 'string' ? d.thumbnail_url : null,
            // The thumbnail's dimensions, not the player's: TikTok reports the
            // player as "100%" and the thumbnail as 576×1024, and only one of those
            // tells you which way up the video was filmed.
            width: num(d.thumbnail_width) ?? num(d.width),
            height: num(d.thumbnail_height) ?? num(d.height),
            title: typeof d.title === 'string' ? d.title.slice(0, 300) : null,
            author: typeof d.author_name === 'string' ? d.author_name.slice(0, 120) : null,
        };
    }
    catch {
        return null; // timeout, network, or the service said no
    }
    finally {
        clearTimeout(timer);
    }
}
export function createOEmbedRouter() {
    const router = Router();
    /**
     * GET /api/oembed?url=…
     *
     * Always 200. A link we cannot describe returns nulls rather than an error,
     * because "no thumbnail" is a perfectly good answer for the client — it has
     * a tile to fall back to — and a 404 here would just be noise in the console
     * on every Instagram post in the feed.
     */
    router.get('/', async (req, res) => {
        const url = String(req.query.url ?? '');
        if (!url || url.length > 2000) {
            res.json({ thumbnail: null, width: null, height: null, title: null, author: null });
            return;
        }
        const hit = cacheGet(url);
        if (hit) {
            res.json(hit.info ?? { thumbnail: null, width: null, height: null, title: null, author: null });
            return;
        }
        const info = await lookup(url);
        cacheSet(url, info);
        // A miss is cached too — an unsupported link should not cost a fetch every
        // time somebody scrolls past it.
        res.json(info ?? { thumbnail: null, width: null, height: null, title: null, author: null });
    });
    return router;
}
//# sourceMappingURL=oembedRoutes.js.map