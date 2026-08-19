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
import type { PlayerPerksState, EntranceStyle, RoomSkinId, VoiceMaskPreset } from '../types/index.js';

export type PerkId =
  | 'invisible' | 'anon' | 'vip' | 'xpboost'
  | 'entrance' | 'roomskin' | 'stickers' | 'voicemask' | 'coinmagnet' | 'notebook' | 'postboost';
export type PerkMode = 'off' | 'always';
/** Perks that are a persistent on/off switch. */
export type TogglePerk = 'invisible' | 'anon' | 'entrance' | 'voicemask';
/** Perks that carry a chosen variant alongside ownership. */
export type ChoicePerk = 'entrance' | 'roomskin' | 'voicemask';

export const ENTRANCE_STYLES: EntranceStyle[] = ['neon', 'smoke', 'gold', 'glitch'];
export const ROOM_SKINS: RoomSkinId[] = ['default', 'crimson', 'emerald', 'noir', 'sunset', 'ice'];
export const VOICE_MASK_PRESETS: VoiceMaskPreset[] = ['deep', 'high', 'ghost'];

/** Coin magnet multiplier. One constant so the shop copy and the maths agree. */
export const COIN_MAGNET_MULT = 1.25;

/** Persisted perk state (shape lives in types/index.ts as PlayerPerksState so
 *  the cosmetics blob and this service agree). Defaults are a new player's. */
export type PerkState = PlayerPerksState;

export function defaultPerks(): PerkState {
  return {
    ownsInvisible: false, invisibleMode: 'off',
    ownsAnon: false, anonMode: 'off',
    vipUntil: null, xpBoostGames: 0,
    ownsEntrance: false, entranceMode: 'off', entranceStyle: 'neon',
    ownsRoomSkin: false, roomSkin: 'default',
    ownsVoiceMask: false, voiceMaskMode: 'off', voiceMaskPreset: 'deep',
    stickers: 0,
    coinMagnetUntil: null,
    ownsNotebook: false,
    postBoosts: 0,
  };
}

/** Catalogue. `kind` drives how a purchase is applied. */
export interface PerkDef {
  id: PerkId;
  name: string;
  ka: string;
  desc: string;
  price: number;
  /** toggle = own once, switch on/off. unlock = own once, no switch.
   *  duration = re-buyable, stacks in time. consumable = re-buyable, stacks in units. */
  kind: 'toggle' | 'unlock' | 'duration' | 'consumable';
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
  entrance: {
    id: 'entrance', name: 'Entrance', ka: 'შესვლის ანიმაცია', kind: 'toggle', price: 5000,
    desc: 'ლობიში შესვლისას ყველას ეკრანზე შენი ბანერი გამოჩნდება. სტილს თვითონ ირჩევ.',
  },
  roomskin: {
    id: 'roomskin', name: 'Room Skin', ka: 'ოთახის სკინი', kind: 'unlock', price: 4500,
    desc: 'როცა ჰოსტი ხარ, შენი ოთახის ფერები ყველასთვის იცვლება. 6 სკინი.',
  },
  stickers: {
    id: 'stickers', name: 'Sticker Pack', ka: 'ანიმირებული სტიკერები', kind: 'consumable', price: 1200, units: 30,
    desc: 'ლობიში აგდებ სტიკერს და ის ყველას ეკრანზე გადაფრინდება. 30 ცალი.',
  },
  voicemask: {
    id: 'voicemask', name: 'Voice Mask', ka: 'ხმის მოდულატორი', kind: 'toggle', price: 3500,
    desc: 'შენს მიკროფონს ტონს უცვლის — ხმით ვეღარ გცნობენ. 3 ვარიანტი.',
  },
  coinmagnet: {
    id: 'coinmagnet', name: 'Coin Magnet', ka: 'მონეტის მაგნიტი', kind: 'duration', price: 2500, hours: 168,
    desc: '+25% მონეტა ყოველდღიური ჯილდოდან 7 დღის განმავლობაში.',
  },
  notebook: {
    id: 'notebook', name: "Detective's Notebook", ka: 'დეტექტივის ბლოკნოტი', kind: 'unlock', price: 3000,
    desc: 'თამაშში პირადი ჩანაწერები და ფერადი ჭდეები მოთამაშეებზე. Ranked-ში გამორთულია.',
  },
  postboost: {
    id: 'postboost', name: 'Post Boost', ka: 'პოსტის აწევა', kind: 'consumable', price: 2000, units: 3,
    desc: 'შენს პოსტს ფიდის თავში აჩერებს 6 საათი. 3 გამოყენება.',
  },
};

/** How long one post boost lasts. */
export const POST_BOOST_MS = 6 * 3_600_000;

// ── storage: read-modify-write the whole cosmetics blob ─────────────────
async function loadCosmeticsRaw(profileId: string): Promise<any> {
  const [row] = await sql`SELECT cosmetics FROM players WHERE id = ${profileId}` as any[];
  try { return JSON.parse(row?.cosmetics ?? '{}') || {}; } catch { return {}; }
}

/** Coerce whatever is in storage into a full PerkState, filling defaults. */
function normalise(raw: any): PerkState {
  const p = raw?.perks ?? {};
  const d = defaultPerks();
  // Every choice field is validated against its allowed list rather than
  // trusted: these values are echoed to other clients (skins, entrance styles),
  // so a hand-edited blob must not be able to inject anything downstream.
  const pick = <T extends string>(v: any, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v) ? v as T : fallback;
  const count = (v: any) => Math.max(0, Math.trunc(Number(v) || 0));
  return {
    ownsInvisible: !!p.ownsInvisible,
    invisibleMode: p.invisibleMode === 'always' ? 'always' : 'off',
    ownsAnon: !!p.ownsAnon,
    anonMode: p.anonMode === 'always' ? 'always' : 'off',
    vipUntil: typeof p.vipUntil === 'number' ? p.vipUntil : d.vipUntil,
    xpBoostGames: count(p.xpBoostGames),
    ownsEntrance: !!p.ownsEntrance,
    entranceMode: p.entranceMode === 'always' ? 'always' : 'off',
    entranceStyle: pick(p.entranceStyle, ENTRANCE_STYLES, d.entranceStyle),
    ownsRoomSkin: !!p.ownsRoomSkin,
    roomSkin: pick(p.roomSkin, ROOM_SKINS, d.roomSkin),
    ownsVoiceMask: !!p.ownsVoiceMask,
    voiceMaskMode: p.voiceMaskMode === 'always' ? 'always' : 'off',
    voiceMaskPreset: pick(p.voiceMaskPreset, VOICE_MASK_PRESETS, d.voiceMaskPreset),
    stickers: count(p.stickers),
    coinMagnetUntil: typeof p.coinMagnetUntil === 'number' ? p.coinMagnetUntil : d.coinMagnetUntil,
    ownsNotebook: !!p.ownsNotebook,
    postBoosts: count(p.postBoosts),
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

  // One table, so a new own-once perk can never be forgotten here and end up
  // re-buyable (charging twice for the same thing).
  const ownedFlag: Partial<Record<PerkId, keyof PerkState>> = {
    invisible: 'ownsInvisible', anon: 'ownsAnon', entrance: 'ownsEntrance',
    roomskin: 'ownsRoomSkin', voicemask: 'ownsVoiceMask', notebook: 'ownsNotebook',
  };
  if (def.kind === 'toggle' || def.kind === 'unlock') {
    const flag = ownedFlag[def.id];
    if (!flag) throw new Error('უცნობი ნივთი');
    if (perks[flag]) throw new Error('უკვე გაქვს');
  }

  const balance = await getCoins(profileId);
  if (balance < def.price) throw new Error(`არ გყოფნის მონეტა. საჭიროა ${def.price}, გაქვს ${balance}.`);
  // deductCoins does not itself guard the balance, so the check above is what
  // prevents a negative balance; charge before granting so a thrown grant can't
  // leave the item ungranted-but-paid.
  const { newBalance } = await deductCoins(profileId, profileId, def.price, `Perk: ${def.name}`);

  if (def.kind === 'toggle' || def.kind === 'unlock') {
    (perks as any)[ownedFlag[def.id] as string] = true;
  } else if (def.kind === 'duration') {
    // Extend from the later of now / current expiry, so topping up an active
    // one never shortens it.
    const field: 'vipUntil' | 'coinMagnetUntil' = def.id === 'coinmagnet' ? 'coinMagnetUntil' : 'vipUntil';
    const base = Math.max(now(), perks[field] ?? 0);
    perks[field] = base + (def.hours ?? 0) * 3_600_000;
  } else if (def.kind === 'consumable') {
    const field: 'xpBoostGames' | 'stickers' | 'postBoosts' =
      def.id === 'stickers' ? 'stickers' : def.id === 'postboost' ? 'postBoosts' : 'xpBoostGames';
    perks[field] += def.units ?? 0;
  }
  await savePerks(profileId, perks);
  return { perks, coins: newBalance };
}

const TOGGLE_FIELDS: Record<TogglePerk, { owns: keyof PerkState; mode: keyof PerkState }> = {
  invisible: { owns: 'ownsInvisible', mode: 'invisibleMode' },
  anon: { owns: 'ownsAnon', mode: 'anonMode' },
  entrance: { owns: 'ownsEntrance', mode: 'entranceMode' },
  voicemask: { owns: 'ownsVoiceMask', mode: 'voiceMaskMode' },
};

/** Set a toggle's default mode. Owning the toggle is required. */
export async function setPerkMode(profileId: string, which: TogglePerk, mode: PerkMode): Promise<PerkState> {
  const f = TOGGLE_FIELDS[which];
  if (!f) throw new Error('უცნობი პარამეტრი');
  const perks = await getPerks(profileId);
  if (!perks[f.owns]) throw new Error(`ჯერ იყიდე ${PERK_ITEMS[which].ka}`);
  (perks as any)[f.mode] = mode;
  await savePerks(profileId, perks);
  return perks;
}

const CHOICE_FIELDS: Record<ChoicePerk, { owns: keyof PerkState; field: keyof PerkState; allowed: readonly string[] }> = {
  entrance:  { owns: 'ownsEntrance',  field: 'entranceStyle',    allowed: ENTRANCE_STYLES },
  roomskin:  { owns: 'ownsRoomSkin',  field: 'roomSkin',         allowed: ROOM_SKINS },
  voicemask: { owns: 'ownsVoiceMask', field: 'voiceMaskPreset',  allowed: VOICE_MASK_PRESETS },
};

/**
 * Pick which variant of an owned perk to use (entrance style, room skin, voice
 * preset). Validated against the allowed list here rather than at the socket
 * edge, so every caller gets the same guarantee.
 */
export async function setPerkChoice(profileId: string, which: ChoicePerk, value: string): Promise<PerkState> {
  const f = CHOICE_FIELDS[which];
  if (!f) throw new Error('უცნობი პარამეტრი');
  if (!f.allowed.includes(value)) throw new Error('უცნობი ვარიანტი');
  const perks = await getPerks(profileId);
  if (!perks[f.owns]) throw new Error(`ჯერ იყიდე ${PERK_ITEMS[which].ka}`);
  (perks as any)[f.field] = value;
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

/** The entrance banner to play when this player joins a lobby, or null. */
export async function resolveEntrance(profileId: string | null): Promise<EntranceStyle | null> {
  if (!profileId) return null;
  const p = await getPerks(profileId);
  return p.ownsEntrance && p.entranceMode === 'always' ? p.entranceStyle : null;
}

/** The skin a host's room should wear, or null for the default look. */
export async function resolveRoomSkin(profileId: string | null): Promise<RoomSkinId | null> {
  if (!profileId) return null;
  const p = await getPerks(profileId);
  return p.ownsRoomSkin && p.roomSkin !== 'default' ? p.roomSkin : null;
}

/** The voice preset this player's own mic should use, or null. */
export async function resolveVoiceMask(profileId: string | null): Promise<VoiceMaskPreset | null> {
  if (!profileId) return null;
  const p = await getPerks(profileId);
  return p.ownsVoiceMask && p.voiceMaskMode === 'always' ? p.voiceMaskPreset : null;
}

/** Spend one sticker. False if none left (or no perk at all). */
export async function consumeSticker(profileId: string | null): Promise<boolean> {
  if (!profileId) return false;
  const perks = await getPerks(profileId);
  if (perks.stickers <= 0) return false;
  perks.stickers -= 1;
  await savePerks(profileId, perks);
  return true;
}

/** Spend one feed boost. False if none left. */
export async function consumePostBoost(profileId: string | null): Promise<boolean> {
  if (!profileId) return false;
  const perks = await getPerks(profileId);
  if (perks.postBoosts <= 0) return false;
  perks.postBoosts -= 1;
  await savePerks(profileId, perks);
  return true;
}

/**
 * Put a spent boost back. Used when the spend succeeded but the thing it was
 * spent on then failed — the unit must be taken BEFORE the boost is applied
 * (otherwise a player with zero boosts still gets one applied), which means the
 * failure path owes them a refund.
 */
export async function refundPostBoost(profileId: string | null): Promise<void> {
  if (!profileId) return;
  const perks = await getPerks(profileId);
  perks.postBoosts += 1;
  await savePerks(profileId, perks);
}

export function isCoinMagnetActive(perks: PerkState, at = now()): boolean {
  return perks.coinMagnetUntil != null && perks.coinMagnetUntil > at;
}

/**
 * Apply the coin magnet to an award. Returns the amount to actually credit and
 * whether the multiplier fired, so the caller can tell the player about it.
 *
 * Rounded UP: a magnet that silently rounds a small award back down to itself
 * looks broken to the person who paid for it.
 */
export async function applyCoinMagnet(profileId: string | null, amount: number): Promise<{ amount: number; boosted: boolean }> {
  if (!profileId || amount <= 0) return { amount, boosted: false };
  try {
    const p = await getPerks(profileId);
    if (!isCoinMagnetActive(p)) return { amount, boosted: false };
    return { amount: Math.ceil(amount * COIN_MAGNET_MULT), boosted: true };
  } catch {
    return { amount, boosted: false };
  }
}

/** A stable, non-identifying alias from a seed — same seed → same alias. */
const ANON_ADJ = ['ჩუმი', 'ჩრდილოვანი', 'უცნობი', 'იდუმალი', 'ნიღბიანი', 'მდუმარე', 'ბუნდოვანი', 'უხილავი'];
const ANON_NOUN = ['სტუმარი', 'მოთამაშე', 'ფიგურა', 'სილუეტი', 'პერსონა', 'აჩრდილი'];
export function aliasFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const adj = ANON_ADJ[h % ANON_ADJ.length];
  // `>>>`, not `>>`. h is unsigned, but the SIGNED shift turns any seed with
  // the top bit set into a negative number, `negative % 6` is negative, and the
  // lookup returns undefined — which is how an alias came out reading
  // "ბუნდოვანი undefined #18". Half of all seeds hit it.
  const noun = ANON_NOUN[(h >>> 5) % ANON_NOUN.length];
  const num = (h % 89) + 10;   // 10–98, two digits
  return `${adj} ${noun} #${num}`;
}
