/**
 * Which finished games earn anything — the rules, without a database.
 *
 *   npx tsx --test src/services/gameProgress.test.ts
 */

import { test, beforeEach } from 'node:test';
import { strict as assert } from 'assert';

import { ADAPTERS, observe, __resetTracking, MIN_GAME_MS, type GameId } from './gameProgressService.js';
import { SOURCES } from './legacyService.js';
import {
  createMatch, joinMatch, startMatch, beginVoting, castVote, nextRound, rematch, leaveMatch,
  getMatch, __reset as resetWhoSaid,
} from './whoSaidService.js';

beforeEach(() => { __resetTracking(); });

const T0 = 1_000_000;
const LATER = T0 + MIN_GAME_MS + 1;

interface Fx { playing: any; finished: any; abandoned: any; winners: string[] }

const seat = (userId: string, extra: object = {}) => ({ userId, connected: true, ...extra });
const three = (extra: (u: string) => object = () => ({})) =>
  ['a', 'b', 'c'].map(u => seat(u, extra(u)));

/**
 * One natural finish and one abandoned finish per game, built from exactly the
 * fields that game's own service sets when it ends.
 */
const FIXTURES: Record<GameId, Fx> = {
  uno: {
    playing:   { id: 'm', status: 'active', players: three(), spectatorIds: ['sx'], winnerId: null },
    finished:  { id: 'm', status: 'finished', players: three(), spectatorIds: ['sx'], winnerId: 'a' },
    abandoned: { id: 'm', status: 'finished', players: three(), spectatorIds: [], winnerId: null },
    winners: ['a'],
  },
  alias: {
    playing:   { id: 'm', status: 'play', players: three(u => ({ team: u === 'a' ? 0 : 1 })), winner: null },
    finished:  { id: 'm', status: 'finished', players: three(u => ({ team: u === 'a' ? 0 : 1 })), winner: 1 },
    abandoned: { id: 'm', status: 'finished', players: three(u => ({ team: u === 'a' ? 0 : 1 })), winner: null },
    winners: ['b', 'c'],
  },
  blackout: {
    playing:   { id: 'm', status: 'play', players: three(u => ({ role: u === 'a' ? 'killer' : 'crew' })), winner: null },
    finished:  { id: 'm', status: 'finished', players: three(u => ({ role: u === 'a' ? 'killer' : 'crew' })), winner: 'killers' },
    abandoned: { id: 'm', status: 'finished', players: three(u => ({ role: u === 'a' ? 'killer' : 'crew' })), winner: null },
    winners: ['a'],
  },
  codenames: {
    playing:   { id: 'm', status: 'play', players: three(u => ({ team: u === 'c' ? 1 : 0 })), winner: null },
    finished:  { id: 'm', status: 'finished', players: three(u => ({ team: u === 'c' ? 1 : 0 })), winner: 0 },
    abandoned: { id: 'm', status: 'finished', players: three(u => ({ team: u === 'c' ? 1 : 0 })), winner: null },
    winners: ['a', 'b'],
  },
  draw: {
    playing:   { id: 'm', status: 'drawing', players: three(), round: 2, settings: { rounds: 3 }, winner: null },
    finished:  { id: 'm', status: 'finished', players: three(), round: 4, settings: { rounds: 3 }, winner: 'b' },
    // Left mid-game: finished, round never ran out.
    abandoned: { id: 'm', status: 'finished', players: three(), round: 2, settings: { rounds: 3 }, winner: null },
    winners: ['b'],
  },
  lies: {
    playing:   { id: 'm', status: 'writing', players: three(), winnerIds: [] },
    finished:  { id: 'm', status: 'finished', players: three(), winnerIds: ['c'] },
    abandoned: { id: 'm', status: 'finished', players: three(), winnerIds: [] },
    winners: ['c'],
  },
  spyfall: {
    playing:   { id: 'm', status: 'play', players: three(), winnerIds: [] },
    finished:  { id: 'm', status: 'finished', players: three(), winnerIds: ['a', 'b'] },
    abandoned: { id: 'm', status: 'finished', players: three(), winnerIds: [] },
    winners: ['a', 'b'],
  },
  whosaid: {
    playing:   { id: 'm', status: 'reading', round: 1, rounds: 3, players: three(u => ({ left: false, score: 0 })) },
    finished:  { id: 'm', status: 'finished', round: 3, rounds: 3, players: three(u => ({ left: false, score: u === 'b' ? 5 : 1 })) },
    abandoned: { id: 'm', status: 'finished', round: 1, rounds: 3, players: three(u => ({ left: false, score: 0 })) },
    winners: ['b'],
  },
};

const GAMES = Object.keys(ADAPTERS) as GameId[];

for (const g of GAMES) {
  const a = ADAPTERS[g] as any;
  const fx = FIXTURES[g];

  test(`${g}: a game played to the end credits every seated player, winners as wins`, () => {
    observe(a, fx.playing, T0);
    const ev = observe(a, fx.finished, LATER);
    assert.deepEqual(ev.map(e => e.userId).sort(), ['a', 'b', 'c'], 'wrong players credited');
    assert.deepEqual(ev.filter(e => e.outcome === 'win').map(e => e.userId).sort(), [...fx.winners].sort());
    assert.ok(ev.every(e => e.game === g));
    assert.equal(new Set(ev.map(e => e.sessionId)).size, 1, 'one game, one session id');
  });

  test(`${g}: a game that ended without being played out credits nobody`, () => {
    observe(a, fx.playing, T0);
    assert.deepEqual(observe(a, fx.abandoned, LATER), []);
  });

  test(`${g}: a game shorter than the minimum credits nobody`, () => {
    observe(a, fx.playing, T0);
    assert.deepEqual(observe(a, fx.finished, T0 + MIN_GAME_MS - 1), []);
  });

  test(`${g}: an ending it never saw start credits nobody`, () => {
    assert.deepEqual(observe(a, fx.finished, LATER), []);
  });

  test(`${g}: the same ending broadcast again is not a second game`, () => {
    observe(a, fx.playing, T0);
    assert.equal(observe(a, fx.finished, LATER).length, 3);
    assert.deepEqual(observe(a, fx.finished, LATER + 5), []);
    assert.deepEqual(observe(a, fx.finished, LATER + 500), []);
  });

  test(`${g}: a rematch at the same table is a new game with a new session`, () => {
    observe(a, fx.playing, T0);
    const first = observe(a, fx.finished, LATER);
    observe(a, fx.playing, LATER + 1);
    const second = observe(a, fx.finished, LATER + 1 + MIN_GAME_MS + 1);
    assert.equal(second.length, 3, 'the rematch was not credited');
    assert.notEqual(first[0]!.sessionId, second[0]!.sessionId, 'the rematch reused the first game\'s session');
  });

  test(`${g}: a player who is not connected at the end is not credited`, () => {
    const fin = structuredClone(fx.finished);
    fin.players[2].connected = false;
    observe(a, fx.playing, T0);
    assert.deepEqual(observe(a, fin, LATER).map(e => e.userId).sort(), ['a', 'b']);
  });

  test(`${g}: a table that ends with one player left credits nobody`, () => {
    const fin = structuredClone(fx.finished);
    fin.players[1].connected = false;
    fin.players[2].connected = false;
    observe(a, fx.playing, T0);
    assert.deepEqual(observe(a, fin, LATER), []);
  });

  test(`${g}: the XP ledger knows what to call it`, () => {
    assert.ok(SOURCES.some(s => s.id === g), `no SOURCES entry for ${g}`);
  });
}

test('uno: a spectator is never credited', () => {
  observe(ADAPTERS.uno as any, FIXTURES.uno.playing, T0);
  const ev = observe(ADAPTERS.uno as any, FIXTURES.uno.finished, LATER);
  assert.ok(!ev.some(e => e.userId === 'sx'));
});

test('whosaid: a player who pressed leave is not credited even if still connected', () => {
  const fin = structuredClone(FIXTURES.whosaid.finished);
  fin.players[0].left = true;
  observe(ADAPTERS.whosaid as any, FIXTURES.whosaid.playing, T0);
  assert.deepEqual(observe(ADAPTERS.whosaid as any, fin, LATER).map(e => e.userId).sort(), ['b', 'c']);
});

test('only the eight party games are covered — Mafia and the games that already pay are not', () => {
  assert.deepEqual([...GAMES].sort(),
    ['alias', 'blackout', 'codenames', 'draw', 'lies', 'spyfall', 'uno', 'whosaid']);
});

// ── Driven through the real service, not a fixture ──────────────────────────

test('whosaid, real service: all rounds played → credited; the rematch → credited again', () => {
  resetWhoSaid();
  const m0 = createMatch('p0', 's0', 'P0', { maxPlayers: 8, rounds: 1 } as any);
  joinMatch(m0.id, 'p1', 's1', 'P1');
  joinMatch(m0.id, 'p2', 's2', 'P2');
  const a = ADAPTERS.whosaid;
  let t = T0;
  const see = () => observe(a, getMatch(m0.id)!, t);

  // Every round to the end; whatever the service's minimum round count is.
  const playRound = () => {
    let ev: ReturnType<typeof see> = [];
    for (let i = 0; i < 30 && getMatch(m0.id)!.status !== 'finished'; i++) {
      beginVoting(m0.id, null); see();
      const m = getMatch(m0.id)!;
      for (const p of m.players) if (p.userId !== m.readerId) castVote(m0.id, p.userId, m.readerId!);
      see();
      t += MIN_GAME_MS + 1;
      nextRound(m0.id, 'p0');
      ev = ev.concat(see());
    }
    return ev;
  };

  see();
  startMatch(m0.id, 'p0'); see();
  const first = playRound();
  assert.equal(getMatch(m0.id)!.status, 'finished', 'the real game did not finish');
  assert.equal(first.length, 3, 'a finished one-round game was not credited');

  rematch(m0.id, 'p0'); see();
  startMatch(m0.id, 'p0'); see();
  const second = playRound();
  assert.equal(second.length, 3, 'the rematch was not credited');
  assert.notEqual(first[0]!.sessionId, second[0]!.sessionId);
});

test('whosaid, real service: everybody leaving mid-game credits nobody', () => {
  resetWhoSaid();
  const m0 = createMatch('q0', 't0', 'Q0', { maxPlayers: 8, rounds: 3 } as any);
  joinMatch(m0.id, 'q1', 't1', 'Q1');
  joinMatch(m0.id, 'q2', 't2', 'Q2');
  const a = ADAPTERS.whosaid;
  observe(a, getMatch(m0.id)!, T0);
  startMatch(m0.id, 'q0');
  observe(a, getMatch(m0.id)!, T0);
  for (const u of ['q0', 'q1', 'q2']) leaveMatch(m0.id, u);
  const m = getMatch(m0.id);
  if (m) assert.deepEqual(observe(a, m, LATER), []);
});
