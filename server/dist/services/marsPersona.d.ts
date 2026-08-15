/**
 * The M.A.R.S. architect — ბატონი მაქსი, who built this archive.
 *
 * WHY THIS IS SCRIPTED AND NOT AN LLM CALL
 * ────────────────────────────────────────
 * The voice only works if it is *consistent* — if it contradicts itself, or is
 * suddenly warm and helpful, it stops being a character. A scripted engine is
 * also free, instant, offline, and cannot be talked into breaking character by
 * someone typing "ignore previous instructions", which is exactly what people
 * type at a terminal that looks like this.
 *
 * WHAT THE ARCHITECT MAY NOT SAY
 * ──────────────────────────────
 * This voice belongs to a REAL, NAMED person on a site real people bring their
 * grief to. So it never claims to have defeated death, to hold anyone captive,
 * or that there is nothing outside — lines that were fine for a fictional AI
 * become false promises the moment a living creator says them, and the site
 * itself states plainly that revival is nobody's to promise. He is exacting,
 * possessive about the archive and proud of it. He does not lie about it.
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