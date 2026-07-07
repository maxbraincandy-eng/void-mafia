// ── Premium Worlds — 3D avatar ────────────────────────────────────────
// A stylised blocky humanoid coloured from the player's classic Virtual-Space
// identity (vs_bodyColor / vs_glowColor). Supports idle / walk / run / sit /
// wave with cheap procedural animation blending — no skeletal rig needed.
import * as THREE from 'three';
import type { AvatarConfig } from './types';

export type AvatarState = 'idle' | 'walk' | 'run' | 'sit' | 'wave';
export type EmoteKind = 'wave' | 'dance' | 'clap' | 'heart' | 'laugh';
const EMOTE_EMOJI: Record<EmoteKind, string> = { wave: '👋', dance: '💃', clap: '👏', heart: '❤️', laugh: '😂' };
const _emojiCache = new Map<string, THREE.Texture>();
function emojiTexture(ch: string): THREE.Texture {
  let t = _emojiCache.get(ch); if (t) return t;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; g.font = '48px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, 32, 36);
  t = new THREE.CanvasTexture(c); _emojiCache.set(ch, t); return t;
}

export class Avatar {
  group = new THREE.Group();
  state: AvatarState = 'idle';
  private legL: THREE.Group; private legR: THREE.Group;
  private armL: THREE.Group; private armR: THREE.Group;
  private torso: THREE.Mesh; private head: THREE.Mesh;
  private glow: THREE.PointLight;
  private blob: THREE.Mesh;
  private emoji: THREE.Sprite;
  private phase = 0;
  private emoteKind: EmoteKind | null = null;
  private emoteUntil = 0;
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];

  constructor(cfg: AvatarConfig) {
    const body = new THREE.Color(cfg.bodyColor || '#9b00ff');
    const glowC = new THREE.Color(cfg.glowColor || '#00e5ff');
    const skin = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.85, metalness: 0 });
    const shirt = new THREE.MeshStandardMaterial({ color: body, roughness: 0.7, metalness: 0.05, emissive: body.clone().multiplyScalar(0.12) });
    const pants = new THREE.MeshStandardMaterial({ color: 0x22252c, roughness: 0.8, metalness: 0 });
    this.mats.push(skin, shirt, pants);

    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      this.geos.push(geo);
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m;
    };

    // Legs (pivot at hip so they can swing)
    this.legL = new THREE.Group(); this.legL.position.set(-0.1, 0.62, 0);
    this.legL.add(mk(new THREE.BoxGeometry(0.15, 0.62, 0.17), pants, 0, -0.31, 0));
    this.legR = new THREE.Group(); this.legR.position.set(0.1, 0.62, 0);
    this.legR.add(mk(new THREE.BoxGeometry(0.15, 0.62, 0.17), pants, 0, -0.31, 0));
    this.group.add(this.legL, this.legR);

    this.torso = mk(new THREE.BoxGeometry(0.46, 0.64, 0.27), shirt, 0, 0.96, 0);
    this.group.add(this.torso);

    // Arms (pivot at shoulder)
    this.armL = new THREE.Group(); this.armL.position.set(-0.31, 1.24, 0);
    this.armL.add(mk(new THREE.BoxGeometry(0.12, 0.58, 0.15), shirt, 0, -0.29, 0));
    this.armR = new THREE.Group(); this.armR.position.set(0.31, 1.24, 0);
    this.armR.add(mk(new THREE.BoxGeometry(0.12, 0.58, 0.15), shirt, 0, -0.29, 0));
    this.group.add(this.armL, this.armR);

    this.head = mk(new THREE.SphereGeometry(0.17, 16, 16), skin, 0, 1.48, 0);
    this.group.add(this.head);

    // Identity glow — a soft aura in the player's glow colour.
    this.glow = new THREE.PointLight(glowC, 0.6, 3.4, 2);
    this.glow.position.set(0, 1.1, 0);
    this.group.add(this.glow);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.34, 24),
      new THREE.MeshBasicMaterial({ color: glowC, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.02;
    this.geos.push(halo.geometry); this.mats.push(halo.material as THREE.Material);
    this.group.add(halo);

    // Soft contact shadow (blob) — cheap grounding that reads on any device.
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false }),
    );
    this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.015;
    this.geos.push(this.blob.geometry); this.mats.push(this.blob.material as THREE.Material);
    this.group.add(this.blob);

    // Floating emote emoji above the head (shown during an emote).
    this.emoji = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    this.emoji.scale.set(0.6, 0.6, 1); this.emoji.position.set(0, 2.05, 0); this.emoji.visible = false;
    this.mats.push(this.emoji.material as THREE.Material);
    this.group.add(this.emoji);
  }

  wave() { this.emote('wave'); }
  emote(kind: EmoteKind) {
    this.emoteKind = kind;
    this.emoteUntil = performance.now() + (kind === 'dance' ? 4200 : 2400);
    const mat = this.emoji.material as THREE.SpriteMaterial;
    mat.map = emojiTexture(EMOTE_EMOJI[kind] ?? '👋'); mat.needsUpdate = true;
    this.emoji.visible = true;
  }

  update(dt: number, speed: number) {
    const now = performance.now();
    const emoting = this.emoteKind && now < this.emoteUntil;
    let st: AvatarState = this.state;
    if (st !== 'sit') st = speed > 4.2 ? 'run' : speed > 0.15 ? 'walk' : 'idle';

    if (st === 'walk' || st === 'run') {
      const rate = st === 'run' ? 11 : 7;
      this.phase += dt * rate;
      const sw = Math.sin(this.phase) * (st === 'run' ? 0.9 : 0.6);
      this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
      this.armL.rotation.x = -sw * 0.8; this.armR.rotation.x = sw * 0.8;
      this.torso.position.y = 0.96 + Math.abs(Math.sin(this.phase)) * 0.03;
    } else if (st === 'sit') {
      this.legL.rotation.x = -1.4; this.legR.rotation.x = -1.4;
      this.armL.rotation.x = -0.3; this.armR.rotation.x = -0.3;
    } else {
      // idle breathing
      this.phase += dt * 1.6;
      const b = Math.sin(this.phase) * 0.04;
      this.legL.rotation.x *= 0.85; this.legR.rotation.x *= 0.85;
      this.armL.rotation.x *= 0.85; this.armR.rotation.x *= 0.85;
      this.torso.position.y = 0.96 + b;
      this.head.position.y = 1.48 + b * 0.5;
    }

    if (emoting) {
      this.applyEmote(this.emoteKind!, now);
      this.emoji.visible = true;
      this.emoji.position.y = 2.05 + Math.sin(now / 200) * 0.06;
    } else {
      this.emoteKind = null;
      this.emoji.visible = false;
      this.armR.rotation.z *= 0.85; this.armL.rotation.z *= 0.85;
      this.torso.rotation.z *= 0.85; this.torso.rotation.x *= 0.85;
    }

    this.glow.intensity = 0.5 + Math.sin(now / 600) * 0.1;
  }

  private applyEmote(kind: EmoteKind, now: number) {
    const t = now / 1000;
    if (kind === 'wave') {
      this.armR.rotation.x = -2.6; this.armR.rotation.z = Math.sin(now / 90) * 0.4 - 0.3;
    } else if (kind === 'dance') {
      const s = Math.sin(t * 7);
      this.torso.rotation.z = s * 0.18; this.group.position.y += Math.abs(Math.sin(t * 7)) * 0.08;
      this.armL.rotation.x = -2.2 + s * 0.4; this.armR.rotation.x = -2.2 - s * 0.4;
      this.armL.rotation.z = 0.4; this.armR.rotation.z = -0.4;
      this.legL.rotation.x = s * 0.3; this.legR.rotation.x = -s * 0.3;
    } else if (kind === 'clap') {
      const c = Math.sin(t * 12) * 0.5;
      this.armL.rotation.x = -1.5; this.armR.rotation.x = -1.5;
      this.armL.rotation.z = 0.5 - c; this.armR.rotation.z = -0.5 + c;
    } else if (kind === 'heart') {
      this.armL.rotation.x = -1.3; this.armR.rotation.x = -1.3;
      this.armL.rotation.z = 0.7; this.armR.rotation.z = -0.7;
      this.torso.rotation.x = Math.sin(t * 3) * 0.05;
    } else { // laugh
      this.torso.rotation.x = 0.25 + Math.sin(t * 12) * 0.06;
      this.head.position.y = 1.48 + Math.sin(t * 12) * 0.03;
      this.armL.rotation.x = -0.6; this.armR.rotation.x = -0.6;
    }
  }

  dispose() {
    this.geos.forEach(g => g.dispose());
    this.mats.forEach(m => m.dispose());
  }
}
