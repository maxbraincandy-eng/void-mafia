/**
 * M.A.R.S. memorials — records of people who have died, kept by the people who
 * knew them, and the mechanism for "speaking" to such a record.
 *
 * TWO KINDS OF RECORD
 * ───────────────────
 *   self     — someone archiving themselves. Private by default: the manifest,
 *              letter and documents are theirs alone.
 *   memorial — someone archiving a person who has died. Publicly readable,
 *              because being visited is the entire point of it, and maintained
 *              by a steward (the relative who created it).
 *
 * SPEAKING TO A RECORD — WHY IT ONLY QUOTES
 * ─────────────────────────────────────────
 * There are two ways to build "talk to someone who died". A language model can
 * invent what they would have said, or the system can return what they — or the
 * people who loved them — actually wrote. The first is more impressive and it
 * is a lie: it shows a grieving family words the dead person never said, in
 * their name.
 *
 * So this retrieves. Every reply is a real passage from a real source, carrying
 * who wrote it and when. It generates nothing. When nothing in the record
 * answers the question, it says so plainly rather than inventing comfort —
 * silence is part of what is true about a person who is gone.
 */
import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';

export type RecordKind = 'self' | 'memorial';

export const PERSON_NAME_MAX = 40;
export const RELATION_MAX = 40;
export const MEMORY_MIN = 15;
export const MEMORY_MAX = 2000;
export const MEMORY_PHOTO_MAX_CHARS = 4_000_000;

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

const YEAR_MIN = 1850;

/** Validate and normalise the person's identity fields. */
export function sanitiseMemorial(input: MemorialInput, nowYear: number): {
  personFirst: string; personLast: string; bornYear: number | null; diedYear: number | null; stewardRelation: string;
} {
  const personFirst = String(input.personFirst ?? '').trim().slice(0, PERSON_NAME_MAX);
  const personLast = String(input.personLast ?? '').trim().slice(0, PERSON_NAME_MAX);
  if (personFirst.length < 2) throw new Error('სახელი აუცილებელია.');
  if (personLast.length < 2) throw new Error('გვარი აუცილებელია.');

  const year = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = Math.trunc(Number(v));
    if (!Number.isFinite(n)) return null;
    // Bounded rather than free: a typo'd year is a wrong headstone.
    if (n < YEAR_MIN || n > nowYear) throw new Error(`წელი უნდა იყოს ${YEAR_MIN}-დან ${nowYear}-მდე.`);
    return n;
  };
  const bornYear = year(input.bornYear);
  const diedYear = year(input.diedYear);
  if (bornYear && diedYear && diedYear < bornYear) throw new Error('გარდაცვალების წელი დაბადებამდე ვერ იქნება.');

  return {
    personFirst, personLast, bornYear, diedYear,
    stewardRelation: String(input.stewardRelation ?? '').trim().slice(0, RELATION_MAX),
  };
}

// ── memories ───────────────────────────────────────────────────────────
function rowToMemory(r: any): Memory {
  return {
    id: r.id,
    subjectId: r.subject_id,
    authorId: r.author_id,
    authorName: r.author_name ?? '',
    relation: r.relation ?? '',
    text: r.text ?? '',
    photo: r.photo ?? null,
    createdAt: Number(r.created_at),
  };
}

export async function addMemory(args: {
  subjectId: string; authorId: string; authorName: string;
  relation: string; text: string; photo?: unknown;
}): Promise<Memory> {
  const text = String(args.text ?? '').trim().slice(0, MEMORY_MAX);
  if (text.length < MEMORY_MIN) throw new Error(`მოგონება ძალიან მოკლეა — მინიმუმ ${MEMORY_MIN} სიმბოლო.`);

  let photo: string | null = null;
  if (typeof args.photo === 'string' && args.photo !== '') {
    if (args.photo.length > MEMORY_PHOTO_MAX_CHARS) throw new Error('სურათი ძალიან დიდია.');
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(args.photo)) {
      throw new Error('სურათის ფორმატი მიუღებელია.');
    }
    photo = args.photo;
  }

  const [subject] = await sql<any[]>`SELECT id FROM mars_subjects WHERE id = ${args.subjectId}`;
  if (!subject) throw new Error('ჩანაწერი ვერ მოიძებნა.');

  const id = generateId();
  const now = Date.now();
  await sql`
    INSERT INTO mars_memories (id, subject_id, author_id, author_name, relation, text, photo, created_at)
    VALUES (${id}, ${args.subjectId}, ${args.authorId}, ${String(args.authorName ?? '').slice(0, 40)},
            ${String(args.relation ?? '').slice(0, RELATION_MAX)}, ${text}, ${photo}, ${now})
  `;
  const [row] = await sql<any[]>`SELECT * FROM mars_memories WHERE id = ${id}`;
  return rowToMemory(row);
}

export async function listMemories(subjectId: string, limit = 50): Promise<Memory[]> {
  const rows = await sql<any[]>`
    SELECT * FROM mars_memories WHERE subject_id = ${subjectId}
    ORDER BY created_at DESC LIMIT ${Math.min(200, Math.max(1, limit))}
  `;
  return rows.map(rowToMemory);
}

/** A memory can be removed by its author or by the record's steward. */
export async function deleteMemory(memoryId: string, requesterId: string): Promise<boolean> {
  const [m] = await sql<any[]>`SELECT author_id, subject_id FROM mars_memories WHERE id = ${memoryId}`;
  if (!m) return false;
  const [s] = await sql<any[]>`SELECT player_id, steward_id FROM mars_subjects WHERE id = ${m.subject_id}`;
  const isSteward = s && (s.steward_id === requesterId || s.player_id === requesterId);
  if (m.author_id !== requesterId && !isSteward) throw new Error('უფლება არ გაქვს.');
  await sql`DELETE FROM mars_memories WHERE id = ${memoryId}`;
  return true;
}

// ── speaking to a record ───────────────────────────────────────────────
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
}

/** Words too common to carry meaning when matching. Georgian + English. */
const STOP = new Set([
  'და', 'რომ', 'ეს', 'ის', 'მე', 'შენ', 'ჩემი', 'შენი', 'იყო', 'არის', 'არა', 'კი', 'თუ', 'რა', 'ვინ',
  'როგორ', 'რატომ', 'სად', 'როდის', 'ძალიან', 'უფრო', 'ერთი', 'ყველა', 'ასე', 'მაგრამ',
  'the', 'and', 'was', 'were', 'is', 'are', 'you', 'your', 'my', 'me', 'that', 'this', 'what', 'who',
  'how', 'why', 'where', 'when', 'a', 'an', 'of', 'to', 'in', 'it', 'do', 'did', 'does',
]);

function tokens(s: string): string[] {
  return s.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w));
}

/**
 * Reduce a word to something comparable across Georgian inflection.
 *
 * Georgian conjugates heavily at BOTH ends: a family asks "სად მუშაობდა?"
 * (3rd person) about a man who wrote "ვმუშაობდი მასწავლებლად" (1st person).
 * Exact word matching misses that entirely, which in this feature means telling
 * a grieving person their record holds no answer when it plainly does.
 *
 * So: drop the first-person marker 'ვ' and keep a stem. Deliberately shallow —
 * aggressive stemming produces false matches, and a wrong quote attributed to
 * the dead is far worse than a missing one.
 */
const STEM_LEN = 6;
function stem(w: string): string {
  const x = w.startsWith('ვ') && w.length > 4 ? w.slice(1) : w;
  return x.slice(0, STEM_LEN);
}

/** Two words count as the same if their stems prefix-match at length >= 5. */
function related(a: string, b: string): boolean {
  const sa = stem(a), sb = stem(b);
  if (sa === sb) return true;
  const min = Math.min(sa.length, sb.length);
  if (min < 5) return false;
  return sa.startsWith(sb.slice(0, min)) || sb.startsWith(sa.slice(0, min));
}

/** Split prose into sentences worth quoting. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length >= 12);
}

/**
 * Find the passage in a record that best answers a question.
 *
 * Scoring is deliberately simple and explainable: overlap of meaningful words,
 * normalised by question length so a long rambling sentence cannot win by
 * sheer size. Exported for testing — the behaviour that matters is that it
 * returns NOTHING when nothing matches.
 */
export function findPassage(question: string, corpus: Passage[]): { passage: Passage | null; score: number } {
  const q = new Set(tokens(question));
  if (q.size === 0 || corpus.length === 0) return { passage: null, score: 0 };

  let best: Passage | null = null;
  let bestScore = 0;
  for (const p of corpus) {
    const words = tokens(p.text);
    if (words.length === 0) continue;
    let hits = 0;
    for (const w of q) if (words.some(x => related(w, x))) hits++;
    if (hits === 0) continue;
    // Normalised by the question, with a mild penalty for very long passages so
    // a short precise sentence beats a paragraph that merely contains the word.
    const score = (hits / q.size) * (1 / (1 + Math.log10(1 + words.length / 12)));
    if (score > bestScore) { bestScore = score; best = p; }
  }
  // Below this the "match" is one incidental word and quoting it would be
  // misleading — better to admit the record does not answer.
  return bestScore < 0.18 ? { passage: null, score: bestScore } : { passage: best, score: bestScore };
}

/** Build the searchable corpus for a record from everything it holds. */
export function buildCorpus(args: {
  manifest: string; letter: string; restoreNote: string;
  personName: string; memories: Memory[];
}): Passage[] {
  const out: Passage[] = [];
  const push = (text: string, kind: Passage['sourceKind'], author: string, at: number) => {
    for (const s of sentences(text)) out.push({ text: s, sourceKind: kind, sourceAuthor: author, sourceAt: at });
  };
  push(args.manifest, 'manifest', args.personName, 0);
  push(args.letter, 'letter', args.personName, 0);
  push(args.restoreNote, 'note', args.personName, 0);
  for (const m of args.memories) push(m.text, 'memory', m.authorName, m.createdAt);
  return out;
}

/**
 * Answer a question against a record.
 *
 * The `note` is always in the SYSTEM's voice — "this is what he wrote", never
 * "I wrote". The distinction is the whole ethical basis of the feature.
 */
export function speak(question: string, personName: string, corpus: Passage[]): SpeakReply {
  const { passage, score } = findPassage(question, corpus);
  if (!passage) {
    return {
      passage: null,
      score,
      note: corpus.length === 0
        ? `${personName}-ის ჩანაწერში ჯერ არაფერია. დაამატე მოგონება და ის აქ გაჩნდება.`
        : `ამ კითხვაზე პასუხი ${personName}-ის ჩანაწერში არ არის. მე არაფერს გამოვიგონებ მის ნაცვლად.`,
    };
  }
  const who = passage.sourceKind === 'memory'
    ? `${passage.sourceAuthor}-ის მოგონებიდან`
    : passage.sourceKind === 'letter'
      ? `${personName}-ის წერილიდან`
      : passage.sourceKind === 'note'
        ? `${personName}-ის ჩანაწერებიდან`
        : `${personName}-ის მანიფესტიდან`;
  return { passage, score, note: who };
}
