import { sql } from '../db.js';
import { grantCoins } from './coinService.js';
import { getPlayerByFriendCode } from './playerService.js';
import { randomUUID } from 'crypto';
export async function applyReferral(referredId, referralCode) {
    if (!referralCode || !referredId)
        return false;
    try {
        // Check if this player was already referred
        const [existing] = await sql `SELECT id FROM referrals WHERE referred_id = ${referredId}`;
        if (existing)
            return false;
        // Find referrer by friend code
        const referrer = await getPlayerByFriendCode(referralCode.toUpperCase());
        if (!referrer || referrer.id === referredId)
            return false;
        // Record referral
        await sql `
      INSERT INTO referrals (id, referrer_id, referred_id, coins_granted, created_at)
      VALUES (${randomUUID()}, ${referrer.id}, ${referredId}, true, ${Date.now()})
    `;
        // Grant coins to both
        await Promise.all([
            grantCoins('system', referrer.id, 250, `Referral bonus — invited a new player`),
            grantCoins('system', referredId, 250, `Referral bonus — joined via invite link`),
        ]);
        return true;
    }
    catch {
        return false;
    }
}
export async function getReferralCount(playerId) {
    const [row] = await sql `SELECT COUNT(*) as cnt FROM referrals WHERE referrer_id = ${playerId}`;
    return Number(row?.cnt ?? 0);
}
//# sourceMappingURL=referralService.js.map