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
    chat(messages: AIMessage[], systemPrompt: string, maxTokens?: number): Promise<AIResponse>;
    isAvailable(): boolean;
}
/**
 * Load the configured provider. The server is ESM ("type":"module"), so the
 * provider modules must be loaded with dynamic import() — the old require()
 * threw "require is not defined" the moment a key was present, silently
 * disabling Hermes. Idempotent; failures fall back to null (never crash).
 */
export declare function initAIProvider(): Promise<AIProvider | null>;
/** Synchronous accessor — returns the cached provider (null until init runs). */
export declare function getAIProvider(): AIProvider | null;
export declare function isHermesEnabled(): boolean;
//# sourceMappingURL=hermesProvider.d.ts.map