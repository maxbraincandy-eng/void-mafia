/**
 * Export a record as a single self-contained file.
 *
 * WHY HTML AND NOT JSON
 * ─────────────────────
 * The promise of this archive is permanence, and an export that only a
 * programmer can open is not a backup a family can keep. A single .html file
 * with every image inlined as a data URI opens in any browser, on any machine,
 * with no server and no internet, in twenty years. A grandchild can double-click
 * it. A JSON dump cannot be read by the person it is about.
 *
 * The machine-readable copy is not sacrificed: the same JSON is embedded in a
 * <script type="application/json"> block inside the page, so the file is both
 * the human artefact and the data, and a future import can read it back out.
 *
 * The file is assembled on the SERVER because the private fields — the letter,
 * the sample location, the contact — must be authorised before they are put in
 * it, and that decision does not belong on the client.
 */
import type { Subject } from './marsService.js';
import type { Memory } from './marsMemorial.js';
import type { LifeEvent, MediaItem } from './marsMedia.js';
export interface ExportInput {
    subject: Subject;
    memories: Memory[];
    /** Only true for the record's own owner; gates every private field. */
    includePrivate: boolean;
    /** Pictures and voice, WITH their bytes — inlined so the file works offline. */
    media?: Array<MediaItem & {
        data: string;
    }>;
    events?: LifeEvent[];
}
export declare function buildExportHtml({ subject: s, memories, includePrivate, media, events }: ExportInput): string;
//# sourceMappingURL=marsExport.d.ts.map