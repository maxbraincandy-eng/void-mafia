// ── ნუარი — animated branching noir adventure ─────────────────────────
// A scene graph, like ganab's, but every scene also names a BACKDROP: the
// engine stays pure data while the renderer turns that name into an animated
// SVG set piece. That split is deliberate — the story can be written and
// verified (reachability, dead ends) without touching a single pixel.

/** The five things the city measures you by. */
export type StatKey = 'nerve' | 'cunning' | 'trust' | 'heat' | 'money';

export const STAT_META: Record<StatKey, { ka: string; hint: string; good: 'high' | 'low' }> = {
  nerve:   { ka: 'ნერვი',     hint: 'სიმშვიდე, როცა იარაღი შენკენაა მიმართული', good: 'high' },
  cunning: { ka: 'ეშმაკობა',  hint: 'სიტყვით გამოსვლა იქიდან, საიდანაც ძალით ვერ გამოხვალ', good: 'high' },
  trust:   { ka: 'ნდობა',     hint: 'რამდენად გენდობა ოჯახი', good: 'high' },
  heat:    { ka: 'ყურადღება', hint: 'რამდენად აინტერესებ პოლიციას — რაც ნაკლებია, მით უკეთესი', good: 'low' },
  money:   { ka: 'ფული',      hint: 'ლარი ჯიბეში', good: 'high' },
};

/** Which animated set piece plays behind a scene. */
export type Backdrop =
  | 'rain_street'   // neon-lit street, heavy rain
  | 'bar'           // smoky bar, slow ceiling fan
  | 'office'        // the boss's desk, one lamp
  | 'docks'         // harbour at night, fog and cranes
  | 'car'           // inside a moving car, streetlights sweeping past
  | 'alley'         // one lamp, rats, wet brick
  | 'room'          // cramped apartment, blinds cutting the light
  | 'interrogation';// a table, a bulb, and a mirror that is not a mirror

/**
 * A gate on a choice. Every clause present must hold — a rule may combine a
 * stat bound AND a flag, and both are then required. `stat` is optional so a
 * rule can test a flag alone.
 */
export interface Requirement {
  stat?: StatKey;
  /** Minimum inclusive. */
  min?: number;
  /** Maximum inclusive. */
  max?: number;
  /** Flag that must be set (any truthy value). */
  flag?: string;
}

/**
 * A skill test attached to a choice. This is what turns a decision into an act:
 * you don't merely pick "hold your nerve", you have to actually hold.
 *
 *   hold   — keep a finger down for `target` ms while the frame shakes
 *   tap    — reach `target` taps before the clock runs out
 *   timing — stop a sweeping marker inside a zone `target`% wide
 *   search — find `target` glints hidden in the illustration
 */
export type TestKind = 'hold' | 'tap' | 'timing' | 'search';

export interface ChoiceTest {
  kind: TestKind;
  /** Shown over the minigame, in Georgian. */
  prompt: string;
  /** Difficulty knob, read per kind (see TestKind). */
  target: number;
  /** Milliseconds allowed. */
  ms: number;
  /** Scene id (or '@end:x') taken when the test is FAILED. */
  onFail: string;
  /** Applied instead of the choice's own effects when failed. */
  failEffects?: Partial<Record<StatKey, number>>;
}

export interface Choice {
  text: string;
  /** Turns this choice into something you perform, not just select. */
  test?: ChoiceTest;
  /** Stat deltas applied when picked. */
  effects?: Partial<Record<StatKey, number>>;
  setFlags?: Record<string, boolean | string>;
  /** Shown but locked unless every requirement passes. */
  requires?: Requirement[];
  /** Explains the lock, e.g. 'საჭიროა ნერვი 5'. */
  lockedHint?: string;
  /** Next scene id, or '@end:<endingId>' to finish. */
  next: string;
  /** Visual punch when picked — the renderer turns these into feedback. */
  beat?: 'calm' | 'tense' | 'violent' | 'clever';
}

export interface Scene {
  id: string;
  chapter: number;
  backdrop: Backdrop;
  /** Location line, e.g. 'რუსთაველი · 02:40'. */
  title?: string;
  /** Who is speaking; omitted for the narrator. */
  speaker?: string;
  text: string;
  choices: Choice[];
  /**
   * Decision under pressure. When set, a ring counts down from `seconds` and the
   * heartbeat quickens; if it empties, `timeoutNext` is forced. Use it where
   * hesitating IS the mistake — a gun already drawn, a door already opening.
   */
  seconds?: number;
  timeoutNext?: string;
  timeoutEffects?: Partial<Record<StatKey, number>>;
}

export interface Ending {
  id: string;
  label: string;
  body: string;
  /** Drives the ending card's colour and the final animation. */
  tone: 'triumph' | 'survival' | 'ruin' | 'death';
}

export interface RunState {
  name: string;
  stats: Record<StatKey, number>;
  flags: Record<string, boolean | string>;
  sceneId: string;
  chapter: number;
  /** Scene ids visited, in order — used for the recap and for scoring. */
  path: string[];
  endingId: string | null;
  startedAt: number;
}

/** What the run is worth on the leaderboard. */
export interface Score {
  total: number;
  breakdown: Array<{ label: string; points: number }>;
}
