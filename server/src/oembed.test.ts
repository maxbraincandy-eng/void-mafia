/**
 * The oEmbed proxy.
 *
 * This endpoint makes the server fetch a URL the client picked, which is a
 * request-forgery primitive unless the host is pinned — so most of what is
 * tested here is what it refuses, not what it returns.
 *
 * No network: `fetch` is replaced, so the tests assert on which URL the proxy
 * would have called rather than on what a service happens to answer today.
 */

import { test, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'assert';
import express from 'express';
import type { AddressInfo } from 'net';

import { createOEmbedRouter } from './routes/oembedRoutes.js';

const realFetch = globalThis.fetch;
let calls: string[] = [];

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (input: any) => {
    calls.push(String(input));
    return {
      ok: true,
      json: async () => ({
        thumbnail_url: 'https://cdn.example/still.jpg',
        thumbnail_width: 576,
        thumbnail_height: 1024,
        title: 'A video',
        author_name: 'Somebody',
        width: '100%',
        height: '100%',
      }),
    };
  }) as any;
});

afterEach(() => { globalThis.fetch = realFetch; });

/** A live server on an ephemeral port, so the route is exercised for real. */
async function serve(): Promise<{ base: string; close: () => Promise<void> }> {
  const app = express();
  app.use('/api/oembed', createOEmbedRouter());
  const server = app.listen(0);
  await new Promise<void>(r => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}/api/oembed`,
    close: () => new Promise<void>(r => { server.close(() => r()); }),
  };
}

async function ask(base: string, url: string): Promise<any> {
  const res = await realFetch(`${base}?url=${encodeURIComponent(url)}`);
  assert.equal(res.status, 200, 'the answer is always 200 — see the route');
  return res.json();
}

test('a supported link is looked up, and the thumbnail dimensions come back', async () => {
  const { base, close } = await serve();
  try {
    const d = await ask(base, 'https://www.tiktok.com/@someone/video/7234567890123456789');
    assert.equal(d.thumbnail, 'https://cdn.example/still.jpg');
    // The thumbnail's size, not the player's: TikTok reports the player as
    // "100%" and only the thumbnail says which way up the video was filmed.
    assert.equal(d.width, 576);
    assert.equal(d.height, 1024);
    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.startsWith('https://www.tiktok.com/oembed?url='));
  } finally { await close(); }
});

test('a host that is not on the list is never fetched', async () => {
  const { base, close } = await serve();
  try {
    for (const url of [
      'http://127.0.0.1:6379/',                       // something local
      'http://169.254.169.254/latest/meta-data/',     // a cloud metadata service
      'https://evil.example.com/',
      'https://notyoutube.com/watch?v=abc',
      // Not a subdomain of youtube.com — the suffix has to be preceded by a dot.
      'https://evil-youtube.com/watch?v=abc',
      'file:///etc/passwd',
      'javascript:alert(1)',
    ]) {
      const d = await ask(base, url);
      assert.equal(d.thumbnail, null, url);
    }
    assert.deepEqual(calls, [], 'not one outbound request was made');
  } finally { await close(); }
});

test('a real subdomain is allowed', async () => {
  const { base, close } = await serve();
  try {
    await ask(base, 'https://m.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.startsWith('https://www.youtube.com/oembed'));
  } finally { await close(); }
});

test('the same link is only fetched once', async () => {
  const { base, close } = await serve();
  try {
    const url = 'https://www.youtube.com/watch?v=cachetest0001';
    await ask(base, url);
    await ask(base, url);
    await ask(base, url);
    assert.equal(calls.length, 1, 'a post scrolled past repeatedly costs one fetch');
  } finally { await close(); }
});

test('a service that says no is answered with nulls, not an error', async () => {
  globalThis.fetch = (async () => ({ ok: false, json: async () => ({}) })) as any;
  const { base, close } = await serve();
  try {
    const d = await ask(base, 'https://www.youtube.com/watch?v=missing00001');
    assert.deepEqual(d, { thumbnail: null, width: null, height: null, title: null, author: null });
  } finally { await close(); }
});

test('a missing or absurd url is refused without a fetch', async () => {
  const { base, close } = await serve();
  try {
    const empty = await realFetch(base);
    assert.equal(empty.status, 200);
    assert.equal((await empty.json()).thumbnail, null);
    await ask(base, `https://www.youtube.com/watch?v=${'x'.repeat(2100)}`);
    assert.deepEqual(calls, []);
  } finally { await close(); }
});
