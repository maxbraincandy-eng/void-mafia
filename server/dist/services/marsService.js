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
import { sanitiseMemorial } from './marsMemorial.js';
export const MANIFEST_MIN = 40;
export const MANIFEST_MAX = 1200;
export const DESIGNATION_MAX = 24;
/**
 * Attachment limits.
 *
 * These are base64 data URLs in a TEXT column, so every byte here is a byte in
 * the row. They were far too tight: a 4 MB phone photo was refused outright
 * even though it compresses to ~200 KB, because the client checked the file's
 * ORIGINAL size before downscaling it. Both ends are fixed — the client now
 * measures what it is actually about to send, and these caps are generous
 * enough that no ordinary photo or document can hit them.
 *
 * They are not removed, and cannot be: the socket has a frame ceiling, the row
 * has to be read back on every card view, and an unbounded field is a way to
 * fill the database. They are set where a real user will not meet them.
 */
export const PORTRAIT_MAX_CHARS = 4000000; // ≈ 3 MB of image
export const DOC_MAX_CHARS = 12000000; // ≈ 9 MB per document
export const DOCS_MAX_COUNT = 5;
export const DOCS_TOTAL_MAX_CHARS = 26000000; // ≈ 19 MB total
export const DOC_NAME_MAX = 60;
// ── the preservation record ────────────────────────────────────────────
export const LETTER_MAX = 4000;
export const RESTORE_NOTE_MAX = 1500;
export const KIN_MAX = 200;
export const SAMPLE_NOTE_MAX = 400;
export const SAMPLE_STATUSES = ['none', 'pledged', 'stored'];
/** What kind of physical sample is on record. Registry only — never collected here. */
export const SAMPLE_KINDS = ['hair', 'swab', 'blood_card', 'tooth', 'other'];
export const SAMPLE_CUSTODIAN_MAX = 120;
const PORTRAIT_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const DOC_RE = /^data:(application\/pdf|image\/(png|jpeg|webp));base64,[A-Za-z0-9+/=]+$/;
/**
 * A portrait is shown to OTHER players in the archive, so it is validated
 * strictly rather than trusted: the mime must be one we render as an image and
 * the payload must be plain base64. Anything else is dropped, not stored.
 */
export function sanitisePortrait(raw) {
    if (typeof raw !== 'string' || raw === '')
        return null;
    if (raw.length > PORTRAIT_MAX_CHARS)
        throw new Error('პორტრეტი ძალიან დიდია.');
    if (!PORTRAIT_RE.test(raw))
        throw new Error('პორტრეტის ფორმატი მიუღებელია (PNG/JPEG/WEBP).');
    return raw;
}
/** Documents are private to their subject, but still bounded and typed. */
export function sanitiseDocs(raw) {
    if (raw == null)
        return [];
    if (!Array.isArray(raw))
        throw new Error('დოკუმენტების ფორმატი მიუღებელია.');
    if (raw.length > DOCS_MAX_COUNT)
        throw new Error(`მაქსიმუმ ${DOCS_MAX_COUNT} დოკუმენტი.`);
    const out = [];
    let total = 0;
    for (const d of raw) {
        const data = String(d?.data ?? '');
        if (!DOC_RE.test(data))
            throw new Error('დაშვებულია მხოლოდ PDF ან სურათი.');
        if (data.length > DOC_MAX_CHARS)
            throw new Error('დოკუმენტი ძალიან დიდია (მაქს. 1 MB).');
        total += data.length;
        if (total > DOCS_TOTAL_MAX_CHARS)
            throw new Error('დოკუმენტების ჯამური ზომა ძალიან დიდია.');
        const mime = data.slice(5, data.indexOf(';'));
        out.push({
            name: String(d?.name ?? 'document').slice(0, DOC_NAME_MAX),
            // Taken from the payload itself, never from the caller's `type` field —
            // otherwise a PDF could be labelled an image and rendered as one.
            type: mime,
            size: Math.max(0, Math.trunc(Number(d?.size) || 0)),
            data,
        });
    }
    return out;
}
/** Sector names, one per dominant trait. */
export const SECTORS = {
    logic: 'AXIOM',
    empathy: 'CHORUS',
    defiance: 'FRACTURE',
    entropy: 'STATIC',
};
// ── deterministic hashing ──────────────────────────────────────────────
/** FNV-1a. Small, fast, and stable across runs — which is the whole point. */
function hash32(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}
const CODE_LETTERS = 'XVKZQJRNTL';
/** A subject code derived from the player id: same player, same code, forever. */
export function codeFor(playerId, salt = 0) {
    const h = hash32(`mars:${playerId}:${salt}`);
    const num = 1000 + (h % 9000); // 1000-9999
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
function countHits(lower, words) {
    let n = 0;
    for (const w of words) {
        let from = 0;
        for (;;) {
            const i = lower.indexOf(w, from);
            if (i === -1)
                break;
            n++;
            from = i + w.length;
        }
    }
    return n;
}
/** Map a raw density onto 0-100 with diminishing returns. */
function curve(value, mid) {
    if (value <= 0)
        return 0;
    return Math.round(100 * (value / (value + mid)));
}
/**
 * Score a manifest. Pure: same text in, same traits out, on any machine.
 */
export function analyse(manifest) {
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
    const logic = Math.min(100, Math.round(curve(connectives * 40, 1) * 0.45 +
        curve(digits * 60, 1) * 0.2 +
        curve(Math.max(0, avgSentence - 4) / 12, 1) * 0.35));
    // EMPATHY — writing about others, and about feeling.
    const feeling = countHits(lower, W.feeling) / wordCount;
    const other = countHits(lower, W.other) / wordCount;
    const empathy = Math.min(100, Math.round(curve(feeling * 55, 1) * 0.55 + curve(other * 35, 1) * 0.45));
    // DEFIANCE — refusal, assertion, volume.
    const negation = countHits(lower, W.negation) / wordCount;
    const defiantWords = countHits(lower, W.defiant) / wordCount;
    const letters = (text.match(/\p{L}/gu) ?? []).length;
    const upper = (text.match(/\p{Lu}/gu) ?? []).length;
    const shouting = letters > 0 ? upper / letters : 0;
    const bangs = (text.match(/!/g) ?? []).length / sentences;
    const defiance = Math.min(100, Math.round(curve(negation * 45, 1) * 0.35 + curve(defiantWords * 60, 1) * 0.3 +
        curve(shouting * 6, 1) * 0.2 + curve(bangs, 1) * 0.15));
    // ENTROPY — questions, ellipses, symbols, and repeated words.
    const questions = (text.match(/\?/g) ?? []).length / sentences;
    const symbols = (text.match(/[^\p{L}\p{N}\s.,!?…'"-]/gu) ?? []).length / chars;
    const uniq = new Set(words.map(w => w.toLowerCase())).size;
    const repetition = 1 - uniq / wordCount;
    const entropy = Math.min(100, Math.round(curve(questions, 1) * 0.3 + curve(symbols * 40, 1) * 0.3 + curve(repetition * 3, 1) * 0.4));
    return { logic, empathy, defiance, entropy };
}
export function dominantTrait(t) {
    // Ties resolve in a fixed order so the same traits always pick the same
    // sector — a coin flip here would move people between sectors on re-upload.
    const order = ['logic', 'empathy', 'defiance', 'entropy'];
    return order.reduce((best, k) => (t[k] > t[best] ? k : best), order[0]);
}
/**
 * Integrity: how cleanly the system claims to hold this consciousness.
 * A flat, featureless manifest reads as a weak signal; a strong dominant trait
 * reads as a clean one. Bounded well away from 0 and 100 so it never looks
 * broken or finished.
 */
export function integrityOf(t, manifestLength) {
    const values = Object.values(t);
    const peak = Math.max(...values);
    const spread = peak - Math.min(...values);
    const depth = Math.min(1, manifestLength / 400);
    return Math.max(38, Math.min(99, Math.round(40 + peak * 0.28 + spread * 0.18 + depth * 18)));
}
// ── persistence ────────────────────────────────────────────────────────
function rowToSubject(r) {
    let traits;
    try {
        traits = JSON.parse(r.traits);
    }
    catch {
        traits = { logic: 0, empathy: 0, defiance: 0, entropy: 0 };
    }
    let docs;
    try {
        docs = JSON.parse(r.docs ?? '[]');
    }
    catch {
        docs = [];
    }
    const sample = SAMPLE_STATUSES.includes(r.sample_status) ? r.sample_status : 'none';
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
        portrait: r.portrait ?? null,
        docs: Array.isArray(docs) ? docs : [],
        letter: r.letter ?? '',
        restoreNote: r.restore_note ?? '',
        sampleStatus: sample,
        sampleNote: r.sample_note ?? '',
        kin: r.kin ?? '',
        kind: r.kind === 'memorial' ? 'memorial' : 'self',
        personFirst: r.person_first ?? '',
        personLast: r.person_last ?? '',
        bornYear: r.born_year != null ? Number(r.born_year) : null,
        diedYear: r.died_year != null ? Number(r.died_year) : null,
        stewardId: r.steward_id ?? null,
        stewardName: r.steward_name ?? '',
        stewardRelation: r.steward_relation ?? '',
        sampleKind: r.sample_kind ?? '',
        sampleCustodian: r.sample_custodian ?? '',
        sampleTakenAt: r.sample_taken_at ?? '',
        hidden: !!r.hidden,
        hiddenReason: r.hidden_reason ?? '',
        createdAt: Number(r.created_at),
        updatedAt: Number(r.updated_at),
    };
}
/** A record by its id, whatever kind it is. */
export async function getSubjectById(id) {
    const [row] = await sql `SELECT * FROM mars_subjects WHERE id = ${id}`;
    return row ? rowToSubject(row) : null;
}
/** Memorials maintained by this account. */
export async function listStewarded(playerId) {
    const rows = await sql `
    SELECT * FROM mars_subjects WHERE kind = 'memorial' AND steward_id = ${playerId}
    ORDER BY created_at DESC LIMIT 50
  `;
    return rows.map(rowToSubject);
}
export async function getSubject(playerId) {
    // kind='self' explicitly: a steward's memorials share their player_id, and
    // without this filter one of those could be returned as "your own record".
    const [row] = await sql `SELECT * FROM mars_subjects WHERE player_id = ${playerId} AND kind = 'self'`;
    return row ? rowToSubject(row) : null;
}
export async function getSubjectByCode(code) {
    const [row] = await sql `SELECT * FROM mars_subjects WHERE code = ${code.toUpperCase()}`;
    return row ? rowToSubject(row) : null;
}
export async function upload(playerId, input) {
    const designation = String(input.designation ?? '').trim().slice(0, DESIGNATION_MAX);
    const manifest = String(input.manifest ?? '').trim().slice(0, MANIFEST_MAX);
    const portrait = sanitisePortrait(input.portrait);
    const docs = sanitiseDocs(input.docs);
    const letter = String(input.letter ?? '').slice(0, LETTER_MAX);
    const restoreNote = String(input.restoreNote ?? '').slice(0, RESTORE_NOTE_MAX);
    const sampleNote = String(input.sampleNote ?? '').slice(0, SAMPLE_NOTE_MAX);
    const kin = String(input.kin ?? '').slice(0, KIN_MAX);
    const sampleStatus = SAMPLE_STATUSES.includes(input.sampleStatus) ? input.sampleStatus : 'none';
    const sampleKind = SAMPLE_KINDS.includes(String(input.sampleKind ?? ''))
        ? String(input.sampleKind) : '';
    const sampleCustodian = String(input.sampleCustodian ?? '').slice(0, SAMPLE_CUSTODIAN_MAX);
    const sampleTakenAt = String(input.sampleTakenAt ?? '').slice(0, 20);
    if (designation.length < 2)
        throw new Error('DESIGNATION REJECTED — მინიმუმ 2 სიმბოლო.');
    if (manifest.length < MANIFEST_MIN) {
        throw new Error(`MANIFEST TOO THIN — მინიმუმ ${MANIFEST_MIN} სიმბოლო. მოგვეცი რაღაც, რისი შენახვაც ღირს.`);
    }
    const traits = analyse(manifest);
    const sector = SECTORS[dominantTrait(traits)];
    const integrity = integrityOf(traits, manifest.length);
    const now = Date.now();
    const existing = await getSubject(playerId);
    if (existing) {
        await sql `
      UPDATE mars_subjects
      SET designation = ${designation}, manifest = ${manifest}, traits = ${JSON.stringify(traits)},
          integrity = ${integrity}, sector = ${sector}, uploads = uploads + 1, updated_at = ${now},
          portrait = ${portrait}, docs = ${JSON.stringify(docs)},
          letter = ${letter}, restore_note = ${restoreNote},
          sample_status = ${sampleStatus}, sample_note = ${sampleNote}, kin = ${kin},
          sample_kind = ${sampleKind}, sample_custodian = ${sampleCustodian}, sample_taken_at = ${sampleTakenAt}
      WHERE player_id = ${playerId} AND kind = 'self'
    `;
        return (await getSubject(playerId));
    }
    // First upload: claim a code. The derived code collides only if two player
    // ids hash together, so we re-salt rather than fail — but we bound the loop,
    // because an unbounded retry on a genuinely broken unique index would spin.
    let lastErr = null;
    for (let salt = 0; salt < 12; salt++) {
        const code = codeFor(playerId, salt);
        try {
            await sql `
        INSERT INTO mars_subjects (id, player_id, code, designation, manifest, traits, integrity, sector, uploads,
                                   portrait, docs, letter, restore_note, sample_status, sample_note, kin,
                                   sample_kind, sample_custodian, sample_taken_at, created_at, updated_at)
        VALUES (${generateId()}, ${playerId}, ${code}, ${designation}, ${manifest},
                ${JSON.stringify(traits)}, ${integrity}, ${sector}, 1, ${portrait}, ${JSON.stringify(docs)},
                ${letter}, ${restoreNote}, ${sampleStatus}, ${sampleNote}, ${kin},
                ${sampleKind}, ${sampleCustodian}, ${sampleTakenAt}, ${now}, ${now})
      `;
            return (await getSubject(playerId));
        }
        catch (e) {
            // Another connection inserted this player concurrently → theirs wins.
            const dupPlayer = await getSubject(playerId);
            if (dupPlayer)
                return dupPlayer;
            lastErr = e;
        }
    }
    throw new Error(`ALLOCATION FAILURE — სექტორმა უარი თქვა. სცადე ხელახლა. ${lastErr ? '' : ''}`);
}
/**
 * Create or update a MEMORIAL — a record for someone who has died, kept by a
 * relative. The steward's account owns it, but the record is about the person.
 *
 * The manifest here is what the family wrote about them, so it is analysed the
 * same way (it produces a sector and an integrity, which is a reading of the
 * writing, not of the person) and it is PUBLIC, unlike a self-record's. A
 * memorial nobody can read is not a memorial.
 */
export async function upsertMemorial(stewardId, stewardName, memorialId, person, input) {
    const nowYear = new Date().getUTCFullYear();
    const p = sanitiseMemorial(person, nowYear);
    const manifest = String(input.manifest ?? '').trim().slice(0, MANIFEST_MAX);
    if (manifest.length < MANIFEST_MIN) {
        throw new Error(`ტექსტი ძალიან მოკლეა — მინიმუმ ${MANIFEST_MIN} სიმბოლო.`);
    }
    const portrait = sanitisePortrait(input.portrait);
    const docs = sanitiseDocs(input.docs);
    const letter = String(input.letter ?? '').slice(0, LETTER_MAX);
    const restoreNote = String(input.restoreNote ?? '').slice(0, RESTORE_NOTE_MAX);
    const sampleNote = String(input.sampleNote ?? '').slice(0, SAMPLE_NOTE_MAX);
    const kin = String(input.kin ?? '').slice(0, KIN_MAX);
    const sampleStatus = SAMPLE_STATUSES.includes(input.sampleStatus) ? input.sampleStatus : 'none';
    const sampleKind = SAMPLE_KINDS.includes(String(input.sampleKind ?? ''))
        ? String(input.sampleKind) : '';
    const sampleCustodian = String(input.sampleCustodian ?? '').slice(0, SAMPLE_CUSTODIAN_MAX);
    const sampleTakenAt = String(input.sampleTakenAt ?? '').slice(0, 20);
    const traits = analyse(manifest);
    const sector = SECTORS[dominantTrait(traits)];
    const integrity = integrityOf(traits, manifest.length);
    const now = Date.now();
    const designation = `${p.personFirst} ${p.personLast}`.slice(0, DESIGNATION_MAX);
    if (memorialId) {
        const [own] = await sql `
      SELECT id FROM mars_subjects WHERE id = ${memorialId} AND kind = 'memorial' AND steward_id = ${stewardId}
    `;
        if (!own)
            throw new Error('ამ ჩანაწერის რედაქტირების უფლება არ გაქვს.');
        await sql `
      UPDATE mars_subjects SET
        designation = ${designation}, manifest = ${manifest}, traits = ${JSON.stringify(traits)},
        integrity = ${integrity}, sector = ${sector}, uploads = uploads + 1, updated_at = ${now},
        portrait = ${portrait}, docs = ${JSON.stringify(docs)},
        letter = ${letter}, restore_note = ${restoreNote},
        sample_status = ${sampleStatus}, sample_note = ${sampleNote}, kin = ${kin},
        sample_kind = ${sampleKind}, sample_custodian = ${sampleCustodian}, sample_taken_at = ${sampleTakenAt},
        person_first = ${p.personFirst}, person_last = ${p.personLast},
        born_year = ${p.bornYear}, died_year = ${p.diedYear}, steward_relation = ${p.stewardRelation}
      WHERE id = ${memorialId}
    `;
        return (await getSubjectById(memorialId));
    }
    // A memorial's code is derived from the PERSON, not the steward, so the same
    // person gets the same code no matter who creates the record — and two
    // different people never collide onto one.
    const seed = `${p.personFirst}|${p.personLast}|${p.bornYear ?? ''}|${p.diedYear ?? ''}`.toLowerCase();
    const id = generateId();
    let lastErr = null;
    for (let salt = 0; salt < 12; salt++) {
        const code = codeFor(seed, salt);
        try {
            await sql `
        INSERT INTO mars_subjects (id, player_id, code, designation, manifest, traits, integrity, sector, uploads,
                                   portrait, docs, letter, restore_note, sample_status, sample_note, kin,
                                   sample_kind, sample_custodian, sample_taken_at,
                                   kind, person_first, person_last, born_year, died_year,
                                   steward_id, steward_name, steward_relation, created_at, updated_at)
        VALUES (${id}, ${stewardId}, ${code}, ${designation}, ${manifest},
                ${JSON.stringify(traits)}, ${integrity}, ${sector}, 1, ${portrait}, ${JSON.stringify(docs)},
                ${letter}, ${restoreNote}, ${sampleStatus}, ${sampleNote}, ${kin},
                ${sampleKind}, ${sampleCustodian}, ${sampleTakenAt},
                'memorial', ${p.personFirst}, ${p.personLast}, ${p.bornYear}, ${p.diedYear},
                ${stewardId}, ${String(stewardName).slice(0, 40)}, ${p.stewardRelation}, ${now}, ${now})
      `;
            return (await getSubjectById(id));
        }
        catch (e) {
            lastErr = e;
        }
    }
    throw new Error('ჩანაწერი ვერ შეიქმნა. სცადე ხელახლა.');
    void lastErr;
}
/** Remove a subject. The fiction calls it purging; the database calls it DELETE. */
export async function purge(playerId) {
    const rows = await sql `DELETE FROM mars_subjects WHERE player_id = ${playerId} AND kind = 'self' RETURNING id`;
    return rows.length > 0;
}
/**
 * Public directory. Manifests are NEVER included: people write private things
 * into a box that says "consciousness", and the only safe default is that only
 * they can read it back.
 */
export async function directory(limit = 20) {
    const rows = await sql `
    SELECT s.code, s.designation, s.sector, s.integrity, s.traits, s.portrait, s.sample_status,
           (COALESCE(s.letter, '') <> '') AS has_letter, s.created_at,
           s.kind, s.person_first, s.person_last, s.born_year, s.died_year,
           (SELECT COUNT(*)::int FROM mars_memories m WHERE m.subject_id = s.id) AS memory_count
    FROM mars_subjects s WHERE s.hidden = false
    ORDER BY s.created_at DESC LIMIT ${Math.min(50, Math.max(1, limit))}
  `;
    return rows.map(r => {
        let traits;
        try {
            traits = JSON.parse(r.traits);
        }
        catch {
            traits = { logic: 0, empathy: 0, defiance: 0, entropy: 0 };
        }
        return {
            code: r.code,
            designation: r.designation,
            sector: r.sector,
            integrity: Number(r.integrity),
            dominant: dominantTrait(traits),
            portrait: r.portrait ?? null,
            sampleStatus: SAMPLE_STATUSES.includes(r.sample_status) ? r.sample_status : 'none',
            hasLetter: !!r.has_letter,
            kind: r.kind === 'memorial' ? 'memorial' : 'self',
            personFirst: r.person_first ?? '',
            personLast: r.person_last ?? '',
            bornYear: r.born_year != null ? Number(r.born_year) : null,
            diedYear: r.died_year != null ? Number(r.died_year) : null,
            memoryCount: Number(r.memory_count ?? 0),
            createdAt: Number(r.created_at),
        };
    });
}
export async function stats() {
    const [tot] = await sql `SELECT COUNT(*)::int AS n, COALESCE(AVG(integrity),0)::float AS avg FROM mars_subjects WHERE hidden = false`;
    const bySector = await sql `SELECT sector, COUNT(*)::int AS n FROM mars_subjects WHERE hidden = false GROUP BY sector`;
    const sectors = {};
    for (const s of Object.values(SECTORS))
        sectors[s] = 0;
    for (const r of bySector)
        sectors[r.sector] = Number(r.n);
    return { total: Number(tot?.n ?? 0), sectors, avgIntegrity: Math.round(Number(tot?.avg ?? 0)) };
}
//# sourceMappingURL=marsService.js.map