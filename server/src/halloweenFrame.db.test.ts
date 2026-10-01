/**
 * The Halloween frame: granted once, kept, and never in someone else's way.
 *
 *   HALLOWEEN_TEST_DATABASE_URL=postgres://postgres@localhost:5433/livetest \
 *     npx tsx --test src/halloweenFrame.db.test.ts
 */

import { test, before, after, beforeEach } from 'node:test';
import { strict as assert } from 'assert';

const url = process.env.HALLOWEEN_TEST_DATABASE_URL;
const skip = url ? false : 'set HALLOWEEN_TEST_DATABASE_URL to run the Halloween frame tests';
if (url) process.env.DATABASE_URL = url;

type Ps = typeof import('./services/playerService.js');
type Hw = typeof import('./services/halloween.js');
type Db = typeof import('./db.js');
let P: Ps; let H: Hw; let db: Db;
const ID = 'hwf_player';

before(async () => {
  if (!url) return;
  db = await import('./db.js');
  await db.initializeDatabase();
  P = await import('./services/playerService.js');
  H = await import('./services/halloween.js');
});
after(async () => { if (!url) return; await db.sql`DELETE FROM players WHERE id LIKE 'hwf\\_%'`; await db.sql.end({ timeout: 1 }); });
beforeEach(async () => {
  if (!url) return;
  await db.sql`DELETE FROM players WHERE id LIKE 'hwf\\_%'`;
  await db.sql`
    INSERT INTO players (id, username, avatar, joined_at, last_seen_at, cosmetics)
    VALUES (${ID}, 'Frame', '🎃', ${Date.now()}, ${Date.now()},
            ${JSON.stringify({ equippedFrame: 'frame_gold', unlockedItems: ['frame_bronze', 'frame_gold'] })})
  `;
});

test('the first finished game grants the frame, every later one does not', { skip }, async () => {
  assert.equal(await P.grantCosmeticItem(ID, H.HALLOWEEN_FRAME_ID), true);
  assert.equal(await P.grantCosmeticItem(ID, H.HALLOWEEN_FRAME_ID), false);
  const c = await P.getCosmetics(ID);
  assert.equal(c.unlockedItems.filter(i => i === H.HALLOWEEN_FRAME_ID).length, 1, 'granted twice');
});

test('granting it keeps what the player had, and does not swap their frame', { skip }, async () => {
  await P.grantCosmeticItem(ID, H.HALLOWEEN_FRAME_ID);
  const c = await P.getCosmetics(ID);
  assert.ok(c.unlockedItems.includes('frame_bronze') && c.unlockedItems.includes('frame_gold'));
  assert.equal(c.equippedFrame, 'frame_gold', 'the player\'s chosen frame was replaced');
});

test('once granted, it can be worn', { skip }, async () => {
  await P.grantCosmeticItem(ID, H.HALLOWEEN_FRAME_ID);
  const c = await P.equipCosmetic(ID, 'frame', H.HALLOWEEN_FRAME_ID);
  assert.equal(c.equippedFrame, H.HALLOWEEN_FRAME_ID);
});
