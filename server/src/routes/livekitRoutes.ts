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

/**
 * A room only some of a match's players may enter.
 *
 * Marked by a colon in the name rather than by a list kept somewhere else: the
 * check has to be true for every private room that will ever exist, including
 * ones added after this file was last read, and a naming rule is the only kind
 * of check that cannot be forgotten when the next one is written.
 */
export function isPrivateRoom(room: string): boolean { return room.includes(':'); }

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

    /*
     * Private rooms are not mintable here.
     *
     * This endpoint takes a room name and an identity from the query string and
     * hands back a token — no session, no membership check, nothing. That is
     * survivable for the table's own room, which everybody in the match is in
     * anyway, and fatal for a room whose entire purpose is that some of them are
     * NOT in it: the mafia's channel would be one fetch away for any player who
     * knew the match id.
     *
     * Tokens for those come from the socket, which already knows who is asking
     * and what role they hold. See `xm:voice_token` in sxvaMafia.ts.
     */
    if (isPrivateRoom(room)) {
      res.status(403).json({ ok: false, error: 'This room is not open.' });
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
