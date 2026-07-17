// განაბ სიმულატორი — pure game engine. No React, no DOM (except storage helpers).
import type { GanabState, GanabScene, GanabChoice, GraveyardEntry, GanabStatKey } from './types';
import { PHASE1_SCENES, PHASE1_START } from './content/phase1';
import { PHASE2_SCENES, PHASE2_START } from './content/phase2';
import { PHASE3_SCENES, PHASE3_START } from './content/phase3';
import { PHASE4_SCENES, PHASE4_START } from './content/phase4';

const SAVE_KEY = 'vm_ganab_save';
const GRAVE_KEY = 'vm_ganab_graveyard';
const CROWN_KEY = 'vm_ganab_crowned';

// All shipped content, one registry.
const SCENES = new Map<string, GanabScene>();
for (const s of [...PHASE1_SCENES, ...PHASE2_SCENES, ...PHASE3_SCENES, ...PHASE4_SCENES]) SCENES.set(s.id, s);

const PHASE_STARTS: Record<number, string> = { 1: PHASE1_START, 2: PHASE2_START, 3: PHASE3_START, 4: PHASE4_START };

export function newGame(nickname: string): GanabState {
  return {
    nickname: nickname.trim().slice(0, 18) || 'უსახელო',
    stats: { authority: 3, street: 3, charisma: 3, network: 1, obshiak: 0 },
    rank: 'birzhis_bichi',
    phase: 1,
    sceneId: PHASE1_START,
    flags: {},
    log: [],
    dead: false,
    deathReason: null,
    won: false,
  };
}

export function getScene(state: GanabState): GanabScene | null {
  return SCENES.get(state.sceneId) ?? null;
}

const flagOk = (state: GanabState, ifFlag?: string, unlessFlag?: string): boolean => {
  if (ifFlag && !state.flags[ifFlag]) return false;
  if (unlessFlag && state.flags[unlessFlag]) return false;
  return true;
};

/** Choices actually visible for this state (hidden `requires` + flag gates applied). */
export function visibleChoices(state: GanabState, scene: GanabScene): GanabChoice[] {
  return scene.choices.filter(c => {
    if (!flagOk(state, c.ifFlag, c.unlessFlag)) return false;
    if (!c.requires) return true;
    return (Object.entries(c.requires) as [GanabStatKey, number][]).every(([k, min]) => state.stats[k] >= min);
  });
}

const clampStat = (v: number) => Math.max(0, Math.min(10, v));

/** Follow routing pseudo-scenes until a real scene (or dead-end guard). */
function resolveRoutes(state: GanabState, sceneId: string): string {
  let id = sceneId;
  for (let hops = 0; hops < 10; hops++) {
    const scene = SCENES.get(id);
    if (!scene?.route) return id;
    const rule = scene.route.find(r => flagOk(state, r.ifFlag, r.unlessFlag));
    if (!rule) return id;
    id = rule.goto;
  }
  return id;
}

export function applyChoice(state: GanabState, choice: GanabChoice): GanabState {
  if (state.dead || state.won) return state;
  const next: GanabState = {
    ...state,
    stats: { ...state.stats },
    flags: { ...state.flags },
    log: [...state.log, { sceneId: state.sceneId, choiceText: choice.text }].slice(-200),
  };

  if (choice.effects) {
    for (const [k, d] of Object.entries(choice.effects) as [GanabStatKey, number][]) {
      next.stats[k] = k === 'obshiak' ? Math.max(0, next.stats[k] + d) : clampStat(next.stats[k] + d);
    }
  }
  if (choice.setFlags) Object.assign(next.flags, choice.setFlags);
  if (choice.setRank) next.rank = choice.setRank;

  // Visible stat check: below min → the fail branch.
  let dest = choice.next;
  if (choice.check && next.stats[choice.check.stat] < choice.check.min) {
    dest = choice.check.failNext;
  }

  if (dest.startsWith('@death:')) {
    next.dead = true;
    next.deathReason = dest.slice('@death:'.length);
    buryCharacter(next);
    clearSave();
    return next;
  }
  if (dest === '@win') {
    next.won = true;
    next.rank = 'kanonieri';
    crownCharacter(next);
    clearSave();
    return next;
  }
  if (dest.startsWith('@phase:')) {
    const phase = Number(dest.slice('@phase:'.length)) as GanabState['phase'];
    const start = PHASE_STARTS[phase];
    if (start) {
      next.phase = phase;
      next.sceneId = resolveRoutes(next, start);
    } else {
      next.sceneId = '@end_step'; // phase not shipped yet
    }
    saveGame(next);
    return next;
  }
  if (dest === '@end_step') {
    next.sceneId = '@end_step';
    saveGame(next);
    return next;
  }
  next.sceneId = resolveRoutes(next, dest);
  saveGame(next);
  return next;
}

export function fillText(text: string, state: GanabState): string {
  return text.split('{nickname}').join(state.nickname);
}

// ── Persistence ──────────────────────────────────────────────────────────
export function saveGame(state: GanabState): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function loadGame(): GanabState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GanabState;
    if (s.dead || s.won) return null;
    // Migration: a save parked at the old end-of-content marker continues
    // into the newly shipped phase.
    if (s.sceneId === '@end_step' && PHASE_STARTS[s.phase + 1]) {
      s.phase = (s.phase + 1) as GanabState['phase'];
      if (s.phase === 2 && s.rank === 'birzhis_bichi') s.rank = 'ubnis_bichi';
      if (s.phase === 3 && (s.rank === 'birzhis_bichi' || s.rank === 'ubnis_bichi')) s.rank = 'dzveli_bichi';
      if (s.phase === 4 && s.rank !== 'zonis_makurebeli' && s.rank !== 'kandidati') s.rank = 'makurebeli';
      s.sceneId = resolveRoutes(s, PHASE_STARTS[s.phase]!);
      saveGame(s);
    }
    if (s.sceneId !== '@end_step' && !SCENES.has(s.sceneId)) return null; // content changed under the save
    return s;
  } catch { return null; }
}

export function clearSave(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function getGraveyard(): GraveyardEntry[] {
  try { return JSON.parse(localStorage.getItem(GRAVE_KEY) ?? '[]') as GraveyardEntry[]; } catch { return []; }
}

function buryCharacter(state: GanabState): void {
  try {
    const grave = getGraveyard();
    grave.unshift({ nickname: state.nickname, rank: state.rank, phase: state.phase, reason: state.deathReason ?? '?', ts: Date.now() });
    localStorage.setItem(GRAVE_KEY, JSON.stringify(grave.slice(0, 30)));
  } catch { /* ignore */ }
}

export function getCrowned(): { nickname: string; ts: number }[] {
  try { return JSON.parse(localStorage.getItem(CROWN_KEY) ?? '[]') as { nickname: string; ts: number }[]; } catch { return []; }
}

function crownCharacter(state: GanabState): void {
  try {
    const crowned = getCrowned();
    crowned.unshift({ nickname: state.nickname, ts: Date.now() });
    localStorage.setItem(CROWN_KEY, JSON.stringify(crowned.slice(0, 20)));
  } catch { /* ignore */ }
}
