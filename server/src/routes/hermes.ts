import { Router } from 'express';
import { getAIProvider, isHermesEnabled, initAIProvider } from '../ai/hermesProvider.js';
import { buildHermesSystemPrompt, HermesMode } from '../ai/hermesPrompts.js';
import {
  checkRateLimit, incrementUsage,
  getOrCreateConversation, getRecentMessages, saveMessage,
} from '../services/hermesService.js';
import { getPlayer } from '../services/playerService.js';

const VALID_MODES = new Set<HermesMode>([
  'philosopher', 'mafia_coach', 'debate_helper', 'recommendations', 'void_oracle', 'general',
]);

export function createHermesRouter(): Router {
  const router = Router();

  // ── GET /api/hermes/status ────────────────────────────────────────────
  router.get('/status', async (_req, res) => {
    await initAIProvider();
    // Non-secret diagnostics (booleans/names only) to debug why Hermes is off.
    res.json({
      ok: true,
      enabled: isHermesEnabled(),
      diag: {
        provider: (process.env.AI_PROVIDER ?? 'openrouter').toLowerCase(),
        openrouterKey: !!process.env.OPENROUTER_API_KEY,
        openaiKey: !!process.env.OPENAI_API_KEY,
        geminiKey: !!process.env.GEMINI_API_KEY,
        groqKey: !!process.env.GROQ_API_KEY,
        hermesEnabledFlag: process.env.HERMES_ENABLED ?? null,
        model: process.env.GROQ_MODEL ?? process.env.GEMINI_MODEL ?? process.env.OPENROUTER_MODEL ?? process.env.OPENAI_MODEL ?? null,
      },
    });
  });

  // ── GET /api/hermes/test-mafia — TEMP quality probe (no auth, no DB) ──
  router.get('/test-mafia', async (_req, res) => {
    await initAIProvider();
    const provider = getAIProvider();
    if (!provider) { res.status(503).json({ ok: false, error: 'AI provider unavailable.' }); return; }
    const system = 'შენ ხარ მაფიის სოციალურ-დედუქციური თამაშის ცოცხალი მოთამაშე. ილაპარაკე მხოლოდ ქართულად, ბუნებრივად, მოკლედ (1–2 წინადადება). არ ახსნა რომ AI ხარ.';
    const scenarios = [
      'დღეა. შენ მშვიდობიანი მოქალაქე ხარ. ეჭვი შეიტანე მე-4 მოთამაშეზე და მოკლედ თქვი რატომ.',
      'ტრიბუნალია. დაიცავი თავი — გეჭვობენ რომ მაფია ხარ, დაარწმუნე ხალხი რომ უდანაშაულო ხარ.',
      'დღეა. შენ მაფია ხარ, მაგრამ თავი მოქალაქედ მოაჩვენე და ეჭვი სხვისკენ გადაიტანე.',
    ];
    try {
      const out = [];
      for (const s of scenarios) {
        const r = await provider.chat([{ role: 'user', content: s }], system);
        out.push({ scenario: s, reply: r.text.trim(), tokens: (r.inputTokens ?? 0) + (r.outputTokens ?? 0) });
      }
      res.json({ ok: true, samples: out });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message });
    }
  });

  // ── GET /api/hermes/probe-gemini — which Gemini models work for this key ──
  router.get('/probe-gemini', async (_req, res) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) { res.json({ ok: false, error: 'GEMINI_API_KEY not set' }); return; }
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: key, baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' });
    const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-exp', 'gemini-2.5-flash', 'gemini-1.5-flash-8b', 'gemini-flash-latest'];
    const results: any[] = [];
    for (const m of models) {
      try {
        const r = await client.chat.completions.create({ model: m, messages: [{ role: 'user', content: 'თქვი ერთი მოკლე ქართული წინადადება მაფიის თამაშიდან.' }], max_tokens: 60 });
        results.push({ model: m, ok: true, reply: r.choices[0]?.message?.content?.trim() });
      } catch (e: any) {
        results.push({ model: m, ok: false, error: (e?.status ?? '') + ' ' + (e?.message ?? '').slice(0, 90) });
      }
    }
    res.json({ ok: true, results });
  });

  // ── GET /api/hermes/probe-groq — which Groq models work for this key ──
  router.get('/probe-groq', async (_req, res) => {
    const key = process.env.GROQ_API_KEY;
    if (!key) { res.json({ ok: false, error: 'GROQ_API_KEY not set' }); return; }
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: key, baseURL: 'https://api.groq.com/openai/v1' });
    const models = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama3-70b-8192', 'gemma2-9b-it'];
    const results: any[] = [];
    for (const m of models) {
      try {
        const r = await client.chat.completions.create({ model: m, messages: [{ role: 'user', content: 'თქვი ერთი მოკლე ქართული წინადადება მაფიის თამაშიდან.' }], max_tokens: 60 });
        results.push({ model: m, ok: true, reply: r.choices[0]?.message?.content?.trim() });
      } catch (e: any) {
        results.push({ model: m, ok: false, error: (e?.status ?? '') + ' ' + (e?.message ?? '').slice(0, 90) });
      }
    }
    res.json({ ok: true, results });
  });

  // ── POST /api/hermes/chat ─────────────────────────────────────────────
  router.post('/chat', async (req, res) => {
    await initAIProvider();
    if (!isHermesEnabled()) {
      res.status(503).json({
        ok: false,
        error: 'Hermes is offline. ჰერმესი დროებით გათიშულია.',
      });
      return;
    }

    const { uid, message, mode = 'general', context } = req.body ?? {};

    if (!uid || typeof uid !== 'string') {
      res.status(401).json({ ok: false, error: 'Not authenticated.' });
      return;
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ ok: false, error: 'Message is required.' });
      return;
    }
    if (message.length > 2000) {
      res.status(400).json({ ok: false, error: 'Message too long (max 2000 chars).' });
      return;
    }

    const safeMode: HermesMode = VALID_MODES.has(mode as HermesMode) ? (mode as HermesMode) : 'general';

    // Verify user exists
    const player = await getPlayer(uid).catch(() => null);
    if (!player) {
      res.status(401).json({ ok: false, error: 'User not found.' });
      return;
    }

    // Rate limit
    const { allowed, remaining } = checkRateLimit(uid);
    if (!allowed) {
      res.status(429).json({
        ok: false,
        error: 'Daily Hermes limit reached. დღიური Hermes ლიმიტი ამოიწურა.',
      });
      return;
    }

    const provider = getAIProvider();
    if (!provider) {
      res.status(503).json({ ok: false, error: 'AI provider unavailable.' });
      return;
    }

    try {
      const conversationId = await getOrCreateConversation(uid, safeMode);
      const history = await getRecentMessages(conversationId, 20);
      const systemPrompt = buildHermesSystemPrompt(safeMode, context ?? undefined);

      const aiMessages = [
        ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: message.trim() },
      ];

      const aiResponse = await provider.chat(aiMessages, systemPrompt);

      // Persist both turns
      await saveMessage(conversationId, 'user', message.trim());
      await saveMessage(conversationId, 'assistant', aiResponse.text);
      incrementUsage(uid);

      res.json({
        ok: true,
        answer: aiResponse.text,
        mode: safeMode,
        usage: {
          inputTokens:  aiResponse.inputTokens,
          outputTokens: aiResponse.outputTokens,
        },
        remaining: Math.max(0, remaining - 1),
      });
    } catch (e: any) {
      console.error('[Hermes] chat error:', e.message);
      // Provider throws bilingual messages; fall back to generic if not
      const msg: string = e.message ?? '';
      const clientError = msg.includes('ჰერმესი')
        ? msg
        : 'ჰერმესი დროებით გათიშულია. Please try again.';
      res.status(500).json({ ok: false, error: clientError });
    }
  });

  return router;
}
