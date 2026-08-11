// ── ნუარი — pure engine ───────────────────────────────────────────────
// No React, no DOM. Everything here is a function of (state, choice), which is
// what lets the whole story be verified offline: every scene reachable, no
// dangling ids, no dead ends, every ending attainable.
import type {
  Choice, Ending, RunState, Scene, Score, StatKey, Requirement,
} from './types';
import { SCENES, ENDINGS, START_ID } from './story';

const STAT_MIN = 0;
const STAT_MAX = 10;

export const sceneById = (id: string): Scene | undefined => SCENES.find(s => s.id === id);
export const endingById = (id: string): Ending | undefined => ENDINGS.find(e => e.id === id);

const clampStat = (n: number) => Math.max(STAT_MIN, Math.min(STAT_MAX, n));

export function newRun(name: string): RunState {
  const first = sceneById(START_ID)!;
  return {
    name: name.trim().slice(0, 18) || 'უსახელო',
    // Everyone starts ordinary. Heat begins at 1: the city already half-knows you.
    stats: { nerve: 3, cunning: 3, trust: 2, heat: 1, money: 2 },
    flags: {},
    sceneId: START_ID,
    chapter: first.chapter,
    path: [START_ID],
    endingId: null,
    startedAt: Date.now(),
  };
}

/** Does the run satisfy every requirement on this choice? */
export function meetsRequirements(state: RunState, choice: Choice): boolean {
  if (!choice.requires?.length) return true;
  // Every clause in a rule must hold. Do NOT early-return on the flag: a rule
  // that carries both a flag and a stat bound (docks_brief needs the informer's
  // number AND the nerve to use it) has to satisfy both, and an early return
  // silently granted the choice on the flag alone.
  return choice.requires.every((r: Requirement) => {
    if (r.flag !== undefined && !state.flags[r.flag]) return false;
    if (r.stat !== undefined) {
      const v = state.stats[r.stat];
      if (r.min !== undefined && v < r.min) return false;
      if (r.max !== undefined && v > r.max) return false;
    }
    return true;
  });
}

/** The id a choice leads to, or null when it ends the run. */
export function endingIdOf(next: string): string | null {
  return next.startsWith('@end:') ? next.slice(5) : null;
}

/**
 * Apply a choice. Returns a NEW state — callers keep the old one for undo or
 * for animating the delta. A locked choice is a no-op rather than an error, so
 * a mis-tapped disabled button can never corrupt a run.
 *
 * `failed` is set when the choice carried a skill test and the player lost it:
 * the run then takes test.onFail and receives failEffects INSTEAD of the
 * choice's own effects — the rewards belong to succeeding.
 */
export function applyChoice(state: RunState, choice: Choice, failed = false): RunState {
  if (state.endingId) return state;
  if (!meetsRequirements(state, choice)) return state;

  const lost = failed && !!choice.test;
  const effects = lost ? (choice.test!.failEffects ?? {}) : (choice.effects ?? {});
  const target = lost ? choice.test!.onFail : choice.next;

  const stats = { ...state.stats };
  for (const [k, d] of Object.entries(effects)) {
    stats[k as StatKey] = clampStat(stats[k as StatKey] + (d as number));
  }
  // Flags are set either way: you tried the thing, and the story remembers.
  const flags = { ...state.flags, ...(choice.setFlags ?? {}) };

  const ending = endingIdOf(target);
  if (ending) {
    return { ...state, stats, flags, endingId: ending };
  }

  const next = sceneById(target);
  // A missing id is a content bug; the verifier catches it before ship. At
  // runtime, refuse to move rather than blank the screen.
  if (!next) return { ...state, stats, flags };

  return {
    ...state, stats, flags,
    sceneId: next.id,
    chapter: next.chapter,
    path: [...state.path, next.id],
  };
}

/**
 * Advance because a timed scene's clock ran out. Uses the scene's own
 * timeoutNext / timeoutEffects; if the scene declares no timeout the state is
 * returned untouched, so a missing field can never strand a player.
 */
export function applyTimeout(state: RunState): RunState {
  if (state.endingId) return state;
  const scene = sceneById(state.sceneId);
  if (!scene?.timeoutNext) return state;

  const stats = { ...state.stats };
  for (const [k, d] of Object.entries(scene.timeoutEffects ?? {})) {
    stats[k as StatKey] = clampStat(stats[k as StatKey] + (d as number));
  }
  const ending = endingIdOf(scene.timeoutNext);
  if (ending) return { ...state, stats, endingId: ending };
  const next = sceneById(scene.timeoutNext);
  if (!next) return { ...state, stats };
  return {
    ...state, stats,
    sceneId: next.id, chapter: next.chapter, path: [...state.path, next.id],
  };
}

/**
 * Heat is the one stat that can end a run on its own: at 10 the city closes in
 * regardless of what the player picked. Checked after every choice so a reckless
 * streak has a real ceiling.
 */
export function forcedEnding(state: RunState): string | null {
  if (state.endingId) return null;
  return state.stats.heat >= 10 ? 'caught' : null;
}

// ── scoring ───────────────────────────────────────────────────────────
/**
 * A run's worth. Deliberately rewards finishing well over finishing rich: the
 * ending tone is the biggest single term, so a careful survivor outranks a
 * wealthy corpse.
 */
export function scoreRun(state: RunState): Score {
  const breakdown: Array<{ label: string; points: number }> = [];
  const add = (label: string, points: number) => { if (points) breakdown.push({ label, points }); };

  const ending = state.endingId ? endingById(state.endingId) : null;
  const toneScore = ending
    ? ({ triumph: 500, survival: 300, ruin: 120, death: 40 } as const)[ending.tone]
    : 0;
  add(ending ? `დასასრული: ${ending.label}` : 'დაუსრულებელი', toneScore);

  add('თავები', state.chapter * 60);
  add('ნერვი', state.stats.nerve * 12);
  add('ეშმაკობა', state.stats.cunning * 12);
  add('ნდობა', state.stats.trust * 18);
  add('ფული', state.stats.money * 10);
  // Heat subtracts: staying invisible is the skill.
  add('ყურადღება', -state.stats.heat * 20);
  // Seeing more of the city is worth something, but far less than ending well,
  // so padding the path can't beat a clean run.
  add('ნანახი სცენები', new Set(state.path).size * 4);

  const total = Math.max(0, breakdown.reduce((n, b) => n + b.points, 0));
  return { total, breakdown };
}

// ── save / restore ────────────────────────────────────────────────────
const SAVE_KEY = 'vm_noir_run';

export function saveRun(state: RunState): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* private mode */ }
}
export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as RunState;
    // Reject a save whose scene no longer exists (content changed under it)
    // rather than dropping the player into a blank screen.
    if (!s?.sceneId || (!s.endingId && !sceneById(s.sceneId))) return null;
    return s;
  } catch { return null; }
}
export function clearRun(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* noop */ }
}
