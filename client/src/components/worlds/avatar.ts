// ── Premium Worlds — avatar (wraps the shared Character model) ─────────
// P5: worlds now render the player's actual created character (buildCharacter)
// instead of a blocky placeholder. This is a thin wrapper that adapts the
// character model's pose driver to the engine's Avatar interface.
import * as THREE from 'three';
import { buildCharacter, type CharacterModel, type CharEmote } from '../character/model';
import { defaultSpec, type CharacterSpec } from '../character/spec';

export type AvatarState = 'idle' | 'walk' | 'run' | 'sit' | 'wave';
export type EmoteKind = CharEmote;
// Kept for back-compat with existing engine imports.
export interface AvatarConfig { bodyColor: string; glowColor: string; spec?: CharacterSpec }

export class Avatar {
  group: THREE.Group;
  state: AvatarState = 'idle';
  private model: CharacterModel;
  private elapsed = 0;

  constructor(cfg: AvatarConfig | CharacterSpec) {
    const spec = normalizeSpec(cfg);
    this.model = buildCharacter(spec);
    this.group = this.model.group;
  }

  wave() { this.model.emote('wave'); }
  emote(kind: EmoteKind) { this.model.emote(kind); }

  update(dt: number, speed: number) {
    this.elapsed += dt;
    this.model.setPose(this.state === 'sit' ? 0 : speed, this.state === 'sit');
    this.model.update(dt, this.elapsed);
  }

  dispose() { this.model.dispose(); }
}

function normalizeSpec(cfg: AvatarConfig | CharacterSpec): CharacterSpec {
  // Any versioned spec (v1 payloads from older clients still render — missing
  // v2 fields fall back at build time via the default merge below).
  if (typeof (cfg as CharacterSpec).v === 'number') return { ...defaultSpec((cfg as CharacterSpec).gender ?? 'male'), ...(cfg as CharacterSpec), v: 2 };
  // Legacy {bodyColor, glowColor} → a sensible default character wearing that colour.
  const c = cfg as AvatarConfig;
  if (c.spec) return c.spec;
  const s = defaultSpec('male');
  s.topColor = c.bodyColor || s.topColor;
  s.glow = c.glowColor || s.glow;
  return s;
}
