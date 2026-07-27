// ── ფორმალური ლოგიკის აკადემია — კითხვების ბაზა ───────────────────────
// The bank is intentionally split by level: a session picks per level, and
// adding questions means appending to one file — nothing else has to change.
import type { LogicQuestion, LogicLevel, LogicCategory } from './types.js';
import { BEGINNER } from './beginner.js';
import { MEDIUM } from './medium.js';
import { HARD } from './hard.js';
import { EXPERT } from './expert.js';
import { MAFIA_NIGHT } from './mafiaNight.js';

export * from './types.js';

// Themed files can carry questions of any level; BY_LEVEL is derived rather
// than hand-maintained, so adding a new file means one import and nothing else.
export const ALL_QUESTIONS: LogicQuestion[] = [...BEGINNER, ...MEDIUM, ...HARD, ...EXPERT, ...MAFIA_NIGHT];

export const BY_LEVEL: Record<LogicLevel, LogicQuestion[]> = {
  beginner: ALL_QUESTIONS.filter(q => q.level === 'beginner'),
  medium: ALL_QUESTIONS.filter(q => q.level === 'medium'),
  hard: ALL_QUESTIONS.filter(q => q.level === 'hard'),
  expert: ALL_QUESTIONS.filter(q => q.level === 'expert'),
};

const BY_ID = new Map(ALL_QUESTIONS.map(q => [q.id, q]));
export function getQuestion(id: string): LogicQuestion | undefined { return BY_ID.get(id); }

export function countBy(level?: LogicLevel, cat?: LogicCategory): number {
  return ALL_QUESTIONS.filter(q => (!level || q.level === level) && (!cat || q.cat === cat)).length;
}

/**
 * Structural check, run once at import in development. A bank this size is
 * edited by hand, and a duplicate id or an out-of-range answer key would show
 * up as a mysteriously unanswerable question rather than a crash.
 */
export function validateBank(): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const q of ALL_QUESTIONS) {
    if (seen.has(q.id)) errors.push(`duplicate id: ${q.id}`);
    seen.add(q.id);
    if (q.options.length !== 4) errors.push(`${q.id}: ${q.options.length} options, expected 4`);
    if (q.answer < 0 || q.answer > 3) errors.push(`${q.id}: answer index ${q.answer} out of range`);
    if (new Set(q.options.map((o: string) => o.trim())).size !== 4) errors.push(`${q.id}: duplicate option text`);
    if (q.options.some((o: string) => !o.trim())) errors.push(`${q.id}: empty option`);
    if (!q.why?.trim()) errors.push(`${q.id}: missing explanation`);
    if (!q.rule?.trim()) errors.push(`${q.id}: missing rule name`);
    if (q.seconds < 10 || q.seconds > 300) errors.push(`${q.id}: implausible time ${q.seconds}s`);
    for (const k of Object.keys(q.trap ?? {})) {
      const i = Number(k);
      if (i === q.answer) errors.push(`${q.id}: trap note attached to the CORRECT option`);
      if (i < 0 || i > 3) errors.push(`${q.id}: trap index ${i} out of range`);
    }
  }
  return errors;
}
