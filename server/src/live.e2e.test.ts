/**
 * Going live, over real sockets, from two devices.
 *
 * The reported problem was exactly this shape: live from one phone, and the
 * other device shows nothing. So this drives it the way it actually happens —
 * two connections, one starts a broadcast, the other asks the questions the
 * feed asks — rather than testing the service in isolation, which already
 * passes and would not have caught a missing surface.
 *
 * THE HANDLERS ARE THE REAL ONES
 * ──────────────────────────────
 * They did not use to be. `socket.ts` cannot be imported here — it drags in
 * every game in the app — so this file used to re-implement the live handlers
 * standalone, and then agreed with its own copy. That is how the host went a
 * whole release seeing `👁 0` and an empty comment overlay through a green
 * suite: the real handler never joined the host to their own broadcast room,
 * and nothing here was in a position to notice.
 *
 * `registerLiveHandlers` was extracted for this reason. Every assertion below
 * runs against the same function production runs.
 *
 *   LIVE_TEST_DATABASE_URL=postgres://postgres@localhost:5433/livetest \
 *     npx tsx --test src/live.e2e.test.ts
 */

import { test, before, after, beforeEach } from 'node:test';
import { strict as assert } from 'assert';
import { createServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';

const url = process.env.LIVE_TEST_DATABASE_URL;
const skip = url ? false : 'set LIVE_TEST_DATABASE_URL to run the live socket tests';
if (url) process.env.DATABASE_URL = url;

type Live = typeof import('./services/liveService.js');
type Db = typeof import('./db.js');

let http: HttpServer;
let server: Server;
let port: number;
let L: Live;
let db: Db;
let LS: typeof import('./liveSocket.js');

const HOST = 'lve_host';
const VIEWER = 'lve_viewer';
const VIEWER2 = 'lve_viewer2';

before(async () => {
  if (!url) return;
  db = await import('./db.js');
  await db.initializeDatabase();
  L = await import('./services/liveService.js');
  LS = await import('./liveSocket.js');

  http = createServer();
  server = new Server(http, { cors: { origin: '*' } });
  server.use((socket, next) => {
    (socket.data as any).profileId = String(socket.handshake.auth?.profileId ?? '');
    next();
  });

  server.on('connection', socket => {
    LS.registerLiveHandlers(server, socket as any, {
      // The real counter is per socket per second and these tests fire faster
      // than a thumb can; rate limiting is socket.ts's contract, not this one's.
      rateOk: () => true,
      ok: data => ({ ok: true, data }),
      err: error => ({ ok: false, error }),
    });

    // The one live-related thing that lives in socket.ts rather than the live
    // module, because it hangs off the shared disconnect handler.
    socket.on('disconnect', () => {
      const gone = String((socket.data as any).profileId ?? '');
      if (!gone) return;
      for (const { sessionId, viewers } of L.forgetViewer(gone)) {
        server.to(L.roomFor(sessionId)).emit('live:viewers', { sessionId, viewers, left: { userId: gone } });
      }
    });
  });

  await new Promise<void>(r => http.listen(0, r));
  port = (http.address() as any).port;
});

after(async () => {
  if (!url) return;
  await clean();
  server.disconnectSockets(true);
  server.close();
  http.closeAllConnections?.();
  await new Promise<void>(r => http.close(() => r()));
  await db.sql.end({ timeout: 1 });
});

beforeEach(async () => {
  if (!url) return;
  await clean();
  for (const [id, name] of [[HOST, 'Host'], [VIEWER, 'Viewer'], [VIEWER2, 'Viewer Two']]) {
    await db.sql`
      INSERT INTO players (id, username, avatar, joined_at, last_seen_at)
      VALUES (${id}, ${name}, '🎩', ${Date.now()}, ${Date.now()})
    `;
  }
});

async function clean(): Promise<void> {
  await db.sql`DELETE FROM live_viewers WHERE user_id LIKE 'lve\\_%' OR session_id IN (SELECT id FROM live_sessions WHERE host_id LIKE 'lve\\_%')`;
  await db.sql`DELETE FROM legacy_xp_events WHERE user_id LIKE 'lve\\_%'`;
  await db.sql`DELETE FROM legacy_xp_grants WHERE user_id LIKE 'lve\\_%'`;
  await db.sql`DELETE FROM live_sessions WHERE host_id LIKE 'lve\\_%'`;
  await db.sql`DELETE FROM follows WHERE follower_id LIKE 'lve\\_%' OR following_id LIKE 'lve\\_%'`;
  await db.sql`DELETE FROM community_notifications WHERE player_id LIKE 'lve\\_%'`;
  await db.sql`DELETE FROM players WHERE id LIKE 'lve\\_%'`;
  L?.forgetViewer(HOST); L?.forgetViewer(VIEWER); L?.forgetViewer(VIEWER2);
  // The announcement cooldown is module state, and a second test is not a repeat.
  LS?._resetLiveNotifyCooldown();
}

const open = (profileId: string): Promise<ClientSocket> => new Promise((resolve, reject) => {
  const s = connect(`http://localhost:${port}`, { auth: { profileId }, transports: ['websocket'], forceNew: true });
  s.on('connect', () => resolve(s));
  s.on('connect_error', reject);
});

const send = (s: ClientSocket, ev: string, data: unknown = {}): Promise<any> =>
  new Promise(resolve => {
    const t = setTimeout(() => resolve({ ok: false, error: 'TIMEOUT' }), 2500);
    s.emit(ev, data, (r: any) => { clearTimeout(t); resolve(r); });
  });

const settle = () => new Promise(r => setTimeout(r, 120));

/** Collect everything a socket is told on one event, for later assertion. */
function collect(s: ClientSocket, ev: string): any[] {
  const seen: any[] = [];
  s.on(ev, p => seen.push(p));
  return seen;
}

// ── The reported scenario ─────────────────────────────────────────────────────

test('live on one device shows up on another', { skip }, async () => {
  const phone = await open(HOST);
  const laptop = await open(VIEWER);

  // Nothing yet — and the strip renders nothing rather than lying.
  assert.deepEqual((await send(laptop, 'live:list')).data.filter((s: any) => s.hostId.startsWith('lve_')), []);

  const started = await send(phone, 'live:start', { title: 'ვთამაშობ მაფიას' });
  assert.equal(started.ok, true);
  await settle();

  /*
   * This is the question the strip asks, and the answer that was missing.
   * The badge on an avatar only appears where an avatar appears — in the feed,
   * on post authors — so a host who had not also posted was invisible.
   */
  const list = (await send(laptop, 'live:list')).data.filter((s: any) => s.hostId.startsWith('lve_'));
  assert.equal(list.length, 1, 'the other device can see the broadcast');
  assert.equal(list[0].hostId, HOST);
  assert.equal(list[0].title, 'ვთამაშობ მაფიას');
  assert.equal(list[0].hostName, 'Host', 'with a name to put under the tile');

  phone.close(); laptop.close();
});

test('the host sees their own broadcast from a second device', { skip }, async () => {
  // Going live on a phone and opening the app on a laptop must answer "am I
  // actually live?" — which had no answer anywhere in the app before the strip.
  const phone = await open(HOST);
  await send(phone, 'live:start', { title: 'ეთერი' });

  const laptop = await open(HOST);
  const mine = (await send(laptop, 'live:list')).data.find((s: any) => s.hostId === HOST);
  assert.ok(mine, 'the same account, from a different connection, sees itself on air');

  phone.close(); laptop.close();
});

test('the other device is told the moment a broadcast starts', { skip }, async () => {
  const phone = await open(HOST);
  const laptop = await open(VIEWER);

  const seen: any[] = [];
  laptop.on('live:started', p => seen.push(p));
  await settle();

  await send(phone, 'live:start', { title: 'ახლავე' });
  await settle();

  // Without this the ring waits for the next poll, which is the difference
  // between "within a few seconds" and "eventually".
  assert.equal(seen.length, 1);
  assert.equal(seen[0].hostId, HOST);

  phone.close(); laptop.close();
});

test('and told the moment it stops', { skip }, async () => {
  const phone = await open(HOST);
  const laptop = await open(VIEWER);
  await send(phone, 'live:start', {});

  const seen: any[] = [];
  laptop.on('live:stopped', p => seen.push(p));
  await settle();

  await send(phone, 'live:end');
  await settle();

  assert.equal(seen.length, 1, 'a ring that stays after the stream ends is the app lying');
  assert.deepEqual((await send(laptop, 'live:who', { userIds: [HOST] })).data, {});

  phone.close(); laptop.close();
});

test('the badge question is answered for a screenful at once', { skip }, async () => {
  const phone = await open(HOST);
  const laptop = await open(VIEWER);
  await send(phone, 'live:start', { title: 'ბადეზე' });

  const map = (await send(laptop, 'live:who', { userIds: [HOST, VIEWER, 'lve_nobody'] })).data;
  assert.equal(map[HOST].title, 'ბადეზე');
  assert.equal(map[VIEWER], undefined, 'watching is not broadcasting');
  assert.equal(map['lve_nobody'], undefined);

  phone.close(); laptop.close();
});

test('a viewer joining moves the count the host is watching', { skip }, async () => {
  const phone = await open(HOST);
  const laptop = await open(VIEWER);
  const started = await send(phone, 'live:start', {});

  const joined = await send(laptop, 'live:join', { sessionId: started.data.id });
  assert.equal(joined.ok, true);
  assert.equal(joined.data.viewers, 1);

  phone.close(); laptop.close();
});

/*
 * ── The host's side ──────────────────────────────────────────────────────────
 *
 * Everything above this line asserts from a viewer's socket, which is exactly
 * why "0 viewers, no comments, no hearts" survived a green suite. The host was
 * never joined to `roomFor(sessionId)`; every one of these payloads is
 * addressed to that room; and nothing here was looking at the host.
 */

test('the host is told when somebody starts watching', { skip }, async () => {
  const phone = await open(HOST);
  const laptop = await open(VIEWER);
  const started = await send(phone, 'live:start', { title: 'ეთერი' });

  const seen = collect(phone, 'live:viewers');
  await settle();
  await send(laptop, 'live:join', { sessionId: started.data.id });
  await settle();

  // `👁 0` while a room of people watch was the bug, and this is the assertion
  // that fails without `socket.join(roomFor(id))` in `live:start`.
  assert.equal(seen.length, 1, 'the host hears their own room');
  assert.equal(seen[0].viewers, 1);
  assert.equal(seen[0].joined.name, 'Viewer', 'with a name for the toast');

  phone.close(); laptop.close();
});

test("the host sees a viewer's comment", { skip }, async () => {
  const phone = await open(HOST);
  const laptop = await open(VIEWER);
  const started = await send(phone, 'live:start', {});
  await send(laptop, 'live:join', { sessionId: started.data.id });

  const seen = collect(phone, 'live:comment');
  await settle();
  laptop.emit('live:comment', { sessionId: started.data.id, text: 'გამარჯობა' });
  await settle();

  assert.equal(seen.length, 1, 'a chat the host cannot read is not a chat');
  assert.equal(seen[0].text, 'გამარჯობა');
  assert.equal(seen[0].name, 'Viewer');
  assert.equal(seen[0].userId, VIEWER);

  phone.close(); laptop.close();
});

test('the host can talk back, and the viewer hears it', { skip }, async () => {
  const phone = await open(HOST);
  const laptop = await open(VIEWER);
  const started = await send(phone, 'live:start', {});
  await send(laptop, 'live:join', { sessionId: started.data.id });

  const seen = collect(laptop, 'live:comment');
  await settle();
  phone.emit('live:comment', { sessionId: started.data.id, text: 'გმადლობთ!' });
  await settle();

  // Answering a question from the chat is most of what a host does; without
  // this the conversation only runs one way.
  assert.equal(seen.length, 1);
  assert.equal(seen[0].userId, HOST, 'the client can tell it apart by the host id');

  phone.close(); laptop.close();
});

test('a heart reaches the host, with a running total', { skip }, async () => {
  const phone = await open(HOST);
  const laptop = await open(VIEWER);
  const started = await send(phone, 'live:start', {});
  await send(laptop, 'live:join', { sessionId: started.data.id });

  const seen = collect(phone, 'live:hearted');
  await settle();
  laptop.emit('live:heart', { sessionId: started.data.id });
  laptop.emit('live:heart', { sessionId: started.data.id });
  await settle();

  assert.equal(seen.length, 2);
  // Flying hearts are unreadable as a quantity — twenty look like two hundred.
  assert.deepEqual(seen.map(h => h.hearts), [1, 2]);

  phone.close(); laptop.close();
});

test('the tapper gets the total back too', { skip }, async () => {
  const phone = await open(HOST);
  const laptop = await open(VIEWER);
  const started = await send(phone, 'live:start', {});
  await send(laptop, 'live:join', { sessionId: started.data.id });

  const seen = collect(laptop, 'live:hearted');
  await settle();
  laptop.emit('live:heart', { sessionId: started.data.id });
  await settle();

  // The sender used to be excluded, which was right when the payload was only
  // "somebody tapped". It carries the count now, and the count is for everyone.
  assert.equal(seen.length, 1);
  assert.equal(seen[0].userId, VIEWER, 'so the client can skip its own burst');
  assert.equal(seen[0].hearts, 1);

  phone.close(); laptop.close();
});

test('the host re-joins their own room on the next heartbeat', { skip }, async () => {
  // A phone that moves from wifi to mobile data reconnects with a brand new
  // socket, and a new socket is in no rooms. Without the beat re-joining, the
  // host goes permanently deaf to their own chat with nothing to explain it.
  const phone = await open(HOST);
  const started = await send(phone, 'live:start', {});
  phone.close();
  await settle();

  const reconnected = await open(HOST);
  const laptop = await open(VIEWER);
  const seen = collect(reconnected, 'live:comment');

  assert.equal((await send(reconnected, 'live:beat', {})).data, true);
  await send(laptop, 'live:join', { sessionId: started.data.id });
  await settle();
  laptop.emit('live:comment', { sessionId: started.data.id, text: 'ისევ აქ' });
  await settle();

  assert.equal(seen.length, 1, 'the beat put them back in the room');

  reconnected.close(); laptop.close();
});

test('resuming from another device joins the room, not just the screen', { skip }, async () => {
  const phone = await open(HOST);
  const started = await send(phone, 'live:start', { title: 'ეთერი' });
  const laptop = await open(VIEWER);
  await send(laptop, 'live:join', { sessionId: started.data.id });

  const desktop = await open(HOST);
  const seen = collect(desktop, 'live:comment');
  const mine = await send(desktop, 'live:mine', {});
  assert.equal(mine.data.id, started.data.id);
  await settle();

  laptop.emit('live:comment', { sessionId: started.data.id, text: 'აქ ხარ?' });
  await settle();
  assert.equal(seen.length, 1, 'the second device gets the chat, not an empty overlay');

  phone.close(); laptop.close(); desktop.close();
});

// ── Leaving ──────────────────────────────────────────────────────────────────

test('one viewer closing a tab does not empty the room', { skip }, async () => {
  const phone = await open(HOST);
  const a = await open(VIEWER);
  const b = await open(VIEWER2);
  const started = await send(phone, 'live:start', {});
  await send(a, 'live:join', { sessionId: started.data.id });
  await send(b, 'live:join', { sessionId: started.data.id });

  const seen = collect(phone, 'live:viewers');
  await settle();
  a.close();
  await settle();

  // The disconnect handler used to announce `viewers: 0` for every session the
  // leaver touched — one person of thirty leaving emptied the room on
  // everybody's screen.
  assert.equal(seen.length, 1);
  assert.equal(seen[0].viewers, 1, 'one left, one still watching');

  phone.close(); b.close();
});

test('a viewer leaving on purpose moves the count the same way', { skip }, async () => {
  const phone = await open(HOST);
  const a = await open(VIEWER);
  const b = await open(VIEWER2);
  const started = await send(phone, 'live:start', {});
  await send(a, 'live:join', { sessionId: started.data.id });
  await send(b, 'live:join', { sessionId: started.data.id });

  const seen = collect(phone, 'live:viewers');
  await settle();
  await send(a, 'live:leave', { sessionId: started.data.id });
  await settle();

  assert.equal(seen[seen.length - 1].viewers, 1);
  assert.equal(seen[seen.length - 1].left.userId, VIEWER);

  phone.close(); a.close(); b.close();
});

test('ending clears the room, so nothing is delivered into the dark', { skip }, async () => {
  const phone = await open(HOST);
  const laptop = await open(VIEWER);
  const started = await send(phone, 'live:start', {});
  await send(laptop, 'live:join', { sessionId: started.data.id });

  const ended = collect(laptop, 'live:ended');
  await settle();
  await send(phone, 'live:end');
  await settle();

  assert.equal(ended.length, 1);
  assert.ok(ended[0].summary, 'the end screen has its numbers without a second round trip');

  const after = collect(laptop, 'live:comment');
  phone.emit('live:comment', { sessionId: started.data.id, text: 'ღმერთო' });
  await settle();
  assert.equal(after.length, 0, 'the room is empty once the stream is over');

  phone.close(); laptop.close();
});

// ── Who is in the room ───────────────────────────────────────────────────────

test('the host can see who is watching, not only how many', { skip }, async () => {
  const phone = await open(HOST);
  const a = await open(VIEWER);
  const b = await open(VIEWER2);
  const started = await send(phone, 'live:start', {});
  await send(a, 'live:join', { sessionId: started.data.id });
  await send(b, 'live:join', { sessionId: started.data.id });

  const list = (await send(phone, 'live:viewer_list', { sessionId: started.data.id })).data;
  assert.deepEqual(list.map((v: any) => v.userId).sort(), [VIEWER, VIEWER2].sort());
  assert.equal(list.find((v: any) => v.userId === VIEWER).name, 'Viewer', 'with enough to draw them');

  phone.close(); a.close(); b.close();
});

test('the list empties as people go', { skip }, async () => {
  const phone = await open(HOST);
  const a = await open(VIEWER);
  const started = await send(phone, 'live:start', {});
  await send(a, 'live:join', { sessionId: started.data.id });
  await send(a, 'live:leave', { sessionId: started.data.id });

  assert.deepEqual((await send(phone, 'live:viewer_list', { sessionId: started.data.id })).data, []);

  phone.close(); a.close();
});

// ── Connected to the rest of the app ─────────────────────────────────────────

test('followers are told when somebody they follow goes live', { skip }, async () => {
  const phone = await open(HOST);
  const laptop = await open(VIEWER);
  await db.sql`
    INSERT INTO follows (follower_id, following_id, created_at)
    VALUES (${VIEWER}, ${HOST}, ${Date.now()}) ON CONFLICT DO NOTHING
  `;

  const invited = collect(laptop, 'live:invite');
  await settle();
  await send(phone, 'live:start', { title: 'ვთამაშობ მაფიას' });
  await settle();

  // A broadcast nobody is watching is the failure mode of the whole feature,
  // and the only fix is telling people while it is still on.
  assert.equal(invited.length, 1);
  assert.equal(invited[0].hostId, HOST);
  assert.equal(invited[0].title, 'ვთამაშობ მაფიას');

  const [notif] = await db.sql`
    SELECT type, body FROM community_notifications WHERE player_id = ${VIEWER}
  ` as any[];
  assert.equal(notif.type, 'live', 'and it is still there when they come back to it');

  phone.close(); laptop.close();
});

test('somebody who does not follow is left alone', { skip }, async () => {
  const phone = await open(HOST);
  const laptop = await open(VIEWER);
  const invited = collect(laptop, 'live:invite');
  await settle();
  await send(phone, 'live:start', {});
  await settle();
  assert.equal(invited.length, 0);
  phone.close(); laptop.close();
});

test('restarting inside the cooldown does not announce twice', { skip }, async () => {
  const phone = await open(HOST);
  const laptop = await open(VIEWER);
  await db.sql`
    INSERT INTO follows (follower_id, following_id, created_at)
    VALUES (${VIEWER}, ${HOST}, ${Date.now()}) ON CONFLICT DO NOTHING
  `;
  const invited = collect(laptop, 'live:invite');
  await settle();

  // The usual way to start twice in a minute is an app that was killed and
  // reopened. Nobody should be told about that twice.
  await send(phone, 'live:start', { title: 'ერთი' });
  await settle();
  await send(phone, 'live:start', { title: 'ორი' });
  await settle();

  assert.equal(invited.length, 1);
  phone.close(); laptop.close();
});

test('a real broadcast earns Legacy XP, once', { skip }, async () => {
  const phone = await open(HOST);
  const laptop = await open(VIEWER);
  const started = await send(phone, 'live:start', {});
  await send(laptop, 'live:join', { sessionId: started.data.id });

  // Twelve minutes ago, so there is something to pay for. `startedAt` is what
  // the award reads, and a test cannot wait twelve minutes.
  await db.sql`UPDATE live_sessions SET started_at = ${Date.now() - 12 * 60_000} WHERE id = ${started.data.id}`;

  const summary = (await send(phone, 'live:end')).data;
  await settle();

  const rows = await db.sql`
    SELECT source, amount FROM legacy_xp_events WHERE user_id = ${HOST}
  ` as any[];
  assert.equal(rows.length, 1, 'the `live` source finally has a caller');
  assert.equal(rows[0].source, 'live');
  // 12 minutes × 2, plus 1 viewer × 3.
  assert.equal(Number(rows[0].amount), 27);

  // An end arrives from the button, the socket closing and the reaper, and any
  // two of them can race — `ref` is the session id for exactly this reason.
  await LS.awardLiveXP(server, summary);
  const again = await db.sql`SELECT 1 FROM legacy_xp_events WHERE user_id = ${HOST}` as any[];
  assert.equal(again.length, 1, 'paid once, however many ends arrive');

  phone.close(); laptop.close();
});

test('a stream that lasted seconds earns nothing', { skip }, async () => {
  // Otherwise the way to farm it is to start and stop in a loop.
  const phone = await open(HOST);
  await send(phone, 'live:start', {});
  await send(phone, 'live:end');
  await settle();

  const rows = await db.sql`SELECT 1 FROM legacy_xp_events WHERE user_id = ${HOST}` as any[];
  assert.equal(rows.length, 0);
  phone.close();
});
