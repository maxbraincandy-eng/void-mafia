// Ganab Simulator — global coronation hall of fame.
// Records every player who reached "kanonieri" (won the game) so the roster
// is visible to everyone, not just on the device that earned it.
import { randomBytes } from 'crypto';
import { sql } from '../db.js';
/** Record a coronation. Deduped: one row per (player, nickname) is kept fresh. */
export async function addCrown(playerId, rawNickname) {
    const nickname = String(rawNickname ?? '').trim().slice(0, 18);
    if (!nickname || !playerId)
        return;
    // Avoid spam: if this player already crowned this exact nickname, skip.
    const existing = await sql `
    SELECT id FROM ganab_crowned WHERE player_id = ${playerId} AND nickname = ${nickname} LIMIT 1
  `;
    if (existing.length > 0)
        return;
    const id = `crown_${Date.now()}_${randomBytes(3).toString('hex')}`;
    await sql `
    INSERT INTO ganab_crowned (id, player_id, nickname, created_at)
    VALUES (${id}, ${playerId}, ${nickname}, ${Date.now()})
  `;
}
export async function listCrowned(limit = 60) {
    const rows = await sql `
    SELECT nickname, created_at FROM ganab_crowned ORDER BY created_at DESC LIMIT ${limit}
  `;
    return rows.map(r => ({ nickname: r.nickname, createdAt: Number(r.created_at) }));
}
//# sourceMappingURL=ganabService.js.map