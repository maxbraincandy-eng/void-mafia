// განაბ სიმულატორი — pure game engine. No React, no DOM (except storage helpers).
import type { GanabState, GanabScene, GanabChoice, GraveyardEntry, GanabStatKey } from './types';
import { PHASE1_SCENES, PHASE1_START } from './content/phase1';

const SAVE_KEY = 'vm_ganab_save';
const GRAVE_KEY = 'vm_ganab_graveyard';

// All shipped content, one registry. Later steps append PHASE2_SCENES etc.
const SCENES = new Map<string, GanabScene>();
for (const s of PHASE1_SCENES) SCENES.set(s.id, s);

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

/** Choices actually visible for this state (hidden `requires` gates applied). */
export function visibleChoices(state: GanabState, scene: GanabScene): GanabChoice[] {
  return scene.choices.filter(c => {
    if (!c.requires) return true;
    return (Object.entries(c.requires) as [GanabStatKey, number][]).every(([k, min]) => state.stats[k] >= min);
  });
}

const clampStat = (v: number) => Math.max(0, Math.min(10, v));

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
  if (dest === '@end_step') {
    next.sceneId = '@end_step';
    saveGame(next);
    return next;
  }
  next.sceneId = dest;
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
