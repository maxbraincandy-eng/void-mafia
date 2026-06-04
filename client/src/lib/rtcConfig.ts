/**
 * Build RTCConfiguration.
 *
 * Policy 'all': browser tries direct P2P first, falls back to TURN relay.
 * This works for WiFi-to-WiFi (direct) and helps mobile CGNAT users via relay.
 *
 * For mobile CGNAT users the TURN relay candidates are gathered alongside
 * direct candidates. Browser negotiates the best available path.
 *
 * Custom TURN via Railway env vars:
 *   VITE_TURN_URL, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL
 */
export function getRTCConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    // STUN
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // TURN relay — fallback for CGNAT / mobile networks
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: [
        'turn:global.relay.metered.ca:80',
        'turn:global.relay.metered.ca:443',
        'turn:global.relay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];

  // Custom TURN via env vars — prepended so browser tries it first
  const turnUrl = import.meta.env.VITE_TURN_URL;
  if (turnUrl) {
    iceServers.unshift({
      urls: turnUrl,
      username: import.meta.env.VITE_TURN_USERNAME ?? '',
      credential: import.meta.env.VITE_TURN_CREDENTIAL ?? '',
    });
  }

  return {
    iceServers,
    // 'all' = try direct P2P first, relay as fallback.
    // 'relay' was causing failures because it depends entirely on
    // the free public TURN server being available and fast.
    iceTransportPolicy: 'all',
    iceCandidatePoolSize: 10,
  };
}
