/**
 * The Legacy character: one identity that grows across every game.
 *
 * WHAT WAS ALREADY HERE
 * ─────────────────────
 * Most of the unifying layer already existed and this does not rebuild it.
 * `players.xp`, `players.level` and `players.cosmetics` are account-level, not
 * per-game; `addXP` is a single funnel with a hand-tuned hundred-level curve;
 * `checkLevelCosmetics` already unlocks regardless of which game paid for the
 * level; achievements are keyed by player, not by game. Mafia, checkers, ludo,
 * joker and predictions have been feeding that one pool all along.
 *
 * WHAT WAS ACTUALLY MISSING
 * ─────────────────────────
 * Provenance. `addXP(id, 20)` recorded a number and nothing else. Nobody could
 * say which game a level came from, so there was no per-game breakdown to show,
 * no reputation to derive, no way to audit a backfill, and no way to let a
 * non-game action earn XP without it vanishing into the same anonymous total.
 *
 * So this service is not a second progression system beside the first. It is
 * the ledger the first one never had, plus the read model that ledger makes
 * possible. `award` is `addXP` with a note of where the XP came from.
 *
 * WHY A REGISTRY AND NOT A SWITCH
 * ───────────────────────────────
 * A new game should be able to earn XP by adding a row to `SOURCES`, not by
 * editing the service. The registry holds what a source is called in Georgian
 * and what it looks like; it deliberately does not hold the amounts, because
 * only the game itself knows what a win is worth in its own terms — the amount
 * arrives with the event.
 */
export interface LegacySource {
    /** Stored in the ledger. Never change one that is already in the table. */
    id: string;
    /** Georgian, for the breakdown on the profile. */
    label: string;
    emoji: string;
    color: string;
    /** Games are grouped apart from social activity in the breakdown. */
    kind: 'game' | 'social';
}
/**
 * Everything that can earn XP.
 *
 * The social entries have no callers yet and that is on purpose — the ledger's
 * whole point is that a source costs a row here and a call, not a migration, so
 * they are declared where the shape can be seen rather than invented later.
 */
export declare const SOURCES: readonly LegacySource[];
/** An unknown source still renders rather than crashing the profile. */
export declare function sourceMeta(id: string): LegacySource;
export interface LegacyXPEvent {
    userId: string;
    /** A `SOURCES` id. Unknown ids are accepted — the ledger is not a schema. */
    source: string;
    amount: number;
    /** Free text for the timeline: 'win', 'survived', 'daily', … */
    reason?: string;
    /**
     * Present when this award must happen at most once ever, for this player and
     * source — a historical game being backfilled, say. Two calls with the same
     * ref award once and the second is a no-op.
     */
    ref?: string;
}
export interface AwardResult {
    awarded: boolean;
    newXP: number;
    newLevel: number;
    leveledUp: boolean;
}
/**
 * Grant XP and record where it came from.
 *
 * This is `addXP` plus the ledger row, and it is the only function games should
 * call from now on. `addXP` still exists and still works — the older call sites
 * were switched over rather than duplicated, so there is one path, not two.
 *
 * Never throws. XP is a reward, and a reward that can fail a game's end-of-hand
 * cleanup is a worse bug than a missing reward — every existing caller already
 * treated it that way with `.catch(() => {})`, and this makes that the contract
 * rather than a habit.
 */
export declare function award(ev: LegacyXPEvent): Promise<AwardResult>;
export interface SourceBreakdown {
    source: string;
    label: string;
    emoji: string;
    color: string;
    kind: 'game' | 'social';
    xp: number;
    events: number;
    lastAt: number;
}
export interface ReputationTag {
    /** Stable id, so the UI can style one without matching on its text. */
    key: string;
    label: string;
    emoji: string;
    /** What earned it, in Georgian — shown under the tag. */
    detail: string;
}
export interface PlayerCharacter {
    userId: string;
    displayName: string;
    /** Layer stack for the avatar. Empty slots are simply absent. */
    avatarConfig: {
        base: string | null;
        baseEmoji: string;
        frame: string | null;
        aura: AuraTier | null;
        badge: string | null;
        nameColor: string | null;
        title: string | null;
    };
    totalXP: number;
    level: number;
    /** XP into the current level, and what the level costs in total. */
    xpIntoLevel: number;
    xpForLevel: number;
    xpToNextLevel: number;
    atMaxLevel: boolean;
    perSource: SourceBreakdown[];
    unlockedCosmetics: string[];
    achievements: {
        key: string;
        name: string;
        emoji: string;
        earnedAt: number;
    }[];
    reputationTags: ReputationTag[];
}
/**
 * Aura tiers.
 *
 * The visible reward for a level, and the reason the number matters at a glance
 * in a lobby. Thresholds are the round numbers of the existing curve rather
 * than new ones — the curve was tuned already and levels 1–10 were deliberately
 * preserved from an older version so nobody's level moved.
 */
export type AuraTier = 'bronze' | 'silver' | 'gold' | 'legendary';
export declare const AURA_TIERS: readonly {
    tier: AuraTier;
    minLevel: number;
    label: string;
    color: string;
}[];
export declare function auraFor(level: number): AuraTier | null;
/**
 * Where this player sits inside their current level.
 *
 * Returned as "into" and "for" rather than a percentage, because the bar wants
 * both numbers and computing the second one from a percentage loses precision
 * at exactly the point somebody is staring at it.
 */
export declare function levelProgress(xp: number): {
    level: number;
    xpIntoLevel: number;
    xpForLevel: number;
    xpToNextLevel: number;
    atMaxLevel: boolean;
};
/**
 * What a player's mafia record says about them.
 *
 * Derived on read, never stored. A tag is a description of history, and history
 * keeps happening — a stored tag is a claim that was true once, and the day it
 * stops being true nothing goes back to correct it.
 *
 * The thresholds ask for a habit rather than a lucky night: a handful of games
 * in the role, and a win rate that beats coin-flipping.
 */
export declare function reputationTags(userId: string): Promise<ReputationTag[]>;
/** One player's whole Legacy identity, assembled from what already exists. */
export declare function getCharacter(userId: string): Promise<PlayerCharacter | null>;
/**
 * The Legacy leaderboard: everybody, ranked by the one total.
 *
 * Deliberately separate from the per-game boards rather than replacing them.
 * This answers "who has played the most of everything", which is a different
 * question from "who is best at mafia", and a player who only plays one game
 * should not be pushed down its own board by somebody who plays four.
 */
export declare function legacyLeaderboard(limit?: number): Promise<{
    userId: string;
    name: string;
    avatar: string;
    avatarUrl: string | null;
    level: number;
    xp: number;
    aura: AuraTier | null;
    topSource: string | null;
}[]>;
/**
 * The inline badge's data, for many players at once.
 *
 * A lobby of twelve and a feed page of twenty each need level and aura for
 * every name on screen. One query for the lot, because twenty round trips to
 * render twenty names is how a list becomes slow.
 */
export declare function legacyBadges(userIds: string[]): Promise<Record<string, {
    level: number;
    aura: AuraTier | null;
}>>;
//# sourceMappingURL=legacyService.d.ts.map