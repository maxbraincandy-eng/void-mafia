/**
 * Client-side perk constants: labels, palettes and the shapes the server sends.
 *
 * The server is the authority on what you OWN and what is switched on; this
 * file only decides how those things look. Keep the ids in sync with
 * server/src/services/perkService.ts — the ids travel over the wire.
 */
export type PerkId =
  | 'invisible' | 'anon' | 'vip' | 'xpboost'
  | 'entrance' | 'roomskin' | 'stickers' | 'voicemask' | 'coinmagnet' | 'notebook' | 'postboost';

export type TogglePerk = 'invisible' | 'anon' | 'entrance' | 'voicemask';
export type ChoicePerk = 'entrance' | 'roomskin' | 'voicemask';

export type EntranceStyle = 'neon' | 'smoke' | 'gold' | 'glitch';
export type RoomSkinId = 'default' | 'crimson' | 'emerald' | 'noir' | 'sunset' | 'ice';
export type VoiceMaskPreset = 'deep' | 'high' | 'ghost';

/** Mirrors server PlayerPerksState. */
export interface PerkState {
  ownsInvisible: boolean; invisibleMode: 'off' | 'always';
  ownsAnon: boolean; anonMode: 'off' | 'always';
  vipUntil: number | null; xpBoostGames: number;
  ownsEntrance: boolean; entranceMode: 'off' | 'always'; entranceStyle: EntranceStyle;
  ownsRoomSkin: boolean; roomSkin: RoomSkinId;
  ownsVoiceMask: boolean; voiceMaskMode: 'off' | 'always'; voiceMaskPreset: VoiceMaskPreset;
  stickers: number;
  coinMagnetUntil: number | null;
  ownsNotebook: boolean;
  postBoosts: number;
}

export interface PerkDef {
  id: PerkId;
  name: string; ka: string; desc: string; price: number;
  kind: 'toggle' | 'unlock' | 'duration' | 'consumable';
  hours?: number; units?: number;
}

export const PERK_EMOJI: Record<string, string> = {
  invisible: '🕵️', anon: '🎭', vip: '📡', xpboost: '⚡',
  entrance: '🎬', roomskin: '🎨', stickers: '💥', voicemask: '🔊',
  coinmagnet: '🧲', notebook: '📓', postboost: '🚀',
};

/** RGB triplets, so a caller can pick its own alpha per surface. */
export const PERK_ACCENT: Record<string, string> = {
  invisible: '155,0,255', anon: '0,229,255', vip: '255,180,0', xpboost: '52,211,153',
  entrance: '255,0,128', roomskin: '244,114,182', stickers: '250,204,21',
  voicemask: '129,140,248', coinmagnet: '251,146,60', notebook: '148,163,184', postboost: '34,211,238',
};

// ── Entrance styles ────────────────────────────────────────────────────
export const ENTRANCE_LABEL: Record<EntranceStyle, string> = {
  neon: 'ნეონი', smoke: 'კვამლი', gold: 'ოქრო', glitch: 'გლიჩი',
};
export const ENTRANCE_STYLES: EntranceStyle[] = ['neon', 'smoke', 'gold', 'glitch'];

/** Banner colours per style: [from, to, glow]. */
export const ENTRANCE_COLORS: Record<EntranceStyle, { from: string; to: string; glow: string; text: string }> = {
  neon:   { from: '#ff0080', to: '#00e5ff', glow: 'rgba(255,0,128,0.55)', text: '#ffffff' },
  smoke:  { from: '#3b3b4f', to: '#0b0b12', glow: 'rgba(180,190,220,0.35)', text: '#dfe4f2' },
  gold:   { from: '#b8860b', to: '#ffd45a', glow: 'rgba(255,212,90,0.55)', text: '#241a03' },
  glitch: { from: '#00ffa3', to: '#9b00ff', glow: 'rgba(0,255,163,0.5)', text: '#ffffff' },
};

// ── Room skins ─────────────────────────────────────────────────────────
export const ROOM_SKINS: RoomSkinId[] = ['default', 'crimson', 'emerald', 'noir', 'sunset', 'ice'];
export const ROOM_SKIN_LABEL: Record<RoomSkinId, string> = {
  default: 'სტანდარტული', crimson: 'ალისფერი', emerald: 'ზურმუხტი',
  noir: 'ნუარი', sunset: 'მზისჩასვლა', ice: 'ყინული',
};

/**
 * A skin is only a page background + one accent. Deliberately narrow: the lobby
 * has to stay readable no matter which skin the host picked, so a skin may not
 * touch text colour, card surfaces or any state colour (ready/host/danger).
 */
export interface RoomSkin { page: string; glow: string; accent: string; }
export const ROOM_SKIN_STYLE: Record<RoomSkinId, RoomSkin> = {
  default: {
    page: 'linear-gradient(160deg, #0c0525 0%, #050311 50%)',
    glow: 'radial-gradient(ellipse 90% 35% at 50% -5%, rgba(100,0,240,0.08) 0%, transparent 55%)',
    accent: '155,0,255',
  },
  crimson: {
    page: 'linear-gradient(160deg, #24060d 0%, #0a0206 50%)',
    glow: 'radial-gradient(ellipse 90% 35% at 50% -5%, rgba(240,20,60,0.10) 0%, transparent 55%)',
    accent: '244,63,94',
  },
  emerald: {
    page: 'linear-gradient(160deg, #04211a 0%, #020c09 50%)',
    glow: 'radial-gradient(ellipse 90% 35% at 50% -5%, rgba(16,220,150,0.10) 0%, transparent 55%)',
    accent: '16,185,129',
  },
  noir: {
    page: 'linear-gradient(160deg, #14141a 0%, #050507 50%)',
    glow: 'radial-gradient(ellipse 90% 35% at 50% -5%, rgba(210,215,235,0.07) 0%, transparent 55%)',
    accent: '203,213,225',
  },
  sunset: {
    page: 'linear-gradient(160deg, #2a1004 0%, #0d0502 50%)',
    glow: 'radial-gradient(ellipse 90% 35% at 50% -5%, rgba(255,140,20,0.11) 0%, transparent 55%)',
    accent: '251,146,60',
  },
  ice: {
    page: 'linear-gradient(160deg, #05192b 0%, #020910 50%)',
    glow: 'radial-gradient(ellipse 90% 35% at 50% -5%, rgba(60,180,255,0.11) 0%, transparent 55%)',
    accent: '56,189,248',
  },
};

export function roomSkinStyle(id: string | null | undefined): RoomSkin {
  return ROOM_SKIN_STYLE[(id ?? 'default') as RoomSkinId] ?? ROOM_SKIN_STYLE.default;
}

// ── Voice mask ─────────────────────────────────────────────────────────
export const VOICE_PRESETS: VoiceMaskPreset[] = ['deep', 'high', 'ghost'];
export const VOICE_LABEL: Record<VoiceMaskPreset, string> = {
  deep: 'დაბალი', high: 'მაღალი', ghost: 'აჩრდილი',
};

// ── Stickers ───────────────────────────────────────────────────────────
/** Must match STICKER_SET on the server — anything else is rejected there. */
export const STICKERS = [
  '💀', '🔪', '🤡', '👑', '🔥', '💣', '🕵️', '🎭', '😂', '😱', '🤝', '👀', '🍿', '⚡', '🌹', '🚨',
];
