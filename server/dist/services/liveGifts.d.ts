/**
 * What a viewer can send a host mid-broadcast.
 *
 * WHY THIS IS NOT THE GIFT CATALOG
 * ────────────────────────────────
 * `gift_catalog` already exists, and this deliberately does not use it. A
 * profile gift is a keepsake: it costs hundreds of coins, it has a rarity and a
 * season, it sits on somebody's profile forever and can be pinned. A live gift
 * is a tap — one to ten coins, sent eight times in a minute because the host
 * said something funny, gone from the screen in two seconds.
 *
 * Putting taps in `player_gifts` would bury a real gift wall under two hundred
 * roses from one evening, and giving live gifts rarities and seasons would be
 * dressing up a button press. They are different objects that happen to share a
 * word.
 *
 * PRICES LIVE HERE, ON THE SERVER
 * ───────────────────────────────
 * The client has a copy for rendering, and it is not consulted about cost. A
 * client that sends `{ giftId: 'crown' }` gets charged what a crown costs here;
 * a client that sends `{ giftId: 'crown', price: 0 }` also gets charged what a
 * crown costs here. There is no code path where a price arrives over the wire.
 *
 * THE CEILING IS DELIBERATE
 * ─────────────────────────
 * Nothing over ten coins. A live gift should be an impulse somebody does not
 * have to think about — the moment you have to weigh whether the host deserves
 * it, the feature has stopped working. There is room to add a tier above later;
 * there is no way to take one back.
 */
export interface LiveGift {
    id: string;
    /** Georgian, as it appears under the icon. */
    name: string;
    icon: string;
    /** Coins. Charged to the sender now, paid to the host when the stream ends. */
    price: number;
    /** Drawn behind the icon as it flies up. */
    color: string;
}
export declare const LIVE_GIFTS: readonly LiveGift[];
/** Nothing here may cost more than this. Asserted by a test, not by trust. */
export declare const LIVE_GIFT_MAX_PRICE = 10;
/** The gift, or null for anything not in the catalog. Never throws. */
export declare function liveGift(id: unknown): LiveGift | null;
//# sourceMappingURL=liveGifts.d.ts.map