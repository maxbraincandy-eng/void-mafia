import { sql } from '../db.js';
import { deductCoins, getCoins } from './coinService.js';
export const STAGES = [
    { key: 'primitive', name: 'Primitive Cell', ka: 'პირველადი უჯრედი', needs: 1 },
    { key: 'advanced', name: 'Advanced Cell', ka: 'განვითარებული უჯრედი', needs: 2 },
    { key: 'neural', name: 'Neural Core', ka: 'ნეირონული ბირთვი', needs: 3 },
    { key: 'network', name: 'Brain Network', ka: 'ნეირონული ქსელი', needs: 5 },
    { key: 'conscious', name: 'Digital Consciousness', ka: 'ციფრული ცნობიერება', needs: 8 },
    { key: 'ultimate', name: 'Ultimate Evolution', ka: 'უმაღლესი ევოლუცია', needs: 0 },
];
// ── resources ─────────────────────────────────────────────────────────
/** The merge chain: three of one make one of the next. */
export const CHAIN = ['frag', 'cell', 'adna', 'ncore'];
/** Everything else a chest can contain. */
export const EXTRAS = ['energyCell', 'particle', 'crystal', 'upgrade'];
export const RES_META = {
    frag: { name: 'DNA Fragment', ka: 'დნმ-ის ფრაგმენტი', tier: 1 },
    cell: { name: 'DNA Cell', ka: 'დნმ-ის უჯრედი', tier: 2 },
    adna: { name: 'Advanced DNA', ka: 'განვითარებული დნმ', tier: 3 },
    ncore: { name: 'Neural Core', ka: 'ნეირონული ბირთვი', tier: 4 },
    energyCell: { name: 'Energy Cell', ka: 'ენერგო-უჯრედი', tier: 2 },
    particle: { name: 'Neural Particle', ka: 'ნეირონული ნაწილაკი', tier: 3 },
    crystal: { name: 'Evolution Crystal', ka: 'ევოლუციის კრისტალი', tier: 5 },
    upgrade: { name: 'Evolution Upgrade', ka: 'ევოლუციის განახლება', tier: 6 },
};
export const MERGE_COST = 3;
const TIER_ORDER = ['common', 'advanced', 'legendary'];
export const CHEST_META = {
    common: { name: 'Common Chest', ka: 'ჩვეულებრივი ყუთი', rolls: [3, 5] },
    advanced: { name: 'Advanced Chest', ka: 'გაუმჯობესებული ყუთი', rolls: [4, 6] },
    legendary: { name: 'Legendary Chest', ka: 'ლეგენდარული ყუთი', rolls: [6, 9] },
    social: { name: 'Evolution Share Chest', ka: 'გაზიარების ყუთი', rolls: [5, 8] },
};
export const UPGRADES = [
    {
        key: 'energyCap', name: 'Energy Capacity', ka: 'ენერგიის მოცულობა',
        desc: 'ზრდის მაქსიმალურ ენერგიას +25-ით', max: 8,
        cost: l => ({ particle: 2 + l * 2, cell: 3 + l * 3 }),
    },
    {
        key: 'chestQuality', name: 'Chest Quality', ka: 'ყუთის ხარისხი',
        desc: 'ზრდის უკეთესი ყუთის შანსს', max: 6,
        cost: l => ({ particle: 3 + l * 3, crystal: l }),
    },
    {
        key: 'mergeSpeed', name: 'Merge Speed', ka: 'შერწყმის სიჩქარე',
        desc: 'ამცირებს შერწყმის ანიმაციას და აძლევს ბონუს XP-ს', max: 5,
        cost: l => ({ particle: 2 + l * 2, adna: 1 + l }),
    },
    {
        key: 'rareChance', name: 'Rare Item Chance', ka: 'იშვიათის შანსი',
        desc: 'ზრდის მაღალი დონის რესურსის შანსს', max: 6,
        cost: l => ({ crystal: 1 + l, particle: 4 + l * 3 }),
    },
    {
        key: 'appearance', name: 'Evolution Appearance', ka: 'ევოლუციის იერსახე',
        desc: 'ცვლის ორგანიზმის ფერსა და ბზინვარებას', max: 5,
        cost: l => ({ crystal: 1 + l, ncore: 1 + l }),
    },
];
const upgradeDef = (k) => UPGRADES.find(u => u.key === k);
// ── energy ────────────────────────────────────────────────────────────
const BASE_ENERGY = 40;
const ENERGY_PER_CAP = 25;
const REGEN_MS = 75000; // one energy per 75 s
const TAP_COST = 1;
const METER_PER_TAP = 7; // ~15 taps to a chest
const METER_FULL = 100;
const jparse = (s, fb) => { try {
    return typeof s === 'string' ? JSON.parse(s) : (s ?? fb);
}
catch {
    return fb;
} };
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.trunc(Number(v) || 0)));
function energyMaxOf(up) {
    return BASE_ENERGY + (up.energyCap ?? 0) * ENERGY_PER_CAP;
}
function regenMsOf(up) {
    // capacity upgrades also speed the trickle a little, so a bigger tank is not
    // a slower one to fill
    return Math.max(30000, REGEN_MS - (up.energyCap ?? 0) * 4000);
}
/** Apply offline regeneration and return the settled row. */
function settleEnergy(row) {
    const up = jparse(row.upgrades, {});
    const max = energyMaxOf(up);
    const step = regenMsOf(up);
    const now = Date.now();
    let energy = clampInt(row.energy, 0, max);
    let at = Number(row.energy_at) || now;
    if (energy < max) {
        const gained = Math.floor((now - at) / step);
        if (gained > 0) {
            energy = Math.min(max, energy + gained);
            at = at + gained * step;
        }
    }
    else {
        at = now;
    }
    const nextIn = energy >= max ? 0 : Math.max(0, step - (now - at));
    return { energy, energyAt: at, energyMax: max, nextIn };
}
function todayKey() { return new Date().toISOString().slice(0, 10); }
async function rowOf(userId) {
    const [row] = await sql `SELECT * FROM merge_profiles WHERE user_id = ${userId}`;
    if (row)
        return row;
    const now = Date.now();
    await sql `
    INSERT INTO merge_profiles (user_id, energy, energy_at, resources, chests, upgrades, created_at, updated_at)
    VALUES (${userId}, ${BASE_ENERGY}, ${now}, ${JSON.stringify({ frag: 3 })}, ${JSON.stringify({ common: 1 })}, '{}', ${now}, ${now})
    ON CONFLICT (user_id) DO NOTHING
  `;
    const [fresh] = await sql `SELECT * FROM merge_profiles WHERE user_id = ${userId}`;
    return fresh;
}
export async function getProfile(userId) {
    const row = await rowOf(userId);
    const e = settleEnergy(row);
    // persist the settled energy so the next read is cheap and honest
    if (e.energy !== Number(row.energy) || e.energyAt !== Number(row.energy_at)) {
        await sql `UPDATE merge_profiles SET energy = ${e.energy}, energy_at = ${e.energyAt} WHERE user_id = ${userId}`;
    }
    const boosts = await pendingBoosts(userId);
    return {
        userId,
        stage: clampInt(row.stage, 0, STAGES.length - 1),
        xp: Number(row.xp),
        energy: e.energy,
        energyMax: e.energyMax,
        energyAt: e.energyAt,
        nextEnergyInMs: e.nextIn,
        chestMeter: clampInt(row.chest_meter, 0, METER_FULL),
        resources: jparse(row.resources, {}),
        chests: jparse(row.chests, {}),
        upgrades: jparse(row.upgrades, {}),
        taps: Number(row.taps),
        merges: Number(row.merges),
        opened: Number(row.opened),
        lastSocial: row.last_social ?? null,
        socialAvailable: row.last_social !== todayKey(),
        boosts: boosts.length,
    };
}
async function save(userId, p) {
    const now = Date.now();
    await sql `
    UPDATE merge_profiles SET
      stage = COALESCE(${p.stage ?? null}, stage),
      xp = COALESCE(${p.xp ?? null}, xp),
      energy = COALESCE(${p.energy ?? null}, energy),
      energy_at = COALESCE(${p.energyAt ?? null}, energy_at),
      chest_meter = COALESCE(${p.chestMeter ?? null}, chest_meter),
      resources = COALESCE(${p.resources ? JSON.stringify(p.resources) : null}, resources),
      chests = COALESCE(${p.chests ? JSON.stringify(p.chests) : null}, chests),
      upgrades = COALESCE(${p.upgrades ? JSON.stringify(p.upgrades) : null}, upgrades),
      taps = COALESCE(${p.taps ?? null}, taps),
      merges = COALESCE(${p.merges ?? null}, merges),
      opened = COALESCE(${p.opened ?? null}, opened),
      last_social = COALESCE(${p.lastSocial ?? null}, last_social),
      updated_at = ${now}
    WHERE user_id = ${userId}
  `;
}
/**
 * Test completions that have not yet been converted into a chest upgrade.
 * Only sources that actually persist a completion are counted, so the number
 * on screen always corresponds to something the player really did.
 */
export async function pendingBoosts(userId) {
    const used = new Set((await sql `SELECT source, source_ref FROM merge_boosts WHERE user_id = ${userId}`)
        .map(r => `${r.source}:${r.source_ref}`));
    const out = [];
    const add = (source, ref) => { if (!used.has(`${source}:${ref}`))
        out.push({ source, ref }); };
    const iq = await sql `SELECT id FROM iq_attempts WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 25`;
    for (const r of iq)
        add('iq', r.id);
    const lg = await sql `SELECT id FROM logic_results WHERE user_id = ${userId} AND mode <> 'practice' ORDER BY created_at DESC LIMIT 25`;
    for (const r of lg)
        add('logic', r.id);
    const ex = await sql `SELECT id FROM logic_exam_attempts WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 10`;
    for (const r of ex)
        add('exam', r.id);
    // the psychological profile stores one row per player, keyed by its update time
    const mp = await sql `SELECT updated_at FROM max_puzzle_results WHERE user_id = ${userId}`;
    for (const r of mp)
        add('dilemma', String(r.updated_at));
    return out;
}
/** Spend up to `n` boosts and report how many were actually spent. */
async function consumeBoosts(userId, n) {
    if (n <= 0)
        return 0;
    const list = (await pendingBoosts(userId)).slice(0, n);
    const now = Date.now();
    for (const b of list) {
        await sql `
      INSERT INTO merge_boosts (user_id, source, source_ref, used_at)
      VALUES (${userId}, ${b.source}, ${b.ref}, ${now})
      ON CONFLICT DO NOTHING
    `;
    }
    return list.length;
}
/** Weighted drop from a tap. Rare-chance upgrades tilt it upward. */
function rollTapDrop(up, stage) {
    const rare = (up.rareChance ?? 0);
    const r = Math.random();
    if (r > 0.42 + rare * 0.02)
        return null; // most taps give only xp
    const t = Math.random() + rare * 0.05 + stage * 0.02;
    // NOTE: these thresholds must stay BELOW 1 for the base case, or the tier is
    // unreachable until upgrades lift `t` — crystals were at 1.06 and so dropped
    // exactly never for a new player, while two upgrades cost crystals.
    if (t > 0.985)
        return { key: 'crystal', amount: 1 };
    if (t > 0.93)
        return { key: 'particle', amount: 1 };
    if (t > 0.82)
        return { key: 'adna', amount: 1 };
    if (t > 0.62)
        return { key: 'cell', amount: 1 };
    if (t > 0.5)
        return { key: 'energyCell', amount: 1 };
    return { key: 'frag', amount: 1 + (Math.random() < 0.3 ? 1 : 0) };
}
export async function tap(userId, count = 1) {
    const row = await rowOf(userId);
    const e = settleEnergy(row);
    const n = clampInt(count, 1, 10); // batched taps, bounded
    if (e.energy < TAP_COST * n)
        return { error: 'ენერგია არ არის საკმარისი' };
    const up = jparse(row.upgrades, {});
    const res = jparse(row.resources, {});
    const chests = jparse(row.chests, {});
    const stage = clampInt(row.stage, 0, STAGES.length - 1);
    let energy = e.energy - TAP_COST * n;
    let xp = Number(row.xp) + n * (2 + stage);
    let meter = clampInt(row.chest_meter, 0, METER_FULL) + METER_PER_TAP * n;
    let drop = null;
    for (let i = 0; i < n; i++) {
        const d = rollTapDrop(up, stage);
        if (d) {
            res[d.key] = (res[d.key] ?? 0) + d.amount;
            drop = drop && drop.key === d.key ? { key: d.key, amount: drop.amount + d.amount } : (drop ?? d);
        }
    }
    let chestEarned = null;
    if (meter >= METER_FULL) {
        meter -= METER_FULL;
        // the meter always pays a Common; quality upgrades can promote it
        chestEarned = 'common';
        if (Math.random() < (up.chestQuality ?? 0) * 0.06)
            chestEarned = 'advanced';
        chests[chestEarned] = (chests[chestEarned] ?? 0) + 1;
    }
    await save(userId, {
        energy, energyAt: e.energyAt, xp, chestMeter: meter,
        resources: res, chests, taps: Number(row.taps) + n,
    });
    const profile = await getProfile(userId);
    return { energy, xp, chestMeter: meter, drop, chestEarned, profile };
}
export async function merge(userId, key, times = 1) {
    const idx = CHAIN.indexOf(key);
    if (idx < 0)
        return { error: 'ეს რესურსი არ ერწყმის' };
    const from = CHAIN[idx];
    const to = idx + 1 < CHAIN.length ? CHAIN[idx + 1] : 'upgrade';
    const row = await rowOf(userId);
    const res = jparse(row.resources, {});
    const have = res[from] ?? 0;
    const want = clampInt(times, 1, 50);
    const can = Math.min(want, Math.floor(have / MERGE_COST));
    if (can < 1)
        return { error: `საჭიროა ${MERGE_COST}x ${RES_META[from].ka}` };
    res[from] = have - can * MERGE_COST;
    res[to] = (res[to] ?? 0) + can;
    const up = jparse(row.upgrades, {});
    const gained = can * (5 + RES_META[to].tier * 3) * (1 + (up.mergeSpeed ?? 0) * 0.1);
    const xp = Number(row.xp) + Math.round(gained);
    await save(userId, { resources: res, xp, merges: Number(row.merges) + can });
    return { from, to, made: can, xp, profile: await getProfile(userId) };
}
// ── evolving ──────────────────────────────────────────────────────────
export async function evolve(userId) {
    const row = await rowOf(userId);
    const stage = clampInt(row.stage, 0, STAGES.length - 1);
    if (stage >= STAGES.length - 1)
        return { error: 'ევოლუცია დასრულებულია' };
    const need = STAGES[stage].needs;
    const res = jparse(row.resources, {});
    if ((res.upgrade ?? 0) < need)
        return { error: `საჭიროა ${need}x ${RES_META.upgrade.ka}` };
    res.upgrade = (res.upgrade ?? 0) - need;
    const next = stage + 1;
    // evolving refills the organism — it is the game's celebratory moment
    const up = jparse(row.upgrades, {});
    await save(userId, {
        stage: next, resources: res, xp: Number(row.xp) + 100 * next,
        energy: energyMaxOf(up), energyAt: Date.now(),
    });
    return { stage: next, profile: await getProfile(userId) };
}
function rollChest(tier, up, stage) {
    const [lo, hi] = CHEST_META[tier].rolls;
    const rolls = lo + Math.floor(Math.random() * (hi - lo + 1));
    const rare = (up.rareChance ?? 0) * 0.03;
    // Advanced needs to feel like a real step up, because promoting a chest is the
    // reward for finishing a test — at 0.14 it was worth only ~30% more loot.
    const lift = tier === 'legendary' ? 0.40 : tier === 'social' ? 0.30 : tier === 'advanced' ? 0.22 : 0;
    const out = new Map();
    const give = (k, n) => out.set(k, (out.get(k) ?? 0) + n);
    for (let i = 0; i < rolls; i++) {
        const t = Math.random() + lift + rare + stage * 0.015;
        if (t > 1.02)
            give('crystal', 1);
        else if (t > 0.9)
            give('ncore', 1);
        else if (t > 0.78)
            give('particle', 1 + Math.floor(Math.random() * 2));
        else if (t > 0.66)
            give('adna', 1);
        else if (t > 0.44)
            give('cell', 1 + Math.floor(Math.random() * 2));
        else if (t > 0.32)
            give('energyCell', 1);
        else
            give('frag', 2 + Math.floor(Math.random() * 3));
    }
    // the big chests never feel flat
    if (tier === 'legendary')
        give('crystal', 1);
    if (tier === 'advanced')
        give('particle', 1);
    if (tier === 'social') {
        give('particle', 2);
        give('crystal', 1);
    }
    return [...out.entries()].map(([key, amount]) => ({ key, amount }));
}
export async function openChest(userId, tier) {
    const t = ['common', 'advanced', 'legendary', 'social'].find(x => x === tier);
    if (!t)
        return { error: 'უცნობი ყუთი' };
    const row = await rowOf(userId);
    const chests = jparse(row.chests, {});
    if ((chests[t] ?? 0) < 1)
        return { error: 'ეს ყუთი არ გაქვს' };
    // A pending test completion promotes the chest one tier before it is opened.
    let effective = t;
    let boosted = false;
    if (t !== 'social') {
        const i = TIER_ORDER.indexOf(t);
        if (i >= 0 && i < TIER_ORDER.length - 1) {
            const spent = await consumeBoosts(userId, 1);
            if (spent > 0) {
                effective = TIER_ORDER[i + 1];
                boosted = true;
            }
        }
    }
    chests[t] = (chests[t] ?? 0) - 1;
    const up = jparse(row.upgrades, {});
    const res = jparse(row.resources, {});
    const stage = clampInt(row.stage, 0, STAGES.length - 1);
    const rewards = rollChest(effective, up, stage);
    for (const r of rewards)
        res[r.key] = (res[r.key] ?? 0) + r.amount;
    // energy cells are consumed straight into the tank — that is what they are for
    const cells = rewards.find(r => r.key === 'energyCell');
    let energy;
    if (cells) {
        const e = settleEnergy(row);
        energy = Math.min(e.energyMax, e.energy + cells.amount * 10);
        res.energyCell = (res.energyCell ?? 0) - cells.amount;
        if ((res.energyCell ?? 0) <= 0)
            delete res.energyCell;
    }
    const xp = Number(row.xp) + rewards.reduce((a, r) => a + r.amount * RES_META[r.key].tier * 2, 0);
    await save(userId, {
        chests, resources: res, xp, opened: Number(row.opened) + 1,
        ...(energy !== undefined ? { energy, energyAt: Date.now() } : {}),
    });
    return { tier: effective, boosted, rewards, xp, profile: await getProfile(userId) };
}
/** The once-a-day chest for sharing your organism. */
export async function claimSocial(userId) {
    const row = await rowOf(userId);
    const today = todayKey();
    if (row.last_social === today)
        return { error: 'დღეს უკვე აიღე გაზიარების ყუთი' };
    const chests = jparse(row.chests, {});
    chests.social = (chests.social ?? 0) + 1;
    await save(userId, { chests, lastSocial: today });
    return { profile: await getProfile(userId) };
}
// ── coin shop ─────────────────────────────────────────────────────────
/**
 * Chests for the app's ordinary mafia coins. Prices sit here, not on the
 * client, and the coin deduction runs BEFORE the chest is granted so a failed
 * payment can never hand out a free chest.
 */
export const SHOP = [
    { tier: 'common', coins: 150 },
    { tier: 'advanced', coins: 400 },
    { tier: 'legendary', coins: 1000 },
];
/** Energy top-up, for when the tank is dry and you want to keep going. */
export const ENERGY_REFILL_COINS = 120;
export async function shopState(userId) {
    return {
        coins: await getCoins(userId),
        chests: SHOP.map(s => ({ ...s, name: CHEST_META[s.tier].ka })),
        energyRefill: ENERGY_REFILL_COINS,
    };
}
export async function buyChest(userId, tier) {
    const item = SHOP.find(s => s.tier === tier);
    if (!item)
        return { error: 'ეს ყუთი არ იყიდება' };
    const have = await getCoins(userId);
    if (have < item.coins)
        return { error: `საჭიროა ${item.coins} მონეტა (გაქვს ${have})` };
    // charge first; if this throws, nothing was granted
    let coins = have;
    try {
        const r = await deductCoins(userId, userId, item.coins, `Merge Evolution — ${CHEST_META[item.tier].name}`);
        coins = r.newBalance;
    }
    catch (e) {
        return { error: e?.message ?? 'გადახდა ვერ შესრულდა' };
    }
    const row = await rowOf(userId);
    const chests = jparse(row.chests, {});
    chests[item.tier] = (chests[item.tier] ?? 0) + 1;
    await save(userId, { chests });
    return { profile: await getProfile(userId), coins, tier: item.tier };
}
export async function buyEnergy(userId) {
    const row = await rowOf(userId);
    const e = settleEnergy(row);
    if (e.energy >= e.energyMax)
        return { error: 'ენერგია სავსეა' };
    const have = await getCoins(userId);
    if (have < ENERGY_REFILL_COINS)
        return { error: `საჭიროა ${ENERGY_REFILL_COINS} მონეტა (გაქვს ${have})` };
    let coins = have;
    try {
        const r = await deductCoins(userId, userId, ENERGY_REFILL_COINS, 'Merge Evolution — ენერგიის შევსება');
        coins = r.newBalance;
    }
    catch (er) {
        return { error: er?.message ?? 'გადახდა ვერ შესრულდა' };
    }
    await save(userId, { energy: e.energyMax, energyAt: Date.now() });
    return { profile: await getProfile(userId), coins };
}
// ── upgrades ──────────────────────────────────────────────────────────
export async function buyUpgrade(userId, key) {
    const def = upgradeDef(key);
    if (!def)
        return { error: 'უცნობი გაუმჯობესება' };
    const row = await rowOf(userId);
    const up = jparse(row.upgrades, {});
    const lvl = up[def.key] ?? 0;
    if (lvl >= def.max)
        return { error: 'მაქსიმალური დონეა' };
    const cost = def.cost(lvl);
    const res = jparse(row.resources, {});
    for (const [k, n] of Object.entries(cost)) {
        if ((res[k] ?? 0) < n) {
            return { error: `საჭიროა ${n}x ${RES_META[k].ka}` };
        }
    }
    for (const [k, n] of Object.entries(cost))
        res[k] = (res[k] ?? 0) - n;
    up[def.key] = lvl + 1;
    // a bigger tank should be full when you buy it, not empty
    const patch = { resources: res, upgrades: up };
    if (def.key === 'energyCap') {
        patch.energy = energyMaxOf(up);
        patch.energyAt = Date.now();
    }
    await save(userId, patch);
    return { profile: await getProfile(userId), level: lvl + 1 };
}
/** Static tables the client needs to render costs and names. */
export function catalog() {
    return {
        stages: STAGES,
        chain: CHAIN,
        res: RES_META,
        chests: CHEST_META,
        mergeCost: MERGE_COST,
        upgrades: UPGRADES.map(u => ({
            key: u.key, name: u.name, ka: u.ka, desc: u.desc, max: u.max,
            costs: Array.from({ length: u.max }, (_, l) => u.cost(l)),
        })),
        energy: { base: BASE_ENERGY, perCap: ENERGY_PER_CAP, regenMs: REGEN_MS, tapCost: TAP_COST, meterPerTap: METER_PER_TAP, meterFull: METER_FULL },
    };
}
// ── leaderboard ───────────────────────────────────────────────────────
export async function leaderboard(limit = 50) {
    const lim = Math.max(1, Math.min(100, limit));
    const rows = await sql `
    SELECT m.user_id, m.stage, m.xp, m.merges, m.opened, p.username, p.avatar, p.avatar_url, p.country
    FROM merge_profiles m JOIN players p ON p.id = m.user_id
    WHERE m.xp > 0
    ORDER BY m.stage DESC, m.xp DESC
    LIMIT ${lim}
  `;
    return rows.map((r, i) => ({
        rank: i + 1,
        userId: r.user_id,
        username: r.username ?? '—',
        avatar: r.avatar ?? '',
        avatarUrl: r.avatar_url ?? null,
        country: r.country ?? null,
        stage: Number(r.stage),
        stageName: STAGES[Number(r.stage)]?.ka ?? '',
        xp: Number(r.xp),
        merges: Number(r.merges),
        opened: Number(r.opened),
    }));
}
export const _internals = { rollChest, rollTapDrop, settleEnergy, energyMaxOf, METER_FULL, METER_PER_TAP, TAP_COST };
//# sourceMappingURL=mergeService.js.map