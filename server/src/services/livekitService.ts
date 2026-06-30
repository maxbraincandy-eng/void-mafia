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

export interface LiveKitConfig {
  apiKey: string;
  apiSecret: string;
  url: string;
}

/** Read + validate LiveKit env. Returns null (not throws) when unconfigured. */
export function getLiveKitConfig(): LiveKitConfig | null {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) return null;
  return { apiKey, apiSecret, url };
}

/** True when all three LiveKit env vars are present. */
export function isLiveKitEnabled(): boolean {
  return getLiveKitConfig() !== null;
}

export interface TokenOptions {
  /** When false the participant joins muted/listen-only (e.g. dead players). */
  canPublish?: boolean;
  /** Token lifetime in seconds (default 6h — long enough for a full match). */
  ttlSeconds?: number;
}

/**
 * Mint a LiveKit JWT for `identity` to join `room`.
 * Throws if LiveKit is not configured — callers should guard with isLiveKitEnabled().
 */
export async function createAccessToken(
  identity: string,
  room: string,
  opts: TokenOptions = {},
): Promise<{ token: string; url: string }> {
  const cfg = getLiveKitConfig();
  if (!cfg) throw new Error('LiveKit is not configured on this server.');

  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity,
    ttl: opts.ttlSeconds ?? 6 * 60 * 60,
  });
  at.addGrant({
    roomJoin: true,
    room,
    canPublish: opts.canPublish ?? true, // dead players → false (can still subscribe/hear)
    canSubscribe: true,
    canPublishData: true,
  });

  // livekit-server-sdk v2: toJwt() is async.
  const token = await at.toJwt();
  return { token, url: cfg.url };
}
