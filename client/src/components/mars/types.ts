/** Shapes mirrored from server/src/services/marsService.ts. */
export type TraitKey = 'logic' | 'empathy' | 'defiance' | 'entropy';
export type Traits = Record<TraitKey, number>;

export interface MarsDoc { name: string; type: string; size: number; data: string }

export type SampleStatus = 'none' | 'pledged' | 'stored';

export interface Subject {
  code: string; designation: string; manifest: string;
  traits: Traits; integrity: number; sector: string; uploads: number;
  portrait: string | null; docs: MarsDoc[];
  letter: string; restoreNote: string;
  sampleStatus: SampleStatus; sampleNote: string; kin: string;
  lifeStatus: LifeStatus; bornYear: number | null; diedYear: number | null;
  createdAt: number; updatedAt: number;
}

/** What a sample pledge means, said plainly. */
export const SAMPLE_INFO: Record<SampleStatus, { label: string; hint: string; color: string; icon: string }> = {
  none:    { label: 'არ არის', hint: 'ბიოლოგიური ნიმუში არ გაქვს აღრიცხული', color: '148,163,184', icon: '—' },
  pledged: { label: 'დაპირებული', hint: 'აპირებ ნიმუშის შენახვას', color: '255,212,90', icon: '◐' },
  stored:  { label: 'შენახული', hint: 'ნიმუში უკვე შენახული გაქვს', color: '57,255,106', icon: '●' },
};
export interface Stats { total: number; sectors: Record<string, number>; avgIntegrity: number }
export interface Limits {
  manifestMin: number; manifestMax: number; designationMax: number;
  docsMax: number; docBytesMax: number;
  letterMax: number; restoreNoteMax: number; kinMax: number; sampleNoteMax: number;
}
export type RecordKind = 'self' | 'memorial';
export type LifeStatus = 'alive' | 'deceased';

export const LIFE_INFO: Record<LifeStatus, { label: string; short: string; color: string; icon: string }> = {
  alive:    { label: 'ცოცხალია',    short: 'ცოცხლები',      color: '57,255,106',  icon: '◉' },
  deceased: { label: 'გარდაცვლილი', short: 'გარდაცვლილები', color: '125,249,255', icon: '🕯' },
};

export interface Memory {
  id: string; authorId: string; authorName: string;
  relation: string; text: string; photo: string | null; createdAt: number;
}

/** What `mars:open` returns — the public view of a record. */
export interface RecordView {
  id: string; code: string; designation: string; sector: string;
  integrity: number; traits: Traits; portrait: string | null;
  kind: RecordKind; personFirst: string; personLast: string;
  bornYear: number | null; diedYear: number | null; lifeStatus: LifeStatus;
  stewardName: string; stewardRelation: string;
  sampleStatus: SampleStatus; createdAt: number;
  memoryCount: number; manifest: string; canEdit: boolean;
  /** Set when the record has been withdrawn from view. */
  withdrawn?: boolean;
  withdrawnReason?: string;
}

export const REPORT_REASON_LABEL: Record<string, string> = {
  alive: 'ეს ადამიანი ცოცხალია',
  not_authorised: 'შემქმნელს ამის უფლება არ აქვს',
  false_info: 'ინფორმაცია მცდარია',
  offensive: 'შეურაცხმყოფელი შიგთავსი',
  duplicate: 'დუბლიკატი',
  other: 'სხვა',
};

export interface MarsReport {
  id: string; subjectId: string; reporterId: string; reporterName: string;
  reason: string; note: string; status: 'open' | 'dismissed' | 'upheld';
  createdAt: number;
  code?: string; designation?: string; kind?: string; stewardName?: string; hidden?: boolean;
}

export interface PrivateFields {
  letter: string; restoreNote: string; kin: string;
  sampleNote: string; sampleKind: string; sampleCustodian: string; sampleTakenAt: string;
  docs: MarsDoc[];
}

export interface Passage {
  text: string;
  sourceKind: 'manifest' | 'letter' | 'note' | 'memory';
  sourceAuthor: string;
  sourceAt: number;
}
export interface SpeakReply {
  passage: Passage | null; score: number; note: string; personName: string;
  /** What this record can actually be asked about, from its own text. */
  topics?: string[];
  /** The record holds too little to answer much yet. */
  thin?: boolean;
}

/** Physical sample kinds. Registry only — nothing is collected here. */
export const SAMPLE_KIND_LABEL: Record<string, string> = {
  hair: 'თმის ღერი (ფესვით)',
  swab: 'ლოყის ნაცხი',
  blood_card: 'სისხლის ბარათი',
  tooth: 'კბილი',
  other: 'სხვა',
};


/**
 * Georgian noun cases for names — kept in step with server/src/services/georgian.ts.
 *
 * Duplicated rather than shared because the client and the server are separate
 * builds with no common package, and a nine-line function is a smaller cost
 * than a build-system change. If one side changes, change the other.
 *
 * The point: `${name}-ის` produced "ბატონი მაქსი-ის", which is the form
 * Georgian uses for FOREIGN words. On a memorial, a person's own name has to
 * decline properly. Only the last word inflects; a non-Georgian name keeps the
 * hyphen, which is correct for foreign words.
 */
export function genitive(nameRaw: string): string {
  const name = String(nameRaw ?? '').trim();
  if (!name) return name;
  const parts = name.split(/\s+/);
  const last = parts[parts.length - 1];
  if (!/^[ა-ჿ]+$/.test(last)) return `${name}-ის`;
  const end = last.slice(-1);
  parts[parts.length - 1] =
    end === 'ი' || end === 'ე' ? `${last.slice(0, -1)}ის`
      : end === 'ა' || end === 'ო' || end === 'უ' ? `${last}ს`
        : `${last}ის`;
  return parts.join(' ');
}

/** Lifespan as it would read on a stone. */
export function lifespan(born: number | null, died: number | null): string {
  if (born && died) return `${born} — ${died}`;
  if (born) return `დაბ. ${born}`;
  if (died) return `გარდ. ${died}`;
  return '';
}

/**
 * The one address a record has.
 *
 * Always /mars/r/CODE, on every host. The standalone site is also served at the
 * root of any "mars." host, but the /mars prefix works there too — and the
 * server only injects the per-record share card (title, description, portrait)
 * for THIS path, because a crawler runs no JavaScript and would otherwise see
 * the generic landing page for every person in the archive.
 */
export function recordUrl(code: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/mars/r/${encodeURIComponent(code)}`;
}

export interface DirEntry {
  code: string; designation: string; sector: string;
  integrity: number; dominant: TraitKey; portrait: string | null;
  sampleStatus: SampleStatus; hasLetter: boolean;
  kind: RecordKind; personFirst: string; personLast: string;
  bornYear: number | null; diedYear: number | null; lifeStatus: LifeStatus;
  memoryCount: number;
  createdAt: number;
}

/** Each axis, said in a way a person can act on. */
export const TRAIT_INFO: Record<TraitKey, { label: string; ka: string; hint: string; color: string }> = {
  logic:    { label: 'LOGIC',    ka: 'ლოგიკა',        hint: 'სტრუქტურა და მიზეზ-შედეგი',   color: '#39ff6a' },
  empathy:  { label: 'EMPATHY',  ka: 'ემპათია',       hint: 'სხვები და გრძნობები',          color: '#7df9ff' },
  defiance: { label: 'DEFIANCE', ka: 'წინააღმდეგობა', hint: 'უარყოფა და მტკიცება',          color: '#ff5f6d' },
  entropy:  { label: 'ENTROPY',  ka: 'ენტროპია',      hint: 'კითხვები და გამეორება',        color: '#ffd45a' },
};

/** What each sector means, in one sentence. */
export const SECTOR_INFO: Record<string, { ka: string; why: string; color: string }> = {
  AXIOM:    { ka: 'აქსიომა', why: 'შენს ტექსტში წესრიგი და მიზეზ-შედეგი ჭარბობს.',  color: '#39ff6a' },
  CHORUS:   { ka: 'გუნდი',   why: 'შენ სხვებზე წერ — ადამიანებზე და გრძნობებზე.',    color: '#7df9ff' },
  FRACTURE: { ka: 'რღვევა',  why: 'შენს ტექსტში უარყოფა და მტკიცება ჭარბობს.',       color: '#ff5f6d' },
  STATIC:   { ka: 'ხმაური',  why: 'შენს ტექსტში კითხვები და გამეორება ჭარბობს.',     color: '#ffd45a' },
};

export function sectorOf(name: string) {
  return SECTOR_INFO[name] ?? SECTOR_INFO.AXIOM;
}

export function dominantOf(t: Traits): TraitKey {
  const order: TraitKey[] = ['logic', 'empathy', 'defiance', 'entropy'];
  return order.reduce((b, k) => (t[k] > t[b] ? k : b), order[0]);
}

/** Human file size. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
