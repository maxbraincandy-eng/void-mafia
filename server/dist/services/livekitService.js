/**
 * livekitService — issues short-lived LiveKit access tokens.
 *
 * Each Mafia game room maps 1:1 to a LiveKit room (gameRoomId === room name),
 * so a token is just (identity, room) signed with the project credentials.
 *
 * Config comes ONLY from the environment (never hardcoded):
 *   LIVEKIT_API_KEY     — LiveKit API key
 *   LIVEKIT_API_SECRET  — LiveKit API secret
 *   LIVEKIT_URL         — wss URL of the LiveKit server (returned to clients)
 */
import { AccessToken } from 'livekit-server-sdk';
/** Read + validate LiveKit env. Returns null (not throws) when unconfigured. */
export function getLiveKitConfig() {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const url = process.env.LIVEKIT_URL;
    if (!apiKey || !apiSecret || !url)
        return null;
    return { apiKey, apiSecret, url };
}
/** True when all three LiveKit env vars are present. */
export function isLiveKitEnabled() {
    return getLiveKitConfig() !== null;
}
/**
 * Mint a LiveKit JWT for `identity` to join `room`.
 * Throws if LiveKit is not configured — callers should guard with isLiveKitEnabled().
 */
export async function createAccessToken(identity, room, opts = {}) {
    const cfg = getLiveKitConfig();
    if (!cfg)
        throw new Error('LiveKit is not configured on this server.');
    const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
        identity,
        ttl: opts.ttlSeconds ?? 6 * 60 * 60,
    });
    at.addGrant({
        roomJoin: true,
        room,
        // Always grant publish rights. WHO is actually heard is enforced at runtime
        // (server voice:force-mute + client setMicrophoneEnabled(false) for dead /
        // listen-only / phase rules) — exactly like the WebRTC-mesh path. A
        // canPublish:false token instead permanently 403s the mic the moment a
        // participant legitimately needs it later (a lobby moderator enabling voice,
        // a spectator becoming a player, a dead player reviving next round), which
        // surfaced to users as "failed to publish track, insufficient permissions".
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
    });
    void opts.canPublish;
    // livekit-server-sdk v2: toJwt() is async.
    const token = await at.toJwt();
    return { token, url: cfg.url };
}
//# sourceMappingURL=livekitService.js.map