/**
 * Paying a finished game — XP, ledger, quest step — against a real database.
 *
 *   PROGRESS_TEST_DATABASE_URL=postgres://postgres@localhost:5433/livetest \
 *     npx tsx --test src/gameProgress.db.test.ts
 */

import { test, before, after, beforeEach } from 'node:test';
import { strict as assert } from 'assert';

const url = process.env.PROGRESS_TEST_DATABASE_URL;
const skip = url ? false : 'set PROGRESS_TEST_DATABASE_URL to run the game-progress tests';
if (url) process.env.DATABASE_URL = url;

type GP = typeof import('./services/gameProgressService.js');
type Ch = typeof import('./services/challengeService.js');
type Lg = typeof import('./services/legacyService.js');
type Db = typeof import('./db.js');

let G: GP;
let C: Ch;
let L: Lg;
let db: Db;

const P = 'gpt_player';
const Q = 'gpt_other';

before(async () => {
  if (!url) return;
  db = await import('./db.js');
  await db.initializeDatabase();
  G = await import('./services/gameProgressService.js');
  C = await import('./services/challengeService.js');
  L = await import('./services/legacyService.js');
});

after(async () => {
  if (!url) return;
  await clean();
  await db.sql.end({ timeout: 1 });
});

beforeEach(async () => {
  if (!url) return;
  await clean();
  for (const id of [P, Q]) {
    await db.sql`
      INSERT INTO players (id, username, avatar, joined_at, last_seen_at)
      VALUES (${id}, ${id}, '🙂', ${Date.now()}, ${Date.now()})
    `;
  }
});

async function clean(): Promise<void> {
  await db.sql`DELETE FROM daily_completions WHERE player_id LIKE 'gpt\\_%'`;
  await db.sql`DELETE FROM legacy_xp_grants WHERE user_id LIKE 'gpt\\_%'`;
  await db.sql`DELETE FROM legacy_xp_events WHERE user_id LIKE 'gpt\\_%'`;
  await db.sql`DELETE FROM players WHERE id LIKE 'gpt\\_%'`;
}

let n = 0;
const ev = (over: Partial<import('./services/gameProgressService.js').GameCompletion> = {}) => ({
  sessionId: `test:uno:m${++n}:0`, game: 'uno' as const, userId: P,
  outcome: 'played' as const, completedAt: Date.now(), ...over,
});

const xpOf = async (id: string) => Number((await db.sql`SELECT xp FROM players WHERE id = ${id}` as any[])[0].xp);
const ledger = (id: string) => db.sql`SELECT source, amount, reason FROM legacy_xp_events WHERE user_id = ${id} ORDER BY id` as any;
const volume = async (id: string) => (await C.getDailyQuestsForPlayer(id)).find(q => q.id === 'play_3')!;

test('a win pays 20 XP, writes the ledger and counts toward the quest', { skip }, async () => {
  const r = await G.recordCompletion(ev({ outcome: 'win' }));
  assert.deepEqual(r, { granted: true, xp: 20, questBonus: 0 });
  assert.equal(await xpOf(P), 20);
  assert.deepEqual((await ledger(P)).map((r: any) => [r.source, r.amount, r.reason]), [['uno', 20, 'win']]);
  assert.equal((await volume(P)).progressCount, 1);
});

test('a loss pays 5 XP', { skip }, async () => {
  assert.equal((await G.recordCompletion(ev())).xp, 5);
  assert.equal(await xpOf(P), 5);
});

test('the same completion twice pays once', { skip }, async () => {
  const e = ev({ outcome: 'win' });
  assert.equal((await G.recordCompletion(e)).granted, true);
  const again = await G.recordCompletion(e);
  assert.deepEqual(again, { granted: false, reason: 'duplicate', xp: 0, questBonus: 0 });
  assert.equal(await xpOf(P), 20, 'XP was paid twice');
  assert.equal((await ledger(P)).length, 1, 'the ledger has two rows');
  assert.equal((await volume(P)).progressCount, 1, 'the quest counted it twice');
});

test('five copies of one completion arriving together pay once', { skip }, async () => {
  const e = ev({ outcome: 'win' });
  const rs = await Promise.all(Array.from({ length: 5 }, () => G.recordCompletion(e)));
  assert.equal(rs.filter(r => r.granted).length, 1, `${rs.filter(r => r.granted).length} copies were paid`);
  assert.equal(await xpOf(P), 20);
  assert.equal((await volume(P)).progressCount, 1);
});

test('three different games finishing together all count, and the quest bonus is paid once', { skip }, async () => {
  const rs = await Promise.all([ev(), ev(), ev()].map(e => G.recordCompletion(e)));
  assert.ok(rs.every(r => r.granted), 'a legitimate game was refused');
  assert.equal(rs.filter(r => r.questBonus === 100).length, 1, 'the quest bonus was not paid exactly once');
  const q = await volume(P);
  assert.equal(q.progressCount, 3);
  assert.equal(q.completedToday, true);
  assert.equal(await xpOf(P), 3 * 5 + 100);
  const daily = (await ledger(P)).filter((r: any) => r.source === 'daily');
  assert.deepEqual(daily.map((r: any) => [r.amount, r.reason]), [[100, 'play_3']]);
});

test('a fourth game after the quest is done pays its XP and no second bonus', { skip }, async () => {
  for (let i = 0; i < 3; i++) await G.recordCompletion(ev());
  const fourth = await G.recordCompletion(ev());
  assert.deepEqual(fourth, { granted: true, xp: 5, questBonus: 0 });
  assert.equal((await volume(P)).progressCount, 3);
});

test('Mafia and the party games share one "play 3" and its bonus is paid once', { skip }, async () => {
  await G.recordCompletion(ev());
  await G.recordCompletion(ev());
  // The third game is Mafia, through its own unchanged path.
  const mafia = await C.checkAndAwardChallenges(P, false, 'citizen', 1, 'town');
  assert.equal(mafia.totalBonus, 100, 'the Mafia game did not complete the shared quest');
  const fourth = await G.recordCompletion(ev());
  assert.equal(fourth.questBonus, 0, 'the bonus was paid again');
});

test('the Mafia quests and their amounts are unchanged', { skip }, async () => {
  const qs = await C.getDailyQuestsForPlayer(P);
  assert.deepEqual(qs.map(q => [q.id, q.xpReward, q.targetCount]).slice(1), [['survive_5', 120, 1], ['play_3', 100, 3]]);
  // A party game never completes a Mafia-only quest.
  for (let i = 0; i < 3; i++) await G.recordCompletion(ev({ outcome: 'win' }));
  const after = await C.getDailyQuestsForPlayer(P);
  assert.equal(after[0]!.completedToday, false, 'a party-game win completed the Mafia win quest');
  assert.equal(after[1]!.completedToday, false, 'a party game completed the survival quest');
});

test('a guest earns nothing and leaves nothing behind', { skip }, async () => {
  const r = await G.recordCompletion(ev({ userId: 'gpt_guest_socket' }));
  assert.equal(r.reason, 'no_account');
  const grants = await db.sql`SELECT 1 FROM legacy_xp_grants WHERE user_id = 'gpt_guest_socket'` as any[];
  assert.equal(grants.length, 0, 'a guest completion burned a grant');
  const steps = await db.sql`SELECT 1 FROM daily_completions WHERE player_id = 'gpt_guest_socket'` as any[];
  assert.equal(steps.length, 0);
});

test('an invalid event is refused before anything is written', { skip }, async () => {
  for (const bad of [
    ev({ game: 'mafia' as any }), ev({ game: 'poker' as any }), ev({ outcome: 'lose' as any }),
    ev({ sessionId: '' }), ev({ userId: '' }),
  ]) {
    assert.equal((await G.recordCompletion(bad)).reason, 'invalid', JSON.stringify(bad));
  }
  assert.equal(await xpOf(P), 0);
});

test('two players in the same game are paid independently', { skip }, async () => {
  const sessionId = 'test:codenames:shared:0';
  const [a, b] = await Promise.all([
    G.recordCompletion(ev({ sessionId, game: 'codenames', userId: P, outcome: 'win' })),
    G.recordCompletion(ev({ sessionId, game: 'codenames', userId: Q })),
  ]);
  assert.equal(a.xp, 20);
  assert.equal(b.xp, 5);
});

test('awards landing together are all kept (addXP no longer loses one)', { skip }, async () => {
  await Promise.all(Array.from({ length: 10 }, (_, i) =>
    L.award({ userId: P, source: 'checkers', amount: 7, reason: `t${i}` })));
  assert.equal(await xpOf(P), 70, 'concurrent awards overwrote each other');
});

test('an existing award path and a completion landing together are both kept', { skip }, async () => {
  await Promise.all([
    L.award({ userId: P, source: 'checkers', amount: 20, reason: 'win' }),
    G.recordCompletion(ev({ outcome: 'win' })),
    L.award({ userId: P, source: 'ludo', amount: 8, reason: 'played' }),
  ]);
  assert.equal(await xpOf(P), 48);
});
