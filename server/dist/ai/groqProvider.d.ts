import type { AIProvider, AIMessage, AIResponse } from './hermesProvider.js';
export declare class GroqProvider implements AIProvider {
    private client;
    private pinned;
    private resolved;
    /** Everything this key can reach, best first — kept so chat() can move on. */
    catalogue: string[] | null;
    private resolving;
    constructor();
    isAvailable(): boolean;
    /** What this key can actually talk to, best first. */
    listUsable(): Promise<string[]>;
    private resolveModel;
    chat(messages: AIMessage[], systemPrompt: string, maxTokens?: number): Promise<AIResponse>;
    /** Ask each model in turn; the first with something to say wins. */
    private tryCandidates;
}
//# sourceMappingURL=groqProvider.d.ts.map