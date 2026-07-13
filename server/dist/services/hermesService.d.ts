export declare function checkRateLimit(_userId: string): {
    allowed: boolean;
    remaining: number;
};
export declare function incrementUsage(userId: string): void;
export declare function getOrCreateConversation(userId: string, mode: string): Promise<string>;
export declare function getRecentMessages(conversationId: string, limit?: number): Promise<Array<{
    role: string;
    content: string;
}>>;
export declare function saveMessage(conversationId: string, role: 'user' | 'assistant', content: string): Promise<void>;
export declare function clearUserHistory(userId: string): Promise<void>;
//# sourceMappingURL=hermesService.d.ts.map