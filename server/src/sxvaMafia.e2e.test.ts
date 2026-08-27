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
import {
  getMatch, joinMatchAsBot, listMatchesForMod, isHostedMatch,
} from './services/sxvaMafiaService.js';

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
  /*
   * Force the sockets down before closing.
   *
   * `http.close()` waits for open connections, and a test that fails an assert
   * never reaches its own `socket.close()` — so one failure used to hang the
   * whole run instead of reporting, which is far worse to debug than the
   * failure itself. Disconnecting everything here makes a failing test fail.
   */
  server.disconnectSockets(true);
  server.close();
  http.closeAllConnections?.();
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
  const { startMatch, beginMafiaMeet, endMafiaMeet,
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

// ─── Sequential voting ───────────────────────────────────────────────────────

/**
 * Run a game up to the day's speeches.
 *
 * The day does not open on the speeches: if the mafia killed somebody the night
 * before, it opens on the announcement and that player's last words. The first
 * version of these tests assumed otherwise and found the game in `last_words`,
 * wondering why it was not voting.
 */
async function toSpeech(matchId: string, hostId: string) {
  const svc = await import('./services/sxvaMafiaService.js');
  const { tick } = await import('./services/xmBotDriver.js');

  svc.startMatch(matchId, hostId);
  for (let i = 0; i < 40 && svc.getMatch(matchId)!.seats.some(s => s.cardIndex === null); i++) tick(matchId);
  svc.beginMafiaMeet(matchId, hostId);
  svc.endMafiaMeet(matchId, hostId);
  svc.beginNight(matchId, hostId);
  for (let i = 0; i < 40; i++) if (!tick(matchId)) break;
  svc.endNight(matchId, hostId);
  svc.beginDay(matchId, hostId);

  for (let i = 0; i < 10; i++) {
    const phase = svc.getMatch(matchId)!.phase;
    if (phase === 'speech') break;
    if (phase === 'last_words') { svc.endLastWords(matchId, hostId); continue; }
    if (phase === 'day_announce') { svc.beginDay(matchId, hostId); continue; }
    break;
  }
  // The intro circle has no vote; play through it to reach a real day.
  if (svc.getMatch(matchId)!.introRound) {
    for (let i = 0; i < 40 && svc.getMatch(matchId)!.phase === 'speech'; i++) svc.nextSpeaker(matchId, hostId);
    svc.beginNight(matchId, hostId);
    for (let i = 0; i < 40; i++) if (!tick(matchId)) break;
    svc.endNight(matchId, hostId);
    svc.beginDay(matchId, hostId);
    for (let i = 0; i < 10; i++) {
      const phase = svc.getMatch(matchId)!.phase;
      if (phase === 'speech') break;
      if (phase === 'last_words') { svc.endLastWords(matchId, hostId); continue; }
      if (phase === 'day_announce') { svc.beginDay(matchId, hostId); continue; }
      break;
    }
  }
  return svc.getMatch(matchId)!;
}

/**
 * The vote runs one candidate at a time, the way a moderator runs it out loud:
 * this nominee, hands up, count, next. Everything here is about that order —
 * you cannot vote ahead, you cannot vote twice, and silence all the way down
 * the list is counted for the last name on it.
 */
test('the vote runs one candidate at a time, and hands are public', async () => {
  const { getMatch, nominate, castVote, nextCandidate, nextSpeaker, getSafeState, joinMatchAsBot } =
    await import('./services/sxvaMafiaService.js');

  const host = await open('v1_host');
  const created = await send(host, 'xm:create', { nickname: 'Host', maxSeats: 10 });
  const match = (created as { data: any }).data;
  for (let i = 0; i < 6; i++) joinMatchAsBot(match.id, `bot_v1_${i}`, `ბოტი ${i}`);

  const m0 = await toSpeech(match.id, 'v1_host');
  assert.equal(m0.phase, 'speech', 'the day reached the speeches');

  /*
   * Two names on the list, nominated as the floor comes to each speaker.
   *
   * A nomination only counts from whoever is speaking — which is the rule, and
   * which is why nominating two people in the same breath quietly produced a
   * one-name list the first time round.
   */
  const wanted = m0.seats.filter(s => s.alive).slice(0, 2).map(s => s.userId);
  let put = 0;
  for (let i = 0; i < 30 && getMatch(match.id)!.phase === 'speech'; i++) {
    const live = getMatch(match.id)!;
    const speaker = live.speechOrder[live.speechIdx]!;
    const target = wanted.find(id => id !== speaker && !live.nominations.includes(id));
    if (put < 2 && target && nominate(match.id, speaker, target)) put += 1;
    nextSpeaker(match.id, 'v1_host');
  }

  const inVote = getMatch(match.id)!;
  assert.equal(inVote.phase, 'vote', 'the day ends in a vote when somebody is up');
  assert.equal(inVote.voteIdx, 0, 'starting with the first name on the list');
  assert.equal(inVote.nominations.length, 2);

  const first = inVote.nominations[0]!;
  const next = inVote.nominations[1]!;
  const voter = inVote.seats.find(s => s.alive && s.userId !== first && s.userId !== next)!;

  assert.equal(castVote(match.id, voter.userId, next), null, 'no voting ahead down the list');
  assert.ok(castVote(match.id, voter.userId, first), 'the candidate on the floor takes votes');
  assert.equal(castVote(match.id, voter.userId, first), null, 'a raised hand cannot be raised twice');

  const seen = getSafeState(getMatch(match.id)!, 'v1_host').seats.find(s => s.userId === voter.userId)!;
  assert.equal(seen.hasVoted, true, 'and everyone can see it — that is the information in the game');

  if (getMatch(match.id)!.phase === 'vote') {
    nextCandidate(match.id, 'v1_host');
    assert.equal(getMatch(match.id)!.voteIdx, 1, 'the next name comes up');
  }

  host.close();
});

test('silence all the way down the list is counted for the last candidate', async () => {
  const { getMatch, nominate, nextSpeaker, nextCandidate, joinMatchAsBot } =
    await import('./services/sxvaMafiaService.js');

  const host = await open('v2_host');
  const created = await send(host, 'xm:create', { nickname: 'Host', maxSeats: 10 });
  const match = (created as { data: any }).data;
  for (let i = 0; i < 6; i++) joinMatchAsBot(match.id, `bot_v2_${i}`, `ბოტი ${i}`);

  const m0 = await toSpeech(match.id, 'v2_host');
  assert.equal(m0.phase, 'speech');

  const speaker = m0.speechOrder[m0.speechIdx]!;
  const target = m0.seats.find(s => s.alive && s.userId !== speaker)!;
  nominate(match.id, speaker, target.userId);
  for (let i = 0; i < 30 && getMatch(match.id)!.phase === 'speech'; i++) nextSpeaker(match.id, 'v2_host');

  const inVote = getMatch(match.id)!;
  assert.equal(inVote.phase, 'vote');
  assert.equal(inVote.nominations.length, 1, 'one name on the list');
  assert.equal(Object.keys(inVote.votes).length, 0, 'and nobody has raised a hand');

  nextCandidate(match.id, 'v2_host');

  const after = getMatch(match.id)!;
  assert.notEqual(after.phase, 'vote', 'the vote closed');
  assert.equal(
    after.seats.find(s => s.userId === target.userId)!.alive, false,
    'abstaining your way out of every elimination is not an option',
  );

  host.close();
});

// ─── Closing the table ───────────────────────────────────────────────────────

test('the host can close the table, and everyone in it is told', async () => {
  const host = await open('dz_host');
  const created = await send(host, 'xm:create', { nickname: 'Host', maxSeats: 10 });
  const match = (created as { data: any }).data;

  const player = await open('dz_p1');
  await send(player, 'xm:join', { code: match.code, nickname: 'Player' });
  const seen = states(player);
  await settle();

  const res = await send(host, 'xm:dissolve', { matchId: match.id });
  assert.equal(res.ok, true, 'the event exists — it did not, which is why the button did nothing');
  await settle();

  const last = seen[seen.length - 1];
  assert.equal(last.dissolved, true, 'the player is told the table closed');
  assert.equal(last.phase, 'finished');

  host.close(); player.close();
});

test('only the host closes the table', async () => {
  const host = await open('dz2_host');
  const created = await send(host, 'xm:create', { nickname: 'Host', maxSeats: 10 });
  const match = (created as { data: any }).data;

  const player = await open('dz2_p1');
  await send(player, 'xm:join', { code: match.code, nickname: 'Player' });

  const res = await send(player, 'xm:dissolve', { matchId: match.id });
  assert.equal(res.ok, false, 'a seated player cannot close the room out from under everyone');
  assert.equal(getMatch(match.id)!.dissolved, false);

  host.close(); player.close();
});

test('a closed table leaves the public list', async () => {
  const host = await open('dz3_host');
  const created = await send(host, 'xm:create', { nickname: 'Host', maxSeats: 10 });
  const match = (created as { data: any }).data;

  const before = await send(host, 'xm:list', {});
  assert.ok((before as any).data.some((r: any) => r.id === match.id), 'it is listed while open');

  await send(host, 'xm:dissolve', { matchId: match.id });
  const after = await send(host, 'xm:list', {});
  assert.ok(!(after as any).data.some((r: any) => r.id === match.id), 'and gone once closed');

  host.close();
});

// ─── Visible to moderation ───────────────────────────────────────────────────

test('a hosted table is visible to the moderation panel', async () => {
  // It was not: the panel only ever asked classic mafia's room map, so a hosted
  // table with nine people in it counted as zero active rooms and could not be
  // closed.
  const host = await open('mod_host');
  const created = await send(host, 'xm:create', { nickname: 'Moderator', maxSeats: 10 });
  const match = (created as { data: any }).data;
  joinMatchAsBot(match.id, 'bot_mod_1', 'ბოტი ერთი');
  joinMatchAsBot(match.id, 'bot_mod_2', 'ბოტი ორი');

  const rooms = listMatchesForMod();
  const mine = rooms.find(r => r.id === match.id);
  assert.ok(mine, 'the table is in the moderation list');
  assert.equal(mine!.code, match.code);
  assert.equal(mine!.hostName, 'Moderator');
  assert.equal(mine!.playerCount, 2, 'the seats, not the host');
  assert.ok(isHostedMatch(match.id), 'and it is routable as a hosted table');

  // No roles, ever. A moderator watching a live game must not be able to read
  // who the mafia are.
  const leaked = JSON.stringify(mine);
  assert.ok(!leaked.includes('"role"'), 'no roles in the moderation view');
  assert.ok(!leaked.includes('"team"'), 'and no teams');

  host.close();
});

test('a closed table disappears from moderation too', async () => {
  const host = await open('mod2_host');
  const created = await send(host, 'xm:create', { nickname: 'Host', maxSeats: 10 });
  const match = (created as { data: any }).data;
  assert.ok(listMatchesForMod().some(r => r.id === match.id));

  await send(host, 'xm:dissolve', { matchId: match.id });
  assert.ok(!listMatchesForMod().some(r => r.id === match.id), 'a closed table is not an active room');

  host.close();
});
