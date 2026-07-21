/**
 * ბატონი მაქსის თავსატეხი — types.
 *
 * Not an IQ test and not a right/wrong quiz: every answer silently shifts a set
 * of hidden psychological traits, and the session ends with an archetype
 * profile instead of a score. Dilemma data lives in dilemmas.ts, scoring and
 * archetype matching in engine.ts.
 */

export type MPTrait =
  | 'independence'
  | 'rationality'
  | 'conformity'
  | 'ambition'
  | 'risk'
  | 'status'
  | 'skepticism'
  | 'moralFlex';

export const MP_TRAITS: MPTrait[] = [
  'independence', 'rationality', 'conformity', 'ambition',
  'risk', 'status', 'skepticism', 'moralFlex',
];

export const MP_TRAIT_META: Record<MPTrait, { ka: string; en: string }> = {
  independence: { ka: 'დამოუკიდებლობა',      en: 'Independence' },
  rationality:  { ka: 'რაციონალურობა',       en: 'Rationality' },
  conformity:   { ka: 'კონფორმულობა',        en: 'Conformity' },
  ambition:     { ka: 'ამბიცია',             en: 'Ambition' },
  risk:         { ka: 'რისკის მადა',         en: 'Risk tolerance' },
  status:       { ka: 'აღიარების წყურვილი',  en: 'Status desire' },
  skepticism:   { ka: 'სკეპტიციზმი',         en: 'Skepticism' },
  moralFlex:    { ka: 'მორალური მოქნილობა',  en: 'Moral flexibility' },
};

export type MPWeights = Partial<Record<MPTrait, number>>;

export interface MPAnswerDef {
  text: string;
  w: MPWeights;
  /** Mr. Max's commentary shown right after this answer is picked. */
  c: string;
}

export type MPCategory =
  | 'social_influence' | 'status' | 'conformity' | 'morality'
  | 'freedom' | 'truth' | 'ambition' | 'power' | 'human_nature' | 'mirror';

export interface MPDilemma {
  id: string;
  num: number;
  title: string;
  category: MPCategory;
  text: string;
  answers: MPAnswerDef[];
}

export interface MPAnswer { dilemmaId: string; choiceIdx: number }

export interface MPArchetype {
  id: string;
  ka: string;
  en: string;
  /** Mr. Max's one-line verdict on this archetype. */
  quote: string;
  body: string;
  vec: Record<MPTrait, number>; // 0..100 target profile
  color: string;
}

export interface MPResult {
  primary: MPArchetype;
  secondary: MPArchetype;
  traits: Record<MPTrait, number>; // 0..100
  date: number;
}

export type MPBoardScope = 'independence' | 'rationality' | 'ambition' | 'skepticism' | 'risk' | 'conformity';

export const MP_BOARD_SCOPES: { key: MPBoardScope; ka: string }[] = [
  { key: 'independence', ka: 'ყველაზე დამოუკიდებელი' },
  { key: 'rationality',  ka: 'ყველაზე რაციონალური' },
  { key: 'ambition',     ka: 'ყველაზე ამბიციური' },
  { key: 'skepticism',   ka: 'ყველაზე სკეპტიკური' },
  { key: 'risk',         ka: 'ყველაზე რისკიანი' },
  { key: 'conformity',   ka: 'ყველაზე კონფორმისტი' },
];

export interface MPBoardRow {
  rank: number;
  userId: string;
  username: string;
  avatar: string;
  avatarUrl: string | null;
  archetype: string;
  archetypeKa: string;
  score: number; // value of the scoped trait, 0..100
  traits: Record<MPTrait, number>;
  updatedAt: number;
}
