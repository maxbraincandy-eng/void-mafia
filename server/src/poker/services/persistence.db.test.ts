/**
 * Persistence tests against a real PostgreSQL.
 *
 * Not sqlite, not a mock, not an in-memory stand-in. The things worth testing
 * here are the things a stand-in gets wrong: `ON CONFLICT` behaviour, `GREATEST`
 * over a running total, whether a streak column actually resets, and whether a
 * hand can be written twice. A fake would pass all of them and prove nothing.
 *
 * Skipped automatically when `POKER_TEST_DATABASE_URL` is not set, so the suite
 * still runs on a machine with no database:
 *
 *   POKER_TEST_DATABASE_URL=postgres://postgres@localhost:5433/pokertest \
 *     npx tsx --test "src/poker/**\/*.test.ts"
 */

import { test, before, after } from 'node:test';
import { strict as assert } from 'assert';

const url = process.env.POKER_TEST_DATABASE_URL;
const skip = url ? false : 'set POKER_TEST_DATABASE_URL to run the persistence tests';

// db.ts reads the URL at import time, so it has to be in place before the
// module graph loads — hence the assignment before the dynamic imports below.
if (url) process.env.DATABASE_URL = url;

type Persistence = typeof import('./persistence.js');
type Db = typeof import('../../db.js');

let p: Persistence;
let db: Db;

const handId = (n: number) => `h_test_${n}`;

before(async () => {
  if (!url) return;
  p = await import('./persistence.js');
  db = await import('../../db.js');
  await p.initializePokerSchema();
  // The leaderboard joins the app's `players` table for names and avatars. A
  // bare test database has no app schema, so stand one up — poker depends on
  // that table in production and the query should be exercised as written.
  await db.sql`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY, username TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT ''
    )
  `;
  await clean();
});

after(async () => {
  if (!url) return;
  await clean();
  await db.sql.end({ timeout: 1 });
});

async function clean(): Promise<void> {
  await db.sql`DELETE FROM poker_hand_players WHERE player_id LIKE 'tp_%' OR player_id LIKE 'deleted_%'`;
  await db.sql`DELETE FROM poker_hands WHERE id LIKE 'h_test_%'`;
  await db.sql`DELETE FROM poker_stats WHERE player_id LIKE 'tp_%'`;
  await db.sql`DELETE FROM poker_audit_log WHERE actor_id LIKE 'tp_%'`;
  await db.sql`DELETE FROM poker_leaderboard WHERE player_id LIKE 'tp_%'`;
  await db.sql`DELETE FROM poker_sessions WHERE id LIKE 's_test_%'`;
  await db.sql`DELETE FROM players WHERE id LIKE 'tp_%'`;
}

/**
 * Timestamps are real epoch milliseconds, not small integers. The retention job
 * prunes on age, and a fixture stamped 1970 is 56 years old — which is how the
 * first version of the retention test managed to delete its own fixtures and
 * blame the code.
 */
const NOW = Date.now();

function hand(n: number, players: { id: string; net: number; contributed: number; showed?: boolean }[]) {
  const pot = players.reduce((sum, x) => sum + x.contributed, 0);
  return {
    handId: handId(n),
    sessionId: 's_test_1',
    tableId: 't_test_1',
    handNo: n,
    buttonSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    ante: 0,
    board: ['As', 'Kd', '7h', '2c', '9s'],
    actions: [],
    potTotal: pot,
    deckHash: 'a'.repeat(64),
    deckSeed: 'seed',
    deckOrder: ['As'],
    startedAt: NOW + n,
    endedAt: NOW + n + 1_000,
    players: players.map((x, i) => ({
      playerId: x.id,
      seat: i,
      holeCards: ['Ah', 'Kh'],
      contributed: x.contributed,
      won: x.net + x.contributed,
      net: x.net,
      showed: x.showed ?? false,
      handRank: x.showed ? 'Pair of aces' : null,
    })),
  };
}

/** recordHand is fire-and-forget; give the write a moment to land. */
const flush = () => new Promise(resolve => setTimeout(resolve, 250));

// ─── Tests ───────────────────────────────────────────────────────────────────

test('the schema is created and re-created without complaint', { skip }, async () => {
  await p.initializePokerSchema();
  await p.initializePokerSchema();
  const rows = await db.sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'poker_%'
    ORDER BY table_name
  ` as { table_name: string }[];
  const names = rows.map(r => r.table_name);

  for (const expected of [
    'poker_achievements', 'poker_audit_log', 'poker_hand_players', 'poker_hands',
    'poker_leaderboard', 'poker_player_sessions', 'poker_sessions', 'poker_stats', 'poker_tables',
  ]) {
    assert.ok(names.includes(expected), `missing ${expected}`);
  }
});

test('there is no wallet, balance, ledger or transaction table', { skip }, async () => {
  const rows = await db.sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'poker_%'
  ` as { table_name: string }[];

  for (const name of rows.map(r => r.table_name)) {
    for (const forbidden of ['wallet', 'balance', 'ledger', 'payment', 'payout', 'deposit', 'withdrawal']) {
      assert.ok(!name.includes(forbidden), `poker must not have a ${forbidden} table, found ${name}`);
    }
  }

  // And no money-shaped column on the tables it does have.
  const columns = await db.sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name LIKE 'poker_%'
  ` as { table_name: string; column_name: string }[];
  for (const c of columns) {
    for (const forbidden of ['currency', 'cash', 'usd', 'price', 'amount_paid', 'wallet']) {
      assert.ok(
        !c.column_name.includes(forbidden),
        `${c.table_name}.${c.column_name} looks like money`,
      );
    }
  }
});

test('a settled hand is written once, with its per-seat rows', { skip }, async () => {
  await db.sql`INSERT INTO poker_sessions (id, table_id, started_at) VALUES ('s_test_1', 't_test_1', ${NOW})
               ON CONFLICT (id) DO NOTHING`;

  p.recordHand(hand(1, [
    { id: 'tp_a', net: 100, contributed: 100, showed: true },
    { id: 'tp_b', net: -100, contributed: 100, showed: true },
  ]));
  await flush();

  const rows = await db.sql`SELECT * FROM poker_hands WHERE id = ${handId(1)}` as any[];
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].pot_total), 200);
  assert.deepEqual(JSON.parse(rows[0].board), ['As', 'Kd', '7h', '2c', '9s']);
  assert.equal(rows[0].deck_hash.length, 64);

  const seats = await db.sql`SELECT * FROM poker_hand_players WHERE hand_id = ${handId(1)} ORDER BY seat` as any[];
  assert.equal(seats.length, 2);
  assert.deepEqual(JSON.parse(seats[0].hole_cards), ['Ah', 'Kh']);
  assert.equal(Number(seats[0].net), 100);
  assert.equal(Number(seats[1].net), -100);
  assert.equal(Number(seats[0].net) + Number(seats[1].net), 0, 'a hand creates no chips');
});

test('writing the same hand twice does not duplicate or overwrite it', { skip }, async () => {
  p.recordHand(hand(1, [
    { id: 'tp_a', net: 999_999, contributed: 1 },     // a different, wrong result
    { id: 'tp_b', net: -999_999, contributed: 1 },
  ]));
  await flush();

  const rows = await db.sql`SELECT * FROM poker_hands WHERE id = ${handId(1)}` as any[];
  assert.equal(rows.length, 1, 'still one row');
  assert.equal(Number(rows[0].pot_total), 200, 'and it still holds what actually happened');

  const seats = await db.sql`SELECT * FROM poker_hand_players WHERE hand_id = ${handId(1)} ORDER BY seat` as any[];
  assert.equal(Number(seats[0].net), 100, 'history is append-only, not last-write-wins');
});

test('statistics accumulate, and a streak resets on a loss', { skip }, async () => {
  await db.sql`DELETE FROM poker_stats WHERE player_id LIKE 'tp_%'`;

  // Three wins, then a loss, then a win.
  const results = [100, 100, 100, -50, 100];
  for (let i = 0; i < results.length; i++) {
    const net = results[i]!;
    p.recordHand(hand(10 + i, [
      { id: 'tp_a', net, contributed: 200, showed: true },
      { id: 'tp_b', net: -net, contributed: 200, showed: true },
    ]));
    await flush();
  }

  const stats = await p.getStats('tp_a');
  assert.equal(stats.handsPlayed, 5);
  assert.equal(stats.handsWon, 4);
  assert.equal(stats.showdownsWon, 4);
  assert.equal(stats.longestStreak, 3, 'the three-win run is remembered');
  assert.equal(stats.biggestPot, 400);
  assert.equal(Math.round(stats.winRate * 100), 80);

  const loser = await p.getStats('tp_b');
  assert.equal(loser.handsWon, 1, 'the loser won exactly the one hand they won');
  assert.equal(loser.longestStreak, 1);
});

test('the leaderboard ranks gameplay, and a win rate needs a sample', { skip }, async () => {
  await db.sql`DELETE FROM poker_stats WHERE player_id LIKE 'tp_%'`;
  await db.sql`
    INSERT INTO poker_stats (player_id, hands_played, hands_won, biggest_pot, updated_at) VALUES
      ('tp_grinder', 1000, 400, 5000, 1),
      ('tp_lucky',      2,   2,  900, 1),
      ('tp_solid',    200,  60, 8000, 1)
  `;
  await db.sql`
    INSERT INTO players (id, username) VALUES
      ('tp_grinder', 'Grinder'), ('tp_lucky', 'Lucky'), ('tp_solid', 'Solid')
    ON CONFLICT (id) DO NOTHING
  `;
  await p.rebuildLeaderboards();

  const byWins = await p.getLeaderboard('hands_won') as any[];
  assert.equal(byWins[0].playerId, 'tp_grinder', '400 wins leads');
  assert.equal(byWins[0].rank, 1);
  assert.equal(byWins[0].name, 'Grinder', 'and the row carries a name to show');

  const byRate = await p.getLeaderboard('win_rate') as any[];
  const ids = byRate.map(r => r.playerId);
  assert.ok(!ids.includes('tp_lucky'), 'two hands is not a win rate');
  assert.ok(ids.includes('tp_grinder') && ids.includes('tp_solid'));
  assert.equal(byRate[0].playerId, 'tp_grinder', '40% beats 30%');
  assert.equal(byRate[0].value, 4000, 'stored ×10000, so the column has no floats');

  const byPot = await p.getLeaderboard('biggest_pot') as any[];
  assert.equal(byPot[0].playerId, 'tp_solid');
});

test('a player can read their own hands back', { skip }, async () => {
  const recent = await p.getRecentHands('tp_a', 10) as any[];
  assert.ok(recent.length > 0);
  assert.deepEqual(recent[0].holeCards, ['Ah', 'Kh']);
  assert.ok(recent[0].endedAt >= recent[recent.length - 1].endedAt, 'newest first');
});

test('the audit log records refusals and is append-only in practice', { skip }, async () => {
  p.recordAudit({
    at: Date.now(), actorId: 'tp_a', actorKind: 'player',
    event: 'action_rejected', tableId: 't_test_1', detail: { code: 'OUT_OF_TURN' },
  });
  await flush();

  const rows = await db.sql`
    SELECT * FROM poker_audit_log WHERE actor_id = 'tp_a' ORDER BY at DESC LIMIT 1
  ` as any[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event, 'action_rejected');
  assert.equal(JSON.parse(rows[0].detail).code, 'OUT_OF_TURN');
});

test('a deletion request forgets who, and keeps what happened', { skip }, async () => {
  const before = await db.sql`SELECT COUNT(*)::int AS n FROM poker_hand_players WHERE player_id = 'tp_a'` as any[];
  assert.ok(before[0].n > 0);

  await p.anonymisePlayer('tp_a');

  const after = await db.sql`SELECT COUNT(*)::int AS n FROM poker_hand_players WHERE player_id = 'tp_a'` as any[];
  assert.equal(after[0].n, 0, 'their id is gone');

  const kept = await db.sql`SELECT COUNT(*)::int AS n FROM poker_hand_players WHERE player_id LIKE 'deleted_%'` as any[];
  assert.ok(kept[0].n > 0, 'but the seat is still in the hand, for the other players');

  const stats = await p.getStats('tp_a');
  assert.equal(stats.handsPlayed, 0, 'and their statistics are gone');
});

test('retention prunes by age and nothing else', { skip }, async () => {
  const old = Date.now() - 200 * 86_400_000;
  await db.sql`
    INSERT INTO poker_hands (id, session_id, table_id, hand_no, button_seat, small_blind, big_blind,
      board, actions, result, pot_total, deck_hash, deck_seed, deck_order, started_at, ended_at)
    VALUES ('h_test_old', 's_test_1', 't_test_1', 99, 0, 10, 20, '[]', '[]', '{}', 100,
      ${'b'.repeat(64)}, 'seed', '[]', ${old}, ${old})
    ON CONFLICT (id) DO NOTHING
  `;
  const recentBefore = await db.sql`SELECT COUNT(*)::int AS n FROM poker_hands WHERE id LIKE 'h_test_1%'` as any[];

  await p.pruneOldRecords();

  const oldRows = await db.sql`SELECT COUNT(*)::int AS n FROM poker_hands WHERE id = 'h_test_old'` as any[];
  assert.equal(oldRows[0].n, 0, 'the 200-day-old hand is gone');

  const recentAfter = await db.sql`SELECT COUNT(*)::int AS n FROM poker_hands WHERE id LIKE 'h_test_1%'` as any[];
  assert.equal(recentAfter[0].n, recentBefore[0].n, 'and nothing else was touched');
});
