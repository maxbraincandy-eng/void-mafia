/**
 * M.A.R.S. — Mankind's Automated Reality System.
 *
 * A player writes a "manifest" (their consciousness, in their own words) and
 * the system ingests it: assigns a permanent Subject code, scores four traits
 * from the text, and files them into a sector.
 *
 * WHY THE ANALYSIS IS DETERMINISTIC AND SERVER-SIDE
 * ────────────────────────────────────────────────
 * The fiction is that a machine reads you and decides what you are. That only
 * lands if the verdict is stable — re-uploading the same words must give the
 * same reading, and two people uploading the same words must get the same
 * reading. A random or model-generated score would break both, and would also
 * let a modified client hand itself a perfect profile. So the scoring lives
 * here, is pure, and is derived only from the text.
 *
 * The traits are honest measurements of writing, not a personality claim:
 *   LOGIC   — structure: connectives, numbers, clause length
 *   EMPATHY — other-directedness: second/third person, feeling words
 *   DEFIANCE— assertion: negation, imperatives, shouting
 *   ENTROPY — disorder: rare characters, repetition, question marks
 */
import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';

export type TraitKey = 'logic' | 'empathy' | 'defiance' | 'entropy';
export type Traits = Record<TraitKey, number>;

export interface Subject {
  id: string;
  playerId: string;
  code: string;              // "2162-X"
  designation: string;
  manifest: string;
  traits: Traits;
  integrity: number;         // 0-100
  sector: string;
  uploads: number;
  createdAt: number;
  updatedAt: number;
}

export interface DirectoryEntry {
  code: string;
  designation: string;
  sector: string;
  integrity: number;
  dominant: TraitKey;
  createdAt: number;
}

export const MANIFEST_MIN = 40;
export const MANIFEST_MAX = 1200;
export const DESIGNATION_MAX = 24;

/** Sector names, one per dominant trait. */
export const SECTORS: Record<TraitKey, string> = {
  logic: 'AXIOM',
  empathy: 'CHORUS',
  defiance: 'FRACTURE',
  entropy: 'STATIC',
};

// ── deterministic hashing ──────────────────────────────────────────────
/** FNV-1a. Small, fast, and stable across runs — which is the whole point. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const CODE_LETTERS = 'XVKZQJRNTL';

/** A subject code derived from the player id: same player, same code, forever. */
export function codeFor(playerId: string, salt = 0): string {
  const h = hash32(`mars:${playerId}:${salt}`);
  const num = 1000 + (h % 9000);            // 1000-9999
  const letter = CODE_LETTERS[(h >>> 16) % CODE_LETTERS.length];
  return `${num}-${letter}`;
}

// ── trait scoring ──────────────────────────────────────────────────────
// Word lists are intentionally bilingual: the audience writes Georgian, but
// English creeps into everything, and a scorer that only sees one of them
// would read half the manifests as featureless.
const W = {
  connective: ['რადგან', 'ამიტომ', 'თუმცა', 'მაგრამ', 'შესაბამისად', 'ანუ', 'ასევე', 'თუ',
    'because', 'therefore', 'however', 'thus', 'so', 'if', 'then'],
  feeling: ['მიყვარს', 'მეშინია', 'ვწუხვარ', 'ბედნიერ', 'ტკივილ', 'სიყვარულ', 'მენატრება', 'ვგრძნობ',
    'love', 'fear', 'sad', 'happy', 'pain', 'miss', 'feel', 'hope'],
  other: ['შენ', 'თქვენ', 'ჩვენ', 'მათ', 'ადამიან', 'ხალხ', 'მეგობარ', 'ოჯახ',
    'you', 'we', 'they', 'people', 'friend', 'family'],
  negation: ['არა', 'ვერ', 'არასდროს', 'აღარ', 'უარი', 'არ ვაპირებ',
    'no', 'not', 'never', 'refuse', 'won\'t', 'wont'],
  defiant: ['თავისუფლ', 'ვიბრძოლ', 'წინააღმდეგ', 'ჩემი არჩევანი', 'არავინ',
    'free', 'fight', 'against', 'my choice', 'nobody', 'resist'],
};

function countHits(lower: string, words: string[]): number {
  let n = 0;
  for (const w of words) {
    let from = 0;
    for (;;) {
      const i = lower.indexOf(w, from);
      if (i === -1) break;
      n++; from = i + w.length;
    }
  }
  return n;
}

/** Map a raw density onto 0-100 with diminishing returns. */
function curve(value: number, mid: number): number {
  if (value <= 0) return 0;
  return Math.round(100 * (value / (value + mid)));
}

/**
 * Score a manifest. Pure: same text in, same traits out, on any machine.
 */
export function analyse(manifest: string): Traits {
  const text = manifest.trim();
  const lower = text.toLowerCase();
  const chars = Math.max(1, text.length);
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = Math.max(1, words.length);
  const sentences = Math.max(1, (text.match(/[.!?…]+/g) ?? []).length);

  // LOGIC — connectives, digits, and sentences long enough to hold an argument.
  const connectives = countHits(lower, W.connective) / wordCount;
  const digits = (text.match(/\d/g) ?? []).length / chars;
  const avgSentence = wordCount / sentences;
  const logic = Math.min(100, Math.round(
    curve(connectives * 40, 1) * 0.45 +
    curve(digits * 60, 1) * 0.2 +
    curve(Math.max(0, avgSentence - 4) / 12, 1) * 0.35,
  ));

  // EMPATHY — writing about others, and about feeling.
  const feeling = countHits(lower, W.feeling) / wordCount;
  const other = countHits(lower, W.other) / wordCount;
  const empathy = Math.min(100, Math.round(
    curve(feeling * 55, 1) * 0.55 + curve(other * 35, 1) * 0.45,
  ));

  // DEFIANCE — refusal, assertion, volume.
  const negation = countHits(lower, W.negation) / wordCount;
  const defiantWords = countHits(lower, W.defiant) / wordCount;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const upper = (text.match(/\p{Lu}/gu) ?? []).length;
  const shouting = letters > 0 ? upper / letters : 0;
  const bangs = (text.match(/!/g) ?? []).length / sentences;
  const defiance = Math.min(100, Math.round(
    curve(negation * 45, 1) * 0.35 + curve(defiantWords * 60, 1) * 0.3 +
    curve(shouting * 6, 1) * 0.2 + curve(bangs, 1) * 0.15,
  ));

  // ENTROPY — questions, ellipses, symbols, and repeated words.
  const questions = (text.match(/\?/g) ?? []).length / sentences;
  const symbols = (text.match(/[^\p{L}\p{N}\s.,!?…'"-]/gu) ?? []).length / chars;
  const uniq = new Set(words.map(w => w.toLowerCase())).size;
  const repetition = 1 - uniq / wordCount;
  const entropy = Math.min(100, Math.round(
    curve(questions, 1) * 0.3 + curve(symbols * 40, 1) * 0.3 + curve(repetition * 3, 1) * 0.4,
  ));

  return { logic, empathy, defiance, entropy };
}

export function dominantTrait(t: Traits): TraitKey {
  // Ties resolve in a fixed order so the same traits always pick the same
  // sector — a coin flip here would move people between sectors on re-upload.
  const order: TraitKey[] = ['logic', 'empathy', 'defiance', 'entropy'];
  return order.reduce((best, k) => (t[k] > t[best] ? k : best), order[0]);
}

/**
 * Integrity: how cleanly the system claims to hold this consciousness.
 * A flat, featureless manifest reads as a weak signal; a strong dominant trait
 * reads as a clean one. Bounded well away from 0 and 100 so it never looks
 * broken or finished.
 */
export function integrityOf(t: Traits, manifestLength: number): number {
  const values = Object.values(t);
  const peak = Math.max(...values);
  const spread = peak - Math.min(...values);
  const depth = Math.min(1, manifestLength / 400);
  return Math.max(38, Math.min(99, Math.round(40 + peak * 0.28 + spread * 0.18 + depth * 18)));
}

// ── persistence ────────────────────────────────────────────────────────
function rowToSubject(r: any): Subject {
  let traits: Traits;
  try { traits = JSON.parse(r.traits); } catch { traits = { logic: 0, empathy: 0, defiance: 0, entropy: 0 }; }
  return {
    id: r.id,
    playerId: r.player_id,
    code: r.code,
    designation: r.designation,
    manifest: r.manifest,
    traits,
    integrity: Number(r.integrity),
    sector: r.sector,
    uploads: Number(r.uploads),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export async function getSubject(playerId: string): Promise<Subject | null> {
  const [row] = await sql<any[]>`SELECT * FROM mars_subjects WHERE player_id = ${playerId}`;
  return row ? rowToSubject(row) : null;
}

export async function getSubjectByCode(code: string): Promise<Subject | null> {
  const [row] = await sql<any[]>`SELECT * FROM mars_subjects WHERE code = ${code.toUpperCase()}`;
  return row ? rowToSubject(row) : null;
}

/**
 * Ingest (or re-ingest) a manifest.
 *
 * The Subject code is assigned once and never changes — it is the player's
 * identity inside the fiction, and a code that moved on every edit would be
 * worthless. Everything else is recomputed from the new text.
 */
export async function upload(playerId: string, designationRaw: string, manifestRaw: string): Promise<Subject> {
  const designation = designationRaw.trim().slice(0, DESIGNATION_MAX);
  const manifest = manifestRaw.trim().slice(0, MANIFEST_MAX);
  if (designation.length < 2) throw new Error('DESIGNATION REJECTED — მინიმუმ 2 სიმბოლო.');
  if (manifest.length < MANIFEST_MIN) {
    throw new Error(`MANIFEST TOO THIN — მინიმუმ ${MANIFEST_MIN} სიმბოლო. მოგვეცი რაღაც, რისი შენახვაც ღირს.`);
  }

  const traits = analyse(manifest);
  const sector = SECTORS[dominantTrait(traits)];
  const integrity = integrityOf(traits, manifest.length);
  const now = Date.now();

  const existing = await getSubject(playerId);
  if (existing) {
    await sql`
      UPDATE mars_subjects
      SET designation = ${designation}, manifest = ${manifest}, traits = ${JSON.stringify(traits)},
          integrity = ${integrity}, sector = ${sector}, uploads = uploads + 1, updated_at = ${now}
      WHERE player_id = ${playerId}
    `;
    return (await getSubject(playerId))!;
  }

  // First upload: claim a code. The derived code collides only if two player
  // ids hash together, so we re-salt rather than fail — but we bound the loop,
  // because an unbounded retry on a genuinely broken unique index would spin.
  let lastErr: unknown = null;
  for (let salt = 0; salt < 12; salt++) {
    const code = codeFor(playerId, salt);
    try {
      await sql`
        INSERT INTO mars_subjects (id, player_id, code, designation, manifest, traits, integrity, sector, uploads, created_at, updated_at)
        VALUES (${generateId()}, ${playerId}, ${code}, ${designation}, ${manifest},
                ${JSON.stringify(traits)}, ${integrity}, ${sector}, 1, ${now}, ${now})
      `;
      return (await getSubject(playerId))!;
    } catch (e: any) {
      // Another connection inserted this player concurrently → theirs wins.
      const dupPlayer = await getSubject(playerId);
      if (dupPlayer) return dupPlayer;
      lastErr = e;
    }
  }
  throw new Error(`ALLOCATION FAILURE — სექტორმა უარი თქვა. სცადე ხელახლა. ${lastErr ? '' : ''}`);
}

/** Remove a subject. The fiction calls it purging; the database calls it DELETE. */
export async function purge(playerId: string): Promise<boolean> {
  const rows = await sql<any[]>`DELETE FROM mars_subjects WHERE player_id = ${playerId} RETURNING id`;
  return rows.length > 0;
}

/**
 * Public directory. Manifests are NEVER included: people write private things
 * into a box that says "consciousness", and the only safe default is that only
 * they can read it back.
 */
export async function directory(limit = 20): Promise<DirectoryEntry[]> {
  const rows = await sql<any[]>`
    SELECT code, designation, sector, integrity, traits, created_at
    FROM mars_subjects ORDER BY created_at DESC LIMIT ${Math.min(50, Math.max(1, limit))}
  `;
  return rows.map(r => {
    let traits: Traits;
    try { traits = JSON.parse(r.traits); } catch { traits = { logic: 0, empathy: 0, defiance: 0, entropy: 0 }; }
    return {
      code: r.code,
      designation: r.designation,
      sector: r.sector,
      integrity: Number(r.integrity),
      dominant: dominantTrait(traits),
      createdAt: Number(r.created_at),
    };
  });
}

export interface MarsStats {
  total: number;
  sectors: Record<string, number>;
  avgIntegrity: number;
}

export async function stats(): Promise<MarsStats> {
  const [tot] = await sql<any[]>`SELECT COUNT(*)::int AS n, COALESCE(AVG(integrity),0)::float AS avg FROM mars_subjects`;
  const bySector = await sql<any[]>`SELECT sector, COUNT(*)::int AS n FROM mars_subjects GROUP BY sector`;
  const sectors: Record<string, number> = {};
  for (const s of Object.values(SECTORS)) sectors[s] = 0;
  for (const r of bySector) sectors[r.sector] = Number(r.n);
  return { total: Number(tot?.n ?? 0), sectors, avgIntegrity: Math.round(Number(tot?.avg ?? 0)) };
}
