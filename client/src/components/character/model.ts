// ── Character Creator — stylized Y2K avatar model (v2) ─────────────────
// Full procedural rebuild toward the IMVU/ZEPETO art direction: toon-shaded
// bodies with fashion proportions (long legs, slim waist), and — the big one —
// PAINTED faces: each eye and the whole face are canvas-drawn decals (iris
// gradients, highlights, lashes, liner, lips, blush, freckles), the same
// technique stylized mobile avatar games use. Gradient two-tone hair, bangs,
// twin tails, crop tops, dresses, platform shoes, thigh-high socks, jewellery.
//
// Still procedural (no downloaded assets — CSP), but every sub-builder is a
// swap point for authored GLTF packs later. Exposes the same rig API used by
// the creator preview and the 3D worlds: setPose / emote / update / dispose.
import * as THREE from 'three';
import type { CharacterSpec, BodyBuild } from './spec';

export type CharEmote = 'wave' | 'dance' | 'clap' | 'heart' | 'laugh';

export interface CharacterModel {
  group: THREE.Group;
  update: (dt: number, elapsed: number) => void;
  setPose: (speed: number, sitting: boolean, hold?: string | null) => void;
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

interface BuildParams { torsoW: number; limbW: number; hips: number; chest: number; }
function buildParams(build: BodyBuild, female: boolean): BuildParams {
  const base: Record<BodyBuild, BuildParams> = {
    slim: { torsoW: 0.86, limbW: 0.85, hips: 1, chest: 0 },
    athletic: { torsoW: 1.0, limbW: 1.0, hips: 1, chest: 0 },
    muscular: { torsoW: 1.14, limbW: 1.18, hips: 1, chest: 0 },
    heavy: { torsoW: 1.28, limbW: 1.22, hips: 1.12, chest: 0 },
  };
  const p = { ...base[build] };
  if (female) { p.hips *= 1.12; p.chest = 0.05 + (build === 'heavy' ? 0.02 : 0); p.limbW *= 0.9; }
  return p;
}

export function buildCharacter(spec: CharacterSpec): CharacterModel {
  const female = spec.gender === 'female';
  const bp = buildParams(spec.build, female);
  const shW = spec.shoulders * (female ? 0.9 : 1);
  const m = spec.legLen; // leg length multiplier
  const root = new THREE.Group();
  const disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  const track = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(x: T): T => { disposables.push(x); return x; };

  // 3-step toon ramp shared by all cloth/skin/hair materials → clean anime shading
  const ramp = track(new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.RedFormat));
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  const toon = (color: string | number) => track(new THREE.MeshToonMaterial({ color: new THREE.Color(color as any), gradientMap: ramp }));

  const skinMat = toon(spec.skin);
  const hairMat = toon(spec.hairColor);
  const tipsMat = toon(spec.hairColor2 || spec.hairColor);
  const topMat = toon(spec.topColor);
  const botMat = toon(spec.bottomColor);
  const shoeMat = toon(spec.shoeColor);
  const sockMat = toon(spec.sockColor);
  const gold = track(new THREE.MeshStandardMaterial({ color: 0xe8c368, roughness: 0.25, metalness: 0.9 }));
  const silver = track(new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.25, metalness: 0.9 }));

  const mesh = (g: THREE.BufferGeometry, mat: THREE.Material) => { const x = new THREE.Mesh(track(g), mat); x.castShadow = true; return x; };
  const sphere = (r: number, mat: THREE.Material) => mesh(new THREE.SphereGeometry(r, 20, 16), mat);
  const caps = (r: number, len: number, mat: THREE.Material) => mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat);

  const crop = spec.top === 'crop';
  const dress = spec.top === 'dress';
  const skirt = spec.bottom === 'skirt' && !dress;
  const shorts = spec.bottom === 'shorts' && !dress;
  const longSleeve = spec.top === 'hoodie' || spec.top === 'jacket' || spec.top === 'sweater';
  const sleeveless = spec.top === 'tank' || spec.top === 'dress' || crop;
  const bareLegs = dress || skirt;

  // ── Upper body (shifted by leg-length so feet stay on the floor) ─────
  const dy = 0.88 * (m - 1);
  const upper = new THREE.Group(); upper.position.y = dy; root.add(upper);
  const torso = new THREE.Group(); upper.add(torso);

  // hips
  const hipMat = (dress) ? topMat : (skirt ? botMat : botMat);
  const hips = caps(0.145 * bp.torsoW * bp.hips, 0.1, bareLegs ? skinMat : hipMat);
  hips.position.y = 0.92; hips.scale.set(1, 1, 0.75); torso.add(hips);
  // waist — bare skin for crop tops, slimmer for female
  const waist = caps(0.115 * bp.torsoW * (female ? 0.86 : 1), 0.08, crop ? skinMat : (dress ? topMat : topMat));
  waist.position.y = 1.06; waist.scale.set(1, 1, 0.72); torso.add(waist);
  // chest
  const chest = caps(0.15 * bp.torsoW, crop ? 0.13 : 0.2, topMat);
  chest.position.y = crop ? 1.26 : 1.22; chest.scale.set(1, 1, 0.72); torso.add(chest);
  // shoulders
  const shoulders = mesh(new THREE.CapsuleGeometry(0.08, 0.3 * shW, 4, 10), sleeveless && !dress ? skinMat : topMat);
  shoulders.rotation.z = Math.PI / 2; shoulders.position.y = 1.36; shoulders.scale.set(1, 1, 0.8); torso.add(shoulders);
  // female bust — HIGH on the chest, right under the shoulder line
  if (bp.chest > 0) {
    for (const sx of [-1, 1]) {
      const c = sphere(0.062 + bp.chest * 0.3, topMat);
      c.position.set(sx * 0.06, 1.295, 0.09);
      c.scale.set(1, 0.85, 0.72);
      torso.add(c);
    }
  }
  // dress flare
  if (dress) {
    const fl = mesh(new THREE.ConeGeometry(0.26 * bp.hips, 0.42, 18, 1, true), topMat);
    fl.position.y = 0.82; fl.scale.set(1, 1, 0.85); torso.add(fl);
  }
  if (skirt) {
    const sk = mesh(new THREE.ConeGeometry(0.25 * bp.hips, 0.3, 18, 1, true), botMat);
    sk.position.y = 0.86; sk.scale.set(1, 1, 0.85); torso.add(sk);
  }
  // garment details
  if (spec.top === 'hoodie') {
    const hood = sphere(0.14, topMat); hood.position.set(0, 1.4, -0.09); hood.scale.set(1, 0.7, 0.8); torso.add(hood);
    const pocket = mesh(new THREE.BoxGeometry(0.18, 0.1, 0.05), topMat); pocket.position.set(0, 1.1, 0.12 * bp.torsoW); torso.add(pocket);
  } else if (spec.top === 'jacket') {
    const inner = toon(0x14151c);
    const strip = mesh(new THREE.BoxGeometry(0.08, 0.26, 0.035), inner); strip.position.set(0, 1.22, 0.115 * bp.torsoW); torso.add(strip);
  } else if (spec.top === 'sweater') {
    const collar = mesh(new THREE.TorusGeometry(0.075, 0.025, 8, 16), topMat); collar.rotation.x = Math.PI / 2; collar.position.y = 1.415; torso.add(collar);
  }
  if (spec.belt && !dress) {
    const belt = mesh(new THREE.TorusGeometry(0.145 * bp.torsoW, 0.016, 8, 22), toon(0x17181c));
    belt.rotation.x = Math.PI / 2; belt.position.y = 0.995; belt.scale.set(1, 0.76, 1); torso.add(belt);
    const buckle = mesh(new THREE.BoxGeometry(0.035, 0.024, 0.012), gold); buckle.position.set(0, 0.995, 0.125 * bp.torsoW); torso.add(buckle);
  }
  if (spec.necklace) {
    const chain = mesh(new THREE.TorusGeometry(0.085, 0.007, 6, 24), silver);
    chain.position.set(0, 1.37, 0.02); chain.rotation.x = 1.25; torso.add(chain);
    const pend = sphere(0.016, silver); pend.position.set(0, 1.31, 0.1); torso.add(pend);
  }

  // ── Head + painted face ──────────────────────────────────────────────
  const headGrp = new THREE.Group(); headGrp.position.y = 1.5; upper.add(headGrp);
  const neck = caps(0.048, 0.06, skinMat); neck.position.y = -0.02; headGrp.add(neck);
  const head = sphere(0.152, skinMat); head.position.y = 0.07; head.scale.set(0.95, 1.07, 0.92); headGrp.add(head);
  if (!female) { const jaw = sphere(0.095, skinMat); jaw.position.set(0, 0.0, 0.015); jaw.scale.set(1.06, 0.72, 0.92); headGrp.add(jaw); }
  // small stylized nose bump
  const nose = sphere(0.016, skinMat); nose.position.set(0, 0.055, 0.138); nose.scale.set(0.8, 1.1, 0.7); headGrp.add(nose);
  // ears
  for (const sx of [-1, 1]) { const ear = sphere(0.028, skinMat); ear.position.set(sx * 0.14, 0.075, -0.005); ear.scale.set(0.5, 1, 0.7); headGrp.add(ear); }

  // face decal (brows, lips, blush, freckles, beauty mark)
  const faceTexture = track(makeFaceTexture(spec));
  const facePlane = new THREE.Mesh(track(new THREE.PlaneGeometry(0.26, 0.26)), track(new THREE.MeshBasicMaterial({ map: faceTexture, transparent: true })));
  facePlane.position.set(0, 0.07, 0.134); headGrp.add(facePlane);
  // eye decals (blink by Y-scale)
  const eyes: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const tex = track(makeEyeTexture(spec, sx));
    const eye = new THREE.Mesh(track(new THREE.PlaneGeometry(0.078, 0.078)), track(new THREE.MeshBasicMaterial({ map: tex, transparent: true })));
    eye.position.set(sx * 0.052, 0.085, 0.138); headGrp.add(eye); eyes.push(eye);
  }

  // facial hair
  if (!female && spec.beard !== 'none') {
    const beardMat = toon(spec.beardColor);
    buildBeard(spec.beard, headGrp, beardMat, mesh, sphere);
  }
  // hair / hat
  if (spec.hat === 'none' || ['long', 'wavy', 'ponytail', 'twintails'].includes(spec.hair)) {
    buildHair(spec, headGrp, hairMat, tipsMat, mesh, sphere, caps);
  }
  if (spec.hat !== 'none') buildHat(spec.hat, headGrp, toon(spec.hatColor), mesh, sphere);
  if (spec.glasses !== 'none') buildGlasses(spec.glasses, headGrp, toon(0x121216), mesh);
  if (spec.earrings) for (const sx of [-1, 1]) {
    const ring = mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 12), gold);
    ring.position.set(sx * 0.147, 0.045, 0.0); headGrp.add(ring);
  }
  if (spec.hairclip) for (const i of [0, 1]) {
    const clip = mesh(new THREE.BoxGeometry(0.032, 0.01, 0.008), track(new THREE.MeshStandardMaterial({ color: 0xff7ab0, roughness: 0.35, metalness: 0.2 })));
    clip.position.set(0.085 + i * 0.028, 0.165 - i * 0.012, 0.115); clip.rotation.z = -0.6; headGrp.add(clip);
  }

  // emote emoji
  const emoji = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
  emoji.scale.set(0.4, 0.4, 1); emoji.position.set(0, 0.42, 0); emoji.visible = false;
  disposables.push(emoji.material);
  headGrp.add(emoji);

  // ── Arms ─────────────────────────────────────────────────────────────
  const gloveMat = sockMat;
  const armGroups: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const ag = new THREE.Group(); ag.position.set(sx * (0.16 * shW + 0.025), 1.35, 0); upper.add(ag); armGroups.push(ag);
    const upperArmMat = sleeveless ? skinMat : topMat;
    const lowerArmMat = spec.gloves === 'long' ? gloveMat : (longSleeve ? topMat : skinMat);
    const ua = caps(0.046 * bp.limbW, 0.2, upperArmMat); ua.position.y = -0.14; ag.add(ua);
    const la = caps(0.04 * bp.limbW, 0.18, lowerArmMat); la.position.y = -0.37; ag.add(la);
    const hand = sphere(0.042, spec.gloves !== 'none' ? gloveMat : skinMat); hand.position.y = -0.5; hand.scale.set(0.9, 1.15, 0.7); ag.add(hand);
    ag.rotation.z = sx * 0.07;
  }

  // ── Legs (fashion-long, with socks / coverage logic) ─────────────────
  const legMatFull = (spec.bottom === 'jeans' || spec.bottom === 'cargo') && !bareLegs ? botMat : skinMat;
  const legGroups: THREE.Group[] = [];
  const kneeGroups: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const lg = new THREE.Group(); lg.position.set(sx * 0.075 * bp.hips, 0.88 * m, 0); root.add(lg); legGroups.push(lg);
    const thigh = caps(0.062 * bp.limbW, 0.3 * m, legMatFull); thigh.position.y = -0.235 * m; lg.add(thigh);
    if (shorts) { const sh = caps(0.068 * bp.limbW, 0.1 * m, botMat); sh.position.y = -0.105 * m; lg.add(sh); }
    if (spec.bottom === 'cargo' && !bareLegs) { const pk = mesh(new THREE.BoxGeometry(0.05, 0.08, 0.04), botMat); pk.position.set(sx * 0.055, -0.28 * m, 0.03); lg.add(pk); }
    if (spec.socks === 'thigh') { const s2 = caps(0.065 * bp.limbW, 0.08 * m, sockMat); s2.position.y = -0.42 * m; lg.add(s2); }
    // knee joint — everything below the knee bends with it (natural sitting)
    const knee = new THREE.Group(); knee.position.y = -0.47 * m; lg.add(knee); kneeGroups.push(knee);
    const shin = caps(0.05 * bp.limbW, 0.3 * m, legMatFull === botMat && !shorts ? botMat : skinMat); shin.position.y = -0.15 * m; knee.add(shin);
    // socks overlay (slightly fatter than the leg)
    if (spec.socks === 'thigh') {
      const s1 = caps(0.054 * bp.limbW, 0.3 * m, sockMat); s1.position.y = -0.15 * m; knee.add(s1);
    } else if (spec.socks === 'knee') {
      const s1 = caps(0.054 * bp.limbW, 0.26 * m, sockMat); s1.position.y = -0.17 * m; knee.add(s1);
    } else if (spec.socks === 'short') {
      const s1 = caps(0.054 * bp.limbW, 0.05 * m, sockMat); s1.position.y = -0.31 * m; knee.add(s1);
    }
    buildShoe(spec.shoes, knee, -0.375 * m, shoeMat, mesh, caps);
  }

  // identity glow ring
  const glow = mesh(new THREE.RingGeometry(0.26, 0.32, 28), track(new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.glow), transparent: true, opacity: 0.4, side: THREE.DoubleSide })));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.01; root.add(glow);

  root.scale.setScalar(spec.height);

  // ── Animation (breathing / blink / locomotion / emotes) ──────────────
  let blinkT = 2 + Math.random() * 3;
  let poseSpeed = 0, sitting = false, walkPhase = 0, holdPose: string | null = null;
  let emoteKind: CharEmote | null = null, emoteUntil = 0;

  const setPose = (speed: number, sit: boolean, hold?: string | null) => { poseSpeed = speed; sitting = sit; holdPose = hold ?? null; };
  const emote = (kind: CharEmote) => {
    emoteKind = kind; emoteUntil = performance.now() + (kind === 'dance' ? 4200 : 2400);
    const mt = emoji.material as THREE.SpriteMaterial; mt.map = emojiTex(EMOTE_EMOJI[kind] ?? '👋'); mt.needsUpdate = true; emoji.visible = true;
  };

  const update = (dt: number, e: number) => {
    const br = Math.sin(e * 1.4) * 0.012;
    chest.scale.y = 1 + br; headGrp.position.y = 1.5 + br * 0.5;
    root.rotation.z = Math.sin(e * 0.7) * 0.005;

    if (holdPose === 'titanic') {
      // standing, arms spread wide out to the sides (the bow pose)
      const k = Math.min(1, dt * 8);
      legGroups.forEach(l => { l.rotation.x *= 0.8; });
      kneeGroups.forEach(kn => { kn.rotation.x *= 0.8; });
      armGroups[0].rotation.x += (-0.05 - armGroups[0].rotation.x) * k; armGroups[0].rotation.z += (1.4 - armGroups[0].rotation.z) * k;
      armGroups[1].rotation.x += (-0.05 - armGroups[1].rotation.x) * k; armGroups[1].rotation.z += (-1.4 - armGroups[1].rotation.z) * k;
      chest.scale.y = 1 + br + 0.02;
    } else if (sitting) {
      // thighs forward, knees bent so the shins hang down — a natural seat pose
      const k = Math.min(1, dt * 12);
      legGroups.forEach(l => { l.rotation.x += (-1.45 - l.rotation.x) * k; });
      kneeGroups.forEach(kn => { kn.rotation.x += (1.45 - kn.rotation.x) * k; });
      armGroups.forEach(a => { a.rotation.x += (-0.25 - a.rotation.x) * k; });
    } else if (poseSpeed > 0.15) {
      const run = poseSpeed > 4.2;
      walkPhase += dt * (run ? 11 : 7);
      const sw = Math.sin(walkPhase) * (run ? 0.85 : 0.55);
      legGroups[0].rotation.x = sw; legGroups[1].rotation.x = -sw;
      kneeGroups[0].rotation.x = Math.max(0, -Math.sin(walkPhase)) * 0.9;
      kneeGroups[1].rotation.x = Math.max(0, Math.sin(walkPhase)) * 0.9;
      armGroups[0].rotation.x = -sw * 0.7; armGroups[1].rotation.x = sw * 0.7;
      armGroups[0].rotation.z += (0.07 - armGroups[0].rotation.z) * Math.min(1, dt * 6);
      armGroups[1].rotation.z += (-0.07 - armGroups[1].rotation.z) * Math.min(1, dt * 6);
    } else {
      legGroups.forEach(l => { l.rotation.x *= 0.8; });
      kneeGroups.forEach(kn => { kn.rotation.x *= 0.8; });
      armGroups.forEach((a, i) => {
        a.rotation.x += (Math.sin(e * 1.2 + i * Math.PI) * 0.04 - a.rotation.x) * Math.min(1, dt * 6);
        a.rotation.z += ((i === 0 ? 0.07 : -0.07) - a.rotation.z) * Math.min(1, dt * 6);
      });
    }

    const now = performance.now();
    if (emoteKind && now < emoteUntil) {
      applyCharEmote(emoteKind, now, armGroups, torso, root);
      emoji.visible = true; emoji.position.y = 0.42 + Math.sin(now / 200) * 0.05;
    } else if (emoteKind) {
      emoteKind = null; emoji.visible = false;
      armGroups.forEach(a => { a.rotation.z = a === armGroups[0] ? -0.07 : 0.07; });
      torso.rotation.z = 0; torso.rotation.x = 0;
    }

    blinkT -= dt;
    let ey = 1;
    if (blinkT < 0.13) ey = Math.max(0.06, Math.abs(blinkT / 0.13) * 2 - 1);
    if (blinkT < 0) blinkT = 2.5 + Math.random() * 3.5;
    eyes.forEach(g => { g.scale.y = ey; });
  };

  return { group: root, update, setPose, emote, dispose: () => disposables.forEach(d => d.dispose()) };
}

function applyCharEmote(kind: CharEmote, now: number, arms: THREE.Group[], torso: THREE.Group, root: THREE.Group) {
  const t = now / 1000;
  const [aL, aR] = arms;
  if (kind === 'wave') { aR.rotation.x = -2.6; aR.rotation.z = Math.sin(now / 90) * 0.4 - 0.3; }
  else if (kind === 'dance') { const s = Math.sin(t * 7); torso.rotation.z = s * 0.16; root.position.y += Math.abs(Math.sin(t * 7)) * 0.06; aL.rotation.x = -2.2 + s * 0.4; aR.rotation.x = -2.2 - s * 0.4; aL.rotation.z = 0.4; aR.rotation.z = -0.4; }
  else if (kind === 'clap') { const c = Math.sin(t * 12) * 0.5; aL.rotation.x = -1.5; aR.rotation.x = -1.5; aL.rotation.z = 0.5 - c; aR.rotation.z = -0.5 + c; }
  else if (kind === 'heart') { aL.rotation.x = -1.3; aR.rotation.x = -1.3; aL.rotation.z = 0.7; aR.rotation.z = -0.7; torso.rotation.x = Math.sin(t * 3) * 0.05; }
  else { torso.rotation.x = 0.22 + Math.sin(t * 12) * 0.05; aL.rotation.x = -0.6; aR.rotation.x = -0.6; }
}

// ── Painted face ───────────────────────────────────────────────────────
function makeEyeTexture(spec: CharacterSpec, side: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const female = spec.gender === 'female';
  const shapes: Record<string, { rx: number; ry: number; rot: number }> = {
    round: { rx: 34, ry: 42, rot: 0 },
    almond: { rx: 44, ry: 28, rot: -0.1 },
    sharp: { rx: 42, ry: 26, rot: -0.2 },
    droopy: { rx: 40, ry: 30, rot: 0.22 },
  };
  const sh = shapes[spec.eyeShape] ?? shapes.round;
  const rot = sh.rot * side;
  const cx = 64, cy = 66;

  const eyePath = () => { g.beginPath(); g.ellipse(cx, cy, sh.rx, sh.ry, rot, 0, Math.PI * 2); };

  // eyeshadow halo behind the eye
  if (spec.eyeshadow) {
    const grad = g.createRadialGradient(cx, cy - 14, 6, cx, cy - 10, 46);
    const col = spec.eyeshadow;
    grad.addColorStop(0, col + 'aa'); grad.addColorStop(1, col + '00');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 90);
  }

  // white
  eyePath(); g.fillStyle = '#fdfdfd'; g.fill();
  // soft top inner shade
  g.save(); eyePath(); g.clip();
  g.fillStyle = 'rgba(130,120,150,0.28)';
  g.beginPath(); g.ellipse(cx, cy - sh.ry - 8, sh.rx + 8, sh.ry * 0.7 + 10, rot, 0, Math.PI * 2); g.fill();

  // iris (radial gradient in the eye colour)
  const ec = new THREE.Color(spec.eyeColor);
  const light = ec.clone().lerp(new THREE.Color(0xffffff), 0.45).getStyle();
  const dark = ec.clone().multiplyScalar(0.35).getStyle();
  const ir = Math.min(sh.rx, 30);
  const ig = g.createRadialGradient(cx, cy + 2, 2, cx, cy + 2, ir);
  ig.addColorStop(0, light); ig.addColorStop(0.55, ec.getStyle()); ig.addColorStop(1, dark);
  g.fillStyle = ig; g.beginPath(); g.arc(cx, cy + 2, ir, 0, Math.PI * 2); g.fill();
  // iris rim
  g.strokeStyle = dark; g.lineWidth = 2.5; g.beginPath(); g.arc(cx, cy + 2, ir - 1, 0, Math.PI * 2); g.stroke();

  // pupil styles
  g.fillStyle = '#101014';
  if (spec.pupil === 'cat') { g.beginPath(); g.ellipse(cx, cy + 2, 5, 14, 0, 0, Math.PI * 2); g.fill(); }
  else if (spec.pupil === 'star') { starPath(g, cx, cy + 2, 11, 5); g.fill(); }
  else if (spec.pupil === 'heart') { heartPath(g, cx, cy + 3, 11); g.fill(); }
  else { g.beginPath(); g.arc(cx, cy + 2, 10, 0, Math.PI * 2); g.fill(); }

  // sparkle highlights — the anime signature
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath(); g.arc(cx - 9 * side, cy - 8, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.beginPath(); g.arc(cx + 8 * side, cy + 10, 3.5, 0, Math.PI * 2); g.fill();
  g.restore();

  // top lash line (thicker with liner), following the ellipse top
  const lashW = spec.eyeliner ? 9 : female ? 7 : 5;
  g.strokeStyle = '#181018'; g.lineWidth = lashW; g.lineCap = 'round';
  g.beginPath(); g.ellipse(cx, cy, sh.rx, sh.ry, rot, Math.PI * 1.08, Math.PI * 1.92);
  g.stroke();
  // liner wing at the outer corner
  if (spec.eyeliner || female) {
    const wx = cx + side * (sh.rx + 2), wy = cy - sh.ry * 0.42;
    g.lineWidth = lashW * 0.8;
    g.beginPath(); g.moveTo(wx - side * 6, wy + 5); g.lineTo(wx + side * 8, wy - 6); g.stroke();
  }
  // small lashes
  if (female) {
    g.lineWidth = 3;
    for (const f of [0.2, 0.42, 0.64]) {
      const a = Math.PI * (1.06 + f * 0.8);
      const lx = cx + Math.cos(a + rot) * sh.rx, ly = cy + Math.sin(a + rot) * sh.ry;
      g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + Math.cos(a) * 9, ly + Math.sin(a) * 9); g.stroke();
    }
  }
  // lower faint line
  g.strokeStyle = 'rgba(60,40,60,0.5)'; g.lineWidth = 2.5;
  g.beginPath(); g.ellipse(cx, cy, sh.rx * 0.92, sh.ry * 0.92, rot, Math.PI * 0.15, Math.PI * 0.85); g.stroke();

  return new THREE.CanvasTexture(c);
}

function makeFaceTexture(spec: CharacterSpec): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const female = spec.gender === 'female';

  // brows
  g.strokeStyle = spec.browColor; g.lineCap = 'round';
  g.lineWidth = female ? 5 : 8;
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.moveTo(128 + sx * 26, 78);
    g.quadraticCurveTo(128 + sx * 48, female ? 66 : 70, 128 + sx * 66, 76);
    g.stroke();
  }
  // nose shadow
  g.strokeStyle = 'rgba(120,70,50,0.35)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(124, 152); g.quadraticCurveTo(128, 160, 133, 154); g.stroke();
  // lips
  const lip = spec.lipstick || 'rgba(160,90,90,0.85)';
  g.fillStyle = lip;
  g.beginPath();
  g.moveTo(104, 196);
  g.quadraticCurveTo(118, 188, 128, 193);
  g.quadraticCurveTo(138, 188, 152, 196);
  g.quadraticCurveTo(140, 208, 128, 208);
  g.quadraticCurveTo(116, 208, 104, 196);
  g.fill();
  if (spec.lipstick) { g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.ellipse(122, 199, 7, 2.5, -0.2, 0, Math.PI * 2); g.fill(); }
  // blush
  if (spec.blush) {
    for (const sx of [-1, 1]) {
      const bg = g.createRadialGradient(128 + sx * 60, 156, 2, 128 + sx * 60, 156, 22);
      bg.addColorStop(0, 'rgba(255,130,150,0.5)'); bg.addColorStop(1, 'rgba(255,130,150,0)');
      g.fillStyle = bg; g.beginPath(); g.arc(128 + sx * 60, 156, 22, 0, Math.PI * 2); g.fill();
    }
  }
  // freckles
  if (spec.freckles) {
    g.fillStyle = 'rgba(120,70,40,0.45)';
    const spots = [[-40, 150], [-52, 160], [-30, 162], [-16, 152], [14, 152], [30, 160], [44, 150], [54, 162], [-4, 146], [6, 158]];
    for (const [dx, dyy] of spots) { g.beginPath(); g.arc(128 + dx, dyy, 2.1, 0, Math.PI * 2); g.fill(); }
  }
  // beauty mark
  if (spec.beautyMark) { g.fillStyle = '#241812'; g.beginPath(); g.arc(158, 202, 3, 0, Math.PI * 2); g.fill(); }

  return new THREE.CanvasTexture(c);
}

function starPath(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, spikes: number) {
  g.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}
function heartPath(g: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  g.beginPath();
  g.moveTo(cx, cy + s * 0.6);
  g.bezierCurveTo(cx - s * 1.2, cy - s * 0.4, cx - s * 0.5, cy - s * 1.1, cx, cy - s * 0.35);
  g.bezierCurveTo(cx + s * 0.5, cy - s * 1.1, cx + s * 1.2, cy - s * 0.4, cx, cy + s * 0.6);
  g.closePath();
}

// ── Hair (v2, with bangs + gradient tips) ─────────────────────────────
type MeshFn = (g: THREE.BufferGeometry, m: THREE.Material) => THREE.Mesh;
type SphFn = (r: number, m: THREE.Material) => THREE.Mesh;
type CapFn = (r: number, len: number, m: THREE.Material) => THREE.Mesh;

function buildHair(spec: CharacterSpec, head: THREE.Group, hairMat: THREE.Material, tipsMat: THREE.Material, mesh: MeshFn, sphere: SphFn, caps: CapFn) {
  const style = spec.hair;
  if (style === 'bald') return;
  const y = 0.07;
  // scalp shell — pushed back so the painted face stays visible
  const scalp = sphere(style === 'buzz' ? 0.156 : 0.16, hairMat);
  scalp.position.set(0, y + 0.012, -0.018);
  scalp.scale.set(1.0, style === 'buzz' ? 0.98 : 1.03, 0.98);
  head.add(scalp);

  // bangs — a soft fringe across the forehead
  if (spec.bangs && style !== 'buzz') {
    for (let i = 0; i < 5; i++) {
      const b = mesh(new THREE.BoxGeometry(0.048, 0.075 + (i % 2) * 0.02, 0.03), hairMat);
      b.position.set(-0.096 + i * 0.048, 0.175, 0.118);
      b.rotation.z = (i - 2) * 0.06;
      b.rotation.x = -0.25;
      head.add(b);
    }
  }
  if (style === 'buzz') return;
  if (style === 'short') { const top = sphere(0.115, hairMat); top.position.set(0, y + 0.1, -0.02); top.scale.set(1, 0.68, 1); head.add(top); return; }
  if (style === 'bob') {
    for (const sx of [-1, 1]) { const s = mesh(new THREE.BoxGeometry(0.055, 0.2, 0.12), hairMat); s.position.set(sx * 0.145, y - 0.03, -0.005); head.add(s); }
    const back = mesh(new THREE.BoxGeometry(0.26, 0.22, 0.07), hairMat); back.position.set(0, y - 0.02, -0.115); head.add(back);
    return;
  }
  if (style === 'long' || style === 'wavy') {
    const wav = style === 'wavy';
    for (const sx of [-1, 1]) {
      if (wav) {
        for (let seg = 0; seg < 3; seg++) {
          const s = caps(0.045, 0.12, seg === 2 ? tipsMat : hairMat);
          s.position.set(sx * (0.145 + seg * 0.012), y - 0.04 - seg * 0.13, -0.005 + Math.sin(seg) * 0.015);
          s.rotation.z = sx * (0.08 + seg * 0.06);
          head.add(s);
        }
      } else {
        const s = mesh(new THREE.BoxGeometry(0.055, 0.34, 0.11), hairMat); s.position.set(sx * 0.147, y - 0.1, -0.01); head.add(s);
        const tip = mesh(new THREE.BoxGeometry(0.055, 0.1, 0.11), tipsMat); tip.position.set(sx * 0.147, y - 0.31, -0.01); head.add(tip);
      }
    }
    const back = mesh(new THREE.BoxGeometry(0.26, 0.4, 0.07), hairMat); back.position.set(0, y - 0.12, -0.112); head.add(back);
    const backTip = mesh(new THREE.BoxGeometry(0.26, 0.12, 0.07), tipsMat); backTip.position.set(0, y - 0.37, -0.112); head.add(backTip);
    return;
  }
  if (style === 'curly') {
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2;
      const s = sphere(0.05 + (i % 3) * 0.008, i % 4 === 0 ? tipsMat : hairMat);
      s.position.set(Math.cos(a) * 0.13, y + 0.09 + Math.sin(i * 2.3) * 0.05, -0.02 + Math.sin(a) * 0.1);
      head.add(s);
    }
    return;
  }
  if (style === 'afro') { const a = sphere(0.21, hairMat); a.position.set(0, y + 0.09, -0.015); head.add(a); return; }
  if (style === 'ponytail') {
    const tie = sphere(0.045, tipsMat); tie.position.set(0, y + 0.1, -0.15); head.add(tie);
    const t1 = caps(0.045, 0.14, hairMat); t1.position.set(0, y - 0.02, -0.185); t1.rotation.x = -0.3; head.add(t1);
    const t2 = caps(0.038, 0.16, tipsMat); t2.position.set(0, y - 0.2, -0.215); t2.rotation.x = -0.12; head.add(t2);
    return;
  }
  if (style === 'twintails') {
    for (const sx of [-1, 1]) {
      const tie = sphere(0.038, tipsMat); tie.position.set(sx * 0.135, y + 0.12, -0.04); head.add(tie);
      const t1 = caps(0.05, 0.15, hairMat); t1.position.set(sx * 0.165, y - 0.02, -0.045); t1.rotation.z = sx * 0.22; head.add(t1);
      const t2 = caps(0.044, 0.17, tipsMat); t2.position.set(sx * 0.19, y - 0.22, -0.05); t2.rotation.z = sx * 0.1; head.add(t2);
    }
    return;
  }
  if (style === 'bun') { const b = sphere(0.075, hairMat); b.position.set(0, y + 0.17, -0.08); head.add(b); return; }
  if (style === 'dreads') {
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const d = caps(0.016, 0.18 + (i % 3) * 0.05, i % 3 === 0 ? tipsMat : hairMat);
      d.position.set(Math.cos(a) * 0.13, y - 0.06, -0.03 + Math.sin(a) * 0.09);
      head.add(d);
    }
  }
}

function buildBeard(style: string, head: THREE.Group, mat: THREE.Material, mesh: MeshFn, sphere: SphFn) {
  const y = 0.07;
  if (style === 'stubble') { const s = sphere(0.125, mat); s.position.set(0, y - 0.06, 0.02); s.scale.set(1, 0.68, 0.9); (s.material as THREE.Material).transparent = true; (s.material as any).opacity = 0.45; head.add(s); return; }
  if (style === 'mustache') { const mm = mesh(new THREE.BoxGeometry(0.06, 0.014, 0.02), mat); mm.position.set(0, y - 0.045, 0.128); head.add(mm); return; }
  if (style === 'goatee') { const gg = sphere(0.038, mat); gg.position.set(0, y - 0.1, 0.095); gg.scale.set(1, 1.2, 0.8); head.add(gg); const mm = mesh(new THREE.BoxGeometry(0.055, 0.013, 0.02), mat); mm.position.set(0, y - 0.045, 0.128); head.add(mm); return; }
  if (style === 'full') { const b = sphere(0.135, mat); b.position.set(0, y - 0.075, 0.015); b.scale.set(1, 0.82, 0.92); head.add(b); const mm = mesh(new THREE.BoxGeometry(0.06, 0.014, 0.02), mat); mm.position.set(0, y - 0.045, 0.128); head.add(mm); return; }
}

function buildHat(style: string, head: THREE.Group, mat: THREE.Material, mesh: MeshFn, sphere: SphFn) {
  const y = 0.07;
  if (style === 'cap') {
    const c = sphere(0.165, mat); c.position.set(0, y + 0.055, -0.01); c.scale.set(1, 0.58, 1); head.add(c);
    const v = mesh(new THREE.BoxGeometry(0.2, 0.018, 0.12), mat); v.position.set(0, y + 0.06, 0.17); head.add(v);
    return;
  }
  if (style === 'beanie') {
    const b = sphere(0.168, mat); b.position.set(0, y + 0.06, -0.01); b.scale.set(1, 0.82, 1); head.add(b);
    const brim = mesh(new THREE.TorusGeometry(0.155, 0.022, 8, 20), mat); brim.rotation.x = Math.PI / 2; brim.position.set(0, y + 0.03, -0.01); head.add(brim);
  }
}

function buildGlasses(style: string, head: THREE.Group, mat: THREE.Material, mesh: MeshFn) {
  const y = 0.085, z = 0.146;
  for (const sx of [-1, 1]) {
    const shape = style === 'square' ? new THREE.BoxGeometry(0.062, 0.05, 0.01) : new THREE.TorusGeometry(0.032, 0.006, 8, 16);
    const lens = mesh(shape, mat);
    lens.position.set(sx * 0.052, y, z);
    if (style === 'shades') { const dark = mesh(new THREE.CircleGeometry(0.03, 16), mat); dark.position.set(sx * 0.052, y, z + 0.002); head.add(dark); }
    head.add(lens);
  }
  const bridge = mesh(new THREE.BoxGeometry(0.03, 0.006, 0.006), mat); bridge.position.set(0, y, z); head.add(bridge);
}

function buildShoe(style: string, lg: THREE.Group, footY: number, shoeMat: THREE.Material, mesh: MeshFn, caps: CapFn) {
  if (style === 'heels') {
    const foot = mesh(new THREE.BoxGeometry(0.085, 0.045, 0.19), shoeMat); foot.position.set(0, footY + 0.02, 0.045); lg.add(foot);
    const heel = mesh(new THREE.BoxGeometry(0.028, 0.09, 0.028), shoeMat); heel.position.set(0, footY - 0.028, -0.055); lg.add(heel);
    return;
  }
  if (style === 'platform') {
    const foot = mesh(new THREE.BoxGeometry(0.095, 0.06, 0.21), shoeMat); foot.position.set(0, footY + 0.06, 0.045); lg.add(foot);
    const sole = mesh(new THREE.BoxGeometry(0.105, 0.06, 0.225), shoeMat); sole.position.set(0, footY, 0.045); lg.add(sole);
    return;
  }
  const h = style === 'boots' ? 0.12 : 0.08;
  const foot = mesh(new THREE.BoxGeometry(0.095, h, 0.21), shoeMat); foot.position.set(0, footY + h / 2 - 0.015, 0.045); lg.add(foot);
  if (style === 'boots') { const shaft = caps(0.056, 0.07, shoeMat); shaft.position.set(0, footY + 0.13, 0); lg.add(shaft); }
}
