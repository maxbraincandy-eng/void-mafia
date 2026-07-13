let _cachedProvider = undefined; // undefined = not yet initialised
/**
 * Load the configured provider. The server is ESM ("type":"module"), so the
 * provider modules must be loaded with dynamic import() — the old require()
 * threw "require is not defined" the moment a key was present, silently
 * disabling Hermes. Idempotent; failures fall back to null (never crash).
 */
export async function initAIProvider() {
    if (_cachedProvider !== undefined)
        return _cachedProvider;
    if (process.env.HERMES_ENABLED === 'false') {
        _cachedProvider = null;
        return null;
    }
    const providerName = (process.env.AI_PROVIDER ?? 'openrouter').toLowerCase();
    try {
        if (providerName === 'openrouter') {
            if (!process.env.OPENROUTER_API_KEY) {
                console.warn('[Hermes] OPENROUTER_API_KEY not set — Hermes disabled');
                _cachedProvider = null;
                return null;
            }
            const { OpenRouterProvider } = await import('./openrouterProvider.js');
            _cachedProvider = new OpenRouterProvider();
            console.log('[Hermes] OpenRouter provider ready');
        }
        else if (providerName === 'openai') {
            if (!process.env.OPENAI_API_KEY) {
                console.warn('[Hermes] OPENAI_API_KEY not set — Hermes disabled');
                _cachedProvider = null;
                return null;
            }
            const { OpenAIProvider } = await import('./openaiProvider.js');
            _cachedProvider = new OpenAIProvider();
            console.log('[Hermes] OpenAI provider ready');
        }
        else if (providerName === 'gemini') {
            if (!process.env.GEMINI_API_KEY) {
                console.warn('[Hermes] GEMINI_API_KEY not set — Hermes disabled');
                _cachedProvider = null;
                return null;
            }
            const { GeminiProvider } = await import('./geminiProvider.js');
            _cachedProvider = new GeminiProvider();
            console.log('[Hermes] Gemini provider ready');
        }
        else if (providerName === 'groq') {
            if (!process.env.GROQ_API_KEY) {
                console.warn('[Hermes] GROQ_API_KEY not set — Hermes disabled');
                _cachedProvider = null;
                return null;
            }
            const { GroqProvider } = await import('./groqProvider.js');
            _cachedProvider = new GroqProvider();
            console.log('[Hermes] Groq provider ready');
        }
        else {
            console.warn(`[Hermes] Unknown AI_PROVIDER "${providerName}" — Hermes disabled`);
            _cachedProvider = null;
        }
    }
    catch (e) {
        console.error(`[Hermes] Failed to load ${providerName} provider:`, e?.message);
        _cachedProvider = null;
    }
    return _cachedProvider;
}
/** Synchronous accessor — returns the cached provider (null until init runs). */
export function getAIProvider() {
    return _cachedProvider ?? null;
}
export function isHermesEnabled() {
    return _cachedProvider != null;
}
//# sourceMappingURL=hermesProvider.js.map