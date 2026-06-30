import type { CosmeticRarity } from '@/constants/cosmetics';

// Visual themes for the VOID LOUNGE / Virtual Space. `void` is the free
// default; the rest are purchasable from the coin shop (sp_theme_<id>).
// `bg` is the full-bleed CSS background for the world view.

export interface SpaceThemeDef {
  id: string;
  name: string;
  rarity: CosmeticRarity;
  price: number;   // 0 = free default
  accent: string;  // UI highlight + ambient glow tint
  bg: string;      // world background CSS
}

export const SPACE_THEME_DEFS: SpaceThemeDef[] = [
  {
    id: 'void', name: 'Void', rarity: 'common', price: 0, accent: '#9b00ff',
    bg: 'radial-gradient(ellipse at 15% 70%, rgba(120,0,255,.10) 0%, transparent 40%),radial-gradient(ellipse at 80% 75%, rgba(0,150,255,.09) 0%, transparent 38%),radial-gradient(ellipse at 85% 55%, rgba(255,120,0,.06) 0%, transparent 30%),linear-gradient(180deg,rgba(9,3,26,1) 0%,rgba(9,3,24,1) 36%,rgba(2,0,10,1) 37%,rgba(1,0,7,1) 100%)',
  },
  {
    id: 'neon', name: 'Neon', rarity: 'uncommon', price: 600, accent: '#00e5ff',
    bg: 'radial-gradient(ellipse at 18% 68%, rgba(0,229,255,.13) 0%, transparent 42%),radial-gradient(ellipse at 82% 72%, rgba(0,120,255,.11) 0%, transparent 40%),radial-gradient(ellipse at 60% 50%, rgba(155,0,255,.07) 0%, transparent 32%),linear-gradient(180deg,rgba(2,12,28,1) 0%,rgba(2,10,26,1) 36%,rgba(0,4,12,1) 37%,rgba(0,2,8,1) 100%)',
  },
  {
    id: 'cyber', name: 'Cyber', rarity: 'rare', price: 800, accent: '#00ff88',
    bg: 'radial-gradient(ellipse at 16% 70%, rgba(0,255,136,.12) 0%, transparent 40%),radial-gradient(ellipse at 84% 74%, rgba(0,200,170,.10) 0%, transparent 38%),radial-gradient(ellipse at 70% 50%, rgba(0,120,255,.06) 0%, transparent 30%),linear-gradient(180deg,rgba(2,18,12,1) 0%,rgba(1,14,10,1) 36%,rgba(0,7,5,1) 37%,rgba(0,4,3,1) 100%)',
  },
  {
    id: 'sunset', name: 'Sunset', rarity: 'rare', price: 800, accent: '#ff6600',
    bg: 'radial-gradient(ellipse at 18% 68%, rgba(255,102,0,.13) 0%, transparent 42%),radial-gradient(ellipse at 80% 72%, rgba(255,45,85,.11) 0%, transparent 40%),radial-gradient(ellipse at 60% 48%, rgba(255,180,0,.07) 0%, transparent 32%),linear-gradient(180deg,rgba(28,8,4,1) 0%,rgba(24,6,6,1) 36%,rgba(12,2,4,1) 37%,rgba(8,1,2,1) 100%)',
  },
  {
    id: 'mono', name: 'Mono', rarity: 'uncommon', price: 600, accent: '#c0c0c0',
    bg: 'radial-gradient(ellipse at 16% 70%, rgba(255,255,255,.08) 0%, transparent 40%),radial-gradient(ellipse at 84% 74%, rgba(200,200,200,.06) 0%, transparent 38%),linear-gradient(180deg,rgba(20,20,24,1) 0%,rgba(16,16,20,1) 36%,rgba(7,7,9,1) 37%,rgba(3,3,4,1) 100%)',
  },
  {
    id: 'blood', name: 'Blood Moon', rarity: 'epic', price: 1200, accent: '#ff2d55',
    bg: 'radial-gradient(ellipse at 50% 18%, rgba(255,45,85,.16) 0%, transparent 34%),radial-gradient(ellipse at 18% 72%, rgba(180,0,30,.12) 0%, transparent 40%),radial-gradient(ellipse at 84% 74%, rgba(120,0,40,.10) 0%, transparent 38%),linear-gradient(180deg,rgba(24,2,8,1) 0%,rgba(20,1,8,1) 36%,rgba(10,0,4,1) 37%,rgba(6,0,2,1) 100%)',
  },
  {
    id: 'gold', name: 'Golden Throne', rarity: 'legendary', price: 2000, accent: '#facc15',
    bg: 'radial-gradient(ellipse at 16% 70%, rgba(250,204,21,.13) 0%, transparent 40%),radial-gradient(ellipse at 84% 74%, rgba(245,158,11,.11) 0%, transparent 38%),radial-gradient(ellipse at 60% 48%, rgba(255,120,0,.06) 0%, transparent 30%),linear-gradient(180deg,rgba(22,16,2,1) 0%,rgba(18,13,2,1) 36%,rgba(9,6,1,1) 37%,rgba(5,3,0,1) 100%)',
  },
];

export const itemIdForTheme = (themeId: string) => `sp_theme_${themeId}`;

export function getSpaceTheme(id: string | undefined | null): SpaceThemeDef {
  return SPACE_THEME_DEFS.find(t => t.id === id) ?? SPACE_THEME_DEFS[0];
}

export const spaceThemeAccent = (id: string | undefined | null) => getSpaceTheme(id).accent;
