import type { AIProvider, AIMessage, AIResponse } from './hermesProvider.js';
export declare class GeminiProvider implements AIProvider {
    private client;
    private model;
    constructor();
    isAvailable(): boolean;
    chat(messages: AIMessage[], systemPrompt: string): Promise<AIResponse>;
}
//# sourceMappingURL=geminiProvider.d.ts.map