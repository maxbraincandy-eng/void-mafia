/**
 * What a viewer can send a host mid-broadcast.
 *
 * Mirrors `server/src/services/liveGifts.ts`, and the server is the authority.
 * This copy exists to draw a grid — the price shown here is a label, not a
 * quote. Nothing on the client ever tells the server what a gift costs: the
 * client sends an id, the server charges what that id costs there. If the two
 * files disagree the screen is wrong and the balance is right, which is the
 * correct way round for them to be wrong.
 *
 * Nothing over ten coins, on purpose. A live gift should be an impulse nobody
 * has to think about — the moment you weigh whether the host deserves it, the
 * feature has stopped working.
 */

export interface LiveGift {
  id: string;
  name: string;
  icon: string;
  price: number;
  color: string;
}

export const LIVE_GIFTS: readonly LiveGift[] = [
  { id: 'white_rose', name: 'თეთრი ვარდი',  icon: '🤍', price: 1,  color: '#e8e4f0' },
  { id: 'coffee',     name: 'ყავა',         icon: '☕', price: 2,  color: '#b07d4f' },
  { id: 'chocolate',  name: 'შოკოლადი',     icon: '🍫', price: 3,  color: '#7b4b2a' },
  { id: 'red_rose',   name: 'წითელი ვარდი', icon: '🌹', price: 5,  color: '#ff2d55' },
  { id: 'fire',       name: 'ცეცხლი',       icon: '🔥', price: 6,  color: '#ff8a2b' },
  { id: 'champagne',  name: 'შამპანური',    icon: '🍾', price: 8,  color: '#d9c26a' },
  { id: 'crown',      name: 'გვირგვინი',    icon: '👑', price: 10, color: '#ffcc33' },
  { id: 'diamond',    name: 'ბრილიანტი',    icon: '💎', price: 10, color: '#4fd8ff' },
];

const BY_ID = new Map(LIVE_GIFTS.map(g => [g.id, g]));

/**
 * The gift, or a placeholder.
 *
 * A server that has been deployed ahead of a cached client can broadcast a gift
 * this copy has never heard of. Drawing "🎁" for it is right; crashing the live
 * screen over an unknown emoji is not.
 */
export function liveGift(id: string): LiveGift {
  return BY_ID.get(id) ?? { id, name: 'საჩუქარი', icon: '🎁', price: 0, color: '#9b8cff' };
}
