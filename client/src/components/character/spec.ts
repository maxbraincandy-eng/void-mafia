// ── Character Creator — data-driven spec + catalogs (v2) ──────────────
// A single serializable `CharacterSpec` describes a player's whole look. All
// option lists live in catalogs so future cosmetic packs are pure data — no
// engine changes. The procedural model (model.ts) and the UI both read these.
//
// v2 = the Y2K / stylized-anime generation: painted faces (eye shapes, pupil
// styles, liner, freckles), gradient two-tone hair + bangs, fashion clothing
// (crop tops, dresses, skirts, platforms, thigh-high socks), jewellery, and
// body sliders (shoulders / leg length).

export type Gender = 'male' | 'female';
export type BodyBuild = 'slim' | 'athletic' | 'muscular' | 'heavy';
export type HairStyle = 'bald' | 'buzz' | 'short' | 'bob' | 'long' | 'wavy' | 'curly' | 'afro' | 'ponytail' | 'twintails' | 'bun' | 'dreads';
export type BeardStyle = 'none' | 'stubble' | 'goatee' | 'mustache' | 'full';
export type EyeShape = 'round' | 'almond' | 'sharp' | 'droopy';
export type PupilStyle = 'round' | 'cat' | 'star' | 'heart';
export type TopStyle = 'tshirt' | 'crop' | 'hoodie' | 'jacket' | 'sweater' | 'tank' | 'dress';
export type BottomStyle = 'jeans' | 'cargo' | 'shorts' | 'skirt';
export type ShoeStyle = 'sneakers' | 'boots' | 'heels' | 'platform';
export type SockStyle = 'none' | 'short' | 'knee' | 'thigh';
export type GloveStyle = 'none' | 'short' | 'long';
export type GlassesStyle = 'none' | 'round' | 'square' | 'shades';
export type HatStyle = 'none' | 'cap' | 'beanie';

export interface CharacterSpec {
  v: 2;
  gender: Gender;
  skin: string;
  height: number;        // 0.9 .. 1.12
  build: BodyBuild;
  shoulders: number;     // 0.85 .. 1.15
  legLen: number;        // 0.92 .. 1.1
  // hair
  hair: HairStyle;
  hairColor: string;
  hairColor2: string;    // '' = solid; otherwise gradient tips
  bangs: boolean;
  // face
  beard: BeardStyle; beardColor: string;
  browColor: string;
  eyeColor: string; eyeShape: EyeShape; pupil: PupilStyle;
  eyeliner: boolean; freckles: boolean; beautyMark: boolean;
  lipstick: string; eyeshadow: string; blush: boolean;
  // clothing
  top: TopStyle; topColor: string;
  bottom: BottomStyle; bottomColor: string;
  shoes: ShoeStyle; shoeColor: string;
  socks: SockStyle; sockColor: string;
  gloves: GloveStyle;
  // accessories
  glasses: GlassesStyle;
  hat: HatStyle; hatColor: string;
  earrings: boolean; hairclip: boolean; necklace: boolean; belt: boolean;
  // identity glow (used by 3D worlds)
  glow: string;
}

// ── Catalogs ──────────────────────────────────────────────────────────
export const SKIN_TONES = ['#ffe4d0', '#f7d9c4', '#f0c8a0', '#e0ac7e', '#c68a5e', '#a56a43', '#8a5636', '#6e4128', '#523020'];
export const HAIR_COLORS = ['#0f0d0c', '#2b1d12', '#5a3a1e', '#8a5a2b', '#c99a52', '#e6d3a3', '#f2f2f2', '#b0b0b8', '#ff9ecb', '#ff5da2', '#b06bff', '#7c5cff', '#3ba0ff', '#37c5b1', '#3bd17a', '#ff4d4d'];
export const EYE_COLORS = ['#3a2416', '#5a3a1e', '#8a6a3a', '#4a7a4a', '#3b6ea0', '#6aa0c8', '#8a8a92', '#9b6bff', '#ff6b9e', '#d14d4d'];
export const CLOTH_COLORS = ['#17181f', '#2b2f3a', '#4b5163', '#e8e6ef', '#fff2d0', '#ffb3d1', '#ff7ab0', '#c9a8ff', '#9ecfff', '#a8ffd0', '#7c3aed', '#0ea5b7', '#b91c1c', '#15803d', '#ca8a04', '#be185d'];
export const SOCK_COLORS = ['#f2f2f2', '#17181f', '#ffb3d1', '#c9a8ff', '#9ecfff', '#b91c1c'];
export const LIP_COLORS = ['', '#c85a6e', '#b3455a', '#8a3a4a', '#d98a92', '#e8a0b8', '#7a2e3a', '#a05acb'];
export const SHADOW_COLORS = ['', '#6b4a7a', '#3a5a7a', '#7a5a3a', '#a05a78', '#4a4a56'];

export const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'bald', label: 'მოპარსული' }, { id: 'buzz', label: 'ბაზი' }, { id: 'short', label: 'მოკლე' },
  { id: 'bob', label: 'ბობი' }, { id: 'long', label: 'გრძელი' }, { id: 'wavy', label: 'ტალღოვანი' },
  { id: 'curly', label: 'ხუჭუჭა' }, { id: 'afro', label: 'აფრო' }, { id: 'ponytail', label: 'კუდი' },
  { id: 'twintails', label: 'ორი კუდი' }, { id: 'bun', label: 'კონა' }, { id: 'dreads', label: 'დრედები' },
];
export const EYE_SHAPES: { id: EyeShape; label: string }[] = [
  { id: 'round', label: 'მრგვალი' }, { id: 'almond', label: 'ნუშისებრი' }, { id: 'sharp', label: 'მკვეთრი' }, { id: 'droopy', label: 'ნაზი' },
];
export const PUPILS: { id: PupilStyle; label: string }[] = [
  { id: 'round', label: 'კლასიკური' }, { id: 'cat', label: 'კატის' }, { id: 'star', label: 'ვარსკვლავი' }, { id: 'heart', label: 'გული' },
];
export const BEARD_STYLES: { id: BeardStyle; label: string }[] = [
  { id: 'none', label: 'არა' }, { id: 'stubble', label: 'ჯაგარი' }, { id: 'goatee', label: 'თხის წვერი' }, { id: 'mustache', label: 'ულვაში' }, { id: 'full', label: 'სავსე' },
];
export const TOP_STYLES: { id: TopStyle; label: string }[] = [
  { id: 'tshirt', label: 'მაისური' }, { id: 'crop', label: 'ქროფ ტოპი' }, { id: 'hoodie', label: 'ჰუდი' },
  { id: 'jacket', label: 'ქურთუკი' }, { id: 'sweater', label: 'სვიტერი' }, { id: 'tank', label: 'უსახელო' }, { id: 'dress', label: 'კაბა' },
];
export const BOTTOM_STYLES: { id: BottomStyle; label: string }[] = [
  { id: 'jeans', label: 'ჯინსი' }, { id: 'cargo', label: 'კარგო' }, { id: 'shorts', label: 'შორტი' }, { id: 'skirt', label: 'ქვედაბოლო' },
];
export const SHOE_STYLES: { id: ShoeStyle; label: string }[] = [
  { id: 'sneakers', label: 'სნიკერსი' }, { id: 'boots', label: 'ბოტი' }, { id: 'heels', label: 'ქუსლი' }, { id: 'platform', label: 'პლატფორმა' },
];
export const SOCK_STYLES: { id: SockStyle; label: string }[] = [
  { id: 'none', label: 'არა' }, { id: 'short', label: 'მოკლე' }, { id: 'knee', label: 'მუხლამდე' }, { id: 'thigh', label: 'მაღალი' },
];
export const GLOVE_STYLES: { id: GloveStyle; label: string }[] = [
  { id: 'none', label: 'არა' }, { id: 'short', label: 'მოკლე' }, { id: 'long', label: 'გრძელი' },
];
export const BUILDS: { id: BodyBuild; label: string }[] = [
  { id: 'slim', label: 'გამხდარი' }, { id: 'athletic', label: 'სპორტული' }, { id: 'muscular', label: 'ძლიერი' }, { id: 'heavy', label: 'მსხვილი' },
];
export const GLASSES: { id: GlassesStyle; label: string }[] = [
  { id: 'none', label: 'არა' }, { id: 'round', label: 'მრგვალი' }, { id: 'square', label: 'კვადრ.' }, { id: 'shades', label: 'შავი' },
];
export const HATS: { id: HatStyle; label: string }[] = [
  { id: 'none', label: 'არა' }, { id: 'cap', label: 'კეპი' }, { id: 'beanie', label: 'ქუდი' },
];

export function defaultSpec(gender: Gender = 'male'): CharacterSpec {
  const female = gender === 'female';
  return {
    v: 2, gender,
    skin: SKIN_TONES[2], height: 1, build: female ? 'slim' : 'athletic',
    shoulders: 1, legLen: 1,
    hair: female ? 'long' : 'short', hairColor: HAIR_COLORS[1], hairColor2: '', bangs: female,
    beard: 'none', beardColor: HAIR_COLORS[1], browColor: HAIR_COLORS[0],
    eyeColor: EYE_COLORS[4], eyeShape: female ? 'round' : 'almond', pupil: 'round',
    eyeliner: female, freckles: false, beautyMark: false,
    lipstick: female ? LIP_COLORS[4] : '', eyeshadow: '', blush: female,
    top: female ? 'crop' : 'hoodie', topColor: female ? CLOTH_COLORS[5] : CLOTH_COLORS[0],
    bottom: female ? 'skirt' : 'jeans', bottomColor: CLOTH_COLORS[0],
    shoes: female ? 'platform' : 'sneakers', shoeColor: CLOTH_COLORS[0],
    socks: female ? 'thigh' : 'none', sockColor: SOCK_COLORS[0],
    gloves: 'none',
    glasses: 'none', hat: 'none', hatColor: CLOTH_COLORS[10],
    earrings: female, hairclip: false, necklace: false, belt: false,
    glow: '#00e5ff',
  };
}

const KEY = 'vm_character';

export function loadSpec(): CharacterSpec | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.skin) return null;
    // v1 → v2 migration: merge over fresh defaults; remap dropped styles.
    const d = defaultSpec(s.gender === 'female' ? 'female' : 'male');
    const merged: CharacterSpec = { ...d, ...s, v: 2 };
    if (!HAIR_STYLES.some(h => h.id === merged.hair)) merged.hair = (s.hair === 'fade') ? 'short' : d.hair;
    if (!TOP_STYLES.some(t => t.id === merged.top)) merged.top = d.top;
    if (!SHOE_STYLES.some(t => t.id === merged.shoes)) merged.shoes = d.shoes;
    return merged;
  } catch { /* ignore */ }
  return null;
}
export function saveSpec(spec: CharacterSpec) {
  try { localStorage.setItem(KEY, JSON.stringify(spec)); } catch { /* ignore */ }
  // keep the classic identity colours in sync so legacy surfaces inherit
  try { localStorage.setItem('vs_bodyColor', spec.topColor); localStorage.setItem('vs_glowColor', spec.glow); } catch { /* ignore */ }
}
export function hasCharacter(): boolean { return !!localStorage.getItem(KEY); }

// Compact appearance payload for the 3D worlds.
export function worldAppearance(spec: CharacterSpec) {
  return { bodyColor: spec.topColor, glowColor: spec.glow, skin: spec.skin, hair: spec.hair, hairColor: spec.hairColor, build: spec.build };
}
