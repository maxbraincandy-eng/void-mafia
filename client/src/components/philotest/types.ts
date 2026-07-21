// ფილოსოფიური პიროვნების ტესტი — shared types.
// Ten opposed value-axes; every choice nudges several of them. The archetype
// is computed from the whole pattern, never from a single answer.

export type Axis =
  | 'freedom'      // თავისუფლება ↔ უსაფრთხოება
  | 'truth'        // ჭეშმარიტება ↔ ბედნიერება
  | 'individual'   // ინდივიდი ↔ საზოგადოება
  | 'reason'       // გონება ↔ გრძნობა
  | 'control'      // კონტროლი ↔ მიღება
  | 'meaning'      // აზრი ↔ სიამოვნება
  | 'sacrifice'    // თავგანწირვა ↔ თვითგადარჩენა
  | 'authenticity' // ავთენტურობა ↔ კომფორტი
  | 'justice'      // სამართალი ↔ შემწყნარებლობა
  | 'identity';    // იდენტობა ↔ ტრანსფორმაცია

export const AXES: Axis[] = ['freedom', 'truth', 'individual', 'reason', 'control', 'meaning', 'sacrifice', 'authenticity', 'justice', 'identity'];

export const AXIS_META: Record<Axis, { poleA: string; poleB: string; dna: string }> = {
  freedom:      { poleA: 'თავისუფლება', poleB: 'უსაფრთხოება', dna: 'თავისუფლება' },
  truth:        { poleA: 'ჭეშმარიტება', poleB: 'ბედნიერება', dna: 'ჭეშმარიტება' },
  individual:   { poleA: 'ინდივიდი', poleB: 'საზოგადოება', dna: 'ინდივიდუალიზმი' },
  reason:       { poleA: 'გონება', poleB: 'გრძნობა', dna: 'გონება' },
  control:      { poleA: 'კონტროლი', poleB: 'მიღება', dna: 'კონტროლი' },
  meaning:      { poleA: 'აზრი', poleB: 'სიამოვნება', dna: 'აზრი' },
  sacrifice:    { poleA: 'თავგანწირვა', poleB: 'თვითგადარჩენა', dna: 'თავგანწირვა' },
  authenticity: { poleA: 'ავთენტურობა', poleB: 'კომფორტი', dna: 'ავთენტურობა' },
  justice:      { poleA: 'სამართალი', poleB: 'შემწყნარებლობა', dna: 'სამართლიანობა' },
  identity:     { poleA: 'იდენტობა', poleB: 'ტრანსფორმაცია', dna: 'იდენტობა' },
};

/** Positive weight → pole A; negative → pole B. Range roughly -3..3. */
export type Weights = Partial<Record<Axis, number>>;

export interface PTChoice {
  text: string;
  w: Weights;
}

export interface PTScenario {
  id: string;
  /** Atmospheric heading — must NOT reveal the question's category. */
  title: string;
  text: string;
  choices: PTChoice[];
  /** If set, this scenario lives in the adaptive deep-pool for that axis. */
  deep?: Axis;
}

export interface PTAnswer { scenarioId: string; choiceIdx: number }

export interface Archetype {
  id: string;
  ka: string;      // ქართული სახელი
  en: string;      // ინგლისური ქვესათაური
  quote: string;   // ერთსტრიქონიანი ეპიგრაფი
  body: string;    // პროფილის ტექსტი
  vec: Weights;    // -1..1 per axis
  color: string;
}

export interface Influence { name: string; vec: Weights }

export interface PTResult {
  primary: Archetype;
  secondary: Archetype;
  tension: Archetype;
  dna: Record<Axis, number>;              // 0..100 toward pole A
  strongestAxis: Axis;
  contradictionAxis: Axis | null;
  blindSpotAxis: Axis;
  influences: { name: string; pct: number }[];
  finalChoice: number;                    // index of the meta-question answer
}
