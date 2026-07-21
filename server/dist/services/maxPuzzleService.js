/**
 * ბატონი მაქსის თავსატეხი — persistence + trait leaderboard.
 *
 * One row per user (latest completed run wins; `completions` counts reruns).
 * The dilemma content and scoring live client-side — this is a personality
 * profile, not a competitive score, so the server only clamps/validates the
 * submitted traits and whitelists the archetype id.
 */
import { sql } from '../db.js';
import { isModerator } from './iqService.js';
export const MP_TRAIT_COLUMNS = [
    'independence', 'rationality', 'conformity', 'ambition',
    'risk', 'status_desire', 'skepticism', 'moral_flex',
];
const ARCHETYPE_IDS = new Set([
    'independent_observer', 'rationalist', 'pragmatic_realist', 'idealist',
    'social_strategist', 'status_seeker', 'rebel', 'silent_observer',
    'opportunist', 'cynical_realist', 'philosopher', 'chaos_enjoyer', 'crowd_follower',
]);
export const MP_BOARD_SCOPES = ['independence', 'rationality', 'ambition', 'skepticism', 'risk', 'conformity'];
const SCOPE_COLUMN = {
    independence: 'independence',
    rationality: 'rationality',
    ambition: 'ambition',
    skepticism: 'skepticism',
    risk: 'risk',
    conformity: 'conformity',
};
const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
export async function saveResult(userId, p) {
    const archetype = ARCHETYPE_IDS.has(String(p?.archetype)) ? String(p.archetype) : 'independent_observer';
    const archetypeKa = String(p?.archetypeKa ?? '').slice(0, 80);
    const t = p?.traits ?? {};
    const now = Date.now();
    await sql `
    INSERT INTO max_puzzle_results (
      user_id, archetype, archetype_ka,
      independence, rationality, conformity, ambition,
      risk, status_desire, skepticism, moral_flex,
      completions, created_at, updated_at
    ) VALUES (
      ${userId}, ${archetype}, ${archetypeKa},
      ${clamp(t.independence)}, ${clamp(t.rationality)}, ${clamp(t.conformity)}, ${clamp(t.ambition)},
      ${clamp(t.risk)}, ${clamp(t.status)}, ${clamp(t.skepticism)}, ${clamp(t.moralFlex)},
      1, ${now}, ${now}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      archetype = EXCLUDED.archetype,
      archetype_ka = EXCLUDED.archetype_ka,
      independence = EXCLUDED.independence,
      rationality = EXCLUDED.rationality,
      conformity = EXCLUDED.conformity,
      ambition = EXCLUDED.ambition,
      risk = EXCLUDED.risk,
      status_desire = EXCLUDED.status_desire,
      skepticism = EXCLUDED.skepticism,
      moral_flex = EXCLUDED.moral_flex,
      completions = max_puzzle_results.completions + 1,
      updated_at = EXCLUDED.updated_at
  `;
}
function mapRow(r, rank, col) {
    return {
        rank,
        userId: r.user_id,
        username: r.username ?? '?',
        avatar: r.avatar ?? '',
        avatarUrl: r.avatar_url ?? null,
        archetype: r.archetype,
        archetypeKa: r.archetype_ka ?? '',
        score: Number(r[col] ?? 0),
        traits: {
            independence: Number(r.independence), rationality: Number(r.rationality),
            conformity: Number(r.conformity), ambition: Number(r.ambition),
            risk: Number(r.risk), status: Number(r.status_desire),
            skepticism: Number(r.skepticism), moralFlex: Number(r.moral_flex),
        },
        updatedAt: Number(r.updated_at),
    };
}
/**
 * Trait-scoped leaderboard. The table holds one row per user, so the whole set
 * is small — fetch + JS-sort keeps the trait column dynamic without unsafe SQL.
 */
export async function getBoard(scope, viewerId, limit = 100) {
    const col = SCOPE_COLUMN[scope] ?? 'independence';
    const raw = await sql `
    SELECT r.*, p.username, p.avatar, p.avatar_url
    FROM max_puzzle_results r JOIN players p ON p.id = r.user_id
  `;
    raw.sort((a, b) => Number(b[col] ?? 0) - Number(a[col] ?? 0) || Number(a.updated_at) - Number(b.updated_at));
    const rows = raw.slice(0, limit).map((r, i) => mapRow(r, i + 1, col));
    let myRow = viewerId ? rows.find(r => r.userId === viewerId) ?? null : null;
    if (!myRow && viewerId) {
        const idx = raw.findIndex(r => r.user_id === viewerId);
        if (idx >= 0)
            myRow = mapRow(raw[idx], idx + 1, col);
    }
    return { rows, myRow };
}
export async function getMine(userId) {
    const [r] = await sql `
    SELECT r.*, p.username, p.avatar, p.avatar_url
    FROM max_puzzle_results r JOIN players p ON p.id = r.user_id
    WHERE r.user_id = ${userId}
  `;
    return r ? mapRow(r, 0, 'independence') : null;
}
/** Moderator action: remove a user's result from the leaderboard. */
export async function modRemove(modId, targetUserId) {
    if (!(await isModerator(modId)))
        throw new Error('Not authorized');
    if (!targetUserId)
        throw new Error('No target');
    const rows = await sql `DELETE FROM max_puzzle_results WHERE user_id = ${targetUserId} RETURNING user_id`;
    return { removed: rows.length };
}
//# sourceMappingURL=maxPuzzleService.js.map