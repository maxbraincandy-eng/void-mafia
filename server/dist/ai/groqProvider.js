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
    'qwen3',
    'deepseek-r1-distill-llama-70b',
    'gpt-oss-20b',
    'llama-3.1-8b',
    'compound',
    'llama3-70b',
    'gemma2-9b',
];
/**
 * Models that exist but cannot answer a chat turn.
 *
 * `orpheus` is on the list because it is speech synthesis, and this key has
 * two of them — they list like any other model and would have been picked
 * ahead of a real one on a key with nothing better.
 */
const NOT_CHAT = /whisper|tts|guard|embed|vision-preview|distil-whisper|orpheus|prompt-guard/i;
/**
 * Reasoning models bill their thinking to the same token budget as the answer.
 * gpt-oss with a small budget returns a perfectly successful response whose
 * content is empty — it spent everything reasoning and had nothing left. Ask
 * for the least thinking the model will agree to.
 */
function reasoningOptions(model) {
    return /gpt-oss|qwen3|deepseek-r1|compound/i.test(model)
        ? { reasoning_effort: 'low' }
        : {};
}
export class GroqProvider {
    constructor() {
        this.resolved = null;
        /** Everything this key can reach, best first — kept so chat() can move on. */
        this.catalogue = null;
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
                this.catalogue = usable;
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
            // A reasoning model needs headroom for the thinking AND the answer, so
            // the floor here is not generosity, it is the difference between a reply
            // and an empty string.
            max_tokens: Math.max(maxTokens, 512),
            temperature: 0.75,
            ...reasoningOptions(model),
        });
        const problems = [];
        // Preferred first, then everything else the key can reach. A model that
        // 404s or answers with nothing is skipped rather than fatal — the previous
        // version bet the whole feature on one name and lost.
        //
        // Two passes: the second refreshes the catalogue first, because a cached
        // list is exactly what goes stale when a provider retires something, and
        // then every name in it fails for the same reason.
        for (let pass = 0; pass < 2; pass++) {
            const first = await this.resolveModel(pass === 1);
            const rest = (this.catalogue ?? []).filter(m => m !== first);
            const answer = await this.tryCandidates([first, ...rest], body, problems);
            if (answer)
                return answer;
        }
        throw new Error(`ჰერმესი დროებით გათიშულია — no Groq model answered (${problems.slice(0, 3).join('; ')})`);
    }
    /** Ask each model in turn; the first with something to say wins. */
    async tryCandidates(candidates, body, problems) {
        for (const model of candidates) {
            let response;
            try {
                response = await this.client.chat.completions.create(body(model));
            }
            catch (e) {
                const skippable = e?.status === 404 || e?.status === 400
                    || /does not exist|decommission|not found|not supported/i.test(e?.message ?? '');
                problems.push(`${model}: ${(e?.message ?? e).toString().slice(0, 90)}`);
                if (skippable)
                    continue;
                throw new Error(`ჰერმესი დროებით გათიშულია — ${e.message ?? 'Groq error'}`);
            }
            const text = response.choices[0]?.message?.content?.trim();
            if (!text) {
                problems.push(`${model}: empty content (finish=${response.choices[0]?.finish_reason ?? '?'})`);
                continue;
            }
            if (model !== this.resolved) {
                console.warn(`[Hermes/Groq] switched to ${model}`);
                this.resolved = model;
            }
            return {
                text,
                inputTokens: response.usage?.prompt_tokens,
                outputTokens: response.usage?.completion_tokens,
            };
        }
        return null;
    }
}
//# sourceMappingURL=groqProvider.js.map