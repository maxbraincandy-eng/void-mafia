export interface StageDef {
    key: string;
    name: string;
    ka: string;
    needs: number;
}
export declare const STAGES: StageDef[];
/** The merge chain: three of one make one of the next. */
export declare const CHAIN: readonly ["frag", "cell", "adna", "ncore"];
export type ChainKey = typeof CHAIN[number];
/** Everything else a chest can contain. */
export declare const EXTRAS: readonly ["energyCell", "particle", "crystal", "upgrade"];
export type ExtraKey = typeof EXTRAS[number];
export type ResKey = ChainKey | ExtraKey;
export declare const RES_META: Record<ResKey, {
    name: string;
    ka: string;
    tier: number;
}>;
export declare const MERGE_COST = 3;
export type ChestTier = 'common' | 'advanced' | 'legendary' | 'social';
export declare const CHEST_META: Record<ChestTier, {
    name: string;
    ka: string;
    rolls: [number, number];
}>;
export type UpgradeKey = 'energyCap' | 'chestQuality' | 'mergeSpeed' | 'rareChance' | 'appearance';
export interface UpgradeDef {
    key: UpgradeKey;
    name: string;
    ka: string;
    desc: string;
    max: number;
    cost: (lvl: number) => Partial<Record<ResKey, number>>;
}
export declare const UPGRADES: UpgradeDef[];
export interface MergeProfile {
    userId: string;
    stage: number;
    xp: number;
    energy: number;
    energyMax: number;
    energyAt: number;
    nextEnergyInMs: number;
    chestMeter: number;
    resources: Partial<Record<ResKey, number>>;
    chests: Partial<Record<ChestTier, number>>;
    upgrades: Partial<Record<UpgradeKey, number>>;
    taps: number;
    merges: number;
    opened: number;
    lastSocial: string | null;
    socialAvailable: boolean;
    /** unspent test completions waiting to upgrade a chest */
    boosts: number;
}
declare function energyMaxOf(up: Partial<Record<UpgradeKey, number>>): number;
/** Apply offline regeneration and return the settled row. */
declare function settleEnergy(row: any): {
    energy: number;
    energyAt: number;
    energyMax: number;
    nextIn: number;
};
export declare function getProfile(userId: string): Promise<MergeProfile>;
interface Boost {
    source: string;
    ref: string;
}
/**
 * Test completions that have not yet been converted into a chest upgrade.
 * Only sources that actually persist a completion are counted, so the number
 * on screen always corresponds to something the player really did.
 */
export declare function pendingBoosts(userId: string): Promise<Boost[]>;
export interface TapResult {
    energy: number;
    xp: number;
    chestMeter: number;
    /** a resource that dropped from this tap, if any */
    drop: {
        key: ResKey;
        amount: number;
    } | null;
    /** a chest the meter just completed */
    chestEarned: ChestTier | null;
    profile: MergeProfile;
}
/** Weighted drop from a tap. Rare-chance upgrades tilt it upward. */
declare function rollTapDrop(up: Partial<Record<UpgradeKey, number>>, stage: number): {
    key: ResKey;
    amount: number;
} | null;
export declare function tap(userId: string, count?: number): Promise<TapResult | {
    error: string;
}>;
export interface MergeResult {
    from: ChainKey;
    to: ResKey;
    made: number;
    xp: number;
    profile: MergeProfile;
}
export declare function merge(userId: string, key: string, times?: number): Promise<MergeResult | {
    error: string;
}>;
export declare function evolve(userId: string): Promise<{
    stage: number;
    profile: MergeProfile;
} | {
    error: string;
}>;
export interface ChestReward {
    key: ResKey;
    amount: number;
}
export interface OpenResult {
    tier: ChestTier;
    boosted: boolean;
    rewards: ChestReward[];
    xp: number;
    profile: MergeProfile;
}
declare function rollChest(tier: ChestTier, up: Partial<Record<UpgradeKey, number>>, stage: number): ChestReward[];
export declare function openChest(userId: string, tier: string): Promise<OpenResult | {
    error: string;
}>;
/** The once-a-day chest for sharing your organism. */
export declare function claimSocial(userId: string): Promise<{
    profile: MergeProfile;
} | {
    error: string;
}>;
export declare function buyUpgrade(userId: string, key: string): Promise<{
    profile: MergeProfile;
    level: number;
} | {
    error: string;
}>;
/** Static tables the client needs to render costs and names. */
export declare function catalog(): {
    stages: StageDef[];
    chain: readonly ["frag", "cell", "adna", "ncore"];
    res: Record<ResKey, {
        name: string;
        ka: string;
        tier: number;
    }>;
    chests: Record<ChestTier, {
        name: string;
        ka: string;
        rolls: [number, number];
    }>;
    mergeCost: number;
    upgrades: {
        key: UpgradeKey;
        name: string;
        ka: string;
        desc: string;
        max: number;
        costs: Partial<Record<ResKey, number>>[];
    }[];
    energy: {
        base: number;
        perCap: number;
        regenMs: number;
        tapCost: number;
        meterPerTap: number;
        meterFull: number;
    };
};
export declare function leaderboard(limit?: number): Promise<{
    rank: number;
    userId: any;
    username: any;
    avatar: any;
    avatarUrl: any;
    country: any;
    stage: number;
    stageName: string;
    xp: number;
    merges: number;
    opened: number;
}[]>;
export declare const _internals: {
    rollChest: typeof rollChest;
    rollTapDrop: typeof rollTapDrop;
    settleEnergy: typeof settleEnergy;
    energyMaxOf: typeof energyMaxOf;
    METER_FULL: number;
    METER_PER_TAP: number;
    TAP_COST: number;
};
export {};
//# sourceMappingURL=mergeService.d.ts.map