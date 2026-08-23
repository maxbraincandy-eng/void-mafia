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
import type { AuditEntry, HandHistory } from './types.js';
export declare function persistenceFailures(): number;
/**
 * Additive, idempotent, and safe to run on every boot — the same convention as
 * `db.ts`. No foreign keys, matching the rest of this schema, which keeps boot
 * order flexible.
 */
export declare function initializePokerSchema(): Promise<void>;
/**
 * Write one settled hand.
 *
 * Fire-and-forget on purpose: the caller is the settlement path, and a table
 * full of people must not wait on a database round trip between hands.
 */
export declare function recordHand(history: HandHistory): void;
export declare function recordAudit(entry: AuditEntry): void;
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
export declare function getStats(playerId: string): Promise<PokerStats>;
/** A player's own recent hands. Hole cards are only ever their own. */
export declare function getRecentHands(playerId: string, limit?: number): Promise<unknown[]>;
export declare const LEADERBOARD_METRICS: readonly ["hands_won", "win_rate", "biggest_pot"];
export type LeaderboardMetric = typeof LEADERBOARD_METRICS[number];
/** Below this, a win rate is noise rather than a ranking. */
export declare const MIN_HANDS_FOR_RATE = 100;
/**
 * Rebuild the all-time boards.
 *
 * Ranked on gameplay statistics. Never on chips held — a chip count is not an
 * achievement, and ranking by it would turn the counter into a score worth
 * hoarding, which is the first step towards wanting to buy one.
 */
export declare function rebuildLeaderboards(now?: number): Promise<void>;
export declare function getLeaderboard(metric: LeaderboardMetric, limit?: number): Promise<unknown[]>;
export declare const RETENTION_DAYS: {
    readonly hands: 90;
    readonly audit: 180;
    readonly sessions: 90;
};
/**
 * The only permitted delete against `poker_hands`.
 *
 * A player exercising a deletion request has their id nulled in
 * `poker_hand_players` instead — a hand history with one seat missing is no
 * longer a record of what happened at the table for the other five players.
 */
export declare function pruneOldRecords(now?: number): Promise<void>;
/** Data-deletion request: forget who, keep what happened. */
export declare function anonymisePlayer(playerId: string): Promise<void>;
//# sourceMappingURL=persistence.d.ts.map