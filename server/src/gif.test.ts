/**
 * GIF search.
 *
 * The bug these are written against: the route fell back to Tenor v1's public
 * demo key, Google retired that API, and every search 403'd for months while
 * the picker said "no GIFs found". So the tests are less about happy results
 * than about the endpoint telling the truth when it cannot do its job.
 *
 * No network: `fetch` is replaced, so what is asserted is which URL would have
 * been called and what shape came back — not what Tenor happens to answer today.
 */

import { test, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'assert';
import express from 'express';
import type { AddressInfo } from 'net';

import { createGifRouter } from './routes/gifRoutes.js';

const realFetch = globalThis.fetch;
let calls: string[] = [];

const TENOR_BODY = {
  results: [
    { id: 1, media_formats: { gif: { url: 'https://t/big.gif' }, tinygif: { url: 'https://t/small.gif' } } },
    { id: 2, media_formats: { tinygif: { url: 'https://t/only-small.gif' } } },   // no full size: dropped
  ],
};
const GIPHY_BODY = {
  data: [
    { id: 'g1', images: { original: { url: 'https://g/big.gif' }, fixed_width_small: { url: 'https://g/small.gif' } } },
  ],
};

function stubFetch(body: unknown, ok = true, status = 200) {
  globalThis.fetch = (async (input: any) => {
    calls.push(String(input));
    return { ok, status, json: async () => body };
  }) as any;
}

beforeEach(() => {
  calls = [];
  delete process.env.TENOR_API_KEY;
  delete process.env.GIPHY_API_KEY;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.TENOR_API_KEY;
  delete process.env.GIPHY_API_KEY;
});

/** A live server on an ephemeral port, so the route runs for real. */
async function serve(): Promise<{ base: string; close: () => Promise<void> }> {
  const app = express();
  // Each router owns its cache, so one test's results cannot reach the next.
  app.use('/api/gif', createGifRouter());
  const server = app.listen(0);
  await new Promise<void>(r => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}/api/gif`,
    close: () => new Promise<void>(r => { server.close(() => r()); }),
  };
}

test('with no key at all, it says so instead of pretending to search', async () => {
  const { base, close } = await serve();
  try {
    const status = await (await realFetch(`${base}/status`)).json() as any;
    assert.equal(status.enabled, false, 'the picker branches on this — it used to be hardcoded true');
    assert.equal(status.provider, null);

    const res = await realFetch(`${base}/search?q=cat`);
    // 200, not an error: nothing failed, the service is switched off.
    assert.equal(res.status, 200);
    const d = await res.json() as any;
    assert.equal(d.ok, false);
    assert.equal(d.reason, 'not_configured', 'this is what stops it reading as an empty search');
    assert.deepEqual(d.gifs, []);
    assert.deepEqual(calls, [], 'and nothing was asked of anybody');
  } finally { await close(); }
});

test('the dead Tenor v1 demo key is gone', async () => {
  // Its 403 was the only thing running in production. Nothing may reach for it.
  const { base, close } = await serve();
  try {
    stubFetch(TENOR_BODY);
    process.env.TENOR_API_KEY = 'k';
    await realFetch(`${base}/search?q=cat`);
    assert.equal(calls.length, 1);
    assert.ok(!calls[0]!.includes('LIVDSRZULELA'), 'no demo key');
    assert.ok(!calls[0]!.includes('api.tenor.com/v1'), 'and no v1 endpoint');
  } finally { await close(); }
});

test('Tenor: a query searches, an empty box gets what is featured', async () => {
  process.env.TENOR_API_KEY = 'tk';
  const { base, close } = await serve();
  try {
    stubFetch(TENOR_BODY);
    const d = await (await realFetch(`${base}/search?q=cat&limit=5`)).json() as any;
    assert.equal(d.ok, true);
    assert.deepEqual(d.gifs, [{ id: '1', url: 'https://t/big.gif', preview: 'https://t/small.gif' }],
      'the entry with no full-size url is dropped, not posted as an empty img');
    assert.ok(calls[0]!.includes('/v2/search?q=cat'));
    assert.ok(calls[0]!.includes('key=tk'));

    // Tenor's search with an empty term is an error, not a trending list.
    await realFetch(`${base}/search?q=`);
    assert.ok(calls[1]!.includes('/v2/featured'), 'so an empty box asks for featured');
  } finally { await close(); }
});

test('Giphy works too, and comes back in the same shape', async () => {
  process.env.GIPHY_API_KEY = 'gk';
  const { base, close } = await serve();
  try {
    stubFetch(GIPHY_BODY);
    const d = await (await realFetch(`${base}/search?q=dog`)).json() as any;
    assert.deepEqual(d.gifs, [{ id: 'g1', url: 'https://g/big.gif', preview: 'https://g/small.gif' }],
      'one shape for the picker, whichever provider answered');
    assert.ok(calls[0]!.includes('api.giphy.com'));
    assert.ok(calls[0]!.includes('rating=pg-13'));

    const status = await (await realFetch(`${base}/status`)).json() as any;
    assert.equal(status.enabled, true);
    assert.equal(status.provider, 'giphy');
  } finally { await close(); }
});

test('with both keys set, Tenor is the one used', async () => {
  process.env.TENOR_API_KEY = 'tk';
  process.env.GIPHY_API_KEY = 'gk';
  const { base, close } = await serve();
  try {
    stubFetch(TENOR_BODY);
    await realFetch(`${base}/search?q=cat`);
    assert.ok(calls[0]!.includes('tenor.googleapis.com'));
  } finally { await close(); }
});

test('a provider that refuses is reported as a failure, not as no results', async () => {
  process.env.TENOR_API_KEY = 'tk';
  const { base, close } = await serve();
  try {
    stubFetch({}, false, 403);
    const res = await realFetch(`${base}/search?q=cat`);
    assert.equal(res.status, 502);
    const d = await res.json() as any;
    assert.equal(d.reason, 'upstream');
    assert.match(d.error, /403/, 'the status is in the message — that is how this bug was found');
    assert.deepEqual(d.gifs, []);
  } finally { await close(); }
});

test('a repeated search is answered from memory', async () => {
  process.env.TENOR_API_KEY = 'tk';
  const { base, close } = await serve();
  try {
    stubFetch(TENOR_BODY);
    await realFetch(`${base}/search?q=repeat-me&limit=7`);
    await realFetch(`${base}/search?q=repeat-me&limit=7`);
    assert.equal(calls.length, 1, 'typing in the box must not be one upstream call per keystroke');
  } finally { await close(); }
});
