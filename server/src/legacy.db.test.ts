/**
 * The Legacy progression engine, against a real PostgreSQL.
 *
 * Not a mock. Everything worth checking here is something a stand-in gets
 * wrong: whether `ON CONFLICT DO NOTHING … RETURNING` actually suppresses a
 * duplicate grant, whether a GROUP BY rollup agrees with the running total on
 * `players.xp`, and whether a level lands on the real threshold table rather
 * than on a formula somebody assumed.
 *
 * Skipped when no database is configured, so the suite still runs without one:
 *
 *   LEGACY_TEST_DATABASE_URL=postgres://postgres@localhost:5433/legacytest \
 *     npx tsx --test src/legacy.db.test.ts
 */

import { test, before, after, beforeEach } from 'node:test';
import { strict as assert } from 'assert';

const url = process.env.LEGACY_TEST_DATABASE_URL;
const skip = url ? false : 'set LEGACY_TEST_DATABASE_URL to run the legacy tests';

// db.ts reads the URL at import time, so it must be in place before the module
// graph loads — hence the assignment above the dynamic imports below.
if (url) process.env.DATABASE_URL = url;

type Legacy = typeof import('./services/legacyService.js');
type Player = typeof import('./services/playerService.js');
type Db = typeof import('./db.js');

let L: Legacy;
let P: Player;
let db: Db;

const U = 'lg_test_user';

before(async () => {
  if (!url) return;
  db = await import('./db.js');
  await db.initializeDatabase();
  L = await import('./services/legacyService.js');
  P = await import('./services/playerService.js');
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
    INSERT INTO players (id, username, avatar, joined_at, last_seen_at, xp, level)
    VALUES (${U}, 'Tester', '🕵', ${Date.now()}, ${Date.now()}, 0, 1)
  `;
});

async function clean(): Promise<void> {
  await db.sql`DELETE FROM legacy_xp_events WHERE user_id LIKE 'lg_test_%'`;
  await db.sql`DELETE FROM legacy_xp_grants WHERE user_id LIKE 'lg_test_%'`;
  await db.sql`DELETE FROM game_players WHERE player_id LIKE 'lg_test_%'`;
  await db.sql`DELETE FROM players WHERE id LIKE 'lg_test_%'`;
}

const xpOf = async (): Promise<number> => {
  const [r] = await db.sql`SELECT xp FROM players WHERE id = ${U}` as any[];
  return Number(r?.xp ?? -1);
};

// ── Earning ───────────────────────────────────────────────────────────────────

test('XP lands on the account and the ledger says where it came from', { skip }, async () => {
  await L.award({ userId: U, source: 'mafia', amount: 40, reason: 'game' });
  await L.award({ userId: U, source: 'ludo', amount: 25, reason: 'win' });
  await L.award({ userId: U, source: 'ludo', amount: 8, reason: 'played' });

  assert.equal(await xpOf(), 73, 'one pool, as it always was');

  const c = (await L.getCharacter(U))!;
  assert.equal(c.totalXP, 73);
  const bySource = Object.fromEntries(c.perSource.map(s => [s.source, s.xp]));
  // This breakdown is the whole point: before the ledger, 73 was all anybody
  // could know.
  assert.deepEqual(bySource, { mafia: 40, ludo: 33 });
  assert.equal(c.perSource.find(s => s.source === 'ludo')!.events, 2);
  assert.equal(c.perSource[0]!.source, 'mafia', 'ordered by XP, biggest first');
});

test('the rollup always agrees with the account total', { skip }, async () => {
  for (const [source, amount] of [['mafia', 30], ['checkers', 20], ['joker', 5], ['predict', 12], ['mafia', 30]] as const) {
    await L.award({ userId: U, source, amount });
  }
  const c = (await L.getCharacter(U))!;
  const summed = c.perSource.reduce((n, s) => n + s.xp, 0);
  // A counter and a ledger drift apart eventually; this is the assertion that
  // says they have not, and the reason the breakdown is a GROUP BY rather than
  // a column kept alongside.
  assert.equal(summed, c.totalXP);
  assert.equal(summed, await xpOf());
});

test('a ref makes an award happen at most once, ever', { skip }, async () => {
  const ev = { userId: U, source: 'backfill', amount: 500, ref: 'game_abc' } as const;
  const first = await L.award(ev);
  const second = await L.award(ev);
  const third = await L.award({ ...ev, amount: 999 });

  assert.equal(first.awarded, true);
  assert.equal(second.awarded, false, 'the backfill is safe to re-run');
  assert.equal(third.awarded, false, 'and a different amount does not sneak past');
  assert.equal(await xpOf(), 500);

  const rows = await db.sql`SELECT COUNT(*)::int AS n FROM legacy_xp_events WHERE user_id = ${U}` as any[];
  assert.equal(Number(rows[0].n), 1, 'one grant, one ledger row');
});

test('the same ref under a different source is a different grant', { skip }, async () => {
  await L.award({ userId: U, source: 'mafia', amount: 10, ref: 'g1' });
  await L.award({ userId: U, source: 'ludo', amount: 10, ref: 'g1' });
  assert.equal(await xpOf(), 20, 'the key is (user, source, ref) — game ids are not global');
});

test('nonsense is refused without touching anything', { skip }, async () => {
  for (const bad of [
    { userId: '', source: 'mafia', amount: 10 },
    { userId: U, source: '', amount: 10 },
    { userId: U, source: 'mafia', amount: 0 },
    { userId: U, source: 'mafia', amount: NaN },
  ]) {
    assert.equal((await L.award(bad as any)).awarded, false, JSON.stringify(bad));
  }
  assert.equal(await xpOf(), 0);
});

test('a bad award never throws into the game that called it', { skip }, async () => {
  // Every existing call site wrote `.catch(() => {})` by hand. XP is a reward,
  // and a reward that can fail a game's end-of-hand cleanup is the worse bug —
  // so not throwing is the contract, not a habit at each call site.
  const res = await L.award({ userId: 'lg_test_ghost_no_such_player', source: 'mafia', amount: 10 });
  assert.equal(res.awarded, false);

  // And nothing was written for a player who is not there. The first cut of
  // this reported success and left a ledger row behind, which would have made
  // the breakdown disagree with `players.xp` — the one invariant the whole
  // design rests on.
  const rows = await db.sql`
    SELECT COUNT(*)::int AS n FROM legacy_xp_events WHERE user_id = 'lg_test_ghost_no_such_player'
  ` as any[];
  assert.equal(Number(rows[0].n), 0);
});

test('a ref is not burned by an award that could not happen', { skip }, async () => {
  // Claiming the grant before checking the player would spend the ref on
  // nothing, and the retry that should have worked would be refused.
  await L.award({ userId: 'lg_test_ghost_no_such_player', source: 'backfill', amount: 50, ref: 'g9' });
  await db.sql`
    INSERT INTO players (id, username, avatar, joined_at, last_seen_at, xp, level)
    VALUES ('lg_test_ghost_no_such_player', 'Late', '🎩', ${Date.now()}, ${Date.now()}, 0, 1)
  `;
  const retry = await L.award({ userId: 'lg_test_ghost_no_such_player', source: 'backfill', amount: 50, ref: 'g9' });
  assert.equal(retry.awarded, true, 'the grant was still available');
  assert.equal(retry.newXP, 50);
});

// ── Levelling ─────────────────────────────────────────────────────────────────

test('levels come off the real threshold table, not a formula', { skip }, async () => {
  // Levels 1–10 were deliberately preserved from an older curve so that nobody's
  // level moved; a service that recomputed them from n^1.5 would silently
  // demote every existing player.
  assert.equal(L.levelProgress(0).level, 1);
  assert.equal(L.levelProgress(99).level, 1);
  assert.equal(L.levelProgress(100).level, 2, 'threshold[1] is 100');
  assert.equal(L.levelProgress(5400).level, 10);

  const p = L.levelProgress(150);
  assert.equal(p.level, 2);
  assert.equal(p.xpIntoLevel, 50, '150 is 50 past the level-2 floor of 100');
  assert.equal(p.xpForLevel, 150, 'and level 2 spans 100→250');
  assert.equal(p.xpToNextLevel, 100);
  assert.equal(p.atMaxLevel, false);
});

test('the top of the curve does not divide by zero or promise a next level', { skip }, async () => {
  const top = L.levelProgress(P.LEVEL_THRESHOLDS[P.MAX_LEVEL - 1]! + 10_000);
  assert.equal(top.level, P.MAX_LEVEL);
  assert.equal(top.atMaxLevel, true);
  assert.equal(top.xpToNextLevel, 0, 'not a negative number, and not NaN');
  assert.ok(top.xpForLevel >= 1, 'the bar divides by this');
});

test('crossing a threshold is reported once, to whoever caused it', { skip }, async () => {
  const under = await L.award({ userId: U, source: 'mafia', amount: 99 });
  assert.equal(under.leveledUp, false);
  assert.equal(under.newLevel, 1);

  const over = await L.award({ userId: U, source: 'ludo', amount: 1 });
  assert.equal(over.leveledUp, true, 'and ludo is what paid for it');
  assert.equal(over.newLevel, 2);

  const after = await L.award({ userId: U, source: 'ludo', amount: 1 });
  assert.equal(after.leveledUp, false, 'the same level is not announced twice');
});

test('an unlock fires no matter which game paid for the level', { skip }, async () => {
  // The spec asks for this explicitly, and it was already true — `addXP` has
  // always run the cosmetic check itself. The test is here so it stays true.
  await L.award({ userId: U, source: 'ludo', amount: 100 });
  const cos = await P.getCosmetics(U);
  assert.ok(cos.unlockedItems.length > 0, 'level 2 unlocks exist and ludo XP got them');
});

// ── Auras ─────────────────────────────────────────────────────────────────────

test('aura tiers are a staircase, and below the first one there is none', { skip }, async () => {
  assert.equal(L.auraFor(1), null);
  assert.equal(L.auraFor(9), null);
  assert.equal(L.auraFor(10), 'bronze');
  assert.equal(L.auraFor(24), 'bronze', 'a tier holds until the next one is reached');
  assert.equal(L.auraFor(25), 'silver');
  assert.equal(L.auraFor(50), 'gold');
  assert.equal(L.auraFor(75), 'legendary');
  assert.equal(L.auraFor(100), 'legendary');
});

// ── Reputation ────────────────────────────────────────────────────────────────

async function playedMafia(role: string, played: number, won: number, survived = 0): Promise<void> {
  for (let i = 0; i < played; i++) {
    await db.sql`
      INSERT INTO game_players (game_id, player_id, role, team, survived, won)
      VALUES (${`lg_g_${role}_${i}`}, ${U}, ${role}, 'town', ${i < survived ? 1 : 0}, ${i < won ? 1 : 0})
      ON CONFLICT DO NOTHING
    `;
  }
}

test('a reputation tag needs a habit, not a lucky night', { skip }, async () => {
  await playedMafia('sheriff', 4, 4);
  assert.deepEqual(await L.reputationTags(U), [], 'four games is a run of luck');

  await playedMafia('sheriff', 6, 5);
  const tags = await L.reputationTags(U);
  assert.ok(tags.some(t => t.key === 'trusted_detective'), 'six with a real win rate is a habit');
  assert.match(tags.find(t => t.key === 'trusted_detective')!.detail, /შერიფად/, 'and it says why, in Georgian');
});

test('a losing record earns nothing', { skip }, async () => {
  await playedMafia('don', 10, 3);
  assert.deepEqual(await L.reputationTags(U), [], 'ten games at 30% is not "silver tongue"');
});

test('tags are derived on read, so they can be lost again', { skip }, async () => {
  await playedMafia('sheriff', 6, 5);
  assert.equal((await L.reputationTags(U)).length, 1);

  // A long cold streak. A stored tag would still be sitting on the profile.
  await playedMafia('sheriff', 30, 5);
  assert.deepEqual(await L.reputationTags(U), [], 'history kept happening, and the tag went with it');
});

// ── Reading ───────────────────────────────────────────────────────────────────

test('a character with no history is still a character', { skip }, async () => {
  const c = (await L.getCharacter(U))!;
  assert.equal(c.level, 1);
  assert.equal(c.totalXP, 0);
  assert.deepEqual(c.perSource, []);
  assert.deepEqual(c.reputationTags, []);
  assert.equal(c.avatarConfig.aura, null, 'no aura at level 1 — it has to be earned');
  assert.equal(c.avatarConfig.baseEmoji, '🕵');
});

test('a player who does not exist is null, not an empty character', { skip }, async () => {
  assert.equal(await L.getCharacter('lg_test_nobody'), null);
});

test('an unknown source still renders rather than breaking the profile', { skip }, async () => {
  await L.award({ userId: U, source: 'some_future_game', amount: 10 });
  const c = (await L.getCharacter(U))!;
  const row = c.perSource.find(s => s.source === 'some_future_game')!;
  assert.equal(row.label, 'some_future_game', 'falls back to the id');
  assert.equal(row.xp, 10);
});

test('the leaderboard ranks by the one total and names the biggest source', { skip }, async () => {
  await db.sql`
    INSERT INTO players (id, username, avatar, joined_at, last_seen_at, xp, level)
    VALUES ('lg_test_b', 'Second', '🎩', ${Date.now()}, ${Date.now()}, 0, 1)
  `;
  await L.award({ userId: U, source: 'mafia', amount: 300 });
  await L.award({ userId: U, source: 'ludo', amount: 10 });
  await L.award({ userId: 'lg_test_b', source: 'checkers', amount: 900 });

  const board = await L.legacyLeaderboard(10);
  const mine = board.findIndex(r => r.userId === U);
  const other = board.findIndex(r => r.userId === 'lg_test_b');
  assert.ok(other >= 0 && mine > other, '900 outranks 310');
  assert.equal(board[mine]!.topSource, 'mafia', 'the biggest source, not the latest');
});

test('badges for a screenful of names come back in one query', { skip }, async () => {
  await L.award({ userId: U, source: 'mafia', amount: 6000 });
  const badges = await L.legacyBadges([U, 'lg_test_nobody', '']);
  assert.equal(badges[U]!.level, 10);
  assert.equal(badges[U]!.aura, 'bronze');
  assert.equal(badges['lg_test_nobody'], undefined, 'a missing player is absent, not a level 1 lie');
});
