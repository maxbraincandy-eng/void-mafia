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

export function getAIProvider(): AIProvider | null {
  if (_cachedProvider !== undefined) return _cachedProvider;

  if (process.env.HERMES_ENABLED === 'false') {
    _cachedProvider = null;
    return null;
  }

  const providerName = (process.env.AI_PROVIDER ?? 'openai').toLowerCase();

  if (providerName === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[Hermes] OPENAI_API_KEY not set — Hermes disabled');
      _cachedProvider = null;
      return null;
    }
    // Lazy-require to avoid crashing when the package is absent in some envs
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { OpenAIProvider } = require('./openaiProvider.js') as { OpenAIProvider: new () => AIProvider };
      _cachedProvider = new OpenAIProvider();
      console.log('[Hermes] OpenAI provider ready');
    } catch (e: any) {
      console.error('[Hermes] Failed to load OpenAI provider:', e.message);
      _cachedProvider = null;
    }
  } else {
    console.warn(`[Hermes] Unknown AI_PROVIDER "${providerName}" — Hermes disabled`);
    _cachedProvider = null;
  }

  // TODO: add 'anthropic' | 'gemini' provider cases here
  return _cachedProvider;
}

export function isHermesEnabled(): boolean {
  return getAIProvider() !== null;
}
