import OpenAI from 'openai';
import type { AIProvider, AIMessage, AIResponse } from './hermesProvider.js';

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    console.log(`[Hermes/OpenAI] model = ${this.model}`);
  }

  isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  async chat(messages: AIMessage[], systemPrompt: string, maxTokens = 1024): Promise<AIResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      max_tokens: maxTokens,
      temperature: 0.72,
    });

    const choice = response.choices[0];
    if (!choice?.message?.content) throw new Error('No response from OpenAI');

    return {
      text: choice.message.content.trim(),
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    };
  }
}

// TODO: add AnthropicProvider, GeminiProvider here following the same AIProvider interface
