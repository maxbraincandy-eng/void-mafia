/**
 * The Legacy character — one identity across every game.
 *
 * Mirrors `server/src/services/legacyService.ts`. Kept as a hand-written mirror
 * rather than generated because it is small, it changes rarely, and a generator
 * would be more machinery than the thing it generates.
 */

export type AuraTier = 'bronze' | 'silver' | 'gold' | 'legendary';

export interface AuraMeta {
  tier: AuraTier;
  minLevel: number;
  /** Georgian, for the tooltip on the profile. */
  label: string;
  color: string;
}

/**
 * The visible reward for a level, and the reason the number means anything at a
 * glance across a lobby. Thresholds match the server's — the client draws the
 * aura it is told to draw, and this table is only for labelling and for the
 * "next tier at level N" line on the profile.
 */
export const AURA_TIERS: readonly AuraMeta[] = [
  { tier: 'bronze',    minLevel: 10, label: 'ბრინჯაო', color: '#cd7f32' },
  { tier: 'silver',    minLevel: 25, label: 'ვერცხლი', color: '#c0c8d8' },
  { tier: 'gold',      minLevel: 50, label: 'ოქრო',    color: '#ffcc33' },
  { tier: 'legendary', minLevel: 75, label: 'ლეგენდა', color: '#c084fc' },
];

export const AURA_BY_TIER: Record<AuraTier, AuraMeta> =
  Object.fromEntries(AURA_TIERS.map(a => [a.tier, a])) as Record<AuraTier, AuraMeta>;

/** The next tier a player has not reached, or null at the top. */
export function nextAura(level: number): AuraMeta | null {
  return AURA_TIERS.find(a => level < a.minLevel) ?? null;
}

export interface LegacySourceBreakdown {
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
  key: string;
  label: string;
  emoji: string;
  detail: string;
}

export interface LegacyAvatarConfig {
  /** Photo, when there is one. */
  base: string | null;
  /** The emoji or initial behind it, and the fallback when there is not. */
  baseEmoji: string;
  frame: string | null;
  aura: AuraTier | null;
  badge: string | null;
  nameColor: string | null;
  title: string | null;
}

export interface PlayerCharacter {
  userId: string;
  displayName: string;
  avatarConfig: LegacyAvatarConfig;
  totalXP: number;
  level: number;
  /** How far into the current level, and what the level costs end to end. */
  xpIntoLevel: number;
  xpForLevel: number;
  xpToNextLevel: number;
  atMaxLevel: boolean;
  perSource: LegacySourceBreakdown[];
  unlockedCosmetics: string[];
  achievements: { key: string; name: string; emoji: string; earnedAt: number }[];
  reputationTags: ReputationTag[];
}

export interface LegacyLeaderRow {
  userId: string;
  name: string;
  avatar: string;
  avatarUrl: string | null;
  level: number;
  xp: number;
  aura: AuraTier | null;
  topSource: string | null;
}

/** What the inline badge needs, for many players at once. */
export type LegacyBadgeMap = Record<string, { level: number; aura: AuraTier | null }>;
