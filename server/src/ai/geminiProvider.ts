import OpenAI from 'openai';
import type { AIProvider, AIMessage, AIResponse } from './hermesProvider.js';

/**
 * Google Gemini via its OpenAI-compatible endpoint — free tier, no card
 * required (aistudio.google.com → Get API key). Reuses the OpenAI SDK by
 * pointing it at Google's compatibility base URL.
 *   GEMINI_API_KEY   — the AIza… key from AI Studio
 *   GEMINI_MODEL     — default 'gemini-2.0-flash'
 */
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

export class GeminiProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
    this.client = new OpenAI({ apiKey: process.env.GEMINI_API_KEY, baseURL: GEMINI_BASE_URL });
    this.model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
    console.log(`[Hermes/Gemini] model = ${this.model}`);
  }

  isAvailable(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  async chat(messages: AIMessage[], systemPrompt: string): Promise<AIResponse> {
    let response;
    try {
      response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({ role: m.role, content: m.content })),
        ],
        max_tokens: 2048,
        temperature: 0.75,
      });
    } catch (e: any) {
      throw new Error(`ჰერმესი დროებით გათიშულია — ${e.message ?? 'Gemini error'}`);
    }
    const choice = response.choices[0];
    if (!choice?.message?.content) throw new Error('ჰერმესი დროებით გათიშულია — empty response from Gemini');
    return {
      text: choice.message.content,
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    };
  }
}
