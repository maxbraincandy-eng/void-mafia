/**
 * დამკა — rooms that nobody is in must leave the lobby.
 *
 *   npx tsx --test src/checkers.e2e.test.ts
 */

import { test, before, after } from 'node:test';
import { strict as assert } from 'assert';
import { createServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';

import { registerCheckersHandlers, handleCheckersDisconnect, sweepAbandonedCheckers } from './checkers.js';
import { getOpenMatches, createMatch } from './services/checkersService.js';

let http: HttpServer;
let server: Server;
let port: number;

before(async () => {
  http = createServer();
  server = new Server(http, { cors: { origin: '*' } });
  server.on('connection', socket => {
    registerCheckersHandlers(server as never, socket as never);
    socket.on('disconnect', () => handleCheckersDisconnect(server as never, socket.id));
  });
  await new Promise<void>(resolve => http.listen(0, () => resolve()));
  port = (http.address() as { port: number }).port;
});

after(async () => {
  server.disconnectSockets(true);
  server.close();
  http.closeAllConnections?.();
  await new Promise<void>(resolve => http.close(() => resolve()));
  // The sweep interval is unref'd, but end the run explicitly all the same.
  setTimeout(() => process.exit(0), 50).unref();
});

const open = (): Promise<ClientSocket> => new Promise((resolve, reject) => {
  const s = connect(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
  s.on('connect', () => resolve(s));
  s.on('connect_error', reject);
});

type Ack = { ok: true; data: any } | { ok: false; error: string };
const send = (s: ClientSocket, event: string, data?: unknown): Promise<Ack> =>
  new Promise(resolve => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'TIMEOUT' }), 2000);
    const cb = (res: Ack) => { clearTimeout(timer); resolve(res); };
    if (data === undefined) s.emit(event, cb); else s.emit(event, data, cb);
  });

const settle = () => new Promise(r => setTimeout(r, 80));
const isOpen = (id: string) => getOpenMatches().some(m => m.id === id);

async function playing() {
  const a = await open();
  const b = await open();
  const created = await send(a, 'checkers:create', { name: 'A' });
  assert.equal(created.ok, true);
  const { id, code } = (created as any).data;
  const joined = await send(b, 'checkers:join', { code, name: 'B' });
  assert.equal(joined.ok, true);
  return { a, b, id };
}

test('both players closing the app closes the match', async () => {
  const { a, b, id } = await playing();
  a.close(); b.close();
  await settle();
  assert.equal(isOpen(id), false, 'the match stayed in the lobby after both players left');
});

test('after a rematch, disconnecting closes the new match, not the old one', async () => {
  const { a, b, id } = await playing();
  assert.equal((await send(a, 'checkers:resign', { matchId: id })).ok, true);
  const re = await send(a, 'checkers:rematch', { matchId: id });
  assert.equal(re.ok, true);
  const newId = (re as any).data.newMatchId;
  assert.equal(isOpen(newId), true);

  a.close(); b.close();
  await settle();
  assert.equal(isOpen(newId), false, 'the rematch stayed open after both players left');
});

test('the sweep closes a match whose players are gone', () => {
  const m = createMatch({ socketId: 'gone-1', name: 'X', profileId: null },
    { forcedCapture: true, allowSpectators: true });
  m.black = { socketId: 'gone-2', name: 'Y', profileId: null };
  m.status = 'active';
  assert.equal(isOpen(m.id), true);
  assert.ok(sweepAbandonedCheckers(server as never) >= 1);
  assert.equal(isOpen(m.id), false, 'the sweep left an abandoned match open');
});

test('the sweep leaves a match alone while a player is connected', async () => {
  const { a, b, id } = await playing();
  sweepAbandonedCheckers(server as never);
  assert.equal(isOpen(id), true, 'the sweep closed a live match');
  a.close(); b.close();
  await settle();
});
