/**
 * Build RTCConfiguration.
 *
 * Policy 'all': browser tries direct P2P first, falls back to TURN relay.
 */
export function getRTCConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    // STUN Servers - for better NAT discovery
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    
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
    // 'all' allows direct P2P connection (host) or TURN relay (relay)
    iceTransportPolicy: 'all',
    // 0 is safer for mobile networks to prevent pre-connection failures
    iceCandidatePoolSize: 0, 
  };
}
