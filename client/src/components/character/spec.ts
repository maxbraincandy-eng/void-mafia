// ── Character Creator — data-driven spec + catalogs ───────────────────
// A single serializable `CharacterSpec` describes a player's whole look. All
// option lists live in catalogs so future cosmetic packs are pure data — no
// engine changes. The procedural model (model.ts) and the UI both read these.

export type Gender = 'male' | 'female';
export type BodyBuild = 'slim' | 'athletic' | 'muscular' | 'heavy';
export type HairStyle = 'bald' | 'buzz' | 'short' | 'fade' | 'afro' | 'curly' | 'long' | 'ponytail' | 'bun' | 'dreads';
export type BeardStyle = 'none' | 'stubble' | 'goatee' | 'mustache' | 'full';
export type TopStyle = 'tshirt' | 'hoodie' | 'jacket' | 'tank' | 'sweater';
export type BottomStyle = 'jeans' | 'cargo' | 'shorts' | 'skirt';
export type ShoeStyle = 'sneakers' | 'boots' | 'heels';
export type GlassesStyle = 'none' | 'round' | 'square' | 'shades';
export type HatStyle = 'none' | 'cap' | 'beanie';

export interface CharacterSpec {
  v: 1;
  gender: Gender;
  skin: string;         // hex
  height: number;       // 0.9 .. 1.12 multiplier
  build: BodyBuild;
  hair: HairStyle;
  hairColor: string;
  beard: BeardStyle;
  beardColor: string;
  browColor: string;
  eyeColor: string;
  // female makeup
  lipstick: string;     // '' = none
  eyeshadow: string;    // '' = none
  blush: boolean;
  // clothing
  top: TopStyle; topColor: string;
  bottom: BottomStyle; bottomColor: string;
  shoes: ShoeStyle; shoeColor: string;
  // accessories
  glasses: GlassesStyle;
  hat: HatStyle; hatColor: string;
  // identity glow carried from the classic avatar (used by 3D worlds)
  glow: string;
}

// ── Catalogs (extensible) ─────────────────────────────────────────────
export const SKIN_TONES = ['#f7d9c4', '#f0c8a0', '#e0ac7e', '#c68a5e', '#a56a43', '#7d4a2e', '#5a3320'];
export const HAIR_COLORS = ['#0f0d0c', '#2b1d12', '#5a3a1e', '#8a5a2b', '#c99a52', '#e6d3a3', '#b0b0b8', '#ffffff', '#ff5da2', '#7c5cff', '#3ba0ff', '#3bd17a', '#ff4d4d'];
export const EYE_COLORS = ['#3a2416', '#5a3a1e', '#7a5a2a', '#4a7a4a', '#3b6ea0', '#5a8fb0', '#7a7a7a', '#9b6bff'];
export const CLOTH_COLORS = ['#1c1e24', '#2b2f3a', '#3a3f4b', '#7c3aed', '#0ea5b7', '#b91c1c', '#15803d', '#ca8a04', '#c2410c', '#be185d', '#334155', '#e5e7eb'];
export const LIP_COLORS = ['', '#b3455a', '#c85a6e', '#8a3a4a', '#d98a92', '#7a2e3a'];
export const SHADOW_COLORS = ['', '#6b4a7a', '#3a5a7a', '#7a5a3a', '#5a5a5a', '#8a4a5a'];

export const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'bald', label: 'გავარსხმელი' }, { id: 'buzz', label: 'ბაზი' }, { id: 'short', label: 'მოკლე' },
  { id: 'fade', label: 'ფეიდი' }, { id: 'afro', label: 'აფრო' }, { id: 'curly', label: 'ხუჭუჭა' },
  { id: 'long', label: 'გრძელი' }, { id: 'ponytail', label: 'კუდი' }, { id: 'bun', label: 'კონა' }, { id: 'dreads', label: 'დრედები' },
];
export const BEARD_STYLES: { id: BeardStyle; label: string }[] = [
  { id: 'none', label: 'არა' }, { id: 'stubble', label: 'ნაფოტი' }, { id: 'goatee', label: 'ბატკანი' }, { id: 'mustache', label: 'ულვაში' }, { id: 'full', label: 'სავსე' },
];
export const TOP_STYLES: { id: TopStyle; label: string }[] = [
  { id: 'tshirt', label: 'მაისური' }, { id: 'hoodie', label: 'ჰუდი' }, { id: 'jacket', label: 'ქურთუკი' }, { id: 'tank', label: 'მაისურაკი' }, { id: 'sweater', label: 'სვიტერი' },
];
export const BOTTOM_STYLES: { id: BottomStyle; label: string }[] = [
  { id: 'jeans', label: 'ჯინსი' }, { id: 'cargo', label: 'კარგო' }, { id: 'shorts', label: 'შორტი' }, { id: 'skirt', label: 'ქვედაბოლო' },
];
export const SHOE_STYLES: { id: ShoeStyle; label: string }[] = [
  { id: 'sneakers', label: 'სნიკერსი' }, { id: 'boots', label: 'ბოტი' }, { id: 'heels', label: 'ქუსლი' },
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
  return {
    v: 1, gender,
    skin: SKIN_TONES[1], height: 1, build: gender === 'male' ? 'athletic' : 'slim',
    hair: gender === 'male' ? 'short' : 'long', hairColor: HAIR_COLORS[1],
    beard: 'none', beardColor: HAIR_COLORS[1], browColor: HAIR_COLORS[0], eyeColor: EYE_COLORS[1],
    lipstick: '', eyeshadow: '', blush: false,
    top: gender === 'male' ? 'hoodie' : 'tshirt', topColor: CLOTH_COLORS[0],
    bottom: 'jeans', bottomColor: CLOTH_COLORS[1],
    shoes: 'sneakers', shoeColor: CLOTH_COLORS[0],
    glasses: 'none', hat: 'none', hatColor: CLOTH_COLORS[3],
    glow: '#00e5ff',
  };
}

const KEY = 'vm_character';

export function loadSpec(): CharacterSpec | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && s.v === 1 && s.skin) return { ...defaultSpec(s.gender), ...s };
  } catch { /* ignore */ }
  return null;
}
export function saveSpec(spec: CharacterSpec) {
  try { localStorage.setItem(KEY, JSON.stringify(spec)); } catch { /* ignore */ }
  // keep the classic identity colours in sync so 3D worlds/legacy code inherit
  try { localStorage.setItem('vs_bodyColor', spec.topColor); localStorage.setItem('vs_glowColor', spec.glow); } catch { /* ignore */ }
}
export function hasCharacter(): boolean { return !!localStorage.getItem(KEY); }

// A compact appearance payload for the 3D world avatars (Phase-1 identity carry).
export function worldAppearance(spec: CharacterSpec) {
  return { bodyColor: spec.topColor, glowColor: spec.glow, skin: spec.skin, hair: spec.hair, hairColor: spec.hairColor, build: spec.build };
}
