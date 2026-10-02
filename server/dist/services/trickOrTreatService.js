/**
 * ტკბილეული თუ ხრიკი — walks, the day's allowance, and the season board.
 *
 * ONE PLAYER, ONE THING AT A TIME
 * ───────────────────────────────
 * Every action takes a transaction-scoped advisory lock on the player. A
 * double tap on "knock" is two requests that would otherwise both read the
 * same walk and both write a door; a double tap on "home" would bank the bag
 * twice; two "start"s at the daily limit would both see four walks used.
 * Under the lock they simply take turns, and the second sees what the first
 * did.
 *
 * The walk is stored whole, as JSON, after every door — so a reconnect or a
 * restart in the middle of a street picks up exactly where it was.
 */
import { randomUUID } from 'crypto';
import { sql } from '../db.js';
import { RUNS_PER_DAY, ghostChance, knock, goHome, newWalk, isSeason, seasonOf, tbilisiDate, nextMidnight, GEAR, EXTRA_WALKS_PER_DAY, EXTRA_WALK_PRICE, EXCHANGE_STEP, EXCHANGE_COINS_PER_DAY, coinsFor, COSMETICS, SEASON_PRIZES, } from './trickOrTreatRules.js';
import { grantCoins } from './coinService.js';
import { grantCosmeticItem, getCosmetics } from './playerService.js';
class TotError extends Error {
}
export { TotError };
const lock = (tx, userId) => tx `SELECT pg_advisory_xact_lock(hashtext(${'tot:' + userId}))`;
async function activeRow(tx, userId) {
    const [r] = await tx `
    SELECT id, state FROM tot_runs WHERE user_id = ${userId} AND status = 'walking'
    ORDER BY started_at DESC LIMIT 1
  `;
    return r ? { id: r.id, walk: JSON.parse(r.state) } : null;
}
/** The wallet: candy banked this season, less candy spent. Read under the player's lock. */
async function walletOf(q, userId, year) {
    const [r] = await q `
    SELECT (SELECT COALESCE(SUM(banked), 0) FROM tot_runs  WHERE user_id = ${userId} AND season = ${year})
         - (SELECT COALESCE(SUM(candy), 0)  FROM tot_spend WHERE user_id = ${userId} AND season = ${year}) AS candy
  `;
    return Number(r?.candy ?? 0);
}
async function spentToday(q, userId, today) {
    const [r] = await q `
    SELECT COUNT(*) FILTER (WHERE kind = 'walk') AS walks,
           COALESCE(SUM(coins) FILTER (WHERE kind = 'exchange'), 0) AS coins
      FROM tot_spend WHERE user_id = ${userId} AND date_key = ${today}
  `;
    return { walks: Number(r?.walks ?? 0), coins: Number(r?.coins ?? 0) };
}
async function spend(tx, userId, now, kind, item, candy, coins = 0) {
    const id = randomUUID();
    await tx `
    INSERT INTO tot_spend (id, user_id, season, date_key, kind, item, candy, coins, created_at)
    VALUES (${id}, ${userId}, ${seasonOf(now)}, ${tbilisiDate(now).key}, ${kind}, ${item}, ${candy}, ${coins}, ${now})
  `;
    return id;
}
async function hasAccount(q, userId) {
    const [r] = await q `SELECT 1 FROM players WHERE id = ${userId}`;
    return !!r;
}
async function save(tx, id, walk, now) {
    const done = walk.status !== 'walking';
    await tx `
    UPDATE tot_runs
       SET state = ${JSON.stringify(walk)}, status = ${walk.status}, banked = ${walk.banked},
           finished_at = ${done ? now : null}
     WHERE id = ${id}
  `;
}
export async function getState(userId, now = Date.now()) {
    const year = seasonOf(now);
    const today = tbilisiDate(now).key;
    const [[counts], active, [last]] = await Promise.all([
        sql `
      SELECT COUNT(*) FILTER (WHERE date_key = ${today}) AS today,
             COALESCE(SUM(banked), 0) AS total, COALESCE(MAX(banked), 0) AS best,
             COUNT(*) FILTER (WHERE status <> 'walking') AS walks
        FROM tot_runs WHERE user_id = ${userId} AND season = ${year}
    `,
        sql `SELECT state FROM tot_runs WHERE user_id = ${userId} AND status = 'walking' ORDER BY started_at DESC LIMIT 1`,
        sql `
      SELECT state FROM tot_runs
       WHERE user_id = ${userId} AND date_key = ${today} AND status <> 'walking'
       ORDER BY finished_at DESC LIMIT 1
    `,
    ]);
    const walk = active[0] ? JSON.parse(active[0].state) : null;
    const [candy, today2, cosmetics] = await Promise.all([
        walletOf(sql, userId, year),
        spentToday(sql, userId, today),
        getCosmetics(userId).catch(() => null),
    ]);
    const owned = Object.keys(COSMETICS).filter(id => cosmetics?.unlockedItems.includes(id));
    const allowance = RUNS_PER_DAY + today2.walks;
    return {
        season: { active: isSeason(now), year },
        runsPerDay: allowance,
        runsLeft: Math.max(0, allowance - Number(counts?.today ?? 0)),
        resetAt: nextMidnight(now),
        walk,
        nextGhost: walk ? (walk.peek ? (walk.peek.kind === 'ghost' ? 1 : 0) : ghostChance(walk.doors.length + 1)) : null,
        last: last ? JSON.parse(last.state) : null,
        total: Number(counts?.total ?? 0),
        best: Number(counts?.best ?? 0),
        walks: Number(counts?.walks ?? 0),
        candy,
        extraWalksToday: today2.walks,
        coinsExchangedToday: today2.coins,
        owned,
        shop: {
            gear: GEAR,
            extraWalk: { price: EXTRA_WALK_PRICE, perDay: EXTRA_WALKS_PER_DAY },
            exchange: { step: EXCHANGE_STEP, coinsPerDay: EXCHANGE_COINS_PER_DAY },
            cosmetics: COSMETICS,
            prizes: SEASON_PRIZES,
        },
    };
}
/**
 * Start a walk, optionally with gear bought from the wallet.
 * Refused outside the season, at the day's allowance, mid-walk, or short of candy.
 */
export async function startWalk(userId, now = Date.now(), gear = [], rng = Math.random) {
    if (!isSeason(now))
        throw new TotError('ჰელოუინი ახლა არ არის — შემდეგ ოქტომბერს!');
    const picked = [...new Set(gear)];
    if (picked.some(g => !(g in GEAR)))
        throw new TotError('ასეთი აღჭურვილობა არ არსებობს.');
    const cost = picked.reduce((sum, g) => sum + GEAR[g].price, 0);
    await sql.begin(async (tx) => {
        await lock(tx, userId);
        if (await activeRow(tx, userId))
            throw new TotError('ჯერ ეს გასეირნება დაასრულე.');
        const today = tbilisiDate(now).key;
        const [{ n }] = await tx `SELECT COUNT(*) AS n FROM tot_runs WHERE user_id = ${userId} AND date_key = ${today}`;
        const { walks: extra } = await spentToday(tx, userId, today);
        if (Number(n) >= RUNS_PER_DAY + extra)
            throw new TotError('დღეისთვის ქუჩა დაიკეტა — ხვალ ისევ!');
        if (cost > 0) {
            if (await walletOf(tx, userId, seasonOf(now)) < cost)
                throw new TotError('კანფეტი არ გყოფნის.');
            for (const g of picked)
                await spend(tx, userId, now, 'gear', g, GEAR[g].price);
        }
        await tx `
      INSERT INTO tot_runs (id, user_id, season, date_key, state, status, banked, started_at)
      VALUES (${randomUUID()}, ${userId}, ${seasonOf(now)}, ${today}, ${JSON.stringify(newWalk(picked, rng))}, 'walking', 0, ${now})
    `;
    });
}
/** One more walk today, for candy — at most EXTRA_WALKS_PER_DAY. */
export async function buyExtraWalk(userId, now = Date.now()) {
    if (!isSeason(now))
        throw new TotError('ჰელოუინი ახლა არ არის — შემდეგ ოქტომბერს!');
    await sql.begin(async (tx) => {
        await lock(tx, userId);
        const { walks } = await spentToday(tx, userId, tbilisiDate(now).key);
        if (walks >= EXTRA_WALKS_PER_DAY)
            throw new TotError('დღეს მეტი დამატებითი გასეირნება აღარ იყიდება.');
        if (await walletOf(tx, userId, seasonOf(now)) < EXTRA_WALK_PRICE)
            throw new TotError('კანფეტი არ გყოფნის.');
        await spend(tx, userId, now, 'walk', 'extra_walk', EXTRA_WALK_PRICE);
    });
}
/**
 * Candy into coins: in steps of EXCHANGE_STEP, at most EXCHANGE_COINS_PER_DAY
 * coins a day, and only for a player with an account — a guest has nowhere to
 * keep coins. The candy is claimed under the lock; the coins are paid after,
 * and if paying fails the claim is taken back, so candy is never lost.
 */
export async function exchangeCandy(userId, candy, now = Date.now()) {
    if (!Number.isInteger(candy) || candy <= 0 || candy % EXCHANGE_STEP !== 0) {
        throw new TotError(`გადაცვლა ${EXCHANGE_STEP}-ის ჯერადად.`);
    }
    const coins = coinsFor(candy);
    const spendId = await sql.begin(async (tx) => {
        await lock(tx, userId);
        if (!(await hasAccount(tx, userId)))
            throw new TotError('ქოინებისთვის ანგარიში გჭირდება.');
        const { coins: today } = await spentToday(tx, userId, tbilisiDate(now).key);
        if (today + coins > EXCHANGE_COINS_PER_DAY) {
            throw new TotError(`დღეს კიდევ ${Math.max(0, EXCHANGE_COINS_PER_DAY - today)} ქოინის გადაცვლა შეგიძლია.`);
        }
        if (await walletOf(tx, userId, seasonOf(now)) < candy)
            throw new TotError('კანფეტი არ გყოფნის.');
        return spend(tx, userId, now, 'exchange', 'coins', candy, coins);
    });
    try {
        await grantCoins('system', userId, coins, 'ტკბილეული თუ ხრიკი — კანფეტის გადაცვლა');
    }
    catch (e) {
        await sql `DELETE FROM tot_spend WHERE id = ${spendId}`.catch(() => { });
        throw e;
    }
    return coins;
}
/** A cosmetic from the shop: bought once, kept on the profile. */
export async function buyCosmetic(userId, item, now = Date.now()) {
    if (!(item in COSMETICS))
        throw new TotError('ასეთი ნივთი არ არის.');
    const price = COSMETICS[item].price;
    const spendId = await sql.begin(async (tx) => {
        await lock(tx, userId);
        if (!(await hasAccount(tx, userId)))
            throw new TotError('ამისთვის ანგარიში გჭირდება.');
        const [had] = await tx `SELECT 1 FROM tot_spend WHERE user_id = ${userId} AND kind = 'cosmetic' AND item = ${item}`;
        // Bought here, or already on the profile some other way (a season prize).
        if (had || (await getCosmetics(userId)).unlockedItems.includes(item))
            throw new TotError('ეს უკვე შენია.');
        if (await walletOf(tx, userId, seasonOf(now)) < price)
            throw new TotError('კანფეტი არ გყოფნის.');
        return spend(tx, userId, now, 'cosmetic', item, price);
    });
    try {
        await grantCosmeticItem(userId, item);
    }
    catch (e) {
        await sql `DELETE FROM tot_spend WHERE id = ${spendId}`.catch(() => { });
        throw e;
    }
}
/**
 * Pay the season's prizes, once, after it has closed. Safe to call at any time
 * and as often as liked: before the season ends it does nothing, and a prize
 * already paid is refused by tot_prizes' key.
 */
export async function awardSeasonPrizes(year, now = Date.now()) {
    const t = tbilisiDate(now);
    const closed = t.year > year || (t.year === year && !isSeason(now) && t.month >= 11);
    if (!closed)
        return [];
    const { top } = await getBoard(null, now, 3, year);
    const paid = [];
    for (const prize of SEASON_PRIZES) {
        const row = top.find(r => r.rank === prize.rank);
        if (!row)
            continue;
        const claimed = await sql `
      INSERT INTO tot_prizes (season, rank, user_id, paid_at) VALUES (${year}, ${prize.rank}, ${row.userId}, ${now})
      ON CONFLICT DO NOTHING RETURNING rank
    `;
        if (!claimed.length)
            continue;
        try {
            await grantCoins('system', row.userId, prize.coins, `ტკბილეული თუ ხრიკი — სეზონის #${prize.rank} ადგილი`);
            for (const item of prize.items)
                await grantCosmeticItem(row.userId, item);
            paid.push({ rank: prize.rank, userId: row.userId });
        }
        catch (e) {
            // Not paid, so not claimed: the next pass tries again.
            await sql `DELETE FROM tot_prizes WHERE season = ${year} AND rank = ${prize.rank}`.catch(() => { });
            console.error('[tot] prize', prize.rank, e?.message);
        }
    }
    return paid;
}
/** Open the next door of the walk in progress. */
export async function knockDoor(userId, now = Date.now(), rng = Math.random) {
    return sql.begin(async (tx) => {
        await lock(tx, userId);
        const row = await activeRow(tx, userId);
        if (!row)
            throw new TotError('ჯერ გასეირნება დაიწყე.');
        const { walk, door } = knock(row.walk, rng);
        await save(tx, row.id, walk, now);
        return door;
    });
}
/** Go home and bank the bag. */
export async function walkHome(userId, now = Date.now()) {
    return sql.begin(async (tx) => {
        await lock(tx, userId);
        const row = await activeRow(tx, userId);
        if (!row)
            throw new TotError('ჯერ გასეირნება დაიწყე.');
        const walk = goHome(row.walk);
        await save(tx, row.id, walk, now);
        return walk.banked;
    });
}
/**
 * The season's board: candy carried home, summed over every walk.
 *
 * Only players with an account are on it. A guest plays on a socket id that
 * is new every visit, so a guest row is a stranger nobody can find again —
 * and a fresh id per visit would also be a fresh daily allowance per visit.
 */
export async function getBoard(userId, now = Date.now(), limit = 50, season) {
    const year = season ?? seasonOf(now);
    const rows = await sql `
    SELECT r.user_id, p.username, p.avatar_url, SUM(r.banked) AS total, MAX(r.banked) AS best,
           MIN(r.finished_at) FILTER (WHERE r.banked > 0) AS first_at
      FROM tot_runs r JOIN players p ON p.id = r.user_id
     WHERE r.season = ${year} AND r.status = 'home'
     GROUP BY r.user_id, p.username, p.avatar_url
    HAVING SUM(r.banked) > 0
     ORDER BY total DESC, first_at ASC
  `;
    const all = rows.map((r, i) => ({
        rank: i + 1, userId: r.user_id, username: r.username ?? 'ანონიმი', avatarUrl: r.avatar_url,
        total: Number(r.total), best: Number(r.best),
    }));
    return { top: all.slice(0, limit), me: userId ? all.find(r => r.userId === userId) ?? null : null };
}
//# sourceMappingURL=trickOrTreatService.js.map