/**
 * Centralised ICE / TURN configuration for Void Mafia.
 *
 * Railway server environment variables:
 *   TURN_URL        — comma-separated full TURN URLs  OR  bare hostname
 *                     Examples:
 *                       "turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:443?transport=tcp"
 *                       "global.relay.metered.ca"   (auto-generates 4 Metered variants)
 *   TURN_USERNAME   — TURN username / Metered API key username
 *   TURN_CREDENTIAL — TURN credential / Metered API key password
 *   FORCE_TURN_RELAY=true   — diagnostic: relay-only iceTransportPolicy
 *   STUN_URL        — override primary STUN URL (optional)
 */

export interface IceServerEntry {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceConfig {
  iceServers: IceServerEntry[];
  iceTransportPolicy: 'all' | 'relay';
}

export function buildIceConfig(): IceConfig {
  const stunUrl = process.env.STUN_URL ?? 'stun:stun.l.google.com:19302';
  const servers: IceServerEntry[] = [
    { urls: [stunUrl, 'stun:stun1.l.google.com:19302'] },
  ];

  const turnUrl = process.env.TURN_URL?.trim();
  const turnUsername = process.env.TURN_USERNAME?.trim();
  const turnCredential = process.env.TURN_CREDENTIAL?.trim();

  if (turnUrl && turnUsername && turnCredential) {
    const rawParts = turnUrl.split(',').map(s => s.trim()).filter(Boolean);

    if (rawParts.every(u => u.startsWith('turn:') || u.startsWith('turns:'))) {
      // Full TURN URLs provided. For any UDP-only entry (no ?transport= param),
      // automatically add a TCP variant on the same port so firewalls that block
      // UDP don't silently break voice on mobile networks.
      const tcpExtras: string[] = [];
      for (const u of rawParts) {
        if (!u.includes('transport=')) {
          tcpExtras.push(u + '?transport=tcp');
        }
      }
      const allUrls = [...rawParts, ...tcpExtras];
      servers.push({ urls: allUrls, username: turnUsername, credential: turnCredential });
    } else {
      // Bare hostname — auto-generate the 4 standard Metered/coturn variants
      const host = rawParts[0]!;
      servers.push({
        urls: [
          `turn:${host}:80`,
          `turn:${host}:80?transport=tcp`,
          `turn:${host}:443?transport=tcp`,
          `turns:${host}:443?transport=tcp`,
        ],
        username: turnUsername,
        credential: turnCredential,
      });
    }

    console.log('[ICE] Private TURN configured:', turnUrl);
  } else {
    console.warn('[ICE] TURN_URL/TURN_USERNAME/TURN_CREDENTIAL not set — using public fallback (unreliable for mobile ↔ WiFi)');
    // Public openrelay fallback — unreliable for production but better than nothing
    servers.push(
      { urls: 'turn:openrelay.metered.ca:80',             username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:global.relay.metered.ca:80',           username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    );
  }

  const forceTurnRelay = process.env.FORCE_TURN_RELAY === 'true';
  if (forceTurnRelay) {
    console.warn('[ICE] FORCE_TURN_RELAY=true — relay-only mode active (diagnostic)');
  }

  return {
    iceServers: servers,
    iceTransportPolicy: forceTurnRelay ? 'relay' : 'all',
  };
}

/** Convenience: just the servers array (for backward-compat callers). */
export function buildIceServers(): IceServerEntry[] {
  return buildIceConfig().iceServers;
}
