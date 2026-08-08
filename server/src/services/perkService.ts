/**
 * Perks — purchasable gameplay/social items, distinct from cosmetics.
 *
 * A cosmetic changes how you LOOK (name colour, frame, background). A perk
 * changes what you can DO: spectate unseen, hide your name in a game, pin your
 * room, earn level-XP faster. They are bought with the same mafia coins but
 * kept separate because their state is richer than "owned": two are persistent
 * toggles you own once and switch on/off, two are consumables that burn down.
 *
 * WHERE STATE LIVES
 * ─────────────────
 * In players.cosmetics JSON under a `perks` key, so it rides along with the
 * cosmetics that are already loaded per player — no new column, no second
 * query. This service always reads-modifies-writes the WHOLE cosmetics object
 * so it never clobbers equipped frames/colours sitting beside it.
 *
 * SERVER-AUTHORITATIVE
 * ────────────────────
 * Every effect is resolved here or at a server hook (spectator join, game
 * start, room create, XP award). The client can ask to buy or configure; it
 * never decides that it IS invisible or that its XP should double. A modified
 * client gets nothing a clean one wouldn't.
 */
import { sql } from '../db.js';
import { getCoins, deductCoins } from './coinService.js';
import type { PlayerPerksState } from '../types/index.js';

export type PerkId = 'invisible' | 'anon' | 'vip' | 'xpboost';
export type PerkMode = 'off' | 'always';

/** Persisted perk state (shape lives in types/index.ts as PlayerPerksState so
 *  the cosmetics blob and this service agree). Defaults are a new player's. */
export type PerkState = PlayerPerksState;

export function defaultPerks(): PerkState {
  return { ownsInvisible: false, invisibleMode: 'off', ownsAnon: false, anonMode: 'off', vipUntil: null, xpBoostGames: 0 };
}

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

export const PERK_ITEMS: Record<PerkId, PerkDef> = {
  invisible: {
    id: 'invisible', name: 'Invisibility', ka: 'უჩინარობა', kind: 'toggle', price: 3000,
    desc: 'დააკვირდი თამაშს ისე, რომ დამკვირვებლების სიაში არ გამოჩნდე.',
  },
  anon: {
    id: 'anon', name: 'Anonymous', ka: 'ანონიმური ნიღაბი', kind: 'toggle', price: 4000,
    desc: 'თამაშის დროს შენი სახელი დანარჩენებს დაემალება ფსევდონიმით.',
  },
  vip: {
    id: 'vip', name: 'Room Spotlight', ka: 'ოთახის პროჟექტორი', kind: 'duration', price: 2500, hours: 24,
    desc: 'შენი ოთახი გამოკვეთილად ჩნდება ოთახების სიის თავში 24 საათის განმავლობაში.',
  },
  xpboost: {
    id: 'xpboost', name: 'XP Booster', ka: 'XP ბუსტერი', kind: 'consumable', price: 1500, units: 5,
    desc: 'მომდევნო 5 თამაშში ორმაგ დონის XP-ს იღებ.',
  },
};

// ── storage: read-modify-write the whole cosmetics blob ─────────────────
async function loadCosmeticsRaw(profileId: string): Promise<any> {
  const [row] = await sql`SELECT cosmetics FROM players WHERE id = ${profileId}` as any[];
  try { return JSON.parse(row?.cosmetics ?? '{}') || {}; } catch { return {}; }
}

/** Coerce whatever is in storage into a full PerkState, filling defaults. */
function normalise(raw: any): PerkState {
  const p = raw?.perks ?? {};
  const d = defaultPerks();
  return {
    ownsInvisible: !!p.ownsInvisible,
    invisibleMode: p.invisibleMode === 'always' ? 'always' : 'off',
    ownsAnon: !!p.ownsAnon,
    anonMode: p.anonMode === 'always' ? 'always' : 'off',
    vipUntil: typeof p.vipUntil === 'number' ? p.vipUntil : d.vipUntil,
    xpBoostGames: Math.max(0, Math.trunc(Number(p.xpBoostGames) || 0)),
  };
}

export async function getPerks(profileId: string): Promise<PerkState> {
  return normalise(await loadCosmeticsRaw(profileId));
}

async function savePerks(profileId: string, perks: PerkState): Promise<void> {
  const cos = await loadCosmeticsRaw(profileId);
  cos.perks = perks;
  await sql`UPDATE players SET cosmetics = ${JSON.stringify(cos)} WHERE id = ${profileId}`;
}

// ── purchase ────────────────────────────────────────────────────────────
/**
 * Buy a perk. Toggles must not be re-bought; duration/consumable perks are
 * re-buyable and stack (VIP extends from the later of now/current expiry so a
 * top-up never shortens it; XP games add). Coins are deducted first via the
 * shared transaction ledger, so a failed grant can't leave a charge behind.
 */
export async function buyPerk(profileId: string, perkId: string): Promise<{ perks: PerkState; coins: number }> {
  const def = PERK_ITEMS[perkId as PerkId];
  if (!def) throw new Error('უცნობი ნივთი');
  const perks = await getPerks(profileId);

  if (def.kind === 'toggle') {
    if (perkId === 'invisible' && perks.ownsInvisible) throw new Error('უკვე გაქვს');
    if (perkId === 'anon' && perks.ownsAnon) throw new Error('უკვე გაქვს');
  }

  const balance = await getCoins(profileId);
  if (balance < def.price) throw new Error(`არ გყოფნის მონეტა. საჭიროა ${def.price}, გაქვს ${balance}.`);
  // deductCoins does not itself guard the balance, so the check above is what
  // prevents a negative balance; charge before granting so a thrown grant can't
  // leave the item ungranted-but-paid.
  const { newBalance } = await deductCoins(profileId, profileId, def.price, `Perk: ${def.name}`);

  if (perkId === 'invisible') perks.ownsInvisible = true;
  else if (perkId === 'anon') perks.ownsAnon = true;
  else if (def.kind === 'duration') {
    const base = Math.max(now(), perks.vipUntil ?? 0);
    perks.vipUntil = base + (def.hours ?? 0) * 3_600_000;
  } else if (def.kind === 'consumable') {
    perks.xpBoostGames += def.units ?? 0;
  }
  await savePerks(profileId, perks);
  return { perks, coins: newBalance };
}

/** Set a toggle's default mode. Owning the toggle is required. */
export async function setPerkMode(profileId: string, which: 'invisible' | 'anon', mode: PerkMode): Promise<PerkState> {
  const perks = await getPerks(profileId);
  if (which === 'invisible') {
    if (!perks.ownsInvisible) throw new Error('ჯერ იყიდე უჩინარობა');
    perks.invisibleMode = mode;
  } else {
    if (!perks.ownsAnon) throw new Error('ჯერ იყიდე ანონიმური ნიღაბი');
    perks.anonMode = mode;
  }
  await savePerks(profileId, perks);
  return perks;
}

// ── resolution helpers used at the server hooks ─────────────────────────
// now() is wrapped so nothing in this module reaches for Date.now() directly —
// keeps the pure logic (isVipActive) testable with an injected clock.
const now = () => Date.now();

export function isVipActive(perks: PerkState, at = now()): boolean {
  return perks.vipUntil != null && perks.vipUntil > at;
}

/** True if this player should be an invisible spectator by their saved default. */
export async function resolveSpectatorInvisible(profileId: string | null): Promise<boolean> {
  if (!profileId) return false;
  const p = await getPerks(profileId);
  return p.ownsInvisible && p.invisibleMode === 'always';
}

/** True if this player should enter the next game anonymously by default. */
export async function resolveAnon(profileId: string | null): Promise<boolean> {
  if (!profileId) return false;
  const p = await getPerks(profileId);
  return p.ownsAnon && p.anonMode === 'always';
}

/**
 * Spend one XP-boost game if any remain. Returns whether the caller should
 * double this game's level-XP. Idempotency is the caller's job (call once per
 * player per game, at the single award site).
 */
export async function consumeXpBoost(profileId: string | null): Promise<boolean> {
  if (!profileId) return false;
  const perks = await getPerks(profileId);
  if (perks.xpBoostGames <= 0) return false;
  perks.xpBoostGames -= 1;
  await savePerks(profileId, perks);
  return true;
}

/** VIP spotlight duration for a room the given host is creating, or null. */
export async function resolveSpotlightUntil(profileId: string | null): Promise<number | null> {
  if (!profileId) return null;
  const p = await getPerks(profileId);
  return isVipActive(p) ? p.vipUntil : null;
}

/** A stable, non-identifying alias from a seed — same seed → same alias. */
const ANON_ADJ = ['ჩუმი', 'ჩრდილოვანი', 'უცნობი', 'იდუმალი', 'ნიღბიანი', 'მდუმარე', 'ბუნდოვანი', 'უხილავი'];
const ANON_NOUN = ['სტუმარი', 'მოთამაშე', 'ფიგურა', 'სილუეტი', 'პერსონა', 'აჩრდილი'];
export function aliasFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const adj = ANON_ADJ[h % ANON_ADJ.length];
  const noun = ANON_NOUN[(h >> 5) % ANON_NOUN.length];
  const num = (h % 89) + 10;   // 10–98, two digits
  return `${adj} ${noun} #${num}`;
}
