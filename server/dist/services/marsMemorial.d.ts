export type RecordKind = 'self' | 'memorial';
export declare const PERSON_NAME_MAX = 40;
export declare const RELATION_MAX = 40;
export declare const MEMORY_MIN = 15;
export declare const MEMORY_MAX = 2000;
export declare const MEMORY_PHOTO_MAX_CHARS = 4000000;
export interface Memory {
    id: string;
    subjectId: string;
    authorId: string;
    authorName: string;
    relation: string;
    text: string;
    photo: string | null;
    createdAt: number;
}
export interface MemorialInput {
    personFirst: string;
    personLast: string;
    bornYear?: number | null;
    diedYear?: number | null;
    stewardRelation: string;
}
/** Validate and normalise the person's identity fields. */
export declare function sanitiseMemorial(input: MemorialInput, nowYear: number): {
    personFirst: string;
    personLast: string;
    bornYear: number | null;
    diedYear: number | null;
    stewardRelation: string;
};
export declare function addMemory(args: {
    subjectId: string;
    authorId: string;
    authorName: string;
    relation: string;
    text: string;
    photo?: unknown;
}): Promise<Memory>;
export declare function listMemories(subjectId: string, limit?: number): Promise<Memory[]>;
/** A memory can be removed by its author or by the record's steward. */
export declare function deleteMemory(memoryId: string, requesterId: string): Promise<boolean>;
export interface Passage {
    text: string;
    /** Where this sentence came from, so a reply can always be attributed. */
    sourceKind: 'manifest' | 'letter' | 'note' | 'memory';
    sourceAuthor: string;
    sourceAt: number;
}
export interface SpeakReply {
    /** Empty when the record holds no answer. Never invented. */
    passage: Passage | null;
    /** How well the passage matched, 0-1. Shown so a weak match reads as weak. */
    score: number;
    /** Said in the system's own voice, never in the person's. */
    note: string;
    /**
     * Words this record can actually answer about, drawn from its own text.
     * A retrieval system that only ever says "no" reads as broken; showing what
     * IS there turns a dead end into a next question.
     */
    topics?: string[];
    /** True when the record simply has too little in it to answer anything. */
    thin?: boolean;
}
/**
 * The most distinctive words the record contains — what it can be asked about.
 * Frequency-ranked over content words, longest first as a tie-break so the
 * suggestions read like subjects rather than particles.
 */
export declare function topicsOf(corpus: Passage[], limit?: number): string[];
/**
 * Find the passage in a record that best answers a question.
 *
 * Scoring is deliberately simple and explainable: overlap of meaningful words,
 * normalised by question length so a long rambling sentence cannot win by
 * sheer size. Exported for testing — the behaviour that matters is that it
 * returns NOTHING when nothing matches.
 */
export declare function findPassage(question: string, corpus: Passage[]): {
    passage: Passage | null;
    score: number;
};
/** Build the searchable corpus for a record from everything it holds. */
export declare function buildCorpus(args: {
    manifest: string;
    letter: string;
    restoreNote: string;
    personName: string;
    memories: Memory[];
}): Passage[];
/**
 * Answer a question against a record.
 *
 * The `note` is always in the SYSTEM's voice — "this is what he wrote", never
 * "I wrote". The distinction is the whole ethical basis of the feature.
 */
export declare function speak(question: string, personName: string, corpus: Passage[]): SpeakReply;
//# sourceMappingURL=marsMemorial.d.ts.map