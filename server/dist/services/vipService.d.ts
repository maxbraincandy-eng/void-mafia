/**
 * What a verification badge actually buys.
 *
 * Every VIP privilege in the app is one row in the table below. That is the
 * whole point of this file: the alternative is `if (vip) 6000 else 2000`
 * sprinkled through a dozen call sites, and then nobody — including the person
 * selling the subscription — can answer "what do I get for my money?" without
 * grepping. Here the answer is a table you can read in one screen, and the
 * sales page renders from the same table it is enforced from, so the two can
 * never drift apart.
 *
 * EVERY ROW IS ADDITIVE.
 * ──────────────────────
 * The free column is what free users have TODAY, unchanged. Nothing here was
 * invented as a restriction so that lifting it could be sold — that is the one
 * way to make a subscription feel like a hostage negotiation, and it costs more
 * goodwill than the badge earns. Three perks that looked good on paper were
 * dropped for exactly this reason: a post-edit window (no window exists now, so
 * a 15-minute free tier would be a downgrade), a clan member cap (no cap exists
 * now), and multi-image posts (the schema stores one image, so "4 images for
 * VIP" would have been a promise the database cannot keep).
 *
 * Owners get everything a VIP gets. They are not customers, but there is no
 * sense in a badge that grants less than the one below it.
 */
export type Tier = 'free' | 'vip' | 'owner';
export interface Limits {
    /** Characters in a community post. */
    postChars: number;
    /** Characters in a comment. */
    commentChars: number;
    /** Characters in the community bio. */
    bioChars: number;
    /** Seconds of voice the recorder will let you capture. */
    voiceSeconds: number;
    /** Bytes accepted for one voice message — the transport cap behind it. */
    voiceBytes: number;
    /** Extra seconds on your own speech turn in hosted mafia. */
    speechBonusSeconds: number;
    /** Enters the next-round queue ahead of everyone without it. */
    queuePriority: boolean;
    /** May see who has looked at their profile. */
    profileVisitors: boolean;
    /** May use the voice profiles marked vip in the changer. */
    vipVoices: boolean;
    /** Name renders with the animated gradient. */
    animatedName: boolean;
    /** May enter a mafia room under an alias, with their identity withheld. */
    incognito: boolean;
    /** May publish their microphone through a live voice disguise. */
    liveDisguise: boolean;
}
export declare const LIMITS: Record<Tier, Limits>;
/** Refresh the synchronous snapshot. Called at boot and on a timer. */
export declare function refreshVipSnapshot(): Promise<void>;
export declare function startVipSnapshotRefresh(): void;
/** The tier a profile is on right now. */
export declare function tierOf(profileId: string | null | undefined): Promise<Tier>;
/** Limits for a profile, without the caller having to know about tiers. */
export declare function limitsFor(profileId: string | null | undefined): Promise<Limits>;
export declare function isVip(profileId: string | null | undefined): Promise<boolean>;
/** Same question for many profiles at once, for feed-shaped work. */
export declare function tiersOf(profileIds: string[]): Promise<Record<string, Tier>>;
/** The snapshot answer, for code that cannot await. See `snapshot` above. */
export declare function tierOfSync(profileId: string | null | undefined): Tier;
export declare function isVipSync(profileId: string | null | undefined): boolean;
export declare function limitsForSync(profileId: string | null | undefined): Limits;
/**
 * The pitch, generated from the same table that is enforced.
 *
 * A perk written here that is not in `Limits` cannot be sold, and a limit that
 * changes shows up in the pitch on the next deploy without anybody remembering
 * to update a marketing string.
 */
export interface Perk {
    icon: string;
    title: string;
    free: string;
    vip: string;
}
export declare function perkList(): Perk[];
/**
 * Record that someone looked at a profile.
 *
 * Recorded for everyone, shown only to VIPs. That is deliberate: a list that
 * only starts filling the day you subscribe is worth nothing on day one, and
 * the perk has to be worth something the moment it is bought.
 *
 * Looking at your own profile does not count, and neither does looking again
 * within the hour — otherwise `views` becomes a log of one person refreshing.
 */
export declare function recordProfileVisit(profileId: string, viewerId: string): Promise<void>;
export interface Visitor {
    id: string;
    username: string;
    avatarUrl: string | null;
    avatar: string | null;
    lastAt: number;
    views: number;
    tier: Tier;
}
/** Who has looked at this profile, most recent first. VIP only. */
export declare function getProfileVisitors(profileId: string, limit?: number): Promise<Visitor[]>;
/** How many distinct people looked, and how many in the last week. */
export declare function getVisitorCounts(profileId: string): Promise<{
    total: number;
    week: number;
}>;
//# sourceMappingURL=vipService.d.ts.map