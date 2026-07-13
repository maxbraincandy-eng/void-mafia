import type { AIProvider, AIMessage, AIResponse } from './hermesProvider.js';
export declare class OpenRouterProvider implements AIProvider {
    private client;
    private model;
    constructor();
    isAvailable(): boolean;
    chat(messages: AIMessage[], systemPrompt: string, maxTokens?: number): Promise<AIResponse>;
}
//# sourceMappingURL=openrouterProvider.d.ts.map