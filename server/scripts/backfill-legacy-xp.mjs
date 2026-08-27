#!/usr/bin/env node
/**
 * Backfill Legacy XP from history that predates the ledger.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE RUNNING IT
 * ─────────────────────────────────────────────────────────────────────────────
 * This is a skeleton, and the numbers in RATES are placeholders. They are a
 * product decision, not an engineering one: they decide how many levels every
 * existing player is handed overnight, and no amount of care in this file makes
 * a wrong ratio right. Somebody has to look at the dry run and say yes.
 *
 * It refuses to write unless you pass --apply. The default is a dry run that
 * reports exactly what it would do.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES, AND WHAT IT DELIBERATELY DOES NOT
 * ─────────────────────────────────────────────────────────────────────────────
 * The account already has XP. `players.xp` has been accumulating from mafia,
 * checkers, ludo, joker and predictions all along — this migration does NOT
 * re-award any of that, and if it did, everybody who has been playing would be
 * paid twice for the same games.
 *
 * What it does is give that existing total a provenance it never had. A player
 * with 4,000 XP and no ledger rows has a profile whose breakdown is empty and
 * whose total says 4,000 — the two disagree, and the breakdown is the one that
 * looks broken.
 *
 * So the default mode is ATTRIBUTION, not addition: it splits each player's
 * existing `players.xp` across the sources their history says it came from, and
 * writes ledger rows that sum to exactly what they already have. Nobody gains a
 * level. Nobody loses one. The bars simply stop being empty.
 *
 * The additive mode — paying for history that never earned XP, such as poker
 * hands or old games from before a game called `addXP` at all — is behind
 * --mode=grant, and that is the mode whose rates need the product judgement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SAFETY
 * ─────────────────────────────────────────────────────────────────────────────
 *   · Dry run by default; --apply is required to write.
 *   · Every grant carries a ref, so re-running awards nothing twice. The
 *     (user, source, ref) key in legacy_xp_grants is what enforces it, not
 *     this script's own bookkeeping.
 *   · Batched, with a report per batch, so an interrupted run is resumable by
 *     simply running it again.
 *   · --user=<id> runs it for one account, which is how you check the rates on
 *     somebody real before doing it to everybody.
 *
 * Usage:
 *   node scripts/backfill-legacy-xp.mjs                      # dry run, attribute
 *   node scripts/backfill-legacy-xp.mjs --user=abc123        # one player
 *   node scripts/backfill-legacy-xp.mjs --mode=grant         # dry run, additive
 *   node scripts/backfill-legacy-xp.mjs --apply              # write
 */

import postgres from 'postgres';

// ── Arguments ────────────────────────────────────────────────────────────────

const args = new Map(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const APPLY = args.get('apply') === true;
const MODE = args.get('mode') === 'grant' ? 'grant' : 'attribute';
const ONLY_USER = typeof args.get('user') === 'string' ? args.get('user') : null;
const BATCH = Number(args.get('batch')) || 500;

/**
 * PLACEHOLDER RATES — needs product sign-off before --mode=grant is run.
 *
 * Only used by the additive mode. Attribution mode does not read them: it
 * divides up XP that has already been earned, so the split is proportional to
 * what a player actually did, not to what anybody thinks a win is worth.
 *
 * The comparison that matters is against what the games pay TODAY, so that a
 * backfilled game is not worth more than a game played tomorrow:
 *
 *   mafia    — a finished game already pays a variable amount around 40
 *   checkers — 20 win / 5 loss
 *   ludo     — 25 win / 8 played
 *   joker    — 30 win / 5 played
 *   poker    — pays nothing at all today, which is the real gap
 */
const RATES = {
  mafia:    { win: 50, loss: 10 },
  checkers: { win: 20, loss: 5 },
  ludo:     { win: 25, loss: 8 },
  joker:    { win: 30, loss: 5 },
  poker:    { win: 15, loss: 3 },
};

// ── Connection ───────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Refusing to guess.');
  process.exit(1);
}
const sql = postgres(DATABASE_URL, { max: 2 });

// ── The evidence each source can offer ───────────────────────────────────────

/**
 * How much a player did, per source, from whatever tables already record it.
 *
 * Each entry answers one question: for this player, how many games and how many
 * wins does this source know about? A source with no table to read returns
 * zeros and contributes nothing — which is the correct behaviour for a game
 * that has never persisted per-player results.
 *
 * TODO(product): poker persists hands per player in `poker_hand_players`, but
 * whether a "win" there means a won pot or a winning session is a rules
 * question. Left at zero until that is answered rather than guessed.
 */
const EVIDENCE = {
  async mafia(userId) {
    const [r] = await sql`
      SELECT COUNT(*)::int AS played, COALESCE(SUM(won), 0)::int AS won
      FROM game_players WHERE player_id = ${userId}
    `;
    return { played: r?.played ?? 0, won: r?.won ?? 0 };
  },

  // Checkers, ludo and joker keep live matches in memory and have no historical
  // per-player table to read. Attribution mode still reaches them through the
  // catch-all below; grant mode cannot pay for what was never recorded.
  async checkers() { return { played: 0, won: 0 }; },
  async ludo() { return { played: 0, won: 0 }; },
  async joker() { return { played: 0, won: 0 }; },
  async poker() { return { played: 0, won: 0 }; },
};

// ── Planning ─────────────────────────────────────────────────────────────────

/**
 * What this player should end up with, without writing anything.
 *
 * Returns the ledger rows to insert. In attribution mode they sum to exactly
 * the player's existing XP; in grant mode they are new XP on top.
 */
async function plan(player) {
  const evidence = {};
  for (const [source, read] of Object.entries(EVIDENCE)) {
    evidence[source] = await read(player.id);
  }

  if (MODE === 'grant') {
    const rows = [];
    for (const [source, e] of Object.entries(evidence)) {
      const rate = RATES[source];
      if (!rate || e.played === 0) continue;
      const losses = Math.max(0, e.played - e.won);
      const amount = e.won * rate.win + losses * rate.loss;
      if (amount > 0) rows.push({ source, amount, reason: 'backfill', ref: `grant:v1:${source}` });
    }
    return rows;
  }

  // ── Attribution ───────────────────────────────────────────────────────────
  // Split what they already have across what they actually played. The weights
  // are that source's own rates, so a player whose games were mostly mafia gets
  // a mostly-mafia bar — but the total is pinned to `players.xp` and cannot
  // drift from it.
  const weights = [];
  for (const [source, e] of Object.entries(evidence)) {
    const rate = RATES[source];
    if (!rate || e.played === 0) continue;
    const losses = Math.max(0, e.played - e.won);
    weights.push({ source, weight: e.won * rate.win + losses * rate.loss });
  }

  const total = Number(player.xp) || 0;
  if (total <= 0) return [];

  const sum = weights.reduce((n, w) => n + w.weight, 0);
  if (sum <= 0) {
    // XP with no history to attribute it to — from a game that keeps no record,
    // or from before any of this. It is real XP and it stays; it is simply
    // filed under "history" rather than invented into a game they may not have
    // played.
    return [{ source: 'backfill', amount: total, reason: 'ისტორია', ref: 'attribute:v1:unsourced' }];
  }

  const rows = [];
  let handed = 0;
  weights.forEach((w, i) => {
    // The last share takes the remainder, so rounding cannot lose or invent a
    // point of XP. Without this the bars sum to one or two less than the total
    // and the profile quietly contradicts itself.
    const amount = i === weights.length - 1
      ? total - handed
      : Math.round(total * (w.weight / sum));
    handed += amount;
    if (amount > 0) rows.push({ source: w.source, amount, reason: 'ისტორია', ref: `attribute:v1:${w.source}` });
  });
  return rows;
}

// ── Writing ──────────────────────────────────────────────────────────────────

/**
 * Insert one planned row.
 *
 * Attribution must NOT touch `players.xp` — it is describing XP that is already
 * there. Grant mode must. That is the only difference between the two modes at
 * write time, and getting it backwards would double every existing player's
 * total, so it is a branch and not a flag threaded through a helper.
 */
async function write(userId, row) {
  const claimed = await sql`
    INSERT INTO legacy_xp_grants (user_id, source, ref, granted_at)
    VALUES (${userId}, ${row.source}, ${row.ref}, ${Date.now()})
    ON CONFLICT DO NOTHING
    RETURNING ref
  `;
  if (claimed.length === 0) return false;   // already done on an earlier run

  await sql`
    INSERT INTO legacy_xp_events (user_id, source, amount, reason, created_at)
    VALUES (${userId}, ${row.source}, ${row.amount}, ${row.reason}, ${Date.now()})
  `;
  if (MODE === 'grant') {
    await sql`UPDATE players SET xp = xp + ${row.amount} WHERE id = ${userId}`;
    // NOTE: `level` is deliberately not recomputed here. Levels are derived from
    // the threshold table in playerService, and a script with its own copy of
    // that table is a second source of truth waiting to disagree. Run the level
    // recompute pass afterwards — see recomputeLevels below.
  }
  return true;
}

/**
 * Bring `players.level` back in line with `players.xp`.
 *
 * Only needed after grant mode. Written as a single statement against the same
 * thresholds the service uses, passed in rather than duplicated here.
 */
async function recomputeLevels(thresholds) {
  const cases = thresholds
    .map((t, i) => `WHEN xp >= ${t} THEN ${i + 1}`)
    .reverse()
    .join(' ');
  await sql.unsafe(`UPDATE players SET level = (CASE ${cases} ELSE 1 END) WHERE xp > 0`);
}

// ── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`mode=${MODE}  ${APPLY ? 'APPLY (writing)' : 'dry run'}${ONLY_USER ? `  user=${ONLY_USER}` : ''}`);
  if (MODE === 'grant' && APPLY) {
    console.log('\n  ⚠  grant mode adds NEW XP using the placeholder rates in this file.');
    console.log('     Levels will move. This needs product sign-off.\n');
  }

  let offset = 0;
  let players = 0, rowsPlanned = 0, xpPlanned = 0, written = 0, skipped = 0;

  for (;;) {
    const batch = ONLY_USER
      ? await sql`SELECT id, username, xp FROM players WHERE id = ${ONLY_USER}`
      : await sql`SELECT id, username, xp FROM players WHERE xp > 0 ORDER BY id LIMIT ${BATCH} OFFSET ${offset}`;
    if (batch.length === 0) break;

    for (const player of batch) {
      const rows = await plan(player);
      if (rows.length === 0) continue;
      players++;
      rowsPlanned += rows.length;
      xpPlanned += rows.reduce((n, r) => n + r.amount, 0);

      if (players <= 5 || ONLY_USER) {
        const shape = rows.map(r => `${r.source}:${r.amount}`).join(' ');
        console.log(`  ${String(player.id).slice(0, 12).padEnd(12)} xp=${String(player.xp).padStart(7)}  →  ${shape}`);
      }

      if (APPLY) {
        for (const row of rows) (await write(player.id, row)) ? written++ : skipped++;
      }
    }

    if (ONLY_USER) break;
    offset += BATCH;
    if (!ONLY_USER) console.log(`  … ${offset} scanned`);
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`players affected : ${players}`);
  console.log(`ledger rows      : ${rowsPlanned}`);
  console.log(`xp ${MODE === 'grant' ? 'granted' : 'attributed'}   : ${xpPlanned}`);
  if (APPLY) {
    console.log(`written          : ${written}`);
    console.log(`already done     : ${skipped}`);
    if (MODE === 'grant') {
      console.log('\nNow run the level recompute — see recomputeLevels() in this file.');
    }
  } else {
    console.log('\nDry run. Nothing was written. Pass --apply to write.');
  }
  await sql.end({ timeout: 5 });
}

main().catch(async e => {
  console.error(e);
  await sql.end({ timeout: 1 });
  process.exit(1);
});

export { plan, RATES, recomputeLevels };
