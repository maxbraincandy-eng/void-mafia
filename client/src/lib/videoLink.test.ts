/**
 * The video-link parser.
 *
 * These are the URL shapes people actually paste — the share sheet's, the
 * address bar's, the mobile app's — not the canonical one from the docs. Every
 * case here is a form a real service hands out.
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import { parseVideoLink, isPlayable, extractYouTubeId } from './videoLink.js';

// `twitchParent` reads window.location; under node there is no window, and the
// fallback is what production uses anyway.

test('every shape YouTube hands out resolves to the same video', () => {
  const id = 'dQw4w9WgXcQ';
  const urls = [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s`,
    `https://www.youtube.com/watch?feature=share&v=${id}`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=abcdef`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://m.youtube.com/watch?v=${id}`,
  ];
  for (const u of urls) {
    const link = parseVideoLink(u);
    assert.equal(link?.platform, 'youtube', u);
    assert.ok(link!.embedUrl!.includes(id), `${u} → embed carries the id`);
    assert.ok(link!.thumbUrl!.includes(id), `${u} → poster carries the id`);
  }
});

test('a Short is portrait and a normal video is not', () => {
  assert.equal(parseVideoLink('https://youtube.com/shorts/dQw4w9WgXcQ')!.portrait, true);
  assert.equal(parseVideoLink('https://youtube.com/watch?v=dQw4w9WgXcQ')!.portrait, false);
});

test('a link inside a sentence is found', () => {
  const link = parseVideoLink('ნახეთ ეს https://youtu.be/dQw4w9WgXcQ საოცარია');
  assert.equal(link?.platform, 'youtube');
});

test('TikTok: a full link embeds, a share link opens instead', () => {
  const full = parseVideoLink('https://www.tiktok.com/@someone/video/7234567890123456789');
  assert.equal(full?.platform, 'tiktok');
  assert.ok(full!.embedUrl!.includes('7234567890123456789'));
  assert.equal(full!.portrait, true);

  // vm.tiktok.com hides the id behind a redirect we cannot follow in a render
  // pass, so it is honest about being a link rather than showing a dead player.
  const short = parseVideoLink('https://vm.tiktok.com/ZMabcdef1/');
  assert.equal(short?.platform, 'tiktok');
  assert.equal(short!.embedUrl, null);
  assert.equal(isPlayable(short), false);
});

test('Instagram posts, reels and TV all embed', () => {
  for (const kind of ['p', 'reel', 'reels', 'tv']) {
    const link = parseVideoLink(`https://www.instagram.com/${kind}/CxYzAbC1234/`);
    assert.equal(link?.platform, 'instagram', kind);
    assert.ok(link!.embedUrl!.includes('CxYzAbC1234'), kind);
  }
});

test('Vimeo, Twitch and a bare mp4', () => {
  assert.equal(parseVideoLink('https://vimeo.com/123456789')?.platform, 'vimeo');
  assert.equal(parseVideoLink('https://player.vimeo.com/video/123456789')?.platform, 'vimeo');
  assert.equal(parseVideoLink('https://www.twitch.tv/videos/1234567890')?.platform, 'twitch');
  assert.equal(parseVideoLink('https://clips.twitch.tv/SomeClipName')?.platform, 'twitch');

  const file = parseVideoLink('https://cdn.example.com/clip.mp4');
  assert.equal(file?.platform, 'file');
  assert.equal(file!.embedUrl, file!.url, 'the browser plays it directly');
});

test('an ordinary link is a link, not a broken player', () => {
  const link = parseVideoLink('https://example.com/an-article');
  assert.equal(link?.platform, 'link');
  assert.equal(link!.embedUrl, null);
  assert.equal(isPlayable(link), false, 'so the feed shows a chip, not an empty frame');
});

test('nothing that is not a web address gets through', () => {
  // The chip renders the url as an anchor, so a scheme that is not http(s)
  // must never come back as one.
  for (const bad of ['', '   ', 'not a url', 'javascript:alert(1)', 'data:text/html,<script>x</script>', 'file:///etc/passwd']) {
    assert.equal(parseVideoLink(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseVideoLink(null), null);
  assert.equal(parseVideoLink(undefined), null);
});

test('the old YouTube-only helper still answers the same', () => {
  assert.equal(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeId('https://tiktok.com/@a/video/123'), null);
});
