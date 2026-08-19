import type { AIProvider, AIMessage, AIResponse } from './hermesProvider.js';
export declare class GroqProvider implements AIProvider {
    private client;
    private pinned;
    private resolved;
    private resolving;
    constructor();
    isAvailable(): boolean;
    /** What this key can actually talk to, best first. */
    listUsable(): Promise<string[]>;
    private resolveModel;
    chat(messages: AIMessage[], systemPrompt: string, maxTokens?: number): Promise<AIResponse>;
}
//# sourceMappingURL=groqProvider.d.ts.map