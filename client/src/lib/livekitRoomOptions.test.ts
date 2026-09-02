/**
 * Room options, by room kind.
 *
 * Two things worth asserting, both of which were invisible in the code:
 *
 * Adaptive stream is off everywhere, because this app never registers a video
 * element with LiveKit — it wraps `mediaStreamTrack` itself — so adaptive
 * stream had nothing to observe and computed "not visible" on the first
 * `document.visibilitychange`, disabling remote video for the rest of the
 * session. Turning it back on without also attaching elements re-arms that.
 *
 * A broadcast publishes above the 720p default, because the complaint that
 * started this was viewers seeing a softer picture than the host — whose own
 * self-view is the raw camera with no encoder in it and therefore cannot look
 * worse.
 *
 *   npx tsx --test src/lib/livekitRoomOptions.test.ts
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import { roomOptionsFor, isBroadcastRoom, isTableRoom } from './livekitRoomOptions.js';

test('a broadcast room is recognised by the name the server derives', () => {
  // `live_<sessionId>`, from `roomFor` in liveService. Session ids are
  // themselves `live_<base36>_<hex>`, so the room is `live_live_…`.
  assert.equal(isBroadcastRoom('live_live_mtb1_ab12cd34'), true);
  assert.equal(isBroadcastRoom('ABCD'), false, 'a mafia room code is not a broadcast');
  assert.equal(isBroadcastRoom('ABCD::mafia'), false);
  assert.equal(isBroadcastRoom('lounge_7'), false);
  assert.equal(isBroadcastRoom(''), false);
});

test('adaptive stream is off, in every kind of room', () => {
  /*
   * Not a preference — a correctness requirement, for as long as remote video
   * is handed to React as a hand-rolled MediaStream instead of through
   * `track.attach(el)`.
   *
   * With no element registered, `RemoteVideoTrack.updateVisibility` reduces to
   * `[].some(...)`, which is false, and the first visibilitychange event tells
   * the SFU to stop sending. Nothing turns it back on: there are no elements
   * left to become visible. Switch apps once and the video is gone.
   */
  assert.equal(roomOptionsFor('ABCD').adaptiveStream, false, 'voice room');
  assert.equal(roomOptionsFor('live_x').adaptiveStream, false, 'broadcast');
});

test('dynacast stays on, in every kind of room', () => {
  // It pauses layers nobody is subscribed to, so a host with no viewers is not
  // encoding three resolutions into an empty room off their battery. Turning it
  // off would be the lazy way to "fix" quality and would cost every host their
  // phone.
  assert.equal(roomOptionsFor('ABCD').dynacast, true);
  assert.equal(roomOptionsFor('live_x').dynacast, true);
});

test('a voice tile does not get broadcast-grade capture', () => {
  // Twenty faces the size of a stamp, sharing one phone's encoder. LiveKit's
  // defaults are already more than that needs.
  const o = roomOptionsFor('ABCD');
  assert.equal(o.videoCaptureDefaults, undefined);
  assert.equal(o.publishDefaults, undefined);
});

test('a broadcast publishes above the 720p default', () => {
  const o = roomOptionsFor('live_x');
  const res = o.videoCaptureDefaults?.resolution as any;
  assert.ok(res, 'a capture default is set at all');
  assert.equal(res.height, 1080, 'the ceiling the encode was running at');
  assert.ok((o.publishDefaults?.videoEncoding?.maxBitrate ?? 0) >= 3_000_000);
});

test('a broadcast keeps rungs below the top one', () => {
  // Somebody on a train has to get a picture — just not this picture. A single
  // 1080p layer would give them a stall instead.
  const pd = roomOptionsFor('live_x').publishDefaults;
  assert.equal(pd?.simulcast, true);
  const heights = (pd?.videoSimulcastLayers ?? []).map(l => l.height).sort((a, b) => a - b);
  assert.deepEqual(heights, [360, 720]);
});

test('a broadcast drops frames rather than resolution', () => {
  // A talking head is mostly a still frame: dropped frames are barely visible
  // and dropped resolution is the exact thing being complained about.
  assert.equal(roomOptionsFor('live_x').publishDefaults?.degradationPreference, 'maintain-resolution');
});

test('the two kinds of room do not share an object', () => {
  // Built fresh each call. A shared literal would let one room's mutation
  // follow the next one into a different kind of room.
  const a = roomOptionsFor('live_x');
  const b = roomOptionsFor('live_y');
  assert.notEqual(a, b);
  assert.notEqual(a.publishDefaults, b.publishDefaults);
  assert.notEqual(roomOptionsFor('ABCD'), roomOptionsFor('EFGH'));
});

// ── The table: twelve publishing and twelve subscribing ──────────────────────

test('a table room is configured, not left on the defaults', () => {
  /*
   * It was the only one of the three room kinds still running unset: 720p
   * capture and LiveKit's default pair of simulcast rungs, for a layout whose
   * tiles run from 267 real pixels across on a phone to 1240 for the host's
   * stage on a laptop.
   */
  const o = roomOptionsFor('sxvamafia_abc123');
  assert.equal(isTableRoom('sxvamafia_abc123'), true);
  assert.ok(o.publishDefaults?.simulcast, 'a table without simulcast can only send one size to everybody');
  assert.equal(o.publishDefaults?.videoSimulcastLayers?.length, 2,
    'two named rungs plus the published one makes the three the subscriber picks from');
});

test('the table keeps a sharp top rung for whoever is drawn large', () => {
  /*
   * Capping capture lower would have been the easy way to cut the cost, and it
   * would take the host's centre stage down with it for everybody. Dynacast
   * already stops an unsubscribed rung from being encoded, so the sharp one is
   * free until somebody actually watches it.
   */
  const o = roomOptionsFor('sxvamafia_abc123');
  assert.equal(o.videoCaptureDefaults?.resolution?.height, 720);
  assert.equal(o.dynacast, true, 'without dynacast the top rung is encoded whether or not anybody wants it');
  const rungs = (o.publishDefaults?.videoSimulcastLayers ?? []).map(l => l.height);
  assert.deepEqual(rungs, [180, 360], 'the rungs a small tile picks from');
});

test('a table degrades on resolution, a broadcast holds it', () => {
  // A broadcast fills the screen and softness is the complaint. A seat is a
  // small square, where a face that stops moving reads as a frozen call.
  assert.equal(roomOptionsFor('sxvamafia_abc123').publishDefaults?.degradationPreference, 'balanced');
  assert.equal(roomOptionsFor('live_s1').publishDefaults?.degradationPreference, 'maintain-resolution');
});

test('the three room kinds stay distinct', () => {
  assert.equal(isTableRoom('live_s1'), false);
  assert.equal(isBroadcastRoom('sxvamafia_abc'), false);
  // A plain voice room is still left alone: a stamp-sized tile needs nothing.
  const voice = roomOptionsFor('room_42');
  assert.equal(voice.publishDefaults, undefined);
  assert.equal(voice.videoCaptureDefaults, undefined);
});
