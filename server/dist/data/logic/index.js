import { BEGINNER } from './beginner.js';
import { MEDIUM } from './medium.js';
import { HARD } from './hard.js';
import { EXPERT } from './expert.js';
export * from './types.js';
export const BY_LEVEL = {
    beginner: BEGINNER,
    medium: MEDIUM,
    hard: HARD,
    expert: EXPERT,
};
export const ALL_QUESTIONS = [...BEGINNER, ...MEDIUM, ...HARD, ...EXPERT];
const BY_ID = new Map(ALL_QUESTIONS.map(q => [q.id, q]));
export function getQuestion(id) { return BY_ID.get(id); }
export function countBy(level, cat) {
    return ALL_QUESTIONS.filter(q => (!level || q.level === level) && (!cat || q.cat === cat)).length;
}
/**
 * Structural check, run once at import in development. A bank this size is
 * edited by hand, and a duplicate id or an out-of-range answer key would show
 * up as a mysteriously unanswerable question rather than a crash.
 */
export function validateBank() {
    const errors = [];
    const seen = new Set();
    for (const q of ALL_QUESTIONS) {
        if (seen.has(q.id))
            errors.push(`duplicate id: ${q.id}`);
        seen.add(q.id);
        if (q.options.length !== 4)
            errors.push(`${q.id}: ${q.options.length} options, expected 4`);
        if (q.answer < 0 || q.answer > 3)
            errors.push(`${q.id}: answer index ${q.answer} out of range`);
        if (new Set(q.options.map((o) => o.trim())).size !== 4)
            errors.push(`${q.id}: duplicate option text`);
        if (q.options.some((o) => !o.trim()))
            errors.push(`${q.id}: empty option`);
        if (!q.why?.trim())
            errors.push(`${q.id}: missing explanation`);
        if (!q.rule?.trim())
            errors.push(`${q.id}: missing rule name`);
        if (q.seconds < 10 || q.seconds > 300)
            errors.push(`${q.id}: implausible time ${q.seconds}s`);
        for (const k of Object.keys(q.trap ?? {})) {
            const i = Number(k);
            if (i === q.answer)
                errors.push(`${q.id}: trap note attached to the CORRECT option`);
            if (i < 0 || i > 3)
                errors.push(`${q.id}: trap index ${i} out of range`);
        }
    }
    return errors;
}
//# sourceMappingURL=index.js.map