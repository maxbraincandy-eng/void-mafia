/**
 * Game completion → XP and daily-quest progress, for games that had neither.
 *
 * Mafia, checkers, ludo and joker keep their own reward code; nothing here
 * touches them. This covers the party games that ended with nothing: a
 * finished round of UNO or Codenames gave no XP and did not count toward
 * "play 3 games today", which says games, not Mafia games.
 *
 * TWO HALVES
 *
 * `observe` is pure and synchronous. Each game module calls it from its
 * `broadcastState`, the one place every state change already passes through,
 * so no game's rules were edited to add a reward. It notices the moment a
 * match reaches a natural end and turns it into one completion event per
 * eligible player.
 *
 * `recordCompletion` is the only writer. One transaction claims the
 * completion, pays the XP, writes the ledger and advances the quest; a replay
 * of the same event conflicts on the claim and changes nothing.
 *
 * WHY THE SESSION ID IS NOT THE MATCH ID
 *
 * Every rematch in these games reuses the match id. Keyed on that, a second
 * game at the same table would have been refused as a duplicate of the first.
 * The tracker counts games per match (`gen`) and the session id carries it,
 * plus a per-process boot id: matches live in memory and die with the process,
 * so a match id can never span two boots.
 */

import { randomUUID } from 'crypto';
import { sql } from '../db.js';
import { getLevel, checkLevelCosmetics } from './playerService.js';
import { VOLUME_QUEST, stepId, stepPattern, todayKey } from './challengeService.js';
import type { UnoMatch } from './unoService.js';
import type { AliasMatch } from './aliasService.js';
import type { BlackoutMatch } from './blackoutService.js';
import type { CnMatch } from './codenamesService.js';
import type { DrawMatch } from './drawService.js';
import type { LiesMatch } from './liesService.js';
import type { SpyfallMatch } from './spyfallService.js';
import type { WhoSaidMatch } from './whoSaidService.js';

// ── The contract ──────────────────────────────────────────────────────────────

export type GameId = 'uno' | 'alias' | 'blackout' | 'codenames' | 'draw' | 'lies' | 'spyfall' | 'whosaid';

export interface GameCompletion {
  /** One game, not one room: `${boot}:${game}:${matchId}:${gen}`. */
  sessionId: string;
  game: GameId;
  /** The player's profile id. A guest's is a socket id and has no account. */
  userId: string;
  outcome: 'win' | 'played';
  completedAt: number;
}

export interface CompletionResult {
  granted: boolean;
  /** Why nothing was granted, when it was not. */
  reason?: 'no_account' | 'duplicate' | 'invalid' | 'error';
  xp: number;
  questBonus: number;
}

/**
 * XP per finished game. The same shape as checkers (20 a win, 5 otherwise) and
 * inside the range ludo (25/8) and joker (30/5) already pay. New amounts:
 * approve or change them here, in one place.
 */
export const XP_RULES = { win: 20, played: 5 } as const;

/** A game shorter than this is not counted — it keeps instant farms out. */
export const MIN_GAME_MS = 60_000;
/** Nobody gets credit for a table that ended with fewer people than this. */
export const MIN_PRESENT = 2;

// ── Per-game rules ────────────────────────────────────────────────────────────

interface Seat { userId: string; won: boolean; present: boolean }

interface Adapter<M> {
  game: GameId;
  /** A game is under way — not the lobby, not over. */
  playing: (m: M) => boolean;
  /** Over, AND over because it was played out: a winner exists. */
  completed: (m: M) => boolean;
  /** Seated players only. Spectators live elsewhere on every match type. */
  seats: (m: M) => Seat[];
}

const topScorers = (ps: { userId: string; score: number }[]) => {
  const top = Math.max(...ps.map(p => p.score));
  return new Set(ps.filter(p => p.score === top).map(p => p.userId));
};

export const ADAPTERS = {
  uno: {
    game: 'uno',
    playing: m => m.status === 'active' || m.status === 'color_choice',
    completed: m => m.status === 'finished' && !!m.winnerId,
    seats: m => m.players.map(p => ({ userId: p.userId, won: p.userId === m.winnerId, present: p.connected })),
  } satisfies Adapter<UnoMatch>,
  alias: {
    game: 'alias',
    playing: m => m.status === 'play',
    completed: m => m.status === 'finished' && m.winner !== null,
    seats: m => m.players.map(p => ({ userId: p.userId, won: p.team === m.winner, present: p.connected })),
  } satisfies Adapter<AliasMatch>,
  blackout: {
    game: 'blackout',
    playing: m => m.status === 'play' || m.status === 'meeting',
    completed: m => m.status === 'finished' && m.winner !== null,
    seats: m => m.players.map(p => ({
      userId: p.userId,
      won: (m.winner === 'killers') === (p.role === 'killer'),
      present: p.connected,
    })),
  } satisfies Adapter<BlackoutMatch>,
  codenames: {
    game: 'codenames',
    playing: m => m.status === 'play',
    completed: m => m.status === 'finished' && m.winner !== null,
    seats: m => m.players.map(p => ({ userId: p.userId, won: p.team === m.winner, present: p.connected })),
  } satisfies Adapter<CnMatch>,
  draw: {
    game: 'draw',
    playing: m => m.status === 'choosing' || m.status === 'drawing' || m.status === 'turnend',
    // A tie leaves `winner` null, so the round count is the mark of a finished
    // game here; leaving early ends it with the round still short.
    completed: m => m.status === 'finished' && m.round > m.settings.rounds,
    seats: m => m.players.map(p => ({ userId: p.userId, won: p.userId === m.winner, present: p.connected })),
  } satisfies Adapter<DrawMatch>,
  lies: {
    game: 'lies',
    playing: m => m.status === 'writing' || m.status === 'guessing' || m.status === 'reveal',
    completed: m => m.status === 'finished' && m.winnerIds.length > 0,
    seats: m => m.players.map(p => ({ userId: p.userId, won: m.winnerIds.includes(p.userId), present: p.connected })),
  } satisfies Adapter<LiesMatch>,
  spyfall: {
    game: 'spyfall',
    playing: m => m.status === 'play' || m.status === 'voting' || m.status === 'reveal',
    completed: m => m.status === 'finished' && m.winnerIds.length > 0,
    seats: m => m.players.map(p => ({ userId: p.userId, won: m.winnerIds.includes(p.userId), present: p.connected })),
  } satisfies Adapter<SpyfallMatch>,
  whosaid: {
    game: 'whosaid',
    playing: m => m.status === 'reading' || m.status === 'voting' || m.status === 'reveal',
    // No winner field: the last round played is what separates a finished game
    // from the table emptying out.
    completed: m => m.status === 'finished' && m.round >= m.rounds,
    seats: m => {
      const top = topScorers(m.players);
      return m.players.map(p => ({ userId: p.userId, won: top.has(p.userId), present: p.connected && !p.left }));
    },
  } satisfies Adapter<WhoSaidMatch>,
} as const;

// ── Noticing a finish ─────────────────────────────────────────────────────────

const BOOT = randomUUID().slice(0, 8);

interface Track { gen: number; startedAt: number | null; reported: boolean; seenAt: number }
const tracks = new Map<string, Track>();
const TRACK_TTL_MS = 12 * 3600_000;
let sinceSweep = 0;

/**
 * Look at a match; if it has just been played to the end, return one event
 * per player who earned it. Returns [] on every other call, including every
 * repeat broadcast of the same finished state.
 */
export function observe<M extends { id: string; status: string }>(
  a: Adapter<M>, m: M, now = Date.now(),
): GameCompletion[] {
  if (++sinceSweep >= 200) {
    sinceSweep = 0;
    for (const [k, t] of tracks) if (now - t.seenAt > TRACK_TTL_MS) tracks.delete(k);
  }
  const key = `${a.game}:${m.id}`;
  let t = tracks.get(key);
  if (!t) { t = { gen: 0, startedAt: null, reported: false, seenAt: now }; tracks.set(key, t); }
  t.seenAt = now;

  if (a.playing(m) || m.status === 'waiting') {
    // Back to play after an ending means a rematch: a new game at this table.
    if (t.reported) { t.gen++; t.reported = false; t.startedAt = null; }
    if (a.playing(m) && t.startedAt === null) t.startedAt = now;
    return [];
  }
  if (m.status !== 'finished' || t.reported) return [];

  t.reported = true;
  // Never saw it start: nothing to measure the game by, so nothing to credit.
  if (t.startedAt === null || now - t.startedAt < MIN_GAME_MS) return [];
  if (!a.completed(m)) return [];

  const present = a.seats(m).filter(s => s.present);
  if (new Set(present.map(s => s.userId)).size < MIN_PRESENT) return [];

  const sessionId = `${BOOT}:${a.game}:${m.id}:${t.gen}`;
  return present.map(s => ({
    sessionId, game: a.game, userId: s.userId,
    outcome: s.won ? 'win' : 'played', completedAt: now,
  }));
}

/** `observe`, then record each event. For `broadcastState`: never throws, never waits. */
export function trackCompletion<M extends { id: string; status: string }>(a: Adapter<M>, m: M): void {
  let events: GameCompletion[];
  try { events = observe(a, m); } catch (e) { console.error('[progress] observe', e); return; }
  for (const ev of events) {
    recordCompletion(ev).catch(e => console.error('[progress] record', ev.game, e));
  }
}

/** For tests: forget every match. */
export function __resetTracking(): void { tracks.clear(); }

// ── Recording ─────────────────────────────────────────────────────────────────

/**
 * Pay one completion: XP, its ledger row, and a step of the volume quest.
 *
 * All or nothing, in one transaction. The player's row is locked first, which
 * does two jobs: two different games finishing together for one player take
 * turns instead of both writing the same quest step, and the level is computed
 * from a total nobody else is changing.
 *
 * The claim in `legacy_xp_grants` is the idempotency key. It is the table the
 * ledger already uses for "at most once ever", so no schema change was needed.
 */
export async function recordCompletion(ev: GameCompletion): Promise<CompletionResult> {
  const none = (reason: CompletionResult['reason']): CompletionResult => ({ granted: false, reason, xp: 0, questBonus: 0 });
  if (!ev.userId || !ev.sessionId || !(ev.game in ADAPTERS) || (ev.outcome !== 'win' && ev.outcome !== 'played')) {
    return none('invalid');
  }
  const xp = XP_RULES[ev.outcome];

  const out = await sql.begin(async tx => {
    const [player] = await tx`SELECT xp, level FROM players WHERE id = ${ev.userId} FOR UPDATE` as any[];
    // Guests play on a socket id and have no row: the existing policy everywhere
    // is that a guest earns nothing, and that holds here.
    if (!player) return { res: none('no_account'), level: null as number | null };

    const claimed = await tx`
      INSERT INTO legacy_xp_grants (user_id, source, ref, granted_at)
      VALUES (${ev.userId}, ${ev.game}, ${'completion:' + ev.sessionId}, ${ev.completedAt})
      ON CONFLICT DO NOTHING
      RETURNING ref
    ` as any[];
    if (claimed.length === 0) return { res: none('duplicate'), level: null };

    // One step of "play 3 games today". The date is the quest's own day key,
    // so it resets exactly when the Mafia path does.
    const day = todayKey();
    const [row] = await tx`
      SELECT COUNT(*) AS c FROM daily_completions
      WHERE player_id = ${ev.userId} AND date_key = ${day}
        AND (challenge_id = ${VOLUME_QUEST.id} OR challenge_id LIKE ${stepPattern(VOLUME_QUEST.id)})
    ` as any[];
    const progress = Number(row?.c ?? 0);
    let questBonus = 0;
    if (progress < VOLUME_QUEST.targetCount) {
      const next = progress + 1;
      await tx`
        INSERT INTO daily_completions (player_id, challenge_id, date_key, completed_at)
        VALUES (${ev.userId}, ${stepId(VOLUME_QUEST.id, next)}, ${day}, ${ev.completedAt})
      `;
      if (next >= VOLUME_QUEST.targetCount) questBonus = VOLUME_QUEST.xpReward;
    }

    const total = xp + questBonus;
    const newXP = Number(player.xp ?? 0) + total;
    const newLevel = getLevel(newXP);
    await tx`UPDATE players SET xp = ${newXP}, level = ${newLevel} WHERE id = ${ev.userId}`;
    await tx`
      INSERT INTO legacy_xp_events (user_id, source, amount, reason, created_at)
      VALUES (${ev.userId}, ${ev.game}, ${xp}, ${ev.outcome}, ${ev.completedAt})
    `;
    if (questBonus > 0) {
      await tx`
        INSERT INTO legacy_xp_events (user_id, source, amount, reason, created_at)
        VALUES (${ev.userId}, 'daily', ${questBonus}, ${VOLUME_QUEST.id}, ${ev.completedAt})
      `;
    }
    return {
      res: { granted: true, xp, questBonus } as CompletionResult,
      level: newLevel > Number(player.level ?? 1) ? newLevel : null,
    };
  });

  // Cosmetic unlocks follow a level-up and are not part of the payment: a
  // failure there must not undo XP that was correctly paid.
  if (out.level !== null) await checkLevelCosmetics(ev.userId, out.level).catch(() => {});
  return out.res;
}
