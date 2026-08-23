import type { HandValue } from './evaluator.js';

/**
 * Pots: how much is in the middle, who can win it, and who gets it.
 *
 * THE PROBLEM SIDE POTS SOLVE
 * ───────────────────────────
 * A player can only win what they matched. If a short stack is all-in for 100
 * and two others keep betting to 500, the short stack can win 300 (their 100
 * from each of three players) and not a chip more — the remaining 800 belongs
 * to a pot they are not in. Getting this wrong is the single most damaging bug
 * a poker engine can have, because it silently pays the wrong player and every
 * total still adds up.
 *
 * HOW IT IS BUILT
 * ───────────────
 * By layers. Sort the distinct amounts players put in; each layer is "everyone
 * who put in at least this much, times the height of the layer". Anyone who
 * folded still CONTRIBUTES to every layer their chips reached — their money
 * stays in the pot — but they are never eligible to win one.
 *
 * ODD CHIPS
 * ─────────
 * A split that does not divide evenly leaves one or two chips over. They go to
 * the eligible winner nearest the dealer's left, which is the standard rule and
 * — more importantly — a rule, so the outcome is not a coin flip that differs
 * between two runs of the same hand.
 */

export interface Contribution {
  playerId: string;
  /** Everything this player has put into the pot this hand. */
  committed: number;
  /** Folded players' chips stay in the pot; they can never win one. */
  folded: boolean;
}

export interface Pot {
  /** Chips in this pot. */
  amount: number;
  /** Players who may win it — never includes anyone who folded. */
  eligible: string[];
  /** 0 is the main pot; 1 and up are side pots, in the order they formed. */
  index: number;
}

export interface Payout {
  playerId: string;
  amount: number;
  potIndex: number;
  /** True when the pot was won without a showdown (everyone else folded). */
  uncontested: boolean;
}

/**
 * Split the money into a main pot and however many side pots the all-ins
 * created. The sum of the pots always equals the sum of the contributions —
 * that invariant is worth more than any comment, and the tests assert it.
 */
export function buildPots(contributions: Contribution[]): Pot[] {
  const live = contributions.filter(c => c.committed > 0);
  if (live.length === 0) return [];

  const levels = [...new Set(live.map(c => c.committed))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let previous = 0;

  for (const level of levels) {
    const height = level - previous;
    if (height <= 0) { previous = level; continue; }

    const contributors = live.filter(c => c.committed >= level);
    const amount = height * contributors.length;
    const eligible = contributors.filter(c => !c.folded).map(c => c.playerId);

    if (amount > 0) {
      // A layer nobody can win (everyone in it folded) still holds real chips;
      // they belong to the previous pot rather than vanishing.
      if (eligible.length === 0 && pots.length > 0) {
        pots[pots.length - 1]!.amount += amount;
      } else if (eligible.length > 0) {
        const last = pots[pots.length - 1];
        // Merge layers with an identical eligible set — two all-ins for the
        // same amount make one pot, not two.
        if (last && sameSet(last.eligible, eligible)) last.amount += amount;
        else pots.push({ amount, eligible, index: pots.length });
      }
    }
    previous = level;
  }

  return pots.map((p, i) => ({ ...p, index: i }));
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every(x => set.has(x));
}

/**
 * Award every pot.
 *
 * `showdown` holds the evaluated hand of each player still in at the end. A
 * player who is not in the map (because they folded) can win nothing, even if
 * some pot lists them as eligible — which cannot happen, but the check costs
 * nothing and the failure mode it prevents is paying a folded player.
 *
 * `seatOrder` is the seats starting to the dealer's left; it decides odd chips.
 */
export function distribute(
  pots: Pot[],
  showdown: Map<string, HandValue>,
  seatOrder: string[],
): Payout[] {
  const payouts: Payout[] = [];

  for (const pot of pots) {
    const contenders = pot.eligible.filter(id => showdown.has(id));

    if (contenders.length === 0) continue;
    if (contenders.length === 1) {
      payouts.push({ playerId: contenders[0]!, amount: pot.amount, potIndex: pot.index, uncontested: true });
      continue;
    }

    let best = -Infinity;
    for (const id of contenders) best = Math.max(best, showdown.get(id)!.score);
    const winners = contenders.filter(id => showdown.get(id)!.score === best);

    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;

    // Odd chips travel clockwise from the dealer's left, so the same hand
    // always pays out the same way.
    const ordered = seatOrder.filter(id => winners.includes(id));
    const queue = ordered.length === winners.length ? ordered : winners;

    for (const id of queue) {
      let amount = share;
      if (remainder > 0) { amount += 1; remainder -= 1; }
      payouts.push({ playerId: id, amount, potIndex: pot.index, uncontested: false });
    }
  }

  return payouts;
}

/** Convenience: what each player ends up receiving, summed over all pots. */
export function totalsByPlayer(payouts: Payout[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of payouts) out.set(p.playerId, (out.get(p.playerId) ?? 0) + p.amount);
  return out;
}
