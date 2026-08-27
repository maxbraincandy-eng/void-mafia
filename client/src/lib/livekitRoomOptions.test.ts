/**
 * Room options, by room kind.
 *
 * This exists because the bug it guards against was invisible from the host's
 * side and impossible to spot in the code. Every room shared one config, that
 * config was tuned for a grid of stamp-sized voice tiles, and a full-screen
 * broadcast inherited it — so viewers got the 360p layer while the host's own
 * self-view, which is the raw camera with no encoder in it, looked perfect.
 *
 * Nothing about that produces an error, a warning or a failing test unless
 * something asserts the intent. This asserts the intent.
 *
 *   npx tsx --test src/lib/livekitRoomOptions.test.ts
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import { roomOptionsFor, isBroadcastRoom } from './livekitRoomOptions.js';

test('a broadcast room is recognised by the name the server derives', () => {
  // `live_<sessionId>`, from `roomFor` in liveService. Session ids are
  // themselves `live_<base36>_<hex>`, so the room is `live_live_…`.
  assert.equal(isBroadcastRoom('live_live_mtb1_ab12cd34'), true);
  assert.equal(isBroadcastRoom('ABCD'), false, 'a mafia room code is not a broadcast');
  assert.equal(isBroadcastRoom('ABCD::mafia'), false);
  assert.equal(isBroadcastRoom('lounge_7'), false);
  assert.equal(isBroadcastRoom(''), false);
});

test('a voice room keeps adaptive stream, because a tile grid needs it', () => {
  // Twenty faces the size of a stamp. Sending each of them the top layer would
  // melt the phone, and this is the setting that stops it.
  const o = roomOptionsFor('ABCD');
  assert.equal(o.adaptiveStream, true);
  assert.equal(o.dynacast, true);
  assert.equal(o.videoCaptureDefaults, undefined, 'and no broadcast-grade capture');
  assert.equal(o.publishDefaults, undefined);
});

test('a broadcast does not size its video to the element', () => {
  // The whole bug. Adaptive stream matches the layer to the rendered element
  // and climbs to it from below; a broadcast is one video filling the screen
  // and wants the top layer from the first frame.
  const o = roomOptionsFor('live_live_mtb1_ab12cd34');
  assert.equal(o.adaptiveStream, false);
});

test('a broadcast still pauses layers nobody is watching', () => {
  // Dynacast is the reason a host with no viewers is not encoding three
  // resolutions into an empty room off their battery. Turning it off would be
  // the lazy way to "fix" quality and would cost every host their phone.
  assert.equal(roomOptionsFor('live_x').dynacast, true);
});

test('a broadcast publishes above the 720p default', () => {
  const o = roomOptionsFor('live_x');
  const res = o.videoCaptureDefaults?.resolution as any;
  assert.ok(res, 'a capture default is set at all');
  assert.equal(res.height, 1080, 'the ceiling the top layer was capped at');
  assert.ok((o.publishDefaults?.videoEncoding?.maxBitrate ?? 0) >= 3_000_000);
});

test('a broadcast keeps rungs below the top one', () => {
  // Somebody on a train has to get a picture — just not this picture. A single
  // 1080p layer would give them a stall instead.
  const layers = roomOptionsFor('live_x').publishDefaults?.videoSimulcastLayers ?? [];
  assert.equal(roomOptionsFor('live_x').publishDefaults?.simulcast, true);
  assert.ok(layers.length >= 2, `only ${layers.length} fallback layer(s)`);
  const heights = layers.map(l => l.height).sort((a, b) => a - b);
  assert.deepEqual(heights, [360, 720]);
});

test('a broadcast drops frames rather than resolution', () => {
  // A talking head is mostly a still frame: dropped frames are barely visible
  // and dropped resolution is the exact thing being complained about.
  assert.equal(roomOptionsFor('live_x').publishDefaults?.degradationPreference, 'maintain-resolution');
});

test('the two kinds of room do not share an object', () => {
  // They are built fresh each call. A shared literal would let one room's
  // mutation follow the next one into a different kind of room.
  const a = roomOptionsFor('live_x');
  const b = roomOptionsFor('live_y');
  assert.notEqual(a, b);
  assert.notEqual(a.publishDefaults, b.publishDefaults);
});
