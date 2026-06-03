import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';
export async function getOrCreateConversation(userId1, userId2) {
    // Normalize so participant1 < participant2 alphabetically
    const [p1, p2] = [userId1, userId2].sort();
    const [existing] = await sql `
    SELECT * FROM conversations WHERE participant1 = ${p1} AND participant2 = ${p2}
  `;
    if (existing)
        return rowToConversation(existing, userId1);
    const id = generateId();
    const now = Date.now();
    await sql `
    INSERT INTO conversations (id, participant1, participant2, created_at)
    VALUES (${id}, ${p1}, ${p2}, ${now})
    ON CONFLICT DO NOTHING
  `;
    const [row] = await sql `SELECT * FROM conversations WHERE id = ${id}`;
    return rowToConversation(row, userId1);
}
function rowToConversation(row, viewerId) {
    const isParticipant1 = row.participant1 === viewerId;
    return {
        id: row.id,
        participant1: row.participant1,
        participant2: row.participant2,
        lastMessage: row.last_message ?? null,
        lastMessageAt: row.last_message_at ? Number(row.last_message_at) : null,
        unreadBy1: row.unread_by1 === 1 || row.unread_by1 === true,
        unreadBy2: row.unread_by2 === 1 || row.unread_by2 === true,
        createdAt: Number(row.created_at),
        unreadCount: isParticipant1
            ? (row.unread_by1 === 1 || row.unread_by1 === true ? 1 : 0)
            : (row.unread_by2 === 1 || row.unread_by2 === true ? 1 : 0),
    };
}
export async function listConversations(userId) {
    const rows = await sql `
    SELECT c.*,
      CASE WHEN c.participant1 = ${userId} THEN c.participant2 ELSE c.participant1 END as other_id,
      p.username as other_username, p.avatar as other_avatar,
      p.avatar_url as other_avatar_url
    FROM conversations c
    JOIN players p ON p.id = (
      CASE WHEN c.participant1 = ${userId} THEN c.participant2 ELSE c.participant1 END
    )
    WHERE c.participant1 = ${userId} OR c.participant2 = ${userId}
    ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
    LIMIT 50
  `;
    return rows.map((r) => ({
        id: r.id,
        otherUserId: r.other_id,
        otherUsername: r.other_username,
        otherAvatar: r.other_avatar,
        otherAvatarUrl: r.other_avatar_url ?? null,
        lastMessage: r.last_message ?? null,
        lastMessageAt: r.last_message_at ? Number(r.last_message_at) : null,
        unread: r.participant1 === userId
            ? (r.unread_by1 === 1 || r.unread_by1 === true)
            : (r.unread_by2 === 1 || r.unread_by2 === true),
        createdAt: Number(r.created_at),
    }));
}
export async function sendMessage(conversationId, senderId, text, receiverId) {
    if (text.length > 500)
        throw new Error('Message too long (max 500 characters).');
    const id = generateId();
    const now = Date.now();
    await sql `
    INSERT INTO direct_messages (id, conversation_id, sender_id, text, created_at)
    VALUES (${id}, ${conversationId}, ${senderId}, ${text}, ${now})
  `;
    // Determine which unread flag to set
    const [conv] = await sql `SELECT * FROM conversations WHERE id = ${conversationId}`;
    const isParticipant1 = conv.participant1 === senderId;
    if (isParticipant1) {
        await sql `UPDATE conversations SET last_message = ${text}, last_message_at = ${now}, unread_by2 = 1 WHERE id = ${conversationId}`;
    }
    else {
        await sql `UPDATE conversations SET last_message = ${text}, last_message_at = ${now}, unread_by1 = 1 WHERE id = ${conversationId}`;
    }
    return { id, conversationId, senderId, text, createdAt: now, readAt: null };
}
export async function getMessages(conversationId, limit = 50) {
    const rows = await sql `
    SELECT * FROM direct_messages WHERE conversation_id = ${conversationId}
    ORDER BY created_at DESC LIMIT ${limit}
  `;
    return rows.reverse().map((r) => ({
        id: r.id, conversationId: r.conversation_id, senderId: r.sender_id,
        text: r.text, createdAt: Number(r.created_at),
        readAt: r.read_at ? Number(r.read_at) : null,
    }));
}
export async function markRead(conversationId, userId) {
    const [conv] = await sql `SELECT * FROM conversations WHERE id = ${conversationId}`;
    if (!conv)
        return;
    if (conv.participant1 === userId) {
        await sql `UPDATE conversations SET unread_by1 = 0 WHERE id = ${conversationId}`;
    }
    else {
        await sql `UPDATE conversations SET unread_by2 = 0 WHERE id = ${conversationId}`;
    }
}
export async function getTotalUnread(userId) {
    const [row] = await sql `
    SELECT COUNT(*) as c FROM conversations
    WHERE (participant1 = ${userId} AND unread_by1 = 1)
       OR (participant2 = ${userId} AND unread_by2 = 1)
  `;
    return Number(row?.c ?? 0);
}
//# sourceMappingURL=dmService.js.map