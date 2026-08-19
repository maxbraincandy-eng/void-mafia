import { getVerifiedMap } from './playerService.js';
import { sql } from '../db.js';
const FREE = {
    postChars: 2000,
    commentChars: 500,
    bioChars: 500,
    voiceSeconds: 60,
    voiceBytes: 7000000,
    speechBonusSeconds: 0,
    queuePriority: false,
    profileVisitors: false,
    vipVoices: false,
    animatedName: false,
    incognito: false,
    liveDisguise: false,
};
const VIP = {
    postChars: 6000,
    commentChars: 2000,
    bioChars: 1500,
    voiceSeconds: 180,
    // Three times the seconds needs three times the bytes, or the recorder would
    // happily capture 180s and the transport would reject it on send.
    voiceBytes: 21000000,
    speechBonusSeconds: 15,
    queuePriority: true,
    profileVisitors: true,
    vipVoices: true,
    animatedName: true,
    incognito: true,
    liveDisguise: true,
};
export const LIMITS = { free: FREE, vip: VIP, owner: VIP };
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
let snapshot = {};
const REFRESH_MS = 60000;
function absorb(map) {
    const out = {};
    for (const [id, t] of Object.entries(map)) {
        out[id] = t === 'owner' ? 'owner' : t === 'vip' ? 'vip' : 'free';
    }
    snapshot = out;
    return out;
}
/** Refresh the synchronous snapshot. Called at boot and on a timer. */
export async function refreshVipSnapshot() {
    try {
        absorb(await getVerifiedMap());
    }
    catch (e) {
        console.warn('[vip] snapshot refresh failed:', e?.message);
    }
}
export function startVipSnapshotRefresh() {
    void refreshVipSnapshot();
    const t = setInterval(() => void refreshVipSnapshot(), REFRESH_MS);
    t.unref?.();
}
/** The tier a profile is on right now. */
export async function tierOf(profileId) {
    if (!profileId)
        return 'free';
    return absorb(await getVerifiedMap())[profileId] ?? 'free';
}
/** Limits for a profile, without the caller having to know about tiers. */
export async function limitsFor(profileId) {
    return LIMITS[await tierOf(profileId)];
}
export async function isVip(profileId) {
    return (await tierOf(profileId)) !== 'free';
}
/** Same question for many profiles at once, for feed-shaped work. */
export async function tiersOf(profileIds) {
    const map = absorb(await getVerifiedMap());
    const out = {};
    for (const id of profileIds)
        out[id] = map[id] ?? 'free';
    return out;
}
/** The snapshot answer, for code that cannot await. See `snapshot` above. */
export function tierOfSync(profileId) {
    return (profileId && snapshot[profileId]) || 'free';
}
export function isVipSync(profileId) {
    return tierOfSync(profileId) !== 'free';
}
export function limitsForSync(profileId) {
    return LIMITS[tierOfSync(profileId)];
}
export function perkList() {
    return [
        { icon: '✨', title: 'ანიმირებული სახელი',
            free: 'ჩვეულებრივი', vip: 'ბზინავს ყველგან' },
        { icon: '👁', title: 'პროფილის ნახვები',
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
        { icon: '🕶', title: 'ინკოგნიტო მაფიაში',
            free: '—', vip: 'სახელი იმალება' },
        { icon: '🎤', title: 'ხმის შენიღბვა თამაშში',
            free: '—', vip: 'სხვისი ხმით' },
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
export async function recordProfileVisit(profileId, viewerId) {
    if (!profileId || !viewerId || profileId === viewerId)
        return;
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    await sql `
    INSERT INTO profile_visits (profile_id, viewer_id, last_at, views)
    VALUES (${profileId}, ${viewerId}, ${now}, 1)
    ON CONFLICT (profile_id, viewer_id) DO UPDATE
      SET last_at = ${now},
          views = profile_visits.views + CASE WHEN profile_visits.last_at < ${hourAgo} THEN 1 ELSE 0 END
  `;
}
/** Who has looked at this profile, most recent first. VIP only. */
export async function getProfileVisitors(profileId, limit = 50) {
    const rows = await sql `
    SELECT v.viewer_id, v.last_at, v.views, p.username, p.avatar, p.avatar_url
    FROM profile_visits v
    JOIN players p ON p.id = v.viewer_id
    WHERE v.profile_id = ${profileId}
    ORDER BY v.last_at DESC
    LIMIT ${Math.min(200, Math.max(1, limit))}
  `;
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
export async function getVisitorCounts(profileId) {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const [row] = await sql `
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE last_at > ${weekAgo})::int AS week
    FROM profile_visits WHERE profile_id = ${profileId}
  `;
    return { total: Number(row?.total ?? 0), week: Number(row?.week ?? 0) };
}
//# sourceMappingURL=vipService.js.map