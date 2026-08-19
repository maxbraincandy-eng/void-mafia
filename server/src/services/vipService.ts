import { getVerifiedMap } from './playerService.js';
import { sql } from '../db.js';

/**
 * What a verification badge actually buys.
 *
 * Every VIP privilege in the app is one row in the table below. That is the
 * whole point of this file: the alternative is `if (vip) 6000 else 2000`
 * sprinkled through a dozen call sites, and then nobody — including the person
 * selling the subscription — can answer "what do I get for my money?" without
 * grepping. Here the answer is a table you can read in one screen, and the
 * sales page renders from the same table it is enforced from, so the two can
 * never drift apart.
 *
 * EVERY ROW IS ADDITIVE.
 * ──────────────────────
 * The free column is what free users have TODAY, unchanged. Nothing here was
 * invented as a restriction so that lifting it could be sold — that is the one
 * way to make a subscription feel like a hostage negotiation, and it costs more
 * goodwill than the badge earns. Three perks that looked good on paper were
 * dropped for exactly this reason: a post-edit window (no window exists now, so
 * a 15-minute free tier would be a downgrade), a clan member cap (no cap exists
 * now), and multi-image posts (the schema stores one image, so "4 images for
 * VIP" would have been a promise the database cannot keep).
 *
 * Owners get everything a VIP gets. They are not customers, but there is no
 * sense in a badge that grants less than the one below it.
 */

export type Tier = 'free' | 'vip' | 'owner';

export interface Limits {
  /** Characters in a community post. */
  postChars: number;
  /** Characters in a comment. */
  commentChars: number;
  /** Characters in the community bio. */
  bioChars: number;
  /** Seconds of voice the recorder will let you capture. */
  voiceSeconds: number;
  /** Bytes accepted for one voice message — the transport cap behind it. */
  voiceBytes: number;
  /** Extra seconds on your own speech turn in hosted mafia. */
  speechBonusSeconds: number;
  /** Enters the next-round queue ahead of everyone without it. */
  queuePriority: boolean;
  /** May see who has looked at their profile. */
  profileVisitors: boolean;
  /** May use the voice profiles marked vip in the changer. */
  vipVoices: boolean;
  /** Name renders with the animated gradient. */
  animatedName: boolean;
}

const FREE: Limits = {
  postChars: 2000,
  commentChars: 500,
  bioChars: 500,
  voiceSeconds: 60,
  voiceBytes: 7_000_000,
  speechBonusSeconds: 0,
  queuePriority: false,
  profileVisitors: false,
  vipVoices: false,
  animatedName: false,
};

const VIP: Limits = {
  postChars: 6000,
  commentChars: 2000,
  bioChars: 1500,
  voiceSeconds: 180,
  // Three times the seconds needs three times the bytes, or the recorder would
  // happily capture 180s and the transport would reject it on send.
  voiceBytes: 21_000_000,
  speechBonusSeconds: 15,
  queuePriority: true,
  profileVisitors: true,
  vipVoices: true,
  animatedName: true,
};

export const LIMITS: Record<Tier, Limits> = { free: FREE, vip: VIP, owner: VIP };

// ── Who is on which tier ─────────────────────────────────────────────────────

/**
 * A synchronous snapshot of the badge table.
 *
 * The mafia phase machine is in-memory and synchronous by design — it decides a
 * speaker's deadline inside a timer callback, where there is nowhere to await.
 * Rather than make that engine async for one perk, the tier map is mirrored
 * here and refreshed on a timer. It is at most `REFRESH_MS` stale, which for
 * "did this person's badge arrive in the last minute" is not a distinction the
 * game needs to make.
 */
let snapshot: Record<string, Tier> = {};
const REFRESH_MS = 60_000;

function absorb(map: Record<string, string>): Record<string, Tier> {
  const out: Record<string, Tier> = {};
  for (const [id, t] of Object.entries(map)) {
    out[id] = t === 'owner' ? 'owner' : t === 'vip' ? 'vip' : 'free';
  }
  snapshot = out;
  return out;
}

/** Refresh the synchronous snapshot. Called at boot and on a timer. */
export async function refreshVipSnapshot(): Promise<void> {
  try { absorb(await getVerifiedMap() as Record<string, string>); }
  catch (e: any) { console.warn('[vip] snapshot refresh failed:', e?.message); }
}

export function startVipSnapshotRefresh(): void {
  void refreshVipSnapshot();
  const t = setInterval(() => void refreshVipSnapshot(), REFRESH_MS);
  t.unref?.();
}

/** The tier a profile is on right now. */
export async function tierOf(profileId: string | null | undefined): Promise<Tier> {
  if (!profileId) return 'free';
  return absorb(await getVerifiedMap() as Record<string, string>)[profileId] ?? 'free';
}

/** Limits for a profile, without the caller having to know about tiers. */
export async function limitsFor(profileId: string | null | undefined): Promise<Limits> {
  return LIMITS[await tierOf(profileId)];
}

export async function isVip(profileId: string | null | undefined): Promise<boolean> {
  return (await tierOf(profileId)) !== 'free';
}

/** Same question for many profiles at once, for feed-shaped work. */
export async function tiersOf(profileIds: string[]): Promise<Record<string, Tier>> {
  const map = absorb(await getVerifiedMap() as Record<string, string>);
  const out: Record<string, Tier> = {};
  for (const id of profileIds) out[id] = map[id] ?? 'free';
  return out;
}

/** The snapshot answer, for code that cannot await. See `snapshot` above. */
export function tierOfSync(profileId: string | null | undefined): Tier {
  return (profileId && snapshot[profileId]) || 'free';
}

export function isVipSync(profileId: string | null | undefined): boolean {
  return tierOfSync(profileId) !== 'free';
}

export function limitsForSync(profileId: string | null | undefined): Limits {
  return LIMITS[tierOfSync(profileId)];
}

// ── The sales page ───────────────────────────────────────────────────────────

/**
 * The pitch, generated from the same table that is enforced.
 *
 * A perk written here that is not in `Limits` cannot be sold, and a limit that
 * changes shows up in the pitch on the next deploy without anybody remembering
 * to update a marketing string.
 */
export interface Perk { icon: string; title: string; free: string; vip: string }

export function perkList(): Perk[] {
  return [
    { icon: '✨', title: 'ანიმირებული სახელი',
      free: 'ჩვეულებრივი', vip: 'ბზინავს ყველგან' },
    { icon: '👁', title: 'ვინ დაათვალიერა პროფილი',
      free: '—', vip: 'სრული სია' },
    { icon: '🎙', title: 'ხმოვანი შეტყობინება',
      free: `${FREE.voiceSeconds} წამი`, vip: `${VIP.voiceSeconds} წამი` },
    { icon: '🎭', title: 'ხმის შეცვლის პროფილები',
      free: 'ძირითადი', vip: '+ VIP ხმები' },
    { icon: '📝', title: 'პოსტის სიგრძე',
      free: `${FREE.postChars} სიმბოლო`, vip: `${VIP.postChars} სიმბოლო` },
    { icon: '💬', title: 'კომენტარი',
      free: `${FREE.commentChars} სიმბოლო`, vip: `${VIP.commentChars} სიმბოლო` },
    { icon: '📄', title: 'ბიოგრაფია',
      free: `${FREE.bioChars} სიმბოლო`, vip: `${VIP.bioChars} სიმბოლო` },
    { icon: '🗣', title: 'საუბრის დრო მაფიაში',
      free: 'სტანდარტული', vip: `+${VIP.speechBonusSeconds} წამი` },
    { icon: '⚡', title: 'რიგი შემდეგ რაუნდში',
      free: 'ჩვეულებრივი', vip: 'პრიორიტეტული' },
    { icon: '💠', title: 'ვერიფიკაციის ნიშანი',
      free: '—', vip: 'პროფილზე და ჩატში' },
  ];
}

// ── Profile visitors ─────────────────────────────────────────────────────────

/**
 * Record that someone looked at a profile.
 *
 * Recorded for everyone, shown only to VIPs. That is deliberate: a list that
 * only starts filling the day you subscribe is worth nothing on day one, and
 * the perk has to be worth something the moment it is bought.
 *
 * Looking at your own profile does not count, and neither does looking again
 * within the hour — otherwise `views` becomes a log of one person refreshing.
 */
export async function recordProfileVisit(profileId: string, viewerId: string): Promise<void> {
  if (!profileId || !viewerId || profileId === viewerId) return;
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  await sql`
    INSERT INTO profile_visits (profile_id, viewer_id, last_at, views)
    VALUES (${profileId}, ${viewerId}, ${now}, 1)
    ON CONFLICT (profile_id, viewer_id) DO UPDATE
      SET last_at = ${now},
          views = profile_visits.views + CASE WHEN profile_visits.last_at < ${hourAgo} THEN 1 ELSE 0 END
  `;
}

export interface Visitor {
  id: string; username: string; avatarUrl: string | null; avatar: string | null;
  lastAt: number; views: number; tier: Tier;
}

/** Who has looked at this profile, most recent first. VIP only. */
export async function getProfileVisitors(profileId: string, limit = 50): Promise<Visitor[]> {
  const rows = await sql`
    SELECT v.viewer_id, v.last_at, v.views, p.username, p.avatar, p.avatar_url
    FROM profile_visits v
    JOIN players p ON p.id = v.viewer_id
    WHERE v.profile_id = ${profileId}
    ORDER BY v.last_at DESC
    LIMIT ${Math.min(200, Math.max(1, limit))}
  ` as any[];
  const tiers = await tiersOf(rows.map(r => String(r.viewer_id)));
  return rows.map(r => ({
    id: String(r.viewer_id),
    username: r.username,
    avatarUrl: r.avatar_url ?? null,
    avatar: r.avatar ?? null,
    lastAt: Number(r.last_at),
    views: Number(r.views),
    tier: tiers[String(r.viewer_id)] ?? 'free',
  }));
}

/** How many distinct people looked, and how many in the last week. */
export async function getVisitorCounts(profileId: string): Promise<{ total: number; week: number }> {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const [row] = await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE last_at > ${weekAgo})::int AS week
    FROM profile_visits WHERE profile_id = ${profileId}
  ` as any[];
  return { total: Number(row?.total ?? 0), week: Number(row?.week ?? 0) };
}
