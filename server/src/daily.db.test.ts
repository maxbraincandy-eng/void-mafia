/**
 * The daily loop — quests and the daily coin reward — against a real database.
 *
 * Both are the reason to come back tomorrow, and both failed silently: the
 * "play 3 games" quest could never pass 1/3, and the daily reward paid twice
 * to two requests that arrived together.
 *
 *   DAILY_TEST_DATABASE_URL=postgres://postgres@localhost:5433/livetest \
 *     npx tsx --test src/daily.db.test.ts
 */

import { test, before, after, beforeEach } from 'node:test';
import { strict as assert } from 'assert';

const url = process.env.DAILY_TEST_DATABASE_URL;
const skip = url ? false : 'set DAILY_TEST_DATABASE_URL to run the daily-loop tests';
if (url) process.env.DATABASE_URL = url;

type Ch = typeof import('./services/challengeService.js');
type Coin = typeof import('./services/coinService.js');
type Db = typeof import('./db.js');

let C: Ch;
let K: Coin;
let db: Db;

const P = 'dly_player';

before(async () => {
  if (!url) return;
  db = await import('./db.js');
  await db.initializeDatabase();
  C = await import('./services/challengeService.js');
  K = await import('./services/coinService.js');
});

after(async () => {
  if (!url) return;
  await clean();
  await db.sql.end({ timeout: 1 });
});

beforeEach(async () => {
  if (!url) return;
  await clean();
  await db.sql`
    INSERT INTO players (id, username, avatar, joined_at, last_seen_at)
    VALUES (${P}, 'Daily', '🙂', ${Date.now()}, ${Date.now()})
  `;
});

async function clean(): Promise<void> {
  await db.sql`DELETE FROM daily_completions WHERE player_id LIKE 'dly\\_%'`;
  await db.sql`DELETE FROM daily_coin_claims WHERE player_id LIKE 'dly\\_%'`;
  await db.sql`DELETE FROM coin_transactions WHERE player_id LIKE 'dly\\_%'`;
  await db.sql`DELETE FROM players WHERE id LIKE 'dly\\_%'`;
}

const volume = async () => (await C.getDailyQuestsForPlayer(P)).find(q => q.id === 'play_3')!;
// A lost game on day 1: passes only the volume quest, never the win or survival one.
const loseEarly = () => C.checkAndAwardChallenges(P, false, 'citizen', 1, 'town');

// ── quests ──────────────────────────────────────────────────────────────────

test('"play 3 games" counts every game, not just the first', { skip }, async () => {
  await loseEarly();
  assert.equal((await volume()).progressCount, 1);
  await loseEarly();
  assert.equal((await volume()).progressCount, 2, 'the second game did not count');
  const third = await loseEarly();
  const q = await volume();
  assert.equal(q.progressCount, 3);
  assert.equal(q.completedToday, true, 'three games did not complete the quest');
  assert.equal(third.totalBonus, 100, 'the quest completed without paying its bonus');
});

test('the volume bonus is paid once, however many games follow', { skip }, async () => {
  let paid = 0;
  for (let i = 0; i < 6; i++) paid += (await loseEarly()).totalBonus;
  assert.equal(paid, 100, `the volume quest paid ${paid}`);
  assert.equal((await volume()).progressCount, 3, 'progress ran past the target');
});

test('a progress row from before the fix still counts', { skip }, async () => {
  // Production already holds un-suffixed `play_3` rows for today.
  await db.sql`
    INSERT INTO daily_completions (player_id, challenge_id, date_key, completed_at)
    VALUES (${P}, 'play_3', ${C.todayKey()}, ${Date.now()})
  `;
  assert.equal((await volume()).progressCount, 1);
  await loseEarly();
  await loseEarly();
  assert.equal((await volume()).completedToday, true);
});

test('a single-step quest pays once even if the result is processed twice', { skip }, async () => {
  const [a, b] = await Promise.all([
    C.checkAndAwardChallenges(P, false, 'citizen', 6, 'town'),
    C.checkAndAwardChallenges(P, false, 'citizen', 6, 'town'),
  ]);
  const survival = (r: { totalBonus: number }) => r.totalBonus >= 120 ? 1 : 0;
  assert.equal(survival(a) + survival(b), 1, 'the survival bonus was paid to both');
});

// ── daily coin reward ───────────────────────────────────────────────────────

test('the daily reward pays once to two requests that arrive together', { skip }, async () => {
  const results = await Promise.all(Array.from({ length: 5 }, () => K.claimDailyReward(P)));
  const paid = results.filter(r => !r.alreadyClaimed);
  assert.equal(paid.length, 1, `${paid.length} requests were paid`);
  const [{ coins }] = await db.sql`SELECT coins FROM players WHERE id = ${P}` as any[];
  assert.equal(Number(coins), paid[0]!.coins, 'the balance does not match one payment');
});

test('the claim records what was actually paid', { skip }, async () => {
  const r = await K.claimDailyReward(P);
  const [row] = await db.sql`SELECT coins_awarded FROM daily_coin_claims WHERE player_id = ${P}` as any[];
  assert.equal(Number(row.coins_awarded), r.coins);
  assert.equal((await K.claimDailyReward(P)).alreadyClaimed, true);
});

test('a failed payment does not spend the day', { skip }, async () => {
  // No players row: the payment itself throws, and the day must stay claimable.
  const ghost = 'dly_ghost';
  await assert.rejects(K.claimDailyReward(ghost));
  const rows = await db.sql`SELECT 1 FROM daily_coin_claims WHERE player_id = ${ghost}` as any[];
  assert.equal(rows.length, 0, 'a failed payment still used up the day');
});
