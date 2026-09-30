/**
 * Classic Mafia: at night the mafia hear each other, and nobody else hears them.
 *
 * The mafia heard nobody at night. Their client moves to the private LiveKit
 * room `${roomId}::mafia`, and the open token route refuses every private room
 * (anyone could name it there), so the move always failed. The token now comes
 * from `voice:livekit_token` on the game socket. This plays a real table into
 * the night through the real socket handlers and asks every seat for it.
 *
 *   NIGHTVOICE_TEST_DATABASE_URL=postgres://postgres@localhost:5433/livetest \
 *     npx tsx --test src/mafiaNightVoice.e2e.test.ts
 */

import { test, before, after } from 'node:test';
import { strict as assert } from 'assert';
import { createServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';

const url = process.env.NIGHTVOICE_TEST_DATABASE_URL;
const skip = url ? false : 'set NIGHTVOICE_TEST_DATABASE_URL to run the night-voice test';
if (url) process.env.DATABASE_URL = url;
process.env.LIVEKIT_URL = 'wss://example.invalid';
process.env.LIVEKIT_API_KEY = 'testkey';
process.env.LIVEKIT_API_SECRET = 'testsecret-testsecret-testsecret-1234';

let http: HttpServer;
let port: number;

before(async () => {
  if (!url) return;
  const { attachSocketHandlers, setDbReady } = await import('./socket.js');
  const db = await import('./db.js');
  await db.initializeDatabase();
  setDbReady(true);
  http = createServer();
  attachSocketHandlers(new Server(http) as any);
  await new Promise<void>(r => http.listen(0, () => r()));
  port = (http.address() as { port: number }).port;
});

after(() => { setTimeout(() => process.exit(0), 50).unref(); });

type Ack = { ok: boolean; data?: any; error?: string };
const open = (): Promise<ClientSocket> => new Promise((res, rej) => {
  const s = connect(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
  s.on('connect', () => res(s)); s.on('connect_error', rej);
});
const send = (s: ClientSocket, ev: string, d?: unknown): Promise<Ack> => new Promise(r => {
  const t = setTimeout(() => r({ ok: false, error: 'TIMEOUT' }), 4000);
  const cb = (x: Ack) => { clearTimeout(t); r(x); };
  if (d === undefined) s.emit(ev, cb); else s.emit(ev, d, cb);
});
const claims = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString());

test('night: every mafioso gets the mafia room, and no one else does', { skip, timeout: 30_000 }, async () => {
  const host = await open();
  const created = await send(host, 'room:create', { name: 'P0', settings: { startWithNight: true } });
  assert.equal(created.ok, true, created.error);
  const roomId: string = created.data.id;
  const socks = [host];
  for (let i = 1; i < 8; i++) {
    const s = await open();
    assert.equal((await send(s, 'room:join', { code: created.data.code, name: `P${i}` })).ok, true);
    socks.push(s);
  }

  let phase = 'lobby';
  const team = new Map<ClientSocket, string>();
  for (const s of socks) {
    s.on('room:update', (r: any) => { phase = r.phase; });
    s.on('game:role', (x: any) => team.set(s, x.role?.team));
  }

  const ask = () => Promise.all(socks.map(s => send(s, 'voice:livekit_token', {})));

  assert.equal((await send(host, 'game:start')).ok, true);
  // Role reveal is not night: nobody, mafia included, is let in yet.
  const early = await ask();
  assert.ok(early.every(r => !r.ok), 'a faction room was issued before night');

  for (let i = 0; i < 60 && phase !== 'night'; i++) await new Promise(r => setTimeout(r, 200));
  assert.equal(phase, 'night', 'the table never reached night');

  const night = await ask();
  const mafia = socks.filter(s => team.get(s) === 'mafia');
  assert.ok(mafia.length >= 2, `only ${mafia.length} mafia were dealt — the test needs two to mean anything`);

  socks.forEach((s, i) => {
    const r = night[i]!;
    if (team.get(s) === 'mafia') {
      assert.equal(r.ok, true, `mafioso P${i} was refused: ${r.error}`);
      assert.equal(r.data.room, `${roomId}::mafia`);
      const c = claims(r.data.token);
      assert.equal(c.video.room, `${roomId}::mafia`, 'the token admits to a different room');
      assert.equal(c.video.canPublish, true, 'a mafioso cannot speak in their own room');
    } else {
      assert.equal(r.ok, false, `P${i} (${team.get(s)}) was let into the mafia room`);
    }
  });

  // The same room for all of them — that is what lets them hear each other.
  assert.equal(new Set(mafia.map(s => night[socks.indexOf(s)]!.data.room)).size, 1);
  socks.forEach(s => s.close());
});
