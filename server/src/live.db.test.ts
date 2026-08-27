/**
 * Going live, against a real PostgreSQL.
 *
 * The interesting behaviour here is all about a broadcast ending in a way
 * nobody pressed a button for: a host whose battery dies, a viewer whose train
 * goes into a tunnel, an end arriving twice from three different places at
 * once. A mock would let all of it pass.
 *
 *   LIVE_TEST_DATABASE_URL=postgres://postgres@localhost:5433/livetest \
 *     npx tsx --test src/live.db.test.ts
 */

import { test, before, after, beforeEach } from 'node:test';
import { strict as assert } from 'assert';

const url = process.env.LIVE_TEST_DATABASE_URL;
const skip = url ? false : 'set LIVE_TEST_DATABASE_URL to run the live tests';
if (url) process.env.DATABASE_URL = url;

type Live = typeof import('./services/liveService.js');
type Db = typeof import('./db.js');

let L: Live;
let db: Db;

const HOST = 'lv_host';
const V1 = 'lv_view1';
const V2 = 'lv_view2';

before(async () => {
  if (!url) return;
  db = await import('./db.js');
  await db.initializeDatabase();
  L = await import('./services/liveService.js');
});

after(async () => {
  if (!url) return;
  await clean();
  await db.sql.end({ timeout: 1 });
});

beforeEach(async () => {
  if (!url) return;
  await clean();
  for (const [id, name] of [[HOST, 'Host'], [V1, 'One'], [V2, 'Two']]) {
    await db.sql`
      INSERT INTO players (id, username, avatar, joined_at, last_seen_at)
      VALUES (${id}, ${name}, '🎩', ${Date.now()}, ${Date.now()})
    `;
  }
});

/*
 * `_` is a single-character wildcard in LIKE, so an unescaped 'lv_%' also
 * matches 'lve_host' — which is how this file's cleanup started deleting the
 * socket test's fixtures the first time the two ran in one process.
 */
async function clean(): Promise<void> {
  await db.sql`DELETE FROM live_viewers WHERE user_id LIKE 'lv\\_%' OR session_id IN (SELECT id FROM live_sessions WHERE host_id LIKE 'lv\\_%')`;
  await db.sql`DELETE FROM live_sessions WHERE host_id LIKE 'lv\\_%'`;
  await db.sql`DELETE FROM players WHERE id LIKE 'lv\\_%'`;
  // The viewer sets are module state; drop anybody these tests put in them.
  L?.forgetViewer(V1); L?.forgetViewer(V2); L?.forgetViewer(HOST);
}

// ── Starting ──────────────────────────────────────────────────────────────────

test('going live gives back a session and a room to broadcast in', { skip }, async () => {
  const s = await L.startLive(HOST, { title: 'ვთამაშობ მაფიას', visibility: 'public' });
  assert.equal(s.hostId, HOST);
  assert.equal(s.title, 'ვთამაშობ მაფიას');
  assert.equal(s.status, 'live');
  assert.equal(s.viewers, 0);
  // The room is derived from the id, never stored — one less thing to desync.
  assert.equal(s.room, L.roomFor(s.id));
  assert.equal(s.hostName, 'Host', 'the host is joined in, so a viewer knows whose stream this is');
});

test('starting a second broadcast replaces the first', { skip }, async () => {
  // The usual way to get here twice is an app that was killed and reopened.
  // "You are already live" when they can see they are not is the worse answer.
  const first = await L.startLive(HOST, { title: 'ერთი' });
  const second = await L.startLive(HOST, { title: 'ორი' });

  assert.notEqual(first.id, second.id);
  assert.equal((await L.getSession(first.id))!.status, 'ended');
  assert.equal((await L.myLive(HOST))!.id, second.id, 'exactly one live session per person');
});

test('a title is trimmed rather than refused', { skip }, async () => {
  const s = await L.startLive(HOST, { title: '  ' + 'ა'.repeat(400) + '  ' });
  assert.equal(s.title.length, 120);
  assert.ok(!s.title.startsWith(' '));
});

// ── Watching ──────────────────────────────────────────────────────────────────

test('viewers are counted while they are there', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  assert.equal((await L.joinLive(s.id, V1))!.viewers, 1);
  assert.equal((await L.joinLive(s.id, V2))!.viewers, 2);
  assert.equal(await L.leaveLive(s.id, V1), 1);
  assert.equal((await L.getSession(s.id))!.viewers, 1);
});

test('rejoining does not inflate the count or the total', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await L.joinLive(s.id, V1);
  await L.joinLive(s.id, V1);
  await L.joinLive(s.id, V1);
  assert.equal((await L.getSession(s.id))!.viewers, 1, 'one person is one viewer');

  await L.leaveLive(s.id, V1);
  await L.joinLive(s.id, V1);
  // Somebody whose train goes into a tunnel is not a second person.
  assert.equal((await L.getSession(s.id))!.totalViewers, 1);
});

test('peak is remembered after everyone has gone', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await L.joinLive(s.id, V1);
  await L.joinLive(s.id, V2);
  await L.leaveLive(s.id, V1);
  await L.leaveLive(s.id, V2);

  // It can only be observed while it is happening — no counter recovers it.
  const now = (await L.getSession(s.id))!;
  assert.equal(now.viewers, 0);
  assert.equal(now.peakViewers, 2);
});

test('closing the app drops you from whatever you were watching', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await L.joinLive(s.id, V1);
  await L.joinLive(s.id, V2);

  const touched = L.forgetViewer(V1);
  // The remaining count comes back with the id because the caller has to
  // broadcast it and has no other way to know. Announcing a flat zero here
  // emptied a roomful of thirty the moment one of them closed a tab.
  assert.deepEqual(touched, [{ sessionId: s.id, viewers: 1 }]);
  assert.equal((await L.getSession(s.id))!.viewers, 1, 'a count that only goes up is worse than none');
});

test('a heart comes back with the running total', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  assert.equal(await L.addHearts(s.id, 1), 1);
  assert.equal(await L.addHearts(s.id, 4), 5);
  // Nothing to add to, and nothing to report — an ended stream is not an error.
  await L.endLive(HOST);
  assert.equal(await L.addHearts(s.id, 1), 0);
});

test('who is in the room, with enough to draw them', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  assert.deepEqual(await L.viewersOf(s.id), [], 'nobody yet, and it says so');
  await L.joinLive(s.id, V1);
  await L.joinLive(s.id, V2);

  const list = await L.viewersOf(s.id);
  assert.deepEqual(list.map(v => v.userId).sort(), [V1, V2].sort());
  assert.equal(list.find(v => v.userId === V1)!.name, 'One');
  assert.equal(list.find(v => v.userId === V1)!.avatar, '🎩');

  await L.leaveLive(s.id, V1);
  assert.deepEqual((await L.viewersOf(s.id)).map(v => v.userId), [V2]);
});

test('an ended broadcast cannot be joined', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await L.endLive(HOST);
  assert.equal(await L.joinLive(s.id, V1), null);
});

// ── Ending ────────────────────────────────────────────────────────────────────

test('ending returns the summary the end screen shows', { skip }, async () => {
  const s = await L.startLive(HOST, { title: 'ეთერი' });
  await L.joinLive(s.id, V1);
  await L.joinLive(s.id, V2);
  await L.addHearts(s.id, 5);
  await L.addHearts(s.id, 3);

  const summary = (await L.endLive(HOST))!;
  assert.equal(summary.status, 'ended');
  assert.ok(summary.endedAt! >= summary.startedAt);
  assert.equal(summary.peakViewers, 2);
  assert.equal(summary.totalViewers, 2);
  assert.equal(summary.totalHearts, 8);
});

test('ending twice is not an error', { skip }, async () => {
  // "End" arrives from the button, from the socket closing and from the reaper,
  // and any two of them can race.
  await L.startLive(HOST, {});
  assert.ok(await L.endLive(HOST));
  assert.equal(await L.endLive(HOST), null, 'the second one has nothing to end, and says so quietly');
});

test('everyone still watching is marked as having left', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await L.joinLive(s.id, V1);
  await L.endLive(HOST);

  const rows = await db.sql`
    SELECT left_at FROM live_viewers WHERE session_id = ${s.id} AND user_id = ${V1}
  ` as any[];
  assert.ok(rows[0].left_at != null, 'or the watch time is open forever');
});

// ── The heartbeat ─────────────────────────────────────────────────────────────

test('a beat keeps a session alive, and says so', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  assert.equal(await L.beat(HOST), s.id);
  await L.endLive(HOST);
  // Null is the client's signal to stop showing a broadcast screen for a stream
  // that no longer exists.
  assert.equal(await L.beat(HOST), null);
});

test('a broadcast that stops beating is reaped', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  assert.equal(await L.reapStale(), 0, 'a fresh session is not stale');

  // A host whose battery died. Without the reaper their avatar wears a LIVE
  // ring until somebody files a bug, and tapping it opens an empty room.
  await db.sql`
    UPDATE live_sessions SET last_beat_at = ${Date.now() - L.BEAT_TIMEOUT_MS - 5_000} WHERE id = ${s.id}
  `;
  assert.equal(await L.reapStale(), 1);
  assert.equal((await L.getSession(s.id))!.status, 'ended');
  assert.equal(await L.myLive(HOST), null);
});

test('the timeout is comfortably longer than the beat', { skip }, async () => {
  // Three misses inside the window. One dropped packet must not end a stream.
  assert.ok(L.BEAT_TIMEOUT_MS >= L.BEAT_INTERVAL_MS * 2.5,
    `${L.BEAT_TIMEOUT_MS}ms timeout vs ${L.BEAT_INTERVAL_MS}ms beat`);
});

// ── The badge's question ──────────────────────────────────────────────────────

test('who is live, for a screenful of avatars at once', { skip }, async () => {
  const s = await L.startLive(HOST, { title: 'ვთამაშობ' });
  await L.joinLive(s.id, V1);

  const map = await L.liveMap([HOST, V1, V2, '', 'lv_nobody']);
  assert.equal(map[HOST]!.sessionId, s.id);
  assert.equal(map[HOST]!.title, 'ვთამაშობ');
  assert.equal(map[HOST]!.viewers, 1);
  assert.equal(map[V1], undefined, 'watching is not broadcasting');
  assert.equal(map[V2], undefined);
  assert.equal(map['lv_nobody'], undefined, 'and a stranger is absent, not false');
});

test('an ended broadcast leaves the badge map immediately', { skip }, async () => {
  await L.startLive(HOST, {});
  await L.endLive(HOST);
  assert.deepEqual(await L.liveMap([HOST]), {});
});

test('the list shows who is on air, newest first', { skip }, async () => {
  await L.startLive(V1, { title: 'პირველი' });
  await new Promise(r => setTimeout(r, 5));
  await L.startLive(V2, { title: 'მეორე' });

  const list = (await L.listLive()).filter(s => s.hostId.startsWith('lv_'));
  assert.equal(list.length, 2);
  assert.equal(list[0]!.hostId, V2, 'the one that just started is at the top');
});
