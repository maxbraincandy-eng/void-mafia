export type CosmeticRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface FrameDef {
  id: string;
  name: string;
  rarity: CosmeticRarity;
  colors: [string, string]; // gradient start, end
  glow: string;
}

export interface TitleDef {
  id: string;
  name: string;
  rarity: CosmeticRarity;
  color: string;
}

export interface RoleSkinDef {
  id: string;
  name: string;
  rarity: CosmeticRarity;
  c1: string;  // left/top border color
  c2: string;  // right/bottom border color
  bg: string;  // card background
  glow: string;
}

export const FRAMES: FrameDef[] = [
  { id: 'frame_bronze',    name: 'Bronze Guard',     rarity: 'common',    colors: ['#cd7f32', '#8b4513'], glow: '#cd7f3260' },
  { id: 'frame_silver',    name: 'Silver Shadow',    rarity: 'uncommon',  colors: ['#c0c0c0', '#808080'], glow: '#c0c0c060' },
  { id: 'frame_gold',      name: 'Golden Mafia',     rarity: 'rare',      colors: ['#facc15', '#f59e0b'], glow: '#facc1560' },
  { id: 'frame_legendary', name: 'Void Crown',       rarity: 'legendary', colors: ['#ff00cc', '#9b00ff'], glow: '#ff00cc80' },
  { id: 'frame_cyber_don', name: 'Cyber Don',        rarity: 'epic',      colors: ['#00e5ff', '#0088ff'], glow: '#00e5ff60' },
  { id: 'frame_blood_moon',name: 'Blood Moon',       rarity: 'epic',      colors: ['#ff2d55', '#ff6b00'], glow: '#ff2d5560' },
  { id: 'frame_cult',      name: 'Cult Ritual',      rarity: 'rare',      colors: ['#9b00ff', '#4b0082'], glow: '#9b00ff60' },
  { id: 'frame_yakuza',    name: 'Yakuza Shadow',    rarity: 'rare',      colors: ['#00ff88', '#00ccaa'], glow: '#00ff8860' },
  { id: 'frame_neon_sheriff', name: 'Neon Sheriff',  rarity: 'uncommon',  colors: ['#00e5ff', '#00ff88'], glow: '#00e5ff50' },
];

export const TITLES: TitleDef[] = [
  { id: 'title_void_citizen',   name: 'Void Citizen',     rarity: 'common',    color: '#ffffff80' },
  { id: 'title_night_owl',      name: 'Night Owl',         rarity: 'common',    color: '#9b8eff' },
  { id: 'title_city_sheriff',   name: 'City Sheriff',      rarity: 'uncommon',  color: '#00e5ff' },
  { id: 'title_silent_killer',  name: 'Silent Killer',     rarity: 'rare',      color: '#ff2d55' },
  { id: 'title_the_betrayer',   name: 'The Betrayer',      rarity: 'rare',      color: '#ff6b00' },
  { id: 'title_doctor_death',   name: 'Doctor of Death',   rarity: 'rare',      color: '#00ff88' },
  { id: 'title_clan_boss',      name: 'Clan Boss',         rarity: 'epic',      color: '#facc15' },
  { id: 'title_shadow_shogun',  name: 'Shadow Shogun',     rarity: 'epic',      color: '#00e5ff' },
  { id: 'title_cult_prophet',   name: 'Cult Prophet',      rarity: 'epic',      color: '#cc00ff' },
  { id: 'title_godfather',      name: 'The Godfather',     rarity: 'legendary', color: '#facc15' },
];

export const ROLE_SKINS: RoleSkinDef[] = [
  { id: 'skin_classic',   name: 'Classic Mafia',   rarity: 'common',    c1: '#ff00cc', c2: '#00ccff', bg: '#03000d', glow: '#9b00ff' },
  { id: 'skin_neon',      name: 'Neon Mafia',      rarity: 'uncommon',  c1: '#00ff88', c2: '#00e5ff', bg: '#001a0f', glow: '#00e5ff' },
  { id: 'skin_golden_don',name: 'Golden Don',      rarity: 'rare',      c1: '#facc15', c2: '#f59e0b', bg: '#0a0800', glow: '#facc15' },
  { id: 'skin_cyber_sheriff', name: 'Cyber Sheriff', rarity: 'rare',    c1: '#00e5ff', c2: '#0088ff', bg: '#00060f', glow: '#00e5ff' },
  { id: 'skin_void_doctor',name: 'Void Doctor',    rarity: 'rare',      c1: '#00ff88', c2: '#9b00ff', bg: '#02000a', glow: '#00ff88' },
  { id: 'skin_cult',      name: 'Cult Ritual',     rarity: 'epic',      c1: '#cc00ff', c2: '#4b0082', bg: '#060010', glow: '#cc00ff' },
  { id: 'skin_yakuza_noir',name: 'Yakuza Noir',    rarity: 'epic',      c1: '#ff2d55', c2: '#ff6b00', bg: '#0a0002', glow: '#ff2d55' },
  { id: 'skin_shogun',    name: 'Shogun Shadow',   rarity: 'legendary', c1: '#facc15', c2: '#ff2d55', bg: '#080300', glow: '#facc15' },
];

export const RARITY_COLOR: Record<CosmeticRarity, string> = {
  common:    '#ffffff60',
  uncommon:  '#00e5ff',
  rare:      '#9b00ff',
  epic:      '#ff00cc',
  legendary: '#facc15',
};

export const RARITY_LABEL: Record<CosmeticRarity, string> = {
  common:    'Common',
  uncommon:  'Uncommon',
  rare:      'Rare',
  epic:      'Epic',
  legendary: 'Legendary',
};

export function getFrameById(id: string | null): FrameDef | null {
  if (!id) return null;
  return FRAMES.find(f => f.id === id) ?? null;
}

export function getTitleById(id: string | null): TitleDef | null {
  if (!id) return null;
  return TITLES.find(t => t.id === id) ?? null;
}

export function getRoleSkinById(id: string | null): RoleSkinDef | null {
  if (!id) return null;
  return ROLE_SKINS.find(s => s.id === id) ?? null;
}

export interface WallpaperDef {
  id: string;
  name: string;
  rarity: CosmeticRarity;
  gradient: string;
  accent: string;
}

export interface BorderDef {
  id: string;
  name: string;
  rarity: CosmeticRarity;
  colors: [string, string];
  glow: string;
  animationClass: string;
}

export const WALLPAPERS: WallpaperDef[] = [
  { id: 'wp_void',    name: 'Void Night',     rarity: 'common',    gradient: 'radial-gradient(ellipse at top, #1a0033 0%, #03000d 70%)',                          accent: '#9b00ff' },
  { id: 'wp_neon',    name: 'Neon City',      rarity: 'uncommon',  gradient: 'linear-gradient(160deg, #001a2c 0%, #0a0033 50%, #1a0010 100%)',                    accent: '#00e5ff' },
  { id: 'wp_blood',   name: 'Blood Sunset',   rarity: 'rare',      gradient: 'linear-gradient(160deg, #1a0005 0%, #2a0a00 60%, #0a0020 100%)',                    accent: '#ff2d55' },
  { id: 'wp_cyber',   name: 'Cyber Rain',     rarity: 'rare',      gradient: 'linear-gradient(160deg, #001a0f 0%, #000d1a 50%, #0a0008 100%)',                    accent: '#00ff88' },
  { id: 'wp_gold',    name: 'Golden Throne',  rarity: 'epic',      gradient: 'linear-gradient(160deg, #1a1200 0%, #2a1800 40%, #0a0800 100%)',                    accent: '#facc15' },
  { id: 'wp_cult',    name: 'Cult Ritual',    rarity: 'epic',      gradient: 'radial-gradient(ellipse at bottom, #1a0028 0%, #03000d 60%)',                       accent: '#cc00ff' },
  { id: 'wp_yakuza',  name: 'Yakuza Neon',    rarity: 'legendary', gradient: 'linear-gradient(160deg, #0a0002 0%, #001a10 40%, #00060f 100%)',                    accent: '#ff2d55' },
];

export const BORDERS: BorderDef[] = [
  { id: 'border_flame',  name: 'Flame',   rarity: 'uncommon',  colors: ['#ff6b00', '#ff2d55'], glow: '#ff6b0080', animationClass: 'animate-border-flame'  },
  { id: 'border_glitch', name: 'Glitch',  rarity: 'rare',      colors: ['#00e5ff', '#ff00cc'], glow: '#00e5ff80', animationClass: 'animate-border-glitch' },
  { id: 'border_pulse',  name: 'Pulse',   rarity: 'rare',      colors: ['#9b00ff', '#cc00ff'], glow: '#9b00ff80', animationClass: 'animate-border-pulse'  },
  { id: 'border_void',   name: 'Void',    rarity: 'epic',      colors: ['#00ff88', '#00e5ff'], glow: '#00ff8880', animationClass: 'animate-border-void'   },
  { id: 'border_gold',   name: 'Gold',    rarity: 'legendary', colors: ['#facc15', '#f59e0b'], glow: '#facc1580', animationClass: 'animate-border-void'   },
];

export const NAME_COLORS: { id: string; name: string; rarity: CosmeticRarity; color: string }[] = [
  { id: 'nc_cyan',    name: 'Neon Cyan',    rarity: 'common',    color: '#00e5ff' },
  { id: 'nc_purple',  name: 'Neon Purple',  rarity: 'common',    color: '#9b00ff' },
  { id: 'nc_pink',    name: 'Neon Pink',    rarity: 'uncommon',  color: '#ff00cc' },
  { id: 'nc_green',   name: 'Neon Green',   rarity: 'uncommon',  color: '#00ff88' },
  { id: 'nc_orange',  name: 'Flame Orange', rarity: 'rare',      color: '#ff6b00' },
  { id: 'nc_red',     name: 'Blood Red',    rarity: 'rare',      color: '#ff2d55' },
  { id: 'nc_gold',    name: 'Gold',         rarity: 'epic',      color: '#facc15' },
  { id: 'nc_white',   name: 'Pure White',   rarity: 'legendary', color: '#ffffff' },
];

export function getWallpaperById(id: string | null): WallpaperDef | null {
  if (!id) return null;
  return WALLPAPERS.find(w => w.id === id) ?? null;
}

export function getBorderById(id: string | null): BorderDef | null {
  if (!id) return null;
  return BORDERS.find(b => b.id === id) ?? null;
}

export function getNameColorById(id: string | null): string | null {
  if (!id) return null;
  return NAME_COLORS.find(n => n.id === id)?.color ?? null;
}

// Items unlocked at start (no level required)
export const STARTER_ITEMS = ['frame_bronze', 'title_void_citizen', 'skin_classic'];

// Map legacy frame ids to new definitions
export const LEVEL_UNLOCK_MAP: Record<number, string[]> = {
  1:  ['title_void_citizen', 'skin_classic'],
  2:  ['title_night_owl'],
  3:  ['title_city_sheriff', 'skin_neon', 'nc_cyan', 'nc_purple', 'wp_void'],
  5:  ['title_silent_killer', 'skin_golden_don', 'frame_cyber_don', 'nc_pink', 'nc_green', 'border_flame', 'wp_neon'],
  7:  ['title_the_betrayer', 'skin_cyber_sheriff', 'nc_orange', 'border_glitch', 'wp_blood'],
  8:  ['title_clan_boss', 'skin_cult', 'frame_blood_moon', 'nc_red', 'border_pulse', 'wp_cyber', 'wp_gold'],
  10: ['title_godfather', 'skin_shogun', 'frame_legendary', 'nc_gold', 'nc_white', 'border_void', 'border_gold', 'wp_cult', 'wp_yakuza'],
};
