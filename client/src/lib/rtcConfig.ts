/**
 * Build RTCConfiguration.
 *
 * STUN alone fails for mobile users behind CGNAT (4G/5G carrier NAT).
 * TURN relay is required for reliable cross-network connections.
 *
 * Override via env vars in Railway:
 *   VITE_TURN_URL=turn:your-server.com:3478
 *   VITE_TURN_USERNAME=...
 *   VITE_TURN_CREDENTIAL=...
 */
export function getRTCConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    // STUN — public IP discovery
    { urls: import.meta.env.VITE_STUN_URL ?? 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:openrelay.metered.ca:80' },

    // TURN relay — required for mobile/CGNAT users
    // Uses OpenRelay free tier as default; override with own TURN via env vars
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];

  // Custom TURN (Railway env vars) — takes priority, added last so browser prefers it
  const turnUrl = import.meta.env.VITE_TURN_URL;
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl,
      username: import.meta.env.VITE_TURN_USERNAME ?? '',
      credential: import.meta.env.VITE_TURN_CREDENTIAL ?? '',
    });
  }

  return {
    iceServers,
    iceCandidatePoolSize: 10,
  };
}
