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
export declare function getOrCreateConversation(userId1: string, userId2: string): Promise<Conversation>;
export declare function listConversations(userId: string): Promise<any[]>;
export declare function sendMessage(conversationId: string, senderId: string, text: string, receiverId: string, opts?: {
    type?: 'text' | 'sticker' | 'invite';
    replyToId?: string | null;
}): Promise<DirectMessage>;
/**
 * Log a finished 1:1 call as a DM. `text` encodes "<kind>:<status>"
 * (kind = audio|video, status = completed|missed|declined) and audio_duration
 * carries the call length in seconds (reusing the voice column).
 */
export declare function sendCallLog(conversationId: string, senderId: string, opts: {
    kind: 'audio' | 'video';
    status: 'completed' | 'missed' | 'declined';
    duration: number;
}): Promise<DirectMessage>;
export declare function sendVoiceDm(conversationId: string, senderId: string, audioData: string, audioDuration: number, receiverId: string, audioFx?: string | null): Promise<DirectMessage>;
export declare function sendImageDm(conversationId: string, senderId: string, imageData: string, viewOnce?: boolean): Promise<DirectMessage>;
/** Toggle a reaction on a DM (one per user per message; same emoji removes). */
export declare function toggleDmReaction(messageId: string, reactorId: string, emoji: string): Promise<{
    conversationId: string;
    emoji: string | null;
}>;
/** Recipient opened a view-once photo — burn it. Returns true when this open consumed it. */
export declare function markViewOnceViewed(messageId: string, viewerId: string): Promise<boolean>;
export declare function getMessages(conversationId: string, viewerId?: string, limit?: number): Promise<DirectMessage[]>;
/** Marks the conversation read AND stamps read_at on the peer's unread
 *  messages (drives the ✓✓ seen ticks). Returns the peer's id. */
export declare function markRead(conversationId: string, userId: string): Promise<string | null>;
export declare function getTotalUnread(userId: string): Promise<number>;
export declare function deleteConversationForUser(conversationId: string, userId: string): Promise<void>;
//# sourceMappingURL=dmService.d.ts.map