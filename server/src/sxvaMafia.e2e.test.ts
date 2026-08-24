/**
 * მაფია ჰოსტით — socket-level tests.
 *
 * A real Socket.IO server, real clients, real acknowledgements. These cover the
 * two things that were wrong in production and cannot be seen from a unit test:
 * who receives a broadcast, and what a client is left holding afterwards.
 *
 * The bug this file exists to pin down: `broadcastState` addresses stored
 * socket ids, not a Socket.IO room, so `socket.leave()` did nothing. The host
 * who dissolved a room was still in the recipient list and received the closed
 * room back — which reopened it on their screen. Pressing "leave" dissolved it
 * again, and there was no way out of the loop.
 */

import { test, before, after } from 'node:test';
import { strict as assert } from 'assert';
import { createServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';

import { registerSxvaMafiaHandlers } from './sxvaMafia.js';

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
  server.on('connection', socket => registerSxvaMafiaHandlers(server as never, socket as never));
  await new Promise<void>(resolve => http.listen(0, () => resolve()));
  port = (http.address() as { port: number }).port;
});

after(async () => {
  server.close();
  await new Promise<void>(resolve => http.close(() => resolve()));
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

/** Every xm:state this client is sent, in order. */
function states(socket: ClientSocket): any[] {
  const seen: any[] = [];
  socket.on('xm:state', (payload: any) => seen.push(payload));
  return seen;
}

const settle = () => new Promise(resolve => setTimeout(resolve, 120));

/** A host and `n` seated players, all in the lobby. */
async function room(tag: string, n: number) {
  const host = await open(`${tag}_host`);
  const created = await send(host, 'xm:create', { nickname: 'Host', maxSeats: 10 });
  const match = (created as { data: any }).data;

  const players: ClientSocket[] = [];
  for (let i = 0; i < n; i++) {
    const p = await open(`${tag}_p${i}`);
    await send(p, 'xm:join', { code: match.code, nickname: `P${i}` });
    players.push(p);
  }
  await settle();
  return { host, players, match };
}

// ─── The dissolve loop ───────────────────────────────────────────────────────

test('a host who closes the room is not sent the closed room back', async () => {
  const { host, players, match } = await room('d1', 1);
  const hostStates = states(host);
  const playerStates = states(players[0]!);

  await send(host, 'xm:leave', { matchId: match.id });
  await settle();

  assert.equal(
    hostStates.length, 0,
    'the host received their own departure back — this is what reopened the closed room on their screen',
  );
  assert.ok(playerStates.length > 0, 'the player is told the room closed');
  assert.equal(playerStates[playerStates.length - 1].dissolved, true);

  host.close(); players[0]!.close();
});

test('leaving twice is harmless — there is no loop to get stuck in', async () => {
  const { host, players, match } = await room('d2', 1);
  const hostStates = states(host);

  for (let i = 0; i < 4; i++) {
    const res = await send(host, 'xm:leave', { matchId: match.id });
    assert.equal(res.ok, true, 'leaving an already-closed room is not an error');
  }
  await settle();
  assert.equal(hostStates.length, 0, 'and never puts the room back on their screen');

  host.close(); players[0]!.close();
});

test('a player who leaves stops receiving the table', async () => {
  const { host, players, match } = await room('d3', 2);
  const leaver = players[0]!;
  const leaverStates = states(leaver);
  const stayerStates = states(players[1]!);

  await send(leaver, 'xm:leave', { matchId: match.id });
  await settle();
  await send(host, 'xm:set_settings', { matchId: match.id, patch: { speechSeconds: 45 } });
  await settle();

  assert.equal(leaverStates.length, 0, 'nothing reaches someone who walked out');
  assert.ok(stayerStates.length > 0, 'while the room carries on for everyone else');

  host.close(); players.forEach(p => p.close());
});

// ─── Fouls ───────────────────────────────────────────────────────────────────

test('the host gives and takes back fouls, and four removes the player', async () => {
  const { host, players, match } = await room('f1', 4);
  const target = 'f1_p0';

  await send(host, 'xm:give_foul', { matchId: match.id, targetId: target, delta: 1 });
  await send(host, 'xm:give_foul', { matchId: match.id, targetId: target, delta: 1 });
  await settle();

  const seen = states(host);
  await send(host, 'xm:give_foul', { matchId: match.id, targetId: target, delta: -1 });
  await settle();
  const afterUndo = seen[seen.length - 1].seats.find((s: any) => s.userId === target);
  assert.equal(afterUndo.fouls, 1, 'a foul can be taken back — a misplaced tap is not a ruling');

  for (let i = 0; i < 3; i++) await send(host, 'xm:give_foul', { matchId: match.id, targetId: target, delta: 1 });
  await settle();

  const final = seen[seen.length - 1].seats.find((s: any) => s.userId === target);
  assert.equal(final.fouls, 4);
  assert.equal(final.alive, false, 'four fouls puts them out of the round');
  assert.equal(final.eliminatedBy, 'fouls');

  host.close(); players.forEach(p => p.close());
});

test('only the host can hand out a foul', async () => {
  const { host, players, match } = await room('f2', 3);
  const res = await send(players[0]!, 'xm:give_foul', { matchId: match.id, targetId: 'f2_p1', delta: 1 });
  assert.equal(res.ok, false, 'a player cannot foul another player');

  host.close(); players.forEach(p => p.close());
});

// ─── Kick ────────────────────────────────────────────────────────────────────

test('the host removes a player from the lobby, and they are told', async () => {
  const { host, players, match } = await room('k1', 2);
  const victim = players[0]!;
  let kicked: any = null;
  victim.on('xm:kicked', (payload: any) => { kicked = payload; });
  const victimStates = states(victim);

  const res = await send(host, 'xm:kick', { matchId: match.id, targetId: 'k1_p0' });
  assert.equal(res.ok, true);
  await settle();

  assert.ok(kicked, 'the removed player is told directly — their screen has to close');
  assert.equal(kicked.matchId, match.id);
  assert.equal(victimStates.length, 0, 'and nothing more is pushed at them');

  const listed = await send(host, 'xm:list');
  const row = (listed as { data: any }).data.find((r: any) => r.id === match.id);
  assert.equal(row.seatCount, 1, 'the seat is gone from the room');

  host.close(); players.forEach(p => p.close());
});

test('a removed player cannot walk back in', async () => {
  const { host, players, match } = await room('k2', 4);

  // Start the game so the removal is a mid-game ruling rather than a lobby tidy-up.
  const started = await send(host, 'xm:start', { matchId: match.id });
  assert.equal(started.ok, true, 'four players is enough to start');

  await send(host, 'xm:kick', { matchId: match.id, targetId: 'k2_p0' });
  await settle();

  const again = await send(players[0]!, 'xm:join', { code: match.code, nickname: 'P0' });
  assert.equal(again.ok, false, 'rejoining is refused');

  host.close(); players.forEach(p => p.close());
});

test('a mid-game removal is recorded as a ruling, not a disappearance', async () => {
  const { host, players, match } = await room('k3', 4);
  await send(host, 'xm:start', { matchId: match.id });
  const seen = states(host);

  await send(host, 'xm:kick', { matchId: match.id, targetId: 'k3_p1' });
  await settle();

  const state = seen[seen.length - 1];
  const seat = state.seats.find((s: any) => s.userId === 'k3_p1');
  assert.ok(seat, 'the seat stays visible — the table should show who is out and why');
  assert.equal(seat.alive, false);
  assert.equal(seat.eliminatedBy, 'fouls');

  host.close(); players.forEach(p => p.close());
});

test('a player cannot remove anybody, and the host cannot remove themselves', async () => {
  const { host, players, match } = await room('k4', 3);

  const byPlayer = await send(players[0]!, 'xm:kick', { matchId: match.id, targetId: 'k4_p1' });
  assert.equal(byPlayer.ok, false, 'only the moderator removes people');

  const self = await send(host, 'xm:kick', { matchId: match.id, targetId: 'k4_host' });
  assert.equal(self.ok, false, 'and not themselves');

  host.close(); players.forEach(p => p.close());
});

// ─── Reconnect ───────────────────────────────────────────────────────────────

/**
 * The freeze.
 *
 * State goes to stored socket ids, so a phone that comes back on a new socket
 * was never reached again — the table sat still while everyone else played on.
 * This is the same failure that was reported in ტყუილების ოსტატი, in the same
 * shape, and it is worth an explicit test in every game that broadcasts this way.
 */
test('a player who reconnects on a new socket is reached again', async () => {
  const { host, players, match } = await room('r1', 3);

  players[0]!.close();
  await settle();

  const back = await open('r1_p0');
  const resumed = await send(back, 'xm:resume');
  assert.equal(resumed.ok, true);
  assert.ok((resumed as { data: any }).data, 'there is a room to come back to');
  assert.equal((resumed as { data: any }).data.id, match.id);

  // And the table now reaches them: a change made afterwards must arrive.
  const seen = states(back);
  await send(host, 'xm:set_settings', { matchId: match.id, patch: { speechSeconds: 55 } });
  await settle();
  assert.ok(seen.length > 0, 'the reconnected player receives state again');
  assert.equal(seen[seen.length - 1].settings.speechSeconds, 55);

  host.close(); back.close(); players.slice(1).forEach(p => p.close());
});

test('resume offers nothing to somebody who was removed or never joined', async () => {
  const { host, players, match } = await room('r2', 2);
  await send(host, 'xm:kick', { matchId: match.id, targetId: 'r2_p0' });
  await settle();

  players[0]!.close();
  const back = await open('r2_p0');
  const resumed = await send(back, 'xm:resume');
  assert.equal(resumed.ok, true);
  assert.equal((resumed as { data: any }).data, null, 'a removed player has no room to resume');

  const stranger = await open('r2_nobody');
  assert.equal(((await send(stranger, 'xm:resume')) as { data: any }).data, null);

  host.close(); back.close(); stranger.close(); players[1]!.close();
});

// ─── Test bots ───────────────────────────────────────────────────────────────

/**
 * Bots are added over the socket by an owner, but the socket path needs a real
 * profile lookup. These drive the service and the driver directly, which is
 * what actually decides whether a game with bots can be played through.
 */
test('a game of bots deals, runs a night, and votes — driven by the host alone', async () => {
  const { joinMatchAsBot, getMatch, startMatch, beginMafiaMeet, endMafiaMeet,
          beginNight, endNight, beginDay, nextSpeaker, endVote } =
    await import('./services/sxvaMafiaService.js');
  const { tick } = await import('./services/xmBotDriver.js');

  const host = await open('b1_host');
  const created = await send(host, 'xm:create', { nickname: 'Host', maxSeats: 10 });
  const match = (created as { data: any }).data;

  for (let i = 0; i < 5; i++) {
    assert.ok(joinMatchAsBot(match.id, `bot_b1_${i}`, `ბოტი ${i}`), `bot ${i} seated`);
  }

  assert.ok(startMatch(match.id, 'b1_host'), 'five players is enough to start');
  assert.equal(getMatch(match.id)!.phase, 'assign');

  // The deal: every bot has to take a card, one tick at a time.
  for (let i = 0; i < 40 && getMatch(match.id)!.seats.some(s => s.cardIndex === null); i++) {
    assert.ok(tick(match.id), 'a bot took a card');
  }
  const dealt = getMatch(match.id)!;
  assert.ok(dealt.seats.every(s => s.cardIndex !== null), 'everyone has a card');
  assert.ok(dealt.seats.every(s => s.role !== null), 'and therefore a role');

  // Night: mafia agree on a target, the checks happen.
  beginMafiaMeet(match.id, 'b1_host');
  endMafiaMeet(match.id, 'b1_host');
  beginNight(match.id, 'b1_host');
  for (let i = 0; i < 40; i++) if (!tick(match.id)) break;

  const night = getMatch(match.id)!;
  assert.ok(Object.keys(night.night.mafiaVotes).length > 0, 'the mafia picked somebody');
  assert.ok(night.night.sheriffCheck !== null || !night.seats.some(s => s.role === 'sheriff' && s.alive),
    'the sheriff checked somebody, if there is one');

  endNight(match.id, 'b1_host');
  beginDay(match.id, 'b1_host');

  // Day: walk the speeches; a bot holding the floor sometimes nominates.
  for (let i = 0; i < 30 && getMatch(match.id)!.phase === 'speech'; i++) {
    for (let t = 0; t < 3; t++) if (!tick(match.id)) break;
    nextSpeaker(match.id, 'b1_host');
  }

  const afterDay = getMatch(match.id)!;
  if (afterDay.phase === 'vote') {
    for (let i = 0; i < 40; i++) if (!tick(match.id)) break;
    const voted = getMatch(match.id)!;
    const botVotes = Object.keys(voted.votes).filter(id => id.startsWith('bot_'));
    assert.ok(botVotes.length > 0, 'the bots voted');
    endVote(match.id, 'b1_host');
  }

  // Whatever happened, the game is somewhere legitimate and not stuck.
  const end = getMatch(match.id)!;
  assert.ok(
    ['speech', 'vote', 'last_words', 'night', 'day_announce', 'finished'].includes(end.phase),
    `the game is in a real phase, not stuck: ${end.phase}`,
  );

  host.close();
});

test('a bot never takes a card somebody else already has', async () => {
  const { joinMatchAsBot, getMatch, startMatch } = await import('./services/sxvaMafiaService.js');
  const { tick } = await import('./services/xmBotDriver.js');

  const host = await open('b2_host');
  const created = await send(host, 'xm:create', { nickname: 'Host', maxSeats: 10 });
  const match = (created as { data: any }).data;
  for (let i = 0; i < 6; i++) joinMatchAsBot(match.id, `bot_b2_${i}`, `ბოტი ${i}`);
  startMatch(match.id, 'b2_host');

  for (let i = 0; i < 60 && getMatch(match.id)!.seats.some(s => s.cardIndex === null); i++) tick(match.id);

  const indices = getMatch(match.id)!.seats.map(s => s.cardIndex);
  assert.equal(new Set(indices).size, indices.length, 'every card went to exactly one player');

  host.close();
});

test('a bot cannot be seated once the cards are out', async () => {
  const { joinMatchAsBot, startMatch } = await import('./services/sxvaMafiaService.js');

  const host = await open('b3_host');
  const created = await send(host, 'xm:create', { nickname: 'Host', maxSeats: 10 });
  const match = (created as { data: any }).data;
  for (let i = 0; i < 4; i++) joinMatchAsBot(match.id, `bot_b3_${i}`, `ბოტი ${i}`);
  startMatch(match.id, 'b3_host');

  assert.equal(
    joinMatchAsBot(match.id, 'bot_b3_late', 'გვიანი'), null,
    'the lobby is the only door in, for a bot as much as for a person',
  );

  host.close();
});
