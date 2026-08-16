import { sql } from '../db.js';
import { generateId } from '../utils/helpers.js';

export interface Conversation {
  id: string;
  participant1: string;
  participant2: string;
  lastMessage: string | null;
  lastMessageAt: number | null;
  unreadBy1: boolean;
  unreadBy2: boolean;
  createdAt: number;
  otherUserId?: string;
  otherUsername?: string;
  otherAvatar?: string;
  unreadCount?: number;
}

export type DmType = 'text' | 'voice' | 'image' | 'sticker' | 'invite' | 'call';

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  type?: DmType;
  audioDuration?: number;
  /** Which voice effect was used, when the sender changed their voice. */
  audioFx?: string | null;
  replyToId?: string | null;
  viewOnce?: boolean;
  viewedAt?: number | null;
  /** reactorId → emoji */
  reactions?: Record<string, string>;
  createdAt: number;
  readAt: number | null;
}

export async function getOrCreateConversation(userId1: string, userId2: string): Promise<Conversation> {
  // Normalize so participant1 < participant2 alphabetically
  const [p1, p2] = [userId1, userId2].sort();

  const [existing] = await sql`
    SELECT * FROM conversations WHERE participant1 = ${p1} AND participant2 = ${p2}
  ` as any[];
  if (existing) return rowToConversation(existing, userId1);

  const id = generateId();
  const now = Date.now();
  await sql`
    INSERT INTO conversations (id, participant1, participant2, created_at)
    VALUES (${id}, ${p1}, ${p2}, ${now})
    ON CONFLICT DO NOTHING
  `;
  const [row] = await sql`SELECT * FROM conversations WHERE id = ${id}` as any[];
  return rowToConversation(row, userId1);
}

function rowToConversation(row: any, viewerId: string): Conversation {
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

export async function listConversations(userId: string): Promise<any[]> {
  const rows = await sql`
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
  ` as any[];

  return rows.map((r: any) => ({
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

export async function sendMessage(
  conversationId: string, senderId: string, text: string, receiverId: string,
  opts?: { type?: 'text' | 'sticker' | 'invite'; replyToId?: string | null },
): Promise<DirectMessage> {
  const maxLen = text.startsWith('📸story:') ? 8000 : 500;
  if (text.length > maxLen) throw new Error('Message too long.');
  const id = generateId();
  const now = Date.now();
  const type = opts?.type ?? 'text';
  const replyToId = opts?.replyToId ?? null;
  await sql`
    INSERT INTO direct_messages (id, conversation_id, sender_id, text, type, reply_to_id, created_at)
    VALUES (${id}, ${conversationId}, ${senderId}, ${text}, ${type}, ${replyToId}, ${now})
  `;

  // Determine which unread flag to set
  const [conv] = await sql`SELECT * FROM conversations WHERE id = ${conversationId}` as any[];
  const isParticipant1 = conv.participant1 === senderId;
  const preview = type === 'sticker' ? '🎭 სტიკერი' : type === 'invite' ? '🎮 მოწვევა თამაშში' : text.startsWith('📸story:') ? '📸 სთორის პასუხი' : text.slice(0, 200);
  if (isParticipant1) {
    await sql`UPDATE conversations SET last_message = ${preview}, last_message_at = ${now}, unread_by2 = 1 WHERE id = ${conversationId}`;
  } else {
    await sql`UPDATE conversations SET last_message = ${preview}, last_message_at = ${now}, unread_by1 = 1 WHERE id = ${conversationId}`;
  }

  return { id, conversationId, senderId, text, type, replyToId, createdAt: now, readAt: null };
}

/**
 * Log a finished 1:1 call as a DM. `text` encodes "<kind>:<status>"
 * (kind = audio|video, status = completed|missed|declined) and audio_duration
 * carries the call length in seconds (reusing the voice column).
 */
export async function sendCallLog(
  conversationId: string, senderId: string,
  opts: { kind: 'audio' | 'video'; status: 'completed' | 'missed' | 'declined'; duration: number },
): Promise<DirectMessage> {
  const id = generateId();
  const now = Date.now();
  const duration = Math.max(0, Math.min(60 * 60 * 6, Math.floor(opts.duration || 0)));
  const text = `${opts.kind}:${opts.status}`;
  await sql`
    INSERT INTO direct_messages (id, conversation_id, sender_id, text, type, audio_duration, created_at)
    VALUES (${id}, ${conversationId}, ${senderId}, ${text}, 'call', ${duration}, ${now})
  `;
  const [conv] = await sql`SELECT * FROM conversations WHERE id = ${conversationId}` as any[];
  const isParticipant1 = conv.participant1 === senderId;
  const isVideo = opts.kind === 'video';
  const preview = opts.status === 'completed'
    ? (isVideo ? '📹 ვიდეო ზარი' : '📞 აუდიო ზარი')
    : (isVideo ? '📹 გამოტოვებული ვიდეო ზარი' : '📞 გამოტოვებული ზარი');
  // A finished call is not "unread" for the participant who was in it — the
  // caller already saw it. Only a missed/declined call marks the peer unread.
  const markUnread = opts.status !== 'completed';
  if (isParticipant1) {
    if (markUnread) await sql`UPDATE conversations SET last_message = ${preview}, last_message_at = ${now}, unread_by2 = 1 WHERE id = ${conversationId}`;
    else await sql`UPDATE conversations SET last_message = ${preview}, last_message_at = ${now} WHERE id = ${conversationId}`;
  } else {
    if (markUnread) await sql`UPDATE conversations SET last_message = ${preview}, last_message_at = ${now}, unread_by1 = 1 WHERE id = ${conversationId}`;
    else await sql`UPDATE conversations SET last_message = ${preview}, last_message_at = ${now} WHERE id = ${conversationId}`;
  }
  return { id, conversationId, senderId, text, type: 'call', audioDuration: duration, createdAt: now, readAt: null };
}

export async function sendVoiceDm(
  conversationId: string, senderId: string, audioData: string, audioDuration: number, receiverId: string,
  audioFx: string | null = null,
): Promise<DirectMessage> {
  const id = generateId();
  const now = Date.now();
  await sql`
    INSERT INTO direct_messages (id, conversation_id, sender_id, text, type, audio_duration, audio_fx, created_at)
    VALUES (${id}, ${conversationId}, ${senderId}, ${audioData}, 'voice', ${audioDuration}, ${audioFx}, ${now})
  `;
  const [conv] = await sql`SELECT * FROM conversations WHERE id = ${conversationId}` as any[];
  const isParticipant1 = conv.participant1 === senderId;
  const preview = audioFx ? '🎭 Voice message' : '🎙 Voice message';
  if (isParticipant1) {
    await sql`UPDATE conversations SET last_message = ${preview}, last_message_at = ${now}, unread_by2 = 1 WHERE id = ${conversationId}`;
  } else {
    await sql`UPDATE conversations SET last_message = ${preview}, last_message_at = ${now}, unread_by1 = 1 WHERE id = ${conversationId}`;
  }
  return { id, conversationId, senderId, text: audioData, type: 'voice', audioDuration, audioFx, createdAt: now, readAt: null };
}

export async function sendImageDm(
  conversationId: string, senderId: string, imageData: string, viewOnce = false,
): Promise<DirectMessage> {
  const id = generateId();
  const now = Date.now();
  await sql`
    INSERT INTO direct_messages (id, conversation_id, sender_id, text, type, view_once, created_at)
    VALUES (${id}, ${conversationId}, ${senderId}, ${imageData}, 'image', ${viewOnce}, ${now})
  `;
  const [conv] = await sql`SELECT * FROM conversations WHERE id = ${conversationId}` as any[];
  const isParticipant1 = conv.participant1 === senderId;
  const preview = viewOnce ? '📸 ერთჯერადი ფოტო'
    : (imageData.startsWith('data:image/gif') || imageData.includes('tenor.com')) ? '✨ GIF'
    : '🖼 სურათი';
  if (isParticipant1) {
    await sql`UPDATE conversations SET last_message = ${preview}, last_message_at = ${now}, unread_by2 = 1 WHERE id = ${conversationId}`;
  } else {
    await sql`UPDATE conversations SET last_message = ${preview}, last_message_at = ${now}, unread_by1 = 1 WHERE id = ${conversationId}`;
  }
  return { id, conversationId, senderId, text: imageData, type: 'image', viewOnce, viewedAt: null, createdAt: now, readAt: null };
}

/** Toggle a reaction on a DM (one per user per message; same emoji removes). */
export async function toggleDmReaction(messageId: string, reactorId: string, emoji: string): Promise<{ conversationId: string; emoji: string | null }> {
  const [msg] = await sql`SELECT conversation_id FROM direct_messages WHERE id = ${messageId}` as any[];
  if (!msg) throw new Error('Message not found.');
  const [conv] = await sql`SELECT participant1, participant2 FROM conversations WHERE id = ${msg.conversation_id}` as any[];
  if (!conv || (conv.participant1 !== reactorId && conv.participant2 !== reactorId)) throw new Error('Not a participant.');

  const [existing] = await sql`SELECT emoji FROM dm_reactions WHERE message_id = ${messageId} AND reactor_id = ${reactorId}` as any[];
  if (existing?.emoji === emoji) {
    await sql`DELETE FROM dm_reactions WHERE message_id = ${messageId} AND reactor_id = ${reactorId}`;
    return { conversationId: msg.conversation_id, emoji: null };
  }
  await sql`
    INSERT INTO dm_reactions (message_id, reactor_id, emoji, created_at)
    VALUES (${messageId}, ${reactorId}, ${emoji}, ${Date.now()})
    ON CONFLICT (message_id, reactor_id) DO UPDATE SET emoji = ${emoji}, created_at = ${Date.now()}
  `;
  return { conversationId: msg.conversation_id, emoji };
}

/** Recipient opened a view-once photo — burn it. Returns true when this open consumed it. */
export async function markViewOnceViewed(messageId: string, viewerId: string): Promise<boolean> {
  const [msg] = await sql`SELECT conversation_id, sender_id, view_once, viewed_at FROM direct_messages WHERE id = ${messageId}` as any[];
  if (!msg || !(msg.view_once === true || msg.view_once === 1)) return false;
  if (msg.sender_id === viewerId) return false; // sender can't consume it
  if (msg.viewed_at) return false;              // already burned
  const [conv] = await sql`SELECT participant1, participant2 FROM conversations WHERE id = ${msg.conversation_id}` as any[];
  if (!conv || (conv.participant1 !== viewerId && conv.participant2 !== viewerId)) return false;
  await sql`UPDATE direct_messages SET viewed_at = ${Date.now()} WHERE id = ${messageId}`;
  return true;
}

const DM_TYPES: DmType[] = ['text', 'voice', 'image', 'sticker', 'invite', 'call'];

export async function getMessages(conversationId: string, viewerId?: string, limit = 50): Promise<DirectMessage[]> {
  const rows = await sql`
    SELECT * FROM direct_messages WHERE conversation_id = ${conversationId}
    ORDER BY created_at DESC LIMIT ${limit}
  ` as any[];
  const ids = rows.map((r: any) => r.id);
  const reactionRows = ids.length
    ? await sql`SELECT message_id, reactor_id, emoji FROM dm_reactions WHERE message_id = ANY(${ids})` as any[]
    : [];
  const reactionsByMsg = new Map<string, Record<string, string>>();
  for (const rr of reactionRows) {
    const m = reactionsByMsg.get(rr.message_id) ?? {};
    m[rr.reactor_id] = rr.emoji;
    reactionsByMsg.set(rr.message_id, m);
  }
  return rows.reverse().map((r: any) => {
    const viewOnce = r.view_once === true || r.view_once === 1;
    const viewedAt = r.viewed_at ? Number(r.viewed_at) : null;
    // View-once media is burned after viewing, and never re-served to the sender.
    const masked = viewOnce && (viewedAt !== null || (viewerId != null && r.sender_id === viewerId));
    return {
      id: r.id, conversationId: r.conversation_id, senderId: r.sender_id,
      text: masked ? '' : r.text,
      type: (DM_TYPES.includes(r.type) ? r.type : 'text') as DmType,
      audioDuration: r.audio_duration ? Number(r.audio_duration) : undefined,
      audioFx: r.audio_fx ?? null,
      replyToId: r.reply_to_id ?? null,
      viewOnce,
      viewedAt,
      reactions: reactionsByMsg.get(r.id),
      createdAt: Number(r.created_at),
      readAt: r.read_at ? Number(r.read_at) : null,
    };
  });
}

/** Marks the conversation read AND stamps read_at on the peer's unread
 *  messages (drives the ✓✓ seen ticks). Returns the peer's id. */
export async function markRead(conversationId: string, userId: string): Promise<string | null> {
  const [conv] = await sql`SELECT * FROM conversations WHERE id = ${conversationId}` as any[];
  if (!conv) return null;
  if (conv.participant1 === userId) {
    await sql`UPDATE conversations SET unread_by1 = 0 WHERE id = ${conversationId}`;
  } else {
    await sql`UPDATE conversations SET unread_by2 = 0 WHERE id = ${conversationId}`;
  }
  await sql`
    UPDATE direct_messages SET read_at = ${Date.now()}
    WHERE conversation_id = ${conversationId} AND sender_id != ${userId} AND read_at IS NULL
  `;
  return conv.participant1 === userId ? conv.participant2 : conv.participant1;
}

export async function getTotalUnread(userId: string): Promise<number> {
  const [row] = await sql`
    SELECT COUNT(*) as c FROM conversations
    WHERE (participant1 = ${userId} AND unread_by1 = 1)
       OR (participant2 = ${userId} AND unread_by2 = 1)
  ` as any[];
  return Number(row?.c ?? 0);
}

export async function deleteConversationForUser(conversationId: string, userId: string): Promise<void> {
  const [conv] = await sql`SELECT * FROM conversations WHERE id = ${conversationId}` as any[];
  if (!conv) return;
  if (conv.participant1 !== userId && conv.participant2 !== userId) return;
  await sql`DELETE FROM direct_messages WHERE conversation_id = ${conversationId}`;
  await sql`DELETE FROM conversations WHERE id = ${conversationId}`;
}
