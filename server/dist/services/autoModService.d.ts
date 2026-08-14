/**
 * Automatic moderation.
 *
 * The app had no filter at all, which means at 03:00 a determined troll is
 * unopposed until a moderator happens to wake up. This closes that window.
 *
 * DESIGN RULE: it FLAGS, it does not punish.
 * Every automatic system produces false positives, and an automatic ban turns
 * a false positive into a lost player with no recourse. So the filter's whole
 * job is to raise a report a human then judges — the queue arrives pre-sorted
 * instead of empty. The only thing it does on its own is rate-limit a flood,
 * and that is reversible within seconds.
 *
 * The word list is deliberately short and targets unambiguous abuse. A long
 * list catches ordinary conversation and trains moderators to ignore the queue,
 * which is worse than having no filter.
 */
export type AutoFlagKind = 'slur' | 'spam' | 'flood' | 'link';
export interface AutoVerdict {
    /** Non-null when the message should raise an automatic report. */
    flag: AutoFlagKind | null;
    /** Short human-readable reason, shown to the moderator. */
    reason: string;
    /** True when the message should be withheld from the room entirely. */
    block: boolean;
}
/**
 * Judge one message. Pure apart from the per-sender history it keeps, so the
 * rules can be tested directly.
 */
export declare function inspectMessage(senderId: string, text: string, now?: number): AutoVerdict;
/** Forget a sender's history — used when a room closes. */
export declare function forgetSender(senderId: string): void;
//# sourceMappingURL=autoModService.d.ts.map