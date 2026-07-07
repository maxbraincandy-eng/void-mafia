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
  holdPose: string | null = null;   // e.g. 'titanic' — a standing held pose
  private model: CharacterModel;
  private inner: THREE.Group;
  private elapsed = 0;
  private sitDrop: number;
  private prop: string | null = null;
  private propMesh: THREE.Object3D | null = null;

  constructor(cfg: AvatarConfig | CharacterSpec) {
    const spec = normalizeSpec(cfg);
    this.model = buildCharacter(spec);
    // The character model faces +Z; the world engine's forward convention is
    // -Z — wrap and flip so avatars face where they walk (not backwards).
    this.inner = this.model.group;
    this.inner.rotation.y = Math.PI;
    this.group = new THREE.Group();
    this.group.add(this.inner);
    // When seated the engine puts the group origin AT the seat — drop the body
    // so the hips (not the feet) rest on it.
    this.sitDrop = 0.88 * (spec.legLen ?? 1) * (spec.height ?? 1) - 0.06;
  }

  wave() { this.model.emote('wave'); }
  emote(kind: EmoteKind) { this.model.emote(kind); }

  // Attach/detach a held prop (e.g. a bar drink) on the right hand. Driven by
  // the seat's `prop` field, so it stays in sync for local + remote avatars.
  setProp(kind: string | null) {
    if (kind === this.prop) return;
    this.prop = kind;
    if (this.propMesh) { this.model.handR.remove(this.propMesh); disposeTree(this.propMesh); this.propMesh = null; }
    if (kind === 'drink') { this.propMesh = buildDrink(); this.model.handR.add(this.propMesh); }
  }

  update(dt: number, speed: number) {
    this.elapsed += dt;
    const sit = this.state === 'sit';
    this.model.setPose(sit ? 0 : speed, sit, this.holdPose, this.prop);
    // body height + tilt per pose: seat = drop to hips, swim = half-submerged,
    // hammock = recline back; everything else stands upright at ground.
    let yTarget = 0, xRot = 0, zRot = 0;
    if (sit && !this.holdPose) yTarget = -this.sitDrop;
    else if (this.holdPose === 'swim') yTarget = -0.55;
    else if (this.holdPose === 'hammock') xRot = -1.05;
    else if (this.holdPose === 'cuddleL') { xRot = -1.05; zRot = 0.22; }   // recline + roll toward partner
    else if (this.holdPose === 'cuddleR') { xRot = -1.05; zRot = -0.22; }
    this.inner.position.y += (yTarget - this.inner.position.y) * Math.min(1, dt * 10);
    this.inner.rotation.x += (xRot - this.inner.rotation.x) * Math.min(1, dt * 8);
    this.inner.rotation.z += (zRot - this.inner.rotation.z) * Math.min(1, dt * 8);
    this.model.update(dt, this.elapsed);
  }

  dispose() { if (this.propMesh) disposeTree(this.propMesh); this.model.dispose(); }
}

// A small tropical cocktail — a stemmed glass with liquid, a straw and a slice.
// Oriented so it reads roughly upright in the seated "sip" pose (arm raised).
function buildDrink(): THREE.Group {
  const g = new THREE.Group();
  g.rotation.x = 1.25;            // counter the raised-forearm tilt → glass stands up
  g.scale.setScalar(0.9);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.4 });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.03, 0.12, 10), glassMat); cup.position.y = 0.1; g.add(cup);
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.028, 0.08, 10), new THREE.MeshStandardMaterial({ color: 0xff5a7a, roughness: 0.3, emissive: 0x551020, emissiveIntensity: 0.3 })); liquid.position.y = 0.09; g.add(liquid);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 6), glassMat); stem.position.y = 0.03; g.add(stem);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 10), glassMat); foot.position.y = 0.006; g.add(foot);
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.18, 6), new THREE.MeshStandardMaterial({ color: 0x33d6a0, roughness: 0.6 })); straw.position.set(0.03, 0.16, 0); straw.rotation.z = -0.3; g.add(straw);
  const slice = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xffd23b, roughness: 0.6, side: THREE.DoubleSide })); slice.position.set(-0.06, 0.15, 0); g.add(slice);
  return g;
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(mat => mat.dispose());
  });
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
