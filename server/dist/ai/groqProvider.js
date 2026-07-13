import OpenAI from 'openai';
/**
 * Groq — free API, fast inference, works globally without billing/region gates
 * (console.groq.com → API Keys → Create). OpenAI-compatible endpoint.
 *   GROQ_API_KEY   — the gsk_… key
 *   GROQ_MODEL     — default 'llama-3.3-70b-versatile'
 */
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export class GroqProvider {
    constructor() {
        if (!process.env.GROQ_API_KEY)
            throw new Error('GROQ_API_KEY not set');
        this.client = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: GROQ_BASE_URL });
        this.model = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
        console.log(`[Hermes/Groq] model = ${this.model}`);
    }
    isAvailable() {
        return !!process.env.GROQ_API_KEY;
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
                temperature: 0.75,
            });
        }
        catch (e) {
            throw new Error(`ჰერმესი დროებით გათიშულია — ${e.message ?? 'Groq error'}`);
        }
        const choice = response.choices[0];
        if (!choice?.message?.content)
            throw new Error('ჰერმესი დროებით გათიშულია — empty response from Groq');
        return {
            text: choice.message.content,
            inputTokens: response.usage?.prompt_tokens,
            outputTokens: response.usage?.completion_tokens,
        };
    }
}
//# sourceMappingURL=groqProvider.js.map