// ── ფორმალური ლოგიკის აკადემია — კითხვის მოდელი ───────────────────────
// Questions live ONLY on the server. A session sends the text with its options
// already shuffled and the key withheld, so the answer never reaches the client
// before it is submitted — that is the whole anti-cheat story.
// The authored hints were sized for solving, not for READING: 35 s does not
// cover taking in three premises and four full-sentence options, let alone
// thinking. The real clock is per level — two minutes as the floor, and more
// where the question genuinely needs working through on paper.
export const LEVEL_SECONDS = {
    beginner: 120,
    medium: 120,
    hard: 150,
    expert: 180,
};
export function timeFor(q) {
    return LEVEL_SECONDS[q.level] ?? 120;
}
export const LEVEL_LABEL = {
    beginner: 'დამწყები',
    medium: 'საშუალო',
    hard: 'რთული',
    expert: 'ექსპერტი',
};
export const LEVEL_COLOR = {
    beginner: '#3fb950', medium: '#4d9fff', hard: '#a371f7', expert: '#ff4d5e',
};
export const CAT_LABEL = {
    syllogism: 'სილოგიზმები',
    conditional: 'პირობითი მსჯელობა',
    contradiction: 'წინააღმდეგობა',
    necessity: 'აუცილებელი და საკმარისი',
    fallacy: 'ლოგიკური შეცდომები',
    pattern: 'კანონზომიერებები',
    mafia: 'მაფიის ლოგიკა',
};
/** Rating weight: a harder question moves the Logic Rating further. */
export const LEVEL_WEIGHT = {
    beginner: 1, medium: 1.35, hard: 1.8, expert: 2.4,
};
/** Nominal difficulty of each level on the rating scale (Elo-style). */
export const LEVEL_RATING = {
    beginner: 1100, medium: 1450, hard: 1800, expert: 2150,
};
//# sourceMappingURL=types.js.map