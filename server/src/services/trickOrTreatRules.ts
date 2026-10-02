/**
 * ტკბილეული თუ ხრიკი — the rules, with no I/O.
 *
 * A walk down a haunted street. Each knock opens one door; most give candy,
 * some give something useful, and a ghost takes the whole bag unless an amulet
 * stops it. Going home banks the bag. The ghost gets likelier with every door,
 * and the odds for the next one are on the screen — so the only question is
 * the one that makes it a game: one more door, or home?
 *
 * Every roll happens on the server. The client is told what a door held after
 * it is opened, and is told the next door early only by a lantern, which it
 * found by knocking. Nothing about an unopened door is in any payload.
 */

export const RUNS_PER_DAY = 5;
/** A walk ends by itself here; nobody should be able to knock for ever. */
export const MAX_DOORS = 30;

export type DoorKind = 'candy' | 'treat' | 'amulet' | 'lantern' | 'cat' | 'ghost';

export interface Door {
  kind: DoorKind;
  /** Candy in it; only candy and treats have any. */
  amount: number;
  /** A ghost that an amulet stopped. The bag is safe and the walk goes on. */
  saved?: boolean;
}

export interface Walk {
  doors: Door[];
  bag: number;
  amulet: boolean;
  /** The next door, rolled early because a lantern showed it. */
  peek: Door | null;
  status: 'walking' | 'home' | 'scared';
  banked: number;
  /** Bought for this walk: every candy and treat door gives one more. */
  sweet?: boolean;
}

// ── The shop ────────────────────────────────────────────────────────────────
//
// Candy is worth something only if it can be spent, so it can be: on gear for
// the next walk (which is how a careful player goes further), on more walks,
// on coins, and on things to wear. Spending never lowers a player's place on
// the season board — that counts candy carried home, not candy kept.

export type GearId = 'amulet' | 'lantern' | 'sweet';
export const GEAR: Record<GearId, { price: number; label: string; emoji: string; desc: string }> = {
  amulet:  { price: 15, emoji: '🧿', label: 'ამულეტი',        desc: 'გასეირნებას ამულეტით იწყებ — პირველ მოჩვენებას მოიგერიებ' },
  lantern: { price: 10, emoji: '🎃', label: 'ფარანი',          desc: 'პირველი კარი წინასწარ განათებულია' },
  sweet:   { price: 20, emoji: '🍭', label: 'ტკბილი ტომარა',  desc: 'ყოველ კანფეტს და ტკბილეულს +1' },
};

/** A walk bought more than this many times a day stops being a daily game. */
export const EXTRA_WALKS_PER_DAY = 2;
export const EXTRA_WALK_PRICE = 25;

/** 10 candy for 10 coins, in tens, at most 100 coins a day. */
export const EXCHANGE_STEP = 10;
export const EXCHANGE_COINS_PER_DAY = 100;
export const coinsFor = (candy: number) => candy;

export type CosmeticId = 'title_candy_king' | 'frame_jack_o_lantern';
export const COSMETICS: Record<CosmeticId, { price: number; label: string; emoji: string }> = {
  title_candy_king:     { price: 150, emoji: '👑', label: 'სათაური „ტკბილეულის მეფე"' },
  frame_jack_o_lantern: { price: 250, emoji: '🎃', label: 'ჩარჩო „ჯეკის ფარანი"' },
};

/** What the top three of the season are given when it closes. */
export const SEASON_PRIZES: { rank: number; coins: number; items: string[] }[] = [
  { rank: 1, coins: 500, items: ['title_halloween_champion_2026', 'frame_jack_o_lantern'] },
  { rank: 2, coins: 300, items: ['title_halloween_champion_2026'] },
  { rank: 3, coins: 150, items: ['title_halloween_champion_2026'] },
];

export function newWalk(gear: GearId[] = [], rng: () => number = Math.random): Walk {
  const w: Walk = { doors: [], bag: 0, amulet: false, peek: null, status: 'walking', banked: 0 };
  if (gear.includes('amulet')) w.amulet = true;
  if (gear.includes('sweet')) w.sweet = true;
  if (gear.includes('lantern')) w.peek = rollDoor(1, rng);
  return w;
}

/** The chance that door number `n` (1-based) is a ghost. */
export function ghostChance(n: number): number {
  return Math.min(0.55, 0.06 + 0.04 * (n - 1));
}

/**
 * What is behind door `n`.
 *
 * Candy grows with depth, so walking further is worth something besides the
 * risk; without that the right play would be to bank after every door.
 */
export function rollDoor(n: number, rng: () => number = Math.random): Door {
  if (rng() < ghostChance(n)) return { kind: 'ghost', amount: 0 };
  const r = rng();
  if (r < 0.70) return { kind: 'candy', amount: 1 + Math.floor(n / 3) + Math.floor(rng() * 3) };
  if (r < 0.78) return { kind: 'treat', amount: 8 + n };
  if (r < 0.85) return { kind: 'amulet', amount: 0 };
  if (r < 0.93) return { kind: 'lantern', amount: 0 };
  return { kind: 'cat', amount: 0 };
}

export class WalkError extends Error {}

/** Open the next door. Returns the new walk and the door as it played out. */
export function knock(w: Walk, rng: () => number = Math.random): { walk: Walk; door: Door } {
  if (w.status !== 'walking') throw new WalkError('ეს გასეირნება უკვე დასრულდა.');
  const n = w.doors.length + 1;
  let door = w.peek ?? rollDoor(n, rng);
  const walk: Walk = { ...w, doors: [...w.doors], peek: null };

  switch (door.kind) {
    case 'candy':
    case 'treat':
      if (walk.sweet) door = { ...door, amount: door.amount + 1 };
      walk.bag += door.amount;
      break;
    case 'amulet':
      // One at a time: a second amulet is worth a little candy instead.
      if (walk.amulet) door = { kind: 'candy', amount: 2 };
      if (door.kind === 'candy') walk.bag += door.amount;
      else walk.amulet = true;
      break;
    case 'lantern':
      walk.peek = rollDoor(n + 1, rng);
      break;
    case 'ghost':
      if (walk.amulet) {
        walk.amulet = false;
        door = { kind: 'ghost', amount: 0, saved: true };
      } else {
        walk.status = 'scared';
        walk.bag = 0;
      }
      break;
    case 'cat':
      break;
  }
  walk.doors.push(door);

  // The end of the street walks you home with whatever you are carrying.
  if (walk.status === 'walking' && walk.doors.length >= MAX_DOORS) return { walk: goHome(walk), door };
  return { walk, door };
}

/** Bank the bag. */
export function goHome(w: Walk): Walk {
  if (w.status !== 'walking') throw new WalkError('ეს გასეირნება უკვე დასრულდა.');
  return { ...w, status: 'home', banked: w.bag, peek: null };
}

/**
 * Is it Halloween on the street?
 *
 * The whole of October and the first three days of November, by the Tbilisi
 * calendar — a month long rather than one night, so it is something to come
 * back to rather than something to miss.
 */
const TBILISI_OFFSET_MS = 4 * 3600_000;
export function tbilisiDate(now: number): { year: number; month: number; day: number; key: string } {
  const d = new Date(now + TBILISI_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), key: d.toISOString().slice(0, 10) };
}

export function isSeason(now: number = Date.now()): boolean {
  const { month, day } = tbilisiDate(now);
  return month === 10 || (month === 11 && day <= 3);
}

/** The season a moment belongs to: its Tbilisi year. */
export const seasonOf = (now: number = Date.now()) => tbilisiDate(now).year;

/** The next Tbilisi midnight, when the walks come back. */
export function nextMidnight(now: number = Date.now()): number {
  const shifted = now + TBILISI_OFFSET_MS;
  return shifted - (shifted % 86400_000) + 86400_000 - TBILISI_OFFSET_MS;
}

/** What a finished walk looks like as text, for sharing. Never an unopened door. */
export function shareLine(w: Walk): string {
  const icon: Record<DoorKind, string> = {
    candy: '🍬', treat: '🍫', amulet: '🧿', lantern: '🎃', cat: '🐈‍⬛', ghost: '👻',
  };
  const path = w.doors.map(d => (d.saved ? '🛡️' : icon[d.kind])).join('');
  const end = w.status === 'scared' ? '😱 შემაშინეს' : `🏠 ${w.banked} 🍬`;
  return `🎃 ტკბილეული თუ ხრიკი\n${path}\n${end}\nvoidmafia.one`;
}
