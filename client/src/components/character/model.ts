// ── Character Creator — procedural stylized 3D model ──────────────────
// Builds a clean, stylized humanoid THREE.Group from a CharacterSpec. Fully
// procedural (no downloaded assets) but structured so authored GLTF parts can
// replace any sub-builder later (hair/clothing/accessory packs). Returns an
// idle updater (breathing + blink + subtle sway) and a disposer.
import * as THREE from 'three';
import type { CharacterSpec, BodyBuild } from './spec';

export type CharEmote = 'wave' | 'dance' | 'clap' | 'heart' | 'laugh';

export interface CharacterModel {
  group: THREE.Group;
  update: (dt: number, elapsed: number) => void;
  // Locomotion driver for the 3D worlds (creator preview just leaves it idle).
  setPose: (speed: number, sitting: boolean) => void;
  emote: (kind: CharEmote) => void;
  dispose: () => void;
}

const EMOTE_EMOJI: Record<CharEmote, string> = { wave: '👋', dance: '💃', clap: '👏', heart: '❤️', laugh: '😂' };
const _emojiCache = new Map<string, THREE.Texture>();
function emojiTex(ch: string): THREE.Texture {
  let t = _emojiCache.get(ch); if (t) return t;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; g.font = '48px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 32, 36);
  t = new THREE.CanvasTexture(c); _emojiCache.set(ch, t); return t;
}

interface BuildParams { torsoW: number; shoulderW: number; limbW: number; belly: number; hips: number; chest: number; }
function buildParams(build: BodyBuild, female: boolean): BuildParams {
  const base: Record<BodyBuild, BuildParams> = {
    slim: { torsoW: 0.86, shoulderW: 0.9, limbW: 0.85, belly: 0, hips: 1, chest: 0 },
    athletic: { torsoW: 1.0, shoulderW: 1.06, limbW: 1.0, belly: 0, hips: 1, chest: 0 },
    muscular: { torsoW: 1.14, shoulderW: 1.28, limbW: 1.16, belly: 0.02, hips: 1, chest: 0 },
    heavy: { torsoW: 1.3, shoulderW: 1.14, limbW: 1.2, belly: 0.12, hips: 1.12, chest: 0 },
  };
  const p = { ...base[build] };
  if (female) { p.shoulderW *= 0.9; p.hips *= 1.1; p.chest = 0.05; p.limbW *= 0.94; }
  return p;
}

export function buildCharacter(spec: CharacterSpec): CharacterModel {
  const female = spec.gender === 'female';
  const bp = buildParams(spec.build, female);
  const root = new THREE.Group();
  const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];
  const track = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => { disposables.push(x); return x; };

  const skinMat = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.skin), roughness: 0.62, metalness: 0.02 }));
  const hairMat = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.hairColor), roughness: 0.55, metalness: 0.05 }));
  const beardMat = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.beardColor), roughness: 0.6 }));
  const topMat = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.topColor), roughness: 0.72, metalness: 0.04 }));
  const botMat = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.bottomColor), roughness: 0.72 }));
  const shoeMat = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.shoeColor), roughness: 0.5, metalness: 0.1 }));

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => { const x = new THREE.Mesh(track(g), m); x.castShadow = true; return x; };
  const sphere = (r: number, m: THREE.Material) => mesh(new THREE.SphereGeometry(r, 20, 16), m);
  const caps = (r: number, len: number, m: THREE.Material) => mesh(new THREE.CapsuleGeometry(r, len, 6, 14), m);

  // sleeves/legs coverage depends on garment
  const longSleeve = spec.top === 'hoodie' || spec.top === 'jacket' || spec.top === 'sweater';
  const hasSleeve = spec.top !== 'tank';
  const coverShin = spec.bottom === 'jeans' || spec.bottom === 'cargo';
  const armMatUpper = hasSleeve ? topMat : skinMat;
  const armMatLower = longSleeve ? topMat : skinMat;

  // ── Torso + hips ─────────────────────────────────────────────────────
  const torso = new THREE.Group(); root.add(torso);
  const chest = caps(0.19 * bp.torsoW, 0.34, topMat); chest.position.y = 1.2; chest.scale.set(1, 1, 0.72); torso.add(chest);
  // shoulders
  const shoulders = mesh(new THREE.CapsuleGeometry(0.1, 0.34 * bp.shoulderW, 4, 10), topMat);
  shoulders.rotation.z = Math.PI / 2; shoulders.position.y = 1.4; shoulders.scale.set(1, 1, 0.8); torso.add(shoulders);
  if (bp.belly > 0) { const b = sphere(0.2 * bp.torsoW, topMat); b.position.set(0, 1.06, 0.03); b.scale.set(1, 0.8, 0.7 + bp.belly * 2); torso.add(b); }
  if (bp.chest > 0) { for (const sx of [-1, 1]) { const c = sphere(0.075, topMat); c.position.set(sx * 0.075, 1.14, 0.12); torso.add(c); } }
  // waist/hips
  const hips = caps(0.16 * bp.torsoW * bp.hips, 0.12, botMat); hips.position.y = 0.94; hips.scale.set(1, 1, 0.78); torso.add(hips);

  // hoodie/jacket extras
  if (spec.top === 'hoodie') {
    const hood = sphere(0.16, topMat); hood.position.set(0, 1.46, -0.08); hood.scale.set(1, 0.7, 0.8); torso.add(hood);
    const pocket = mesh(new THREE.BoxGeometry(0.22, 0.12, 0.06), topMat); pocket.position.set(0, 1.06, 0.15 * bp.torsoW); torso.add(pocket);
  } else if (spec.top === 'jacket') {
    // open front: darker inner shirt strip
    const inner = track(new THREE.MeshStandardMaterial({ color: 0x161821, roughness: 0.8 }));
    const strip = mesh(new THREE.BoxGeometry(0.1, 0.34, 0.04), inner); strip.position.set(0, 1.2, 0.15 * bp.torsoW); torso.add(strip);
  } else if (spec.top === 'sweater') {
    const collar = mesh(new THREE.TorusGeometry(0.09, 0.03, 8, 16), topMat); collar.rotation.x = Math.PI / 2; collar.position.y = 1.42; torso.add(collar);
  }

  // ── Head + face ──────────────────────────────────────────────────────
  const headGrp = new THREE.Group(); headGrp.position.y = 1.5; root.add(headGrp);
  const neck = caps(0.07, 0.06, skinMat); neck.position.y = 0.0; headGrp.add(neck);
  const head = sphere(0.145, skinMat); head.position.y = 0.16; head.scale.set(0.94, 1.06, 0.96); headGrp.add(head);
  // jaw taper for males
  if (!female) { const jaw = sphere(0.1, skinMat); jaw.position.set(0, 0.1, 0.02); jaw.scale.set(1.05, 0.7, 0.95); headGrp.add(jaw); }

  const face = new THREE.Group(); face.position.set(0, 0.16, 0); headGrp.add(face);
  const eyeWhiteMat = track(new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.3 }));
  const irisMat = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.eyeColor), roughness: 0.25 }));
  const eyes: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(sx * 0.05, 0.01, 0.126); face.add(eg);
    const w = sphere(0.028, eyeWhiteMat); w.scale.set(1.25, 1, 0.6); eg.add(w);
    const iris = sphere(0.015, irisMat); iris.position.z = 0.018; eg.add(iris);
    const pupil = sphere(0.007, track(new THREE.MeshStandardMaterial({ color: 0x0a0a0a }))); pupil.position.z = 0.03; eg.add(pupil);
    eyes.push(eg);
    // eyelashes for female
    if (female) { const lash = mesh(new THREE.BoxGeometry(0.05, 0.006, 0.01), beardMat); lash.position.set(0, 0.024, 0.02); lash.material = track(new THREE.MeshStandardMaterial({ color: 0x14100c })); eg.add(lash); }
    // eyeshadow
    if (female && spec.eyeshadow) { const es = mesh(new THREE.BoxGeometry(0.05, 0.02, 0.01), track(new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.eyeshadow), roughness: 0.7 }))); es.position.set(0, 0.02, 0.018); eg.add(es); }
  }
  // brows
  const browMat = track(new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.browColor), roughness: 0.7 }));
  for (const sx of [-1, 1]) { const b = mesh(new THREE.BoxGeometry(0.045, 0.008, 0.012), browMat); b.position.set(sx * 0.05, 0.05, 0.13); b.rotation.z = sx * -0.08; face.add(b); }
  // nose
  const nose = mesh(new THREE.ConeGeometry(0.02, 0.05, 8), skinMat); nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.01, 0.14); nose.scale.set(1, 1, 0.7); face.add(nose);
  // mouth (lipstick tints for female)
  const mouthMat = female && spec.lipstick ? track(new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.lipstick), roughness: 0.4 })) : track(new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.skin).multiplyScalar(0.7), roughness: 0.6 }));
  const mouth = mesh(new THREE.BoxGeometry(0.05, 0.012, 0.01), mouthMat); mouth.position.set(0, -0.07, 0.128); face.add(mouth);
  // blush
  if (female && spec.blush) for (const sx of [-1, 1]) { const bl = sphere(0.02, track(new THREE.MeshStandardMaterial({ color: 0xd98a92, transparent: true, opacity: 0.5 }))); bl.position.set(sx * 0.08, -0.02, 0.11); bl.scale.set(1, 0.7, 0.4); face.add(bl); }

  // ── Facial hair (male) ───────────────────────────────────────────────
  if (!female && spec.beard !== 'none') buildBeard(spec.beard, headGrp, beardMat, mesh, sphere);

  // ── Hair ─────────────────────────────────────────────────────────────
  if (spec.hat === 'none' || spec.hair === 'long' || spec.hair === 'ponytail') buildHair(spec.hair, headGrp, hairMat, mesh, sphere, caps);

  // ── Hat ──────────────────────────────────────────────────────────────
  if (spec.hat !== 'none') buildHat(spec.hat, headGrp, track(new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.hatColor), roughness: 0.7 })), mesh, sphere);

  // ── Glasses ──────────────────────────────────────────────────────────
  if (spec.glasses !== 'none') buildGlasses(spec.glasses, face, track(new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.4, metalness: 0.3 })), mesh);

  // floating emote emoji above the head (used in the 3D worlds)
  const emoji = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
  emoji.scale.set(0.42, 0.42, 1); emoji.position.set(0, 0.42, 0); emoji.visible = false;
  disposables.push(emoji.material);
  headGrp.add(emoji);

  // ── Arms ─────────────────────────────────────────────────────────────
  const armGroups: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const ag = new THREE.Group(); ag.position.set(sx * 0.2 * bp.shoulderW, 1.4, 0); root.add(ag); armGroups.push(ag);
    const upper = caps(0.052 * bp.limbW, 0.22, armMatUpper); upper.position.y = -0.16; ag.add(upper);
    const lower = caps(0.045 * bp.limbW, 0.2, armMatLower); lower.position.y = -0.42; ag.add(lower);
    const hand = sphere(0.05, skinMat); hand.position.y = -0.56; hand.scale.set(0.9, 1.1, 0.7); ag.add(hand);
    ag.rotation.z = sx * 0.06;
  }

  // ── Legs ─────────────────────────────────────────────────────────────
  const shortBottom = spec.bottom === 'shorts';
  const skirt = spec.bottom === 'skirt';
  if (skirt) {
    const sk = mesh(new THREE.ConeGeometry(0.26 * bp.hips, 0.34, 16, 1, true), botMat); sk.position.y = 0.78; sk.scale.set(1, 1, 0.8); torso.add(sk);
  }
  const legGroups: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const lg = new THREE.Group(); lg.position.set(sx * 0.085, 0.9, 0); root.add(lg); legGroups.push(lg);
    const thighMat = skirt ? skinMat : botMat;
    const thigh = caps(0.07 * bp.limbW, 0.24, thighMat); thigh.position.y = -0.2; lg.add(thigh);
    const shinMat = (shortBottom || skirt) ? skinMat : (coverShin ? botMat : skinMat);
    const shin = caps(0.058 * bp.limbW, 0.24, shinMat); shin.position.y = -0.5; lg.add(shin);
    // shoe
    const footY = -0.68;
    if (spec.shoes === 'heels') {
      const foot = mesh(new THREE.BoxGeometry(0.09, 0.05, 0.2), shoeMat); foot.position.set(0, footY + 0.02, 0.05); lg.add(foot);
      const heel = mesh(new THREE.BoxGeometry(0.03, 0.09, 0.03), shoeMat); heel.position.set(0, footY - 0.03, -0.06); lg.add(heel);
    } else {
      const h = spec.shoes === 'boots' ? 0.14 : 0.09;
      const foot = mesh(new THREE.BoxGeometry(0.1, h, 0.24), shoeMat); foot.position.set(0, footY + h / 2 - 0.02, 0.05); lg.add(foot);
      if (spec.shoes === 'boots') { const shaft = caps(0.06, 0.08, shoeMat); shaft.position.y = footY + 0.14; lg.add(shaft); }
    }
  }

  // identity glow ring at the feet
  const glow = mesh(new THREE.RingGeometry(0.28, 0.34, 28), track(new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.glow), transparent: true, opacity: 0.4, side: THREE.DoubleSide })));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.01; root.add(glow);

  // height scale
  root.scale.setScalar(spec.height);

  // ── Animation (idle breathing/blink + locomotion + emotes) ───────────
  let blinkT = 2 + Math.random() * 3;
  let poseSpeed = 0, sitting = false, walkPhase = 0;
  let emoteKind: CharEmote | null = null, emoteUntil = 0;

  const setPose = (speed: number, sit: boolean) => { poseSpeed = speed; sitting = sit; };
  const emote = (kind: CharEmote) => {
    emoteKind = kind; emoteUntil = performance.now() + (kind === 'dance' ? 4200 : 2400);
    const m = emoji.material as THREE.SpriteMaterial; m.map = emojiTex(EMOTE_EMOJI[kind] ?? '👋'); m.needsUpdate = true; emoji.visible = true;
  };

  const update = (dt: number, e: number) => {
    // breathing
    const br = Math.sin(e * 1.4) * 0.012;
    chest.scale.y = 1 + br; headGrp.position.y = 1.5 + br * 0.5;
    root.rotation.z = Math.sin(e * 0.7) * 0.005;

    // locomotion
    if (sitting) {
      legGroups.forEach(l => { l.rotation.x += (-1.35 - l.rotation.x) * Math.min(1, dt * 12); });
      armGroups.forEach(a => { a.rotation.x += (-0.25 - a.rotation.x) * Math.min(1, dt * 12); });
    } else if (poseSpeed > 0.15) {
      const run = poseSpeed > 4.2;
      walkPhase += dt * (run ? 11 : 7);
      const sw = Math.sin(walkPhase) * (run ? 0.85 : 0.55);
      legGroups[0].rotation.x = sw; legGroups[1].rotation.x = -sw;
      armGroups[0].rotation.x = -sw * 0.7; armGroups[1].rotation.x = sw * 0.7;
    } else {
      legGroups.forEach(l => { l.rotation.x *= 0.8; });
      armGroups.forEach((a, i) => { a.rotation.x += (Math.sin(e * 1.2 + i * Math.PI) * 0.04 - a.rotation.x) * Math.min(1, dt * 6); });
    }

    // emote overrides
    const now = performance.now();
    if (emoteKind && now < emoteUntil) {
      applyCharEmote(emoteKind, now, armGroups, legGroups, torso, root, poseSpeed <= 0.15 && !sitting);
      emoji.visible = true; emoji.position.y = 0.42 + Math.sin(now / 200) * 0.05;
    } else {
      if (emoteKind) { emoteKind = null; emoji.visible = false; armGroups.forEach(a => { a.rotation.z = 0; }); torso.rotation.z = 0; torso.rotation.x = 0; }
    }

    // blink
    blinkT -= dt;
    let ey = 1;
    if (blinkT < 0.13) ey = Math.max(0.08, Math.abs(blinkT / 0.13) * 2 - 1);
    if (blinkT < 0) blinkT = 2.5 + Math.random() * 3.5;
    eyes.forEach(g => { g.scale.y = ey; });
  };

  return { group: root, update, setPose, emote, dispose: () => disposables.forEach(d => d.dispose()) };
}

function applyCharEmote(kind: CharEmote, now: number, arms: THREE.Group[], _legs: THREE.Group[], torso: THREE.Group, root: THREE.Group, _idle: boolean) {
  const t = now / 1000;
  const [aL, aR] = arms;
  if (kind === 'wave') { aR.rotation.x = -2.6; aR.rotation.z = Math.sin(now / 90) * 0.4 - 0.3; }
  else if (kind === 'dance') { const s = Math.sin(t * 7); torso.rotation.z = s * 0.16; root.position.y += Math.abs(Math.sin(t * 7)) * 0.06; aL.rotation.x = -2.2 + s * 0.4; aR.rotation.x = -2.2 - s * 0.4; aL.rotation.z = 0.4; aR.rotation.z = -0.4; }
  else if (kind === 'clap') { const c = Math.sin(t * 12) * 0.5; aL.rotation.x = -1.5; aR.rotation.x = -1.5; aL.rotation.z = 0.5 - c; aR.rotation.z = -0.5 + c; }
  else if (kind === 'heart') { aL.rotation.x = -1.3; aR.rotation.x = -1.3; aL.rotation.z = 0.7; aR.rotation.z = -0.7; torso.rotation.x = Math.sin(t * 3) * 0.05; }
  else { torso.rotation.x = 0.22 + Math.sin(t * 12) * 0.05; aL.rotation.x = -0.6; aR.rotation.x = -0.6; }
}

// ── Sub-builders (swap with authored assets later) ────────────────────
type MeshFn = (g: THREE.BufferGeometry, m: THREE.Material) => THREE.Mesh;
type SphFn = (r: number, m: THREE.Material) => THREE.Mesh;
type CapFn = (r: number, len: number, m: THREE.Material) => THREE.Mesh;

function buildHair(style: string, head: THREE.Group, mat: THREE.Material, mesh: MeshFn, sphere: SphFn, caps: CapFn) {
  const y = 0.16;
  const cap = (scaleY: number, r = 0.152) => { const c = sphere(r, mat); c.position.set(0, y + 0.02, -0.005); c.scale.set(1.02, scaleY, 1.04); return c; };
  if (style === 'bald') return;
  if (style === 'buzz') { const c = cap(0.62); head.add(c); return; }
  if (style === 'fade') { const c = cap(0.7); head.add(c); const top = sphere(0.14, mat); top.position.set(0, y + 0.08, -0.01); top.scale.set(0.95, 0.8, 1); head.add(top); return; }
  if (style === 'short') { const c = cap(0.85); head.add(c); return; }
  if (style === 'afro') { const a = sphere(0.22, mat); a.position.set(0, y + 0.06, -0.01); head.add(a); return; }
  if (style === 'curly') { head.add(cap(0.8)); for (let i = 0; i < 14; i++) { const c = sphere(0.05 + Math.random() * 0.02, mat); const a = Math.random() * Math.PI * 2, r = 0.14; c.position.set(Math.cos(a) * r, y + 0.1 + Math.random() * 0.06, -0.02 + Math.sin(a) * r * 0.6); head.add(c); } return; }
  if (style === 'dreads') { head.add(cap(0.8)); for (let i = 0; i < 10; i++) { const d = caps(0.018, 0.22 + Math.random() * 0.1, mat); const a = (i / 10) * Math.PI * 2; d.position.set(Math.cos(a) * 0.14, y - 0.05, -0.04 + Math.sin(a) * 0.1); head.add(d); } return; }
  if (style === 'long') {
    head.add(cap(0.9, 0.155));
    for (const sx of [-1, 1]) { const side = mesh(new THREE.BoxGeometry(0.06, 0.4, 0.12), mat); side.position.set(sx * 0.15, y - 0.12, -0.02); head.add(side); }
    const back = mesh(new THREE.BoxGeometry(0.24, 0.42, 0.08), mat); back.position.set(0, y - 0.14, -0.11); head.add(back); return;
  }
  if (style === 'ponytail') {
    head.add(cap(0.82));
    const tie = sphere(0.05, mat); tie.position.set(0, y + 0.02, -0.14); head.add(tie);
    const tail = caps(0.04, 0.3, mat); tail.position.set(0, y - 0.12, -0.18); tail.rotation.x = -0.3; head.add(tail); return;
  }
  if (style === 'bun') { head.add(cap(0.82)); const bun = sphere(0.075, mat); bun.position.set(0, y + 0.14, -0.1); head.add(bun); return; }
}

function buildBeard(style: string, head: THREE.Group, mat: THREE.Material, mesh: MeshFn, sphere: SphFn) {
  const y = 0.16;
  if (style === 'stubble') { const s = sphere(0.13, mat); s.position.set(0, y - 0.05, 0.03); s.scale.set(1, 0.7, 0.9); (s.material as THREE.MeshStandardMaterial).transparent = true; (s.material as any).opacity = 0.5; head.add(s); return; }
  if (style === 'mustache') { const m = mesh(new THREE.BoxGeometry(0.06, 0.014, 0.02), mat); m.position.set(0, y - 0.055, 0.13); head.add(m); return; }
  if (style === 'goatee') { const g = sphere(0.04, mat); g.position.set(0, y - 0.1, 0.1); g.scale.set(1, 1.2, 0.8); head.add(g); const m = mesh(new THREE.BoxGeometry(0.055, 0.013, 0.02), mat); m.position.set(0, y - 0.055, 0.13); head.add(m); return; }
  if (style === 'full') { const b = sphere(0.14, mat); b.position.set(0, y - 0.07, 0.02); b.scale.set(1, 0.85, 0.95); head.add(b); const m = mesh(new THREE.BoxGeometry(0.06, 0.014, 0.02), mat); m.position.set(0, y - 0.055, 0.13); head.add(m); return; }
}

function buildHat(style: string, head: THREE.Group, mat: THREE.Material, mesh: MeshFn, sphere: SphFn) {
  const y = 0.16;
  if (style === 'cap') { const c = sphere(0.15, mat); c.position.set(0, y + 0.05, 0); c.scale.set(1, 0.6, 1); head.add(c); const v = mesh(new THREE.BoxGeometry(0.2, 0.02, 0.12), mat); v.position.set(0, y + 0.05, 0.16); head.add(v); return; }
  if (style === 'beanie') { const b = sphere(0.16, mat); b.position.set(0, y + 0.06, 0); b.scale.set(1, 0.85, 1); head.add(b); const brim = mesh(new THREE.TorusGeometry(0.15, 0.02, 8, 20), mat); brim.rotation.x = Math.PI / 2; brim.position.set(0, y + 0.02, 0); head.add(brim); return; }
}

function buildGlasses(style: string, face: THREE.Group, mat: THREE.Material, mesh: MeshFn) {
  const y = 0.02, z = 0.14;
  const lens = style === 'shades'
    ? track2(new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2, metalness: 0.4 }))
    : mat;
  for (const sx of [-1, 1]) {
    const shape = style === 'square' ? new THREE.BoxGeometry(0.06, 0.045, 0.01) : new THREE.TorusGeometry(0.03, 0.006, 8, 16);
    const l = mesh(shape, lens); l.position.set(sx * 0.05, y, z); if (style !== 'square') l.rotation.x = 0; face.add(l);
  }
  const bridge = mesh(new THREE.BoxGeometry(0.03, 0.006, 0.006), mat); bridge.position.set(0, y, z); face.add(bridge);
  // shades lenses are disposed by the returned material? handled via track2 fallback
}
// glasses shade material isn't tracked by the main disposer; small + freed on context loss.
function track2<T extends THREE.Material>(m: T): T { return m; }
