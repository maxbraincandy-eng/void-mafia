import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';

export type TxType = 'grant' | 'deduct' | 'gift_sent' | 'gift_received' | 'daily_reward' | 'refund';

export interface CoinTransaction {
  id: string;
  playerId: string;
  type: TxType;
  amount: number;
  balanceAfter: number;
  refId: string | null;
  description: string;
  grantedBy: string | null;
  createdAt: number;
}

export interface GiftCatalogItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  imageUrl: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  stars: number;
  price: number;
  active: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface PlayerGift {
  id: string;
  recipientId: string;
  senderId: string;
  senderUsername: string;
  senderAvatar: string;
  senderAvatarUrl: string | null;
  giftId: string;
  giftName: string;
  giftIcon: string;
  giftRarity: string;
  giftStars: number;
  message: string;
  transactionId: string;
  createdAt: number;
}

export interface GiftDetail extends GiftCatalogItem {
  totalSent: number;
  senders: Array<{
    senderId: string;
    senderUsername: string;
    senderAvatar: string;
    senderAvatarUrl: string | null;
    message: string;
    sentAt: number;
  }>;
}

const DAILY_REWARD_COINS = 50;

export async function getCoins(playerId: string): Promise<number> {
  const [row] = await sql`SELECT coins FROM players WHERE id = ${playerId}` as any[];
  return Number(row?.coins ?? 0);
}

async function recordTransaction(
  playerId: string,
  type: TxType,
  amount: number,
  description: string,
  opts: { refId?: string; grantedBy?: string } = {},
): Promise<{ id: string; balanceAfter: number }> {
  const [row] = await sql`
    UPDATE players
    SET coins = GREATEST(0, coins + ${amount})
    WHERE id = ${playerId}
    RETURNING coins
  ` as any[];
  const balanceAfter = Number(row.coins);
  const id = generateId();
  await sql`
    INSERT INTO coin_transactions (id, player_id, type, amount, balance_after, ref_id, description, granted_by, created_at)
    VALUES (${id}, ${playerId}, ${type}, ${amount}, ${balanceAfter},
            ${opts.refId ?? null}, ${description}, ${opts.grantedBy ?? null}, ${Date.now()})
  `;
  return { id, balanceAfter };
}

export async function claimDailyReward(playerId: string): Promise<{ coins: number; balance: number; alreadyClaimed: boolean }> {
  const dateKey = new Date().toISOString().slice(0, 10);
  const existing = await sql`
    SELECT 1 FROM daily_coin_claims WHERE player_id = ${playerId} AND date_key = ${dateKey}
  ` as any[];
  if (existing.length > 0) {
    const balance = await getCoins(playerId);
    return { coins: 0, balance, alreadyClaimed: true };
  }
  const { balanceAfter } = await recordTransaction(playerId, 'daily_reward', DAILY_REWARD_COINS, 'Daily reward');
  await sql`
    INSERT INTO daily_coin_claims (player_id, date_key, coins_awarded, claimed_at)
    VALUES (${playerId}, ${dateKey}, ${DAILY_REWARD_COINS}, ${Date.now()})
  `;
  return { coins: DAILY_REWARD_COINS, balance: balanceAfter, alreadyClaimed: false };
}

export async function grantCoins(
  ownerId: string,
  targetId: string,
  amount: number,
  description: string,
): Promise<{ newBalance: number }> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be a positive integer.');
  if (amount > 100_000) throw new Error('Amount too large (max 100,000).');
  const { balanceAfter } = await recordTransaction(
    targetId, 'grant', amount, description || 'Owner grant', { grantedBy: ownerId },
  );
  return { newBalance: balanceAfter };
}

export async function deductCoins(
  ownerId: string,
  targetId: string,
  amount: number,
  description: string,
): Promise<{ newBalance: number }> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be a positive integer.');
  if (amount > 100_000) throw new Error('Amount too large (max 100,000).');
  const { balanceAfter } = await recordTransaction(
    targetId, 'deduct', -amount, description || 'Owner deduction', { grantedBy: ownerId },
  );
  return { newBalance: balanceAfter };
}

export async function refundGift(txId: string, ownerId: string): Promise<void> {
  const [tx] = await sql`SELECT * FROM coin_transactions WHERE id = ${txId}` as any[];
  if (!tx) throw new Error('Transaction not found.');
  if (tx.type !== 'gift_sent') throw new Error('Only gift_sent transactions can be refunded.');
  const amount = Math.abs(Number(tx.amount));
  await recordTransaction(tx.player_id, 'refund', amount, `Refund for tx ${txId}`, { refId: txId, grantedBy: ownerId });
}

export async function getTransactions(playerId: string, limit = 50): Promise<CoinTransaction[]> {
  const rows = await sql`
    SELECT * FROM coin_transactions WHERE player_id = ${playerId}
    ORDER BY created_at DESC LIMIT ${limit}
  ` as any[];
  return rows.map(rowToTx);
}

export async function getAllTransactions(limit = 200): Promise<CoinTransaction[]> {
  const rows = await sql`
    SELECT * FROM coin_transactions ORDER BY created_at DESC LIMIT ${limit}
  ` as any[];
  return rows.map(rowToTx);
}

function rowToTx(r: any): CoinTransaction {
  return {
    id: r.id,
    playerId: r.player_id,
    type: r.type as TxType,
    amount: Number(r.amount),
    balanceAfter: Number(r.balance_after),
    refId: r.ref_id ?? null,
    description: r.description ?? '',
    grantedBy: r.granted_by ?? null,
    createdAt: Number(r.created_at),
  };
}

// ── Gift Catalog ───────────────────────────────────────────────────────────

export async function getGiftCatalog(includeInactive = false): Promise<GiftCatalogItem[]> {
  const rows = includeInactive
    ? await sql`SELECT * FROM gift_catalog ORDER BY stars ASC, price ASC` as any[]
    : await sql`SELECT * FROM gift_catalog WHERE active = 1 ORDER BY stars ASC, price ASC` as any[];
  return rows.map(rowToGift);
}

export async function createGift(
  createdBy: string,
  data: { name: string; description?: string; icon: string; imageUrl?: string; rarity: string; stars: number; price: number },
): Promise<GiftCatalogItem> {
  if (!data.name?.trim()) throw new Error('Gift name required.');
  if (!Number.isInteger(data.price) || data.price < 0) throw new Error('Price must be a non-negative integer.');
  if (data.stars < 1 || data.stars > 5) throw new Error('Stars must be between 1 and 5.');
  const validRarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  if (!validRarities.includes(data.rarity)) throw new Error('Invalid rarity.');

  const id = 'gift_' + generateId().replace(/-/g, '').slice(0, 10);
  const now = Date.now();
  await sql`
    INSERT INTO gift_catalog (id, name, description, icon, image_url, rarity, stars, price, active, created_by, created_at, updated_at)
    VALUES (${id}, ${data.name.trim()}, ${data.description ?? ''}, ${data.icon || '🎁'},
            ${data.imageUrl ?? ''}, ${data.rarity}, ${data.stars}, ${data.price}, 1, ${createdBy}, ${now}, ${now})
  `;
  const [row] = await sql`SELECT * FROM gift_catalog WHERE id = ${id}` as any[];
  return rowToGift(row);
}

export async function updateGift(
  giftId: string,
  data: Partial<{ name: string; description: string; icon: string; imageUrl: string; rarity: string; stars: number; price: number; active: boolean }>,
): Promise<GiftCatalogItem> {
  const [ex] = await sql`SELECT * FROM gift_catalog WHERE id = ${giftId}` as any[];
  if (!ex) throw new Error('Gift not found.');

  const name        = data.name        !== undefined ? data.name.trim()       : ex.name;
  const description = data.description !== undefined ? data.description       : ex.description;
  const icon        = data.icon        !== undefined ? data.icon              : ex.icon;
  const imageUrl    = data.imageUrl    !== undefined ? data.imageUrl          : ex.image_url;
  const rarity      = data.rarity      !== undefined ? data.rarity           : ex.rarity;
  const stars       = data.stars       !== undefined ? data.stars            : Number(ex.stars);
  const price       = data.price       !== undefined ? data.price            : Number(ex.price);
  const active      = data.active      !== undefined ? (data.active ? 1 : 0) : Number(ex.active);

  await sql`
    UPDATE gift_catalog
    SET name = ${name}, description = ${description}, icon = ${icon}, image_url = ${imageUrl},
        rarity = ${rarity}, stars = ${stars}, price = ${price}, active = ${active}, updated_at = ${Date.now()}
    WHERE id = ${giftId}
  `;
  const [row] = await sql`SELECT * FROM gift_catalog WHERE id = ${giftId}` as any[];
  return rowToGift(row);
}

function rowToGift(r: any): GiftCatalogItem {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    icon: r.icon ?? '🎁',
    imageUrl: r.image_url ?? '',
    rarity: r.rarity as GiftCatalogItem['rarity'],
    stars: Number(r.stars),
    price: Number(r.price),
    active: Number(r.active) === 1,
    createdBy: r.created_by ?? 'system',
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

// ── Send Gift ──────────────────────────────────────────────────────────────

export async function sendGift(
  senderId: string,
  recipientId: string,
  giftId: string,
  message: string,
): Promise<{ newSenderBalance: number; giftEntry: PlayerGift }> {
  if (senderId === recipientId) throw new Error('Cannot send a gift to yourself.');

  const [giftRow] = await sql`SELECT * FROM gift_catalog WHERE id = ${giftId} AND active = 1` as any[];
  if (!giftRow) throw new Error('Gift not found or unavailable.');

  const [senderRow] = await sql`SELECT coins, username, avatar, avatar_url FROM players WHERE id = ${senderId}` as any[];
  if (!senderRow) throw new Error('Sender not found.');

  const senderCoins = Number(senderRow.coins);
  const giftPrice   = Number(giftRow.price);
  if (senderCoins < giftPrice) {
    throw new Error(`Not enough coins. You need ${giftPrice} but have ${senderCoins}.`);
  }

  const { id: txId, balanceAfter: newSenderBalance } = await recordTransaction(
    senderId, 'gift_sent', -giftPrice,
    `Sent gift: ${giftRow.name}`,
    { refId: giftId },
  );

  const giftEntryId = generateId();
  const now = Date.now();
  await sql`
    INSERT INTO player_gifts (id, recipient_id, sender_id, gift_id, message, transaction_id, created_at)
    VALUES (${giftEntryId}, ${recipientId}, ${senderId}, ${giftId},
            ${message.slice(0, 200)}, ${txId}, ${now})
  `;

  const giftEntry: PlayerGift = {
    id: giftEntryId,
    recipientId,
    senderId,
    senderUsername: senderRow.username,
    senderAvatar: senderRow.avatar ?? '',
    senderAvatarUrl: senderRow.avatar_url ?? null,
    giftId,
    giftName: giftRow.name,
    giftIcon: giftRow.icon,
    giftRarity: giftRow.rarity,
    giftStars: Number(giftRow.stars),
    message: message.slice(0, 200),
    transactionId: txId,
    createdAt: now,
  };

  return { newSenderBalance, giftEntry };
}

export async function getPlayerGifts(recipientId: string): Promise<PlayerGift[]> {
  const rows = await sql`
    SELECT
      pg.id, pg.recipient_id, pg.sender_id, pg.gift_id, pg.message, pg.transaction_id, pg.created_at,
      p.username  AS sender_username,
      p.avatar    AS sender_avatar,
      p.avatar_url AS sender_avatar_url,
      gc.name     AS gift_name,
      gc.icon     AS gift_icon,
      gc.rarity   AS gift_rarity,
      gc.stars    AS gift_stars
    FROM player_gifts pg
    JOIN players p      ON p.id   = pg.sender_id
    JOIN gift_catalog gc ON gc.id = pg.gift_id
    WHERE pg.recipient_id = ${recipientId}
    ORDER BY pg.created_at DESC
    LIMIT 200
  ` as any[];
  return rows.map(r => ({
    id: r.id,
    recipientId: r.recipient_id,
    senderId: r.sender_id,
    senderUsername: r.sender_username,
    senderAvatar: r.sender_avatar ?? '',
    senderAvatarUrl: r.sender_avatar_url ?? null,
    giftId: r.gift_id,
    giftName: r.gift_name,
    giftIcon: r.gift_icon,
    giftRarity: r.gift_rarity,
    giftStars: Number(r.gift_stars),
    message: r.message ?? '',
    transactionId: r.transaction_id,
    createdAt: Number(r.created_at),
  }));
}

export async function getGiftDetail(giftId: string, recipientId: string): Promise<GiftDetail | null> {
  const [giftRow] = await sql`SELECT * FROM gift_catalog WHERE id = ${giftId}` as any[];
  if (!giftRow) return null;

  const senderRows = await sql`
    SELECT pg.sender_id, pg.message, pg.created_at,
           p.username  AS sender_username,
           p.avatar    AS sender_avatar,
           p.avatar_url AS sender_avatar_url
    FROM player_gifts pg
    JOIN players p ON p.id = pg.sender_id
    WHERE pg.gift_id = ${giftId} AND pg.recipient_id = ${recipientId}
    ORDER BY pg.created_at DESC
  ` as any[];

  return {
    ...rowToGift(giftRow),
    totalSent: senderRows.length,
    senders: senderRows.map(r => ({
      senderId: r.sender_id,
      senderUsername: r.sender_username,
      senderAvatar: r.sender_avatar ?? '',
      senderAvatarUrl: r.sender_avatar_url ?? null,
      message: r.message ?? '',
      sentAt: Number(r.created_at),
    })),
  };
}
