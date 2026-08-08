import type { PlayerPerksState } from '../types/index.js';
export type PerkId = 'invisible' | 'anon' | 'vip' | 'xpboost';
export type PerkMode = 'off' | 'always';
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
    kind: 'toggle' | 'duration' | 'consumable';
    /** duration perks: hours added per purchase. */
    hours?: number;
    /** consumable perks: units added per purchase. */
    units?: number;
}
export declare const PERK_ITEMS: Record<PerkId, PerkDef>;
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
export declare function setPerkMode(profileId: string, which: 'invisible' | 'anon', mode: PerkMode): Promise<PerkState>;
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
export declare function aliasFor(seed: string): string;
//# sourceMappingURL=perkService.d.ts.map