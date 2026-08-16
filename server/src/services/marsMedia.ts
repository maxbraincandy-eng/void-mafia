/**
 * Photographs, voice, and a life told as events.
 *
 * WHY THESE THREE TOGETHER
 * ────────────────────────
 * The record already holds what a person wrote. What it did not hold was what
 * they looked like across a life, what they SOUNDED like, and the order things
 * happened in. Of those, the voice is the one people lose first: photographs
 * survive in phones and albums, but a voice exists only in recordings nobody
 * thought to make, and it is the first thing a grieving family says they can
 * no longer remember.
 *
 * WHY THE BYTES NEVER TRAVEL OVER THE SOCKET
 * ──────────────────────────────────────────
 * A gallery and a few voice clips are tens of megabytes. Pushing that through
 * the socket on every record open would make opening a memorial slow for
 * everyone and uncacheable for the browser. So the socket carries only IDs and
 * captions; the media itself is fetched over HTTP, where the browser's cache
 * and byte-range requests already work — the second visit costs nothing, and
 * an audio player can seek without downloading the whole file first.
 *
 * The one exception is the export, which reads from here directly and inlines
 * everything as data URIs, because a file that has to phone home is not an
 * archive.
 *
 * WHAT IS PUBLIC
 * ──────────────
 * Photos, voice and events are part of the visible record — the same standing
 * as the portrait, which already appears in the public archive. They are NOT
 * part of the private preservation package (the letter, the sample location,
 * the documents), which stays owner-only. The upload UI says this in words
 * before anything is chosen, because consent that is only in a policy is not
 * consent.
 */
import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';

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

// Sizes are in base64 characters, which is what actually arrives and what is
// actually stored — roughly 4/3 of the byte count.
export const PHOTO_MAX_CHARS = 2_800_000;   // ≈ 2 MB per picture after compression
export const PHOTOS_MAX = 24;
export const VOICE_MAX_CHARS = 8_400_000;   // ≈ 6 MB, about ten minutes of speech
export const VOICES_MAX = 8;
export const EVENTS_MAX = 40;
export const CAPTION_MAX = 160;
export const EVENT_TITLE_MAX = 80;
export const EVENT_NOTE_MAX = 400;

const PHOTO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
/**
 * Browsers hand back different containers for the same recording: Chrome and
 * Firefox produce webm/opus, Safari produces mp4/aac. Uploaded files add mp3,
 * ogg, wav and m4a. All are accepted, none are transcoded — the <audio> element
 * plays whatever the platform produced on that platform.
 */
const VOICE_RE = /^data:audio\/(webm|ogg|mpeg|mp3|mp4|x-m4a|m4a|aac|wav|x-wav)(;[a-z0-9=.,+-]*)?;base64,[A-Za-z0-9+/=]+$/i;

function mimeOf(dataUrl: string): string {
  const semi = dataUrl.indexOf(';');
  return dataUrl.slice(5, semi > 0 ? semi : dataUrl.indexOf(','));
}

/** Base64 payload length → real byte count, for display only. */
function bytesOf(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(b64.length * 3 / 4) - pad);
}

function rowToItem(r: any): MediaItem {
  return {
    id: r.id,
    subjectId: r.subject_id,
    kind: r.kind === 'voice' ? 'voice' : 'photo',
    mime: r.mime,
    caption: r.caption ?? '',
    year: r.year != null ? Number(r.year) : null,
    durationMs: Number(r.duration_ms ?? 0),
    bytes: Number(r.bytes ?? 0),
    sort: Number(r.sort ?? 0),
    createdAt: Number(r.created_at),
  };
}

/** A year that could belong to a human life, or nothing. */
function cleanYear(raw: unknown): number | null {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n < 1800) return null;
  const max = new Date().getUTCFullYear();
  return n > max ? null : n;
}

export async function addMedia(input: {
  subjectId: string;
  kind: MediaKind;
  data: string;
  caption?: string;
  year?: unknown;
  durationMs?: unknown;
  addedBy: string;
}): Promise<MediaItem> {
  const kind: MediaKind = input.kind === 'voice' ? 'voice' : 'photo';
  const data = String(input.data ?? '');

  if (kind === 'photo') {
    if (!PHOTO_RE.test(data)) throw new Error('სურათის ფორმატი მიუღებელია (PNG/JPEG/WEBP).');
    if (data.length > PHOTO_MAX_CHARS) throw new Error('სურათი ძალიან დიდია.');
  } else {
    if (!VOICE_RE.test(data)) throw new Error('აუდიოს ფორმატი მიუღებელია.');
    if (data.length > VOICE_MAX_CHARS) throw new Error('ჩანაწერი ძალიან გრძელია — მაქსიმუმ ~6 MB.');
  }

  const [{ n }] = await sql<any[]>`
    SELECT COUNT(*)::int AS n FROM mars_media WHERE subject_id = ${input.subjectId} AND kind = ${kind}
  `;
  const cap = kind === 'photo' ? PHOTOS_MAX : VOICES_MAX;
  if (Number(n) >= cap) {
    throw new Error(kind === 'photo'
      ? `მაქსიმუმ ${PHOTOS_MAX} სურათი. წაშალე რომელიმე და სცადე ხელახლა.`
      : `მაქსიმუმ ${VOICES_MAX} ხმოვანი ჩანაწერი.`);
  }

  const id = generateId();
  const now = Date.now();
  const item: MediaItem = {
    id,
    subjectId: input.subjectId,
    kind,
    mime: mimeOf(data),
    caption: String(input.caption ?? '').trim().slice(0, CAPTION_MAX),
    year: cleanYear(input.year),
    durationMs: Math.max(0, Math.min(3_600_000, Math.trunc(Number(input.durationMs) || 0))),
    bytes: bytesOf(data),
    // New items land at the end; the sort column exists so a steward can order
    // a gallery by hand later without the upload order deciding it forever.
    sort: Number(n),
    createdAt: now,
  };

  await sql`
    INSERT INTO mars_media (id, subject_id, kind, mime, data, caption, year, duration_ms, bytes, sort, added_by, created_at)
    VALUES (${id}, ${input.subjectId}, ${kind}, ${item.mime}, ${data}, ${item.caption},
            ${item.year}, ${item.durationMs}, ${item.bytes}, ${item.sort}, ${input.addedBy}, ${now})
  `;
  return item;
}

/** Metadata only — the bytes are never sent through the socket. */
export async function listMedia(subjectId: string, kind?: MediaKind): Promise<MediaItem[]> {
  const rows = kind
    ? await sql<any[]>`
        SELECT id, subject_id, kind, mime, caption, year, duration_ms, bytes, sort, created_at
        FROM mars_media WHERE subject_id = ${subjectId} AND kind = ${kind}
        ORDER BY sort, created_at`
    : await sql<any[]>`
        SELECT id, subject_id, kind, mime, caption, year, duration_ms, bytes, sort, created_at
        FROM mars_media WHERE subject_id = ${subjectId}
        ORDER BY kind, sort, created_at`;
  return rows.map(rowToItem);
}

/** With the bytes — for the HTTP endpoint and for the export. */
export async function getMediaWithData(
  id: string,
): Promise<(MediaItem & { data: string; subjectHidden: boolean }) | null> {
  const [r] = await sql<any[]>`
    SELECT m.*, s.hidden AS subject_hidden
    FROM mars_media m JOIN mars_subjects s ON s.id = m.subject_id
    WHERE m.id = ${id}
  `;
  if (!r) return null;
  return { ...rowToItem(r), data: r.data, subjectHidden: !!r.subject_hidden };
}

export async function listMediaWithData(
  subjectId: string, kind?: MediaKind,
): Promise<Array<MediaItem & { data: string }>> {
  const rows = kind
    ? await sql<any[]>`SELECT * FROM mars_media WHERE subject_id = ${subjectId} AND kind = ${kind} ORDER BY sort, created_at`
    : await sql<any[]>`SELECT * FROM mars_media WHERE subject_id = ${subjectId} ORDER BY kind, sort, created_at`;
  return rows.map(r => ({ ...rowToItem(r), data: r.data }));
}

export async function updateMediaCaption(id: string, caption: string, year: unknown): Promise<MediaItem | null> {
  await sql`
    UPDATE mars_media
    SET caption = ${String(caption ?? '').trim().slice(0, CAPTION_MAX)}, year = ${cleanYear(year)}
    WHERE id = ${id}
  `;
  const [r] = await sql<any[]>`
    SELECT id, subject_id, kind, mime, caption, year, duration_ms, bytes, sort, created_at
    FROM mars_media WHERE id = ${id}
  `;
  return r ? rowToItem(r) : null;
}

export async function deleteMedia(id: string): Promise<boolean> {
  const rows = await sql<any[]>`DELETE FROM mars_media WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

/** Which record a media item belongs to — so permission is checked on it. */
export async function subjectIdOfMedia(id: string): Promise<string | null> {
  const [r] = await sql<any[]>`SELECT subject_id FROM mars_media WHERE id = ${id}`;
  return r?.subject_id ?? null;
}

// ── the life, as events ────────────────────────────────────────────────

export async function addEvent(input: {
  subjectId: string; year: unknown; month?: unknown; title: string; note?: string;
}): Promise<LifeEvent> {
  const year = cleanYear(input.year);
  if (year == null) {
    // "A year is required" is the wrong thing to say to someone who typed 2400.
    const typed = Math.trunc(Number(input.year));
    throw new Error(Number.isFinite(typed) && typed !== 0
      ? `წელი უნდა იყოს 1800-სა და ${new Date().getUTCFullYear()}-ს შორის.`
      : 'წელი აუცილებელია (მაგ. 1985).');
  }
  const title = String(input.title ?? '').trim().slice(0, EVENT_TITLE_MAX);
  if (title.length < 2) throw new Error('დაწერე, რა მოხდა.');

  const [{ n }] = await sql<any[]>`SELECT COUNT(*)::int AS n FROM mars_events WHERE subject_id = ${input.subjectId}`;
  if (Number(n) >= EVENTS_MAX) throw new Error(`მაქსიმუმ ${EVENTS_MAX} მოვლენა.`);

  const monthRaw = Math.trunc(Number(input.month));
  const month = Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : null;

  const id = generateId();
  const now = Date.now();
  const note = String(input.note ?? '').trim().slice(0, EVENT_NOTE_MAX);
  await sql`
    INSERT INTO mars_events (id, subject_id, year, month, title, note, created_at)
    VALUES (${id}, ${input.subjectId}, ${year}, ${month}, ${title}, ${note}, ${now})
  `;
  return { id, year, month, title, note, createdAt: now };
}

export async function listEvents(subjectId: string): Promise<LifeEvent[]> {
  const rows = await sql<any[]>`
    SELECT id, year, month, title, note, created_at FROM mars_events
    WHERE subject_id = ${subjectId}
    -- Undated months sort after dated ones within the same year, so "1985"
    -- reads as the year itself rather than as January.
    ORDER BY year, COALESCE(month, 13), created_at
  `;
  return rows.map(r => ({
    id: r.id,
    year: Number(r.year),
    month: r.month != null ? Number(r.month) : null,
    title: r.title,
    note: r.note ?? '',
    createdAt: Number(r.created_at),
  }));
}

export async function deleteEvent(id: string): Promise<boolean> {
  const rows = await sql<any[]>`DELETE FROM mars_events WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function subjectIdOfEvent(id: string): Promise<string | null> {
  const [r] = await sql<any[]>`SELECT subject_id FROM mars_events WHERE id = ${id}`;
  return r?.subject_id ?? null;
}
