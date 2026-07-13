import OpenAI from 'openai';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export class OpenRouterProvider {
    constructor() {
        if (!process.env.OPENROUTER_API_KEY)
            throw new Error('OPENROUTER_API_KEY not set');
        // OpenRouter is OpenAI-compatible; point the SDK at their base URL
        this.client = new OpenAI({
            apiKey: process.env.OPENROUTER_API_KEY,
            baseURL: OPENROUTER_BASE_URL,
            defaultHeaders: {
                'HTTP-Referer': 'https://voidmafia.one',
                'X-Title': 'Void Mafia Hermes AI',
            },
        });
        this.model = process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.1-8b-instruct:free';
        console.log(`[Hermes/OpenRouter] model = ${this.model}`);
    }
    isAvailable() {
        return !!process.env.OPENROUTER_API_KEY;
    }
    async chat(messages, systemPrompt, maxTokens = 1024) {
        let response;
        try {
            response = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...messages.map(m => ({ role: m.role, content: m.content })),
                ],
                max_tokens: maxTokens,
                temperature: 0.72,
            });
        }
        catch (e) {
            // Surface a bilingual message so the client can display Georgian
            throw new Error(`ჰერმესი დროებით გათიშულია — ${e.message ?? 'OpenRouter error'}`);
        }
        const choice = response.choices[0];
        if (!choice?.message?.content) {
            throw new Error('ჰერმესი დროებით გათიშულია — empty response from OpenRouter');
        }
        return {
            text: choice.message.content.trim(),
            inputTokens: response.usage?.prompt_tokens,
            outputTokens: response.usage?.completion_tokens,
        };
    }
}
//# sourceMappingURL=openrouterProvider.js.map