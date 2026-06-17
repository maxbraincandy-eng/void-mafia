import { Router } from 'express';
import { getAIProvider, isHermesEnabled } from '../ai/hermesProvider.js';
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
  router.get('/status', (_req, res) => {
    res.json({ ok: true, enabled: isHermesEnabled() });
  });

  // ── POST /api/hermes/chat ─────────────────────────────────────────────
  router.post('/chat', async (req, res) => {
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
      res.status(500).json({ ok: false, error: 'Hermes encountered an error. Please try again.' });
    }
  });

  return router;
}
