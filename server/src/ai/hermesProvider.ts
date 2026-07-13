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

let _cachedProvider: AIProvider | null | undefined = undefined; // undefined = not yet initialised

/**
 * Load the configured provider. The server is ESM ("type":"module"), so the
 * provider modules must be loaded with dynamic import() — the old require()
 * threw "require is not defined" the moment a key was present, silently
 * disabling Hermes. Idempotent; failures fall back to null (never crash).
 */
export async function initAIProvider(): Promise<AIProvider | null> {
  if (_cachedProvider !== undefined) return _cachedProvider;

  if (process.env.HERMES_ENABLED === 'false') { _cachedProvider = null; return null; }
  const providerName = (process.env.AI_PROVIDER ?? 'openrouter').toLowerCase();

  try {
    if (providerName === 'openrouter') {
      if (!process.env.OPENROUTER_API_KEY) { console.warn('[Hermes] OPENROUTER_API_KEY not set — Hermes disabled'); _cachedProvider = null; return null; }
      const { OpenRouterProvider } = await import('./openrouterProvider.js');
      _cachedProvider = new OpenRouterProvider();
      console.log('[Hermes] OpenRouter provider ready');
    } else if (providerName === 'openai') {
      if (!process.env.OPENAI_API_KEY) { console.warn('[Hermes] OPENAI_API_KEY not set — Hermes disabled'); _cachedProvider = null; return null; }
      const { OpenAIProvider } = await import('./openaiProvider.js');
      _cachedProvider = new OpenAIProvider();
      console.log('[Hermes] OpenAI provider ready');
    } else {
      console.warn(`[Hermes] Unknown AI_PROVIDER "${providerName}" — Hermes disabled`);
      _cachedProvider = null;
    }
  } catch (e: any) {
    console.error(`[Hermes] Failed to load ${providerName} provider:`, e?.message);
    _cachedProvider = null;
  }
  return _cachedProvider;
}

/** Synchronous accessor — returns the cached provider (null until init runs). */
export function getAIProvider(): AIProvider | null {
  return _cachedProvider ?? null;
}

export function isHermesEnabled(): boolean {
  return _cachedProvider != null;
}
