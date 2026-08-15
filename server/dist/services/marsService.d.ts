export type TraitKey = 'logic' | 'empathy' | 'defiance' | 'entropy';
export type Traits = Record<TraitKey, number>;
export interface Subject {
    id: string;
    playerId: string;
    code: string;
    designation: string;
    manifest: string;
    traits: Traits;
    integrity: number;
    sector: string;
    uploads: number;
    /** Public: appears beside this subject in the archive. */
    portrait: string | null;
    /** Private: only ever returned to the subject themselves. */
    docs: MarsDoc[];
    createdAt: number;
    updatedAt: number;
}
export interface DirectoryEntry {
    code: string;
    designation: string;
    sector: string;
    integrity: number;
    dominant: TraitKey;
    portrait: string | null;
    createdAt: number;
}
export declare const MANIFEST_MIN = 40;
export declare const MANIFEST_MAX = 1200;
export declare const DESIGNATION_MAX = 24;
/**
 * Attachment limits. These are base64 data URLs stored in a TEXT column, so
 * every byte here is a byte in the row — the caps are deliberately tight and
 * the client downscales images before it ever gets this far.
 */
export declare const PORTRAIT_MAX_CHARS = 700000;
export declare const DOC_MAX_CHARS = 1400000;
export declare const DOCS_MAX_COUNT = 3;
export declare const DOCS_TOTAL_MAX_CHARS = 3000000;
export declare const DOC_NAME_MAX = 60;
export interface MarsDoc {
    name: string;
    /** 'application/pdf' or an image mime. */
    type: string;
    /** Original byte size, for display only. */
    size: number;
    /** base64 data URL. */
    data: string;
}
/**
 * A portrait is shown to OTHER players in the archive, so it is validated
 * strictly rather than trusted: the mime must be one we render as an image and
 * the payload must be plain base64. Anything else is dropped, not stored.
 */
export declare function sanitisePortrait(raw: unknown): string | null;
/** Documents are private to their subject, but still bounded and typed. */
export declare function sanitiseDocs(raw: unknown): MarsDoc[];
/** Sector names, one per dominant trait. */
export declare const SECTORS: Record<TraitKey, string>;
/** A subject code derived from the player id: same player, same code, forever. */
export declare function codeFor(playerId: string, salt?: number): string;
/**
 * Score a manifest. Pure: same text in, same traits out, on any machine.
 */
export declare function analyse(manifest: string): Traits;
export declare function dominantTrait(t: Traits): TraitKey;
/**
 * Integrity: how cleanly the system claims to hold this consciousness.
 * A flat, featureless manifest reads as a weak signal; a strong dominant trait
 * reads as a clean one. Bounded well away from 0 and 100 so it never looks
 * broken or finished.
 */
export declare function integrityOf(t: Traits, manifestLength: number): number;
export declare function getSubject(playerId: string): Promise<Subject | null>;
export declare function getSubjectByCode(code: string): Promise<Subject | null>;
/**
 * Ingest (or re-ingest) a manifest.
 *
 * The Subject code is assigned once and never changes — it is the player's
 * identity inside the fiction, and a code that moved on every edit would be
 * worthless. Everything else is recomputed from the new text.
 */
export declare function upload(playerId: string, designationRaw: string, manifestRaw: string, portraitRaw?: unknown, docsRaw?: unknown): Promise<Subject>;
/** Remove a subject. The fiction calls it purging; the database calls it DELETE. */
export declare function purge(playerId: string): Promise<boolean>;
/**
 * Public directory. Manifests are NEVER included: people write private things
 * into a box that says "consciousness", and the only safe default is that only
 * they can read it back.
 */
export declare function directory(limit?: number): Promise<DirectoryEntry[]>;
export interface MarsStats {
    total: number;
    sectors: Record<string, number>;
    avgIntegrity: number;
}
export declare function stats(): Promise<MarsStats>;
//# sourceMappingURL=marsService.d.ts.map