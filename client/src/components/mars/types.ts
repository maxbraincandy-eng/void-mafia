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
export interface DirEntry {
  code: string; designation: string; sector: string;
  integrity: number; dominant: TraitKey; portrait: string | null;
  sampleStatus: SampleStatus; hasLetter: boolean; createdAt: number;
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
