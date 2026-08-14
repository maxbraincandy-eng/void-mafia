import type { PlayerPerksState, EntranceStyle, RoomSkinId, VoiceMaskPreset } from '../types/index.js';
export type PerkId = 'invisible' | 'anon' | 'vip' | 'xpboost' | 'entrance' | 'roomskin' | 'stickers' | 'voicemask' | 'coinmagnet' | 'notebook' | 'postboost';
export type PerkMode = 'off' | 'always';
/** Perks that are a persistent on/off switch. */
export type TogglePerk = 'invisible' | 'anon' | 'entrance' | 'voicemask';
/** Perks that carry a chosen variant alongside ownership. */
export type ChoicePerk = 'entrance' | 'roomskin' | 'voicemask';
export declare const ENTRANCE_STYLES: EntranceStyle[];
export declare const ROOM_SKINS: RoomSkinId[];
export declare const VOICE_MASK_PRESETS: VoiceMaskPreset[];
/** Coin magnet multiplier. One constant so the shop copy and the maths agree. */
export declare const COIN_MAGNET_MULT = 1.25;
/** Persisted perk state (shape lives in types/index.ts as PlayerPerksState so
 *  the cosmetics blob and this service agree). Defaults are a new player's. */
export type PerkState = PlayerPerksState;
export declare function defaultPerks(): PerkState;
/** Catalogue. `kind` drives how a purchase is applied. */
export interface PerkDef {
    id: PerkId;
    name: string;
    ka: string;
    desc: string;
    price: number;
    /** toggle = own once, switch on/off. unlock = own once, no switch.
     *  duration = re-buyable, stacks in time. consumable = re-buyable, stacks in units. */
    kind: 'toggle' | 'unlock' | 'duration' | 'consumable';
    /** duration perks: hours added per purchase. */
    hours?: number;
    /** consumable perks: units added per purchase. */
    units?: number;
}
export declare const PERK_ITEMS: Record<PerkId, PerkDef>;
/** How long one post boost lasts. */
export declare const POST_BOOST_MS: number;
export declare function getPerks(profileId: string): Promise<PerkState>;
/**
 * Buy a perk. Toggles must not be re-bought; duration/consumable perks are
 * re-buyable and stack (VIP extends from the later of now/current expiry so a
 * top-up never shortens it; XP games add). Coins are deducted first via the
 * shared transaction ledger, so a failed grant can't leave a charge behind.
 */
export declare function buyPerk(profileId: string, perkId: string): Promise<{
    perks: PerkState;
    coins: number;
}>;
/** Set a toggle's default mode. Owning the toggle is required. */
export declare function setPerkMode(profileId: string, which: TogglePerk, mode: PerkMode): Promise<PerkState>;
/**
 * Pick which variant of an owned perk to use (entrance style, room skin, voice
 * preset). Validated against the allowed list here rather than at the socket
 * edge, so every caller gets the same guarantee.
 */
export declare function setPerkChoice(profileId: string, which: ChoicePerk, value: string): Promise<PerkState>;
export declare function isVipActive(perks: PerkState, at?: number): boolean;
/** True if this player should be an invisible spectator by their saved default. */
export declare function resolveSpectatorInvisible(profileId: string | null): Promise<boolean>;
/** True if this player should enter the next game anonymously by default. */
export declare function resolveAnon(profileId: string | null): Promise<boolean>;
/**
 * Spend one XP-boost game if any remain. Returns whether the caller should
 * double this game's level-XP. Idempotency is the caller's job (call once per
 * player per game, at the single award site).
 */
export declare function consumeXpBoost(profileId: string | null): Promise<boolean>;
/** VIP spotlight duration for a room the given host is creating, or null. */
export declare function resolveSpotlightUntil(profileId: string | null): Promise<number | null>;
/** The entrance banner to play when this player joins a lobby, or null. */
export declare function resolveEntrance(profileId: string | null): Promise<EntranceStyle | null>;
/** The skin a host's room should wear, or null for the default look. */
export declare function resolveRoomSkin(profileId: string | null): Promise<RoomSkinId | null>;
/** The voice preset this player's own mic should use, or null. */
export declare function resolveVoiceMask(profileId: string | null): Promise<VoiceMaskPreset | null>;
/** Spend one sticker. False if none left (or no perk at all). */
export declare function consumeSticker(profileId: string | null): Promise<boolean>;
/** Spend one feed boost. False if none left. */
export declare function consumePostBoost(profileId: string | null): Promise<boolean>;
/**
 * Put a spent boost back. Used when the spend succeeded but the thing it was
 * spent on then failed — the unit must be taken BEFORE the boost is applied
 * (otherwise a player with zero boosts still gets one applied), which means the
 * failure path owes them a refund.
 */
export declare function refundPostBoost(profileId: string | null): Promise<void>;
export declare function isCoinMagnetActive(perks: PerkState, at?: number): boolean;
/**
 * Apply the coin magnet to an award. Returns the amount to actually credit and
 * whether the multiplier fired, so the caller can tell the player about it.
 *
 * Rounded UP: a magnet that silently rounds a small award back down to itself
 * looks broken to the person who paid for it.
 */
export declare function applyCoinMagnet(profileId: string | null, amount: number): Promise<{
    amount: number;
    boosted: boolean;
}>;
export declare function aliasFor(seed: string): string;
//# sourceMappingURL=perkService.d.ts.map