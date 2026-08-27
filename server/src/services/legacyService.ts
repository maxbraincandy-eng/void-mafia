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

import { sql } from '../db.js';
import { addXP, LEVEL_THRESHOLDS, MAX_LEVEL, getLevel } from './playerService.js';

// ── The registry ──────────────────────────────────────────────────────────────

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
export const SOURCES: readonly LegacySource[] = [
  { id: 'mafia',     label: 'მაფია',        emoji: '🎩', color: '#ff4d5e', kind: 'game' },
  { id: 'checkers',  label: 'შაშ-მათი',     emoji: '♟', color: '#5ee6c0', kind: 'game' },
  { id: 'ludo',      label: 'ლუდო',         emoji: '🎲', color: '#ffcc33', kind: 'game' },
  { id: 'joker',     label: 'ჯოკერი',       emoji: '🃏', color: '#c084fc', kind: 'game' },
  { id: 'poker',     label: 'პოკერი',       emoji: '🂡', color: '#4fb8ff', kind: 'game' },
  { id: 'space',     label: 'კოსმოსი',      emoji: '🚀', color: '#7c5cff', kind: 'game' },
  { id: 'logic',     label: 'ლოგიკა',       emoji: '🧠', color: '#39d98a', kind: 'game' },
  { id: 'predict',   label: 'პროგნოზი',     emoji: '🔮', color: '#e0803c', kind: 'game' },
  { id: 'post',      label: 'პოსტები',      emoji: '📝', color: '#9b8cff', kind: 'social' },
  { id: 'live',      label: 'ეთერი',        emoji: '📡', color: '#ff6b6b', kind: 'social' },
  { id: 'referral',  label: 'მოწვეული',     emoji: '🤝', color: '#5cbe6a', kind: 'social' },
  { id: 'backfill',  label: 'ისტორია',      emoji: '🕰', color: '#8b8b9e', kind: 'social' },
];

const SOURCE_BY_ID = new Map(SOURCES.map(s => [s.id, s]));

/** An unknown source still renders rather than crashing the profile. */
export function sourceMeta(id: string): LegacySource {
  return SOURCE_BY_ID.get(id) ?? { id, label: id, emoji: '•', color: '#8b8b9e', kind: 'game' };
}

// ── Earning ───────────────────────────────────────────────────────────────────

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
export async function award(ev: LegacyXPEvent): Promise<AwardResult> {
  const nil: AwardResult = { awarded: false, newXP: 0, newLevel: 1, leveledUp: false };
  const amount = Math.round(Number(ev.amount) || 0);
  if (!ev.userId || !ev.source || amount === 0) return nil;

  try {
    /*
     * The player has to exist before anything is written.
     *
     * `addXP` answers a missing row with zeros instead of throwing, so without
     * this the ledger collected rows for accounts that were never there — and
     * the breakdown would then show XP that is not in `players.xp`, which is
     * the one invariant this whole design rests on.
     *
     * It also has to come before the grant is claimed. Claiming first burns the
     * ref on a player who got nothing, and a later legitimate retry is refused
     * for a grant that never happened.
     */
    const [exists] = await sql`SELECT 1 FROM players WHERE id = ${ev.userId}` as any[];
    if (!exists) return nil;

    if (ev.ref) {
      // Claim the grant first. On a duplicate the insert affects nothing and
      // the XP is not given — which is what makes a backfill safe to re-run.
      const claimed = await sql`
        INSERT INTO legacy_xp_grants (user_id, source, ref, granted_at)
        VALUES (${ev.userId}, ${ev.source}, ${ev.ref}, ${Date.now()})
        ON CONFLICT DO NOTHING
        RETURNING ref
      ` as any[];
      if (claimed.length === 0) return nil;
    }

    const res = await addXP(ev.userId, amount);
    await sql`
      INSERT INTO legacy_xp_events (user_id, source, amount, reason, created_at)
      VALUES (${ev.userId}, ${ev.source}, ${amount}, ${String(ev.reason ?? '').slice(0, 60)}, ${Date.now()})
    `;
    return { awarded: true, ...res };
  } catch {
    return nil;
  }
}

// ── The read model ────────────────────────────────────────────────────────────

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
    base: string | null;        // photo url, or the emoji/initial fallback
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
  achievements: { key: string; name: string; emoji: string; earnedAt: number }[];
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

export const AURA_TIERS: readonly { tier: AuraTier; minLevel: number; label: string; color: string }[] = [
  { tier: 'bronze',    minLevel: 10, label: 'ბრინჯაო',   color: '#cd7f32' },
  { tier: 'silver',    minLevel: 25, label: 'ვერცხლი',   color: '#c0c8d8' },
  { tier: 'gold',      minLevel: 50, label: 'ოქრო',      color: '#ffcc33' },
  { tier: 'legendary', minLevel: 75, label: 'ლეგენდა',   color: '#c084fc' },
];

export function auraFor(level: number): AuraTier | null {
  let out: AuraTier | null = null;
  for (const t of AURA_TIERS) if (level >= t.minLevel) out = t.tier;
  return out;
}

/**
 * Where this player sits inside their current level.
 *
 * Returned as "into" and "for" rather than a percentage, because the bar wants
 * both numbers and computing the second one from a percentage loses precision
 * at exactly the point somebody is staring at it.
 */
export function levelProgress(xp: number): { level: number; xpIntoLevel: number; xpForLevel: number; xpToNextLevel: number; atMaxLevel: boolean } {
  const level = getLevel(xp);
  const atMaxLevel = level >= MAX_LEVEL;
  const floor = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const ceil = atMaxLevel ? floor : (LEVEL_THRESHOLDS[level] ?? floor);
  return {
    level,
    xpIntoLevel: Math.max(0, xp - floor),
    xpForLevel: Math.max(1, ceil - floor),
    xpToNextLevel: atMaxLevel ? 0 : Math.max(0, ceil - xp),
    atMaxLevel,
  };
}

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
export async function reputationTags(userId: string): Promise<ReputationTag[]> {
  const rows = await sql`
    SELECT role, COUNT(*)::int AS played, SUM(won)::int AS won
    FROM game_players
    WHERE player_id = ${userId} AND role IS NOT NULL
    GROUP BY role
  ` as { role: string; played: number; won: number }[];

  const by = new Map(rows.map(r => [r.role, r]));
  const out: ReputationTag[] = [];
  const rate = (r?: { played: number; won: number }) => (r && r.played > 0 ? r.won / r.played : 0);

  const sheriff = by.get('sheriff');
  if (sheriff && sheriff.played >= 5 && rate(sheriff) >= 0.6) {
    out.push({ key: 'trusted_detective', label: 'სანდო შერიფი', emoji: '🔎',
      detail: `${sheriff.won}/${sheriff.played} გამარჯვება შერიფად` });
  }

  const don = by.get('don');
  if (don && don.played >= 5 && rate(don) >= 0.6) {
    out.push({ key: 'silver_tongue', label: 'ოქროპირი', emoji: '🎩',
      detail: `${don.won}/${don.played} გამარჯვება დონად` });
  }

  const maniac = by.get('maniac');
  if (maniac && maniac.played >= 3 && rate(maniac) >= 0.5) {
    out.push({ key: 'lone_wolf', label: 'მარტოხელა', emoji: '🔪',
      detail: `${maniac.won}/${maniac.played} გამარჯვება მანიაკად` });
  }

  const totalPlayed = rows.reduce((n, r) => n + r.played, 0);
  const survived = await sql`
    SELECT COUNT(*)::int AS n FROM game_players WHERE player_id = ${userId} AND survived = 1
  ` as { n: number }[];
  const alive = survived[0]?.n ?? 0;
  if (totalPlayed >= 20 && alive / totalPlayed >= 0.6) {
    out.push({ key: 'survivor', label: 'გადარჩენილი', emoji: '🕯',
      detail: `${alive}/${totalPlayed} თამაშში ბოლომდე მიაღწია` });
  }

  return out;
}

/** One player's whole Legacy identity, assembled from what already exists. */
export async function getCharacter(userId: string): Promise<PlayerCharacter | null> {
  const [p] = await sql`
    SELECT id, username, avatar, avatar_url, xp, level, cosmetics
    FROM players WHERE id = ${userId}
  ` as any[];
  if (!p) return null;

  const xp = Number(p.xp ?? 0);
  const prog = levelProgress(xp);

  const breakdown = await sql`
    SELECT source, SUM(amount)::int AS xp, COUNT(*)::int AS events, MAX(created_at)::bigint AS last_at
    FROM legacy_xp_events
    WHERE user_id = ${userId}
    GROUP BY source
    ORDER BY SUM(amount) DESC
  ` as any[];

  const achievements = await sql`
    SELECT a.key, a.name, a.icon, pa.earned_at
    FROM player_achievements pa
    JOIN achievements a ON a.key = pa.achievement_key
    WHERE pa.player_id = ${userId}
    ORDER BY pa.earned_at DESC
  ` as any[];

  let cos: any = {};
  try { cos = JSON.parse(p.cosmetics ?? '{}'); } catch { cos = {}; }

  return {
    userId: p.id,
    displayName: p.username ?? '',
    avatarConfig: {
      base: p.avatar_url ?? null,
      baseEmoji: p.avatar ?? '',
      frame: cos.equippedFrame ?? null,
      aura: auraFor(prog.level),
      badge: cos.equippedBorder ?? null,
      nameColor: cos.equippedNameColor ?? null,
      title: cos.equippedTitle ?? null,
    },
    totalXP: xp,
    ...prog,
    perSource: breakdown.map((r: any): SourceBreakdown => {
      const m = sourceMeta(r.source);
      return {
        source: r.source, label: m.label, emoji: m.emoji, color: m.color, kind: m.kind,
        xp: Number(r.xp ?? 0), events: Number(r.events ?? 0), lastAt: Number(r.last_at ?? 0),
      };
    }),
    unlockedCosmetics: Array.isArray(cos.unlockedItems) ? cos.unlockedItems : [],
    achievements: achievements.map((a: any) => ({
      key: a.key, name: a.name, emoji: a.icon ?? '🏆', earnedAt: Number(a.earned_at),
    })),
    reputationTags: await reputationTags(userId),
  };
}

/**
 * The Legacy leaderboard: everybody, ranked by the one total.
 *
 * Deliberately separate from the per-game boards rather than replacing them.
 * This answers "who has played the most of everything", which is a different
 * question from "who is best at mafia", and a player who only plays one game
 * should not be pushed down its own board by somebody who plays four.
 */
export async function legacyLeaderboard(limit = 50): Promise<{
  userId: string; name: string; avatar: string; avatarUrl: string | null;
  level: number; xp: number; aura: AuraTier | null; topSource: string | null;
}[]> {
  const rows = await sql`
    SELECT p.id, p.username, p.avatar, p.avatar_url, p.xp, p.level,
           (SELECT e.source FROM legacy_xp_events e
             WHERE e.user_id = p.id
             GROUP BY e.source ORDER BY SUM(e.amount) DESC LIMIT 1) AS top_source
    FROM players p
    WHERE p.xp > 0
    ORDER BY p.xp DESC
    LIMIT ${Math.min(200, Math.max(1, limit))}
  ` as any[];
  return rows.map((r: any) => ({
    userId: r.id,
    name: r.username ?? '',
    avatar: r.avatar ?? '',
    avatarUrl: r.avatar_url ?? null,
    level: Number(r.level ?? 1),
    xp: Number(r.xp ?? 0),
    aura: auraFor(Number(r.level ?? 1)),
    topSource: r.top_source ?? null,
  }));
}

/**
 * The inline badge's data, for many players at once.
 *
 * A lobby of twelve and a feed page of twenty each need level and aura for
 * every name on screen. One query for the lot, because twenty round trips to
 * render twenty names is how a list becomes slow.
 */
export async function legacyBadges(userIds: string[]): Promise<Record<string, { level: number; aura: AuraTier | null }>> {
  const ids = [...new Set(userIds.filter(Boolean))].slice(0, 200);
  if (ids.length === 0) return {};
  const rows = await sql`SELECT id, level FROM players WHERE id = ANY(${ids})` as any[];
  const out: Record<string, { level: number; aura: AuraTier | null }> = {};
  for (const r of rows) {
    const level = Number(r.level ?? 1);
    out[String(r.id)] = { level, aura: auraFor(level) };
  }
  return out;
}
