export type MediaKind = 'photo' | 'voice';
export interface MediaItem {
    id: string;
    subjectId: string;
    kind: MediaKind;
    mime: string;
    caption: string;
    year: number | null;
    durationMs: number;
    bytes: number;
    sort: number;
    createdAt: number;
}
export interface LifeEvent {
    id: string;
    year: number;
    month: number | null;
    title: string;
    note: string;
    createdAt: number;
}
export declare const PHOTO_MAX_CHARS = 2800000;
export declare const PHOTOS_MAX = 24;
export declare const VOICE_MAX_CHARS = 8400000;
export declare const VOICES_MAX = 8;
export declare const EVENTS_MAX = 40;
export declare const CAPTION_MAX = 160;
export declare const EVENT_TITLE_MAX = 80;
export declare const EVENT_NOTE_MAX = 400;
export declare function addMedia(input: {
    subjectId: string;
    kind: MediaKind;
    data: string;
    caption?: string;
    year?: unknown;
    durationMs?: unknown;
    addedBy: string;
}): Promise<MediaItem>;
/** Metadata only — the bytes are never sent through the socket. */
export declare function listMedia(subjectId: string, kind?: MediaKind): Promise<MediaItem[]>;
/** With the bytes — for the HTTP endpoint and for the export. */
export declare function getMediaWithData(id: string): Promise<(MediaItem & {
    data: string;
    subjectHidden: boolean;
}) | null>;
export declare function listMediaWithData(subjectId: string, kind?: MediaKind): Promise<Array<MediaItem & {
    data: string;
}>>;
export declare function updateMediaCaption(id: string, caption: string, year: unknown): Promise<MediaItem | null>;
export declare function deleteMedia(id: string): Promise<boolean>;
/** Which record a media item belongs to — so permission is checked on it. */
export declare function subjectIdOfMedia(id: string): Promise<string | null>;
export declare function addEvent(input: {
    subjectId: string;
    year: unknown;
    month?: unknown;
    title: string;
    note?: string;
}): Promise<LifeEvent>;
export declare function listEvents(subjectId: string): Promise<LifeEvent[]>;
export declare function deleteEvent(id: string): Promise<boolean>;
export declare function subjectIdOfEvent(id: string): Promise<string | null>;
//# sourceMappingURL=marsMedia.d.ts.map