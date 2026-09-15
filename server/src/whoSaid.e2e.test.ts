/**
 * ვინ თქვა? — socket-level tests.
 *
 * A real Socket.IO server, real clients, real acknowledgements. The service
 * tests already cover the rules; what a unit test cannot see is what each
 * client is actually SENT, and that is the whole security of this game: the
 * line, and who is reading it, must reach exactly one socket.
 *
 * `getSafeState` being correct is not enough on its own. The broadcast builds
 * a payload per recipient, and a broadcast that sent everybody the host's view
 * — or that fell back to a single shared payload — would pass every service
 * test in the file next door and hand the round to the room.
 */

import { test, before, after, beforeEach } from 'node:test';
import { strict as assert } from 'assert';
import { createServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';

import { registerWhoSaidHandlers } from './whoSaid.js';
import { __reset } from './services/whoSaidService.js';
import { PHRASES } from './services/whoSaidPhrases.js';

let http: HttpServer;
let server: Server;
let port: number;

before(async () => {
  http = createServer();
  server = new Server(http, { cors: { origin: '*' } });
  server.use((socket, next) => {
    (socket.data as { profileId: string | null }).profileId =
      (socket.handshake.auth as { profileId?: string })?.profileId ?? null;
    next();
  });
  server.on('connection', socket => registerWhoSaidHandlers(server as never, socket as never));
  await new Promise<void>(resolve => http.listen(0, () => resolve()));
  port = (http.address() as { port: number }).port;
});

after(async () => {
  /*
   * Force the sockets down before closing: http.close() waits for open
   * connections, and a test that fails an assert never reaches its own
   * close() — so one failure would hang the run instead of reporting it.
   */
  server.disconnectSockets(true);
  server.close();
  http.closeAllConnections?.();
  await new Promise<void>(resolve => http.close(() => resolve()));
});

beforeEach(() => { __reset(); });

const open = (profileId: string): Promise<ClientSocket> => new Promise((resolve, reject) => {
  const socket = connect(`http://localhost:${port}`, {
    auth: { profileId }, transports: ['websocket'], forceNew: true,
  });
  socket.on('connect', () => resolve(socket));
  socket.on('connect_error', reject);
});

type Ack = { ok: true; data: any } | { ok: false; error: string };

const send = (socket: ClientSocket, event: string, data: unknown = {}): Promise<Ack> =>
  new Promise(resolve => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'TIMEOUT' }), 2000);
    socket.emit(event, data, (res: Ack) => { clearTimeout(timer); resolve(res); });
  });

/** The latest ws:state this client was sent. */
function latest(socket: ClientSocket): { get: () => any } {
  let last: any = null;
  socket.on('ws:state', (p: any) => { last = p; });
  return { get: () => last };
}

const settle = () => new Promise(r => setTimeout(r, 90));

/** Open a table of `n` clients, all joined, and return them with their states. */
async function table(n: number) {
  const socks: ClientSocket[] = [];
  for (let i = 0; i < n; i++) socks.push(await open(`p${i}`));
  const views = socks.map(latest);
  const created = await send(socks[0]!, 'ws:create', { nickname: 'P0' });
  assert.equal(created.ok, true);
  const code = (created as any).data.code;
  const id = (created as any).data.id;
  for (let i = 1; i < n; i++) {
    const j = await send(socks[i]!, 'ws:join', { code, nickname: `P${i}` });
    assert.equal(j.ok, true, `P${i} could not join`);
  }
  await settle();
  return { socks, views, id, code, close: () => socks.forEach(s => s.close()) };
}

test('the line reaches exactly one client', async () => {
  const t = await table(4);
  const started = await send(t.socks[0]!, 'ws:start', { matchId: t.id });
  assert.equal(started.ok, true);
  await settle();

  const withPhrase = t.views
    .map((v, i) => ({ i, phrase: v.get()?.phrase, reading: v.get()?.youAreReading }))
    .filter(x => x.phrase !== null && x.phrase !== undefined);

  assert.equal(withPhrase.length, 1, `${withPhrase.length} clients were sent the line`);
  assert.equal(withPhrase[0]!.reading, true);
  assert.ok(PHRASES.includes(withPhrase[0]!.phrase), 'the line sent is not one of the phrases');
  t.close();
});

test('no other client is told who is reading', async () => {
  const t = await table(5);
  await send(t.socks[0]!, 'ws:start', { matchId: t.id });
  await settle();

  const readerIdx = t.views.findIndex(v => v.get()?.youAreReading);
  assert.ok(readerIdx >= 0, 'nobody was made the reader');

  for (let i = 0; i < t.views.length; i++) {
    if (i === readerIdx) continue;
    const s = t.views[i]!.get();
    assert.equal(s.youAreReading, false, `P${i} was told they are reading`);
    assert.equal(s.phrase, null, `P${i} was sent the line`);
    // And nothing in the payload singles the reader's row out from the rest.
    const rows = s.players.map((p: any) => Object.keys(p).sort().join(','));
    assert.equal(new Set(rows).size, 1, `P${i}'s player rows are not all the same shape`);
  }
  t.close();
});

test('every client gets a state of its own, not the host\'s', async () => {
  /*
   * The bug this pins down: a broadcast that builds one payload and sends it
   * to the room. Every service test would still pass — the safe state would be
   * computed correctly, once, for whoever happened to be first — and the whole
   * table would be looking at the host's view of the round.
   */
  const t = await table(4);
  await send(t.socks[0]!, 'ws:start', { matchId: t.id });
  await settle();
  const payloads = t.views.map(v => JSON.stringify(v.get()));
  assert.equal(new Set(payloads).size > 1, true, 'every client received an identical payload');
  t.close();
});

test('a guess and a reveal reach the whole table', async () => {
  const t = await table(3);
  await send(t.socks[0]!, 'ws:start', { matchId: t.id });
  await settle();
  const readerIdx = t.views.findIndex(v => v.get()?.youAreReading);
  const readerId = `p${readerIdx}`;

  await send(t.socks[readerIdx]!, 'ws:done_reading', { matchId: t.id });
  await settle();
  assert.equal(t.views[0]!.get().status, 'voting');

  // Both non-readers accuse the reader: the round should close on the last one.
  for (let i = 0; i < 3; i++) {
    if (i === readerIdx) continue;
    const r = await send(t.socks[i]!, 'ws:vote', { matchId: t.id, targetId: readerId });
    assert.equal(r.ok, true, `P${i} could not vote`);
  }
  await settle();

  for (let i = 0; i < 3; i++) {
    const s = t.views[i]!.get();
    assert.equal(s.status, 'reveal', `P${i} did not see the reveal`);
    assert.equal(s.reveal.readerId, readerId);
    assert.ok(PHRASES.includes(s.reveal.phrase), 'the reveal did not carry the line');
  }
  t.close();
});

test('the reader cannot vote, over the wire', async () => {
  const t = await table(4);
  await send(t.socks[0]!, 'ws:start', { matchId: t.id });
  await settle();
  const readerIdx = t.views.findIndex(v => v.get()?.youAreReading);
  await send(t.socks[readerIdx]!, 'ws:done_reading', { matchId: t.id });
  await settle();

  const target = `p${(readerIdx + 1) % 4}`;
  const res = await send(t.socks[readerIdx]!, 'ws:vote', { matchId: t.id, targetId: target });
  assert.equal(res.ok, false, 'the reader was allowed to vote');
  t.close();
});

test('a bystander cannot end the reading', async () => {
  const t = await table(4);
  await send(t.socks[0]!, 'ws:start', { matchId: t.id });
  await settle();
  const readerIdx = t.views.findIndex(v => v.get()?.youAreReading);
  const bystander = [1, 2, 3].find(i => i !== readerIdx)!;
  const res = await send(t.socks[bystander]!, 'ws:done_reading', { matchId: t.id });
  assert.equal(res.ok, false, 'a bystander ended the reading phase');
  t.close();
});

test('only the host starts the match', async () => {
  const t = await table(4);
  const res = await send(t.socks[2]!, 'ws:start', { matchId: t.id });
  assert.equal(res.ok, false, 'a guest started the match');
  t.close();
});

test('a player who leaves stops receiving the round', async () => {
  /*
   * The bug the sxvaMafia e2e file exists for, in this game: broadcasts go to
   * stored socket ids rather than to a Socket.IO room, so `socket.leave()`
   * alone does not stop them. Leaving has to mark the player disconnected, and
   * a state arriving after that would put a closed room back on their screen.
   */
  const t = await table(4);
  await send(t.socks[0]!, 'ws:start', { matchId: t.id });
  await settle();

  const leaver = 3;
  await send(t.socks[leaver]!, 'ws:leave', { matchId: t.id });
  await settle();
  const before = JSON.stringify(t.views[leaver]!.get());

  // Something that broadcasts to everybody still in the match.
  const readerIdx = t.views.findIndex((v, i) => i !== leaver && v.get()?.youAreReading);
  if (readerIdx >= 0) await send(t.socks[readerIdx]!, 'ws:done_reading', { matchId: t.id });
  await settle();

  assert.equal(JSON.stringify(t.views[leaver]!.get()), before,
    'a player who left was still sent the round');
  t.close();
});

test('a reconnecting player is sent their own view again', async () => {
  const t = await table(4);
  await send(t.socks[0]!, 'ws:start', { matchId: t.id });
  await settle();
  const readerIdx = t.views.findIndex(v => v.get()?.youAreReading);

  // The reader drops and comes back on a new socket.
  t.socks[readerIdx]!.close();
  await settle();
  const back = await open(`p${readerIdx}`);
  const backView = latest(back);
  const res = await send(back, 'ws:resume');
  assert.equal(res.ok, true);
  await settle();

  const state = (res as any).data ?? backView.get();
  assert.equal(state.youAreReading, true, 'the reader lost their round on reconnect');
  assert.ok(state.phrase, 'the reader was not given their line back');
  back.close();
  t.close();
});

test('somebody outside the match cannot vote in it', async () => {
  const t = await table(4);
  await send(t.socks[0]!, 'ws:start', { matchId: t.id });
  await settle();
  const readerIdx = t.views.findIndex(v => v.get()?.youAreReading);
  await send(t.socks[readerIdx]!, 'ws:done_reading', { matchId: t.id });
  await settle();

  const outsider = await open('stranger');
  const res = await send(outsider, 'ws:vote', { matchId: t.id, targetId: `p${readerIdx}` });
  assert.equal(res.ok, false, 'a stranger voted in somebody else\'s match');
  outsider.close();
  t.close();
});
