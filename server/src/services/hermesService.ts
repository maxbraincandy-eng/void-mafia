import { sql } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

// ── Rate limiting (in-memory per-day counts) ──────────────────────────────────

interface DailyCount { count: number; dateKey: string; }
const dailyUsage = new Map<string, DailyCount>();

const FREE_LIMIT    = parseInt(process.env.HERMES_DAILY_LIMIT_FREE    ?? '20',  10);
const PREMIUM_LIMIT = parseInt(process.env.HERMES_DAILY_LIMIT_PREMIUM ?? '200', 10);
const OWNER_IDS     = new Set((process.env.OWNER_IDS ?? '').split(',').filter(Boolean));

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

export function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
  if (OWNER_IDS.has(userId)) return { allowed: true, remaining: 9999 };

  const today = todayKey();
  const entry = dailyUsage.get(userId);
  const limit = FREE_LIMIT; // TODO: check premium status from DB

  if (!entry || entry.dateKey !== today) {
    return { allowed: true, remaining: limit };
  }
  const remaining = Math.max(0, limit - entry.count);
  return { allowed: entry.count < limit, remaining };
}

export function incrementUsage(userId: string): void {
  const today = todayKey();
  const entry = dailyUsage.get(userId);
  if (!entry || entry.dateKey !== today) {
    dailyUsage.set(userId, { count: 1, dateKey: today });
  } else {
    entry.count += 1;
  }
}

// ── Chat history (DB) ─────────────────────────────────────────────────────────

export async function getOrCreateConversation(userId: string, mode: string): Promise<string> {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM hermes_conversations
    WHERE user_id = ${userId} AND mode = ${mode} AND created_at > ${since}
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  if (rows.length > 0) return rows[0]!.id;

  const id = uuidv4();
  const now = Date.now();
  await sql`
    INSERT INTO hermes_conversations (id, user_id, title, mode, created_at, updated_at)
    VALUES (${id}, ${userId}, ${''}, ${mode}, ${now}, ${now})
  `;
  return id;
}

export async function getRecentMessages(conversationId: string, limit = 20): Promise<Array<{ role: string; content: string }>> {
  const rows = await sql<{ role: string; content: string }[]>`
    SELECT role, content FROM hermes_messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.reverse(); // oldest-first for the AI
}

export async function saveMessage(conversationId: string, role: 'user' | 'assistant', content: string): Promise<void> {
  const id  = uuidv4();
  const now = Date.now();
  await sql`
    INSERT INTO hermes_messages (id, conversation_id, role, content, created_at)
    VALUES (${id}, ${conversationId}, ${role}, ${content}, ${now})
  `;
  await sql`
    UPDATE hermes_conversations SET updated_at = ${now} WHERE id = ${conversationId}
  `;
}

export async function clearUserHistory(userId: string): Promise<void> {
  await sql`
    DELETE FROM hermes_conversations WHERE user_id = ${userId}
  `;
}
