/**
 * livekitRoutes — token + status endpoints for LiveKit voice.
 *
 *   GET /livekit/status              → { ok, enabled }
 *   GET /livekit/token?identity=&room=[&canPublish=]
 *                                    → { ok, token, url }
 *
 * Mounted in index.ts as: app.use('/livekit', createLiveKitRouter())
 */
import { Router } from 'express';
import { createAccessToken, isLiveKitEnabled } from '../services/livekitService.js';

// LiveKit identities/room names must be safe, bounded strings.
const SAFE = /^[A-Za-z0-9_.:\-]{1,128}$/;

export function createLiveKitRouter(): Router {
  const router = Router();

  // ── GET /livekit/status ───────────────────────────────────────────────
  router.get('/status', (_req, res) => {
    res.json({ ok: true, enabled: isLiveKitEnabled() });
  });

  // ── GET /livekit/token ────────────────────────────────────────────────
  router.get('/token', async (req, res) => {
    if (!isLiveKitEnabled()) {
      res.status(503).json({ ok: false, error: 'Voice chat is offline (LiveKit not configured).' });
      return;
    }

    const identity = String(req.query.identity ?? '');
    const room = String(req.query.room ?? '');

    if (!SAFE.test(identity)) {
      res.status(400).json({ ok: false, error: 'Invalid identity.' });
      return;
    }
    if (!SAFE.test(room)) {
      res.status(400).json({ ok: false, error: 'Invalid room.' });
      return;
    }

    // canPublish defaults to true; pass canPublish=0/false for dead/listen-only.
    const cp = String(req.query.canPublish ?? '').toLowerCase();
    const canPublish = !(cp === '0' || cp === 'false' || cp === 'no');

    try {
      const { token, url } = await createAccessToken(identity, room, { canPublish });
      res.json({ ok: true, token, url });
    } catch (e: any) {
      console.error('[LiveKit] token error:', e?.message);
      res.status(500).json({ ok: false, error: 'Failed to issue voice token.' });
    }
  });

  return router;
}
