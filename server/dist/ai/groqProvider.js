import OpenAI from 'openai';
/**
 * Groq — free API, fast inference, works globally without billing/region gates
 * (console.groq.com → API Keys → Create). OpenAI-compatible endpoint.
 *   GROQ_API_KEY  — the gsk_… key
 *   GROQ_MODEL    — optional; pins one model instead of discovering one
 *
 * The model is DISCOVERED, not hard-coded.
 *
 * It used to be `llama-3.3-70b-versatile`, written into the source. Groq
 * retired it for this key and Hermes answered every message with
 * "The model does not exist or you do not have access to it" until someone
 * noticed. Hosted models get retired on the host's schedule, not ours, so
 * naming one in the source is a scheduled outage — the only question is when.
 *
 * Now it asks the API what this key can actually use, picks the best of what
 * comes back, and if the chosen one disappears mid-flight it re-resolves once
 * and retries. The list below is preference, not requirement: anything Groq
 * offers will do if none of these are there.
 */
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
/** Preference order. Earlier is better; matching is by substring. */
const PREFERRED = [
    'llama-3.3-70b',
    'llama-3.1-70b',
    'llama-4-maverick',
    'llama-4-scout',
    'gpt-oss-120b',
    'kimi-k2',
    'qwen3-32b',
    'deepseek-r1-distill-llama-70b',
    'gpt-oss-20b',
    'llama-3.1-8b',
    'llama3-70b',
    'gemma2-9b',
];
/** Models that exist but cannot answer a chat turn. */
const NOT_CHAT = /whisper|tts|guard|embed|vision-preview|distil-whisper/i;
export class GroqProvider {
    constructor() {
        this.resolved = null;
        this.resolving = null;
        if (!process.env.GROQ_API_KEY)
            throw new Error('GROQ_API_KEY not set');
        this.client = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: GROQ_BASE_URL });
        this.pinned = process.env.GROQ_MODEL?.trim() || null;
        if (this.pinned)
            console.log(`[Hermes/Groq] model pinned by GROQ_MODEL = ${this.pinned}`);
    }
    isAvailable() {
        return !!process.env.GROQ_API_KEY;
    }
    /** What this key can actually talk to, best first. */
    async listUsable() {
        const res = await this.client.models.list();
        const ids = res.data.map(m => m.id).filter(id => !NOT_CHAT.test(id));
        const rank = (id) => {
            const i = PREFERRED.findIndex(p => id.includes(p));
            return i === -1 ? PREFERRED.length : i;
        };
        return ids.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    }
    async resolveModel(force = false) {
        if (!force && this.resolved)
            return this.resolved;
        if (!force && this.resolving)
            return this.resolving;
        this.resolving = (async () => {
            // A pin is honoured only if the key can really use it; otherwise it is
            // the same trap as hard-coding, just moved into an env var.
            try {
                const usable = await this.listUsable();
                if (this.pinned && usable.includes(this.pinned)) {
                    this.resolved = this.pinned;
                }
                else {
                    if (this.pinned) {
                        console.warn(`[Hermes/Groq] GROQ_MODEL="${this.pinned}" is not available to this key — falling back`);
                    }
                    this.resolved = usable[0] ?? null;
                }
            }
            catch (e) {
                // If the listing itself fails, a pin is better than nothing.
                console.warn('[Hermes/Groq] could not list models:', e?.message);
                this.resolved = this.pinned;
            }
            if (!this.resolved)
                throw new Error('Groq offers no usable chat model for this key');
            console.log(`[Hermes/Groq] model = ${this.resolved}`);
            this.resolving = null;
            return this.resolved;
        })();
        return this.resolving;
    }
    async chat(messages, systemPrompt, maxTokens = 2048) {
        const body = (model) => ({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages.map(m => ({ role: m.role, content: m.content })),
            ],
            max_tokens: maxTokens,
            temperature: 0.75,
        });
        let model = await this.resolveModel();
        let response;
        try {
            response = await this.client.chat.completions.create(body(model));
        }
        catch (e) {
            const gone = e?.status === 404 || /does not exist|decommission|not found/i.test(e?.message ?? '');
            if (!gone)
                throw new Error(`ჰერმესი დროებით გათიშულია — ${e.message ?? 'Groq error'}`);
            // The model went away underneath us. Ask again and retry once.
            console.warn(`[Hermes/Groq] "${model}" is gone — re-resolving`);
            model = await this.resolveModel(true);
            try {
                response = await this.client.chat.completions.create(body(model));
            }
            catch (e2) {
                throw new Error(`ჰერმესი დროებით გათიშულია — ${e2.message ?? 'Groq error'}`);
            }
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