export interface AIMessage {
    role: 'user' | 'assistant';
    content: string;
}
export interface AIResponse {
    text: string;
    inputTokens?: number;
    outputTokens?: number;
}
export interface AIProvider {
    chat(messages: AIMessage[], systemPrompt: string): Promise<AIResponse>;
    isAvailable(): boolean;
}
export declare function getAIProvider(): AIProvider | null;
export declare function isHermesEnabled(): boolean;
//# sourceMappingURL=hermesProvider.d.ts.map