import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';
const DAILY_REWARD_COINS = 50;
export async function getCoins(playerId) {
    const [row] = await sql `SELECT coins FROM players WHERE id = ${playerId}`;
    return Number(row?.coins ?? 0);
}
async function recordTransaction(playerId, type, amount, description, opts = {}) {
    // Read before and after in one atomic statement
    const [row] = await sql `
    WITH before AS (SELECT coins, public_id FROM players WHERE id = ${playerId})
    UPDATE players
    SET coins = GREATEST(0, coins + ${amount})
    WHERE id = ${playerId}
    RETURNING coins AS balance_after,
              (SELECT coins FROM before) AS balance_before,
              (SELECT public_id FROM before) AS player_public_id
  `;
    const balanceBefore = Number(row.balance_before ?? 0);
    const balanceAfter = Number(row.balance_after);
    const playerPublicId = row.player_public_id != null ? Number(row.player_public_id) : null;
    const id = generateId();
    await sql `
    INSERT INTO coin_transactions
      (id, player_id, public_id, type, amount, balance_before, balance_after,
       related_user_id, related_gift_id, description, granted_by, created_at)
    VALUES
      (${id}, ${playerId}, ${playerPublicId}, ${type}, ${amount}, ${balanceBefore}, ${balanceAfter},
       ${opts.relatedUserId ?? null}, ${opts.relatedGiftId ?? null},
       ${description}, ${opts.grantedBy ?? null}, ${Date.now()})
  `;
    return { id, balanceBefore, balanceAfter };
}
export async function claimDailyReward(playerId) {
    const dateKey = new Date().toISOString().slice(0, 10);
    const existing = await sql `
    SELECT 1 FROM daily_coin_claims WHERE player_id = ${playerId} AND date_key = ${dateKey}
  `;
    if (existing.length > 0) {
        const balance = await getCoins(playerId);
        return { coins: 0, balance, alreadyClaimed: true };
    }
    const { balanceAfter } = await recordTransaction(playerId, 'daily_reward', DAILY_REWARD_COINS, 'Daily reward');
    await sql `
    INSERT INTO daily_coin_claims (player_id, date_key, coins_awarded, claimed_at)
    VALUES (${playerId}, ${dateKey}, ${DAILY_REWARD_COINS}, ${Date.now()})
    ON CONFLICT (player_id, date_key) DO NOTHING
  `;
    return { coins: DAILY_REWARD_COINS, balance: balanceAfter, alreadyClaimed: false };
}
export async function grantCoins(ownerId, targetId, amount, description) {
    if (!Number.isInteger(amount) || amount <= 0)
        throw new Error('Amount must be a positive integer.');
    if (amount > 100000)
        throw new Error('Amount too large (max 100,000).');
    const { balanceAfter } = await recordTransaction(targetId, 'grant', amount, description || 'Owner grant', { grantedBy: ownerId });
    return { newBalance: balanceAfter };
}
export async function deductCoins(ownerId, targetId, amount, description) {
    if (!Number.isInteger(amount) || amount <= 0)
        throw new Error('Amount must be a positive integer.');
    if (amount > 100000)
        throw new Error('Amount too large (max 100,000).');
    const { balanceAfter } = await recordTransaction(targetId, 'deduct', -amount, description || 'Owner deduction', { grantedBy: ownerId });
    return { newBalance: balanceAfter };
}
export async function refundGift(txId, ownerId) {
    const [tx] = await sql `SELECT * FROM coin_transactions WHERE id = ${txId}`;
    if (!tx)
        throw new Error('Transaction not found.');
    if (tx.type !== 'gift_sent')
        throw new Error('Only gift_sent transactions can be refunded.');
    const amount = Math.abs(Number(tx.amount));
    await recordTransaction(tx.player_id, 'refund', amount, `Refund for tx ${txId}`, { grantedBy: ownerId, relatedGiftId: txId });
}
export async function getTransactions(playerId, limit = 50) {
    const rows = await sql `
    SELECT * FROM coin_transactions WHERE player_id = ${playerId}
    ORDER BY created_at DESC LIMIT ${limit}
  `;
    return rows.map(rowToTx);
}
export async function getAllTransactions(limit = 200) {
    const rows = await sql `
    SELECT * FROM coin_transactions ORDER BY created_at DESC LIMIT ${limit}
  `;
    return rows.map(rowToTx);
}
function rowToTx(r) {
    return {
        id: r.id,
        playerId: r.player_id,
        publicId: r.public_id != null ? Number(r.public_id) : null,
        type: r.type,
        amount: Number(r.amount),
        balanceBefore: Number(r.balance_before ?? 0),
        balanceAfter: Number(r.balance_after),
        relatedUserId: r.related_user_id ?? null,
        relatedGiftId: r.related_gift_id ?? null,
        description: r.description ?? '',
        grantedBy: r.granted_by ?? null,
        createdAt: Number(r.created_at),
    };
}
// ── Gift Catalog ───────────────────────────────────────────────────────────
export async function getGiftCatalog(includeInactive = false) {
    const rows = includeInactive
        ? await sql `SELECT * FROM gift_catalog ORDER BY stars ASC, price ASC`
        : await sql `SELECT * FROM gift_catalog WHERE active = 1 ORDER BY stars ASC, price ASC`;
    return rows.map(rowToGift);
}
export async function createGift(createdBy, data) {
    if (!data.name?.trim())
        throw new Error('Gift name required.');
    if (!Number.isInteger(data.price) || data.price < 0)
        throw new Error('Price must be a non-negative integer.');
    if (data.stars < 1 || data.stars > 5)
        throw new Error('Stars must be between 1 and 5.');
    const validRarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    if (!validRarities.includes(data.rarity))
        throw new Error('Invalid rarity.');
    const id = 'gift_' + generateId().replace(/-/g, '').slice(0, 10);
    const now = Date.now();
    await sql `
    INSERT INTO gift_catalog (id, name, description, icon, image_url, rarity, stars, price, active, created_by, created_at, updated_at)
    VALUES (${id}, ${data.name.trim()}, ${data.description ?? ''}, ${data.icon || '🎁'},
            ${data.imageUrl ?? ''}, ${data.rarity}, ${data.stars}, ${data.price}, 1, ${createdBy}, ${now}, ${now})
  `;
    const [row] = await sql `SELECT * FROM gift_catalog WHERE id = ${id}`;
    return rowToGift(row);
}
export async function updateGift(giftId, data) {
    const [ex] = await sql `SELECT * FROM gift_catalog WHERE id = ${giftId}`;
    if (!ex)
        throw new Error('Gift not found.');
    const name = data.name !== undefined ? data.name.trim() : ex.name;
    const description = data.description !== undefined ? data.description : ex.description;
    const icon = data.icon !== undefined ? data.icon : ex.icon;
    const imageUrl = data.imageUrl !== undefined ? data.imageUrl : ex.image_url;
    const rarity = data.rarity !== undefined ? data.rarity : ex.rarity;
    const stars = data.stars !== undefined ? data.stars : Number(ex.stars);
    const price = data.price !== undefined ? data.price : Number(ex.price);
    const active = data.active !== undefined ? (data.active ? 1 : 0) : Number(ex.active);
    await sql `
    UPDATE gift_catalog
    SET name = ${name}, description = ${description}, icon = ${icon}, image_url = ${imageUrl},
        rarity = ${rarity}, stars = ${stars}, price = ${price}, active = ${active}, updated_at = ${Date.now()}
    WHERE id = ${giftId}
  `;
    const [row] = await sql `SELECT * FROM gift_catalog WHERE id = ${giftId}`;
    return rowToGift(row);
}
function rowToGift(r) {
    return {
        id: r.id,
        name: r.name,
        description: r.description ?? '',
        icon: r.icon ?? '🎁',
        imageUrl: r.image_url ?? '',
        rarity: r.rarity,
        stars: Number(r.stars),
        price: Number(r.price),
        active: Number(r.active) === 1,
        createdBy: r.created_by ?? 'system',
        createdAt: Number(r.created_at),
        updatedAt: Number(r.updated_at),
    };
}
// ── Send Gift ──────────────────────────────────────────────────────────────
export async function sendGift(senderId, recipientId, giftId, message) {
    if (senderId === recipientId)
        throw new Error('Cannot send a gift to yourself.');
    const [giftRow] = await sql `SELECT * FROM gift_catalog WHERE id = ${giftId} AND active = 1`;
    if (!giftRow)
        throw new Error('Gift not found or unavailable.');
    const [[senderRow], [recipientRow]] = await Promise.all([
        sql `SELECT coins, username, avatar, avatar_url, public_id FROM players WHERE id = ${senderId}`,
        sql `SELECT username, public_id FROM players WHERE id = ${recipientId}`,
    ]);
    if (!senderRow)
        throw new Error('Sender not found.');
    if (!recipientRow)
        throw new Error('Recipient not found.');
    const senderCoins = Number(senderRow.coins);
    const giftPrice = Number(giftRow.price);
    if (senderCoins < giftPrice) {
        throw new Error(`Not enough coins. You need ${giftPrice} but have ${senderCoins}.`);
    }
    const { id: txId, balanceAfter: newSenderBalance } = await recordTransaction(senderId, 'gift_sent', -giftPrice, `Sent gift: ${giftRow.name} → ${recipientRow.username}`, { relatedUserId: recipientId, relatedGiftId: giftId });
    const senderPublicId = senderRow.public_id != null ? Number(senderRow.public_id) : null;
    const receiverPublicId = recipientRow.public_id != null ? Number(recipientRow.public_id) : null;
    const giftImageUrl = giftRow.image_url ?? '';
    const giftEntryId = generateId();
    const now = Date.now();
    await sql `
    INSERT INTO player_gifts
      (id, recipient_id, sender_id, gift_id, message, transaction_id, created_at,
       sender_public_id, sender_name, receiver_public_id, receiver_name,
       gift_key, gift_image_url, coin_cost)
    VALUES
      (${giftEntryId}, ${recipientId}, ${senderId}, ${giftId},
       ${message.slice(0, 200)}, ${txId}, ${now},
       ${senderPublicId}, ${senderRow.username},
       ${receiverPublicId}, ${recipientRow.username},
       ${giftId}, ${giftImageUrl}, ${giftPrice})
  `;
    const giftEntry = {
        id: giftEntryId,
        recipientId,
        receiverPublicId,
        receiverName: recipientRow.username,
        senderId,
        senderPublicId,
        senderUsername: senderRow.username,
        senderAvatar: senderRow.avatar ?? '',
        senderAvatarUrl: senderRow.avatar_url ?? null,
        giftId,
        giftKey: giftId,
        giftName: giftRow.name,
        giftIcon: giftRow.icon,
        giftImageUrl,
        giftRarity: giftRow.rarity,
        giftStars: Number(giftRow.stars),
        coinCost: giftPrice,
        message: message.slice(0, 200),
        transactionId: txId,
        createdAt: now,
    };
    return { newSenderBalance, giftEntry };
}
export async function getPlayerGifts(recipientId) {
    const rows = await sql `
    SELECT
      pg.id, pg.recipient_id, pg.sender_id, pg.gift_id, pg.message, pg.transaction_id, pg.created_at,
      pg.sender_public_id, pg.sender_name,
      pg.receiver_public_id, pg.receiver_name,
      pg.gift_key, pg.gift_image_url, pg.coin_cost,
      p.avatar     AS sender_avatar,
      p.avatar_url AS sender_avatar_url,
      COALESCE(pg.sender_name, p.username)  AS sender_username,
      gc.name      AS gift_name,
      gc.icon      AS gift_icon,
      gc.rarity    AS gift_rarity,
      gc.stars     AS gift_stars,
      COALESCE(gc.image_url, '') AS gift_img
    FROM player_gifts pg
    JOIN players p       ON p.id   = pg.sender_id
    JOIN gift_catalog gc ON gc.id  = pg.gift_id
    WHERE pg.recipient_id = ${recipientId}
    ORDER BY pg.created_at DESC
    LIMIT 200
  `;
    return rows.map(r => ({
        id: r.id,
        recipientId: r.recipient_id,
        receiverPublicId: r.receiver_public_id != null ? Number(r.receiver_public_id) : null,
        receiverName: r.receiver_name ?? '',
        senderId: r.sender_id,
        senderPublicId: r.sender_public_id != null ? Number(r.sender_public_id) : null,
        senderUsername: r.sender_username ?? '',
        senderAvatar: r.sender_avatar ?? '',
        senderAvatarUrl: r.sender_avatar_url ?? null,
        giftId: r.gift_id,
        giftKey: r.gift_key ?? r.gift_id,
        giftName: r.gift_name,
        giftIcon: r.gift_icon,
        giftImageUrl: r.gift_img ?? '',
        giftRarity: r.gift_rarity,
        giftStars: Number(r.gift_stars),
        coinCost: r.coin_cost != null ? Number(r.coin_cost) : 0,
        message: r.message ?? '',
        transactionId: r.transaction_id,
        createdAt: Number(r.created_at),
    }));
}
export async function getGiftDetail(giftId, recipientId) {
    const [giftRow] = await sql `SELECT * FROM gift_catalog WHERE id = ${giftId}`;
    if (!giftRow)
        return null;
    const senderRows = await sql `
    SELECT pg.sender_id, pg.message, pg.created_at,
           p.username  AS sender_username,
           p.avatar    AS sender_avatar,
           p.avatar_url AS sender_avatar_url
    FROM player_gifts pg
    JOIN players p ON p.id = pg.sender_id
    WHERE pg.gift_id = ${giftId} AND pg.recipient_id = ${recipientId}
    ORDER BY pg.created_at DESC
  `;
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
//# sourceMappingURL=coinService.js.map