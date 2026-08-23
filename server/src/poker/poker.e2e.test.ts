/**
 * Socket-level tests: a real Socket.IO server, real clients, real JSON on the
 * wire, real acknowledgements.
 *
 * Not a mock of the transport. The whole point of this layer is what happens
 * when a payload crosses a socket — what is in it, who receives it, and what a
 * malformed or hostile one does — and none of that is exercised by calling the
 * service directly. So these tests bind a port and talk to it.
 */

import { test, before, after } from 'node:test';
import { strict as assert } from 'assert';
import { createServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';

import { registerPokerHandlers, handlePokerDisconnect, shutdownPoker, pokerService } from './poker.js';

process.env.POKER_ENABLED = '1';

let http: HttpServer;
let server: Server;
let port: number;

before(async () => {
  http = createServer();
  server = new Server(http, { cors: { origin: '*' } });

  // Stand in for the app's auth middleware: the profile comes from the
  // handshake, never from a payload, exactly as it does in production.
  server.use((socket, next) => {
    (socket.data as { profileId: string | null }).profileId =
      (socket.handshake.auth as { profileId?: string })?.profileId ?? null;
    next();
  });

  server.on('connection', socket => {
    registerPokerHandlers(server as never, socket as never);
    socket.on('disconnect', () => handlePokerDisconnect(server as never, socket as never));
  });

  await new Promise<void>(resolve => http.listen(0, () => resolve()));
  port = (http.address() as { port: number }).port;
});

after(async () => {
  shutdownPoker();
  server.close();
  await new Promise<void>(resolve => http.close(() => resolve()));
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const open = (profileId: string | null): Promise<ClientSocket> => new Promise((resolve, reject) => {
  const socket = connect(`http://localhost:${port}`, {
    auth: profileId ? { profileId } : {},
    transports: ['websocket'],
    forceNew: true,
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

/** Collect everything a client is sent, so a leak has somewhere to show up. */
function record(socket: ClientSocket, events: string[]): { event: string; payload: any }[] {
  const seen: { event: string; payload: any }[] = [];
  for (const event of events) socket.on(event, (payload: unknown) => seen.push({ event, payload }));
  return seen;
}

const settle = () => new Promise(resolve => setTimeout(resolve, 60));

// ─── Tests ───────────────────────────────────────────────────────────────────

test('an anonymous socket cannot do anything', async () => {
  const anon = await open(null);
  for (const event of ['poker:list', 'poker:create', 'poker:join', 'poker:sit', 'poker:action', 'poker:chat']) {
    const res = await send(anon, event, { tableId: 'x', code: 'ABCDEF' });
    assert.equal(res.ok, false, `${event} must not serve an anonymous socket`);
    assert.equal((res as { error: string }).error, 'AUTH_REQUIRED');
  }
  anon.close();
});

test('a table can be created, joined and sat at over the wire', async () => {
  const host = await open('u_host');
  const guest = await open('u_guest');

  const created = await send(host, 'poker:create', { name: 'Wire', smallBlind: 10, bigBlind: 20, buyIn: 2000 });
  assert.equal(created.ok, true);
  const table = (created as { data: any }).data;
  assert.equal(table.name, 'Wire');
  assert.equal(table.yourSeat, null, 'creating a table does not seat you');

  assert.equal((await send(host, 'poker:sit', { tableId: table.id, seat: 0, name: 'Host' })).ok, true);

  const joined = await send(guest, 'poker:join', { code: table.code, name: 'Guest' });
  assert.equal(joined.ok, true);
  assert.equal((await send(guest, 'poker:sit', { tableId: table.id, seat: 1, name: 'Guest' })).ok, true);

  const listed = await send(host, 'poker:list');
  assert.equal(listed.ok, true);
  const row = (listed as { data: any }).data.tables.find((t: any) => t.id === table.id);
  assert.equal(row.seated, 2);

  host.close(); guest.close();
});

test('the lobby publishes the compliance notice and its facts', async () => {
  const client = await open('u_notice');
  const res = await send(client, 'poker:list');
  const { compliance } = (res as { data: any }).data;

  assert.equal(compliance.facts.chipsHaveCashValue, false);
  assert.equal(compliance.facts.realMoneyWagering, false);
  assert.equal(compliance.facts.depositEnabled, false);
  assert.equal(compliance.facts.withdrawalEnabled, false);
  assert.equal(compliance.facts.playerToPlayerTransferEnabled, false);
  assert.equal(compliance.facts.redemptionEnabled, false);
  assert.ok(compliance.notice.noticeShort.length > 0, 'and the notice itself');
  assert.equal(compliance.notice.productDescriptor, 'social poker');

  client.close();
});

test('no client is ever sent another player\'s cards, on the wire', async () => {
  const a = await open('u_a');
  const b = await open('u_b');
  const seenA = record(a, ['poker:state', 'poker:hand_start', 'poker:settlement']);
  const seenB = record(b, ['poker:state', 'poker:hand_start', 'poker:settlement']);

  const table = ((await send(a, 'poker:create', { name: 'Leak', handIntervalSeconds: 1 })) as { data: any }).data;
  await send(a, 'poker:sit', { tableId: table.id, seat: 0, name: 'A' });
  await send(b, 'poker:join', { code: table.code, name: 'B' });
  await send(b, 'poker:sit', { tableId: table.id, seat: 1, name: 'B' });

  // Wait out the pre-deal pause on the real clock, then play the hand out.
  await new Promise(resolve => setTimeout(resolve, 1200));

  const service = pokerService()!;
  const live = service.getTable(table.id)!;
  assert.ok(live.hand, 'the hand was dealt');

  for (let i = 0; i < 40 && live.hand && live.hand.phase !== 'COMPLETE'; i++) {
    const hand = live.hand;
    if (hand.actingSeat === null) break;
    const pid = hand.seats.find(s => s.seat === hand.actingSeat)!.playerId;
    const socket = pid === 'u_a' ? a : b;
    const legal = service.viewFor(live, pid).youCan!;
    await send(socket, 'poker:action', {
      tableId: table.id, handId: hand.handId, actionSeq: live.actionSeq,
      type: legal.canCheck ? 'check' : 'call',
    });
  }
  await settle();

  // Every payload that reached A, checked against what A's own cards were.
  const check = (seen: { payload: any }[], viewer: string) => {
    let sawOwn = false;
    for (const { payload } of seen) {
      for (const seat of payload?.seats ?? []) {
        if (!seat.cards) continue;
        if (seat.playerId === viewer) { sawOwn = true; continue; }
        const phase = payload.hand?.phase;
        assert.ok(
          ['SHOWDOWN', 'SETTLEMENT', 'COMPLETE'].includes(phase),
          `${viewer} received seat ${seat.seat}'s cards during ${phase}`,
        );
      }
    }
    assert.ok(sawOwn, `${viewer} should have been sent their own cards at least once`);
  };
  check(seenA, 'u_a');
  check(seenB, 'u_b');

  a.close(); b.close();
});

test('a replayed action packet on the wire changes nothing', async () => {
  const a = await open('u_r1');
  const b = await open('u_r2');

  const table = ((await send(a, 'poker:create', { name: 'Replay', handIntervalSeconds: 1 })) as { data: any }).data;
  await send(a, 'poker:sit', { tableId: table.id, seat: 0, name: 'A' });
  await send(b, 'poker:join', { code: table.code, name: 'B' });
  await send(b, 'poker:sit', { tableId: table.id, seat: 1, name: 'B' });
  await new Promise(resolve => setTimeout(resolve, 1200));

  const service = pokerService()!;
  const live = service.getTable(table.id)!;
  const hand = live.hand!;
  const pid = hand.seats.find(s => s.seat === hand.actingSeat)!.playerId;
  const socket = pid === 'u_r1' ? a : b;
  const packet = { tableId: table.id, handId: hand.handId, actionSeq: live.actionSeq, type: 'call' };

  const first = await send(socket, 'poker:action', packet);
  assert.equal(first.ok, true);
  const potAfter = live.hand!.seats.reduce((sum, s) => sum + s.committedTotal, 0);

  for (let i = 0; i < 3; i++) {
    const again = await send(socket, 'poker:action', packet);
    assert.equal(again.ok, false, 'the same packet again is a duplicate');
    assert.equal((again as { error: string }).error, 'SEQ_MISMATCH');
  }
  assert.equal(
    live.hand!.seats.reduce((sum, s) => sum + s.committedTotal, 0), potAfter,
    'and the pot did not move',
  );

  a.close(); b.close();
});

test('a hostile payload is bounded, not honoured', async () => {
  const a = await open('u_h1');
  const b = await open('u_h2');

  const table = ((await send(a, 'poker:create', {
    name: 'x'.repeat(500),
    smallBlind: 1e9, bigBlind: Number.POSITIVE_INFINITY, maxSeats: 999, buyIn: 1e15,
    handIntervalSeconds: 1,
  })) as { data: any }).data;

  assert.ok(table.name.length <= 40, 'a 500-character table name is truncated');
  assert.ok(table.maxSeats <= 9, 'nine seats is the table, whatever was asked for');
  assert.ok(table.config.smallBlind <= 5000 && table.config.smallBlind > 0);
  assert.ok(Number.isFinite(table.config.bigBlind), 'Infinity is not a blind');
  assert.ok(table.config.buyIn <= 1_000_000);

  await send(a, 'poker:sit', { tableId: table.id, seat: 0, name: 'A' });
  await send(b, 'poker:join', { code: table.code });
  await send(b, 'poker:sit', { tableId: table.id, seat: 1, name: 'B' });
  await new Promise(resolve => setTimeout(resolve, 1200));

  const service = pokerService()!;
  const live = service.getTable(table.id)!;
  const hand = live.hand!;
  const pid = hand.seats.find(s => s.seat === hand.actingSeat)!.playerId;
  const socket = pid === 'u_h1' ? a : b;
  const stackBefore = hand.seats.find(s => s.playerId === pid)!.stack;

  const res = await send(socket, 'poker:action', {
    tableId: table.id, handId: hand.handId, actionSeq: live.actionSeq,
    type: 'raise', amount: Number.MAX_SAFE_INTEGER,
  });

  const after = live.hand!.seats.find(s => s.playerId === pid)!;
  assert.ok(after.stack >= 0, 'a stack can never go negative');
  assert.ok(stackBefore - after.stack <= stackBefore, 'nobody spends more than they hold');
  if (res.ok) assert.ok(after.allIn, 'an impossible raise is at most an all-in');

  // And an action type that does not exist is refused by name.
  const bogus = await send(socket, 'poker:action', {
    tableId: table.id, handId: live.hand!.handId, actionSeq: live.actionSeq, type: 'win',
  });
  assert.equal(bogus.ok, false);
  assert.equal((bogus as { error: string }).error, 'BAD_ACTION');

  a.close(); b.close();
});

test('a player cannot act as somebody else by putting their id in the payload', async () => {
  const a = await open('u_i1');
  const b = await open('u_i2');

  const table = ((await send(a, 'poker:create', { name: 'Ident', handIntervalSeconds: 1 })) as { data: any }).data;
  await send(a, 'poker:sit', { tableId: table.id, seat: 0, name: 'A' });
  await send(b, 'poker:join', { code: table.code });
  await send(b, 'poker:sit', { tableId: table.id, seat: 1, name: 'B' });
  await new Promise(resolve => setTimeout(resolve, 1200));

  const service = pokerService()!;
  const live = service.getTable(table.id)!;
  const acting = live.hand!.seats.find(s => s.seat === live.hand!.actingSeat)!.playerId;
  const idle = acting === 'u_i1' ? b : a;

  const res = await send(idle, 'poker:action', {
    tableId: table.id, handId: live.hand!.handId, actionSeq: live.actionSeq,
    type: 'fold', playerId: acting,        // ← the lie
  });
  assert.equal(res.ok, false, 'the payload does not get to say who you are');
  assert.equal((res as { error: string }).error, 'OUT_OF_TURN');

  a.close(); b.close();
});

test('chat is limited, and only for people at the table', async () => {
  const a = await open('u_c1');
  const outsider = await open('u_c2');

  const table = ((await send(a, 'poker:create', { name: 'Chat' })) as { data: any }).data;
  await send(a, 'poker:sit', { tableId: table.id, seat: 0, name: 'A' });

  const denied = await send(outsider, 'poker:chat', { tableId: table.id, text: 'hello' });
  assert.equal(denied.ok, false);
  assert.equal((denied as { error: string }).error, 'NOT_AT_TABLE');

  let allowed = 0;
  let limited = 0;
  for (let i = 0; i < 12; i++) {
    const res = await send(a, 'poker:chat', { tableId: table.id, text: `msg ${i}` });
    if (res.ok) allowed += 1;
    else if ((res as { error: string }).error.startsWith('RATE_LIMITED')) limited += 1;
  }
  assert.ok(allowed > 0, 'a player can talk');
  assert.ok(limited > 0, 'but not without limit');

  a.close(); outsider.close();
});

test('a reconnect gets the seat and the state back', async () => {
  const a = await open('u_rc1');
  const b = await open('u_rc2');

  const table = ((await send(a, 'poker:create', { name: 'Resume', handIntervalSeconds: 1 })) as { data: any }).data;
  await send(a, 'poker:sit', { tableId: table.id, seat: 0, name: 'A' });
  await send(b, 'poker:join', { code: table.code });
  await send(b, 'poker:sit', { tableId: table.id, seat: 1, name: 'B' });
  await new Promise(resolve => setTimeout(resolve, 1200));

  b.close();
  await settle();

  // Same identity, brand new socket — which is exactly what a phone coming back
  // from a locked screen looks like.
  const bAgain = await open('u_rc2');
  const resumed = await send(bAgain, 'poker:resume');
  assert.equal(resumed.ok, true);
  const views = (resumed as { data: any }).data.tables;
  assert.equal(views.length, 1);
  assert.equal(views[0].yourSeat, 1, 'the seat was held');
  assert.ok(views[0].hand, 'and the hand is still there');
  const own = views[0].seats.find((s: any) => s.playerId === 'u_rc2');
  assert.equal(own.cards.length, 2, 'with their own cards, and only their own');
  assert.equal(views[0].seats.find((s: any) => s.playerId === 'u_rc1').cards, null);

  a.close(); bAgain.close();
});

test('the host leaving closes the table for everyone', async () => {
  const host = await open('u_hl1');
  const guest = await open('u_hl2');
  const closed: any[] = [];
  guest.on('poker:closed', payload => closed.push(payload));

  const table = ((await send(host, 'poker:create', { name: 'Close' })) as { data: any }).data;
  await send(host, 'poker:sit', { tableId: table.id, seat: 0, name: 'H' });
  await send(guest, 'poker:join', { code: table.code });
  await settle();

  await send(host, 'poker:leave', { tableId: table.id });
  await settle();

  assert.equal(closed.length, 1, 'the room announces that it is gone');
  assert.equal(closed[0].reason, 'host_left');
  const list = await send(guest, 'poker:list');
  assert.equal((list as { data: any }).data.tables.find((t: any) => t.id === table.id), undefined);

  host.close(); guest.close();
});
