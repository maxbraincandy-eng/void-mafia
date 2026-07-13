import { sql } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
const dailyUsage = new Map();
const FREE_LIMIT = parseInt(process.env.HERMES_DAILY_LIMIT_FREE ?? '20', 10);
const PREMIUM_LIMIT = parseInt(process.env.HERMES_DAILY_LIMIT_PREMIUM ?? '200', 10);
const OWNER_IDS = new Set((process.env.OWNER_IDS ?? '').split(',').filter(Boolean));
function todayKey() {
    return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}
export function checkRateLimit(_userId) {
    // No per-user cap — Hermes is unlimited for everyone (owner's decision).
    // (Usage is still counted below for stats; the only real ceiling is the
    // upstream provider's own daily quota, which we don't control.)
    void FREE_LIMIT;
    void PREMIUM_LIMIT;
    void OWNER_IDS;
    void dailyUsage;
    return { allowed: true, remaining: 999999 };
}
export function incrementUsage(userId) {
    const today = todayKey();
    const entry = dailyUsage.get(userId);
    if (!entry || entry.dateKey !== today) {
        dailyUsage.set(userId, { count: 1, dateKey: today });
    }
    else {
        entry.count += 1;
    }
}
// ── Chat history (DB) ─────────────────────────────────────────────────────────
export async function getOrCreateConversation(userId, mode) {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const rows = await sql `
    SELECT id FROM hermes_conversations
    WHERE user_id = ${userId} AND mode = ${mode} AND created_at > ${since}
    ORDER BY updated_at DESC
    LIMIT 1
  `;
    if (rows.length > 0)
        return rows[0].id;
    const id = uuidv4();
    const now = Date.now();
    await sql `
    INSERT INTO hermes_conversations (id, user_id, title, mode, created_at, updated_at)
    VALUES (${id}, ${userId}, ${''}, ${mode}, ${now}, ${now})
  `;
    return id;
}
export async function getRecentMessages(conversationId, limit = 20) {
    const rows = await sql `
    SELECT role, content FROM hermes_messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
    return rows.reverse(); // oldest-first for the AI
}
export async function saveMessage(conversationId, role, content) {
    const id = uuidv4();
    const now = Date.now();
    await sql `
    INSERT INTO hermes_messages (id, conversation_id, role, content, created_at)
    VALUES (${id}, ${conversationId}, ${role}, ${content}, ${now})
  `;
    await sql `
    UPDATE hermes_conversations SET updated_at = ${now} WHERE id = ${conversationId}
  `;
}
export async function clearUserHistory(userId) {
    await sql `
    DELETE FROM hermes_conversations WHERE user_id = ${userId}
  `;
}
//# sourceMappingURL=hermesService.js.map