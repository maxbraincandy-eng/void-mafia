/**
 * Pull one bounding box of OpenStreetMap out of Overpass, with patience.
 *
 * Separate from the extractor because the two fail for completely different
 * reasons: Overpass is a shared public service that throttles, 504s and drops
 * connections under load, while turning its answer into game geometry is pure
 * arithmetic that either works or does not. Keeping the download in its own
 * step means a rate limit costs a retry rather than a re-run of everything.
 *
 * Data © OpenStreetMap contributors, ODbL. See the note in tbilisiData.ts.
 */
import { writeFileSync, existsSync } from 'fs';

/*
 * Several, because on any given day most of them are refusing.
 *
 * These are shared public instances of a service nobody pays for: the main one
 * returns 503 under load and the fast mirror rate-limits per IP, so a single
 * URL here means the pipeline is down whenever that one host is busy. Ordered
 * by what actually answered last.
 */
const MIRRORS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];

/**
 * Is this mirror actually serving OpenStreetMap?
 *
 * Learned the hard way: overpass.osm.ch answered every query in under a second
 * with HTTP 200 and zero elements, because its database is empty. Nothing about
 * that looks like a failure — an empty result is a perfectly ordinary answer to
 * a bounding box with nothing in it — and the pipeline downstream would have
 * packed an empty city and committed it.
 *
 * A real instance stamps the extract it was built from. A broken one has
 * `"34"`.
 */
function servingRealData(json) {
  const base = json?.osm3s?.timestamp_osm_base;
  return typeof base === 'string' && !Number.isNaN(Date.parse(base));
}

export async function overpass(query, { tries = 3, label = 'query' } = {}) {
  let lastErr = 'never ran';
  for (let attempt = 0; attempt < tries; attempt++) {
    for (const url of MIRRORS) {
      const started = Date.now();
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 180_000);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: query }),
          signal: ctl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) { lastErr = `HTTP ${res.status}`; console.error(`  ${label}: ${url} → ${lastErr}`); continue; }
        const json = await res.json();
        if (!servingRealData(json)) {
          lastErr = `empty database (timestamp_osm_base ${JSON.stringify(json?.osm3s?.timestamp_osm_base)})`;
          console.error(`  ${label}: ${url} → ${lastErr} — SKIPPING`);
          continue;
        }
        console.error(`  ${label}: ${url} → ok in ${((Date.now() - started) / 1000).toFixed(1)}s`);
        return json;
      } catch (e) {
        lastErr = e?.name === 'AbortError' ? 'timeout' : String(e?.message ?? e);
        console.error(`  ${label}: ${url} → ${lastErr}`);
      }
    }
    // A shared service that just refused is not helped by asking again at once.
    const wait = 15 * (attempt + 1);
    if (attempt < tries - 1) { console.error(`  ${label}: waiting ${wait}s`); await new Promise(r => setTimeout(r, wait * 1000)); }
  }
  throw new Error(`Overpass failed for ${label}: ${lastErr}`);
}

/** Fetch once and keep it — the extractor is run many times, the download once. */
export async function cached(path, query, label) {
  if (existsSync(path)) { console.error(`  ${label}: cached`); return JSON.parse(await import('fs').then(m => m.readFileSync(path, 'utf8'))); }
  const json = await overpass(query, { label });
  writeFileSync(path, JSON.stringify(json));
  return json;
}
