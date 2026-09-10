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
/**
 * A room only some of a match's players may enter.
 *
 * Marked by a colon in the name rather than by a list kept somewhere else: the
 * check has to be true for every private room that will ever exist, including
 * ones added after this file was last read, and a naming rule is the only kind
 * of check that cannot be forgotten when the next one is written.
 */
export declare function isPrivateRoom(room: string): boolean;
export declare function createLiveKitRouter(): Router;
//# sourceMappingURL=livekitRoutes.d.ts.map