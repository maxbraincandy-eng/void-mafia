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

export const LIVE_GIFTS: readonly LiveGift[] = [
  { id: 'white_rose', name: 'თეთრი ვარდი', icon: '🤍', price: 1,  color: '#e8e4f0' },
  { id: 'coffee',     name: 'ყავა',        icon: '☕', price: 2,  color: '#b07d4f' },
  { id: 'chocolate',  name: 'შოკოლადი',    icon: '🍫', price: 3,  color: '#7b4b2a' },
  { id: 'red_rose',   name: 'წითელი ვარდი', icon: '🌹', price: 5,  color: '#ff2d55' },
  { id: 'fire',       name: 'ცეცხლი',      icon: '🔥', price: 6,  color: '#ff8a2b' },
  { id: 'champagne',  name: 'შამპანური',   icon: '🍾', price: 8,  color: '#d9c26a' },
  { id: 'crown',      name: 'გვირგვინი',   icon: '👑', price: 10, color: '#ffcc33' },
  { id: 'diamond',    name: 'ბრილიანტი',   icon: '💎', price: 10, color: '#4fd8ff' },
];

/** Nothing here may cost more than this. Asserted by a test, not by trust. */
export const LIVE_GIFT_MAX_PRICE = 10;

const BY_ID = new Map(LIVE_GIFTS.map(g => [g.id, g]));

/** The gift, or null for anything not in the catalog. Never throws. */
export function liveGift(id: unknown): LiveGift | null {
  return BY_ID.get(String(id ?? '')) ?? null;
}
