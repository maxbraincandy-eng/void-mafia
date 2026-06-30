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
export declare function createLiveKitRouter(): Router;
//# sourceMappingURL=livekitRoutes.d.ts.map