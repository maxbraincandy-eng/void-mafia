/**
 * Going live, over real sockets, from two devices.
 *
 * The reported problem was exactly this shape: live from one phone, and the
 * other device shows nothing. So this drives it the way it actually happens —
 * two connections, one starts a broadcast, the other asks the questions the
 * feed asks — rather than testing the service in isolation, which already
 * passes and would not have caught a missing surface.
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

const HOST = 'lve_host';
const VIEWER = 'lve_viewer';

before(async () => {
  if (!url) return;
  db = await import('./db.js');
  await db.initializeDatabase();
  L = await import('./services/liveService.js');

  http = createServer();
  server = new Server(http, { cors: { origin: '*' } });
  server.use((socket, next) => {
    (socket.data as any).profileId = String(socket.handshake.auth?.profileId ?? '');
    next();
  });

  /*
   * The handlers under test, mounted standalone.
   *
   * Importing the whole socket layer would drag in every game in the app. These
   * are the exact four the feed and the strip use, wired the same way.
   */
  server.on('connection', socket => {
    const me = () => String((socket.data as any).profileId ?? '');
    socket.on('live:start', async (d: any, cb: any) => {
      const s = await L.startLive(me(), { title: d?.title, visibility: d?.visibility });
      server.emit('live:started', { hostId: me(), sessionId: s.id, title: s.title });
      cb({ ok: true, data: s });
    });
    socket.on('live:end', async (_d: any, cb: any) => {
      const s = await L.endLive(me());
      if (s) server.emit('live:stopped', { hostId: me(), sessionId: s.id });
      (typeof _d === 'function' ? _d : cb)({ ok: true, data: s });
    });
    socket.on('live:list', async (_d: any, cb: any) => {
      (typeof _d === 'function' ? _d : cb)({ ok: true, data: await L.listLive(50) });
    });
    socket.on('live:who', async (d: any, cb: any) => {
      cb({ ok: true, data: await L.liveMap(d?.userIds ?? []) });
    });
    socket.on('live:join', async (d: any, cb: any) => {
      const s = await L.joinLive(String(d?.sessionId ?? ''), me());
      cb(s ? { ok: true, data: s } : { ok: false, error: 'ended' });
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
  for (const [id, name] of [[HOST, 'Host'], [VIEWER, 'Viewer']]) {
    await db.sql`
      INSERT INTO players (id, username, avatar, joined_at, last_seen_at)
      VALUES (${id}, ${name}, '🎩', ${Date.now()}, ${Date.now()})
    `;
  }
});

async function clean(): Promise<void> {
  await db.sql`DELETE FROM live_viewers WHERE user_id LIKE 'lve\\_%' OR session_id IN (SELECT id FROM live_sessions WHERE host_id LIKE 'lve\\_%')`;
  await db.sql`DELETE FROM live_sessions WHERE host_id LIKE 'lve\\_%'`;
  await db.sql`DELETE FROM players WHERE id LIKE 'lve\\_%'`;
  L?.forgetViewer(HOST); L?.forgetViewer(VIEWER);
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
