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
    if (!row)
        throw new Error('Player record not found — cannot update coins.');
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
// ── Cosmetic Item Purchases ──────────────────────────────────────────
// Background items and their prices (keep in sync with client/src/constants/cosmetics.ts)
const PURCHASABLE_COSMETICS = {
    bg_neon_city: { name: 'Neon City', price: 500 },
    bg_blood: { name: 'Blood Moon', price: 500 },
    bg_ocean: { name: 'Deep Ocean', price: 500 },
    bg_matrix: { name: 'Matrix', price: 1000 },
    bg_aurora: { name: 'Aurora', price: 1000 },
    bg_gold: { name: 'Gold Rush', price: 2000 },
    bg_crimson: { name: 'Crimson King', price: 2000 },
    // Virtual Space avatar cosmetics (hats / pets / forms)
    sp_hat_party: { name: 'Party Hat', price: 500 },
    sp_hat_crown: { name: 'Crown', price: 800 },
    sp_hat_halo: { name: 'Halo', price: 800 },
    sp_pet_fish2: { name: 'Tropical Fish', price: 400 },
    sp_pet_chick: { name: 'Chick', price: 400 },
    sp_pet_bot: { name: 'Bot Companion', price: 600 },
    sp_pet_star: { name: 'Star Companion', price: 600 },
    sp_form_car: { name: 'Sedan Avatar', price: 1500 },
    // Name colors (display-name colors, applied app-wide; keep in sync with NAME_COLORS)
    nc_pink: { name: 'Neon Pink', price: 400 },
    nc_green: { name: 'Neon Green', price: 400 },
    nc_orange: { name: 'Flame Orange', price: 800 },
    nc_red: { name: 'Blood Red', price: 800 },
    nc_gold: { name: 'Gold', price: 1500 },
    nc_white: { name: 'Pure White', price: 2500 },
    // Virtual Space visual themes (keep in sync with client SPACE_THEME_DEFS)
    sp_theme_neon: { name: 'Neon Theme', price: 600 },
    sp_theme_cyber: { name: 'Cyber Theme', price: 800 },
    sp_theme_sunset: { name: 'Sunset Theme', price: 800 },
    sp_theme_mono: { name: 'Mono Theme', price: 600 },
    sp_theme_blood: { name: 'Blood Moon Theme', price: 1200 },
    sp_theme_gold: { name: 'Golden Throne Theme', price: 2000 },
};
export async function purchaseCosmeticItem(playerId, itemId) {
    const item = PURCHASABLE_COSMETICS[itemId];
    if (!item)
        throw new Error('Item not available for purchase.');
    const balance = await getCoins(playerId);
    if (balance < item.price)
        throw new Error(`Not enough coins. Need ${item.price}, have ${balance}.`);
    const { balanceAfter } = await recordTransaction(playerId, 'deduct', -item.price, `Purchased cosmetic: ${item.name}`);
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
    const season = currentSeasonTag();
    return rows.map((r) => ({
        ...rowToGift(r),
        isCurrentSeason: r.seasonal_tag !== null && r.seasonal_tag === season,
    }));
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
    const seasonalTag = data.seasonalTag ?? null;
    const limitedEdition = data.limitedEdition ? 1 : 0;
    await sql `
    INSERT INTO gift_catalog (id, name, description, icon, image_url, rarity, stars, price, active, seasonal_tag, limited_edition, created_by, created_at, updated_at)
    VALUES (${id}, ${data.name.trim()}, ${data.description ?? ''}, ${data.icon || '🎁'},
            ${data.imageUrl ?? ''}, ${data.rarity}, ${data.stars}, ${data.price}, 1,
            ${seasonalTag}, ${limitedEdition}, ${createdBy}, ${now}, ${now})
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
    const seasonalTag = data.seasonalTag !== undefined ? (data.seasonalTag ?? null) : (ex.seasonal_tag ?? null);
    const limitedEdition = data.limitedEdition !== undefined ? (data.limitedEdition ? 1 : 0) : Number(ex.limited_edition ?? 0);
    await sql `
    UPDATE gift_catalog
    SET name = ${name}, description = ${description}, icon = ${icon}, image_url = ${imageUrl},
        rarity = ${rarity}, stars = ${stars}, price = ${price}, active = ${active},
        seasonal_tag = ${seasonalTag}, limited_edition = ${limitedEdition}, updated_at = ${Date.now()}
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
        category: r.category ?? 'symbols',
        limitedEdition: Number(r.limited_edition ?? 0) === 1,
        seasonalTag: r.seasonal_tag ?? null,
        displayOrder: Number(r.display_order ?? 0),
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
    const safeMessage = message.slice(0, 120);
    await sql `
    INSERT INTO player_gifts
      (id, recipient_id, sender_id, gift_id, message, transaction_id, created_at,
       sender_public_id, sender_name, receiver_public_id, receiver_name,
       gift_key, gift_image_url, coin_cost, gift_rarity, gift_stars, gift_category)
    VALUES
      (${giftEntryId}, ${recipientId}, ${senderId}, ${giftId},
       ${safeMessage}, ${txId}, ${now},
       ${senderPublicId}, ${senderRow.username},
       ${receiverPublicId}, ${recipientRow.username},
       ${giftId}, ${giftImageUrl}, ${giftPrice},
       ${giftRow.rarity}, ${Number(giftRow.stars)}, ${giftRow.category ?? 'symbols'})
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
        message: safeMessage,
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
      AND pg.gift_id NOT IN (
        SELECT gift_id FROM hidden_gifts WHERE recipient_id = ${recipientId}
      )
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
export async function getGiftsSent(senderId, limit = 50) {
    const rows = await sql `
    SELECT
      pg.id, pg.recipient_id, pg.sender_id, pg.gift_id, pg.message, pg.transaction_id, pg.created_at,
      pg.sender_public_id, pg.sender_name,
      pg.receiver_public_id, pg.receiver_name,
      pg.gift_key, pg.gift_image_url, pg.coin_cost,
      p.avatar     AS sender_avatar,
      p.avatar_url AS sender_avatar_url,
      COALESCE(pg.sender_name, p.username) AS sender_username,
      gc.name      AS gift_name,
      gc.icon      AS gift_icon,
      gc.rarity    AS gift_rarity,
      gc.stars     AS gift_stars,
      COALESCE(gc.image_url, '') AS gift_img
    FROM player_gifts pg
    JOIN players p       ON p.id  = pg.sender_id
    JOIN gift_catalog gc ON gc.id = pg.gift_id
    WHERE pg.sender_id = ${senderId}
    ORDER BY pg.created_at DESC
    LIMIT ${limit}
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
export async function getGiftTimeline(playerId, limit = 30) {
    const rows = await sql `
    SELECT
      pg.id, pg.sender_id, pg.recipient_id, pg.message, pg.created_at,
      pg.sender_public_id, pg.sender_name,
      pg.receiver_public_id, pg.receiver_name,
      pg.gift_id, pg.gift_key, pg.gift_image_url, pg.coin_cost,
      s.avatar     AS sender_avatar,
      s.avatar_url AS sender_avatar_url,
      r.avatar     AS receiver_avatar,
      r.avatar_url AS receiver_avatar_url,
      gc.name   AS gift_name,
      gc.icon   AS gift_icon,
      gc.rarity AS gift_rarity,
      gc.stars  AS gift_stars
    FROM player_gifts pg
    JOIN players s       ON s.id  = pg.sender_id
    JOIN players r       ON r.id  = pg.recipient_id
    JOIN gift_catalog gc ON gc.id = pg.gift_id
    WHERE pg.sender_id = ${playerId} OR pg.recipient_id = ${playerId}
    ORDER BY pg.created_at DESC
    LIMIT ${limit}
  `;
    return rows.map(r => ({
        id: r.id,
        senderId: r.sender_id,
        senderPublicId: r.sender_public_id != null ? Number(r.sender_public_id) : null,
        senderName: r.sender_name ?? '',
        senderAvatar: r.sender_avatar ?? '',
        senderAvatarUrl: r.sender_avatar_url ?? null,
        recipientId: r.recipient_id,
        receiverPublicId: r.receiver_public_id != null ? Number(r.receiver_public_id) : null,
        receiverName: r.receiver_name ?? '',
        receiverAvatar: r.receiver_avatar ?? '',
        receiverAvatarUrl: r.receiver_avatar_url ?? null,
        giftId: r.gift_id,
        giftName: r.gift_name,
        giftIcon: r.gift_icon,
        giftImageUrl: r.gift_image_url ?? '',
        giftRarity: r.gift_rarity,
        giftStars: Number(r.gift_stars),
        coinCost: r.coin_cost != null ? Number(r.coin_cost) : 0,
        message: r.message ?? '',
        createdAt: Number(r.created_at),
    }));
}
export async function getGiftStats(playerId) {
    const [receivedRow] = await sql `
    SELECT
      COUNT(*) AS total_received,
      COUNT(DISTINCT gift_id) AS unique_types_received
    FROM player_gifts WHERE recipient_id = ${playerId}
  `;
    const [sentRow] = await sql `
    SELECT
      COUNT(*) AS total_sent,
      COALESCE(SUM(coin_cost), 0) AS total_spent,
      COUNT(DISTINCT gift_id) AS unique_types_sent
    FROM player_gifts WHERE sender_id = ${playerId}
  `;
    const [legendaryRow] = await sql `
    SELECT COUNT(*) AS cnt
    FROM player_gifts pg
    JOIN gift_catalog gc ON gc.id = pg.gift_id
    WHERE pg.recipient_id = ${playerId} AND gc.rarity = 'legendary'
  `;
    const mostReceivedRows = await sql `
    SELECT gc.name, COUNT(*) AS cnt
    FROM player_gifts pg
    JOIN gift_catalog gc ON gc.id = pg.gift_id
    WHERE pg.recipient_id = ${playerId}
    GROUP BY gc.name
    ORDER BY cnt DESC
    LIMIT 1
  `;
    const mostSentRows = await sql `
    SELECT gc.name, COUNT(*) AS cnt
    FROM player_gifts pg
    JOIN gift_catalog gc ON gc.id = pg.gift_id
    WHERE pg.sender_id = ${playerId}
    GROUP BY gc.name
    ORDER BY cnt DESC
    LIMIT 1
  `;
    return {
        totalReceived: Number(receivedRow?.total_received ?? 0),
        totalSent: Number(sentRow?.total_sent ?? 0),
        totalSpent: Number(sentRow?.total_spent ?? 0),
        uniqueGiftTypesReceived: Number(receivedRow?.unique_types_received ?? 0),
        uniqueGiftTypesSent: Number(sentRow?.unique_types_sent ?? 0),
        legendaryReceivedCount: Number(legendaryRow?.cnt ?? 0),
        mostReceivedGiftName: mostReceivedRows[0]?.name ?? null,
        mostSentGiftName: mostSentRows[0]?.name ?? null,
    };
}
export async function getPinnedGifts(playerId) {
    const rows = await sql `
    SELECT pg.gift_id, pg.pinned_at,
           gc.name      AS gift_name,
           gc.icon      AS gift_icon,
           gc.image_url AS gift_image_url,
           gc.rarity    AS gift_rarity,
           gc.stars     AS gift_stars
    FROM pinned_gifts pg
    JOIN gift_catalog gc ON gc.id = pg.gift_id
    WHERE pg.player_id = ${playerId}
    ORDER BY pg.pinned_at ASC
  `;
    return rows.map(r => ({
        giftId: r.gift_id,
        giftName: r.gift_name,
        giftIcon: r.gift_icon,
        giftImageUrl: r.gift_image_url ?? '',
        giftRarity: r.gift_rarity,
        giftStars: Number(r.gift_stars),
        pinnedAt: Number(r.pinned_at),
    }));
}
export async function pinGift(playerId, giftId) {
    const [received] = await sql `
    SELECT 1 FROM player_gifts WHERE recipient_id = ${playerId} AND gift_id = ${giftId} LIMIT 1
  `;
    if (!received)
        throw new Error('You have not received this gift.');
    const [countRow] = await sql `
    SELECT COUNT(*) AS cnt FROM pinned_gifts WHERE player_id = ${playerId}
  `;
    if (Number(countRow?.cnt ?? 0) >= 3)
        throw new Error('Maximum 3 gifts can be pinned. Unpin one first.');
    await sql `
    INSERT INTO pinned_gifts (player_id, gift_id, pinned_at)
    VALUES (${playerId}, ${giftId}, ${Date.now()})
    ON CONFLICT (player_id, gift_id) DO NOTHING
  `;
}
export async function unpinGift(playerId, giftId) {
    await sql `DELETE FROM pinned_gifts WHERE player_id = ${playerId} AND gift_id = ${giftId}`;
}
export async function hideGift(recipientId, giftId) {
    await sql `
    INSERT INTO hidden_gifts (recipient_id, gift_id, hidden_at)
    VALUES (${recipientId}, ${giftId}, ${Date.now()})
    ON CONFLICT (recipient_id, gift_id) DO NOTHING
  `;
    await sql `DELETE FROM pinned_gifts WHERE player_id = ${recipientId} AND gift_id = ${giftId}`;
}
export async function unhideGift(recipientId, giftId) {
    await sql `DELETE FROM hidden_gifts WHERE recipient_id = ${recipientId} AND gift_id = ${giftId}`;
}
export async function getHiddenGifts(recipientId) {
    const rows = await sql `
    SELECT DISTINCT ON (hg.gift_id)
      pg.id, pg.recipient_id, pg.sender_id, pg.gift_id, pg.message, pg.transaction_id, pg.created_at,
      pg.sender_public_id, pg.sender_name,
      pg.receiver_public_id, pg.receiver_name,
      pg.gift_key, pg.gift_image_url, pg.coin_cost,
      p.avatar     AS sender_avatar,
      p.avatar_url AS sender_avatar_url,
      COALESCE(pg.sender_name, p.username) AS sender_username,
      gc.name      AS gift_name,
      gc.icon      AS gift_icon,
      gc.rarity    AS gift_rarity,
      gc.stars     AS gift_stars,
      COALESCE(gc.image_url, '') AS gift_img
    FROM hidden_gifts hg
    JOIN player_gifts pg ON pg.gift_id = hg.gift_id AND pg.recipient_id = hg.recipient_id
    JOIN players p       ON p.id   = pg.sender_id
    JOIN gift_catalog gc ON gc.id  = pg.gift_id
    WHERE hg.recipient_id = ${recipientId}
    ORDER BY hg.gift_id, pg.created_at DESC
    LIMIT 100
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
export function currentSeasonTag() {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const day = now.getDate();
    if (month === 12 || (month === 1 && day <= 7))
        return 'christmas';
    if (month === 10 && day >= 25 || month === 11 && day <= 3)
        return 'halloween';
    if (month === 2 && day <= 14)
        return 'valentines';
    if (month === 3 && day >= 17 && day <= 20)
        return 'spring';
    if (month === 6 || month === 7)
        return 'summer';
    return null;
}
export async function creditPurchasedCoins(profileId, amount, description) {
    if (!Number.isInteger(amount) || amount <= 0)
        throw new Error('Amount must be a positive integer.');
    const { balanceAfter } = await recordTransaction(profileId, 'grant', amount, description);
    return { newBalance: balanceAfter };
}
export async function getGiftLeaderboard() {
    // Top 10 gifters by coins spent
    const giftersRows = await sql `
    SELECT pg.sender_id AS profile_id,
           pg.sender_name AS username,
           COALESCE(p.avatar, '🎭') AS avatar,
           p.avatar_url,
           SUM(pg.coin_cost)::int AS total_spent,
           COUNT(*)::int AS gift_count
    FROM player_gifts pg
    LEFT JOIN players p ON p.id = pg.sender_id
    WHERE pg.sender_id IS NOT NULL
    GROUP BY pg.sender_id, pg.sender_name, p.avatar, p.avatar_url
    ORDER BY total_spent DESC
    LIMIT 10
  `;
    // Top 10 recipients by coins received
    const recipientsRows = await sql `
    SELECT pg.recipient_id AS profile_id,
           pg.receiver_name AS username,
           COALESCE(p.avatar, '🎭') AS avatar,
           p.avatar_url,
           SUM(pg.coin_cost)::int AS total_received,
           COUNT(*)::int AS gift_count
    FROM player_gifts pg
    LEFT JOIN players p ON p.id = pg.recipient_id
    WHERE pg.recipient_id IS NOT NULL
    GROUP BY pg.recipient_id, pg.receiver_name, p.avatar, p.avatar_url
    ORDER BY total_received DESC
    LIMIT 10
  `;
    return {
        topGifters: giftersRows.map((r) => ({
            profileId: r.profile_id,
            username: r.username,
            avatar: r.avatar,
            avatarUrl: r.avatar_url ?? null,
            totalSpent: r.total_spent,
            giftCount: r.gift_count,
        })),
        topRecipients: recipientsRows.map((r) => ({
            profileId: r.profile_id,
            username: r.username,
            avatar: r.avatar,
            avatarUrl: r.avatar_url ?? null,
            totalReceived: r.total_received,
            giftCount: r.gift_count,
        })),
    };
}
//# sourceMappingURL=coinService.js.map