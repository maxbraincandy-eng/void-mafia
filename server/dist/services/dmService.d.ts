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
export interface DirectMessage {
    id: string;
    conversationId: string;
    senderId: string;
    text: string;
    type?: 'text' | 'voice' | 'image';
    audioDuration?: number;
    createdAt: number;
    readAt: number | null;
}
export declare function getOrCreateConversation(userId1: string, userId2: string): Promise<Conversation>;
export declare function listConversations(userId: string): Promise<any[]>;
export declare function sendMessage(conversationId: string, senderId: string, text: string, receiverId: string): Promise<DirectMessage>;
export declare function sendVoiceDm(conversationId: string, senderId: string, audioData: string, audioDuration: number, receiverId: string): Promise<DirectMessage>;
export declare function sendImageDm(conversationId: string, senderId: string, imageData: string): Promise<DirectMessage>;
export declare function getMessages(conversationId: string, limit?: number): Promise<DirectMessage[]>;
export declare function markRead(conversationId: string, userId: string): Promise<void>;
export declare function getTotalUnread(userId: string): Promise<number>;
export declare function deleteConversationForUser(conversationId: string, userId: string): Promise<void>;
//# sourceMappingURL=dmService.d.ts.map