/**
 * Going live, against a real PostgreSQL.
 *
 * The interesting behaviour here is all about a broadcast ending in a way
 * nobody pressed a button for: a host whose battery dies, a viewer whose train
 * goes into a tunnel, an end arriving twice from three different places at
 * once. A mock would let all of it pass.
 *
 *   LIVE_TEST_DATABASE_URL=postgres://postgres@localhost:5433/livetest \
 *     npx tsx --test src/live.db.test.ts
 */

import { test, before, after, beforeEach } from 'node:test';
import { strict as assert } from 'assert';
import { readFile } from 'fs/promises';

const url = process.env.LIVE_TEST_DATABASE_URL;
const skip = url ? false : 'set LIVE_TEST_DATABASE_URL to run the live tests';
if (url) process.env.DATABASE_URL = url;

type Live = typeof import('./services/liveService.js');
type Db = typeof import('./db.js');

let L: Live;
let db: Db;
let G: typeof import('./services/liveGifts.js');

const HOST = 'lv_host';
const V1 = 'lv_view1';
const V2 = 'lv_view2';

before(async () => {
  if (!url) return;
  db = await import('./db.js');
  await db.initializeDatabase();
  L = await import('./services/liveService.js');
  G = await import('./services/liveGifts.js');
});

after(async () => {
  if (!url) return;
  await clean();
  await db.sql.end({ timeout: 1 });
});

beforeEach(async () => {
  if (!url) return;
  await clean();
  for (const [id, name] of [[HOST, 'Host'], [V1, 'One'], [V2, 'Two']]) {
    await db.sql`
      INSERT INTO players (id, username, avatar, joined_at, last_seen_at)
      VALUES (${id}, ${name}, '🎩', ${Date.now()}, ${Date.now()})
    `;
  }
});

/*
 * `_` is a single-character wildcard in LIKE, so an unescaped 'lv_%' also
 * matches 'lve_host' — which is how this file's cleanup started deleting the
 * socket test's fixtures the first time the two ran in one process.
 */
async function clean(): Promise<void> {
  await db.sql`DELETE FROM live_viewers WHERE user_id LIKE 'lv\\_%' OR session_id IN (SELECT id FROM live_sessions WHERE host_id LIKE 'lv\\_%')`;
  await db.sql`DELETE FROM live_gifts WHERE host_id LIKE 'lv\\_%' OR sender_id LIKE 'lv\\_%'`;
  await db.sql`DELETE FROM coin_transactions WHERE player_id LIKE 'lv\\_%'`;
  await db.sql`DELETE FROM live_sessions WHERE host_id LIKE 'lv\\_%'`;
  await db.sql`DELETE FROM players WHERE id LIKE 'lv\\_%'`;
  // The viewer sets are module state; drop anybody these tests put in them.
  L?.forgetViewer(V1); L?.forgetViewer(V2); L?.forgetViewer(HOST);
}

// ── Starting ──────────────────────────────────────────────────────────────────

test('going live gives back a session and a room to broadcast in', { skip }, async () => {
  const s = await L.startLive(HOST, { title: 'ვთამაშობ მაფიას', visibility: 'public' });
  assert.equal(s.hostId, HOST);
  assert.equal(s.title, 'ვთამაშობ მაფიას');
  assert.equal(s.status, 'live');
  assert.equal(s.viewers, 0);
  // The room is derived from the id, never stored — one less thing to desync.
  assert.equal(s.room, L.roomFor(s.id));
  assert.equal(s.hostName, 'Host', 'the host is joined in, so a viewer knows whose stream this is');
});

test('starting a second broadcast replaces the first', { skip }, async () => {
  // The usual way to get here twice is an app that was killed and reopened.
  // "You are already live" when they can see they are not is the worse answer.
  const first = await L.startLive(HOST, { title: 'ერთი' });
  const second = await L.startLive(HOST, { title: 'ორი' });

  assert.notEqual(first.id, second.id);
  assert.equal((await L.getSession(first.id))!.status, 'ended');
  assert.equal((await L.myLive(HOST))!.id, second.id, 'exactly one live session per person');
});

test('a title is trimmed rather than refused', { skip }, async () => {
  const s = await L.startLive(HOST, { title: '  ' + 'ა'.repeat(400) + '  ' });
  assert.equal(s.title.length, 120);
  assert.ok(!s.title.startsWith(' '));
});

// ── Watching ──────────────────────────────────────────────────────────────────

test('viewers are counted while they are there', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  assert.equal((await L.joinLive(s.id, V1))!.viewers, 1);
  assert.equal((await L.joinLive(s.id, V2))!.viewers, 2);
  assert.equal(await L.leaveLive(s.id, V1), 1);
  assert.equal((await L.getSession(s.id))!.viewers, 1);
});

test('rejoining does not inflate the count or the total', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await L.joinLive(s.id, V1);
  await L.joinLive(s.id, V1);
  await L.joinLive(s.id, V1);
  assert.equal((await L.getSession(s.id))!.viewers, 1, 'one person is one viewer');

  await L.leaveLive(s.id, V1);
  await L.joinLive(s.id, V1);
  // Somebody whose train goes into a tunnel is not a second person.
  assert.equal((await L.getSession(s.id))!.totalViewers, 1);
});

test('peak is remembered after everyone has gone', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await L.joinLive(s.id, V1);
  await L.joinLive(s.id, V2);
  await L.leaveLive(s.id, V1);
  await L.leaveLive(s.id, V2);

  // It can only be observed while it is happening — no counter recovers it.
  const now = (await L.getSession(s.id))!;
  assert.equal(now.viewers, 0);
  assert.equal(now.peakViewers, 2);
});

test('closing the app drops you from whatever you were watching', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await L.joinLive(s.id, V1);
  await L.joinLive(s.id, V2);

  const touched = L.forgetViewer(V1);
  // The remaining count comes back with the id because the caller has to
  // broadcast it and has no other way to know. Announcing a flat zero here
  // emptied a roomful of thirty the moment one of them closed a tab.
  assert.deepEqual(touched, [{ sessionId: s.id, viewers: 1 }]);
  assert.equal((await L.getSession(s.id))!.viewers, 1, 'a count that only goes up is worse than none');
});

test('a heart comes back with the running total', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  assert.equal(await L.addHearts(s.id, 1), 1);
  assert.equal(await L.addHearts(s.id, 4), 5);
  // Nothing to add to, and nothing to report — an ended stream is not an error.
  await L.endLive(HOST);
  assert.equal(await L.addHearts(s.id, 1), 0);
});

test('who is in the room, with enough to draw them', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  assert.deepEqual(await L.viewersOf(s.id), [], 'nobody yet, and it says so');
  await L.joinLive(s.id, V1);
  await L.joinLive(s.id, V2);

  const list = await L.viewersOf(s.id);
  assert.deepEqual(list.map(v => v.userId).sort(), [V1, V2].sort());
  assert.equal(list.find(v => v.userId === V1)!.name, 'One');
  assert.equal(list.find(v => v.userId === V1)!.avatar, '🎩');

  await L.leaveLive(s.id, V1);
  assert.deepEqual((await L.viewersOf(s.id)).map(v => v.userId), [V2]);
});

test('an ended broadcast cannot be joined', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await L.endLive(HOST);
  assert.equal(await L.joinLive(s.id, V1), null);
});

// ── Ending ────────────────────────────────────────────────────────────────────

test('ending returns the summary the end screen shows', { skip }, async () => {
  const s = await L.startLive(HOST, { title: 'ეთერი' });
  await L.joinLive(s.id, V1);
  await L.joinLive(s.id, V2);
  await L.addHearts(s.id, 5);
  await L.addHearts(s.id, 3);

  const summary = (await L.endLive(HOST))!;
  assert.equal(summary.status, 'ended');
  assert.ok(summary.endedAt! >= summary.startedAt);
  assert.equal(summary.peakViewers, 2);
  assert.equal(summary.totalViewers, 2);
  assert.equal(summary.totalHearts, 8);
});

test('ending twice is not an error', { skip }, async () => {
  // "End" arrives from the button, from the socket closing and from the reaper,
  // and any two of them can race.
  await L.startLive(HOST, {});
  assert.ok(await L.endLive(HOST));
  assert.equal(await L.endLive(HOST), null, 'the second one has nothing to end, and says so quietly');
});

test('everyone still watching is marked as having left', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await L.joinLive(s.id, V1);
  await L.endLive(HOST);

  const rows = await db.sql`
    SELECT left_at FROM live_viewers WHERE session_id = ${s.id} AND user_id = ${V1}
  ` as any[];
  assert.ok(rows[0].left_at != null, 'or the watch time is open forever');
});

// ── The heartbeat ─────────────────────────────────────────────────────────────

test('a beat keeps a session alive, and says so', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  assert.equal(await L.beat(HOST), s.id);
  await L.endLive(HOST);
  // Null is the client's signal to stop showing a broadcast screen for a stream
  // that no longer exists.
  assert.equal(await L.beat(HOST), null);
});

test('a broadcast that stops beating is reaped', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  assert.equal(await L.reapStale(), 0, 'a fresh session is not stale');

  // A host whose battery died. Without the reaper their avatar wears a LIVE
  // ring until somebody files a bug, and tapping it opens an empty room.
  await db.sql`
    UPDATE live_sessions SET last_beat_at = ${Date.now() - L.BEAT_TIMEOUT_MS - 5_000} WHERE id = ${s.id}
  `;
  assert.equal(await L.reapStale(), 1);
  assert.equal((await L.getSession(s.id))!.status, 'ended');
  assert.equal(await L.myLive(HOST), null);
});

test('the timeout is comfortably longer than the beat', { skip }, async () => {
  // Three misses inside the window. One dropped packet must not end a stream.
  assert.ok(L.BEAT_TIMEOUT_MS >= L.BEAT_INTERVAL_MS * 2.5,
    `${L.BEAT_TIMEOUT_MS}ms timeout vs ${L.BEAT_INTERVAL_MS}ms beat`);
});

// ── Gifts, and the money behind them ─────────────────────────────────────────
/*
 * This is the only part of the live feature that moves real balances, so it is
 * the part that gets the arithmetic checked rather than the behaviour described.
 * Every test here asserts a number in `players.coins`.
 */

async function setCoins(id: string, n: number): Promise<void> {
  await db.sql`UPDATE players SET coins = ${n} WHERE id = ${id}`;
}
async function coins(id: string): Promise<number> {
  const [r] = await db.sql`SELECT coins FROM players WHERE id = ${id}` as any[];
  return Number(r?.coins ?? 0);
}

test('nothing in the catalog costs more than ten', { skip }, async () => {
  // The ceiling is a product decision, and a product decision that only lives
  // in somebody's memory is one price change away from being gone.
  for (const g of G.LIVE_GIFTS) {
    assert.ok(g.price >= 1 && g.price <= G.LIVE_GIFT_MAX_PRICE, `${g.id} costs ${g.price}`);
    assert.ok(Number.isInteger(g.price), `${g.id} costs a fraction of a coin`);
  }
  assert.equal(G.liveGift('white_rose')!.price, 1);
  assert.equal(G.liveGift('red_rose')!.price, 5);
  assert.equal(G.liveGift('no_such_gift'), null, 'and an unknown id is absent, not free');
});

test('the client and server catalogs agree', { skip }, async () => {
  /*
   * The client has its own copy to draw a grid with, and the server is the
   * authority — so a drift does not overcharge anybody, it just shows a price
   * that is not the price. That is still the app lying about money, and it is
   * the kind of thing that survives for months because nothing breaks.
   *
   * Parsed out of the file rather than imported: the client bundle is not
   * loadable from here, and the point is to check the file people edit.
   */
  const src = await readFile(new URL('../../client/src/components/live/liveGifts.ts', import.meta.url), 'utf8');
  const seen = new Map<string, number>();
  for (const m of src.matchAll(/\{\s*id:\s*'([a-z_]+)'[^}]*?price:\s*(\d+)/g)) {
    seen.set(m[1]!, Number(m[2]));
  }
  assert.equal(seen.size, G.LIVE_GIFTS.length, 'the two catalogs list the same number of gifts');
  for (const g of G.LIVE_GIFTS) {
    assert.equal(seen.get(g.id), g.price, `${g.id} costs ${g.price} on the server`);
  }
});

test('the sender pays the moment they tap', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await setCoins(V1, 20);

  const sent = await L.sendLiveGift(s.id, V1, 'red_rose');
  assert.equal(sent.coins, 5);
  assert.equal(sent.senderBalance, 15);
  // Not at the end of the stream: deferring the charge is how somebody sends
  // two hundred coins of gifts holding three.
  assert.equal(await coins(V1), 15);
});

test('the host is not paid until it ends', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await setCoins(HOST, 0);
  await setCoins(V1, 20);
  await L.sendLiveGift(s.id, V1, 'red_rose');

  assert.equal(await coins(HOST), 0, 'a balance that jitters mid-sentence is its own problem');
  assert.equal((await L.getSession(s.id))!.giftCoins, 5, 'the coins are on the session meanwhile');

  const summary = (await L.endLive(HOST))!;
  assert.equal(summary.giftCoins, 5);
  assert.equal(await coins(HOST), 5);
});

test('the price comes from the catalog, never from the caller', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await setCoins(V1, 100);
  // There is no argument to lie in — `sendLiveGift` takes an id. This is the
  // test that keeps it that way if somebody adds a convenient `price` param.
  const sent = await L.sendLiveGift(s.id, V1, 'crown');
  assert.equal(sent.coins, 10);
  assert.equal(await coins(V1), 90);
});

test('a gift nobody can afford is refused, and costs nothing', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await setCoins(V1, 3);

  await assert.rejects(() => L.sendLiveGift(s.id, V1, 'crown'), /ქოინები/);
  assert.equal(await coins(V1), 3, 'and the balance is untouched, not floored at zero');
  assert.equal((await L.getSession(s.id))!.giftCoins, 0);
  const rows = await db.sql`SELECT 1 FROM live_gifts WHERE session_id = ${s.id}` as any[];
  assert.equal(rows.length, 0, 'no ledger row for a gift that did not happen');
});

test('a gift with exactly enough goes through', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await setCoins(V1, 5);
  const sent = await L.sendLiveGift(s.id, V1, 'red_rose');
  assert.equal(sent.senderBalance, 0, 'off-by-one on the affordability check is a real bug');
});

test('you cannot gift your own broadcast', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await setCoins(HOST, 50);
  // It nets to zero coins, so it is not an exploit in the money. It is a free
  // way to sit at the top of your own gift list.
  await assert.rejects(() => L.sendLiveGift(s.id, HOST, 'crown'), /საკუთარ/);
  assert.equal(await coins(HOST), 50);
});

test('a gift to a stream that already ended is refused', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await L.endLive(HOST);
  await setCoins(V1, 50);
  await assert.rejects(() => L.sendLiveGift(s.id, V1, 'red_rose'), /დასრულებ/);
  assert.equal(await coins(V1), 50, 'a tap that lands after the end takes no money');
});

test('the host is paid once, however many ends arrive', { skip }, async () => {
  // "End" comes from the button, from the reaper and from starting a second
  // broadcast, and any two of them can race. Paying twice is the one bug in
  // this feature nobody would ever report.
  const s = await L.startLive(HOST, {});
  await setCoins(HOST, 0);
  await setCoins(V1, 50);
  await L.sendLiveGift(s.id, V1, 'crown');

  await L.endLive(HOST);
  assert.equal(await coins(HOST), 10);

  assert.equal(await L.payoutGifts(s.id), null, 'the second claim finds nothing to pay');
  await L.payoutGifts(s.id);
  assert.equal(await coins(HOST), 10);
});

test('two ends racing pay exactly once', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await setCoins(HOST, 0);
  await setCoins(V1, 50);
  await L.sendLiveGift(s.id, V1, 'crown');

  // The claim is a conditional UPDATE, not a read-then-write, precisely so this
  // is safe rather than usually safe.
  const [a, b] = await Promise.all([L.payoutGifts(s.id), L.payoutGifts(s.id)]);
  assert.equal([a, b].filter(Boolean).length, 1, 'exactly one of them paid');
  assert.equal(await coins(HOST), 10);
});

test('a host whose battery died is still paid', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await setCoins(HOST, 0);
  await setCoins(V1, 50);
  await L.sendLiveGift(s.id, V1, 'champagne');

  // The payout lives in `endSession` rather than in the button's handler for
  // exactly this: losing signal must not cost somebody the evening's earnings.
  await db.sql`
    UPDATE live_sessions SET last_beat_at = ${Date.now() - L.BEAT_TIMEOUT_MS - 5_000} WHERE id = ${s.id}
  `;
  assert.equal(await L.reapStale(), 1);
  assert.equal(await coins(HOST), 8);
});

test('starting a second broadcast pays out the first', { skip }, async () => {
  const first = await L.startLive(HOST, { title: 'ერთი' });
  await setCoins(HOST, 0);
  await setCoins(V1, 50);
  await L.sendLiveGift(first.id, V1, 'red_rose');

  await L.startLive(HOST, { title: 'ორი' });
  assert.equal(await coins(HOST), 5, 'an app that was killed and reopened is not a forfeit');
});

test('a broadcast with no gifts pays nothing and says so', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await setCoins(HOST, 7);
  await L.endLive(HOST);
  assert.equal(await coins(HOST), 7);
  assert.equal(await L.payoutGifts(s.id), null);
});

test('gifts add up across senders and kinds', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await setCoins(HOST, 0);
  await setCoins(V1, 100);
  await setCoins(V2, 100);

  await L.sendLiveGift(s.id, V1, 'white_rose');   // 1
  await L.sendLiveGift(s.id, V1, 'crown');        // 10
  await L.sendLiveGift(s.id, V2, 'red_rose');     // 5

  const now = (await L.getSession(s.id))!;
  assert.equal(now.giftCoins, 16);
  assert.equal(now.giftCount, 3, 'how many gifts is a different story from how many coins');

  await L.endLive(HOST);
  assert.equal(await coins(HOST), 16);
  assert.equal(await coins(V1), 89);
  assert.equal(await coins(V2), 95);
});

test('every coin a viewer spends is one the host receives', { skip }, async () => {
  // The invariant the whole feature rests on. If this drifts, coins are being
  // minted or burned somewhere and no screen would show it.
  const s = await L.startLive(HOST, {});
  await setCoins(HOST, 0);
  await setCoins(V1, 60);
  await setCoins(V2, 60);
  const before = (await coins(V1)) + (await coins(V2)) + (await coins(HOST));

  for (const g of ['white_rose', 'coffee', 'chocolate', 'red_rose']) await L.sendLiveGift(s.id, V1, g);
  for (const g of ['fire', 'champagne', 'diamond']) await L.sendLiveGift(s.id, V2, g);
  await L.endLive(HOST);

  const after = (await coins(V1)) + (await coins(V2)) + (await coins(HOST));
  assert.equal(after, before, 'no coins minted, none burned');
});

test('the gift ledger reconciles with the session total', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await setCoins(V1, 100);
  await L.sendLiveGift(s.id, V1, 'crown');
  await L.sendLiveGift(s.id, V1, 'white_rose');

  const [row] = await db.sql`
    SELECT SUM(coins)::int AS total, COUNT(*)::int AS n FROM live_gifts WHERE session_id = ${s.id}
  ` as any[];
  // A counter and a ledger that disagree mean neither can be trusted.
  assert.equal(Number(row.total), (await L.getSession(s.id))!.giftCoins);
  assert.equal(Number(row.n), (await L.getSession(s.id))!.giftCount);
});

test('who sent the most, by coins rather than by count', { skip }, async () => {
  const s = await L.startLive(HOST, {});
  await setCoins(V1, 100);
  await setCoins(V2, 100);

  // Four white roses is more taps than one crown, and less of a gesture.
  for (let i = 0; i < 4; i++) await L.sendLiveGift(s.id, V1, 'white_rose');
  await L.sendLiveGift(s.id, V2, 'crown');

  const top = await L.topGifters(s.id);
  assert.equal(top.length, 2);
  assert.equal(top[0]!.userId, V2);
  assert.equal(top[0]!.coins, 10);
  assert.equal(top[1]!.userId, V1);
  assert.equal(top[1]!.coins, 4);
  assert.equal(top[1]!.gifts, 4);
  assert.equal(top[0]!.name, 'Two', 'with a name to thank them by');
});

test('the gift list survives the broadcast ending', { skip }, async () => {
  // The summary shows it, and the summary is read after the end.
  const s = await L.startLive(HOST, {});
  await setCoins(V1, 100);
  await L.sendLiveGift(s.id, V1, 'diamond');
  await L.endLive(HOST);
  assert.equal((await L.topGifters(s.id))[0]!.coins, 10);
});

// ── The badge's question ──────────────────────────────────────────────────────

test('who is live, for a screenful of avatars at once', { skip }, async () => {
  const s = await L.startLive(HOST, { title: 'ვთამაშობ' });
  await L.joinLive(s.id, V1);

  const map = await L.liveMap([HOST, V1, V2, '', 'lv_nobody']);
  assert.equal(map[HOST]!.sessionId, s.id);
  assert.equal(map[HOST]!.title, 'ვთამაშობ');
  assert.equal(map[HOST]!.viewers, 1);
  assert.equal(map[V1], undefined, 'watching is not broadcasting');
  assert.equal(map[V2], undefined);
  assert.equal(map['lv_nobody'], undefined, 'and a stranger is absent, not false');
});

test('an ended broadcast leaves the badge map immediately', { skip }, async () => {
  await L.startLive(HOST, {});
  await L.endLive(HOST);
  assert.deepEqual(await L.liveMap([HOST]), {});
});

test('the list shows who is on air, newest first', { skip }, async () => {
  await L.startLive(V1, { title: 'პირველი' });
  await new Promise(r => setTimeout(r, 5));
  await L.startLive(V2, { title: 'მეორე' });

  const list = (await L.listLive()).filter(s => s.hostId.startsWith('lv_'));
  assert.equal(list.length, 2);
  assert.equal(list[0]!.hostId, V2, 'the one that just started is at the top');
});
