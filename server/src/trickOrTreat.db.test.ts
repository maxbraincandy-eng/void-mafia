/**
 * ტკბილეული თუ ხრიკი — walks, the daily allowance and the board, against a
 * real database.
 *
 *   TOT_TEST_DATABASE_URL=postgres://postgres@localhost:5433/livetest \
 *     npx tsx --test src/trickOrTreat.db.test.ts
 */

import { test, before, after, beforeEach } from 'node:test';
import { strict as assert } from 'assert';

const url = process.env.TOT_TEST_DATABASE_URL;
const skip = url ? false : 'set TOT_TEST_DATABASE_URL to run the trick-or-treat tests';
if (url) process.env.DATABASE_URL = url;

type S = typeof import('./services/trickOrTreatService.js');
type R = typeof import('./services/trickOrTreatRules.js');
type Db = typeof import('./db.js');

let S: S;
let R: R;
let db: Db;

const A = 'tott_alice';
const B = 'tott_bob';
/** Noon in Tbilisi on a day in October 2026: inside the season. */
const OCT = (d: number, h = 12) => Date.UTC(2026, 9, d, h - 4);

before(async () => {
  if (!url) return;
  db = await import('./db.js');
  await db.initializeDatabase();
  S = await import('./services/trickOrTreatService.js');
  R = await import('./services/trickOrTreatRules.js');
});

after(async () => {
  if (!url) return;
  await clean();
  await db.sql.end({ timeout: 1 });
});

beforeEach(async () => {
  if (!url) return;
  await clean();
  for (const [id, name] of [[A, 'Alice'], [B, 'Bob']]) {
    await db.sql`
      INSERT INTO players (id, username, avatar, joined_at, last_seen_at)
      VALUES (${id}, ${name}, '🎃', ${Date.now()}, ${Date.now()})
    `;
  }
});

async function clean(): Promise<void> {
  await db.sql`DELETE FROM tot_runs WHERE user_id LIKE 'tott\\_%'`;
  await db.sql`DELETE FROM tot_spend WHERE user_id LIKE 'tott\\_%'`;
  await db.sql`DELETE FROM tot_prizes WHERE user_id LIKE 'tott\\_%'`;
  await db.sql`DELETE FROM coin_transactions WHERE player_id LIKE 'tott\\_%'`.catch(() => {});
  await db.sql`DELETE FROM players WHERE id LIKE 'tott\\_%'`;
}

/** Door rolls that are never a ghost: candy every time. */
const safe = () => 0.99;
/** A ghost every time. */
const doom = () => 0;

test('a walk: knock, collect, go home, and it counts toward the season', { skip }, async () => {
  const t = OCT(10);
  await S.startWalk(A, t);
  for (let i = 0; i < 3; i++) await S.knockDoor(A, t, () => 0.5);   // 0.5: not a ghost, candy
  const st = await S.getState(A, t);
  assert.equal(st.walk?.doors.length, 3);
  const bag = st.walk!.bag;
  assert.ok(bag > 0);
  assert.equal(await S.walkHome(A, t), bag);
  const after = await S.getState(A, t);
  assert.equal(after.walk, null);
  assert.equal(after.last?.banked, bag);
  assert.equal(after.total, bag);
  assert.equal(after.runsLeft, R.RUNS_PER_DAY - 1);
});

test('a ghost takes the bag and the walk banks nothing', { skip }, async () => {
  const t = OCT(10);
  await S.startWalk(A, t);
  await S.knockDoor(A, t, () => 0.5);
  await S.knockDoor(A, t, doom);
  const st = await S.getState(A, t);
  assert.equal(st.walk, null);
  assert.equal(st.last?.status, 'scared');
  assert.equal(st.total, 0);
  await assert.rejects(S.walkHome(A, t), 'went home from a walk a ghost had ended');
});

test('five walks a day, and the sixth is refused until Tbilisi midnight', { skip }, async () => {
  const t = OCT(12);
  for (let i = 0; i < R.RUNS_PER_DAY; i++) { await S.startWalk(A, t); await S.walkHome(A, t); }
  await assert.rejects(S.startWalk(A, t), /ხვალ/);
  assert.equal((await S.getState(A, t)).runsLeft, 0);
  // Five minutes after Tbilisi midnight the street is open again.
  const tomorrow = Date.UTC(2026, 9, 12, 20, 5);
  assert.equal((await S.getState(A, tomorrow)).runsLeft, R.RUNS_PER_DAY);
  await S.startWalk(A, tomorrow);
});

test('one walk at a time', { skip }, async () => {
  const t = OCT(13);
  await S.startWalk(A, t);
  await assert.rejects(S.startWalk(A, t), /დაასრულე/);
});

test('two starts at the last allowance at once: one walk, not two', { skip }, async () => {
  const t = OCT(14);
  for (let i = 0; i < R.RUNS_PER_DAY - 1; i++) { await S.startWalk(A, t); await S.walkHome(A, t); }
  const rs = await Promise.allSettled([S.startWalk(A, t), S.startWalk(A, t), S.startWalk(A, t)]);
  assert.equal(rs.filter(r => r.status === 'fulfilled').length, 1);
  const [{ n }] = await db.sql`SELECT COUNT(*) AS n FROM tot_runs WHERE user_id = ${A}` as any[];
  assert.equal(Number(n), R.RUNS_PER_DAY, 'the daily limit was crossed by starting together');
});

test('a double tap on "home" banks the bag once', { skip }, async () => {
  const t = OCT(15);
  await S.startWalk(A, t);
  await S.knockDoor(A, t, () => 0.5);
  const rs = await Promise.allSettled([S.walkHome(A, t), S.walkHome(A, t), S.walkHome(A, t)]);
  assert.equal(rs.filter(r => r.status === 'fulfilled').length, 1);
  const st = await S.getState(A, t);
  assert.equal(st.total, st.last!.banked, 'the bag was banked more than once');
});

test('knocks sent together each open exactly one door', { skip }, async () => {
  const t = OCT(16);
  await S.startWalk(A, t);
  await Promise.all(Array.from({ length: 4 }, () => S.knockDoor(A, t, safe)));
  const st = await S.getState(A, t);
  assert.equal(st.walk?.doors.length, 4, 'concurrent knocks lost or duplicated a door');
});

test('a walk survives a reload exactly, lantern and all', { skip }, async () => {
  const t = OCT(17);
  await S.startWalk(A, t);
  // A lantern: not a ghost, then 0.9 → lantern, then the peek roll.
  const rolls = [0.99, 0.9, 0.5, 0.5];
  let i = 0;
  await S.knockDoor(A, t, () => rolls[Math.min(i++, rolls.length - 1)]!);
  const st = await S.getState(A, t);
  assert.equal(st.walk?.doors[0]!.kind, 'lantern');
  assert.ok(st.walk?.peek, 'the lantern\'s view of the next door was not kept');
  // The screen's odds follow what the lantern showed, not the general chance.
  assert.ok(st.nextGhost === 0 || st.nextGhost === 1);
  const shown = st.walk!.peek!;
  const opened = await S.knockDoor(A, t, doom);    // the rng would say ghost; the lantern said otherwise
  assert.equal(opened.kind, shown.kind, 'the next door was not the one the lantern showed');
});

test('outside the season the street is closed', { skip }, async () => {
  await assert.rejects(S.startWalk(A, Date.UTC(2026, 11, 1, 10)), /ოქტომბერს/);
  assert.equal((await S.getState(A, Date.UTC(2026, 11, 1, 10))).season.active, false);
});

test('the board sums the season, best first, and knows where I am', { skip }, async () => {
  const t = OCT(20);
  const walk = async (who: string, knocks: number) => {
    await S.startWalk(who, t);
    for (let i = 0; i < knocks; i++) await S.knockDoor(who, t, () => 0.5);
    await S.walkHome(who, t);
  };
  await walk(A, 2);
  await walk(B, 6);
  await walk(B, 1);
  const { top, me } = await S.getBoard(A, t);
  // Relative, not absolute: other players may share the season in this database.
  const rowA = top.find(r => r.userId === A)!;
  const rowB = top.find(r => r.userId === B)!;
  assert.ok(rowB.rank < rowA.rank, 'more candy did not rank higher');
  assert.equal(rowB.total, (await S.getState(B, t)).total);
  assert.equal(me?.rank, rowA.rank);
  assert.equal(me?.username, 'Alice');
});

test('a guest plays but is not on the board', { skip }, async () => {
  const t = OCT(21);
  const guest = 'tott_guest_socket_id';
  await S.startWalk(guest, t);
  await S.knockDoor(guest, t, () => 0.5);
  await S.walkHome(guest, t);
  assert.ok((await S.getState(guest, t)).total > 0);
  const { top } = await S.getBoard(null, t);
  assert.ok(!top.some(r => r.userId === guest), 'a guest socket id made the board');
});

// ── The shop ──────────────────────────────────────────────────────────────

/** Candy banked straight into the season, as if from walks already done. */
async function bank(who: string, candy: number, season = 2026, dateKey = '2026-10-01'): Promise<void> {
  await db.sql`
    INSERT INTO tot_runs (id, user_id, season, date_key, state, status, banked, started_at, finished_at)
    VALUES (${'tott_' + Math.random().toString(36).slice(2)}, ${who}, ${season}, ${dateKey}, '{}', 'home', ${candy}, 1, 1)
  `;
}

test('gear costs candy, is on the walk, and spending leaves the season score alone', { skip }, async () => {
  const t = OCT(22);
  await bank(A, 50);
  await S.startWalk(A, t, ['amulet', 'sweet']);
  const st = await S.getState(A, t);
  assert.equal(st.candy, 50 - 15 - 20);
  assert.equal(st.total, 50, 'spending lowered the season score');
  assert.equal(st.walk?.amulet, true);
  assert.equal(st.walk?.sweet, true);
  const door = await S.knockDoor(A, t, () => 0.5);
  assert.equal(door.kind, 'candy');
  assert.ok(door.amount >= 2, 'the sweet bag did not add one');
});

test('gear the wallet cannot pay for starts nothing and takes nothing', { skip }, async () => {
  const t = OCT(22);
  await bank(A, 12);
  await assert.rejects(S.startWalk(A, t, ['amulet']), /არ გყოფნის/);
  const st = await S.getState(A, t);
  assert.equal(st.walk, null);
  assert.equal(st.candy, 12);
  await assert.rejects(S.startWalk(A, t, ['nonsense']), /არ არსებობს/);
});

test('extra walks: two a day, each one more walk', { skip }, async () => {
  const t = OCT(23);
  await bank(A, 100);
  for (let i = 0; i < R.RUNS_PER_DAY; i++) { await S.startWalk(A, t); await S.walkHome(A, t); }
  await assert.rejects(S.startWalk(A, t), /ხვალ/);
  await S.buyExtraWalk(A, t);
  let st = await S.getState(A, t);
  assert.equal(st.runsLeft, 1);
  assert.equal(st.candy, 100 - R.EXTRA_WALK_PRICE);
  await S.startWalk(A, t); await S.walkHome(A, t);
  await S.buyExtraWalk(A, t);
  await assert.rejects(S.buyExtraWalk(A, t), /აღარ/);
  st = await S.getState(A, t);
  assert.equal(st.runsLeft, 1);
  assert.equal(st.extraWalksToday, 2);
});

test('exchange: tens only, 100 coins a day, paid into the coin balance', { skip }, async () => {
  const t = OCT(24);
  await bank(A, 300);
  const C = await import('./services/coinService.js');
  const before = await C.getCoins(A);
  await assert.rejects(S.exchangeCandy(A, 15, t), /ჯერადად/);
  assert.equal(await S.exchangeCandy(A, 60, t), 60);
  await assert.rejects(S.exchangeCandy(A, 50, t), /კიდევ 40/);
  assert.equal(await S.exchangeCandy(A, 40, t), 40);
  assert.equal(await C.getCoins(A), before + 100);
  const st = await S.getState(A, t);
  assert.equal(st.candy, 200);
  assert.equal(st.coinsExchangedToday, 100);
  // A new day, a new hundred.
  assert.equal(await S.exchangeCandy(A, 10, OCT(25)), 10);
});

test('exchanges sent together never cross the wallet or the daily cap', { skip }, async () => {
  const t = OCT(26);
  await bank(A, 30);
  const rs = await Promise.allSettled(Array.from({ length: 5 }, () => S.exchangeCandy(A, 10, t)));
  assert.equal(rs.filter(r => r.status === 'fulfilled').length, 3);
  assert.equal((await S.getState(A, t)).candy, 0);
});

test('a guest cannot exchange or buy — there is nowhere to keep it', { skip }, async () => {
  const t = OCT(26);
  const guest = 'tott_guest_x';
  await bank(guest, 500);
  await assert.rejects(S.exchangeCandy(guest, 10, t), /ანგარიში/);
  await assert.rejects(S.buyCosmetic(guest, 'title_candy_king', t), /ანგარიში/);
  assert.equal((await S.getState(guest, t)).candy, 500);
});

test('a cosmetic is bought once and lands on the profile', { skip }, async () => {
  const t = OCT(27);
  await bank(A, 400);
  await S.buyCosmetic(A, 'title_candy_king', t);
  const P = await import('./services/playerService.js');
  assert.ok((await P.getCosmetics(A)).unlockedItems.includes('title_candy_king'));
  await assert.rejects(S.buyCosmetic(A, 'title_candy_king', t), /შენია/);
  const st = await S.getState(A, t);
  assert.equal(st.candy, 400 - R.COSMETICS.title_candy_king.price);
  assert.deepEqual(st.owned, ['title_candy_king']);
  await assert.rejects(S.buyCosmetic(A, 'frame_gold', t), /არ არის/);
});

test('season prizes: nothing before the close, the top three once after', { skip }, async () => {
  // A season of its own, so nobody else in this database is on its board.
  const year = 2031;
  const ids = ['tott_p1', 'tott_p2', 'tott_p3', 'tott_p4'];
  for (const [i, id] of ids.entries()) {
    await db.sql`
      INSERT INTO players (id, username, avatar, joined_at, last_seen_at)
      VALUES (${id}, ${'P' + i}, '🎃', ${Date.now()}, ${Date.now()})
    `;
    await bank(id, 400 - i * 100, year);
  }
  assert.deepEqual(await S.awardSeasonPrizes(year, Date.UTC(year, 9, 31, 12)), []);
  const after = Date.UTC(year, 10, 5, 12);
  const paid = await S.awardSeasonPrizes(year, after);
  assert.deepEqual(paid.map(p => p.userId), ['tott_p1', 'tott_p2', 'tott_p3']);
  assert.deepEqual(await S.awardSeasonPrizes(year, after), [], 'prizes were paid twice');
  const C = await import('./services/coinService.js');
  const P = await import('./services/playerService.js');
  assert.equal(await C.getCoins('tott_p4'), 0);
  assert.ok((await P.getCosmetics('tott_p1')).unlockedItems.includes('frame_jack_o_lantern'));
  assert.ok((await P.getCosmetics('tott_p3')).unlockedItems.includes('title_halloween_champion_2026'));
  assert.ok(await C.getCoins('tott_p1') >= 500);
});
