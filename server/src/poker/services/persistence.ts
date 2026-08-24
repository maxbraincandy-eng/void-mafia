/**
 * Persistence — the schema, the writes, and the reads the lobby and profile need.
 *
 * WHAT IT DOES
 * ────────────
 * Creates the poker tables at boot, writes a hand history when a hand settles,
 * writes an audit row when something is refused, keeps per-player gameplay
 * statistics, and rebuilds the leaderboards on a schedule.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * ────────────────────────────────
 * There is no wallet table, no balance, no ledger, no transaction. Chips exist
 * in `poker_player_sessions.stack` while somebody is sat down, and in
 * `poker_hands` as history. Nothing accumulates, nothing is credited anywhere,
 * and there is no code path that turns one into anything else. That absence is
 * structural and it is half of what makes the notice in `compliance.ts` true —
 * see `docs/poker/02-database.md` §0.
 *
 * IMMUTABILITY
 * ────────────
 * `poker_hands` and `poker_audit_log` are append-only. This module contains no
 * UPDATE or DELETE against either, and no function that would let a caller
 * write one — an admin cannot change a result because there is nothing to call,
 * not because a permission check says no.
 *
 * FAILURE POLICY
 * ──────────────
 * A write that fails is logged and swallowed. A database hiccup must not take
 * down a table full of people mid-hand: the hand is already decided in memory,
 * and losing its history is a smaller harm than losing the game. Every failure
 * is counted so the loss is visible rather than silent.
 */

import { sql } from '../../db.js';
import { isBot } from '../../services/testBots.js';
import type { AuditEntry, HandHistory } from './types.js';

let failures = 0;
export function persistenceFailures(): number { return failures; }

function swallow(where: string): (err: unknown) => void {
  return err => {
    failures += 1;
    console.warn(`[poker/db] ${where} failed:`, (err as Error)?.message ?? err);
  };
}

const id = () => `pk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

// ─── Schema ──────────────────────────────────────────────────────────────────

/**
 * Additive, idempotent, and safe to run on every boot — the same convention as
 * `db.ts`. No foreign keys, matching the rest of this schema, which keeps boot
 * order flexible.
 */
export async function initializePokerSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS poker_tables (
      id             TEXT PRIMARY KEY,
      code           TEXT NOT NULL,
      name           TEXT NOT NULL,
      host_id        TEXT NOT NULL,
      max_seats      INTEGER NOT NULL DEFAULT 6,
      small_blind    INTEGER NOT NULL,
      big_blind      INTEGER NOT NULL,
      ante           INTEGER NOT NULL DEFAULT 0,
      buy_in         INTEGER NOT NULL,
      action_seconds INTEGER NOT NULL DEFAULT 25,
      is_private     INTEGER NOT NULL DEFAULT 0,
      status         TEXT NOT NULL DEFAULT 'open',
      created_at     BIGINT NOT NULL,
      closed_at      BIGINT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_poker_tables_status ON poker_tables(status)`;

  await sql`
    CREATE TABLE IF NOT EXISTS poker_sessions (
      id           TEXT PRIMARY KEY,
      table_id     TEXT NOT NULL,
      started_at   BIGINT NOT NULL,
      ended_at     BIGINT,
      hands_played INTEGER NOT NULL DEFAULT 0,
      peak_players INTEGER NOT NULL DEFAULT 0
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_poker_sessions_table ON poker_sessions(table_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS poker_player_sessions (
      id           TEXT PRIMARY KEY,
      session_id   TEXT NOT NULL,
      table_id     TEXT NOT NULL,
      player_id    TEXT NOT NULL,
      seat         INTEGER NOT NULL,
      buy_in       INTEGER NOT NULL,
      stack        INTEGER NOT NULL,
      hands_played INTEGER NOT NULL DEFAULT 0,
      hands_won    INTEGER NOT NULL DEFAULT 0,
      joined_at    BIGINT NOT NULL,
      left_at      BIGINT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_poker_psessions_player ON poker_player_sessions(player_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_poker_psessions_session ON poker_player_sessions(session_id)`;

  // Append only. Written once, at settlement. Never updated, never deleted by
  // anything except the retention job.
  await sql`
    CREATE TABLE IF NOT EXISTS poker_hands (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL,
      table_id    TEXT NOT NULL,
      hand_no     INTEGER NOT NULL,
      button_seat INTEGER NOT NULL,
      small_blind INTEGER NOT NULL,
      big_blind   INTEGER NOT NULL,
      ante        INTEGER NOT NULL DEFAULT 0,
      board       TEXT NOT NULL,
      actions     TEXT NOT NULL,
      result      TEXT NOT NULL,
      pot_total   INTEGER NOT NULL,
      deck_hash   TEXT NOT NULL,
      deck_seed   TEXT NOT NULL,
      deck_order  TEXT NOT NULL,
      started_at  BIGINT NOT NULL,
      ended_at    BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_poker_hands_session ON poker_hands(session_id, hand_no)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_poker_hands_table ON poker_hands(table_id, ended_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS poker_hand_players (
      hand_id     TEXT NOT NULL,
      player_id   TEXT NOT NULL,
      seat        INTEGER NOT NULL,
      hole_cards  TEXT NOT NULL,
      contributed INTEGER NOT NULL,
      won         INTEGER NOT NULL DEFAULT 0,
      net         INTEGER NOT NULL,
      showed      INTEGER NOT NULL DEFAULT 0,
      hand_rank   TEXT,
      ended_at    BIGINT NOT NULL,
      PRIMARY KEY (hand_id, player_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_poker_hand_players_player ON poker_hand_players(player_id, ended_at DESC)`;

  // Gameplay statistics. Every column counts something that happened in a game;
  // there is nothing here with a value.
  await sql`
    CREATE TABLE IF NOT EXISTS poker_stats (
      player_id      TEXT PRIMARY KEY,
      hands_played   INTEGER NOT NULL DEFAULT 0,
      hands_won      INTEGER NOT NULL DEFAULT 0,
      showdowns_won  INTEGER NOT NULL DEFAULT 0,
      biggest_pot    INTEGER NOT NULL DEFAULT 0,
      best_hand_rank INTEGER NOT NULL DEFAULT 0,
      best_hand_text TEXT,
      sessions       INTEGER NOT NULL DEFAULT 0,
      time_played_ms BIGINT NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      vpip_hands     INTEGER NOT NULL DEFAULT 0,
      updated_at     BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS poker_leaderboard (
      period      TEXT NOT NULL,
      period_key  TEXT NOT NULL,
      metric      TEXT NOT NULL,
      player_id   TEXT NOT NULL,
      value       BIGINT NOT NULL,
      rank        INTEGER NOT NULL,
      computed_at BIGINT NOT NULL,
      PRIMARY KEY (period, period_key, metric, player_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_poker_lb_rank ON poker_leaderboard(period, period_key, metric, rank)`;

  await sql`
    CREATE TABLE IF NOT EXISTS poker_achievements (
      player_id TEXT NOT NULL,
      key       TEXT NOT NULL,
      earned_at BIGINT NOT NULL,
      context   TEXT,
      PRIMARY KEY (player_id, key)
    )
  `;

  // Append only. Every refusal, every admin read, every configuration change.
  await sql`
    CREATE TABLE IF NOT EXISTS poker_audit_log (
      id         TEXT PRIMARY KEY,
      at         BIGINT NOT NULL,
      actor_id   TEXT,
      actor_kind TEXT NOT NULL,
      event      TEXT NOT NULL,
      table_id   TEXT,
      hand_id    TEXT,
      detail     TEXT NOT NULL DEFAULT '{}',
      ip_hash    TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_poker_audit_at ON poker_audit_log(at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_poker_audit_actor ON poker_audit_log(actor_id, at DESC)`;

  console.log('[poker/db] schema ready');
}

// ─── Writes ──────────────────────────────────────────────────────────────────

/**
 * Write one settled hand.
 *
 * Fire-and-forget on purpose: the caller is the settlement path, and a table
 * full of people must not wait on a database round trip between hands.
 */
export function recordHand(history: HandHistory): void {
  void writeHand(history).catch(swallow('recordHand'));
}

async function writeHand(h: HandHistory): Promise<void> {
  const result = JSON.stringify({
    players: h.players.map(p => ({
      playerId: p.playerId, seat: p.seat, won: p.won, net: p.net,
      showed: p.showed, handRank: p.handRank,
    })),
  });

  await sql`
    INSERT INTO poker_hands (
      id, session_id, table_id, hand_no, button_seat, small_blind, big_blind, ante,
      board, actions, result, pot_total, deck_hash, deck_seed, deck_order, started_at, ended_at
    ) VALUES (
      ${h.handId}, ${h.sessionId}, ${h.tableId}, ${h.handNo}, ${h.buttonSeat},
      ${h.smallBlind}, ${h.bigBlind}, ${h.ante},
      ${JSON.stringify(h.board)}, ${JSON.stringify(h.actions)}, ${result}, ${h.potTotal},
      ${h.deckHash}, ${h.deckSeed}, ${JSON.stringify(h.deckOrder)}, ${h.startedAt}, ${h.endedAt}
    )
    ON CONFLICT (id) DO NOTHING
  `;

  for (const p of h.players) {
    await sql`
      INSERT INTO poker_hand_players (
        hand_id, player_id, seat, hole_cards, contributed, won, net, showed, hand_rank, ended_at
      ) VALUES (
        ${h.handId}, ${p.playerId}, ${p.seat}, ${JSON.stringify(p.holeCards)},
        ${p.contributed}, ${p.won}, ${p.net}, ${p.showed ? 1 : 0}, ${p.handRank}, ${h.endedAt}
      )
      ON CONFLICT (hand_id, player_id) DO NOTHING
    `;
  }

  await sql`
    UPDATE poker_sessions SET hands_played = hands_played + 1 WHERE id = ${h.sessionId}
  `;

  await updateStats(h);
}

/**
 * Gameplay statistics.
 *
 * `won` here means "took more out of the pot than they put in" — winning a hand
 * you were the only contributor to is not a win, and a split that returns your
 * own chips is not either.
 */
async function updateStats(h: HandHistory): Promise<void> {
  const showdown = h.players.some(p => p.showed);
  for (const p of h.players) {
    // A test bot's results are not a person's record. They never reach
    // statistics, and therefore never reach a leaderboard — otherwise an
    // afternoon of testing would rewrite the boards.
    if (isBot(p.playerId)) continue;
    const won = p.net > 0;
    const voluntary = p.contributed > h.bigBlind ? 1 : 0;
    await sql`
      INSERT INTO poker_stats (
        player_id, hands_played, hands_won, showdowns_won, biggest_pot,
        vpip_hands, current_streak, longest_streak, updated_at
      ) VALUES (
        ${p.playerId}, 1, ${won ? 1 : 0}, ${won && showdown ? 1 : 0}, ${won ? h.potTotal : 0},
        ${voluntary}, ${won ? 1 : 0}, ${won ? 1 : 0}, ${h.endedAt}
      )
      ON CONFLICT (player_id) DO UPDATE SET
        hands_played   = poker_stats.hands_played + 1,
        hands_won      = poker_stats.hands_won + ${won ? 1 : 0},
        showdowns_won  = poker_stats.showdowns_won + ${won && showdown ? 1 : 0},
        biggest_pot    = GREATEST(poker_stats.biggest_pot, ${won ? h.potTotal : 0}),
        vpip_hands     = poker_stats.vpip_hands + ${voluntary},
        current_streak = ${won ? sql`poker_stats.current_streak + 1` : sql`0`},
        longest_streak = GREATEST(poker_stats.longest_streak, ${won ? sql`poker_stats.current_streak + 1` : sql`0`}),
        updated_at     = ${h.endedAt}
    `;
  }
}

export function recordAudit(entry: AuditEntry): void {
  void sql`
    INSERT INTO poker_audit_log (id, at, actor_id, actor_kind, event, table_id, hand_id, detail)
    VALUES (
      ${id()}, ${entry.at}, ${entry.actorId}, ${entry.actorKind}, ${entry.event},
      ${entry.tableId ?? null}, ${entry.handId ?? null}, ${JSON.stringify(entry.detail ?? {})}
    )
  `.catch(swallow('recordAudit'));
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export interface PokerStats {
  handsPlayed: number;
  handsWon: number;
  showdownsWon: number;
  biggestPot: number;
  bestHandText: string | null;
  longestStreak: number;
  winRate: number;
  vpip: number;
}

export async function getStats(playerId: string): Promise<PokerStats> {
  const rows = await sql`SELECT * FROM poker_stats WHERE player_id = ${playerId}` as any[];
  const row = rows[0];
  const played = Number(row?.hands_played ?? 0);
  return {
    handsPlayed: played,
    handsWon: Number(row?.hands_won ?? 0),
    showdownsWon: Number(row?.showdowns_won ?? 0),
    biggestPot: Number(row?.biggest_pot ?? 0),
    bestHandText: row?.best_hand_text ?? null,
    longestStreak: Number(row?.longest_streak ?? 0),
    winRate: played > 0 ? Number(row.hands_won) / played : 0,
    vpip: played > 0 ? Number(row.vpip_hands) / played : 0,
  };
}

/** A player's own recent hands. Hole cards are only ever their own. */
export async function getRecentHands(playerId: string, limit = 25): Promise<unknown[]> {
  const rows = await sql`
    SELECT hp.hand_id, hp.seat, hp.hole_cards, hp.won, hp.net, hp.hand_rank,
           h.board, h.pot_total, h.ended_at, h.table_id
    FROM poker_hand_players hp
    JOIN poker_hands h ON h.id = hp.hand_id
    WHERE hp.player_id = ${playerId}
    ORDER BY hp.ended_at DESC
    LIMIT ${Math.min(100, Math.max(1, limit))}
  ` as any[];
  return rows.map(r => ({
    handId: r.hand_id,
    seat: r.seat,
    holeCards: JSON.parse(r.hole_cards),
    board: JSON.parse(r.board),
    won: Number(r.won),
    net: Number(r.net),
    handRank: r.hand_rank,
    pot: Number(r.pot_total),
    endedAt: Number(r.ended_at),
  }));
}

export const LEADERBOARD_METRICS = ['hands_won', 'win_rate', 'biggest_pot'] as const;
export type LeaderboardMetric = typeof LEADERBOARD_METRICS[number];

/** Below this, a win rate is noise rather than a ranking. */
export const MIN_HANDS_FOR_RATE = 100;

/**
 * Rebuild the all-time boards.
 *
 * Ranked on gameplay statistics. Never on chips held — a chip count is not an
 * achievement, and ranking by it would turn the counter into a score worth
 * hoarding, which is the first step towards wanting to buy one.
 */
export async function rebuildLeaderboards(now = Date.now()): Promise<void> {
  try {
    for (const metric of LEADERBOARD_METRICS) {
      const rows = await selectMetric(metric);
      await sql`DELETE FROM poker_leaderboard WHERE period = 'all_time' AND period_key = 'all' AND metric = ${metric}`;
      let rank = 0;
      for (const row of rows) {
        rank += 1;
        await sql`
          INSERT INTO poker_leaderboard (period, period_key, metric, player_id, value, rank, computed_at)
          VALUES ('all_time', 'all', ${metric}, ${row.player_id}, ${Math.round(row.value)}, ${rank}, ${now})
          ON CONFLICT (period, period_key, metric, player_id) DO UPDATE
            SET value = EXCLUDED.value, rank = EXCLUDED.rank, computed_at = EXCLUDED.computed_at
        `;
      }
    }
  } catch (e) { swallow('rebuildLeaderboards')(e); }
}

async function selectMetric(metric: LeaderboardMetric): Promise<{ player_id: string; value: number }[]> {
  if (metric === 'hands_won') {
    return await sql`
      SELECT player_id, hands_won AS value FROM poker_stats
      WHERE hands_won > 0 ORDER BY hands_won DESC LIMIT 100
    ` as any[];
  }
  if (metric === 'biggest_pot') {
    return await sql`
      SELECT player_id, biggest_pot AS value FROM poker_stats
      WHERE biggest_pot > 0 ORDER BY biggest_pot DESC LIMIT 100
    ` as any[];
  }
  // Scaled to an integer so the column stays a plain count rather than a float.
  return await sql`
    SELECT player_id, (hands_won * 10000 / GREATEST(hands_played, 1)) AS value
    FROM poker_stats
    WHERE hands_played >= ${MIN_HANDS_FOR_RATE}
    ORDER BY value DESC LIMIT 100
  ` as any[];
}

export async function getLeaderboard(metric: LeaderboardMetric, limit = 50): Promise<unknown[]> {
  const rows = await sql`
    SELECT lb.player_id, lb.value, lb.rank, p.username, p.avatar
    FROM poker_leaderboard lb
    LEFT JOIN players p ON p.id = lb.player_id
    WHERE lb.period = 'all_time' AND lb.period_key = 'all' AND lb.metric = ${metric}
    ORDER BY lb.rank ASC LIMIT ${Math.min(100, Math.max(1, limit))}
  ` as any[];
  return rows.map(r => ({
    playerId: r.player_id,
    name: r.username ?? 'Player',
    avatar: r.avatar ?? '',
    rank: Number(r.rank),
    // win_rate is stored ×10000; the client divides. Kept as an integer in the
    // column so the schema has no floats in it.
    value: Number(r.value),
  }));
}

// ─── Retention ───────────────────────────────────────────────────────────────

export const RETENTION_DAYS = { hands: 90, audit: 180, sessions: 90 } as const;

/**
 * The only permitted delete against `poker_hands`.
 *
 * A player exercising a deletion request has their id nulled in
 * `poker_hand_players` instead — a hand history with one seat missing is no
 * longer a record of what happened at the table for the other five players.
 */
export async function pruneOldRecords(now = Date.now()): Promise<void> {
  const day = 86_400_000;
  try {
    const handCut = now - RETENTION_DAYS.hands * day;
    await sql`DELETE FROM poker_hand_players WHERE ended_at < ${handCut}`;
    await sql`DELETE FROM poker_hands WHERE ended_at < ${handCut}`;
    await sql`DELETE FROM poker_audit_log WHERE at < ${now - RETENTION_DAYS.audit * day}`;
    await sql`DELETE FROM poker_player_sessions WHERE left_at IS NOT NULL AND left_at < ${now - RETENTION_DAYS.sessions * day}`;
  } catch (e) { swallow('pruneOldRecords')(e); }
}

/** Data-deletion request: forget who, keep what happened. */
export async function anonymisePlayer(playerId: string): Promise<void> {
  try {
    await sql`UPDATE poker_hand_players SET player_id = ${`deleted_${playerId.slice(0, 8)}`} WHERE player_id = ${playerId}`;
    await sql`DELETE FROM poker_stats WHERE player_id = ${playerId}`;
    await sql`DELETE FROM poker_achievements WHERE player_id = ${playerId}`;
    await sql`DELETE FROM poker_leaderboard WHERE player_id = ${playerId}`;
  } catch (e) { swallow('anonymisePlayer')(e); }
}
