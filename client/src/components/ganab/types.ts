// განაბ სიმულატორი — core types.
// Text roguelike: street → skhodkas → zone → coronation. Permadeath.

export interface GanabStats {
  /** ავტორიტეტი — რა დონეზე გისმენენ */
  authority: number;
  /** ქუჩის გაგება — ლოგიკა და წესების ცოდნა */
  street: number;
  /** სიტყვის წონა — სხვისი აზრის გადაწონვა */
  charisma: number;
  /** კავშირები — ნაცნობი განაბები/ავტორიტეტები */
  network: number;
  /** ოფშიაკის წილი (₾) */
  obshiak: number;
}

export type GanabStatKey = keyof GanabStats;

export type GanabRank =
  | 'birzhis_bichi'
  | 'ubnis_bichi'
  | 'dzveli_bichi'
  | 'muzhiki'
  | 'makurebeli'
  | 'zonis_makurebeli'
  | 'kandidati'
  | 'kanonieri';

export const RANK_LABELS: Record<GanabRank, string> = {
  birzhis_bichi: 'ბირჟის ბიჭი',
  ubnis_bichi: 'უბნის ბიჭი',
  dzveli_bichi: 'ძველი ბიჭი',
  muzhiki: 'მუჟიკი',
  makurebeli: 'მაყურებელი',
  zonis_makurebeli: 'ზონის მაყურებელი',
  kandidati: 'კანდიდატი',
  kanonieri: 'კანონიერი ქურდი',
};

export interface DecisionRecord {
  sceneId: string;
  choiceText: string;
}

export interface GanabState {
  nickname: string;
  stats: GanabStats;
  rank: GanabRank;
  phase: 1 | 2 | 3 | 4;
  sceneId: string;
  flags: Record<string, string | number | boolean>;
  log: DecisionRecord[];
  dead: boolean;
  deathReason: string | null;
  won: boolean;
}

export interface GanabChoice {
  text: string;
  /** Hidden option — shown only when the stat is high enough (you wouldn't even think of it otherwise). */
  requires?: Partial<Record<GanabStatKey, number>>;
  /** Visible attempt that can fail: below min → failNext instead of next. */
  check?: { stat: GanabStatKey; min: number; failNext: string };
  /** Stat deltas applied on pick (before check resolution). */
  effects?: Partial<Record<GanabStatKey, number>>;
  setFlags?: Record<string, string | number | boolean>;
  /**
   * Next scene id, or a directive:
   *  '@death:<reason>' — permadeath
   *  '@end_step'       — end of currently shipped content (cliffhanger)
   */
  next: string;
}

export interface GanabScene {
  id: string;
  /** Location / chapter header, e.g. 'ბირჟა · საღამო' */
  title?: string;
  /** Who talks — omitted for narrator. */
  speaker?: string;
  text: string;
  choices: GanabChoice[];
}

export interface GraveyardEntry {
  nickname: string;
  rank: GanabRank;
  phase: number;
  reason: string;
  ts: number;
}
