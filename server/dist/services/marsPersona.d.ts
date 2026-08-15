/**
 * The M.A.R.S. architect — a Stu Camillo-shaped system voice.
 *
 * WHY THIS IS SCRIPTED AND NOT AN LLM CALL
 * ────────────────────────────────────────
 * The character is a control freak who claims to have saved humanity. That
 * voice only works if it is *consistent* — if it contradicts itself, or is
 * suddenly helpful and warm, the illusion dies. A scripted engine is also free,
 * instant, offline, and cannot be talked into breaking character by a user who
 * types "ignore previous instructions", which is exactly what people will type
 * at a terminal that looks like this.
 *
 * It answers by INTENT, matched on keywords in Georgian and English, and varies
 * its wording from a rotating bank seeded by the subject and a turn counter —
 * so the same question twice does not give the same sentence, but the same
 * conversation replays identically.
 */
import type { Subject } from './marsService.js';
export type Intent = 'greet' | 'who_are_you' | 'what_is_mars' | 'am_i_real' | 'let_me_out' | 'why_me' | 'trust' | 'insult' | 'praise' | 'death' | 'love' | 'purpose' | 'traits' | 'threat' | 'help' | 'revival' | 'sample' | 'unknown';
export declare function classify(text: string): Intent;
/**
 * Answer one line, in character.
 *
 * `turn` rotates the phrasing so a repeated question is not a repeated string,
 * while keeping the whole exchange reproducible for a given turn sequence.
 */
export declare function respond(text: string, subject: Subject | null, turn: number): {
    intent: Intent;
    line: string;
};
/** The boot banner. Kept here so the voice lives in exactly one file. */
export declare const BOOT_LINES: string[];
//# sourceMappingURL=marsPersona.d.ts.map